"""Employer dashboard KPIs — SELECT-only from CheckInsHeader (+ VisitTypes)."""

from __future__ import annotations

from datetime import date, timedelta

from app.db.clinic import ClinicConnectionInfo, get_clinic_connection

# ClaudMD VisitTypes.CategoryId (NOT VisitTypes.Id — Ids 1/2 do not exist in clinic DBs)
# Business labels "Visit type id = 1 / 2" map to CategoryId.
INJURY_CATEGORY_ID = 1
PHYSICAL_CATEGORY_ID = 2
# Drug screens: VisitTypes.Code = 'PDS' (e.g. Id 39)
DRUG_SCREEN_CODE = "PDS"


def last_30_day_window(today: date | None = None) -> tuple[date, date]:
    end = today or date.today()
    start = end - timedelta(days=30)
    return start, end


def get_dashboard_summary(
    clinic: ClinicConnectionInfo,
    *,
    employer_id: int,
    today: date | None = None,
) -> dict:
    """
    Count CheckInsHeader rows for this employer in the last 30 CheckInDate days:
      injury      → VisitTypes.CategoryId = 1  (all matching rows)
      physicals   → VisitTypes.CategoryId = 2 AND Code <> 'PDS'
      drugScreens → VisitTypes.Code = 'PDS'
    """
    start, end = last_30_day_window(today)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
              SUM(
                CASE WHEN vt.CategoryId = ? THEN 1 ELSE 0 END
              ) AS injury,
              SUM(
                CASE
                  WHEN vt.CategoryId = ?
                   AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> ?
                  THEN 1 ELSE 0
                END
              ) AS physicals,
              SUM(
                CASE
                  WHEN UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) = ?
                  THEN 1 ELSE 0
                END
              ) AS drugScreens
            FROM dbo.CheckInsHeader h
            INNER JOIN dbo.VisitTypes vt ON vt.Id = h.VisitTypeId
            WHERE h.EmployerId = ?
              AND ISNULL(h.IsDeleted, 0) = 0
              AND h.CheckInDate IS NOT NULL
              AND CAST(h.CheckInDate AS DATE) >= ?
              AND CAST(h.CheckInDate AS DATE) <= ?
            """,
            (
                INJURY_CATEGORY_ID,
                PHYSICAL_CATEGORY_ID,
                DRUG_SCREEN_CODE,
                DRUG_SCREEN_CODE,
                employer_id,
                start.isoformat(),
                end.isoformat(),
            ),
        )
        row = cursor.fetchone()

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "injury": int(row.injury or 0) if row else 0,
        "physicals": int(row.physicals or 0) if row else 0,
        "drugScreens": int(row.drugScreens or 0) if row else 0,
        "appointments": 0,
        "unreadReports": 0,
    }
