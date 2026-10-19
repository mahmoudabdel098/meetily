import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { ExportFormat } from '@/lib/export/document';
import { loadExportDocument } from '@/lib/export/loadMeeting';
import { exportToFolder } from '@/lib/export/save';

/**
 * Automatic saving of every meeting (transcript + summary) as files in a
 * folder chosen by the user. Settings live in localStorage, which the
 * portable build keeps in its data folder.
 */

export interface TranscriptFolderSettings {
  enabled: boolean;
  /** null = default folder (see get_default_transcripts_folder) */
  folder: string | null;
  formats: ExportFormat[];
}

const SETTINGS_KEY = 'transcriptFolderSettings';
const WRITTEN_FILES_KEY = 'transcriptFolderFiles';

const DEFAULT_SETTINGS: TranscriptFolderSettings = {
  enabled: true,
  folder: null,
  formats: ['docx'],
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function getTranscriptFolderSettings(): TranscriptFolderSettings {
  const settings = readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  const formats = settings.formats.filter((f): f is ExportFormat => ['pdf', 'docx', 'md'].includes(f));
  return { ...settings, formats: formats.length ? formats : DEFAULT_SETTINGS.formats };
}

export function setTranscriptFolderSettings(settings: TranscriptFolderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings stay at their defaults
  }
}

export async function resolveTranscriptFolder(settings = getTranscriptFolderSettings()): Promise<string | null> {
  return settings.folder ?? (await invoke<string | null>('get_default_transcripts_folder').catch(() => null));
}

function readWrittenFiles(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(WRITTEN_FILES_KEY) || '{}');
  } catch {
    return {};
  }
}

function rememberWrittenFiles(meetingId: string, folder: string, names: string[]): void {
  try {
    const all = readWrittenFiles();
    all[meetingId] = names.map((name) => `${folder}::${name}`);
    localStorage.setItem(WRITTEN_FILES_KEY, JSON.stringify(all));
  } catch {
    // Not critical: an outdated file may then be left behind after a rename
  }
}

/**
 * Saves (or refreshes) the files of one meeting in the transcript folder.
 * Safe to call repeatedly: after recording, after the summary, after renaming speakers.
 */
export async function autoSaveMeeting(meetingId: string): Promise<void> {
  const settings = getTranscriptFolderSettings();
  if (!settings.enabled || !settings.formats.length) return;

  const folder = await resolveTranscriptFolder(settings);
  if (!folder) return;

  try {
    const doc = await loadExportDocument(meetingId);
    if (!doc.transcript.length) return;

    // Previous names only count when they were written to this same folder
    const previous = (readWrittenFiles()[meetingId] ?? [])
      .filter((entry) => entry.startsWith(`${folder}::`))
      .map((entry) => entry.slice(folder.length + 2));

    const written = await exportToFolder(doc, folder, settings.formats, previous);
    rememberWrittenFiles(meetingId, folder, written);
  } catch (error) {
    console.error('Automatic transcript save failed:', error);
    toast.error('Salvataggio automatico della trascrizione non riuscito', {
      description: String(error),
    });
  }
}
