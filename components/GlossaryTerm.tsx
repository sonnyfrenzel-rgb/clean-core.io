'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { GLOSSARY_ITEMS, glossarySourceText } from '@/lib/glossary';
import { glossaryAnswerText } from '@/lib/glossary-lookup';
import { cn } from '@/lib/utils';

interface GlossaryTermProps {
  termKey: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * A named glossary term in a stage — `DESIGN.md` §2.10 ("Glossar im Text") and
 * §6.1 (ADR-034), block D step D.8.
 *
 * The same pattern as `GlossaryMention` in `components/workspace/GlossaryText.tsx`,
 * so a term looks and behaves the same in the workspace and in a stage: a real
 * `<button>` with a dotted underline in the text colour (no link style — a
 * glossary term is not navigation), `aria-expanded`/`aria-controls`, Enter or a
 * click opens it, Escape closes it and gives the focus back, a click elsewhere
 * dismisses it (UX-045). The body is `glossaryAnswerText` — the same text the
 * ⌘K dialog and the assistant print — and under it the source line.
 *
 * What this component had before and keeps: the category, the full term, the
 * short name, the definition and the Clean Core implication (both inside the
 * answer text). What it no longer has: the separate phone bottom sheet with a
 * blurred full-screen backdrop. On a phone the same popover is pinned to the
 * bottom of the viewport instead, so it cannot run off the side of the screen,
 * and it stays non-modal like the desktop one.
 *
 * The popover ignores inherited `white-space: nowrap` and upper case, because
 * callers put terms inside tags and column heads that set both.
 */
export default function GlossaryTerm({ termKey, children, className }: GlossaryTermProps) {
  const item = GLOSSARY_ITEMS[termKey];
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [close, open]);

  if (!item) {
    return <span className={className}>{children || termKey}</span>;
  }

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-glossary-term={item.shortName}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((was) => !was);
        }}
        className={cn(
          'cursor-help border-0 bg-transparent p-0 text-left font-[inherit] text-inherit underline decoration-dotted decoration-from-font underline-offset-2',
          className,
        )}
      >
        {children || item.shortName}
      </button>
      {open ? (
        <span
          role="tooltip"
          id={id}
          data-glossary-popover=""
          className={cn(
            'z-40 block rounded-cc-card border border-cc-field-border bg-cc-surface p-3 text-left whitespace-normal normal-case tracking-normal shadow-cc-dialog',
            // Phone: pinned to the bottom of the viewport, full width minus the gutter.
            'max-md:fixed max-md:inset-x-4 max-md:bottom-4',
            // Wider screens: above the term, like GlossaryMention.
            'md:absolute md:bottom-full md:left-0 md:mb-2 md:w-72',
          )}
        >
          <span className="block cc-text-label text-cc-ink-muted">{item.category}</span>
          <span className="mt-1 block cc-text-h3 text-cc-ink">{item.term}</span>
          {item.shortName && item.shortName !== item.term ? (
            <span className="block cc-text-meta text-cc-ink-muted">Short name: {item.shortName}</span>
          ) : null}
          <span data-glossary-popover-body="" className="mt-2 block text-[13px] leading-snug font-medium text-cc-ink">
            {glossaryAnswerText(item)}
          </span>
          <span
            data-glossary-popover-source=""
            data-source-origin={item.sourceRef.origin}
            className="mt-2 block text-[11px] leading-snug font-semibold text-cc-ink-muted"
          >
            {glossarySourceText(item)}
          </span>
        </span>
      ) : null}
    </span>
  );
}
