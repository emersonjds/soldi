use soldi_types::settings::{Settings, UpdateSettings};
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

pub async fn get(pool: &PgPool, user: &CurrentUser) -> Result<Settings, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find(&mut conn, user.id).await?)
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
