use soldi_types::imports::ImportPreview;
use sqlx::PgPool;

use super::domain::{self, MAX_FILE_BYTES};
use super::repo;
use crate::error::AppError;
use crate::extract::CurrentUser;

pub async fn preview(
    pool: &PgPool,
    user: &CurrentUser,
    file: Vec<u8>,
) -> Result<ImportPreview, AppError> {
    if file.len() > MAX_FILE_BYTES {
        return Err(AppError::TooLarge);
    }
    let parsed = tokio::task::spawn_blocking(move || domain::parse(file))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(|_| AppError::invalid("file", "must be an .xlsx workbook"))?;
    let mut conn = pool.acquire().await?;
    let token = repo::insert_preview(&mut conn, user.id, &parsed).await?;
    Ok(domain::preview(&parsed, token))
}
