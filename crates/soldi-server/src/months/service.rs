use chrono::Datelike;
use soldi_types::months::{Forecast, MonthView};
use sqlx::PgPool;

use super::domain::{self, MonthInput};
use super::repo;
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::settings;

pub async fn get(pool: &PgPool, user: &CurrentUser, month: &str) -> Result<MonthView, AppError> {
    let month = domain::parse_month(month)?;
    let mut conn = pool.acquire().await?;
    let settings = settings::repo::find(&mut conn, user.id).await?;
    let opening = settings.opening_date;
    if (month.year(), month.month()) < (opening.year(), opening.month()) {
        return Err(AppError::rule(
            "month-before-opening",
            "The month is before the opening date.",
        ));
    }
    let end = domain::month_end(month);
    let sums = repo::day_sums(&mut conn, user.id, opening, end).await?;
    let bills = repo::bills(&mut conn, user.id).await?;
    let payments = repo::payments(&mut conn, user.id, domain::first_of(opening), end).await?;
    let saved = repo::saved(&mut conn, user.id, month.max(opening), end).await?;
    Ok(domain::month_view(MonthInput {
        month,
        settings,
        sums,
        bills,
        payments,
        saved,
        today: crate::today_sao_paulo(),
    }))
}

/// D16: 4 queries whatever the horizon.
pub async fn forecast(pool: &PgPool, user: &CurrentUser) -> Result<Forecast, AppError> {
    let today = crate::today_sao_paulo();
    let mut conn = pool.acquire().await?;
    let settings = settings::repo::find(&mut conn, user.id).await?;
    let opening = settings.opening_date;
    let to = domain::horizon_end(today);
    let sums = repo::day_sums(&mut conn, user.id, opening, to).await?;
    let bills = repo::bills(&mut conn, user.id).await?;
    let payments = repo::payments(&mut conn, user.id, domain::first_of(opening), to).await?;
    Ok(domain::forecast(domain::ForecastInput {
        settings,
        sums,
        bills,
        payments,
        today,
    }))
}
