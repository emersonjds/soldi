mod common;

use axum::http::StatusCode;
use chrono::{Datelike, Months, NaiveDate};
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    user: TestApp,
    today: String,
    reserva: String,
    viagem: String,
}

/// Opened at the first of this month, with `Reserva` (target 10000, deadline 2027-06-30) and
/// `Viagem` (target 100, no deadline) under `Economia`.
async fn setup(pool: PgPool) -> Setup {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    user.open_at("0", &today.format("%Y-%m-01").to_string())
        .await;
    let economia = user.category_id("Economia").await;
    let create = |name: &str, goal: Value| {
        let mut body = json!({ "name": name, "kind": "bill", "parent_id": economia });
        body.as_object_mut()
            .unwrap()
            .extend(goal.as_object().unwrap().clone());
        body
    };
    let (status, reserva) = user
        .post(
            "/api/categories",
            create(
                "Reserva",
                json!({ "target": "10000", "deadline": "2027-06-30" }),
            ),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{reserva}");
    let (_, viagem) = user
        .post(
            "/api/categories",
            create("Viagem", json!({ "target": "100" })),
        )
        .await;
    Setup {
        user,
        today: today.to_string(),
        reserva: reserva["id"].as_str().unwrap().into(),
        viagem: viagem["id"].as_str().unwrap().into(),
    }
}

async fn deposit(user: &TestApp, date: &str, category_id: &str, amount: &str) {
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "bill", "category_id": category_id }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

async fn withdraw(user: &TestApp, id: &str, body: Value) -> (StatusCode, Value) {
    user.post(&format!("/api/cofrinhos/{id}/withdraw"), body)
        .await
}

fn item<'a>(cofrinhos: &'a Value, name: &str) -> &'a Value {
    cofrinhos["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == name)
        .unwrap_or_else(|| panic!("no {name} in {cofrinhos}"))
}

