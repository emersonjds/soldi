use soldi_types::bills::{Bill, CreateBill, PayBill, UpdateBill};
use soldi_types::categories::CategoryKind;
use soldi_types::transactions::{CreateTransaction, Transaction};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::months::domain::{month_end, parse_month};
use crate::transactions;

pub async fn list(
    pool: &PgPool,
    user: &CurrentUser,
    include_inactive: bool,
) -> Result<Vec<Bill>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, user.id, include_inactive).await?)
}

/// Rule 11: one of the caller's active `bill` categories.
async fn check_category(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
    field: &str,
) -> Result<(), AppError> {
    if repo::bill_category_ids(conn, user.id, &[id])
        .await?
        .is_empty()
    {
        return Err(AppError::invalid(
            field,
            "must be one of your bill categories",
        ));
    }
    Ok(())
}

pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateBill,
) -> Result<Bill, AppError> {
    let input = domain::check(input, "")?;
    let mut conn = pool.acquire().await?;
    check_category(&mut conn, user, input.category_id, "category_id").await?;
    Ok(repo::insert(&mut conn, user.id, &input).await?)
}

pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    patch: UpdateBill,
) -> Result<Bill, AppError> {
    let mut conn = pool.acquire().await?;
    let current = repo::find(&mut conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let next = domain::check(
        CreateBill {
            name: patch.name.unwrap_or(current.name),
            amount: patch.amount.unwrap_or(current.amount),
            due_day: patch.due_day.unwrap_or(current.due_day),
            category_id: patch.category_id.unwrap_or(current.category_id),
        },
        "",
    )?;
    if let Some(category_id) = patch.category_id {
        check_category(&mut conn, user, category_id, "category_id").await?;
    }
    let active = patch.active.unwrap_or(current.active);
    repo::update(&mut conn, user.id, id, &next, active)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn archive(pool: &PgPool, user: &CurrentUser, id: Uuid) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    match repo::archive(&mut conn, user.id, id).await? {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}

/// Rules 2 to 4 and 12: one bill entry a month, inside `month` when given.
pub async fn pay(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    month: Option<&str>,
    input: PayBill,
) -> Result<Transaction, AppError> {
    let month = month.map(parse_month).transpose()?;
    let mut conn = pool.acquire().await?;
    let bill = repo::find(&mut conn, user.id, id)
        .await?
        .filter(|bill| bill.active)
        .ok_or(AppError::NotFound)?;
    let entry = transactions::domain::check(CreateTransaction {
        date: input.date,
        amount: input.amount.unwrap_or(bill.amount),
        kind: CategoryKind::Bill,
        category_id: bill.category_id,
        note: None,
    })?;
    if month.is_some_and(|first| !(first..=month_end(first)).contains(&entry.date)) {
        return Err(AppError::invalid("date", "must be in the month"));
    }
    transactions::service::check_opening(&mut conn, user, entry.date).await?;
    let transaction_id = transactions::repo::insert(&mut conn, user.id, &entry, Some(bill.id))
        .await
        .map_err(transactions::service::paid_once)?;
    transactions::repo::find(&mut conn, user.id, transaction_id)
        .await?
        .ok_or(AppError::NotFound)
}

/// Rule 5: deletes the bill's entry of `month`.
pub async fn unpay(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    month: &str,
) -> Result<(), AppError> {
    let first = parse_month(month)?;
    let mut conn = pool.acquire().await?;
    match transactions::repo::delete_payment(&mut conn, user.id, id, first, month_end(first))
        .await?
    {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}

/// Checks and inserts the onboarding bills; errors name `bills[i].<field>`.
pub async fn insert_all(
    conn: &mut PgConnection,
    user: &CurrentUser,
    bills: Vec<CreateBill>,
) -> Result<(), AppError> {
    let bills = bills
        .into_iter()
        .enumerate()
        .map(|(index, bill)| domain::check(bill, &format!("bills[{index}].")))
        .collect::<Result<Vec<_>, _>>()?;
    let ids: Vec<_> = bills.iter().map(|bill| bill.category_id).collect();
    let allowed = repo::bill_category_ids(conn, user.id, &ids).await?;
    if let Some(index) = ids.iter().position(|id| !allowed.contains(id)) {
        return Err(AppError::invalid(
            &format!("bills[{index}].category_id"),
            "must be one of your bill categories",
        ));
    }
    Ok(repo::insert_all(conn, user.id, &bills).await?)
}
