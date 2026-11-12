use chrono::Months;
use soldi_types::reports::{CategoryReport, SavingsYear, YearReport};
use sqlx::{Connection, PgPool};

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{months, settings};

pub async fn categories(
    pool: &PgPool,
    user: &CurrentUser,
    month: &str,
) -> Result<CategoryReport, AppError> {
    let month = months::domain::parse_month(month)?;
    let from = month - Months::new(1);
    let mut conn = pool.acquire().await?;
    let sums =
        repo::category_sums(&mut conn, user.id, from, months::domain::month_end(month)).await?;
    Ok(domain::report(month, sums))
}

/// 2 queries: the settings (opening date and target), then one row per month with entries.
pub async fn savings(
    pool: &PgPool,
    user: &CurrentUser,
    year: &str,
) -> Result<SavingsYear, AppError> {
    let year = domain::parse_year(year)?;
    let mut conn = pool.acquire().await?;
    let settings = settings::repo::find(&mut conn, user.id).await?;
    let today = crate::today_sao_paulo();
    let range = domain::year_range(year, settings.opening_date, today);
    let sums = match range {
        Some((from, to)) => repo::savings_by_month(&mut conn, user.id, from, to).await?,
        None => Vec::new(),
    };
    let mut year = domain::savings_year(year, range, today, sums);
    year.target = settings
        .savings_target_pct
        .map(|pct| domain::savings_target(pct, year.income_total, year.saved_total));
    Ok(year)
}

/// 3 queries: the opening date, then in one read-only snapshot one row per month and card and one
/// per top-level category, so both agree.
pub async fn year(pool: &PgPool, user: &CurrentUser, year: &str) -> Result<YearReport, AppError> {
    let year = domain::parse_year(year)?;
    let mut conn = pool.acquire().await?;
    let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
    let range = domain::counted_range(year, opening, crate::today_sao_paulo());
    let (flows, groups) = match range {
        Some((from, to)) => {
            let mut snapshot = conn.begin().await?;
            sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                .execute(&mut *snapshot)
                .await?;
            (
                repo::year_flows(&mut snapshot, user.id, from, to).await?,
                repo::year_groups(&mut snapshot, user.id, from, to).await?,
            )
        }
        None => (Vec::new(), Vec::new()),
    };
    Ok(domain::year_report(year, range, flows, groups))
}
