import type { Transcript } from '@/types';

/** Everything an exported meeting document contains, independent of format. */
export interface ExportDocument {
  title: string;
  createdAt: Date;
  /** Summary as Markdown, or null when no summary was generated */
  summaryMarkdown: string | null;
  transcript: ExportTranscriptLine[];
}

export interface ExportTranscriptLine {
  /** "[MM:SS]" from the recording start, or the wall-clock time for old meetings */
  time: string;
  speaker: string | null;
  text: string;
}

export type ExportFormat = 'pdf' | 'docx' | 'md';

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  docx: 'Word (.docx)',
  md: 'Markdown (.md)',
};

export function formatRecordingTime(seconds: number | undefined, fallback: string): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return fallback;
  }
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `[${hours}:${pad(mins)}:${pad(secs)}]` : `[${pad(mins)}:${pad(secs)}]`;
}

export function buildExportDocument(params: {
  title: string;
  createdAt: string | Date;
  summaryMarkdown: string | null;
  transcripts: Transcript[];
  resolveSpeaker?: (transcript: Transcript) => string | null;
}): ExportDocument {
  const resolveSpeaker = params.resolveSpeaker ?? ((t: Transcript) => t.speaker ?? null);
  return {
    title: params.title.trim() || 'Riunione',
    createdAt: new Date(params.createdAt),
    summaryMarkdown: params.summaryMarkdown?.trim() ? params.summaryMarkdown.trim() : null,
    transcript: params.transcripts
      .filter((t) => t.text.trim().length > 0)
      .map((t) => ({
        time: formatRecordingTime(t.audio_start_time, t.timestamp),
        speaker: resolveSpeaker(t),
        text: t.text.trim(),
      })),
  };
}

export function formatDocumentDate(date: Date): string {
  return date.toLocaleString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Distinct speakers in order of first appearance */
export function listSpeakers(doc: ExportDocument): string[] {
  const seen: string[] = [];
  for (const line of doc.transcript) {
    if (line.speaker && !seen.includes(line.speaker)) {
      seen.push(line.speaker);
    }
  }
  return seen;
}

/** Safe file name: "2026-10-19 Titolo riunione" */
export function exportFileBaseName(doc: ExportDocument): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = doc.createdAt;
  const datePart = Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())} `;
  const titlePart = doc.title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return (datePart + titlePart).trim() || 'riunione';
}
