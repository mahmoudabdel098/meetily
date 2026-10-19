import {
  ExportDocument,
  ExportFormat,
  formatDocumentDate,
  listSpeakers,
} from './document';
import { MarkdownBlock, parseMarkdown, TextRun } from './markdownBlocks';

const LABELS = {
  date: 'Data',
  participants: 'Partecipanti',
  summary: 'Riassunto',
  transcript: 'Trascrizione',
  noSummary: 'Nessun riassunto generato.',
  noTranscript: 'Nessuna trascrizione disponibile.',
};

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function toMarkdown(doc: ExportDocument): string {
  const lines: string[] = [`# ${doc.title}`, '', `**${LABELS.date}:** ${formatDocumentDate(doc.createdAt)}  `];
  const speakers = listSpeakers(doc);
  if (speakers.length) {
    lines.push(`**${LABELS.participants}:** ${speakers.join(', ')}  `);
  }
  lines.push('', `## ${LABELS.summary}`, '', doc.summaryMarkdown ?? `_${LABELS.noSummary}_`, '');
  lines.push(`## ${LABELS.transcript}`, '');
  if (!doc.transcript.length) {
    lines.push(`_${LABELS.noTranscript}_`);
  }
  for (const line of doc.transcript) {
    lines.push(`${line.time} ${line.speaker ? `**${line.speaker}:** ` : ''}${line.text}  `);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

export async function toDocx(doc: ExportDocument): Promise<Uint8Array> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun: DocxRun, HeadingLevel, LevelFormat, AlignmentType } = docx;

  const runs = (items: TextRun[], extra: { color?: string } = {}) =>
    items.map((r) => new DocxRun({ text: r.text, bold: r.bold, italics: r.italic, ...extra }));

  const headingLevels = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

  const summaryParagraphs = (blocks: MarkdownBlock[]) =>
    blocks.map((block) => {
      switch (block.type) {
        case 'heading':
          return new Paragraph({ heading: headingLevels[block.level - 1], spacing: { before: 200, after: 80 }, children: runs(block.runs) });
        case 'bullet':
          return new Paragraph({ bullet: { level: block.depth }, children: runs(block.runs) });
        case 'numbered':
          return new Paragraph({
            numbering: { reference: 'summary-numbering', level: block.depth },
            children: runs(block.runs),
          });
        case 'rule':
          return new Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'BBBBBB', space: 1 } } });
        default:
          return new Paragraph({ children: runs(block.runs), spacing: { after: 120 } });
      }
    });

  const speakers = listSpeakers(doc);
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new DocxRun(doc.title)] }),
    new Paragraph({
      children: [new DocxRun({ text: `${LABELS.date}: `, bold: true }), new DocxRun(formatDocumentDate(doc.createdAt))],
    }),
    ...(speakers.length
      ? [new Paragraph({
          children: [new DocxRun({ text: `${LABELS.participants}: `, bold: true }), new DocxRun(speakers.join(', '))],
        })]
      : []),
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new DocxRun(LABELS.summary)] }),
    ...(doc.summaryMarkdown
      ? summaryParagraphs(parseMarkdown(doc.summaryMarkdown))
      : [new Paragraph({ children: [new DocxRun({ text: LABELS.noSummary, italics: true })] })]),
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new DocxRun(LABELS.transcript)] }),
    ...(doc.transcript.length
      ? doc.transcript.map((line) =>
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new DocxRun({ text: `${line.time} `, color: '888888' }),
              ...(line.speaker ? [new DocxRun({ text: `${line.speaker}: `, bold: true })] : []),
              new DocxRun(line.text),
            ],
          }))
      : [new Paragraph({ children: [new DocxRun({ text: LABELS.noTranscript, italics: true })] })]),
  ];

  const document = new Document({
    creator: '',
    title: doc.title,
    numbering: {
      config: [{
        reference: 'summary-numbering',
        levels: [0, 1, 2, 3].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * The built-in PDF fonts use WinAnsi encoding: accented Latin letters work,
 * but typographic quotes, dashes and emoji must be replaced or dropped.
 */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●▪]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\u0009\u000A\u000D -~ -ÿ€]/g, '');
}

export async function toPdf(doc: ExportDocument): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const margin = 56;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  /** Writes runs with word wrapping, switching font style per run */
  const writeRuns = (
    items: TextRun[],
    opts: { size: number; indent?: number; prefix?: string; color?: [number, number, number]; after?: number },
  ) => {
    const lineHeight = opts.size * 1.35;
    const left = margin + (opts.indent ?? 0);
    const width = maxWidth - (opts.indent ?? 0);
    pdf.setFontSize(opts.size);
    pdf.setTextColor(...(opts.color ?? [20, 20, 20]));

    const words: { text: string; bold: boolean; italic: boolean }[] = [];
    if (opts.prefix) words.push({ text: opts.prefix, bold: false, italic: false });
    for (const run of items) {
      for (const part of toWinAnsi(run.text).split(/(\s+)/)) {
        if (part) words.push({ text: part, bold: run.bold, italic: run.italic });
      }
    }

    const styleOf = (w: { bold: boolean; italic: boolean }) =>
      w.bold && w.italic ? 'bolditalic' : w.bold ? 'bold' : w.italic ? 'italic' : 'normal';

    ensureSpace(lineHeight);
    let x = left;
    for (const word of words) {
      pdf.setFont('helvetica', styleOf(word));
      const isSpace = /^\s+$/.test(word.text);
      const w = pdf.getTextWidth(word.text);
      if (!isSpace && x + w > left + width && x > left) {
        y += lineHeight;
        ensureSpace(lineHeight);
        x = left;
      }
      if (isSpace && x === left) continue;
      pdf.text(word.text, x, y, { baseline: 'top' });
      x += w;
    }
    y += lineHeight + (opts.after ?? 4);
  };

  const plain = (text: string, bold = false): TextRun[] => [{ text, bold, italic: false }];

  writeRuns(plain(doc.title, true), { size: 20, after: 8 });
  writeRuns([{ text: `${LABELS.date}: `, bold: true, italic: false }, ...plain(formatDocumentDate(doc.createdAt))], { size: 10 });
  const speakers = listSpeakers(doc);
  if (speakers.length) {
    writeRuns([{ text: `${LABELS.participants}: `, bold: true, italic: false }, ...plain(speakers.join(', '))], { size: 10 });
  }
  y += 10;

  writeRuns(plain(LABELS.summary, true), { size: 15, after: 6 });
  if (doc.summaryMarkdown) {
    for (const block of parseMarkdown(doc.summaryMarkdown)) {
      switch (block.type) {
        case 'heading':
          y += 4;
          writeRuns(block.runs.map((r) => ({ ...r, bold: true })), { size: [14, 12.5, 11.5][block.level - 1], after: 4 });
          break;
        case 'bullet':
          writeRuns(block.runs, { size: 10.5, indent: 14 + block.depth * 14, prefix: '-  ' });
          break;
        case 'numbered':
          writeRuns(block.runs, { size: 10.5, indent: 14 + block.depth * 14, prefix: `${block.number}.  ` });
          break;
        case 'rule':
          ensureSpace(10);
          pdf.setDrawColor(190);
          pdf.line(margin, y + 4, pageWidth - margin, y + 4);
          y += 12;
          break;
        default:
          writeRuns(block.runs, { size: 10.5, after: 6 });
      }
    }
  } else {
    writeRuns([{ text: LABELS.noSummary, bold: false, italic: true }], { size: 10.5 });
  }

  y += 10;
  writeRuns(plain(LABELS.transcript, true), { size: 15, after: 6 });
  if (!doc.transcript.length) {
    writeRuns([{ text: LABELS.noTranscript, bold: false, italic: true }], { size: 10.5 });
  }
  for (const line of doc.transcript) {
    writeRuns(
      [
        ...(line.speaker ? [{ text: `${line.speaker}: `, bold: true, italic: false }] : []),
        ...plain(line.text),
      ],
      { size: 10, prefix: `${line.time}  `, after: 2 },
    );
  }

  // Page numbers
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`${i} / ${pages}`, pageWidth - margin, pageHeight - 30, { align: 'right' });
  }

  pdf.setProperties({ title: toWinAnsi(doc.title), creator: '', author: '' });
  return new Uint8Array(pdf.output('arraybuffer'));
}

export async function renderExport(doc: ExportDocument, format: ExportFormat): Promise<Uint8Array> {
  switch (format) {
    case 'pdf':
      return toPdf(doc);
    case 'docx':
      return toDocx(doc);
    default:
      return new TextEncoder().encode(toMarkdown(doc));
  }
}
