"""Patient portal Bill Review / Paid Bills — SELECT-only.

Urgent Care (VisitTypes.CategoryId = 3) and Personal Injury (CategoryId = 4)
for the logged-in patient only. No schema changes.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.billing import _load_live_ehr_invoice_lines
from app.employer.schemas import BillInvoiceDetail, BillInvoiceLine
from app.patient.profile import fetch_profile_from_clinic
from app.patient.schemas import (
    PatientBillReviewResponse,
    PatientBillReviewRow,
    PatientPaidBillRow,
    PatientPaidBillsResponse,
)

URGENT_CARE_CATEGORY_ID = 3
PERSONAL_INJURY_CATEGORY_ID = 4
PATIENT_BILL_CATEGORY_IDS = (URGENT_CARE_CATEGORY_ID, PERSONAL_INJURY_CATEGORY_ID)


def list_bill_review(current_user: CurrentUser) -> PatientBillReviewResponse:
    clinic, patient_id = _require_patient(current_user)
    items = _fetch_review_bills(clinic, patient_id)
    payable = [row for row in items if row.amount > 0]

    urgent = [row for row in payable if row.category == "urgentCare"]
    personal = [row for row in payable if row.category == "personalInjury"]
    urgent_total = sum((float(row.amount) for row in urgent), 0.0)
    personal_total = sum((float(row.amount) for row in personal), 0.0)

    return PatientBillReviewResponse(
        items=payable,
        total=len(payable),
        payable_count=len(payable),
        outstanding_total=round(urgent_total + personal_total, 2),
        urgent_care_count=len(urgent),
        urgent_care_total=round(urgent_total, 2),
        personal_injury_count=len(personal),
        personal_injury_total=round(personal_total, 2),
        patient_id=patient_id,
    )


def list_paid_bills(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = 10,
    search: str = "",
) -> PatientPaidBillsResponse:
    clinic, patient_id = _require_patient(current_user)
    total, total_paid = _paid_bill_summary(clinic, patient_id, search=search)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, total_pages))
    items = _fetch_paid_bill_rows(
        clinic,
        patient_id,
        search=search,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return PatientPaidBillsResponse(
        items=items,
        total=total,
        total_paid=round(total_paid, 2),
        patient_id=patient_id,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def get_bill_invoice(
    current_user: CurrentUser,
    billing_header_id: int,
    history_id: int | None = None,
) -> BillInvoiceDetail:
    """
    Client Services invoice snapshot for one BillingHeaders row.
    SELECT-only. Same template as employer billing, scoped to this patient
    and Urgent Care / Personal Injury visit categories.
    """
    clinic, patient_id = _require_patient(current_user)
    header_id = int(billing_header_id)
    invoice_history_id = int(history_id) if history_id is not None else None
    history_filter = "AND h.Id = ?" if invoice_history_id is not None else ""

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT TOP 1
                bh.Id AS BillingHeaderId,
                bh.PatientId,
                bh.CheckinId,
                bh.EmployerId,
                bh.ProviderId AS HeaderProviderId,
                bh.TotalCharge AS HeaderTotalCharge,
                bh.PaidAmount AS HeaderPaidAmount,
                hist.Id AS HistoryId,
                hist.InvoiceNumber,
                CONVERT(varchar(10), hist.BilledDate, 101) AS BilledDate,
                CONVERT(varchar(10), COALESCE(hist.CheckinDate, ch.CheckInDate), 101) AS ExamDate,
                CONVERT(varchar(10), DATEADD(day, 30, COALESCE(hist.CheckinDate, ch.CheckInDate)), 101) AS DueDate,
                hist.PatientFirstName,
                hist.PatientLastName,
                hist.PatientAccountNumber,
                hist.EmployerName,
                hist.EmployerAddress,
                hist.EmployerCity,
                hist.EmployerState,
                hist.EmployerZip,
                hist.EmployerPhone,
                hist.BillingLocationName,
                hist.BillingLocationAddress,
                hist.BillingLocationCity,
                hist.BillingLocationState,
                hist.BillingLocationZip,
                hist.BillingLocationPhone,
                hist.BillingLocationFax,
                hist.BillingLocationTaxId,
                hist.FederalTaxIdNumber,
                hist.TotalCharge AS HistTotalCharge,
                hist.PaidAmount AS HistPaidAmount,
                hist.ProviderId AS HistProviderId,
                p.FirstName AS PatientFirstNameLive,
                p.LastName AS PatientLastNameLive,
                CAST(p.AccountNumber AS nvarchar(50)) AS PatientAccountLive,
                p.SSN AS PatientSsn,
                emp.Name AS EmployerNameLive,
                emp.Address AS EmployerAddressLive,
                emp.City AS EmployerCityLive,
                emp.State AS EmployerStateLive,
                emp.ZipCode AS EmployerZipLive,
                emp.Phone AS EmployerPhoneLive,
                loc.Name AS LocationName,
                loc.Address AS LocationAddress,
                loc.City AS LocationCity,
                loc.State AS LocationState,
                loc.ZipCode AS LocationZip,
                loc.Phone AS LocationPhone,
                loc.Fax AS LocationFax
            FROM dbo.BillingHeaders bh
            LEFT JOIN dbo.VisitTypes vt
                ON vt.Id = bh.VisitTypeId
               AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            LEFT JOIN dbo.Patients p
                ON p.Id = bh.PatientId
               AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
            LEFT JOIN dbo.Employers emp
                ON emp.Id = bh.EmployerId
               AND (emp.IsDeleted = 0 OR emp.IsDeleted IS NULL)
            LEFT JOIN dbo.CheckInsHeader ch
                ON ch.Id = bh.CheckinId
               AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            LEFT JOIN dbo.Locations loc
                ON loc.Id = COALESCE(bh.BillingLocationId, bh.LocationId)
               AND (loc.IsDeleted = 0 OR loc.IsDeleted IS NULL)
            OUTER APPLY (
                SELECT TOP 1 *
                FROM dbo.BillingHeadersHistory h
                WHERE h.BillingHeaderId = bh.Id
                  AND (h.IsDeleted = 0 OR h.IsDeleted IS NULL)
                  {history_filter}
                ORDER BY h.Id DESC
            ) hist
            WHERE (bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)
              AND bh.Id = ?
              AND bh.PatientId = ?
              AND (
                    vt.CategoryId IN (?, ?)
                 OR (vt.Id IS NULL AND bh.VisitTypeCategoryId IN (?, ?))
              )
            """,
            (
                *((invoice_history_id,) if invoice_history_id is not None else ()),
                header_id,
                patient_id,
                URGENT_CARE_CATEGORY_ID,
                PERSONAL_INJURY_CATEGORY_ID,
                URGENT_CARE_CATEGORY_ID,
                PERSONAL_INJURY_CATEGORY_ID,
            ),
        )
        header = cursor.fetchone()
        if not header:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found for this patient.",
            )

        history_id = int(header.HistoryId) if header.HistoryId is not None else None
        lines: list[BillInvoiceLine] = []
        diagnosis: list[str] = []

        if history_id is not None:
            cursor.execute(
                """
                SELECT
                    boh.Id,
                    CONVERT(varchar(10), boh.ServiceDateFrom, 101) AS ExamDate,
                    boh.CPTCode,
                    boh.Description,
                    boh.DaysOrUnits,
                    boh.UnitPrice,
                    boh.TotalAmount,
                    boh.Charges,
                    boh.PaymentAmount,
                    boh.AdjustAmount,
                    boh.BalanceDue
                FROM dbo.BillingOrdersHistory boh
                WHERE boh.BillingHeaderHistoryId = ?
                  AND (boh.IsDeleted = 0 OR boh.IsDeleted IS NULL)
                ORDER BY
                    CASE WHEN boh.SortOrder IS NULL THEN 1 ELSE 0 END,
                    boh.SortOrder,
                    boh.Id
                """,
                (history_id,),
            )
            for row in cursor.fetchall():
                qty = float(row.DaysOrUnits or 1)
                unit = float(row.UnitPrice or 0)
                charges = float(
                    row.TotalAmount
                    if row.TotalAmount is not None
                    else (row.Charges or 0)
                )
                payment = float(row.PaymentAmount or 0)
                adjust = float(row.AdjustAmount or 0)
                balance = float(
                    row.BalanceDue
                    if row.BalanceDue is not None
                    else max(0.0, charges - payment - adjust)
                )
                lines.append(
                    BillInvoiceLine(
                        id=int(row.Id),
                        exam_date=(row.ExamDate or "").strip() or None,
                        code=(row.CPTCode or "").strip() or None,
                        description=(row.Description or "").strip() or None,
                        quantity=qty if qty else 1,
                        unit_price=unit,
                        charges=charges,
                        payment=payment,
                        adjust=adjust,
                        balance=balance,
                    )
                )

            cursor.execute(
                """
                SELECT ICD10Code
                FROM dbo.BillingICD10sHistory
                WHERE BillingHeaderHistoryId = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                ORDER BY Id
                """,
                (history_id,),
            )
            for row in cursor.fetchall():
                code = (row.ICD10Code or "").strip()
                if code:
                    diagnosis.append(code)

        if not lines:
            checkin_id = (
                int(header.CheckinId) if header.CheckinId is not None else None
            )
            lines.extend(
                _load_live_ehr_invoice_lines(
                    cursor,
                    billing_header_id=header_id,
                    checkin_id=checkin_id,
                    exam_date=(header.ExamDate or "").strip() or None,
                )
            )

        provider_id = header.HistProviderId or header.HeaderProviderId
        provider_name = None
        if provider_id is not None:
            cursor.execute(
                """
                SELECT TOP 1 Name, FirstName, LastName
                FROM dbo.Providers
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                """,
                (int(provider_id),),
            )
            prov = cursor.fetchone()
            if prov:
                provider_name = (
                    (prov.Name or "").strip()
                    or " ".join(
                        part
                        for part in [(prov.FirstName or "").strip(), (prov.LastName or "").strip()]
                        if part
                    ).strip()
                    or None
                )

    patient_name = (
        " ".join(
            part
            for part in [
                (header.PatientFirstName or "").strip(),
                (header.PatientLastName or "").strip(),
            ]
            if part
        ).strip()
        or " ".join(
            part
            for part in [
                (header.PatientFirstNameLive or "").strip(),
                (header.PatientLastNameLive or "").strip(),
            ]
            if part
        ).strip()
        or None
    )

    def _join_address(street, city, state, zip_code):
        left = (street or "").strip().rstrip(",")
        right = ", ".join(
            part
            for part in [
                (city or "").strip(),
                " ".join(
                    p for p in [(state or "").strip(), (zip_code or "").strip()] if p
                ).strip(),
            ]
            if part
        )
        if left and right:
            return f"{left}, {right}"
        return left or right or None

    clinic_address = _join_address(
        header.BillingLocationAddress or header.LocationAddress,
        header.BillingLocationCity or header.LocationCity,
        header.BillingLocationState or header.LocationState,
        header.BillingLocationZip or header.LocationZip,
    )
    clinic_name_line = (
        (header.BillingLocationName or header.LocationName or "").strip() or None
    )
    if clinic_address and not clinic_name_line:
        clinic_name_line = clinic_address
        clinic_address = None
    elif clinic_name_line and clinic_address:
        clinic_name_line = clinic_address
        clinic_address = None

    employer_address = _join_address(
        header.EmployerAddress or header.EmployerAddressLive,
        header.EmployerCity or header.EmployerCityLive,
        header.EmployerState or header.EmployerStateLive,
        header.EmployerZip or header.EmployerZipLive,
    )

    line_total = sum((line.balance for line in lines), 0.0) if lines else 0.0
    if line_total > 0:
        total_due = line_total
    else:
        total_charge = float(
            header.HistTotalCharge
            if header.HistTotalCharge is not None
            else (header.HeaderTotalCharge or 0)
        )
        paid = float(
            header.HistPaidAmount
            if header.HistPaidAmount is not None
            else (header.HeaderPaidAmount or 0)
        )
        total_due = max(0.0, total_charge - paid)

    invoice_number = None
    if header.InvoiceNumber is not None:
        invoice_number = str(header.InvoiceNumber).strip() or None

    tax_id = (
        (header.BillingLocationTaxId or "").strip()
        or (header.FederalTaxIdNumber or "").strip()
        or None
    )
    employer_id = int(header.EmployerId) if header.EmployerId is not None else None

    return BillInvoiceDetail(
        billing_header_id=header_id,
        history_id=history_id,
        invoice_date=(header.ExamDate or header.BilledDate or "").strip() or None,
        invoice_number=invoice_number,
        tax_id=tax_id,
        amount_due=total_due,
        due_date=(header.DueDate or header.BilledDate or "").strip() or None,
        clinic_name=clinic_name_line,
        clinic_address=clinic_address,
        clinic_phone=(
            (header.BillingLocationPhone or header.LocationPhone or "").strip() or None
        ),
        clinic_fax=(
            (header.BillingLocationFax or header.LocationFax or "").strip() or None
        ),
        employer_name=(
            (header.EmployerName or header.EmployerNameLive or "").strip() or None
        ),
        employer_address=employer_address,
        employer_phone=(
            (header.EmployerPhone or header.EmployerPhoneLive or "").strip() or None
        ),
        patient_name=patient_name,
        patient_ssn=(header.PatientSsn or "").strip() or None,
        account_no=(
            (header.PatientAccountNumber or header.PatientAccountLive or "").strip()
            or None
        ),
        occupation=None,
        diagnosis=diagnosis,
        provider_name=provider_name,
        lines=lines,
        total_due=total_due,
        employer_id=employer_id,
    )


