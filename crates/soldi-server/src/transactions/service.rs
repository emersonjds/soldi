use chrono::Datelike;
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

pub async fn count(pool: &PgPool, user: &CurrentUser, period: &str) -> Result<i64, AppError> {
    let period = domain::period(period)?;
    let mut conn = pool.acquire().await?;
    Ok(repo::count_period(&mut conn, user.id, period).await?)
}

pub async fn delete_period(
    pool: &PgPool,
    user: &CurrentUser,
    period: &str,
) -> Result<i64, AppError> {
    let period = domain::period(period)?;
    let mut conn = pool.acquire().await?;
    let deleted = repo::delete_period(&mut conn, user.id, period).await?;
    Ok(i64::try_from(deleted).unwrap_or(i64::MAX))
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

/// R2, R9: with `repeat_months` or `installments`, the series in one database transaction.
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
    let count = input.repeat_months.or(input.installments);
    let amounts = match input.installments {
        Some(parcelas) => domain::installment_amounts(input.amount, parcelas),
        None => vec![input.amount; usize::try_from(count.unwrap_or(1)).unwrap_or(1)],
    };
    let first = CreateTransaction {
        amount: amounts[0],
        ..input
    };
    let series_id = count.map(|_| Uuid::new_v4());
    let id = repo::insert(&mut tx, user.id, &first, None, None, series_id).await?;
    let mut series = None;
    if let (Some(count), Some(series_id)) = (count, series_id) {
        let dates = domain::repeat_dates(first.date, count)?;
        repo::insert_copies(&mut tx, user.id, &first, series_id, &dates, &amounts[1..]).await?;
        series = Some(TransactionSeries {
            id: series_id,
            position: 1,
            total: count.into(),
            last_date: dates.last().copied().unwrap_or(first.date),
        });
    }
    tx.commit().await?;
    Ok(Transaction {
        series,
        ..domain::transaction(id, first, category, None)
    })
}

/// R6: `following` also rewrites the series' later members; `repeat_months` starts a series or resizes it (D19).
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
        installments: None,
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
        let amount = (next.amount != current.amount).then_some(next.amount);
        repo::update_following(&mut tx, user.id, series.id, current.date, &next, amount).await?;
    }
    match (next.repeat_months, &current.series) {
        (Some(months), Some(series)) => resize(&mut tx, user, id, series.id, months, &next).await?,
        (Some(months), None) => {
            let series_id = Uuid::new_v4();
            if !repo::set_series(&mut tx, user.id, id, series_id).await? {
                return Err(domain::already_repeated());
            }
            let dates = domain::repeat_dates(next.date, months)?;
            let amounts = vec![next.amount; dates.len()];
            repo::insert_copies(&mut tx, user.id, &next, series_id, &dates, &amounts).await?;
        }
        (None, _) => {}
    }
    let updated = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    tx.commit().await?;
    Ok(updated)
}

/// L1–L4 (D19): the series ends after `months` entries; growth copies the edited member `next`.
async fn resize(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
    series_id: Uuid,
    months: i16,
    next: &CreateTransaction,
) -> Result<(), AppError> {
    repo::lock_series(conn, series_id).await?;
    let edited = repo::find(conn, user.id, id)
        .await?
        .and_then(|entry| entry.series)
        .ok_or(AppError::NotFound)?;
    let months = domain::check_series_length(months, edited.position)?;
    let total = edited.total;
    if i64::from(months) < total {
        repo::delete_beyond(conn, user.id, series_id, months.into()).await?;
    } else if i64::from(months) > total {
        let (first, last) = repo::series_span(conn, user.id, series_id)
            .await?
            .ok_or(AppError::NotFound)?;
        let count = u32::try_from(i64::from(months) - total).unwrap_or(0);
        let added = domain::following_dates(first.day(), last, count)?;
        let amounts = vec![next.amount; added.len()];
        repo::insert_copies(conn, user.id, next, series_id, &added, &amounts).await?;
    }
    Ok(())
}

/// `following` on a series member also deletes the members dated after it.
pub async fn delete(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    scope: Scope,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    let current = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    match (scope, current.series) {
        (Scope::Following, Some(series)) => {
            repo::lock_series(&mut tx, series.id).await?;
            let locked = repo::find(&mut tx, user.id, id)
                .await?
                .ok_or(AppError::NotFound)?;
            repo::delete_following(&mut tx, user.id, series.id, locked.date).await?;
        }
        _ => {
            repo::delete(&mut tx, user.id, id).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}
