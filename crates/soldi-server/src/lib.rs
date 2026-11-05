pub mod auth;
pub mod bills;
pub mod categories;
pub mod error;
pub mod extract;
pub mod months;
pub mod onboarding;
pub mod settings;
pub mod transactions;
pub mod web;

use std::path::Path;
use std::time::Duration;

use axum::extract::State;
use axum::http::header::{
    REFERRER_POLICY, STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
};
use axum::http::{HeaderValue, StatusCode};
use axum::{Json, Router, middleware};
use soldi_types::{Health, Problem};
use sqlx::PgPool;
use tower_http::compression::CompressionLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

impl AppState {
    pub fn new(pool: PgPool) -> Self {
        AppState { pool }
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "soldi",
        description = "Personal-finance thermometer API. Authenticate with the `__Host-soldi_session` cookie (`soldi_session` over plain HTTP). Money is a decimal string. Errors are RFC 9457 `application/problem+json`."
    ),
    components(schemas(Problem))
)]
struct ApiDoc;

fn api() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health))
        .merge(auth::handler::router())
        .merge(settings::handler::router())
        .merge(categories::handler::router())
        .merge(bills::handler::router())
        .merge(transactions::handler::router())
        .merge(months::handler::router())
        .merge(onboarding::handler::router())
}

/// The API contract, built without a database; `web/openapi.json` is its committed snapshot.
pub fn openapi() -> utoipa::openapi::OpenApi {
    api().split_for_parts().1
}

/// `web_dir` holds the Next.js export; without an `index.html` there only the API answers.
pub fn app(state: AppState, web_dir: Option<&Path>) -> Router {
    let (router, api) = api().split_for_parts();
    let router = router
        .layer(TimeoutLayer::with_status_code(
            StatusCode::SERVICE_UNAVAILABLE,
            Duration::from_secs(30),
        ))
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", api));
    let router = match web_dir.filter(|dir| dir.join("index.html").is_file()) {
        Some(dir) => {
            let dir = dir.to_path_buf();
            router.fallback(move |request: axum::extract::Request| {
                let dir = dir.clone();
                async move { web::serve(&dir, request).await }
            })
        }
        None => router.fallback(not_found),
    };
    router
        .layer(middleware::from_fn(extract::reject_cross_site_writes))
        .layer(SetResponseHeaderLayer::if_not_present(
            X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        // Browsers ignore this header over plain HTTP (RFC 6797), so localhost is unaffected.
        .layer(SetResponseHeaderLayer::if_not_present(
            STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(CompressionLayer::new())
        .with_state(state)
}

#[utoipa::path(get, path = "/api/health", tag = "health", responses((status = 200, body = Health)))]
async fn health(State(state): State<AppState>) -> Result<Json<Health>, AppError> {
    sqlx::query_scalar!(r#"SELECT 1 AS "one!""#)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(Health {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }))
}

async fn not_found() -> AppError {
    AppError::NotFound
}
