use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::CategoryKind;
use sqlx::PgConnection;
use sqlx::types::Json;
use uuid::Uuid;

use super::domain::{ParsedWorkbook, Row, Year};

/// Drops the user's expired previews first.
pub async fn insert_preview(
    conn: &mut PgConnection,
    user_id: Uuid,
    parsed: &ParsedWorkbook,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query!(
        "DELETE FROM import_previews WHERE user_id = $1 AND expires_at < now()",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query_scalar!(
        "INSERT INTO import_previews (user_id, payload) VALUES ($1, $2) RETURNING id",
        user_id,
        Json(parsed) as _
    )
    .fetch_one(&mut *conn)
    .await
}

pub struct Preview {
    pub payload: Json<ParsedWorkbook>,
    pub expired: bool,
}

/// Locks the preview until the transaction ends.
pub async fn find_preview(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Preview>, sqlx::Error> {
    sqlx::query_as!(
        Preview,
        r#"SELECT payload AS "payload: Json<ParsedWorkbook>", expires_at < now() AS "expired!"
           FROM import_previews WHERE id = $1 AND user_id = $2 FOR UPDATE"#,
        id,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn delete_preview(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM import_previews WHERE id = $1 AND user_id = $2",
        id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Transactions an earlier import wrote for these years.
pub async fn delete_imported(
    conn: &mut PgConnection,
    user_id: Uuid,
    years: &[i16],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM transactions
         WHERE user_id = $1 AND import_batch_id IS NOT NULL AND import_year = ANY($2)",
        user_id,
        years
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Returns how many transactions were written.
pub async fn insert_rows(
    conn: &mut PgConnection,
    user_id: Uuid,
    batch_id: Uuid,
    years: &[Year],
    category_id: impl Fn(CategoryKind) -> Uuid,
) -> Result<u64, sqlx::Error> {
    let rows: Vec<(i16, &Row)> = years
        .iter()
        .flat_map(|year| year.rows.iter().map(|row| (year.year, row)))
        .collect();
    let dates: Vec<NaiveDate> = rows.iter().map(|(_, row)| row.date).collect();
    let amounts: Vec<Decimal> = rows.iter().map(|(_, row)| row.amount).collect();
    let kinds: Vec<&str> = rows.iter().map(|(_, row)| row.kind.as_str()).collect();
    let categories: Vec<Uuid> = rows.iter().map(|(_, row)| category_id(row.kind)).collect();
    let notes: Vec<String> = rows
        .iter()
        .map(|(year, _)| format!("Planilha {year}"))
        .collect();
    let import_years: Vec<i16> = rows.iter().map(|(year, _)| *year).collect();
    let result = sqlx::query!(
        "INSERT INTO transactions
             (user_id, import_batch_id, date, amount, kind, category_id, note, import_year)
         SELECT $1, $2, * FROM UNNEST($3::date[], $4::numeric[], $5::text[], $6::uuid[],
                                      $7::text[], $8::smallint[])",
        user_id,
        batch_id,
        &dates,
        &amounts,
        &kinds as &[&str],
        &categories,
        &notes,
        &import_years
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}
