mod common;

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use serde_json::{Value, json};
use soldi_server::auth::domain::hash_token;
use soldi_server::mail::{Mailer, Message, Recording};
use sqlx::PgPool;

const NEW_PASSWORD: &str = "battery staple";

fn app(pool: PgPool) -> (TestApp, Arc<Recording>) {
    let recording = Arc::new(Recording::default());
    let state = soldi_server::AppState {
        mailer: Mailer::Recording(recording.clone()),
        ..soldi_server::AppState::new(pool)
    };
    let app = TestApp {
        router: soldi_server::app(state, None),
        cookie: None,
    };
    (app, recording)
}

fn reset_request(email: &str) -> Request<Body> {
    let body = json!({ "email": email });
    json_request(Method::POST, "/api/auth/password-reset", None, Some(body))
}

fn confirm_request(token: &str, new_password: &str) -> Request<Body> {
    let body = json!({ "token": token, "new_password": new_password });
    json_request(
        Method::POST,
        "/api/auth/password-reset/confirm",
        None,
        Some(body),
    )
}

async fn request_reset(app: &TestApp, email: &str) -> (StatusCode, Value) {
    app.post("/api/auth/password-reset", json!({ "email": email }))
        .await
}

async fn confirm(app: &TestApp, token: &str, new_password: &str) -> (StatusCode, Value) {
    let body = json!({ "token": token, "new_password": new_password });
    app.post("/api/auth/password-reset/confirm", body).await
}

fn token_in(message: &Message) -> String {
    let (_, after) = message.text.split_once("token=").unwrap();
    after
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

async fn sign_in(app: &TestApp, email: &str, password: &str) -> (StatusCode, TestApp) {
    let body = json!({ "email": email, "password": password });
    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-in",
            None,
            Some(body),
        ))
        .await;
    let status = response.status();
    let cookie = (status == StatusCode::OK).then(|| session_cookie(&response));
    let session = TestApp {
        router: app.router.clone(),
        cookie,
    };
    (status, session)
}

fn forwarded(mut request: Request<Body>, from: &str) -> Request<Body> {
    request
        .headers_mut()
        .insert("x-forwarded-for", from.parse().unwrap());
    request
}

async fn assert_rate_limited(response: axum::response::Response) {
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    let retry_after: u64 = response.headers()[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=3600).contains(&retry_after), "{retry_after}");
    let problem = body_json(response).await;
    assert_eq!(problem["type"], "urn:soldi:error:rate-limited");
}

fn assert_invalid_link(status: StatusCode, problem: &Value) {
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:invalid-reset-link");
}

#[sqlx::test]
async fn an_unknown_and_a_real_email_get_the_same_202_and_only_the_real_one_gets_a_link(
    pool: PgPool,
) {
    let (app, mail) = app(pool);
    app.another_user("ana@example.com").await;

    let unknown = app.send(reset_request("nobody@example.com")).await;
    let real = app.send(reset_request(" ANA@Example.com ")).await;

    assert_eq!(unknown.status(), StatusCode::ACCEPTED);
    assert_eq!(real.status(), StatusCode::ACCEPTED);
    for name in [header::CONTENT_TYPE, header::CONTENT_LENGTH] {
        assert_eq!(
            unknown.headers().get(&name),
            real.headers().get(&name),
            "{name}"
        );
    }
    assert_eq!(body_json(unknown).await, Value::Null);
    assert_eq!(body_json(real).await, Value::Null);
    let sent = mail.sent().await;
    assert_eq!(sent.len(), 1);
    let message = &sent[0];
    assert_eq!(message.to, "ana@example.com");
    assert_eq!(message.subject, "Redefinir sua senha do Soldi");
    let token = token_in(message);
    assert_eq!(token.len(), 43, "{token}");
    let link = format!("http://localhost:8080/redefinir-senha#token={token}");
    assert!(message.text.starts_with("Olá, ana."), "{}", message.text);
    assert!(message.text.contains(&link), "{}", message.text);
    assert!(message.html.contains(&format!("href=\"{link}\"")));

    let (status, _) = confirm(&app, &token, NEW_PASSWORD).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, problem) = confirm(&app, &token, NEW_PASSWORD).await;
    assert_invalid_link(status, &problem);
}

