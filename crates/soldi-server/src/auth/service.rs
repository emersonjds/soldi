use chrono::{Duration, Utc};
use soldi_types::auth::{ChangePassword, SignIn, SignUp, UpdateMe, User};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

/// Creates the user and signs them in; returns the user and the session token.
pub async fn sign_up(pool: &PgPool, input: SignUp) -> Result<(User, String), AppError> {
    let email = domain::normalize_email(&input.email)?;
    let name = domain::display_name(input.name.as_deref(), &email)?;
    domain::check_password(&input.password)?;
    let password_hash = hash_in_background(input.password).await?;
    let mut tx = pool.begin().await?;
    let user = repo::insert_user(&mut tx, &email, &name, &password_hash)
        .await
        .map_err(|error| match AppError::from(error) {
            AppError::Conflict { .. } => {
                AppError::conflict("email-taken", "An account with this email already exists.")
            }
            other => other,
        })?;
    crate::settings::repo::insert_defaults(&mut tx, user.id).await?;
    crate::categories::repo::seed(&mut tx, user.id, &crate::categories::domain::defaults()).await?;
    let session = start_session(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok((user, session))
}

/// Unknown e-mail and wrong password give the same error after the same argon2 work.
pub async fn sign_in(pool: &PgPool, input: SignIn) -> Result<(User, String), AppError> {
    let email = input.email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let found = repo::find_user_by_email(&mut conn, &email).await?;
    let stored_hash = found
        .as_ref()
        .and_then(|found| found.password_hash.clone())
        .unwrap_or_else(domain::dummy_password_hash);
    let password_matches = verify_in_background(input.password, stored_hash).await?;
    let Some(found) = found.filter(|_| password_matches) else {
        return Err(AppError::InvalidCredentials);
    };
    repo::delete_expired_sessions(&mut conn, found.user.id).await?;
    let session = start_session(&mut conn, found.user.id).await?;
    Ok((found.user, session))
}

/// Revokes the session that made the request; other devices stay signed in.
pub async fn sign_out(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete_session(&mut conn, user).await?;
    Ok(())
}

/// Revokes every session of the user, this one included.
pub async fn sign_out_everywhere(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::delete_all_sessions(&mut conn, user.id).await?)
}

pub async fn update_me(
    pool: &PgPool,
    user: &CurrentUser,
    input: UpdateMe,
) -> Result<User, AppError> {
    let name = domain::check_name(&input.name)?;
    let mut conn = pool.acquire().await?;
    Ok(repo::update_name(&mut conn, user.id, &name).await?)
}

/// Other devices are signed out; the session that made the request stays.
pub async fn change_password(
    pool: &PgPool,
    user: &CurrentUser,
    input: ChangePassword,
) -> Result<(), AppError> {
    domain::check_password(&input.new_password)?;
    let stored_hash = {
        let mut conn = pool.acquire().await?;
        repo::find_password_hash(&mut conn, user.id).await?
    };
    let checked = stored_hash
        .clone()
        .unwrap_or_else(domain::dummy_password_hash);
    if !verify_in_background(input.current_password, checked).await? {
        return Err(domain::wrong_password());
    }
    let password_hash = hash_in_background(input.new_password).await?;
    let mut tx = pool.begin().await?;
    if !repo::update_password_hash(&mut tx, user.id, stored_hash.as_deref(), &password_hash).await?
    {
        return Err(domain::wrong_password());
    }
    repo::delete_other_sessions(&mut tx, user).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn me(pool: &PgPool, user: &CurrentUser) -> Result<User, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_user(&mut conn, user.id).await?)
}

pub async fn mark_tour_seen(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::mark_tour_seen(&mut conn, user.id).await?)
}

async fn start_session(conn: &mut PgConnection, user_id: Uuid) -> Result<String, AppError> {
    let token = domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::SESSION_DAYS);
    repo::insert_session(conn, user_id, &domain::hash_token(&token), expires_at).await?;
    Ok(token)
}

/// argon2 takes tens of milliseconds of CPU; keep it off the async workers.
async fn hash_in_background(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || domain::hash_password(&password))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
}

async fn verify_in_background(password: String, stored_hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || domain::verify_password(&password, &stored_hash))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}
