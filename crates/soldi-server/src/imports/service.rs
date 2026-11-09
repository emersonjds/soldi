use soldi_types::imports::{ConfirmImport, ImportPreview, ImportResult, SkippedCell};
use soldi_types::settings::UpdateSettings;
use sqlx::PgPool;

use super::domain::{self, MAX_FILE_BYTES};
use super::repo;
use crate::error::AppError;
use crate::extract::CurrentUser;
use crate::{categories, onboarding, settings};

pub async fn preview(
    pool: &PgPool,
    user: &CurrentUser,
    file: Vec<u8>,
) -> Result<ImportPreview, AppError> {
    if file.len() > MAX_FILE_BYTES {
        return Err(AppError::TooLarge);
    }
    let parsed = tokio::task::spawn_blocking(move || domain::parse(file))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(|_| AppError::invalid("file", "must be an .xlsx workbook"))?;
    let mut conn = pool.acquire().await?;
    let token = repo::insert_preview(&mut conn, user.id, &parsed).await?;
    Ok(domain::preview(&parsed, token))
}

/// Settings, the `Importado` categories and the rows, all or nothing.
pub async fn confirm(
    pool: &PgPool,
    user: &CurrentUser,
    input: ConfirmImport,
) -> Result<ImportResult, AppError> {
    let mut tx = pool.begin().await?;
    let preview = repo::find_preview(&mut tx, user.id, input.token)
        .await?
        .ok_or(AppError::NotFound)?;
    if preview.expired {
        return Err(AppError::Gone {
            slug: "import-expired",
            detail: "The preview expired; upload the workbook again.".into(),
        });
    }
    let parsed = preview.payload.0;
    if !parsed.errors.is_empty() && !input.skip_errors {
        return Err(AppError::rule(
            "import-has-errors",
            "Fix the cells listed in the preview and upload the workbook again.",
        ));
    }
    domain::check_opening_date(&parsed, input.opening_date)?;
    let patch = UpdateSettings {
        opening_balance: Some(input.opening_balance),
        opening_date: Some(input.opening_date),
        ..UpdateSettings::default()
    };
    let next = settings::domain::apply(settings::repo::find(&mut tx, user.id).await?, patch)?;
    settings::repo::update(&mut tx, user.id, &next).await?;
    let mut category_ids = Vec::new();
    for (name, kind) in domain::CATEGORIES {
        // ponytail: looked up then inserted; a concurrent import of the same user gets a 409.
        let id = match categories::repo::find_id_by_name(&mut tx, user.id, name, kind).await? {
            Some(id) => id,
            None => {
                let taken = categories::repo::top_colors(&mut tx, user.id, kind, None).await?;
                let color = categories::domain::pick_color(None, &taken)?;
                let new = categories::repo::NewCategory {
                    name,
                    kind,
                    icon: "file-spreadsheet",
                    color: &color,
                    parent_id: None,
                    target: None,
                    deadline: None,
                };
                categories::repo::insert(&mut tx, user.id, new).await?.id
            }
        };
        category_ids.push((kind, id));
    }
    let category_id = |kind| {
        category_ids
            .iter()
            .find_map(|(each, id)| (*each == kind).then_some(*id))
            .unwrap_or_default()
    };
    let years: Vec<i16> = parsed.years.iter().map(|year| year.year).collect();
    repo::delete_imported(&mut tx, user.id, &years).await?;
    let transactions =
        repo::insert_rows(&mut tx, user.id, input.token, &parsed.years, category_id).await?;
    repo::delete_preview(&mut tx, user.id, input.token).await?;
    onboarding::repo::mark_onboarded(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok(ImportResult {
        transactions: transactions as u32,
        years,
        skipped: parsed
            .errors
            .into_iter()
            .map(|error| SkippedCell {
                sheet: error.sheet,
                cell: error.cell,
            })
            .collect(),
    })
}
