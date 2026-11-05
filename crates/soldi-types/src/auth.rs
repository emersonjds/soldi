use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SignUp {
    pub email: String,
    /// 8 to 128 characters.
    pub password: String,
    /// Defaults to the part of the e-mail before `@`.
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SignIn {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    /// False until `POST /api/onboarding` runs; the web shows onboarding while it is false.
    pub onboarded: bool,
    /// False until `POST /api/me/tour-seen` runs; the web shows the welcome tour after onboarding while it is false.
    pub tour_seen: bool,
}
