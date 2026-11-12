mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn find<'a>(categories: &'a Value, name: &str) -> &'a Value {
    categories
        .as_array()
        .unwrap()
        .iter()
        .find(|category| category["name"] == name)
        .unwrap()
}

#[sqlx::test]
async fn sign_up_seeds_the_default_categories(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, categories) = user.get("/api/categories").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(categories.as_array().unwrap().len(), 40);
    assert!(!names(&categories).contains(&"Resgate"));
    let (_, everything) = user.get("/api/categories?include_system=true").await;
    let list = everything.as_array().unwrap();
    let name_of = |id: &Value| {
        list.iter()
            .find(|category| &category["id"] == id)
            .map_or("", |parent| parent["name"].as_str().unwrap())
    };
    let mut tree: Vec<(&str, &str, &str, &str)> = list
        .iter()
        .map(|category| {
            (
                name_of(&category["parent_id"]),
                category["name"].as_str().unwrap(),
                category["kind"].as_str().unwrap(),
                category["color"].as_str().unwrap(),
            )
        })
        .collect();
    tree.sort_unstable();
    let mut expected = vec![
        ("", "Salário", "income", "cat-11"),
        ("", "Extra", "income", "cat-12"),
        ("", "Reembolso", "income", "cat-1"),
        ("", "Resgate", "income", "cat-2"),
        ("", "Alimentação", "daily", "cat-1"),
        ("", "Gasto", "daily", "cat-2"),
        ("", "Transporte", "daily", "cat-3"),
        ("", "Saúde", "bill", "cat-4"),
        ("", "Lazer", "daily", "cat-5"),
        ("", "Casa", "bill", "cat-6"),
        ("", "Educação", "bill", "cat-7"),
        ("", "Veículo", "bill", "cat-8"),
        ("", "Cartão", "bill", "cat-9"),
        ("", "Assinaturas", "bill", "cat-10"),
        ("", "Família", "daily", "cat-12"),
        ("", "Economia", "bill", "cat-13"),
        ("Alimentação", "Mercado", "daily", "cat-1"),
        ("Alimentação", "Comer fora", "daily", "cat-1"),
        ("Alimentação", "iFood", "daily", "cat-1"),
        ("Transporte", "Uber", "daily", "cat-3"),
        ("Transporte", "Combustível", "daily", "cat-3"),
        ("Saúde", "Plano de saúde", "bill", "cat-4"),
        ("Saúde", "Farmácia", "daily", "cat-4"),
        ("Saúde", "Consultas", "daily", "cat-4"),
        ("Lazer", "Viagem", "daily", "cat-5"),
        ("Casa", "Aluguel", "bill", "cat-6"),
        ("Casa", "Financiamento", "bill", "cat-6"),
        ("Casa", "Condomínio", "bill", "cat-6"),
        ("Casa", "Luz", "bill", "cat-6"),
        ("Casa", "Água", "bill", "cat-6"),
        ("Casa", "Internet", "bill", "cat-6"),
        ("Casa", "Gás", "bill", "cat-6"),
        ("Educação", "Escola", "bill", "cat-7"),
        ("Educação", "Cursos", "bill", "cat-7"),
        ("Educação", "Material", "daily", "cat-7"),
        ("Veículo", "Parcela", "bill", "cat-8"),
        ("Veículo", "Seguro", "bill", "cat-8"),
        ("Veículo", "IPVA", "bill", "cat-8"),
        ("Família", "Pets", "daily", "cat-12"),
        ("Família", "Presentes", "daily", "cat-12"),
        ("Família", "Mesada", "bill", "cat-12"),
    ];
    expected.sort_unstable();
    assert_eq!(tree, expected);
    let salary = find(&everything, "Salário");
    assert_eq!(
        (&salary["icon"], &salary["is_savings"]),
        (&json!("briefcase"), &json!(false))
    );
    let economia = find(&everything, "Economia");
    assert_eq!(
        (
            &economia["icon"],
            &economia["is_savings"],
            &economia["target"],
            &economia["deadline"]
        ),
        (
            &json!("piggy-bank"),
            &json!(true),
            &Value::Null,
            &Value::Null
        )
    );
    let resgate = find(&everything, "Resgate");
    assert_eq!(
        (&resgate["icon"], &resgate["is_savings"]),
        (&json!("piggy-bank"), &json!(true))
    );
    assert_eq!(find(&everything, "Combustível")["icon"], "fuel");
}

