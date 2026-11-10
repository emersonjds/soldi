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
    let list = categories.as_array().unwrap();
    assert_eq!(list.len(), 31);
    let kinds: Vec<&str> = list.iter().map(|c| c["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds.iter().filter(|kind| **kind == "income").count(), 3);
    assert_eq!(kinds.iter().filter(|kind| **kind == "bill").count(), 13);
    assert_eq!(kinds.iter().filter(|kind| **kind == "daily").count(), 15);
    assert_eq!(kinds[0], "income");
    assert_eq!(kinds[30], "daily");
    let salary = find(&categories, "Salário");
    assert_eq!(salary["icon"], "briefcase");
    assert_eq!(salary["color"], "cat-11");
    assert_eq!(salary["is_savings"], false);
    let economia = find(&categories, "Economia");
    assert_eq!(
        (
            &economia["kind"],
            &economia["icon"],
            &economia["color"],
            &economia["is_savings"],
            &economia["target"],
            &economia["deadline"]
        ),
        (
            &json!("bill"),
            &json!("piggy-bank"),
            &json!("cat-13"),
            &json!(true),
            &Value::Null,
            &Value::Null
        )
    );
    assert!(!names(&categories).contains(&"Resgate"));
    let (_, everything) = user.get("/api/categories?include_system=true").await;
    assert_eq!(everything.as_array().unwrap().len(), 32);
    for kind in ["income", "bill", "daily"] {
        let mut colors: Vec<&str> = everything
            .as_array()
            .unwrap()
            .iter()
            .filter(|category| category["kind"] == kind)
            .map(|category| category["color"].as_str().unwrap())
            .collect();
        let count = colors.len();
        colors.sort_unstable();
        colors.dedup();
        assert_eq!(colors.len(), count, "{kind}");
    }
    let resgate = find(&everything, "Resgate");
    assert_eq!(
        (&resgate["kind"], &resgate["icon"], &resgate["is_savings"]),
        (&json!("income"), &json!("piggy-bank"), &json!(true))
    );
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
    let aluguel = user.category_id("Aluguel").await;

    for body in [
        json!({ "name": "Viagem", "kind": "bill", "target": "100" }),
        json!({ "name": "Viagem", "kind": "bill", "parent_id": aluguel, "deadline": "2027-01-31" }),
    ] {
        let (status, problem) = user.post("/api/categories", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
    }
    for id in [&aluguel, &economia] {
        let (status, problem) = user
            .patch(&format!("/api/categories/{id}"), json!({ "target": "100" }))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(problem["type"], "urn:soldi:error:not-a-cofrinho");
    }
    let (status, moved) = user
        .patch(
            &format!("/api/categories/{aluguel}"),
            json!({ "parent_id": economia, "target": "100" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(moved["target"], "100.00");
    let (_, out) = user
        .patch(
            &format!("/api/categories/{aluguel}"),
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
        33
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
    assert_eq!(after.as_array().unwrap().len(), 30);
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
    let casa = user.category_id("Casa").await;

    let (status, moveis) = create_child(&user, "Móveis", "daily", &casa).await;
    create_child(&user, "Decoração", "daily", &casa).await;

    assert_eq!(status, StatusCode::CREATED, "{moveis}");
    assert_eq!(moveis["parent_id"], casa.as_str());
    let (_, categories) = user.get("/api/categories").await;
    let list = names(&categories);
    let at = list.iter().position(|name| *name == "Casa").unwrap();
    assert_eq!(
        list[at - 1..at + 4],
        ["Beleza", "Casa", "Decoração", "Móveis", "Combustível"]
    );
    assert_eq!(find(&categories, "Casa")["parent_id"], Value::Null);
    assert_eq!(find(&categories, "Decoração")["parent_id"], casa.as_str());
}

#[sqlx::test]
async fn subcategories_are_one_level_deep_and_of_the_parents_kind(pool: PgPool) {
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

    let (status, problem) = create_child(&user, "Gás", "bill", &casa).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "parent_id");
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
    assert_eq!(categories.as_array().unwrap().len(), 30);
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
    assert_eq!(next["color"], "cat-17");
    let (status, same) = user
        .patch(&lazer, json!({ "name": "Diversão", "color": "cat-5" }))
        .await;
    assert_eq!((status, &same["color"]), (StatusCode::OK, &json!("cat-5")));
    let (status, problem) = user.patch(&lazer, json!({ "color": "cat-1" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    let pets = user.category_id("Pets").await;
    user.delete(&format!("/api/categories/{pets}")).await;
    let (status, reused) = create(
        &user,
        json!({ "name": "Bichos", "kind": "daily", "color": "cat-10" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{reused}");
}

#[sqlx::test]
async fn a_kind_with_all_24_colors_taken_has_no_free_one(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    for n in 16..=24 {
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
    assert_eq!(bill["color"], "cat-14");
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

    assert_eq!(moveis["color"], "cat-9");
    assert_eq!(reserva["color"], "cat-13");
    let moveis = format!("/api/categories/{}", moveis["id"].as_str().unwrap());
    let (status, kept) = user.patch(&moveis, json!({ "color": "cat-20" })).await;
    assert_eq!((status, &kept["color"]), (StatusCode::OK, &json!("cat-9")));
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
        (StatusCode::OK, &json!("cat-9"))
    );
    let (status, problem) = user
        .patch(&pets, json!({ "parent_id": null, "color": "cat-1" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(slug(&problem), "color-taken");
    let (status, out) = user.patch(&pets, json!({ "parent_id": null })).await;
    assert_eq!((status, &out["color"]), (StatusCode::OK, &json!("cat-10")));
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
    let casa = user.category_id("Casa").await;
    let (_, moveis) = create_child(&user, "Móveis", "daily", &casa).await;
    for n in 16..=24 {
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
