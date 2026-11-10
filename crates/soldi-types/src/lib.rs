pub mod auth;
pub mod bills;
pub mod categories;
pub mod cofrinhos;
pub mod months;
pub mod onboarding;
pub mod reports;
pub mod settings;
pub mod transactions;

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
text_type!(categories::CategoryKind, settings::Currency);

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

/// Money leaves as a string with two places, `"0.00"` included: PostgreSQL hands zero back
/// without its scale. Use with `#[serde(serialize_with = "crate::money")]`.
pub fn money<S: serde::Serializer>(
    value: &rust_decimal::Decimal,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_str(&format_args!("{value:.2}"))
}

/// [`money`] for an optional amount; `None` stays null.
pub fn optional_money<S: serde::Serializer>(
    value: &Option<rust_decimal::Decimal>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match value {
        Some(value) => money(value, serializer),
        None => serializer.serialize_none(),
    }
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

/// [`nullable_field`] for a decimal string, like the `str_option` amounts.
pub fn nullable_money<'de, D>(
    deserializer: D,
) -> Result<Option<Option<rust_decimal::Decimal>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    rust_decimal::serde::str_option::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    #[derive(serde::Serialize)]
    struct Amount(#[serde(serialize_with = "crate::money")] rust_decimal::Decimal);

    #[test]
    fn money_always_has_two_places() {
        for (value, text) in [
            ("0", "\"0.00\""),
            ("-120.5", "\"-120.50\""),
            ("7.25", "\"7.25\""),
        ] {
            let amount = Amount(value.parse().unwrap());
            assert_eq!(serde_json::to_string(&amount).unwrap(), text);
        }
    }
}
