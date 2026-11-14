mod common;

use axum::http::{Method, StatusCode, header};
use common::{TestApp, json_request};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn health_answers_ok_with_the_version(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/api/health").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({ "status": "ok", "version": env!("CARGO_PKG_VERSION") })
    );
}

#[sqlx::test]
async fn unknown_routes_are_problem_json_404(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app
        .send(json_request(Method::GET, "/api/nothing", None, None))
        .await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
}

#[sqlx::test]
async fn responses_carry_the_security_headers(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let pages = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
                 img-src 'self' data:; font-src 'self'; \
                 connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io; \
                 object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
    let json = "default-src 'none'; frame-ancestors 'none'";
    for (uri, policy) in [("/api/health", json), ("/api/docs/", pages)] {
        let response = app.send(json_request(Method::GET, uri, None, None)).await;

        let headers = response.headers();
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff", "{uri}");
        assert_eq!(headers[header::X_FRAME_OPTIONS], "DENY", "{uri}");
        assert_eq!(
            headers[header::REFERRER_POLICY],
            "strict-origin-when-cross-origin",
            "{uri}"
        );
        assert!(headers.contains_key(header::STRICT_TRANSPORT_SECURITY));
        assert_eq!(headers[header::CONTENT_SECURITY_POLICY], policy, "{uri}");
        assert_eq!(
            headers["permissions-policy"],
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
            "{uri}"
        );
    }
}

#[sqlx::test]
async fn the_contract_and_its_docs_are_served(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, spec) = app.get("/api/openapi.json").await;
    let docs = app
        .send(json_request(Method::GET, "/api/docs/", None, None))
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(spec["info"]["title"], "soldi");
    assert_eq!(docs.status(), StatusCode::OK);
}
