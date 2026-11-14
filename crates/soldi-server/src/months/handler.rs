use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use soldi_types::Problem;
use soldi_types::months::{CardFatura, Forecast, MonthView, UpdateMonthNote};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_month))
        .routes(routes!(get_fatura))
        .routes(routes!(get_forecast))
        .routes(routes!(put_month_note))
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

#[utoipa::path(get, path = "/api/months/{month}/faturas/{card_id}", tag = "months",
    params(
        ("month" = String, Path, description = "The fatura's due month, `YYYY-MM`", example = "2026-11"),
        ("card_id" = Uuid, Path, description = "One of the caller's cards (archived included)")),
    responses(
        (status = 200, body = CardFatura, description = "The card's fatura due that month: its spends, the D30a carry, its payments, and the next six months' committed totals"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`card_id` is not a UUID"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No card of the caller with that id"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM` from 2000 to 2100 (`validation`), or is before the opening date's month (`month-before-opening`)")))]
pub async fn get_fatura(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams((month, card_id)): PathParams<(String, Uuid)>,
) -> Result<Json<CardFatura>, AppError> {
    Ok(Json(
        service::fatura(&state.pool, &user, &month, card_id).await?,
    ))
}

#[utoipa::path(get, path = "/api/forecast", tag = "months",
    responses(
        (status = 200, body = Forecast, description = "Every day from today (the opening date, when later) to the end of the 11th month after today's, with every unpaid bill landed (D16, D17)"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn get_forecast(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Forecast>, AppError> {
    Ok(Json(service::forecast(&state.pool, &user).await?))
}

#[utoipa::path(put, path = "/api/months/{month}/note", tag = "months", request_body = UpdateMonthNote,
    params(("month" = String, Path, description = "The month, `YYYY-MM`", example = "2026-06")),
    responses(
        (status = 204, description = "The month's note is stored or replaced; a blank note deletes it"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM` from 2000 to 2100, or `note` has more than 140 characters (`validation`)")))]
pub async fn put_month_note(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(month): PathParams<String>,
    JsonBody(input): JsonBody<UpdateMonthNote>,
) -> Result<StatusCode, AppError> {
    service::set_note(&state.pool, &user, &month, input).await?;
    Ok(StatusCode::NO_CONTENT)
}
