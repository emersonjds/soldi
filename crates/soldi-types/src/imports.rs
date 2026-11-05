use chrono::NaiveDate;
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

/// Replaces what an earlier import wrote for the same years; entries made by hand stay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ConfirmImport {
    /// The preview's token.
    pub token: Uuid,
    /// The balance before the first imported day; may be negative.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub opening_balance: Decimal,
    /// On or before the earliest imported date.
    pub opening_date: NaiveDate,
    /// Confirms a preview with errors, leaving out the cells it lists.
    #[serde(default)]
    pub skip_errors: bool,
}

/// A cell left out because the preview could not read it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SkippedCell {
    pub sheet: String,
    pub cell: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportResult {
    pub transactions: u32,
    pub years: Vec<i16>,
    pub skipped: Vec<SkippedCell>,
}
