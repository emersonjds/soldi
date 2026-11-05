use chrono::NaiveDate;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::CategorySum;

/// Totals by category and month for the entries dated `from` to `to`.
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
                  SUM(t.amount) AS "amount!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
           GROUP BY c.id, date_trunc('month', t.date::timestamp)"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}
