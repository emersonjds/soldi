use soldi_types::bills::{Bill, CreateBill, UpdateBill};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

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
