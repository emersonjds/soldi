use chrono::NaiveDate;
use soldi_types::bills::{Bill, CreateBill, PayBill, UpdateBill};
use soldi_types::categories::CategoryKind;
use soldi_types::transactions::{CreateTransaction, Transaction};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::months::domain::{first_of, month_end, parse_month};
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

/// A bill pays and resumes only on a `bill` category; an archived one still counts.
async fn check_bill_kind(
    conn: &mut PgConnection,
    user: &CurrentUser,
    category_id: Uuid,
) -> Result<(), AppError> {
    if !repo::is_bill_category(conn, user.id, category_id).await? {
        return Err(AppError::invalid(
            "category_id",
            "must be one of your bill categories",
        ));
    }
    Ok(())
}

/// D28: a card never pays into `Economia` or a cofrinho.
async fn check_card_category(
    conn: &mut PgConnection,
    user: &CurrentUser,
    category_id: Uuid,
) -> Result<(), AppError> {
    if repo::is_savings_category(conn, user.id, category_id).await? {
        return Err(AppError::invalid(
            "category_id",
            "a card never pays into Economia or a cofrinho",
        ));
    }
    Ok(())
}

/// D30b: refuses when a spend on `card_id` dated one of `dates` would change a paid fatura.
pub async fn check_fatura_open(
    conn: &mut PgConnection,
    user: &CurrentUser,
    card_id: Option<Uuid>,
    dates: &[NaiveDate],
) -> Result<(), AppError> {
    let Some(id) = card_id else {
        return Ok(());
    };
    let Some(card) = repo::find_any_card(conn, user.id, id).await? else {
        return Ok(());
    };
    let closing_day = card.closing_day.unwrap_or_default();
    let months: Vec<NaiveDate> = dates
        .iter()
        .map(|date| first_of(domain::fatura_due(*date, closing_day, card.due_day)))
        .collect();
    if repo::paid_in(conn, user.id, card.id, &months).await? {
        return Err(domain::fatura_paid());
    }
    Ok(())
}

/// R8 (SOL-21): with `transaction_id`, that entry becomes the new bill's payment, in the
/// same database transaction.
pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateBill,
    transaction_id: Option<Uuid>,
) -> Result<Bill, AppError> {
    let input = domain::check(input, "")?;
    if transaction_id.is_some() && input.closing_day.is_some() {
        return Err(AppError::invalid(
            "transaction_id",
            "an entry becomes a conta fixa, never a card",
        ));
    }
    let mut tx = pool.begin().await?;
    if let Some(id) = transaction_id {
        let entry = transactions::repo::find(&mut tx, user.id, id)
            .await?
            .ok_or(AppError::NotFound)?;
        transactions::domain::check_convertible(&entry)?;
    }
    check_category(&mut tx, user, input.category_id, "category_id").await?;
    if input.closing_day.is_some() {
        check_card_category(&mut tx, user, input.category_id).await?;
    }
    let bill = repo::insert(&mut tx, user.id, &input).await?;
    if let Some(id) = transaction_id
        && !transactions::repo::link_bill(&mut tx, user.id, id, bill.id, bill.category_id).await?
    {
        return Err(transactions::domain::cannot_become_bill());
    }
    tx.commit().await?;
    Ok(bill)
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
    // D28: a conta fixa never turns into a card, so its past payments keep their meaning.
    if current.closing_day.is_none() && patch.closing_day.is_some() {
        return Err(AppError::invalid(
            "closing_day",
            "only a card has a closing day",
        ));
    }
    if current.closing_day.is_some() && patch.active == Some(false) {
        return Err(AppError::invalid(
            "active",
            "a card has no pause; delete it instead",
        ));
    }
    let next = domain::check(
        CreateBill {
            name: patch.name.unwrap_or(current.name),
            amount: patch.amount.or(current.amount),
            due_day: patch.due_day.unwrap_or(current.due_day),
            category_id: patch.category_id.unwrap_or(current.category_id),
            closing_day: patch.closing_day.or(current.closing_day),
        },
        "",
    )?;
    // A bill keeps an archived category until the user picks another one.
    if let Some(category_id) = patch.category_id.filter(|id| *id != current.category_id) {
        check_category(&mut conn, user, category_id, "category_id").await?;
        if next.closing_day.is_some() {
            check_card_category(&mut conn, user, category_id).await?;
        }
    }
    if current.closing_day.is_some()
        && next.closing_day != current.closing_day
        && repo::paid_since(&mut conn, user.id, id, first_of(crate::today_sao_paulo())).await?
    {
        return Err(domain::fatura_paid());
    }
    let active = patch.active.unwrap_or(current.active);
    if active && !current.active {
        check_bill_kind(&mut conn, user, next.category_id).await?;
    }
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

/// Rules 2 to 4 and 12: one bill entry a month, inside `month` when given. D28: a card's
/// fatura needs its amount and stays payable once the card is archived.
pub async fn pay(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    month: Option<&str>,
    input: PayBill,
) -> Result<Transaction, AppError> {
    let month = month.map(parse_month).transpose()?;
    let mut conn = pool.acquire().await?;
    let bill = repo::find_payable(&mut conn, user.id, id)
        .await?
        .filter(|bill| bill.active)
        .ok_or(AppError::NotFound)?;
    check_bill_kind(&mut conn, user, bill.category_id).await?;
    let amount = input
        .amount
        .or(bill.amount)
        .ok_or_else(|| AppError::invalid("amount", "required for a card"))?;
    let entry = transactions::domain::check(CreateTransaction {
        date: input.date,
        amount,
        kind: CategoryKind::Bill,
        category_id: bill.category_id,
        note: None,
        repeat_months: None,
        installments: None,
        card_id: None,
    })?;
    if month.is_some_and(|first| !(first..=month_end(first)).contains(&entry.date)) {
        return Err(AppError::invalid("date", "must be in the month"));
    }
    transactions::service::check_opening(&mut conn, user, entry.date).await?;
    let transaction_id =
        transactions::repo::insert(&mut conn, user.id, &entry, Some(bill.id), None, None)
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
    // D28: a card is created from Contas fixas only.
    if let Some(index) = bills.iter().position(|bill| bill.closing_day.is_some()) {
        return Err(AppError::invalid(
            &format!("bills[{index}].closing_day"),
            "a card is added from Contas fixas",
        ));
    }
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
