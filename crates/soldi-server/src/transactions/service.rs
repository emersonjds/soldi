use std::collections::BTreeMap;

use chrono::NaiveDate;
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
    let to = months::domain::month_end(first);
    let until = domain::open_until(crate::today_sao_paulo(), to);
    extend_open_series(pool, user, until).await?;
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, user.id, first, to, category_id).await?)
}

/// D36: grows the user's open series through `until`, copying each one's last member under its lock.
pub async fn extend_open_series(
    pool: &PgPool,
    user: &CurrentUser,
    until: NaiveDate,
) -> Result<(), AppError> {
    let behind = repo::open_series_behind(&mut *pool.acquire().await?, user.id, until).await?;
    for id in behind {
        let mut tx = pool.begin().await?;
        let Some(series) = repo::find(&mut tx, user.id, id)
            .await?
            .and_then(|last| last.series)
        else {
            continue;
        };
        repo::lock_series(&mut tx, series.id).await?;
        let end = repo::series_end(&mut tx, user.id, series.id).await?;
        // Re-read under the lock: a concurrent read may have grown it, or Parar série closed it.
        let Some(last) = repo::find(&mut tx, user.id, id)
            .await?
            .filter(|last| last.series.as_ref().is_some_and(|s| s.open_ended))
        else {
            continue;
        };
        let dates = domain::open_dates(series.every, &end, until)?;
        if !dates.is_empty() {
            let amounts = vec![last.amount; dates.len()];
            repo::insert_copies(
                &mut tx,
                user.id,
                &domain::copy_of(&last),
                series.id,
                series.every,
                &dates,
                &amounts,
            )
            .await?;
        }
        tx.commit().await?;
    }
    Ok(())
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

/// Before any member: PostgreSQL refuses `NaiveDate::MIN`.
const SERIES_FLOOR: NaiveDate = NaiveDate::from_ymd_opt(1, 1, 1).unwrap();

/// D33: the series a change or a deletion reaches and the first date it reaches: `this` reaches
/// none, `following` this entry's date on, `all` every member.
fn reach(scope: Scope, current: &Transaction) -> Option<(Uuid, NaiveDate)> {
    let series = current.series.as_ref()?;
    match scope {
        Scope::This => None,
        Scope::Following => Some((series.id, current.date)),
        Scope::All => Some((series.id, SERIES_FLOOR)),
    }
}

/// Where a guard or a move fetches the reached members from.
fn fetch_from(scope: Scope, every: RepeatEvery, date: NaiveDate) -> NaiveDate {
    match scope {
        Scope::All => SERIES_FLOOR,
        Scope::This | Scope::Following => domain::period_start(every, date),
    }
}

/// SOL-102: a deleted cofrinho's deposits and resgates are read-only; any other series member the
/// scope reaches in one refuses the whole call.
async fn check_cofrinho_active(
    conn: &mut PgConnection,
    user: &CurrentUser,
    current: &Transaction,
    scope: Scope,
) -> Result<(), AppError> {
    let reach = reach(scope, current);
    if repo::moves_archived_cofrinho(
        conn,
        user.id,
        current.id,
        reach.map(|(id, _)| id),
        reach.map_or(current.date, |(_, from)| from),
    )
    .await?
    {
        return Err(AppError::rule(
            "archived-cofrinho",
            "This cofrinho was deleted; its deposits and resgates can no longer change.",
        ));
    }
    Ok(())
}

/// D30b: refuses when the fatura of any `(card, date)` is paid; one check per card.
async fn check_faturas_open(
    conn: &mut PgConnection,
    user: &CurrentUser,
    spends: impl IntoIterator<Item = (Option<Uuid>, NaiveDate)>,
) -> Result<(), AppError> {
    let mut by_card: BTreeMap<Uuid, Vec<NaiveDate>> = BTreeMap::new();
    for (card_id, date) in spends {
        if let Some(card_id) = card_id {
            by_card.entry(card_id).or_default().push(date);
        }
    }
    for (card_id, dates) in by_card {
        check_fatura_open(conn, user, Some(card_id), &dates).await?;
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
    let skip = input.first_installment.map_or(0, |first| first - 1);
    let count = input
        .repeat_months
        .or(input.installments.map(|parcelas| parcelas - skip));
    let every = input.repeat_every.unwrap_or_default();
    let copies = match count {
        Some(count) => domain::repeat_dates(input.date, count, every)?,
        None if input.open_ended => {
            let until = domain::open_until(
                crate::today_sao_paulo(),
                months::domain::month_end(input.date),
            );
            domain::open_dates(every, &[input.date], until)?
        }
        None => vec![],
    };
    let dates = [&[input.date], copies.as_slice()].concat();
    check_fatura_open(&mut tx, user, input.card_id, &dates).await?;
    let amounts = match input.installments {
        Some(parcelas) => domain::installment_amounts(input.amount, parcelas)
            [usize::try_from(skip).unwrap_or(0)..]
            .to_vec(),
        None => vec![input.amount; dates.len()],
    };
    let first = CreateTransaction {
        amount: amounts[0],
        ..input
    };
    let series_id = (count.is_some() || first.open_ended).then(Uuid::new_v4);
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
    if let Some(series_id) = series_id {
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
            position: i64::from(1 + skip),
            total: i64::try_from(dates.len()).unwrap_or(0) + i64::from(skip),
            last_date: copies.last().copied().unwrap_or(first.date),
            every,
            open_ended: first.open_ended,
        });
    }
    tx.commit().await?;
    Ok(Transaction {
        series,
        ..domain::transaction(id, first, category, None)
    })
}

