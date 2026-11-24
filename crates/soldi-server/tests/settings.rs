mod common;

use axum::http::StatusCode;
use chrono::{Datelike, Days, Months, NaiveDate};
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
            "savings_target_pct": null,
            "daily_estimate": null,
            "daily_estimate_on": false
        })
    );
}

#[sqlx::test]
async fn r_v_one_patch_saves_the_daily_estimate_and_turns_it_on(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = TestApp::signed_in(pool, "bia@example.com").await;

    let (status, settings) = ana
        .patch(
            "/api/settings",
            json!({ "daily_estimate": "50", "daily_estimate_on": true }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["daily_estimate"], "50.00");
    assert_eq!(settings["daily_estimate_on"], true);

    let (status, other) = bia
        .patch(
            "/api/settings",
            json!({ "daily_estimate": "10.00", "daily_estimate_on": true }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{other}");
    assert_eq!(ana.get("/api/settings").await.1, settings);

    let (_, off) = ana
        .patch("/api/settings", json!({ "daily_estimate_on": false }))
        .await;
    assert_eq!(off["daily_estimate"], "50.00");
    assert_eq!(off["daily_estimate_on"], false);
    let (_, cleared) = bia
        .patch("/api/settings", json!({ "daily_estimate": null }))
        .await;
    assert_eq!(cleared["daily_estimate"], serde_json::Value::Null);
    assert_eq!(cleared["daily_estimate_on"], false);
}

#[sqlx::test]
async fn r_v_refuses_a_daily_estimate_out_of_range_or_on_without_one(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    for value in [
        json!("0"),
        json!("0.00"),
        json!("-5.00"),
        json!("0.001"),
        json!("50.005"),
        json!("10000.01"),
        json!(50),
    ] {
        let (status, problem) = user
            .patch("/api/settings", json!({ "daily_estimate": value }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{value}");
        assert_eq!(problem["type"], "urn:soldi:error:validation", "{value}");
        assert_eq!(problem["errors"][0]["field"], "daily_estimate", "{value}");
    }

    let (status, problem) = user
        .patch("/api/settings", json!({ "daily_estimate_on": true }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "daily_estimate_on");

    let settings = user.get("/api/settings").await.1;
    assert_eq!(settings["daily_estimate"], serde_json::Value::Null);
    assert_eq!(settings["daily_estimate_on"], false);
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
    let (status, other) = user
        .patch("/api/settings", json!({ "tier_green": "2500" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{other}");
    assert_eq!(other["savings_target_pct"], "100.00");

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

async fn log(user: &TestApp, date: NaiveDate, kind: &str, amount: &str, category: &str) {
    let category_id = user.category_id(category).await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": kind, "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

#[sqlx::test]
async fn r_s_the_suggestion_is_last_months_cash_diario_per_day(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = TestApp::signed_in(pool.clone(), "bia@example.com").await;
    let cia = TestApp::signed_in(pool.clone(), "cia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let first = today.with_day(1).unwrap();
    let to = first.pred_opt().unwrap();
    let from = to - Days::new(29);
    for user in [&ana, &bia] {
        user.open_at("0", &from.to_string()).await;
    }
    let months_back = |n| first.checked_sub_months(Months::new(n)).unwrap();
    let window_start = months_back(3);
    cia.open_at("0", &months_back(5).to_string()).await;
    log(&cia, months_back(4), "daily", "5000.00", "Mercado").await;
    let window_days = (to - window_start).num_days() + 1;
    let inside = format!("{}.00", window_days * 10);
    log(&cia, window_start, "daily", &inside, "Mercado").await;
    log(&ana, from, "daily", "100.00", "Mercado").await;
    log(&ana, to, "daily", "200.00", "Mercado").await;
    log(&ana, to, "income", "1000.00", "Salário").await;
    log(&ana, to, "bill", "5000.00", "Aluguel").await;
    log(&ana, today, "daily", "50.00", "Mercado").await;
    let category_id = ana.category_id("Cartão").await;
    let (_, card) = ana
        .post(
            "/api/bills",
            json!({ "name": "Nubank", "due_day": 10, "closing_day": 3, "category_id": category_id }),
        )
        .await;
    let market = ana.category_id("Mercado").await;
    let (status, spend) = ana
        .post(
            "/api/transactions",
            json!({ "date": from, "amount": "900.00", "kind": "daily",
                    "category_id": market, "card_id": card["id"] }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{spend}");
    let light = ana.category_id("Luz").await;
    let (_, bill) = ana
        .post(
            "/api/bills",
            json!({ "name": "Luz", "amount": "120.00", "due_day": 5, "category_id": light }),
        )
        .await;
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id, card_id)
         SELECT id, $1, 300, 'daily', $2::uuid, $3::uuid FROM users WHERE email = 'ana@example.com'",
    )
    .bind(to)
    .bind(&market)
    .bind(bill["id"].as_str().unwrap())
    .execute(&pool)
    .await
    .unwrap();
    log(&bia, from, "daily", "700.00", "Mercado").await;

    let (status, suggestion) = ana.get("/api/settings/daily-estimate-suggestion").await;

    assert_eq!(status, StatusCode::OK, "{suggestion}");
    assert_eq!(
        suggestion,
        json!({ "amount": "20.00", "from": from, "to": to })
    );
    let archived = ana
        .delete(&format!("/api/bills/{}", card["id"].as_str().unwrap()))
        .await;
    assert_eq!(archived.0, StatusCode::NO_CONTENT);
    assert_eq!(
        ana.get("/api/settings/daily-estimate-suggestion").await.1,
        suggestion
    );
    assert_eq!(
        bia.get("/api/settings/daily-estimate-suggestion").await.1["amount"],
        "23.33"
    );
    assert_eq!(
        cia.get("/api/settings/daily-estimate-suggestion").await.1,
        json!({ "amount": "10.00", "from": window_start, "to": to })
    );
}

#[sqlx::test]
async fn r_s_a_fresh_user_gets_no_suggestion_and_it_needs_a_session(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let (status, suggestion) = user.get("/api/settings/daily-estimate-suggestion").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(suggestion, serde_json::Value::Null);
    assert_eq!(
        TestApp::anonymous(pool)
            .get("/api/settings/daily-estimate-suggestion")
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
