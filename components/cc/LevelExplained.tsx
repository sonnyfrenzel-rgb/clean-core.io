'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@/lib/cc-messages';
import type { CleanCoreLevelValue } from '@/lib/clean-core-level';
import { cleanCoreLevelExplanation } from '@/lib/clean-core-level-explain';
import { CcCleanCoreLevel } from './Identifier';

/**
 * A clean core level chip that says what its letter means — on hover with a
 * mouse, on keyboard focus, and on a tap or click (owner 06.10.2026: "explain
 * the level in the IT view"; and 03.10.2026: "hover only works on desktop, it
 * must be clear on mobile too").
 *
 * The chip stays `CcCleanCoreLevel` — same rectangle, same colour, same letter;
 * this only puts it inside a button and adds the explanation. The words are
 * not written here: `cleanCoreLevelExplanation` reads them from `ABCD_META`
 * (aligned to SAP's clean core level concept) and the glossary's caveat.
 *
 * Mechanics:
 *   - the explanation is always in the DOM (hidden while closed) and the button
 *     points at it with `aria-describedby`, so a screen reader hears it on
 *     focus without opening anything;
 *   - a mouse hover or a keyboard focus (`:focus-visible`) shows it; a tap or a
 *     click pins it open, a second tap or a tap outside closes it — a tap does
 *     not count as hover, so a touch screen never gets a panel it cannot close;
 *   - Escape closes it and leaves the focus on the chip;
 *   - the panel is placed `fixed` from the chip's position, so a table that
 *     scrolls sideways (`CcTable`) does not clip it;
 *   - the target is 24 px tall, 44 px on a phone and under a coarse pointer
 *     (`DESIGN.md` §2.9), like `CcWhyPopover`.
 *   - on paper (roadmap 3.0.6) only the chip prints: the panel is `print:hidden`
 *     even when it was open, and the button gives up its 44 px target, so a
 *     printed table or one-pager keeps its rows. The print sheet prints the
 *     same words as a legend (`WorkspacePrintSheet`).
 *
 * `trigger` replaces the chip with the caller's own mark (the level counts of
 * the IT view's figure, "C 2"), which then is the button's content.
 */
export function CcCleanCoreLevelExplained({
  value,
  withLabel = false,
  trigger,
}: {
  value: CleanCoreLevelValue;
  withLabel?: boolean;
  trigger?: React.ReactNode;
}) {
  const explanation = cleanCoreLevelExplanation(value);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = pinned || hovered || focused;

  const closeAll = useCallback(() => {
    setPinned(false);
    setHovered(false);
    setFocused(false);
  }, []);

  const measure = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + 4;
    const top = panelHeight > 0 && below + panelHeight > window.innerHeight - 8 && rect.top - panelHeight - 4 > 8
      ? rect.top - panelHeight - 4
      : below;
    setPlace({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeAll();
      buttonRef.current?.focus();
    };
    // `pointerdown`, so a tap outside closes it as well as a click.
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeAll();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, closeAll, measure]);

  return (
    <span className="inline-flex align-middle" data-cc-level-explained={value}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-describedby={id}
        data-cc-level-trigger={value}
        onClick={() => {
          // A click that follows a hover keeps the panel open (pinned); a
          // second click closes it, whatever opened it.
          if (pinned) closeAll();
          else setPinned(true);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setHovered(false);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setFocused(true);
        }}
        onBlur={(event) => {
          setFocused(false);
          // A tap on the panel itself (to read it) moves the focus there; it stays open.
          if (panelRef.current?.contains(event.relatedTarget as Node | null)) return;
          setPinned(false);
        }}
        className={
          'inline-flex min-h-6 cursor-help items-center rounded-[4px] border-0 bg-transparent p-0 text-left text-inherit ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus ' +
          'max-[600px]:min-h-11 pointer-coarse:min-h-11 print:min-h-0 print:cursor-auto ' +
          (trigger ? 'w-full justify-center' : '')
        }
      >
        {trigger ?? <CcCleanCoreLevel value={value} withLabel={withLabel} />}
        <span className="sr-only">{`, ${t('level.whatItMeans')}`}</span>
      </button>
      <span
        ref={panelRef}
        id={id}
        role="tooltip"
        tabIndex={-1}
        hidden={!open}
        data-cc-level-explanation={value}
        style={place ? { top: place.top, left: place.left } : undefined}
        className="fixed z-cc-popover block print:hidden w-72 max-w-[calc(100vw-2rem)] rounded-cc-card border border-cc-line bg-cc-surface p-3 text-left whitespace-normal shadow-cc-dialog focus:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus"
      >
        <span className="block text-[13px] leading-snug font-semibold text-cc-ink">{explanation.title}</span>
        <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink">{explanation.meaning}</span>
        {explanation.atc ? (
          <span className="mt-2 block text-[11px] leading-snug font-medium text-cc-ink-muted">{explanation.atc}</span>
        ) : null}
        <span className="mt-1 block text-[11px] leading-snug font-medium text-cc-ink-muted">{explanation.caveat}</span>
        <span className="mt-1 block text-[11px] leading-snug font-medium text-cc-ink-muted">{explanation.source}</span>
      </span>
    </span>
  );
}

export default CcCleanCoreLevelExplained;
