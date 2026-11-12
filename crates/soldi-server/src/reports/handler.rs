use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::reports::{CategoryReport, SavingsYear, YearReport};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(category_report))
        .routes(routes!(savings_year))
        .routes(routes!(year_report))
}

#[derive(Deserialize)]
pub struct MonthQuery {
    month: String,
}

#[utoipa::path(get, path = "/api/reports/categories", tag = "reports",
    params(("month" = String, Query, description = "The month, `YYYY-MM`", example = "2026-11")),
    responses(
        (status = 200, body = CategoryReport, description = "The month's outflow and income by category, each against the previous month; resgates are not income"),
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

#[derive(Deserialize)]
pub struct YearQuery {
    year: String,
}

#[utoipa::path(get, path = "/api/reports/savings", tag = "reports",
    params(("year" = String, Query, description = "The year, `YYYY` from 2000 to 2100", example = "2026")),
    responses(
        (status = 200, body = SavingsYear, description = "Each month's income and savings, as the month view, from the opening month to December, newest first; months after today's are a `forecast` of their entries, out of the totals; empty before the opening or after today's year"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `year`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`year` is not a year from 2000 to 2100")))]
pub async fn savings_year(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<YearQuery>,
) -> Result<Json<SavingsYear>, AppError> {
    Ok(Json(
        service::savings(&state.pool, &user, &query.year).await?,
    ))
}

#[utoipa::path(get, path = "/api/reports/year", tag = "reports",
    params(("year" = String, Query, description = "The year, `YYYY` from 2000 to 2100", example = "2026")),
    responses(
        (status = 200, body = YearReport, description = "The year's Entradas and Gastos by purchase date (D31), from the opening month or January to today's month or December; empty before the opening or after today's year"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `year`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`year` is not a year from 2000 to 2100")))]
pub async fn year_report(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<YearQuery>,
) -> Result<Json<YearReport>, AppError> {
    Ok(Json(service::year(&state.pool, &user, &query.year).await?))
}
