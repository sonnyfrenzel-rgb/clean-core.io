/**
 * The layout check of the accepted Analyze mockup v4.1 (plan
 * `docs/design/analyze-business-first-plan.md`, AB-0), lifted out of the
 * mockup's own screenshot script so the product is held to the rule the
 * mockup was accepted under: nothing covers anything.
 *
 * Four findings, as in the mockup run:
 *
 *   - **overlaps** — two visible items whose boxes intersect by more than 2 px
 *     in both directions, neither containing the other;
 *   - **clipped** — an item cut by an `overflow: hidden/clip` ancestor or by an
 *     `svg`, standing outside the viewport sideways, a button, link or heading
 *     whose own text is cut, or an item outside the box it must stay within
 *     (`within`). Content a scroll container cuts is reachable by scrolling: it
 *     is counted as `scrollCut`, not as clipping;
 *   - **focusOut** — a focused element (a tour station, a selection) that is not
 *     wholly inside its frame (the map card);
 *   - **overflowX** — the page scrolls sideways by this many pixels.
 *
 * The mockup checked its own classes (`.card`, `.mapcard`, `svg.map text`).
 * The product checks `data-*` hooks instead, so a class rename never turns the
 * guard blind: `[data-layout-item]` marks a box that must not be covered,
 * `[data-layout-frame]` the map card a focus must stay inside,
 * `[data-layout-focus]` a focused element, `[data-layout-ignore]` a subtree
 * the check skips (a drag preview, a decorative layer). Interactive elements,
 * headings and text blocks are always items. A caller can pass its own
 * selectors — the negative probe runs the check on the mockup itself.
 *
 * Runs in the page with no imports: `page.evaluate(layoutCheck, options)`.
 */
import type { Page } from '@playwright/test';

export interface LayoutCheckOptions {
  /** The boxes that must not cover each other. */
  items?: string;
  /** Subtrees left out of the check. */
  ignore?: string;
  /** Two items in the same `group` but different `part`s may overlap: a name swapping in over the one it replaces. */
  sameSlot?: { group: string; part: string } | null;
  /** Each item matching `items` must sit inside one box matching `boxes` within the same `scope` (a map label in its lane). */
  within?: { scope: string; items: string; boxes: string }[];
  /** Every `targets` element must sit wholly inside the first visible `frame`. */
  focus?: { frame: string; targets: string } | null;
  /** Pixels two boxes may share before they count as overlapping. */
  tolerance?: number;
}

export interface LayoutReport {
  overlaps: string[];
  clipped: string[];
  focusOut: string[];
  scrollCut: number;
  items: number;
  overflowX: number;
}

/** The product's contract: `data-layout-*` hooks plus every control, heading and text block. */
export const PRODUCT_LAYOUT: Required<Omit<LayoutCheckOptions, 'sameSlot'>> & { sameSlot: LayoutCheckOptions['sameSlot'] } = {
  items:
    '[data-layout-item], [data-layout-frame], button, a[href], [role=radio], [role=tab], [role=switch], h1, h2, h3, h4, p, li, td, th',
  ignore: '[data-layout-ignore], [aria-hidden="true"], script, style, template',
  sameSlot: { group: '[data-layout-swap]', part: '[data-layout-swap-part]' },
  within: [],
  focus: { frame: '[data-layout-frame]', targets: '[data-layout-focus]' },
  tolerance: 2,
};

/**
 * The check itself. Self-contained on purpose: Playwright serialises it into
 * the page, so it may not close over anything from this module.
 */
