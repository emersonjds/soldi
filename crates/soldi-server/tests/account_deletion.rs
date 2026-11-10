mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use common::{PASSWORD, TestApp, body_json, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn delete_request(user: &TestApp, password: &str) -> Request<Body> {
    let body = json!({ "password": password });
    json_request(
        Method::DELETE,
        "/api/me",
        user.cookie.as_deref(),
        Some(body),
    )
}

async fn delete_account(user: &TestApp, password: &str) -> Response {
    user.send(delete_request(user, password)).await
}

async fn created(user: &TestApp, uri: &str, body: Value) -> Value {
    let (status, created) = user.post(uri, body).await;
    assert_eq!(status, StatusCode::CREATED, "{uri} {created}");
    created
}

/// A subcategory, a cofrinho with a deposit and a resgate, a recurring bill with a payment,
/// a repeated series and a reset link.
async fn fill_account(pool: &PgPool, user: &TestApp, email: &str) {
    let today = soldi_server::today_sao_paulo().to_string();
    let mercado = user.category_id("Mercado").await;
    let feira = created(
        user,
        "/api/categories",
        json!({ "name": "Feira", "kind": "daily", "parent_id": mercado }),
    )
    .await;
    created(
        user,
        "/api/transactions",
        json!({ "date": today, "amount": "30", "kind": "daily", "category_id": feira["id"], "repeat_months": 3 }),
    )
    .await;

    let economia = user.category_id("Economia").await;
    let reserva = created(
        user,
        "/api/categories",
        json!({ "name": "Reserva", "kind": "bill", "parent_id": economia, "target": "1000" }),
    )
    .await;
    created(
        user,
        "/api/transactions",
        json!({ "date": today, "amount": "200", "kind": "bill", "category_id": reserva["id"] }),
    )
    .await;
    let withdraw = format!(
        "/api/cofrinhos/{}/withdraw",
        reserva["id"].as_str().unwrap()
    );
    created(user, &withdraw, json!({ "date": today, "amount": "50" })).await;

    let aluguel = user.category_id("Aluguel").await;
    let bill = created(
        user,
        "/api/bills",
        json!({ "name": "Aluguel", "amount": "2000", "due_day": 5, "category_id": aluguel }),
    )
    .await;
    let pay = format!("/api/bills/{}/pay", bill["id"].as_str().unwrap());
    created(user, &pay, json!({ "date": today })).await;

    sqlx::query(
        "INSERT INTO password_resets (user_id, token_hash)
         SELECT id, sha256(convert_to(email, 'UTF8')) FROM users WHERE email = $1",
    )
    .bind(email)
    .execute(pool)
    .await
    .unwrap();
}

/// Rows per table that has a `user_id` column, plus the `users` row itself.
async fn rows_of(pool: &PgPool, user_id: Uuid) -> Vec<(String, i64)> {
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY table_name",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    let all: Vec<String> = sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
           AND table_name NOT IN ('_sqlx_migrations', 'users') ORDER BY table_name",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    assert_eq!(
        all, tables,
        "a table without user_id must be checked for user data"
    );
    let mut rows = Vec::new();
    for table in tables.into_iter().chain(["users".to_string()]) {
        let column = if table == "users" { "id" } else { "user_id" };
        let count: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT count(*) FROM \"{table}\" WHERE {column} = $1"
        )))
        .bind(user_id)
        .fetch_one(pool)
        .await
        .unwrap();
        rows.push((table, count));
    }
    rows
}

async fn id_of(user: &TestApp) -> Uuid {
    let (_, me) = user.get("/api/auth/me").await;
    me["id"].as_str().unwrap().parse().unwrap()
}

#[sqlx::test]
async fn deleting_a_full_account_leaves_no_row_of_it_and_spares_others(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    fill_account(&pool, &ana, "ana@example.com").await;
    fill_account(&pool, &bia, "bia@example.com").await;
    let (ana_id, bia_id) = (id_of(&ana).await, id_of(&bia).await);
    let before = rows_of(&pool, ana_id).await;
    assert!(before.iter().all(|(_, count)| *count > 0), "{before:?}");
    let bia_before = rows_of(&pool, bia_id).await;

    let response = delete_account(&ana, PASSWORD).await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let cleared = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cleared.starts_with("soldi_session=;"), "{cleared}");
    assert!(cleared.contains("Max-Age=0"), "{cleared}");
    let after = rows_of(&pool, ana_id).await;
    assert!(after.iter().all(|(_, count)| *count == 0), "{after:?}");
    assert_eq!(rows_of(&pool, bia_id).await, bia_before);
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(bia.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn the_same_email_can_sign_up_again_after_deletion(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let old_id = id_of(&ana).await;

    assert_eq!(
        delete_account(&ana, PASSWORD).await.status(),
        StatusCode::NO_CONTENT
    );

    let again = ana.another_user("ana@example.com").await;
    assert_ne!(id_of(&again).await, old_id);
}

#[sqlx::test]
async fn a_wrong_password_deletes_nothing_and_keeps_the_session(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let ana_id = id_of(&ana).await;
    let before = rows_of(&pool, ana_id).await;

    let response = delete_account(&ana, "wrong horse").await;

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body_json(response).await["type"],
        "urn:soldi:error:wrong-password"
    );
    assert_eq!(rows_of(&pool, ana_id).await, before);
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn the_eleventh_attempt_is_limited_with_the_password_change_budget(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let change = json!({ "current_password": "wrong horse", "new_password": "battery staple" });
    for attempt in 0..5 {
        let (status, _) = ana.post("/api/me/password", change.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{attempt}");
    }
    for attempt in 0..5 {
        let status = delete_account(&ana, "wrong horse").await.status();
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{attempt}");
    }

    let response = delete_account(&ana, PASSWORD).await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        body_json(response).await["type"],
        "urn:soldi:error:rate-limited"
    );
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        delete_account(&bia, "wrong horse").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[sqlx::test]
async fn deleting_needs_a_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = delete_account(&app, PASSWORD).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        body_json(response).await["type"],
        "urn:soldi:error:unauthorized"
    );
}

#[sqlx::test]
async fn deleting_from_another_origin_is_forbidden(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let mut request = delete_request(&ana, PASSWORD);
    let headers = request.headers_mut();
    headers.insert(header::ORIGIN, "https://evil.example".parse().unwrap());
    headers.insert(header::HOST, "soldi.app".parse().unwrap());

    assert_eq!(ana.send(request).await.status(), StatusCode::FORBIDDEN);
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn an_unknown_field_is_refused(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let body = json!({ "password": PASSWORD, "confirm": "EXCLUIR" });
    let request = json_request(Method::DELETE, "/api/me", ana.cookie.as_deref(), Some(body));

    assert_eq!(
        ana.send(request).await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn a_hash_changed_since_the_check_deletes_nothing(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let ana_id: Uuid = ana.get("/api/auth/me").await.1["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let mut conn = pool.acquire().await.unwrap();
    let stale = soldi_server::auth::repo::find_password_hash(&mut conn, ana_id)
        .await
        .unwrap();
    sqlx::query("UPDATE users SET password_hash = 'changed elsewhere' WHERE id = $1")
        .bind(ana_id)
        .execute(&pool)
        .await
        .unwrap();

    let deleted = soldi_server::auth::repo::delete_user(&mut conn, ana_id, stale.as_deref())
        .await
        .unwrap();

    assert!(!deleted);
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE id = $1")
        .bind(ana_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 1);
}
