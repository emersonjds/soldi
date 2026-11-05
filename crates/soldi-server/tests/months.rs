mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn open_at(user: &TestApp, balance: &str, date: &str) {
    user.open_at(balance, date).await;
}

async fn log(user: &TestApp, date: &str, kind: &str, amount: &str, category: &str) {
    let category_id = user.category_id(category).await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": kind, "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

fn balances(view: &Value, count: usize) -> Vec<&str> {
    view["days"].as_array().unwrap()[..count]
        .iter()
        .map(|day| day["balance"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn the_sheets_first_days_come_back_with_balances_tiers_and_totals(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-11-01").await;
    log(&user, "2026-11-02", "income", "500", "Salário").await;
    log(&user, "2026-11-03", "bill", "300", "Aluguel").await;
    log(&user, "2026-11-03", "daily", "50", "Mercado").await;

    let (status, view) = user.get("/api/months/2026-11").await;

    assert_eq!(status, StatusCode::OK, "{view}");
    assert_eq!(view["month"], "2026-11");
    assert_eq!(view["days"].as_array().unwrap().len(), 30);
    assert_eq!(
        balances(&view, 4),
        ["1000.00", "1500.00", "1150.00", "1150.00"]
    );
    assert_eq!(
        view["days"][2],
        json!({
            "date": "2026-11-03", "income": "0.00", "withdrawn": "0.00", "bills": "300.00", "daily": "50.00",
            "balance": "1150.00", "tier": "light_green",
            "is_today": view["days"][2]["is_today"], "is_future": view["days"][2]["is_future"]
        })
    );
    assert_eq!(
        view["totals"],
        json!({ "income": "500.00", "bills": "300.00", "daily": "50.00", "outflow": "350.00", "performance": "150.00", "saved": "0.00", "withdrawn": "0.00" })
    );
    assert_eq!(view["projected_balance"], "1150.00");
    assert_eq!(view["projected_tier"], "light_green");
    assert_eq!(view["bills_of_month"], json!([]));
    assert_eq!(
        view["savings"],
        json!({ "saved": "0.00", "rate_pct": "0.0" })
    );
    let (_, december) = user.get("/api/months/2026-12").await;
    assert_eq!(balances(&december, 1), ["1150.00"]);
    assert_eq!(
        december["savings"],
        json!({ "saved": "0.00", "rate_pct": null })
    );
}

#[sqlx::test]
async fn bills_under_economia_are_the_months_savings_and_still_leave_the_balance(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "0", "2026-10-01").await;
    let economia = user.category_id("Economia").await;
    let (_, reserva) = user
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia }),
        )
        .await;
    assert!(reserva["id"].is_string(), "{reserva}");
    log(&user, "2026-11-02", "income", "3000", "Salário").await;
    log(&user, "2026-11-03", "bill", "300", "Reserva").await;
    log(&user, "2026-11-04", "bill", "100.55", "Economia").await;
    log(&user, "2026-11-04", "bill", "1000", "Aluguel").await;
    log(&user, "2026-10-31", "bill", "999", "Reserva").await;

    let (_, view) = user.get("/api/months/2026-11").await;

    assert_eq!(view["totals"]["saved"], "400.55");
    assert_eq!(view["totals"]["outflow"], "1400.55");
    assert_eq!(view["totals"]["performance"], "1599.45");
    assert_eq!(
        view["savings"],
        json!({ "saved": "400.55", "rate_pct": "13.4" })
    );
}

#[sqlx::test]
async fn a_new_entry_moves_todays_balance_and_tier(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let month = today.format("%Y-%m").to_string();
    let uri = format!("/api/months/{month}");

    let (_, before) = user.get(&uri).await;
    assert_eq!(
        (&before["balance_today"], &before["balance_today_tier"]),
        (&json!("0.00"), &json!("yellow"))
    );
    log(&user, &today.to_string(), "income", "2500", "Salário").await;
    let (_, after) = user.get(&uri).await;
    assert_eq!(
        (&after["balance_today"], &after["balance_today_tier"]),
        (&json!("2500.00"), &json!("green"))
    );
    log(&user, &today.to_string(), "daily", "600", "Mercado").await;
    let (_, after) = user.get(&uri).await;
    assert_eq!(
        (&after["balance_today"], &after["balance_today_tier"]),
        (&json!("1900.00"), &json!("light_green"))
    );
    let days = after["days"].as_array().unwrap();
    let todays: Vec<&Value> = days.iter().filter(|day| day["is_today"] == true).collect();
    assert_eq!(todays.len(), 1);
    assert_eq!(todays[0]["date"], today.to_string());
    assert_eq!(todays[0]["is_future"], false);
}

#[sqlx::test]
async fn a_month_before_the_opening_is_refused(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-11-20").await;

    let (status, problem) = user.get("/api/months/2026-10").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:month-before-opening");
    let (status, view) = user.get("/api/months/2026-11").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(balances(&view, 1), ["1000.00"]);
}

#[sqlx::test]
async fn only_the_callers_entries_count(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    open_at(&ana, "0", "2026-11-01").await;
    open_at(&bia, "10", "2026-11-01").await;
    log(&ana, "2026-11-02", "income", "500", "Salário").await;

    let (_, theirs) = bia.get("/api/months/2026-11").await;

    assert_eq!(balances(&theirs, 2), ["10.00", "10.00"]);
    assert_eq!(theirs["totals"]["income"], "0.00");
    assert_eq!(
        balances(&ana.get("/api/months/2026-11").await.1, 2),
        ["0.00", "500.00"]
    );
}

