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
    let response = user
        .send(request.body(Body::from(multipart(field, bytes))).unwrap())
        .await;
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
              "daily_total": "133.44", "savings_months": 2 },
            { "year": 2026, "transactions": 6, "income_total": "715.00", "bills_total": "2354.44",
              "daily_total": "210.00", "savings_months": 0 },
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
    assert_eq!(preview["years"][0]["savings_months"], 1);
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
