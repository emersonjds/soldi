use soldi_types::categories::Category;
use soldi_types::transactions::{
    CreateTransaction, RepeatEvery, Scope, Transaction, TransactionSeries, UpdateTransaction,
};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::bills::service::check_fatura_open;
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

/// SOL-67: takes the series locks in `series_id` order before any row lock (D19/D20).
pub async fn delete_period(
    pool: &PgPool,
    user: &CurrentUser,
    period: &str,
) -> Result<i64, AppError> {
    let period = domain::period(period)?;
    let mut tx = pool.begin().await?;
    for series_id in repo::period_series(&mut tx, user.id, period).await? {
        repo::lock_series(&mut tx, series_id).await?;
    }
    let deleted = repo::delete_period(&mut tx, user.id, period).await?;
    tx.commit().await?;
    Ok(i64::try_from(deleted).unwrap_or(i64::MAX))
}

/// Share-locks the category so a concurrent kind change finishes first.
async fn category(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
    active: bool,
) -> Result<Category, AppError> {
    categories::repo::find_shared(conn, user.id, id, active)
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

/// SOL-102: a deleted cofrinho's deposits and resgates are read-only; with `following`, any
/// later series member in one refuses the whole call.
async fn check_cofrinho_active(
    conn: &mut PgConnection,
    user: &CurrentUser,
    current: &Transaction,
    scope: Scope,
) -> Result<(), AppError> {
    let series_id = current
        .series
        .as_ref()
        .filter(|_| scope == Scope::Following)
        .map(|series| series.id);
    if repo::moves_archived_cofrinho(conn, user.id, current.id, series_id, current.date).await? {
        return Err(AppError::rule(
            "archived-cofrinho",
            "This cofrinho was deleted; its deposits and resgates can no longer change.",
        ));
    }
    Ok(())
}

/// D28: one of the caller's unarchived cards.
async fn check_card(
    conn: &mut PgConnection,
    user: &CurrentUser,
    card_id: Uuid,
) -> Result<(), AppError> {
    match crate::bills::repo::find_card(conn, user.id, card_id).await? {
        Some(_) => Ok(()),
        None => Err(AppError::invalid("card_id", "must be one of your cards")),
    }
}

/// R2, R9: with `repeat_months` or `installments`, the series in one database transaction.
pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateTransaction,
) -> Result<Transaction, AppError> {
    let input = domain::check(input)?;
    let mut tx = pool.begin().await?;
    let category = category(&mut tx, user, input.category_id, true).await?;
    domain::check_kind(input.kind, &category)?;
    if let Some(card_id) = input.card_id {
        check_card(&mut tx, user, card_id).await?;
    }
    check_opening(&mut tx, user, input.date).await?;
    let count = input.repeat_months.or(input.installments);
    let every = input.repeat_every.unwrap_or_default();
    let copies = match count {
        Some(count) => domain::repeat_dates(input.date, count, every)?,
        None => vec![],
    };
    let dates = [&[input.date], copies.as_slice()].concat();
    check_fatura_open(&mut tx, user, input.card_id, &dates).await?;
    let amounts = match input.installments {
        Some(parcelas) => domain::installment_amounts(input.amount, parcelas),
        None => vec![input.amount; usize::try_from(count.unwrap_or(1)).unwrap_or(1)],
    };
    let first = CreateTransaction {
        amount: amounts[0],
        ..input
    };
    let series_id = count.map(|_| Uuid::new_v4());
    let id = repo::insert(
        &mut tx,
        user.id,
        &first,
        None,
        None,
        series_id,
        series_id.map(|_| every),
    )
    .await?;
    let mut series = None;
    if let (Some(count), Some(series_id)) = (count, series_id) {
        repo::insert_copies(
            &mut tx,
            user.id,
            &first,
            series_id,
            every,
            &copies,
            &amounts[1..],
        )
        .await?;
        series = Some(TransactionSeries {
            id: series_id,
            position: 1,
            total: count.into(),
            last_date: copies.last().copied().unwrap_or(first.date),
            every,
        });
    }
    tx.commit().await?;
    Ok(Transaction {
        series,
        ..domain::transaction(id, first, category, None)
    })
}

