use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::transactions::{CreateTransaction, RepeatEvery, Transaction, TransactionSeries};
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
    series_last_date: Option<NaiveDate>,
    series_every: Option<RepeatEvery>,
    card_id: Option<Uuid>,
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
            card_id: row.card_id,
            series: row
                .series_id
                .zip(row.series_last_date)
                .map(|(id, last_date)| TransactionSeries {
                    id,
                    position: row.series_position,
                    total: row.series_total,
                    last_date,
                    every: row.series_every.unwrap_or_default(),
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
                  t.recurring_bill_id, t.cofrinho_id, t.card_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position + t.series_offset AS "series_position!",
                  s.total + t.series_offset AS "series_total!",
                  s.last_date AS series_last_date, t.series_every AS "series_every: RepeatEvery"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, max(m.date) AS last_date, count(*) FILTER (WHERE (m.date, m.id) <= (t.date, t.id)) AS position
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

/// A cofrinho's entries and resgates, with its subcategories' for `Economia`, newest date first,
/// then newest entry first.
pub async fn movements(
    conn: &mut PgConnection,
    user_id: Uuid,
    cofrinho_id: Uuid,
    limit: i64,
) -> Result<Vec<Transaction>, sqlx::Error> {
    let rows = sqlx::query_as!(
        Row,
        r#"SELECT t.id, t.date, t.amount, t.kind AS "kind: CategoryKind", t.note,
                  t.recurring_bill_id, t.cofrinho_id, t.card_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position + t.series_offset AS "series_position!",
                  s.total + t.series_offset AS "series_total!",
                  s.last_date AS series_last_date, t.series_every AS "series_every: RepeatEvery"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, max(m.date) AS last_date, count(*) FILTER (WHERE (m.date, m.id) <= (t.date, t.id)) AS position
               FROM transactions m WHERE m.user_id = t.user_id AND m.series_id = t.series_id
           ) s ON true
           CROSS JOIN (
               SELECT array_agg(k.id) AS ids FROM categories k
               WHERE k.user_id = $1 AND (k.id = $2 OR k.parent_id = $2)
           ) o
           WHERE t.user_id = $1
             AND (t.category_id = ANY(o.ids) OR t.cofrinho_id = ANY(o.ids))
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
                  t.recurring_bill_id, t.cofrinho_id, t.card_id,
                  c.id AS category_id, c.name AS category_name,
                  c.kind AS "category_kind: CategoryKind", c.icon AS category_icon,
                  c.color AS category_color, c.parent_id AS category_parent_id,
                  c.is_savings AS category_is_savings, c.target AS category_target,
                  c.deadline AS category_deadline, t.series_id,
                  s.position + t.series_offset AS "series_position!",
                  s.total + t.series_offset AS "series_total!",
                  s.last_date AS series_last_date, t.series_every AS "series_every: RepeatEvery"
           FROM transactions t JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
           LEFT JOIN LATERAL (
               SELECT count(*) AS total, max(m.date) AS last_date, count(*) FILTER (WHERE (m.date, m.id) <= (t.date, t.id)) AS position
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
    every: Option<RepeatEvery>,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO transactions
             (user_id, date, amount, kind, category_id, note, recurring_bill_id, cofrinho_id,
              series_id, card_id, series_every, series_offset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
        user_id,
        input.date,
        input.amount,
        input.kind.as_str(),
        input.category_id,
        input.note,
        recurring_bill_id,
        cofrinho_id,
        series_id,
        input.card_id,
        every.map(RepeatEvery::as_str),
        input.first_installment.map_or(0, |first| first - 1)
    )
    .fetch_one(&mut *conn)
    .await
}

/// Copies of `entry` on each of `dates`, in `series_id`, with `amounts[i]` on `dates[i]`; they
/// take the series' `series_open` and `series_offset` from a member already written.
pub async fn insert_copies(
    conn: &mut PgConnection,
    user_id: Uuid,
    entry: &CreateTransaction,
    series_id: Uuid,
    every: RepeatEvery,
    dates: &[NaiveDate],
    amounts: &[Decimal],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO transactions
             (user_id, date, amount, kind, category_id, note, series_id, card_id, series_every,
              series_open, series_offset)
         SELECT $1, c.d, c.a, $4, $5, $6, $7, $8, $9, s.series_open, s.series_offset
         FROM UNNEST($2::date[], $3::numeric[]) AS c(d, a)
         CROSS JOIN (SELECT series_open, series_offset FROM transactions
                     WHERE user_id = $1 AND series_id = $7 LIMIT 1) s",
        user_id,
        dates,
        amounts,
        entry.kind.as_str(),
        entry.category_id,
        entry.note,
        series_id,
        entry.card_id,
        every.as_str()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// False when the entry is gone or already in a series.
pub async fn set_series(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    series_id: Uuid,
    every: RepeatEvery,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE transactions SET series_id = $3, series_every = $4, updated_at = now()
         WHERE user_id = $1 AND id = $2 AND series_id IS NULL",
        user_id,
        id,
        series_id,
        every.as_str()
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// R6: the series' members dated after `from` take `entry`'s kind, category and note, its card
/// with `card` (each keeps its own otherwise), and `amount` when given; without it each keeps its
/// own (parcelas differ by the remainder).
pub async fn update_following(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
    from: NaiveDate,
    entry: &CreateTransaction,
    amount: Option<Decimal>,
    card: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE transactions
         SET amount = COALESCE($4, amount), kind = $5, category_id = $6, note = $7,
             card_id = CASE WHEN $9 THEN $8 ELSE card_id END, updated_at = now()
         WHERE user_id = $1 AND series_id = $2 AND date > $3",
        user_id,
        series_id,
        from,
        amount,
        entry.kind.as_str(),
        entry.category_id,
        entry.note,
        entry.card_id,
        card
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

/// SOL-102: whether entry `id`, or with `series_id` that series' members dated `from` on, is a
/// deposit into or a resgate from an archived cofrinho.
pub async fn moves_archived_cofrinho(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    series_id: Option<Uuid>,
    from: NaiveDate,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (
             SELECT 1 FROM transactions t
             LEFT JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
             LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
             LEFT JOIN categories w ON w.user_id = t.user_id AND w.id = t.cofrinho_id
             WHERE t.user_id = $1 AND (t.id = $2 OR (t.series_id = $3 AND t.date >= $4))
               AND ((t.kind = 'bill' AND c.archived_at IS NOT NULL
                     AND p.is_savings AND p.kind = 'bill')
                    OR w.archived_at IS NOT NULL)) AS "archived!""#,
        user_id,
        id,
        series_id,
        from
    )
    .fetch_one(&mut *conn)
    .await
}

/// Serializes every write to one series until the transaction ends; taken before any row lock.
pub async fn lock_series(conn: &mut PgConnection, series_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        series_id.to_string()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// M3 (D32): the dates of the series' last four members, last first.
pub async fn series_end(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
) -> Result<Vec<NaiveDate>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT date FROM transactions WHERE user_id = $1 AND series_id = $2
         ORDER BY date DESC, id DESC LIMIT 4",
        user_id,
        series_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// M1, D30b: the series' members dated `from` on, by `(date, id)`, with their card.
pub async fn members_from(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
    from: NaiveDate,
) -> Result<Vec<(Uuid, NaiveDate, Option<Uuid>)>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT id, date, card_id FROM transactions
         WHERE user_id = $1 AND series_id = $2 AND date >= $3
         ORDER BY date, id",
        user_id,
        series_id,
        from
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.id, row.date, row.card_id))
        .collect())
}

/// M1, M6: `dates[i]` onto entry `ids[i]`; nothing else changes.
pub async fn set_dates(
    conn: &mut PgConnection,
    user_id: Uuid,
    ids: &[Uuid],
    dates: &[NaiveDate],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE transactions t SET date = m.date, updated_at = now()
         FROM UNNEST($2::uuid[], $3::date[]) AS m(id, date)
         WHERE t.user_id = $1 AND t.id = m.id",
        user_id,
        ids,
        dates
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// L3: deletes the series' members positioned after `keep` by `(date, id)`, `series_offset` counted.
pub async fn delete_beyond(
    conn: &mut PgConnection,
    user_id: Uuid,
    series_id: Uuid,
    keep: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM transactions WHERE user_id = $1 AND id IN (
             SELECT id FROM (
                 SELECT id, series_offset + row_number() OVER (ORDER BY date, id) AS position
                 FROM transactions WHERE user_id = $1 AND series_id = $2) m
             WHERE m.position > $3)",
        user_id,
        series_id,
        keep
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// R8: the entry becomes the bill's payment; false unless it is a standalone `bill` entry.
pub async fn link_bill(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    bill_id: Uuid,
    category_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE transactions SET recurring_bill_id = $3, category_id = $4, updated_at = now()
         WHERE user_id = $1 AND id = $2 AND recurring_bill_id IS NULL
           AND series_id IS NULL AND cofrinho_id IS NULL AND kind = 'bill'",
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
         SET date = $3, amount = $4, kind = $5, category_id = $6, note = $7, card_id = $8,
             updated_at = now()
         WHERE user_id = $1 AND id = $2",
        user_id,
        id,
        input.date,
        input.amount,
        input.kind.as_str(),
        input.category_id,
        input.note,
        input.card_id
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

/// SOL-30: the user's entries dated `from` to `to`; every date when `None`.
pub async fn count_period(
    conn: &mut PgConnection,
    user_id: Uuid,
    period: Option<(NaiveDate, NaiveDate)>,
) -> Result<i64, sqlx::Error> {
    let (from, to) = period.unzip();
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM transactions
         WHERE user_id = $1 AND ($2::date IS NULL OR date BETWEEN $2 AND $3)"#,
        user_id,
        from,
        to
    )
    .fetch_one(&mut *conn)
    .await
}

/// SOL-67: the series with members dated `from` to `to`, every date when `None`, in lock order.
pub async fn period_series(
    conn: &mut PgConnection,
    user_id: Uuid,
    period: Option<(NaiveDate, NaiveDate)>,
) -> Result<Vec<Uuid>, sqlx::Error> {
    let (from, to) = period.unzip();
    sqlx::query_scalar!(
        r#"SELECT DISTINCT series_id AS "series_id!" FROM transactions
         WHERE user_id = $1 AND series_id IS NOT NULL
           AND ($2::date IS NULL OR date BETWEEN $2 AND $3)
         ORDER BY 1"#,
        user_id,
        from,
        to
    )
    .fetch_all(&mut *conn)
    .await
}

/// SOL-30: deletes the user's entries dated `from` to `to`, every date when `None`.
pub async fn delete_period(
    conn: &mut PgConnection,
    user_id: Uuid,
    period: Option<(NaiveDate, NaiveDate)>,
) -> Result<u64, sqlx::Error> {
    let (from, to) = period.unzip();
    let result = sqlx::query!(
        "DELETE FROM transactions
         WHERE user_id = $1 AND ($2::date IS NULL OR date BETWEEN $2 AND $3)",
        user_id,
        from,
        to
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soldi_types::bills::CreateBill;
    use sqlx::PgPool;

    #[sqlx::test]
    async fn only_a_standalone_bill_entry_links_to_a_bill(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let user = crate::auth::repo::insert_user(&mut conn, "ana@example.com", "Ana", "hash")
            .await
            .unwrap();
        crate::categories::repo::seed(&mut conn, user.id, &crate::categories::domain::defaults())
            .await
            .unwrap();
        let rent = sqlx::query_scalar!(
            "SELECT id FROM categories WHERE user_id = $1 AND name = 'Aluguel'",
            user.id
        )
        .fetch_one(&mut *conn)
        .await
        .unwrap();
        let bill = crate::bills::repo::insert(
            &mut conn,
            user.id,
            &CreateBill {
                name: "Aluguel".into(),
                amount: Some("10".parse().unwrap()),
                due_day: 7,
                category_id: rent,
                closing_day: None,
                installments: None,
                last_month: None,
            },
        )
        .await
        .unwrap();
        let entry = |kind: CategoryKind| CreateTransaction {
            date: "2026-11-07".parse().unwrap(),
            amount: "10".parse().unwrap(),
            kind,
            category_id: rent,
            note: None,
            repeat_months: None,
            repeat_every: None,
            installments: None,
            first_installment: None,
            card_id: None,
        };
        let member = insert(
            &mut conn,
            user.id,
            &entry(CategoryKind::Bill),
            None,
            None,
            Some(Uuid::new_v4()),
            Some(RepeatEvery::Month),
        )
        .await
        .unwrap();
        let daily = insert(
            &mut conn,
            user.id,
            &entry(CategoryKind::Daily),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        let standalone = insert(
            &mut conn,
            user.id,
            &entry(CategoryKind::Bill),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();

        for refused in [member, daily] {
            assert!(
                !link_bill(&mut conn, user.id, refused, bill.id, rent)
                    .await
                    .unwrap()
            );
        }
        assert!(
            link_bill(&mut conn, user.id, standalone, bill.id, rent)
                .await
                .unwrap()
        );
    }
}
