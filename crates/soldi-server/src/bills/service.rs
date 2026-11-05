use soldi_types::bills::{Bill, CreateBill};
use sqlx::{PgConnection, PgPool};

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

pub async fn list(pool: &PgPool, user: &CurrentUser) -> Result<Vec<Bill>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, user.id).await?)
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
