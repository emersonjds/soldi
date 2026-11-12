use chrono::NaiveDate;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::{CategorySum, MonthSaving, YearFlow, YearGroupSum};

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
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income' AND t.cofrinho_id IS NULL), 0)
                      AS "income!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'bill' AND (c.is_savings
                      OR COALESCE(p.is_savings, false) OR t.cofrinho_id IS NOT NULL)), 0) AS "deposited!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind <> 'bill' AND t.cofrinho_id IS NOT NULL), 0)
                      AS "withdrawn!"
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

/// One row per month and card of the entries dated `from` to `to`, by purchase date (D31):
/// income and resgates as `savings_by_month`, deposits, Saídas without deposits and fatura
/// payments, and Diário; `card_id` only on a card's spends. A fatura payment counts nowhere but
/// `withdrawn` and `deposited`, whatever its kind.
pub async fn year_flows(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<YearFlow>, sqlx::Error> {
    sqlx::query_as!(
        YearFlow,
        r#"SELECT date_trunc('month', t.date::timestamp)::date AS "month!", t.card_id,
                  card.name AS "card_name?",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income' AND t.cofrinho_id IS NULL
                      AND b.closing_day IS NULL), 0) AS "income!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind <> 'bill' AND t.cofrinho_id IS NOT NULL), 0)
                      AS "withdrawn!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'bill' AND (c.is_savings
                      OR COALESCE(p.is_savings, false) OR t.cofrinho_id IS NOT NULL)), 0) AS "deposited!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'bill' AND NOT (c.is_savings
                      OR COALESCE(p.is_savings, false)) AND t.cofrinho_id IS NULL
                      AND b.closing_day IS NULL), 0) AS "bills!",
                  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'daily' AND t.cofrinho_id IS NULL
                      AND b.closing_day IS NULL), 0) AS "daily!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id
           LEFT JOIN recurring_bills card ON card.user_id = t.user_id AND card.id = t.card_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
           GROUP BY 1, t.card_id, card.name"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// Totals by top-level category of the entries dated `from` to `to`, split into income and
/// outflow, with resgates, deposits and fatura payments left out: the filters of `year_flows`'
/// `income`, `bills` and `daily`.
pub async fn year_groups(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<YearGroupSum>, sqlx::Error> {
    sqlx::query_as!(
        YearGroupSum,
        r#"SELECT COALESCE(p.id, c.id) AS "category_id!", COALESCE(p.name, c.name) AS "name!",
                  COALESCE(p.icon, c.icon) AS "icon!", COALESCE(p.color, c.color) AS "color!",
                  t.kind = 'income' AS "income!", SUM(t.amount) AS "amount!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
             AND t.cofrinho_id IS NULL AND b.closing_day IS NULL
             AND NOT (t.kind = 'bill' AND (c.is_savings OR COALESCE(p.is_savings, false)))
           GROUP BY 1, 2, 3, 4, 5"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}
