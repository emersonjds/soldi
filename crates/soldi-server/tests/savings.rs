mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn earn(user: &TestApp, date: &str, amount: &str) {
    let category_id = user.category_id("Salário").await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "income", "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

async fn save(user: &TestApp, uri: &str, amount: Value) -> (StatusCode, Value) {
    user.put(uri, json!({ "amount": amount })).await
}

#[sqlx::test]
async fn rules_4_to_8_the_savings_year_with_its_goal(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("0", "2026-03-15").await;
    bia.open_at("0", "2026-01-01").await;
    earn(&ana, "2026-03-20", "5000").await;
    earn(&ana, "2026-11-05", "4000").await;
    earn(&ana, "2026-11-20", "1000").await;
    earn(&ana, "2027-01-05", "9999").await;

    let (status, row) = save(&ana, "/api/savings/2026/11", json!("420")).await;
    assert_eq!(status, StatusCode::OK, "{row}");
    assert_eq!(
        row,
        json!({ "year": 2026, "month": 11, "amount": "420.00" })
    );
    let (_, row) = save(&ana, "/api/savings/2026/11", json!("1260")).await;
    assert_eq!(row["amount"], "1260.00");
    save(&ana, "/api/savings/2026/3", json!("420")).await;
    save(&bia, "/api/savings/2026/11", json!("7")).await;
    let (status, _) = ana
        .patch("/api/settings", json!({ "savings_goal_pct": 20 }))
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, year) = ana.get("/api/savings?year=2026").await;

    assert_eq!(status, StatusCode::OK, "{year}");
    let months = year["months"].as_array().unwrap();
    assert_eq!(months.len(), 12);
    assert_eq!(
        months[1],
        json!({ "month": 2, "income": null, "saved": null, "pct": null })
    );
    assert_eq!(
        months[2],
        json!({ "month": 3, "income": "5000.00", "saved": "420.00", "pct": "8.4" })
    );
    assert_eq!(
        months[10],
        json!({ "month": 11, "income": "5000.00", "saved": "1260.00", "pct": "25.2" })
    );
    assert_eq!(
        months[11],
        json!({ "month": 12, "income": "0.00", "saved": "0.00", "pct": null })
    );
    assert_eq!(year["year"], 2026);
    assert_eq!(year["total_income"], "10000.00");
    assert_eq!(year["total_saved"], "1680.00");
    assert_eq!(year["pct"], "16.8");
    assert_eq!(year["goal_pct"], 20);
    assert_eq!(year["goal_progress_pct"], "84.0");

    let (_, november) = ana.get("/api/months/2026-11").await;
    assert_eq!(
        november["savings"],
        json!({ "amount": "1260.00", "pct": "25.2" })
    );
    assert_eq!(
        ana.get("/api/months/2026-12").await.1["savings"],
        Value::Null
    );
    let (_, theirs) = bia.get("/api/savings?year=2026").await;
    assert_eq!(theirs["total_saved"], "7.00");
    assert_eq!(theirs["months"][10]["pct"], Value::Null);
    assert_eq!(theirs["goal_progress_pct"], Value::Null);
}

#[sqlx::test]
async fn a_save_checks_the_amount_and_the_period(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("0", "2026-03-15").await;

    for (uri, amount, field) in [
        ("/api/savings/2026/11", json!("-1"), "amount"),
        ("/api/savings/2026/11", json!("1.001"), "amount"),
        ("/api/savings/2026/11", json!(10), "amount"),
        ("/api/savings/1999/11", json!("1"), "year"),
        ("/api/savings/2101/11", json!("1"), "year"),
        ("/api/savings/2026/0", json!("1"), "month"),
        ("/api/savings/2026/13", json!("1"), "month"),
    ] {
        let (status, problem) = save(&user, uri, amount.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{uri} {amount}");
        assert_eq!(problem["errors"][0]["field"], field, "{uri} {amount}");
    }
    let (status, problem) = save(&user, "/api/savings/2026/2", json!("1")).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:month-before-opening");
    assert_eq!(
        save(&user, "/api/savings/2026/3", json!("0")).await.0,
        StatusCode::OK
    );
    assert_eq!(
        save(&user, "/api/savings/x/3", json!("0")).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        user.get("/api/savings?year=2026").await.1["total_saved"],
        "0.00"
    );
}

#[sqlx::test]
async fn a_bad_year_is_422_none_is_400_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let (status, problem) = user.get("/api/savings?year=2101").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "year");
    assert_eq!(user.get("/api/savings").await.0, StatusCode::BAD_REQUEST);
    let anonymous = TestApp::anonymous(pool);
    assert_eq!(
        anonymous.get("/api/savings?year=2026").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        save(&anonymous, "/api/savings/2026/11", json!("1")).await.0,
        StatusCode::UNAUTHORIZED
    );
}
