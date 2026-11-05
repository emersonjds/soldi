use axum::Json;
use axum::extract::State;
use soldi_types::Problem;
use soldi_types::auth::User;
use soldi_types::onboarding::Onboarding;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{CurrentUser, JsonBody};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(complete_onboarding))
}

#[utoipa::path(post, path = "/api/onboarding", tag = "onboarding", request_body = Onboarding,
    responses(
        (status = 200, body = User, description = "Opening balance saved, bills created, `onboarded` is true"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`already-onboarded`; nothing changes"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Fields named like `bills[0].amount`; nothing is saved")))]
pub async fn complete_onboarding(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<Onboarding>,
) -> Result<Json<User>, AppError> {
    Ok(Json(service::complete(&state.pool, &user, input).await?))
}