export function layoutCheck(options: LayoutCheckOptions): LayoutReport {
  const ITEMS = options.items ?? '';
  const IGNORE = options.ignore ?? '';
  const TOL = options.tolerance ?? 2;
  const vw = document.documentElement.clientWidth;
  type Box = { l: number; t: number; r: number; b: number };

  const opacity = (e: Element): number => {
    let o = 1;
    for (let n: Element | null = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      o *= Number(s.opacity);
    }
    return o;
  };
  const clipAncestors = (e: Element) => {
    const out: { n: Element; scroll: boolean }[] = [];
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      const svg = n.tagName.toLowerCase() === 'svg';
      if (svg || s.overflowX !== 'visible' || s.overflowY !== 'visible') out.push({ n, scroll: !svg && /(auto|scroll)/.test(s.overflowX + s.overflowY) });
    }
    return out;
  };
  const describe = (e: Element): string => {
    const text = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    if (e.tagName.toLowerCase() === 'text') return `text"${text}"`;
    const hook = [...e.attributes].map((a) => a.name).find((n) => n.startsWith('data-')) || '';
    const cls = typeof (e as HTMLElement).className === 'string' ? (e as HTMLElement).className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${hook ? `[${hook}]` : cls ? `.${cls}` : ''}${text ? `"${text}"` : ''}`;
  };
  const inside = (r: Box | DOMRect, q: DOMRect) =>
    ('l' in r ? r.l : r.left) >= q.left - 1 &&
    ('r' in r ? r.r : r.right) <= q.right + 1 &&
    ('t' in r ? r.t : r.top) >= q.top - 1 &&
    ('b' in r ? r.b : r.bottom) <= q.bottom + 1;

  const items: { e: Element; box: Box }[] = [];
  const clipped: string[] = [];
  let scrollCut = 0;
  for (const e of ITEMS ? document.querySelectorAll(ITEMS) : []) {
    if (IGNORE && e.closest(IGNORE)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (opacity(e) < 0.05) continue;
    let box: Box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let hidden = false;
    for (const a of clipAncestors(e)) {
      const q = a.n.getBoundingClientRect();
      if (inside(box, q)) continue;
      const visible = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) };
      if (visible.r - visible.l < 1 || visible.b - visible.t < 1) {
        hidden = true;
        break;
      }
      if (a.scroll) scrollCut++;
      else clipped.push(`${describe(e)} clipped by ${describe(a.n).slice(0, 40)}`);
      box = visible;
    }
    if (hidden) continue;
    if (box.l < -1 || box.r > vw + 1) clipped.push(`${describe(e)} outside the viewport`);
    if (e.matches('button, a, h1, h2, h3, h4') && getComputedStyle(e).overflow !== 'visible' && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1) {
      clipped.push(`${describe(e)} text cut`);
    }
    items.push({ e, box });
  }

  const slot = options.sameSlot;
  const sameSlot = (a: Element, b: Element) => {
    if (!slot) return false;
    const ga = a.closest(slot.group);
    if (!ga || ga !== b.closest(slot.group)) return false;
    const pa = a.closest(slot.part);
    const pb = b.closest(slot.part);
    return !!pa && !!pb && pa !== pb;
  };
  const overlaps: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i];
      const B = items[j];
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const w = Math.min(A.box.r, B.box.r) - Math.max(A.box.l, B.box.l);
      const h = Math.min(A.box.b, B.box.b) - Math.max(A.box.t, B.box.t);
      if (w <= TOL || h <= TOL) continue;
      if (sameSlot(A.e, B.e)) continue;
      overlaps.push(`${describe(A.e)} × ${describe(B.e)} (${Math.round(w)}×${Math.round(h)})`);
    }
  }

  for (const rule of options.within ?? []) {
    for (const scope of document.querySelectorAll(rule.scope)) {
      const boxes = [...scope.querySelectorAll(rule.boxes)].map((b) => b.getBoundingClientRect());
      if (!boxes.length) continue;
      for (const t of scope.querySelectorAll(rule.items)) {
        if (opacity(t) < 0.05) continue;
        const r = t.getBoundingClientRect();
        if (!boxes.some((q) => inside(r, q))) clipped.push(`${describe(t)} outside its part of the map`);
      }
    }
  }

  const focusOut: string[] = [];
  if (options.focus) {
    const frame = [...document.querySelectorAll(options.focus.frame)].find((f) => opacity(f) >= 0.05);
    if (frame) {
      const q = frame.getBoundingClientRect();
      for (const t of document.querySelectorAll(options.focus.targets)) {
        if (opacity(t) < 0.05) continue;
        if (!inside(t.getBoundingClientRect(), q)) focusOut.push(describe(t));
      }
    }
  }

  return {
    overlaps,
    clipped,
    focusOut,
    scrollCut,
    items: items.length,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

/** Runs the check on the page as it stands; the product's hooks unless told otherwise. */
export async function measureLayout(page: Page, options: LayoutCheckOptions = PRODUCT_LAYOUT): Promise<LayoutReport> {
  return page.evaluate(layoutCheck, options);
}

/** Zero of everything the rule forbids. `scrollCut` and `items` are information, not findings. */
export function layoutClean(report: LayoutReport): boolean {
  return report.overlaps.length === 0 && report.clipped.length === 0 && report.focusOut.length === 0 && report.overflowX <= 0;
}

/** One line per measured state, as the mockup run printed it. */
export function layoutLine(name: string, report: LayoutReport): string {
  return `${name}: overlaps=${report.overlaps.length} clipped=${report.clipped.length} focusOut=${report.focusOut.length} overX=${report.overflowX} scrollCut=${report.scrollCut} items=${report.items}`;
}
