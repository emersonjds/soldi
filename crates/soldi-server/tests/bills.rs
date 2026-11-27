mod common;

use axum::http::StatusCode;
use common::{TestApp, behind, hold_series};
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
        category_id: Some(light),
        closing_day: None,
        installments: None,
        last_month: None,
        variable: false,
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
async fn sol152_a_conta_fixa_keeps_variable_and_a_card_refuses_it(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", &this_month().to_string()).await;
    let light = category_id(&ana, "Luz").await;

    let luz = create(
        &ana,
        json!({ "name": "Luz", "amount": "180", "due_day": 25, "category_id": light, "variable": true }),
    )
    .await;
    let fixed = create(
        &ana,
        json!({ "name": "Psicóloga", "amount": "300", "due_day": 10, "category_id": light }),
    )
    .await;

    assert_eq!(
        (&luz["variable"], &fixed["variable"]),
        (&json!(true), &json!(false))
    );
    let (_, listed) = ana.get("/api/bills").await;
    assert_eq!(listed[1]["variable"], true);
    let (_, view) = ana
        .get(&format!("/api/months/{}", this_month().format("%Y-%m")))
        .await;
    let row = view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["bill_id"] == luz["id"])
        .unwrap();
    assert_eq!(row["variable"], true);
    let (status, patched) = ana
        .patch(&bill_uri(&luz), json!({ "variable": false }))
        .await;
    assert_eq!(
        (status, &patched["variable"]),
        (StatusCode::OK, &json!(false))
    );
    let (status, problem) = ana
        .post(
            "/api/bills",
            json!({ "name": "Porto", "due_day": 10, "closing_day": 3, "variable": true }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "variable");
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

fn drop_plan() -> serde_json::Value {
    json!({ "installments": null, "last_month": null })
}

async fn bill_ids_in(app: &TestApp, month: chrono::NaiveDate) -> Vec<(serde_json::Value, bool)> {
    let (_, view) = app.get(&format!("/api/months/{}", month_text(month))).await;
    view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| (row["bill_id"].clone(), row["paid"] == true))
        .collect()
}

#[sqlx::test]
async fn sol161_a_running_parcelada_becomes_a_fixa_with_no_end(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let month = |ahead: u32| this_month() + chrono::Months::new(ahead);
    let plan = create(&ana, fies(category_id(&ana, "Internet").await, month(2))).await;
    set_active_since(&pool, "2026-01-01").await;
    assert_eq!(bill_ids_in(&ana, month(3)).await, vec![]);

    let (status, fixa) = ana.patch(&bill_uri(&plan), drop_plan()).await;

    assert_eq!(status, StatusCode::OK, "{fixa}");
    assert_eq!(
        (&fixa["installments"], &fixa["last_month"], &fixa["active"]),
        (&json!(null), &json!(null), &json!(true))
    );
    assert_eq!(active_since(&pool).await, "2026-01-01".parse().unwrap());
    assert_eq!(
        bill_ids_in(&ana, month(3)).await,
        vec![(plan["id"].clone(), false)]
    );
}

#[sqlx::test]
async fn sol161_a_parcelada_ending_this_month_owes_next_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let next = this_month() + chrono::Months::new(1);
    let plan = create(
        &ana,
        fies(category_id(&ana, "Internet").await, this_month()),
    )
    .await;
    set_active_since(&pool, "2026-01-01").await;
    assert_eq!(bill_ids_in(&ana, next).await, vec![]);

    let (status, fixa) = ana.patch(&bill_uri(&plan), drop_plan()).await;

    assert_eq!(status, StatusCode::OK, "{fixa}");
    assert_eq!(fixa["last_month"], json!(null));
    assert_eq!(active_since(&pool).await, "2026-01-01".parse().unwrap());
    assert_eq!(
        bill_ids_in(&ana, next).await,
        vec![(plan["id"].clone(), false)]
    );
    assert_eq!(
        bill_ids_in(&ana, this_month()).await,
        vec![(plan["id"].clone(), false)]
    );
}

