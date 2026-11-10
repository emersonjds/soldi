use axum::Json;
use axum::extract::State;
use soldi_types::Problem;
use soldi_types::months::MonthView;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get_month))
}

#[utoipa::path(get, path = "/api/months/{month}", tag = "months",
    params(("month" = String, Path, description = "The month, `YYYY-MM`", example = "2026-11")),
    responses(
        (status = 200, body = MonthView, description = "Every calendar day with its balance and tier, carried from the opening balance"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM` from 2000 to 2100 (`validation`), or is before the opening date's month (`month-before-opening`)")))]
pub async fn get_month(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(month): PathParams<String>,
) -> Result<Json<MonthView>, AppError> {
    Ok(Json(service::get(&state.pool, &user, &month).await?))
}
