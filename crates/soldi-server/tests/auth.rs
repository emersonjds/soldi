mod common;

use axum::http::{Method, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn sign_up_then_me_then_sign_out_ends_the_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let body = json!({ "email": " Ana@Example.com ", "password": PASSWORD });

    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-up",
            None,
            Some(body),
        ))
        .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(set_cookie.starts_with("soldi_session="), "{set_cookie}");
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));
    let user = TestApp {
        router: app.router.clone(),
        cookie: Some(session_cookie(&response)),
    };
    let created = body_json(response).await;
    assert_eq!(created["email"], "ana@example.com");
    assert_eq!(created["name"], "ana");
    assert_eq!(created["onboarded"], false);

    let (status, me) = user.get("/api/auth/me").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me, created);

    let response = user
        .send(json_request(
            Method::POST,
            "/api/auth/sign-out",
            user.cookie.as_deref(),
            None,
        ))
        .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let cleared = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cleared.contains("Max-Age=0"), "{cleared}");

    let (status, problem) = user.get("/api/auth/me").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(problem["type"], "urn:soldi:error:unauthorized");
}

#[sqlx::test]
async fn sign_up_keeps_a_given_name(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, user) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "bia@example.com", "password": PASSWORD, "name": "  Bia Souza " }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(user["name"], "Bia Souza");
}

