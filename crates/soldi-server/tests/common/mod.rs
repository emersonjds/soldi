#![allow(dead_code)]

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

pub const PASSWORD: &str = "correct horse";

#[derive(Clone)]
pub struct TestApp {
    pub router: Router,
    pub cookie: Option<String>,
}

impl TestApp {
    pub fn anonymous(pool: PgPool) -> Self {
        TestApp {
            router: soldi_server::app(soldi_server::AppState::new(pool), None),
            cookie: None,
        }
    }

    pub async fn signed_in(pool: PgPool, email: &str) -> Self {
        TestApp::anonymous(pool).another_user(email).await
    }

    /// Signs up a new user on the same router and keeps its session cookie.
    pub async fn another_user(&self, email: &str) -> Self {
        let body = json!({ "email": email, "password": PASSWORD });
        let request = json_request(Method::POST, "/api/auth/sign-up", None, Some(body));
        let response = self.send(request).await;
        assert_eq!(response.status(), StatusCode::CREATED);
        TestApp {
            router: self.router.clone(),
            cookie: Some(session_cookie(&response)),
        }
    }

    /// The id of the caller's active category with this name.
    pub async fn category_id(&self, name: &str) -> String {
        let (_, categories) = self.get("/api/categories").await;
        let category = categories
            .as_array()
            .unwrap()
            .iter()
            .find(|category| category["name"] == name)
            .unwrap_or_else(|| panic!("no category {name}"));
        category["id"].as_str().unwrap().to_string()
    }

    pub async fn send(&self, request: Request<Body>) -> Response {
        self.router.clone().oneshot(request).await.unwrap()
    }

    pub async fn get(&self, uri: &str) -> (StatusCode, Value) {
        self.call(Method::GET, uri, None).await
    }

    pub async fn delete(&self, uri: &str) -> (StatusCode, Value) {
        self.call(Method::DELETE, uri, None).await
    }

    pub async fn post(&self, uri: &str, body: Value) -> (StatusCode, Value) {
        self.call(Method::POST, uri, Some(body)).await
    }

    pub async fn patch(&self, uri: &str, body: Value) -> (StatusCode, Value) {
        self.call(Method::PATCH, uri, Some(body)).await
    }

    async fn call(&self, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
        let request = json_request(method, uri, self.cookie.as_deref(), body);
        let response = self.send(request).await;
        let status = response.status();
        (status, body_json(response).await)
    }
}

pub fn json_request(
    method: Method,
    uri: &str,
    cookie: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    let Some(body) = body else {
        return builder.body(Body::empty()).unwrap();
    };
    builder
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    if bytes.is_empty() {
        return Value::Null;
    }
    serde_json::from_slice(&bytes).unwrap()
}

pub async fn body_text(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

/// The `name=value` part of the response's `Set-Cookie`, ready for a `Cookie` header.
pub fn session_cookie(response: &Response) -> String {
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    set_cookie.split(';').next().unwrap().to_string()
}
