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
        amount: Some("120.5".parse().unwrap()),
        due_day: 10,
        category_id: light,
        closing_day: None,
        installments: None,
        last_month: None,
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
    let pay = format!("{uri}/pay");
    assert_eq!(
        anonymous
            .post(&pay, json!({ "date": "2026-11-05" }))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        anonymous.delete(&format!("{pay}?month=2026-11")).await.0,
        StatusCode::UNAUTHORIZED
    );
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
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
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
    assert_eq!(paused["last_month"], this_month().to_string());
    assert_eq!(ana.get("/api/bills").await.1, json!([paused]));
    end_last_month(&pool).await;
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
    let (_, everything) = ana.get("/api/bills?include_inactive=true").await;
    assert_eq!(everything[0]["last_month"], previous_month().to_string());

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

async fn active_since(pool: &PgPool) -> chrono::NaiveDate {
    sqlx::query_scalar("SELECT active_since FROM recurring_bills")
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn set_active_since(pool: &PgPool, date: &str) {
    sqlx::query("UPDATE recurring_bills SET active_since = $1::date")
        .bind(date)
        .execute(pool)
        .await
        .unwrap();
}

fn this_month() -> chrono::NaiveDate {
    use chrono::Datelike;
    soldi_server::today_sao_paulo().with_day(1).unwrap()
}

fn previous_month() -> chrono::NaiveDate {
    this_month() - chrono::Months::new(1)
}

/// Every stopped bill ended last month, as if stopped then.
async fn end_last_month(pool: &PgPool) {
    sqlx::query("UPDATE recurring_bills SET last_month = $1 WHERE last_month IS NOT NULL")
        .bind(previous_month())
        .execute(pool)
        .await
        .unwrap();
}

#[sqlx::test]
async fn d13_a_bill_owes_from_today_when_created_or_resumed(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&created);
    let today = soldi_server::today_sao_paulo();
    let january: chrono::NaiveDate = "2026-01-01".parse().unwrap();
    assert_eq!(active_since(&pool).await, today);
    set_active_since(&pool, "2026-01-01").await;

    ana.patch(&uri, json!({ "name": "Casa", "active": true }))
        .await;
    assert_eq!(active_since(&pool).await, january);
    ana.patch(&uri, json!({ "active": false })).await;
    let (_, same_month) = ana.patch(&uri, json!({ "active": true })).await;
    assert_eq!(active_since(&pool).await, january);
    assert_eq!(same_month["last_month"], serde_json::Value::Null);
    ana.patch(&uri, json!({ "active": false })).await;
    end_last_month(&pool).await;
    let (status, resumed) = ana.patch(&uri, json!({ "active": true })).await;

    assert_eq!(status, StatusCode::OK, "{resumed}");
    assert_eq!(resumed["active"], true);
    assert_eq!(resumed["last_month"], serde_json::Value::Null);
    assert_eq!(active_since(&pool).await, today);
}

#[sqlx::test]
async fn d17_a_stopped_fixo_turned_parcelado_owes_from_today(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&created);
    ana.patch(&uri, json!({ "active": false })).await;
    end_last_month(&pool).await;
    set_active_since(&pool, "2026-01-01").await;

    let last = this_month() + chrono::Months::new(2);
    let (status, plan) = ana
        .patch(&uri, json!({ "installments": 3, "last_month": last }))
        .await;

    assert_eq!(status, StatusCode::OK, "{plan}");
    assert_eq!(plan["active"], true);
    assert_eq!(active_since(&pool).await, soldi_server::today_sao_paulo());
}

#[sqlx::test]
async fn d35_a_stopped_bill_pays_its_own_months_and_refuses_later_ones(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    bia.open_at("0", "2026-11-01").await;
    let bill = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let theirs = create(&bia, rent(category_id(&bia, "Aluguel").await)).await;
    let today = soldi_server::today_sao_paulo().to_string();
    let next = (this_month() + chrono::Months::new(1)).to_string();

    let (_, stopped) = ana
        .patch(&bill_uri(&bill), json!({ "active": false }))
        .await;
    assert_eq!(stopped["last_month"], this_month().to_string());
    let (status, refused) = ana.post(&pay_uri(&bill), json!({ "date": next })).await;
    let (status_today, paid) = ana.post(&pay_uri(&bill), json!({ "date": today })).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
    assert_eq!(refused["type"], "urn:soldi:error:bill-ended");
    assert_eq!(status_today, StatusCode::CREATED, "{paid}");
    let (status, theirs_paid) = bia.post(&pay_uri(&theirs), json!({ "date": next })).await;
    assert_eq!(status, StatusCode::CREATED, "{theirs_paid}");
    assert_eq!(
        bia.get("/api/bills").await.1[0]["last_month"],
        serde_json::Value::Null
    );
}

