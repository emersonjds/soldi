use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A cell the importer could not read; `cell` is in A1 notation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportError {
    pub sheet: String,
    pub cell: String,
    pub message: String,
}
