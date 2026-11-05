use axum::Json;
use axum::extract::State;
use soldi_types::Problem;
use soldi_types::bills::Bill;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::CurrentUser;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(list_bills))
}

#[utoipa::path(get, path = "/api/bills", tag = "bills",
    responses(
        (status = 200, body = Vec<Bill>, description = "Active recurring bills by due day, then name"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_bills(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<Bill>>, AppError> {
    Ok(Json(service::list(&state.pool, &user).await?))
}
