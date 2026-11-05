pub mod auth;
pub mod bills;
pub mod categories;
pub mod onboarding;
pub mod settings;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Text-backed enums bind as the built-in `text` OID. A derived `sqlx::Type` names the type
/// instead, and sqlx then looks the OID up once per pooled connection.
#[cfg(feature = "sqlx")]
macro_rules! text_type {
    ($($name:ty),*) => {$(
        impl sqlx::Type<sqlx::Postgres> for $name {
            fn type_info() -> sqlx::postgres::PgTypeInfo {
                <String as sqlx::Type<sqlx::Postgres>>::type_info()
            }

            fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
                <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
            }
        }
    )*};
}

#[cfg(feature = "sqlx")]
text_type!(categories::CategoryKind);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Health {
    pub status: String,
    pub version: String,
}

/// RFC 9457 problem details, the body of every error response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Problem {
    #[serde(rename = "type")]
    pub problem_type: String,
    pub title: String,
    pub status: u16,
    pub detail: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<FieldError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

/// For PATCH bodies: a missing field deserializes to `None`, an explicit `null` to `Some(None)`.
/// Use with `#[serde(default, deserialize_with = "crate::nullable_field")]`.
pub fn nullable_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
