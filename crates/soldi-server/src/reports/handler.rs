use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::reports::CategoryReport;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(category_report))
}

#[derive(Deserialize)]
pub struct MonthQuery {
    month: String,
}

#[utoipa::path(get, path = "/api/reports/categories", tag = "reports",
    params(("month" = String, Query, description = "The month, `YYYY-MM`", example = "2026-11")),
    responses(
        (status = 200, body = CategoryReport, description = "The month's outflow and income by category, each against the previous month"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `month`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM`")))]
pub async fn category_report(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<MonthQuery>,
) -> Result<Json<CategoryReport>, AppError> {
    Ok(Json(
        service::categories(&state.pool, &user, &query.month).await?,
    ))
}
