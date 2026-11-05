use chrono::Datelike;
use soldi_types::months::MonthView;
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
    let sums = repo::day_sums(&mut conn, user.id, opening, domain::month_end(month)).await?;
    Ok(domain::month_view(MonthInput {
        month,
        settings,
        sums,
        today: chrono::Utc::now().date_naive(),
    }))
}
