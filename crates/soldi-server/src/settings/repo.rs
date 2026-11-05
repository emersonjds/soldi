use soldi_types::settings::Settings;
use sqlx::PgConnection;
use uuid::Uuid;

pub async fn insert_defaults(conn: &mut PgConnection, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("INSERT INTO settings (user_id) VALUES ($1)", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// `for_update` locks the row until the transaction ends.
pub async fn find(conn: &mut PgConnection, user_id: Uuid) -> Result<Settings, sqlx::Error> {
    sqlx::query_as!(
        Settings,
        "SELECT opening_balance, opening_date, tier_red, tier_zero, tier_yellow, tier_green,
                savings_goal_pct
         FROM settings WHERE user_id = $1 FOR UPDATE",
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn update(
    conn: &mut PgConnection,
    user_id: Uuid,
    settings: &Settings,
) -> Result<Settings, sqlx::Error> {
    sqlx::query_as!(
        Settings,
        "UPDATE settings
         SET opening_balance = $2, opening_date = $3, tier_red = $4, tier_zero = $5,
             tier_yellow = $6, tier_green = $7, savings_goal_pct = $8, updated_at = now()
         WHERE user_id = $1
         RETURNING opening_balance, opening_date, tier_red, tier_zero, tier_yellow, tier_green,
                   savings_goal_pct",
        user_id,
        settings.opening_balance,
        settings.opening_date,
        settings.tier_red,
        settings.tier_zero,
        settings.tier_yellow,
        settings.tier_green,
        settings.savings_goal_pct
    )
    .fetch_one(&mut *conn)
    .await
}
