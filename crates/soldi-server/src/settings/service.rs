use soldi_types::settings::{DailyEstimateSuggestion, Settings, UpdateSettings};
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

pub async fn get(pool: &PgPool, user: &CurrentUser) -> Result<Settings, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find(&mut conn, user.id).await?)
}

/// R-S: the pre-fill for the Diário previsto, or none (R-S3, X2).
pub async fn suggestion(
    pool: &PgPool,
    user: &CurrentUser,
) -> Result<Option<DailyEstimateSuggestion>, AppError> {
    let mut conn = pool.acquire().await?;
    let settings = repo::find(&mut conn, user.id).await?;
    let Some((from, to)) =
        domain::suggestion_window(crate::today_sao_paulo(), settings.opening_date)
    else {
        return Ok(None);
    };
    let total = repo::cash_daily(&mut conn, user.id, from, to).await?;
    Ok(domain::suggest(total, from, to))
}

pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    patch: UpdateSettings,
) -> Result<Settings, AppError> {
    let mut tx = pool.begin().await?;
    let next = domain::apply(repo::find(&mut tx, user.id).await?, patch)?;
    let saved = repo::update(&mut tx, user.id, &next).await?;
    tx.commit().await?;
    Ok(saved)
}
