use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::savings::Savings;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::MonthAmount;

/// Income entries dated `from` to `to`, by calendar month.
pub async fn income_by_month(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<MonthAmount>, sqlx::Error> {
    sqlx::query_as!(
        MonthAmount,
        r#"SELECT EXTRACT(MONTH FROM date)::smallint AS "month!", SUM(amount) AS "amount!"
           FROM transactions
           WHERE user_id = $1 AND kind = 'income' AND date BETWEEN $2 AND $3
           GROUP BY 1"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn of_year(
    conn: &mut PgConnection,
    user_id: Uuid,
    year: i16,
) -> Result<Vec<MonthAmount>, sqlx::Error> {
    sqlx::query_as!(
        MonthAmount,
        "SELECT month, amount FROM savings WHERE user_id = $1 AND year = $2",
        user_id,
        year
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find(
    conn: &mut PgConnection,
    user_id: Uuid,
    year: i16,
    month: i16,
) -> Result<Option<Decimal>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT amount FROM savings WHERE user_id = $1 AND year = $2 AND month = $3",
        user_id,
        year,
        month
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn upsert(
    conn: &mut PgConnection,
    user_id: Uuid,
    year: i16,
    month: i16,
    amount: Decimal,
) -> Result<Savings, sqlx::Error> {
    sqlx::query_as!(
        Savings,
        "INSERT INTO savings (user_id, year, month, amount) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, year, month)
         DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
         RETURNING year, month, amount",
        user_id,
        year,
        month,
        amount
    )
    .fetch_one(&mut *conn)
    .await
}
