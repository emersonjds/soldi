use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::bills::{Bill, CreateBill, UpdateBill};
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

#[utoipa::path(post, path = "/api/bills", tag = "bills", request_body = CreateBill,
    responses(
        (status = 201, body = Bill),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Name not 1 to 100 characters, amount not above zero or with more than two places, due day not 1 to 31, or `category_id` not one of the caller's active bill categories")))]
pub async fn create_bill(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateBill>,
) -> Result<(StatusCode, Json<Bill>), AppError> {
    let bill = service::create(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(bill)))
}

#[utoipa::path(patch, path = "/api/bills/{id}", tag = "bills", request_body = UpdateBill,
    params(("id" = Uuid, Path, description = "Bill id")),
    responses(
        (status = 200, body = Bill, description = "The bill after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Same rules as create, on the bill after the change")))]
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
