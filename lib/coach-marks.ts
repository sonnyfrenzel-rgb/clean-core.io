/**
 * The three coach marks of the first workspace — `DESIGN.md` §6.2, roadmap 2.7.
 *
 *   > *"Three coach marks on the first workspace — "Select the decision", "This
 *   > is what we could not determine", "Your next step". Dismissible, remembered
 *   > **only in the browser** — never in the account, never in the database, no
 *   > usage log (ADR-036). "Show tips again" in the help menu brings them
 *   > back."*
 *
 * **Where the state lives, and why it is not the account.** ADR-036 is a
 * decision, not an implementation detail: Sonny's words in the register are
 * *"coach in the browser, don't collect data in the DB"*, and the consequence is
 * spelled out there too — a second device shows the three tips once more, which
 * costs one click. So this is `localStorage`, and there is deliberately no
 * profile field, no API route and no Firestore write anywhere in this file.
 * Storing it on `users/{uid}` would be a usage record of what a person has
 * read, which is the thing the decision refuses.
 *
 * Every access is wrapped: a private window, blocked site data, a quota error
 * and a thumbnail capture all throw or return nothing, and a coach mark is not
 * worth a broken page. The failure direction is "show the tips", because a tip
 * shown twice is a nuisance and a tip that cannot be dismissed is a trap — so
 * dismissal is also written through a `try`, and a write that fails means the
 * mark comes back on the next visit rather than never leaving this one.
 *
 * **A mark that points at nothing is a claim.** `availableCoachMarks` takes what
 * the screen actually has: no decision in this source means no "Select the
 * decision". The tip is not rewritten to fit — it is left out.
 */

export const COACH_MARK_IDS = ['decision', 'not-determined', 'next-step'] as const;

export type CoachMarkId = (typeof COACH_MARK_IDS)[number];

export interface CoachMark {
  id: CoachMarkId;
  /** The invitation, word for word from `DESIGN.md` §6.2. */
  title: string;
  /** One sentence of why it is worth doing. Never a second invitation. */
  body: string;
  /**
   * Where this mark stands among the ones this screen offers — "1 of 3".
   * Set by `hooks/useCoachMarks.ts` on the mark it hands out; counted over the
   * marks that have something to point at, so a screen with two shows "of 2".
   */
  position?: number;
  total?: number;
  /**
   * The reader moved the tour here — "Next" on the mark before, or "Show tips
   * again". Only then may the page scroll to this mark. A mark that simply
   * appears (the first one on a first visit) leaves the page where the reader
   * is: the tour once scrolled a phone past "Your next step" to the map, twice,
   * a second after the first tip appeared (owner, 04.10.2026).
   */
  follow?: boolean;
}

export const COACH_MARKS: readonly CoachMark[] = Object.freeze([
  Object.freeze({
    id: 'decision' as const,
    title: 'Select the decision point',
    body: 'A decision point carries the condition as your code writes it, and the lines it stands on.',
  }),
  Object.freeze({
    id: 'not-determined' as const,
    title: 'This is what we could not determine',
    body: 'Each open point names the construct, the reason the engine could not judge it, and its line.',
  }),
  Object.freeze({
    id: 'next-step' as const,
    title: 'Your next step',
    // Owner, 03.10.2026: in Business the rules without an answer come first,
    // and the tip says so — it may not point at a confirm action the page no
    // longer offers once they are answered.
    body: 'The one thing to do next, taken from this project: the business rules without an answer first, then the stage that comes next.',
  }),
]);

/**
 * The order of the tour where a view names none: the order the Business view
 * shows them. "Next step first" (owner, 03.10.2026): Business opens with the
 * one next step, then the process — the map and its decision points — and
 * the open points at the foot. The tour reads the page the same way, so it
 * starts at the page's one primary action and never sends the reader past it.
 * `DESIGN.md` §6.2 names the three tips; this is the order they are shown in.
 */
export const COACH_MARK_TOUR_ORDER: readonly CoachMarkId[] = ['next-step', 'decision', 'not-determined'];

/**
 * The key. Not namespaced per project on purpose: the three tips teach the
 * screen, not the case, and showing them again for every new project would make
 * "dismissed" meaningless.
 */
export const COACH_MARK_STORAGE_KEY = 'cc.workspace.coachMarks.dismissed';