#[sqlx::test]
async fn d35_parar_after_paying_ahead_ends_at_the_paid_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let bill = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let next = this_month() + chrono::Months::new(1);
    ana.post(&pay_uri(&bill), json!({ "date": next.to_string() }))
        .await;

    let (status, stopped) = ana
        .patch(&bill_uri(&bill), json!({ "active": false }))
        .await;

    assert_eq!(status, StatusCode::OK, "{stopped}");
    assert_eq!(stopped["last_month"], next.to_string());
}

fn fies(category_id: Uuid, last_month: chrono::NaiveDate) -> serde_json::Value {
    json!({ "name": "Fies", "amount": "300", "due_day": 10, "category_id": category_id,
            "installments": 6, "last_month": last_month.to_string() })
}

#[sqlx::test]
async fn d35_a_parcelado_bill_edits_its_plan_but_never_hides_a_paid_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let month = |ahead: u32| this_month() + chrono::Months::new(ahead);
    let internet = category_id(&ana, "Internet").await;
    let plan = create(&ana, fies(internet, month(2))).await;
    let fixo = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let theirs = create(&bia, rent(category_id(&bia, "Aluguel").await)).await;
    ana.post(&pay_uri(&plan), json!({ "date": month(1).to_string() }))
        .await;
    let uri = bill_uri(&plan);

    for (uri, body, field) in [
        (
            &uri,
            json!({ "installments": 6, "last_month": previous_month() }),
            "last_month",
        ),
        (
            &uri,
            json!({ "installments": 6, "last_month": month(0) }),
            "last_month",
        ),
        (&uri, json!({ "installments": 6 }), "last_month"),
        (&uri, json!({ "active": false }), "active"),
    ] {
        let (status, problem) = ana.patch(uri, body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
    let (status, shorter) = ana
        .patch(&uri, json!({ "installments": 4, "last_month": month(1) }))
        .await;
    assert_eq!(status, StatusCode::OK, "{shorter}");
    assert_eq!(
        (
            &shorter["installments"],
            &shorter["last_month"],
            &shorter["active"]
        ),
        (&json!(4), &json!(month(1).to_string()), &json!(true))
    );
    let (status, fies) = ana
        .patch(
            &bill_uri(&fixo),
            json!({ "installments": 6, "last_month": month(2) }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{fies}");
    assert_eq!(
        (&fies["installments"], &fies["last_month"]),
        (&json!(6), &json!(month(2).to_string()))
    );
    let cards = category_id(&ana, "Cartão").await;
    let (status, card) = ana
        .post(
            "/api/bills",
            json!({ "name": "Porto", "due_day": 10, "closing_day": 3, "category_id": cards,
                    "installments": 6, "last_month": month(2) }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{card}");
    assert_eq!(card["errors"][0]["field"], "installments");
    assert_eq!(bia.get("/api/bills").await.1, json!([theirs]));
}

#[sqlx::test]
async fn d35_a_plan_never_comes_with_ativa(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let fixo = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let last = this_month() + chrono::Months::new(2);

    for active in [false, true] {
        let (status, problem) = ana
            .patch(
                &bill_uri(&fixo),
                json!({ "active": active, "installments": 6, "last_month": last }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "active");
    }
    assert_eq!(ana.get("/api/bills").await.1, json!([fixo]));
}

#[sqlx::test]
async fn d35_a_card_still_has_no_pause(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;

    let (status, problem) = ana
        .patch(&bill_uri(&card), json!({ "active": false }))
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "active");
    assert_eq!(ana.get("/api/bills").await.1, json!([card]));
    assert_eq!(card["last_month"], serde_json::Value::Null);
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

async fn opened_with_rent(pool: PgPool) -> (TestApp, serde_json::Value) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    (ana, created)
}

fn pay_uri(bill: &serde_json::Value) -> String {
    format!("{}/pay", bill_uri(bill))
}

#[sqlx::test]
async fn rules_2_and_3_paying_creates_a_linked_bill_entry(pool: PgPool) {
    let (ana, bill) = opened_with_rent(pool).await;

    let (status, paid) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-11-05" }))
        .await;

    assert_eq!(status, StatusCode::CREATED, "{paid}");
    assert_eq!(paid["kind"], "bill");
    assert_eq!(paid["amount"], "2259.56");
    assert_eq!(paid["date"], "2026-11-05");
    assert_eq!(paid["recurring_bill_id"], bill["id"]);
    assert_eq!(paid["category"]["name"], "Aluguel");
    let (_, listed) = ana.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed, json!([paid]));

    let (status, december) = ana
        .post(
            &format!("{}?month=2026-12", pay_uri(&bill)),
            json!({ "date": "2026-12-04", "amount": "2300.00" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{december}");
    assert_eq!(december["amount"], "2300.00");
    assert_eq!(ana.get("/api/bills").await.1[0]["amount"], "2259.56");
}

#[sqlx::test]
async fn rule_4_a_bill_is_paid_once_a_month(pool: PgPool) {
    let (ana, bill) = opened_with_rent(pool).await;
    ana.post(&pay_uri(&bill), json!({ "date": "2026-11-05" }))
        .await;

    let (status, problem) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-11-30" }))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:soldi:error:bill-already-paid");
    let (_, december) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-12-01" }))
        .await;
    let (status, problem) = ana
        .patch(
            &format!("/api/transactions/{}", december["id"].as_str().unwrap()),
            json!({ "date": "2026-11-20" }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:soldi:error:bill-already-paid");
}

#[sqlx::test]
async fn rule_5_unpaying_deletes_the_months_entry(pool: PgPool) {
    let (ana, bill) = opened_with_rent(pool).await;
    ana.post(&pay_uri(&bill), json!({ "date": "2026-11-05" }))
        .await;
    ana.post(&pay_uri(&bill), json!({ "date": "2026-12-05" }))
        .await;
    let unpay = format!("{}?month=2026-11", pay_uri(&bill));

    assert_eq!(ana.delete(&unpay).await.0, StatusCode::NO_CONTENT);

    assert_eq!(
        ana.get("/api/transactions?month=2026-11").await.1,
        json!([])
    );
    assert_eq!(
        ana.get("/api/transactions?month=2026-12")
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(ana.delete(&unpay).await.0, StatusCode::NOT_FOUND);
    let (status, again) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-11-06" }))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{again}");
}

#[sqlx::test]
async fn rule_12_and_the_entry_rules_guard_a_payment(pool: PgPool) {
    let (ana, bill) = opened_with_rent(pool).await;
    let november = format!("{}?month=2026-11", pay_uri(&bill));

    for (uri, body, field) in [
        (&november, json!({ "date": "2026-12-01" }), "date"),
        (&november, json!({ "date": "2026-10-31" }), "date"),
        (
            &november,
            json!({ "date": "2026-11-05", "amount": "0" }),
            "amount",
        ),
        (
            &november,
            json!({ "date": "2026-11-05", "amount": "1.001" }),
            "amount",
        ),
        (
            &format!("{}?month=11-2026", pay_uri(&bill)),
            json!({ "date": "2026-11-05" }),
            "month",
        ),
    ] {
        let (status, problem) = ana.post(uri, body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{uri} {body}");
        assert_eq!(problem["errors"][0]["field"], field, "{uri} {body}");
    }
    let (status, problem) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-10-31" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:before-opening-date");
    let (status, problem) = ana
        .delete(&format!("{}?month=2026-1", pay_uri(&bill)))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "month");
    assert_eq!(ana.delete(&pay_uri(&bill)).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(
        ana.get("/api/transactions?month=2026-11").await.1,
        json!([])
    );
}

#[sqlx::test]
async fn only_the_owner_pays_an_active_bill(pool: PgPool) {
    let (ana, bill) = opened_with_rent(pool).await;
    let bia = ana.another_user("bia@example.com").await;
    bia.open_at("0", "2026-11-01").await;
    let pay = |date: &str| json!({ "date": date });

    assert_eq!(
        bia.post(&pay_uri(&bill), pay("2026-11-05")).await.0,
        StatusCode::NOT_FOUND
    );
    ana.post(&pay_uri(&bill), pay("2026-11-05")).await;
    assert_eq!(
        bia.delete(&format!("{}?month=2026-11", pay_uri(&bill)))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    ana.delete(&bill_uri(&bill)).await;
    assert_eq!(
        ana.post(&pay_uri(&bill), pay("2026-12-05")).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        ana.get("/api/transactions?month=2026-11").await.1[0]["recurring_bill_id"],
        bill["id"]
    );
}

async fn entry(app: &TestApp, body: serde_json::Value) -> serde_json::Value {
    let (status, created) = app.post("/api/transactions", body).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

fn from_entry(entry: &serde_json::Value) -> String {
    format!(
        "/api/bills?transaction_id={}",
        entry["id"].as_str().unwrap()
    )
}

#[sqlx::test]
async fn r8_a_saida_entry_becomes_a_bill_and_its_payment(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    let rent = category_id(&ana, "Aluguel").await;
    let light = category_id(&ana, "Luz").await;
    let saida = entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "2259.56", "kind": "bill", "category_id": rent }),
    )
    .await;
    let body =
        json!({ "name": "Aluguel", "amount": "2259.56", "due_day": 7, "category_id": light });

    let (status, bill) = ana.post(&from_entry(&saida), body.clone()).await;

    assert_eq!(status, StatusCode::CREATED, "{bill}");
    assert_eq!(
        (&bill["due_day"], &bill["amount"]),
        (&json!(7), &json!("2259.56"))
    );
    let (_, listed) = ana.get("/api/transactions?month=2026-11").await;
    assert_eq!(listed[0]["recurring_bill_id"], bill["id"]);
    assert_eq!(listed[0]["category"]["id"], light.to_string());
    assert_eq!(listed[0]["amount"], "2259.56");
    let (status, problem) = ana.post(&from_entry(&saida), body).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:cannot-become-bill");
    assert_eq!(ana.get("/api/bills").await.1.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn r8_only_the_callers_standalone_saida_becomes_a_bill(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    bia.open_at("0", "2026-11-01").await;
    let rent = category_id(&ana, "Aluguel").await;
    let market = category_id(&ana, "Mercado").await;
    let economia = category_id(&ana, "Economia").await;
    let daily = entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "10", "kind": "daily", "category_id": market }),
    )
    .await;
    let member = entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "10", "kind": "bill", "category_id": rent, "repeat_months": 2 }),
    )
    .await;
    entry(
        &ana,
        json!({ "date": "2026-11-01", "amount": "100", "kind": "bill", "category_id": economia }),
    )
    .await;
    let (_, resgate) = ana
        .post(
            &format!("/api/cofrinhos/{economia}/withdraw"),
            json!({ "date": "2026-11-02", "amount": "50" }),
        )
        .await;
    let theirs = entry(
        &bia,
        json!({ "date": "2026-11-07", "amount": "10", "kind": "bill", "category_id": category_id(&bia, "Aluguel").await }),
    )
    .await;
    let body = json!({ "name": "Aluguel", "amount": "10", "due_day": 7, "category_id": rent });

    for refused in [&daily, &member, &resgate] {
        let (status, problem) = ana.post(&from_entry(refused), body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
        assert_eq!(problem["type"], "urn:soldi:error:cannot-become-bill");
    }
    for missing in [&theirs, &json!({ "id": Uuid::nil() })] {
        let (status, _) = ana.post(&from_entry(missing), body.clone()).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
    let (status, _) = ana
        .post("/api/bills?transaction_id=nope", body.clone())
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
    assert_eq!(
        ana.get("/api/transactions?month=2026-11").await.1[0]["recurring_bill_id"],
        serde_json::Value::Null
    );
}

#[sqlx::test]
async fn a_bill_keeps_its_archived_category_until_another_is_picked(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent_category = category_id(&ana, "Aluguel").await;
    let light = category_id(&ana, "Luz").await;
    let bill = create(&ana, rent(rent_category)).await;
    sqlx::query("UPDATE categories SET archived_at = now() WHERE id = ANY($1)")
        .bind(vec![rent_category, light])
        .execute(&pool)
        .await
        .unwrap();
    let uri = bill_uri(&bill);

    let (status, kept) = ana
        .patch(
            &uri,
            json!({ "name": "Aluguel novo", "category_id": rent_category }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{kept}");
    assert_eq!(kept["category_id"], rent_category.to_string());
    assert_eq!(kept["name"], "Aluguel novo");

    let (status, refused) = ana.patch(&uri, json!({ "category_id": light })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
}

#[sqlx::test]
async fn a_bill_on_a_category_no_longer_bill_is_neither_paid_nor_resumed(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let rent_category = category_id(&ana, "Aluguel").await;
    let bill = create(&ana, rent(rent_category)).await;
    let uri = bill_uri(&bill);
    sqlx::query("UPDATE categories SET kind = 'daily', color = 'cat-24' WHERE id = $1")
        .bind(rent_category)
        .execute(&pool)
        .await
        .unwrap();

    let (status, paid) = ana
        .post(&pay_uri(&bill), json!({ "date": "2026-11-05" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{paid}");
    assert_eq!(
        ana.patch(&uri, json!({ "active": false })).await.0,
        StatusCode::OK
    );
    let (status, resumed) = ana.patch(&uri, json!({ "active": true })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{resumed}");
    assert_eq!(
        ana.get("/api/transactions?month=2026-11").await.1,
        json!([])
    );
}

fn porto(category_id: &str) -> serde_json::Value {
    json!({ "name": "Porto", "due_day": 10, "closing_day": 3, "category_id": category_id })
}

#[sqlx::test]
async fn d28_a_card_is_a_bill_with_a_closing_day_and_no_amount(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let cards = ana.category_id("Cartão").await;
    let light = ana.category_id("Luz").await;

    let card = create(&ana, porto(&cards)).await;

    assert_eq!(card["amount"], serde_json::Value::Null);
    assert_eq!(card["closing_day"], 3);
    assert_eq!(ana.get("/api/bills").await.1, json!([card]));
    let conta = create(
        &ana,
        json!({ "name": "Luz", "amount": "100", "due_day": 5, "category_id": light }),
    )
    .await;
    assert_eq!(conta["closing_day"], serde_json::Value::Null);
    for (uri, body, field) in [
        (bill_uri(&card), json!({ "active": false }), "active"),
        (bill_uri(&card), json!({ "amount": "10" }), "amount"),
        (bill_uri(&card), json!({ "closing_day": 0 }), "closing_day"),
        (bill_uri(&conta), json!({ "closing_day": 3 }), "closing_day"),
    ] {
        let (status, problem) = ana.patch(&uri, body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
    let (status, moved) = ana
        .patch(&bill_uri(&card), json!({ "closing_day": 28 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["closing_day"], 28);
}

#[sqlx::test]
async fn d28_a_card_is_paid_with_an_amount_even_once_archived(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;

    let (status, problem) = ana
        .post(&pay_uri(&card), json!({ "date": "2026-11-10" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "amount");
    let (status, paid) = ana
        .post(
            &pay_uri(&card),
            json!({ "date": "2026-11-10", "amount": "52.00" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
    assert_eq!(
        (&paid["kind"], &paid["amount"]),
        (&json!("bill"), &json!("52.00"))
    );
    assert_eq!(paid["card_id"], serde_json::Value::Null);

    assert_eq!(ana.delete(&bill_uri(&card)).await.0, StatusCode::NO_CONTENT);
    let (status, december) = ana
        .post(
            &pay_uri(&card),
            json!({ "date": "2026-12-10", "amount": "30.00" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{december}");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

#[sqlx::test]
async fn d28_an_entry_never_becomes_a_card(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    let rent = category_id(&ana, "Aluguel").await;
    let saida = entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "50", "kind": "bill", "category_id": rent }),
    )
    .await;

    let (status, problem) = ana
        .post(&from_entry(&saida), porto(&ana.category_id("Cartão").await))
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "transaction_id");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

fn entry_uri(entry: &serde_json::Value) -> String {
    format!("/api/transactions/{}", entry["id"].as_str().unwrap())
}

#[sqlx::test]
async fn d30b_a_paid_fatura_is_frozen_and_an_unpaid_one_still_changes(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-10-01").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let other = create(
        &ana,
        json!({ "name": "Nubank", "due_day": 10, "closing_day": 3,
                "category_id": ana.category_id("Cartão").await }),
    )
    .await;
    let mercado = ana.category_id("Mercado").await;
    let spend = |date: &str, card: &serde_json::Value| {
        json!({ "date": date, "amount": "50", "kind": "daily",
                "category_id": mercado, "card_id": card["id"] })
    };
    let paid = entry(&ana, spend("2026-11-02", &card)).await;
    let open = entry(&ana, spend("2026-11-05", &card)).await;
    let plain = entry(
        &ana,
        json!({ "date": "2026-11-02", "amount": "10", "kind": "daily", "category_id": mercado }),
    )
    .await;
    let (status, payment) = ana
        .post(
            &format!("{}?month=2026-11", pay_uri(&card)),
            json!({ "date": "2026-11-10", "amount": "50" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    let (status, older) = ana
        .post(
            &format!("{}?month=2026-10", pay_uri(&other)),
            json!({ "date": "2026-10-10", "amount": "5" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{older}");

    for (uri, body) in [
        (entry_uri(&paid), json!({ "amount": "60" })),
        (entry_uri(&paid), json!({ "date": "2026-11-01" })),
        (entry_uri(&paid), json!({ "card_id": null })),
        (entry_uri(&paid), json!({ "card_id": other["id"] })),
        (entry_uri(&open), json!({ "date": "2026-11-02" })),
        (entry_uri(&plain), json!({ "card_id": card["id"] })),
    ] {
        let (status, problem) = ana.patch(&uri, body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{uri} {body}");
        assert_eq!(problem["type"], "urn:soldi:error:fatura-paid", "{body}");
    }
    let (status, problem) = ana
        .post("/api/transactions", spend("2026-11-01", &card))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid");
    let (status, problem) = ana.delete(&entry_uri(&paid)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid");

    for (uri, body) in [
        (entry_uri(&paid), json!({ "note": "feira" })),
        (entry_uri(&open), json!({ "amount": "45" })),
        (entry_uri(&plain), json!({ "card_id": other["id"] })),
    ] {
        let (status, changed) = ana.patch(&uri, body.clone()).await;
        assert_eq!(status, StatusCode::OK, "{uri} {body} {changed}");
    }
    entry(&ana, spend("2026-11-05", &card)).await;
    assert_eq!(
        ana.delete(&entry_uri(&open)).await.0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test]
async fn d28_a_card_never_pays_into_economia(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let economia = ana.category_id("Economia").await;

    let (status, problem) = ana.post("/api/bills", porto(&economia)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "category_id");
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let (status, problem) = ana
        .patch(&bill_uri(&card), json!({ "category_id": economia }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "category_id");
    let saving = create(
        &ana,
        json!({ "name": "Reserva", "amount": "100", "due_day": 5, "category_id": economia }),
    )
    .await;
    assert_eq!(saving["category_id"], economia.as_str());
}

#[sqlx::test]
async fn d30b_a_card_paid_this_month_or_later_keeps_its_closing_day(pool: PgPool) {
    use chrono::{Datelike, Months};
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let last_month = today.with_day(1).unwrap() - Months::new(1);
    ana.open_at("1000", &last_month.to_string()).await;
    let cards = ana.category_id("Cartão").await;
    let paid = create(&ana, porto(&cards)).await;
    let earlier = create(&ana, porto(&cards)).await;
    for (card, on) in [(&paid, today), (&earlier, last_month)] {
        let (status, payment) = ana
            .post(
                &format!("{}?month={}", pay_uri(card), on.format("%Y-%m")),
                json!({ "date": on.to_string(), "amount": "5" }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{payment}");
    }

    let (status, problem) = ana
        .patch(&bill_uri(&paid), json!({ "closing_day": 28 }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid");
    let (status, moved) = ana
        .patch(
            &bill_uri(&paid),
            json!({ "name": "Porto Seguro", "due_day": 12 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    let (status, moved) = ana
        .patch(&bill_uri(&earlier), json!({ "closing_day": 28 }))
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

#[sqlx::test]
async fn sol113_a_payment_keeps_its_kind_and_takes_only_a_bill_category(pool: PgPool) {
    let (ana, rent) = opened_with_rent(pool).await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let (_, conta) = ana
        .post(&pay_uri(&rent), json!({ "date": "2026-11-05" }))
        .await;
    let (_, fatura) = ana
        .post(
            &pay_uri(&card),
            json!({ "date": "2026-11-10", "amount": "52.00" }),
        )
        .await;
    let mercado = ana.category_id("Mercado").await;
    let salario = ana.category_id("Salário").await;
    let luz = ana.category_id("Luz").await;
    let bia = ana.another_user("bia@example.com").await;

    for paid in [&conta, &fatura] {
        for (body, field) in [
            (json!({ "kind": "daily", "category_id": mercado }), "kind"),
            (json!({ "kind": "daily" }), "kind"),
            (json!({ "kind": "income", "category_id": salario }), "kind"),
            (json!({ "category_id": mercado }), "category_id"),
        ] {
            let (status, problem) = ana.patch(&entry_uri(paid), body.clone()).await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
            assert_eq!(problem["errors"][0]["field"], field, "{body}");
        }
        let (status, problem) = ana
            .patch(
                &entry_uri(paid),
                json!({ "kind": "daily", "category_id": mercado }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(
            problem["errors"][0]["message"],
            "a conta fixa payment stays a Saída"
        );
        let (_, listed) = ana.get("/api/transactions?month=2026-11").await;
        assert!(listed.as_array().unwrap().contains(paid), "{listed}");
        assert_eq!(
            bia.patch(&entry_uri(paid), json!({ "kind": "daily" }))
                .await
                .0,
            StatusCode::NOT_FOUND
        );
        let (status, changed) = ana
            .patch(
                &entry_uri(paid),
                json!({ "kind": "bill", "amount": "60", "note": "pago", "category_id": luz }),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{changed}");
        assert_eq!(
            (&changed["kind"], &changed["amount"], &changed["note"]),
            (&json!("bill"), &json!("60.00"), &json!("pago"))
        );
        assert_eq!(changed["recurring_bill_id"], paid["recurring_bill_id"]);
    }
    let plain = entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "50", "kind": "bill", "category_id": luz }),
    )
    .await;
    let (status, moved) = ana
        .patch(
            &entry_uri(&plain),
            json!({ "kind": "daily", "category_id": mercado }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "daily");
    assert_eq!(
        ana.delete(&entry_uri(&conta)).await.0,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test]
async fn d33_all_refuses_a_paid_fatura_on_an_earlier_member(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-10-01").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let first = entry(
        &ana,
        json!({ "date": "2026-11-02", "amount": "50", "kind": "daily", "repeat_months": 3,
                "category_id": ana.category_id("Mercado").await, "card_id": card["id"] }),
    )
    .await;
    let (status, payment) = ana
        .post(
            &format!("{}?month=2026-11", pay_uri(&card)),
            json!({ "date": "2026-11-10", "amount": "50" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    let (_, december) = ana.get("/api/transactions?month=2026-12").await;
    let second = entry_uri(&december[0]);

    let (status, problem) = ana
        .patch(&format!("{second}?scope=all"), json!({ "amount": "60" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid");
    let (status, problem) = ana.delete(&format!("{second}?scope=all")).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid");
    let (_, november) = ana.get("/api/transactions?month=2026-11").await;
    let spent = |listed: &serde_json::Value| {
        listed
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == first["id"])
            .unwrap()
            .clone()
    };
    assert_eq!(spent(&november)["amount"], "50.00");

    let (status, noted) = ana
        .patch(&format!("{second}?scope=all"), json!({ "note": "feira" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{noted}");
    let (status, changed) = ana
        .patch(
            &format!("{second}?scope=following"),
            json!({ "amount": "60" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{changed}");
    let (_, november) = ana.get("/api/transactions?month=2026-11").await;
    assert_eq!(spent(&november)["amount"], "50.00");
    assert_eq!(spent(&november)["note"], "feira");
}

#[sqlx::test]
async fn d33_a_series_member_never_becomes_a_bill_payment(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    let rent = category_id(&ana, "Aluguel").await;
    entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "10", "kind": "bill", "category_id": rent, "repeat_months": 3 }),
    )
    .await;
    let (_, december) = ana.get("/api/transactions?month=2026-12").await;
    let body = json!({ "name": "Aluguel", "amount": "10", "due_day": 7, "category_id": rent });

    let (status, problem) = ana.post(&from_entry(&december[0]), body).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:cannot-become-bill");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

async fn listed(ana: &TestApp, month: &str) -> serde_json::Value {
    let (status, entries) = ana.get(&format!("/api/transactions?month={month}")).await;
    assert_eq!(status, StatusCode::OK, "{entries}");
    entries
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["series"].is_object())
        .unwrap()
        .clone()
}

#[track_caller]
fn refused(status: StatusCode, problem: &serde_json::Value) {
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:fatura-paid", "{problem}");
}

#[sqlx::test]
async fn d30b_each_reached_member_answers_to_its_own_card(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-10-01").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let other = create(
        &ana,
        json!({ "name": "Nubank", "due_day": 10, "closing_day": 3,
                "category_id": ana.category_id("Cartão").await }),
    )
    .await;
    entry(
        &ana,
        json!({ "date": "2026-11-02", "amount": "50", "kind": "daily", "repeat_months": 6,
                "category_id": ana.category_id("Mercado").await, "card_id": card["id"] }),
    )
    .await;
    let first = listed(&ana, "2026-11").await;
    let (status, moved) = ana
        .patch(
            &format!("{}?scope=this", entry_uri(&first)),
            json!({ "card_id": other["id"] }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    let (status, payment) = ana
        .post(
            &format!("{}?month=2026-11", pay_uri(&other)),
            json!({ "date": "2026-11-10", "amount": "50" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    let second = entry_uri(&listed(&ana, "2026-12").await);

    let (status, noted) = ana
        .patch(&format!("{second}?scope=all"), json!({ "note": "feira" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{noted}");
    let first = listed(&ana, "2026-11").await;
    assert_eq!(first["card_id"], other["id"]);
    assert_eq!(first["note"], "feira");
    assert_eq!(listed(&ana, "2026-12").await["card_id"], card["id"]);

    for body in [json!({ "amount": "60" }), json!({ "card_id": null })] {
        let (status, problem) = ana.patch(&format!("{second}?scope=all"), body).await;
        refused(status, &problem);
    }
    let (status, problem) = ana.delete(&format!("{second}?scope=all")).await;
    refused(status, &problem);
    let third = listed(&ana, "2027-01").await;
    let (status, plain) = ana
        .patch(
            &format!("{}?scope=this", entry_uri(&third)),
            json!({ "card_id": null }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{plain}");
    let (status, problem) = ana
        .patch(
            &format!("{}?scope=all", entry_uri(&third)),
            json!({ "amount": "60" }),
        )
        .await;
    refused(status, &problem);

    for of in ["2026-11", "2026-12", "2027-01", "2027-04"] {
        assert_eq!(listed(&ana, of).await["amount"], "50.00", "{of}");
    }
    assert_eq!(listed(&ana, "2026-11").await["card_id"], other["id"]);
    assert_eq!(
        listed(&ana, "2027-01").await["card_id"],
        serde_json::Value::Null
    );
}

#[sqlx::test]
async fn d30b_a_move_checks_every_moved_member_and_all_takes_a_new_card(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-10-01").await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let mercado = ana.category_id("Mercado").await;
    entry(
        &ana,
        json!({ "date": "2026-11-02", "amount": "50", "kind": "daily",
                "category_id": mercado, "card_id": card["id"] }),
    )
    .await;
    let plain = entry(
        &ana,
        json!({ "date": "2026-11-05", "amount": "10", "kind": "daily", "repeat_months": 3,
                "category_id": mercado }),
    )
    .await;
    let second = entry_uri(&listed(&ana, "2026-12").await);
    let (status, carded) = ana
        .patch(
            &format!("{second}?scope=all"),
            json!({ "card_id": card["id"] }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{carded}");
    for of in ["2026-11", "2026-12", "2027-01"] {
        let (_, entries) = ana.get(&format!("/api/transactions?month={of}")).await;
        let member = entries
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["series"]["id"] == plain["series"]["id"])
            .unwrap()
            .clone();
        assert_eq!(member["card_id"], card["id"], "{of}");
    }
    let (status, payment) = ana
        .post(
            &format!("{}?month=2026-11", pay_uri(&card)),
            json!({ "date": "2026-11-10", "amount": "50" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");

    let (status, problem) = ana
        .patch(
            &format!("{second}?scope=all"),
            json!({ "date": "2026-12-02" }),
        )
        .await;

    refused(status, &problem);
    let (_, november) = ana.get("/api/transactions?month=2026-11").await;
    assert!(
        november
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"] == plain["id"] && row["date"] == "2026-11-05")
    );
}
