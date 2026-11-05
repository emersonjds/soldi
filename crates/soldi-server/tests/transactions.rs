mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn spend(user: &TestApp, date: &str, amount: &str, category: &str) -> Value {
    let category_id = user.category_id(category).await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "daily", "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

fn uri(transaction: &Value) -> String {
    format!("/api/transactions/{}", transaction["id"].as_str().unwrap())
}

async fn opened(pool: PgPool, email: &str) -> TestApp {
    let user = TestApp::signed_in(pool, email).await;
    user.open_at("0", "2026-10-01").await;
    user
}

#[sqlx::test]
async fn create_answers_the_entry_with_its_category_and_list_orders_the_month(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let salary = user.category_id("Salário").await;

    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-03", "amount": "5000.5", "kind": "income", "category_id": salary, "note": "  novembro " }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["amount"], "5000.50");
    assert_eq!(created["kind"], "income");
    assert_eq!(created["note"], "novembro");
    assert_eq!(created["date"], "2026-11-03");
    assert_eq!(created["category"]["id"], salary.as_str());
    assert_eq!(created["category"]["name"], "Salário");
    assert_eq!(created["category"]["icon"], "briefcase");
    assert_eq!(created["category"]["color"], "cat-1");
    assert_eq!(created["category"]["kind"], "income");
    let market = spend(&user, "2026-11-05", "12", "Mercado").await;
    assert_eq!(market["note"], Value::Null);
    spend(&user, "2026-10-31", "7", "Mercado").await;
    spend(&user, "2026-12-01", "8", "Mercado").await;

    let (status, november) = user.get("/api/transactions?month=2026-11").await;

    assert_eq!(status, StatusCode::OK);
    let dates: Vec<&str> = november
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["date"].as_str().unwrap())
        .collect();
    assert_eq!(dates, ["2026-11-05", "2026-11-03"]);
    assert_eq!(november[0], market);
    assert_eq!(november[1], created);
    let (_, october) = user.get("/api/transactions?month=2026-10").await;
    assert_eq!(october.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn entries_of_one_day_come_newest_first(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let mut ids = Vec::new();
    for amount in ["1", "2", "3", "4", "5"] {
        let created = spend(&user, "2026-11-05", amount, "Mercado").await;
        ids.push(created["id"].as_str().unwrap().to_string());
    }
    ids.reverse();

    let (_, listed) = user.get("/api/transactions?month=2026-11").await;

    let listed: Vec<&str> = listed
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["id"].as_str().unwrap())
        .collect();
    assert_eq!(listed, ids);
}

#[sqlx::test]
async fn an_entry_before_the_opening_date_is_refused(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("0", "2026-11-05").await;
    let market = user.category_id("Mercado").await;
    let body = |date: &str| json!({ "date": date, "amount": "10", "kind": "daily", "category_id": market });

    let (status, problem) = user.post("/api/transactions", body("2026-11-04")).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:before-opening-date");
    let created = spend(&user, "2026-11-05", "10", "Mercado").await;
    let (status, problem) = user
        .patch(&uri(&created), json!({ "date": "2026-10-31" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:before-opening-date");
    let (_, listed) = user.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed[0]["date"], "2026-11-05");
}

#[sqlx::test]
async fn create_refuses_bad_amounts_notes_and_kinds(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;
    let body = |amount: Value, kind: &str, note: Value| json!({ "date": "2026-11-05", "amount": amount, "kind": kind, "category_id": market, "note": note });

    for (body, field) in [
        (body(json!("10.005"), "daily", Value::Null), "amount"),
        (body(json!("0"), "daily", Value::Null), "amount"),
        (body(json!("-5"), "daily", Value::Null), "amount"),
        (body(json!("10000000000"), "daily", Value::Null), "amount"),
        (body(json!(10), "daily", Value::Null), "amount"),
        (body(json!("10"), "daily", json!("x".repeat(501))), "note"),
        (body(json!("10"), "daily", json!("a\u{0}b")), "note"),
        (body(json!("10"), "income", Value::Null), "category_id"),
        (body(json!("10"), "bill", Value::Null), "category_id"),
    ] {
        let (status, problem) = user.post("/api/transactions", body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
    let (status, _) = user
        .post(
            "/api/transactions",
            body(json!("10.500"), "daily", json!("x".repeat(500))),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let (_, listed) = user.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn an_archived_unknown_or_foreign_category_is_not_found(pool: PgPool) {
    let ana = opened(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let pets = ana.category_id("Pets").await;
    assert_eq!(
        ana.delete(&format!("/api/categories/{pets}")).await.0,
        StatusCode::NO_CONTENT
    );
    let theirs = bia.category_id("Mercado").await;

    for category_id in [pets, theirs, uuid::Uuid::nil().to_string()] {
        let (status, _) = ana
            .post(
                "/api/transactions",
                json!({ "date": "2026-11-05", "amount": "10", "kind": "daily", "category_id": category_id }),
            )
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
}

#[sqlx::test]
async fn patch_changes_only_the_given_fields_and_keeps_kind_and_category_together(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let created = spend(&user, "2026-11-05", "12", "Mercado").await;
    let uri = uri(&created);

    let (status, noted) = user
        .patch(&uri, json!({ "amount": "15.25", "note": "feira" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{noted}");
    assert_eq!(noted["amount"], "15.25");
    assert_eq!(noted["note"], "feira");
    assert_eq!(noted["date"], "2026-11-05");
    assert_eq!(noted["category"]["name"], "Mercado");

    let (_, unchanged) = user.patch(&uri, json!({})).await;
    assert_eq!(unchanged, noted);
    let (_, cleared) = user.patch(&uri, json!({ "note": null })).await;
    assert_eq!(cleared["note"], Value::Null);

    let (status, problem) = user.patch(&uri, json!({ "kind": "bill" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "category_id");
    let (status, problem) = user.patch(&uri, json!({ "amount": "1.001" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "amount");

    let rent = user.category_id("Aluguel").await;
    let (status, moved) = user
        .patch(
            &uri,
            json!({ "kind": "bill", "category_id": rent, "date": "2026-11-01" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "bill");
    assert_eq!(moved["category"]["name"], "Aluguel");
    assert_eq!(moved["date"], "2026-11-01");
    let (_, listed) = user.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed[0], moved);
}

#[sqlx::test]
async fn an_entry_keeps_its_archived_category_until_moved(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let created = spend(&user, "2026-11-05", "12", "Pets").await;
    let pets = created["category"]["id"].as_str().unwrap().to_string();
    user.delete(&format!("/api/categories/{pets}")).await;

    let (status, edited) = user.patch(&uri(&created), json!({ "amount": "13" })).await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["category"]["name"], "Pets");
    let (status, _) = user
        .patch(&uri(&created), json!({ "category_id": pets }))
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn delete_removes_the_entry(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let created = spend(&user, "2026-11-05", "12", "Mercado").await;

    assert_eq!(user.delete(&uri(&created)).await.0, StatusCode::NO_CONTENT);

    assert_eq!(user.delete(&uri(&created)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        user.patch(&uri(&created), json!({ "amount": "1" })).await.0,
        StatusCode::NOT_FOUND
    );
    let (_, listed) = user.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed, json!([]));
}

#[sqlx::test]
async fn another_users_entry_is_not_found(pool: PgPool) {
    let ana = opened(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let created = spend(&ana, "2026-11-05", "12", "Mercado").await;

    assert_eq!(
        bia.patch(&uri(&created), json!({ "amount": "1" })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(bia.delete(&uri(&created)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        bia.get("/api/transactions?month=2026-11").await.1,
        json!([])
    );
    let (_, mine) = ana.get("/api/transactions?month=2026-11").await;
    assert_eq!(mine[0]["amount"], "12.00");
}

#[sqlx::test]
async fn a_bad_month_is_422_a_missing_one_400_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    for month in [
        "2026-13",
        "2026-1",
        "26-11",
        "2026/11",
        "2026-11-01",
        "abcd-ef",
    ] {
        let (status, problem) = user.get(&format!("/api/transactions?month={month}")).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{month}");
        assert_eq!(problem["errors"][0]["field"], "month");
    }
    let (status, problem) = user.get("/api/transactions").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(problem["type"], "urn:soldi:error:bad-request");
    assert_eq!(
        user.delete("/api/transactions/not-a-uuid").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        TestApp::anonymous(pool)
            .get("/api/transactions?month=2026-11")
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
