'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Switch } from './ui/switch';
import {
  CALL_DETECTION_COUNTDOWN_SECONDS,
  isCallDetectionEnabled,
  setCallDetectionEnabled,
} from '@/lib/callDetection';

/** Preference toggle for automatic call detection; hidden where unsupported. */
export function CallDetectionSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    invoke<boolean>('is_call_detection_supported')
      .then(setSupported)
      .catch(() => setSupported(false));
    setEnabled(isCallDetectionEnabled());
  }, []);

  if (!supported) return null;

  const handleChange = (value: boolean) => {
    setEnabled(value);
    setCallDetectionEnabled(value);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Rilevamento automatico delle call</h3>
          <p className="text-sm text-gray-600">
            Quando Teams, Zoom o Webex usano il microfono, Meetily avvia la registrazione dopo{' '}
            {CALL_DETECTION_COUNTDOWN_SECONDS} secondi (annullabili) e la ferma a fine call.
            Avvisa sempre i partecipanti prima di registrare.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleChange} />
      </div>
    </div>
  );
}
