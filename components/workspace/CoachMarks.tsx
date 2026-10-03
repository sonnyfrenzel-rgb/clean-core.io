'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { coachPositionLabel, wt } from '@/lib/workspace-messages';
import {
  COACH_WIDTH,
  coachTargetFor,
  placeCoachMark,
  scrollToShow,
  type CoachPlacement,
  type CoachMark,
  type CoachMarkId,
  type CoachRect,
} from '@/lib/coach-marks';

/**
 * One coach mark, anchored to the thing it is about — `DESIGN.md` §6.2,
 * mockups s1 and s9.
 *
 * **Beside its target, never over it.** A dark popover with an arrow, "1 of 3",
 * *Next* and *Dismiss all*. The element is found by
 * `data-coach-target="<mark id>"` anywhere on the page — the map's decision
 * points, the not-determined summary, the "Next step" card put it on whatever
 * currently stands for them — and, where nothing carries one, the block that
 * follows this slot. Where the popover goes is decided by
 * `placeCoachMark` in `lib/coach-marks.ts`: below the target, else beside it, else
 * above it — the first place with room that covers neither the target nor the
 * page's primary action. The tip used to sit under the target's title, inside
 * the target, and covered the very text it pointed at (owner review after the
 * start build-up). It moves with that element on resize, fold and font change
 * (a `ResizeObserver`), and when a mark appears the page scrolls so that the
 * mark and its target are both in view.
 *
 * **In the flow above a target with no free side.** The process map fills the
 * screen; its tip stands right above it (`form="inline"`) and covers nothing.
 *
 * **A bottom sheet on S.** On a phone a floating bubble covers the very thing
 * it explains, so the mark is a sheet pinned to the bottom of the viewport,
 * and the target is scrolled into the part of the screen the sheet leaves
 * free.
 *
 * **In the flow for the keyboard.** The popover and the sheet stay in the DOM
 * right where their slot is, so Tab reaches them where the reader is — the
 * half a portal always forgets.
 *
 * **One at a time** (§6.1.2), decided once per screen by
 * `hooks/useCoachMarks.ts`. The state is in this browser and only here
 * (ADR-036): no account field, no database, no usage record.
 */

/** The element the mark is about, and the line in it the arrow points at. */
function findTarget(slotEl: HTMLElement | null, id: CoachMarkId): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const named = coachTargetFor(id);
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

const rectOf = (r: DOMRect): CoachRect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

/** The page's primary actions in view — a tip must not stand over them. */
function primaryActions(popover: HTMLElement | null): CoachRect[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-cc-button="primary"]'))
    .filter((el) => !popover?.contains(el))
    .map((el) => rectOf(el.getBoundingClientRect()))
    .filter((r) => r.width > 0 && r.height > 0);
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The sticky shell bar — nothing scrolled "into view" may end up under it. */
function stickyTop(): number {
  const bar = document.querySelector<HTMLElement>('header');
  const r = bar?.getBoundingClientRect();
  return r && r.top <= 1 && r.bottom > 0 ? r.bottom : 0;
}

