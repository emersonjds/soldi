use sqlx::PgConnection;
use sqlx::types::Json;
use uuid::Uuid;

use super::domain::ParsedWorkbook;

/// Drops the user's expired previews first.
pub async fn insert_preview(
    conn: &mut PgConnection,
    user_id: Uuid,
    parsed: &ParsedWorkbook,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query!(
        "DELETE FROM import_previews WHERE user_id = $1 AND expires_at < now()",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query_scalar!(
        "INSERT INTO import_previews (user_id, payload) VALUES ($1, $2) RETURNING id",
        user_id,
        Json(parsed) as _
    )
    .fetch_one(&mut *conn)
    .await
}
