/**
 * What the first screen asks of a reader, counted the way the accepted Analyze
 * mockup v4.1 counted it (plan `docs/design/analyze-business-first-plan.md`
 * §1.2, AB-0): the controls a reader can press, the primary buttons among them,
 * and the words, all within the viewport before any scroll.
 *
 * `actions` counts buttons, links, radios, tabs, switches and fields inside
 * `root`, one per control (a control nested in another counts once).
 * `shellActions` counts the same in the fixed head (`shell`), which the mockup
 * reports apart: the way back, the three views and the seven tools are there
 * on every page and say nothing about the page itself. `primary` counts
 * `[data-cc-button="primary"]`, the one filled button a region may have.
 * Words in an `svg` (the map's labels) are left out: they are the map, not
 * prose around it.
 *
 * Runs in the page with no imports: `page.evaluate(firstScreenCount, options)`.
 */
import type { Page } from '@playwright/test';

export interface FirstScreenOptions {
  /** The page's own content. The first match is counted. */
  root?: string;
  /** The fixed head of the product, counted apart. */
  shell?: string;
  /** A primary button. */
  primary?: string;
}

export interface FirstScreenCount {
  actions: number;
  shellActions: number;
  primary: number;
  words: number;
}

export const PRODUCT_FIRST_SCREEN: Required<FirstScreenOptions> = {
  root: 'main',
  shell: '[data-stage-header], [data-workspace-tools]',
  primary: '[data-cc-button="primary"]',
};

export function firstScreenCount(options: FirstScreenOptions): FirstScreenCount {
  const vh = innerHeight;
  const vw = innerWidth;
  const CONTROL = 'button, a[href], select, input:not([type=hidden]), textarea, [role=radio], [role=tab], [role=switch], [role=link]';
  /** Shown: hidden by no ancestor, faded out by none (the same rule as the words below). */
  const opacityOf = (e: Element) => {
    let o = 1;
    for (let n: Element | null = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      o *= Number(s.opacity);
    }
    return o;
  };
  /** Within the viewport on both axes, and shown. */
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0 && opacityOf(e) > 0.05;
  };
  const outermost = (els: Element[]) => els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
  const root = (options.root && document.querySelector(options.root)) || document.body;
  const shells = options.shell ? outermost([...document.querySelectorAll(options.shell)]) : [];
  const inShell = (e: Element) => shells.some((s) => s.contains(e));
  const actions = outermost([...root.querySelectorAll(CONTROL)].filter(visible).filter((e) => !inShell(e))).length;
  const shellActions = outermost(shells.flatMap((s) => [...s.querySelectorAll(CONTROL)]).filter(visible)).length;
  const primary = options.primary ? [...root.querySelectorAll(options.primary)].filter(visible).length : 0;
  let words = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (!p || p.closest('svg, script, style')) continue;
    const r = p.getBoundingClientRect();
    if (r.width && r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0 && opacityOf(p) > 0.05) words += (walker.currentNode.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  }
  return { actions, shellActions, primary, words };
}

export async function countFirstScreen(page: Page, options: FirstScreenOptions = PRODUCT_FIRST_SCREEN): Promise<FirstScreenCount> {
  return page.evaluate(firstScreenCount, options);
}
