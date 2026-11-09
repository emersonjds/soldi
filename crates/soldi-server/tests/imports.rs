mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{TestApp, body_json};
use serde_json::{Value, json};
use sqlx::PgPool;

const SAMPLE: &[u8] = include_bytes!("fixtures/termometro-sample.xlsx");
const BAD: &[u8] = include_bytes!("fixtures/termometro-bad.xlsx");
const BOUNDARY: &str = "soldi-boundary";

fn multipart(field: &str, bytes: &[u8]) -> Vec<u8> {
    let mut body = format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"t.xlsx\"\r\n\
         Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
    body
}

async fn upload_as(user: &TestApp, field: &str, bytes: &[u8]) -> (StatusCode, Value) {
    post_multipart(user, multipart(field, bytes)).await
}

async fn post_multipart(user: &TestApp, body: Vec<u8>) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(Method::POST)
        .uri("/api/imports/xlsx")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={BOUNDARY}"),
        );
    if let Some(cookie) = &user.cookie {
        request = request.header(header::COOKIE, cookie);
    }
    let response = user.send(request.body(Body::from(body)).unwrap()).await;
    let status = response.status();
    (status, body_json(response).await)
}

async fn upload(user: &TestApp, bytes: &[u8]) -> (StatusCode, Value) {
    upload_as(user, "file", bytes).await
}

fn field_of(problem: &Value) -> &Value {
    &problem["errors"][0]["field"]
}

#[sqlx::test]
async fn the_preview_sums_each_year_and_writes_no_entry(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, preview) = upload(&ana, SAMPLE).await;

    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(
        preview["years"],
        json!([
            { "year": 2025, "transactions": 6, "income_total": "6383.00", "bills_total": "368.00",
              "daily_total": "133.44" },
            { "year": 2026, "transactions": 6, "income_total": "715.00", "bills_total": "2354.44",
              "daily_total": "210.00" },
        ])
    );
    assert_eq!(preview["errors"], json!([]));
    assert!(
        preview["token"]
            .as_str()
            .unwrap()
            .parse::<uuid::Uuid>()
            .is_ok()
    );
    let (_, entries) = ana.get("/api/transactions?month=2026-01").await;
    assert_eq!(entries, json!([]));
}

#[sqlx::test]
async fn a_formula_other_than_a_sum_is_listed_in_the_preview(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, preview) = upload(&ana, BAD).await;

    assert_eq!(status, StatusCode::OK, "{preview}");
    let errors = preview["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 1, "{preview}");
    assert_eq!(
        (&errors[0]["sheet"], &errors[0]["cell"]),
        (&json!("2026"), &json!("C5"))
    );
    assert_eq!(preview["years"][0]["transactions"], 1);
}

#[sqlx::test]
async fn an_upload_that_is_not_an_xlsx_workbook_is_a_422(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem) = upload(&ana, b"date,amount\n2026-01-01,10\n").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "file");

    let (status, problem) = upload_as(&ana, "workbook", SAMPLE).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "file");

    let mut truncated = multipart("file", SAMPLE);
    truncated.truncate(SAMPLE.len() / 2);
    let (status, problem) = post_multipart(&ana, truncated).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "file");

    let (status, problem) = ana.post("/api/imports/xlsx", json!({ "file": "x" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "file");
}

#[sqlx::test]
async fn a_file_over_5_mb_is_a_413(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    for size in [5 * 1024 * 1024 + 1, 6 * 1024 * 1024] {
        let (status, problem) = upload(&ana, &vec![b'x'; size]).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE, "{size}: {problem}");
        assert_eq!(problem["type"], "urn:soldi:error:too-large");
    }
}

