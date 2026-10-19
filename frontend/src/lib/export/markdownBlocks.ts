/**
 * Minimal Markdown reader for summaries: headings, bullet and numbered lists,
 * paragraphs and **bold** / *italic* runs. Enough for LLM-generated summaries,
 * and shared by the DOCX and PDF writers so both render the same structure.
 */

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: TextRun[] }
  | { type: 'bullet'; depth: number; runs: TextRun[] }
  | { type: 'numbered'; depth: number; number: number; runs: TextRun[] }
  | { type: 'paragraph'; runs: TextRun[] }
  | { type: 'rule' };

export function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // **bold**, __bold__, *italic*, _italic_ (no nesting)
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      runs.push({ text: text.slice(last, match.index), bold: false, italic: false });
    }
    if (match[2] !== undefined) {
      runs.push({ text: match[2], bold: true, italic: false });
    } else {
      runs.push({ text: match[4], bold: false, italic: true });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false });
  }
  return runs
    .map((run) => ({ ...run, text: stripInlineCode(run.text) }))
    .filter((run) => run.text.length > 0);
}

function stripInlineCode(text: string): string {
  // `code` and [label](target): keep only the visible text, never a link
  return text.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const indent = rawLine.match(/^\s*/)?.[0].replace(/\t/g, '  ').length ?? 0;
    const depth = Math.min(3, Math.floor(indent / 2));
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, runs: parseInline(heading[2].replace(/\s+#+$/, '')) });
      continue;
    }

    if (/^([-*_])\s*\1\s*\1[\s\-*_]*$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: 'bullet', depth, runs: parseInline(bullet[1]) });
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      blocks.push({ type: 'numbered', depth, number: Number(numbered[1]), runs: parseInline(numbered[2]) });
      continue;
    }

    // Table rows become plain paragraphs with cells separated by " | "
    if (/^\|.*\|$/.test(trimmed)) {
      flushParagraph();
      if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      blocks.push({ type: 'paragraph', runs: parseInline(cells.join('  |  ')) });
      continue;
    }

    paragraph.push(trimmed.replace(/^>\s?/, ''));
  }
  flushParagraph();
  return blocks;
}
