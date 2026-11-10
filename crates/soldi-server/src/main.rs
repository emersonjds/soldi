#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .init();
    let database_url = std::env::var("DATABASE_URL")?;
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let web_dir = std::env::var("SOLDI_WEB_DIR").unwrap_or_else(|_| "web/out".into());
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&database_url)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    let mailer = match std::env::var("RESEND_API_KEY") {
        Ok(api_key) => {
            let from = std::env::var("SOLDI_MAIL_FROM")
                .unwrap_or_else(|_| "Soldi <nao-responda@getsoldi.app>".into());
            soldi_server::mail::Mailer::resend(api_key, from)?
        }
        Err(_) => soldi_server::mail::Mailer::Log,
    };
    let public_url = std::env::var("SOLDI_PUBLIC_URL")
        .unwrap_or_else(|_| "http://localhost:8080".into())
        .trim_end_matches('/')
        .to_string();
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
