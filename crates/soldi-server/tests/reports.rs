mod common;

use axum::http::StatusCode;
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
    log(&ana, "2025-03-20", "bill", "300", "Reserva").await;
    log(&ana, "2025-03-21", "bill", "100.55", "Economia").await;
    log(&ana, "2025-03-21", "bill", "1000", "Aluguel").await;
    log(&ana, "2025-03-22", "daily", "50", "Mercado").await;
    withdraw(&ana, &reserva, "2025-03-25", "200").await;
    log(&ana, "2025-06-30", "income", "1000", "Salário").await;
    withdraw(&ana, &reserva, "2025-06-30", "100").await;
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
        json!({ "month": "2025-03", "income": "5000.00", "saved": "200.55", "rate_pct": "4.0", "forecast": false })
    );
    assert_eq!(
        months[6],
        json!({ "month": "2025-06", "income": "1000.00", "saved": "-100.00", "rate_pct": "-10.0", "forecast": false })
    );
    assert_eq!(
        months[0],
        json!({ "month": "2025-12", "income": "0.00", "saved": "10.00", "rate_pct": null, "forecast": false })
    );
    assert_eq!(
        months[7],
        json!({ "month": "2025-05", "income": "0.00", "saved": "0.00", "rate_pct": null, "forecast": false })
    );
    assert_eq!(
        (
            &year["year"],
            &year["income_total"],
            &year["saved_total"],
            &year["rate_pct"]
        ),
        (
            &json!(2025),
            &json!("6000.00"),
            &json!("110.55"),
            &json!("1.8")
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
        &json!({ "month": this_month, "income": "1000.00", "saved": "100.00", "rate_pct": "10.0", "forecast": false })
    );
    // In December next month belongs to next year, so this year must not list it.
    if next[..4] == this_month[..4] {
        assert_eq!(
            at(&next[..7]).unwrap(),
            &json!({ "month": &next[..7], "income": "500.00", "saved": "500.00", "rate_pct": "100.0", "forecast": true })
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
            json!({ "year": year.parse::<i32>().unwrap(), "income_total": "0.00", "saved_total": "0.00", "rate_pct": null, "months": [] })
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
