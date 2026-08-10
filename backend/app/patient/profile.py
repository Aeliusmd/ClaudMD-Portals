from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType, user_type_label
from app.db.clinic import get_clinic_connection
from app.validation.contact import email_error, phone_error
from app.validation.text import unsafe_markup_error

_NAME_MAX = 50
_ADDRESS_MAX = 500

# Super Admin is employer-only; Patient User is the dedicated role.
_PATIENT_PORTAL_TYPES = {int(UserType.PatientUser)}


@dataclass(frozen=True)
class PatientProfile:
    user_id: int | None
    patient_id: int | None
    full_name: str
    first_name: str | None
    last_name: str | None
    date_of_birth: str | None
    email: str | None
    phone: str | None
    address: str | None
    login_id: str | None
    type_id: int | None = None
    type_label: str | None = None


def fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> PatientProfile:
    """Read profile: UserProfiles + Patients (matched by email)."""
    user_id = current_user.user_id
    login = (current_user.login_id or "").strip()
    email = (current_user.email or login).strip()

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()

        user_row = None
        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Phone, CellPhone, TypeId
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            user_row = cursor.fetchone()

        if not user_row and login:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Phone, CellPhone, TypeId
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                ORDER BY
                    CASE WHEN TypeId = ? THEN 0 ELSE 1 END,
                    Id DESC
                """,
                (
                    login,
                    email,
                    int(UserType.PatientUser),
                ),
            )
            user_row = cursor.fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active user profile was found for this account.",
            )

        type_id = None
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        if type_id not in _PATIENT_PORTAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not enabled for the patient portal.",
            )

        resolved_user_id = int(user_row.Id)
        profile_email = (user_row.Email or "").strip() or email or None
        login_id = (user_row.LoginId or "").strip() or login or None
        first_name = (user_row.FirstName or "").strip() or None
        last_name = (user_row.LastName or "").strip() or None
        phone = (
            (user_row.CellPhone or "").strip()
            or (user_row.Phone or "").strip()
            or None
        )

        patient_row = _fetch_linked_patient(
            cursor,
            email=(profile_email or login_id or "").strip(),
            first_name=first_name,
            last_name=last_name,
        )

    patient_id = None
    date_of_birth = None
    address = None

    if patient_row:
        patient_id = int(patient_row.Id)
        first_name = first_name or ((patient_row.FirstName or "").strip() or None)
        last_name = last_name or ((patient_row.LastName or "").strip() or None)
        profile_email = (patient_row.Email or "").strip() or profile_email
        phone = (
            (patient_row.CellPhone or "").strip()
            or (patient_row.HomePhone or "").strip()
            or (patient_row.WorkPhone or "").strip()
            or phone
        )
        date_of_birth = _format_dob_iso(patient_row.DateOfBirth)
        address = _format_patient_address(patient_row)

    full_name = " ".join(
        part for part in [first_name, last_name] if part and str(part).strip()
    ).strip()
    if not full_name and current_user.display_name:
        full_name = current_user.display_name.strip()
    if not full_name:
        full_name = profile_email or login_id or "Patient User"

    return PatientProfile(
        user_id=resolved_user_id,
        patient_id=patient_id,
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=date_of_birth,
        email=profile_email,
        phone=phone,
        address=address,
        login_id=login_id,
        type_id=type_id,
        type_label=user_type_label(type_id),
    )


def update_profile_in_clinic(
    clinic,
    current_user: CurrentUser,
    *,
    full_name: str,
    date_of_birth: str | None,
    email: str,
    phone: str | None,
    address: str | None,
) -> PatientProfile:
    """
    Update editable fields on UserProfiles and linked Patients (by email).
    Does not change LoginId or TypeId.
    """
    name = (full_name or "").strip()
    email_norm = (email or "").strip()
    phone_norm = (phone or "").strip() or None
    address_norm = (address or "").strip() or None
    dob = _parse_dob(date_of_birth)

    first_name, last_name = _split_full_name(name)

    errors = _validate_profile_fields(
        full_name=name,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=date_of_birth,
        parsed_dob=dob,
        email=email_norm,
        phone=phone_norm,
        address=address_norm,
    )
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation failed.", "errors": errors},
        )

    current = fetch_profile_from_clinic(clinic, current_user)
    if current.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )

    actor_id = int(current.user_id)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE dbo.UserProfiles
            SET FirstName = ?,
                LastName = ?,
                Email = ?,
                Phone = ?,
                CellPhone = ?,
                UpdatedDateTime = SYSUTCDATETIME(),
                UpdatedUserId = ?
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
            """,
            (
                first_name,
                last_name or None,
                email_norm,
                phone_norm,
                phone_norm,
                actor_id,
                actor_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        patient_id = current.patient_id
        if patient_id is None:
            # Re-link after email/name change.
            patient_row = _fetch_linked_patient(
                cursor,
                email=email_norm,
                first_name=first_name,
                last_name=last_name,
            )
            if patient_row:
                patient_id = int(patient_row.Id)

        # DOB/address live on dbo.Patients only. Create a chart when missing
        # so profile saves actually persist those fields.
        if patient_id is None and (dob is not None or address_norm):
            if dob is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "message": "Validation failed.",
                        "errors": {
                            "date_of_birth": (
                                "Date of birth is required to save address "
                                "for this account."
                            )
                        },
                    },
                )
            patient_id = _create_patient_for_profile(
                cursor,
                user_id=actor_id,
                first_name=first_name,
                last_name=last_name,
                email=email_norm,
                phone=phone_norm,
                date_of_birth=dob,
                address=address_norm,
            )

        if patient_id is not None:
            cursor.execute(
                """
                UPDATE dbo.Patients
                SET FirstName = ?,
                    LastName = ?,
                    Email = ?,
                    CellPhone = ?,
                    DateOfBirth = COALESCE(?, DateOfBirth),
                    Address1 = ?,
                    Address2 = NULL,
                    City = NULL,
                    State = NULL,
                    ZipCode = NULL,
                    UpdatedDateTime = SYSDATETIMEOFFSET(),
                    UpdatedUserId = ?
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                """,
                (
                    first_name,
                    last_name or None,
                    email_norm,
                    phone_norm,
                    dob,
                    address_norm,
                    actor_id,
                    int(patient_id),
                ),
            )

    return fetch_profile_from_clinic(clinic, current_user)