#[sqlx::test]
async fn sign_up_refuses_bad_input_and_taken_emails(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "not-an-email", "password": PASSWORD }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "email");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "bia@example.com", "password": "short" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "ANA@example.com", "password": PASSWORD }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:soldi:error:email-taken");

    let (status, problem) = app
        .post(
            "/api/auth/sign-up",
            json!({ "email": "c@example.com", "password": PASSWORD, "role": "admin" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "role");
}

#[sqlx::test]
async fn sign_in_accepts_any_email_case_and_sets_a_cookie(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-in",
            None,
            Some(json!({ "email": "ANA@example.com", "password": PASSWORD })),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let cookie = session_cookie(&response);
    let user = TestApp {
        router: app.router.clone(),
        cookie: Some(cookie),
    };
    assert_eq!(body_json(response).await["email"], "ana@example.com");
    assert_eq!(user.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn wrong_password_and_unknown_email_get_the_same_401(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    TestApp::another_user(&app, "ana@example.com").await;

    let (wrong_status, wrong) = app
        .post(
            "/api/auth/sign-in",
            json!({ "email": "ana@example.com", "password": "wrong horse" }),
        )
        .await;
    let (unknown_status, unknown) = app
        .post(
            "/api/auth/sign-in",
            json!({ "email": "nobody@example.com", "password": PASSWORD }),
        )
        .await;

    assert_eq!(wrong_status, StatusCode::UNAUTHORIZED);
    assert_eq!(unknown_status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong, unknown);
    assert_eq!(wrong["type"], "urn:soldi:error:invalid-credentials");
}

#[sqlx::test]
async fn behind_https_the_cookie_is_host_prefixed_and_secure(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let mut request = json_request(
        Method::POST,
        "/api/auth/sign-up",
        None,
        Some(json!({ "email": "ana@example.com", "password": PASSWORD })),
    );
    request
        .headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());

    let response = app.send(request).await;

    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(
        set_cookie.starts_with("__Host-soldi_session="),
        "{set_cookie}"
    );
    assert!(set_cookie.contains("Secure"));
    let cookie = session_cookie(&response);
    let mut me = json_request(Method::GET, "/api/auth/me", Some(&cookie), None);
    me.headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());
    assert_eq!(app.send(me).await.status(), StatusCode::OK);
}

#[sqlx::test]
async fn over_https_the_plain_cookie_is_ignored(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let mut me = json_request(Method::GET, "/api/auth/me", user.cookie.as_deref(), None);
    me.headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());

    assert_eq!(user.send(me).await.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn a_cross_site_write_is_forbidden(pool: PgPool) {
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let mut request = json_request(
        Method::POST,
        "/api/auth/sign-out",
        user.cookie.as_deref(),
        None,
    );
    request
        .headers_mut()
        .insert("sec-fetch-site", "cross-site".parse().unwrap());

    assert_eq!(user.send(request).await.status(), StatusCode::FORBIDDEN);
    assert_eq!(user.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn a_malformed_body_is_a_400_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = axum::http::Request::builder()
        .method(Method::POST)
        .uri("/api/auth/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .body(axum::body::Body::from("{"))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
}

#[sqlx::test]
async fn tour_seen_starts_false_and_sticks_once_marked(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    assert_eq!(ana.get("/api/auth/me").await.1["tour_seen"], false);

    assert_eq!(
        ana.post("/api/me/tour-seen", json!({})).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        ana.post("/api/me/tour-seen", json!({})).await.0,
        StatusCode::NO_CONTENT
    );

    assert_eq!(ana.get("/api/auth/me").await.1["tour_seen"], true);
    assert_eq!(bia.get("/api/auth/me").await.1["tour_seen"], false);
}

#[sqlx::test]
async fn tour_seen_needs_a_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, problem) = app.post("/api/me/tour-seen", json!({})).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(problem["type"], "urn:soldi:error:unauthorized");
}

async fn sign_in(app: &TestApp, email: &str, password: &str) -> (StatusCode, TestApp) {
    let body = json!({ "email": email, "password": password });
    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/sign-in",
            None,
            Some(body),
        ))
        .await;
    let status = response.status();
    let cookie = (status == StatusCode::OK).then(|| session_cookie(&response));
    let session = TestApp {
        router: app.router.clone(),
        cookie,
    };
    (status, session)
}

#[sqlx::test]
async fn rename_trims_and_returns_the_user(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;

    let (status, user) = ana
        .patch("/api/me", json!({ "name": "  Ana Souza " }))
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(user["name"], "Ana Souza");
    assert_eq!(user["email"], "ana@example.com");
    assert_eq!(ana.get("/api/auth/me").await.1, user);
    assert_eq!(bia.get("/api/auth/me").await.1["name"], "bia");
    let sixty = "x".repeat(60);
    let (status, user) = ana.patch("/api/me", json!({ "name": sixty })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(user["name"], sixty);
}

#[sqlx::test]
async fn rename_refuses_blank_long_and_nul_names(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    for name in ["   ".to_string(), "x".repeat(61), "a\0b".to_string()] {
        let (status, problem) = ana.patch("/api/me", json!({ "name": name })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{name:?}");
        assert_eq!(problem["errors"][0]["field"], "name");
    }
    assert_eq!(ana.get("/api/auth/me").await.1["name"], "ana");
}

#[sqlx::test]
async fn a_wrong_current_password_changes_nothing(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, ana_phone) = sign_in(&ana, "ana@example.com", PASSWORD).await;

    let (status, problem) = ana
        .post(
            "/api/me/password",
            json!({ "current_password": "wrong horse", "new_password": "battery staple" }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:soldi:error:wrong-password");
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(ana_phone.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        sign_in(&ana, "ana@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn a_short_new_password_is_refused(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, ana_phone) = sign_in(&ana, "ana@example.com", PASSWORD).await;

    let (status, problem) = ana
        .post(
            "/api/me/password",
            json!({ "current_password": PASSWORD, "new_password": "short" }),
        )
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");
    assert_eq!(ana_phone.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        sign_in(&ana, "ana@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn changing_the_password_ends_only_the_other_sessions(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let (_, ana_phone) = sign_in(&ana, "ana@example.com", PASSWORD).await;

    let (status, body) = ana
        .post(
            "/api/me/password",
            json!({ "current_password": PASSWORD, "new_password": "battery staple" }),
        )
        .await;

    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        ana_phone.get("/api/auth/me").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(bia.get("/api/auth/me").await.0, StatusCode::OK);
    assert_eq!(
        sign_in(&ana, "ana@example.com", PASSWORD).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        sign_in(&ana, "ana@example.com", "battery staple").await.0,
        StatusCode::OK
    );
    assert_eq!(
        sign_in(&ana, "bia@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn sign_out_everywhere_ends_every_session_of_the_caller(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let (_, ana_phone) = sign_in(&ana, "ana@example.com", PASSWORD).await;

    let response = ana
        .send(json_request(
            Method::POST,
            "/api/auth/sign-out-everywhere",
            ana.cookie.as_deref(),
            None,
        ))
        .await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let cleared = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cleared.starts_with("soldi_session=;"), "{cleared}");
    assert!(cleared.contains("Max-Age=0"), "{cleared}");
    assert_eq!(ana.get("/api/auth/me").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(
        ana_phone.get("/api/auth/me").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(bia.get("/api/auth/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn account_routes_need_a_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let password = json!({ "current_password": PASSWORD, "new_password": "battery staple" });

    let answers = [
        app.patch("/api/me", json!({ "name": "Ana" })).await,
        app.post("/api/me/password", password).await,
        app.post("/api/auth/sign-out-everywhere", json!({})).await,
    ];

    for (status, problem) in answers {
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(problem["type"], "urn:soldi:error:unauthorized");
    }
}

#[sqlx::test]
async fn account_writes_from_another_origin_are_forbidden(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let requests = [
        (Method::PATCH, "/api/me", Some(json!({ "name": "Eve" }))),
        (
            Method::POST,
            "/api/me/password",
            Some(json!({ "current_password": PASSWORD, "new_password": "battery staple" })),
        ),
        (Method::POST, "/api/auth/sign-out-everywhere", None),
    ];

    for (method, uri, body) in requests {
        let mut request = json_request(method, uri, ana.cookie.as_deref(), body);
        let headers = request.headers_mut();
        headers.insert(header::ORIGIN, "https://evil.example".parse().unwrap());
        headers.insert(header::HOST, "soldi.app".parse().unwrap());
        assert_eq!(
            ana.send(request).await.status(),
            StatusCode::FORBIDDEN,
            "{uri}"
        );
    }

    let (_, me) = ana.get("/api/auth/me").await;
    assert_eq!(me["name"], "ana");
    assert_eq!(
        sign_in(&ana, "ana@example.com", PASSWORD).await.0,
        StatusCode::OK
    );
}

fn forwarded(
    mut request: axum::http::Request<axum::body::Body>,
    from: &str,
) -> axum::http::Request<axum::body::Body> {
    request
        .headers_mut()
        .insert("x-forwarded-for", from.parse().unwrap());
    request
}

fn sign_in_request(email: &str, password: &str) -> axum::http::Request<axum::body::Body> {
    let body = json!({ "email": email, "password": password });
    json_request(Method::POST, "/api/auth/sign-in", None, Some(body))
}

fn sign_up_request(email: &str) -> axum::http::Request<axum::body::Body> {
    let body = json!({ "email": email, "password": PASSWORD });
    json_request(Method::POST, "/api/auth/sign-up", None, Some(body))
}

async fn assert_rate_limited(response: axum::response::Response, window_seconds: u64) {
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    let retry_after: u64 = response.headers()[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=window_seconds).contains(&retry_after), "{retry_after}");
    let problem = body_json(response).await;
    assert_eq!(problem["type"], "urn:soldi:error:rate-limited");
}

#[sqlx::test]
async fn the_eleventh_sign_in_for_one_email_is_limited_without_touching_the_database(pool: PgPool) {
    let app = TestApp::anonymous(pool.clone());
    app.another_user("ana@example.com").await;
    for _ in 0..10 {
        let response = app
            .send(forwarded(
                sign_in_request("ana@example.com", "wrong horse"),
                "203.0.113.1",
            ))
            .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let other_email = app
        .send(forwarded(
            sign_in_request("bia@example.com", "wrong horse"),
            "203.0.113.1",
        ))
        .await;
    assert_eq!(other_email.status(), StatusCode::UNAUTHORIZED);

    pool.close().await;
    let response = app
        .send(forwarded(
            sign_in_request(" ANA@Example.com ", PASSWORD),
            "203.0.113.2",
        ))
        .await;

    assert_rate_limited(response, 900).await;
}

#[sqlx::test]
async fn the_twenty_first_sign_in_from_one_ip_is_limited_even_with_forged_forwarded_entries(
    pool: PgPool,
) {
    let app = TestApp::anonymous(pool);
    for attempt in 0..20 {
        let response = app
            .send(forwarded(
                sign_in_request(&format!("user{attempt}@example.com"), "wrong horse"),
                &format!("198.51.100.{attempt}, 203.0.113.7"),
            ))
            .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{attempt}");
    }

    let response = app
        .send(forwarded(
            sign_in_request("late@example.com", "wrong horse"),
            "203.0.113.7",
        ))
        .await;
    assert_rate_limited(response, 900).await;
    let elsewhere = app
        .send(forwarded(
            sign_in_request("late@example.com", "wrong horse"),
            "203.0.113.7, 203.0.113.8",
        ))
        .await;
    assert_eq!(elsewhere.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn a_malformed_forwarded_header_falls_back_to_the_peer_address(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let from_peer = |request: axum::http::Request<axum::body::Body>, peer: &str| {
        let mut request = forwarded(request, "not-an-ip");
        let peer: std::net::SocketAddr = peer.parse().unwrap();
        request
            .extensions_mut()
            .insert(axum::extract::ConnectInfo(peer));
        request
    };
    for attempt in 0..20 {
        let request = sign_in_request(&format!("user{attempt}@example.com"), "wrong horse");
        let response = app.send(from_peer(request, "198.51.100.9:4000")).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{attempt}");
    }

    let request = sign_in_request("late@example.com", "wrong horse");
    let response = app.send(from_peer(request, "198.51.100.9:4001")).await;
    assert_rate_limited(response, 900).await;
    let request = sign_in_request("late@example.com", "wrong horse");
    let other_peer = app.send(from_peer(request, "198.51.100.10:4000")).await;
    assert_eq!(other_peer.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn the_eleventh_sign_up_from_one_ip_is_limited(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    for attempt in 0..10 {
        let request = sign_up_request(&format!("user{attempt}@example.com"));
        let response = app.send(forwarded(request, "192.0.2.1")).await;
        assert_eq!(response.status(), StatusCode::CREATED, "{attempt}");
    }

    let request = sign_up_request("late@example.com");
    assert_rate_limited(app.send(forwarded(request, "192.0.2.1")).await, 3600).await;
    let request = sign_up_request("late@example.com");
    let elsewhere = app.send(forwarded(request, "192.0.2.2")).await;
    assert_eq!(elsewhere.status(), StatusCode::CREATED);
}

#[sqlx::test]
async fn the_eleventh_password_change_is_limited_for_that_user_only(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bia = ana.another_user("bia@example.com").await;
    let body = json!({ "current_password": "wrong horse", "new_password": "battery staple" });
    for attempt in 0..10 {
        let (status, _) = ana.post("/api/me/password", body.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{attempt}");
    }

    let request = json_request(
        Method::POST,
        "/api/me/password",
        ana.cookie.as_deref(),
        Some(body.clone()),
    );
    assert_rate_limited(ana.send(request).await, 900).await;
    let (status, _) = bia.post("/api/me/password", body).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}