def _require_patient(current_user: CurrentUser) -> tuple:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient chart not found for this user.",
        )
    return clinic, int(profile.patient_id)


def _fetch_review_bills(clinic, patient_id: int) -> list[PatientBillReviewRow]:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                bh.Id AS BillingHeaderId,
                hist.Id AS HistoryId,
                hist.InvoiceNumber AS InvoiceNumber,
                CONVERT(
                    varchar(10),
                    COALESCE(
                        ch.InjuryDate,
                        bh.DateOfInjury,
                        hist.DateOfInjury,
                        ch.CheckInDate,
                        hist.CheckinDate
                    ),
                    101
                ) AS Doi,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(CAST(i.ClaimNumber AS nvarchar(50)))), ''),
                    NULLIF(LTRIM(RTRIM(CAST(i.IncidentNumber AS nvarchar(50)))), ''),
                    NULLIF(LTRIM(RTRIM(CAST(hist.IncidentNumber AS nvarchar(50)))), ''),
                    NULLIF(LTRIM(RTRIM(CAST(hist.EmployerInsuranceClaimNumber AS nvarchar(50)))), '')
                ) AS IncidentNo,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(vt.Description)), ''),
                    NULLIF(LTRIM(RTRIM(bh.AdditionalClaimInformation)), ''),
                    NULLIF(LTRIM(RTRIM(hist.AdditionalClaimInformation)), ''),
                    NULLIF(LTRIM(RTRIM(vt.Code)), ''),
                    '—'
                ) AS IncidentLabel,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(prov.Name)), ''),
                    NULLIF(
                        LTRIM(RTRIM(
                            ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, '')
                        )),
                        ''
                    ),
                    '—'
                ) AS ProviderName,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(ins.Name)), ''),
                    NULLIF(LTRIM(RTRIM(bh.InsuranceNameOrProgramNameLine1)), ''),
                    NULLIF(LTRIM(RTRIM(hist.InsuranceName)), ''),
                    NULLIF(LTRIM(RTRIM(pins.Name)), ''),
                    '—'
                ) AS InsuranceName,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(vt.Code)), ''),
                    '—'
                ) AS VisitCode,
                COALESCE(vt.CategoryId, bh.VisitTypeCategoryId) AS CategoryId,
                CASE
                    WHEN hist.Id IS NOT NULL THEN
                        COALESCE(
                            bal.SumBalance,
                            CASE
                                WHEN ISNULL(hist.TotalCharge, 0) > ISNULL(hist.PaidAmount, 0)
                                THEN ISNULL(hist.TotalCharge, 0) - ISNULL(hist.PaidAmount, 0)
                                ELSE CAST(0 AS decimal(18, 3))
                            END
                        )
                    ELSE
                        CASE
                            WHEN ISNULL(bh.TotalCharge, 0) > ISNULL(bh.PaidAmount, 0)
                            THEN ISNULL(bh.TotalCharge, 0) - ISNULL(bh.PaidAmount, 0)
                            ELSE CAST(0 AS decimal(18, 3))
                        END
                END AS AmountDue
            FROM dbo.BillingHeaders bh
            LEFT JOIN dbo.VisitTypes vt
                ON vt.Id = bh.VisitTypeId
               AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            LEFT JOIN dbo.CheckInsHeader ch
                ON ch.Id = bh.CheckinId
               AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            LEFT JOIN dbo.Incidents i
                ON i.Id = ch.IncidentId
               AND (i.IsDeleted = 0 OR i.IsDeleted IS NULL)
            LEFT JOIN dbo.Insurances ins
                ON ins.Id = COALESCE(bh.InsuranceId, ch.InsuranceId)
               AND (ins.IsDeleted = 0 OR ins.IsDeleted IS NULL)
            LEFT JOIN dbo.Providers prov
                ON prov.Id = COALESCE(bh.ProviderId, ch.ProviderId)
               AND (prov.IsDeleted = 0 OR prov.IsDeleted IS NULL)
            OUTER APPLY (
                SELECT TOP 1
                    h.Id,
                    h.InvoiceNumber,
                    h.CheckinDate,
                    h.DateOfInjury,
                    h.IncidentNumber,
                    h.EmployerInsuranceClaimNumber,
                    h.AdditionalClaimInformation,
                    h.InsuranceName,
                    h.TotalCharge,
                    h.PaidAmount
                FROM dbo.BillingHeadersHistory h
                WHERE h.BillingHeaderId = bh.Id
                  AND (h.IsDeleted = 0 OR h.IsDeleted IS NULL)
                ORDER BY h.Id DESC
            ) hist
            OUTER APPLY (
                SELECT SUM(ISNULL(boh.BalanceDue, 0)) AS SumBalance
                FROM dbo.BillingOrdersHistory boh
                WHERE boh.BillingHeaderHistoryId = hist.Id
                  AND (boh.IsDeleted = 0 OR boh.IsDeleted IS NULL)
            ) bal
            OUTER APPLY (
                SELECT TOP 1 pins_inner.Name
                FROM dbo.PatientInsurances pi
                LEFT JOIN dbo.Insurances pins_inner
                    ON pins_inner.Id = pi.InsuranceId
                   AND (pins_inner.IsDeleted = 0 OR pins_inner.IsDeleted IS NULL)
                WHERE pi.PatientId = bh.PatientId
                  AND (pi.IsDeleted = 0 OR pi.IsDeleted IS NULL)
                ORDER BY pi.Id DESC
            ) pins
            WHERE (bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)
              AND bh.PatientId = ?
              AND (
                    vt.CategoryId IN (?, ?)
                 OR (vt.Id IS NULL AND bh.VisitTypeCategoryId IN (?, ?))
              )
            ORDER BY
                COALESCE(
                    ch.InjuryDate,
                    bh.DateOfInjury,
                    hist.DateOfInjury,
                    ch.CheckInDate,
                    hist.CheckinDate
                ) DESC,
                bh.Id DESC
            """,
            (
                patient_id,
                URGENT_CARE_CATEGORY_ID,
                PERSONAL_INJURY_CATEGORY_ID,
                URGENT_CARE_CATEGORY_ID,
                PERSONAL_INJURY_CATEGORY_ID,
            ),
        )
        rows = cursor.fetchall()

    items: list[PatientBillReviewRow] = []
    for row in rows:
        amount = _as_float(row.AmountDue)
        if amount < 0:
            amount = 0.0
        category_id = int(row.CategoryId) if row.CategoryId is not None else None
        category, category_label = _category_meta(category_id)
        header_id = int(row.BillingHeaderId)
        history_id = int(row.HistoryId) if row.HistoryId is not None else None
        invoice = None
        if row.InvoiceNumber is not None:
            invoice = str(row.InvoiceNumber).strip() or None
        row_id = f"bh-{header_id}" if history_id is None else f"bhh-{history_id}"
        items.append(
            PatientBillReviewRow(
                id=row_id,
                billing_header_id=header_id,
                history_id=history_id,
                incident_no=(row.IncidentNo or "").strip() or None,
                incident=(row.IncidentLabel or "").strip() or "—",
                provider=(row.ProviderName or "").strip() or "—",
                insurance=(row.InsuranceName or "").strip() or "—",
                visit=(row.VisitCode or "").strip() or "—",
                category=category,
                category_label=category_label,
                doi=(row.Doi or "").strip() or None,
                amount=round(amount, 2),
                invoice_number=invoice,
            )
        )
    return items


def _paid_bill_filters(patient_id: int, search: str) -> tuple[str, tuple]:
    clauses = [
        "bh.PatientId = ?",
        "(p.IsDeleted = 0 OR p.IsDeleted IS NULL)",
        "(h.IsDeleted = 0 OR h.IsDeleted IS NULL)",
        "(bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)",
        "p.PaymentAmount > 0",
        """(
              vt.CategoryId IN (?, ?)
           OR (vt.Id IS NULL AND COALESCE(h.VisitTypeCategoryId, bh.VisitTypeCategoryId) IN (?, ?))
        )""",
    ]
    params: tuple = (
        patient_id,
        URGENT_CARE_CATEGORY_ID,
        PERSONAL_INJURY_CATEGORY_ID,
        URGENT_CARE_CATEGORY_ID,
        PERSONAL_INJURY_CATEGORY_ID,
    )
    if search:
        clauses.append(
            """
            (
                CAST(h.InvoiceNumber AS nvarchar(50)) LIKE ?
                OR vt.Code LIKE ?
                OR vt.Description LIKE ?
                OR prov.Name LIKE ?
                OR CAST(i.IncidentNumber AS nvarchar(50)) LIKE ?
                OR CAST(i.ClaimNumber AS nvarchar(50)) LIKE ?
            )
            """
        )
        term = f"%{search}%"
        params += (term, term, term, term, term, term)
    return " AND ".join(clauses), params


def _paid_bill_summary(clinic, patient_id: int, *, search: str) -> tuple[int, float]:
    where_sql, params = _paid_bill_filters(patient_id, search)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                COUNT_BIG(*) AS Total,
                ISNULL(SUM(p.PaymentAmount), 0) AS TotalPaid
            FROM dbo.BillingOrderPayments p
            INNER JOIN dbo.BillingHeadersHistory h
              ON h.Id = p.BillingHeaderHistoryId
            INNER JOIN dbo.BillingHeaders bh
              ON bh.Id = h.BillingHeaderId
            LEFT JOIN dbo.VisitTypes vt
              ON vt.Id = COALESCE(h.VisitTypeId, bh.VisitTypeId)
             AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            LEFT JOIN dbo.CheckInsHeader ch
              ON ch.Id = bh.CheckinId
             AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            LEFT JOIN dbo.Incidents i
              ON i.Id = COALESCE(h.IncidentId, ch.IncidentId)
             AND (i.IsDeleted = 0 OR i.IsDeleted IS NULL)
            LEFT JOIN dbo.Providers prov
              ON prov.Id = COALESCE(h.ProviderId, bh.ProviderId, ch.ProviderId)
             AND (prov.IsDeleted = 0 OR prov.IsDeleted IS NULL)
            WHERE {where_sql}
            """,
            params,
        )
        row = cursor.fetchone()
    return int(row.Total or 0), _as_float(row.TotalPaid)


