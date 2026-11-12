import {
  namingArrivalFailed,
  namingArrivalProgress,
  namingArrivalReady,
  namingArrivalTimeout,
  namingArrivalWaitSub,
} from './messages/process-map';

/**
 * How the AI names arrive on the map — roadmap 3.1.0 item 4, plan AB-3, mockup states 1, 2, 3 and 18.
 *
 * The map is drawn with the engine's names at once. The model's names, built from the engine's facts and checked
 * against them (`lib/naming-facts.ts`), come in the background and swap in visibly, element by element: the old name
 * slides up, the new one in, a short tint, and the pen mark of *AI-generated* stays. One status line says what is
 * happening. The page never waits for it.
 *
 *   - **A ceiling of 45 s per program** (`NAMING_CEILING_MS`), counted from the moment the ask went out. Names that are
 *     not there by then do not arrive on this visit: every step keeps the name the engine read, and the status line
 *     says so in one sentence. A naming stored later is shown on the next visit.
 *   - **One answer, a visible arrival.** The model answers once for the whole program; the swap walks the map in the
 *     order of its elements, a short step apart (`NAME_STAGGER_MS`, the whole walk at most `NAME_STAGGER_SPAN_MS`),
 *     each swap `NAME_SWAP_MS` long.
 *   - **No motion where none is wanted.** Names stored before this visit, and every visit under
 *     `prefers-reduced-motion`, are simply there (`instant`).
 *   - **A name equal to the engine's is no swap.** Such an element keeps the engine's name and no pen mark — the
 *     export does the same (`applyAiNames`, `lib/bpmn/export.ts`).
 *
 * Pure: the clock is a parameter. `hooks/useNamingArrival.ts` holds the times; the canvas draws what this returns.
 */

/** The longest the map waits for the AI names, per program (owner decision O2, 06.11.2026). */
export const NAMING_CEILING_MS = 45_000;
/** One swap: the old name out, the new one in, the tint (mockup: 0.9 s). */
export const NAME_SWAP_MS = 900;
/** The gap between two elements' swaps. */
export const NAME_STAGGER_MS = 140;
/** The longest the walk across the map may take, however many elements are named. */
export const NAME_STAGGER_SPAN_MS = 6_000;
/** From this many steps the status line says the program is larger (mockup state 18). */
export const LARGE_PROGRAM_STEPS = 40;
/** After this long without names the status line counts down to the ceiling. */
export const NAMING_LATE_MS = 20_000;

export interface ArrivalElement {
  id: string;
  /** Only an element drawn from a skeleton node can be named. */
  nodeId: string | null;
  /** The model's name, as the stored naming applies it; null without one. */
  businessName: string | null;
  /** The name the map draws for it — the engine's (`ProcessMapElement.label` without a naming). */
  drawnName: string;
}

export interface ArrivalInput {
  elements: readonly ArrivalElement[];
  /** When the ask for names went out on this visit; null when nothing was asked on it. */
  waitingSince: number | null;
  /** When a naming for this map was first seen on this visit (it may name nothing usable); null while there is none. */
  arrivedAt: number | null;
  /** The names were there when the map opened, or the reader asked for less motion: no swap, no walk. */
  instant: boolean;
  /** The ask ended without names (refused, failed, nothing stored). */
  failed: boolean;
}

export type ArrivalPhase = 'none' | 'waiting' | 'swapping' | 'ready' | 'failed' | 'timeout';

export interface ArrivalStatus {
  text: string;
  sub: string | null;
  /** 0–1 while names arrive; null when the line is a result. */
  progress: number | null;
  tone: 'busy' | 'calm';
}

export interface ArrivalView {
  phase: ArrivalPhase;
  /** The model's name per element id, for every element whose swap has begun. */
  shown: ReadonlyMap<string, string>;
  /** Elements whose swap is under way right now. */
  swapping: ReadonlySet<string>;
  /** Elements still waiting for a name (the waiting mark). */
  waiting: ReadonlySet<string>;
  /** Elements that can be named on this map. */
  total: number;
  /** Elements whose swap is complete. */
  named: number;
  /** Elements that keep the engine's name. Final only once the phase is `ready`. */
  kept: number;
  status: ArrivalStatus | null;
  /** When the view changes next without a new input; null when it will not. */
  nextChangeAt: number | null;
}

/** The model's name where it says something the drawn one does not; null where it is no swap. */
export function usableName(element: ArrivalElement): string | null {
  const name = element.businessName?.trim();
  if (!name || !element.nodeId) return null;
  return name === element.drawnName.trim() ? null : name;
}

