use std::collections::HashMap;

use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::cofrinhos::NextContribution;
use soldi_types::transactions::RepeatEvery;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::Balance;

/// `Economia` and its active subcategories with their balances since `opening`. The `!`
/// overrides hold on a database full of rows, where the plan hides the columns' nullability.
pub async fn balances(
    conn: &mut PgConnection,
    user_id: Uuid,
    opening: NaiveDate,
) -> Result<Vec<Balance>, sqlx::Error> {
    sqlx::query_as!(
        Balance,
        r#"SELECT c.id AS "category_id!", c.name AS "name!", c.icon AS "icon!",
                  c.color AS "color!", c.target, c.deadline, c.is_savings AS "parent!",
                  COALESCE((SELECT SUM(t.amount) FROM transactions t
                            WHERE t.user_id = $1 AND t.category_id = c.id AND t.date >= $2), 0)
                  - COALESCE((SELECT SUM(t.amount) FROM transactions t
                              WHERE t.user_id = $1 AND t.cofrinho_id = c.id AND t.date >= $2), 0)
                  AS "balance!"
           FROM categories c LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           WHERE c.user_id = $1 AND c.kind = 'bill' AND c.archived_at IS NULL
             AND (c.is_savings OR COALESCE(p.is_savings, false))"#,
        user_id,
        opening
    )
    .fetch_all(&mut *conn)
    .await
}

/// One cofrinho's entries minus its resgates since `opening`.
pub async fn balance(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    opening: NaiveDate,
) -> Result<Decimal, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(CASE WHEN category_id = $2 THEN amount ELSE -amount END), 0)
                  AS "balance!"
           FROM transactions
           WHERE user_id = $1 AND (category_id = $2 OR cofrinho_id = $2) AND date >= $3"#,
        user_id,
        id,
        opening
    )
    .fetch_one(&mut *conn)
    .await
}

/// Per cofrinho, the earliest repeated entry dated after `today`, with its series' step.
pub async fn next_contributions(
    conn: &mut PgConnection,
    user_id: Uuid,
    today: NaiveDate,
) -> Result<HashMap<Uuid, NextContribution>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT DISTINCT ON (t.category_id) t.category_id, t.amount,
                  EXTRACT(DAY FROM t.date)::int2 AS "day!",
                  t.series_every AS "every: RepeatEvery"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           WHERE t.user_id = $1 AND c.kind = 'bill' AND t.series_id IS NOT NULL AND t.date > $2
             AND (c.is_savings OR COALESCE(p.is_savings, false))
           ORDER BY t.category_id, t.date, t.created_at, t.id"#,
        user_id,
        today
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let next = NextContribution {
                amount: row.amount,
                day: row.day,
                every: row.every.unwrap_or_default(),
            };
            (row.category_id, next)
        })
        .collect())
}
