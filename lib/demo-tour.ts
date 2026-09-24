/**
 * The tour through the demo workspace — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 *   > *„rund zwölf Stationen entlang des Wegs — Enthüllung · Not determined ·
 *   > Prozesskarte und Quellspalte · Ebenen eines großen Prozesses · eine Regel
 *   > bestätigen · Standard-Fit · IT-Kette · Management-Sicht · vier Töpfe ·
 *   > Kosten als Simulation · Entscheidung · Übergabe (Sichten in der Reihenfolge
 *   > Business · IT · Management, ADR-044). Eine Station erscheint erst, wenn man
 *   > an ihrem Ort ankommt; immer nur eine; „3 of 12" als Text; „Next", „Pause
 *   > tour", „End tour". Fortschritt nur im Browser (ADR-036)."*
 *
 * Pure, apart from the three storage functions at the bottom — so the order,
 * the one-at-a-time rule and the invitation rhythm are tested without a
 * browser (`tests/demo-tour.spec.ts`).
 *
 * **One station per place.** Every station names a `place`, and no two share
 * one: a place is a region of the demo workspace that renders a slot for the
 * tour, and a slot shows the current station only if it is that station's own.
 * That is also what "appears only when you arrive" means in code — a slot that
 * is not on the screen (another view, a map not yet built) cannot show
 * anything, so a station never floats over a place the reader cannot see.
 *
 * **No figure in a station.** The bodies explain what the place is for; the
 * place itself carries the numbers, all of them from the engine run behind the
 * demo. A count typed into a tip would be correct until the engine moves and
 * then silently wrong — the demo is regenerated with every release that changes
 * the engine (`lib/demo-release.ts`), and the tour must not need regenerating
 * with it.
 *
 * **Where the progress lives.** `localStorage` and nowhere else — the same
 * decision as the coach marks (ADR-036, `lib/coach-marks.ts`): no account
 * field, no route, no Firestore write. Every access is wrapped; a browser that
 * refuses storage starts the tour again on the next visit, which costs a click.
 */

import type { WorkspaceView } from '@/lib/workspace-model';

/** The regions of the demo workspace a station can stand in. One station each. */
export const TOUR_PLACES = [
  'reveal',
  'not-determined',
  'process-map',
  'process-levels',
  'confirm-rule',
  'standard-fit',
  'it-chain',
  'management',
  'four-buckets',
  'costs',
  'decision',
  'handover',
] as const;

export type TourPlace = (typeof TOUR_PLACES)[number];

export interface TourStation {
  /** Also the station's place — one station per place, by construction. */
  place: TourPlace;
  /** The view the place is in. Business, then IT, then Management (ADR-044). */
  view: WorkspaceView;
  title: string;
  /** One or two sentences: what the place is for. Never a number. */
  body: string;
}

export const TOUR_STATIONS: readonly TourStation[] = Object.freeze([
  {
    place: 'reveal',
    view: 'business',
    title: 'What this code decides',
    body: 'Each rule is a condition the program checks, quoted the way the code writes it, with the lines it stands on.',
  },
  {
    place: 'not-determined',
    view: 'business',
    title: 'What we could not determine',
    body: 'Every construct the engine did not judge is named here, with its reason and its line. This list is why the rest of the screen can be trusted.',
  },
  {
    place: 'process-map',
    view: 'business',
    title: 'The process map and its source',
    body: 'Select a step and its code card opens with the lines it was drawn from. The map and the step list show the same elements.',
  },
  {
    place: 'process-levels',
    view: 'business',
    title: 'Levels of a large process',
    body: 'A sub-process has its own level. Pick a level to see only its steps; the path above the map says where you are.',
  },
  {
    place: 'confirm-rule',
    view: 'business',
    title: 'Confirm a rule',
    body: 'A rule stays reconstructed until a person confirms it. Here the confirmation is kept in this browser and nowhere else.',
  },
  {
    place: 'standard-fit',
    view: 'business',
    title: 'Standard fit',
    body: 'Where SAP names a successor for an object the code uses, it is listed with its evidence level. A name without evidence is not a fit.',
  },
  {
    place: 'it-chain',
    view: 'it',
    title: 'The IT chain',
    body: 'Requirement, anchor, finding, target: select a finding to see how far its chain holds and where it stops.',
  },
  {
    place: 'management',
    view: 'management',
    title: 'The Management view',
    body: 'It starts with its answer. In the demo that answer is that nothing is signed, so a decision would bind nothing.',
  },
  {
    place: 'four-buckets',
    view: 'management',
    title: 'Four buckets',
    body: 'Retire, keep, rebuild, blocked by SAP: each object is sorted by rules that depend on the target platform. What cannot be sorted stays visible as not assigned.',
  },
  {
    place: 'costs',
    view: 'management',
    title: 'Costs are a simulation',
    body: 'No amount appears without the assumptions it rests on. The demo has none until you enter them in Economics.',
  },
  {
    place: 'decision',
    view: 'management',
    title: 'The decision',
    body: 'What a confirmation would bind, and what it would not. In the demo it binds nothing and stays in this browser.',
  },
  {
    place: 'handover',
    view: 'management',
    title: 'Handover',
    body: 'What a real handover carries, and what a demo cannot produce: a signed run, an audit pack, an export.',
  },
] as TourStation[]);

