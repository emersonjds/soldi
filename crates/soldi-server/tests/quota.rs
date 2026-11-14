mod common;

use axum::http::{Method, StatusCode, header};
use common::{TestApp, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

const CEILING: i64 = 50_000;

fn today() -> chrono::NaiveDate {
    soldi_server::today_sao_paulo()
}

async fn opened(pool: PgPool, email: &str) -> TestApp {
    let user = TestApp::signed_in(pool, email).await;
    user.open_at("0", "2026-01-01").await;
    user
}

async fn spend(user: &TestApp, extra: Value) -> (StatusCode, Value) {
    let mut body = json!({ "date": today().to_string(), "amount": "10", "kind": "daily",
                           "category_id": user.category_id("Mercado").await });
    body.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    user.post("/api/transactions", body).await
}

/// Copies `entry` (alone, out of any series) until the owner holds `total` entries.
async fn fill_to(pool: &PgPool, user: &TestApp, entry: &Value, total: i64) {
    let held = count(user).await;
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id)
         SELECT user_id, date, amount, kind, category_id
         FROM transactions, generate_series(1, $2) WHERE id = $1::uuid",
    )
    .bind(entry["id"].as_str().unwrap())
    .bind(total - held)
    .execute(pool)
    .await
    .unwrap();
}

async fn count(user: &TestApp) -> i64 {
    let (status, body) = user.get("/api/transactions/count?period=all").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["count"].as_i64().unwrap()
}

fn assert_quota(status: StatusCode, problem: &Value) {
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:quota");
}

#[sqlx::test]
async fn a_script_past_the_write_budget_gets_429_while_reads_and_others_go_on(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    for write in 0..119 {
        let (status, body) = ana.post("/api/me/tour-seen", json!({})).await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{write}: {body}");
    }
    let (status, _) = ana.patch("/api/settings", json!({})).await;
    assert_ne!(status, StatusCode::TOO_MANY_REQUESTS);

    let request = json_request(
        Method::POST,
        "/api/transactions",
        ana.cookie.as_deref(),
        Some(json!({})),
    );
    let refused = ana.send(request).await;

    assert_eq!(refused.status(), StatusCode::TOO_MANY_REQUESTS);
    let retry_after: u64 = refused.headers()[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=60).contains(&retry_after), "{retry_after}");
    assert_eq!(
        common::body_json(refused).await["type"],
        "urn:soldi:error:rate-limited"
    );
    assert_eq!(ana.get("/api/settings").await.0, StatusCode::OK);
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
    let (status, _) = bia.post("/api/me/tour-seen", json!({})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn new_entries_stop_at_the_account_ceiling_and_other_accounts_go_on(pool: PgPool) {
    let ana = opened(pool.clone(), "ana@example.com").await;
    let bia = opened(pool.clone(), "bia@example.com").await;
    let (_, first) = spend(&ana, json!({})).await;
    fill_to(&pool, &ana, &first, CEILING - 1).await;

    let (status, problem) = spend(&ana, json!({ "repeat_months": 2 })).await;
    assert_quota(status, &problem);
    assert_eq!(spend(&ana, json!({})).await.0, StatusCode::CREATED);
    let (status, problem) = spend(&ana, json!({})).await;
    assert_quota(status, &problem);
    let uri = format!("/api/transactions/{}", first["id"].as_str().unwrap());
    let (status, problem) = ana.patch(&uri, json!({ "repeat_months": 3 })).await;
    assert_quota(status, &problem);

    assert_eq!(count(&ana).await, CEILING);
    assert_eq!(spend(&bia, json!({})).await.0, StatusCode::CREATED);
}

#[sqlx::test]
async fn an_open_series_stops_growing_at_the_ceiling_and_reads_still_answer(pool: PgPool) {
    let ana = opened(pool.clone(), "ana@example.com").await;
    let (status, fixo) = spend(&ana, json!({ "open_ended": true, "repeat_every": "week" })).await;
    assert_eq!(status, StatusCode::CREATED, "{fixo}");
    fill_to(&pool, &ana, &fixo, CEILING - 2).await;

    let far = today() + chrono::Months::new(36);
    let (status, _) = ana
        .get(&format!("/api/transactions?month={}", far.format("%Y-%m")))
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(count(&ana).await, CEILING);
}
