"""Resolve logged-in UserProfiles → dbo.Patients (read-only, email/login match)."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import user_type_label
from app.db.clinic import get_clinic_connection


@dataclass(frozen=True)
class PatientProfile:
    user_id: int | None
    patient_id: int
    full_name: str
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    login_id: str | None
    account_number: str | None = None
    type_id: int | None = None
    type_label: str | None = None


def fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> PatientProfile:
    """
    Map portal login to a Patients row via email/LoginId match.
    No schema change — Patients has Email but no UserId FK.
    """
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
                    Id, LoginId, Email, FirstName, LastName, TypeId
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
                    Id, LoginId, Email, FirstName, LastName, TypeId
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                ORDER BY Id DESC
                """,
                (login, email),
            )
            user_row = cursor.fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active user profile was found for this account.",
            )

        resolved_user_id = int(user_row.Id)
        login_id = (user_row.LoginId or "").strip() or login or None
        profile_email = (user_row.Email or "").strip() or email or None
        match_key = (profile_email or login_id or "").strip()
        if not match_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient record not found for this account.",
            )

        cursor.execute(
            """
            SELECT TOP 1
                Id,
                FirstName,
                LastName,
                Email,
                CellPhone,
                HomePhone,
                AccountNumber
            FROM dbo.Patients
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND (
                    LOWER(LTRIM(RTRIM(ISNULL(Email, '')))) = LOWER(?)
              )
            ORDER BY Id DESC
            """,
            (match_key,),
        )
        patient = cursor.fetchone()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient record not found for this account.",
            )

        first_name = (patient.FirstName or "").strip() or None
        last_name = (patient.LastName or "").strip() or None
        full_name = " ".join(
            part for part in [first_name, last_name] if part
        ).strip()
        if not full_name:
            full_name = (
                (user_row.FirstName or "").strip()
                + " "
                + (user_row.LastName or "").strip()
            ).strip() or match_key

        phone = (
            (patient.CellPhone or "").strip()
            or (patient.HomePhone or "").strip()
            or None
        )
        patient_email = (patient.Email or "").strip() or profile_email

        type_id = None
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        account_no = patient.AccountNumber
        if account_no is not None:
            account_no = str(account_no).strip() or None

        return PatientProfile(
            user_id=resolved_user_id,
            patient_id=int(patient.Id),
            full_name=full_name,
            first_name=first_name,
            last_name=last_name,
            email=patient_email,
            phone=phone,
            login_id=login_id,
            account_number=account_no,
            type_id=type_id,
            type_label=user_type_label(type_id),
        )
