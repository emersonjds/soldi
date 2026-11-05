use soldi_types::auth::User;
use soldi_types::onboarding::Onboarding;
use soldi_types::settings::UpdateSettings;
use sqlx::PgPool;

use super::repo;
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{bills, settings};

/// Opening balance, first bills and `onboarded_at`, all or nothing.
pub async fn complete(
    pool: &PgPool,
    user: &CurrentUser,
    input: Onboarding,
) -> Result<User, AppError> {
    if input.bills.len() > 50 {
        return Err(AppError::invalid("bills", "must have at most 50 bills"));
    }
    let mut tx = pool.begin().await?;
    let onboarded = repo::mark_onboarded(&mut tx, user.id)
        .await?
        .ok_or_else(|| AppError::conflict("already-onboarded", "Onboarding is already done."))?;
    let patch = UpdateSettings {
        opening_balance: Some(input.opening_balance),
        opening_date: Some(input.opening_date),
        currency: input.currency,
        ..UpdateSettings::default()
    };
    let next = settings::domain::apply(settings::repo::find(&mut tx, user.id).await?, patch)?;
    settings::repo::update(&mut tx, user.id, &next).await?;
    bills::service::insert_all(&mut tx, user, input.bills).await?;
    tx.commit().await?;
    Ok(onboarded)
}
