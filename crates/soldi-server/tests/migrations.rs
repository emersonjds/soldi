use sqlx::PgPool;
use uuid::Uuid;

/// Runs every migration before `version`, so a test can seed the old shape first.
async fn migrate_before(pool: &PgPool, version: i64) {
    for migration in sqlx::migrate!().iter().filter(|m| m.version < version) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(pool)
            .await
            .unwrap();
    }
}

async fn migrate_from(pool: &PgPool, version: i64) {
    for migration in sqlx::migrate!().iter().filter(|m| m.version >= version) {
        sqlx::raw_sql(migration.sql.clone())
            .execute(pool)
            .await
            .unwrap();
    }
}

async fn user(pool: &PgPool, email: &str) -> Uuid {
    sqlx::query_scalar("INSERT INTO users (email, name) VALUES ($1, 'Ana') RETURNING id")
        .bind(email)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = false)]
async fn cofrinhos_backfill_economia_and_resgate_once_per_user(pool: PgPool) {
    migrate_before(&pool, 13).await;
    let ana = user(&pool, "ana@example.com").await;
    let bia = user(&pool, "bia@example.com").await;
    sqlx::query(
        "INSERT INTO categories (user_id, name, kind, icon, color) VALUES ($1, 'economia', 'bill', 'coins', 'cat-3')",
    )
    .bind(bia)
    .execute(&pool)
    .await
    .unwrap();

    migrate_from(&pool, 13).await;

    let rows: Vec<(Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT user_id, name, kind, icon, color FROM categories WHERE is_savings ORDER BY user_id = $1 DESC, kind",
    )
    .bind(ana)
    .fetch_all(&pool)
    .await
    .unwrap();
    let ana_rows: Vec<_> = rows.iter().filter(|row| row.0 == ana).collect();
    assert_eq!(
        ana_rows
            .iter()
            .map(|row| (
                row.1.as_str(),
                row.2.as_str(),
                row.3.as_str(),
                row.4.as_str()
            ))
            .collect::<Vec<_>>(),
        [
            ("Economia", "bill", "piggy-bank", "cat-11"),
            ("Resgate", "income", "piggy-bank", "cat-11")
        ]
    );
    let bia_rows: Vec<_> = rows.iter().filter(|row| row.0 == bia).collect();
    assert_eq!(bia_rows.len(), 2);
    assert_eq!(bia_rows[0].1, "economia");
    let leftovers: (Option<String>, i64) = sqlx::query_as(
        "SELECT to_regclass('savings')::text, (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'settings' AND column_name = 'savings_goal_pct')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(leftovers, (None, 0));
    let duplicate = sqlx::query(
        "INSERT INTO categories (user_id, name, kind, icon, color, is_savings) VALUES ($1, 'Outra', 'bill', 'x', 'cat-1', true)",
    )
    .bind(ana)
    .execute(&pool)
    .await;
    assert!(duplicate.is_err());
}

async fn category(
    pool: &PgPool,
    user_id: Uuid,
    name: &str,
    kind: &str,
    color: &str,
    parent: Option<Uuid>,
    archived: bool,
) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO categories (user_id, name, kind, icon, color, parent_id, archived_at)
         VALUES ($1, $2, $3, 'x', $4, $5, CASE WHEN $6 THEN now() END) RETURNING id",
    )
    .bind(user_id)
    .bind(name)
    .bind(kind)
    .bind(color)
    .bind(parent)
    .bind(archived)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn color_of(pool: &PgPool, id: Uuid) -> String {
    sqlx::query_scalar("SELECT color FROM categories WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = false)]
async fn unique_colors_recolor_later_duplicates_and_children_wear_the_parents(pool: PgPool) {
    migrate_before(&pool, 16).await;
    let ana = user(&pool, "ana@example.com").await;
    let bia = user(&pool, "bia@example.com").await;
    let mercado = category(&pool, ana, "Mercado", "daily", "cat-1", None, false).await;
    let pets = category(&pool, ana, "Pets", "daily", "cat-1", None, false).await;
    category(&pool, ana, "Lazer", "daily", "cat-2", None, false).await;
    let casa = category(&pool, ana, "Casa", "daily", "cat-2", None, false).await;
    category(&pool, ana, "Velha", "daily", "cat-3", None, true).await;
    let moveis = category(&pool, ana, "Móveis", "daily", "cat-7", Some(casa), false).await;
    let sofa = category(&pool, ana, "Sofá", "daily", "cat-8", Some(casa), true).await;
    category(&pool, ana, "Salário", "income", "cat-1", None, false).await;
    let bia_pets = category(&pool, bia, "Pets", "daily", "cat-1", None, false).await;
    let bia_mercado = category(&pool, bia, "Mercado", "daily", "cat-1", None, false).await;
    sqlx::query("UPDATE categories SET created_at = '2026-01-01' WHERE user_id = $1")
        .bind(bia)
        .execute(&pool)
        .await
        .unwrap();

    migrate_from(&pool, 16).await;

    let colors: Vec<(Uuid, String, String)> = sqlx::query_as(
        "SELECT user_id, name, color FROM categories ORDER BY user_id = $1 DESC, created_at, id",
    )
    .bind(ana)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(color_of(&pool, mercado).await, "cat-1");
    assert_eq!(color_of(&pool, pets).await, "cat-3");
    assert_eq!(color_of(&pool, casa).await, "cat-4");
    assert_eq!(color_of(&pool, moveis).await, "cat-4");
    assert_eq!(color_of(&pool, sofa).await, "cat-4");
    assert_eq!(
        colors
            .iter()
            .map(|row| (row.1.as_str(), row.2.as_str()))
            .filter(|row| row.0 == "Salário" || row.0 == "Velha")
            .collect::<Vec<_>>(),
        [("Velha", "cat-3"), ("Salário", "cat-1")]
    );
    assert_eq!(color_of(&pool, bia_mercado).await, "cat-1");
    assert_eq!(color_of(&pool, bia_pets).await, "cat-2");
    let free = sqlx::query(
        "INSERT INTO categories (user_id, name, kind, icon, color) VALUES ($1, 'Nova', 'daily', 'x', 'cat-24')",
    )
    .bind(ana)
    .execute(&pool)
    .await;
    assert!(free.is_ok());
    let taken = sqlx::query(
        "INSERT INTO categories (user_id, name, kind, icon, color) VALUES ($1, 'Outra', 'daily', 'x', 'cat-24')",
    )
    .bind(ana)
    .execute(&pool)
    .await
    .unwrap_err();
    assert_eq!(
        taken.as_database_error().unwrap().constraint(),
        Some("categories_top_color_idx")
    );
}

#[sqlx::test(migrations = false)]
async fn active_since_backfills_the_sao_paulo_day_each_bill_was_registered(pool: PgPool) {
    migrate_before(&pool, 18).await;
    let ana = user(&pool, "ana@example.com").await;
    let luz = category(&pool, ana, "Luz", "bill", "cat-1", None, false).await;
    sqlx::query(
        "INSERT INTO recurring_bills (user_id, name, amount, due_day, category_id, created_at)
         VALUES ($1, 'Luz', 100, 10, $2, '2026-03-01T01:00:00Z')",
    )
    .bind(ana)
    .bind(luz)
    .execute(&pool)
    .await
    .unwrap();

    migrate_from(&pool, 18).await;

    let since: chrono::NaiveDate = sqlx::query_scalar("SELECT active_since FROM recurring_bills")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(since, "2026-02-28".parse().unwrap());
}

#[sqlx::test(migrations = false)]
async fn dropping_the_importer_keeps_imported_entries(pool: PgPool) {
    migrate_before(&pool, 19).await;
    let ana = user(&pool, "ana@example.com").await;
    let mercado = category(&pool, ana, "Mercado", "daily", "cat-1", None, false).await;
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id, import_batch_id, import_year)
         VALUES ($1, '2025-03-10', 42.50, 'daily', $2, gen_random_uuid(), 2025)",
    )
    .bind(ana)
    .bind(mercado)
    .execute(&pool)
    .await
    .unwrap();

    migrate_from(&pool, 19).await;

    let leftovers: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'transactions' AND column_name LIKE 'import_%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let previews: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('import_previews')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    let kept: i64 = sqlx::query_scalar("SELECT count(*) FROM transactions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((leftovers, previews, kept), (0, None, 1));
}

