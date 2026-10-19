'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Switch } from './ui/switch';

/** "Start with Windows" toggle (per user, minimised to the tray). Hidden where unsupported. */
export function StartupSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<boolean>('autostart_is_supported')
      .then(async (isSupported) => {
        setSupported(isSupported);
        if (isSupported) setEnabled(await invoke<boolean>('autostart_get'));
      })
      .catch(() => setSupported(false));
  }, []);

  if (!supported) return null;

  const handleChange = async (value: boolean) => {
    setBusy(true);
    try {
      await invoke('autostart_set', { enabled: value });
      setEnabled(value);
      toast.success(value ? 'Meetily partirà all\'accesso a Windows' : 'Avvio automatico disattivato');
    } catch (error) {
      toast.error('Impossibile modificare l\'avvio automatico', { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Avvia con Windows</h3>
          <p className="text-sm text-gray-600">
            All&apos;accesso a Windows Meetily si avvia ridotto nella barra delle applicazioni, così il
            rilevamento delle call è sempre pronto. Non servono permessi di amministratore. Se sposti la
            cartella dell&apos;app, l&apos;avvio automatico si aggiorna da solo al primo avvio.
          </p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={handleChange} />
      </div>
    </div>
  );
}
