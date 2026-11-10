use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use axum::http::header::{COOKIE, HOST, ORIGIN};
use axum::http::{HeaderMap, Method};
use sha2::{Digest, Sha256};

use crate::error::{AppError, reject_nul};

/// D6. Over plain HTTP (local development) browsers may refuse a `Secure` cookie, so the
/// session rides in `soldi_session` there.
pub const SESSION_COOKIE: &str = "__Host-soldi_session";
pub const PLAIN_SESSION_COOKIE: &str = "soldi_session";
pub const SESSION_DAYS: i64 = 30;

/// Argon2 default parameters with a password nobody knows. Sign-in verifies against it when the
/// e-mail is unknown, so both failures cost the same time.
const DUMMY_PASSWORD_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$LQzD6bTFuUbWQ35+CFbKXw$7x8VZQkRMrI/ptiG/Um0Ural4C1PMr9El05qYAXieyU";

pub fn normalize_email(email: &str) -> Result<String, AppError> {
    reject_nul("email", email)?;
    let email = email.trim().to_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AppError::invalid("email", "must be an email address"));
    };
    let mut labels = domain.split('.');
    let valid = !local.is_empty()
        && email.len() <= 254
        && !domain.contains('@')
        && !email.chars().any(char::is_whitespace)
        && labels.clone().count() >= 2
        && labels.all(|label| !label.is_empty());
    if !valid {
        return Err(AppError::invalid("email", "must be an email address"));
    }
    Ok(email)
}

pub fn check_password(password: &str) -> Result<(), AppError> {
    if !(8..=128).contains(&password.chars().count()) {
        return Err(AppError::invalid(
            "password",
            "must have 8 to 128 characters",
        ));
    }
    Ok(())
}

pub fn check_name(name: &str) -> Result<String, AppError> {
    reject_nul("name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::invalid("name", "must have 1 to 60 characters"));
    }
    Ok(name.to_string())
}

pub fn wrong_password() -> AppError {
    AppError::rule("wrong-password", "The current password is wrong.")
}

/// The given name trimmed, or the part of the (normalized) e-mail before `@` when blank.
pub fn display_name(name: Option<&str>, email: &str) -> Result<String, AppError> {
    let name = name.map(str::trim).filter(|name| !name.is_empty());
    let Some(name) = name else {
        let local = email.split('@').next().unwrap_or(email);
        return Ok(local.chars().take(100).collect());
    };
    reject_nul("name", name)?;
    if name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

/// 32 random bytes as lowercase hex.
pub fn new_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the operating system random source works");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::Internal(error.to_string()))
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    Argon2::default()
        .verify_password(password.as_bytes(), stored_hash)
        .is_ok()
}

pub fn dummy_password_hash() -> String {
    DUMMY_PASSWORD_HASH.to_string()
}

/// Railway's edge terminates TLS and says so in `X-Forwarded-Proto`.
pub fn is_https(headers: &HeaderMap) -> bool {
    header_text(headers, "x-forwarded-proto")
        .is_some_and(|proto| proto.eq_ignore_ascii_case("https"))
}

/// `__Host-soldi_session` first; `soldi_session` only when the request is not HTTPS.
pub fn session_token(headers: &HeaderMap) -> Option<&str> {
    cookie(headers, SESSION_COOKIE)
        .or_else(|| cookie(headers, PLAIN_SESSION_COOKIE).filter(|_| !is_https(headers)))
}

fn cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .find_map(|pair| pair.trim().strip_prefix(name)?.strip_prefix('='))
}

pub fn session_cookie(token: &str, https: bool) -> String {
    let max_age = SESSION_DAYS * 24 * 60 * 60;
    cookie_line(token, https, max_age)
}

pub fn expired_session_cookie(https: bool) -> String {
    cookie_line("", https, 0)
}

fn cookie_line(value: &str, https: bool, max_age: i64) -> String {
    let (name, secure) = match https {
        true => (SESSION_COOKIE, "; Secure"),
        false => (PLAIN_SESSION_COOKIE, ""),
    };
    format!("{name}={value}; HttpOnly{secure}; SameSite=Lax; Path=/; Max-Age={max_age}")
}

