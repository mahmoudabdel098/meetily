'use client';

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { CALL_DETECTION_COUNTDOWN_SECONDS, isCallDetectionEnabled } from '@/lib/callDetection';

interface CallEvent {
  app: string;
}

const TOAST_ID = 'call-detection-countdown';

/**
 * Listens for calls detected by the backend (Teams, Zoom, Webex) and starts a
 * recording after a cancellable countdown, giving time to inform participants
 * or skip the call. The backend stops that recording when the call ends.
 */
export function CallDetectionListener() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const clearCountdown = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      toast.dismiss(TOAST_ID);
    };

    const showCountdown = (app: string, remaining: number, onCancel: () => void) => {
      toast(`Call ${app} rilevata`, {
        id: TOAST_ID,
        description: `La registrazione parte tra ${remaining} secondi. Ricordati di avvisare i partecipanti.`,
        duration: Infinity,
        action: { label: 'Annulla', onClick: onCancel },
      });
    };

    const handleCallDetected = async ({ app }: CallEvent) => {
      if (!isCallDetectionEnabled()) return;
      if (await invoke<boolean>('is_recording').catch(() => false)) return;

      clearCountdown();
      let remaining = CALL_DETECTION_COUNTDOWN_SECONDS;
      const cancel = () => {
        clearCountdown();
        toast.info('Registrazione annullata per questa call');
      };

      showCountdown(app, remaining, cancel);
      interval = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          showCountdown(app, remaining, cancel);
          return;
        }
        clearCountdown();
        invoke('start_detected_call_recording').catch((error) => {
          console.error('Failed to start recording for detected call:', error);
          toast.error('Impossibile avviare la registrazione automatica');
        });
      }, 1000);
    };

    const handleCallEnded = ({ app }: CallEvent) => {
      // The call ended before the countdown finished: nothing to record
      if (interval) {
        clearCountdown();
        toast.info(`Call ${app} terminata`);
      }
    };

    const unlistenDetected = listen<CallEvent>('call-detected', (event) => {
      void handleCallDetected(event.payload);
    });
    const unlistenEnded = listen<CallEvent>('call-ended', (event) => {
      handleCallEnded(event.payload);
    });

    return () => {
      clearCountdown();
      unlistenDetected.then((unlisten) => unlisten());
      unlistenEnded.then((unlisten) => unlisten());
    };
  }, []);

  return null;
}
