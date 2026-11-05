use soldi_types::categories::{Category, CategoryKind};
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::Seed;

pub async fn seed(
    conn: &mut PgConnection,
    user_id: Uuid,
    seeds: &[Seed],
) -> Result<(), sqlx::Error> {
    let names: Vec<&str> = seeds.iter().map(|seed| seed.name).collect();
    let kinds: Vec<&str> = seeds.iter().map(|seed| seed.kind.as_str()).collect();
    let icons: Vec<&str> = seeds.iter().map(|seed| seed.icon).collect();
    let colors: Vec<&str> = seeds.iter().map(|seed| seed.color.as_str()).collect();
    sqlx::query!(
        "INSERT INTO categories (user_id, name, kind, icon, color)
         SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[])",
        user_id,
        &names as &[&str],
        &kinds as &[&str],
        &icons as &[&str],
        &colors as &[&str]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Active categories: income, then bills, then daily; by name within a kind.
pub async fn list(conn: &mut PgConnection, user_id: Uuid) -> Result<Vec<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color FROM categories
           WHERE user_id = $1 AND archived_at IS NULL
           ORDER BY array_position(ARRAY['income', 'bill', 'daily'], kind), lower(name), id"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find_active(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color FROM categories
           WHERE user_id = $1 AND id = $2 AND archived_at IS NULL"#,
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Archived ones included, so a new category does not reuse a recent color.
pub async fn count_of_kind(
    conn: &mut PgConnection,
    user_id: Uuid,
    kind: CategoryKind,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM categories WHERE user_id = $1 AND kind = $2"#,
        user_id,
        kind.as_str()
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert(
    conn: &mut PgConnection,
    user_id: Uuid,
    name: &str,
    kind: CategoryKind,
    icon: &str,
    color: &str,
) -> Result<Category, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"INSERT INTO categories (user_id, name, kind, icon, color) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, kind AS "kind: CategoryKind", icon, color"#,
        user_id,
        name,
        kind.as_str(),
        icon,
        color
    )
    .fetch_one(&mut *conn)
    .await
}

/// The id of the user's active category with this name and kind, created when missing.
pub async fn find_or_insert(
    conn: &mut PgConnection,
    user_id: Uuid,
    name: &str,
    kind: CategoryKind,
    icon: &str,
    color: &str,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO categories (user_id, name, kind, icon, color) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, kind, lower(name)) WHERE archived_at IS NULL
         DO UPDATE SET name = categories.name
         RETURNING id",
        user_id,
        name,
        kind.as_str(),
        icon,
        color
    )
    .fetch_one(&mut *conn)
    .await
}

/// `None` fields stay as they are; `Ok(None)` when no active category of the user has this id.
pub async fn update(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    name: Option<&str>,
    icon: Option<&str>,
    color: Option<&str>,
) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"UPDATE categories
           SET name = COALESCE($3, name), icon = COALESCE($4, icon), color = COALESCE($5, color),
               updated_at = now()
           WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
           RETURNING id, name, kind AS "kind: CategoryKind", icon, color"#,
        user_id,
        id,
        name,
        icon,
        color
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Returns false when no active category of the user has this id.
pub async fn archive(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE categories SET archived_at = now(), updated_at = now()
         WHERE user_id = $1 AND id = $2 AND archived_at IS NULL",
        user_id,
        id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}
