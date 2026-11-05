use std::path::Path;

use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use tower::ServiceExt;
use tower_http::services::ServeDir;

use crate::error::AppError;

/// The Next.js export (D5) for GETs outside `/api`: the file itself, `<path>.html`,
/// `<path>/index.html`, then `index.html` for client routes. A missing file with an
/// extension gets `404.html` when the export has one.
pub async fn serve(dir: &Path, request: Request) -> Response {
    let path = request.uri().path();
    let readable = matches!(*request.method(), Method::GET | Method::HEAD);
    if !readable || path == "/api" || path.starts_with("/api/") {
        return AppError::NotFound.into_response();
    }
    let page = path.trim_end_matches('/');
    let has_extension = page
        .rsplit('/')
        .next()
        .is_some_and(|name| name.contains('.'));
    let mut candidates = vec![path.to_string()];
    if !page.is_empty() && !has_extension {
        candidates.push(format!("{page}.html"));
        candidates.push(format!("{page}/index.html"));
    }
    let fallback = if has_extension {
        "/404.html"
    } else {
        "/index.html"
    };
    candidates.push(fallback.into());
    for candidate in candidates {
        let response = file(dir, &candidate, request.method(), request.headers()).await;
        if response.status() == StatusCode::NOT_FOUND {
            continue;
        }
        if candidate != path && candidate == "/404.html" {
            return (StatusCode::NOT_FOUND, response).into_response();
        }
        return response;
    }
    AppError::NotFound.into_response()
}

/// `ServeDir` rejects `..` and other escapes, decoded or not.
async fn file(dir: &Path, path: &str, method: &Method, headers: &HeaderMap) -> Response {
    let mut request = Request::new(Body::empty());
    *request.method_mut() = method.clone();
    *request.headers_mut() = headers.clone();
    let Ok(uri) = path.parse() else {
        return AppError::NotFound.into_response();
    };
    *request.uri_mut() = uri;
    let Ok(response) = ServeDir::new(dir)
        .append_index_html_on_directories(false)
        .oneshot(request)
        .await;
    response.into_response()
}
