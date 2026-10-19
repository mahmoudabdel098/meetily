import { invoke } from '@tauri-apps/api/core';
import { ExportDocument, ExportFormat, EXPORT_FORMAT_LABELS, exportFileBaseName } from './document';
import { renderExport } from './writers';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Renders the document and asks where to save it. Returns the path, or null if cancelled. */
export async function exportWithDialog(doc: ExportDocument, format: ExportFormat): Promise<string | null> {
  const bytes = await renderExport(doc, format);
  return invoke<string | null>('save_export_file', {
    fileName: exportFileBaseName(doc),
    extension: format,
    filterName: EXPORT_FORMAT_LABELS[format],
    dataBase64: toBase64(bytes),
  });
}

/**
 * Renders the document into `folder`, one file per format, replacing the
 * files listed in `previousFileNames` (same meeting saved under an older title).
 * Returns the file names written.
 */
export async function exportToFolder(
  doc: ExportDocument,
  folder: string,
  formats: ExportFormat[],
  previousFileNames: string[] = [],
): Promise<string[]> {
  const written: string[] = [];
  for (const format of formats) {
    const fileName = `${exportFileBaseName(doc)}.${format}`;
    const bytes = await renderExport(doc, format);
    await invoke<string>('write_export_to_folder', {
      folder,
      fileName,
      dataBase64: toBase64(bytes),
      previousFileName: previousFileNames.find((name) => name.endsWith(`.${format}`)) ?? null,
    });
    written.push(fileName);
  }
  return written;
}
