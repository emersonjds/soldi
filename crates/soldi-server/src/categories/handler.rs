use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::categories::{Category, CategoryPins, CreateCategory, UpdateCategory};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_categories, create_category))
        .routes(routes!(category_pins, set_category_pins))
        .routes(routes!(update_category, archive_category))
}

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    include_system: bool,
}

#[utoipa::path(get, path = "/api/categories", tag = "categories",
    params(("include_system" = Option<bool>, Query, description = "Also list `Resgate`, the income category of withdrawals from a cofrinho")),
    responses(
        (status = 200, body = Vec<Category>, description = "Active categories, flat: income, bills, then daily; within a kind by parent name, each parent followed by its subcategories by name; a subcategory of another kind than its parent sits in its own kind's section"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`include_system` is not a boolean"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_categories(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<ListQuery>,
) -> Result<Json<Vec<Category>>, AppError> {
    Ok(Json(
        service::list(&state.pool, &user, query.include_system).await?,
    ))
}

#[utoipa::path(post, path = "/api/categories", tag = "categories", request_body = CreateCategory,
    responses(
        (status = 201, body = Category),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "`parent_id` is missing, archived or another user's"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "An active category of the same kind has this name"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "A bad field, a parent on the other side (income vs outflow) or a non-bill under `Economia`, `nested-subcategory` when the parent is a subcategory, `savings-category` under `Resgate`, `not-a-cofrinho` for a target or deadline outside `Economia`, `color-taken` when the color is taken in any kind the group shows in, or `palette-full` when no color is given and all 24 are taken in the kind")))]
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
        (status = 200, body = Category, description = "The category after the change; absent fields stay as they are; a new `kind` moves this category and its own entries; its subcategories keep theirs"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "The category or `parent_id` is missing, archived or another user's"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "An active category of the same kind has this name; `duplicate-name` when the new `kind` already holds this category's name"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "A bad field, `kind-locked` for a `kind` on `Economia`, a cofrinho, `Resgate` or an income category or a `kind` of `income`, `category-has-bills` when moving to `daily` a category an unarchived conta fixa (active or paused) uses, `category-has-card-entries` when moving to `bill` a category with entries on a card, a parent on the other side (income vs outflow) or a non-bill under `Economia` or itself, `nested-subcategory` when the parent is a subcategory or this category has subcategories, `savings-category` when moving `Economia` or `Resgate` or under `Resgate`, `not-a-cofrinho` for a target or deadline outside `Economia`, `color-taken` when the color is taken in any kind the group shows in, or `palette-full` when moving to top-level without a color, or changing a top-level's `kind`, and all 24 are taken in the kind")))]
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
        (status = 204, description = "Archived with its subcategories: they leave the list, their entries keep them"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`savings-category` for `Economia` or `Resgate`, `cofrinho-not-empty` for a cofrinho holding money")))]
pub async fn archive_category(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<Uuid>,
) -> Result<StatusCode, AppError> {
    service::archive(&state.pool, &user, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/api/categories/pins", tag = "categories",
    responses(
        (status = 200, body = CategoryPins, description = "The caller's active top-level categories with a pin, in pinned order; an archived or re-parented one leaves the list"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn category_pins(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<CategoryPins>, AppError> {
    Ok(Json(service::pins(&state.pool, &user).await?))
}

#[utoipa::path(put, path = "/api/categories/pins", tag = "categories", request_body = CategoryPins,
    responses(
        (status = 200, body = CategoryPins, description = "The new pinned order, replacing the whole previous one; `[]` clears it"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`category_ids` has more than 24 ids, repeats one, or lists one that is not the caller's active top-level category or is `Resgate`; nothing changes")))]
pub async fn set_category_pins(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CategoryPins>,
) -> Result<Json<CategoryPins>, AppError> {
    Ok(Json(service::set_pins(&state.pool, &user, input).await?))
}
