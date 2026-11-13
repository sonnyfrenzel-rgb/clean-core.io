/**
 * What the read-only map and the modeller share about **how** bpmn-js draws —
 * the type, the fit and the line anchors. Kept in one place so the two cannot
 * drift: a reader switching into editing must see the same picture.
 *
 * - **Type on the product's scale.** bpmn-js draws in Arial 12/11 by default;
 *   here every name is the page's own face at 12 px (`DESIGN.md` meta step), and
 *   the layout measured exactly that (`lib/bpmn/text-metrics.ts`).
 * - **A fit that leaves the diagram readable.** `fit-viewport` shrinks a wide
 *   level until nothing can be read. The fit here keeps a margin, never zooms
 *   past 100 %, and never below a floor; a level wider than that opens at its
 *   start and scrolls.
 * - **The line anchor under every name** (`L182`), as an overlay — bpmn-js
 *   has no second text line, and the layout reserved the room for it.
 */

import { ANCHOR_FONT, LABEL_FONT, TASK_PADDING } from '@/lib/bpmn/layout';
import { wrapText } from '@/lib/bpmn/text-metrics';

export interface ViewboxCanvas {
  viewbox(): { inner: { x: number; y: number; width: number; height: number }; outer: { width: number; height: number } };
  viewbox(box: { x: number; y: number; width: number; height: number }): void;
}

/** The font the page renders in, for bpmn-js's text measuring and drawing. */
export function textRendererConfig(host: HTMLElement) {
  const family = getComputedStyle(host).fontFamily || 'Inter, Arial, sans-serif';
  return {
    defaultStyle: { fontFamily: family, fontSize: LABEL_FONT, fontWeight: 'normal', lineHeight: 1.2 },
    externalStyle: { fontSize: LABEL_FONT },
  };
}

/**
 * Lines and names in the product's ink rather than bpmn-js black — read from
 * the tokens at run time, so the canvas follows `DESIGN.md` §1 with no literal.
 */
export function rendererColors(host: HTMLElement) {
  const style = getComputedStyle(host);
  const token = (name: string) => style.getPropertyValue(name).trim() || undefined;
  return {
    defaultStrokeColor: token('--cc-ink'),
    defaultLabelColor: token('--cc-ink'),
    defaultFillColor: token('--cc-surface'),
  };
}

const MARGIN = 24;
const MIN_SCALE = 0.8;

/** Fit the level into the canvas with a margin; never above 100 %, never below a readable floor. */
export function fitWithPadding(canvas: ViewboxCanvas): void {
  const { inner, outer } = canvas.viewbox();
  if (!inner.width || !inner.height || !outer.width || !outer.height) return;
  const fit = Math.min((outer.width - 2 * MARGIN) / inner.width, (outer.height - 2 * MARGIN) / inner.height);
  const scale = Math.max(MIN_SCALE, Math.min(1, fit));
  const width = outer.width / scale;
  const height = outer.height / scale;
  const fits = fit >= MIN_SCALE;
  // Centred when it fits; from its start (top left) when it does not.
  const x = fits ? inner.x + inner.width / 2 - width / 2 : inner.x - MARGIN / scale;
  const y = fits && inner.height * scale <= outer.height - 2 * MARGIN ? inner.y + inner.height / 2 - height / 2 : inner.y - MARGIN / scale;
  canvas.viewbox({ x, y, width, height });
}

/** Below this canvas width (a phone) the whole-process fit stops at {@link NARROW_MIN_SCALE}. */
export const NARROW_CANVAS = 640;
/** The smallest scale a phone opens at — 40 %, where the names can still be read. */
export const NARROW_MIN_SCALE = 0.4;

/**
 * The whole level in the canvas — what the Documentation map opens with (owner
 * 02.10.2026: "see the whole process"), and the same overview the editor's
 * *Fit* gives. Never above 100 %; the + button is there for reading the names
 * of a wide process. On a phone-wide canvas it never goes below 40 % (owner:
 * navigable, and 20 % is not readable): a level that does not fit then opens
 * at its start, and the reader pans or zooms out.
 */
