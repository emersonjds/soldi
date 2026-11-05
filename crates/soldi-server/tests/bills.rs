mod common;

use axum::http::StatusCode;
use common::TestApp;
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
    assert_eq!(bia.get("/api/bills").await.1, serde_json::json!([]));
}

#[sqlx::test]
async fn bills_need_a_session(pool: PgPool) {
    assert_eq!(
        TestApp::anonymous(pool).get("/api/bills").await.0,
        StatusCode::UNAUTHORIZED
    );
}
