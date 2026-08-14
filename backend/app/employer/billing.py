"""Employer Bill Review — SELECT-only Physical-category bills for the logged-in employer.

No schema changes. Uses existing BillingHeaders / BillingHeadersHistory /
BillingOrdersHistory / Patients / CheckInsHeader / VisitTypes.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.profile import fetch_profile_from_clinic
from app.employer.schemas import (
    BillInvoiceDetail,
    BillInvoiceLine,
    BillReviewResponse,
    BillReviewRow,
)

# Enums.Category EnumTypeId = 2 → Physical (VisitTypes.CategoryId).
PHYSICAL_VISIT_CATEGORY_ID = 2


def list_bill_review(current_user: CurrentUser) -> BillReviewResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer organization not found for this user.",
        )

    items = _fetch_physical_employer_bills(clinic, int(profile.employer_id))
    payable = [row for row in items if row.amount > 0]
    outstanding = sum((float(row.amount) for row in payable), 0.0)

    return BillReviewResponse(
        items=payable,
        total=len(payable),
        payable_count=len(payable),
        outstanding_total=outstanding,
        employer_id=profile.employer_id,
    )


def _fetch_physical_employer_bills(clinic, employer_id: int) -> list[BillReviewRow]:
    """
    One row per BillingHeaders.Id (latest history snapshot when present).

    Physical filter: VisitTypes.CategoryId = 2, or header VisitTypeCategoryId = 2
    when visit type is missing.
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                bh.Id AS BillingHeaderId,
                hist.Id AS HistoryId,
                hist.InvoiceNumber AS InvoiceNumber,
                CONVERT(varchar(10), COALESCE(ch.CheckInDate, hist.CheckinDate), 101) AS Dos,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(CAST(p.AccountNumber AS nvarchar(50)))), ''),
                    NULLIF(LTRIM(RTRIM(hist.PatientAccountNumber)), '')
                ) AS AccountNo,
                LTRIM(RTRIM(
                    COALESCE(
                        NULLIF(
                            LTRIM(RTRIM(ISNULL(p.FirstName, '') + ' ' + ISNULL(p.LastName, ''))),
                            ''
                        ),
                        NULLIF(
                            LTRIM(RTRIM(
                                ISNULL(hist.PatientFirstName, '')
                                + ' '
                                + ISNULL(hist.PatientLastName, '')
                            )),
                            ''
                        ),
                        'Patient'
                    )
                )) AS PatientName,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(vt.Code)), ''),
                    NULLIF(LTRIM(RTRIM(vt.Description)), ''),
                    '—'
                ) AS VisitCode,
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
            LEFT JOIN dbo.Patients p
                ON p.Id = bh.PatientId
               AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
            LEFT JOIN dbo.CheckInsHeader ch
                ON ch.Id = bh.CheckinId
               AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            OUTER APPLY (
                SELECT TOP 1
                    h.Id,
                    h.InvoiceNumber,
                    h.CheckinDate,
                    h.PatientAccountNumber,
                    h.PatientFirstName,
                    h.PatientLastName,
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
            WHERE (bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)
              AND bh.EmployerId = ?
              AND (
                    vt.CategoryId = ?
                 OR (vt.Id IS NULL AND bh.VisitTypeCategoryId = ?)
              )
            ORDER BY
                COALESCE(ch.CheckInDate, hist.CheckinDate) DESC,
                bh.Id DESC
            """,
            (employer_id, PHYSICAL_VISIT_CATEGORY_ID, PHYSICAL_VISIT_CATEGORY_ID),
        )
        rows = cursor.fetchall()

    items: list[BillReviewRow] = []
    for row in rows:
        amount = Decimal(str(row.AmountDue or 0))
        if amount < 0:
            amount = Decimal("0")
        header_id = int(row.BillingHeaderId)
        history_id = int(row.HistoryId) if row.HistoryId is not None else None
        invoice = None
        if row.InvoiceNumber is not None:
            invoice = str(row.InvoiceNumber).strip() or None

        row_id = f"bh-{header_id}" if history_id is None else f"bhh-{history_id}"
        items.append(
            BillReviewRow(
                id=row_id,
                billing_header_id=header_id,
                history_id=history_id,
                dos=(row.Dos or "").strip() or None,
                account_no=(row.AccountNo or "").strip() or None,
                patient_name=(row.PatientName or "").strip() or "Patient",
                visit=(row.VisitCode or "").strip() or "—",
                amount=float(amount),
                invoice_number=invoice,
            )
        )

    return items


def get_bill_invoice(
    current_user: CurrentUser,
    billing_header_id: int,
) -> BillInvoiceDetail:
    """
    Client Services invoice snapshot for one BillingHeaders row.
    SELECT-only. Scoped to the logged-in employer.
    """
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer organization not found for this user.",
        )

    employer_id = int(profile.employer_id)
    header_id = int(billing_header_id)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
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
                ORDER BY h.Id DESC
            ) hist
            WHERE (bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)
              AND bh.Id = ?
              AND bh.EmployerId = ?
            """,
            (header_id, employer_id),
        )
        header = cursor.fetchone()
        if not header:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found for this employer.",
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
    # Match mother layout: "Address, City, ST ZIP" sometimes shown as name line.
    clinic_name_line = (
        (header.BillingLocationName or header.LocationName or "").strip() or None
    )
    if clinic_address and not clinic_name_line:
        clinic_name_line = clinic_address
        clinic_address = None
    elif clinic_name_line and clinic_address:
        # Mother sample shows address in the name line for billing location.
        clinic_name_line = clinic_address
        clinic_address = None

    employer_address = _join_address(
        header.EmployerAddress or header.EmployerAddressLive,
        header.EmployerCity or header.EmployerCityLive,
        header.EmployerState or header.EmployerStateLive,
        header.EmployerZip or header.EmployerZipLive,
    )

    if lines:
        total_due = sum((line.balance for line in lines), 0.0)
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
