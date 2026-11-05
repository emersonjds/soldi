use axum::extract::{FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde::de::DeserializeOwned;

use crate::AppState;
use crate::auth::{domain, repo};
use crate::error::{AppError, wrong_shape};

/// JSON request body; a malformed body answers with problem+json.
pub struct JsonBody<T>(pub T);

/// Parsed to a `Value` first: serde_json reports some wrong types (`{"kind": 5}` for an enum)
/// as syntax errors when it reads the body straight into `T`.
impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for JsonBody<T> {
    type Rejection = AppError;

    async fn from_request(request: Request, state: &S) -> Result<Self, AppError> {
        let axum::Json(value) =
            axum::Json::<serde_json::Value>::from_request(request, state).await?;
        serde_path_to_error::deserialize(value)
            .map(JsonBody)
            .map_err(|error| wrong_shape(&error.to_string()))
    }
}

/// Path parameters; an unparsable segment answers with problem+json.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct PathParams<T>(pub T);

/// The signed-in caller, from the session cookie.
#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: uuid::Uuid,
    pub session_id: uuid::Uuid,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = domain::session_token(&parts.headers).ok_or(AppError::Unauthorized)?;
        let mut conn = state.pool.acquire().await?;
        let user = repo::find_by_token(&mut conn, &domain::hash_token(token)).await?;
        user.ok_or(AppError::Unauthorized)
    }
}

/// Middleware: answers 403 to cross-site browser writes before any handler runs.
pub async fn reject_cross_site_writes(request: Request, next: Next) -> Response {
    let authority = request
        .uri()
        .authority()
        .map(|authority| authority.as_str());
    if domain::is_cross_site_write(request.method(), request.headers(), authority) {
        return AppError::Forbidden.into_response();
    }
    next.run(request).await
}