#[sqlx::test]
async fn confirming_sets_the_password_and_ends_every_session(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    let (_, ana_phone) = sign_in(&app, "ana@example.com", PASSWORD).await;
    request_reset(&app, "ana@example.com").await;
    let token = token_in(&mail.sent().await[0]);

    let (status, body) = confirm(&app, &token, NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(body, Value::Null);
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(
        ana_phone.get("/api/auth/me").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        sign_in(&app, "ana@example.com", PASSWORD).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        sign_in(&app, "ana@example.com", NEW_PASSWORD).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn an_expired_link_is_refused(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let token = token_in(&mail.sent().await[0]);
    sqlx::query("UPDATE password_resets SET expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();

    let (status, problem) = confirm(&app, &token, NEW_PASSWORD).await;

    assert_invalid_link(status, &problem);
    assert_eq!(
        sign_in(&app, "ana@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn an_unknown_token_is_refused(pool: PgPool) {
    let (app, _) = app(pool);

    let (status, problem) = confirm(&app, "not-a-token", NEW_PASSWORD).await;

    assert_invalid_link(status, &problem);
}

#[sqlx::test]
async fn a_second_request_deletes_the_first_link(pool: PgPool) {
    let (app, mail) = app(pool);
    app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let first = token_in(&mail.sent().await[0]);
    request_reset(&app, "ana@example.com").await;
    let sent = mail.sent().await;
    assert_eq!(sent.len(), 2);
    let second = token_in(&sent[1]);
    assert_ne!(first, second);

    let (status, problem) = confirm(&app, &first, NEW_PASSWORD).await;
    assert_invalid_link(status, &problem);
    assert_eq!(
        confirm(&app, &second, NEW_PASSWORD).await.0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test]
async fn confirming_one_link_voids_every_other_pending_link_of_the_user(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let first = token_in(&mail.sent().await[0]);
    sqlx::query(
        "INSERT INTO password_resets (user_id, token_hash) \
         SELECT id, $1 FROM users WHERE email = 'ana@example.com'",
    )
    .bind(hash_token("second"))
    .execute(&pool)
    .await
    .unwrap();

    assert_eq!(
        confirm(&app, &first, NEW_PASSWORD).await.0,
        StatusCode::NO_CONTENT
    );
    let (status, problem) = confirm(&app, "second", "another long one").await;
    assert_invalid_link(status, &problem);
}

#[sqlx::test]
async fn concurrent_requests_leave_one_live_link(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    app.another_user("ana@example.com").await;

    tokio::join!(
        request_reset(&app, "ana@example.com"),
        request_reset(&app, "ana@example.com"),
        request_reset(&app, "ana@example.com"),
    );
    assert_eq!(mail.sent().await.len(), 3);

    let links: i64 = sqlx::query_scalar("SELECT count(*) FROM password_resets")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(links, 1);
}

#[sqlx::test]
async fn the_link_is_stored_only_as_its_hash(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let token = token_in(&mail.sent().await[0]);

    let stored: Vec<Vec<u8>> = sqlx::query_scalar("SELECT token_hash FROM password_resets")
        .fetch_all(&pool)
        .await
        .unwrap();

    assert_eq!(stored, vec![hash_token(&token)]);
    assert_ne!(stored[0], token.as_bytes());
}

#[sqlx::test]
async fn a_short_new_password_is_refused_and_the_link_still_works(pool: PgPool) {
    let (app, mail) = app(pool);
    app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let token = token_in(&mail.sent().await[0]);

    let (status, problem) = confirm(&app, &token, "short").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");
    assert_eq!(
        confirm(&app, &token, NEW_PASSWORD).await.0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test]
async fn another_users_link_and_sessions_are_untouched(pool: PgPool) {
    let (app, mail) = app(pool);
    app.another_user("ana@example.com").await;
    let bia = app.another_user("bia@example.com").await;
    request_reset(&app, "ana@example.com").await;
    request_reset(&app, "bia@example.com").await;
    let sent = mail.sent().await;
    let token_for = |email: &str| token_in(sent.iter().find(|m| m.to == email).unwrap());

    let (status, _) = confirm(&app, &token_for("ana@example.com"), NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(bia.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        sign_in(&app, "bia@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
    assert_eq!(
        confirm(&app, &token_for("bia@example.com"), NEW_PASSWORD)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test]
async fn the_fourth_request_for_one_email_within_an_hour_is_limited(pool: PgPool) {
    let (app, mail) = app(pool);
    app.another_user("ana@example.com").await;
    for email in ["ana@example.com", "ANA@example.com", " ana@example.com"] {
        assert_eq!(request_reset(&app, email).await.0, StatusCode::ACCEPTED);
    }

    assert_rate_limited(app.send(reset_request("ana@example.com")).await).await;
    assert_eq!(mail.sent().await.len(), 3);
    assert_eq!(
        request_reset(&app, "bia@example.com").await.0,
        StatusCode::ACCEPTED
    );
}

#[sqlx::test]
async fn the_eleventh_request_from_one_ip_is_limited(pool: PgPool) {
    let (app, _) = app(pool);
    for n in 0..10 {
        let request = forwarded(reset_request(&format!("u{n}@example.com")), "203.0.113.1");
        assert_eq!(app.send(request).await.status(), StatusCode::ACCEPTED);
    }

    let request = forwarded(reset_request("u10@example.com"), "203.0.113.1");
    assert_rate_limited(app.send(request).await).await;
    let request = forwarded(reset_request("u10@example.com"), "203.0.113.2");
    assert_eq!(app.send(request).await.status(), StatusCode::ACCEPTED);
}

#[sqlx::test]
async fn an_email_over_254_bytes_is_a_422_and_a_malformed_short_one_a_202(pool: PgPool) {
    let (app, mail) = app(pool);
    let long = format!("{}@example.com", "a".repeat(243));

    let (status, problem) = request_reset(&app, &long).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "email");
    for malformed in ["not an email", "nul\0@example.com"] {
        assert_eq!(request_reset(&app, malformed).await.0, StatusCode::ACCEPTED);
    }
    assert!(mail.sent().await.is_empty());
}

#[sqlx::test]
async fn the_twenty_first_confirm_from_one_ip_is_limited(pool: PgPool) {
    let (app, _) = app(pool);
    for attempt in 0..20 {
        let request = forwarded(confirm_request("guess", NEW_PASSWORD), "203.0.113.1");
        let response = app.send(request).await;
        assert_eq!(
            response.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "{attempt}"
        );
    }

    let request = forwarded(confirm_request("guess", NEW_PASSWORD), "203.0.113.1");
    assert_rate_limited(app.send(request).await).await;
}

#[sqlx::test]
async fn changing_the_password_in_the_account_voids_pending_links(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    request_reset(&app, "ana@example.com").await;
    let token = token_in(&mail.sent().await[0]);

    let (status, _) = ana
        .post(
            "/api/me/password",
            json!({ "current_password": PASSWORD, "new_password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, problem) = confirm(&app, &token, "another long one").await;
    assert_invalid_link(status, &problem);
}