/** The order the names swap in: the map's own element order, the gap between two swaps. */
export function swapSchedule(elements: readonly ArrivalElement[]): { ids: string[]; stagger: number } {
  const ids = elements.filter((e) => usableName(e) !== null).map((e) => e.id);
  const stagger = ids.length > 1 ? Math.min(NAME_STAGGER_MS, NAME_STAGGER_SPAN_MS / (ids.length - 1)) : 0;
  return { ids, stagger };
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/** What the map shows at `now`. */
export function arrivalAt(input: ArrivalInput, now: number): ArrivalView {
  const eligible = input.elements.filter((e) => e.nodeId !== null);
  const total = eligible.length;
  const names = new Map(eligible.map((e) => [e.id, usableName(e)]));
  const final = [...names.values()].filter((n) => n !== null).length;
  const base = { total, swapping: EMPTY_SET, waiting: EMPTY_SET } as const;
  const ceiling = input.waitingSince !== null ? input.waitingSince + NAMING_CEILING_MS : null;

  // Names that come after the ceiling do not arrive on this visit: the map has already said the steps keep the engine's.
  const afterCeiling = ceiling !== null && input.arrivedAt !== null && !input.instant && input.arrivedAt > ceiling;
  if (input.arrivedAt !== null && !afterCeiling) {
    const { ids, stagger } = swapSchedule(eligible);
    const shown = new Map<string, string>();
    const swapping = new Set<string>();
    const waiting = new Set<string>();
    let named = 0;
    let nextChangeAt: number | null = null;
    ids.forEach((id, k) => {
      const start = input.instant ? input.arrivedAt! : input.arrivedAt! + k * stagger;
      const end = input.instant ? start : start + NAME_SWAP_MS;
      if (now >= start) shown.set(id, names.get(id)!);
      else {
        waiting.add(id);
        nextChangeAt = nextChangeAt === null ? start : Math.min(nextChangeAt, start);
      }
      if (now >= end) named += 1;
      else if (now >= start) {
        swapping.add(id);
        nextChangeAt = nextChangeAt === null ? end : Math.min(nextChangeAt, end);
      }
    });
    const done = named === ids.length;
    return {
      ...base,
      phase: done ? 'ready' : 'swapping',
      shown,
      swapping,
      waiting,
      named,
      kept: total - final,
      status: total === 0 ? null : done
        ? { text: namingArrivalReady(total - final), sub: null, progress: null, tone: 'calm' }
        : { text: namingArrivalProgress(named, total), sub: namingArrivalWaitSub(total >= LARGE_PROGRAM_STEPS, null), progress: named / total, tone: 'busy' },
      nextChangeAt: done ? null : nextChangeAt,
    };
  }

  const none = { ...base, shown: EMPTY_MAP, named: 0, kept: total };
  if (total === 0) return { ...none, phase: 'none', status: null, nextChangeAt: null };
  if (input.failed) {
    return { ...none, phase: 'failed', status: { text: namingArrivalFailed(), sub: null, progress: null, tone: 'calm' }, nextChangeAt: null };
  }
  if (ceiling !== null) {
    if (now >= ceiling) {
      return { ...none, phase: 'timeout', status: { text: namingArrivalTimeout(), sub: null, progress: null, tone: 'calm' }, nextChangeAt: null };
    }
    const late = now - input.waitingSince! >= NAMING_LATE_MS;
    const secondsLeft = Math.max(1, Math.ceil((ceiling - now) / 1000));
    return {
      ...none,
      phase: 'waiting',
      waiting: new Set(eligible.map((e) => e.id)),
      status: {
        text: namingArrivalProgress(0, total),
        sub: namingArrivalWaitSub(total >= LARGE_PROGRAM_STEPS, late ? secondsLeft : null),
        progress: 0,
        tone: 'busy',
      },
      // Once a second while the countdown shows; otherwise at the moment it starts, or at the ceiling.
      nextChangeAt: late ? Math.min(ceiling, now + 1000) : input.waitingSince! + NAMING_LATE_MS,
    };
  }
  return { ...none, phase: 'none', status: null, nextChangeAt: null };
}

/** What the map draws of an arrival — handed from the page to `ProcessMap` and on to the canvas. */
export interface MapNameArrival {
  phase: ArrivalPhase;
  shown: ReadonlyMap<string, string>;
  swapping: ReadonlySet<string>;
  waiting: ReadonlySet<string>;
  named: number;
  total: number;
  status: ArrivalStatus | null;
  /** False under `prefers-reduced-motion`. */
  motion: boolean;
}
