mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn open_at(user: &TestApp, balance: &str, date: &str) {
    user.open_at(balance, date).await;
}

async fn log(user: &TestApp, date: &str, kind: &str, amount: &str, category: &str) {
    let category_id = user.category_id(category).await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": kind, "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

fn balances(view: &Value, count: usize) -> Vec<&str> {
    view["days"].as_array().unwrap()[..count]
        .iter()
        .map(|day| day["balance"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn the_sheets_first_days_come_back_with_balances_tiers_and_totals(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-11-01").await;
    log(&user, "2026-11-02", "income", "500", "Salário").await;
    log(&user, "2026-11-03", "bill", "300", "Aluguel").await;
    log(&user, "2026-11-03", "daily", "50", "Mercado").await;

    let (status, view) = user.get("/api/months/2026-11").await;

    assert_eq!(status, StatusCode::OK, "{view}");
    assert_eq!(view["month"], "2026-11");
    assert_eq!(view["days"].as_array().unwrap().len(), 30);
    assert_eq!(
        balances(&view, 4),
        ["1000.00", "1500.00", "1150.00", "1150.00"]
    );
    assert_eq!(
        view["days"][2],
        json!({
            "date": "2026-11-03", "income": "0.00", "bills": "300.00", "daily": "50.00",
            "balance": "1150.00", "tier": "light_green",
            "is_today": view["days"][2]["is_today"], "is_future": view["days"][2]["is_future"]
        })
    );
    assert_eq!(
        view["totals"],
        json!({ "income": "500.00", "bills": "300.00", "daily": "50.00", "outflow": "350.00", "performance": "150.00" })
    );
    assert_eq!(view["projected_balance"], "1150.00");
    assert_eq!(view["projected_tier"], "light_green");
    assert_eq!(view["bills_of_month"], json!([]));
    assert_eq!(view["savings"], Value::Null);
    let (_, december) = user.get("/api/months/2026-12").await;
    assert_eq!(balances(&december, 1), ["1150.00"]);
}

#[sqlx::test]
async fn a_new_entry_moves_todays_balance_and_tier(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let month = today.format("%Y-%m").to_string();
    let uri = format!("/api/months/{month}");

    let (_, before) = user.get(&uri).await;
    assert_eq!(
        (&before["balance_today"], &before["balance_today_tier"]),
        (&json!("0.00"), &json!("yellow"))
    );
    log(&user, &today.to_string(), "income", "2500", "Salário").await;
    let (_, after) = user.get(&uri).await;
    assert_eq!(
        (&after["balance_today"], &after["balance_today_tier"]),
        (&json!("2500.00"), &json!("green"))
    );
    log(&user, &today.to_string(), "daily", "600", "Mercado").await;
    let (_, after) = user.get(&uri).await;
    assert_eq!(
        (&after["balance_today"], &after["balance_today_tier"]),
        (&json!("1900.00"), &json!("light_green"))
    );
    let days = after["days"].as_array().unwrap();
    let todays: Vec<&Value> = days.iter().filter(|day| day["is_today"] == true).collect();
    assert_eq!(todays.len(), 1);
    assert_eq!(todays[0]["date"], today.to_string());
    assert_eq!(todays[0]["is_future"], false);
}

#[sqlx::test]
async fn a_month_before_the_opening_is_refused(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-11-20").await;

    let (status, problem) = user.get("/api/months/2026-10").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:month-before-opening");
    let (status, view) = user.get("/api/months/2026-11").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(balances(&view, 1), ["1000.00"]);
}

#[sqlx::test]
async fn only_the_callers_entries_count(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    open_at(&ana, "0", "2026-11-01").await;
    open_at(&bia, "10", "2026-11-01").await;
    log(&ana, "2026-11-02", "income", "500", "Salário").await;

    let (_, theirs) = bia.get("/api/months/2026-11").await;

    assert_eq!(balances(&theirs, 2), ["10.00", "10.00"]);
    assert_eq!(theirs["totals"]["income"], "0.00");
    assert_eq!(
        balances(&ana.get("/api/months/2026-11").await.1, 2),
        ["0.00", "500.00"]
    );
}

#[sqlx::test]
async fn a_bad_month_is_422_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    for month in ["2026-13", "2026-1", "november"] {
        let (status, problem) = user.get(&format!("/api/months/{month}")).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{month}");
        assert_eq!(problem["errors"][0]["field"], "month");
    }
    assert_eq!(
        TestApp::anonymous(pool).get("/api/months/2026-11").await.0,
        StatusCode::UNAUTHORIZED
    );
}
