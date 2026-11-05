use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use soldi_types::Problem;
use soldi_types::categories::{Category, CreateCategory, UpdateCategory};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_categories, create_category))
        .routes(routes!(update_category, archive_category))
}

#[utoipa::path(get, path = "/api/categories", tag = "categories",
    responses(
        (status = 200, body = Vec<Category>, description = "Active categories: income, bills, then daily; by name within a kind"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_categories(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<Category>>, AppError> {
    Ok(Json(service::list(&state.pool, &user).await?))
}

#[utoipa::path(post, path = "/api/categories", tag = "categories", request_body = CreateCategory,
    responses(
        (status = 201, body = Category),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "An active category of the same kind has this name"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_category(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateCategory>,
) -> Result<(StatusCode, Json<Category>), AppError> {
    let category = service::create(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(category)))
}

#[utoipa::path(patch, path = "/api/categories/{id}", tag = "categories", request_body = UpdateCategory,
    params(("id" = Uuid, Path, description = "Category id")),
    responses(
        (status = 200, body = Category, description = "The category after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 409, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn update_category(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
    JsonBody(input): JsonBody<UpdateCategory>,
) -> Result<Json<Category>, AppError> {
    Ok(Json(service::update(&state.pool, &user, id, input).await?))
}

#[utoipa::path(delete, path = "/api/categories/{id}", tag = "categories",
    params(("id" = Uuid, Path, description = "Category id")),
    responses(
        (status = 204, description = "Archived: it leaves the list, its entries keep it"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's")))]
pub async fn archive_category(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
) -> Result<StatusCode, AppError> {
    service::archive(&state.pool, &user, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
