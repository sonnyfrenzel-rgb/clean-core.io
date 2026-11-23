import type { AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { SkeletonNode, SkeletonRegion } from '../process-skeleton';
import { ARM_HEADERS, FLOW_BLOCKS, LOOP_CLOSERS, RANK_END_OF_SELECTION, RANK_GET, RANK_START_OF_SELECTION } from './keywords';
import { assignmentTarget, classOf, leavesDialogStep, resultParameters } from './statement-readers';
import type { SkeletonGraph } from './graph';

/**
 * Pass "early ends" — engine 4 phase 3, the first pass after the walk (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: nodes, the early ends the walk drew (`leaveEarly`), the last statement each region's walk covers, the
 * runtime ranks of the report's event blocks, the statements and blocks. Writes: the edges into an early end that
 * is no early end are moved to the region's normal end, and that end node is dropped. No reading gate.
 */

/** An early end the walk drew, with the statement it stands on (`leaveEarly`). */
export interface EarlyEnd {
  node: SkeletonNode;
  statementIndex: number;
  region: SkeletonRegion;
}

export interface EarlyEndsInput {
  statements: readonly AbapStatement[];
  structure: BlockStructure;
  /** Blocks by their opening statement. */
  blockAt: ReadonlyMap<number, Block>;
  earlyEnds: readonly EarlyEnd[];
  /** ADR-054: the last statement index each region's walk covers — where its normal end takes over. */
  regionLast: ReadonlyMap<string, number>;
  /** The runtime ranks of the report's event blocks (one program run), `RUNTIME_ORDER`. */
  runEntryRanks: readonly number[];
}

/**
 * ADR-054, "no tangle". An early end whose statement stands directly before
 * the block's end — nothing drawn in between — is the normal end, and its
 * flows go back to it. Decided on the complete walk, because whether anything
 * is drawn after a statement is only known once the statements after it have
 * been walked.
 */
export function settleEarlyEnds(graph: SkeletonGraph, input: EarlyEndsInput): void {
  if (!input.earlyEnds.length) return;
  /** ADR-066. `resultWrites` per routine opener. */
  const cache = new Map<number, Set<number>>();
  const drawn = new Map<string, Set<number>>();
  for (const node of graph.nodes) {
    if (!node.anchor || node.detail?.early === true) continue;
    const own = drawn.get(node.region);
    if (own) own.add(node.anchor.statementIndex);
    else drawn.set(node.region, new Set([node.anchor.statementIndex]));
  }
  const dropped = new Set<string>();
  for (const { node, statementIndex, region } of input.earlyEnds) {
    const last = input.regionLast.get(region.key);
    if (last === undefined || !region.endNodeId) continue;
    // ADR-066. `LEAVE SCREEN`, `LEAVE TO SCREEN n` and `LEAVE LIST-PROCESSING`
    // are never the routine's normal end, wherever they stand: the ABAP
    // keyword documentation has them end the current dialog step on the spot
    // — the rest of the screen's flow logic (the PAI/PBO modules after this
    // one) does not run, and the runtime goes on with screen n (or back to
    // the caller for 0). `ENDMODULE` hands back to that flow logic. So the
    // end stays its own even with nothing drawn behind it in the module.
    if (leavesDialogStep(input.statements[statementIndex].text)) continue;
    // ADR-066. An exit that skips an assignment to a result parameter of its
    // routine (`CHANGING` of a FORM; `EXPORTING`, `CHANGING`, `RETURNING` of
    // a method) is not the normal end either: the caller gets another result
    // back — `cv_ok` stays initial — whether or not a step is drawn between.
    // Roadmap 3.0.7. `EXIT`, `RETURN` and `STOP` in `START-OF-SELECTION` or
    // `GET` skip the reporting events still to come, so they are never the
    // block's normal end while one follows — see `chainReportEvents`.
    if (skipsLaterReportEvents(input, region, input.statements[statementIndex].keyword)) continue;
    const own = drawn.get(region.key) ?? new Set<number>();
    const results = resultWrites(input, cache, statementIndex);
    const counted = results.size ? new Set([...own, ...results]) : own;
    if (skipsSomething(input, statementIndex, last, counted)) continue;
    for (const edge of graph.edges) if (edge.to === node.id) edge.to = region.endNodeId;
    dropped.add(node.id);
  }
  if (dropped.size) graph.nodes = graph.nodes.filter((n) => !dropped.has(n.id));
}

/**
 * Roadmap 3.0.7 — whether an early exit with this keyword, in this region,
 * ends the reporting run rather than the block: `EXIT` and `RETURN` (and
 * `STOP`, which goes on with `END-OF-SELECTION` only) in `START-OF-SELECTION`
 * or `GET`, while a later reporting event block exists that it skips. The
 * ABAP keyword documentation on `EXIT`/`STOP` in processing blocks: after
 * those two events are left with `EXIT`, no further reporting event is
 * raised and the list is displayed; `STOP` raises `END-OF-SELECTION`.
 */
function skipsLaterReportEvents(input: EarlyEndsInput, region: SkeletonRegion, keyword: string): boolean {
  if (region.kind !== 'entry' || !['EXIT', 'RETURN', 'STOP'].includes(keyword.toUpperCase())) return false;
  const rank = region.runtimeRank;
  if (rank !== RANK_START_OF_SELECTION && rank !== RANK_GET) return false;
  return input.runEntryRanks.some((r) => r > rank && r <= RANK_END_OF_SELECTION);
}

/**
 * ADR-066 — the statements of the FORM or method around `index` that assign
 * one of its result parameters, by statement index. Empty outside a routine,
 * or where the signature names no result parameter this reader can find.
 */
function resultWrites(input: EarlyEndsInput, cache: Map<number, Set<number>>, index: number): Set<number> {
  const enclosing = input.structure.enclosing[index] ?? [];
  const routine = [...enclosing].reverse().find((b) => b.kind === 'form' || b.kind === 'method');
  if (!routine) return new Set();
  const cached = cache.get(routine.openIndex);
  if (cached) return cached;
  const opener = input.statements[routine.openIndex].text;
  const params = new Set(routine.kind === 'form'
    ? resultParameters(opener, /\bCHANGING\b/i)
    : methodResultParameters(input, routine.openIndex));
  const out = new Set<number>();
  if (params.size) {
    for (let i = routine.openIndex + 1; i < routine.closeIndex; i++) {
      const target = assignmentTarget(input.statements[i].text);
      if (target && params.has(target)) out.add(i);
    }
  }
  cache.set(routine.openIndex, out);
  return out;
}

/**
 * The `EXPORTING`, `CHANGING` and `RETURNING` parameters the declaration of
 * the method at `openIndex` names — read off `METHODS name …` in its class's
 * `DEFINITION`, or for `zif~name` in the interface. A declaration this
 * source does not hold yields none.
 */
function methodResultParameters(input: EarlyEndsInput, openIndex: number): string[] {
  const written = /^METHOD\s+([\w/~]+)/i.exec(input.statements[openIndex].text)?.[1]?.toUpperCase();
  if (!written) return [];
  const tilde = written.indexOf('~');
  const owner = tilde < 0 ? classOf(input.statements, input.structure, openIndex) : written.slice(0, tilde);
  const name = tilde < 0 ? written : written.slice(tilde + 1);
  if (!owner) return [];
  for (const block of input.structure.blocks) {
    if (block.kind !== 'class' && block.kind !== 'interface') continue;
    const head = input.statements[block.openIndex].text;
    const declares = block.kind === 'interface'
      ? new RegExp(`^INTERFACE\\s+${owner.replace(/\//g, '\\/')}\\b(?!\\s+(?:DEFERRED|LOAD)\\b)`, 'i').test(head)
      : new RegExp(`^CLASS\\s+${owner.replace(/\//g, '\\/')}\\s+DEFINITION\\b(?!\\s+(?:DEFERRED|LOAD)\\b)`, 'i').test(head);
    if (!declares) continue;
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const text = input.statements[i].text;
      const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(text);
      if (m && m[1].toUpperCase() === name) return resultParameters(text, /\b(?:EXPORTING|CHANGING|RETURNING)\b/i);
    }
  }
  return [];
}

