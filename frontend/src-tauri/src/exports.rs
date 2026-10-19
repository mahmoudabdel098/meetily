//! Writing exported meeting documents (PDF, DOCX, Markdown) to disk.
//!
//! The frontend renders the document; these commands only show the native
//! save/folder dialogs and write the bytes, so nothing leaves the PC.

use base64::Engine;
use log::{error, info};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

fn decode(data_base64: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("Invalid export data: {}", e))
}

/// Keeps a file name inside its folder: no separators or reserved characters.
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let cleaned = cleaned
        .split_whitespace()
        .filter(|word| !word.chars().all(|c| c == '.'))
        .collect::<Vec<_>>()
        .join(" ");
    let cleaned = cleaned.trim_matches('.').trim();
    if cleaned.is_empty() {
        "riunione".to_string()
    } else {
        cleaned.chars().take(150).collect()
    }
}

/// Asks where to save, then writes the file. Returns the saved path, or
/// `None` when the user cancels the dialog.
#[tauri::command]
pub async fn save_export_file<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
    extension: String,
    filter_name: String,
    data_base64: String,
) -> Result<Option<String>, String> {
    let bytes = decode(&data_base64)?;
    let extension = extension.trim_start_matches('.').to_string();
    let default_name = format!("{}.{}", sanitize_file_name(&file_name), extension);

    let app_clone = app.clone();
    let picked = tokio::task::spawn_blocking(move || {
        app_clone
            .dialog()
            .file()
            .set_title("Esporta riunione")
            .set_file_name(default_name)
            .add_filter(filter_name, &[extension.as_str()])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Save dialog failed: {}", e))?;

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("Invalid save location: {}", e))?;

    std::fs::write(&path, bytes).map_err(|e| {
        error!("Failed to write export {}: {}", path.display(), e);
        format!("Impossibile salvare il file: {}", e)
    })?;
    info!("Exported meeting to {}", path.display());
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Opens a folder picker. Returns `None` when cancelled.
#[tauri::command]
pub async fn select_folder<R: Runtime>(
    app: AppHandle<R>,
    title: Option<String>,
    starting_folder: Option<String>,
) -> Result<Option<String>, String> {
    let picked = tokio::task::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title(title.unwrap_or_else(|| "Scegli una cartella".to_string()));
        if let Some(folder) = starting_folder.filter(|f| Path::new(f).is_dir()) {
            dialog = dialog.set_directory(folder);
        }
        dialog.blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Folder dialog failed: {}", e))?;

    match picked {
        Some(path) => path
            .into_path()
            .map(|p| Some(p.to_string_lossy().to_string()))
            .map_err(|e| format!("Invalid folder: {}", e)),
        None => Ok(None),
    }
}

/// Writes `file_name` inside `folder` (created if missing), replacing an
/// existing file with the same name. Used for automatic transcript saving.
///
/// `previous_file_name` is the name this meeting was saved under before (the
/// title can change once the summary is generated); that older file is
/// removed so each meeting keeps a single file per format.
#[tauri::command]
pub async fn write_export_to_folder(
    folder: String,
    file_name: String,
    data_base64: String,
    previous_file_name: Option<String>,
) -> Result<String, String> {
    let bytes = decode(&data_base64)?;
    let folder = PathBuf::from(folder);
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Impossibile creare la cartella {}: {}", folder.display(), e))?;
    let file_name = sanitize_file_name(&file_name);
    let path = folder.join(&file_name);
    std::fs::write(&path, bytes)
        .map_err(|e| format!("Impossibile salvare {}: {}", path.display(), e))?;
    info!("Saved transcript file {}", path.display());

    if let Some(previous) = previous_file_name.map(|p| sanitize_file_name(&p)) {
        let previous_path = folder.join(&previous);
        if previous != file_name && previous_path.is_file() {
            if let Err(e) = std::fs::remove_file(&previous_path) {
                error!("Failed to remove outdated file {}: {}", previous_path.display(), e);
            }
        }
    }

    Ok(path.to_string_lossy().to_string())
}

/// Default folder for automatically saved transcripts: next to the app in
/// portable mode, otherwise Documents\Meetily.
#[tauri::command]
pub fn get_default_transcripts_folder() -> Option<String> {
    let folder = match crate::portable::portable_root() {
        Some(root) => root.join("trascrizioni"),
        None => dirs::document_dir()?.join("Meetily"),
    };
    Some(folder.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::sanitize_file_name;

    #[test]
    fn file_names_cannot_escape_the_folder() {
        assert_eq!(sanitize_file_name("../../evil.docx"), "evil.docx");
        assert_eq!(sanitize_file_name("a\\b/c:d.pdf"), "a b c d.pdf");
        assert_eq!(sanitize_file_name("   "), "riunione");
        assert_eq!(sanitize_file_name("Riunione 19/10 – vendite.md"), "Riunione 19 10 – vendite.md");
    }
}
