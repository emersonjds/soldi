use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::bills::{Bill, CreateBill, PayBill, UpdateBill};
use soldi_types::transactions::Transaction;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_bills, create_bill))
        .routes(routes!(update_bill, archive_bill))
        .routes(routes!(pay_bill, unpay_bill))
}

#[derive(Deserialize)]
pub struct PayQuery {
    month: Option<String>,
}

#[derive(Deserialize)]
pub struct MonthQuery {
    month: String,
}

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    include_inactive: bool,
}

#[utoipa::path(get, path = "/api/bills", tag = "bills",
    params(("include_inactive" = Option<bool>, Query, description = "Also list bills with `active: false`")),
    responses(
        (status = 200, body = Vec<Bill>, description = "Unarchived recurring bills by due day, then name"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`include_inactive` is not a boolean"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_bills(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<ListQuery>,
) -> Result<Json<Vec<Bill>>, AppError> {
    Ok(Json(
        service::list(&state.pool, &user, query.include_inactive).await?,
    ))
}

#[derive(Deserialize)]
pub struct CreateQuery {
    transaction_id: Option<Uuid>,
}

#[utoipa::path(post, path = "/api/bills", tag = "bills", request_body = CreateBill,
    params(("transaction_id" = Option<Uuid>, Query, description = "A `bill` entry outside any series that becomes this bill's payment, moved to its category")),
    responses(
        (status = 201, body = Bill),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`transaction_id` is not a UUID"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The `transaction_id` entry is missing or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Name not 1 to 100 characters, amount not above zero or with more than two places, missing on a conta fixa or present on a card (`amount`), `closing_day` not 1 to 31, due day not 1 to 31, `category_id` not one of the caller's active bill categories or, on a card, `Economia` or a cofrinho, or `cannot-become-bill` when the entry is not a `bill` entry, already a bill's payment, a resgate or a series member")))]
pub async fn create_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<CreateQuery>,
    JsonBody(input): JsonBody<CreateBill>,
) -> Result<(StatusCode, Json<Bill>), AppError> {
    let bill = service::create(&state.pool, &user, input, query.transaction_id).await?;
    Ok((StatusCode::CREATED, Json(bill)))
}

#[utoipa::path(patch, path = "/api/bills/{id}", tag = "bills", request_body = UpdateBill,
    params(("id" = Uuid, Path, description = "Bill id")),
    responses(
        (status = 200, body = Bill, description = "The bill after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Same rules as create, on the bill after the change; `closing_day` on a conta fixa, `active: false` on a card, `active` on a parcelado bill; `fatura-paid` when a card's `closing_day` changes while a fatura from this month on is paid (D30b)")))]
pub async fn update_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    JsonBody(patch): JsonBody<UpdateBill>,
) -> Result<Json<Bill>, AppError> {
    Ok(Json(service::update(&state.pool, &user, id, patch).await?))
}

#[utoipa::path(delete, path = "/api/bills/{id}", tag = "bills",
    params(("id" = Uuid, Path, description = "Bill id")),
    responses(
        (status = 204, description = "Archived: out of every list and month; its payments stay"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, already archived or another user's")))]
pub async fn archive_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
) -> Result<StatusCode, AppError> {
    service::archive(&state.pool, &user, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/bills/{id}/pay", tag = "bills", request_body = PayBill,
    params(
        ("id" = Uuid, Path, description = "Bill id"),
        ("month" = Option<String>, Query, description = "The month being paid, `YYYY-MM`; `date` must fall in it", example = "2026-11")),
    responses(
        (status = 201, body = Transaction, description = "The `bill` entry, linked by `recurring_bill_id`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived (a card stays payable) or another user's"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Already paid in the date's month (`bill-already-paid`)"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`date` outside `month`, `month` not `YYYY-MM`, `amount` missing on a card, amount not above zero or with more than two places, or a date before the opening date (`before-opening-date`); `bill-ended` for a month after the bill's `last_month`")))]
pub async fn pay_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    QueryParams(query): QueryParams<PayQuery>,
    JsonBody(input): JsonBody<PayBill>,
) -> Result<(StatusCode, Json<Transaction>), AppError> {
    let paid = service::pay(&state.pool, &user, id, query.month.as_deref(), input).await?;
    Ok((StatusCode::CREATED, Json(paid)))
}

#[utoipa::path(delete, path = "/api/bills/{id}/pay", tag = "bills",
    params(
        ("id" = Uuid, Path, description = "Bill id"),
        ("month" = String, Query, description = "The month, `YYYY-MM`", example = "2026-11")),
    responses(
        (status = 204, description = "The month's payment entry is deleted"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `month`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Not paid that month, or another user's bill"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM`")))]
pub async fn unpay_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    QueryParams(query): QueryParams<MonthQuery>,
) -> Result<StatusCode, AppError> {
    service::unpay(&state.pool, &user, id, &query.month).await?;
    Ok(StatusCode::NO_CONTENT)
}
