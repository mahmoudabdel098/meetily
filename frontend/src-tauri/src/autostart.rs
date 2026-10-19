//! Start with Windows, minimised to the tray (per user, no admin rights).
//!
//! Enabled by writing the executable path to
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, the standard
//! per-user startup list (also shown in Task Manager > Startup apps).
//! Launched that way the app passes `--minimized` and keeps its window
//! hidden, so call detection runs in the background from login.

/// Command-line flag used by the startup entry
pub const MINIMIZED_FLAG: &str = "--minimized";

/// True when this process was started by the startup entry.
pub fn started_minimized() -> bool {
    std::env::args().any(|arg| arg == MINIMIZED_FLAG)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::MINIMIZED_FLAG;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE_NAME: &str = "Meetily";

    fn command_line() -> Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| format!("Percorso dell'app non disponibile: {}", e))?;
        Ok(format!("\"{}\" {}", exe.display(), MINIMIZED_FLAG))
    }

    fn run_key(access: u32) -> Result<RegKey, String> {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(RUN_KEY, access)
            .map_err(|e| format!("Impossibile accedere all'elenco di avvio di Windows: {}", e))
    }

    pub fn is_enabled() -> bool {
        run_key(KEY_READ)
            .and_then(|key| key.get_value::<String, _>(VALUE_NAME).map_err(|e| e.to_string()))
            .is_ok()
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let key = run_key(KEY_SET_VALUE | KEY_READ)?;
        if enabled {
            key.set_value(VALUE_NAME, &command_line()?)
                .map_err(|e| format!("Impossibile attivare l'avvio automatico: {}", e))
        } else {
            match key.delete_value(VALUE_NAME) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(format!("Impossibile disattivare l'avvio automatico: {}", e)),
            }
        }
    }

    /// A portable folder can be moved: keep the startup entry pointing at
    /// the executable that is running now.
    pub fn refresh_path() {
        if !is_enabled() {
            return;
        }
        let Ok(expected) = command_line() else { return };
        let current = run_key(KEY_READ)
            .ok()
            .and_then(|key| key.get_value::<String, _>(VALUE_NAME).ok());
        if current.as_deref() != Some(expected.as_str()) {
            if let Err(e) = set_enabled(true) {
                log::warn!("Failed to update startup entry: {}", e);
            }
        }
    }
}

pub fn refresh_path() {
    #[cfg(target_os = "windows")]
    platform::refresh_path();
}

#[tauri::command]
pub fn autostart_is_supported() -> bool {
    cfg!(target_os = "windows")
}

#[tauri::command]
pub fn autostart_get() -> bool {
    #[cfg(target_os = "windows")]
    {
        platform::is_enabled()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn autostart_set(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::set_enabled(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err("L'avvio automatico è disponibile solo su Windows".to_string())
    }
}
