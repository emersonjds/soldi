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
    assert_eq!(list.len(), 30);
    let kinds: Vec<&str> = list.iter().map(|c| c["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds.iter().filter(|kind| **kind == "income").count(), 3);
    assert_eq!(kinds.iter().filter(|kind| **kind == "bill").count(), 12);
    assert_eq!(kinds.iter().filter(|kind| **kind == "daily").count(), 15);
    assert_eq!(kinds[0], "income");
    assert_eq!(kinds[29], "daily");
    let salary = find(&categories, "Salário");
    assert_eq!(salary["icon"], "briefcase");
    assert_eq!(salary["color"], "cat-11");
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
    assert_eq!(created["color"], "cat-4");
    let (_, custom) = user
        .post(
            "/api/categories",
            json!({ "name": "Academia", "kind": "bill", "icon": "dumbbell", "color": "cat-7" }),
        )
        .await;
    assert_eq!(
        (&custom["icon"], &custom["color"]),
        (&json!("dumbbell"), &json!("cat-7"))
    );
    assert_eq!(
        user.get("/api/categories")
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        32
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
            json!({ "name": "Diversão", "icon": "party-popper", "color": "cat-2" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["name"], "Diversão");
    assert_eq!(updated["icon"], "party-popper");
    assert_eq!(updated["color"], "cat-2");
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
    assert_eq!(after.as_array().unwrap().len(), 29);
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
    assert_eq!(categories.as_array().unwrap().len(), 29);
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
