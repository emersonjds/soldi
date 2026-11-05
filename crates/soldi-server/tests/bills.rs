mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use soldi_types::bills::CreateBill;
use sqlx::PgPool;
use uuid::Uuid;

async fn user_id(app: &TestApp) -> Uuid {
    app.get("/api/auth/me").await.1["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

async fn category_id(app: &TestApp, name: &str) -> Uuid {
    let (_, categories) = app.get("/api/categories").await;
    categories
        .as_array()
        .unwrap()
        .iter()
        .find(|category| category["name"] == name)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[sqlx::test]
async fn bills_list_only_the_callers_bills(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let light = category_id(&ana, "Luz").await;
    let mut conn = pool.acquire().await.unwrap();
    let bill = CreateBill {
        name: "Luz".into(),
        amount: "120.5".parse().unwrap(),
        due_day: 10,
        category_id: light,
    };
    soldi_server::bills::repo::insert_all(&mut conn, user_id(&ana).await, &[bill])
        .await
        .unwrap();

    let (status, bills) = ana.get("/api/bills").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(bills[0]["name"], "Luz");
    assert_eq!(bills[0]["amount"], "120.50");
    assert_eq!(bills[0]["due_day"], 10);
    assert_eq!(bills[0]["category_id"], light.to_string());
    assert_eq!(bills[0]["active"], true);
    assert_eq!(bia.get("/api/bills").await.1, json!([]));
}

#[sqlx::test]
async fn bills_need_a_session(pool: PgPool) {
    let anonymous = TestApp::anonymous(pool);
    let uri = format!("/api/bills/{}", Uuid::nil());

    assert_eq!(
        anonymous.get("/api/bills").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        anonymous.post("/api/bills", json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        anonymous.patch(&uri, json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(anonymous.delete(&uri).await.0, StatusCode::UNAUTHORIZED);
}

async fn create(app: &TestApp, body: serde_json::Value) -> serde_json::Value {
    let (status, created) = app.post("/api/bills", body).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

fn rent(category_id: Uuid) -> serde_json::Value {
    json!({ "name": " Aluguel ", "amount": "2259.56", "due_day": 5, "category_id": category_id })
}

fn bill_uri(bill: &serde_json::Value) -> String {
    format!("/api/bills/{}", bill["id"].as_str().unwrap())
}

#[sqlx::test]
async fn a_created_bill_is_listed_by_due_day(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let light = category_id(&ana, "Luz").await;
    let housing = category_id(&ana, "Aluguel").await;

    create(
        &ana,
        json!({ "name": "Luz", "amount": "120", "due_day": 10, "category_id": light }),
    )
    .await;
    let created = create(&ana, rent(housing)).await;

    assert_eq!(created["name"], "Aluguel");
    assert_eq!(created["amount"], "2259.56");
    assert_eq!(created["due_day"], 5);
    assert_eq!(created["category_id"], housing.to_string());
    assert_eq!(created["active"], true);
    let (_, listed) = ana.get("/api/bills").await;
    assert_eq!(listed[0], created);
    assert_eq!(listed[1]["name"], "Luz");
}

#[sqlx::test]
async fn create_checks_each_field_and_rule_11(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let housing = category_id(&ana, "Aluguel").await;
    let market = category_id(&ana, "Mercado").await;
    let theirs = category_id(&bia, "Aluguel").await;
    let pets = category_id(&ana, "Seguro").await;
    ana.delete(&format!("/api/categories/{pets}")).await;
    let body = |name: &str, amount: &str, due_day: i64, category: Uuid| json!({ "name": name, "amount": amount, "due_day": due_day, "category_id": category });

    for (body, field) in [
        (body(" ", "10", 5, housing), "name"),
        (body("Luz", "0", 5, housing), "amount"),
        (body("Luz", "1.001", 5, housing), "amount"),
        (body("Luz", "10", 0, housing), "due_day"),
        (body("Luz", "10", 32, housing), "due_day"),
        (body("Luz", "10", 5, market), "category_id"),
        (body("Luz", "10", 5, theirs), "category_id"),
        (body("Luz", "10", 5, pets), "category_id"),
        (body("Luz", "10", 5, Uuid::nil()), "category_id"),
    ] {
        let (status, problem) = ana.post("/api/bills", body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

#[sqlx::test]
async fn patch_changes_the_given_fields_and_inactive_bills_leave_the_default_list(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let housing = category_id(&ana, "Aluguel").await;
    let condo = category_id(&ana, "Condomínio").await;
    let created = create(&ana, rent(housing)).await;
    let uri = bill_uri(&created);

    let (status, changed) = ana
        .patch(
            &uri,
            json!({ "name": "Casa", "amount": "2300", "due_day": 31, "category_id": condo }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{changed}");
    assert_eq!(
        (&changed["name"], &changed["amount"], &changed["due_day"]),
        (&json!("Casa"), &json!("2300.00"), &json!(31))
    );
    assert_eq!(changed["category_id"], condo.to_string());
    assert_eq!(ana.patch(&uri, json!({})).await.1, changed);

    let (status, paused) = ana.patch(&uri, json!({ "active": false })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(paused["active"], false);
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
    let (_, everything) = ana.get("/api/bills?include_inactive=true").await;
    assert_eq!(everything, json!([paused]));

    for (body, field) in [
        (json!({ "amount": "-1" }), "amount"),
        (json!({ "due_day": 40 }), "due_day"),
        (json!({ "name": "" }), "name"),
        (
            json!({ "category_id": category_id(&ana, "Mercado").await }),
            "category_id",
        ),
    ] {
        let (status, problem) = ana.patch(&uri, body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
}

#[sqlx::test]
async fn delete_archives_the_bill(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&created);

    assert_eq!(ana.delete(&uri).await.0, StatusCode::NO_CONTENT);

    assert_eq!(ana.delete(&uri).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        ana.patch(&uri, json!({ "active": true })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        ana.get("/api/bills?include_inactive=true").await.1,
        json!([])
    );
}

#[sqlx::test]
async fn another_users_bill_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&created);

    assert_eq!(
        bia.patch(&uri, json!({ "amount": "1" })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(bia.delete(&uri).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        bia.delete("/api/bills/not-a-uuid").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(ana.get("/api/bills").await.1[0]["amount"], "2259.56");
}
