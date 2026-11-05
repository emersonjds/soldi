use soldi_types::auth::User;
use sqlx::PgConnection;
use uuid::Uuid;

/// `Ok(None)` when the user was onboarded before. The row stays locked until the transaction
/// ends, so a concurrent second call waits and then gets `None`.
pub async fn mark_onboarded(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"UPDATE users SET onboarded_at = now(), updated_at = now()
           WHERE id = $1 AND onboarded_at IS NULL
           RETURNING id, email::text AS "email!", name, true AS "onboarded!""#,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}
