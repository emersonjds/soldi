use soldi_types::categories::{Category, CreateCategory, UpdateCategory};
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
    let icon = input.icon.unwrap_or_else(|| domain::DEFAULT_ICON.into());
    domain::check_icon(&icon)?;
    input
        .color
        .as_deref()
        .map(domain::check_color)
        .transpose()?;
    let mut conn = pool.acquire().await?;
    let parent = match input.parent_id {
        Some(parent_id) => Some(active(&mut conn, user, parent_id).await?),
        None => None,
    };
    if let Some(parent) = &parent {
        domain::check_parent(None, input.kind, false, parent)?;
    }
    domain::check_goal(
        domain::is_cofrinho_parent(parent.as_ref()),
        input.target,
        input.deadline,
    )?;
    let color = match input.color {
        Some(color) => color,
        None => {
            let count = repo::count_of_kind(&mut conn, user.id, input.kind).await?;
            domain::color_for(usize::try_from(count).unwrap_or_default())
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
    };
    Ok(repo::insert(&mut conn, user.id, new).await?)
}

pub async fn update(
    pool: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    input: UpdateCategory,
) -> Result<Category, AppError> {
    let name = input.name.as_deref().map(domain::check_name).transpose()?;
    input.icon.as_deref().map(domain::check_icon).transpose()?;
    input
        .color
        .as_deref()
        .map(domain::check_color)
        .transpose()?;
    let mut conn = pool.acquire().await?;
    let category = active(&mut conn, user, id).await?;
    // ponytail: checked then written without a lock; two concurrent moves could nest two levels.
    if let Some(Some(parent_id)) = input.parent_id {
        domain::check_not_savings(&category)?;
        let parent = active(&mut conn, user, parent_id).await?;
        let has_children = repo::has_children(&mut conn, user.id, id).await?;
        domain::check_parent(Some(id), category.kind, has_children, &parent)?;
    }
    let parent_id = input.parent_id.unwrap_or(category.parent_id);
    let parent = match parent_id {
        Some(parent_id) => repo::find_active(&mut conn, user.id, parent_id).await?,
        None => None,
    };
    let cofrinho = domain::is_cofrinho_parent(parent.as_ref());
    domain::check_goal(cofrinho, input.target.flatten(), input.deadline.flatten())?;
    let (target, deadline) = match cofrinho {
        true => (input.target, input.deadline),
        false => (Some(None), Some(None)),
    };
    let change = CategoryChange {
        name: name.as_deref(),
        icon: input.icon.as_deref(),
        color: input.color.as_deref(),
        parent_id: input.parent_id,
        target,
        deadline,
    };
    repo::update(&mut conn, user.id, id, change)
        .await?
        .ok_or(AppError::NotFound)
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
