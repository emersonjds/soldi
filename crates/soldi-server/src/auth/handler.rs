use axum::Json;
use std::net::SocketAddr;

use axum::Extension;
use axum::extract::{ConnectInfo, State};
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use soldi_types::Problem;
use soldi_types::auth::{
    ChangePassword, ConfirmEmailVerification, ConfirmPasswordReset, DeleteAccount,
    RequestPasswordReset, SignIn, SignUp, UpdateMe, User,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody};
use crate::limits;

type Peer = Option<Extension<ConnectInfo<SocketAddr>>>;

fn client_ip(headers: &HeaderMap, peer: Peer) -> Option<String> {
    let peer = peer.map(|Extension(ConnectInfo(address))| address);
    limits::client_ip(headers, peer).map(|ip| ip.to_string())
}

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(sign_up))
        .routes(routes!(sign_in))
        .routes(routes!(sign_out))
        .routes(routes!(sign_out_everywhere))
        .routes(routes!(me))
        .routes(routes!(tour_seen))
        .routes(routes!(update_me, delete_me))
        .routes(routes!(change_password))
        .routes(routes!(request_password_reset))
        .routes(routes!(confirm_password_reset))
        .routes(routes!(request_email_verification))
        .routes(routes!(confirm_email_verification))
}

#[utoipa::path(post, path = "/api/auth/sign-up", tag = "auth", request_body = SignUp,
    responses(
        (status = 201, body = User, description = "Signed up and signed in; sets the session cookie. Settings and default categories are created"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`email-taken`"),
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn sign_up(
    State(state): State<AppState>,
    headers: HeaderMap,
    peer: Peer,
    JsonBody(input): JsonBody<SignUp>,
) -> Result<impl IntoResponse, AppError> {
    let ip = client_ip(&headers, peer);
    state.limiter.check(&[(limits::SIGN_UP_IP, ip)])?;
    let (user, session) = service::sign_up(&state.pool, input).await?;
    let cookie = domain::session_cookie(&session, domain::is_https(&headers));
    Ok((StatusCode::CREATED, [(SET_COOKIE, cookie)], Json(user)))
}

#[utoipa::path(post, path = "/api/auth/sign-in", tag = "auth", request_body = SignIn,
    responses(
        (status = 200, body = User, description = "Signed in; sets the session cookie"),
        (status = 401, body = Problem, content_type = "application/problem+json", description = "`invalid-credentials`, the same for an unknown email and a wrong password"),
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn sign_in(
    State(state): State<AppState>,
    headers: HeaderMap,
    peer: Peer,
    JsonBody(input): JsonBody<SignIn>,
) -> Result<impl IntoResponse, AppError> {
    let email = input.email.trim();
    if email.len() > domain::MAX_EMAIL_BYTES {
        return Err(AppError::invalid("email", "must be an email address"));
    }
    let email = email.to_lowercase();
    let ip = client_ip(&headers, peer);
    let email_ip = ip.as_ref().map(|ip| format!("{ip} {email}"));
    state.limiter.check(&[
        (limits::SIGN_IN_IP, ip),
        (limits::SIGN_IN_EMAIL_IP, email_ip),
        (limits::SIGN_IN_EMAIL, Some(email)),
    ])?;
    let (user, session) = service::sign_in(&state.pool, input).await?;
    let cookie = domain::session_cookie(&session, domain::is_https(&headers));
    Ok(([(SET_COOKIE, cookie)], Json(user)))
}

#[utoipa::path(post, path = "/api/auth/sign-out", tag = "auth",
    responses(
        (status = 204, description = "Session revoked; cookie cleared"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<impl IntoResponse, AppError> {
    service::sign_out(&state.pool, &user).await?;
    let cookie = domain::expired_session_cookie(domain::is_https(&headers));
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, cookie)]))
}

#[utoipa::path(post, path = "/api/auth/sign-out-everywhere", tag = "auth",
    responses(
        (status = 204, description = "Every session of the caller revoked, this one included; cookie cleared"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn sign_out_everywhere(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<impl IntoResponse, AppError> {
    service::sign_out_everywhere(&state.pool, &user).await?;
    let cookie = domain::expired_session_cookie(domain::is_https(&headers));
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, cookie)]))
}