def _fetch_paid_bill_rows(
    clinic,
    patient_id: int,
    *,
    search: str,
    offset: int,
    limit: int,
) -> list[PatientPaidBillRow]:
    where_sql, params = _paid_bill_filters(patient_id, search)
    params += (offset, limit)
    items: list[PatientPaidBillRow] = []
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                p.Id AS PaymentId,
                h.BillingHeaderId,
                h.Id AS HistoryId,
                p.PaymentAmount,
                h.InvoiceNumber,
                CONVERT(
                    varchar(10),
                    COALESCE(ch.InjuryDate, h.DateOfInjury, h.CheckinDate, p.PaymentDate),
                    101
                ) AS Doi,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(vt.Description)), ''),
                    NULLIF(LTRIM(RTRIM(h.AdditionalClaimInformation)), ''),
                    NULLIF(LTRIM(RTRIM(vt.Code)), ''),
                    '—'
                ) AS IncidentLabel,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(prov.Name)), ''),
                    NULLIF(
                        LTRIM(RTRIM(
                            ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, '')
                        )),
                        ''
                    ),
                    '—'
                ) AS ProviderName,
                COALESCE(vt.CategoryId, h.VisitTypeCategoryId, bh.VisitTypeCategoryId) AS CategoryId
            FROM dbo.BillingOrderPayments p
            INNER JOIN dbo.BillingHeadersHistory h
              ON h.Id = p.BillingHeaderHistoryId
            INNER JOIN dbo.BillingHeaders bh
              ON bh.Id = h.BillingHeaderId
            LEFT JOIN dbo.VisitTypes vt
              ON vt.Id = COALESCE(h.VisitTypeId, bh.VisitTypeId)
             AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            LEFT JOIN dbo.CheckInsHeader ch
              ON ch.Id = bh.CheckinId
             AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            LEFT JOIN dbo.Incidents i
              ON i.Id = COALESCE(h.IncidentId, ch.IncidentId)
             AND (i.IsDeleted = 0 OR i.IsDeleted IS NULL)
            LEFT JOIN dbo.Providers prov
              ON prov.Id = COALESCE(h.ProviderId, bh.ProviderId, ch.ProviderId)
             AND (prov.IsDeleted = 0 OR prov.IsDeleted IS NULL)
            WHERE {where_sql}
            ORDER BY p.PaymentDate DESC, p.Id DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            params,
        )
        for row in cursor.fetchall():
            category_id = int(row.CategoryId) if row.CategoryId is not None else None
            _, category_label = _category_meta(category_id)
            invoice = row.InvoiceNumber
            invoice_no = (
                str(invoice).strip()
                if invoice is not None and str(invoice).strip()
                else f"PAY-{int(row.PaymentId)}"
            )
            items.append(
                PatientPaidBillRow(
                    id=f"paid-{int(row.PaymentId)}",
                    billing_header_id=int(row.BillingHeaderId),
                    history_id=int(row.HistoryId),
                    invoice_no=invoice_no,
                    provider=(row.ProviderName or "").strip() or "—",
                    incident=(row.IncidentLabel or "").strip() or "—",
                    type=category_label,
                    doi=(row.Doi or "").strip() or None,
                    amount=round(_as_float(row.PaymentAmount), 2),
                )
            )
    return items


def _category_meta(category_id: int | None) -> tuple[str, str]:
    if category_id == PERSONAL_INJURY_CATEGORY_ID:
        return "personalInjury", "Personal Injury"
    return "urgentCare", "Urgent Care"


def _as_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)
