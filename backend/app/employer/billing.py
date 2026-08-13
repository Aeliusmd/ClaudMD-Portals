"""Read-only employer paid bills from clinic billing tables (SELECT only)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.profile import fetch_profile_from_clinic
from app.employer.schemas import PaidBillRow, PaidBillsResponse


def list_paid_bills(current_user: CurrentUser) -> PaidBillsResponse:
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

    items: list[PaidBillRow] = []
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                p.Id,
                p.PaymentDate,
                p.PaymentAmount,
                h.InvoiceNumber,
                h.PatientFirstName,
                h.PatientLastName,
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
            LEFT JOIN dbo.VisitTypes vt
              ON vt.Id = h.VisitTypeId
            WHERE h.EmployerId = ?
              AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              AND (h.IsDeleted = 0 OR h.IsDeleted IS NULL)
              AND p.PaymentAmount > 0
            ORDER BY p.PaymentDate DESC, p.Id DESC
            """,
            (int(profile.employer_id),),
        )
        for row in cursor.fetchall():
            amount = _as_float(row.PaymentAmount)
            first = (row.PatientFirstName or "").strip()
            last = (row.PatientLastName or "").strip()
            patient_name = " ".join(part for part in (first, last) if part) or None
            invoice = row.InvoiceNumber
            items.append(
                PaidBillRow(
                    id=f"paid-{int(row.Id)}",
                    invoice_no=str(int(invoice)) if invoice is not None else f"PAY-{int(row.Id)}",
                    patient_name=patient_name,
                    description=(row.Description or "").strip() or "Invoice payment",
                    category=(row.VisitTypeDescription or "").strip() or None,
                    paid_on=_format_display_date(row.PaymentDate),
                    amount=amount,
                    status="Paid",
                )
            )

    total_paid = round(sum(item.amount for item in items), 2)
    return PaidBillsResponse(
        items=items,
        total=len(items),
        total_paid=total_paid,
        employer_id=profile.employer_id,
    )


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
