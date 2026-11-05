mod common;

use axum::http::{Method, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn sign_up_then_me_then_sign_out_ends_the_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let body = json!({ "email": " Ana@Example.com ", "password": PASSWORD });

    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-up",
            None,
            Some(body),
        ))
        .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(set_cookie.starts_with("soldi_session="), "{set_cookie}");
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));
    let user = TestApp {
        router: app.router.clone(),
        cookie: Some(session_cookie(&response)),
    };
    let created = body_json(response).await;
    assert_eq!(created["email"], "ana@example.com");
    assert_eq!(created["name"], "ana");
    assert_eq!(created["onboarded_at"], serde_json::Value::Null);

    let (status, me) = user.get("/api/auth/me").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me, created);

    let response = user
        .send(json_request(
            Method::POST,
            "/api/auth/sign-out",
            user.cookie.as_deref(),
            None,
        ))
        .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let cleared = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cleared.contains("Max-Age=0"), "{cleared}");

    let (status, problem) = user.get("/api/auth/me").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(problem["type"], "urn:soldi:error:unauthorized");
}

#[sqlx::test]
async fn sign_up_keeps_a_given_name(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, user) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "bia@example.com", "password": PASSWORD, "name": "  Bia Souza " }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(user["name"], "Bia Souza");
}

#[sqlx::test]
async fn sign_up_refuses_bad_input_and_taken_emails(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "not-an-email", "password": PASSWORD }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "email");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "bia@example.com", "password": "short" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "ANA@example.com", "password": PASSWORD }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:soldi:error:email-taken");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "c@example.com", "password": PASSWORD, "role": "admin" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "role");
}

#[sqlx::test]
async fn sign_in_accepts_any_email_case_and_sets_a_cookie(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-in",
            None,
            Some(json!({ "email": "ANA@example.com", "password": PASSWORD })),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let cookie = session_cookie(&response);
    let user = TestApp {
        router: app.router.clone(),
        cookie: Some(cookie),
    };
    assert_eq!(body_json(response).await["email"], "ana@example.com");
    assert_eq!(user.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn wrong_password_and_unknown_email_get_the_same_401(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let (wrong_status, wrong) = app
        .post(
            "/api/auth/sign-in",
            json!({ "email": "ana@example.com", "password": "wrong horse" }),
        )
        .await;
    let (unknown_status, unknown) = app
        .post(
            "/api/auth/sign-in",
            json!({ "email": "nobody@example.com", "password": PASSWORD }),
        )
        .await;

    assert_eq!(wrong_status, StatusCode::UNAUTHORIZED);
    assert_eq!(unknown_status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong, unknown);
    assert_eq!(wrong["type"], "urn:soldi:error:invalid-credentials");
}

#[sqlx::test]
async fn behind_https_the_cookie_is_host_prefixed_and_secure(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let mut request = json_request(
        Method::POST,
        "/api/auth/sign-up",
        None,
        Some(json!({ "email": "ana@example.com", "password": PASSWORD })),
    );
    request
        .headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());

    let response = app.send(request).await;

    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(
        set_cookie.starts_with("__Host-soldi_session="),
        "{set_cookie}"
    );
    assert!(set_cookie.contains("Secure"));
    let cookie = session_cookie(&response);
    let mut me = json_request(Method::GET, "/api/auth/me", Some(&cookie), None);
    me.headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());
    assert_eq!(app.send(me).await.status(), StatusCode::OK);
}

#[sqlx::test]
async fn over_https_the_plain_cookie_is_ignored(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let mut me = json_request(Method::GET, "/api/auth/me", user.cookie.as_deref(), None);
    me.headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());

    assert_eq!(user.send(me).await.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn a_cross_site_write_is_forbidden(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let mut request = json_request(
        Method::POST,
        "/api/auth/sign-out",
        user.cookie.as_deref(),
        None,
    );
    request
        .headers_mut()
        .insert("sec-fetch-site", "cross-site".parse().unwrap());

    assert_eq!(user.send(request).await.status(), StatusCode::FORBIDDEN);
    assert_eq!(user.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn a_malformed_body_is_a_400_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = axum::http::Request::builder()
        .method(Method::POST)
        .uri("/api/auth/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .body(axum::body::Body::from("{"))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
}