def _fetch_linked_patient(cursor, *, email: str, first_name: str | None, last_name: str | None):
    """Prefer Patients row matched by email; fall back to exact first+last name."""
    email_norm = (email or "").strip()
    if email_norm:
        cursor.execute(
            """
            SELECT TOP 1
                Id, FirstName, LastName, Email, DateOfBirth,
                CellPhone, HomePhone, WorkPhone,
                Address1, Address2, City, State, ZipCode
            FROM dbo.Patients
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
            ORDER BY Id DESC
            """,
            (email_norm,),
        )
        row = cursor.fetchone()
        if row:
            return row

    first = (first_name or "").strip()
    last = (last_name or "").strip()
    if first and last:
        cursor.execute(
            """
            SELECT TOP 1
                Id, FirstName, LastName, Email, DateOfBirth,
                CellPhone, HomePhone, WorkPhone,
                Address1, Address2, City, State, ZipCode
            FROM dbo.Patients
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND LOWER(LTRIM(RTRIM(FirstName))) = LOWER(?)
              AND LOWER(LTRIM(RTRIM(LastName))) = LOWER(?)
            ORDER BY Id DESC
            """,
            (first, last),
        )
        return cursor.fetchone()

    return None


def _create_patient_for_profile(
    cursor,
    *,
    user_id: int,
    first_name: str,
    last_name: str,
    email: str,
    phone: str | None,
    date_of_birth: date,
    address: str | None,
) -> int:
    """Insert a minimal Patients chart so portal DOB/address can persist."""
    cursor.execute(
        """
        SELECT TOP 1 DefaultLocationId
        FROM dbo.UserProfiles
        WHERE Id = ?
        """,
        (int(user_id),),
    )
    user_loc = cursor.fetchone()
    location_id = None
    if user_loc and user_loc.DefaultLocationId is not None:
        try:
            location_id = int(user_loc.DefaultLocationId)
        except (TypeError, ValueError):
            location_id = None

    if location_id is None:
        cursor.execute(
            """
            SELECT TOP 1 Id
            FROM dbo.Locations
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
            ORDER BY Id
            """
        )
        loc_row = cursor.fetchone()
        if not loc_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to save date of birth/address: no clinic location is configured.",
            )
        location_id = int(loc_row.Id)

    cursor.execute("SELECT ISNULL(MAX(AccountNumber), 100000) + 1 FROM dbo.Patients")
    account_row = cursor.fetchone()
    account_no = int(account_row[0]) if account_row and account_row[0] is not None else 100001

    # Gender is required on Patients; portal profile has no gender field yet.
    # Use Other (3) as a neutral default — clinic staff can correct later.
    gender_id = 3

    cursor.execute(
        """
        INSERT INTO dbo.Patients (
            LocationId, AccountNumber, SSN, LastName, FirstName,
            DateOfBirth, GenderId, CellPhone, Email,
            Address1, Address2, City, State, ZipCode,
            CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted,
            PortalChangePasswordFlag
        )
        OUTPUT INSERTED.Id
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL,
                ?, SYSDATETIMEOFFSET(), 1, 0, 1)
        """,
        (
            location_id,
            account_no,
            (last_name or "").strip() or None,
            (first_name or "").strip() or None,
            date_of_birth,
            gender_id,
            phone,
            email,
            address,
            int(user_id),
        ),
    )
    inserted = cursor.fetchone()
    if not inserted or inserted[0] is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create patient chart for this profile.",
        )
    return int(inserted[0])


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in (full_name or "").strip().split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _format_dob_iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    # MSSQL / ODBC sometimes returns "YYYY-MM-DD HH:MM:SS"
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return None


