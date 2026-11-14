//! D38: production errors go to Sentry without personal or money data.

/// Sentry client options from `SENTRY_DSN` and `RAILWAY_ENVIRONMENT_NAME`; `None` turns Sentry off.
pub fn options(dsn: Option<String>, environment: Option<String>) -> Option<sentry::ClientOptions> {
    let dsn = dsn.filter(|dsn| !dsn.trim().is_empty())?;
    let mut options = sentry::ClientOptions::new()
        .release(env!("CARGO_PKG_VERSION"))
        .environment(environment.unwrap_or_else(|| "production".into()));
    let Ok(dsn) = dsn.trim().parse() else {
        // Runs before the log is set up; the DSN itself stays out of the output.
        eprintln!("SENTRY_DSN is malformed; Sentry is off");
        return None;
    };
    options.dsn = Some(dsn);
    options.send_default_pii = false;
    options.before_send = Some(std::sync::Arc::new(|mut event| {
        event.request = None;
        event.user = None;
        event.breadcrumbs.values.clear();
        event.tags.insert("side".into(), "server".into());
        Some(event)
    }));
    Some(options)
}

#[cfg(test)]
mod tests {
    use sentry::protocol::{Breadcrumb, Event, Request, User};

    const DSN: &str = "https://key@o1.ingest.us.sentry.io/2";

    #[test]
    fn without_a_dsn_sentry_is_off() {
        assert!(super::options(None, None).is_none());
        assert!(super::options(Some("  ".into()), None).is_none());
        assert!(super::options(Some("not a dsn".into()), None).is_none());
    }

    #[test]
    fn with_a_dsn_the_release_and_environment_are_set_and_pii_is_off() {
        let options = super::options(Some(DSN.into()), Some("staging".into())).unwrap();

        assert_eq!(options.dsn.unwrap().host(), "o1.ingest.us.sentry.io");
        assert_eq!(options.release.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!(options.environment.as_deref(), Some("staging"));
        assert!(!options.send_default_pii);
        assert!(matches!(
            options.traces_sampling_strategy,
            sentry::TracesSamplingStrategy::Disabled
        ));
    }

    #[test]
    fn the_environment_defaults_to_production() {
        let options = super::options(Some(DSN.into()), None).unwrap();

        assert_eq!(options.environment.as_deref(), Some("production"));
    }

    #[test]
    fn an_event_leaves_without_request_user_or_breadcrumbs_and_tagged_server() {
        let before_send = super::options(Some(DSN.into()), None)
            .unwrap()
            .before_send
            .unwrap();
        let event = Event {
            request: Some(Request {
                data: Some(r#"{"amount":"10.00"}"#.into()),
                cookies: Some("session=abc".into()),
                ..Default::default()
            }),
            user: Some(User {
                email: Some("ana@example.com".into()),
                ..Default::default()
            }),
            breadcrumbs: vec![Breadcrumb {
                message: Some("R$ 10,00".into()),
                ..Default::default()
            }]
            .into(),
            ..Default::default()
        };

        let event = before_send(event).unwrap();

        assert!(event.request.is_none());
        assert!(event.user.is_none());
        assert!(event.breadcrumbs.is_empty());
        assert_eq!(event.tags.get("side").map(String::as_str), Some("server"));
    }
}
