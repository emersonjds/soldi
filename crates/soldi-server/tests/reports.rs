mod common;

use axum::http::StatusCode;
use chrono::Datelike;
use common::TestApp;
use serde_json::json;
use sqlx::PgPool;

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

#[sqlx::test]
async fn rule_1_the_month_by_category_against_the_previous_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("0", "2026-10-01").await;
    bia.open_at("0", "2026-10-01").await;
    log(&ana, "2026-10-31", "daily", "700", "Mercado").await;
    log(&ana, "2026-10-01", "daily", "60", "Mercado").await;
    log(&ana, "2026-11-01", "daily", "400", "Mercado").await;
    log(&ana, "2026-11-30", "daily", "500", "Mercado").await;
    log(&ana, "2026-11-10", "daily", "300", "Comer fora").await;
    log(&ana, "2026-11-05", "bill", "2259.56", "Aluguel").await;
    log(&ana, "2026-11-05", "income", "5000", "Salário").await;
    log(&ana, "2026-12-01", "daily", "99", "Mercado").await;
    log(&bia, "2026-11-02", "daily", "50", "Mercado").await;
    let market = ana.category_id("Mercado").await;
    let alimentacao = ana.category_id("Alimentação").await;

    let (status, report) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["month"], "2026-11");
    assert_eq!(report["outflow_total"], "3459.56");
    assert_eq!(report["income_total"], "5000.00");
    let outflow = report["outflow"].as_array().unwrap();
    let names: Vec<&str> = outflow
        .iter()
        .map(|row| row["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Aluguel", "Mercado", "Comer fora"]);
    assert_eq!(
        outflow[1],
        json!({
            "category_id": market, "name": "Mercado", "icon": "shopping-cart", "color": "cat-1",
            "kind": "daily", "parent_id": alimentacao, "amount": "900.00", "pct": "26.0", "previous_amount": "760.00",
            "delta_pct": "18.4"
        })
    );
    assert_eq!(outflow[2]["pct"], "8.7");
    assert_eq!(outflow[2]["previous_amount"], "0.00");
    assert_eq!(outflow[2]["delta_pct"], serde_json::Value::Null);
    assert_eq!(report["income"][0]["name"], "Salário");
    assert_eq!(report["income"][0]["pct"], "100.0");

    let (_, theirs) = bia.get("/api/reports/categories?month=2026-11").await;
    assert_eq!(theirs["outflow_total"], "50.00");
    assert_eq!(theirs["outflow"][0]["delta_pct"], serde_json::Value::Null);
}

#[sqlx::test]
async fn an_empty_month_has_empty_groups(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, report) = user.get("/api/reports/categories?month=2030-01").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        report,
        json!({ "month": "2030-01", "outflow_total": "0.00", "income_total": "0.00", "outflow": [], "income": [], "groups": [] })
    );
}

