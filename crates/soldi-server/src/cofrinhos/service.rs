use chrono::Datelike;
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::cofrinhos::{Cofrinhos, Withdraw};
use soldi_types::transactions::{CreateTransaction, Transaction};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{categories, months, settings, transactions};

/// `month` (`YYYY-MM`) picks `saved_this_month`; today's São Paulo month when absent.
pub async fn list(
    pool: &PgPool,
    user: &CurrentUser,
    month: Option<&str>,
) -> Result<Cofrinhos, AppError> {
    let today = crate::today_sao_paulo();
    let first = match month {
        Some(month) => months::domain::parse_month(month)?,
        None => today.with_day(1).unwrap_or(today),
    };
    let mut conn = pool.acquire().await?;
    let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
    let rows = repo::balances(&mut conn, user.id, opening).await?;
    let end = months::domain::month_end(first);
    let saved = months::repo::saved(&mut conn, user.id, first, end).await?;
    let next = repo::next_contributions(&mut conn, user.id, today).await?;
    Ok(domain::cofrinhos(rows, saved, next, today))
}

/// `Economia` or one of its active subcategories; 404 when the user has no such active
/// category, 422 `not-a-cofrinho` for any other.
async fn find_cofrinho(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Category, AppError> {
    let category = categories::repo::find_active(conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let parent = match category.parent_id {
        Some(parent_id) => categories::repo::find_active(conn, user.id, parent_id).await?,
        None => None,
    };
    let economia = category.is_savings && category.kind == CategoryKind::Bill;
    if !economia && !categories::domain::is_cofrinho_parent(parent.as_ref()) {
        return Err(domain::not_a_cofrinho());
    }
    Ok(category)
}

pub async fn withdraw(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    input: Withdraw,
) -> Result<Transaction, AppError> {
    let mut tx = pool.begin().await?;
    // Locks the user's settings row, so two resgates never both pass the balance check.
    let opening = settings::repo::find(&mut tx, user.id).await?.opening_date;
    let cofrinho = find_cofrinho(&mut tx, user, id).await?;
    let resgate = categories::repo::savings(&mut tx, user.id, CategoryKind::Income).await?;
    let entry = transactions::domain::check(CreateTransaction {
        date: input.date,
        amount: input.amount,
        kind: CategoryKind::Income,
        category_id: resgate.id,
        note: input.note,
        repeat_months: None,
        repeat_every: None,
        installments: None,
        first_installment: None,
        open_ended: false,
        card_id: None,
    })?;
    transactions::service::check_opening(&mut tx, user, entry.date).await?;
    let balance = repo::balance(&mut tx, user.id, cofrinho.id, opening).await?;
    domain::check_withdraw(balance, entry.amount)?;
    let transaction_id = transactions::repo::insert(
        &mut tx,
        user.id,
        &entry,
        None,
        Some(cofrinho.id),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    Ok(Transaction {
        cofrinho_id: Some(cofrinho.id),
        ..transactions::domain::transaction(transaction_id, entry, resgate, None)
    })
}

pub async fn movements(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    limit: i64,
) -> Result<Vec<Transaction>, AppError> {
    if !(1..=200).contains(&limit) {
        return Err(AppError::invalid("limit", "must be 1 to 200"));
    }
    let mut conn = pool.acquire().await?;
    find_cofrinho(&mut conn, user, id).await?;
    Ok(transactions::repo::movements(&mut conn, user.id, id, limit).await?)
}
