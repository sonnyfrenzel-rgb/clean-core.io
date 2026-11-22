import type { EntryPoint } from '../entries';
import type { SkeletonGraph, SkeletonReadings } from '../graph';
import { callbackEntry } from './callbacks';
import { walkRange } from './range';
import { buildEntryRegion, routineRegion } from './regions';
import type { WalkState } from './state';
import type { WalkInput, Walker } from './walker';

/**
 * Pass 5, the walk — engine 4 phase 3 (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: the source and the products of passes 1, 2 and 4 (`WalkInput`). Writes: the regions, nodes and edges into
 * `graph`, and its products into `state` — early ends and region ends (`settleEarlyEnds`), lane evidence
 * (`buildLanes`), reached routines and entries built (`notDrawn`), cut-off boundaries (`noteUnreachableSteps`).
 * Both readings: the walkers ask `w.readings` where a gate decides.
 *
 * The walkers are one module each (`range`, `regions`, `branch`, `loop`, `try`, `parallel`, `statement`, `calls`,
 * `callbacks`, `records`); `createWalker` binds the two functions they recurse through.
 */
export function createWalker(
  graph: SkeletonGraph,
  input: WalkInput,
  state: WalkState,
  readings: SkeletonReadings,
): Walker {
  const w: Walker = {
    graph,
    input,
    state,
    readings,
    range: (from, to, ctx, incoming) => walkRange(w, from, to, ctx, incoming),
    routineRegion: (name) => routineRegion(w, name),
  };
  return w;
}

/**
 * Walk every entry, in the order `readEntryPoints` gives them; then the screen modules a walked `CALL SCREEN` shows;
 * then the callbacks the walks discovered — a callback's own walk can start another task, so this runs until the
 * walks name nothing new.
 */
export function walkEntries(w: Walker, entries: readonly EntryPoint[]): void {
  for (const entry of entries) buildEntryRegion(w, entry);
  for (const entry of w.input.entryReader.deferredModuleEntries(w.state.screenCalled)) buildEntryRegion(w, entry);
  for (let next = 0; next < w.state.callbacks.length; next++) {
    const entry = callbackEntry(w, w.state.callbacks[next]);
    if (entry) buildEntryRegion(w, entry);
  }
}
