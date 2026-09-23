'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { findGlossaryMentions, glossaryAnswerText } from '@/lib/glossary-lookup';
import { glossarySourceText, type GlossaryItem } from '@/lib/glossary';

/**
 * The underlined Fachwort and its popover — `DESIGN.md` §6.1 ("Glossar im
 * Text" and "Glossar in „Ask this case‟", ADR-034), roadmap 6.6.
 *
 *   > *unterstrichenes Fachwort, Erklärung per Tastatur erreichbar: höchstens
 *   > zwei Sätze, „What it means for your decision", bei SAP-Begriffen die
 *   > Quelle*
 *
 * **Keyboard reachable is the whole point, so the trigger is a button.** The
 * product already had a glossary tooltip (`components/GlossaryTerm.tsx`), but
 * it hangs its explanation off a `<span onClick>`: no tab stop, no `Enter`, no
 * `Escape`, nothing announced. That is a mouse feature wearing a help feature's
 * clothes. Here the trigger is a real `<button type="button">` with
 * `aria-expanded` and `aria-controls`, `Escape` closes it and gives the focus
 * back, and a click anywhere else dismisses it.
 *
 * **Two sentences, then where they come from.** The body is exactly what the
 * entry says — `glossaryAnswerText` is the same text the ⌘K dialog and the
 * assistant print, so the same word cannot mean two things in two places — and
 * under it the source line, which for an SAP term this repository can cite
 * names the catalog, and for one it cannot says *Source not recorded* with the
 * reason. Nothing here composes prose, and nothing here calls a model: both
 * strings come back from pure functions before the first render finishes.
 */

function Popover({ item, id }: { item: GlossaryItem; id: string }) {
  return (
    <span
      role="tooltip"
      id={id}
      data-glossary-popover=""
      className="absolute bottom-full left-0 z-50 mb-1.5 block w-72 max-w-[min(18rem,80vw)] rounded-cc border border-cc-field-border bg-cc-surface p-3 text-left shadow-lg"
    >
      <span className="block text-[10px] font-semibold tracking-wide text-cc-ink-muted uppercase">
        {item.category}
      </span>
      <span className="mt-0.5 block text-[12px] font-semibold text-cc-ink">{item.term}</span>
      <span data-glossary-popover-body="" className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink">
        {glossaryAnswerText(item)}
      </span>
      <span
        data-glossary-popover-source=""
        data-source-origin={item.sourceRef.origin}
        className="mt-1.5 block text-[11px] leading-snug font-semibold text-cc-ink-muted"
      >
        {glossarySourceText(item)}
      </span>
    </span>
  );
}

export function GlossaryMention({ item, children }: { item: GlossaryItem; children: React.ReactNode }) {
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

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-glossary-term={item.shortName}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((was) => !was)}
        className="cursor-help border-0 bg-transparent p-0 underline decoration-dotted decoration-from-font underline-offset-2"
      >
        {children}
      </button>
      {open ? <Popover item={item} id={id} /> : null}
    </span>
  );
}

/**
 * A piece of running text with every glossary term in it underlined and
 * explainable. Text that names no term renders as text — there is no wrapper
 * to see, and nothing to tab past.
 */
export default function GlossaryText({ children }: { children: string }) {
  const mentions = findGlossaryMentions(children);
  if (mentions.length === 0) return <>{children}</>;

  const parts: React.ReactNode[] = [];
  let at = 0;
  mentions.forEach((mention, i) => {
    if (mention.start > at) parts.push(children.slice(at, mention.start));
    parts.push(
      <GlossaryMention key={`${mention.key}-${i}`} item={mention.item}>
        {children.slice(mention.start, mention.end)}
      </GlossaryMention>,
    );
    at = mention.end;
  });
  if (at < children.length) parts.push(children.slice(at));

  return <>{parts}</>;
}