#[sqlx::test(migrations = false)]
async fn credit_cards_keep_every_bill_and_entry(pool: PgPool) {
    migrate_before(&pool, 20).await;
    let ana = user(&pool, "ana@example.com").await;
    let luz = category(&pool, ana, "Luz", "bill", "cat-1", None, false).await;
    let mercado = category(&pool, ana, "Mercado", "daily", "cat-2", None, false).await;
    sqlx::query(
        "INSERT INTO recurring_bills (user_id, name, amount, due_day, category_id)
         VALUES ($1, 'Luz', 100, 10, $2)",
    )
    .bind(ana)
    .bind(luz)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id)
         VALUES ($1, '2026-11-05', 42.50, 'daily', $2)",
    )
    .bind(ana)
    .bind(mercado)
    .execute(&pool)
    .await
    .unwrap();

    migrate_from(&pool, 20).await;

    let (amount, closing): (Option<rust_decimal::Decimal>, Option<i16>) =
        sqlx::query_as("SELECT amount, closing_day FROM recurring_bills")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((amount, closing), (Some("100".parse().unwrap()), None));
    let card: Option<Uuid> = sqlx::query_scalar("SELECT card_id FROM transactions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(card, None);

    let bia = user(&pool, "bia@example.com").await;
    let feira = category(&pool, bia, "Feira", "daily", "cat-3", None, false).await;
    let porto: Uuid = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "INSERT INTO recurring_bills (user_id, name, due_day, category_id, closing_day)
         VALUES ('{ana}', 'Porto', 10, '{luz}', 3) RETURNING id"
    )))
    .fetch_one(&pool)
    .await
    .unwrap();
    for (sql, constraint) in [
        (
            format!(
                "INSERT INTO recurring_bills (user_id, name, amount, due_day, category_id, closing_day)
                 VALUES ('{ana}', 'Porto', 10, 10, '{luz}', 3)"
            ),
            "recurring_bills_card_amount",
        ),
        (
            format!(
                "INSERT INTO recurring_bills (user_id, name, due_day, category_id)
                 VALUES ('{ana}', 'Porto', 10, '{luz}')"
            ),
            "recurring_bills_card_amount",
        ),
        (
            format!(
                "INSERT INTO transactions (user_id, date, amount, kind, category_id, card_id)
                 VALUES ('{ana}', '2026-11-05', 10, 'bill', '{luz}', '{porto}')"
            ),
            "transactions_card_daily",
        ),
        (
            format!(
                "INSERT INTO transactions (user_id, date, amount, kind, category_id, card_id)
                 VALUES ('{bia}', '2026-11-05', 10, 'daily', '{feira}', '{porto}')"
            ),
            "transactions_card_fk",
        ),
    ] {
        let refused = sqlx::query(sqlx::AssertSqlSafe(sql.clone())).execute(&pool).await.unwrap_err();
        assert_eq!(
            refused.as_database_error().unwrap().constraint(),
            Some(constraint),
            "{sql}"
        );
    }

    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id, card_id)
         VALUES ('{ana}', '2026-11-06', 30, 'daily', '{mercado}', '{porto}')"
    )))
    .execute(&pool)
    .await
    .unwrap();
    let spec = include_str!("../../../docs/specs/2026-11-12-categories-and-cards.md");
    let revert = spec
        .split("the revert, if ever needed, is:")
        .nth(1)
        .and_then(|rest| rest.split("```").nth(1))
        .unwrap()
        .trim_start_matches("sql");
    sqlx::raw_sql(revert).execute(&pool).await.unwrap();
    let (amount, active): (rust_decimal::Decimal, bool) =
        sqlx::query_as("SELECT amount, active FROM recurring_bills WHERE id = $1")
            .bind(porto)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((amount, active), ("0.01".parse().unwrap(), false));
}

