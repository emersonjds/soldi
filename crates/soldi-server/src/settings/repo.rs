use chrono::NaiveDate;
use rust_decimal::Decimal;
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
                currency AS "currency: Currency", savings_target_pct, daily_estimate,
                daily_estimate_on
         FROM settings WHERE user_id = $1 FOR UPDATE"#,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// R-S2: the Diário from `from` to `to`, card spends out exactly like `flows_by_day` (D28).
pub async fn cash_daily(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Decimal, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(t.amount), 0) AS "total!"
         FROM transactions t
         LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.card_id
         WHERE t.user_id = $1 AND t.kind = 'daily' AND t.date BETWEEN $2 AND $3
           AND b.closing_day IS NULL"#,
        user_id,
        from,
        to
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
             tier_yellow = $6, tier_green = $7, currency = $8, savings_target_pct = $9,
             daily_estimate = $10, daily_estimate_on = $11, updated_at = now()
         WHERE user_id = $1
         RETURNING opening_balance, opening_date, tier_red, tier_zero, tier_yellow, tier_green,
                   currency AS "currency: Currency", savings_target_pct, daily_estimate,
                   daily_estimate_on"#,
        user_id,
        settings.opening_balance,
        settings.opening_date,
        settings.tier_red,
        settings.tier_zero,
        settings.tier_yellow,
        settings.tier_green,
        settings.currency.as_str(),
        settings.savings_target_pct,
        settings.daily_estimate,
        settings.daily_estimate_on
    )
    .fetch_one(&mut *conn)
    .await
}