/** Which marks have something to point at on this screen. */
export interface CoachMarkContext {
  /** The source has at least one gateway. */
  hasDecision: boolean;
  /** The project has a next stage to name. */
  hasNextStep: boolean;
  /**
   * The order the tour takes on this screen, when it is not
   * `COACH_MARK_TOUR_ORDER`. Every view starts at its "Next step" and then
   * follows its own page: in IT the *Not determined* figure stands in the
   * answer at the top and the decision far below. Marks not named keep the
   * default order after the named ones.
   */
  order?: readonly CoachMarkId[];
  /** The marks this screen has a place for, when not all three. */
  only?: readonly CoachMarkId[];
}

export function availableCoachMarks(context: CoachMarkContext): readonly CoachMark[] {
  const order = context.order ?? [];
  const rank = (id: CoachMarkId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length + COACH_MARK_TOUR_ORDER.indexOf(id) : i;
  };
  return [...COACH_MARKS].sort((a, b) => rank(a.id) - rank(b.id)).filter((mark) => {
    if (context.only && !context.only.includes(mark.id)) return false;
    if (mark.id === 'decision') return context.hasDecision;
    if (mark.id === 'next-step') return context.hasNextStep;
    // *Not determined* is a region of the page in every state it has, including
    // "nothing was staged" — `DESIGN.md` §5.5 calls that column the reason to
    // trust the rest of the screen, so the tip always has a target.
    return true;
  });
}

function isId(value: unknown): value is CoachMarkId {
  return typeof value === 'string' && (COACH_MARK_IDS as readonly string[]).includes(value);
}

/** What this browser has dismissed. `[]` whenever storage cannot be read. */
export function readDismissedMarks(): CoachMarkId[] {
  try {
    const raw = window.localStorage.getItem(COACH_MARK_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isId) : [];
  } catch {
    return [];
  }
}

/** Records a dismissal. A storage failure is silent and costs one repeat. */
export function writeDismissedMarks(ids: readonly CoachMarkId[]): void {
  try {
    window.localStorage.setItem(COACH_MARK_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* private window, blocked site data, quota — the tips simply come back */
  }
}

/** "Show tips again" — the one way back, `DESIGN.md` §6.2. */
export function clearDismissedMarks(): void {
  try {
    window.localStorage.removeItem(COACH_MARK_STORAGE_KEY);
  } catch {
    /* nothing to undo if it was never written */
  }
}

/** The one mark to show now — never two at once (§6.1.2: *only ever one*). */
export function nextCoachMark(
  available: readonly CoachMark[],
  dismissed: readonly CoachMarkId[],
): CoachMark | null {
  return available.find((mark) => !dismissed.includes(mark.id)) ?? null;
}

/* ------------------------------------------------------------- placement */

/**
 * Where a coach mark stands on the page — beside its target, never over it.
 *
 * The tip used to sit under the target's title, inside the target, and after
 * the start build-up it covered the very text it pointed at; in the IT view it
 * covered the *Not determined* value and the *Open Design* button beside it.
 * The rule now, in this order: below the target, to its right, to its left,
 * above it — beside before above, so the tip stays at the height of what it
 * explains rather than over the text that leads to it — the first place that covers neither the target nor a primary
 * action and that stands within one screen of the target's top. If no place is
 * clean and near, the first clean one; if none is clean, below the target,
 * which by construction never covers the target itself.
 *
 * Pure: rectangles in, a rectangle out, all in viewport coordinates. The
 * component measures, this decides, and a spec can hold the decision without
 * a browser.
 */
export const COACH_WIDTH = 320;
export const COACH_GAP = 12;
const EDGE = 16;

export interface CoachRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CoachViewport {
  width: number;
  height: number;
  /** The bottom of the sticky bar — nothing counts as visible above it. */
  top: number;
  scrollY: number;
}

export type CoachSide = 'below' | 'above' | 'right' | 'left';

export interface CoachPlacement {
  side: CoachSide;
  /** Viewport coordinates of the popover's corner. */
  top: number;
  left: number;
  /** Offset of the arrow along the edge that faces the target. */
  arrow: number;
}

export function rectsIntersect(a: CoachRect, b: CoachRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export function placeCoachMark(input: {
  target: CoachRect;
  point: CoachRect;
  popover: { width: number; height: number };
  avoid: readonly CoachRect[];
  viewport: CoachViewport;
}): CoachPlacement {
  const { target: t, point, popover: p, viewport: v } = input;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), Math.max(EDGE, v.width - p.width - EDGE));
  const x = clampX(point.left);
  const arrowX = Math.min(Math.max(16, point.left - x + 16), p.width - 24);
  const sideY = Math.min(Math.max(16, point.top - t.top + 16), Math.max(16, p.height - 24));
  const candidates: CoachPlacement[] = [
    { side: 'below', top: t.top + t.height + COACH_GAP, left: x, arrow: arrowX },
    { side: 'right', top: t.top, left: t.left + t.width + COACH_GAP, arrow: sideY },
    { side: 'left', top: t.top, left: t.left - COACH_GAP - p.width, arrow: sideY },
    { side: 'above', top: t.top - COACH_GAP - p.height, left: x, arrow: arrowX },
  ];
  const box = (c: CoachPlacement): CoachRect => ({ top: c.top, left: c.left, width: p.width, height: p.height });
  const onPage = (c: CoachPlacement) => c.left >= EDGE - 0.5 && c.left + p.width <= v.width - EDGE + 0.5 && c.top + v.scrollY >= 0;
  const clean = (c: CoachPlacement) => onPage(c) && !rectsIntersect(box(c), t) && !input.avoid.some((r) => rectsIntersect(box(c), r));
  // Near: the tip and the start of its target fit on one screen together.
  const head = Math.min(t.height, 120);
  const near = (c: CoachPlacement) =>
    Math.max(c.top + p.height, t.top + head) - Math.min(c.top, t.top) <= v.height - v.top - EDGE;
  return candidates.find((c) => clean(c) && near(c)) ?? candidates.find(clean) ?? candidates[0];
}

