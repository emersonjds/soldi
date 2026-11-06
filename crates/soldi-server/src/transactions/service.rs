use soldi_types::categories::Category;
use soldi_types::transactions::{
    CreateTransaction, Scope, Transaction, TransactionSeries, UpdateTransaction,
};
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
    category_id: Option<Uuid>,
) -> Result<Vec<Transaction>, AppError> {
    let first = months::domain::parse_month(month)?;
    let mut conn = pool.acquire().await?;
    let to = months::domain::month_end(first);
    Ok(repo::list(&mut conn, user.id, first, to, category_id).await?)
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

/// R2: with `repeat_months`, the entry and its copies in one database transaction.
pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateTransaction,
) -> Result<Transaction, AppError> {
    let input = domain::check(input)?;
    let mut tx = pool.begin().await?;
    let category = active_category(&mut tx, user, input.category_id).await?;
    domain::check_kind(input.kind, &category)?;
    check_opening(&mut tx, user, input.date).await?;
    let series_id = input.repeat_months.map(|_| Uuid::new_v4());
    let id = repo::insert(&mut tx, user.id, &input, None, None, series_id).await?;
    if let (Some(months), Some(series_id)) = (input.repeat_months, series_id) {
        let dates = domain::repeat_dates(input.date, months);
        repo::insert_copies(&mut tx, user.id, &input, series_id, &dates).await?;
    }
    tx.commit().await?;
    let series = series_id
        .zip(input.repeat_months)
        .map(|(id, months)| TransactionSeries {
            id,
            position: 1,
            total: months.into(),
        });
    Ok(Transaction {
        series,
        ..domain::transaction(id, input, category, None)
    })
}

/// R6: `following` also rewrites the series' later members; `repeat_months` starts a series.
pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    scope: Scope,
    patch: UpdateTransaction,
) -> Result<Transaction, AppError> {
    let mut tx = pool.begin().await?;
    let current = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if patch.repeat_months.is_some() {
        domain::check_repeatable(&current)?;
    }
    let category = match patch.category_id {
        Some(category_id) => active_category(&mut tx, user, category_id).await?,
        None => current.category,
    };
    let next = domain::check(CreateTransaction {
        date: patch.date.unwrap_or(current.date),
        amount: patch.amount.unwrap_or(current.amount),
        kind: patch.kind.unwrap_or(current.kind),
        category_id: category.id,
        note: patch.note.unwrap_or(current.note),
        repeat_months: patch.repeat_months,
    })?;
    domain::check_kind(next.kind, &category)?;
    check_opening(&mut tx, user, next.date).await?;
    if !repo::update(&mut tx, user.id, id, &next)
        .await
        .map_err(paid_once)?
    {
        return Err(AppError::NotFound);
    }
    if let (Scope::Following, Some(series)) = (scope, &current.series) {
        repo::update_following(&mut tx, user.id, series.id, current.date, &next).await?;
    }
    if let Some(months) = next.repeat_months {
        let series_id = Uuid::new_v4();
        if !repo::set_series(&mut tx, user.id, id, series_id).await? {
            return Err(domain::already_repeated());
        }
        let dates = domain::repeat_dates(next.date, months);
        repo::insert_copies(&mut tx, user.id, &next, series_id, &dates).await?;
    }
    let updated = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    tx.commit().await?;
    Ok(updated)
}

/// `following` on a series member also deletes the members dated after it.
pub async fn delete(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    scope: Scope,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let current = repo::find(&mut conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    match (scope, current.series) {
        (Scope::Following, Some(series)) => {
            repo::delete_following(&mut conn, user.id, series.id, current.date).await?
        }
        _ => {
            repo::delete(&mut conn, user.id, id).await?;
        }
    }
    Ok(())
}
