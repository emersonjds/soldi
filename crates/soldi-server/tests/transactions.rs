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
    assert_eq!(created["category"]["color"], "cat-11");
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

#[sqlx::test]
async fn the_list_filters_by_category_and_a_foreign_category_lists_nothing(pool: PgPool) {
    let ana = opened(pool.clone(), "ana@example.com").await;
    let bia = opened(pool, "bia@example.com").await;
    let market = spend(&ana, "2026-11-05", "12", "Mercado").await;
    spend(&ana, "2026-11-06", "30", "Comida fora").await;
    spend(&ana, "2026-10-06", "9", "Mercado").await;
    spend(&bia, "2026-11-05", "40", "Mercado").await;
    let category = market["category"]["id"].as_str().unwrap();

    let (status, listed) = ana
        .get(&format!(
            "/api/transactions?month=2026-11&category_id={category}"
        ))
        .await;

    assert_eq!(status, StatusCode::OK, "{listed}");
    assert_eq!(listed, json!([market]));
    let (status, theirs) = bia
        .get(&format!(
            "/api/transactions?month=2026-11&category_id={category}"
        ))
        .await;
    assert_eq!((status, theirs), (StatusCode::OK, json!([])));
    let (status, _) = ana
        .get("/api/transactions?month=2026-11&category_id=nope")
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

async fn repeat(user: &TestApp, date: &str, amount: &str, months: i64) -> Value {
    let category_id = user.category_id("Mercado").await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "daily", "category_id": category_id, "repeat_months": months }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

async fn month(user: &TestApp, month: &str) -> Vec<Value> {
    let (status, listed) = user.get(&format!("/api/transactions?month={month}")).await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    listed.as_array().unwrap().clone()
}

/// The single entry of `month`.
async fn only(user: &TestApp, of: &str) -> Value {
    let entries = month(user, of).await;
    assert_eq!(entries.len(), 1, "{of}: {entries:?}");
    entries[0].clone()
}

fn place(entry: &Value) -> (i64, i64) {
    let series = &entry["series"];
    (
        series["position"].as_i64().unwrap(),
        series["total"].as_i64().unwrap(),
    )
}

#[sqlx::test]
async fn r1_r2_r7_twelve_months_write_twelve_exact_entries_on_clamped_dates(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;

    let created = repeat(&user, "2027-01-31", "1234.57", 12).await;

    assert_eq!(place(&created), (1, 12));
    assert_eq!(created["series"]["last_date"], "2027-12-31");
    assert_eq!(
        only(&user, "2027-03").await["series"]["last_date"],
        "2027-12-31"
    );
    assert_eq!(created["amount"], "1234.57");
    assert_eq!(created["date"], "2027-01-31");
    let series = created["series"]["id"].clone();
    let months = [
        ("2027-01", "2027-01-31"),
        ("2027-02", "2027-02-28"),
        ("2027-03", "2027-03-31"),
        ("2027-04", "2027-04-30"),
        ("2027-12", "2027-12-31"),
    ];
    for (of, date) in months {
        let entry = only(&user, of).await;
        assert_eq!(entry["date"], date);
        assert_eq!(entry["amount"], "1234.57");
        assert_eq!(entry["category"]["name"], "Mercado");
        assert_eq!(entry["series"]["id"], series);
    }
    assert_eq!(place(&only(&user, "2027-03").await), (3, 12));
    assert_eq!(place(&only(&user, "2027-12").await), (12, 12));
    assert!(month(&user, "2028-01").await.is_empty());
    let mut total = 0;
    for of in 1..=12 {
        total += month(&user, &format!("2027-{of:02}")).await.len();
    }
    assert_eq!(total, 12);
}

#[sqlx::test]
async fn r3_copies_leave_the_originals_month_as_a_single_entry_would(pool: PgPool) {
    let ana = opened(pool.clone(), "ana@example.com").await;
    let bia = opened(pool, "bia@example.com").await;
    spend(&ana, "2026-11-05", "50", "Mercado").await;
    repeat(&bia, "2026-11-05", "50", 6).await;

    let (_, alone) = ana.get("/api/months/2026-11").await;
    let (_, repeated) = bia.get("/api/months/2026-11").await;

    assert_eq!(alone, repeated);
    assert_eq!(place(&only(&bia, "2027-04").await), (6, 6));
    assert_eq!(only(&ana, "2026-11").await["series"], Value::Null);
}

#[sqlx::test]
async fn repeat_months_outside_2_to_60_is_refused(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    for months in [1, 61, 0] {
        let (status, problem) = user
            .post(
                "/api/transactions",
                json!({ "date": "2026-11-05", "amount": "10", "kind": "daily", "category_id": market, "repeat_months": months }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{months}");
        assert_eq!(problem["errors"][0]["field"], "repeat_months");
    }
    assert!(month(&user, "2026-11").await.is_empty());
    assert_eq!(place(&repeat(&user, "2026-11-05", "10", 60).await), (1, 60));
}

#[sqlx::test]
async fn r9_ten_parcelas_of_1000_01_write_ten_entries_summing_the_total(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": "2027-01-31", "amount": "1000.01", "kind": "daily", "category_id": market, "installments": 10 }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(
        (created["amount"].as_str(), place(&created)),
        (Some("100.00"), (1, 10))
    );
    let february = only(&user, "2027-02").await;
    assert_eq!(
        (february["date"].as_str(), february["amount"].as_str()),
        (Some("2027-02-28"), Some("100.00"))
    );
    let october = only(&user, "2027-10").await;
    assert_eq!(
        (
            october["date"].as_str(),
            october["amount"].as_str(),
            place(&october)
        ),
        (Some("2027-10-31"), Some("100.01"), (10, 10))
    );
    let mut cents = 0;
    for of in 1..=10 {
        let entry = only(&user, &format!("2027-{of:02}")).await;
        cents += entry["amount"]
            .as_str()
            .unwrap()
            .replace('.', "")
            .parse::<i64>()
            .unwrap();
    }
    assert_eq!(cents, 100_001);
    assert!(month(&user, "2027-11").await.is_empty());
}

#[sqlx::test]
async fn installments_out_of_range_with_repeat_or_too_small_are_refused(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    for (amount, extra, message) in [
        ("10", json!({ "installments": 1 }), "must be 2 to 60"),
        ("10", json!({ "installments": 61 }), "must be 2 to 60"),
        (
            "10",
            json!({ "installments": 3, "repeat_months": 3 }),
            "cannot be combined with repeat_months",
        ),
        (
            "0.05",
            json!({ "installments": 6 }),
            "must leave every installment above zero",
        ),
    ] {
        let mut body = json!({ "date": "2026-11-05", "amount": amount, "kind": "daily", "category_id": market });
        body.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let (status, problem) = user.post("/api/transactions", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "installments");
        assert_eq!(problem["errors"][0]["message"], message);
    }
    assert!(month(&user, "2026-11").await.is_empty());
}

#[sqlx::test]
async fn r9_six_cents_in_four_parcelas_leave_the_remainder_on_the_last(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-05", "amount": "0.06", "kind": "daily", "category_id": market, "installments": 4 }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    let mut amounts = Vec::new();
    for of in ["2026-11", "2026-12", "2027-01", "2027-02"] {
        amounts.push(only(&user, of).await["amount"].clone());
    }
    assert_eq!(amounts, ["0.01", "0.01", "0.01", "0.03"]);
}

#[sqlx::test]
async fn a_date_after_2100_is_refused(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    let (status, problem) = user
        .post(
            "/api/transactions",
            json!({ "date": "2101-01-31", "amount": "100", "kind": "daily", "category_id": market, "installments": 10 }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "date");
}

#[sqlx::test]
async fn sol60_a_series_reaching_past_2100_is_refused_and_writes_nothing(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    for count in ["repeat_months", "installments"] {
        let (status, problem) = user
            .post(
                "/api/transactions",
                json!({ "date": "2100-06-05", "amount": "120", "kind": "daily", "category_id": market, count: 12 }),
            )
            .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{count}: {problem}"
        );
        assert_eq!(problem["errors"][0]["field"], "date");
        assert_eq!(
            problem["errors"][0]["message"],
            "must leave room for every month"
        );
    }
    assert_empty(&user, "2100-06", 7).await;

    let alone = spend(&user, "2100-06-05", "10", "Mercado").await;
    let (status, problem) = user
        .patch(&uri(&alone), json!({ "repeat_months": 12 }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "date");
    assert_eq!(only(&user, "2100-06").await["series"], Value::Null);
    assert_empty(&user, "2100-07", 6).await;
}

async fn parcelas(user: &TestApp, total: &str, count: i64) -> Value {
    let market = user.category_id("Mercado").await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": "2027-01-31", "amount": total, "kind": "daily", "category_id": market, "installments": count }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

#[sqlx::test]
async fn r6_following_keeps_parcela_amounts_unless_the_amount_changes(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let first = parcelas(&user, "1000.01", 10).await;
    let following = format!("{}?scope=following", uri(&first));

    let (status, edited) = user.patch(&following, json!({ "note": "sofá" })).await;

    assert_eq!(status, StatusCode::OK, "{edited}");
    let tenth = only(&user, "2027-10").await;
    assert_eq!(
        (tenth["amount"].as_str(), tenth["note"].as_str()),
        (Some("100.01"), Some("sofá"))
    );
    let mut cents = 0;
    for of in 1..=10 {
        let entry = only(&user, &format!("2027-{of:02}")).await;
        cents += entry["amount"]
            .as_str()
            .unwrap()
            .replace('.', "")
            .parse::<i64>()
            .unwrap();
    }
    assert_eq!(cents, 100_001);

    let (status, edited) = user.patch(&following, json!({ "amount": "150.00" })).await;

    assert_eq!(status, StatusCode::OK, "{edited}");
    for of in 1..=10 {
        assert_eq!(
            only(&user, &format!("2027-{of:02}")).await["amount"],
            "150.00"
        );
    }
}

#[sqlx::test]
async fn delete_following_on_parcelas_removes_parcelas_k_to_n(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    parcelas(&user, "1000.01", 10).await;
    let seventh = only(&user, "2027-07").await;

    let (status, _) = user
        .delete(&format!("{}?scope=following", uri(&seventh)))
        .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    for of in 7..=10 {
        assert!(month(&user, &format!("2027-{of:02}")).await.is_empty());
    }
    assert_eq!(place(&only(&user, "2027-06").await), (6, 6));
}

#[sqlx::test]
async fn a_failing_copy_leaves_no_entry_at_all(pool: PgPool) {
    let user = opened(pool.clone(), "ana@example.com").await;
    sqlx::query("ALTER TABLE transactions ADD CONSTRAINT before_march CHECK (date < '2027-03-01')")
        .execute(&pool)
        .await
        .unwrap();
    let market = user.category_id("Mercado").await;

    let (status, _) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-05", "amount": "10", "kind": "daily", "category_id": market, "repeat_months": 12 }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(month(&user, "2026-11").await.is_empty());
    assert!(month(&user, "2027-02").await.is_empty());
}

#[sqlx::test]
async fn r6_this_keeps_the_series_and_following_rewrites_later_members_but_not_dates(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "99.90", 4).await;
    let second = only(&user, "2026-12").await;
    let third = only(&user, "2027-01").await;

    let (status, alone) = user
        .patch(
            &format!("{}?scope=this", uri(&third)),
            json!({ "amount": "120" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{alone}");
    assert_eq!(alone["amount"], "120.00");
    assert_eq!(place(&alone), (3, 4));
    assert_eq!(only(&user, "2027-02").await["amount"], "99.90");

    let food = user.category_id("Comida fora").await;
    let (status, edited) = user
        .patch(
            &format!("{}?scope=following", uri(&second)),
            json!({ "amount": "109.90", "note": "nova", "category_id": food, "date": "2026-12-10" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["date"], "2026-12-10");
    assert_eq!(edited["amount"], "109.90");
    assert_eq!(place(&edited), (2, 4));
    for (of, date) in [("2027-01", "2027-01-05"), ("2027-02", "2027-02-05")] {
        let later = only(&user, of).await;
        assert_eq!(later["date"], date);
        assert_eq!(later["amount"], "109.90");
        assert_eq!(later["note"], "nova");
        assert_eq!(later["category"]["name"], "Comida fora");
    }
    let first = only(&user, "2026-11").await;
    assert_eq!(first["amount"], "99.90");
    assert_eq!(first["category"]["name"], "Mercado");
    let (status, _) = user
        .patch(&format!("{}?scope=all", uri(&second)), json!({}))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn delete_following_removes_this_and_later_members_only(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let first = repeat(&user, "2026-11-05", "10", 4).await;
    let third = only(&user, "2027-01").await;

    let (status, _) = user
        .delete(&format!("{}?scope=following", uri(&third)))
        .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(month(&user, "2027-01").await.is_empty());
    assert!(month(&user, "2027-02").await.is_empty());
    assert_eq!(place(&only(&user, "2026-11").await), (1, 2));
    assert_eq!(place(&only(&user, "2026-12").await), (2, 2));
    assert_eq!(user.delete(&uri(&first)).await.0, StatusCode::NO_CONTENT);
    assert_eq!(place(&only(&user, "2026-12").await), (1, 1));
}

#[sqlx::test]
async fn repeat_months_on_patch_turns_a_standalone_entry_into_the_first_member(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let created = spend(&user, "2026-11-30", "10", "Mercado").await;

    let (status, repeated) = user
        .patch(&uri(&created), json!({ "repeat_months": 3 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{repeated}");
    assert_eq!(place(&repeated), (1, 3));
    assert_eq!(only(&user, "2026-12").await["date"], "2026-12-30");
    assert_eq!(place(&only(&user, "2027-01").await), (3, 3));
    for (entry, place_after) in [(created, (1, 2)), (only(&user, "2026-12").await, (2, 2))] {
        let (status, resized) = user
            .patch(&uri(&entry), json!({ "repeat_months": 2 }))
            .await;
        assert_eq!(status, StatusCode::OK, "{resized}");
        assert_eq!(place(&resized), place_after);
    }
    assert!(month(&user, "2027-01").await.is_empty());
    let (status, problem) = user
        .patch(
            &uri(&spend(&user, "2026-11-01", "5", "Mercado").await),
            json!({ "repeat_months": 61 }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "repeat_months");
}

#[sqlx::test]
async fn r3_r4_bill_payments_and_resgates_do_not_repeat_but_deposits_do(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let rent = user.category_id("Aluguel").await;
    let (_, bill) = user
        .post(
            "/api/bills",
            json!({ "name": "Aluguel", "amount": "1500", "due_day": 5, "category_id": rent }),
        )
        .await;
    let (status, payment) = user
        .post(
            &format!("/api/bills/{}/pay", bill["id"].as_str().unwrap()),
            json!({ "date": "2026-11-05" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    let economia = user.category_id("Economia").await;
    let (_, deposit) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-01", "amount": "100", "kind": "bill", "category_id": economia }),
        )
        .await;
    let (status, resgate) = user
        .post(
            &format!("/api/cofrinhos/{economia}/withdraw"),
            json!({ "date": "2026-11-02", "amount": "50" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{resgate}");

    for (entry, slug) in [
        (&payment, "repeat-not-allowed-on-bill-payment"),
        (&resgate, "repeat-not-allowed-on-cofrinho-withdrawal"),
    ] {
        let (status, problem) = user.patch(&uri(entry), json!({ "repeat_months": 2 })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{slug}");
        assert_eq!(problem["type"], format!("urn:soldi:error:{slug}"));
    }
    let (status, repeated) = user
        .patch(&uri(&deposit), json!({ "repeat_months": 12 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{repeated}");
    assert_eq!(place(&repeated), (1, 12));
}

#[sqlx::test]
async fn another_users_series_member_is_not_found(pool: PgPool) {
    let ana = opened(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let first = repeat(&ana, "2026-11-05", "10", 3).await;
    let following = format!("{}?scope=following", uri(&first));

    assert_eq!(
        bia.patch(&following, json!({ "amount": "1" })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        bia.patch(&uri(&first), json!({ "repeat_months": 2 }))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(bia.delete(&following).await.0, StatusCode::NOT_FOUND);
    assert_eq!(place(&only(&ana, "2027-01").await), (3, 3));
    assert_eq!(only(&ana, "2027-01").await["amount"], "10.00");
}

#[sqlx::test]
async fn two_concurrent_repeats_of_one_entry_make_one_series(pool: PgPool) {
    let user = opened(pool.clone(), "ana@example.com").await;
    let created = spend(&user, "2026-11-05", "10", "Mercado").await;
    let entry = uri(&created);
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT 1 FROM transactions WHERE id = $1::uuid FOR UPDATE")
        .bind(created["id"].as_str().unwrap())
        .execute(&mut *lock)
        .await
        .unwrap();

    let (first, second, ()) = tokio::join!(
        user.patch(&entry, json!({ "repeat_months": 3 })),
        user.patch(&entry, json!({ "repeat_months": 3 })),
        async {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            lock.commit().await.unwrap();
        },
    );

    let mut statuses = [first.0, second.0];
    statuses.sort();
    assert_eq!(
        statuses,
        [StatusCode::OK, StatusCode::UNPROCESSABLE_ENTITY],
        "{} {}",
        first.1,
        second.1
    );
    let refused = if first.0 == StatusCode::OK {
        second.1
    } else {
        first.1
    };
    assert_eq!(refused["type"], "urn:soldi:error:already-repeated");
    assert_eq!(place(&only(&user, "2026-11").await), (1, 3));
    assert_eq!(place(&only(&user, "2026-12").await), (2, 3));
    assert_eq!(place(&only(&user, "2027-01").await), (3, 3));
}

#[sqlx::test]
async fn members_on_the_same_date_keep_distinct_positions(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 3).await;
    let second = only(&user, "2026-12").await;

    let (status, moved) = user
        .patch(
            &format!("{}?scope=this", uri(&second)),
            json!({ "date": "2026-11-05" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    let mut places: Vec<(i64, i64)> = month(&user, "2026-11").await.iter().map(place).collect();
    places.sort();
    assert_eq!(places, [(1, 3), (2, 3)]);
}

async fn count(user: &TestApp, period: &str) -> Value {
    let (status, body) = user
        .get(&format!("/api/transactions/count?period={period}"))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["count"].clone()
}

async fn wipe(user: &TestApp, period: &str) -> Value {
    let (status, body) = user
        .delete(&format!("/api/transactions?period={period}"))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["deleted"].clone()
}

#[sqlx::test]
async fn sol30_a_month_counts_and_deletes_only_its_days_bill_payments_included(pool: PgPool) {
    let ana = opened(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    bia.open_at("0", "2026-10-01").await;
    spend(&ana, "2026-10-31", "1", "Mercado").await;
    spend(&ana, "2026-11-01", "2", "Mercado").await;
    spend(&ana, "2026-11-30", "3", "Mercado").await;
    spend(&ana, "2026-12-01", "4", "Mercado").await;
    let rent = ana.category_id("Aluguel").await;
    let (_, bill) = ana
        .post(
            "/api/bills",
            json!({ "name": "Aluguel", "amount": "100", "due_day": 5, "category_id": rent }),
        )
        .await;
    let pay = format!("/api/bills/{}/pay", bill["id"].as_str().unwrap());
    let (status, paid) = ana.post(&pay, json!({ "date": "2026-11-05" })).await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
    spend(&bia, "2026-11-10", "9", "Mercado").await;

    assert_eq!(count(&ana, "2026-11").await, 3);
    assert_eq!(wipe(&ana, "2026-11").await, 3);

    assert_eq!(count(&ana, "2026-11").await, 0);
    assert_eq!(month(&ana, "2026-10").await.len(), 1);
    assert_eq!(month(&ana, "2026-12").await.len(), 1);
    assert_eq!(count(&bia, "2026-11").await, 1);
    assert_eq!(ana.get("/api/bills").await.1.as_array().unwrap().len(), 1);
    assert_eq!(wipe(&ana, "2026-11").await, 0);
}

#[sqlx::test]
async fn sol30_a_year_spans_january_to_december_and_all_takes_every_date(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2025-12-31").await;
    let bia = ana.another_user("bia@example.com").await;
    bia.open_at("0", "2026-10-01").await;
    for date in ["2025-12-31", "2026-01-01", "2026-12-31", "2027-01-01"] {
        spend(&ana, date, "1", "Mercado").await;
    }
    spend(&bia, "2026-11-10", "9", "Mercado").await;

    assert_eq!(count(&ana, "2026").await, 2);
    assert_eq!(count(&ana, "2025").await, 1);
    assert_eq!(count(&ana, "all").await, 4);
    assert_eq!(wipe(&ana, "2026").await, 2);
    assert_eq!(count(&ana, "all").await, 2);
    assert_eq!(wipe(&ana, "all").await, 2);

    assert_eq!(count(&ana, "all").await, 0);
    assert_eq!(wipe(&ana, "all").await, 0);
    assert_eq!(count(&bia, "all").await, 1);
}

#[sqlx::test]
async fn sol30_a_bad_or_missing_period_is_400(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    spend(&user, "2026-11-05", "1", "Mercado").await;

    for query in [
        "?period=2026-13",
        "?period=99",
        "?period=",
        "?period=1999",
        "?period=2101",
        "?period=1999-01",
        "?period=2101-01",
        "?period=ALL",
        "?period=2026-1",
        "",
    ] {
        let (status, problem) = user.get(&format!("/api/transactions/count{query}")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "count {query}");
        assert_eq!(problem["type"], "urn:soldi:error:bad-request");
        let (status, _) = user.delete(&format!("/api/transactions{query}")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "delete {query}");
    }
    assert_eq!(count(&user, "2100").await, 0);
    assert_eq!(count(&user, "2100-12").await, 0);
    assert_eq!(wipe(&user, "2100-12").await, 0);
    assert_eq!(count(&user, "all").await, 1);
}

#[sqlx::test]
async fn sol30_cofrinho_deposits_and_resgates_go_but_the_cofrinho_and_categories_stay(
    pool: PgPool,
) {
    let user = opened(pool, "ana@example.com").await;
    let economia = user.category_id("Economia").await;
    let (status, reserva) = user
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia, "target": "1000" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{reserva}");
    let reserva = reserva["id"].as_str().unwrap();
    for (date, amount) in [("2026-10-15", "100"), ("2026-11-03", "500")] {
        let (status, deposit) = user
            .post(
                "/api/transactions",
                json!({ "date": date, "amount": amount, "kind": "bill", "category_id": reserva }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{deposit}");
    }
    let (status, resgate) = user
        .post(
            &format!("/api/cofrinhos/{reserva}/withdraw"),
            json!({ "date": "2026-11-04", "amount": "200" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{resgate}");
    let (_, categories) = user.get("/api/categories").await;

    assert_eq!(count(&user, "2026-11").await, 2);
    assert_eq!(wipe(&user, "2026-11").await, 2);

    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    let items = cofrinhos["items"].as_array().unwrap();
    let item = items.iter().find(|item| item["category_id"] == reserva);
    assert_eq!(
        item.map(|item| &item["balance"]),
        Some(&json!("100.00")),
        "{cofrinhos}"
    );
    assert_eq!(user.get("/api/categories").await.1, categories);
}

#[sqlx::test]
async fn sol30_a_leap_day_counts_under_its_month_and_year(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    spend(&user, "2028-02-29", "1", "Mercado").await;
    spend(&user, "2028-03-01", "2", "Mercado").await;

    assert_eq!(count(&user, "2028-02").await, 1);
    assert_eq!(count(&user, "2028").await, 2);
    assert_eq!(wipe(&user, "2028-02").await, 1);
    assert_eq!(count(&user, "2028").await, 1);
}

/// `count` months from `first`, as `YYYY-MM`.
fn months_from(first: &str, count: u32) -> Vec<String> {
    let start = chrono::NaiveDate::parse_from_str(&format!("{first}-01"), "%Y-%m-%d").unwrap();
    (0..count)
        .map(|k| (start + chrono::Months::new(k)).format("%Y-%m").to_string())
        .collect()
}

/// The single entries of `count` months from `first`.
async fn run(user: &TestApp, first: &str, count: u32) -> Vec<Value> {
    let mut entries = vec![];
    for of in months_from(first, count) {
        entries.push(only(user, &of).await);
    }
    entries
}

async fn assert_empty(user: &TestApp, first: &str, count: u32) {
    for of in months_from(first, count) {
        assert!(month(user, &of).await.is_empty(), "{of}");
    }
}

fn cents(entries: &[Value]) -> i64 {
    entries
        .iter()
        .map(|entry| {
            entry["amount"]
                .as_str()
                .unwrap()
                .replace('.', "")
                .parse::<i64>()
                .unwrap()
        })
        .sum()
}

fn field_of(entries: &[Value], field: &str) -> Vec<String> {
    entries
        .iter()
        .map(|entry| entry[field].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn l1_l2_growing_appends_members_on_the_first_members_grid_with_the_edited_values(
    pool: PgPool,
) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "99.90", 12).await;
    let third = only(&user, "2027-01").await;

    let (status, edited) = user
        .patch(
            &format!("{}?scope=following", uri(&third)),
            json!({ "amount": "109.90", "note": "fibra", "repeat_months": 15 }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(place(&edited), (3, 15));
    let entries = run(&user, "2026-11", 15).await;
    assert_eq!(
        field_of(&entries[12..], "date"),
        ["2027-11-05", "2027-12-05", "2028-01-05"]
    );
    assert_eq!(field_of(&entries[12..], "note"), ["fibra"; 3]);
    assert_eq!(field_of(&entries[2..], "amount"), ["109.90"; 13]);
    assert_eq!(field_of(&entries[..2], "amount"), ["99.90"; 2]);
    for (k, entry) in entries.iter().enumerate() {
        assert_eq!(place(entry), (k as i64 + 1, 15));
    }
    assert_empty(&user, "2028-02", 1).await;

    repeat(&user, "2029-01-31", "10", 4).await;
    let fourth = only(&user, "2029-04").await;
    let (status, grown) = user
        .patch(&uri(&fourth), json!({ "repeat_months": 6 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{grown}");
    let tail = run(&user, "2029-05", 2).await;
    assert_eq!(field_of(&tail, "date"), ["2029-05-31", "2029-06-30"]);
    assert_eq!(place(&tail[1]), (6, 6));
}

#[sqlx::test]
async fn l3_shrinking_from_the_third_deletes_the_tail_and_keeps_the_first_two(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 12).await;
    let before = run(&user, "2026-11", 2).await;
    let third = only(&user, "2027-01").await;

    let (status, shrunk) = user
        .patch(&uri(&third), json!({ "repeat_months": 6 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{shrunk}");
    assert_eq!(place(&shrunk), (3, 6));
    let kept = run(&user, "2026-11", 6).await;
    assert_eq!(field_of(&kept[..2], "id"), field_of(&before, "id"));
    assert_eq!(field_of(&kept, "amount"), ["10.00"; 6]);
    assert_eq!(place(&kept[0]), (1, 6));
    assert_eq!(place(&kept[5]), (6, 6));
    assert_empty(&user, "2027-05", 6).await;
}

#[sqlx::test]
async fn l3_l4_a_length_below_the_edited_member_or_above_60_writes_nothing(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 12).await;
    let fifth = only(&user, "2027-03").await;

    for months in [4, 61, 1] {
        let (status, problem) = user
            .patch(
                &format!("{}?scope=following", uri(&fifth)),
                json!({ "amount": "20", "repeat_months": months }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{months}");
        assert_eq!(problem["errors"][0]["field"], "repeat_months");
    }
    let entries = run(&user, "2026-11", 12).await;
    assert_eq!(field_of(&entries, "amount"), ["10.00"; 12]);
    assert_eq!(place(&entries[11]), (12, 12));

    let (status, shrunk) = user
        .patch(&uri(&fifth), json!({ "repeat_months": 5 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{shrunk}");
    assert_eq!(place(&shrunk), (5, 5));
    assert_empty(&user, "2027-04", 8).await;
}

#[sqlx::test]
async fn l3_the_floor_is_read_after_the_edited_members_own_date_change(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 4).await;
    let second = only(&user, "2026-12").await;

    let (status, problem) = user
        .patch(
            &uri(&second),
            json!({ "date": "2027-03-20", "repeat_months": 3 }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "repeat_months");
    assert_eq!(only(&user, "2026-12").await["id"], second["id"]);
    assert_empty(&user, "2027-03", 1).await;

    let (status, moved) = user
        .patch(
            &uri(&second),
            json!({ "date": "2027-03-20", "repeat_months": 4 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(place(&moved), (4, 4));
}

#[sqlx::test]
async fn l4_a_length_equal_to_the_total_writes_nothing(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 3).await;
    let before = run(&user, "2026-11", 3).await;

    let (status, same) = user
        .patch(&uri(&before[1]), json!({ "repeat_months": 3 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{same}");
    assert_eq!(place(&same), (2, 3));
    assert_eq!(run(&user, "2026-11", 3).await, before);
    assert_empty(&user, "2027-02", 1).await;
}

#[sqlx::test]
async fn l4_growth_past_2100_is_refused_on_the_date(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let first = repeat(&user, "2100-06-05", "10", 3).await;

    let (status, problem) = user
        .patch(&uri(&first), json!({ "repeat_months": 12 }))
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "date");
    assert_eq!(place(&only(&user, "2100-08").await), (3, 3));
    assert_empty(&user, "2100-09", 4).await;
}

#[sqlx::test]
async fn l2_l6_this_scope_and_a_resize_in_one_patch(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "99.90", 12).await;
    let third = only(&user, "2027-01").await;

    let (status, edited) = user
        .patch(
            &format!("{}?scope=this", uri(&third)),
            json!({ "amount": "120", "repeat_months": 14 }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["amount"], "120.00");
    assert_eq!(place(&edited), (3, 14));
    let entries = run(&user, "2026-11", 14).await;
    let mut amounts = vec!["99.90"; 14];
    amounts[2] = "120.00";
    amounts[12] = "120.00";
    amounts[13] = "120.00";
    assert_eq!(field_of(&entries, "amount"), amounts);
}

#[sqlx::test]
async fn l5_an_installment_series_is_resized_without_a_resplit(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    parcelas(&user, "1000.01", 10).await;
    let second = only(&user, "2027-02").await;

    let (status, grown) = user
        .patch(&uri(&second), json!({ "repeat_months": 12 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{grown}");
    assert_eq!(place(&grown), (2, 12));
    let entries = run(&user, "2027-01", 12).await;
    assert_eq!(field_of(&entries[..9], "amount"), ["100.00"; 9]);
    assert_eq!(entries[9]["amount"], "100.01");
    assert_eq!(field_of(&entries[10..], "amount"), ["100.00"; 2]);
    assert_eq!(
        field_of(&entries[10..], "date"),
        ["2027-11-30", "2027-12-31"]
    );
    assert_eq!(cents(&entries), 120_001);

    let (status, shrunk) = user
        .patch(&uri(&second), json!({ "repeat_months": 8 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{shrunk}");
    assert_eq!(cents(&run(&user, "2027-01", 8).await), 80_000);
    assert_empty(&user, "2027-09", 4).await;
}

#[sqlx::test]
async fn l6_a_failing_resize_leaves_the_series_as_it_was(pool: PgPool) {
    let user = opened(pool.clone(), "ana@example.com").await;
    let first = repeat(&user, "2026-11-05", "10", 3).await;
    sqlx::query("ALTER TABLE transactions ADD CONSTRAINT before_march CHECK (date < '2027-03-01')")
        .execute(&pool)
        .await
        .unwrap();

    let (status, problem) = user
        .patch(
            &format!("{}?scope=following", uri(&first)),
            json!({ "amount": "20", "repeat_months": 6 }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "before_march");
    let entries = run(&user, "2026-11", 3).await;
    assert_eq!(field_of(&entries, "amount"), ["10.00"; 3]);
    assert_eq!(place(&entries[2]), (3, 3));
    assert_empty(&user, "2027-02", 1).await;
}

#[sqlx::test]
async fn l1_growth_after_a_deleted_member_continues_after_the_last_month(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let first = repeat(&user, "2026-11-05", "10", 12).await;
    let fifth = only(&user, "2027-03").await;
    assert_eq!(user.delete(&uri(&fifth)).await.0, StatusCode::NO_CONTENT);

    let (status, grown) = user
        .patch(&uri(&first), json!({ "repeat_months": 12 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{grown}");
    assert_eq!(place(&grown), (1, 12));
    assert_eq!(grown["series"]["last_date"], "2027-11-05");
    assert_eq!(only(&user, "2027-10").await["date"], "2027-10-05");
    assert_eq!(only(&user, "2027-11").await["date"], "2027-11-05");
    assert_empty(&user, "2027-12", 1).await;
}

#[sqlx::test]
async fn l1_growth_after_the_first_member_moved_back_leaves_no_month_twice(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let first = repeat(&user, "2026-11-05", "10", 12).await;
    let (status, moved) = user
        .patch(&uri(&first), json!({ "date": "2026-10-05" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");

    let (status, grown) = user
        .patch(&uri(&first), json!({ "repeat_months": 13 }))
        .await;

    assert_eq!(status, StatusCode::OK, "{grown}");
    assert_empty(&user, "2026-11", 1).await;
    let entries = run(&user, "2026-12", 12).await;
    assert_eq!(entries[10]["date"], "2027-10-05");
    assert_eq!(entries[11]["date"], "2027-11-05");
    assert_eq!(place(&entries[11]), (13, 13));
    assert_empty(&user, "2027-12", 1).await;
}

#[sqlx::test]
async fn two_concurrent_grows_from_different_members_add_the_months_once(pool: PgPool) {
    let user = opened(pool.clone(), "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 12).await;
    let first = only(&user, "2026-11").await;
    let third = only(&user, "2027-01").await;
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT 1 FROM transactions WHERE id IN ($1::uuid, $2::uuid) FOR UPDATE")
        .bind(first["id"].as_str().unwrap())
        .bind(third["id"].as_str().unwrap())
        .execute(&mut *lock)
        .await
        .unwrap();

    let (first, third) = (uri(&first), uri(&third));
    let (from_first, from_third, ()) = tokio::join!(
        user.patch(&first, json!({ "repeat_months": 15 })),
        user.patch(&third, json!({ "repeat_months": 15 })),
        async {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            lock.commit().await.unwrap();
        },
    );

    assert_eq!(from_first.0, StatusCode::OK, "{}", from_first.1);
    assert_eq!(from_third.0, StatusCode::OK, "{}", from_third.1);
    let entries = run(&user, "2026-11", 15).await;
    assert_eq!(place(&entries[14]), (15, 15));
    assert_empty(&user, "2028-02", 1).await;
}

#[sqlx::test]
async fn a_grow_waits_for_a_following_delete_of_the_same_series(pool: PgPool) {
    let user = opened(pool.clone(), "ana@example.com").await;
    let first = repeat(&user, "2026-11-05", "10", 12).await;
    let tenth = only(&user, "2027-08").await;
    let last = only(&user, "2027-10").await;
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT 1 FROM transactions WHERE id = $1::uuid FOR UPDATE")
        .bind(last["id"].as_str().unwrap())
        .execute(&mut *lock)
        .await
        .unwrap();

    let (first, following) = (uri(&first), format!("{}?scope=following", uri(&tenth)));
    let (deleted, grown, ()) = tokio::join!(
        user.delete(&following),
        async {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            user.patch(&first, json!({ "repeat_months": 15 })).await
        },
        async {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            lock.commit().await.unwrap();
        },
    );

    assert_eq!(deleted.0, StatusCode::NO_CONTENT, "{}", deleted.1);
    assert_eq!(grown.0, StatusCode::OK, "{}", grown.1);
    let entries = run(&user, "2026-11", 15).await;
    assert_eq!(place(&entries[14]), (15, 15));
    assert_empty(&user, "2028-02", 1).await;
}

#[sqlx::test]
async fn l3_r6_a_following_shrink_rewrites_the_kept_members_then_drops_the_tail(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 12).await;
    let third = only(&user, "2027-01").await;

    let (status, shrunk) = user
        .patch(
            &format!("{}?scope=following", uri(&third)),
            json!({ "amount": "20", "repeat_months": 6 }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{shrunk}");
    assert_eq!(place(&shrunk), (3, 6));
    let kept = run(&user, "2026-11", 6).await;
    assert_eq!(
        field_of(&kept, "amount"),
        ["10.00", "10.00", "20.00", "20.00", "20.00", "20.00"]
    );
    assert_empty(&user, "2027-05", 6).await;
}

#[sqlx::test]
async fn l1_growth_reads_the_span_after_the_edited_members_own_date_change(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    repeat(&user, "2026-11-05", "10", 3).await;
    let third = only(&user, "2027-01").await;

    let (status, grown) = user
        .patch(
            &uri(&third),
            json!({ "date": "2027-02-10", "repeat_months": 5 }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{grown}");
    assert_eq!(place(&grown), (3, 5));
    assert_eq!(grown["series"]["last_date"], "2027-04-05");
    assert_empty(&user, "2027-01", 1).await;
    let tail = run(&user, "2027-02", 3).await;
    assert_eq!(
        field_of(&tail, "date"),
        ["2027-02-10", "2027-03-05", "2027-04-05"]
    );
    assert_empty(&user, "2027-05", 1).await;
}

#[sqlx::test]
async fn resizing_another_users_member_is_not_found(pool: PgPool) {
    // The 404 comes from `find` at the top of `update`, before any resize runs.
    let ana = opened(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let first = repeat(&ana, "2026-11-05", "10", 3).await;

    for months in [2, 6] {
        let (status, _) = bia
            .patch(&uri(&first), json!({ "repeat_months": months }))
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{months}");
    }
    assert_eq!(place(&only(&ana, "2027-01").await), (3, 3));
    assert_empty(&ana, "2027-02", 1).await;
}
