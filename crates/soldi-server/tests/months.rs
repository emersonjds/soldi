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
            "projected_balance": "1150.00", "projected_tier": "light_green",
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
async fn saving_before_a_moved_opening_is_not_the_months_saving(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "0", "2026-11-01").await;
    log(&user, "2026-11-05", "bill", "500", "Economia").await;
    open_at(&user, "0", "2026-11-15").await;

    let (_, view) = user.get("/api/months/2026-11").await;

    assert_eq!(view["totals"]["bills"], "0.00");
    assert_eq!(view["totals"]["saved"], "0.00");
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

    for month in ["2026-13", "2026-1", "november", "9999-12", "1999-12"] {
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

/// Every bill starts owing on `date`, as if registered or resumed then.
async fn owing_since(pool: &PgPool, date: &str) {
    sqlx::query("UPDATE recurring_bills SET active_since = $1::date")
        .bind(date)
        .execute(pool)
        .await
        .unwrap();
}

fn last_balance(view: &Value) -> &Value {
    &view["days"].as_array().unwrap().last().unwrap()["balance"]
}

#[sqlx::test]
async fn rule_1_end_to_end_unpaid_then_paid_then_unpaid(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    open_at(&user, "1000", "2026-11-01").await;
    let bill = add_bill(&user, "Aluguel", "2259.56", 5, "Aluguel").await;
    owing_since(&pool, "2026-11-01").await;
    let pay = format!("/api/bills/{}/pay", bill["id"].as_str().unwrap());
    let overdue = soldi_server::today_sao_paulo() > "2026-11-05".parse().unwrap();
    let today = soldi_server::today_sao_paulo();
    let lands_on = (today <= "2026-11-30".parse::<chrono::NaiveDate>().unwrap())
        .then(|| today.max("2026-11-05".parse().unwrap()).to_string());

    let (status, unpaid) = user.get("/api/months/2026-11").await;
    assert_eq!(status, StatusCode::OK, "{unpaid}");
    assert_eq!(
        unpaid["bills_of_month"],
        json!([{
            "bill_id": bill["id"], "name": "Aluguel", "icon": "key-round", "color": "cat-6",
            "amount": "2259.56", "due_date": "2026-11-05", "paid": false,
            "transaction_id": null, "overdue": overdue, "lands_on": lands_on,
            "is_card": false
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
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    open_at(&user, "1000", "2026-09-01").await;
    add_bill(&user, "Cartão", "300", 31, "Cartão").await;
    add_bill(&user, "Luz", "100", 1, "Luz").await;
    owing_since(&pool, "2026-09-01").await;

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

#[sqlx::test]
async fn forecast_an_unpaid_bill_dips_its_clamped_due_day_two_months_ahead(pool: PgPool) {
    use chrono::Datelike;
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    open_at(&user, "1000", &today.to_string()).await;
    add_bill(&user, "Aluguel", "1600", 31, "Aluguel").await;
    let month = today
        .with_day(1)
        .unwrap()
        .checked_add_months(chrono::Months::new(2))
        .unwrap();

    let (status, view) = user
        .get(&format!("/api/months/{}", month.format("%Y-%m")))
        .await;

    assert_eq!(status, StatusCode::OK, "{view}");
    let days = view["days"].as_array().unwrap();
    let (before, last) = (&days[days.len() - 2], days.last().unwrap());
    assert_eq!(
        (&before["projected_balance"], &before["projected_tier"]),
        (&json!("-2200.00"), &json!("red"))
    );
    assert_eq!(
        (
            &last["projected_balance"],
            &last["projected_tier"],
            &last["balance"]
        ),
        (&json!("-3800.00"), &json!("red"), &json!("1000.00"))
    );
    assert_eq!(view["bills_of_month"][0]["lands_on"], last["date"]);
    assert_eq!(view["projected_balance"], "-3800.00");
}

#[sqlx::test]
async fn sol55_last_months_unpaid_bill_lands_today_until_paid_in_its_own_month(pool: PgPool) {
    use chrono::{Datelike, Months};
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let this_month = today.with_day(1).unwrap();
    let last_month = this_month.checked_sub_months(Months::new(1)).unwrap();
    open_at(&user, "1000", &last_month.to_string()).await;
    open_at(&bia, "1000", &last_month.to_string()).await;
    let aluguel = add_bill(&user, "Aluguel", "1800", 1, "Aluguel").await;
    add_bill(&bia, "Aluguel", "999", 1, "Aluguel").await;
    owing_since(&pool, &last_month.to_string()).await;
    let path = format!("/api/months/{}", this_month.format("%Y-%m"));

    let (status, view) = user.get(&path).await;

    assert_eq!(status, StatusCode::OK, "{view}");
    let rows: Vec<(String, bool)> = view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .map(|bill| {
            (
                bill["due_date"].as_str().unwrap().into(),
                bill["overdue"] == true,
            )
        })
        .collect();
    assert_eq!(
        rows,
        [
            (last_month.to_string(), true),
            (this_month.to_string(), today > this_month)
        ]
    );
    assert_eq!(view["bills_of_month"][0]["bill_id"], aluguel["id"]);
    assert_eq!(view["bills_of_month"][0]["lands_on"], today.to_string());
    let index = usize::try_from(today.day() - 1).unwrap();
    assert_eq!(view["days"][index]["projected_balance"], "-2600.00");
    assert_eq!(view["projected_balance"], "-2600.00");

    let pay = format!(
        "/api/bills/{}/pay?month={}",
        aluguel["id"].as_str().unwrap(),
        last_month.format("%Y-%m")
    );
    let (status, entry) = user
        .post(&pay, json!({ "date": last_month.to_string() }))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{entry}");
    let (_, paid) = user.get(&path).await;
    assert_eq!(paid["bills_of_month"].as_array().unwrap().len(), 1);
    assert_eq!(paid["balance_today"], "-800.00");
    assert_eq!(paid["projected_balance"], "-2600.00");
}

#[sqlx::test]
async fn sol55_a_payment_before_a_moved_opening_still_pays_its_month(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    open_at(&user, "1000", "2026-10-01").await;
    let luz = add_bill(&user, "Luz", "100", 25, "Luz").await;
    owing_since(&pool, "2026-10-01").await;
    let (status, entry) = user
        .post(
            &format!("/api/bills/{}/pay", luz["id"].as_str().unwrap()),
            json!({ "date": "2026-10-10" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{entry}");
    open_at(&user, "1000", "2026-10-15").await;

    let (_, october) = user.get("/api/months/2026-10").await;
    let (_, current) = user
        .get(&format!(
            "/api/months/{}",
            soldi_server::today_sao_paulo().format("%Y-%m")
        ))
        .await;

    assert_eq!(october["bills_of_month"][0]["paid"], true);
    assert_eq!(october["bills_of_month"][0]["transaction_id"], entry["id"]);
    assert_eq!(last_balance(&october), "1000.00");
    assert!(
        current["bills_of_month"]
            .as_array()
            .unwrap()
            .iter()
            .all(|bill| bill["due_date"] != "2026-10-25"),
        "{current}"
    );
}

#[sqlx::test]
async fn sol51_the_forecast_walks_twelve_months_of_the_callers_bills(pool: PgPool) {
    use chrono::{Datelike, Months};
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let first = today.with_day(1).unwrap();
    open_at(&user, "1000", &first.to_string()).await;
    open_at(&bia, "1000", &first.to_string()).await;
    add_bill(&user, "Aluguel", "1600", 28, "Aluguel").await;
    add_bill(&bia, "Aluguel", "999", 1, "Aluguel").await;
    owing_since(&pool, &first.to_string()).await;

    let (status, forecast) = user.get("/api/forecast").await;

    assert_eq!(status, StatusCode::OK, "{forecast}");
    assert_eq!(forecast["today"], today.to_string());
    let days = forecast["days"].as_array().unwrap();
    let last = first
        .checked_add_months(Months::new(12))
        .unwrap()
        .pred_opt()
        .unwrap();
    assert_eq!(days[0]["date"], today.to_string());
    assert_eq!(days.last().unwrap()["date"], last.to_string());
    let next = first.checked_add_months(Months::new(1)).unwrap();
    let next_28 = next.with_day(28).unwrap().to_string();
    let day = days
        .iter()
        .find(|day| day["date"] == next_28.as_str())
        .unwrap();
    assert_eq!(
        (&day["projected_balance"], &day["projected_tier"]),
        (&json!("-2200.00"), &json!("red"))
    );
    for month in [first, next] {
        let (_, view) = user
            .get(&format!("/api/months/{}", month.format("%Y-%m")))
            .await;
        for day in view["days"].as_array().unwrap() {
            if day["date"].as_str().unwrap() >= today.to_string().as_str() {
                let ahead = days
                    .iter()
                    .find(|ahead| ahead["date"] == day["date"])
                    .unwrap();
                assert_eq!(
                    (&ahead["projected_balance"], &ahead["projected_tier"]),
                    (&day["projected_balance"], &day["projected_tier"]),
                    "{}",
                    day["date"]
                );
            }
        }
    }

    let (status, _) = TestApp::anonymous(pool).get("/api/forecast").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

async fn card(user: &TestApp, name: &str) -> String {
    let category_id = user.category_id("Cartão").await;
    let (status, card) = user
        .post(
            "/api/bills",
            json!({ "name": name, "due_day": 10, "closing_day": 3, "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{card}");
    card["id"].as_str().unwrap().into()
}

async fn spend(user: &TestApp, date: &str, amount: &str, card_id: &str) {
    let category_id = user.category_id("Mercado").await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "daily",
                    "category_id": category_id, "card_id": card_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

fn faturas(view: &Value) -> Vec<(String, String, String, bool, bool)> {
    view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .map(|bill| {
            (
                bill["name"].as_str().unwrap().into(),
                bill["amount"].as_str().unwrap().into(),
                bill["due_date"].as_str().unwrap().into(),
                bill["is_card"] == true,
                bill["paid"] == true,
            )
        })
        .collect()
}

fn row(name: &str, amount: &str, due: &str, paid: bool) -> (String, String, String, bool, bool) {
    (name.into(), amount.into(), due.into(), true, paid)
}

#[sqlx::test]
async fn d28_card_spends_move_the_balance_on_the_faturas_due_date_only(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    open_at(&bia, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    let nubank = card(&bia, "Nubank").await;
    spend(&ana, "2026-11-02", "50", &porto).await;
    spend(&ana, "2026-11-04", "30", &porto).await;
    spend(&bia, "2026-11-02", "70", &nubank).await;
    owing_since(&pool, "2026-12-01").await;

    let (status, november) = ana.get("/api/months/2026-11").await;
    let (_, december) = ana.get("/api/months/2026-12").await;
    let (_, theirs) = bia.get("/api/months/2026-11").await;

    assert_eq!(status, StatusCode::OK, "{november}");
    assert_eq!(
        faturas(&november),
        [row("Porto", "50.00", "2026-11-10", false)]
    );
    assert!(
        balances(&november, 30)
            .iter()
            .all(|balance| *balance == "1000.00")
    );
    assert_eq!(november["totals"]["daily"], "0.00");
    assert_eq!(november["projected_balance"], "950.00");
    assert_eq!(
        faturas(&december),
        [row("Porto", "30.00", "2026-12-10", false)]
    );
    assert_eq!(december["projected_balance"], "920.00");
    assert_eq!(
        faturas(&theirs),
        [row("Nubank", "70.00", "2026-11-10", false)]
    );
    assert_eq!(theirs["projected_balance"], "930.00");

    let (status, entry) = ana
        .post(
            &format!("/api/bills/{porto}/pay?month=2026-11"),
            json!({ "date": "2026-11-10", "amount": "52" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{entry}");
    let (_, paid) = ana.get("/api/months/2026-11").await;

    assert_eq!(faturas(&paid), [row("Porto", "52.00", "2026-11-10", true)]);
    assert_eq!(balances(&paid, 10)[8..], ["1000.00", "948.00"]);
    assert_eq!(paid["totals"]["bills"], "52.00");
    assert_eq!(paid["totals"]["daily"], "0.00");
    assert_eq!(paid["projected_balance"], "948.00");
}

#[sqlx::test]
async fn d28_an_archived_card_keeps_its_unpaid_fatura_in_the_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, "2026-11-02", "50", &porto).await;

    let (status, _) = ana.delete(&format!("/api/bills/{porto}")).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, november) = ana.get("/api/months/2026-11").await;

    assert_eq!(
        faturas(&november),
        [row("Porto", "50.00", "2026-11-10", false)]
    );
    assert_eq!(november["projected_balance"], "950.00");
}

async fn pay_card(user: &TestApp, card_id: &str, month: &str, date: &str, amount: &str) {
    let (status, paid) = user
        .post(
            &format!("/api/bills/{card_id}/pay?month={month}"),
            json!({ "date": date, "amount": amount }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
}

async fn view(user: &TestApp, month: &str) -> Value {
    let (status, view) = user.get(&format!("/api/months/{month}")).await;
    assert_eq!(status, StatusCode::OK, "{view}");
    view
}

#[sqlx::test]
async fn d28_spends_before_a_moved_opening_still_fill_the_fatura_due_after_it(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-10-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, "2026-10-28", "50", &porto).await;
    spend(&ana, "2026-11-02", "30", &porto).await;
    open_at(&ana, "1000", "2026-11-01").await;

    let november = view(&ana, "2026-11").await;

    assert_eq!(
        faturas(&november),
        [row("Porto", "80.00", "2026-11-10", false)]
    );
    assert!(
        balances(&november, 30)
            .iter()
            .all(|balance| *balance == "1000.00")
    );
    assert_eq!(november["projected_balance"], "920.00");
}

#[sqlx::test]
async fn d30a_an_underpaid_fatura_carries_its_rest_into_the_next_one(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-10-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, "2026-10-05", "50", &porto).await;
    spend(&ana, "2026-11-05", "40", &porto).await;
    pay_card(&ana, &porto, "2026-11", "2026-11-10", "30").await;

    let december = view(&ana, "2026-12").await;
    assert_eq!(
        faturas(&december),
        [row("Porto", "60.00", "2026-12-10", false)]
    );
    assert_eq!(december["projected_balance"], "910.00");

    pay_card(&ana, &porto, "2026-12", "2026-12-10", "60").await;
    let november = view(&ana, "2026-11").await;
    let december = view(&ana, "2026-12").await;
    let (_, october_report) = ana.get("/api/reports/categories?month=2026-10").await;
    let (_, november_report) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(
        faturas(&november),
        [row("Porto", "30.00", "2026-11-10", true)]
    );
    assert_eq!(
        faturas(&december),
        [row("Porto", "60.00", "2026-12-10", true)]
    );
    assert_eq!(last_balance(&december), "910.00");
    assert_eq!(december["projected_balance"], "910.00");
    assert_eq!(october_report["outflow"][0]["name"], "Mercado");
    assert_eq!(october_report["outflow_total"], "50.00");
    assert_eq!(november_report["outflow"][0]["name"], "Mercado");
    assert_eq!(november_report["outflow_total"], "40.00");
}

#[sqlx::test]
async fn d28_a_december_spend_after_closing_is_januarys_fatura(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, "2026-12-02", "20", &porto).await;
    spend(&ana, "2026-12-05", "40", &porto).await;

    let december = view(&ana, "2026-12").await;
    let january = view(&ana, "2027-01").await;

    assert_eq!(
        faturas(&december),
        [row("Porto", "20.00", "2026-12-10", false)]
    );
    assert_eq!(
        faturas(&january),
        [row("Porto", "40.00", "2027-01-10", false)]
    );
    assert_eq!(january["projected_balance"], "940.00");
}

#[sqlx::test]
async fn d28_a_card_parcela_lands_one_fatura_each_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    let mercado = ana.category_id("Mercado").await;
    let (status, created) = ana
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-05", "amount": "90", "kind": "daily", "installments": 3,
                    "category_id": mercado, "card_id": porto }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");

    let november = view(&ana, "2026-11").await;
    let december = view(&ana, "2026-12").await;
    let january = view(&ana, "2027-01").await;
    let february = view(&ana, "2027-02").await;

    assert_eq!(faturas(&november), []);
    assert_eq!(
        faturas(&december),
        [row("Porto", "30.00", "2026-12-10", false)]
    );
    assert_eq!(
        faturas(&january),
        [row("Porto", "30.00", "2027-01-10", false)]
    );
    assert_eq!(
        faturas(&february),
        [row("Porto", "30.00", "2027-02-10", false)]
    );
    assert_eq!(february["projected_balance"], "910.00");
}

#[sqlx::test]
async fn d28_a_fatura_paid_before_its_due_date_leaves_the_balance_once(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, "2026-11-02", "50", &porto).await;
    pay_card(&ana, &porto, "2026-11", "2026-11-05", "50").await;

    let november = view(&ana, "2026-11").await;
    let december = view(&ana, "2026-12").await;

    assert_eq!(
        faturas(&november),
        [row("Porto", "50.00", "2026-11-10", true)]
    );
    assert_eq!(balances(&november, 5)[3..], ["1000.00", "950.00"]);
    assert_eq!(november["projected_balance"], "950.00");
    assert_eq!(faturas(&december), []);
    assert_eq!(december["projected_balance"], "950.00");
}

#[sqlx::test]
async fn d28_the_forecast_drops_a_card_spend_on_its_fatura_due_date(pool: PgPool) {
    use chrono::Datelike;
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let first = today.with_day(1).unwrap();
    open_at(&ana, "1000", &first.to_string()).await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, &today.to_string(), "50", &porto).await;

    let (status, forecast) = ana.get("/api/forecast").await;

    assert_eq!(status, StatusCode::OK, "{forecast}");
    let days = forecast["days"].as_array().unwrap();
    assert_eq!(days[0]["projected_balance"], "1000.00");
    assert_eq!(days.last().unwrap()["projected_balance"], "950.00");
    let drop = days
        .iter()
        .position(|day| day["projected_balance"] == "950.00")
        .unwrap();
    let due = days[drop]["date"].as_str().unwrap();
    let month = view(&ana, &due[..7]).await;
    assert_eq!(faturas(&month), [row("Porto", "50.00", due, false)]);
    for day in month["days"].as_array().unwrap() {
        if let Some(ahead) = days.iter().find(|ahead| ahead["date"] == day["date"]) {
            assert_eq!(ahead["projected_balance"], day["projected_balance"]);
        }
    }
}

#[sqlx::test]
async fn d32_a_weekly_series_on_a_card_lands_each_member_in_its_own_fatura(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    open_at(&ana, "1000", "2026-11-01").await;
    let porto = card(&ana, "Porto").await;
    let category_id = ana.category_id("Mercado").await;
    let (status, created) = ana
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-02", "amount": "50", "kind": "daily",
                    "category_id": category_id, "card_id": porto,
                    "repeat_months": 4, "repeat_every": "week" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    owing_since(&pool, "2026-12-01").await;

    let (_, november) = ana.get("/api/months/2026-11").await;
    let (_, december) = ana.get("/api/months/2026-12").await;

    assert_eq!(
        faturas(&november),
        [row("Porto", "50.00", "2026-11-10", false)]
    );
    assert_eq!(
        faturas(&december),
        [row("Porto", "150.00", "2026-12-10", false)]
    );
}

async fn notes(user: &TestApp, year: &str) -> Vec<(String, Value)> {
    let (status, year) = user.get(&format!("/api/reports/savings?year={year}")).await;
    assert_eq!(status, StatusCode::OK, "{year}");
    year["months"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|month| !month["note"].is_null())
        .map(|month| {
            (
                month["month"].as_str().unwrap().to_string(),
                month["note"].clone(),
            )
        })
        .collect()
}

#[sqlx::test]
async fn p6_a_month_note_is_stored_replaced_and_deleted_by_a_blank(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    open_at(&user, "0", "2026-01-01").await;

    let (status, _) = user
        .put(
            "/api/months/2026-06/note",
            json!({ "note": "  1ª parcela do 13º  " }),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        notes(&user, "2026").await,
        [("2026-06".to_string(), json!("1ª parcela do 13º"))]
    );

    let (status, _) = user
        .put(
            "/api/months/2026-06/note",
            json!({ "note": "é".repeat(140) }),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        notes(&user, "2026").await,
        [("2026-06".to_string(), json!("é".repeat(140)))]
    );

    let (status, _) = user
        .put("/api/months/2026-06/note", json!({ "note": "   " }))
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(notes(&user, "2026").await.is_empty());
    let (status, _) = user
        .put("/api/months/2026-06/note", json!({ "note": "" }))
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn p6_a_bad_month_or_a_long_note_is_422(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    for (uri, body, field) in [
        ("/api/months/2026-13/note", json!({ "note": "x" }), "month"),
        ("/api/months/1999-12/note", json!({ "note": "x" }), "month"),
        (
            "/api/months/2026-06/note",
            json!({ "note": "a".repeat(141) }),
            "note",
        ),
        (
            "/api/months/2026-06/note",
            json!({ "note": "a\u{0}b" }),
            "note",
        ),
    ] {
        let (status, problem) = user.put(uri, body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{uri} {problem}");
        assert_eq!(problem["errors"][0]["field"], field, "{uri}");
    }
    let (status, _) = user
        .put(
            "/api/months/2026-06/note",
            json!({ "note": "x", "color": "red" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn p6_notes_are_per_user(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    open_at(&ana, "0", "2026-01-01").await;
    open_at(&bia, "0", "2026-01-01").await;

    ana.put("/api/months/2026-06/note", json!({ "note": "da Ana" }))
        .await;
    bia.put("/api/months/2026-06/note", json!({ "note": "da Bia" }))
        .await;
    bia.put("/api/months/2026-07/note", json!({ "note": "só Bia" }))
        .await;
    bia.put("/api/months/2026-06/note", json!({ "note": " " }))
        .await;

    assert_eq!(
        notes(&ana, "2026").await,
        [("2026-06".to_string(), json!("da Ana"))]
    );
    assert_eq!(
        notes(&bia, "2026").await,
        [("2026-07".to_string(), json!("só Bia"))]
    );
}

#[sqlx::test]
async fn p6_a_month_note_needs_a_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    assert_eq!(
        app.put("/api/months/2026-06/note", json!({ "note": "x" }))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