/** The invitation card, word for word from `DESIGN.md` §6.1.2. */
export const TOUR_INVITATION_TITLE = 'Your turn: start with an example (free) or your own code';
export const TOUR_INVITATION_ACTION = 'New project';
/** Where "New project" leads — the screen of roadmap 2.7 (§6.1.1). */
export const TOUR_INVITATION_HREF = '/admin/new-project';

/** *„3 of 12"* as text — never a progress bar (§3.1: no bar for what is not progress). */
export function tourPositionLabel(index: number, total: number = TOUR_STATIONS.length): string {
  return `${index + 1} of ${total}`;
}

/**
 * Whether the invitation follows the station at `index`: after every third
 * station and at the end of the tour. The last station is both on a tour of
 * twelve, and it gets one card, not two.
 */
export function invitationAfter(index: number, total: number = TOUR_STATIONS.length): boolean {
  if (index < 0 || index >= total) return false;
  return (index + 1) % 3 === 0 || index === total - 1;
}

export type TourState = 'running' | 'paused' | 'ended';

export interface TourProgress {
  /** The station the reader is at (0-based). */
  index: number;
  state: TourState;
  /** True between finishing a station that is followed by the invitation and moving on. */
  inviting: boolean;
}

export const TOUR_START: TourProgress = Object.freeze({ index: 0, state: 'running', inviting: false });

/**
 * "Next". A station that is followed by the invitation hands over to it first;
 * the invitation's own "Continue tour" is a second `next`. Past the last
 * station the tour has ended — not wrapped round to the first.
 */
export function nextStep(progress: TourProgress, total: number = TOUR_STATIONS.length): TourProgress {
  if (progress.state !== 'running') return progress;
  if (!progress.inviting && invitationAfter(progress.index, total)) {
    return { ...progress, inviting: true };
  }
  const index = progress.index + 1;
  if (index >= total) return { index: total - 1, state: 'ended', inviting: false };
  return { index, state: 'running', inviting: false };
}

export function pauseTour(progress: TourProgress): TourProgress {
  return progress.state === 'running' ? { ...progress, state: 'paused' } : progress;
}

export function resumeTour(progress: TourProgress): TourProgress {
  return progress.state === 'paused' ? { ...progress, state: 'running' } : progress;
}

export function endTour(progress: TourProgress): TourProgress {
  return { ...progress, state: 'ended', inviting: false };
}

/** What a tour slot at `place`, in `view`, renders now. */
export type TourSlot =
  | { kind: 'station'; station: TourStation; index: number; total: number }
  | { kind: 'invitation'; station: TourStation; index: number; total: number; last: boolean }
  | null;

/**
 * The one thing a slot shows — or nothing.
 *
 * At most one slot on a screen answers non-null, because a station has one
 * place and the progress names one station: that is *„immer nur eine"* as a
 * property of the function rather than of the page that calls it. The
 * invitation stands where the station it follows stood, so the reader finds it
 * where they pressed "Next".
 */
export function tourSlot(
  progress: TourProgress | null,
  place: TourPlace,
  view: WorkspaceView,
  stations: readonly TourStation[] = TOUR_STATIONS,
): TourSlot {
  if (!progress || progress.state !== 'running') return null;
  const station = stations[progress.index];
  if (!station || station.place !== place || station.view !== view) return null;
  const total = stations.length;
  if (progress.inviting) {
    return { kind: 'invitation', station, index: progress.index, total, last: progress.index === total - 1 };
  }
  return { kind: 'station', station, index: progress.index, total };
}

/** True while the tour's invitation card is on screen — the strip's link steps back then (§6.1.2). */
export function tourInvitationShowing(progress: TourProgress | null, view: WorkspaceView): boolean {
  if (!progress || progress.state !== 'running' || !progress.inviting) return false;
  return TOUR_STATIONS[progress.index]?.view === view;
}

/** Where the station the reader is at stands — for "Next" to take them there. */
export function stationOf(progress: TourProgress | null): TourStation | null {
  if (!progress || progress.state === 'ended') return null;
  return TOUR_STATIONS[progress.index] ?? null;
}

/* ------------------------------------------------------------ storage */

/** The browser key. Not per account and not per project: there is one demo. */
export const TOUR_STORAGE_KEY = 'cc.demo.tour.v1';

function isProgress(value: unknown): value is TourProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.index === 'number' &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index < TOUR_STATIONS.length &&
    (v.state === 'running' || v.state === 'paused' || v.state === 'ended') &&
    typeof v.inviting === 'boolean'
  );
}

/** What this browser remembers, or the start of the tour when it remembers nothing readable. */
export function readTourProgress(): TourProgress {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return { ...TOUR_START };
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : { ...TOUR_START };
  } catch {
    return { ...TOUR_START };
  }
}

export function writeTourProgress(progress: TourProgress): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* private window, blocked site data, quota — the tour starts again next time */
  }
}

/** "Show tips again" — the tour starts from its first station. */
export function clearTourProgress(): void {
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* nothing to undo if it was never written */
  }
}
