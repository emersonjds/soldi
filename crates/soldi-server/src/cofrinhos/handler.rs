use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use soldi_types::Problem;
use soldi_types::cofrinhos::{Cofrinhos, Withdraw};
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
        .routes(routes!(list_cofrinhos))
        .routes(routes!(withdraw))
        .routes(routes!(list_movements))
}

#[utoipa::path(get, path = "/api/cofrinhos", tag = "cofrinhos",
    responses(
        (status = 200, body = Cofrinhos, description = "Every cofrinho with its balance and goal; this month in São Paulo"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_cofrinhos(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Cofrinhos>, AppError> {
    Ok(Json(service::list(&state.pool, &user).await?))
}

#[utoipa::path(post, path = "/api/cofrinhos/{category_id}/withdraw", tag = "cofrinhos", request_body = Withdraw,
    params(("category_id" = Uuid, Path, description = "`Economia` or one of its subcategories")),
    responses(
        (status = 201, body = Transaction, description = "The resgate: an income entry in `Resgate` with `cofrinho_id`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "A bad field, `insufficient-cofrinho` above the balance, `before-opening-date`, or `not-a-cofrinho`")))]
pub async fn withdraw(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(category_id): PathParams<Uuid>,
    JsonBody(input): JsonBody<Withdraw>,
) -> Result<(StatusCode, Json<Transaction>), AppError> {
    let resgate = service::withdraw(&state.pool, &user, category_id, input).await?;
    Ok((StatusCode::CREATED, Json(resgate)))
}

#[derive(Deserialize)]
pub struct MovementsQuery {
    #[serde(default = "fifty")]
    limit: i64,
}

fn fifty() -> i64 {
    50
}

#[utoipa::path(get, path = "/api/cofrinhos/{category_id}/movements", tag = "cofrinhos",
    params(
        ("category_id" = Uuid, Path, description = "`Economia` or one of its subcategories"),
        ("limit" = Option<i64>, Query, description = "1 to 200; 50 when absent", minimum = 1, maximum = 200)),
    responses(
        (status = 200, body = Vec<Transaction>, description = "Its entries and resgates, newest date first, then newest entry first"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`limit` is not a number"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Missing, archived or another user's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`limit` out of range, or `not-a-cofrinho`")))]
pub async fn list_movements(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(category_id): PathParams<Uuid>,
    QueryParams(query): QueryParams<MovementsQuery>,
) -> Result<Json<Vec<Transaction>>, AppError> {
    Ok(Json(
        service::movements(&state.pool, &user, category_id, query.limit).await?,
    ))
}
