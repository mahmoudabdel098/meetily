import { invoke } from '@tauri-apps/api/core';
import type { MeetingSummary, SummaryProcessResponse, Transcript } from '@/types';
import { parseSummaryContent } from '@/lib/summary-content';
import { buildExportDocument, ExportDocument } from './document';

/** All transcript segments of a meeting (not just the loaded page). */
export async function fetchAllTranscripts(meetingId: string): Promise<Transcript[]> {
  type Page = { transcripts: Transcript[]; total_count: number; has_more: boolean };
  const firstPage = await invoke<Page>('api_get_meeting_transcripts', { meetingId, limit: 1, offset: 0 });
  if (firstPage.total_count === 0) {
    return [];
  }
  const all = await invoke<Page>('api_get_meeting_transcripts', {
    meetingId,
    limit: firstPage.total_count,
    offset: 0,
  });
  return all.transcripts;
}

interface BlockNoteNode {
  type?: string;
  props?: { level?: number };
  content?: unknown;
  children?: BlockNoteNode[];
  text?: string;
}

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item: { text?: string; styles?: { bold?: boolean; italic?: boolean }; content?: unknown }) => {
      const text = item.text ?? inlineText(item.content);
      if (!text) return '';
      if (item.styles?.bold) return `**${text}**`;
      if (item.styles?.italic) return `*${text}*`;
      return text;
    })
    .join('');
}

function blockNoteToMarkdown(blocks: BlockNoteNode[], depth = 0): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let number = 0;
  for (const block of blocks) {
    const text = inlineText(block.content);
    if (block.type !== 'numberedListItem') number = 0;
    switch (block.type) {
      case 'heading':
        lines.push('', `${'#'.repeat(Math.min(3, block.props?.level ?? 2))} ${text}`, '');
        break;
      case 'bulletListItem':
      case 'checkListItem':
        lines.push(`${indent}- ${text}`);
        break;
      case 'numberedListItem':
        number += 1;
        lines.push(`${indent}${number}. ${text}`);
        break;
      default:
        if (text.trim()) lines.push('', `${indent}${text}`, '');
    }
    if (block.children?.length) {
      lines.push(blockNoteToMarkdown(block.children, depth + 1));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Best-effort Markdown for any stored summary format (markdown, BlockNote, legacy sections). */
export function summaryToMarkdown(summary: MeetingSummary | null): string | null {
  if (!summary) return null;
  const record = summary as unknown as Record<string, unknown>;

  if (typeof record.markdown === 'string' && record.markdown.trim()) {
    return record.markdown;
  }
  if (Array.isArray(record.summary_json)) {
    const markdown = blockNoteToMarkdown(record.summary_json as BlockNoteNode[]);
    if (markdown) return markdown;
  }

  const sections = Object.entries(record)
    .filter(([key]) => !['markdown', 'summary_json', '_section_order', 'MeetingName'].includes(key))
    .map(([, section]) => {
      const s = section as { title?: string; blocks?: { content?: string }[] } | null;
      if (!s || typeof s !== 'object' || !s.title || !Array.isArray(s.blocks)) return '';
      return `## ${s.title}\n\n${s.blocks.map((b) => `- ${b.content ?? ''}`).join('\n')}`;
    })
    .filter((s) => s.trim());
  return sections.length ? sections.join('\n\n') : null;
}

/** Loads a meeting from the local database into an export document. */
export async function loadExportDocument(meetingId: string): Promise<ExportDocument> {
  const [meeting, transcripts, summaryResponse] = await Promise.all([
    invoke<{ id: string; title: string; created_at?: string }>('api_get_meeting', { meetingId }),
    fetchAllTranscripts(meetingId),
    invoke<SummaryProcessResponse>('api_get_summary', { meetingId }).catch(() => null),
  ]);

  const summary =
    summaryResponse && summaryResponse.status !== 'idle' ? parseSummaryContent(summaryResponse.data) : null;

  return buildExportDocument({
    title: meeting.title,
    createdAt: meeting.created_at ?? new Date(),
    summaryMarkdown: summaryToMarkdown(summary),
    transcripts,
  });
}
