use soldi_types::categories::Category;
use soldi_types::transactions::{CreateTransaction, Transaction, UpdateTransaction};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{categories, months, settings};

pub async fn list(
    pool: &PgPool,
    user: &CurrentUser,
    month: &str,
) -> Result<Vec<Transaction>, AppError> {
    let first = months::domain::parse_month(month)?;
    let mut conn = pool.acquire().await?;
    let to = months::domain::month_end(first);
    Ok(repo::list(&mut conn, user.id, first, to).await?)
}

async fn active_category(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Category, AppError> {
    categories::repo::find_active(conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)
}

/// The one unique index on entries holds a bill to one payment a month.
pub fn paid_once(error: sqlx::Error) -> AppError {
    match AppError::from(error) {
        AppError::Conflict { .. } => {
            AppError::conflict("bill-already-paid", "This bill is already paid this month.")
        }
        other => other,
    }
}

pub async fn check_opening(
    conn: &mut PgConnection,
    user: &CurrentUser,
    date: chrono::NaiveDate,
) -> Result<(), AppError> {
    if date < settings::repo::find(conn, user.id).await?.opening_date {
        return Err(AppError::rule(
            "before-opening-date",
            "The date is before the opening date.",
        ));
    }
    Ok(())
}

pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateTransaction,
) -> Result<Transaction, AppError> {
    let input = domain::check(input)?;
    let mut conn = pool.acquire().await?;
    let category = active_category(&mut conn, user, input.category_id).await?;
    domain::check_kind(input.kind, &category)?;
    check_opening(&mut conn, user, input.date).await?;
    let id = repo::insert(&mut conn, user.id, &input, None).await?;
    Ok(domain::transaction(id, input, category, None))
}

pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    patch: UpdateTransaction,
) -> Result<Transaction, AppError> {
    let mut conn = pool.acquire().await?;
    let current = repo::find(&mut conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let category = match patch.category_id {
        Some(category_id) => active_category(&mut conn, user, category_id).await?,
        None => current.category,
    };
    let next = domain::check(CreateTransaction {
        date: patch.date.unwrap_or(current.date),
        amount: patch.amount.unwrap_or(current.amount),
        kind: patch.kind.unwrap_or(current.kind),
        category_id: category.id,
        note: patch.note.unwrap_or(current.note),
    })?;
    domain::check_kind(next.kind, &category)?;
    check_opening(&mut conn, user, next.date).await?;
    if !repo::update(&mut conn, user.id, id, &next)
        .await
        .map_err(paid_once)?
    {
        return Err(AppError::NotFound);
    }
    Ok(domain::transaction(
        id,
        next,
        category,
        current.recurring_bill_id,
    ))
}

pub async fn delete(pool: &PgPool, user: &CurrentUser, id: Uuid) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    match repo::delete(&mut conn, user.id, id).await? {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}
