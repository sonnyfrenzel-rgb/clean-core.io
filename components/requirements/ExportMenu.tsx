'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { BookOpenText, ChevronDown, Download, FileText, Printer } from 'lucide-react';
import CcButton from '@/components/cc/Button';

/**
 * The specification's ways out behind one "Export" button — Word, Markdown,
 * a Confluence page, Print / PDF — so the toolbar stays one row on a phone.
 *
 * A disclosure, not an ARIA `menu` (the Tools menu's reasoning, roadmap
 * 3.0.4): four plain buttons in a panel, reached with Tab; Escape closes it
 * and gives the focus back to "Export", as does picking one. A click outside
 * closes it too.
 */
export type ExportKind = 'docx' | 'md' | 'html' | 'print';

const ITEMS: Array<{ kind: ExportKind; label: string; hint: string; icon: React.ReactNode }> = [
  { kind: 'docx', label: 'Word', hint: '.docx with title page and contents', icon: <FileText size={16} aria-hidden={true} /> },
  { kind: 'md', label: 'Markdown', hint: '.md, the same document as text', icon: <Download size={16} aria-hidden={true} /> },
  { kind: 'html', label: 'Confluence', hint: 'a page to paste or upload', icon: <BookOpenText size={16} aria-hidden={true} /> },
  { kind: 'print', label: 'Print / PDF', hint: 'the document alone, from the browser', icon: <Printer size={16} aria-hidden={true} /> },
];

export default function ExportMenu({ onExport }: { onExport: (kind: ExportKind) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <CcButton
        ref={buttonRef}
        variant="ghost"
        icon={<Download size={16} aria-hidden={true} />}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        data-spec-export-menu=""
      >
        Export
        <ChevronDown size={14} aria-hidden={true} />
      </CcButton>
      {open ? (
        <div
          id={panelId}
          data-spec-export-panel=""
          className="absolute left-0 z-cc-popover mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
        >
          {ITEMS.map((item) => (
            <span key={item.kind} className="flex flex-col gap-1">
              <CcButton
                variant="ghost"
                icon={item.icon}
                data-spec-export={item.kind}
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                  onExport(item.kind);
                }}
              >
                {item.label}
              </CcButton>
              <span className="pl-1 text-[12px] font-semibold text-cc-ink-muted">{item.hint}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
