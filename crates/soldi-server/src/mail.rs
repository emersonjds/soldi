use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use tokio::task::JoinHandle;

const RESEND_URL: &str = "https://api.resend.com/emails";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

#[derive(Clone)]
pub enum Mailer {
    /// No `RESEND_API_KEY` (local runs): the link goes to the log, the address does not.
    Log,
    Resend {
        client: reqwest::Client,
        api_key: String,
        from: String,
    },
    /// Tests: keeps every message and the tasks that send them.
    Recording(Arc<Recording>),
}

#[derive(Default)]
pub struct Recording {
    sent: Mutex<Vec<Message>>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
}

impl Recording {
    /// Waits for every tracked task, then returns what was sent so far.
    pub async fn sent(&self) -> Vec<Message> {
        let tasks = std::mem::take(&mut *self.tasks.lock().unwrap_or_else(PoisonError::into_inner));
        for task in tasks {
            let _ = task.await;
        }
        self.sent
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl Mailer {
    pub fn resend(api_key: String, from: String) -> reqwest::Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;
        Ok(Mailer::Resend {
            client,
            api_key,
            from,
        })
    }

    pub async fn send_password_reset(
        &self,
        to: &str,
        name: &str,
        link: &str,
    ) -> reqwest::Result<()> {
        match self {
            Mailer::Log => tracing::info!(%link, "password reset link for a user"),
            Mailer::Resend {
                client,
                api_key,
                from,
            } => {
                let request =
                    resend_request(client, api_key, from, &password_reset(to, name, link))?;
                client.execute(request).await?.error_for_status()?;
            }
            Mailer::Recording(recording) => recording
                .sent
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(password_reset(to, name, link)),
        }
        Ok(())
    }

    /// The recording mailer keeps the task so tests can wait for it; elsewhere it runs detached.
    pub fn track(&self, task: JoinHandle<()>) {
        if let Mailer::Recording(recording) = self {
            recording
                .tasks
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(task);
        }
    }
}

fn resend_request(
    client: &reqwest::Client,
    api_key: &str,
    from: &str,
    message: &Message,
) -> reqwest::Result<reqwest::Request> {
    client
        .post(RESEND_URL)
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "from": from,
            "to": message.to,
            "subject": message.subject,
            "text": message.text,
            "html": message.html,
        }))
        .build()
}

fn password_reset(to: &str, name: &str, link: &str) -> Message {
    let intro = "Recebemos um pedido para redefinir a senha da sua conta no Soldi. \
                 Use o link abaixo em até 1 hora:";
    let outro = "Se não foi você, ignore este e-mail; sua senha continua a mesma.";
    let (html_name, html_link) = (escape_html(name), escape_html(link));
    Message {
        to: to.to_string(),
        subject: "Redefinir sua senha do Soldi".into(),
        text: format!("Olá, {name}.\n\n{intro}\n\n{link}\n\n{outro}\n"),
        html: format!(
            "<p>Olá, {html_name}.</p><p>{intro}</p>\
             <p><a href=\"{html_link}\">{html_link}</a></p><p>{outro}</p>"
        ),
    }
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn the_reset_message_carries_the_link_and_escapes_the_name_in_html() {
        let link = "https://getsoldi.app/redefinir-senha?token=abc";

        let message = password_reset("ana@example.com", "<Ana & \"Bia\">", link);

        assert_eq!(message.to, "ana@example.com");
        assert_eq!(message.subject, "Redefinir sua senha do Soldi");
        assert_eq!(
            message.text,
            "Olá, <Ana & \"Bia\">.\n\n\
             Recebemos um pedido para redefinir a senha da sua conta no Soldi. \
             Use o link abaixo em até 1 hora:\n\n\
             https://getsoldi.app/redefinir-senha?token=abc\n\n\
             Se não foi você, ignore este e-mail; sua senha continua a mesma.\n"
        );
        assert!(
            message
                .html
                .contains("Olá, &lt;Ana &amp; &quot;Bia&quot;&gt;.")
        );
        assert!(
            message
                .html
                .contains(&format!("<a href=\"{link}\">{link}</a>"))
        );
        assert!(!message.html.contains("<Ana"));
    }

    #[test]
    fn the_resend_request_posts_json_with_the_bearer_key() {
        let client = reqwest::Client::new();
        let message = password_reset("ana@example.com", "Ana", "http://x/y");

        let request = resend_request(&client, "re_key", "Soldi <a@b.c>", &message).unwrap();

        assert_eq!(request.method(), reqwest::Method::POST);
        assert_eq!(request.url().as_str(), "https://api.resend.com/emails");
        assert_eq!(request.headers()["authorization"], "Bearer re_key");
        assert_eq!(request.headers()["content-type"], "application/json");
        let body: serde_json::Value =
            serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "from": "Soldi <a@b.c>",
                "to": "ana@example.com",
                "subject": message.subject,
                "text": message.text,
                "html": message.html,
            })
        );
    }

    #[test]
    fn a_resend_mailer_builds() {
        assert!(matches!(
            Mailer::resend("re_key".into(), "Soldi <a@b.c>".into()),
            Ok(Mailer::Resend { .. })
        ));
    }

    #[derive(Clone, Default)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn without_a_key_the_link_goes_to_the_log_without_the_address() {
        let buffer = Buffer::default();
        let writer = buffer.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_writer(move || writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        Mailer::Log
            .send_password_reset("ana@example.com", "Ana", "http://x/redefinir-senha?token=t")
            .await
            .unwrap();

        let log = String::from_utf8(buffer.0.lock().unwrap().clone()).unwrap();
        assert!(log.contains("password reset link for a user"), "{log}");
        assert!(log.contains("http://x/redefinir-senha?token=t"), "{log}");
        assert!(!log.contains("ana@example.com"), "{log}");
    }

    #[tokio::test]
    async fn the_recording_mailer_waits_for_tracked_tasks_before_answering() {
        let recording = Arc::new(Recording::default());
        let mailer = Mailer::Recording(recording.clone());
        let sender = mailer.clone();
        mailer.track(tokio::spawn(async move {
            tokio::task::yield_now().await;
            sender
                .send_password_reset("ana@example.com", "Ana", "http://x")
                .await
                .unwrap();
        }));
        Mailer::Log.track(tokio::spawn(async {}));

        let sent = recording.sent().await;

        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "ana@example.com");
    }
}
