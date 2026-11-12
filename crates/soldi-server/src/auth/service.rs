use chrono::{Duration, Utc};
use soldi_types::auth::{
    ChangePassword, ConfirmEmailVerification, ConfirmPasswordReset, DeleteAccount, SignIn, SignUp,
    UpdateMe, User,
};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::mail::Mailer;

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
    repo::delete_password_resets(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok(())
}

/// Deletes the user and, by cascade, every row they own.
pub async fn delete_account(
    pool: &PgPool,
    user: &CurrentUser,
    input: DeleteAccount,
) -> Result<(), AppError> {
    let stored_hash = {
        let mut conn = pool.acquire().await?;
        repo::find_password_hash(&mut conn, user.id).await?
    };
    let checked = stored_hash
        .clone()
        .unwrap_or_else(domain::dummy_password_hash);
    if !verify_in_background(input.password, checked).await? {
        return Err(domain::wrong_password());
    }
    let mut conn = pool.acquire().await?;
    if !repo::delete_user(&mut conn, user.id, stored_hash.as_deref()).await? {
        return Err(domain::wrong_password());
    }
    Ok(())
}

/// Runs after the request was answered: an unknown or malformed e-mail does nothing.
pub async fn request_password_reset(
    pool: &PgPool,
    mailer: &Mailer,
    public_url: &str,
    email: &str,
) -> Result<(), AppError> {
    let Ok(email) = domain::normalize_email(email) else {
        return Ok(());
    };
    let mut tx = pool.begin().await?;
    let Some(found) = repo::find_user_by_email(&mut tx, &email).await? else {
        return Ok(());
    };
    let token = domain::new_reset_token();
    repo::lock_password_resets(&mut tx, found.user.id).await?;
    repo::delete_password_resets(&mut tx, found.user.id).await?;
    repo::insert_password_reset(&mut tx, found.user.id, &domain::hash_token(&token)).await?;
    tx.commit().await?;
    let link = format!("{public_url}/redefinir-senha#token={token}");
    mailer
        .send_password_reset(&found.user.email, &found.user.name, &link)
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}

/// Sets the password and ends every session and every pending link of the user.
pub async fn confirm_password_reset(
    pool: &PgPool,
    input: ConfirmPasswordReset,
) -> Result<(), AppError> {
    domain::check_password(&input.new_password)?;
    let token_hash = domain::hash_token(&input.token);
    let live = {
        let mut conn = pool.acquire().await?;
        repo::password_reset_is_live(&mut conn, &token_hash).await?
    };
    if !live {
        return Err(domain::invalid_reset_link());
    }
    let password_hash = hash_in_background(input.new_password).await?;
    let mut tx = pool.begin().await?;
    let Some(user_id) = repo::take_password_reset(&mut tx, &token_hash).await? else {
        return Err(domain::invalid_reset_link());
    };
    repo::set_password_hash(&mut tx, user_id, &password_hash).await?;
    repo::mark_email_verified(&mut tx, user_id).await?;
    repo::delete_all_sessions(&mut tx, user_id).await?;
    repo::delete_password_resets(&mut tx, user_id).await?;
    tx.commit().await?;
    Ok(())
}

/// Runs before the request is answered, so an already verified e-mail gets the 422.
pub async fn check_unverified(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    if repo::email_verified(&mut conn, user.id).await? {
        return Err(domain::email_already_verified());
    }
    Ok(())
}

/// Runs after the request was answered: voids the user's older links and mails a new one.
pub async fn request_email_verification(
    pool: &PgPool,
    mailer: &Mailer,
    public_url: &str,
    user: &CurrentUser,
) -> Result<(), AppError> {
    let token = domain::new_reset_token();
    let mut tx = pool.begin().await?;
    repo::lock_email_verifications(&mut tx, user.id).await?;
    repo::delete_email_verifications(&mut tx, user.id).await?;
    repo::insert_email_verification(&mut tx, user.id, &domain::hash_token(&token)).await?;
    let found = repo::find_user(&mut tx, user.id).await?;
    tx.commit().await?;
    let link = format!("{public_url}/verificar-email#token={token}");
    mailer
        .send_email_verification(&found.email, &found.name, &link)
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}

/// Verifies the owner of the link; signs nobody in and ends no session.
pub async fn confirm_email_verification(
    pool: &PgPool,
    input: ConfirmEmailVerification,
) -> Result<(), AppError> {
    let token_hash = domain::hash_token(&input.token);
    let mut tx = pool.begin().await?;
    let Some(user_id) = repo::take_email_verification(&mut tx, &token_hash).await? else {
        return Err(domain::invalid_verification_link());
    };
    repo::mark_email_verified(&mut tx, user_id).await?;
    repo::delete_email_verifications(&mut tx, user_id).await?;
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
