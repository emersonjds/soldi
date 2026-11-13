mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn category_id(app: &TestApp, name: &str) -> String {
    let (_, categories) = app.get("/api/categories").await;
    categories
        .as_array()
        .unwrap()
        .iter()
        .find(|category| category["name"] == name)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string()
}

fn bill(name: &str, amount: &str, due_day: i64, category_id: &str) -> Value {
    json!({ "name": name, "amount": amount, "due_day": due_day, "category_id": category_id })
}

#[sqlx::test]
async fn onboarding_saves_balance_and_bills_once(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let rent = category_id(&user, "Aluguel").await;
    let light = category_id(&user, "Luz").await;
    let body = json!({
        "opening_balance": "-250.75",
        "opening_date": "2026-11-01",
        "currency": "EUR",
        "bills": [bill(" Aluguel ", "1500", 5, &rent), bill("Luz", "120.5", 10, &light)],
    });

    let (status, onboarded) = user.post("/api/onboarding", body.clone()).await;

    assert_eq!(status, StatusCode::OK, "{onboarded}");
    assert_eq!(onboarded["onboarded"], true);
    assert_eq!(onboarded["email"], "ana@example.com");
    assert_eq!(user.get("/api/auth/me").await.1, onboarded);
    let (_, settings) = user.get("/api/settings").await;
    assert_eq!(settings["opening_balance"], "-250.75");
    assert_eq!(settings["opening_date"], "2026-11-01");
    assert_eq!(settings["tier_green"], "2000.00");
    assert_eq!(settings["currency"], "EUR");
    let (_, bills) = user.get("/api/bills").await;
    assert_eq!(bills[0]["name"], "Aluguel");
    assert_eq!(bills[0]["amount"], "1500.00");
    assert_eq!(bills[1]["category_id"], light.as_str());

    let (status, problem) = user.post("/api/onboarding", body).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:soldi:error:already-onboarded");
    assert_eq!(user.get("/api/bills").await.1.as_array().unwrap().len(), 2);
}

#[sqlx::test]
async fn bills_are_optional(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, onboarded) = user
        .post(
            "/api/onboarding",
            json!({ "opening_balance": "0", "opening_date": "2026-11-05" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{onboarded}");
    assert_eq!(onboarded["onboarded"], true);
    assert_eq!(user.get("/api/bills").await.1, json!([]));
    assert_eq!(user.get("/api/settings").await.1["currency"], "BRL");
}

#[sqlx::test]
async fn a_bad_field_saves_nothing_and_names_its_path(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let light = category_id(&ana, "Luz").await;
    let market = category_id(&ana, "Mercado").await;
    let bias_light = category_id(&bia, "Luz").await;
    let good = bill("Luz", "10", 10, &light);
    let many: Vec<Value> = (0..51).map(|_| good.clone()).collect();

    for (opening_balance, bills, field) in [
        ("10.555", json!([good]), "opening_balance"),
        (
            "10",
            json!([good, bill("Luz", "0", 10, &light)]),
            "bills[1].amount",
        ),
        ("10", json!([bill("", "1", 10, &light)]), "bills[0].name"),
        (
            "10",
            json!([bill("Luz", "1", 32, &light)]),
            "bills[0].due_day",
        ),
        (
            "10",
            json!([good, bill("Feira", "1", 3, &market)]),
            "bills[1].category_id",
        ),
        (
            "10",
            json!([bill("Luz", "1", 3, &bias_light)]),
            "bills[0].category_id",
        ),
        ("10", json!(many), "bills"),
        (
            "10",
            json!([good, { "name": "Porto", "due_day": 10, "closing_day": 3, "category_id": light }]),
            "bills[1].closing_day",
        ),
        (
            "10",
            json!([good, { "name": "Fies", "amount": "300", "due_day": 10, "installments": 6,
                           "last_month": "2027-01-01", "category_id": light }]),
            "bills[1].installments",
        ),
    ] {
        let body = json!({ "opening_balance": opening_balance, "opening_date": "2026-11-01", "bills": bills });
        let (status, problem) = ana.post("/api/onboarding", body).await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{field}: {problem}"
        );
        assert_eq!(problem["errors"][0]["field"], field);
    }

    assert_eq!(ana.get("/api/auth/me").await.1["onboarded"], false);
    assert_eq!(ana.get("/api/settings").await.1["opening_balance"], "0.00");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

#[sqlx::test]
async fn a_wrong_shape_is_a_422_and_no_session_a_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let (status, problem) = user
        .post("/api/onboarding", json!({ "opening_balance": "1" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "opening_date");
    let (status, problem) = user
        .post(
            "/api/onboarding",
            json!({ "opening_balance": "1", "opening_date": "2026-11-05", "currency": "JPY" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "currency");
    assert_eq!(
        TestApp::anonymous(pool)
            .post("/api/onboarding", json!({}))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
