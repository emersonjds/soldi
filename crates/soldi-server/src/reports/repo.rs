use chrono::NaiveDate;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::{CategorySum, MonthSaving};

/// Totals by month, category, entry kind, card and the flags `CategorySum::flow` reads, for the
/// entries dated `from` to `to`; every other cut is the rule (D54).
pub async fn category_sums(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<CategorySum>, sqlx::Error> {
    sqlx::query_as!(
        CategorySum,
        r#"SELECT c.id AS category_id, c.name, c.icon, c.color, t.kind AS "kind: CategoryKind",
                  date_trunc('month', t.date::timestamp)::date AS "month!",
                  SUM(t.amount) AS "amount!", c.parent_id,
                  COALESCE(p.name, c.name) AS "group_name!", COALESCE(p.icon, c.icon) AS "group_icon!",
                  COALESCE(p.color, c.color) AS "group_color!",
                  COALESCE(p.kind, c.kind) AS "group_kind!: CategoryKind",
                  t.card_id, card.name AS "card_name?",
                  (c.is_savings OR COALESCE(p.is_savings, false)) AS "savings!",
                  t.cofrinho_id IS NOT NULL AS "cofrinho!",
                  b.closing_day IS NOT NULL AS "fatura_payment!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id
           LEFT JOIN recurring_bills card ON card.user_id = t.user_id AND card.id = t.card_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
           GROUP BY c.id, p.id, date_trunc('month', t.date::timestamp), t.kind, t.card_id, card.name,
                    t.cofrinho_id IS NOT NULL, b.closing_day IS NOT NULL"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// Each month's income without resgates, its deposits (bills under `Economia`, itself or a
/// cofrinho) and its resgates, for the entries dated `from` to `to`; months without entries are absent.
pub async fn savings_by_month(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<MonthSaving>, sqlx::Error> {
    sqlx::query_as!(
        MonthSaving,
        r#"SELECT date_trunc('month', t.date::timestamp)::date AS "month!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income' AND t.cofrinho_id IS NULL
                      AND NOT (c.is_savings OR COALESCE(p.is_savings, false))), 0) AS "income!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'bill' AND (c.is_savings
                      OR COALESCE(p.is_savings, false) OR t.cofrinho_id IS NOT NULL)), 0) AS "deposited!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind <> 'bill' AND (t.cofrinho_id IS NOT NULL
                      OR (t.kind = 'income' AND (c.is_savings OR COALESCE(p.is_savings, false))))), 0)
                      AS "withdrawn!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3 AND b.closing_day IS NULL
           GROUP BY 1"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// The user's month notes for the months `from` to `to`, by first day.
pub async fn month_notes(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<(NaiveDate, String)>, sqlx::Error> {
    sqlx::query!(
        "SELECT month, note FROM month_notes WHERE user_id = $1 AND month BETWEEN $2 AND $3",
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
    .map(|rows| rows.into_iter().map(|row| (row.month, row.note)).collect())
}
