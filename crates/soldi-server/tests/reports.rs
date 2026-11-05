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
    log(&ana, "2026-11-10", "daily", "300", "Comida fora").await;
    log(&ana, "2026-11-05", "bill", "2259.56", "Aluguel").await;
    log(&ana, "2026-11-05", "income", "5000", "Salário").await;
    log(&ana, "2026-12-01", "daily", "99", "Mercado").await;
    log(&bia, "2026-11-02", "daily", "50", "Mercado").await;
    let market = ana.category_id("Mercado").await;

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
    assert_eq!(names, ["Aluguel", "Mercado", "Comida fora"]);
    assert_eq!(
        outflow[1],
        json!({
            "category_id": market, "name": "Mercado", "icon": "shopping-cart", "color": "cat-1",
            "kind": "daily", "parent_id": null, "amount": "900.00", "pct": "26.0", "previous_amount": "760.00",
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
    let casa = ana.category_id("Casa").await;
    for name in ["Móveis", "Decoração"] {
        let (status, _) = ana
            .post(
                "/api/categories",
                json!({ "name": name, "kind": "daily", "parent_id": casa }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
    }
    log(&ana, "2026-11-02", "daily", "100", "Casa").await;
    log(&ana, "2026-11-03", "daily", "60", "Móveis").await;
    log(&ana, "2026-11-04", "daily", "40", "Decoração").await;
    log(&ana, "2026-11-05", "daily", "200", "Mercado").await;
    log(&ana, "2026-10-05", "daily", "50", "Móveis").await;
    let moveis = ana.category_id("Móveis").await;
    let decoracao = ana.category_id("Decoração").await;

    let (status, report) = ana.get("/api/reports/categories?month=2026-11").await;

    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["outflow"][2]["name"], "Móveis");
    assert_eq!(report["outflow"][2]["parent_id"], casa.as_str());
    assert_eq!(report["outflow"][2]["pct"], "15.0");
    assert_eq!(
        report["groups"][0],
        json!({
            "category_id": casa, "name": "Casa", "icon": "sofa", "color": "cat-12",
            "kind": "daily", "amount": "200.00", "pct": "50.0", "previous_amount": "50.00",
            "delta_pct": "300.0", "children": [moveis, decoracao]
        })
    );
    assert_eq!(report["groups"][1]["name"], "Mercado");
    assert_eq!(report["groups"][1]["children"], json!([]));
    assert_eq!(report["groups"].as_array().unwrap().len(), 2);
}
