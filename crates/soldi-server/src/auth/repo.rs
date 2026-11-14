use chrono::{DateTime, Utc};
use soldi_types::auth::User;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::extract::CurrentUser;

pub struct UserWithHash {
    pub user: User,
    pub password_hash: Option<String>,
}

pub async fn insert_user(
    conn: &mut PgConnection,
    email: &str,
    name: &str,
    password_hash: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"INSERT INTO users (email, name, password_hash) VALUES ($1::text, $2, $3)
           RETURNING id, email::text AS "email!", name, onboarded_at IS NOT NULL AS "onboarded!", tour_seen_at IS NOT NULL AS "tour_seen!", email_verified_at IS NOT NULL AS "email_verified!""#,
        email,
        name,
        password_hash
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_user_by_email(
    conn: &mut PgConnection,
    email: &str,
) -> Result<Option<UserWithHash>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT id, email::text AS "email!", name, onboarded_at IS NOT NULL AS "onboarded!", tour_seen_at IS NOT NULL AS "tour_seen!", email_verified_at IS NOT NULL AS "email_verified!", password_hash
           FROM users WHERE email = $1::text::citext"#,
        email
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.map(|row| UserWithHash {
        user: User {
            id: row.id,
            email: row.email,
            name: row.name,
            onboarded: row.onboarded,
            tour_seen: row.tour_seen,
            email_verified: row.email_verified,
        },
        password_hash: row.password_hash,
    }))
}

