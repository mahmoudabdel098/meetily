/**
 * Automatic call detection preferences (Windows only).
 *
 * Stored in localStorage, which the portable build keeps in its data folder.
 */

const ENABLED_KEY = 'callDetectionEnabled';

export const CALL_DETECTION_COUNTDOWN_SECONDS = 10;

export function isCallDetectionEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setCallDetectionEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch {
    // Storage unavailable: keep the default
  }
}
