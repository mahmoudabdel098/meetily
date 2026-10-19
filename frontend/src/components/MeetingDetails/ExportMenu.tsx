"use client";

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExportFormat, EXPORT_FORMAT_LABELS } from '@/lib/export/document';
import { loadExportDocument } from '@/lib/export/loadMeeting';
import { exportWithDialog } from '@/lib/export/save';

interface ExportMenuProps {
  meetingId: string;
  disabled?: boolean;
}

const FORMATS: ExportFormat[] = ['pdf', 'docx', 'md'];

/** Exports summary + transcript (with speakers) of a meeting as PDF, DOCX or Markdown. */
export function ExportMenu({ meetingId, disabled }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    setBusy(true);
    try {
      const doc = await loadExportDocument(meetingId);
      const path = await exportWithDialog(doc, format);
      if (path) {
        toast.success('Riunione esportata', { description: path });
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Esportazione non riuscita', { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="px-2 @[22rem]:px-3"
          disabled={disabled || busy}
          title="Esporta riassunto e trascrizione"
        >
          {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
          <span className="hidden @[22rem]:inline">Esporta</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Riassunto + trascrizione</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map((format) => (
          <DropdownMenuItem key={format} onSelect={() => void handleExport(format)}>
            {EXPORT_FORMAT_LABELS[format]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