#[sqlx::test]
async fn no_cofrinho_yet_lists_nothing(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let (status, cofrinhos) = user.get("/api/cofrinhos").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        cofrinhos,
        json!({ "total_saved": "0.00", "saved_this_month": "0.00", "items": [] })
    );
    assert_eq!(
        TestApp::anonymous(pool).get("/api/cofrinhos").await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn a_deposit_then_a_resgate_leave_the_balance_progress_and_month(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    deposit(&user, &today, &reserva, "500").await;

    let (status, resgate) = withdraw(
        &user,
        &reserva,
        json!({ "date": today, "amount": "200", "note": " carro " }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED, "{resgate}");
    assert_eq!(resgate["kind"], "income");
    assert_eq!(resgate["amount"], "200.00");
    assert_eq!(resgate["note"], "carro");
    assert_eq!(resgate["category"]["name"], "Resgate");
    assert_eq!(resgate["cofrinho_id"], reserva.as_str());
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(cofrinhos["total_saved"], "300.00");
    assert_eq!(cofrinhos["saved_this_month"], "300.00");
    let item = item(&cofrinhos, "Reserva");
    assert_eq!(
        (
            &item["category_id"],
            &item["balance"],
            &item["target"],
            &item["deadline"],
            &item["progress_pct"],
            &item["done"],
            &item["parent"],
            &item["icon"]
        ),
        (
            &json!(reserva),
            &json!("300.00"),
            &json!("10000.00"),
            &json!("2027-06-30"),
            &json!("3.0"),
            &json!(false),
            &json!(false),
            &json!("circle-dashed")
        )
    );
    assert!(item["monthly_suggestion"].is_string(), "{item}");
    let (_, month) = user.get(&format!("/api/months/{}", &today[..7])).await;
    assert_eq!(month["totals"]["saved"], "300.00");
    assert_eq!(month["totals"]["income"], "0.00");
    assert_eq!(month["totals"]["withdrawn"], "200.00");
    assert_eq!(month["totals"]["outflow"], "500.00");
    let (_, entries) = user
        .get(&format!("/api/transactions?month={}", &today[..7]))
        .await;
    assert_eq!(entries[0]["cofrinho_id"], reserva.as_str());
    assert_eq!(entries[1]["cofrinho_id"], Value::Null);
}

#[sqlx::test]
async fn a_resgate_is_not_income_on_the_month_nor_in_the_report(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    let salario = user.category_id("Salário").await;
    let (status, _) = user
        .post(
            "/api/transactions",
            json!({ "date": today, "amount": "1000", "kind": "income", "category_id": salario }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    deposit(&user, &today, &reserva, "4420").await;
    let (status, _) = withdraw(&user, &reserva, json!({ "date": today, "amount": "50" })).await;
    assert_eq!(status, StatusCode::CREATED);

    let (_, month) = user.get(&format!("/api/months/{}", &today[..7])).await;
    let (_, report) = user
        .get(&format!("/api/reports/categories?month={}", &today[..7]))
        .await;

    assert_eq!(month["totals"]["income"], "1000.00");
    assert_eq!(month["totals"]["withdrawn"], "50.00");
    assert_eq!(month["totals"]["saved"], "4370.00");
    assert_eq!(month["totals"]["performance"], "-3420.00");
    assert_eq!(month["savings"]["rate_pct"], "437.0");
    let day = month["days"]
        .as_array()
        .unwrap()
        .iter()
        .find(|day| day["date"] == today.as_str())
        .unwrap();
    assert_eq!(
        (&day["income"], &day["withdrawn"], &day["balance"]),
        (&json!("1000.00"), &json!("50.00"), &json!("-3370.00"))
    );
    assert_eq!(report["income_total"], month["totals"]["income"]);
    let income: Vec<&str> = report["income"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["name"].as_str().unwrap())
        .collect();
    assert_eq!(income, ["Salário"]);
    assert!(
        report["groups"]
            .as_array()
            .unwrap()
            .iter()
            .all(|group| group["name"] != "Resgate"),
        "{report}"
    );
}

#[sqlx::test]
async fn a_done_cofrinho_goes_last_and_economia_shows_as_sem_objetivo_with_money(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        viagem,
    } = setup(pool).await;
    let economia = user.category_id("Economia").await;
    deposit(&user, &today, &viagem, "150").await;
    deposit(&user, &today, &reserva, "1").await;

    let (_, before) = user.get("/api/cofrinhos").await;
    let names: Vec<&str> = before["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Reserva", "Viagem"]);
    let viagem = item(&before, "Viagem");
    assert_eq!(
        (
            &viagem["done"],
            &viagem["progress_pct"],
            &viagem["monthly_suggestion"],
            &viagem["deadline"]
        ),
        (&json!(true), &json!("100.0"), &Value::Null, &Value::Null)
    );

    deposit(&user, &today, &economia, "50").await;

    let (_, after) = user.get("/api/cofrinhos").await;
    let sem_objetivo = item(&after, "Sem objetivo");
    assert_eq!(
        (
            &sem_objetivo["category_id"],
            &sem_objetivo["balance"],
            &sem_objetivo["parent"],
            &sem_objetivo["target"],
            &sem_objetivo["progress_pct"],
            &sem_objetivo["icon"]
        ),
        (
            &json!(economia),
            &json!("50.00"),
            &json!(true),
            &Value::Null,
            &Value::Null,
            &json!("piggy-bank")
        )
    );
    assert_eq!(after["total_saved"], "201.00");
    assert_eq!(after["items"][2]["name"], "Viagem");
}

#[sqlx::test]
async fn a_resgate_is_refused_above_the_balance_before_the_opening_or_outside_a_cofrinho(
    pool: PgPool,
) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    deposit(&user, &today, &reserva, "100").await;
    let aluguel = user.category_id("Aluguel").await;
    let bia = user.another_user("bia@example.com").await;

    for (id, body, status, slug) in [
        (
            &reserva,
            json!({ "date": today, "amount": "100.01" }),
            422,
            "insufficient-cofrinho",
        ),
        (
            &reserva,
            json!({ "date": "2000-01-01", "amount": "1" }),
            422,
            "before-opening-date",
        ),
        (
            &aluguel,
            json!({ "date": today, "amount": "1" }),
            422,
            "not-a-cofrinho",
        ),
        (
            &reserva,
            json!({ "date": today, "amount": "0" }),
            422,
            "validation",
        ),
        (
            &reserva,
            json!({ "date": today, "amount": "1", "kind": "bill" }),
            422,
            "validation",
        ),
    ] {
        let (got, problem) = withdraw(&user, id, body.clone()).await;
        assert_eq!(got.as_u16(), status, "{body} {problem}");
        assert_eq!(problem["type"], format!("urn:soldi:error:{slug}"), "{body}");
    }
    let (status, _) = withdraw(&bia, &reserva, json!({ "date": today, "amount": "1" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = withdraw(&user, &reserva, json!({ "date": today, "amount": "100" })).await;
    assert_eq!(status, StatusCode::CREATED);
}

#[sqlx::test]
async fn movements_list_deposits_and_resgates_newest_first(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        viagem,
    } = setup(pool).await;
    let first = &format!("{}-01", &today[..7]);
    deposit(&user, first, &reserva, "500").await;
    deposit(&user, &today, &viagem, "7").await;
    withdraw(&user, &reserva, json!({ "date": today, "amount": "200" })).await;
    let uri = format!("/api/cofrinhos/{reserva}/movements");

    let (status, movements) = user.get(&uri).await;

    assert_eq!(status, StatusCode::OK, "{movements}");
    let amounts: Vec<(&str, &str)> = movements
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            (
                entry["kind"].as_str().unwrap(),
                entry["amount"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(amounts, [("income", "200.00"), ("bill", "500.00")]);
    let (_, one) = user.get(&format!("{uri}?limit=1")).await;
    assert_eq!(one.as_array().unwrap().len(), 1);
    for limit in ["0", "201"] {
        let (status, problem) = user.get(&format!("{uri}?limit={limit}")).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{limit}");
        assert_eq!(problem["errors"][0]["field"], "limit");
    }
    let bia = user.another_user("bia@example.com").await;
    assert_eq!(bia.get(&uri).await.0, StatusCode::NOT_FOUND);
    let aluguel = user.category_id("Aluguel").await;
    let (status, problem) = user
        .get(&format!("/api/cofrinhos/{aluguel}/movements"))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
}

#[sqlx::test]
async fn a_cofrinho_with_money_is_archived_only_once_empty(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        viagem,
    } = setup(pool).await;
    deposit(&user, &today, &reserva, "40").await;

    let (status, problem) = user.delete(&format!("/api/categories/{reserva}")).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:cofrinho-not-empty");
    withdraw(&user, &reserva, json!({ "date": today, "amount": "40" })).await;

    assert_eq!(
        user.delete(&format!("/api/categories/{reserva}")).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        user.delete(&format!("/api/categories/{viagem}")).await.0,
        StatusCode::NO_CONTENT
    );
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(cofrinhos["items"], json!([]));
}

fn first_of(today: &str) -> NaiveDate {
    format!("{}-01", &today[..7]).parse().unwrap()
}

/// Returns the series' first member.
async fn repeat(user: &TestApp, date: &str, category_id: &str, amount: &str) -> Value {
    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": date, "amount": amount, "kind": "bill", "category_id": category_id, "repeat_months": 3 }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created
}

#[sqlx::test]
async fn the_month_param_picks_its_savings_and_a_bad_one_is_422(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    let next = (first_of(&today) + Months::new(1)).to_string();
    deposit(&user, &today, &reserva, "300").await;
    deposit(&user, &next, &reserva, "50").await;

    let (_, default) = user.get("/api/cofrinhos").await;
    let (_, this) = user
        .get(&format!("/api/cofrinhos?month={}", &today[..7]))
        .await;
    let (_, later) = user
        .get(&format!("/api/cofrinhos?month={}", &next[..7]))
        .await;
    let (status, problem) = user.get("/api/cofrinhos?month=2026-13").await;

    assert_eq!(default["saved_this_month"], "300.00");
    assert_eq!(this["saved_this_month"], "300.00");
    assert_eq!(later["saved_this_month"], "50.00");
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "month");
}

#[sqlx::test]
async fn the_next_contribution_is_the_earliest_future_member_of_the_users_series(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        viagem,
    } = setup(pool).await;
    let first = first_of(&today);
    let economia = user.category_id("Economia").await;
    let (_, casa) = user
        .post(
            "/api/categories",
            json!({ "name": "Reforma", "kind": "bill", "parent_id": economia }),
        )
        .await;
    repeat(&user, &first.to_string(), &reserva, "100").await;
    let todays = repeat(&user, &today, &viagem, "40").await;
    let (status, edited) = user
        .patch(
            &format!(
                "/api/transactions/{}?scope=this",
                todays["id"].as_str().unwrap()
            ),
            json!({ "amount": "1" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    let next = (first + Months::new(1)).to_string();
    deposit(&user, &next, casa["id"].as_str().unwrap(), "5").await;
    let bia = user.another_user("bia@example.com").await;
    bia.open_at("0", &first.to_string()).await;
    let bia_economia = bia.category_id("Economia").await;
    let (_, bia_reforma) = bia
        .post(
            "/api/categories",
            json!({ "name": "Reforma", "kind": "bill", "parent_id": bia_economia }),
        )
        .await;
    repeat(
        &bia,
        &first.to_string(),
        bia_reforma["id"].as_str().unwrap(),
        "777",
    )
    .await;

    let (_, cofrinhos) = user.get("/api/cofrinhos").await;

    let in_a_month = today.parse::<NaiveDate>().unwrap() + Months::new(1);
    assert_eq!(
        item(&cofrinhos, "Reserva")["next_contribution"],
        json!({ "amount": "100.00", "day": 1 })
    );
    assert_eq!(
        item(&cofrinhos, "Viagem")["next_contribution"],
        json!({ "amount": "40.00", "day": in_a_month.day() })
    );
    assert_eq!(
        item(&cofrinhos, "Reforma")["next_contribution"],
        Value::Null
    );
}

#[sqlx::test]
async fn next_contributions_holds_only_the_users_cofrinho_series(pool: PgPool) {
    let Setup { user, reserva, .. } = setup(pool.clone()).await;
    let first = first_of(&soldi_server::today_sao_paulo().to_string());
    repeat(&user, &first.to_string(), &reserva, "100").await;
    let (status, gym) = user
        .post(
            "/api/categories",
            json!({ "name": "Academia", "kind": "bill" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{gym}");
    repeat(&user, &first.to_string(), gym["id"].as_str().unwrap(), "90").await;
    let bia = user.another_user("bia@example.com").await;
    bia.open_at("0", &first.to_string()).await;
    let bia_economia = bia.category_id("Economia").await;
    repeat(&bia, &first.to_string(), &bia_economia, "777").await;
    let ana: Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = 'ana@example.com'")
        .fetch_one(&pool)
        .await
        .unwrap();

    let mut conn = pool.acquire().await.unwrap();
    let next = soldi_server::cofrinhos::repo::next_contributions(
        &mut conn,
        ana,
        soldi_server::today_sao_paulo(),
    )
    .await
    .unwrap();

    assert_eq!(
        next.keys().map(Uuid::to_string).collect::<Vec<_>>(),
        vec![reserva]
    );
}

#[sqlx::test]
async fn economia_movements_include_its_childrens_with_their_category(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        viagem,
    } = setup(pool).await;
    let economia = user.category_id("Economia").await;
    deposit(&user, &today, &economia, "10").await;
    deposit(&user, &today, &reserva, "500").await;
    deposit(&user, &today, &viagem, "7").await;
    withdraw(&user, &reserva, json!({ "date": today, "amount": "200" })).await;

    let (status, parent) = user
        .get(&format!("/api/cofrinhos/{economia}/movements"))
        .await;
    let (_, child) = user
        .get(&format!("/api/cofrinhos/{reserva}/movements"))
        .await;

    assert_eq!(status, StatusCode::OK, "{parent}");
    let rows = |list: &Value| -> Vec<(String, String)> {
        list.as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                (
                    entry["category"]["name"].as_str().unwrap().into(),
                    entry["amount"].as_str().unwrap().into(),
                )
            })
            .collect()
    };
    let named = |pairs: &[(&str, &str)]| -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(name, amount)| (name.to_string(), amount.to_string()))
            .collect()
    };
    assert_eq!(
        rows(&parent),
        named(&[
            ("Resgate", "200.00"),
            ("Viagem", "7.00"),
            ("Reserva", "500.00"),
            ("Economia", "10.00")
        ])
    );
    assert_eq!(parent[1]["category"]["id"], viagem.as_str());
    assert_eq!(parent[0]["cofrinho_id"], reserva.as_str());
    assert_eq!(
        rows(&child),
        named(&[("Resgate", "200.00"), ("Reserva", "500.00")])
    );
}

/// Deposits `amount` into `cofrinho`, takes it all back, deletes the cofrinho; returns
/// (deposit id, resgate id).
async fn emptied_and_deleted(user: &TestApp, today: &str, cofrinho: &str) -> (String, String) {
    let (status, deposit) = user
        .post(
            "/api/transactions",
            json!({ "date": today, "amount": "3000", "kind": "bill", "category_id": cofrinho }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{deposit}");
    let (status, resgate) =
        withdraw(user, cofrinho, json!({ "date": today, "amount": "3000" })).await;
    assert_eq!(status, StatusCode::CREATED, "{resgate}");
    assert_eq!(
        user.delete(&format!("/api/categories/{cofrinho}")).await.0,
        StatusCode::NO_CONTENT
    );
    (
        deposit["id"].as_str().unwrap().into(),
        resgate["id"].as_str().unwrap().into(),
    )
}

fn assert_archived(status: StatusCode, problem: &Value) {
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["type"], "urn:soldi:error:archived-cofrinho");
}

#[sqlx::test]
async fn the_movements_of_a_deleted_cofrinho_are_read_only(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    let (deposit, resgate) = emptied_and_deleted(&user, &today, &reserva).await;

    for id in [&resgate, &deposit] {
        let uri = format!("/api/transactions/{id}");
        let (status, problem) = user.delete(&uri).await;
        assert_archived(status, &problem);
        let (status, problem) = user.patch(&uri, json!({ "amount": "1" })).await;
        assert_archived(status, &problem);
        let (status, problem) = user.patch(&uri, json!({ "note": "x" })).await;
        assert_archived(status, &problem);
    }
    let (_, movements) = user
        .get(&format!("/api/transactions?month={}", &today[..7]))
        .await;
    let amounts: Vec<&str> = movements
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["amount"].as_str().unwrap())
        .collect();
    assert_eq!(amounts, ["3000.00", "3000.00"]);
}

#[sqlx::test]
async fn the_movements_of_an_active_cofrinho_stay_editable(pool: PgPool) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    let (status, deposit) = user
        .post(
            "/api/transactions",
            json!({ "date": today, "amount": "300", "kind": "bill", "category_id": reserva }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{deposit}");
    let (_, resgate) = withdraw(&user, &reserva, json!({ "date": today, "amount": "100" })).await;

    for entry in [&resgate, &deposit] {
        let uri = format!("/api/transactions/{}", entry["id"].as_str().unwrap());
        let (status, body) = user.patch(&uri, json!({ "note": "ok" })).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(user.delete(&uri).await.0, StatusCode::NO_CONTENT);
    }
}

#[sqlx::test]
async fn following_on_a_series_with_a_deleted_cofrinho_member_writes_nothing(pool: PgPool) {
    let Setup {
        user,
        today,
        viagem,
        ..
    } = setup(pool).await;
    let first = first_of(&today);
    let (_, gym) = user
        .post(
            "/api/categories",
            json!({ "name": "Academia", "kind": "bill" }),
        )
        .await;
    let gym = gym["id"].as_str().unwrap();
    let head = repeat(&user, &first.to_string(), gym, "90").await;
    let series = head["series"]["id"].as_str().unwrap();
    let (_, entries) = user
        .get(&format!(
            "/api/transactions?month={}",
            (first + Months::new(2)).format("%Y-%m")
        ))
        .await;
    let third = entries
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["series"]["id"] == series)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (status, moved) = user
        .patch(
            &format!("/api/transactions/{third}"),
            json!({ "category_id": viagem }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    withdraw(&user, &viagem, json!({ "date": today, "amount": "90" })).await;
    assert_eq!(
        user.delete(&format!("/api/categories/{viagem}")).await.0,
        StatusCode::NO_CONTENT
    );
    let head = format!("/api/transactions/{}", head["id"].as_str().unwrap());

    let (status, problem) = user
        .patch(&format!("{head}?scope=following"), json!({ "note": "x" }))
        .await;
    assert_archived(status, &problem);
    let (status, problem) = user.delete(&format!("{head}?scope=following")).await;
    assert_archived(status, &problem);
    let (_, count) = user.get("/api/transactions/count?period=all").await;
    assert_eq!(count["count"], 4);

    let (status, body) = user.patch(&head, json!({ "note": "x" })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(user.delete(&head).await.0, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn another_users_deleted_cofrinho_is_out_of_reach_and_a_period_wipe_still_clears_it(
    pool: PgPool,
) {
    let Setup {
        user,
        today,
        reserva,
        ..
    } = setup(pool).await;
    let (deposit, resgate) = emptied_and_deleted(&user, &today, &reserva).await;
    let bia = user.another_user("bia@example.com").await;
    bia.open_at("0", &first_of(&today).to_string()).await;
    for id in [&deposit, &resgate] {
        let uri = format!("/api/transactions/{id}");
        assert_eq!(bia.delete(&uri).await.0, StatusCode::NOT_FOUND);
        assert_eq!(
            bia.patch(&uri, json!({ "note": "x" })).await.0,
            StatusCode::NOT_FOUND
        );
    }
    let bia_economia = bia.category_id("Economia").await;
    let (status, own) = bia
        .post(
            "/api/transactions",
            json!({ "date": today, "amount": "10", "kind": "bill", "category_id": bia_economia }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{own}");
    let own = format!("/api/transactions/{}", own["id"].as_str().unwrap());
    assert_eq!(
        bia.patch(&own, json!({ "note": "x" })).await.0,
        StatusCode::OK
    );
    assert_eq!(bia.delete(&own).await.0, StatusCode::NO_CONTENT);

    let (status, wiped) = user
        .delete(&format!("/api/transactions?period={}", &today[..7]))
        .await;
    assert_eq!(status, StatusCode::OK, "{wiped}");
    assert_eq!(wiped["deleted"], 2);
}
