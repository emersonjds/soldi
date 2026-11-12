use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use sqlx::PgConnection;
use uuid::Uuid;

use super::domain::Seed;

/// Top-levels first, then the subcategories joined on their parent's name.
pub async fn seed(
    conn: &mut PgConnection,
    user_id: Uuid,
    seeds: &[Seed],
) -> Result<(), sqlx::Error> {
    let (tops, children): (Vec<&Seed>, Vec<&Seed>) =
        seeds.iter().partition(|seed| seed.parent.is_none());
    let names: Vec<&str> = tops.iter().map(|seed| seed.name).collect();
    let kinds: Vec<&str> = tops.iter().map(|seed| seed.kind.as_str()).collect();
    let icons: Vec<&str> = tops.iter().map(|seed| seed.icon).collect();
    let colors: Vec<&str> = tops.iter().map(|seed| seed.color.as_str()).collect();
    let savings: Vec<bool> = tops.iter().map(|seed| seed.is_savings).collect();
    sqlx::query!(
        "INSERT INTO categories (user_id, name, kind, icon, color, is_savings)
         SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::bool[])",
        user_id,
        &names as &[&str],
        &kinds as &[&str],
        &icons as &[&str],
        &colors as &[&str],
        &savings
    )
    .execute(&mut *conn)
    .await?;
    let parents: Vec<&str> = children.iter().filter_map(|seed| seed.parent).collect();
    let names: Vec<&str> = children.iter().map(|seed| seed.name).collect();
    let kinds: Vec<&str> = children.iter().map(|seed| seed.kind.as_str()).collect();
    let icons: Vec<&str> = children.iter().map(|seed| seed.icon).collect();
    sqlx::query!(
        "INSERT INTO categories (user_id, name, kind, icon, color, parent_id)
         SELECT $1, s.name, s.kind, s.icon, p.color, p.id
         FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[]) AS s (parent, name, kind, icon)
         JOIN categories p ON p.user_id = $1 AND p.parent_id IS NULL AND p.name = s.parent",
        user_id,
        &parents as &[&str],
        &names as &[&str],
        &kinds as &[&str],
        &icons as &[&str]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Active categories: income, then bills, then daily; within a kind by parent name, each parent
/// followed by its subcategories by name. A subcategory of another kind than its parent sits in
/// its own kind's section. `Resgate` only with `include_system`.
pub async fn list(
    conn: &mut PgConnection,
    user_id: Uuid,
    include_system: bool,
) -> Result<Vec<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT c.id, c.name, c.kind AS "kind: CategoryKind", c.icon, c.color, c.parent_id,
                  c.is_savings, c.target, c.deadline
           FROM categories c LEFT JOIN categories p ON p.user_id = c.user_id AND p.id = c.parent_id
           WHERE c.user_id = $1 AND c.archived_at IS NULL AND p.archived_at IS NULL
             AND ($2 OR NOT (c.is_savings AND c.kind = 'income'))
           ORDER BY array_position(ARRAY['income', 'bill', 'daily'], c.kind),
                    lower(COALESCE(p.name, c.name)), COALESCE(p.id, c.id),
                    c.parent_id IS NOT NULL, lower(c.name), c.id"#,
        user_id,
        include_system
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
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                  target, deadline
           FROM categories WHERE user_id = $1 AND id = $2 AND archived_at IS NULL"#,
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `find_active` locking the row against other writers: a concurrent child create, move or
/// recolor of this parent waits, and a later recolor of it cannot deadlock on a share lock.
pub async fn find_active_locked(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                  target, deadline
           FROM categories WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
           FOR NO KEY UPDATE"#,
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `find_active` share-locking the row, archived included unless `active`: an entry written
/// while the category changes kind waits and sees the final kind.
pub async fn find_shared(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    active: bool,
) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                  target, deadline
           FROM categories WHERE user_id = $1 AND id = $2 AND (archived_at IS NULL OR NOT $3)
           FOR SHARE"#,
        user_id,
        id,
        active
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The user's `Economia` (bill) or `Resgate` (income).
pub async fn savings(
    conn: &mut PgConnection,
    user_id: Uuid,
    kind: CategoryKind,
) -> Result<Category, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"SELECT id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                  target, deadline
           FROM categories WHERE user_id = $1 AND kind = $2 AND is_savings"#,
        user_id,
        kind.as_str()
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn has_children(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM categories
           WHERE user_id = $1 AND parent_id = $2 AND archived_at IS NULL) AS "exists!""#,
        user_id,
        id
    )
    .fetch_one(&mut *conn)
    .await
}

/// D26: colors of the user's active top-levels that show in any of `kinds` (own kind or an
/// active subcategory's), `except` left out both as a top-level and as a subcategory.
pub async fn top_colors(
    conn: &mut PgConnection,
    user_id: Uuid,
    kinds: &[CategoryKind],
    except: Option<Uuid>,
) -> Result<Vec<String>, sqlx::Error> {
    let kinds: Vec<&str> = kinds.iter().map(|kind| kind.as_str()).collect();
    sqlx::query_scalar!(
        "SELECT c.color FROM categories c
         WHERE c.user_id = $1 AND c.parent_id IS NULL AND c.archived_at IS NULL
           AND c.id IS DISTINCT FROM $3
           AND (c.kind = ANY($2) OR EXISTS (
                SELECT 1 FROM categories s
                WHERE s.user_id = $1 AND s.parent_id = c.id AND s.archived_at IS NULL
                  AND s.id IS DISTINCT FROM $3 AND s.kind = ANY($2)))",
        user_id,
        &kinds as &[&str],
        except
    )
    .fetch_all(&mut *conn)
    .await
}