#[sqlx::test]
async fn importing_requires_a_session(pool: PgPool) {
    let anonymous = TestApp::anonymous(pool);

    let (status, _) = upload(&anonymous, SAMPLE).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

async fn token_of(user: &TestApp, bytes: &[u8]) -> Value {
    let (status, preview) = upload(user, bytes).await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    preview["token"].clone()
}

async fn confirm(user: &TestApp, token: &Value, date: &str) -> (StatusCode, Value) {
    user.post(
        "/api/imports/xlsx/confirm",
        json!({ "token": token, "opening_balance": "1000", "opening_date": date }),
    )
    .await
}

async fn import_sample(user: &TestApp) -> Value {
    let token = token_of(user, SAMPLE).await;
    let (status, result) = confirm(user, &token, "2025-02-28").await;
    assert_eq!(status, StatusCode::OK, "{result}");
    result
}

async fn balance_of_january(user: &TestApp) -> (Value, Value) {
    let (status, month) = user.get("/api/months/2026-01").await;
    assert_eq!(status, StatusCode::OK, "{month}");
    (
        month["balance_today"].clone(),
        month["totals"]["daily"].clone(),
    )
}

#[sqlx::test]
async fn confirming_writes_the_rows_and_a_second_import_of_the_year_replaces_them(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    let mercado = ana.category_id("Mercado").await;
    let (status, manual) = ana
        .post(
            "/api/transactions",
            json!({ "date": "2026-01-15", "amount": "10", "kind": "daily", "category_id": mercado }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{manual}");

    let result = import_sample(&ana).await;

    assert_eq!(
        result,
        json!({ "transactions": 12, "years": [2025, 2026], "skipped": [] })
    );
    // 1000 + 2025 (6383 - 368 - 133.44) + January (715 - 94.88 - 210) - 10 by hand.
    let expected = (json!("7281.68"), json!("220.00"));
    assert_eq!(balance_of_january(&ana).await, expected);
    let (_, march) = ana.get("/api/transactions?month=2026-03").await;
    assert_eq!(march.as_array().unwrap().len(), 1, "{march}");
    assert_eq!(march[0]["note"], "Planilha 2026");
    assert_eq!(march[0]["amount"], "2259.56");
    assert_eq!(march[0]["category"]["name"], "Importado (conta)");
    assert_eq!(march[0]["category"]["icon"], "file-spreadsheet");
    assert_eq!(march[0]["category"]["color"], "cat-14");
    let (_, me) = ana.get("/api/auth/me").await;
    assert_eq!(me["onboarded"], true);

    import_sample(&bia).await;
    import_sample(&ana).await;

    assert_eq!(balance_of_january(&ana).await, expected);
    let (_, categories) = ana.get("/api/categories").await;
    let imported = categories
        .as_array()
        .unwrap()
        .iter()
        .filter(|category| category["name"].as_str().unwrap().starts_with("Importado"))
        .count();
    assert_eq!(imported, 3);
    let (_, settings) = ana.get("/api/settings").await;
    assert_eq!(
        (&settings["opening_balance"], &settings["opening_date"]),
        (&json!("1000.00"), &json!("2025-02-28"))
    );
}

#[sqlx::test]
async fn a_token_confirms_once_for_its_owner_within_15_minutes(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let token = token_of(&ana, SAMPLE).await;

    let (status, _) = confirm(&bia, &token, "2025-02-28").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = confirm(&ana, &json!(uuid::Uuid::new_v4()), "2025-02-28").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, problem) = confirm(&ana, &token, "2025-03-01").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "opening_date");
    let (status, problem) = ana
        .post(
            "/api/imports/xlsx/confirm",
            json!({ "token": token, "opening_balance": "1.001", "opening_date": "2025-01-01" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(field_of(&problem), "opening_balance");

    let (status, _) = confirm(&ana, &token, "2025-02-28").await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = confirm(&ana, &token, "2025-02-28").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let token = token_of(&ana, SAMPLE).await;
    sqlx::query("UPDATE import_previews SET expires_at = now() - interval '1 minute'")
        .execute(&pool)
        .await
        .unwrap();
    let (status, problem) = confirm(&ana, &token, "2025-02-28").await;
    assert_eq!(status, StatusCode::GONE, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:import-expired");
}

#[sqlx::test]
async fn a_preview_with_errors_is_confirmed_only_when_skipping_them(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let token = token_of(&ana, BAD).await;
    let confirm_skipping = |skip: bool| {
        let ana = ana.clone();
        let token = token.clone();
        async move {
            ana.post(
                "/api/imports/xlsx/confirm",
                json!({ "token": token, "opening_balance": "0", "opening_date": "2026-01-01",
                        "skip_errors": skip }),
            )
            .await
        }
    };

    let (status, problem) = confirm(&ana, &token, "2026-01-01").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:import-has-errors");
    let (status, _) = confirm_skipping(false).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, entries) = ana.get("/api/transactions?month=2026-01").await;
    assert_eq!(entries, json!([]));

    let (status, result) = confirm_skipping(true).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(
        result,
        json!({ "transactions": 1, "years": [2026],
                "skipped": [{ "sheet": "2026", "cell": "C5" }] })
    );
    let (_, entries) = ana.get("/api/transactions?month=2026-01").await;
    assert_eq!(entries.as_array().unwrap().len(), 1, "{entries}");
}

#[sqlx::test]
async fn an_import_with_no_free_color_for_its_category_writes_nothing(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    for n in 14..=24 {
        let (status, created) = ana
            .post(
                "/api/categories",
                json!({ "name": format!("Conta {n}"), "kind": "bill" }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{created}");
    }
    let token = token_of(&ana, SAMPLE).await;

    let (status, problem) = confirm(&ana, &token, "2025-02-28").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:palette-full");
    let (_, march) = ana.get("/api/transactions?month=2026-03").await;
    assert_eq!(march, json!([]));
}