/// R6, M1 (D20): `following` also rewrites the series' later members and moves their day;
/// `repeat_months` starts a series or resizes it (D19). A member locks its series first.
pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    scope: Scope,
    patch: UpdateTransaction,
) -> Result<Transaction, AppError> {
    let mut tx = pool.begin().await?;
    let mut current = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(series) = &current.series {
        repo::lock_series(&mut tx, series.id).await?;
        current = repo::find(&mut tx, user.id, id)
            .await?
            .ok_or(AppError::NotFound)?;
    }
    check_cofrinho_active(&mut tx, user, &current, scope).await?;
    if let (Some(series), Some(every)) = (&current.series, patch.repeat_every)
        && every != series.every
    {
        return Err(AppError::invalid("repeat_every", "a series keeps its step"));
    }
    let every = current
        .series
        .as_ref()
        .map_or(RepeatEvery::Month, |series| series.every);
    if patch.repeat_months.is_some() {
        domain::check_repeatable(&current)?;
    }
    if current.recurring_bill_id.is_some() && patch.kind.is_some_and(|kind| kind != current.kind) {
        return Err(AppError::invalid(
            "kind",
            "a conta fixa payment stays a Saída",
        ));
    }
    let category_id = patch.category_id.unwrap_or(current.category.id);
    let category = category(&mut tx, user, category_id, patch.category_id.is_some()).await?;
    let next = domain::check(CreateTransaction {
        date: patch.date.unwrap_or(current.date),
        amount: patch.amount.unwrap_or(current.amount),
        kind: patch.kind.unwrap_or(current.kind),
        category_id: category.id,
        note: patch.note.unwrap_or(current.note),
        repeat_months: patch.repeat_months,
        repeat_every: patch.repeat_every.filter(|_| current.series.is_none()),
        installments: None,
        card_id: patch.card_id.unwrap_or(current.card_id),
    })?;
    domain::check_kind(next.kind, &category)?;
    // An entry keeps a since-archived card; a new card, or one written on later members, must be live.
    let spreads = scope == Scope::Following && current.series.is_some();
    if let Some(card_id) = next
        .card_id
        .filter(|id| spreads || Some(*id) != current.card_id)
    {
        check_card(&mut tx, user, card_id).await?;
    }
    let moves = scope == Scope::Following && current.series.is_some() && next.date != current.date;
    if moves {
        domain::check_move(every, current.date, next.date)?;
    }
    check_opening(&mut tx, user, next.date).await?;
    if next.amount != current.amount || next.date != current.date || next.card_id != current.card_id
    {
        let mut dates = vec![current.date];
        if let Some(series) = current.series.as_ref().filter(|_| spreads) {
            let from = domain::period_start(every, current.date);
            dates = repo::members_from(&mut tx, user.id, series.id, from)
                .await?
                .into_iter()
                .map(|(_, date)| date)
                .collect();
        }
        check_fatura_open(&mut tx, user, current.card_id, &dates).await?;
        if let Some(first) = dates.first_mut() {
            *first = next.date;
        }
        check_fatura_open(&mut tx, user, next.card_id, &dates).await?;
    }
    if !repo::update(&mut tx, user.id, id, &next)
        .await
        .map_err(paid_once)?
    {
        return Err(AppError::NotFound);
    }
    if let (Scope::Following, Some(series)) = (scope, &current.series) {
        let amount = (next.amount != current.amount).then_some(next.amount);
        repo::update_following(&mut tx, user.id, series.id, current.date, &next, amount).await?;
        if moves {
            let from = domain::period_start(every, next.date);
            let (ids, dates): (Vec<_>, Vec<_>) =
                repo::members_from(&mut tx, user.id, series.id, from)
                    .await?
                    .into_iter()
                    .unzip();
            let dates = domain::moved(every, &dates, next.date)?;
            repo::set_dates(&mut tx, user.id, &ids, &dates).await?;
        }
    }
    match (next.repeat_months, &current.series) {
        (Some(months), Some(series)) => resize(&mut tx, user, id, series.id, months, &next).await?,
        (Some(months), None) => {
            if let Some(card_id) = next.card_id {
                check_card(&mut tx, user, card_id).await?;
            }
            let series_id = Uuid::new_v4();
            let every = next.repeat_every.unwrap_or_default();
            if !repo::set_series(&mut tx, user.id, id, series_id, every).await? {
                return Err(domain::already_repeated());
            }
            let dates = domain::repeat_dates(next.date, months, every)?;
            check_fatura_open(&mut tx, user, next.card_id, &dates).await?;
            let amounts = vec![next.amount; dates.len()];
            repo::insert_copies(&mut tx, user.id, &next, series_id, every, &dates, &amounts)
                .await?;
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
/// The caller holds the series lock.
async fn resize(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
    series_id: Uuid,
    months: i16,
    next: &CreateTransaction,
) -> Result<(), AppError> {
    let edited = repo::find(conn, user.id, id)
        .await?
        .and_then(|entry| entry.series)
        .ok_or(AppError::NotFound)?;
    let months = domain::check_series_length(months, edited.position)?;
    let total = edited.total;
    if i64::from(months) < total {
        repo::delete_beyond(conn, user.id, series_id, months.into()).await?;
    } else if i64::from(months) > total {
        if let Some(card_id) = next.card_id {
            check_card(conn, user, card_id).await?;
        }
        let end = repo::series_end(conn, user.id, series_id).await?;
        if end.is_empty() {
            return Err(AppError::NotFound);
        }
        let count = u32::try_from(i64::from(months) - total).unwrap_or(0);
        let added = domain::growth_dates(edited.every, &end, count)?;
        check_fatura_open(conn, user, next.card_id, &added).await?;
        let amounts = vec![next.amount; added.len()];
        repo::insert_copies(
            conn,
            user.id,
            next,
            series_id,
            edited.every,
            &added,
            &amounts,
        )
        .await?;
    }
    Ok(())
}

/// `following` on a series member also deletes the members dated after it.
/// A member locks its series first, whatever the scope.
pub async fn delete(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    scope: Scope,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    let mut current = repo::find(&mut tx, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(series) = &current.series {
        repo::lock_series(&mut tx, series.id).await?;
        current = repo::find(&mut tx, user.id, id)
            .await?
            .ok_or(AppError::NotFound)?;
    }
    check_cofrinho_active(&mut tx, user, &current, scope).await?;
    let mut dates = vec![current.date];
    if let (Scope::Following, Some(series)) = (scope, &current.series) {
        let from = domain::period_start(series.every, current.date);
        dates = repo::members_from(&mut tx, user.id, series.id, from)
            .await?
            .into_iter()
            .map(|(_, date)| date)
            .collect();
    }
    check_fatura_open(&mut tx, user, current.card_id, &dates).await?;
    match (scope, current.series) {
        (Scope::Following, Some(series)) => {
            repo::delete_following(&mut tx, user.id, series.id, current.date).await?;
        }
        _ => {
            repo::delete(&mut tx, user.id, id).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}
