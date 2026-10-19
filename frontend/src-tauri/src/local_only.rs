//! Local-only builds.
//!
//! Built with `--features local-only`, the app never sends meeting content or
//! usage data off the machine:
//! - analytics (PostHog) are never initialised;
//! - summaries may only use the built-in model or an LLM server on this PC
//!   (localhost), so cloud providers and remote Ollama/OpenAI-compatible
//!   endpoints are refused;
//! - model downloads are disabled: only the bundled models are used.
//!
//! This is a compile-time switch: it cannot be turned off from the UI or by
//! editing files next to the executable.

pub const LOCAL_ONLY: bool = cfg!(feature = "local-only");

/// True when `url` points at this machine (localhost, 127.0.0.0/8 or ::1).
pub fn is_loopback_url(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    match parsed.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

/// Refuses requests that would leave the machine in a local-only build.
pub fn ensure_url_allowed(url: &str) -> Result<(), String> {
    if LOCAL_ONLY && !is_loopback_url(url) {
        return Err(format!(
            "Bloccato: questa versione non invia mai dati fuori da questo PC ({}). \
             Usa Built-in AI oppure un server LLM in esecuzione su questo computer.",
            url
        ));
    }
    Ok(())
}

/// Local-only builds are fully offline: no model downloads either (the
/// portable ZIP ships with its models).
pub const DOWNLOADS_BLOCKED_MESSAGE: &str =
    "Download disattivato: questa versione funziona completamente offline e usa solo i modelli inclusi.";

pub fn ensure_downloads_allowed() -> Result<(), String> {
    if LOCAL_ONLY {
        return Err(DOWNLOADS_BLOCKED_MESSAGE.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn is_local_only_build() -> bool {
    LOCAL_ONLY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_urls_are_recognised() {
        assert!(is_loopback_url("http://localhost:11434"));
        assert!(is_loopback_url("http://LOCALHOST:8000/v1"));
        assert!(is_loopback_url("http://127.0.0.1:8178/stream"));
        assert!(is_loopback_url("http://[::1]:11434"));
    }

    #[test]
    fn remote_urls_are_not_loopback() {
        assert!(!is_loopback_url("https://api.openai.com/v1/chat/completions"));
        assert!(!is_loopback_url("http://192.168.1.20:11434"));
        assert!(!is_loopback_url("http://localhost.example.com"));
        assert!(!is_loopback_url("not a url"));
    }
}