#[sqlx::test]
async fn a_bad_month_is_422_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    for month in ["2026-13", "2026-1", "november"] {
        let (status, problem) = user.get(&format!("/api/months/{month}")).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{month}");
        assert_eq!(problem["errors"][0]["field"], "month");
    }
    assert_eq!(
        TestApp::anonymous(pool).get("/api/months/2026-11").await.0,
        StatusCode::UNAUTHORIZED
    );
}

async fn add_bill(user: &TestApp, name: &str, amount: &str, due_day: i64, category: &str) -> Value {
    let category_id = user.category_id(category).await;
    let (status, bill) = user
        .post(
            "/api/bills",
            json!({ "name": name, "amount": amount, "due_day": due_day, "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{bill}");
    bill
}

fn last_balance(view: &Value) -> &Value {
    &view["days"].as_array().unwrap().last().unwrap()["balance"]
}

#[sqlx::test]
async fn rule_1_end_to_end_unpaid_then_paid_then_unpaid(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-11-01").await;
    let bill = add_bill(&user, "Aluguel", "2259.56", 5, "Aluguel").await;
    let pay = format!("/api/bills/{}/pay", bill["id"].as_str().unwrap());
    let overdue = soldi_server::today_sao_paulo() > "2026-11-05".parse().unwrap();

    let (status, unpaid) = user.get("/api/months/2026-11").await;
    assert_eq!(status, StatusCode::OK, "{unpaid}");
    assert_eq!(
        unpaid["bills_of_month"],
        json!([{
            "bill_id": bill["id"], "name": "Aluguel", "icon": "home", "color": "cat-6",
            "amount": "2259.56", "due_date": "2026-11-05", "paid": false,
            "transaction_id": null, "overdue": overdue
        }])
    );
    assert_eq!(last_balance(&unpaid), "1000.00");
    assert_eq!(unpaid["projected_balance"], "-1259.56");
    assert_eq!(unpaid["projected_tier"], "red");

    let (_, entry) = user
        .post(
            &format!("{pay}?month=2026-11"),
            json!({ "date": "2026-11-05" }),
        )
        .await;
    let (_, paid) = user.get("/api/months/2026-11").await;
    assert_eq!(paid["bills_of_month"][0]["paid"], true);
    assert_eq!(paid["bills_of_month"][0]["overdue"], false);
    assert_eq!(paid["bills_of_month"][0]["transaction_id"], entry["id"]);
    assert_eq!(last_balance(&paid), "-1259.56");
    assert_eq!(paid["projected_balance"], "-1259.56");
    assert_eq!(paid["totals"]["bills"], "2259.56");

    user.delete(&format!("{pay}?month=2026-11")).await;
    let (_, again) = user.get("/api/months/2026-11").await;
    assert_eq!(again, unpaid);
}

#[sqlx::test]
async fn rules_6_8_and_9_due_dates_clamp_and_past_months_stay_overdue(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "1000", "2026-09-01").await;
    add_bill(&user, "Cartão", "300", 31, "Cartão").await;
    add_bill(&user, "Luz", "100", 1, "Luz").await;

    let (_, october) = user.get("/api/months/2026-10").await;
    let (_, february) = user.get("/api/months/2027-02").await;
    let (_, current) = user
        .get(&format!(
            "/api/months/{}",
            soldi_server::today_sao_paulo().format("%Y-%m")
        ))
        .await;

    let rows = |view: &Value| -> Vec<(String, bool)> {
        view["bills_of_month"]
            .as_array()
            .unwrap()
            .iter()
            .map(|bill| {
                (
                    bill["due_date"].as_str().unwrap().into(),
                    bill["overdue"] == true,
                )
            })
            .collect()
    };
    assert_eq!(
        rows(&october),
        [("2026-10-01".into(), true), ("2026-10-31".into(), true)]
    );
    assert_eq!(october["projected_balance"], "600.00");
    assert_eq!(rows(&february)[1].0, "2027-02-28");
    assert!(!rows(&february)[1].1);
    let first_due = current["bills_of_month"][0]["due_date"].as_str().unwrap();
    assert_eq!(
        rows(&current)[0].1,
        soldi_server::today_sao_paulo().to_string().as_str() > first_due
    );
}

#[sqlx::test]
async fn rule_10_paused_and_archived_bills_leave_the_month_but_keep_their_entries(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    open_at(&user, "1000", "2026-11-01").await;
    let paused = add_bill(&user, "Internet", "100", 10, "Internet").await;
    let archived = add_bill(&user, "Luz", "50", 10, "Luz").await;
    add_bill(&bia, "Aluguel", "999", 1, "Aluguel").await;
    user.post(
        &format!("/api/bills/{}/pay", archived["id"].as_str().unwrap()),
        json!({ "date": "2026-11-10" }),
    )
    .await;
    user.patch(
        &format!("/api/bills/{}", paused["id"].as_str().unwrap()),
        json!({ "active": false }),
    )
    .await;
    user.delete(&format!("/api/bills/{}", archived["id"].as_str().unwrap()))
        .await;

    let (_, view) = user.get("/api/months/2026-11").await;

    assert_eq!(view["bills_of_month"], json!([]));
    assert_eq!(view["totals"]["bills"], "50.00");
    assert_eq!(view["projected_balance"], "950.00");
}
