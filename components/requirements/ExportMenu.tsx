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
 *
 * Since roadmap 3.0.7 ("Documentation lean") the Documentation stage uses the
 * same menu for its five ways out, with its own `items`, its own data
 * attributes on the trigger and a `note` under the buttons — one control
 * instead of seven buttons in three places.
 */
export type ExportKind = 'docx' | 'md' | 'html' | 'print';

/** One way out: what it is, what it holds, and the attributes a spec or a reader's tool finds it by. */
export interface ExportMenuItem<K extends string = ExportKind> {
  kind: K;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** `data-*` and `aria-*` attributes for the item's button. */
  attrs?: Record<string, string | undefined>;
}

const ITEMS: Array<ExportMenuItem<ExportKind>> = [
  { kind: 'docx', label: 'Word', hint: '.docx with title page and contents', icon: <FileText size={16} aria-hidden={true} /> },
  { kind: 'md', label: 'Markdown', hint: '.md, the same document as text', icon: <Download size={16} aria-hidden={true} /> },
  { kind: 'html', label: 'Confluence', hint: 'a page to paste or upload', icon: <BookOpenText size={16} aria-hidden={true} /> },
  { kind: 'print', label: 'Print / PDF', hint: 'the document alone, from the browser', icon: <Printer size={16} aria-hidden={true} /> },
];

export default function ExportMenu<K extends string = ExportKind>({
  onExport,
  items,
  triggerAttrs,
  note,
  align = 'start',
}: {
  onExport: (kind: K) => void;
  /** The ways out; the specification's four when absent. */
  items?: Array<ExportMenuItem<K>>;
  /** `data-*` attributes for the "Export" button — the specification's when absent. */
  triggerAttrs?: Record<string, string>;
  /** What stands under the buttons, visible once the menu is open — caveats, never on hover. */
  note?: React.ReactNode;
  /** `end`: the panel opens leftwards from the button's right edge on a wide screen — for a menu at the right of a header. */
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const list = (items ?? (ITEMS as unknown as Array<ExportMenuItem<K>>));

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
        {...(triggerAttrs ?? { 'data-spec-export-menu': '' })}
      >
        Export
        <ChevronDown size={14} aria-hidden={true} />
      </CcButton>
      {open ? (
        <div
          id={panelId}
          data-spec-export-panel=""
          className={`absolute ${align === 'end' ? 'left-0 md:left-auto md:right-0' : 'left-0'} z-cc-popover mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog`}
        >
          {list.map((item) => (
            <span key={item.kind} className="flex flex-col gap-1">
              <CcButton
                variant="ghost"
                icon={item.icon}
                data-spec-export={item.kind}
                {...(item.attrs ?? {})}
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
          {note ? <div className="flex flex-col gap-1 border-t border-cc-line pt-2">{note}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
