use chrono::NaiveDate;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::{CategorySum, MonthSaving};

/// Totals by category and month for the entries dated `from` to `to`, resgates left out (SOL-28)
/// and card payments left out, their spends already counted (D28).
pub async fn category_sums(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<CategorySum>, sqlx::Error> {
    sqlx::query_as!(
        CategorySum,
        r#"SELECT c.id AS category_id, c.name, c.icon, c.color, c.kind AS "kind: CategoryKind",
                  date_trunc('month', t.date::timestamp)::date AS "month!",
                  SUM(t.amount) AS "amount!", c.parent_id,
                  COALESCE(p.name, c.name) AS "group_name!", COALESCE(p.icon, c.icon) AS "group_icon!",
                  COALESCE(p.color, c.color) AS "group_color!",
                  COALESCE(p.kind, c.kind) AS "group_kind!: CategoryKind"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3 AND t.cofrinho_id IS NULL
             AND b.closing_day IS NULL
           GROUP BY c.id, p.id, date_trunc('month', t.date::timestamp)"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// Each month's income without resgates and its savings (bills under `Economia`, itself or a
/// cofrinho, minus resgates), for the entries dated `from` to `to`; months without entries are absent.
pub async fn savings_by_month(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<MonthSaving>, sqlx::Error> {
    sqlx::query_as!(
        MonthSaving,
        r#"SELECT date_trunc('month', t.date::timestamp)::date AS "month!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income' AND t.cofrinho_id IS NULL), 0)
                      AS "income!",
                  COALESCE(SUM(CASE WHEN t.kind = 'bill' THEN t.amount ELSE -t.amount END)
                      FILTER (WHERE (t.kind = 'bill' AND (c.is_savings OR COALESCE(p.is_savings, false)))
                                 OR t.cofrinho_id IS NOT NULL), 0) AS "saved!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
           GROUP BY 1"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}
