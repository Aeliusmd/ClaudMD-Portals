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
from app.employer.schemas import BillReviewResponse, BillReviewRow

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
    outstanding = sum((row.amount for row in payable), Decimal("0"))

    return BillReviewResponse(
        items=payable,
        total=len(payable),
        payable_count=len(payable),
        outstanding_total=float(outstanding),
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
