use soldi_types::settings::{Currency, Settings};
use sqlx::PgConnection;
use uuid::Uuid;

pub async fn insert_defaults(conn: &mut PgConnection, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO settings (user_id, opening_date) VALUES ($1, $2)",
        user_id,
        crate::today_sao_paulo()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// `for_update` locks the row until the transaction ends.
pub async fn find(conn: &mut PgConnection, user_id: Uuid) -> Result<Settings, sqlx::Error> {
    sqlx::query_as!(
        Settings,
        r#"SELECT opening_balance, opening_date, tier_red, tier_zero, tier_yellow, tier_green,
                savings_goal_pct, currency AS "currency: Currency"
         FROM settings WHERE user_id = $1 FOR UPDATE"#,
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
        r#"UPDATE settings
         SET opening_balance = $2, opening_date = $3, tier_red = $4, tier_zero = $5,
             tier_yellow = $6, tier_green = $7, savings_goal_pct = $8, currency = $9,
             updated_at = now()
         WHERE user_id = $1
         RETURNING opening_balance, opening_date, tier_red, tier_zero, tier_yellow, tier_green,
                   savings_goal_pct, currency AS "currency: Currency""#,
        user_id,
        settings.opening_balance,
        settings.opening_date,
        settings.tier_red,
        settings.tier_zero,
        settings.tier_yellow,
        settings.tier_green,
        settings.savings_goal_pct,
        settings.currency.as_str()
    )
    .fetch_one(&mut *conn)
    .await
}