/**
 * Does leaving at `index` skip anything this region draws? The way the
 * program would have gone without the exit is followed statement by
 * statement: an arm header leaves its construct, a loop's closing word runs
 * the loop again (so the exit skips the rest of it), a flow block counts with
 * everything inside it, and a container is stepped over as `walkRange` steps
 * over it.
 */
function skipsSomething(input: EarlyEndsInput, index: number, last: number, drawn: ReadonlySet<number>): boolean {
  let j = index + 1;
  while (j <= last) {
    const block = input.blockAt.get(j);
    if (block) {
      if (FLOW_BLOCKS.has(block.kind)) {
        for (let k = j; k <= Math.min(block.closeIndex, last); k++) if (drawn.has(k)) return true;
      }
      j = Math.max(j + 1, block.closeIndex + 1);
      continue;
    }
    const keyword = input.statements[j].keyword.toUpperCase();
    if (ARM_HEADERS.has(keyword)) {
      const enclosing = input.structure.enclosing[j] ?? [];
      const owner = enclosing[enclosing.length - 1];
      if (owner && owner.closeIndex > j) {
        j = owner.closeIndex;
        continue;
      }
    }
    if (LOOP_CLOSERS.has(keyword)) return true;
    if (drawn.has(j)) return true;
    j += 1;
  }
  return false;
}
