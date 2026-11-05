use axum::Json;
use axum::extract::multipart::{Multipart, MultipartRejection};
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use soldi_types::Problem;
use soldi_types::imports::{ImportPreview, XlsxUpload};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::domain::MAX_FILE_BYTES;
use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::CurrentUser;

/// Room for the multipart framing around a 5 MB file; past it the body is cut.
const MAX_BODY_BYTES: usize = MAX_FILE_BYTES + 64 * 1024;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(preview_xlsx))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

async fn read_file(upload: Result<Multipart, MultipartRejection>) -> Result<Vec<u8>, AppError> {
    let unreadable = |error: axum::extract::multipart::MultipartError| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            return AppError::TooLarge;
        }
        AppError::invalid("file", "the upload could not be read")
    };
    let mut multipart = upload?;
    while let Some(field) = multipart.next_field().await.map_err(unreadable)? {
        if field.name() == Some("file") {
            return Ok(field.bytes().await.map_err(unreadable)?.to_vec());
        }
    }
    Err(AppError::invalid("file", "attach the workbook as `file`"))
}

#[utoipa::path(post, path = "/api/imports/xlsx", tag = "imports",
    request_body(content = XlsxUpload, content_type = "multipart/form-data"),
    responses(
        (status = 200, body = ImportPreview, description = "Rows and saved months found per year, with the cells that could not be read; only the preview is stored, for 15 minutes"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 413, body = Problem, content_type = "application/problem+json", description = "`too-large`: the file is over 5 MB"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "No `file` part, or not an .xlsx workbook")))]
pub async fn preview_xlsx(
    State(state): State<AppState>,
    user: CurrentUser,
    upload: Result<Multipart, MultipartRejection>,
) -> Result<Json<ImportPreview>, AppError> {
    let file = read_file(upload).await?;
    Ok(Json(service::preview(&state.pool, &user, file).await?))
}