#[utoipa::path(get, path = "/api/auth/me", tag = "auth",
    responses(
        (status = 200, body = User),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn me(State(state): State<AppState>, user: CurrentUser) -> Result<Json<User>, AppError> {
    Ok(Json(service::me(&state.pool, &user).await?))
}

#[utoipa::path(post, path = "/api/me/tour-seen", tag = "auth",
    responses(
        (status = 204, description = "`tour_seen` is true from now on; calling again changes nothing"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn tour_seen(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<StatusCode, AppError> {
    service::mark_tour_seen(&state.pool, &user).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(patch, path = "/api/me", tag = "auth", request_body = UpdateMe,
    responses(
        (status = 200, body = User, description = "Renamed"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`name` blank, over 60 characters or with NUL")))]
pub async fn update_me(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<UpdateMe>,
) -> Result<Json<User>, AppError> {
    Ok(Json(service::update_me(&state.pool, &user, input).await?))
}

#[utoipa::path(delete, path = "/api/me", tag = "auth", request_body = DeleteAccount,
    responses(
        (status = 204, description = "Account and every row of it deleted; cookie cleared. The e-mail can sign up again"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`wrong-password`; nothing deleted"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited with the password-change budget; wait `Retry-After` seconds")))]
pub async fn delete_me(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    JsonBody(input): JsonBody<DeleteAccount>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = Some(user.id.to_string());
    state
        .limiter
        .check(&[(limits::PASSWORD_CHANGE_USER, user_id)])?;
    service::delete_account(&state.pool, &user, input).await?;
    let cookie = domain::expired_session_cookie(domain::is_https(&headers));
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, cookie)]))
}

#[utoipa::path(post, path = "/api/me/password", tag = "auth", request_body = ChangePassword,
    responses(
        (status = 204, description = "Password changed; every other session of the caller is revoked, this one stays"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`wrong-password` for a wrong current password; field `password` when the new one has not 8 to 128 characters"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn change_password(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<ChangePassword>,
) -> Result<StatusCode, AppError> {
    let user_id = Some(user.id.to_string());
    state
        .limiter
        .check(&[(limits::PASSWORD_CHANGE_USER, user_id)])?;
    service::change_password(&state.pool, &user, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/auth/password-reset", tag = "auth", request_body = RequestPasswordReset,
    responses(
        (status = 202, description = "Accepted whether or not an account has this e-mail; when one has, a reset link valid for 1 hour is e-mailed to it and older links stop working"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Field `email` over 254 bytes"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn request_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    peer: Peer,
    JsonBody(input): JsonBody<RequestPasswordReset>,
) -> Result<StatusCode, AppError> {
    let email = input.email.trim();
    if email.len() > domain::MAX_EMAIL_BYTES {
        return Err(AppError::invalid("email", "must be an email address"));
    }
    let email = email.to_lowercase();
    let ip = client_ip(&headers, peer);
    state.limiter.check(&[
        (limits::PASSWORD_RESET_IP, ip),
        (limits::PASSWORD_RESET_EMAIL, Some(email.clone())),
    ])?;
    let mailer = state.mailer.clone();
    let task = tokio::spawn(async move {
        let sent =
            service::request_password_reset(&state.pool, &state.mailer, &state.public_url, &email);
        if let Err(error) = sent.await {
            tracing::warn!(?error, "password reset request failed");
        }
    });
    mailer.track(task);
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(post, path = "/api/auth/password-reset/confirm", tag = "auth", request_body = ConfirmPasswordReset,
    responses(
        (status = 204, description = "Password set; every session and every pending reset link of the user end"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`invalid-reset-link` for an unknown, expired or used token; field `password` when the new one has not 8 to 128 characters"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn confirm_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    peer: Peer,
    JsonBody(input): JsonBody<ConfirmPasswordReset>,
) -> Result<StatusCode, AppError> {
    let ip = client_ip(&headers, peer);
    state
        .limiter
        .check(&[(limits::PASSWORD_RESET_CONFIRM_IP, ip)])?;
    service::confirm_password_reset(&state.pool, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/me/email-verification", tag = "auth",
    responses(
        (status = 202, description = "A verification link valid for 24 hours is e-mailed to the caller; older links stop working"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`email-already-verified`; nothing is sent"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn request_email_verification(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<StatusCode, AppError> {
    let user_id = Some(user.id.to_string());
    state
        .limiter
        .check(&[(limits::EMAIL_VERIFY_USER, user_id)])?;
    service::check_unverified(&state.pool, &user).await?;
    let mailer = state.mailer.clone();
    let task = tokio::spawn(async move {
        let sent = service::request_email_verification(
            &state.pool,
            &state.mailer,
            &state.public_url,
            &user,
        );
        if let Err(error) = sent.await {
            tracing::warn!(?error, "email verification request failed");
        }
    });
    mailer.track(task);
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(post, path = "/api/auth/email-verification/confirm", tag = "auth", request_body = ConfirmEmailVerification,
    responses(
        (status = 204, description = "E-mail verified; every pending verification link of the user ends. Signs nobody in"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`invalid-verification-link` for an unknown, expired or used token"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited; wait `Retry-After` seconds")))]
pub async fn confirm_email_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
    peer: Peer,
    JsonBody(input): JsonBody<ConfirmEmailVerification>,
) -> Result<StatusCode, AppError> {
    let ip = client_ip(&headers, peer);
    state
        .limiter
        .check(&[(limits::EMAIL_VERIFY_CONFIRM_IP, ip)])?;
    service::confirm_email_verification(&state.pool, input).await?;
    Ok(StatusCode::NO_CONTENT)
}