/// A browser write must come from our own origin; requests with neither `Sec-Fetch-Site` nor
/// `Origin` (curl, tests) pass. `authority` is the request URI authority, the host on HTTP/2.
pub fn is_cross_site_write(method: &Method, headers: &HeaderMap, authority: Option<&str>) -> bool {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return false;
    }
    if let Some(site) = header_text(headers, "sec-fetch-site") {
        return !matches!(site, "same-origin" | "none");
    }
    let Some(origin) = header_text(headers, ORIGIN) else {
        return false;
    };
    let origin_host = origin.split_once("://").map(|(_, host)| host);
    match (origin_host, header_text(headers, HOST).or(authority)) {
        (Some(origin_host), Some(host)) => origin_host != host,
        _ => true,
    }
}

fn header_text(headers: &HeaderMap, name: impl axum::http::header::AsHeaderName) -> Option<&str> {
    headers.get(name)?.to_str().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, Method, header};

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.append(*name, HeaderValue::from_static(value));
        }
        headers
    }

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(
            normalize_email("  Ana@Example.COM ").unwrap(),
            "ana@example.com"
        );
    }

    #[test]
    fn email_needs_one_at_no_spaces_and_a_dotted_domain() {
        for email in [
            "ana.example.com",
            "ana@localhost",
            "@example.com",
            "a@b@c.com",
            "a b@x.y",
            "a@b.",
            "a@.b",
            "a@b..c",
            "a\0@b.c",
        ] {
            assert!(normalize_email(email).is_err(), "{email:?}");
        }
        assert!(normalize_email(&format!("{}@example.com", "a".repeat(250))).is_err());
        assert_eq!(normalize_email("a.b@mail.x.io").unwrap(), "a.b@mail.x.io");
    }

    #[test]
    fn password_has_8_to_128_characters() {
        assert!(check_password("1234567").is_err());
        assert!(check_password("12345678").is_ok());
        assert!(check_password(&"x".repeat(128)).is_ok());
        assert!(check_password(&"x".repeat(129)).is_err());
        assert!(check_password("ááááááá").is_err());
    }

    #[test]
    fn name_is_trimmed_or_taken_from_the_email() {
        assert_eq!(display_name(Some("  Ana "), "x@y.z").unwrap(), "Ana");
        assert_eq!(display_name(None, "ana.souza@y.z").unwrap(), "ana.souza");
        assert_eq!(display_name(Some("   "), "bia@y.z").unwrap(), "bia");
        assert!(display_name(Some(&"x".repeat(101)), "x@y.z").is_err());
        assert!(display_name(Some("a\0"), "x@y.z").is_err());
        let long_local = format!("{}@y.z", "a".repeat(150));
        assert_eq!(
            display_name(None, &long_local).unwrap().chars().count(),
            100
        );
    }

    #[test]
    fn a_new_name_is_trimmed_with_1_to_60_characters() {
        assert_eq!(check_name("  Ana Souza ").unwrap(), "Ana Souza");
        assert_eq!(check_name(&"á".repeat(60)).unwrap(), "á".repeat(60));
        assert!(check_name("   ").is_err());
        assert!(check_name(&"x".repeat(61)).is_err());
        assert!(check_name("a\0").is_err());
    }

    #[test]
    fn secrets_are_64_hex_chars_and_unique() {
        let first = new_secret();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
        assert_ne!(first, new_secret());
    }

    #[test]
    fn token_hash_is_a_stable_sha256() {
        assert_eq!(hash_token("abc"), hash_token("abc"));
        assert_eq!(hash_token("abc").len(), 32);
        assert_ne!(hash_token("abc"), hash_token("abd"));
    }

    #[test]
    fn password_hash_verifies_only_the_same_password() {
        let hash = hash_password("correct horse").unwrap();
        assert!(!hash.contains("correct horse"));
        assert!(verify_password("correct horse", &hash));
        assert!(!verify_password("wrong horse", &hash));
        assert!(!verify_password("correct horse", "not-a-hash"));
    }

    #[test]
    fn dummy_hash_costs_the_same_and_matches_nothing() {
        let same_cost = "$argon2id$v=19$m=19456,t=2,p=1$";
        assert!(hash_password("anything").unwrap().starts_with(same_cost));
        assert!(dummy_password_hash().starts_with(same_cost));
        assert!(!verify_password("correct horse", &dummy_password_hash()));
    }

    #[test]
    fn https_comes_from_the_forwarded_proto() {
        assert!(is_https(&headers(&[("x-forwarded-proto", "https")])));
        assert!(is_https(&headers(&[("x-forwarded-proto", "HTTPS")])));
        assert!(!is_https(&headers(&[("x-forwarded-proto", "http")])));
        assert!(!is_https(&HeaderMap::new()));
    }

    #[test]
    fn the_session_cookie_depends_on_the_scheme() {
        let secure = session_cookie("abc", true);
        assert!(secure.starts_with("__Host-soldi_session=abc;"));
        assert!(secure.contains("; Secure"));
        assert!(secure.contains("HttpOnly"));
        assert!(secure.contains("SameSite=Lax"));
        assert!(secure.contains("Path=/"));
        assert!(secure.contains("Max-Age=2592000"));
        let plain = session_cookie("abc", false);
        assert!(plain.starts_with("soldi_session=abc;"));
        assert!(!plain.contains("Secure"));
        assert!(expired_session_cookie(true).starts_with("__Host-soldi_session=;"));
        assert!(expired_session_cookie(false).contains("Max-Age=0"));
    }

    #[test]
    fn the_host_cookie_wins_and_the_plain_one_counts_only_over_http() {
        let both = headers(&[(
            "cookie",
            "theme=dark; soldi_session=plain; __Host-soldi_session=host",
        )]);
        assert_eq!(session_token(&both), Some("host"));
        let plain = headers(&[("cookie", "soldi_session=plain")]);
        assert_eq!(session_token(&plain), Some("plain"));
        let plain_over_https = headers(&[
            ("cookie", "soldi_session=plain"),
            ("x-forwarded-proto", "https"),
        ]);
        assert_eq!(session_token(&plain_over_https), None);
        let split = headers(&[("cookie", "a=1"), ("cookie", "__Host-soldi_session=x")]);
        assert_eq!(session_token(&split), Some("x"));
        assert_eq!(session_token(&HeaderMap::new()), None);
    }

    #[test]
    fn cross_site_writes_are_detected() {
        let cross_site = headers(&[("sec-fetch-site", "cross-site")]);
        let same_site = headers(&[("sec-fetch-site", "same-site")]);
        let other_origin = headers(&[("origin", "https://evil.example"), ("host", "soldi.app")]);
        let null_origin = headers(&[("origin", "null"), ("host", "soldi.app")]);
        let origin_without_host = headers(&[("origin", "https://soldi.app")]);

        assert!(is_cross_site_write(&Method::POST, &cross_site, None));
        assert!(is_cross_site_write(&Method::POST, &same_site, None));
        assert!(is_cross_site_write(&Method::DELETE, &other_origin, None));
        assert!(is_cross_site_write(&Method::POST, &null_origin, None));
        assert!(is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            None
        ));
        assert!(is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            Some("evil.example")
        ));
        assert!(!is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            Some("soldi.app")
        ));
    }

    #[test]
    fn same_origin_reads_and_non_browser_writes_pass() {
        let cross_site = headers(&[("sec-fetch-site", "cross-site")]);
        let same_origin = headers(&[("sec-fetch-site", "same-origin")]);
        let typed_url = headers(&[("sec-fetch-site", "none")]);
        let matching_origin = headers(&[
            (header::ORIGIN.as_str(), "https://soldi.app"),
            ("host", "soldi.app"),
        ]);

        assert!(!is_cross_site_write(&Method::GET, &cross_site, None));
        assert!(!is_cross_site_write(&Method::POST, &same_origin, None));
        assert!(!is_cross_site_write(&Method::POST, &typed_url, None));
        assert!(!is_cross_site_write(&Method::POST, &matching_origin, None));
        assert!(!is_cross_site_write(&Method::POST, &HeaderMap::new(), None));
    }
}