#[sqlx::test]
async fn the_savings_categories_are_never_archived_nor_nested(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, everything) = user.get("/api/categories?include_system=true").await;
    let economia = find(&everything, "Economia")["id"]
        .as_str()
        .unwrap()
        .to_string();
    let resgate = find(&everything, "Resgate")["id"]
        .as_str()
        .unwrap()
        .to_string();
    let aluguel = user.category_id("Aluguel").await;
    let extra = user.category_id("Extra").await;

    for id in [&economia, &resgate] {
        let (status, problem) = user.delete(&format!("/api/categories/{id}")).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:savings-category");
    }
    for (id, parent) in [(&economia, &aluguel), (&resgate, &extra)] {
        let (status, problem) = user
            .patch(
                &format!("/api/categories/{id}"),
                json!({ "parent_id": parent }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:savings-category");
    }
    let (status, problem) = create_child(&user, "Bônus", "income", &resgate).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:savings-category");
    let (status, renamed) = user
        .patch(
            &format!("/api/categories/{economia}"),
            json!({ "name": "Poupança" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{renamed}");
    assert_eq!(renamed["is_savings"], true);
}

#[sqlx::test]
async fn a_cofrinho_is_a_child_of_economia_with_a_target_and_a_deadline(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let economia = user.category_id("Economia").await;

    let (status, reserva) = user
        .post(
            "/api/categories",
            json!({ "name": "Reserva", "kind": "bill", "parent_id": economia,
                    "target": "10000", "deadline": "2027-06-30" }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{reserva}");
    assert_eq!(reserva["target"], "10000.00");
    assert_eq!(reserva["deadline"], "2027-06-30");
    assert_eq!(reserva["is_savings"], false);
    let uri = format!("/api/categories/{}", reserva["id"].as_str().unwrap());
    let (status, raised) = user.patch(&uri, json!({ "target": "12000.5" })).await;
    assert_eq!(status, StatusCode::OK, "{raised}");
    assert_eq!(
        (&raised["target"], &raised["deadline"]),
        (&json!("12000.50"), &json!("2027-06-30"))
    );
    let (_, cleared) = user
        .patch(&uri, json!({ "target": null, "deadline": null }))
        .await;
    assert_eq!(
        (&cleared["target"], &cleared["deadline"]),
        (&Value::Null, &Value::Null)
    );
    for target in ["0", "-1", "1.001"] {
        let (status, problem) = user.patch(&uri, json!({ "target": target })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{target}");
        assert_eq!(problem["errors"][0]["field"], "target", "{target}");
    }
}

#[sqlx::test]
async fn a_target_or_a_deadline_outside_economia_is_not_a_cofrinho(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let economia = user.category_id("Economia").await;
    let cartao = user.category_id("Cartão").await;

    for body in [
        json!({ "name": "Viagem", "kind": "bill", "target": "100" }),
        json!({ "name": "Viagem", "kind": "bill", "parent_id": cartao, "deadline": "2027-01-31" }),
    ] {
        let (status, problem) = user.post("/api/categories", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
    }
    for id in [&cartao, &economia] {
        let (status, problem) = user
            .patch(&format!("/api/categories/{id}"), json!({ "target": "100" }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
    }
    let (status, moved) = user
        .patch(
            &format!("/api/categories/{cartao}"),
            json!({ "parent_id": economia, "target": "100" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["target"], "100.00");
    let (_, out) = user
        .patch(
            &format!("/api/categories/{cartao}"),
            json!({ "parent_id": null }),
        )
        .await;
    assert_eq!(
        (&out["target"], &out["deadline"]),
        (&Value::Null, &Value::Null)
    );
}

#[sqlx::test]
async fn create_defaults_icon_and_takes_the_next_color(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, created) = user
        .post(
            "/api/categories",
            json!({ "name": " Freela ", "kind": "income" }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["name"], "Freela");
    assert_eq!(created["icon"], "circle-dashed");
    assert_eq!(created["color"], "cat-3");
    let (_, custom) = user
        .post(
            "/api/categories",
            json!({ "name": "Academia", "kind": "bill", "icon": "dumbbell", "color": "cat-20" }),
        )
        .await;
    assert_eq!(
        (&custom["icon"], &custom["color"]),
        (&json!("dumbbell"), &json!("cat-20"))
    );
    assert_eq!(
        user.get("/api/categories")
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        42
    );
}

#[sqlx::test]
async fn create_refuses_bad_fields_and_active_duplicates(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;

    for (body, field) in [
        (json!({ "name": "", "kind": "daily" }), "name"),
        (
            json!({ "name": "X", "kind": "daily", "icon": "Bad Icon" }),
            "icon",
        ),
        (
            json!({ "name": "X", "kind": "daily", "color": "#fff" }),
            "color",
        ),
        (json!({ "name": "X", "kind": "savings" }), "kind"),
    ] {
        let (status, problem) = user.post("/api/categories", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["errors"][0]["field"], field);
    }

    let (status, _) = user
        .post(
            "/api/categories",
            json!({ "name": "mercado", "kind": "daily" }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, _) = user
        .post(
            "/api/categories",
            json!({ "name": "Mercado", "kind": "bill" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
}

#[sqlx::test]
async fn patch_renames_and_recolors(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, categories) = user.get("/api/categories").await;
    let id = find(&categories, "Lazer")["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, updated) = user
        .patch(
            &format!("/api/categories/{id}"),
            json!({ "name": "Diversão", "icon": "party-popper", "color": "cat-16" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["name"], "Diversão");
    assert_eq!(updated["icon"], "party-popper");
    assert_eq!(updated["color"], "cat-16");
    assert_eq!(updated["kind"], "daily");
    let (_, unchanged) = user
        .patch(&format!("/api/categories/{id}"), json!({}))
        .await;
    assert_eq!(unchanged, updated);
    let (status, _) = user
        .patch(&format!("/api/categories/{id}"), json!({ "name": " " }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn delete_archives_the_category(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, categories) = user.get("/api/categories").await;
    let id = find(&categories, "Pets")["id"]
        .as_str()
        .unwrap()
        .to_string();
    let uri = format!("/api/categories/{id}");

    assert_eq!(user.delete(&uri).await.0, StatusCode::NO_CONTENT);

    let (_, after) = user.get("/api/categories").await;
    assert_eq!(after.as_array().unwrap().len(), 39);
    assert_eq!(user.delete(&uri).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        user.patch(&uri, json!({ "name": "Bichos" })).await.0,
        StatusCode::NOT_FOUND
    );
    let (status, _) = user
        .post(
            "/api/categories",
            json!({ "name": "Pets", "kind": "daily" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
}

#[sqlx::test]
async fn another_users_category_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let (_, categories) = ana.get("/api/categories").await;
    let id = find(&categories, "Mercado")["id"]
        .as_str()
        .unwrap()
        .to_string();
    let uri = format!("/api/categories/{id}");

    assert_eq!(
        bia.patch(&uri, json!({ "name": "Mine" })).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(bia.delete(&uri).await.0, StatusCode::NOT_FOUND);
    let (_, theirs) = bia.get("/api/categories").await;
    assert!(
        theirs
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["id"] != id.as_str())
    );
    assert_eq!(
        find(&ana.get("/api/categories").await.1, "Mercado")["id"],
        id.as_str()
    );
}

#[sqlx::test]
async fn a_bad_id_is_a_400_and_no_session_a_401(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    assert_eq!(
        user.delete("/api/categories/not-a-uuid").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        TestApp::anonymous(pool).get("/api/categories").await.0,
        StatusCode::UNAUTHORIZED
    );
}

fn names(categories: &Value) -> Vec<&str> {
    categories
        .as_array()
        .unwrap()
        .iter()
        .map(|category| category["name"].as_str().unwrap())
        .collect()
}

async fn create_child(
    user: &TestApp,
    name: &str,
    kind: &str,
    parent_id: &str,
) -> (StatusCode, Value) {
    user.post(
        "/api/categories",
        json!({ "name": name, "kind": kind, "parent_id": parent_id }),
    )
    .await
}

#[sqlx::test]
async fn a_subcategory_is_listed_under_its_parent(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let gasto = user.category_id("Gasto").await;

    let (status, moveis) = create_child(&user, "Móveis", "daily", &gasto).await;
    create_child(&user, "Decoração", "daily", &gasto).await;

    assert_eq!(status, StatusCode::CREATED, "{moveis}");
    assert_eq!(moveis["parent_id"], gasto.as_str());
    let (_, categories) = user.get("/api/categories").await;
    let list = names(&categories);
    let at = list.iter().position(|name| *name == "Gasto").unwrap();
    assert_eq!(
        list[at - 1..at + 4],
        ["Presentes", "Gasto", "Decoração", "Móveis", "Lazer"]
    );
    assert_eq!(find(&categories, "Gasto")["parent_id"], Value::Null);
    assert_eq!(find(&categories, "Decoração")["parent_id"], gasto.as_str());
}

#[sqlx::test]
async fn subcategories_are_one_level_deep_and_on_their_parents_side(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let (_, moveis) = create_child(&user, "Móveis", "daily", &casa).await;
    let moveis = moveis["id"].as_str().unwrap().to_string();

    let (status, problem) = create_child(&user, "Sofá", "daily", &moveis).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:nested-subcategory");
    let lazer = user.category_id("Lazer").await;
    let (status, problem) = user
        .patch(
            &format!("/api/categories/{casa}"),
            json!({ "parent_id": lazer }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:nested-subcategory");

    let salario = user.category_id("Salário").await;
    let economia = user.category_id("Economia").await;
    for (name, kind, parent) in [
        ("Bônus", "income", &casa),
        ("Feira", "daily", &salario),
        ("Gás", "bill", &salario),
        ("Lanche", "daily", &economia),
    ] {
        let (status, problem) = create_child(&user, name, kind, parent).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{name}");
        assert_eq!(problem["errors"][0]["field"], "parent_id", "{name}");
    }
    let (status, problem) = user
        .patch(
            &format!("/api/categories/{lazer}"),
            json!({ "parent_id": lazer }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "parent_id");
}

#[sqlx::test]
async fn patch_moves_a_category_under_a_parent_and_null_takes_it_out(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let pets = user.category_id("Pets").await;
    let uri = format!("/api/categories/{pets}");

    let (status, moved) = user.patch(&uri, json!({ "parent_id": casa })).await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["parent_id"], casa.as_str());
    let (_, renamed) = user.patch(&uri, json!({ "name": "Bichos" })).await;
    assert_eq!(renamed["parent_id"], casa.as_str());
    let (_, out) = user.patch(&uri, json!({ "parent_id": null })).await;
    assert_eq!(out["parent_id"], Value::Null);
    let missing = uuid::Uuid::new_v4();
    assert_eq!(
        user.patch(
            &format!("/api/categories/{missing}"),
            json!({ "parent_id": casa })
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn another_users_category_is_no_parent(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let anas_casa = ana.category_id("Casa").await;
    let lazer = bia.category_id("Lazer").await;

    assert_eq!(
        create_child(&bia, "Móveis", "daily", &anas_casa).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        bia.patch(
            &format!("/api/categories/{lazer}"),
            json!({ "parent_id": anas_casa })
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn archiving_a_parent_archives_its_subcategories(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let (_, moveis) = create_child(&user, "Móveis", "daily", &casa).await;
    let moveis = moveis["id"].as_str().unwrap().to_string();

    assert_eq!(
        user.delete(&format!("/api/categories/{casa}")).await.0,
        StatusCode::NO_CONTENT
    );

    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(categories.as_array().unwrap().len(), 32);
    assert!(!names(&categories).contains(&"Móveis"));
    assert_eq!(
        user.delete(&format!("/api/categories/{moveis}")).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        create_child(&user, "Móveis", "daily", &casa).await.0,
        StatusCode::NOT_FOUND
    );
}

async fn create(user: &TestApp, body: Value) -> (StatusCode, Value) {
    user.post("/api/categories", body).await
}

fn slug(problem: &Value) -> &str {
    problem["type"]
        .as_str()
        .unwrap()
        .trim_start_matches("urn:soldi:error:")
}

#[sqlx::test]
async fn a_top_level_color_is_unique_in_its_kind(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let lazer = format!("/api/categories/{}", user.category_id("Lazer").await);

    let (status, problem) = create(
        &user,
        json!({ "name": "Feira", "kind": "daily", "color": "cat-1" }),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    for kind in ["daily", "income"] {
        let (status, created) = create(
            &user,
            json!({ "name": "Feira", "kind": kind, "color": "cat-16" }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{created}");
    }
    let (_, next) = create(&user, json!({ "name": "Bar", "kind": "daily" })).await;
    assert_eq!(next["color"], "cat-6");
    let (status, same) = user
        .patch(&lazer, json!({ "name": "Diversão", "color": "cat-5" }))
        .await;
    assert_eq!((status, &same["color"]), (StatusCode::OK, &json!("cat-5")));
    let (status, problem) = user.patch(&lazer, json!({ "color": "cat-1" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    let gasto = user.category_id("Gasto").await;
    user.delete(&format!("/api/categories/{gasto}")).await;
    let (status, reused) = create(
        &user,
        json!({ "name": "Bichos", "kind": "daily", "color": "cat-2" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{reused}");
}

#[sqlx::test]
async fn a_kind_with_all_24_colors_taken_has_no_free_one(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    for n in [6, 8, 9, 10, 11].into_iter().chain(13..=24) {
        let (status, created) = create(
            &user,
            json!({ "name": format!("Nova {n}"), "kind": "daily" }),
        )
        .await;
        assert_eq!(created["color"], format!("cat-{n}"), "{status}");
    }

    let (status, problem) = create(&user, json!({ "name": "Mais", "kind": "daily" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "palette-full");
    let (_, problem) = create(
        &user,
        json!({ "name": "Mais", "kind": "daily", "color": "cat-3" }),
    )
    .await;
    assert_eq!(slug(&problem), "color-taken");
    let casa = user.category_id("Casa").await;
    assert_eq!(
        create_child(&user, "Móveis", "daily", &casa).await.0,
        StatusCode::CREATED
    );
    let (_, bill) = create(&user, json!({ "name": "Mais", "kind": "bill" })).await;
    assert_eq!(bill["color"], "cat-1");
}

#[sqlx::test]
async fn a_subcategory_wears_its_parents_color(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("0", "2026-10-01").await;
    let casa = user.category_id("Casa").await;
    let economia = user.category_id("Economia").await;

    let (_, moveis) = create(
        &user,
        json!({ "name": "Móveis", "kind": "daily", "parent_id": casa, "color": "cat-20" }),
    )
    .await;
    let (_, reserva) = create(
        &user,
        json!({ "name": "Reserva", "kind": "bill", "parent_id": economia, "color": "cat-1" }),
    )
    .await;
    let (_, sofa) = create_child(&user, "Sofá", "daily", &casa).await;

    assert_eq!(moveis["color"], "cat-6");
    assert_eq!(reserva["color"], "cat-13");
    let moveis = format!("/api/categories/{}", moveis["id"].as_str().unwrap());
    let (status, kept) = user.patch(&moveis, json!({ "color": "cat-20" })).await;
    assert_eq!((status, &kept["color"]), (StatusCode::OK, &json!("cat-6")));
    let (_, spent) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-05", "amount": "10", "kind": "daily", "category_id": sofa["id"] }),
        )
        .await;
    user.delete(&format!("/api/categories/{}", sofa["id"].as_str().unwrap()))
        .await;
    let (status, recolored) = user
        .patch(
            &format!("/api/categories/{casa}"),
            json!({ "color": "cat-20" }),
        )
        .await;
    assert_eq!(
        (status, &recolored["color"]),
        (StatusCode::OK, &json!("cat-20"))
    );
    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(find(&categories, "Móveis")["color"], "cat-20");
    let (_, november) = user.get("/api/transactions?month=2026-11").await;
    let entry = november
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["id"] == spent["id"])
        .unwrap();
    assert_eq!(entry["category"]["color"], "cat-20");
}

#[sqlx::test]
async fn moving_takes_the_parents_color_in_and_a_free_one_out(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let pets = format!("/api/categories/{}", user.category_id("Pets").await);

    let (status, inside) = user.patch(&pets, json!({ "parent_id": casa })).await;
    assert_eq!(
        (status, &inside["color"]),
        (StatusCode::OK, &json!("cat-6"))
    );
    let (status, problem) = user
        .patch(&pets, json!({ "parent_id": null, "color": "cat-1" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    let (status, out) = user.patch(&pets, json!({ "parent_id": null })).await;
    assert_eq!((status, &out["color"]), (StatusCode::OK, &json!("cat-6")));
    user.patch(&pets, json!({ "parent_id": casa })).await;
    let (_, chosen) = user
        .patch(&pets, json!({ "parent_id": null, "color": "cat-22" }))
        .await;
    assert_eq!(chosen["color"], "cat-22");
}

#[sqlx::test]
async fn a_child_created_while_its_parent_is_recolored_wears_the_new_color(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let mut recolor = pool.begin().await.unwrap();
    sqlx::query("UPDATE categories SET color = 'cat-20' WHERE id::text = $1")
        .bind(&casa)
        .execute(&mut *recolor)
        .await
        .unwrap();

    let ((status, child), ()) =
        tokio::join!(create_child(&user, "Móveis", "daily", &casa), async {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            recolor.commit().await.unwrap();
        });

    assert_eq!(
        (status, &child["color"]),
        (StatusCode::CREATED, &json!("cat-20"))
    );
}

#[sqlx::test]
async fn a_category_moved_under_a_parent_while_it_is_recolored_wears_the_new_color(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let pets = format!("/api/categories/{}", user.category_id("Pets").await);
    let mut recolor = pool.begin().await.unwrap();
    sqlx::query("UPDATE categories SET color = 'cat-20' WHERE id::text = $1")
        .bind(&casa)
        .execute(&mut *recolor)
        .await
        .unwrap();

    let ((status, moved), ()) =
        tokio::join!(user.patch(&pets, json!({ "parent_id": casa })), async {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            recolor.commit().await.unwrap();
        });

    assert_eq!(
        (status, &moved["color"]),
        (StatusCode::OK, &json!("cat-20"))
    );
}

#[sqlx::test]
async fn moving_out_into_a_full_kind_has_no_free_color(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let gasto = user.category_id("Gasto").await;
    let (_, moveis) = create_child(&user, "Móveis", "daily", &gasto).await;
    for n in 1..=17 {
        create(
            &user,
            json!({ "name": format!("Nova {n}"), "kind": "daily" }),
        )
        .await;
    }

    let moveis = format!("/api/categories/{}", moveis["id"].as_str().unwrap());
    let (status, problem) = user.patch(&moveis, json!({ "parent_id": null })).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "palette-full");
}

async fn change_kind(user: &TestApp, id: &str, kind: &str) -> (StatusCode, Value) {
    user.patch(&format!("/api/categories/{id}"), json!({ "kind": kind }))
        .await
}

async fn log(user: &TestApp, body: Value) {
    let (status, created) = user.post("/api/transactions", body).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
}

fn id_of(category: &Value) -> String {
    category["id"].as_str().unwrap().to_string()
}

#[sqlx::test]
async fn a_daily_subcategory_becomes_bill_alone_and_its_group_takes_a_color_free_in_both(
    pool: PgPool,
) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("1000", "2026-11-01").await;
    let (status, nubank) = create(
        &user,
        json!({ "name": "Nubank", "kind": "daily", "color": "cat-20" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{nubank}");
    let nubank = id_of(&nubank);
    let (status, clube) = create(
        &user,
        json!({ "name": "Clube", "kind": "bill", "color": "cat-20" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{clube}");
    let (_, porto) = create_child(&user, "Porto", "daily", &nubank).await;
    log(
        &user,
        json!({ "date": "2026-11-03", "amount": "100", "kind": "daily", "category_id": nubank }),
    )
    .await;
    log(
        &user,
        json!({ "date": "2026-11-03", "amount": "50", "kind": "daily", "category_id": id_of(&porto), "repeat_months": 3 }),
    )
    .await;
    let (_, before) = user.get("/api/months/2026-11").await;
    assert_eq!(before["totals"]["daily"], "150.00");

    let (status, moved) = change_kind(&user, &id_of(&porto), "bill").await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "bill");
    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(find(&categories, "Nubank")["kind"], "daily");
    assert_ne!(find(&categories, "Nubank")["color"], "cat-20");
    assert_eq!(moved["color"], find(&categories, "Nubank")["color"]);
    assert_eq!(find(&categories, "Clube")["color"], "cat-20");
    let (_, november) = user.get("/api/months/2026-11").await;
    assert_eq!(november["totals"]["daily"], "100.00");
    assert_eq!(november["totals"]["bills"], "50.00");
    let balances = |month: &Value| -> Vec<Value> {
        let days = month["days"].as_array().unwrap();
        days.iter().map(|day| day["balance"].clone()).collect()
    };
    assert_eq!(balances(&november), balances(&before));
    assert_eq!(november["projected_balance"], before["projected_balance"]);
    for month in ["2026-12", "2027-01"] {
        let (_, later) = user.get(&format!("/api/months/{month}")).await;
        assert_eq!(later["totals"]["daily"], "0.00", "{month}");
        assert_eq!(later["totals"]["bills"], "50.00", "{month}");
    }
}

#[sqlx::test]
async fn a_bill_group_becomes_daily_alone_keeping_a_color_free_in_both(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("1000", "2026-11-01").await;
    let moto = moto(&user, "cat-16").await;
    let (_, parcela) = create_child(&user, "Prestação", "bill", &moto).await;
    log(
        &user,
        json!({ "date": "2026-11-03", "amount": "300", "kind": "bill", "category_id": id_of(&parcela) }),
    )
    .await;
    log(
        &user,
        json!({ "date": "2026-11-04", "amount": "80", "kind": "bill", "category_id": moto }),
    )
    .await;

    let (status, moved) = change_kind(&user, &moto, "daily").await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "daily");
    assert_eq!(moved["color"], "cat-16");
    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(find(&categories, "Prestação")["kind"], "bill");
    assert_eq!(find(&categories, "Prestação")["color"], "cat-16");
    let (_, november) = user.get("/api/months/2026-11").await;
    assert_eq!(november["totals"]["bills"], "300.00");
    assert_eq!(november["totals"]["daily"], "80.00");
}

#[sqlx::test]
async fn a_top_level_with_no_free_color_in_the_new_kind_keeps_its_kind_and_entries(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("1000", "2026-11-01").await;
    let gasto = user.category_id("Gasto").await;
    log(
        &user,
        json!({ "date": "2026-11-03", "amount": "100", "kind": "daily", "category_id": gasto }),
    )
    .await;
    for n in 1..=24 {
        let (status, created) = create(
            &user,
            json!({ "name": format!("Conta {n}"), "kind": "bill" }),
        )
        .await;
        if status != StatusCode::CREATED {
            assert_eq!(slug(&created), "palette-full");
            break;
        }
    }

    let (status, problem) = change_kind(&user, &gasto, "bill").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(slug(&problem), "palette-full");
    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(find(&categories, "Gasto")["kind"], "daily");
    let (_, november) = user.get("/api/months/2026-11").await;
    assert_eq!(november["totals"]["daily"], "100.00");
    assert_eq!(november["totals"]["bills"], "0.00");
}

#[sqlx::test]
async fn a_top_level_alone_takes_the_lowest_color_free_in_its_new_kind_only(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, academia) = create(
        &user,
        json!({ "name": "Academia", "kind": "daily", "color": "cat-20" }),
    )
    .await;
    create(
        &user,
        json!({ "name": "Clube", "kind": "bill", "color": "cat-20" }),
    )
    .await;

    let (status, moved) = change_kind(&user, &id_of(&academia), "bill").await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["color"], "cat-1");
}

#[sqlx::test]
async fn an_archived_category_keeps_its_kind(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let pets = user.category_id("Pets").await;
    user.delete(&format!("/api/categories/{pets}")).await;

    let (status, _) = change_kind(&user, &pets, "bill").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_kind_and_a_color_change_together(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let gasto = format!("/api/categories/{}", user.category_id("Gasto").await);

    let (status, moved) = user
        .patch(&gasto, json!({ "kind": "bill", "color": "cat-22" }))
        .await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(
        (&moved["kind"], &moved["color"]),
        (&json!("bill"), &json!("cat-22"))
    );
}

#[sqlx::test]
async fn a_kind_change_runs_before_a_move_under_a_parent(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let economia = user.category_id("Economia").await;
    let pets = format!("/api/categories/{}", user.category_id("Pets").await);

    let (status, moved) = user
        .patch(&pets, json!({ "kind": "bill", "parent_id": economia }))
        .await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "bill");
    assert_eq!(moved["parent_id"], json!(economia));
    assert_eq!(moved["color"], color_of(&user, "Economia").await);
}

#[sqlx::test]
async fn an_entry_logged_while_its_category_changes_kind_sees_the_new_kind(pool: PgPool) {
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    user.open_at("1000", "2026-11-01").await;
    let lazer = user.category_id("Lazer").await;
    let mut change = pool.begin().await.unwrap();
    sqlx::query("UPDATE categories SET kind = 'bill', color = 'cat-24' WHERE id::text = $1")
        .bind(&lazer)
        .execute(&mut *change)
        .await
        .unwrap();

    let ((status, problem), ()) = tokio::join!(
        user.post(
            "/api/transactions",
            json!({ "date": "2026-11-03", "amount": "10", "kind": "daily", "category_id": lazer }),
        ),
        async {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            change.commit().await.unwrap();
        }
    );

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
}

#[sqlx::test]
async fn a_top_level_whose_color_is_taken_in_the_new_kind_takes_a_free_one(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, academia) = create(
        &user,
        json!({ "name": "Academia", "kind": "daily", "color": "cat-20" }),
    )
    .await;
    let academia = id_of(&academia);
    create_child(&user, "Natação", "daily", &academia).await;
    let (status, clube) = create(
        &user,
        json!({ "name": "Clube", "kind": "bill", "color": "cat-20" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{clube}");

    let (status, moved) = change_kind(&user, &academia, "bill").await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_ne!(moved["color"], "cat-20");
    let (_, categories) = user.get("/api/categories").await;
    assert_eq!(find(&categories, "Natação")["kind"], "daily");
    assert_eq!(find(&categories, "Natação")["color"], moved["color"]);
}

#[sqlx::test]
async fn only_a_conta_fixa_on_the_category_keeps_it_from_becoming_daily(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, fies) = create(&user, json!({ "name": "Fies", "kind": "bill" })).await;
    let fies = id_of(&fies);
    let (_, parcela) = create_child(&user, "Prestação", "bill", &fies).await;
    let parcela = id_of(&parcela);
    let (status, bill) = user
        .post(
            "/api/bills",
            json!({ "name": "Fies", "amount": "300", "due_day": 5, "category_id": parcela }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{bill}");

    let (status, moved) = change_kind(&user, &fies, "daily").await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    let (status, problem) = change_kind(&user, &parcela, "daily").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "category-has-bills");

    let bill = format!("/api/bills/{}", id_of(&bill));
    user.patch(&bill, json!({ "active": false })).await;
    let (status, problem) = change_kind(&user, &parcela, "daily").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "category-has-bills");
    let (status, moved) = change_kind(&user, &user.category_id("Luz").await, "daily").await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

#[sqlx::test]
async fn savings_and_income_keep_their_kind_and_a_subcategory_changes_its_own(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let economia = user.category_id("Economia").await;
    let (_, viagem) = create_child(&user, "Viagem", "bill", &economia).await;
    let (_, all) = user.get("/api/categories?include_system=true").await;
    let resgate = id_of(find(&all, "Resgate"));
    let alimentacao = user.category_id("Alimentação").await;
    let (_, feira) = create_child(&user, "Feira", "daily", &alimentacao).await;

    for (id, kind) in [
        (economia, "daily"),
        (id_of(&viagem), "daily"),
        (resgate, "bill"),
        (user.category_id("Salário").await, "bill"),
        (alimentacao.clone(), "income"),
    ] {
        let (status, problem) = change_kind(&user, &id, kind).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(slug(&problem), "kind-locked");
    }
    let (status, moved) = change_kind(&user, &id_of(&feira), "bill").await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["kind"], "bill");
    let before = find(&user.get("/api/categories").await.1, "Alimentação").clone();
    let (status, same) = change_kind(&user, &alimentacao, "daily").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(same, before);
}

#[sqlx::test]
async fn only_the_categorys_own_name_in_the_new_kind_is_a_conflict(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, aluguel) = create(&user, json!({ "name": "aluguel", "kind": "daily" })).await;
    let (_, moradia) = create(&user, json!({ "name": "Moradia", "kind": "daily" })).await;
    let moradia = id_of(&moradia);
    let (_, luz) = create_child(&user, "Luz", "daily", &moradia).await;

    for (id, name) in [(id_of(&aluguel), "aluguel"), (id_of(&luz), "Luz")] {
        let (status, problem) = change_kind(&user, &id, "bill").await;
        assert_eq!(status, StatusCode::CONFLICT, "{problem}");
        assert_eq!(slug(&problem), "duplicate-name");
        assert!(
            problem["detail"].as_str().unwrap().contains(name),
            "{problem}"
        );
    }
    let (status, moved) = change_kind(&user, &moradia, "bill").await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

#[sqlx::test]
async fn another_users_category_keeps_its_kind_and_entries(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.open_at("1000", "2026-11-01").await;
    let (_, moradia) = create(&ana, json!({ "name": "Moradia", "kind": "daily" })).await;
    let moradia = id_of(&moradia);
    log(
        &ana,
        json!({ "date": "2026-11-03", "amount": "100", "kind": "daily", "category_id": moradia }),
    )
    .await;
    let bia = ana.another_user("bia@example.com").await;

    let (status, _) = change_kind(&bia, &moradia, "bill").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, november) = ana.get("/api/months/2026-11").await;
    assert_eq!(november["totals"]["daily"], "100.00");
    assert_eq!(
        find(&ana.get("/api/categories").await.1, "Moradia")["kind"],
        "daily"
    );
}

async fn color_of(user: &TestApp, name: &str) -> Value {
    let (_, categories) = user.get("/api/categories").await;
    find(&categories, name)["color"].clone()
}

async fn moto(user: &TestApp, color: &str) -> String {
    let (status, created) = create(
        user,
        json!({ "name": "Moto", "kind": "bill", "color": color }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created["id"].as_str().unwrap().to_string()
}

#[sqlx::test]
async fn a_bill_group_takes_a_daily_child_and_moves_to_a_color_free_in_both_kinds(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    user.open_at("0", "2026-10-01").await;
    let moto = moto(&user, "cat-1").await;
    let (status, parcela) = create_child(&user, "Prestação", "bill", &moto).await;
    assert_eq!(
        (status, &parcela["color"]),
        (StatusCode::CREATED, &json!("cat-1"))
    );

    let (status, gasolina) = create_child(&user, "Gasolina", "daily", &moto).await;

    assert_eq!(status, StatusCode::CREATED, "{gasolina}");
    assert_eq!(gasolina["color"], "cat-11");
    assert_eq!(color_of(&user, "Moto").await, "cat-11");
    assert_eq!(color_of(&user, "Prestação").await, "cat-11");
    let (status, problem) = user
        .post(
            "/api/transactions",
            json!({ "date": "2026-11-02", "amount": "10", "kind": "bill",
                    "category_id": gasolina["id"] }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "category_id");
}

#[sqlx::test]
async fn a_mixed_group_keeps_its_color_when_no_token_is_free_in_both_kinds(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    for n in 1..=17 {
        create(
            &user,
            json!({ "name": format!("Nova {n}"), "kind": "daily" }),
        )
        .await;
    }
    let moto = moto(&user, "cat-14").await;

    let (status, gasolina) = create_child(&user, "Gasolina", "daily", &moto).await;

    assert_eq!(status, StatusCode::CREATED, "{gasolina}");
    assert_eq!(gasolina["color"], "cat-14");
    assert_eq!(color_of(&user, "Moto").await, "cat-14");
}

#[sqlx::test]
async fn a_mixed_groups_color_is_taken_in_every_kind_it_shows_in(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let moto = moto(&user, "cat-16").await;
    let (_, gasolina) = create_child(&user, "Gasolina", "daily", &moto).await;
    assert_eq!(gasolina["color"], "cat-16");

    let (status, problem) = create(
        &user,
        json!({ "name": "Feira", "kind": "daily", "color": "cat-16" }),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    let (status, problem) = user
        .patch(
            &format!("/api/categories/{moto}"),
            json!({ "color": "cat-1" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
}

#[sqlx::test]
async fn a_daily_category_moves_under_a_bill_group_which_takes_a_color_free_in_both(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let moto = moto(&user, "cat-1").await;
    create_child(&user, "Prestação", "bill", &moto).await;
    let combustivel = user.category_id("Combustível").await;

    let (status, moved) = user
        .patch(
            &format!("/api/categories/{combustivel}"),
            json!({ "parent_id": moto }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["parent_id"], moto.as_str());
    assert_eq!(moved["color"], "cat-11");
    assert_eq!(color_of(&user, "Moto").await, "cat-11");
    assert_eq!(color_of(&user, "Prestação").await, "cat-11");
}

#[sqlx::test]
async fn a_move_stays_on_its_side_and_only_a_bill_goes_under_economia(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let casa = user.category_id("Casa").await;
    let lazer = user.category_id("Lazer").await;
    let salario = user.category_id("Salário").await;
    let economia = user.category_id("Economia").await;

    for (id, parent) in [(&salario, &casa), (&lazer, &salario), (&lazer, &economia)] {
        let (status, problem) = user
            .patch(
                &format!("/api/categories/{id}"),
                json!({ "parent_id": parent }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "parent_id", "{problem}");
    }
}

#[sqlx::test]
async fn a_subcategory_moving_out_no_longer_shows_its_old_group_in_its_kind(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let moto = moto(&user, "cat-16").await;
    let (_, gasolina) = create_child(&user, "Gasolina", "daily", &moto).await;

    let (status, moved) = user
        .patch(
            &format!("/api/categories/{}", gasolina["id"].as_str().unwrap()),
            json!({ "parent_id": null, "color": "cat-16" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["color"], "cat-16");
    assert_eq!(color_of(&user, "Moto").await, "cat-16");
}

#[sqlx::test]
async fn an_archived_daily_subcategory_does_not_keep_its_bill_group_in_daily(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let moto = moto(&user, "cat-16").await;
    let (_, gasolina) = create_child(&user, "Gasolina", "daily", &moto).await;
    let uri = format!("/api/categories/{}", gasolina["id"].as_str().unwrap());
    assert_eq!(user.delete(&uri).await.0, StatusCode::NO_CONTENT);

    let (status, feira) = create(
        &user,
        json!({ "name": "Feira", "kind": "daily", "color": "cat-16" }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED, "{feira}");
    assert_eq!(feira["color"], "cat-16");
}

#[sqlx::test]
async fn p4_a_cofrinho_keeps_a_note_and_loses_it_outside_economia(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let economia = user.category_id("Economia").await;
    let mercado = user.category_id("Mercado").await;
    let note_of = |cofrinhos: &Value, name: &str| {
        cofrinhos["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["name"] == name)
            .unwrap()["note"]
            .clone()
    };

    let (status, carro) = user
        .post(
            "/api/categories",
            json!({ "name": "Troca de Carro", "kind": "bill", "parent_id": economia,
                    "note": "  Início após a Reserva.  " }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{carro}");
    let uri = format!("/api/categories/{}", carro["id"].as_str().unwrap());
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(
        note_of(&cofrinhos, "Troca de Carro"),
        "Início após a Reserva."
    );

    let (status, problem) = user.patch(&uri, json!({ "note": "a".repeat(141) })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "note");
    let (status, _) = user.patch(&uri, json!({ "note": "é".repeat(140) })).await;
    assert_eq!(status, StatusCode::OK);
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(note_of(&cofrinhos, "Troca de Carro"), "é".repeat(140));
    let (status, _) = user.patch(&uri, json!({ "note": null })).await;
    assert_eq!(status, StatusCode::OK);
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(note_of(&cofrinhos, "Troca de Carro"), Value::Null);

    for (uri, body) in [
        (format!("/api/categories/{mercado}"), json!({ "note": "x" })),
        (
            format!("/api/categories/{economia}"),
            json!({ "note": "x" }),
        ),
    ] {
        let (status, problem) = user.patch(&uri, body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
    }
    let (status, problem) = user
        .post(
            "/api/categories",
            json!({ "name": "Viagem", "kind": "bill", "note": "x" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");

    user.patch(&uri, json!({ "note": "Plano" })).await;
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(note_of(&cofrinhos, "Troca de Carro"), "Plano");
    let (status, _) = user.patch(&uri, json!({ "parent_id": null })).await;
    assert_eq!(status, StatusCode::OK);
    user.patch(&uri, json!({ "parent_id": economia })).await;
    let (_, cofrinhos) = user.get("/api/cofrinhos").await;
    assert_eq!(note_of(&cofrinhos, "Troca de Carro"), Value::Null);

    let (status, _) = bia.patch(&uri, json!({ "note": "dela" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

async fn pins(user: &TestApp) -> Value {
    let (status, body) = user.get("/api/categories/pins").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["category_ids"].clone()
}

#[sqlx::test]
async fn p9_pins_round_trip_in_order(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    assert_eq!(pins(&user).await, json!([]));
    let ids = [
        user.category_id("Saúde").await,
        user.category_id("Alimentação").await,
        user.category_id("Salário").await,
    ];

    let (status, body) = user
        .put("/api/categories/pins", json!({ "category_ids": ids }))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "category_ids": ids }));
    assert_eq!(pins(&user).await, json!(ids));

    let reordered = [ids[2].clone(), ids[0].clone()];
    user.put("/api/categories/pins", json!({ "category_ids": reordered }))
        .await;
    assert_eq!(pins(&user).await, json!(reordered));
    let (status, _) = user
        .put("/api/categories/pins", json!({ "category_ids": [] }))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(pins(&user).await, json!([]));
}

#[sqlx::test]
async fn p9_put_refuses_bad_lists(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let lazer = user.category_id("Lazer").await;
    let saude = user.category_id("Saúde").await;
    user.put("/api/categories/pins", json!({ "category_ids": [saude] }))
        .await;
    let (_, everything) = user.get("/api/categories?include_system=true").await;
    let resgate = find(&everything, "Resgate")["id"].clone();
    let (_, archived) = create(&user, json!({ "name": "Moto", "kind": "bill" })).await;
    user.delete(&format!(
        "/api/categories/{}",
        archived["id"].as_str().unwrap()
    ))
    .await;
    let many: Vec<String> = (0..25).map(|_| uuid::Uuid::new_v4().to_string()).collect();

    for (ids, message) in [
        (json!(many), "must have at most 24 ids"),
        (json!([lazer, lazer]), "must not repeat an id"),
        (
            json!([lazer, user.category_id("Mercado").await]),
            "must be your active top-level categories",
        ),
        (
            json!([lazer, archived["id"]]),
            "must be your active top-level categories",
        ),
        (
            json!([lazer, resgate]),
            "must be your active top-level categories",
        ),
        (
            json!([lazer, bia.category_id("Casa").await]),
            "must be your active top-level categories",
        ),
    ] {
        let (status, problem) = user
            .put("/api/categories/pins", json!({ "category_ids": ids }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{ids}");
        assert_eq!(problem["errors"][0]["field"], "category_ids");
        assert_eq!(problem["errors"][0]["message"], message);
    }
    assert_eq!(pins(&user).await, json!([saude]));
}

#[sqlx::test]
async fn p9_pins_are_per_user(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let ana_casa = ana.category_id("Casa").await;
    let bia_lazer = bia.category_id("Lazer").await;

    ana.put(
        "/api/categories/pins",
        json!({ "category_ids": [ana_casa] }),
    )
    .await;
    bia.put(
        "/api/categories/pins",
        json!({ "category_ids": [bia_lazer] }),
    )
    .await;
    bia.put("/api/categories/pins", json!({ "category_ids": [] }))
        .await;

    assert_eq!(pins(&ana).await, json!([ana_casa]));
    assert_eq!(pins(&bia).await, json!([]));
}

#[sqlx::test]
async fn p9_an_archived_pin_drops_out_and_a_new_order_still_saves(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, moto) = create(&user, json!({ "name": "Moto", "kind": "bill" })).await;
    let moto = id_of(&moto);
    let casa = user.category_id("Casa").await;
    let lazer = user.category_id("Lazer").await;
    user.put(
        "/api/categories/pins",
        json!({ "category_ids": [moto, casa] }),
    )
    .await;

    user.delete(&format!("/api/categories/{moto}")).await;
    assert_eq!(pins(&user).await, json!([casa]));

    let (status, body) = user
        .put(
            "/api/categories/pins",
            json!({ "category_ids": [lazer, casa] }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(pins(&user).await, json!([lazer, casa]));
}

#[sqlx::test]
async fn p9_pins_need_a_session(pool: PgPool) {
    let anonymous = TestApp::anonymous(pool);
    assert_eq!(
        anonymous.get("/api/categories/pins").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        anonymous
            .put("/api/categories/pins", json!({ "category_ids": [] }))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
