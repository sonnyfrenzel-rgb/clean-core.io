'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Touch on a pannable, zoomable map — the one gesture model every custom
 * canvas shares (the reading map, the modeller, the Design drawing and the
 * legacy Documentation flow).
 *
 * The libraries underneath move only with a mouse: bpmn-js pans on a mouse drag
 * and zooms on the wheel, and a scroll box zooms not at all. On a phone that
 * left a map nobody could move with a finger (owner 03.10.2026). The model:
 *
 *   - **Inline**, on the page: a vertical swipe scrolls the **page**, always —
 *     a map 420 px tall on a 700 px screen must never trap the reader.
 *     A sideways swipe pans the map (a process reads left to right, so that is
 *     the direction it overflows). Two fingers pan freely and pinch to zoom.
 *     `touch-action: pan-y` hands vertical swipes to the browser and keeps
 *     the rest here; the browser's own pinch zoom of the page is off on the map.
 *   - **Full screen**: the map is all there is, so one finger pans in every
 *     direction (`touch-action: none`). Two fingers pinch.
 *   - **Double tap** on the background fits — the same as the *Fit* button.
 *     A tap on a node stays a tap on the node.
 *
 * Only `pointerType === 'touch'` is read: the mouse, the pen and the keyboard
 * keep exactly what each canvas did before. A gesture that moved swallows the
 * click that may follow it, so panning never opens a node.
 */
export interface TouchViewport {
  /** Move the content by screen pixels: a finger moving right moves the drawing right. */
  pan(dx: number, dy: number): void;
  /** Scale by `factor` around a point in the element's own pixels (0,0 = its top left). */
  zoom(factor: number, x: number, y: number): void;
  /** Back to the fitted view. */
  fit(): void;
}

export interface TouchViewportOptions {
  /** Full screen: one finger pans in every direction. */
  free?: boolean;
  /** Off: no listeners and no `touch-action` — the element behaves as before. */
  enabled?: boolean;
  /** A double tap on (or inside) an element matching this does not fit. */
  ignoreDoubleTap?: string;
  /** Changes when the element behind the ref is replaced, so the listeners move with it. */
  rebind?: unknown;
}

/** Movement below this is a tap, not a pan (px). */
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 32;

/** The `touch-action` the model asks for — exported for the spec. */
export function touchActionFor(free: boolean): 'none' | 'pan-y' {
  return free ? 'none' : 'pan-y';
}

interface Point {
  x: number;
  y: number;
}

export function useTouchViewport(
  target: React.RefObject<HTMLElement | null>,
  viewport: TouchViewport,
  { free = false, enabled = true, ignoreDoubleTap, rebind }: TouchViewportOptions = {},
): void {
  // The handlers close over component state that changes every render; the
  // listeners must not be re-bound for it, or a gesture in flight would lose
  // its pointers.
  const current = useRef(viewport);
  useEffect(() => {
    current.current = viewport;
  });

  useEffect(() => {
    const el = target.current;
    if (!el || !enabled) return undefined;
    const touchAction = touchActionFor(free);
    // Through methods, not property writes: the element belongs to the caller.
    const before = el.style.getPropertyValue('touch-action');
    el.style.setProperty('touch-action', touchAction);
    el.setAttribute('data-touch-viewport', free ? 'free' : 'inline');

    const pointers = new Map<number, Point>();
    let start: Point | null = null;
    let moved = false;
    /** Inline, a swipe that starts vertical is the page's: the map leaves it alone to its end. */
    let pageOwns = false;
    let lastTap: { t: number; x: number; y: number } | null = null;
    let swallowUntil = 0;

    const local = (p: Point): Point => {
      const box = el.getBoundingClientRect();
      return { x: p.x - box.left, y: p.y - box.top };
    };
    const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        start = { x: event.clientX, y: event.clientY };
        moved = false;
        pageOwns = false;
      } else {
        pageOwns = false;
        // A second finger is never a tap.
        moved = true;
      }
    };

    const onMove = (event: PointerEvent) => {
      const was = pointers.get(event.pointerId);
      if (!was) return;
      const now = { x: event.clientX, y: event.clientY };
      if (pointers.size === 1) {
        if (pageOwns) return;
        if (!moved) {
          if (!start || dist(now, start) < TAP_SLOP) return;
          moved = true;
          if (!free && Math.abs(now.y - start.y) > Math.abs(now.x - start.x)) {
            pageOwns = true;
            return;
          }
        }
        current.current.pan(now.x - was.x, now.y - was.y);
        pointers.set(event.pointerId, now);
        return;
      }
      // Two fingers: the first two down drive the gesture.
      const ids = [...pointers.keys()].slice(0, 2);
      if (!ids.includes(event.pointerId)) {
        pointers.set(event.pointerId, now);
        return;
      }
      const other = pointers.get(ids[0] === event.pointerId ? ids[1] : ids[0])!;
      const midBefore = mid(was, other);
      const midAfter = mid(now, other);
      const spanBefore = dist(was, other);
      const spanAfter = dist(now, other);
      pointers.set(event.pointerId, now);
      current.current.pan(midAfter.x - midBefore.x, midAfter.y - midBefore.y);
      if (spanBefore > 0 && spanAfter > 0) {
        const at = local(midAfter);
        current.current.zoom(spanAfter / spanBefore, at.x, at.y);
      }
    };

    const onEnd = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (event.type === 'pointercancel') {
        // The browser took the gesture (a vertical swipe scrolls the page).
        lastTap = null;
        return;
      }
      if (moved) {
        swallowUntil = event.timeStamp + 500;
        lastTap = null;
        if (pointers.size === 0) start = null;
        return;
      }
      if (pointers.size > 0) return;
      const t = event.timeStamp;
      const ignored = ignoreDoubleTap && event.target instanceof Element && event.target.closest(ignoreDoubleTap);
      if (lastTap && t - lastTap.t < DOUBLE_TAP_MS && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE && !ignored) {
        lastTap = null;
        current.current.fit();
        return;
      }
      lastTap = ignored ? null : { t, x: event.clientX, y: event.clientY };
    };

    const onClickCapture = (event: MouseEvent) => {
      if (event.timeStamp <= swallowUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
      swallowUntil = 0;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      if (before) el.style.setProperty('touch-action', before);
      else el.style.removeProperty('touch-action');
      el.removeAttribute('data-touch-viewport');
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [target, enabled, free, ignoreDoubleTap, rebind]);
}
