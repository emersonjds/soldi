use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum CategoryKind {
    Income,
    Bill,
    Daily,
}

impl CategoryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            CategoryKind::Income => "income",
            CategoryKind::Bill => "bill",
            CategoryKind::Daily => "daily",
        }
    }
}

/// `icon` is a lucide icon name; `color` a palette token, `cat-1` to `cat-12`; `parent_id` the
/// category this one is a subcategory of, null for a top-level one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub kind: CategoryKind,
    pub icon: String,
    pub color: String,
    pub parent_id: Option<Uuid>,
}

/// `icon` defaults to `circle-dashed`; `color` to the next token for the kind. `parent_id` makes
/// it a subcategory of one of the caller's active top-level categories of the same kind.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCategory {
    pub name: String,
    pub kind: CategoryKind,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub parent_id: Option<Uuid>,
}

/// Absent fields stay as they are; the kind never changes; `"parent_id": null` makes it top-level.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCategory {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<Uuid>, nullable)]
    pub parent_id: Option<Option<Uuid>>,
}
