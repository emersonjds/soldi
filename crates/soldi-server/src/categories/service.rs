use soldi_types::categories::{Category, CategoryKind, CreateCategory, UpdateCategory};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::repo::{CategoryChange, NewCategory};
use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{cofrinhos, settings};

pub async fn list(
    pool: &PgPool,
    user: &CurrentUser,
    include_system: bool,
) -> Result<Vec<Category>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, user.id, include_system).await?)
}

async fn active(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Category, AppError> {
    repo::find_active(conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn create(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateCategory,
) -> Result<Category, AppError> {
    let name = domain::check_name(&input.name)?;
    let note = input
        .note
        .as_deref()
        .map(domain::check_note)
        .transpose()?
        .flatten();
    let icon = input.icon.unwrap_or_else(|| domain::DEFAULT_ICON.into());
    domain::check_icon(&icon)?;
    input
        .color
        .as_deref()
        .map(domain::check_color)
        .transpose()?;
    let mut tx = pool.begin().await?;
    let conn = &mut *tx;
    let parent = match input.parent_id {
        Some(parent_id) => Some(
            repo::find_active_locked(conn, user.id, parent_id)
                .await?
                .ok_or(AppError::NotFound)?,
        ),
        None => None,
    };
    if let Some(parent) = &parent {
        domain::check_parent(None, input.kind, false, parent)?;
    }
    domain::check_goal(
        domain::is_cofrinho_parent(parent.as_ref()),
        input.target,
        input.deadline,
        note.is_some(),
    )?;
    let color = match &parent {
        Some(parent) => parent.color.clone(),
        None => {
            let taken = repo::top_colors(conn, user.id, &[input.kind], None).await?;
            domain::pick_color(input.color.as_deref(), &taken)?
        }
    };
    let new = NewCategory {
        name: &name,
        kind: input.kind,
        icon: &icon,
        color: &color,
        parent_id: input.parent_id,
        target: input.target,
        deadline: input.deadline,
        note: note.as_deref(),
    };
    let mut created = repo::insert(conn, user.id, new).await?;
    if let Some(parent_id) = input.parent_id {
        fit_group_color(conn, user, parent_id).await?;
        created = active(conn, user, created.id).await?;
    }
    tx.commit().await?;
    Ok(created)
}

pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    input: UpdateCategory,
) -> Result<Category, AppError> {
    let name = input.name.as_deref().map(domain::check_name).transpose()?;
    let note = input
        .note
        .map(|note| note.as_deref().map(domain::check_note).transpose())
        .transpose()?
        .map(Option::flatten);
    input.icon.as_deref().map(domain::check_icon).transpose()?;
    input
        .color
        .as_deref()
        .map(domain::check_color)
        .transpose()?;
    let mut tx = pool.begin().await?;
    let conn = &mut *tx;
    let mut category = repo::find_active_locked(conn, user.id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(kind) = input.kind.filter(|&kind| kind != category.kind) {
        change_kind(conn, user, &category, kind).await?;
        category = active(conn, user, id).await?;
    }
    // ponytail: crossing moves (A under B, B under A) lock in opposite order; Postgres aborts one
    // as a deadlock (500). Lock both ids in id order if it ever shows up.
    if let Some(Some(parent_id)) = input.parent_id {
        domain::check_not_savings(&category)?;
        let parent = active(conn, user, parent_id).await?;
        let has_children = repo::has_children(conn, user.id, id).await?;
        domain::check_parent(Some(id), category.kind, has_children, &parent)?;
    }
    let parent_id = input.parent_id.unwrap_or(category.parent_id);
    let parent = match parent_id {
        Some(parent_id) => repo::find_active_locked(conn, user.id, parent_id).await?,
        None => None,
    };
    let color = match (&parent, parent_id) {
        (Some(parent), _) => Some(parent.color.clone()),
        (None, None) if input.color.is_some() || category.parent_id.is_some() => {
            let mut kinds = repo::child_kinds(conn, user.id, id).await?;
            kinds.push(category.kind);
            let taken = repo::top_colors(conn, user.id, &kinds, Some(id)).await?;
            Some(domain::pick_color(input.color.as_deref(), &taken)?)
        }
        (None, _) => None,
    };
    let cofrinho = domain::is_cofrinho_parent(parent.as_ref());
    domain::check_goal(
        cofrinho,
        input.target.flatten(),
        input.deadline.flatten(),
        note.as_ref().is_some_and(Option::is_some),
    )?;
    let (target, deadline, note) = match cofrinho {
        true => (input.target, input.deadline, note),
        false => (Some(None), Some(None), Some(None)),
    };
    let change = CategoryChange {
        name: name.as_deref(),
        icon: input.icon.as_deref(),
        color: color.as_deref(),
        parent_id: input.parent_id,
        target,
        deadline,
        note: note.as_ref().map(Option::as_deref),
    };
    let mut updated = repo::update(conn, user.id, id, change)
        .await?
        .ok_or(AppError::NotFound)?;
    if updated.parent_id.is_none() && color.is_some() {
        repo::recolor_children(conn, user.id, id, &updated.color).await?;
    }
    if let Some(Some(parent_id)) = input.parent_id {
        fit_group_color(conn, user, parent_id).await?;
        updated = active(conn, user, id).await?;
    }
    tx.commit().await?;
    Ok(updated)
}

/// D27: one category changes kind on its own; its subcategories keep theirs. A subcategory
/// wears its parent's color and the parent applies D26; a top-level keeps its color when free
/// in every kind it now shows in, else takes the lowest free one.
// ponytail: a conta fixa created in between blocks nothing; bills lock no category row.
async fn change_kind(
    conn: &mut PgConnection,
    user: &CurrentUser,
    category: &Category,
    kind: CategoryKind,
) -> Result<(), AppError> {
    let parent = match category.parent_id {
        Some(parent_id) => repo::find_active_locked(conn, user.id, parent_id).await?,
        None => None,
    };
    domain::check_kind_change(category, parent.as_ref(), kind)?;
    if repo::name_taken(conn, user.id, category.id, kind).await? {
        return Err(domain::duplicate_name(kind, &category.name));
    }
    if kind == CategoryKind::Daily && repo::has_bills(conn, user.id, category.id).await? {
        return Err(domain::category_has_bills());
    }
    if kind != CategoryKind::Daily && repo::has_card_entries(conn, user.id, category.id).await? {
        return Err(domain::category_has_card_entries());
    }
    if let Some(parent_id) = category.parent_id {
        repo::change_kind(conn, user.id, category.id, kind, None).await?;
        return fit_group_color(conn, user, parent_id).await;
    }
    let taken = repo::top_colors(conn, user.id, &[kind], Some(category.id)).await?;
    let color = match taken.contains(&category.color) {
        true => {
            let mut kinds = repo::child_kinds(conn, user.id, category.id).await?;
            kinds.push(kind);
            let taken = repo::top_colors(conn, user.id, &kinds, Some(category.id)).await?;
            Some(domain::pick_color(None, &taken)?)
        }
        false => None,
    };
    repo::change_kind(conn, user.id, category.id, kind, color.as_deref()).await?;
    if let Some(color) = color {
        repo::recolor_children(conn, user.id, category.id, &color).await?;
    }
    Ok(())
}

/// D26: a group that shows in a kind where its color is taken moves to the lowest token free
/// in every kind it shows in, or keeps its color when none is.
// ponytail: cross-kind uniqueness lives here only (`categories_top_color_idx` is per kind); two
// concurrent writes in different kinds can share a color. Upgrade: a per-user advisory lock.
pub async fn fit_group_color(
    conn: &mut PgConnection,
    user: &CurrentUser,
    parent_id: Uuid,
) -> Result<(), AppError> {
    let parent = repo::find_active_locked(conn, user.id, parent_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let mut kinds = repo::child_kinds(conn, user.id, parent_id).await?;
    kinds.push(parent.kind);
    let taken = repo::top_colors(conn, user.id, &kinds, Some(parent_id)).await?;
    if !taken.contains(&parent.color) {
        return Ok(());
    }
    if let Ok(color) = domain::pick_color(None, &taken) {
        repo::set_color(conn, user.id, parent_id, &color).await?;
        repo::recolor_children(conn, user.id, parent_id, &color).await?;
    }
    Ok(())
}

pub async fn archive(pool: &PgPool, user: &CurrentUser, id: Uuid) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let category = active(&mut conn, user, id).await?;
    domain::check_not_savings(&category)?;
    let parent = match category.parent_id {
        Some(parent_id) => repo::find_active(&mut conn, user.id, parent_id).await?,
        None => None,
    };
    // ponytail: checked then archived without a lock; an entry landing in between stays inside.
    if domain::is_cofrinho_parent(parent.as_ref()) {
        let opening = settings::repo::find(&mut conn, user.id).await?.opening_date;
        let balance = cofrinhos::repo::balance(&mut conn, user.id, id, opening).await?;
        cofrinhos::domain::check_empty(balance)?;
    }
    match repo::archive(&mut conn, user.id, id).await? {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}
