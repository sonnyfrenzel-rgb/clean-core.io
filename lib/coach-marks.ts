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
}

export const COACH_MARKS: readonly CoachMark[] = Object.freeze([
  Object.freeze({
    id: 'decision' as const,
    title: 'Select the decision',
    body: 'A decision carries the condition as your code writes it, and the lines it stands on.',
  }),
  Object.freeze({
    id: 'not-determined' as const,
    title: 'This is what we could not determine',
    body: 'Each open point names the construct, the reason the engine could not judge it, and its line.',
  }),
  Object.freeze({
    id: 'next-step' as const,
    title: 'Your next step',
    body: 'The stage that comes next, taken from this project rather than from a fixed order.',
  }),
]);

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
   * The order the tour takes on this screen, when it is not the default. The
   * tour starts where the reader is (v3.0.1, owner review of the IT view): in
   * IT the *Not determined* count and "Next step" stand at the top and the
   * decision far below, so IT leads with those two. Marks not named keep their
   * default order after the named ones.
   */
  order?: readonly CoachMarkId[];
}

export function availableCoachMarks(context: CoachMarkContext): readonly CoachMark[] {
  const order = context.order ?? [];
  const rank = (id: CoachMarkId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length + COACH_MARK_IDS.indexOf(id) : i;
  };
  return [...COACH_MARKS].sort((a, b) => rank(a.id) - rank(b.id)).filter((mark) => {
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