/// R6, M1 (D20, D33): `following` also rewrites the series' later members and moves their day,
/// `all` every member; `repeat_months` starts a series or resizes it (D19). A member locks its series first.
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
    if patch.repeat_months.is_some() || patch.open_ended.is_some() {
        domain::check_repeatable(&current)?;
    }
    if patch.repeat_months.is_some() && current.series.as_ref().is_some_and(|s| s.open_ended) {
        return Err(AppError::invalid(
            "repeat_months",
            "an open series has no length; stop it instead",
        ));
    }
    if current.recurring_bill_id.is_some() && patch.kind.is_some_and(|kind| kind != current.kind) {
        return Err(AppError::invalid(
            "kind",
            "a conta fixa payment stays a Saída",
        ));
    }
    let reach = reach(scope, &current);
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
        first_installment: None,
        open_ended: patch.open_ended == Some(true),
        card_id: patch.card_id.unwrap_or(current.card_id),
    })?;
    domain::check_kind(next.kind, &category)?;
    // D28: a kind change also rewrites the card on every reached member.
    let writes_card = next.card_id != current.card_id || next.kind != current.kind;
    // An entry keeps a since-archived card; a new card, or one written on later members, must be live.
    let spreads = reach.is_some();
    if let Some(card_id) = next
        .card_id
        .filter(|id| writes_card && (spreads || Some(*id) != current.card_id))
    {
        check_card(&mut tx, user, card_id).await?;
    }
    let moves = spreads && next.date != current.date;
    if moves {
        domain::check_move(every, current.date, next.date)?;
    }
    check_opening(&mut tx, user, next.date).await?;
    let mut members = vec![(id, current.date, current.card_id)];
    if let Some((series_id, from)) = reach {
        let from = if moves {
            fetch_from(scope, every, current.date)
        } else {
            from
        };
        members = repo::members_from(&mut tx, user.id, series_id, from).await?;
    }
    let dates: Vec<_> = members.iter().map(|(_, date, _)| *date).collect();
    let dates = if moves {
        domain::moved(every, &dates, next.date)?
    } else {
        members
            .iter()
            .map(|(member, date, _)| if *member == id { next.date } else { *date })
            .collect()
    };
    if let Some(first) = dates.first().filter(|_| moves) {
        check_opening(&mut tx, user, *first).await?;
    }
    // D30b: each member whose amount, date or card changes, against its own card and the one it ends on.
    let ends_on = |card_id: Option<Uuid>| if writes_card { next.card_id } else { card_id };
    let changed = members
        .iter()
        .zip(&dates)
        .filter(|((_, date, card_id), to)| {
            next.amount != current.amount || ends_on(*card_id) != *card_id || *to != date
        });
    check_faturas_open(
        &mut tx,
        user,
        changed.flat_map(|((_, date, card_id), to)| [(*card_id, *date), (ends_on(*card_id), *to)]),
    )
    .await?;
    if !repo::update(&mut tx, user.id, id, &next)
        .await
        .map_err(paid_once)?
    {
        return Err(AppError::NotFound);
    }
    if let Some((series_id, from)) = reach {
        let amount = (next.amount != current.amount).then_some(next.amount);
        repo::update_following(
            &mut tx,
            user.id,
            series_id,
            from,
            &next,
            amount,
            writes_card,
        )
        .await?;
        if moves {
            let ids: Vec<_> = members.iter().map(|(member, _, _)| *member).collect();
            repo::set_dates(&mut tx, user.id, &ids, &dates).await?;
        }
    }
    // D28: an open series grows onto its card, which must still be live.
    if let Some(card_id) = next.card_id.filter(|_| patch.open_ended == Some(true)) {
        check_card(&mut tx, user, card_id).await?;
    }
    match (patch.open_ended, &current.series) {
        (Some(true), Some(series)) if !series.open_ended => {
            repo::set_open(&mut tx, user.id, series.id, true).await?;
        }
        (Some(true), None) => {
            let every = next.repeat_every.unwrap_or_default();
            if !repo::set_series(&mut tx, user.id, id, Uuid::new_v4(), every, true).await? {
                return Err(domain::already_repeated());
            }
        }
        (Some(false), Some(series)) if series.open_ended => {
            let after = repo::members_from(&mut tx, user.id, series.id, next.date).await?;
            let after = after
                .into_iter()
                .filter(|(member, date, _)| (*date, *member) > (next.date, id))
                .map(|(_, date, card_id)| (card_id, date));
            check_faturas_open(&mut tx, user, after).await?;
            repo::delete_after(&mut tx, user.id, series.id, next.date, id).await?;
            repo::set_open(&mut tx, user.id, series.id, false).await?;
        }
        _ => {}
    }
    match (next.repeat_months, &current.series) {
        (Some(months), Some(series)) => resize(&mut tx, user, id, series.id, months, &next).await?,
        (Some(months), None) => {
            if let Some(card_id) = next.card_id {
                check_card(&mut tx, user, card_id).await?;
            }
            let series_id = Uuid::new_v4();
            let every = next.repeat_every.unwrap_or_default();
            if !repo::set_series(&mut tx, user.id, id, series_id, every, false).await? {
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

/// `following` on a series member also deletes the members dated after it, `all` every member (D33).
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
    let reach = reach(scope, &current);
    let mut members = vec![(id, current.date, current.card_id)];
    if let Some((series_id, from)) = reach {
        members = repo::members_from(&mut tx, user.id, series_id, from).await?;
    }
    let spends = members
        .into_iter()
        .map(|(_, date, card_id)| (card_id, date));
    check_faturas_open(&mut tx, user, spends).await?;
    match reach {
        Some((series_id, from)) => {
            repo::delete_following(&mut tx, user.id, series_id, from).await?;
            repo::set_open(&mut tx, user.id, series_id, false).await?;
        }
        None => {
            repo::delete(&mut tx, user.id, id).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}
