import type { AbapStatement } from '../../statement-reader';
import type { Block, BlockStructure } from '../../block-structure';
import type { Branch } from '../../control-flow';
import type { CallGraphReport } from '../../call-graph';
import type { BatchInputCall } from '../../batch-input';
import type { FormEffect, SkeletonRegion } from '../../process-skeleton';
import type { MethodImpl } from '../declarations';
import type { MethodDispatch } from '../dispatch';
import type { EntryPoint, EntryReader } from '../entries';
import type { Exit, SkeletonGraph, SkeletonReadings } from '../graph';
import type { WalkReaders } from '../walk-readers';
import type { WalkState } from './state';

/**
 * The walk as one typed object — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3").
 *
 * The walk is mutually recursive: a range walks its blocks, a branch walks the range of each arm, a `PERFORM` opens
 * the routine's region and that walks its range again. Each walker is a function of its own module that takes this
 * object first. What it reads is `input` (the source and the earlier passes' products, never written by the walk),
 * what it shares is `state`, what it draws goes into `graph`. The recursion back into the walk goes through the two
 * functions below rather than through an import, so no walker module imports another that imports it back.
 */
export interface Walker {
  readonly graph: SkeletonGraph;
  readonly input: WalkInput;
  readonly state: WalkState;
  readonly readings: SkeletonReadings;
  /** Walk the statements `from`…`to` of one region (`walkRange`). */
  range(from: number, to: number, ctx: WalkContext, incoming: Exit[]): Exit[];
  /** The region a routine of this source opens, built once however often it is called (`routineRegion`). */
  routineRegion(name: string): SkeletonRegion | null;
}

/** What the walk reads besides the graph: the source and what passes 1, 2 and 4 read from it. */
export interface WalkInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  calls: CallGraphReport;
  /** Blocks and branches by their opening statement. */
  blockAt: ReadonlyMap<number, Block>;
  branchAt: ReadonlyMap<number, Branch>;
  formBlocks: ReadonlyMap<string, Block>;
  routineBlocks: ReadonlyMap<string, Block>;
  macros: ReadonlyMap<string, { block: Block }>;
  localData: ReadonlySet<string>;
  batchInput: ReadonlyMap<number, BatchInputCall>;
  methodImpls: readonly MethodImpl[];
  classNames: ReadonlySet<string>;
  /** Pass 2 (`skeleton/effects.ts`). */
  effects: ReadonlyMap<string, Set<FormEffect>>;
  helpers: ReadonlySet<string>;
  performedFrom: ReadonlyMap<string, string[]>;
  /** Method dispatch (`skeleton/dispatch.ts`) and what it read of the bound event handlers. */
  dispatch: MethodDispatch;
  boundHandlers: readonly string[];
  handlerEvent: ReadonlyMap<string, { event: string; of: string }>;
  candidateSites: ReadonlyMap<string, Array<{ index: number; label: string; line: number; of: number }>>;
  /** The walk's read-only questions (`skeleton/walk-readers.ts`) and the entries (`skeleton/entries.ts`). */
  readers: WalkReaders;
  entryReader: EntryReader;
  /** The event blocks of the report (one program run), for `registeredBefore`. */
  runEntries: readonly EntryPoint[];
}

/** Where in a region the walk stands. */
export interface WalkContext {
  region: SkeletonRegion;
  container: string | null;
  /** Ids of the enclosing loop nodes of this region, innermost last. */
  loops: string[];
  /** Exits that leave each enclosing loop early, innermost last. */
  loopBreaks: Exit[][];
}
