use soldi_types::categories::{Category, CreateCategory, UpdateCategory};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::{domain, repo};
use crate::error::AppError;
use crate::extract::CurrentUser;

pub async fn list(pool: &PgPool, user: &CurrentUser) -> Result<Vec<Category>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, user.id).await?)
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
    if let Some(parent_id) = input.parent_id {
        let parent = active(&mut conn, user, parent_id).await?;
        domain::check_parent(None, input.kind, false, &parent)?;
    }
    let color = match input.color {
        Some(color) => color,
        None => {
            let count = repo::count_of_kind(&mut conn, user.id, input.kind).await?;
            domain::color_for(usize::try_from(count).unwrap_or_default())
        }
    };
    Ok(repo::insert(
        &mut conn,
        user.id,
        &name,
        input.kind,
        &icon,
        &color,
        input.parent_id,
    )
    .await?)
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
    // ponytail: checked then written without a lock; two concurrent moves could nest two levels.
    if let Some(Some(parent_id)) = input.parent_id {
        let category = active(&mut conn, user, id).await?;
        let parent = active(&mut conn, user, parent_id).await?;
        let has_children = repo::has_children(&mut conn, user.id, id).await?;
        domain::check_parent(Some(id), category.kind, has_children, &parent)?;
    }
    repo::update(
        &mut conn,
        user.id,
        id,
        name.as_deref(),
        input.icon.as_deref(),
        input.color.as_deref(),
        input.parent_id,
    )
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn archive(pool: &PgPool, user: &CurrentUser, id: Uuid) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    match repo::archive(&mut conn, user.id, id).await? {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}
