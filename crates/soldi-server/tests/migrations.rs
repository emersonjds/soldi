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