/**
 * How far to scroll so a mark and its target are both in view — 0 when they
 * already are. On a phone the mark is a sheet over the bottom of the screen,
 * so the target is brought to the top of the part the sheet leaves free.
 * A sheet docked at the top (`dockSheet`) leaves the part under it free: the
 * target is brought to just below the sheet, never behind it.
 * Used only when the reader moved the tour on (`CoachMark.follow`).
 */
export function scrollToShow(input: {
  target: CoachRect;
  popover: CoachRect;
  sheet: boolean;
  /** Where the sheet stands; without it, read from where the popover is. */
  dock?: 'top' | 'bottom';
  viewport: CoachViewport;
}): number {
  const { target: t, popover: p, viewport: v } = input;
  const top = v.top + EDGE;
  if (input.sheet) {
    const dock = input.dock ?? (p.top + p.height / 2 < v.height / 2 ? 'top' : 'bottom');
    if (dock === 'top') {
      // The sheet's own top, wherever the popover was measured: under the sticky bar.
      const below = sheetTop(v) + p.height + COACH_GAP;
      const fits = t.top >= below && t.top + t.height <= v.height - EDGE;
      return fits ? 0 : Math.round(t.top - below);
    }
    const free = p.top - COACH_GAP;
    const fits = t.top >= top && t.top + t.height <= free;
    return fits ? 0 : Math.round(t.top - top);
  }
  const from = Math.min(t.top, p.top);
  const to = Math.max(t.top + Math.min(t.height, 120), p.top + p.height);
  if (from >= top && to <= v.height - EDGE) return 0;
  return Math.round(from - top);
}

/**
 * Where the phone's sheet stands: at the bottom of the screen, unless there it
 * would cover the mark's target or a primary action ("Your next step"'s button
 * above all) and at the top it would not. The sheet never moves the page to
 * make room — a first tip leaves the reader where they are — so it moves
 * itself instead. If neither edge is clean, the bottom.
 */
export function dockSheet(input: {
  target: CoachRect | null;
  sheetHeight: number;
  avoid: readonly CoachRect[];
  viewport: CoachViewport;
}): 'bottom' | 'top' {
  const { viewport: v, sheetHeight: h } = input;
  const width = v.width - 2 * EDGE;
  const at = (top: number): CoachRect => ({ top, left: EDGE, width, height: h });
  const covers = (box: CoachRect) =>
    (input.target !== null && rectsIntersect(box, input.target)) || input.avoid.some((r) => rectsIntersect(box, r));
  if (!covers(at(v.height - EDGE - h))) return 'bottom';
  return covers(at(sheetTop(v))) ? 'bottom' : 'top';
}

/** The top edge of a sheet docked at the top: under the sticky bar. */
export function sheetTop(viewport: CoachViewport): number {
  return viewport.top + 8;
}

/**
 * The element a mark points at: of everything carrying its
 * `data-coach-target`, the smallest one that is on screen — in IT the Not
 * determined figure of the answer rather than the whole list further down.
 */
export function coachTargetFor(id: CoachMarkId): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-coach-target="${id}"]`));
  const shown = all
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height);
  return shown[0]?.el ?? all[0] ?? null;
}