/// The kinds of the category's active subcategories.
pub async fn child_kinds(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Vec<CategoryKind>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT DISTINCT kind AS "kind!: CategoryKind" FROM categories
           WHERE user_id = $1 AND parent_id = $2 AND archived_at IS NULL"#,
        user_id,
        id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn set_color(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    color: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE categories SET color = $3, updated_at = now() WHERE user_id = $1 AND id = $2",
        user_id,
        id,
        color
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Archived subcategories included.
pub async fn recolor_children(
    conn: &mut PgConnection,
    user_id: Uuid,
    parent_id: Uuid,
    color: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE categories SET color = $3, updated_at = now()
         WHERE user_id = $1 AND parent_id = $2 AND color <> $3",
        user_id,
        parent_id,
        color
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub struct NewCategory<'a> {
    pub name: &'a str,
    pub kind: CategoryKind,
    pub icon: &'a str,
    pub color: &'a str,
    pub parent_id: Option<Uuid>,
    pub target: Option<Decimal>,
    pub deadline: Option<NaiveDate>,
}

pub async fn insert(
    conn: &mut PgConnection,
    user_id: Uuid,
    new: NewCategory<'_>,
) -> Result<Category, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"INSERT INTO categories (user_id, name, kind, icon, color, parent_id, target, deadline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                     target, deadline"#,
        user_id,
        new.name,
        new.kind.as_str(),
        new.icon,
        new.color,
        new.parent_id,
        new.target,
        new.deadline
    )
    .fetch_one(&mut *conn)
    .await
}

/// The id of the user's active category with this name and kind.
pub async fn find_id_by_name(
    conn: &mut PgConnection,
    user_id: Uuid,
    name: &str,
    kind: CategoryKind,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM categories
         WHERE user_id = $1 AND kind = $2 AND lower(name) = lower($3) AND archived_at IS NULL",
        user_id,
        kind.as_str(),
        name
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `None` fields stay as they are.
pub struct CategoryChange<'a> {
    pub name: Option<&'a str>,
    pub icon: Option<&'a str>,
    pub color: Option<&'a str>,
    pub parent_id: Option<Option<Uuid>>,
    pub target: Option<Option<Decimal>>,
    pub deadline: Option<Option<NaiveDate>>,
}

/// `Ok(None)` when no active category of the user has this id.
pub async fn update(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    change: CategoryChange<'_>,
) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as!(
        Category,
        r#"UPDATE categories
           SET name = COALESCE($3, name), icon = COALESCE($4, icon), color = COALESCE($5, color),
               parent_id = CASE WHEN $6 THEN $7 ELSE parent_id END,
               target = CASE WHEN $8 THEN $9 ELSE target END,
               deadline = CASE WHEN $10 THEN $11 ELSE deadline END, updated_at = now()
           WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
           RETURNING id, name, kind AS "kind: CategoryKind", icon, color, parent_id, is_savings,
                     target, deadline"#,
        user_id,
        id,
        change.name,
        change.icon,
        change.color,
        change.parent_id.is_some(),
        change.parent_id.flatten(),
        change.target.is_some(),
        change.target.flatten(),
        change.deadline.is_some(),
        change.deadline.flatten()
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Archives the category with its subcategories in one statement; false when no active category
/// of the user has this id.
pub async fn archive(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH parent AS (
               UPDATE categories SET archived_at = now(), updated_at = now()
               WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
               RETURNING id),
           children AS (
               UPDATE categories SET archived_at = now(), updated_at = now()
               WHERE user_id = $1 AND parent_id IN (SELECT id FROM parent) AND archived_at IS NULL)
           SELECT EXISTS (SELECT 1 FROM parent) AS "archived!""#,
        user_id,
        id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Whether an active category of `kind` other than `id` already has the category's name.
pub async fn name_taken(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    kind: CategoryKind,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM categories other, categories this
           WHERE this.user_id = $1 AND this.id = $2
             AND other.user_id = $1 AND other.id <> $2 AND other.kind = $3
             AND lower(other.name) = lower(this.name) AND other.archived_at IS NULL) AS "exists!""#,
        user_id,
        id,
        kind.as_str()
    )
    .fetch_one(&mut *conn)
    .await
}

/// Whether an unarchived conta fixa, active or paused, points at the category itself.
pub async fn has_bills(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM recurring_bills
           WHERE user_id = $1 AND category_id = $2 AND archived_at IS NULL) AS "exists!""#,
        user_id,
        id
    )
    .fetch_one(&mut *conn)
    .await
}

/// D28: whether any entry of the category itself sits on a card.
pub async fn has_card_entries(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM transactions
           WHERE user_id = $1 AND category_id = $2 AND card_id IS NOT NULL) AS "exists!""#,
        user_id,
        id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Moves the category and every entry of its own to `kind`, wearing `color` when given; its
/// subcategories keep theirs. Kind and color change in one row write so the per-kind color index
/// never sees the old color in the new kind.
pub async fn change_kind(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    kind: CategoryKind,
    color: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "WITH moved AS (
             UPDATE categories SET kind = $3, color = COALESCE($4, color), updated_at = now()
             WHERE user_id = $1 AND id = $2
             RETURNING id)
         UPDATE transactions SET kind = $3, updated_at = now()
         WHERE user_id = $1 AND category_id IN (SELECT id FROM moved)",
        user_id,
        id,
        kind.as_str(),
        color
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
