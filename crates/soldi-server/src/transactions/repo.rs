use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::transactions::{CreateTransaction, Transaction, TransactionSeries};
use sqlx::PgConnection;
use uuid::Uuid;

struct Row {
    id: Uuid,
    date: NaiveDate,
    amount: Decimal,
    kind: CategoryKind,
    note: Option<String>,
    recurring_bill_id: Option<Uuid>,
    cofrinho_id: Option<Uuid>,
    category_id: Uuid,
    category_name: String,
    category_kind: CategoryKind,
    category_icon: String,
    category_color: String,
    category_parent_id: Option<Uuid>,
    category_is_savings: bool,
    category_target: Option<Decimal>,
    category_deadline: Option<NaiveDate>,
    series_id: Option<Uuid>,
    series_position: i64,
    series_total: i64,
}

impl From<Row> for Transaction {
    fn from(row: Row) -> Self {
        Transaction {
            id: row.id,
            date: row.date,
            amount: row.amount,
            kind: row.kind,
            note: row.note,
            recurring_bill_id: row.recurring_bill_id,
            cofrinho_id: row.cofrinho_id,
            series: row.series_id.map(|id| TransactionSeries {
                id,
                position: row.series_position,
                total: row.series_total,
            }),
            category: Category {
                id: row.category_id,
                name: row.category_name,
                kind: row.category_kind,
                icon: row.category_icon,
                color: row.category_color,
                parent_id: row.category_parent_id,
                is_savings: row.category_is_savings,
                target: row.category_target,
                deadline: row.category_deadline,
            },
        }
    }
}

/// Entries dated `from` to `to`, of one category when given, newest date first, then newest
/// entry first.
pub async fn list(
    conn: &mut PgConnection,
    user_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
    category_id: Option<Uuid>,
) -> Result<Vec<Transaction>, sqlx::Error> {
    let rows = sqlx::query_as!(
        Row,
        r#"SELECT t.id, t.date, t.amount, t.kind AS "kind: CategoryKind", t.note,
                  t.recurring_bill_id, t.cofrinho_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position AS "series_position!", s.total AS "series_total!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, count(*) FILTER (WHERE m.date <= t.date) AS position
               FROM transactions m WHERE m.user_id = t.user_id AND m.series_id = t.series_id
           ) s ON true
           WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
             AND ($4::uuid IS NULL OR t.category_id = $4)
           ORDER BY t.date DESC, t.created_at DESC, t.id DESC"#,
        user_id,
        from,
        to,
        category_id
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows.into_iter().map(Transaction::from).collect())
}

/// A cofrinho's entries and resgates, newest date first, then newest entry first.
pub async fn movements(
    conn: &mut PgConnection,
    user_id: Uuid,
    cofrinho_id: Uuid,
    limit: i64,
) -> Result<Vec<Transaction>, sqlx::Error> {
    let rows = sqlx::query_as!(
        Row,
        r#"SELECT t.id, t.date, t.amount, t.kind AS "kind: CategoryKind", t.note,
                  t.recurring_bill_id, t.cofrinho_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position AS "series_position!", s.total AS "series_total!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, count(*) FILTER (WHERE m.date <= t.date) AS position
               FROM transactions m WHERE m.user_id = t.user_id AND m.series_id = t.series_id
           ) s ON true
           WHERE t.user_id = $1 AND (t.category_id = $2 OR t.cofrinho_id = $2)
           ORDER BY t.date DESC, t.created_at DESC, t.id DESC
           LIMIT $3"#,
        user_id,
        cofrinho_id,
        limit
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows.into_iter().map(Transaction::from).collect())
}

pub async fn find(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Transaction>, sqlx::Error> {
    let row = sqlx::query_as!(
        Row,
        r#"SELECT t.id, t.date, t.amount, t.kind AS "kind: CategoryKind", t.note,
                  t.recurring_bill_id, t.cofrinho_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position AS "series_position!", s.total AS "series_total!"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, count(*) FILTER (WHERE m.date <= t.date) AS position
               FROM transactions m WHERE m.user_id = t.user_id AND m.series_id = t.series_id
           ) s ON true
           WHERE t.user_id = $1 AND t.id = $2"#,
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.map(Transaction::from))
}

pub async fn insert(
    conn: &mut PgConnection,
    user_id: Uuid,
    input: &CreateTransaction,
    recurring_bill_id: Option<Uuid>,
    cofrinho_id: Option<Uuid>,
    series_id: Option<Uuid>,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO transactions
             (user_id, date, amount, kind, category_id, note, recurring_bill_id, cofrinho_id,
              series_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        user_id,
        input.date,
        input.amount,
        input.kind.as_str(),
        input.category_id,
        input.note,
        recurring_bill_id,
        cofrinho_id,
        series_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Copies of `entry` on each of `dates`, in `series_id`.
pub async fn insert_copies(
    conn: &mut PgConnection,
    user_id: Uuid,
    entry: &CreateTransaction,
    series_id: Uuid,
    dates: &[NaiveDate],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id, note, series_id)
         SELECT $1, d, $3, $4, $5, $6, $7 FROM UNNEST($2::date[]) AS d",
        user_id,
        dates,
        entry.amount,
        entry.kind.as_str(),
        entry.category_id,
        entry.note,
        series_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn set_series(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    series_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE transactions SET series_id = $3, updated_at = now() WHERE user_id = $1 AND id = $2",
        user_id,
        id,
        series_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// R6: the series' members dated after `from` take `entry`'s amount, kind, category and note.
pub async fn update_following(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
    from: NaiveDate,
    entry: &CreateTransaction,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE transactions
         SET amount = $4, kind = $5, category_id = $6, note = $7, updated_at = now()
         WHERE user_id = $1 AND series_id = $2 AND date > $3",
        user_id,
        series_id,
        from,
        entry.amount,
        entry.kind.as_str(),
        entry.category_id,
        entry.note
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Deletes the series' members dated `from` on.
pub async fn delete_following(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
    from: NaiveDate,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM transactions WHERE user_id = $1 AND series_id = $2 AND date >= $3",
        user_id,
        series_id,
        from
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// R8: the entry becomes the bill's payment; false when it is gone or already a payment.
pub async fn link_bill(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    bill_id: Uuid,
    category_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE transactions SET recurring_bill_id = $3, category_id = $4, updated_at = now()
         WHERE user_id = $1 AND id = $2 AND recurring_bill_id IS NULL",
        user_id,
        id,
        bill_id,
        category_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Returns false when the user has no entry with this id.
pub async fn update(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    input: &CreateTransaction,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE transactions
         SET date = $3, amount = $4, kind = $5, category_id = $6, note = $7, updated_at = now()
         WHERE user_id = $1 AND id = $2",
        user_id,
        id,
        input.date,
        input.amount,
        input.kind.as_str(),
        input.category_id,
        input.note
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Deletes the bill's payment dated `from` to `to`; false when there is none.
pub async fn delete_payment(
    conn: &mut PgConnection,
    user_id: Uuid,
    recurring_bill_id: Uuid,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM transactions
         WHERE user_id = $1 AND recurring_bill_id = $2 AND date BETWEEN $3 AND $4",
        user_id,
        recurring_bill_id,
        from,
        to
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Returns false when the user has no entry with this id.
pub async fn delete(conn: &mut PgConnection, user_id: Uuid, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM transactions WHERE user_id = $1 AND id = $2",
        user_id,
        id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}
