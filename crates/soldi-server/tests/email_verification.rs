mod common;

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{TestApp, body_json, json_request};
use serde_json::{Value, json};
use soldi_server::auth::domain::hash_token;
use soldi_server::mail::{Mailer, Message, Recording};
use sqlx::PgPool;

const REQUEST: &str = "/api/me/email-verification";
const CONFIRM: &str = "/api/auth/email-verification/confirm";

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

fn verification_request(user: &TestApp) -> Request<Body> {
    json_request(Method::POST, REQUEST, user.cookie.as_deref(), None)
}

fn confirm_request(token: &str) -> Request<Body> {
    json_request(Method::POST, CONFIRM, None, Some(json!({ "token": token })))
}

async fn request(user: &TestApp) -> (StatusCode, Value) {
    let response = user.send(verification_request(user)).await;
    let status = response.status();
    (status, body_json(response).await)
}

async fn confirm(app: &TestApp, token: &str) -> (StatusCode, Value) {
    app.post(CONFIRM, json!({ "token": token })).await
}

fn token_in(message: &Message) -> String {
    let (_, after) = message.text.split_once("token=").unwrap();
    after
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

async fn verified(user: &TestApp) -> Value {
    let (status, me) = user.get("/api/auth/me").await;
    assert_eq!(status, StatusCode::OK, "{me}");
    me["email_verified"].clone()
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
    assert_eq!(problem["type"], "urn:soldi:error:invalid-verification-link");
}

#[sqlx::test]
async fn a_request_mails_a_fragment_link_and_confirming_it_verifies_the_email_once(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    let ana = app.another_user("ana@example.com").await;
    assert_eq!(verified(&ana).await, false);

    let (status, body) = request(&ana).await;

    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(body, Value::Null);
    let sent = mail.sent().await;
    assert_eq!(sent.len(), 1);
    let message = &sent[0];
    assert_eq!(message.to, "ana@example.com");
    assert_eq!(message.subject, "Confirme seu e-mail no Soldi");
    let token = token_in(message);
    assert_eq!(token.len(), 43, "{token}");
    let link = format!("http://localhost:8080/verificar-email#token={token}");
    assert!(message.text.starts_with("Olá!\n"), "{}", message.text);
    assert!(message.text.contains(&link), "{}", message.text);
    assert!(message.html.contains(&format!("href=\"{link}\"")));

    let stored: Vec<Vec<u8>> = sqlx::query_scalar("SELECT token_hash FROM email_verifications")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(stored, vec![hash_token(&token)]);
    assert_eq!(stored[0].len(), 32);
    let lasts_a_day: bool = sqlx::query_scalar(
        "SELECT expires_at - created_at = interval '24 hours' FROM email_verifications",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(lasts_a_day);

    let response = app.send(confirm_request(&token)).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(response.headers().get(header::SET_COOKIE).is_none());
    assert_eq!(verified(&ana).await, true);

    let (status, problem) = confirm(&app, &token).await;
    assert_invalid_link(status, &problem);
    assert_eq!(
        problem["detail"],
        "Este link de verificação é inválido ou expirou."
    );
}

#[sqlx::test]
async fn an_expired_link_is_refused(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    let ana = app.another_user("ana@example.com").await;
    request(&ana).await;
    let token = token_in(&mail.sent().await[0]);
    sqlx::query("UPDATE email_verifications SET expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();

    let (status, problem) = confirm(&app, &token).await;

    assert_invalid_link(status, &problem);
    assert_eq!(verified(&ana).await, false);
}

#[sqlx::test]
async fn an_unknown_token_is_refused(pool: PgPool) {
    let (app, _) = app(pool);

    let (status, problem) = confirm(&app, "not-a-token").await;

    assert_invalid_link(status, &problem);
}

#[sqlx::test]
async fn a_second_request_voids_the_first_link(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    request(&ana).await;
    let first = token_in(&mail.sent().await[0]);
    request(&ana).await;
    let sent = mail.sent().await;
    assert_eq!(sent.len(), 2);
    let second = token_in(&sent[1]);
    assert_ne!(first, second);

    let (status, problem) = confirm(&app, &first).await;
    assert_invalid_link(status, &problem);
    assert_eq!(confirm(&app, &second).await.0, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn concurrent_requests_leave_one_live_link(pool: PgPool) {
    let (app, mail) = app(pool.clone());
    let ana = app.another_user("ana@example.com").await;

    tokio::join!(request(&ana), request(&ana), request(&ana));
    assert_eq!(mail.sent().await.len(), 3);

    let links: i64 = sqlx::query_scalar("SELECT count(*) FROM email_verifications")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(links, 1);
}

#[sqlx::test]
async fn an_already_verified_email_is_a_422_and_gets_no_mail(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    request(&ana).await;
    let token = token_in(&mail.sent().await[0]);
    assert_eq!(confirm(&app, &token).await.0, StatusCode::NO_CONTENT);

    let (status, problem) = request(&ana).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:email-already-verified");
    assert_eq!(problem["detail"], "Este e-mail já foi verificado.");
    assert_eq!(mail.sent().await.len(), 1);
}

#[sqlx::test]
async fn the_fourth_request_of_one_user_within_an_hour_is_limited(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    let bia = app.another_user("bia@example.com").await;
    for _ in 0..3 {
        assert_eq!(request(&ana).await.0, StatusCode::ACCEPTED);
    }

    assert_rate_limited(ana.send(verification_request(&ana)).await).await;
    assert_eq!(mail.sent().await.len(), 3);
    assert_eq!(request(&bia).await.0, StatusCode::ACCEPTED);
}

#[sqlx::test]
async fn the_eleventh_request_from_one_ip_is_limited_before_the_user_budget(pool: PgPool) {
    let (app, _) = app(pool);
    let mut users = Vec::new();
    for n in 0..4 {
        users.push(app.another_user(&format!("u{n}@example.com")).await);
    }
    for n in 0..10 {
        let user = &users[n / 3];
        let response = user
            .send(forwarded(verification_request(user), "203.0.113.1"))
            .await;
        assert_eq!(response.status(), StatusCode::ACCEPTED, "{n}");
    }

    let last = &users[3];
    assert_rate_limited(
        last.send(forwarded(verification_request(last), "203.0.113.1"))
            .await,
    )
    .await;
    for n in 0..2 {
        let response = last
            .send(forwarded(verification_request(last), "203.0.113.2"))
            .await;
        assert_eq!(response.status(), StatusCode::ACCEPTED, "{n}");
    }
}

#[sqlx::test]
async fn the_twenty_first_confirm_from_one_ip_is_limited(pool: PgPool) {
    let (app, _) = app(pool);
    for attempt in 0..20 {
        let response = app
            .send(forwarded(confirm_request("guess"), "203.0.113.1"))
            .await;
        assert_eq!(
            response.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "{attempt}"
        );
    }

    assert_rate_limited(
        app.send(forwarded(confirm_request("guess"), "203.0.113.1"))
            .await,
    )
    .await;
    let response = app
        .send(forwarded(confirm_request("guess"), "203.0.113.2"))
        .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn another_users_token_verifies_only_that_user(pool: PgPool) {
    let (app, mail) = app(pool);
    let ana = app.another_user("ana@example.com").await;
    let bia = app.another_user("bia@example.com").await;
    request(&ana).await;
    request(&bia).await;
    let sent = mail.sent().await;
    let bia_token = token_in(sent.iter().find(|m| m.to == "bia@example.com").unwrap());

    assert_eq!(confirm(&app, &bia_token).await.0, StatusCode::NO_CONTENT);

    assert_eq!(verified(&bia).await, true);
    assert_eq!(verified(&ana).await, false);
    let ana_token = token_in(sent.iter().find(|m| m.to == "ana@example.com").unwrap());
    assert_eq!(confirm(&app, &ana_token).await.0, StatusCode::NO_CONTENT);
    assert_eq!(verified(&ana).await, true);
}

#[sqlx::test]
async fn a_request_needs_a_session(pool: PgPool) {
    let (app, mail) = app(pool);

    let (status, _) = request(&app).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(mail.sent().await.is_empty());
}
