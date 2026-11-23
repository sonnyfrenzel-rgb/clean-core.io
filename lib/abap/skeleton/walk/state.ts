import type { AbapStatement } from '../../statement-reader';
import type { LaneEvidence, SkeletonRegion } from '../../process-skeleton';
import type { EarlyEnd } from '../early-ends';

/**
 * The walk's mutable state — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3").
 *
 * The walk (`buildEntryRegion`, `routineRegion` and the `walk*` functions) is one mutually recursive component, and
 * these are the fields it shares while it runs: one walker writes them and another, or a pass after the walk, reads
 * them. They used to be private fields of `SkeletonBuilder`; gathered into one typed object, each walker names in its
 * signature that it reads or writes walk state, and the passes after the walk read the products below by name.
 *
 * Moved unchanged: the same values, written and read in the same order. Two of them are replaced rather than
 * mutated (`registeredInWalk`, restored around blocks, arms and routines; `screenCalled`), which is why the walkers
 * hold the object and never a field of it.
 */
export interface WalkState {
  /** ADR-066 (03.10.2026): the files a run of file statements works on, by node id — `CLOSE DATASET` joins only a run of its own file. */
  fileRunDatasets: Map<string, Set<string>>;
  /** The chain of routines being expanded right now — the floor of `routineRegion`. */
  expanding: string[];
  /**
   * Lane evidence — roadmap 2.16. Collected **inside the walk** on purpose:
   * that is what makes "a piece of evidence in code no entry point reaches does
   * not count" true rather than asserted. `legacy_call_screen_example` of the
   * 1.000-line example is never walked, so its `CALL SCREEN 9000` (L670) never
   * gets here, and no lane is opened for a screen nobody can reach.
   */
  evidence: LaneEvidence[];
  evidenceSeen: Set<string>;
  /** Region keys of the entries built, so `unreached()` does not also list them as not reached. */
  entryOfBlock: Set<number>;
  /**
   * Routines a walked call names, and everything they perform in turn — the
   * reachability the **drawing** has, as opposed to the one 2.2's call graph
   * computes from event blocks. They differ exactly where an entry is a routine
   * itself: a form performed by a user-exit form is drawn inside it, and must
   * then not also be listed as code no entry reaches.
   */
  reachedRoutines: Set<string>;
  /** Did the walk pass a `CALL SCREEN`? */
  screenCalled: boolean;
  /**
   * Routines a walked `CALL FUNCTION … STARTING NEW TASK` names with
   * `PERFORMING form ON END OF TASK` or `CALLING meth ON END OF TASK`, in the
   * order the walk met them — see `callbackEntries`.
   */
  callbacks: WalkCallback[];
  regionOfRoutine: Map<string, SkeletonRegion>;
  /**
   * Engine 3.2.0: the handlers registered when the walk passed each ambiguous call, by statement index. A candidate
   * implementation runs inside that call, so what `SET HANDLER` registered before it is registered in the candidate
   * too (`buildEntryRegion`) — the handlers a `RAISE EVENT` in the candidate runs are the ones the caller bound.
   */
  registrationsAtCall: Map<number, Set<string>>;
  /** Engine 3.2.0: the `CALL SCREEN` statements the walk passed — the screen modules run inside them. */
  screenCallSites: number[];
  /** Bound handlers whose `SET HANDLER` the walk has passed, so a later `RAISE EVENT` may run them. */
  registeredInWalk: Set<string>;
  /**
   * Boundary events of a TRY that nothing enters: no node to attach to, and the
   * flow before the TRY already cut off (`LEAVE PROGRAM`, `SUBMIT` …) in a
   * region that has steps before it.
   */
  cutOffBoundaries: Set<string>;
  /** > 0 while a branch whose arms the reader cannot separate is walked — no registration counts there. */
  registrationFrozen: number;
  /**
   * ADR-054. Every early end the walk drew, with the statement it stands on —
   * `settleEarlyEnds` decides afterwards which of them really skip something.
   */
  earlyEnds: EarlyEnd[];
  /** ADR-054. The last statement index each region's walk covers — where its normal end takes over. */
  regionLast: Map<string, number>;
}

/** A routine the runtime calls back, recorded where the walk passed the statement that names it. */
export interface WalkCallback {
  key: string;
  label: string;
  site: AbapStatement;
  trigger: string;
}

/** The state of a walk that has not begun. */
export function newWalkState(): WalkState {
  return {
    fileRunDatasets: new Map(),
    expanding: [],
    evidence: [],
    evidenceSeen: new Set(),
    entryOfBlock: new Set(),
    reachedRoutines: new Set(),
    screenCalled: false,
    callbacks: [],
    regionOfRoutine: new Map(),
    registrationsAtCall: new Map(),
    screenCallSites: [],
    registeredInWalk: new Set(),
    cutOffBoundaries: new Set(),
    registrationFrozen: 0,
    earlyEnds: [],
    regionLast: new Map(),
  };
}