#[sqlx::test(migrations = false)]
async fn d32_existing_series_rows_repeat_monthly_and_the_step_needs_a_series(pool: PgPool) {
    migrate_before(&pool, 21).await;
    let ana = user(&pool, "ana@example.com").await;
    let market: Uuid = sqlx::query_scalar(
        "INSERT INTO categories (user_id, name, kind, icon, color)
         VALUES ($1, 'Mercado', 'daily', 'shopping-cart', 'cat-1') RETURNING id",
    )
    .bind(ana)
    .fetch_one(&pool)
    .await
    .unwrap();
    let insert = "INSERT INTO transactions (user_id, date, amount, kind, category_id, series_id)
                  VALUES ($1, '2026-11-05', 10, 'daily', $2, $3)";
    for series_id in [Some(Uuid::new_v4()), None] {
        sqlx::query(insert)
            .bind(ana)
            .bind(market)
            .bind(series_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    migrate_from(&pool, 21).await;

    let steps: Vec<(bool, Option<String>)> = sqlx::query_as(
        "SELECT series_id IS NOT NULL, series_every FROM transactions ORDER BY series_id NULLS LAST",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(steps, [(true, Some("month".into())), (false, None)]);
    for (series_id, every) in [(Some(Uuid::new_v4()), None), (None, Some("week"))] {
        let refused = sqlx::query(
            "INSERT INTO transactions (user_id, date, amount, kind, category_id, series_id, series_every)
             VALUES ($1, '2026-11-06', 10, 'daily', $2, $3, $4)",
        )
        .bind(ana)
        .bind(market)
        .bind(series_id)
        .bind(every)
        .execute(&pool)
        .await;
        assert!(refused.is_err(), "{every:?}");
    }
}
