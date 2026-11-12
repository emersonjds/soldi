use chrono::Months;
use soldi_types::reports::{CategoryReport, SavingsYear, YearReport};
use sqlx::PgPool;

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

/// 2 queries: the opening date, then one row per month with entries.
pub async fn savings(
    pool: &PgPool,
    user: &CurrentUser,
    year: &str,
) -> Result<SavingsYear, AppError> {
    let year = domain::parse_year(year)?;
    let mut conn = pool.acquire().await?;
    let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
    let today = crate::today_sao_paulo();
    let range = domain::year_range(year, opening, today);
    let sums = match range {
        Some((from, to)) => repo::savings_by_month(&mut conn, user.id, from, to).await?,
        None => Vec::new(),
    };
    Ok(domain::savings_year(year, range, today, sums))
}

/// 3 queries: the opening date, then one row per month and card, then one per top-level category.
pub async fn year(pool: &PgPool, user: &CurrentUser, year: &str) -> Result<YearReport, AppError> {
    let year = domain::parse_year(year)?;
    let mut conn = pool.acquire().await?;
    let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
    let range = domain::counted_range(year, opening, crate::today_sao_paulo());
    let (flows, groups) = match range {
        Some((from, to)) => (
            repo::year_flows(&mut conn, user.id, from, to).await?,
            repo::year_groups(&mut conn, user.id, from, to).await?,
        ),
        None => (Vec::new(), Vec::new()),
    };
    Ok(domain::year_report(year, range, flows, groups))
}
