'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from './ui/switch';
import { ExportFormat, EXPORT_FORMAT_LABELS } from '@/lib/export/document';
import {
  getTranscriptFolderSettings,
  resolveTranscriptFolder,
  setTranscriptFolderSettings,
  TranscriptFolderSettings as Settings,
} from '@/lib/transcriptFolder';

const FORMATS: ExportFormat[] = ['docx', 'pdf', 'md'];

/** Where meeting transcripts are saved as files, and in which formats. */
export function TranscriptFolderSettings() {
  const [settings, setSettings] = useState<Settings>(() => getTranscriptFolderSettings());
  const [resolvedFolder, setResolvedFolder] = useState<string | null>(null);

  useEffect(() => {
    resolveTranscriptFolder(settings).then(setResolvedFolder);
  }, [settings]);

  const update = (next: Settings) => {
    setSettings(next);
    setTranscriptFolderSettings(next);
  };

  const chooseFolder = async () => {
    try {
      const folder = await invoke<string | null>('select_folder', {
        title: 'Cartella delle trascrizioni',
        startingFolder: resolvedFolder,
      });
      if (folder) update({ ...settings, folder });
    } catch (error) {
      toast.error('Impossibile scegliere la cartella', { description: String(error) });
    }
  };

  const toggleFormat = (format: ExportFormat, checked: boolean) => {
    const formats = checked
      ? [...settings.formats, format].filter((f, i, all) => all.indexOf(f) === i)
      : settings.formats.filter((f) => f !== format);
    if (!formats.length) {
      toast.info('Scegli almeno un formato');
      return;
    }
    update({ ...settings, formats });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Cartella delle trascrizioni</h3>
          <p className="text-sm text-gray-600">
            Ogni riunione viene salvata qui come file (trascrizione con chi ha parlato e riassunto),
            e aggiornata quando il riassunto è pronto.
          </p>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(enabled) => update({ ...settings, enabled })} />
      </div>

      {settings.enabled && (
        <>
          <div className="p-4 border rounded-lg bg-gray-50">
            <div className="text-xs text-gray-600 mb-3 break-all font-mono">
              {resolvedFolder ?? 'Caricamento...'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={chooseFolder}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Cambia cartella…
              </button>
              {settings.folder && (
                <button
                  onClick={() => update({ ...settings, folder: null })}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Cartella predefinita
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-800 mb-2">Formati</div>
            <div className="flex flex-wrap gap-4">
              {FORMATS.map((format) => (
                <label key={format} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={settings.formats.includes(format)}
                    onChange={(e) => toggleFormat(format, e.target.checked)}
                  />
                  {EXPORT_FORMAT_LABELS[format]}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