pub async fn find_user(conn: &mut PgConnection, user_id: Uuid) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"SELECT id, email::text AS "email!", name, onboarded_at IS NOT NULL AS "onboarded!", tour_seen_at IS NOT NULL AS "tour_seen!", email_verified_at IS NOT NULL AS "email_verified!" FROM users WHERE id = $1"#,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Keeps the first time; a second call changes nothing.
pub async fn mark_tour_seen(conn: &mut PgConnection, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE users SET tour_seen_at = now(), updated_at = now() WHERE id = $1 AND tour_seen_at IS NULL",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn update_name(
    conn: &mut PgConnection,
    user_id: Uuid,
    name: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"UPDATE users SET name = $2, updated_at = now() WHERE id = $1
           RETURNING id, email::text AS "email!", name, onboarded_at IS NOT NULL AS "onboarded!", tour_seen_at IS NOT NULL AS "tour_seen!", email_verified_at IS NOT NULL AS "email_verified!""#,
        user_id,
        name
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_password_hash(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!("SELECT password_hash FROM users WHERE id = $1", user_id)
        .fetch_one(&mut *conn)
        .await
}

/// False when the stored hash is no longer `checked`: another change got there first.
pub async fn update_password_hash(
    conn: &mut PgConnection,
    user_id: Uuid,
    checked: Option<&str>,
    password_hash: &str,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE users SET password_hash = $2, updated_at = now()
         WHERE id = $1 AND password_hash IS NOT DISTINCT FROM $3",
        user_id,
        password_hash,
        checked
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Every row of the user goes with it (FK cascades). False when the stored hash is no
/// longer `checked`.
pub async fn delete_user(
    conn: &mut PgConnection,
    user_id: Uuid,
    checked: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query!(
        "DELETE FROM users WHERE id = $1 AND password_hash IS NOT DISTINCT FROM $2",
        user_id,
        checked
    )
    .execute(&mut *conn)
    .await?;
    Ok(deleted.rows_affected() == 1)
}

/// For a password reset, where no current password is checked.
pub async fn set_password_hash(
    conn: &mut PgConnection,
    user_id: Uuid,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1",
        user_id,
        password_hash
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Expires in one hour.
pub async fn insert_password_reset(
    conn: &mut PgConnection,
    user_id: Uuid,
    token_hash: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO password_resets (user_id, token_hash) VALUES ($1, $2)",
        user_id,
        token_hash
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Serializes link requests of one user until the transaction ends, so only one link stays live.
pub async fn lock_password_resets(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "SELECT pg_advisory_xact_lock(hashtext('password_resets:' || $1::text))",
        user_id.to_string()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// A live link of the user issued in the last 15 minutes.
pub async fn has_recent_password_reset(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM password_resets WHERE user_id = $1 AND expires_at > now()
           AND created_at > now() - interval '15 minutes') AS "recent!""#,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Cheap check before the argon2 hash; `take_password_reset` still decides in the transaction.
pub async fn password_reset_is_live(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<bool, sqlx::Error> {
    let live = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM password_resets WHERE token_hash = $1 AND expires_at > now()) AS "live!""#,
        token_hash
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(live)
}

pub async fn delete_password_resets(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM password_resets WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Spends a live reset link; the owner's id, or `None` for an unknown, expired or used one.
pub async fn take_password_reset(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "DELETE FROM password_resets WHERE token_hash = $1 AND expires_at > now() RETURNING user_id",
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn email_verified(conn: &mut PgConnection, user_id: Uuid) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT email_verified_at IS NOT NULL AS "verified!" FROM users WHERE id = $1"#,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Keeps the first time; a second confirmation changes nothing.
pub async fn mark_email_verified(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
         WHERE id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Serializes link requests of one user until the transaction ends, so only one link stays live.
pub async fn lock_email_verifications(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "SELECT pg_advisory_xact_lock(hashtext('email_verifications:' || $1::text))",
        user_id.to_string()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_email_verifications(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM email_verifications WHERE user_id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Expires in 24 hours.
pub async fn insert_email_verification(
    conn: &mut PgConnection,
    user_id: Uuid,
    token_hash: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO email_verifications (user_id, token_hash) VALUES ($1, $2)",
        user_id,
        token_hash
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Spends a live verification link; the owner's id, or `None` for an unknown, expired or used one.
pub async fn take_email_verification(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "DELETE FROM email_verifications WHERE token_hash = $1 AND expires_at > now() RETURNING user_id",
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Keeps the user's 20 newest devices.
pub async fn insert_trusted_device(
    conn: &mut PgConnection,
    user_id: Uuid,
    token_hash: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO trusted_devices (user_id, token_hash) VALUES ($1, $2)",
        user_id,
        token_hash
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM trusted_devices WHERE user_id = $1 AND id NOT IN (
             SELECT id FROM trusted_devices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20)",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The device belongs to the account with this e-mail and is younger than `DEVICE_DAYS`.
pub async fn device_is_trusted(
    conn: &mut PgConnection,
    email: &str,
    token_hash: &[u8],
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (
             SELECT 1 FROM trusted_devices d JOIN users u ON u.id = d.user_id
             WHERE d.token_hash = $1 AND u.email = $2::text::citext
               AND d.created_at > now() - make_interval(days => $3)) AS "trusted!""#,
        token_hash,
        email,
        super::domain::DEVICE_DAYS
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn delete_trusted_devices(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM trusted_devices WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn insert_session(
    conn: &mut PgConnection,
    user_id: Uuid,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token_hash,
        expires_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_expired_sessions(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_session(
    conn: &mut PgConnection,
    user: &CurrentUser,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM sessions WHERE id = $1 AND user_id = $2",
        user.session_id,
        user.id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Every session of the user except the one that made the request.
pub async fn delete_other_sessions(
    conn: &mut PgConnection,
    user: &CurrentUser,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM sessions WHERE user_id = $1 AND id <> $2",
        user.id,
        user.session_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_all_sessions(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM sessions WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// A live session's `last_seen_at` is refreshed in the same statement, at most every 10 minutes.
pub async fn find_by_token(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<CurrentUser>, sqlx::Error> {
    sqlx::query_as!(
        CurrentUser,
        r#"WITH found AS (
             SELECT id, user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()),
           touched AS (
             UPDATE sessions s SET last_seen_at = now(), updated_at = now() FROM found
             WHERE s.id = found.id AND s.last_seen_at < now() - interval '10 minutes')
           SELECT user_id AS "id!", id AS "session_id!" FROM found"#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use sqlx::PgPool;

    #[sqlx::test]
    async fn email_lookup_ignores_case(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let user = insert_user(&mut conn, "ana@example.com", "Ana", "hash")
            .await
            .unwrap();

        let found = find_user_by_email(&mut conn, "ANA@Example.com")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(found.user, user);
        assert_eq!(found.password_hash.as_deref(), Some("hash"));
        assert!(
            find_user_by_email(&mut conn, "bia@example.com")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[sqlx::test]
    async fn a_device_is_trusted_only_for_its_owners_email_and_twenty_per_user(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let ana = insert_user(&mut conn, "ana@example.com", "Ana", "hash")
            .await
            .unwrap();
        let bia = insert_user(&mut conn, "bia@example.com", "Bia", "hash")
            .await
            .unwrap();
        insert_trusted_device(&mut conn, bia.id, b"bia")
            .await
            .unwrap();
        for device in 0..=20u8 {
            insert_trusted_device(&mut conn, ana.id, &[device])
                .await
                .unwrap();
        }
        let trusted = async |conn: &mut PgConnection, email: &str, token: &[u8]| {
            device_is_trusted(conn, email, token).await.unwrap()
        };

        assert!(trusted(&mut conn, "ANA@example.com", &[20]).await);
        assert!(trusted(&mut conn, "ana@example.com", &[1]).await);
        assert!(!trusted(&mut conn, "ana@example.com", &[0]).await);
        assert!(!trusted(&mut conn, "ana@example.com", b"bia").await);
        assert!(!trusted(&mut conn, "bia@example.com", &[20]).await);
        assert!(!trusted(&mut conn, "nobody@example.com", b"bia").await);
        assert!(trusted(&mut conn, "bia@example.com", b"bia").await);
        sqlx::query!(
            "UPDATE trusted_devices SET created_at = now() - interval '180 days' WHERE token_hash = $1",
            &[1u8][..]
        )
        .execute(&mut *conn)
        .await
        .unwrap();
        assert!(!trusted(&mut conn, "ana@example.com", &[1]).await);

        delete_trusted_devices(&mut conn, ana.id).await.unwrap();
        assert!(!trusted(&mut conn, "ana@example.com", &[20]).await);
        assert!(trusted(&mut conn, "bia@example.com", b"bia").await);
    }

    #[sqlx::test]
    async fn an_expired_session_finds_nobody_and_is_purged_at_sign_in(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let user = insert_user(&mut conn, "ana@example.com", "Ana", "hash")
            .await
            .unwrap();
        insert_session(&mut conn, user.id, b"old", Utc::now() - Duration::days(1))
            .await
            .unwrap();
        insert_session(&mut conn, user.id, b"new", Utc::now() + Duration::days(1))
            .await
            .unwrap();

        assert!(find_by_token(&mut conn, b"old").await.unwrap().is_none());
        let current = find_by_token(&mut conn, b"new").await.unwrap().unwrap();
        assert_eq!(current.id, user.id);

        delete_expired_sessions(&mut conn, user.id).await.unwrap();
        let left = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM sessions")
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        assert_eq!(left, 1);
    }
}
