use soldi_types::bills::{Bill, CreateBill};
use sqlx::PgConnection;
use uuid::Uuid;

/// Unarchived bills by due day, then name; inactive ones only with `include_inactive`.
pub async fn list(
    conn: &mut PgConnection,
    user_id: Uuid,
    include_inactive: bool,
) -> Result<Vec<Bill>, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "SELECT id, category_id, name, amount, due_day, active, closing_day FROM recurring_bills
         WHERE user_id = $1 AND (active OR $2) AND archived_at IS NULL
         ORDER BY due_day, lower(name), id",
        user_id,
        include_inactive
    )
    .fetch_all(&mut *conn)
    .await
}

/// An unarchived bill of the user.
pub async fn find(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Bill>, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "SELECT id, category_id, name, amount, due_day, active, closing_day FROM recurring_bills
         WHERE user_id = $1 AND id = $2 AND archived_at IS NULL",
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// A bill the user can pay: unarchived, or an archived card whose faturas still owe (D28).
pub async fn find_payable(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Bill>, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "SELECT id, category_id, name, amount, due_day, active, closing_day FROM recurring_bills
         WHERE user_id = $1 AND id = $2 AND (archived_at IS NULL OR closing_day IS NOT NULL)",
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// An unarchived card of the user (D28).
pub async fn find_card(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Bill>, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "SELECT id, category_id, name, amount, due_day, active, closing_day FROM recurring_bills
         WHERE user_id = $1 AND id = $2 AND archived_at IS NULL AND closing_day IS NOT NULL",
        user_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert(
    conn: &mut PgConnection,
    user_id: Uuid,
    bill: &CreateBill,
) -> Result<Bill, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "INSERT INTO recurring_bills (user_id, name, amount, due_day, category_id, closing_day)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, category_id, name, amount, due_day, active, closing_day",
        user_id,
        bill.name,
        bill.amount,
        bill.due_day,
        bill.category_id,
        bill.closing_day
    )
    .fetch_one(&mut *conn)
    .await
}

/// `Ok(None)` when the user has no unarchived bill with this id. D13: resuming a paused bill
/// moves `active_since` to the São Paulo today.
pub async fn update(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
    bill: &CreateBill,
    active: bool,
) -> Result<Option<Bill>, sqlx::Error> {
    sqlx::query_as!(
        Bill,
        "UPDATE recurring_bills
         SET name = $3, amount = $4, due_day = $5, category_id = $6, active = $7, closing_day = $8,
             active_since = CASE WHEN $7 AND NOT active
                                 THEN (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                 ELSE active_since END,
             updated_at = now()
         WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
         RETURNING id, category_id, name, amount, due_day, active, closing_day",
        user_id,
        id,
        bill.name,
        bill.amount,
        bill.due_day,
        bill.category_id,
        active,
        bill.closing_day
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Returns false when the user has no unarchived bill with this id.
pub async fn archive(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE recurring_bills SET archived_at = now(), updated_at = now()
         WHERE user_id = $1 AND id = $2 AND archived_at IS NULL",
        user_id,
        id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Which of `ids` are the user's active `bill` categories.
pub async fn bill_category_ids(
    conn: &mut PgConnection,
    user_id: Uuid,
    ids: &[Uuid],
) -> Result<Vec<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM categories
         WHERE user_id = $1 AND id = ANY($2) AND kind = 'bill' AND archived_at IS NULL",
        user_id,
        ids
    )
    .fetch_all(&mut *conn)
    .await
}

/// Whether the category is one of the user's `bill` categories, archived included.
pub async fn is_bill_category(
    conn: &mut PgConnection,
    user_id: Uuid,
    id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM categories
           WHERE user_id = $1 AND id = $2 AND kind = 'bill') AS "exists!""#,
        user_id,
        id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_all(
    conn: &mut PgConnection,
    user_id: Uuid,
    bills: &[CreateBill],
) -> Result<(), sqlx::Error> {
    let names: Vec<&str> = bills.iter().map(|bill| bill.name.as_str()).collect();
    let amounts: Vec<Option<rust_decimal::Decimal>> =
        bills.iter().map(|bill| bill.amount).collect();
    let due_days: Vec<i16> = bills.iter().map(|bill| bill.due_day).collect();
    let category_ids: Vec<Uuid> = bills.iter().map(|bill| bill.category_id).collect();
    let closing_days: Vec<Option<i16>> = bills.iter().map(|bill| bill.closing_day).collect();
    sqlx::query!(
        "INSERT INTO recurring_bills (user_id, name, amount, due_day, category_id, closing_day)
         SELECT $1, * FROM UNNEST($2::text[], $3::numeric[], $4::smallint[], $5::uuid[],
                                  $6::smallint[])",
        user_id,
        &names as &[&str],
        &amounts as &[Option<rust_decimal::Decimal>],
        &due_days,
        &category_ids,
        &closing_days as &[Option<i16>]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn user_with_categories(conn: &mut PgConnection, email: &str) -> Uuid {
        let user = crate::auth::repo::insert_user(conn, email, "Ana", "hash")
            .await
            .unwrap();
        crate::categories::repo::seed(conn, user.id, &crate::categories::domain::defaults())
            .await
            .unwrap();
        user.id
    }

    async fn category(conn: &mut PgConnection, user_id: Uuid, name: &str) -> Uuid {
        sqlx::query_scalar!(
            "SELECT id FROM categories WHERE user_id = $1 AND name = $2",
            user_id,
            name
        )
        .fetch_one(&mut *conn)
        .await
        .unwrap()
    }

    fn bill(name: &str, amount: &str, due_day: i16, category_id: Uuid) -> CreateBill {
        CreateBill {
            name: name.into(),
            amount: Some(amount.parse().unwrap()),
            due_day,
            category_id,
            closing_day: None,
        }
    }

    #[sqlx::test]
    async fn bills_are_listed_by_due_day_then_name_and_only_the_owners(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let ana = user_with_categories(&mut conn, "ana@example.com").await;
        let bia = user_with_categories(&mut conn, "bia@example.com").await;
        let rent = category(&mut conn, ana, "Aluguel").await;
        let light = category(&mut conn, ana, "Luz").await;
        insert_all(
            &mut conn,
            ana,
            &[
                bill("Luz", "120.5", 10, light),
                bill("Aluguel", "1500", 5, rent),
                bill("Água", "80", 10, light),
            ],
        )
        .await
        .unwrap();
        let theirs = category(&mut conn, bia, "Luz").await;
        insert_all(&mut conn, bia, &[bill("Luz", "99", 1, theirs)])
            .await
            .unwrap();

        let listed = list(&mut conn, ana, false).await.unwrap();

        let names: Vec<&str> = listed.iter().map(|bill| bill.name.as_str()).collect();
        assert_eq!(names, ["Aluguel", "Água", "Luz"]);
        assert_eq!(listed[2].amount, Some("120.50".parse().unwrap()));
        assert_eq!((listed[2].due_day, listed[2].category_id), (10, light));
        assert!(listed[2].active);
        assert_eq!(list(&mut conn, bia, false).await.unwrap().len(), 1);
    }

    #[sqlx::test]
    async fn archived_and_inactive_bills_leave_the_list(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let ana = user_with_categories(&mut conn, "ana@example.com").await;
        let light = category(&mut conn, ana, "Luz").await;
        insert_all(
            &mut conn,
            ana,
            &[
                bill("Luz", "1", 1, light),
                bill("Velha", "1", 1, light),
                bill("Pausada", "1", 1, light),
            ],
        )
        .await
        .unwrap();
        sqlx::query!("UPDATE recurring_bills SET archived_at = now() WHERE name = 'Velha'")
            .execute(&mut *conn)
            .await
            .unwrap();
        sqlx::query!("UPDATE recurring_bills SET active = false WHERE name = 'Pausada'")
            .execute(&mut *conn)
            .await
            .unwrap();

        let listed = list(&mut conn, ana, false).await.unwrap();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Luz");
    }

    #[sqlx::test]
    async fn only_own_active_bill_categories_qualify(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let ana = user_with_categories(&mut conn, "ana@example.com").await;
        let bia = user_with_categories(&mut conn, "bia@example.com").await;
        let light = category(&mut conn, ana, "Luz").await;
        let rent = category(&mut conn, ana, "Aluguel").await;
        let market = category(&mut conn, ana, "Mercado").await;
        let theirs = category(&mut conn, bia, "Luz").await;
        crate::categories::repo::archive(&mut conn, ana, rent)
            .await
            .unwrap();

        let found = bill_category_ids(&mut conn, ana, &[light, rent, market, theirs])
            .await
            .unwrap();

        assert_eq!(found, [light]);
    }
}
