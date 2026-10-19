export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * Language options offered in the summary language pickers.
 * Codes must stay in sync with `language_name_from_code` in
 * `frontend/src-tauri/src/summary/processor.rs`.
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'Inglese' },
  { code: 'zh', label: 'Cinese' },
  { code: 'zh-tw', label: 'Cinese tradizionale' },
  { code: 'de', label: 'Tedesco' },
  { code: 'es', label: 'Spagnolo' },
  { code: 'ru', label: 'Russo' },
  { code: 'ko', label: 'Coreano' },
  { code: 'fr', label: 'Francese' },
  { code: 'ja', label: 'Giapponese' },
  { code: 'pt', label: 'Portoghese' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Olandese' },
  { code: 'pl', label: 'Polacco' },
  { code: 'ar', label: 'Arabo' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'tr', label: 'Turco' },
  { code: 'vi', label: 'Vietnamita' },
  { code: 'th', label: 'Thailandese' },
  { code: 'id', label: 'Indonesiano' },
  { code: 'sv', label: 'Svedese' },
  { code: 'cs', label: 'Ceco' },
  { code: 'da', label: 'Danese' },
  { code: 'fi', label: 'Finlandese' },
  { code: 'el', label: 'Greco' },
  { code: 'he', label: 'Ebraico' },
  { code: 'hu', label: 'Ungherese' },
  { code: 'no', label: 'Norvegese' },
  { code: 'ro', label: 'Rumeno' },
  { code: 'uk', label: 'Ucraino' },
];

export const AUTO_VALUE = '__auto__' as const;

const SUPPORTED_CODES: ReadonlySet<string> = new Set(LANGUAGE_OPTIONS.map((o) => o.code));

/**
 * Normalises a raw locale string (from transcription or storage) into a code we
 * can translate into. Handles BCP-47 regional tags: `pt-BR` -> `pt`, `en_GB` -> `en`.
 * Returns null for unsupported languages so callers can fall back to English
 * rather than sending a code Rust will silently drop.
 */
export function normaliseLanguageCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (SUPPORTED_CODES.has(lower)) return lower;
  const base = lower.split('-')[0];
  if (SUPPORTED_CODES.has(base)) return base;
  return null;
}

export function labelForCode(code: string): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code;
}
