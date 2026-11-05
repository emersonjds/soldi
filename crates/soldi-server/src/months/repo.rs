use chrono::NaiveDate;
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
        r#"SELECT date, kind AS "kind: CategoryKind", SUM(amount) AS "amount!"
           FROM transactions
           WHERE user_id = $1 AND date BETWEEN $2 AND $3
           GROUP BY date, kind"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// Active, unarchived bills by due day, then name.
pub async fn bills(conn: &mut PgConnection, user_id: Uuid) -> Result<Vec<MonthBill>, sqlx::Error> {
    sqlx::query_as!(
        MonthBill,
        "SELECT b.id, b.name, c.icon, c.color, b.amount, b.due_day
         FROM recurring_bills b JOIN categories c ON c.user_id = b.user_id AND c.id = b.category_id
         WHERE b.user_id = $1 AND b.active AND b.archived_at IS NULL
         ORDER BY b.due_day, lower(b.name), b.id",
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn payments(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<Payment>, sqlx::Error> {
    sqlx::query_as!(
        Payment,
        r#"SELECT recurring_bill_id AS "bill_id!", id AS transaction_id, amount
           FROM transactions
           WHERE user_id = $1 AND recurring_bill_id IS NOT NULL AND date BETWEEN $2 AND $3"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}
