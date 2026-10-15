/**
 * Lines of a code pane, measured in the DOM (roadmap 3.0.14, item 6).
 *
 * A pane is a scroll container holding one `CcCodeSurface` (`components/cc/CodeSurface.tsx`), which
 * renders every source line as one `[data-cc-code-line]` element in order. Offsets are read from those
 * elements rather than from an assumed line height, so a changed font size or padding cannot drift.
 * Browser-only; the mapping of lines to units is `scroll-sync.ts`.
 */

function lineElements(pane: HTMLElement): HTMLElement[] {
  return Array.from(pane.querySelectorAll<HTMLElement>('[data-cc-code-surface] [data-cc-code-line]'));
}

/** The top of an element in the pane's scroll coordinates. */
function topIn(pane: HTMLElement, el: HTMLElement): number {
  return el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
}

/** The 1-based number of the topmost visible line (1 when the pane shows no lines). */
export function topVisibleLine(pane: HTMLElement): number {
  const lines = lineElements(pane);
  if (!lines.length) return 1;
  // The last line whose top is at or above the pane's top edge; binary search, the lines are in order.
  const edge = pane.scrollTop + 1;
  let lo = 0;
  let hi = lines.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (topIn(pane, lines[mid]) <= edge) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found + 1;
}

/** Scroll the pane so that line `line` (1-based) stands at its top. */
export function scrollLineToTop(pane: HTMLElement, line: number, behavior: ScrollBehavior): void {
  const lines = lineElements(pane);
  const el = lines[Math.min(Math.max(line, 1), lines.length) - 1];
  if (!el) return;
  pane.scrollTo({ top: Math.max(0, topIn(pane, el)), behavior });
}
