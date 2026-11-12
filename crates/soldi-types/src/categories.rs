use chrono::NaiveDate;
use rust_decimal::Decimal;
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

/// `icon` is a lucide icon name; `color` a palette token, `cat-1` to `cat-24`, unique among the
/// active top-level categories showing in a kind (their own or a subcategory's) and the parent's on
/// a subcategory; `parent_id` the
/// category this one is a subcategory of, null for a top-level one. `is_savings` marks the
/// user's `Economia` (bill) and `Resgate` (income); `target` and `deadline` belong only to
/// cofrinhos, the subcategories of `Economia`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub kind: CategoryKind,
    pub icon: String,
    pub color: String,
    pub parent_id: Option<Uuid>,
    pub is_savings: bool,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub target: Option<Decimal>,
    pub deadline: Option<NaiveDate>,
}

/// `icon` defaults to `circle-dashed`; `color`, `cat-1` to `cat-24`, to the lowest token free in
/// the kind. `parent_id` makes it a subcategory of one of the caller's active top-level categories
/// on the same side: income under income, `daily` or `bill` under either outflow kind, only `bill`
/// under `Economia`. For a subcategory `color` is validated, then ignored: it wears its parent's
/// color; a parent whose color is taken in the child's kind moves to the lowest token free in every
/// kind it shows in, or keeps it when none is.
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
    /// Greater than zero; only for a subcategory of `Economia`.
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub target: Option<Decimal>,
    /// Only for a subcategory of `Economia`.
    #[serde(default)]
    pub deadline: Option<NaiveDate>,
    /// Up to 140 characters, trimmed; blank means none. Only for a subcategory of `Economia`.
    #[serde(default)]
    pub note: Option<String>,
}

/// Absent fields stay as they are; `kind`, `daily` or `bill`, moves this category alone, top-level
/// or subcategory, with all its entries to that kind; its subcategories keep theirs (D27). A
/// top-level keeps its color when free in every kind it then shows in, else takes the lowest free
/// one; a subcategory's group may recolor the same way. The savings categories, cofrinhos and
/// income ones never change kind. `"parent_id": null` makes it top-level, with `color` or the
/// lowest token free in the kind. For a subcategory `color` is validated, then ignored: it wears
/// its parent's; a parent's new color reaches its subcategories. A move under a group can recolor
/// that group and its subcategories to a color free in every kind it shows in. `null` clears
/// `target`, `deadline` or `note`, which only a subcategory of `Economia` may set; a blank `note`
/// clears it too. Leaving `Economia` clears all three.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCategory {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub kind: Option<CategoryKind>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<Uuid>, nullable)]
    pub parent_id: Option<Option<Uuid>>,
    #[serde(default, deserialize_with = "crate::nullable_money")]
    #[schema(value_type = Option<String>, nullable)]
    pub target: Option<Option<Decimal>>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<NaiveDate>, nullable)]
    pub deadline: Option<Option<NaiveDate>>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<String>, nullable)]
    pub note: Option<Option<String>>,
}
