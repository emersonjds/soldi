use std::path::{Path, PathBuf};

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

const INDEX: &str = "<!doctype html><title>soldi</title>";
const NOT_FOUND: &str = "<!doctype html><title>404</title>";

fn app(web_dir: Option<&Path>) -> Router {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    soldi_server::app(soldi_server::AppState::new(pool), web_dir)
}

/// A Next.js export: `<route>.html` per page, nested routes in a folder of the same name.
fn export(name: &str, with_404: bool) -> PathBuf {
    let root = std::env::temp_dir().join(format!("soldi-web-{name}-{}", std::process::id()));
    let dir = root.join("out");
    let files = [
        ("index.html", INDEX),
        ("mes.html", "mes"),
        ("ajustes.html", "ajustes"),
        ("ajustes/categorias.html", "categorias"),
        ("ajuda/index.html", "ajuda"),
        ("_next/static/chunks/app-abc123.js", "console.log('soldi')"),
    ];
    for (file, text) in files {
        let path = dir.join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }
    if with_404 {
        std::fs::write(dir.join("404.html"), NOT_FOUND).unwrap();
    }
    std::fs::write(root.join("secret.txt"), "secret").unwrap();
    dir
}

async fn send(app: &Router, method: Method, uri: &str) -> Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    app.clone().oneshot(request).await.unwrap()
}

async fn body(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8_lossy(&bytes).into_owned()
}

fn content_type(response: &Response) -> &str {
    response.headers()[header::CONTENT_TYPE].to_str().unwrap()
}

#[tokio::test]
async fn pages_resolve_like_a_static_host() {
    let app = app(Some(&export("pages", true)));

    for (uri, text) in [
        ("/", INDEX),
        ("/index.html", INDEX),
        ("/mes", "mes"),
        ("/mes/", "mes"),
        ("/mes?m=2026-11", "mes"),
        ("/ajustes", "ajustes"),
        ("/ajustes/categorias", "categorias"),
        ("/ajuda", "ajuda"),
        ("/_next/static/chunks/app-abc123.js", "console.log('soldi')"),
    ] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(body(response).await, text, "{uri}");
    }
    let script = send(&app, Method::GET, "/_next/static/chunks/app-abc123.js").await;
    assert!(content_type(&script).contains("javascript"));
    let head = send(&app, Method::HEAD, "/mes").await;
    assert_eq!(head.status(), StatusCode::OK);
}

#[tokio::test]
async fn client_routes_get_index_html() {
    let app = app(Some(&export("routes", true)));

    for uri in ["/lancar", "/para-onde-vai/2026-11", "/mes/extra/deep"] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(body(response).await, INDEX, "{uri}");
    }
}

#[tokio::test]
async fn a_missing_file_gets_404_html_or_a_problem() {
    let with_page = app(Some(&export("missing", true)));
    let without_page = app(Some(&export("bare", false)));

    let response = send(&with_page, Method::GET, "/_next/static/gone-123.js").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(body(response).await, NOT_FOUND);
    let response = send(&without_page, Method::GET, "/favicon.ico").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(content_type(&response), "application/problem+json");
}

#[tokio::test]
async fn the_api_and_other_methods_never_get_pages() {
    let app = app(Some(&export("api", true)));

    for (method, uri) in [
        (Method::GET, "/api"),
        (Method::GET, "/api/"),
        (Method::GET, "/api/nothing"),
        (Method::POST, "/mes"),
        (Method::DELETE, "/"),
    ] {
        let response = send(&app, method.clone(), uri).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{method} {uri}");
        assert_eq!(content_type(&response), "application/problem+json");
    }
}

#[tokio::test]
async fn files_outside_the_export_stay_hidden() {
    let app = app(Some(&export("traversal", true)));

    for uri in ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt"] {
        let response = send(&app, Method::GET, uri).await;
        assert_ne!(body(response).await, "secret", "{uri}");
    }
}

#[tokio::test]
async fn without_an_export_only_the_api_answers() {
    let empty = std::env::temp_dir().join(format!("soldi-web-empty-{}", std::process::id()));
    std::fs::create_dir_all(&empty).unwrap();

    for app in [app(None), app(Some(&empty))] {
        let response = send(&app, Method::GET, "/").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(content_type(&response), "application/problem+json");
    }
}
