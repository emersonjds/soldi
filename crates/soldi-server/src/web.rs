use std::collections::BTreeSet;
use std::path::Path;

use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha256};
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

/// D40: what a browser may load from Soldi's pages; `scripts` are extra `script-src` sources.
pub fn content_security_policy(scripts: &str) -> String {
    format!(
        "default-src 'self'; script-src 'self'{scripts}; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; font-src 'self'; \
         connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io; \
         object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    )
}

/// The export's inline `<script>` bodies as `'sha256-…'` sources, sorted, each led by a space.
pub fn inline_script_hashes(dir: &Path) -> String {
    let mut hashes = BTreeSet::new();
    let mut folders = vec![dir.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for path in std::fs::read_dir(folder)
            .into_iter()
            .flatten()
            .flatten()
            .map(|entry| entry.path())
        {
            if path.is_dir() {
                folders.push(path);
            } else if path
                .extension()
                .is_some_and(|extension| extension == "html")
                && let Ok(html) = std::fs::read_to_string(&path)
            {
                hashes.extend(inline_scripts(&html).map(|script| {
                    format!(" 'sha256-{}'", STANDARD.encode(Sha256::digest(script)))
                }));
            }
        }
    }
    hashes.into_iter().collect()
}

fn inline_scripts(html: &str) -> impl Iterator<Item = &str> {
    html.split("<script").skip(1).filter_map(|tag| {
        let (attributes, rest) = tag.split_once('>')?;
        let (body, _) = rest.split_once("</script>")?;
        (!attributes.contains("src=")).then_some(body)
    })
}
