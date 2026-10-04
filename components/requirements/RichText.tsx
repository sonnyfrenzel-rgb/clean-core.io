'use client';

import React, { useId, useRef } from 'react';
import { Bold, Code, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcIconButton from '@/components/cc/IconButton';
import { applyMark, parseRich, RICH_TEXT_LIMIT, type RichInline, type RichMark as Mark } from '@/lib/rich-text';

/**
 * The text of the requirements specification on screen, and its editor.
 *
 * `RichTextView` renders the restricted format of `lib/rich-text.ts` as React
 * elements — no HTML string, no `dangerouslySetInnerHTML`, so nothing a field
 * holds can become markup. A link opens only when its target is web or mail.
 *
 * `RichTextEditor` is a text area with a formatting bar: bold, italic, inline
 * code, a link, a bulleted and a numbered list — the five things a field may
 * hold, each also on a key (Ctrl/⌘ + B, I, E, K). What it writes is the plain
 * text format, which is what is stored and exported. Escape ends the edit
 * (and is not passed on, so a full-screen surface around it stays open).
 */

function Inline({ nodes }: { nodes: readonly RichInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === 'text') {
          const parts = n.v.split('\n');
          return (
            <React.Fragment key={i}>
              {parts.map((p, j) => (
                <React.Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  {p}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        if (n.t === 'code') {
          return (
            <code key={i} className="rounded-[4px] bg-cc-surface-muted px-1 font-cc-mono text-[12px] text-cc-ink">
              {n.v}
            </code>
          );
        }
        if (n.t === 'b') return <strong key={i} className="font-bold"><Inline nodes={n.c} /></strong>;
        if (n.t === 'i') return <em key={i}><Inline nodes={n.c} /></em>;
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-cc-information underline underline-offset-2">
            <Inline nodes={n.c} />
          </a>
        );
      })}
    </>
  );
}

export function RichTextView({
  text,
  className,
  empty = 'Not written yet.',
  ...rest
}: { text: string; className?: string; empty?: string } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  const blocks = parseRich(text);
  if (!blocks.length) {
    return (
      <div {...rest} className={cn('text-[14px] text-cc-ink-muted', className)}>
        {empty}
      </div>
    );
  }
  return (
    <div {...rest} className={cn('flex min-w-0 flex-col gap-2 text-[14px] leading-[1.55] text-cc-ink [overflow-wrap:anywhere]', className)}>
      {blocks.map((b, i) =>
        b.t === 'p' ? (
          <p key={i} className="m-0">
            <Inline nodes={b.c} />
          </p>
        ) : b.t === 'ul' ? (
          <ul key={i} className="m-0 flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline nodes={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="m-0 flex list-decimal flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline nodes={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

const TOOLS: Array<{ mark: Mark; label: string; key?: string; icon: React.ReactNode }> = [
  { mark: 'bold', label: 'Bold', key: 'b', icon: <Bold size={16} aria-hidden={true} /> },
  { mark: 'italic', label: 'Italic', key: 'i', icon: <Italic size={16} aria-hidden={true} /> },
  { mark: 'code', label: 'Inline code', key: 'e', icon: <Code size={16} aria-hidden={true} /> },
  { mark: 'link', label: 'Link', key: 'k', icon: <Link2 size={16} aria-hidden={true} /> },
  { mark: 'ul', label: 'Bulleted list', icon: <List size={16} aria-hidden={true} /> },
  { mark: 'ol', label: 'Numbered list', icon: <ListOrdered size={16} aria-hidden={true} /> },
];

export function RichTextEditor({
  label,
  value,
  onChange,
  onDone,
  rows = 4,
  limit = RICH_TEXT_LIMIT,
  help,
  autoFocus = false,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Escape. */
  onDone?: () => void;
  rows?: number;
  limit?: number;
  help?: React.ReactNode;
  autoFocus?: boolean;
} & { [data: `data-${string}`]: string | undefined }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const mark = (m: Mark) => {
    const el = ref.current;
    if (!el) return;
    const next = applyMark(value, el.selectionStart, el.selectionEnd, m);
    onChange(next.text.slice(0, limit));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-cc-ink">
        {label}
      </label>
      <div className="min-w-0 rounded-cc-row border border-cc-field-border bg-cc-surface">
        <div role="toolbar" aria-label={`Format ${label}`} aria-controls={id} className="flex flex-wrap items-center gap-1 border-b border-cc-line px-1 py-1">
          {TOOLS.map((t) => (
            <CcIconButton
              key={t.mark}
              label={t.key ? `${t.label} (Ctrl+${t.key.toUpperCase()})` : t.label}
              title={t.key ? `${t.label} (Ctrl+${t.key.toUpperCase()})` : t.label}
              data-rich-tool={t.mark}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => mark(t.mark)}
            >
              {t.icon}
            </CcIconButton>
          ))}
        </div>
        <textarea
          {...rest}
          id={id}
          ref={ref}
          rows={rows}
          value={value}
          maxLength={limit}
          autoFocus={autoFocus}
          aria-describedby={help ? `${id}-help` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onDone) {
              e.preventDefault();
              e.stopPropagation();
              onDone();
              return;
            }
            if (!(e.ctrlKey || e.metaKey)) return;
            const tool = TOOLS.find((t) => t.key === e.key.toLowerCase());
            if (tool) {
              e.preventDefault();
              mark(tool.mark);
            }
          }}
          className="block w-full resize-y rounded-b-cc-row border-0 bg-cc-surface px-3 py-2 font-cc-mono text-[13px] leading-[1.55] text-cc-ink"
        />
      </div>
      <p id={`${id}-help`} className="m-0 text-[12px] font-semibold text-cc-ink-muted">
        {help ?? 'Bold **text**, italic *text*, code `text`, a link [text](https://…), lists with "- " or "1. ".'} {value.length}/{limit}
      </p>
    </div>
  );
}
