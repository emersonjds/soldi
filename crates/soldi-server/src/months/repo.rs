use chrono::NaiveDate;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::DaySum;

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
