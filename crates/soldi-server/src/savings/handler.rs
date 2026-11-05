use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::savings::{Savings, SavingsYear, SetSavings};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_savings_year))
        .routes(routes!(set_savings))
}

#[derive(Deserialize)]
pub struct YearQuery {
    year: i32,
}

#[utoipa::path(get, path = "/api/savings", tag = "savings",
    params(("year" = i32, Query, description = "2000 to 2100", example = 2026)),
    responses(
        (status = 200, body = SavingsYear, description = "Twelve months of income and savings with the year totals and the goal"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `year`, or not a number"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`year` outside 2000..2100")))]
pub async fn get_savings_year(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<YearQuery>,
) -> Result<Json<SavingsYear>, AppError> {
    Ok(Json(service::year(&state.pool, &user, query.year).await?))
}

#[utoipa::path(put, path = "/api/savings/{year}/{month}", tag = "savings", request_body = SetSavings,
    params(
        ("year" = i32, Path, description = "2000 to 2100", example = 2026),
        ("month" = i32, Path, description = "1 to 12", example = 11)),
    responses(
        (status = 200, body = Savings, description = "The month's savings, created or replaced"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`year` or `month` is not a number"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Amount below zero or with more than two places, `year` outside 2000..2100, `month` outside 1..12, or a month before the opening date's month (`month-before-opening`)")))]
pub async fn set_savings(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams((year, month)): PathParams<(i32, i32)>,
    JsonBody(input): JsonBody<SetSavings>,
) -> Result<Json<Savings>, AppError> {
    Ok(Json(
        service::set(&state.pool, &user, year, month, input).await?,
    ))
}
