'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import type { CoachMark, CoachMarkId } from '@/lib/coach-marks';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { coachPositionLabel, wt } from '@/lib/workspace-messages';

/**
 * One coach mark, anchored to the thing it is about — `DESIGN.md` §6.2,
 * mockups s1 and s9.
 *
 * **Anchored, from L up.** A dark popover with an arrow, "1 of 3", *Next* and
 * *Dismiss all*, placed directly under the title of the element it names. The
 * element is found by `data-coach-target="<mark id>"` anywhere on the page —
 * the map's decision, the not-determined summary, the "Next step" card put it
 * on whatever currently stands for them — and, where nothing carries one, the
 * block that follows this slot. The popover moves with that element on
 * resize, fold and font change (a `ResizeObserver`), so it never points at a
 * place the element has left.
 *
 * **A strip on S.** `DESIGN.md` §2.9: *"Coach Marks erscheinen auf S als ein
 * Hinweis-Strip, nicht als schwebende Blasen"* — on a phone a floating bubble
 * covers the very thing it explains.
 *
 * **In the flow for the keyboard.** The popover is positioned absolutely but
 * stays in the DOM right before its element, so Tab reaches it exactly where
 * the reader is — the half a `position: fixed` bubble always forgets.
 *
 * **One at a time** (§6.1.2), decided once per screen by
 * `hooks/useCoachMarks.ts`. The state is in this browser and only here
 * (ADR-036): no account field, no database, no usage record.
 */
const GAP = 12;
const WIDTH = 320;

/** The element the mark is about, and the line in it the arrow points at. */
function findTarget(slotEl: HTMLElement | null, id: CoachMarkId): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const named = document.querySelector<HTMLElement>(`[data-coach-target="${id}"]`);
  if (named) return named;
  // The slot is wrapped (`cc-no-print`); the block it introduces is the next one.
  const wrapper = slotEl?.parentElement;
  return (wrapper?.nextElementSibling as HTMLElement | null) ?? null;
}

function pointOf(target: HTMLElement): HTMLElement {
  // The title, when the element has one: the arrow points at the name of the
  // thing, not at the middle of a card.
  return target.querySelector<HTMLElement>('h2, h3, [data-coach-point]') ?? target;
}

export default function CoachMarkNote({
  mark,
  slot,
  onDismiss,
  onDismissAll,
}: {
  mark: CoachMark | null;
  /** Which place on the page is asking. */
  slot: CoachMarkId;
  onDismiss: (id: CoachMarkId) => void;
  onDismissAll: () => void;
}) {
  const isS = useBreakpointS();
  const slotRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; arrow: number } | null>(null);
  const showing = mark !== null && mark.id === slot;

  const measure = useCallback(() => {
    const slotEl = slotRef.current;
    if (!slotEl || !mark) return;
    const target = findTarget(slotEl, mark.id);
    if (!target) {
      setPlace({ top: 0, left: 0, arrow: 24 });
      return;
    }
    const origin = slotEl.getBoundingClientRect();
    const point = pointOf(target).getBoundingClientRect();
    const container = slotEl.parentElement?.parentElement?.getBoundingClientRect() ?? origin;
    // Under the title, starting at its left edge, never wider than the block.
    const maxLeft = Math.max(0, container.right - origin.left - WIDTH);
    const left = Math.min(Math.max(0, point.left - origin.left), maxLeft);
    const top = point.bottom - origin.top + GAP;
    const arrow = Math.min(Math.max(16, point.left - origin.left - left + 16), WIDTH - 24);
    setPlace((prev) =>
      prev && prev.top === top && prev.left === left && prev.arrow === arrow ? prev : { top, left, arrow },
    );
  }, [mark]);

  useLayoutEffect(() => {
    if (!showing || isS) return undefined;
    measure();
    const target = findTarget(slotRef.current, slot);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    if (target && observer) observer.observe(target);
    if (observer && document.body) observer.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showing, isS, measure, slot]);

  if (!mark || !showing) return null;

  const counter = mark.position && mark.total ? coachPositionLabel(mark.position, mark.total) : null;
  const last = mark.position !== undefined && mark.total !== undefined && mark.position >= mark.total;

  if (isS) {
    return (
      <div
        data-coach-mark={mark.id}
        data-coach-form="strip"
        role="note"
        aria-label={mark.title}
        className="mb-2 flex flex-wrap items-start gap-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2"
      >
        <span aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information">
          <Lightbulb size={16} />
        </span>
        <span className="min-w-0 flex-1">
          {counter ? <span className="block text-[11px] font-semibold text-cc-ink-muted">{counter}</span> : null}
          <b data-coach-mark-title="" className="text-[13px] font-semibold text-cc-ink">
            {mark.title}
          </b>
          <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">{mark.body}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <CcButton onClick={() => onDismiss(mark.id)} data-coach-mark-dismiss={mark.id}>
            {last ? wt('coach.done') : wt('coach.next')}
          </CcButton>
          {!last ? (
            <CcButton onClick={onDismissAll} data-coach-mark-dismiss-all="">
              {wt('coach.dismissAll')}
            </CcButton>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div ref={slotRef} className="relative h-0" data-coach-slot={slot}>
      <div
        data-coach-mark={mark.id}
        data-coach-form="popover"
        role="note"
        aria-label={mark.title}
        style={{
          top: place ? `${place.top}px` : 0,
          left: place ? `${place.left}px` : 0,
          width: `${WIDTH}px`,
          visibility: place ? 'visible' : 'hidden',
        }}
        className="absolute z-20 max-w-[calc(100vw-2rem)] rounded-cc-card bg-cc-surface-dark p-4 text-cc-on-dark shadow-cc-dialog"
      >
        <span
          aria-hidden={true}
          style={{ left: `${place?.arrow ?? 24}px` }}
          className="absolute -top-1 h-3 w-3 rotate-45 bg-cc-surface-dark"
        />
        {counter ? <p className="m-0 text-[11px] font-semibold">{counter}</p> : null}
        <p className="m-0 mt-1 text-[15px] font-bold">
          <b data-coach-mark-title="" className="font-bold">
            {mark.title}
          </b>
        </p>
        <p className="m-0 mt-1 text-[13px] leading-snug font-medium">{mark.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CcButton onClick={() => onDismiss(mark.id)} data-coach-mark-dismiss={mark.id}>
            {last ? wt('coach.done') : wt('coach.next')}
          </CcButton>
          {!last ? (
            <button
              type="button"
              onClick={onDismissAll}
              data-coach-mark-dismiss-all=""
              className="inline-flex min-h-8 items-center bg-transparent text-[13px] font-semibold text-cc-on-dark underline-offset-2 hover:underline"
            >
              {wt('coach.dismissAll')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
