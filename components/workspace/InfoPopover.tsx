'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { infoAboutLabel } from '@/lib/workspace-messages';

/**
 * A small "i" that opens one or two lines of explanation — the same text on a
 * desktop and on a phone (owner 03.10.2026: "hover only works on desktop, it
 * must be clear on mobile too").
 *
 * Not a `title` tooltip and not a hover card: it opens on a click, a tap,
 * Enter or Space, and closes on a second tap, a tap outside, or Escape, which
 * hands the focus back to the "i". The target follows `DESIGN.md` §2.9 the way
 * `CcWhyPopover` does: the ring stays 24 px, the button around it grows to
 * 44 × 44 on a phone and under a coarse pointer, with negative margins so the
 * row does not grow. It is a disclosure (`aria-expanded`), not a dialog with a
 * focus trap: the text is short and has nothing to operate.
 *
 * Its text arrives as props from a `lib/` source that is guarded on its own
 * (the phase purposes in `lib/workflow-steps.ts`, the measure's definition in
 * `lib/standard-fit.ts`).
 */
export default function InfoPopover({
  subject,
  children,
  align = 'left',
  hook,
  label,
}: {
  /** What the text is about — "Analyze". Goes into the accessible name: "About Analyze". */
  subject: string;
  children: React.ReactNode;
  /** Which edge of the "i" the panel lines up with — `right` near the end of a row. */
  align?: 'left' | 'right';
  /** A `data-` hook for specs, put on the button. */
  hook?: string;
  /**
   * Visible words instead of the "i" — "What the tools do". The words are then
   * the button's name, and the panel is wider: it holds a list, not a line.
   */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    // `pointerdown` rather than `mousedown`, so a tap outside closes it as well.
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      {label ? (
        <button
          ref={buttonRef}
          type="button"
          data-info-popover={hook ?? ''}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-6 items-center gap-1 bg-transparent p-0 text-[12px] font-semibold text-cc-ink underline underline-offset-2 max-[600px]:min-h-11 pointer-coarse:min-h-11"
        >
          {label}
          <ChevronDown size={12} aria-hidden={true} className={open ? 'rotate-180' : undefined} />
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          data-info-popover={hook ?? ''}
          aria-label={infoAboutLabel(subject)}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((v) => !v)}
          className={
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent p-0 ' +
            'max-[600px]:-m-2.5 max-[600px]:h-11 max-[600px]:w-11 pointer-coarse:-m-2.5 pointer-coarse:h-11 pointer-coarse:w-11'
          }
        >
          <span
            aria-hidden={true}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cc-ink-muted font-cc-mono text-[11px] leading-none font-bold text-cc-ink-muted"
          >
            i
          </span>
        </button>
      )}
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="note"
          data-info-popover-panel={hook ?? ''}
          className={cn(
            'absolute top-full z-cc-popover mt-1 max-w-[calc(100vw-2rem)] rounded-cc-card border border-cc-line bg-cc-surface p-3 text-left text-[12px] leading-snug font-medium text-cc-ink shadow-cc-dialog',
            label ? 'w-96' : 'w-64',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
