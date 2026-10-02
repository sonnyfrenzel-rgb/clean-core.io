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

import { ANCHOR_FONT, LABEL_FONT } from '@/lib/bpmn/layout';

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
  // Floored: from the start of the level (top left), as the reading map does.
  canvas.viewbox({ x: inner.x - MARGIN / scale, y: inner.y - MARGIN / scale, width, height });
}

/** Dispatched (bubbling) on the map's frame after a step was chosen in full screen. */
export const MAP_REVEAL_EVENT = 'cc-map-reveal';

export const ANCHOR_STYLE = `font-size:${ANCHOR_FONT}px;line-height:${Math.ceil(ANCHOR_FONT * 1.2)}px`;