#[sqlx::test]
async fn sol161_an_ended_parcelada_owes_from_today(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("1000", "2026-01-01").await;
    let internet = category_id(&ana, "Internet").await;
    let plan = create(&ana, fies(internet, this_month() + chrono::Months::new(2))).await;
    let uri = bill_uri(&plan);
    end_last_month(&pool).await;
    set_active_since(&pool, "2026-01-01").await;
    sqlx::query("UPDATE categories SET kind = 'daily', color = 'cat-24' WHERE id = $1")
        .bind(internet)
        .execute(&pool)
        .await
        .unwrap();

    let (status, refused) = ana.patch(&uri, drop_plan()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
    assert_eq!(refused["errors"][0]["field"], "category_id");
    assert_eq!(
        ana.get("/api/bills?include_inactive=true").await.1[0]["installments"],
        6
    );

    let mut body = drop_plan();
    body["category_id"] = json!(category_id(&ana, "Luz").await);
    let (status, fixa) = ana.patch(&uri, body).await;

    assert_eq!(status, StatusCode::OK, "{fixa}");
    assert_eq!(
        (&fixa["installments"], &fixa["last_month"], &fixa["active"]),
        (&json!(null), &json!(null), &json!(true))
    );
    assert_eq!(active_since(&pool).await, soldi_server::today_sao_paulo());
    let (_, last) = ana
        .get(&format!("/api/months/{}", month_text(previous_month())))
        .await;
    assert_eq!(
        (
            &last["bills_of_month"][0]["overdue"],
            &last["bills_of_month"][0]["lands_on"]
        ),
        (&json!(false), &json!(null))
    );
    assert_eq!(
        bill_ids_in(&ana, this_month() + chrono::Months::new(1)).await,
        vec![(fixa["id"].clone(), false)]
    );
}

#[sqlx::test]
async fn sol161_dropping_the_plan_keeps_paid_months(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let next = this_month() + chrono::Months::new(1);
    let plan = create(
        &ana,
        fies(
            category_id(&ana, "Internet").await,
            this_month() + chrono::Months::new(2),
        ),
    )
    .await;
    let today = soldi_server::today_sao_paulo().to_string();
    for date in [today, next.to_string()] {
        let (status, paid) = ana.post(&pay_uri(&plan), json!({ "date": date })).await;
        assert_eq!(status, StatusCode::CREATED, "{paid}");
    }
    let before = (
        listed_in(&ana, this_month()).await,
        listed_in(&ana, next).await,
    );

    let (status, fixa) = ana.patch(&bill_uri(&plan), drop_plan()).await;

    assert_eq!(status, StatusCode::OK, "{fixa}");
    assert_eq!(fixa["installments"], json!(null));
    assert_eq!(
        (
            listed_in(&ana, this_month()).await,
            listed_in(&ana, next).await
        ),
        before
    );
    assert_eq!(before.1[0]["recurring_bill_id"], plan["id"]);
    assert_eq!(
        bill_ids_in(&ana, next).await,
        vec![(plan["id"].clone(), true)]
    );
}

#[sqlx::test]
async fn sol161_only_a_parcelada_drops_its_plan(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let month = |ahead: u32| this_month() + chrono::Months::new(ahead);
    let rent_category = category_id(&ana, "Aluguel").await;
    let fixa = create(&ana, rent(rent_category)).await;
    let paused = create(&ana, rent(rent_category)).await;
    ana.patch(&bill_uri(&paused), json!({ "active": false }))
        .await;
    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let plan = create(&ana, fies(category_id(&ana, "Internet").await, month(2))).await;
    let theirs = create(&bia, fies(category_id(&bia, "Internet").await, month(2))).await;
    let bills = ana.get("/api/bills?include_inactive=true").await.1;

    for bill in [&fixa, &paused, &card] {
        let (status, problem) = ana.patch(&bill_uri(bill), drop_plan()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{bill}");
        assert_eq!(problem["errors"][0]["field"], "installments", "{bill}");
    }
    for (body, field) in [
        (json!({ "installments": null }), "last_month"),
        (json!({ "last_month": null }), "last_month"),
        (
            json!({ "installments": null, "last_month": month(2) }),
            "last_month",
        ),
        (
            json!({ "installments": 6, "last_month": null }),
            "last_month",
        ),
        (
            json!({ "installments": null, "last_month": null, "active": true }),
            "active",
        ),
        (
            json!({ "installments": null, "last_month": null, "active": false }),
            "active",
        ),
    ] {
        let (status, problem) = ana.patch(&bill_uri(&plan), body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert_eq!(problem["errors"][0]["field"], field, "{body}");
    }
    assert_eq!(
        ana.patch(&bill_uri(&theirs), drop_plan()).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(ana.get("/api/bills?include_inactive=true").await.1, bills);
    assert!(
        bills.as_array().unwrap().iter().any(
            |bill| bill["id"] == paused["id"] && bill["last_month"] == this_month().to_string()
        )
    );
    assert_eq!(bia.get("/api/bills").await.1, json!([theirs]));
}

#[sqlx::test]
async fn sol161_a_patch_without_plan_keys_keeps_the_plan(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let last = this_month() + chrono::Months::new(2);
    let plan = create(&ana, fies(category_id(&ana, "Internet").await, last)).await;

    let (status, renamed) = ana
        .patch(&bill_uri(&plan), json!({ "name": "Fies 2" }))
        .await;

    assert_eq!(status, StatusCode::OK, "{renamed}");
    assert_eq!(
        (
            &renamed["name"],
            &renamed["installments"],
            &renamed["last_month"]
        ),
        (&json!("Fies 2"), &json!(6), &json!(last.to_string()))
    );
}

#[sqlx::test]
async fn sol161_a_fixa_paused_this_month_turns_parcelada(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let fixa = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&fixa);
    set_active_since(&pool, "2026-01-01").await;
    let (_, paused) = ana.patch(&uri, json!({ "active": false })).await;
    assert_eq!(paused["last_month"], this_month().to_string());

    let last = this_month() + chrono::Months::new(2);
    let (status, plan) = ana
        .patch(&uri, json!({ "installments": 3, "last_month": last }))
        .await;

    assert_eq!(status, StatusCode::OK, "{plan}");
    assert_eq!(
        (&plan["active"], &plan["installments"], &plan["last_month"]),
        (&json!(true), &json!(3), &json!(last.to_string()))
    );
    assert_eq!(active_since(&pool).await, "2026-01-01".parse().unwrap());
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

fn month_text(month: chrono::NaiveDate) -> String {
    month.format("%Y-%m").to_string()
}

/// The month view's totals and projected balance.
async fn month_numbers(
    app: &TestApp,
    month: chrono::NaiveDate,
) -> (serde_json::Value, serde_json::Value) {
    let (_, view) = app.get(&format!("/api/months/{}", month_text(month))).await;
    (view["totals"].clone(), view["projected_balance"].clone())
}

async fn listed_in(app: &TestApp, month: chrono::NaiveDate) -> Vec<serde_json::Value> {
    let (_, listed) = app
        .get(&format!("/api/transactions?month={}", month_text(month)))
        .await;
    listed.as_array().unwrap().clone()
}

#[sqlx::test]
async fn sol152_a_monthly_conta_series_becomes_a_conta_fixa_paid_in_its_months(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let start = this_month() - chrono::Months::new(3);
    ana.open_at("5000", &start.to_string()).await;
    let light = category_id(&ana, "Luz").await;
    let first = entry(
        &ana,
        json!({ "date": start, "amount": "500", "kind": "bill", "category_id": light, "repeat_months": 24 }),
    )
    .await;
    let gap = start + chrono::Months::new(1);
    let gone = &listed_in(&ana, gap).await[0];
    ana.delete(&format!(
        "/api/transactions/{}?scope=this",
        gone["id"].as_str().unwrap()
    ))
    .await;
    let months: Vec<_> = (0..=3).map(|n| start + chrono::Months::new(n)).collect();
    let next = this_month() + chrono::Months::new(1);
    let mut before = Vec::new();
    for month in &months {
        before.push(month_numbers(&ana, *month).await);
    }
    let next_before = month_numbers(&ana, next).await.1;
    let year_uri = format!("/api/reports/year?year={}", this_month().format("%Y"));
    let spending_uri = format!("/api/reports/categories?month={}", month_text(this_month()));
    let (year, spending) = (ana.get(&year_uri).await.1, ana.get(&spending_uri).await.1);
    let last_month = start + chrono::Months::new(23);
    let body = json!({ "name": "Porto", "amount": "500", "due_day": 1, "category_id": light,
                       "installments": 24, "last_month": last_month });

    let (status, bill) = ana.post(&from_entry(&first), body).await;

    assert_eq!(status, StatusCode::CREATED, "{bill}");
    assert_eq!(ana.get("/api/bills").await.1.as_array().unwrap().len(), 1);
    for (month, numbers) in months.iter().zip(&before) {
        let rows = listed_in(&ana, *month).await;
        if *month == gap {
            assert!(rows.is_empty());
            let (_, view) = ana.get(&format!("/api/months/{}", month_text(gap))).await;
            let row = &view["bills_of_month"][0];
            assert_eq!(
                (&row["paid"], &row["overdue"], &row["lands_on"]),
                (&json!(false), &json!(false), &json!(null))
            );
        } else {
            assert_eq!(rows.len(), 1, "{month}");
            assert_eq!(rows[0]["recurring_bill_id"], bill["id"]);
            assert_eq!(rows[0]["series"], json!(null));
            assert_eq!(
                (&rows[0]["amount"], &rows[0]["date"]),
                (&json!("500.00"), &json!(month.to_string()))
            );
            assert_eq!(rows[0]["category"]["id"], light.to_string());
        }
        assert_eq!(&month_numbers(&ana, *month).await, numbers, "{month}");
    }
    assert_eq!(month_numbers(&ana, next).await.1, next_before);
    assert_eq!(ana.get(&year_uri).await.1, year);
    assert_eq!(ana.get(&spending_uri).await.1, spending);
    ana.get("/api/forecast").await;
    assert!(listed_in(&ana, next).await.is_empty());
    assert!(listed_in(&ana, last_month).await.is_empty());
}

#[sqlx::test]
async fn sol152_todays_member_becomes_the_payment_and_later_ones_leave(pool: PgPool) {
    use chrono::Datelike;
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    ana.open_at("0", &this_month().to_string()).await;
    let light = category_id(&ana, "Luz").await;
    let first = entry(
        &ana,
        json!({ "date": today, "amount": "300", "kind": "bill", "category_id": light, "repeat_months": 3 }),
    )
    .await;
    let body = json!({ "name": "Psicóloga", "amount": "300", "due_day": today.day(), "category_id": light });

    let (status, bill) = ana.post(&from_entry(&first), body).await;

    assert_eq!(status, StatusCode::CREATED, "{bill}");
    let rows = listed_in(&ana, this_month()).await;
    assert_eq!(
        (rows.len(), &rows[0]["recurring_bill_id"]),
        (1, &bill["id"])
    );
    for ahead in 1..=2 {
        assert!(
            listed_in(&ana, this_month() + chrono::Months::new(ahead))
                .await
                .is_empty()
        );
    }
    let (_, view) = ana
        .get(&format!("/api/months/{}", month_text(this_month())))
        .await;
    assert_eq!(view["bills_of_month"][0]["paid"], true);
}

#[sqlx::test]
async fn sol152_a_series_a_bill_cannot_hold_is_refused_and_nothing_changes(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let start = this_month() - chrono::Months::new(2);
    ana.open_at("0", &start.to_string()).await;
    bia.open_at("0", &start.to_string()).await;
    let light = category_id(&ana, "Luz").await;
    let conta = |date: chrono::NaiveDate, extra: serde_json::Value| {
        let mut body =
            json!({ "date": date, "amount": "100", "kind": "bill", "category_id": light });
        body.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        body
    };
    let shared = entry(&ana, conta(start, json!({ "repeat_months": 6 }))).await;
    let second = &listed_in(&ana, start + chrono::Months::new(1)).await[0];
    let (status, _) = ana
        .patch(
            &format!(
                "/api/transactions/{}?scope=this",
                second["id"].as_str().unwrap()
            ),
            json!({ "date": start + chrono::Days::new(14) }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let weekly = entry(
        &ana,
        conta(start, json!({ "repeat_months": 3, "repeat_every": "week" })),
    )
    .await;
    let yearly = entry(
        &ana,
        conta(start, json!({ "repeat_months": 2, "repeat_every": "year" })),
    )
    .await;
    let paid_bill = create(
        &ana,
        json!({ "name": "Água", "amount": "80", "due_day": 1, "category_id": light }),
    )
    .await;
    let (_, payment) = ana
        .post(
            &format!("{}/pay", bill_uri(&paid_bill)),
            json!({ "date": this_month() }),
        )
        .await;
    let theirs = entry(
        &bia,
        json!({ "date": start, "amount": "100", "kind": "bill",
                "category_id": category_id(&bia, "Luz").await, "repeat_months": 2 }),
    )
    .await;
    let members = || {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM transactions WHERE series_id IS NOT NULL",
        )
        .fetch_one(&pool)
    };
    let held = members().await.unwrap();
    let body = json!({ "name": "Luz", "amount": "100", "due_day": 1, "category_id": light });

    for (refused, slug) in [
        (&shared, "series-shared-month"),
        (&weekly, "cannot-become-bill"),
        (&yearly, "cannot-become-bill"),
        (&payment, "cannot-become-bill"),
    ] {
        let (status, problem) = ana.post(&from_entry(refused), body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
        assert_eq!(problem["type"], format!("urn:soldi:error:{slug}"));
    }
    assert_eq!(
        ana.post(&from_entry(&theirs), body).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(ana.get("/api/bills").await.1.as_array().unwrap().len(), 1);
    assert_eq!(members().await.unwrap(), held);
}

#[sqlx::test]
async fn sol152_a_series_holding_another_kind_is_refused_and_nothing_changes(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let start = this_month() - chrono::Months::new(1);
    ana.open_at("0", &start.to_string()).await;
    let light = category_id(&ana, "Luz").await;
    let first = entry(
        &ana,
        json!({ "date": start, "amount": "100", "kind": "bill", "category_id": light, "repeat_months": 3 }),
    )
    .await;
    let other = &listed_in(&ana, this_month()).await[0];
    sqlx::query("UPDATE transactions SET kind = 'daily' WHERE id = $1::uuid")
        .bind(other["id"].as_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let body = json!({ "name": "Luz", "amount": "100", "due_day": 1, "category_id": light });

    let (status, problem) = ana.post(&from_entry(&first), body).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:cannot-become-bill");
    assert!(ana.get("/api/bills").await.1.as_array().unwrap().is_empty());
    let members: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM transactions WHERE series_id = $1::uuid AND recurring_bill_id IS NULL",
    )
    .bind(first["series"]["id"].as_str().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(members, 3);
}

#[sqlx::test]
async fn sol152_two_concurrent_conversions_of_one_series_make_one_bill(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("0", &this_month().to_string()).await;
    let light = category_id(&ana, "Luz").await;
    let first = entry(
        &ana,
        json!({ "date": this_month(), "amount": "100", "kind": "bill", "category_id": light, "repeat_months": 3 }),
    )
    .await;
    let body = json!({ "name": "Luz", "amount": "100", "due_day": 1, "category_id": light });
    let uri = from_entry(&first);
    let lock = hold_series(&pool, &first).await;

    let both = async { tokio::join!(ana.post(&uri, body.clone()), ana.post(&uri, body.clone()),) };
    let (one, other) = behind(&pool, lock, 2, both).await;

    let (won, lost) = if one.0 == StatusCode::CREATED {
        (one, other)
    } else {
        (other, one)
    };
    assert_eq!(won.0, StatusCode::CREATED, "{}", won.1);
    assert_eq!(lost.0, StatusCode::UNPROCESSABLE_ENTITY, "{}", lost.1);
    assert_eq!(lost.1["type"], "urn:soldi:error:cannot-become-bill");
    assert_eq!(ana.get("/api/bills").await.1.as_array().unwrap().len(), 1);
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
        json!({ "date": "2026-11-07", "amount": "10", "kind": "bill", "category_id": rent, "repeat_months": 2, "repeat_every": "week" }),
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
async fn d33_a_yearly_series_member_never_becomes_a_bill_payment(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    let rent = category_id(&ana, "Aluguel").await;
    entry(
        &ana,
        json!({ "date": "2026-11-07", "amount": "10", "kind": "bill", "category_id": rent, "repeat_months": 3, "repeat_every": "year" }),
    )
    .await;
    let (_, december) = ana.get("/api/transactions?month=2027-11").await;
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

/// The caller's active card groups as `(id, name, icon, color)`.
async fn card_groups(app: &TestApp) -> Vec<(String, String, String, String)> {
    let (_, list) = app.get("/api/categories").await;
    list.as_array()
        .unwrap()
        .iter()
        .filter(|category| category["is_card_group"] == true)
        .map(|category| {
            let text = |key: &str| category[key].as_str().unwrap().to_string();
            (text("id"), text("name"), text("icon"), text("color"))
        })
        .collect()
}

fn uncategorized_card() -> serde_json::Value {
    json!({ "name": "Porto", "due_day": 10, "closing_day": 3 })
}

#[sqlx::test]
async fn sol140_a_card_without_a_category_lands_in_the_card_group(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let theirs = card_groups(&bia).await;
    let group = category_id(&ana, "Cartão").await;
    let assinaturas = category_id(&ana, "Assinaturas").await;
    let (_, old) = ana
        .post(
            "/api/bills",
            json!({ "name": "Nubank", "due_day": 5, "closing_day": 1, "category_id": assinaturas }),
        )
        .await;
    let before = ana.get("/api/categories").await.1.as_array().unwrap().len();

    let (status, card) = ana.post("/api/bills", uncategorized_card()).await;

    assert_eq!(status, StatusCode::CREATED, "{card}");
    assert_eq!(card["category_id"], json!(group));
    assert_eq!(card["closing_day"], 3);
    let after = ana.get("/api/categories").await.1.as_array().unwrap().len();
    assert_eq!(after, before);
    let (_, bills) = ana.get("/api/bills").await;
    let nubank = bills
        .as_array()
        .unwrap()
        .iter()
        .find(|bill| bill["id"] == old["id"]);
    assert_eq!(nubank.unwrap()["category_id"], json!(assinaturas));
    assert_eq!(card_groups(&bia).await, theirs);
}

#[sqlx::test]
async fn sol140_with_the_card_group_archived_a_new_cartao_takes_the_lowest_free_fixa_color(
    pool: PgPool,
) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let theirs = card_groups(&bia).await;
    let old = category_id(&ana, "Cartão").await;
    let (status, _) = ana.delete(&format!("/api/categories/{old}")).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, card) = ana.post("/api/bills", uncategorized_card()).await;

    assert_eq!(status, StatusCode::CREATED, "{card}");
    let groups = card_groups(&ana).await;
    assert_eq!(groups.len(), 1);
    let (id, name, icon, color) = &groups[0];
    assert_eq!(card["category_id"], json!(id));
    assert_ne!(id, &old.to_string());
    assert_eq!(
        (name.as_str(), icon.as_str(), color.as_str()),
        ("Cartão", "credit-card", "cat-1")
    );
    assert_eq!(card_groups(&bia).await, theirs);
}

#[sqlx::test]
async fn sol140_an_active_fixa_cartao_not_flagged_is_taken_over(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let theirs = card_groups(&bia).await;
    let old = category_id(&ana, "Cartão").await;
    ana.delete(&format!("/api/categories/{old}")).await;
    let (status, mine) = ana
        .post(
            "/api/categories",
            json!({ "name": "cartão", "kind": "bill" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{mine}");
    assert_eq!(mine["is_card_group"], false);
    let before = ana.get("/api/categories").await.1.as_array().unwrap().len();

    let (status, card) = ana.post("/api/bills", uncategorized_card()).await;

    assert_eq!(status, StatusCode::CREATED, "{card}");
    assert_eq!(card["category_id"], mine["id"]);
    let groups = card_groups(&ana).await;
    assert_eq!(
        (groups.len(), json!(groups[0].0), groups[0].1.as_str()),
        (1, mine["id"].clone(), "cartão")
    );
    let after = ana.get("/api/categories").await.1.as_array().unwrap().len();
    assert_eq!(after, before);
    assert_eq!(card_groups(&bia).await, theirs);
}

#[sqlx::test]
async fn sol140_concurrent_first_cards_share_one_card_group(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let theirs = card_groups(&bia).await;
    let old = category_id(&ana, "Cartão").await;
    ana.delete(&format!("/api/categories/{old}")).await;

    let (first, second) = tokio::join!(
        ana.post("/api/bills", uncategorized_card()),
        ana.post(
            "/api/bills",
            json!({ "name": "Nubank", "due_day": 5, "closing_day": 1 })
        )
    );

    assert_eq!(first.0, StatusCode::CREATED, "{}", first.1);
    assert_eq!(second.0, StatusCode::CREATED, "{}", second.1);
    assert_eq!(first.1["category_id"], second.1["category_id"]);
    let groups = card_groups(&ana).await;
    assert_eq!(groups.len(), 1);
    assert_eq!(first.1["category_id"], json!(groups[0].0));
    assert_eq!(card_groups(&bia).await, theirs);
}

#[sqlx::test]
async fn sol140_a_conta_fixa_still_needs_a_category(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem) = ana
        .post(
            "/api/bills",
            json!({ "name": "Luz", "due_day": 10, "amount": "100.00" }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "category_id");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

/// Archives the seeded card group, so the next uncategorized card looks for a new one.
async fn archive_card_group(app: &TestApp) {
    let old = category_id(app, "Cartão").await;
    let (status, _) = app.delete(&format!("/api/categories/{old}")).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn sol140_the_card_group_is_never_a_subcategory_or_cofrinho_named_cartao(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    archive_card_group(&ana).await;
    for parent in ["Casa", "Economia"] {
        let parent_id = category_id(&ana, parent).await;
        let (status, sub) = ana
            .post(
                "/api/categories",
                json!({ "name": "Cartão", "kind": "bill", "parent_id": parent_id }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{sub}");

        let (status, problem) = ana.post("/api/bills", uncategorized_card()).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "category_id");
        assert!(card_groups(&ana).await.is_empty());
        assert_eq!(ana.get("/api/bills").await.1, json!([]));
        let sub = sub["id"].as_str().unwrap();
        ana.delete(&format!("/api/categories/{sub}")).await;
    }
}

#[sqlx::test]
async fn sol140_a_card_never_lands_in_a_card_group_under_economia(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let group = category_id(&ana, "Cartão").await;
    let economia = category_id(&ana, "Economia").await;
    sqlx::query("UPDATE categories SET parent_id = $1 WHERE id = $2")
        .bind(economia)
        .bind(group)
        .execute(&pool)
        .await
        .unwrap();

    let (status, problem) = ana.post("/api/bills", uncategorized_card()).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "category_id");
    assert_eq!(ana.get("/api/bills").await.1, json!([]));
}

#[sqlx::test]
async fn sol140_a_full_fixa_palette_still_takes_over_an_active_cartao(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    archive_card_group(&ana).await;
    let (status, mine) = ana
        .post(
            "/api/categories",
            json!({ "name": "Cartão", "kind": "bill" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{mine}");
    for n in 0..24 {
        ana.post(
            "/api/categories",
            json!({ "name": format!("Fixa {n}"), "kind": "bill" }),
        )
        .await;
    }
    let (_, problem) = ana
        .post("/api/categories", json!({ "name": "Mais", "kind": "bill" }))
        .await;
    assert_eq!(problem["type"], "urn:soldi:error:palette-full");

    let (status, card) = ana.post("/api/bills", uncategorized_card()).await;

    assert_eq!(status, StatusCode::CREATED, "{card}");
    assert_eq!(card["category_id"], mine["id"]);
}

#[sqlx::test]
#[should_panic(expected = "a conta fixa always has a category")]
async fn sol140_inserting_onboarding_bills_without_a_category_is_a_bug(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let light = category_id(&ana, "Luz").await;
    let bill = |category_id| CreateBill {
        name: "Luz".into(),
        amount: None,
        due_day: 10,
        category_id,
        closing_day: None,
        installments: None,
        last_month: None,
        variable: false,
    };
    let mut conn = pool.acquire().await.unwrap();
    let _ = soldi_server::bills::repo::insert_all(
        &mut conn,
        user_id(&ana).await,
        &[bill(None), bill(Some(light))],
    )
    .await;
}

fn today() -> chrono::NaiveDate {
    soldi_server::today_sao_paulo()
}

fn two_months_back() -> chrono::NaiveDate {
    this_month() - chrono::Months::new(2)
}

async fn set_auto_paid_through(pool: &PgPool, date: chrono::NaiveDate) {
    sqlx::query("UPDATE recurring_bills SET auto_paid_through = $1")
        .bind(date)
        .execute(pool)
        .await
        .unwrap();
}

async fn auto_paid_through(pool: &PgPool, bill: &serde_json::Value) -> chrono::NaiveDate {
    sqlx::query_scalar("SELECT auto_paid_through FROM recurring_bills WHERE id = $1::uuid")
        .bind(bill["id"].as_str().unwrap())
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Every bill owes from `since` and was auto-paid through the day before.
async fn owing_since(pool: &PgPool, since: chrono::NaiveDate) {
    sqlx::query("UPDATE recurring_bills SET active_since = $1, auto_paid_through = $1 - 1")
        .bind(since)
        .execute(pool)
        .await
        .unwrap();
}

fn caller(id: Uuid) -> soldi_server::extract::CurrentUser {
    soldi_server::extract::CurrentUser {
        id,
        session_id: Uuid::nil(),
    }
}

async fn auto_pay_on(pool: &PgPool, app: &TestApp, on: chrono::NaiveDate) {
    let user = caller(user_id(app).await);
    soldi_server::bills::service::auto_pay(pool, &user, on)
        .await
        .unwrap();
}

async fn payments_of(pool: &PgPool, bill: &serde_json::Value) -> Vec<(chrono::NaiveDate, String)> {
    sqlx::query_as(
        "SELECT date, amount::text FROM transactions WHERE recurring_bill_id = $1::uuid
         ORDER BY date",
    )
    .bind(bill["id"].as_str().unwrap())
    .fetch_all(pool)
    .await
    .unwrap()
}

fn paid_on(dates: &[chrono::NaiveDate], amount: &str) -> Vec<(chrono::NaiveDate, String)> {
    dates
        .iter()
        .map(|date| (*date, amount.to_owned()))
        .collect()
}

/// The caller opened two months back with a R$ 1.500,00 rent due on the 1st, owing since last
/// month and auto-paid through the day before.
async fn rent_behind(pool: &PgPool, app: &TestApp) -> serde_json::Value {
    app.open_at("1000", &two_months_back().to_string()).await;
    let body = json!({ "name": "Aluguel", "amount": "1500", "due_day": 1,
                       "category_id": category_id(app, "Aluguel").await });
    let rent = create(app, body).await;
    owing_since(pool, previous_month()).await;
    rent
}

/// The month view's row of the bill due on `due`.
async fn row_due(
    app: &TestApp,
    month: chrono::NaiveDate,
    due: chrono::NaiveDate,
) -> serde_json::Value {
    let (_, view) = app.get(&format!("/api/months/{}", month_text(month))).await;
    view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["due_date"] == due.to_string())
        .cloned()
        .unwrap_or_default()
}

#[sqlx::test]
async fn d55_a_fixed_conta_due_after_the_watermark_is_paid_on_its_due_date(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;

    auto_pay_on(&pool, &ana, today()).await;
    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(
        payments_of(&pool, &rent).await,
        paid_on(&[previous_month(), this_month()], "1500.00")
    );
    let row = row_due(&ana, this_month(), this_month()).await;
    assert_eq!(row["paid"], true, "{row}");
    assert!(row["transaction_id"].is_string());
    assert_eq!(auto_paid_through(&pool, &rent).await, today());
}

#[sqlx::test]
async fn d55_months_before_the_watermark_stay_venceu(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    set_auto_paid_through(&pool, today().pred_opt().unwrap()).await;

    auto_pay_on(&pool, &ana, today()).await;

    assert!(
        payments_of(&pool, &rent)
            .await
            .iter()
            .all(|(date, _)| *date >= this_month())
    );
    let carried = row_due(&ana, this_month(), previous_month()).await;
    assert_eq!(carried["paid"], false, "{carried}");
    assert_eq!(carried["overdue"], true);
}

#[sqlx::test]
async fn d55_variable_contas_and_cards_stay_open(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("1000", &two_months_back().to_string()).await;
    let light = create(
        &ana,
        json!({ "name": "Luz", "amount": "200", "due_day": 1, "variable": true,
                "category_id": category_id(&ana, "Luz").await }),
    )
    .await;
    let card = create(&ana, uncategorized_card()).await;
    owing_since(&pool, two_months_back()).await;

    auto_pay_on(&pool, &ana, today()).await;

    assert!(payments_of(&pool, &light).await.is_empty());
    assert!(payments_of(&pool, &card).await.is_empty());
    assert_eq!(auto_paid_through(&pool, &light).await, today());
}

#[sqlx::test]
async fn d55_nao_paguei_keeps_the_month_open(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    auto_pay_on(&pool, &ana, today()).await;
    let unpay = format!("{}?month={}", pay_uri(&rent), month_text(previous_month()));

    assert_eq!(ana.delete(&unpay).await.0, StatusCode::NO_CONTENT);
    auto_pay_on(&pool, &ana, today()).await;
    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(
        payments_of(&pool, &rent).await,
        paid_on(&[this_month()], "1500.00")
    );
    let open = row_due(&ana, this_month(), previous_month()).await;
    assert_eq!(open["paid"], false, "{open}");
    assert_eq!(open["overdue"], true);
}

#[sqlx::test]
async fn d55_excluir_of_an_auto_payment_keeps_the_month_open(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    auto_pay_on(&pool, &ana, today()).await;
    let paid = row_due(&ana, previous_month(), previous_month()).await;
    let entry = format!(
        "/api/transactions/{}",
        paid["transaction_id"].as_str().unwrap()
    );

    assert_eq!(ana.delete(&entry).await.0, StatusCode::NO_CONTENT);
    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(
        payments_of(&pool, &rent).await,
        paid_on(&[this_month()], "1500.00")
    );
    let open = row_due(&ana, this_month(), previous_month()).await;
    assert_eq!(
        (open["paid"].clone(), open["overdue"].clone()),
        (json!(false), json!(true))
    );
}

#[sqlx::test]
async fn d55_pagar_after_nao_paguei_books_another_amount(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    auto_pay_on(&pool, &ana, today()).await;
    let month = month_text(previous_month());
    ana.delete(&format!("{}?month={month}", pay_uri(&rent)))
        .await;
    let on = previous_month() + chrono::Days::new(14);

    let (status, paid) = ana
        .post(
            &format!("{}?month={month}", pay_uri(&rent)),
            json!({ "date": on, "amount": "1550.00" }),
        )
        .await;
    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(status, StatusCode::CREATED, "{paid}");
    assert_eq!(
        payments_of(&pool, &rent).await,
        [
            (on, "1550.00".to_owned()),
            (this_month(), "1500.00".to_owned())
        ]
    );
}

#[sqlx::test]
async fn d55_an_early_payment_is_kept(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    let next = this_month() + chrono::Months::new(1);
    let (status, early) = ana
        .post(
            &format!("{}?month={}", pay_uri(&rent), month_text(next)),
            json!({ "date": next, "amount": "1400.00" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{early}");
    owing_since(&pool, previous_month()).await;

    auto_pay_on(&pool, &ana, next).await;

    assert_eq!(
        payments_of(&pool, &rent).await,
        [
            (previous_month(), "1500.00".to_owned()),
            (this_month(), "1500.00".to_owned()),
            (next, "1400.00".to_owned())
        ]
    );
}

#[sqlx::test]
async fn d55_parar_and_the_last_parcela_bound_auto_pay(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let fies = create(
        &ana,
        json!({ "name": "Fies", "amount": "300", "due_day": 1,
                "category_id": category_id(&ana, "Aluguel").await }),
    )
    .await;
    let rent = rent_behind(&pool, &ana).await;
    sqlx::query("UPDATE recurring_bills SET last_month = $1")
        .bind(previous_month())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE recurring_bills SET installments = 2 WHERE id = $1::uuid")
        .bind(fies["id"].as_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM transactions")
        .execute(&pool)
        .await
        .unwrap();
    owing_since(&pool, two_months_back() - chrono::Months::new(1)).await;

    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(
        payments_of(&pool, &rent).await,
        paid_on(&[two_months_back(), previous_month()], "1500.00")
    );
    assert_eq!(
        payments_of(&pool, &fies).await,
        paid_on(&[two_months_back(), previous_month()], "300.00")
    );
}

#[sqlx::test]
async fn d55_a_category_no_longer_bill_is_not_paid(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    sqlx::query("UPDATE categories SET kind = 'daily', color = 'cat-24' WHERE id = $1::uuid")
        .bind(rent["category_id"].as_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();

    auto_pay_on(&pool, &ana, today()).await;

    assert!(payments_of(&pool, &rent).await.is_empty());
    assert_eq!(auto_paid_through(&pool, &rent).await, today());
}

#[sqlx::test]
async fn d55_only_the_callers_bills_pay_themselves(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let bia_id = user_id(&bia).await;
    let theirs = rent_behind(&pool, &bia).await;
    let rent = rent_behind(&pool, &ana).await;

    auto_pay_on(&pool, &ana, today()).await;

    assert_eq!(payments_of(&pool, &rent).await.len(), 2);
    assert!(payments_of(&pool, &theirs).await.is_empty());
    assert_eq!(
        auto_paid_through(&pool, &theirs).await,
        previous_month().pred_opt().unwrap()
    );
    soldi_server::bills::service::auto_pay(&pool, &caller(bia_id), today())
        .await
        .unwrap();
    assert_eq!(payments_of(&pool, &theirs).await.len(), 2);
}

#[sqlx::test]
async fn d55_a_caught_up_user_takes_no_entry_lock(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    rent_behind(&pool, &ana).await;
    let user = caller(user_id(&ana).await);
    soldi_server::bills::service::auto_pay(&pool, &user, today())
        .await
        .unwrap();
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('entries:' || $1::text, 0))")
        .bind(user.id.to_string())
        .execute(&mut *lock)
        .await
        .unwrap();

    let caught_up = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        soldi_server::bills::service::auto_pay(&pool, &user, today()),
    )
    .await;

    assert!(matches!(caught_up, Ok(Ok(()))));
    lock.rollback().await.unwrap();
}

#[sqlx::test]
async fn d55_any_signed_in_request_catches_up(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    rent_behind(&pool, &ana).await;

    let (status, report) = ana
        .get(&format!(
            "/api/reports/categories?month={}",
            month_text(this_month())
        ))
        .await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["spent_total"], "1500.00");
}

#[sqlx::test]
async fn d55_concurrent_reads_write_one_payment(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let id = user_id(&ana).await;
    let rent = rent_behind(&pool, &ana).await;
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('entries:' || $1::text, 0))")
        .bind(id.to_string())
        .execute(&mut *lock)
        .await
        .unwrap();
    let uri = format!("/api/months/{}", month_text(this_month()));

    let both = async { tokio::join!(ana.get(&uri), ana.get(&uri)) };
    let (one, other) = behind(&pool, lock, 2, both).await;

    assert_eq!((one.0, other.0), (StatusCode::OK, StatusCode::OK));
    assert_eq!(
        payments_of(&pool, &rent).await,
        paid_on(&[previous_month(), this_month()], "1500.00")
    );
}

#[sqlx::test]
async fn d55_a_catch_up_and_a_pay_never_deadlock(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let id = user_id(&ana).await;
    let rent = rent_behind(&pool, &ana).await;
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('entries:' || $1::text, 0))")
        .bind(id.to_string())
        .execute(&mut *lock)
        .await
        .unwrap();
    let catch_up = ana.get("/api/bills");
    let pay = async {
        common::waiting(&pool, 1).await;
        set_auto_paid_through(&pool, today()).await;
        ana.post(
            &format!("{}?month={}", pay_uri(&rent), month_text(this_month())),
            json!({ "date": this_month() }),
        )
        .await
    };

    let both = async { tokio::join!(catch_up, pay) };
    let (caught_up, paid) = behind(&pool, lock, 2, both).await;

    assert_eq!(caught_up.0, StatusCode::OK, "{}", caught_up.1);
    assert_eq!(paid.0, StatusCode::CREATED, "{}", paid.1);
}

#[sqlx::test]
async fn d55_a_failing_catch_up_answers_without_server_detail(pool: PgPool) {
    let log = common::Log::capture();
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let rent = rent_behind(&pool, &ana).await;
    sqlx::raw_sql(
        "CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN RAISE EXCEPTION 'secret detail'; END $$;
         CREATE TRIGGER refuse BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION refuse();",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (status, bills) = ana.get("/api/bills").await;

    assert_eq!(status, StatusCode::OK, "{bills}");
    assert!(!bills.to_string().contains("secret"), "{bills}");
    assert!(payments_of(&pool, &rent).await.is_empty());
    let line = log.line("auto-pay catch-up failed").await;
    assert!(line.contains("ERROR"), "{line}");
    assert!(!line.contains("secret"), "{line}");
}

/// The day before today in São Paulo by the database clock, the one `bills::repo::update` reads.
async fn yesterday_in_db(pool: &PgPool) -> chrono::NaiveDate {
    sqlx::query_scalar("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn d55_retomar_and_variable_off_restart_from_yesterday(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    let uri = bill_uri(&created);
    ana.patch(&uri, json!({ "active": false })).await;
    end_last_month(&pool).await;
    ana.get("/api/bills").await;
    assert_eq!(auto_paid_through(&pool, &created).await, today());

    let (status, resumed) = ana.patch(&uri, json!({ "active": true })).await;
    assert_eq!(status, StatusCode::OK, "{resumed}");
    assert_eq!(
        auto_paid_through(&pool, &created).await,
        yesterday_in_db(&pool).await
    );
    ana.patch(&uri, json!({ "variable": true })).await;
    assert_eq!(auto_paid_through(&pool, &created).await, today());
    ana.patch(&uri, json!({ "name": "Casa" })).await;
    assert_eq!(auto_paid_through(&pool, &created).await, today());
    let (status, fixed) = ana.patch(&uri, json!({ "variable": false })).await;
    assert_eq!(status, StatusCode::OK, "{fixed}");
    assert_eq!(
        auto_paid_through(&pool, &created).await,
        yesterday_in_db(&pool).await
    );
}

fn next_month() -> chrono::NaiveDate {
    this_month() + chrono::Months::new(1)
}

fn month_uri(bill: &serde_json::Value, month: chrono::NaiveDate) -> String {
    format!("{}/months/{}", bill_uri(bill), month_text(month))
}

/// Ana opened this month with the R$ 2.259,56 rent (due on the 5th, owing from today).
async fn ana_with_rent(pool: PgPool) -> (TestApp, serde_json::Value) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", &this_month().to_string()).await;
    let created = create(&ana, rent(category_id(&ana, "Aluguel").await)).await;
    (ana, created)
}

/// The month view's first row (Ana has one bill) and the view.
async fn first_row(
    app: &TestApp,
    month: chrono::NaiveDate,
) -> (serde_json::Value, serde_json::Value) {
    let (_, view) = app.get(&format!("/api/months/{}", month_text(month))).await;
    (view["bills_of_month"][0].clone(), view)
}

fn refused_as(status: StatusCode, problem: &serde_json::Value, slug: &str) {
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(
        problem["type"],
        format!("urn:soldi:error:{slug}"),
        "{problem}"
    );
}

#[sqlx::test]
async fn d56_a_months_own_amount_and_skip_show_in_that_month_only(pool: PgPool) {
    let (ana, rent) = ana_with_rent(pool).await;

    let own = json!({ "amount": "2300.00", "skipped": false });
    let (status, body) = ana.put(&month_uri(&rent, next_month()), own).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let (row, _) = first_row(&ana, next_month()).await;
    assert_eq!(
        (row["amount"].clone(), row["adjusted"].clone()),
        (json!("2300.00"), json!(true))
    );
    let (later, _) = first_row(&ana, next_month() + chrono::Months::new(1)).await;
    assert_eq!(
        (later["amount"].clone(), later["adjusted"].clone()),
        (json!("2259.56"), json!(false))
    );

    let skip = json!({ "amount": "2300.00", "skipped": true });
    let (status, body) = ana.put(&month_uri(&rent, next_month()), skip).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let (row, view) = first_row(&ana, next_month()).await;
    assert_eq!(
        (row["skipped"].clone(), row["lands_on"].clone()),
        (json!(true), serde_json::Value::Null)
    );
    assert_eq!(view["projected_balance"], "1000.00");

    let uri = month_uri(&rent, next_month());
    assert_eq!(ana.delete(&uri).await.0, StatusCode::NO_CONTENT);
    assert_eq!(
        ana.delete(&uri).await.0,
        StatusCode::NO_CONTENT,
        "idempotent"
    );
    let (row, _) = first_row(&ana, next_month()).await;
    assert_eq!(
        (row["amount"].clone(), row["skipped"].clone()),
        (json!("2259.56"), json!(false))
    );
}

#[sqlx::test]
async fn d56_a_month_override_is_refused_on_cards_outside_the_run_paid_months_and_bad_bodies(
    pool: PgPool,
) {
    let (ana, rent) = ana_with_rent(pool).await;
    let skip = || json!({ "skipped": true });

    let before = month_uri(&rent, this_month() - chrono::Months::new(1));
    let (status, problem) = ana.put(&before, skip()).await;
    refused_as(status, &problem, "month-outside-bill");
    for body in [
        json!({ "skipped": false }),
        json!({ "amount": "0", "skipped": false }),
        json!({ "amount": "1.001", "skipped": false }),
    ] {
        let (status, problem) = ana.put(&month_uri(&rent, next_month()), body.clone()).await;
        refused_as(status, &problem, "validation");
    }
    let bad_month = format!("{}/months/2026-13", bill_uri(&rent));
    let (status, problem) = ana.put(&bad_month, skip()).await;
    refused_as(status, &problem, "validation");
    let (status, problem) = ana.delete(&bad_month).await;
    refused_as(status, &problem, "validation");

    let pay = format!("{}?month={}", pay_uri(&rent), month_text(next_month()));
    let (status, paid) = ana
        .post(&pay, json!({ "date": next_month().to_string() }))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
    let (status, problem) = ana.put(&month_uri(&rent, next_month()), skip()).await;
    assert_eq!(status, StatusCode::CONFLICT, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:bill-already-paid");

    let card = create(&ana, porto(&ana.category_id("Cartão").await)).await;
    let (status, problem) = ana.put(&month_uri(&card, next_month()), skip()).await;
    refused_as(status, &problem, "card-month");
}

#[sqlx::test]
async fn d56_another_users_or_an_archived_bill_takes_no_month_override(pool: PgPool) {
    let (ana, rent) = ana_with_rent(pool.clone()).await;
    let bob = ana.another_user("bob@example.com").await;

    let uri = month_uri(&rent, next_month());
    assert_eq!(
        bob.put(&uri, json!({ "skipped": true })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(bob.delete(&uri).await.0, StatusCode::NOT_FOUND);
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM bill_months")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);

    assert_eq!(ana.delete(&bill_uri(&rent)).await.0, StatusCode::NO_CONTENT);
    assert_eq!(
        ana.put(&uri, json!({ "skipped": true })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(ana.delete(&uri).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn d56_a_month_override_waits_for_the_entry_lock(pool: PgPool) {
    let (ana, rent) = ana_with_rent(pool.clone()).await;
    let id = user_id(&ana).await;
    set_auto_paid_through(&pool, today()).await;
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('entries:' || $1::text, 0))")
        .bind(id.to_string())
        .execute(&mut *lock)
        .await
        .unwrap();

    let uri = month_uri(&rent, next_month());
    let put = ana.put(&uri, json!({ "skipped": true }));
    let (status, body) = behind(&pool, lock, 1, put).await;

    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
}
