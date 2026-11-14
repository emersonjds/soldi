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

async fn signed_in_again(app: &TestApp, email: &str, password: &str) -> TestApp {
    let body = json!({ "email": email, "password": password });
    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-in",
            None,
            Some(body),
        ))
        .await;
    assert_eq!(response.status(), StatusCode::OK);
    TestApp {
        router: app.router.clone(),
        cookie: Some(common::session_cookie(&response)),
    }
}

#[sqlx::test]
async fn sign_out_password_change_and_deletion_skip_the_spent_write_budget(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let other = signed_in_again(&ana, "ana@example.com", common::PASSWORD).await;
    for _ in 0..120 {
        ana.post("/api/me/tour-seen", json!({})).await;
    }
    let (status, _) = ana.post("/api/me/tour-seen", json!({})).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    let (status, body) = other.post("/api/auth/sign-out", json!({})).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let changed =
        json!({ "current_password": common::PASSWORD, "new_password": "new horse battery" });
    let (status, body) = ana.post("/api/me/password", changed).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let (status, body) = ana.post("/api/auth/sign-out-everywhere", json!({})).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let ana = signed_in_again(&ana, "ana@example.com", "new horse battery").await;
    let body = json!({ "password": "new horse battery" });
    let request = json_request(Method::DELETE, "/api/me", ana.cookie.as_deref(), Some(body));
    assert_eq!(ana.send(request).await.status(), StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn a_bill_payment_a_resgate_and_a_series_growth_stop_at_the_ceiling(pool: PgPool) {
    let ana = opened(pool.clone(), "ana@example.com").await;
    let economia = ana.category_id("Economia").await;
    let (_, reserva) = ana
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia }),
        )
        .await;
    let (status, bill) = ana
        .post(
            "/api/bills",
            json!({ "name": "Aluguel", "amount": "100", "due_day": 5,
                    "category_id": ana.category_id("Escola").await }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{bill}");
    let (status, series) = spend(&ana, json!({ "repeat_months": 2 })).await;
    assert_eq!(status, StatusCode::CREATED, "{series}");
    let (status, deposit) = spend(
        &ana,
        json!({ "kind": "bill", "category_id": reserva["id"] }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{deposit}");
    fill_to(&pool, &ana, &deposit, CEILING).await;

    let pay = format!("/api/bills/{}/pay", bill["id"].as_str().unwrap());
    let (status, problem) = ana.post(&pay, json!({ "date": today().to_string() })).await;
    assert_quota(status, &problem);
    let resgate = format!(
        "/api/cofrinhos/{}/withdraw",
        reserva["id"].as_str().unwrap()
    );
    let (status, problem) = ana
        .post(
            &resgate,
            json!({ "date": today().to_string(), "amount": "10" }),
        )
        .await;
    assert_quota(status, &problem);
    let member = format!("/api/transactions/{}", series["id"].as_str().unwrap());
    let (status, problem) = ana.patch(&member, json!({ "repeat_months": 4 })).await;
    assert_quota(status, &problem);
    assert_eq!(count(&ana).await, CEILING);
}
