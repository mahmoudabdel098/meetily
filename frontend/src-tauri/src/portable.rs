//! Portable mode.
//!
//! When a `portable.txt` file sits next to the executable, every piece of
//! application data (database, models, settings stores, WebView storage,
//! recordings, notification settings and custom templates) lives in a `data`
//! folder beside the executable instead of the user profile. This lets the app
//! run from an extracted ZIP or a USB stick without an installer.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::path::PathResolver;
use tauri::Runtime;

const MARKER_FILE: &str = "portable.txt";
const DATA_DIR_NAME: &str = "data";

static PORTABLE_ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

fn detect_portable_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    if !exe_dir.join(MARKER_FILE).is_file() {
        return None;
    }

    let root = exe_dir.join(DATA_DIR_NAME);
    match std::fs::create_dir_all(&root) {
        Ok(()) => Some(root),
        Err(e) => {
            // Read-only location (e.g. Program Files): fall back to the user profile
            eprintln!(
                "Portable marker found but {} is not writable ({}); using the user profile instead",
                root.display(),
                e
            );
            None
        }
    }
}

/// Root of the portable data folder, or `None` when running as an installed app.
pub fn portable_root() -> Option<&'static Path> {
    PORTABLE_ROOT
        .get_or_init(detect_portable_root)
        .as_deref()
}

pub fn is_portable() -> bool {
    portable_root().is_some()
}

/// Must run before Tauri creates any webview.
///
/// Points WebView2 (localStorage, IndexedDB, cache) at the portable folder.
/// WebView2 gives this environment variable precedence over the user data
/// folder Tauri passes in.
pub fn init() {
    let Some(root) = portable_root() else {
        return;
    };

    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root);

    log::info!("Portable mode enabled, data folder: {}", root.display());
}

/// Portable-aware replacement for `app.path().app_data_dir()`:
/// call `app.path().portable_app_data_dir()` instead.
pub trait PortablePathExt {
    fn portable_app_data_dir(&self) -> tauri::Result<PathBuf>;
}

impl<R: Runtime> PortablePathExt for PathResolver<R> {
    fn portable_app_data_dir(&self) -> tauri::Result<PathBuf> {
        match portable_root() {
            Some(root) => Ok(root.to_path_buf()),
            None => self.app_data_dir(),
        }
    }
}

/// Path to pass to `tauri-plugin-store` for a store file.
///
/// The plugin resolves relative paths against the system app data dir, so in
/// portable mode the store gets an absolute path inside the portable folder.
pub fn store_path(file_name: &str) -> PathBuf {
    match portable_root() {
        Some(root) => root.join(file_name),
        None => PathBuf::from(file_name),
    }
}

/// Default recordings folder in portable mode.
pub fn recordings_dir() -> Option<PathBuf> {
    portable_root().map(|root| root.join("recordings"))
}

/// Folder for settings that would otherwise go under the OS config dir.
pub fn config_dir() -> Option<PathBuf> {
    portable_root().map(|root| root.join("config"))
}

/// Custom summary templates folder in portable mode.
pub fn templates_dir() -> Option<PathBuf> {
    portable_root().map(|root| root.join("templates"))
}

/// Lets the frontend resolve its `tauri-plugin-store` files to the same
/// location. Returns `None` when not running in portable mode.
#[tauri::command]
pub fn get_portable_data_dir() -> Option<String> {
    portable_root().map(|root| root.to_string_lossy().to_string())
}
