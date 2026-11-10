use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::{DaySum, MonthBill, Payment};

pub async fn day_sums(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<DaySum>, sqlx::Error> {
    sqlx::query_as!(
        DaySum,
        r#"SELECT date, kind AS "kind: CategoryKind", cofrinho_id IS NOT NULL AS "withdrawn!",
                  SUM(amount) AS "amount!"
           FROM transactions
           WHERE user_id = $1 AND date BETWEEN $2 AND $3
           GROUP BY date, kind, cofrinho_id IS NOT NULL"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// Active, unarchived bills by due day, then name, with the São Paulo day each was registered.
pub async fn bills(conn: &mut PgConnection, user_id: Uuid) -> Result<Vec<MonthBill>, sqlx::Error> {
    sqlx::query_as!(
        MonthBill,
        r#"SELECT b.id, b.name, c.icon, c.color, b.amount, b.due_day,
                  (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS "created_on!"
           FROM recurring_bills b JOIN categories c ON c.user_id = b.user_id AND c.id = b.category_id
           WHERE b.user_id = $1 AND b.active AND b.archived_at IS NULL
           ORDER BY b.due_day, lower(b.name), b.id"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Bills under `Economia` (itself or a cofrinho) minus resgates, dated `from` to `to`.
pub async fn saved(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Decimal, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(CASE WHEN t.kind = 'bill' THEN t.amount ELSE -t.amount END), 0)
                  AS "saved!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
             AND ((t.kind = 'bill' AND (c.is_savings OR COALESCE(p.is_savings, false)))
                  OR t.cofrinho_id IS NOT NULL)"#,
        user_id,
        from,
        to
    )
    .fetch_one(&mut *conn)
    .await
}

/// Every bill entry dated `from` to `to`.
pub async fn payments(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<Payment>, sqlx::Error> {
    sqlx::query_as!(
        Payment,
        r#"SELECT recurring_bill_id AS "bill_id!", id AS transaction_id, amount, date
           FROM transactions
           WHERE user_id = $1 AND recurring_bill_id IS NOT NULL AND date BETWEEN $2 AND $3"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}
