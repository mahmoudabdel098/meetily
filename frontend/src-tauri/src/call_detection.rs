//! Automatic call detection (Windows).
//!
//! Windows records which apps are using the microphone right now under
//! `HKCU\...\CapabilityAccessManager\ConsentStore\microphone` (the same data
//! behind the microphone icon in the taskbar). Calling apps such as Teams open
//! the microphone when a call starts (even while muted) and release it when it
//! ends, so polling that key tells us when a call is in progress. Reading it
//! needs no admin rights.
//!
//! The detector only emits events: the frontend shows a cancellable countdown
//! and calls `start_detected_call_recording`. A recording started that way is
//! stopped automatically when the call ends.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Runtime};

/// Set when the current recording was started from a detected call, so only
/// those recordings are stopped automatically.
static AUTO_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
pub struct CallEvent {
    pub app: String,
}

#[cfg(target_os = "windows")]
mod detector {
    use super::{CallEvent, AUTO_STARTED};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Emitter, Runtime};
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const MICROPHONE_CONSENT_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
    const POLL_INTERVAL: Duration = Duration::from_secs(2);
    /// The microphone must stay in use this long before a call counts as started
    const START_CONFIRMATION: Duration = Duration::from_secs(4);
    /// ...and stay released this long before it counts as ended
    const END_CONFIRMATION: Duration = Duration::from_secs(30);

    /// (display name, matcher on the lower-cased registry key name)
    /// Packaged apps use their package family name, desktop apps their
    /// executable path with `\` replaced by `#`.
    const CALL_APPS: &[(&str, fn(&str) -> bool)] = &[
        ("Microsoft Teams", is_teams),
        ("Zoom", is_zoom),
        ("Webex", is_webex),
    ];

    fn is_teams(key: &str) -> bool {
        key.starts_with("msteams_")
            || key.starts_with("microsoftteams_")
            || key.ends_with("#teams.exe")
            || key.ends_with("#ms-teams.exe")
    }

    fn is_zoom(key: &str) -> bool {
        key.ends_with("#zoom.exe")
    }

    fn is_webex(key: &str) -> bool {
        key.ends_with("#ciscocollabhost.exe") || key.ends_with("#webexmta.exe")
    }

    fn is_in_use(key: &RegKey) -> bool {
        let start: u64 = key.get_value("LastUsedTimeStart").unwrap_or(0);
        let stop: u64 = key.get_value("LastUsedTimeStop").unwrap_or(0);
        start != 0 && (stop == 0 || stop < start)
    }

    fn app_name_for(key_name: &str) -> Option<&'static str> {
        let key_name = key_name.to_lowercase();
        CALL_APPS
            .iter()
            .find(|(_, matches)| matches(key_name.as_str()))
            .map(|(name, _)| *name)
    }

    /// Name of a calling app currently holding the microphone, if any
    fn active_call_app() -> Option<&'static str> {
        let root = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(MICROPHONE_CONSENT_KEY)
            .ok()?;

        // Packaged (Store/MSIX) apps, e.g. the new Teams
        for name in root.enum_keys().flatten() {
            if name.eq_ignore_ascii_case("NonPackaged") {
                continue;
            }
            if let Some(app) = app_name_for(&name) {
                if root.open_subkey(&name).map(|k| is_in_use(&k)).unwrap_or(false) {
                    return Some(app);
                }
            }
        }

        // Classic desktop apps
        let non_packaged = root.open_subkey("NonPackaged").ok()?;
        for name in non_packaged.enum_keys().flatten() {
            if let Some(app) = app_name_for(&name) {
                if non_packaged.open_subkey(&name).map(|k| is_in_use(&k)).unwrap_or(false) {
                    return Some(app);
                }
            }
        }

        None
    }

    pub fn run<R: Runtime>(app: AppHandle<R>) {
        let mut in_call: Option<&'static str> = None;
        let mut candidate_since: Option<Instant> = None;
        let mut released_since: Option<Instant> = None;

        loop {
            std::thread::sleep(POLL_INTERVAL);
            let active = active_call_app();

            match (in_call, active) {
                (None, Some(name)) => {
                    let since = *candidate_since.get_or_insert_with(Instant::now);
                    if since.elapsed() >= START_CONFIRMATION {
                        log::info!("Call detected: {}", name);
                        in_call = Some(name);
                        candidate_since = None;
                        released_since = None;
                        AUTO_STARTED.store(false, Ordering::SeqCst);
                        crate::tray::focus_main_window(&app);
                        let _ = app.emit("call-detected", CallEvent { app: name.to_string() });
                    }
                }
                (None, None) => candidate_since = None,
                (Some(_), Some(_)) => released_since = None,
                (Some(name), None) => {
                    let since = *released_since.get_or_insert_with(Instant::now);
                    if since.elapsed() >= END_CONFIRMATION {
                        log::info!("Call ended: {}", name);
                        in_call = None;
                        released_since = None;
                        super::on_call_ended(&app, name);
                    }
                }
            }
        }
    }
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn on_call_ended<R: Runtime>(app: &AppHandle<R>, name: &str) {
    let _ = app.emit("call-ended", CallEvent { app: name.to_string() });

    if !AUTO_STARTED.swap(false, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if crate::is_recording().await {
            log::info!("Stopping recording started for the detected call");
            crate::tray::stop_recording_handler(&app);
        }
    });
}

/// Starts the background detector. Does nothing outside Windows.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = std::thread::Builder::new()
            .name("call-detection".into())
            .spawn(move || detector::run(app))
        {
            log::error!("Failed to start call detection: {}", e);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        log::info!("Automatic call detection is only available on Windows");
    }
}

/// Called by the frontend when the countdown for a detected call completes.
#[tauri::command]
pub async fn start_detected_call_recording<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if crate::is_recording().await {
        return Ok(());
    }
    AUTO_STARTED.store(true, Ordering::SeqCst);
    crate::tray::request_start_recording(&app);
    Ok(())
}

#[tauri::command]
pub fn is_call_detection_supported() -> bool {
    cfg!(target_os = "windows")
}
