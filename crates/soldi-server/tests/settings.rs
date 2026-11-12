mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn sign_up_creates_the_spreadsheet_defaults(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, settings) = user.get("/api/settings").await;

    assert_eq!(status, StatusCode::OK);
    let today = soldi_server::today_sao_paulo().to_string();
    assert_eq!(
        settings,
        json!({
            "opening_balance": "0.00",
            "opening_date": today,
            "tier_red": "-500.00",
            "tier_zero": "0.00",
            "tier_yellow": "1000.00",
            "tier_green": "2000.00",
            "currency": "BRL",
            "savings_target_pct": null
        })
    );
}

#[sqlx::test]
async fn patch_changes_only_the_given_fields(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, settings) = user
        .patch(
            "/api/settings",
            json!({ "opening_balance": "-120.5", "opening_date": "2026-01-01", "tier_green": "2500" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["opening_balance"], "-120.50");
    assert_eq!(settings["opening_date"], "2026-01-01");
    assert_eq!(settings["tier_green"], "2500.00");
    assert_eq!(settings["tier_yellow"], "1000.00");
    assert_eq!(user.get("/api/settings").await.1, settings);
}

#[sqlx::test]
async fn patch_refuses_unordered_tiers_and_numbers_for_money(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem) = user
        .patch("/api/settings", json!({ "tier_yellow": "-1000" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "tier_yellow");

    let (status, problem) = user
        .patch("/api/settings", json!({ "opening_balance": 10.1 }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "opening_balance");

    let (status, problem) = user
        .patch("/api/settings", json!({ "savings_goal_pct": 15 }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "savings_goal_pct");
    assert_eq!(
        user.get("/api/savings?year=2026").await.0,
        StatusCode::NOT_FOUND
    );

    assert_eq!(user.get("/api/settings").await.1["tier_yellow"], "1000.00");
}

#[sqlx::test]
async fn patch_switches_the_currency_among_the_four_codes(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, settings) = user
        .patch("/api/settings", json!({ "currency": "USD" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["currency"], "USD");
    assert_eq!(settings["tier_green"], "2000.00");
    assert_eq!(user.get("/api/settings").await.1["currency"], "USD");

    for code in ["JPY", "usd", ""] {
        let (status, problem) = user
            .patch("/api/settings", json!({ "currency": code }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{code}");
        assert_eq!(problem["errors"][0]["field"], "currency", "{code}");
    }
    assert_eq!(user.get("/api/settings").await.1["currency"], "USD");
}

#[sqlx::test]
async fn settings_need_a_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    assert_eq!(app.get("/api/settings").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(
        app.patch("/api/settings", json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn p5_the_savings_target_is_a_percent_above_0_up_to_100(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, settings) = user
        .patch("/api/settings", json!({ "savings_target_pct": "20" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["savings_target_pct"], "20.00");
    let (_, full) = user
        .patch("/api/settings", json!({ "savings_target_pct": "100" }))
        .await;
    assert_eq!(full["savings_target_pct"], "100.00");

    for pct in [
        json!("0"),
        json!("100.01"),
        json!("12.345"),
        json!("-1"),
        json!(-1),
    ] {
        let (status, problem) = user
            .patch("/api/settings", json!({ "savings_target_pct": pct }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{pct}");
        assert_eq!(problem["errors"][0]["field"], "savings_target_pct", "{pct}");
    }
    assert_eq!(
        user.get("/api/settings").await.1["savings_target_pct"],
        "100.00"
    );

    let (_, cleared) = user
        .patch("/api/settings", json!({ "savings_target_pct": null }))
        .await;
    assert_eq!(cleared["savings_target_pct"], serde_json::Value::Null);
}
