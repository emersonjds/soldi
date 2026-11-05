use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::transactions::{CreateTransaction, Transaction, UpdateTransaction};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_transactions, create_transaction))
        .routes(routes!(update_transaction, delete_transaction))
}

#[derive(Deserialize)]
pub struct ListQuery {
    month: String,
    category_id: Option<Uuid>,
}

#[utoipa::path(get, path = "/api/transactions", tag = "transactions",
    params(
        ("month" = String, Query, description = "The month, `YYYY-MM`", example = "2026-11"),
        ("category_id" = Option<Uuid>, Query, description = "Only this category's entries; another user's category lists nothing")),
    responses(
        (status = 200, body = Vec<Transaction>, description = "The month's entries: newest date first, then newest entry first"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `month`, or `category_id` is not a UUID"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`month` is not `YYYY-MM`")))]
pub async fn list_transactions(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<ListQuery>,
) -> Result<Json<Vec<Transaction>>, AppError> {
    Ok(Json(
        service::list(&state.pool, &user, &query.month, query.category_id).await?,
    ))
}

#[utoipa::path(post, path = "/api/transactions", tag = "transactions", request_body = CreateTransaction,
    responses(
        (status = 201, body = Transaction),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Amount not above zero or with more than two places, note over 500 characters, a kind other than the category's (`category_id`), or a date before the opening date (`before-opening-date`)")))]
pub async fn create_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateTransaction>,
) -> Result<(StatusCode, Json<Transaction>), AppError> {
    let transaction = service::create(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(transaction)))
}

#[utoipa::path(patch, path = "/api/transactions/{id}", tag = "transactions", request_body = UpdateTransaction,
    params(("id" = Uuid, Path, description = "Transaction id")),
    responses(
        (status = 200, body = Transaction, description = "The entry after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The entry is missing or another user's, or the new category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Same rules as create, on the entry after the change, `before-opening-date` included")))]
pub async fn update_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    JsonBody(patch): JsonBody<UpdateTransaction>,
) -> Result<Json<Transaction>, AppError> {
    Ok(Json(service::update(&state.pool, &user, id, patch).await?))
}

#[utoipa::path(delete, path = "/api/transactions/{id}", tag = "transactions",
    params(("id" = Uuid, Path, description = "Transaction id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing or another user's")))]
pub async fn delete_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
) -> Result<StatusCode, AppError> {
    service::delete(&state.pool, &user, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
