"""Patient portal Bill Review / Paid Bills — SELECT-only.

Urgent Care (VisitTypes.CategoryId = 3) and Personal Injury (CategoryId = 4)
for the logged-in patient only. No schema changes.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
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