#[sqlx::test]
async fn a_bad_month_is_422_none_is_400_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let (status, problem) = user.get("/api/reports/categories?month=2026-13").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "month");
    assert_eq!(
        user.get("/api/reports/categories").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        TestApp::anonymous(pool)
            .get("/api/reports/categories?month=2026-11")
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn subcategories_add_up_in_their_parents_group(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-10-01").await;
    let gasto = ana.category_id("Gasto").await;
    for name in ["Móveis", "Decoração"] {
        let (status, _) = ana
            .post(
                "/api/categories",
                json!({ "name": name, "kind": "daily", "parent_id": gasto }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
    }
    log(&ana, "2026-11-02", "daily", "100", "Gasto").await;
    log(&ana, "2026-11-03", "daily", "60", "Móveis").await;
    log(&ana, "2026-11-04", "daily", "40", "Decoração").await;
    log(&ana, "2026-11-05", "daily", "200", "Mercado").await;
    log(&ana, "2026-10-05", "daily", "50", "Móveis").await;
    let moveis = ana.category_id("Móveis").await;
    let decoracao = ana.category_id("Decoração").await;
    let mercado = ana.category_id("Mercado").await;

    let (status, report) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["outflow"][2]["name"], "Móveis");
    assert_eq!(report["outflow"][2]["parent_id"], gasto.as_str());
    assert_eq!(report["outflow"][2]["pct"], "15.0");
    assert_eq!(
        report["groups"][1],
        json!({
            "category_id": gasto, "name": "Gasto", "icon": "wallet", "color": "cat-2",
            "kind": "daily", "amount": "200.00", "pct": "50.0", "previous_amount": "50.00",
            "delta_pct": "300.0", "children": [moveis, decoracao]
        })
    );
    assert_eq!(report["groups"][0]["name"], "Alimentação");
    assert_eq!(report["groups"][0]["children"], json!([mercado]));
    assert_eq!(report["groups"].as_array().unwrap().len(), 2);
}

#[sqlx::test]
async fn a_mixed_group_sums_both_outflow_kinds_and_reports_its_own_kind(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-10-01").await;
    let (_, moto) = ana
        .post(
            "/api/categories",
            json!({ "name": "Moto", "kind": "bill", "color": "cat-16" }),
        )
        .await;
    for (name, kind) in [("Prestação", "bill"), ("Gasolina", "daily")] {
        let (status, _) = ana
            .post(
                "/api/categories",
                json!({ "name": name, "kind": kind, "parent_id": moto["id"] }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
    }
    log(&ana, "2026-11-02", "daily", "300", "Gasolina").await;
    log(&ana, "2026-11-03", "bill", "100", "Prestação").await;
    let prestacao = ana.category_id("Prestação").await;
    let gasolina = ana.category_id("Gasolina").await;

    let (status, report) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["groups"].as_array().unwrap().len(), 1);
    assert_eq!(report["groups"][0]["name"], "Moto");
    assert_eq!(report["groups"][0]["kind"], "bill");
    assert_eq!(report["groups"][0]["amount"], "400.00");
    assert_eq!(
        report["groups"][0]["children"],
        json!([gasolina, prestacao])
    );
}

async fn savings(user: &TestApp, year: &str) -> (StatusCode, serde_json::Value) {
    user.get(&format!("/api/reports/savings?year={year}")).await
}

async fn withdraw(user: &TestApp, cofrinho: &str, date: &str, amount: &str) {
    let (status, resgate) = user
        .post(
            &format!("/api/cofrinhos/{cofrinho}/withdraw"),
            json!({ "date": date, "amount": amount }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{resgate}");
}

#[sqlx::test]
async fn the_savings_year_matches_each_month_view_and_only_the_callers_entries(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    ana.open_at("0", "2025-03-01").await;
    bia.open_at("0", "2025-01-01").await;
    let economia = ana.category_id("Economia").await;
    let (_, reserva) = ana
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia }),
        )
        .await;
    let reserva = reserva["id"].as_str().unwrap().to_string();
    log(&ana, "2025-03-10", "bill", "999", "Economia").await;
    log(&ana, "2025-03-10", "income", "999", "Salário").await;
    ana.open_at("0", "2025-03-15").await;
    log(&ana, "2025-03-20", "income", "5000", "Salário").await;
    log(&ana, "2025-03-20", "bill", "500", "Reserva").await;
    log(&ana, "2025-03-21", "bill", "100.55", "Economia").await;
    log(&ana, "2025-03-21", "bill", "1000", "Aluguel").await;
    log(&ana, "2025-03-22", "daily", "50", "Mercado").await;
    withdraw(&ana, &reserva, "2025-03-25", "200").await;
    log(&ana, "2025-06-10", "bill", "100", "Reserva").await;
    log(&ana, "2025-06-30", "income", "1000", "Salário").await;
    withdraw(&ana, &reserva, "2025-06-30", "300").await;
    log(&ana, "2025-12-31", "bill", "10", "Economia").await;
    log(&bia, "2025-03-20", "bill", "777", "Economia").await;
    log(&bia, "2025-03-20", "income", "1", "Salário").await;

    let (status, year) = savings(&ana, "2025").await;

    assert_eq!(status, StatusCode::OK, "{year}");
    let months = year["months"].as_array().unwrap();
    let names: Vec<&str> = months
        .iter()
        .map(|month| month["month"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        [
            "2025-12", "2025-11", "2025-10", "2025-09", "2025-08", "2025-07", "2025-06", "2025-05",
            "2025-04", "2025-03"
        ]
    );
    assert!(months.iter().all(|month| month["forecast"] == false));
    assert_eq!(
        months[9],
        json!({ "month": "2025-03", "income": "5000.00", "deposited": "600.55", "withdrawn": "200.00", "saved": "400.55", "rate_pct": "8.0", "forecast": false })
    );
    assert_eq!(
        months[6],
        json!({ "month": "2025-06", "income": "1000.00", "deposited": "100.00", "withdrawn": "300.00", "saved": "-200.00", "rate_pct": "-20.0", "forecast": false })
    );
    assert_eq!(
        months[0],
        json!({ "month": "2025-12", "income": "0.00", "deposited": "10.00", "withdrawn": "0.00", "saved": "10.00", "rate_pct": null, "forecast": false })
    );
    assert_eq!(
        months[7],
        json!({ "month": "2025-05", "income": "0.00", "deposited": "0.00", "withdrawn": "0.00", "saved": "0.00", "rate_pct": null, "forecast": false })
    );
    assert_eq!(
        (
            &year["year"],
            &year["income_total"],
            &year["saved_total"],
            &year["deposited_total"],
            &year["withdrawn_total"],
            &year["rate_pct"]
        ),
        (
            &json!(2025),
            &json!("6000.00"),
            &json!("210.55"),
            &json!("710.55"),
            &json!("500.00"),
            &json!("3.5")
        )
    );
    for row in months {
        let (_, view) = ana
            .get(&format!("/api/months/{}", row["month"].as_str().unwrap()))
            .await;
        assert_eq!(
            (
                &view["totals"]["income"],
                &view["savings"]["saved"],
                &view["savings"]["rate_pct"]
            ),
            (&row["income"], &row["saved"], &row["rate_pct"]),
            "{}",
            row["month"]
        );
    }

    let (_, theirs) = savings(&bia, "2025").await;
    assert_eq!(theirs["months"].as_array().unwrap().len(), 12);
    assert_eq!(theirs["saved_total"], "777.00");
    assert_eq!(theirs["deposited_total"], "777.00");
    assert_eq!(theirs["withdrawn_total"], "0.00");
    assert_eq!(theirs["income_total"], "1.00");
}

#[sqlx::test]
async fn the_current_year_runs_to_december_with_later_months_a_forecast_out_of_the_totals(
    pool: PgPool,
) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let year = today.format("%Y").to_string();
    let this_month = today.format("%Y-%m").to_string();
    let last = soldi_server::months::domain::month_end(today).to_string();
    let next = (soldi_server::months::domain::month_end(today) + chrono::Days::new(1)).to_string();
    ana.open_at("0", &format!("{year}-01-01")).await;
    bia.open_at("0", &format!("{year}-01-01")).await;
    log(&ana, &last, "income", "1000", "Salário").await;
    log(&ana, &last, "bill", "100", "Economia").await;
    log(&ana, &next, "bill", "500", "Economia").await;
    log(&ana, &next, "income", "500", "Salário").await;
    log(&bia, &next, "bill", "777", "Economia").await;

    let (status, body) = savings(&ana, &year).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let months = body["months"].as_array().unwrap();
    assert_eq!(months.len(), 12);
    assert_eq!(months[0]["month"], format!("{year}-12"));
    for row in months {
        let month = row["month"].as_str().unwrap();
        assert_eq!(
            row["forecast"],
            json!(month > this_month.as_str()),
            "{month}"
        );
    }
    let at = |month: &str| months.iter().find(|row| row["month"] == month);
    assert_eq!(
        at(&this_month).unwrap(),
        &json!({ "month": this_month, "income": "1000.00", "deposited": "100.00", "withdrawn": "0.00", "saved": "100.00", "rate_pct": "10.0", "forecast": false })
    );
    // In December next month belongs to next year, so this year must not list it.
    if next[..4] == this_month[..4] {
        assert_eq!(
            at(&next[..7]).unwrap(),
            &json!({ "month": &next[..7], "income": "500.00", "deposited": "500.00", "withdrawn": "0.00", "saved": "500.00", "rate_pct": "100.0", "forecast": true })
        );
    } else {
        assert!(at(&next[..7]).is_none());
    }
    assert_eq!(
        (
            &body["income_total"],
            &body["saved_total"],
            &body["rate_pct"]
        ),
        (&json!("1000.00"), &json!("100.00"), &json!("10.0"))
    );
}

#[sqlx::test]
async fn a_year_before_the_opening_or_after_today_is_empty(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2025-06-10").await;

    for year in ["2024", "2100"] {
        let (status, body) = savings(&ana, year).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            json!({ "year": year.parse::<i32>().unwrap(), "income_total": "0.00", "deposited_total": "0.00", "withdrawn_total": "0.00", "saved_total": "0.00", "rate_pct": null, "months": [] })
        );
    }
}

#[sqlx::test]
async fn a_bad_year_is_422_none_is_400_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    for bad in ["1999", "2101", "abc", "20.5"] {
        let (status, problem) = savings(&user, bad).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{bad}");
        assert_eq!(problem["errors"][0]["field"], "year");
    }
    assert_eq!(
        user.get("/api/reports/savings").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        savings(&TestApp::anonymous(pool), "2026").await.0,
        StatusCode::UNAUTHORIZED
    );
}

