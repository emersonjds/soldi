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
        (status = 201, body = Transaction, description = "The entry; with `repeat_months` or `installments`, the first of its series (parcela `first_installment`, 1 when absent), the rest written in the same database transaction; with `open_ended`, the members through the forecast horizon (or the entry's month, when later), more as months are read (D36)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Amount not above zero or with more than two places, note over 500 characters, `card_id` on a non-`daily` entry or not one of the caller's unarchived cards, a kind other than the category's (`category_id`), `repeat_months` not 2 to 60, `installments` not 2 to 60, with `repeat_months`, or leaving a parcela at zero, `first_installment` without `installments` (`needs installments`) or outside 1 to `installments`, `open_ended` with `repeat_months` or `installments` or on a `bill` entry, `repeat_every` without `repeat_months` or `open_ended` (`needs repeat_months`) or other than `month` with `installments` (`installments are monthly`), a date outside 2000 to 2100 or a series passing 2100 (`must keep every entry up to 2100`), a date before the opening date (`before-opening-date`), or `fatura-paid` when a spend on a card lands in an already paid fatura (D30b)")))]
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
        ("scope" = Option<Scope>, Query, description = "`following` also writes the amount, kind, category and note onto the series' later members, the card only when the change sets a new card or kind (each member keeps its own otherwise), and a new day onto this and every later member, each in its own period; the period never spreads. `all` does the same for every member, earlier ones included (D33)")),
    responses(
        (status = 200, body = Transaction, description = "The entry after the change, with the series' new total; absent fields stay as they are. `open_ended: true` opens the series (a standalone entry becomes its first member), grown on the next read; `open_ended: false` on an open member deletes the members after it and closes the series (D36); on a card, each grown member lands in the fatura of its own date and a series on an archived card stops growing (D28)"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`scope` is not `this`, `following` or `all`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The entry is missing or another user's, or the new category is missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Same rules as create, on the entry after the change, `before-opening-date` included (an archived card it already carries stays allowed); with `repeat_months` or `open_ended`, `repeat-not-allowed-on-bill-payment` or `repeat-not-allowed-on-cofrinho-withdrawal` on an entry outside a series, `validation` on `repeat_months` outside 2..60, below this member's position or on a member of an open series (`an open series has no length; stop it instead`), on `date` when the series would pass 2100 (`must keep every entry up to 2100`); `validation` on `repeat_every` when it differs from a member's series step (`a series keeps its step`) or comes without `repeat_months` outside a series (`needs repeat_months`); with `following` or `all` on a series member, `before-opening-date` when the earliest moved member would land before the opening date, `validation` on `date` when the new date leaves this entry's month (`must stay in this entry's month when the series moves`), or on a weekly series its ISO week (`must stay in this entry's week when the series moves`), when two of the moved members share a month (`must not move a series with two entries in one month`) or a week (`must not move a series with two entries in one week`), or when a moved member would pass 2100 (`must keep every entry up to 2100`); `archived-cofrinho` when the entry, or with `following` a later (with `all` any) series member, is a deposit into or a resgate from a deleted cofrinho; `fatura-paid` when the amount, date or card changes on this entry or, with `following` a later (with `all` any) member, and its fatura on its own card is paid, or the change lands it in a paid fatura of the card it ends on, or `open_ended: false` would delete a later member of a paid fatura (D30b); `validation` on `card_id` when `open_ended: true` meets an archived card; nothing is written")))]
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
        ("scope" = Option<Scope>, Query, description = "`following` also deletes the series' members dated after this one and closes an open series (D36); `all` deletes every member (D33)")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`scope` is not `this`, `following` or `all`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`archived-cofrinho`: the entry, or with `following` a later (with `all` any) series member, is a deposit into or a resgate from a deleted cofrinho; `fatura-paid`: the entry, or with `following` a later (with `all` any) series member, is a card spend of a paid fatura on its own card (D30b); nothing is deleted")))]
pub async fn delete_transaction(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    QueryParams(query): QueryParams<ScopeQuery>,
) -> Result<StatusCode, AppError> {
    service::delete(&state.pool, &user, id, query.scope).await?;
    Ok(StatusCode::NO_CONTENT)
}