export function fitWhole(canvas: ViewboxCanvas): void {
  const { inner, outer } = canvas.viewbox();
  if (!inner.width || !inner.height || !outer.width || !outer.height) return;
  const fit = Math.min(1, (outer.width - 2 * MARGIN) / inner.width, (outer.height - 2 * MARGIN) / inner.height);
  if (fit <= 0) return;
  const floor = outer.width < NARROW_CANVAS ? NARROW_MIN_SCALE : 0;
  const scale = Math.max(floor, fit);
  const width = outer.width / scale;
  const height = outer.height / scale;
  if (scale === fit) {
    canvas.viewbox({ x: inner.x + inner.width / 2 - width / 2, y: inner.y + inner.height / 2 - height / 2, width, height });
    return;
  }
  // Floored: from the start of the level, as the reading map does — from its
  // top, and across the whole width where the width fits at the floor (a
  // phone's narrow layout, ADR-072 amended 04.10.2026), else from its left.
  const across = inner.width * scale <= outer.width - 2 * MARGIN;
  const x = across ? inner.x + inner.width / 2 - width / 2 : inner.x - MARGIN / scale;
  canvas.viewbox({ x, y: inner.y - MARGIN / scale, width, height });
}

/**
 * The height an inline canvas this wide needs to show the level whole from top
 * to bottom at the phone's floor, or null where the floor does not apply (a
 * canvas from {@link NARROW_CANVAS} up) or the level is no taller than `base`.
 * Inline a vertical swipe scrolls the page and never pans the map
 * (`useTouchViewport`), so a level cut at the canvas's bottom edge could only
 * be read further in full screen; the canvas grows instead and the page
 * scrolls, as the accepted mockup v4.1 draws the phone's map (plan
 * `docs/design/analyze-business-first-plan.md` N2: scroll, do not shrink).
 * Depends on the width alone, so growing does not change the answer, and never
 * above `ceiling`.
 */
export function flooredLevelHeight(
  inner: { width: number; height: number },
  canvasWidth: number,
  base: number,
  ceiling: number,
): number | null {
  if (!inner.width || !inner.height || canvasWidth <= 0 || canvasWidth >= NARROW_CANVAS) return null;
  const scale = Math.max(NARROW_MIN_SCALE, Math.min(1, (canvasWidth - 2 * MARGIN) / inner.width));
  const needed = Math.ceil(inner.height * scale + 2 * MARGIN);
  if (needed <= base) return null;
  return Math.min(needed, Math.max(base, ceiling));
}

/**
 * The widest drawing, in BPMN units, a canvas this wide shows across at the
 * phone's floor — what the phone's narrow layout is laid out for.
 */
export function phoneFitWidth(canvasWidth: number): number {
  return (canvasWidth - 2 * MARGIN) / NARROW_MIN_SCALE;
}

/** Dispatched (bubbling) on the map's frame after a step was chosen in full screen. */
export const MAP_REVEAL_EVENT = 'cc-map-reveal';

export const ANCHOR_STYLE = `font-size:${ANCHOR_FONT}px;line-height:${Math.ceil(ANCHOR_FONT * 1.2)}px`;

/** What `placeAnchor` needs of bpmn-js's overlays service and of a shape. */
export interface AnchorOverlays {
  add(element: string, type: string, overlay: { position: { top: number; left: number }; html: HTMLElement; scale?: boolean }): string;
}

export interface AnchorShape {
  id: string;
  width?: number;
  height?: number;
  label?: { id: string; width?: number; height?: number };
  businessObject?: { name?: string };
}

/**
 * The line anchor under an element's name (`L182`), with a phase's counted
 * fact above it — inside an activity at its foot, under the external label of
 * an event or a gateway. The layout left the room. One function, so the
 * reading map and the home page's slice of the demo map draw it alike.
 */
export function placeAnchor(overlays: AnchorOverlays, shape: AnchorShape, anchor: string, fact?: string | null): void {
  const tag = document.createElement('span');
  tag.className = 'cc-map-anchor';
  tag.setAttribute('aria-hidden', 'true');
  if (fact && !shape.label) {
    const factEl = document.createElement('span');
    factEl.className = 'cc-map-fact';
    factEl.textContent = fact;
    tag.appendChild(factEl);
  }
  const code = document.createElement('span');
  code.className = 'cc-map-anchor-code';
  code.textContent = anchor;
  tag.appendChild(code);
  const label = shape.label;
  const width = shape.width ?? 0;
  const height = shape.height ?? 0;
  if (label && label.width && label.height) {
    tag.style.width = `${label.width}px`;
    overlays.add(label.id, 'cc-anchor', { position: { top: label.height, left: 0 }, scale: true, html: tag });
  } else if (width > 60) {
    // Right under the name, which bpmn-js centres in the box.
    const lines = wrapText(shape.businessObject?.name ?? '', width - 2 * TASK_PADDING, LABEL_FONT, true).length;
    tag.style.width = `${width}px`;
    overlays.add(shape.id, 'cc-anchor', {
      position: { top: Math.round(height / 2 + (lines * LABEL_FONT * 1.2) / 2 + 1), left: 0 },
      scale: true,
      html: tag,
    });
  }
}
