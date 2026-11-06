use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::transactions::{
    CreateTransaction, DeletedTransactions, Scope, Transaction, TransactionCount, UpdateTransaction,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(
            list_transactions,
            create_transaction,
            delete_transactions
        ))
        .routes(routes!(count_transactions))
        .routes(routes!(update_transaction, delete_transaction))
}

#[derive(Deserialize)]
pub struct ListQuery {
    month: String,
    category_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct PeriodQuery {
    period: String,
}

#[derive(Deserialize)]
pub struct ScopeQuery {
    #[serde(default)]
    scope: Scope,
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

#[utoipa::path(get, path = "/api/transactions/count", tag = "transactions",
    params(
        ("period" = String, Query, description = "`YYYY-MM` or `YYYY` (years 2000 to 2100), or `all`", example = "2026-11")),
    responses(
        (status = 200, body = TransactionCount, description = "The caller's entries dated in the period, bill payments and resgates included"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `period`, or not `YYYY-MM`, `YYYY` or `all`"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn count_transactions(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<PeriodQuery>,
) -> Result<Json<TransactionCount>, AppError> {
    let count = service::count(&state.pool, &user, &query.period).await?;
    Ok(Json(TransactionCount { count }))
}

#[utoipa::path(delete, path = "/api/transactions", tag = "transactions",
    params(
        ("period" = String, Query, description = "`YYYY-MM` or `YYYY` (years 2000 to 2100), or `all`", example = "2026-11")),
    responses(
        (status = 200, body = DeletedTransactions, description = "Deleted the caller's entries dated in the period, bill payments and resgates included; nothing else changes"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "No `period`, or not `YYYY-MM`, `YYYY` or `all`"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn delete_transactions(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<PeriodQuery>,
) -> Result<Json<DeletedTransactions>, AppError> {
    let deleted = service::delete_period(&state.pool, &user, &query.period).await?;
    Ok(Json(DeletedTransactions { deleted }))
}

#[utoipa::path(post, path = "/api/transactions", tag = "transactions", request_body = CreateTransaction,
    responses(
        (status = 201, body = Transaction, description = "The entry; with `repeat_months`, the first of its series, the copies written in the same database transaction"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Amount not above zero or with more than two places, note over 500 characters, a kind other than the category's (`category_id`), `repeat_months` not 2 to 60, or a date before the opening date (`before-opening-date`)")))]
pub async fn create_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateTransaction>,
) -> Result<(StatusCode, Json<Transaction>), AppError> {
    let transaction = service::create(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(transaction)))
}

#[utoipa::path(patch, path = "/api/transactions/{id}", tag = "transactions", request_body = UpdateTransaction,
    params(
        ("id" = Uuid, Path, description = "Transaction id"),
        ("scope" = Option<Scope>, Query, description = "`following` also writes the amount, kind, category and note onto the series' later members; the date never spreads")),
    responses(
        (status = 200, body = Transaction, description = "The entry after the change; absent fields stay as they are"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`scope` is not `this` or `following`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The entry is missing or another user's, or the new category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Same rules as create, on the entry after the change, `before-opening-date` included; with `repeat_months`, `already-repeated` on a series member, `repeat-not-allowed-on-bill-payment` or `repeat-not-allowed-on-cofrinho-withdrawal`")))]
pub async fn update_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    QueryParams(query): QueryParams<ScopeQuery>,
    JsonBody(patch): JsonBody<UpdateTransaction>,
) -> Result<Json<Transaction>, AppError> {
    Ok(Json(
        service::update(&state.pool, &user, id, query.scope, patch).await?,
    ))
}

#[utoipa::path(delete, path = "/api/transactions/{id}", tag = "transactions",
    params(
        ("id" = Uuid, Path, description = "Transaction id"),
        ("scope" = Option<Scope>, Query, description = "`following` also deletes the series' members dated after this one")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`scope` is not `this` or `following`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing or another user's")))]
pub async fn delete_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    QueryParams(query): QueryParams<ScopeQuery>,
) -> Result<StatusCode, AppError> {
    service::delete(&state.pool, &user, id, query.scope).await?;
    Ok(StatusCode::NO_CONTENT)
}
