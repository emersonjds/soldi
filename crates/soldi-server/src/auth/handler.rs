use axum::Json;
use axum::extract::State;
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use soldi_types::Problem;
use soldi_types::auth::{SignIn, SignUp, User};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(sign_up))
        .routes(routes!(sign_in))
        .routes(routes!(sign_out))
        .routes(routes!(me))
        .routes(routes!(tour_seen))
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
    JsonBody(input): JsonBody<SignUp>,
) -> Result<impl IntoResponse, AppError> {
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
    JsonBody(input): JsonBody<SignIn>,
) -> Result<impl IntoResponse, AppError> {
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
