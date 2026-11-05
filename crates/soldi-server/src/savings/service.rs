use chrono::Months;
use soldi_types::savings::{Savings, SavingsYear, SetSavings};
use sqlx::PgPool;

use super::domain::{self, YearInput};
use super::repo;
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{months, settings};

pub async fn year(pool: &PgPool, user: &CurrentUser, year: i32) -> Result<SavingsYear, AppError> {
    let year = domain::check_year(year)?;
    let first = months::domain::parse_month(&format!("{year}-01"))?;
    let last = months::domain::month_end(first + Months::new(11));
    let mut conn = pool.acquire().await?;
    let settings = settings::repo::find(&mut conn, user.id).await?;
    let income = repo::income_by_month(&mut conn, user.id, first, last).await?;
    let saved = repo::of_year(&mut conn, user.id, year).await?;
    Ok(domain::year(YearInput {
        year,
        opening_date: settings.opening_date,
        goal_pct: settings.savings_goal_pct,
        income,
        saved,
    }))
}

pub async fn set(
    pool: &PgPool,
    user: &CurrentUser,
    year: i32,
    month: i32,
    input: SetSavings,
) -> Result<Savings, AppError> {
    let (year, month) = domain::check_period(year, month)?;
    let amount = domain::check_amount(input.amount)?;
    let mut conn = pool.acquire().await?;
    let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
    if domain::before_opening(year, month, opening) {
        return Err(AppError::rule(
            "month-before-opening",
            "The month is before the opening date.",
        ));
    }
    Ok(repo::upsert(&mut conn, user.id, year, month, amount).await?)
}
