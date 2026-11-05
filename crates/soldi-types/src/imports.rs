use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// A cell the importer could not read; `cell` is in A1 notation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportError {
    pub sheet: String,
    pub cell: String,
    pub message: String,
}

/// What the confirmation would write for one year; totals are of the transactions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportYear {
    pub year: i16,
    pub transactions: u32,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub income_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub bills_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub daily_total: Decimal,
    pub savings_months: u32,
}

/// `token` confirms this preview for 15 minutes; a preview with errors cannot be confirmed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportPreview {
    pub years: Vec<ImportYear>,
    pub errors: Vec<ImportError>,
    pub token: Uuid,
}

/// `multipart/form-data` body of the preview.
#[derive(ToSchema)]
pub struct XlsxUpload {
    /// The Termômetro workbook, at most 5 MB.
    #[schema(value_type = String, format = Binary)]
    pub file: Vec<u8>,
}
