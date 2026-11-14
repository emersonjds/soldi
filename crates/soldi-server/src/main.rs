use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::layer::{Layer, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _sentry = soldi_server::observability::options(
        std::env::var("SENTRY_DSN").ok(),
        std::env::var("RAILWAY_ENVIRONMENT_NAME").ok(),
    )
    .map(sentry::init);
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().json())
        .with(sentry::integrations::tracing::ErrorLayer::new().with_filter(LevelFilter::ERROR))
        .init();
    let database_url = std::env::var("DATABASE_URL")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let web_dir = std::env::var("SOLDI_WEB_DIR").unwrap_or_else(|_| "web/out".into());
    let hosted =
        std::env::var_os("PORT").is_some() || std::env::var_os("RAILWAY_ENVIRONMENT").is_some();
    let public_url =
        soldi_server::mail::public_url(std::env::var("SOLDI_PUBLIC_URL").ok(), hosted)?;
    let mailer = soldi_server::mail::Mailer::from_env(
        std::env::var("RESEND_API_KEY").ok(),
        std::env::var("SOLDI_MAIL_FROM").ok(),
        &public_url,
    )?;
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&database_url)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    let state = soldi_server::AppState {
        mailer,
        public_url,
        ..soldi_server::AppState::new(pool)
    };
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!(%port, %web_dir, "listening");
    axum::serve(
        listener,
        soldi_server::app(state, Some(std::path::Path::new(&web_dir)))
            .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
