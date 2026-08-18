"""Employer billing: paid bills and Physical-category Bill Review (SELECT only).

Paid bills use BillingOrderPayments. Bill Review follows mother
Get_DailyBillingDashboard_Client: CheckInsHeader + VisitTypes (Physical) +
this employer's CheckInsHeader.EmployerId, with BillingHeaders attached when present.
"""

from __future__ import annotations

from datetime import date, datetime
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
    PaidBillRow,
    PaidBillsResponse,
)

PHYSICAL_VISIT_CATEGORY_ID = 2


def _load_live_ehr_invoice_lines(
    cursor,
    *,
    billing_header_id: int,
    checkin_id: int | None,
    exam_date: str | None,
) -> list[BillInvoiceLine]:
    """Live visit services from EHROrderServices when billed history lines are absent."""
    params: list = [int(billing_header_id)]
    checkin_sql = ""
    if checkin_id is not None:
        checkin_sql = " OR o.CheckInId = ?"
        params.append(int(checkin_id))

    cursor.execute(
        f"""
        SELECT
            s.Id,
            sc.Code AS CPTCode,
            COALESCE(
                NULLIF(LTRIM(RTRIM(sc.Description)), ''),
                NULLIF(LTRIM(RTRIM(s.AdditionalInformation)), '')
            ) AS Description,
            s.Quantity,
            s.UnitPrice,
            s.TotalAmount,
            s.PaymentAmount,
            s.AdjustAmount
        FROM dbo.EHROrders o
        INNER JOIN dbo.EHROrderServices s
            ON s.OrderId = o.Id
           AND (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
        LEFT JOIN dbo.ServiceCodes sc
            ON sc.Id = s.ServiceCodeId
           AND (sc.IsDeleted = 0 OR sc.IsDeleted IS NULL)
        WHERE (o.IsDeleted = 0 OR o.IsDeleted IS NULL)
          AND (
                o.BillingHeaderId = ?
                {checkin_sql}
              )
        ORDER BY
            CASE WHEN s.SortOrder IS NULL THEN 1 ELSE 0 END,
            s.SortOrder,
            s.Id
        """,
        tuple(params),
    )
    lines: list[BillInvoiceLine] = []
    exam = (exam_date or "").strip() or None
    for row in cursor.fetchall():
        qty = float(row.Quantity or 1)
        unit = float(row.UnitPrice or 0)
        charges = float(
            row.TotalAmount
            if row.TotalAmount is not None
            else (unit * (qty if qty else 1))
        )
        payment = float(row.PaymentAmount or 0)
        adjust = float(row.AdjustAmount or 0)
        lines.append(
            BillInvoiceLine(
                id=int(row.Id),
                exam_date=exam,
                code=(row.CPTCode or "").strip() or None,
                description=(row.Description or "").strip() or None,
                quantity=qty if qty else 1,
                unit_price=unit,
                charges=charges,
                payment=payment,
                adjust=adjust,
                balance=max(0.0, charges - payment - adjust),
            )
        )
    return lines