export default function CoachMarkNote({
  mark,
  slot,
  form = 'float',
  onDismiss,
  onDismissAll,
}: {
  mark: CoachMark | null;
  /** Which place on the page is asking. */
  slot: CoachMarkId;
  /**
   * `float` — placed beside its target (`placeCoachMark`), a bottom sheet on a
   * phone. `inline` — in the flow, right above the target the slot stands
   * before, at every width: for a target such as the process map, which fills
   * the screen and has no free side, and whose steps a floating tip would
   * cover and take the clicks of.
   */
  form?: 'float' | 'inline';
  onDismiss: (id: CoachMarkId) => void;
  onDismissAll: () => void;
}) {
  const isS = useBreakpointS();
  const slotRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const [place, setPlace] = useState<(CoachPlacement & { top: number; left: number }) | null>(null);
  const showing = mark !== null && mark.id === slot;
  const inline = form === 'inline';

  const measure = useCallback(() => {
    const slotEl = slotRef.current;
    const pop = popRef.current;
    if (!slotEl || !mark || !pop) return;
    const target = findTarget(slotEl, mark.id);
    if (!target) {
      setPlace({ top: 0, left: 0, arrow: 24, side: 'below' });
      return;
    }
    const origin = slotEl.getBoundingClientRect();
    const placed = placeCoachMark({
      target: rectOf(target.getBoundingClientRect()),
      point: rectOf(pointOf(target).getBoundingClientRect()),
      popover: { width: Math.min(COACH_WIDTH, pop.offsetWidth || COACH_WIDTH), height: pop.offsetHeight },
      avoid: primaryActions(pop),
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight, top: stickyTop(), scrollY: window.scrollY },
    });
    // The popover is positioned in the slot, so the viewport placement is
    // taken relative to the slot's own corner.
    const next = { ...placed, top: placed.top - origin.top, left: placed.left - origin.left };
    setPlace((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.arrow === next.arrow && prev.side === next.side ? prev : next,
    );
  }, [mark]);

  useLayoutEffect(() => {
    if (!showing || isS || inline) return undefined;
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
  }, [showing, isS, inline, measure, slot]);

  // Once per mark: bring the mark and its target into view together. The page
  // may still be settling when a mark appears (the map fits itself, a fold
  // opens), so the check runs again twice within the first second and a half
  // — and only then; after that the reader's own scrolling is left alone.
  const timers = useRef<number[]>([]);
  useEffect(() => {
    // The reader takes over: no further correction once they scroll, touch or type.
    const stop = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    return () => {
      stop();
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, []);
  useEffect(() => {
    if (!showing || !mark) {
      // Gone — "Show tips again" brings it back, and then it scrolls again.
      scrolledFor.current = null;
      return;
    }
    const key = `${mark.id}:${isS ? 's' : 'l'}`;
    if (scrolledFor.current === key) return;
    if (!isS && !inline && !place) return;
    if (!findTarget(slotRef.current, mark.id) || !popRef.current) return;
    scrolledFor.current = key;
    const bringIntoView = (behavior: ScrollBehavior) => {
      const target = findTarget(slotRef.current, mark.id);
      const pop = popRef.current;
      if (!target || !pop || scrolledFor.current !== key) return;
      const by = scrollToShow({
        target: rectOf(target.getBoundingClientRect()),
        popover: rectOf(pop.getBoundingClientRect()),
        sheet: isS && !inline,
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight, top: stickyTop(), scrollY: window.scrollY },
      });
      if (by !== 0) window.scrollBy({ top: by, behavior });
    };
    bringIntoView(reducedMotion() ? 'auto' : 'smooth');
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [800, 1500].map((ms) => window.setTimeout(() => bringIntoView('auto'), ms));
  }, [showing, mark, isS, inline, place]);

  if (!mark || !showing) return null;

  const counter = mark.position && mark.total ? coachPositionLabel(mark.position, mark.total) : null;
  const last = mark.position !== undefined && mark.total !== undefined && mark.position >= mark.total;

  if (inline) {
    return (
      <div ref={slotRef} data-coach-slot={slot} className="pb-3">
        <div
          ref={popRef}
          data-coach-mark={mark.id}
          data-coach-form="inline"
          role="note"
          aria-label={mark.title}
          className="relative max-w-xl rounded-cc-card bg-cc-surface-dark p-4 text-cc-on-dark shadow-cc-dialog"
        >
          <span aria-hidden={true} className="absolute -bottom-1 left-6 h-3 w-3 rotate-45 bg-cc-surface-dark" />
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
                className="inline-flex min-h-11 items-center bg-transparent text-[13px] font-semibold text-cc-on-dark underline-offset-2 hover:underline sm:min-h-8"
              >
                {wt('coach.dismissAll')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (isS) {
    return (
      <div ref={slotRef} data-coach-slot={slot}>
        <div
          ref={popRef}
          data-coach-mark={mark.id}
          data-coach-form="sheet"
          role="note"
          aria-label={mark.title}
          className="fixed inset-x-4 bottom-4 z-cc-overlay flex flex-col gap-2 rounded-cc-card bg-cc-surface-dark px-4 py-3 text-cc-on-dark shadow-cc-dialog"
        >
          <span className="flex items-start gap-2">
            <span aria-hidden={true} className="mt-0.5 shrink-0">
              <Lightbulb size={16} />
            </span>
            <span className="min-w-0 flex-1">
              {counter ? <span className="block text-[11px] font-semibold">{counter}</span> : null}
              <b data-coach-mark-title="" className="text-[14px] font-bold">
                {mark.title}
              </b>
              <span className="block text-[12px] leading-snug font-medium">{mark.body}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <CcButton onClick={() => onDismiss(mark.id)} data-coach-mark-dismiss={mark.id}>
              {last ? wt('coach.done') : wt('coach.next')}
            </CcButton>
            {!last ? (
              <button
                type="button"
                onClick={onDismissAll}
                data-coach-mark-dismiss-all=""
                className="inline-flex min-h-11 items-center bg-transparent text-[13px] font-semibold text-cc-on-dark underline-offset-2 hover:underline"
              >
                {wt('coach.dismissAll')}
              </button>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

  const arrowStyle: React.CSSProperties =
    place?.side === 'above'
      ? { left: `${place.arrow}px`, bottom: '-4px' }
      : place?.side === 'right'
        ? { top: `${place.arrow}px`, left: '-4px' }
        : place?.side === 'left'
          ? { top: `${place.arrow}px`, right: '-4px' }
          : { left: `${place?.arrow ?? 24}px`, top: '-4px' };

  return (
    <div ref={slotRef} className="relative h-0" data-coach-slot={slot}>
      <div
        ref={popRef}
        data-coach-mark={mark.id}
        data-coach-form="popover"
        data-coach-side={place?.side}
        role="note"
        aria-label={mark.title}
        style={{
          top: place ? `${place.top}px` : 0,
          left: place ? `${place.left}px` : 0,
          width: `${COACH_WIDTH}px`,
          visibility: place ? 'visible' : 'hidden',
        }}
        className="absolute z-20 max-w-[calc(100vw-2rem)] rounded-cc-card bg-cc-surface-dark p-4 text-cc-on-dark shadow-cc-dialog"
      >
        <span aria-hidden={true} style={arrowStyle} className="absolute h-3 w-3 rotate-45 bg-cc-surface-dark" />
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