def _parse_dob(value: str | None) -> date | None:
    text = (value or "").strip()
    if not text:
        return None
    iso_candidate = text[:10] if len(text) >= 10 and text[4] == "-" else text
    for candidate, fmt in (
        (iso_candidate, "%Y-%m-%d"),
        (text, "%m/%d/%Y"),
        (text, "%m-%d-%Y"),
    ):
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _format_patient_address(row) -> str | None:
    parts = [
        (getattr(row, "Address1", None) or "").strip(),
        (getattr(row, "Address2", None) or "").strip(),
    ]
    city = (getattr(row, "City", None) or "").strip()
    state = (getattr(row, "State", None) or "").strip()
    zip_code = (getattr(row, "ZipCode", None) or "").strip()
    if city and state:
        city_line = f"{city}, {state}"
        if zip_code:
            city_line = f"{city_line} {zip_code}"
    else:
        city_line = " ".join(part for part in [city, state, zip_code] if part).strip()
    if city_line:
        parts.append(city_line)
    formatted = ", ".join(part for part in parts if part)
    return formatted or None


def _validate_profile_fields(
    *,
    full_name: str,
    first_name: str,
    last_name: str,
    date_of_birth: str | None,
    parsed_dob: date | None,
    email: str,
    phone: str | None,
    address: str | None,
) -> dict[str, str]:
    errors: dict[str, str] = {}

    if not full_name:
        errors["full_name"] = "Full name is required."
    elif len(first_name) > _NAME_MAX:
        errors["full_name"] = f"First name must be at most {_NAME_MAX} characters."
    elif len(last_name) > _NAME_MAX:
        errors["full_name"] = f"Last name must be at most {_NAME_MAX} characters."
    else:
        err = unsafe_markup_error(full_name)
        if err:
            errors["full_name"] = err

    raw_dob = (date_of_birth or "").strip()
    if raw_dob and parsed_dob is None:
        errors["date_of_birth"] = "Enter a valid date of birth (YYYY-MM-DD)."

    err = email_error(email, required=True)
    if err:
        errors["email"] = err

    err = phone_error(phone, required=False)
    if err:
        errors["phone"] = err

    if address and len(address) > _ADDRESS_MAX:
        errors["address"] = f"Address must be at most {_ADDRESS_MAX} characters."
    elif address:
        err = unsafe_markup_error(address)
        if err:
            errors["address"] = err

    return errors