def list_bill_review(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = 10,
    search: str = "",
) -> BillReviewResponse:
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
    total, payable_count, outstanding = _bill_review_summary(
        clinic, employer_id, search=search
    )
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, total_pages))
    items = _fetch_bill_review_rows(
        clinic,
        employer_id,
        search=search,
        offset=(page - 1) * page_size,
        limit=page_size,
    )

    return BillReviewResponse(
        items=items,
        total=total,
        payable_count=payable_count,
        outstanding_total=round(outstanding, 2),
        employer_id=profile.employer_id,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# One row per Physical check-in for this employer (mother daily client billing).
# Employer comes from CheckInsHeader.EmployerId. BillingHeaders is attached when present.
# Amount prefers unbilled EHROrderServices.UnitPrice (same as the SP); falls back to
# header / history balance so Pay still has an amount when unit price is 0.
_BILL_REVIEW_CTE = """
WITH Bills AS (
    SELECT
        ch.Id AS CheckInId,
        bh.Id AS BillingHeaderId,
        hist.Id AS HistoryId,
        hist.InvoiceNumber AS InvoiceNumber,
        ch.CheckInDate AS SortDate,
        CONVERT(varchar(10), ch.CheckInDate, 101) AS Dos,
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
            WHEN ISNULL(unbilled.UnbilledCharge, 0) > 0 THEN unbilled.UnbilledCharge
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
    FROM dbo.CheckInsHeader ch
    INNER JOIN dbo.VisitTypes vt
        ON vt.Id = ch.VisitTypeId
    OUTER APPLY (
        SELECT TOP 1 b.IsDeleted
        FROM dbo.BillingBatchVisitTypes b
        WHERE b.VisitTypeId = ch.VisitTypeId
        ORDER BY
            CASE WHEN b.IsDeleted = 1 THEN 1 ELSE 0 END,
            b.Id
    ) bbvt
    LEFT JOIN dbo.Patients p
        ON p.Id = ch.PatientId
       AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
    OUTER APPLY (
        SELECT TOP 1
            h.Id,
            h.TotalCharge,
            h.PaidAmount
        FROM dbo.BillingHeaders h
        WHERE h.CheckinId = ch.Id
          AND (h.IsDeleted = 0 OR h.IsDeleted IS NULL)
        ORDER BY h.Id DESC
    ) bh
    OUTER APPLY (
        SELECT TOP 1
            h.Id,
            h.InvoiceNumber,
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
    OUTER APPLY (
        SELECT ISNULL(SUM(os.UnitPrice), 0) AS UnbilledCharge
        FROM dbo.EHROrders o
        INNER JOIN dbo.EHROrderServices os
            ON os.OrderId = o.Id
        WHERE o.CheckInId = ch.Id
          AND (o.IsDeleted = 0 OR o.IsDeleted IS NULL)
          AND (os.IsDeleted = 0 OR os.IsDeleted IS NULL)
          AND (os.IsBilled = 0 OR os.IsBilled IS NULL)
    ) unbilled
    WHERE ch.CheckInDate IS NOT NULL
      AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
      AND (ch.IsCompleteBill = 0 OR ch.IsCompleteBill IS NULL)
      AND (bbvt.IsDeleted = 0 OR bbvt.IsDeleted IS NULL)
      AND ch.EmployerId = ?
      AND vt.CategoryId = ?
)
"""

_BILL_REVIEW_SEARCH_SQL = """
      AND (
            PatientName LIKE ?
         OR AccountNo LIKE ?
         OR VisitCode LIKE ?
         OR Dos LIKE ?
      )
"""


def _bill_review_filters(employer_id: int, search: str) -> tuple[str, tuple]:
    """Extra WHERE fragment applied to the Bills CTE plus its parameters."""
    params: tuple = (
        employer_id,
        PHYSICAL_VISIT_CATEGORY_ID,
    )
    if not search:
        return "", params
    term = f"%{search}%"
    return _BILL_REVIEW_SEARCH_SQL, params + (term, term, term, term)


def _bill_review_summary(
    clinic,
    employer_id: int,
    *,
    search: str,
) -> tuple[int, int, float]:
    search_sql, params = _bill_review_filters(employer_id, search)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            {_BILL_REVIEW_CTE}
            SELECT
                COUNT_BIG(*) AS Total,
                ISNULL(SUM(AmountDue), 0) AS Outstanding
            FROM Bills
            WHERE AmountDue > 0
            {search_sql}
            """,
            params,
        )
        row = cursor.fetchone()
    return int(row.Total or 0), int(row.Total or 0), _as_float(row.Outstanding)


def _fetch_bill_review_rows(
    clinic,
    employer_id: int,
    *,
    search: str,
    offset: int,
    limit: int,
) -> list[BillReviewRow]:
    search_sql, params = _bill_review_filters(employer_id, search)
    params += (offset, limit)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            {_BILL_REVIEW_CTE}
            SELECT
                CheckInId,
                BillingHeaderId,
                HistoryId,
                InvoiceNumber,
                Dos,
                AccountNo,
                PatientName,
                VisitCode,
                AmountDue
            FROM Bills
            WHERE AmountDue > 0
            {search_sql}
            ORDER BY SortDate DESC, CheckInId DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            params,
        )
        rows = cursor.fetchall()

    items: list[BillReviewRow] = []
    for row in rows:
        amount = Decimal(str(row.AmountDue or 0))
        if amount < 0:
            amount = Decimal("0")
        header_id = int(row.BillingHeaderId) if row.BillingHeaderId is not None else None
        history_id = int(row.HistoryId) if row.HistoryId is not None else None
        checkin_id = int(row.CheckInId)
        invoice = None
        if row.InvoiceNumber is not None:
            invoice = str(row.InvoiceNumber).strip() or None

        if history_id is not None:
            row_id = f"bhh-{history_id}"
        elif header_id is not None:
            row_id = f"bh-{header_id}"
        else:
            row_id = f"ch-{checkin_id}"
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
    history_id: int | None = None,
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
              AND (
                    bh.EmployerId = ?
                 OR ch.EmployerId = ?
              )
            """,
            (
                *((invoice_history_id,) if invoice_history_id is not None else ()),
                header_id,
                employer_id,
                employer_id,
            ),
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


def list_paid_bills(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = 10,
    search: str = "",
) -> PaidBillsResponse:
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
            detail="Employer not found for this user.",
        )

    employer_id = int(profile.employer_id)
    # Physical-only to match Bill Review. Test clinics have no Physical payments yet,
    # so fall back to every visit category when the employer has no Physical payments.
    physical_total, physical_paid = _paid_bill_summary(
        clinic,
        employer_id,
        physical_only=True,
        search="",
    )
    physical_only = physical_total > 0
    if physical_only and not search:
        total, total_paid = physical_total, physical_paid
    else:
        total, total_paid = _paid_bill_summary(
            clinic,
            employer_id,
            physical_only=physical_only,
            search=search,
        )
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, total_pages))
    items = _fetch_paid_bill_rows(
        clinic,
        employer_id,
        physical_only=physical_only,
        search=search,
        offset=(page - 1) * page_size,
        limit=page_size,
    )

    return PaidBillsResponse(
        items=items,
        total=total,
        total_paid=round(total_paid, 2),
        employer_id=profile.employer_id,
        physical_only=physical_only,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _paid_bill_filters(
    employer_id: int,
    *,
    physical_only: bool,
    search: str,
) -> tuple[str, tuple]:
    clauses = [
        "h.EmployerId = ?",
        "(p.IsDeleted = 0 OR p.IsDeleted IS NULL)",
        "(h.IsDeleted = 0 OR h.IsDeleted IS NULL)",
        "(bh.IsDeleted = 0 OR bh.IsDeleted IS NULL)",
        "p.PaymentAmount > 0",
    ]
    params: tuple = (employer_id,)
    if physical_only:
        clauses.append(
            "(vt.CategoryId = ? OR (vt.Id IS NULL AND bh.VisitTypeCategoryId = ?))"
        )
        params += (PHYSICAL_VISIT_CATEGORY_ID, PHYSICAL_VISIT_CATEGORY_ID)
    if search:
        clauses.append(
            """
            (
                h.PatientFirstName LIKE ?
                OR h.PatientLastName LIKE ?
                OR h.PatientAccountNumber LIKE ?
                OR vt.Code LIKE ?
                OR vt.Description LIKE ?
                OR CAST(h.InvoiceNumber AS nvarchar(50)) LIKE ?
            )
            """
        )
        term = f"%{search}%"
        params += (term, term, term, term, term, term)
    return " AND ".join(clauses), params


def _paid_bill_summary(
    clinic,
    employer_id: int,
    *,
    physical_only: bool,
    search: str,
) -> tuple[int, float]:
    where_sql, params = _paid_bill_filters(
        employer_id,
        physical_only=physical_only,
        search=search,
    )
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
              ON vt.Id = h.VisitTypeId
             AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            WHERE {where_sql}
            """,
            params,
        )
        row = cursor.fetchone()
    return int(row.Total or 0), _as_float(row.TotalPaid)


def _fetch_paid_bill_rows(
    clinic,
    employer_id: int,
    *,
    physical_only: bool,
    search: str,
    offset: int,
    limit: int,
) -> list[PaidBillRow]:
    where_sql, params = _paid_bill_filters(
        employer_id,
        physical_only=physical_only,
        search=search,
    )
    params += (offset, limit)

    items: list[PaidBillRow] = []
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                p.Id AS PaymentId,
                h.BillingHeaderId,
                h.Id AS HistoryId,
                p.PaymentDate,
                p.PaymentAmount,
                h.InvoiceNumber,
                CONVERT(varchar(10), h.CheckinDate, 101) AS Dos,
                h.PatientAccountNumber AS AccountNo,
                h.PatientFirstName,
                h.PatientLastName,
                vt.Code AS VisitCode,
                vt.Description AS VisitTypeDescription,
                (
                    SELECT STRING_AGG(o.Description, '; ')
                    FROM dbo.BillingOrderPaymentDetails d
                    LEFT JOIN dbo.BillingOrdersHistory o
                      ON o.Id = d.BillingOrderHistoryId
                    WHERE d.BillingOrderPaymentId = p.Id
                      AND (d.IsDeleted = 0 OR d.IsDeleted IS NULL)
                ) AS Description
            FROM dbo.BillingOrderPayments p
            INNER JOIN dbo.BillingHeadersHistory h
              ON h.Id = p.BillingHeaderHistoryId
            INNER JOIN dbo.BillingHeaders bh
              ON bh.Id = h.BillingHeaderId
            LEFT JOIN dbo.VisitTypes vt
              ON vt.Id = h.VisitTypeId
             AND (vt.IsDeleted = 0 OR vt.IsDeleted IS NULL)
            WHERE {where_sql}
            ORDER BY p.PaymentDate DESC, p.Id DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            params,
        )
        for row in cursor.fetchall():
            amount = _as_float(row.PaymentAmount)
            first = (row.PatientFirstName or "").strip()
            last = (row.PatientLastName or "").strip()
            patient_name = " ".join(part for part in (first, last) if part) or None
            invoice = row.InvoiceNumber
            invoice_number = (
                str(invoice).strip() if invoice is not None else f"PAY-{int(row.PaymentId)}"
            )
            items.append(
                PaidBillRow(
                    id=f"paid-{int(row.PaymentId)}",
                    billing_header_id=int(row.BillingHeaderId),
                    history_id=int(row.HistoryId),
                    invoice_no=invoice_number,
                    invoice_number=invoice_number,
                    dos=(row.Dos or "").strip() or None,
                    account_no=(
                        str(row.AccountNo).strip() if row.AccountNo is not None else None
                    ),
                    patient_name=patient_name,
                    visit=(row.VisitCode or "").strip() or "—",
                    description=(row.Description or "").strip() or "Invoice payment",
                    category=(row.VisitTypeDescription or "").strip() or None,
                    paid_on=_format_display_date(row.PaymentDate),
                    amount=amount,
                    status="Paid",
                )
            )

    return items


def _as_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _format_display_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%b %d, %Y")
    return str(value)
