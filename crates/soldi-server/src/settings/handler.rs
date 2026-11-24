use axum::Json;
use axum::extract::State;
use soldi_types::Problem;
use soldi_types::settings::{DailyEstimateSuggestion, Settings, UpdateSettings};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_settings, update_settings))
        .routes(routes!(get_suggestion))
}

#[utoipa::path(get, path = "/api/settings/daily-estimate-suggestion", tag = "settings",
    responses(
        (status = 200, body = Option<DailyEstimateSuggestion>, description = "The last 3 complete months' cash Diário per day, from the opening date; null under 28 days of history, no cash Diário, or an amount that could not be saved"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn get_suggestion(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Option<DailyEstimateSuggestion>>, AppError> {
    Ok(Json(service::suggestion(&state.pool, &user).await?))
}

#[utoipa::path(get, path = "/api/settings", tag = "settings",
    responses(
        (status = 200, body = Settings),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn get_settings(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Settings>, AppError> {
    Ok(Json(service::get(&state.pool, &user).await?))
}

#[utoipa::path(patch, path = "/api/settings", tag = "settings", request_body = UpdateSettings,
    responses(
        (status = 200, body = Settings, description = "The settings after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Money with more than two places, tiers out of order (names the upper tier of the first pair), a daily_estimate outside 0.01..10000.00, daily_estimate_on true without a value, an unknown field")))]
pub async fn update_settings(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(patch): JsonBody<UpdateSettings>,
) -> Result<Json<Settings>, AppError> {
    Ok(Json(service::update(&state.pool, &user, patch).await?))
}
