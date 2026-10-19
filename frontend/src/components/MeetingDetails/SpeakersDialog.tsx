"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchAllTranscripts } from '@/lib/export/loadMeeting';
import { autoSaveMeeting } from '@/lib/transcriptFolder';

interface SpeakersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onRenamed?: () => Promise<void>;
}

interface SpeakerRow {
  original: string;
  name: string;
  segments: number;
}

/**
 * Renames the speakers detected in a meeting ("Partecipante 1" -> "Marco").
 * Giving two speakers the same name merges them.
 */
export function SpeakersDialog({ open, onOpenChange, meetingId, onRenamed }: SpeakersDialogProps) {
  const [rows, setRows] = useState<SpeakerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAllTranscripts(meetingId)
      .then((transcripts) => {
        const counts = new Map<string, number>();
        for (const t of transcripts) {
          if (t.speaker) counts.set(t.speaker, (counts.get(t.speaker) ?? 0) + 1);
        }
        setRows([...counts].map(([original, segments]) => ({ original, name: original, segments })));
      })
      .catch((error) => toast.error('Impossibile leggere i partecipanti', { description: String(error) }))
      .finally(() => setLoading(false));
  }, [open, meetingId]);

  const changed = rows.filter((r) => r.name.trim() && r.name.trim() !== r.original);

  const save = async () => {
    setSaving(true);
    try {
      for (const row of changed) {
        await invoke('api_rename_speaker', { meetingId, oldName: row.original, newName: row.name.trim() });
      }
      toast.success('Partecipanti aggiornati');
      onOpenChange(false);
      await onRenamed?.();
      void autoSaveMeeting(meetingId);
    } catch (error) {
      toast.error('Impossibile rinominare', { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partecipanti</DialogTitle>
          <DialogDescription>
            Dai un nome a chi ha parlato. Se dai lo stesso nome a due partecipanti, vengono uniti.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">
            Questa riunione non ha informazioni su chi ha parlato (registrata prima di questa funzione o importata).
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.original} className="flex items-center gap-3">
                <div className="w-36 text-sm text-gray-600 truncate" title={row.original}>
                  {row.original}
                  <span className="block text-xs text-gray-400">{row.segments} interventi</span>
                </div>
                <Input
                  value={row.name}
                  maxLength={60}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving || changed.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