/// The budget is 2 queries and p95 ≤ 50 ms (spec §8.1); the bound here only catches a per-entry
/// or per-month loop in a debug build.
#[sqlx::test]
async fn ten_thousand_entries_in_a_year_come_back_in_twelve_rows(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id)
         SELECT u.id, DATE '2025-01-01' + (n % 365), 10, k.kind, c.id
         FROM users u CROSS JOIN generate_series(0, 9999) n
         CROSS JOIN LATERAL (SELECT (ARRAY['income', 'bill', 'daily'])[n % 3 + 1] AS kind,
                                    (ARRAY['Salário', 'Economia', 'Mercado'])[n % 3 + 1] AS name) k
         JOIN categories c ON c.user_id = u.id AND c.name = k.name
         WHERE u.email = 'ana@example.com'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let started = std::time::Instant::now();
    let (status, year) = savings(&ana, "2025").await;
    let elapsed = started.elapsed();

    assert_eq!(status, StatusCode::OK, "{year}");
    assert_eq!(year["months"].as_array().unwrap().len(), 12);
    assert_eq!(year["income_total"], "33340.00");
    assert_eq!(year["saved_total"], "33330.00");
    assert!(elapsed < std::time::Duration::from_secs(1), "{elapsed:?}");
}

#[sqlx::test]
async fn d28_para_onde_vai_counts_card_spends_in_their_categories_and_not_the_fatura(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-10-01").await;
    let bia = ana.another_user("bia@example.com").await;
    bia.open_at("0", "2026-10-01").await;
    let cards = ana.category_id("Cartão").await;
    let (_, porto) = ana
        .post(
            "/api/bills",
            json!({ "name": "Porto", "due_day": 10, "closing_day": 3, "category_id": cards }),
        )
        .await;
    let light = ana.category_id("Luz").await;
    let (_, luz) = ana
        .post(
            "/api/bills",
            json!({ "name": "Luz", "amount": "100", "due_day": 5, "category_id": light }),
        )
        .await;
    let mercado = ana.category_id("Mercado").await;
    for (date, amount) in [("2026-10-20", "30"), ("2026-11-02", "50")] {
        let (status, created) = ana
            .post(
                "/api/transactions",
                json!({ "date": date, "amount": amount, "kind": "daily",
                        "category_id": mercado, "card_id": porto["id"] }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{created}");
    }
    for (bill, body) in [
        (&porto, json!({ "date": "2026-11-10", "amount": "52" })),
        (&luz, json!({ "date": "2026-11-05" })),
    ] {
        let id = bill["id"].as_str().unwrap();
        let (status, paid) = ana
            .post(&format!("/api/bills/{id}/pay?month=2026-11"), body)
            .await;
        assert_eq!(status, StatusCode::CREATED, "{paid}");
    }
    log(&bia, "2026-11-03", "bill", "900", "Cartão").await;

    let (_, november) = ana.get("/api/reports/categories?month=2026-11").await;
    let (_, october) = ana.get("/api/reports/categories?month=2026-10").await;

    let rows = |report: &serde_json::Value| -> Vec<(String, String)> {
        report["outflow"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| {
                (
                    row["name"].as_str().unwrap().into(),
                    row["amount"].as_str().unwrap().into(),
                )
            })
            .collect()
    };
    assert_eq!(
        rows(&november),
        [
            ("Luz".into(), "100.00".into()),
            ("Mercado".into(), "50.00".into())
        ]
    );
    assert_eq!(november["outflow_total"], "150.00");
    assert_eq!(rows(&october), [("Mercado".into(), "30.00".into())]);
}

#[sqlx::test]
async fn d28_an_archived_cards_payment_stays_out_of_para_onde_vai(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2026-11-01").await;
    let cards = ana.category_id("Cartão").await;
    let (_, porto) = ana
        .post(
            "/api/bills",
            json!({ "name": "Porto", "due_day": 10, "closing_day": 3, "category_id": cards }),
        )
        .await;
    let id = porto["id"].as_str().unwrap();
    assert_eq!(
        ana.delete(&format!("/api/bills/{id}")).await.0,
        StatusCode::NO_CONTENT
    );
    let (status, paid) = ana
        .post(
            &format!("/api/bills/{id}/pay?month=2026-11"),
            json!({ "date": "2026-11-10", "amount": "52" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");

    let (_, november) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(november["outflow"], json!([]));
    assert_eq!(november["outflow_total"], "0.00");
}

async fn year_report(user: &TestApp, year: &str) -> (StatusCode, serde_json::Value) {
    user.get(&format!("/api/reports/year?year={year}")).await
}

async fn card(user: &TestApp, name: &str) -> String {
    let cards = user.category_id("Cartão").await;
    let (status, card) = user
        .post(
            "/api/bills",
            json!({ "name": name, "due_day": 10, "closing_day": 3, "category_id": cards }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{card}");
    card["id"].as_str().unwrap().to_string()
}

async fn spend(user: &TestApp, card: &str, date: &str, amount: &str) {
    let mercado = user.category_id("Mercado").await;
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "daily",
                    "category_id": mercado, "card_id": card }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

/// Ana's 2025 per SOL-103's plan: income, Saída, Diário, a deposit, a resgate, card spends and a
/// paid fatura. Bia logs the same dates.
async fn a_year_of_entries(user: &TestApp) {
    user.open_at("0", "2025-01-01").await;
    let economia = user.category_id("Economia").await;
    let (_, reserva) = user
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia }),
        )
        .await;
    let reserva = reserva["id"].as_str().unwrap().to_string();
    log(user, "2025-01-05", "income", "1000", "Salário").await;
    log(user, "2025-03-05", "income", "1000", "Salário").await;
    log(user, "2025-03-06", "income", "300", "Extra").await;
    log(user, "2025-01-10", "bill", "400", "Aluguel").await;
    log(user, "2025-03-10", "bill", "400", "Aluguel").await;
    log(user, "2025-01-12", "daily", "50", "Mercado").await;
    log(user, "2025-03-15", "bill", "200", "Reserva").await;
    withdraw(user, &reserva, "2025-03-20", "50").await;
    let porto = card(user, "Porto").await;
    spend(user, &porto, "2025-01-20", "30").await;
    spend(user, &porto, "2025-03-02", "120").await;
    let (status, paid) = user
        .post(
            &format!("/api/bills/{porto}/pay?month=2025-02"),
            json!({ "date": "2025-02-10", "amount": "30" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
}

fn amounts(rows: &serde_json::Value, field: &str) -> Vec<(String, String)> {
    rows.as_array()
        .unwrap()
        .iter()
        .map(|row| {
            (
                row[field].as_str().unwrap().into(),
                row["amount"]
                    .as_str()
                    .unwrap_or_else(|| row["spent"].as_str().unwrap())
                    .into(),
            )
        })
        .collect()
}

fn cents(rows: &serde_json::Value) -> i64 {
    rows.as_array()
        .unwrap()
        .iter()
        .map(|row| {
            row["amount"]
                .as_str()
                .unwrap()
                .replace('.', "")
                .parse::<i64>()
                .unwrap()
        })
        .sum()
}

fn pair(name: &str, amount: &str) -> (String, String) {
    (name.into(), amount.into())
}

#[sqlx::test]
async fn the_year_counts_gastos_by_purchase_date_without_deposits_or_faturas(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    a_year_of_entries(&ana).await;
    let casa = ana.category_id("Casa").await;
    let (_, colecoes) = ana
        .post(
            "/api/categories",
            json!({ "name": "Coleções", "kind": "daily", "color": "cat-14" }),
        )
        .await;
    let (_, bonus) = ana
        .post(
            "/api/categories",
            json!({ "name": "Bônus", "kind": "income", "color": "cat-15" }),
        )
        .await;
    for (name, parent) in [("Faxina", json!(casa)), ("Gibis", colecoes["id"].clone())] {
        let (status, created) = ana
            .post(
                "/api/categories",
                json!({ "name": name, "kind": "daily", "parent_id": parent }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{created}");
    }
    log(&ana, "2025-03-12", "daily", "100", "Faxina").await;
    log(&ana, "2025-01-15", "daily", "60", "Gibis").await;
    log(&ana, "2025-03-07", "income", "200", "Bônus").await;
    for archived in [&colecoes, &bonus] {
        let id = archived["id"].as_str().unwrap();
        assert_eq!(
            ana.delete(&format!("/api/categories/{id}")).await.0,
            StatusCode::NO_CONTENT
        );
    }
    bia.open_at("0", "2025-01-01").await;
    log(&bia, "2025-03-10", "bill", "777", "Aluguel").await;
    log(&bia, "2025-01-05", "income", "1", "Salário").await;
    log(&bia, "2025-02-10", "daily", "9", "Mercado").await;
    let porto = card(&bia, "Porto").await;
    spend(&bia, &porto, "2025-03-02", "3").await;

    let (status, report) = year_report(&ana, "2025").await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(
        (
            &report["year"],
            &report["first_month"],
            &report["last_month"]
        ),
        (&json!(2025), &json!("2025-01"), &json!("2025-12"))
    );
    assert_eq!(
        report["totals"],
        json!({ "income": "2500.00", "bills": "1000.00", "daily": "360.00", "outflow": "1360.00",
                "performance": "1140.00", "saved": "150.00", "withdrawn": "50.00" })
    );
    assert_eq!(report["spent"], "1160.00");
    assert_eq!(
        amounts(&report["top_months"], "month"),
        [pair("2025-03", "620.00"), pair("2025-01", "540.00")]
    );
    assert_eq!(
        amounts(&report["spending"], "name"),
        [
            pair("Casa", "900.00"),
            pair("Alimentação", "200.00"),
            pair("Coleções", "60.00")
        ]
    );
    let pcts: Vec<&str> = report["spending"]
        .as_array()
        .unwrap()
        .iter()
        .map(|group| group["pct"].as_str().unwrap())
        .collect();
    assert_eq!(pcts, ["77.6", "17.2", "5.2"]);
    assert_eq!(
        report["spending"][0]["category_id"],
        json!(ana.category_id("Casa").await)
    );
    assert_eq!(
        amounts(&report["income"], "name"),
        [
            pair("Salário", "2000.00"),
            pair("Extra", "300.00"),
            pair("Bônus", "200.00")
        ]
    );
    assert_eq!(cents(&report["spending"]), 116_000);
    assert_eq!(cents(&report["income"]), 250_000);
    assert_eq!(
        (&report["card_spent"], &report["card_pct"]),
        (&json!("150.00"), &json!("12.9"))
    );
    assert_eq!(amounts(&report["cards"], "name"), [pair("Porto", "150.00")]);

    let (_, theirs) = year_report(&bia, "2025").await;
    assert_eq!(theirs["spent"], "789.00");
    assert_eq!(theirs["totals"]["income"], "1.00");
    assert_eq!(amounts(&theirs["cards"], "name"), [pair("Porto", "3.00")]);
}

#[sqlx::test]
async fn a_past_year_matches_economia_do_ano(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    a_year_of_entries(&ana).await;

    let (_, report) = year_report(&ana, "2025").await;
    let (_, savings) = savings(&ana, "2025").await;

    assert_eq!(
        (
            &report["totals"]["income"],
            &report["totals"]["saved"],
            &report["totals"]["withdrawn"]
        ),
        (
            &savings["income_total"],
            &savings["saved_total"],
            &savings["withdrawn_total"]
        )
    );
}

#[sqlx::test]
async fn the_current_year_counts_up_to_the_end_of_todays_month(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let year = today.format("%Y").to_string();
    let last = soldi_server::months::domain::month_end(today);
    ana.open_at("0", &format!("{year}-01-01")).await;
    log(&ana, &last.to_string(), "daily", "100", "Mercado").await;
    if today.month() != 12 {
        log(
            &ana,
            &(last + chrono::Days::new(1)).to_string(),
            "daily",
            "500",
            "Mercado",
        )
        .await;
    }

    let (status, report) = year_report(&ana, &year).await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["spent"], "100.00");
    assert_eq!(report["first_month"], format!("{year}-01"));
    assert_eq!(report["last_month"], today.format("%Y-%m").to_string());
}

#[sqlx::test]
async fn a_year_report_before_the_opening_or_after_today_is_empty(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2025-06-10").await;

    for year in ["2024", "2100"] {
        let (status, body) = year_report(&ana, year).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            json!({ "year": year.parse::<i32>().unwrap(), "first_month": null, "last_month": null,
                    "totals": { "income": "0.00", "bills": "0.00", "daily": "0.00", "outflow": "0.00",
                                "performance": "0.00", "saved": "0.00", "withdrawn": "0.00" },
                    "spent": "0.00", "top_months": [], "spending": [], "income": [],
                    "card_spent": "0.00", "card_pct": null, "cards": [] })
        );
    }
}

#[sqlx::test]
async fn a_bad_year_report_is_422_none_is_400_and_no_session_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    for bad in ["1999", "abcd"] {
        let (status, problem) = year_report(&user, bad).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{bad}");
        assert_eq!(problem["errors"][0]["field"], "year");
    }
    assert_eq!(
        user.get("/api/reports/year").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        year_report(&TestApp::anonymous(pool), "2026").await.0,
        StatusCode::UNAUTHORIZED
    );
}

/// Two `GROUP BY` queries; the bound only catches a per-entry or per-month loop in a debug build.
#[sqlx::test]
async fn ten_thousand_entries_make_a_year_report_in_under_a_second(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id)
         SELECT u.id, DATE '2025-01-01' + (n % 365), 10, k.kind, c.id
         FROM users u CROSS JOIN generate_series(0, 9999) n
         CROSS JOIN LATERAL (SELECT (ARRAY['income', 'bill', 'daily'])[n % 3 + 1] AS kind,
                                    (ARRAY['Salário', 'Economia', 'Mercado'])[n % 3 + 1] AS name) k
         JOIN categories c ON c.user_id = u.id AND c.name = k.name
         WHERE u.email = 'ana@example.com'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let started = std::time::Instant::now();
    let (status, report) = year_report(&ana, "2025").await;
    let elapsed = started.elapsed();

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["top_months"].as_array().unwrap().len(), 3);
    assert_eq!(report["spent"], "33330.00");
    assert_eq!(report["totals"]["income"], "33340.00");
    assert_eq!(report["totals"]["saved"], "33330.00");
    assert!(elapsed < std::time::Duration::from_secs(1), "{elapsed:?}");
}

#[sqlx::test]
async fn an_archived_cards_spends_stay_in_the_year(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, &porto, "2025-05-20", "70").await;
    let (status, paid) = ana
        .post(
            &format!("/api/bills/{porto}/pay?month=2025-06"),
            json!({ "date": "2025-06-10", "amount": "70" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
    assert_eq!(
        ana.delete(&format!("/api/bills/{porto}")).await.0,
        StatusCode::NO_CONTENT
    );

    let (_, report) = year_report(&ana, "2025").await;

    assert_eq!(
        report["cards"],
        json!([{ "card_id": porto, "name": "Porto", "amount": "70.00" }])
    );
    assert_eq!(report["card_pct"], "100.0");
    assert_eq!(report["spent"], "70.00");
    assert_eq!(report["totals"]["bills"], "0.00");
    assert_eq!(
        amounts(&report["spending"], "name"),
        [pair("Alimentação", "70.00")]
    );
}

fn money_cents(value: &serde_json::Value) -> i64 {
    value.as_str().unwrap().replace('.', "").parse().unwrap()
}

#[sqlx::test]
async fn a_fatura_payment_edited_to_diario_or_entrada_never_counts(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.open_at("0", "2025-01-01").await;
    let porto = card(&ana, "Porto").await;
    spend(&ana, &porto, "2025-01-20", "30").await;
    let (status, paid) = ana
        .post(
            &format!("/api/bills/{porto}/pay?month=2025-02"),
            json!({ "date": "2025-02-10", "amount": "30" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{paid}");
    let uri = format!("/api/transactions/{}", paid["id"].as_str().unwrap());

    let id: uuid::Uuid = paid["id"].as_str().unwrap().parse().unwrap();
    // The API refuses these edits since SOL-113; the year must hold even if a row got there.
    let force = async |kind: &str, category: &str| {
        let category: uuid::Uuid = category.parse().unwrap();
        sqlx::query("UPDATE transactions SET kind = $1, category_id = $2 WHERE id = $3")
            .bind(kind)
            .bind(category)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
    };
    let mercado = ana.category_id("Mercado").await;
    let (status, refused) = ana
        .patch(&uri, json!({ "kind": "daily", "category_id": mercado }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
    force("daily", &mercado).await;
    let (_, report) = year_report(&ana, "2025").await;

    assert_eq!(report["spent"], "30.00");
    assert_eq!(
        amounts(&report["top_months"], "month"),
        [pair("2025-01", "30.00")]
    );
    assert_eq!(cents(&report["spending"]), money_cents(&report["spent"]));

    let salario = ana.category_id("Salário").await;
    force("income", &salario).await;
    let (_, report) = year_report(&ana, "2025").await;

    assert_eq!(report["spent"], "30.00");
    assert_eq!(
        cents(&report["income"]),
        money_cents(&report["totals"]["income"])
    );
}
