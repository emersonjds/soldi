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
    let today = chrono::Utc::now().date_naive().to_string();
    assert_eq!(
        settings,
        json!({
            "opening_balance": "0.00",
            "opening_date": today,
            "tier_red": "-500.00",
            "tier_zero": "0.00",
            "tier_yellow": "1000.00",
            "tier_green": "2000.00",
            "savings_goal_pct": null
        })
    );
}

#[sqlx::test]
async fn patch_changes_only_the_given_fields(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, settings) = user
        .patch(
            "/api/settings",
            json!({ "opening_balance": "-120.5", "opening_date": "2026-01-01", "tier_green": "2500", "savings_goal_pct": 15 }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["opening_balance"], "-120.50");
    assert_eq!(settings["opening_date"], "2026-01-01");
    assert_eq!(settings["tier_green"], "2500.00");
    assert_eq!(settings["tier_yellow"], "1000.00");
    assert_eq!(settings["savings_goal_pct"], 15);
    assert_eq!(user.get("/api/settings").await.1, settings);

    let (_, cleared) = user
        .patch("/api/settings", json!({ "savings_goal_pct": null }))
        .await;
    assert_eq!(cleared["savings_goal_pct"], serde_json::Value::Null);
    assert_eq!(cleared["tier_green"], "2500.00");
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

    assert_eq!(user.get("/api/settings").await.1["tier_yellow"], "1000.00");
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
