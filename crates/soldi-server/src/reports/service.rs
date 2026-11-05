use chrono::Months;
use soldi_types::reports::CategoryReport;
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::months;

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
