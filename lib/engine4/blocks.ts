/**
 * Engine 4.0, layer L2: statements → the block tree.
 *
 * Pure: imports only within `lib/engine4/`. Which statement opens, splits or
 * closes a block is not decided here — it is the `opens`, `middle`, `closes`,
 * `candidate` and `event` columns of the kind table (`statement-kinds.ts`). This
 * layer only nests what the table says, with one rule for every kind of damage:
 *
 *   - **Placement.** A routine (FORM, FUNCTION, MODULE), a class, an interface
 *     and an event block stand at program level (or in an enhancement); a METHOD
 *     stands in a class. An opener that does not fit where it stands closes the
 *     blocks around it until it fits. That is how an event block ends at the next
 *     event or routine, and how a FORM after an unclosed IF ends the IF.
 *   - **Closers and middles** (ENDIF, ELSE, WHEN, CATCH …) take the nearest open
 *     block of their kind. Blocks above it are closed where the closer stands and
 *     flagged. A control closer never reaches across a routine, a class or an
 *     event: `ENDIF` in a FORM cannot close an IF outside it. A closer or middle
 *     with no block to take is a leaf with a diagnostic.
 *   - **Candidates.** `SELECT … ENDSELECT` is a block only if its ENDSELECT comes
 *     before the enclosing block ends. A candidate that is closed any other way is
 *     dropped without a diagnostic: `SELECT … INTO @wa` with one result row is not
 *     an unclosed loop, it is not a loop.
 *   - **Unclosed** blocks end on the statement before the one that ended them (or
 *     the last statement), and carry `termination: 'unclosed'` and a diagnostic.
 *
 * Statements in the macro context (a macro body) and native SQL are leaves: a
 * macro body is text pasted elsewhere, and an `IF` in it is balanced where the
 * macro is called, not where it is defined. After `PROCESS …` (dynpro flow
 * logic) `MODULE x.` calls a module and opens nothing.
 *
 * Linear time: every frame is pushed and popped once, and the nearest open block
 * of a kind is found through one index stack per kind, not by walking the stack.
 */
import type { Diagnostic, Position } from './tokens';
import { KIND_TABLE, kindInfo, unitsOf, type BlockKind } from './statement-kinds';
import type { Statement } from './statements';

/** A table block kind, an event block of a report, or the program around everything. */
export type BlockType = BlockKind | 'event' | 'program';

/** How a block ended. */
export type Termination =
  /** Its own closer (ENDIF, ENDFORM, …). */
  | 'closer'
  /** A block without a closer: an event block (at the next event or routine) or the program. */
  | 'implicit'
  /** Nothing closed it: recovery ended it, and a diagnostic says so. */
  | 'unclosed';

export type BlockNode = { type: 'statement'; index: number } | { type: 'block'; block: Block };

export interface Branch {
  /** The statement that starts the branch: the block's opener or a middle (ELSE, WHEN, CATCH). Null for the program. */
  head: number | null;
  /** Inclusive statement range of the branch, head included. `last < first` for an empty program. */
  first: number;
  last: number;
  /** What stands in the branch, in source order. Heads and closers are not children. */
  children: BlockNode[];
}

export interface Block {
  /** Position in `BlockTree.blocks`; 0 is the program. */
  id: number;
  kind: BlockType;
  /** The routine, class, interface or macro name, the event as written (`AT SELECTION-SCREEN`), upper-cased; else null. */
  name: string | null;
  /** Statement index of the opener; null for the program. */
  opener: number | null;
  /** Statement index of the closer; null unless `termination` is `closer`. */
  closer: number | null;
  termination: Termination;
  /** Inclusive statement range: opener to closer, or to where recovery ended it. */
  first: number;
  last: number;
  /** Source position of the first statement and just behind the last. */
  start: Position;
  end: Position;
  parent: Block | null;
  depth: number;
  branches: Branch[];
}

export interface BlockTree {
  root: Block;
  /** Every block in opener order, the program first. */
  blocks: Block[];
  /** `owner[i]` is the id of the innermost block statement `i` belongs to; an opener, middle or closer belongs to its block. */
  owner: Int32Array;
  diagnostics: Diagnostic[];
}

const CLOSER_KEYWORD = new Map<BlockKind, string>();
const OPENER_KEYWORD = new Map<BlockKind, string>();
for (const row of KIND_TABLE) {
  const head = row.pattern.filter((p): p is string => typeof p === 'string' && p !== '*').map((p) => p.split('|')[0]);
  if (row.closes && !CLOSER_KEYWORD.has(row.closes)) CLOSER_KEYWORD.set(row.closes, head.join(' '));
  if (row.opens && !OPENER_KEYWORD.has(row.opens)) OPENER_KEYWORD.set(row.opens, head[0]);
}

/** Block types that only stand at program level or in an enhancement. */
const TOP_LEVEL = new Set<BlockType>(['form', 'function', 'module', 'class', 'interface', 'event']);
/** Hosts of the top-level types. */
const TOP_HOST = new Set<BlockType>(['program', 'enhancement', 'enhancementSection']);
/** Frames a control closer or middle never reaches across. */
const BARRIER = new Set<BlockType>([
  'program', 'form', 'function', 'module', 'method', 'class', 'interface', 'event', 'define', 'enhancement', 'enhancementSection',
]);

function fits(kind: BlockType, host: BlockType): boolean {
  if (TOP_LEVEL.has(kind)) return TOP_HOST.has(host);
  if (kind === 'method') return host === 'class' || host === 'enhancement' || host === 'enhancementSection';
  if (kind === 'define') return host !== 'define';
  return true;
}

/** A block while the scan is open: the tree's block plus what the scan needs. */
interface Frame {
  block: Block;
  candidate: boolean;
  dropped: boolean;
  /** Statement indices of the middles (ELSE, WHEN, …), in order. */
  middles: number[];
}

interface Scan {
  list: readonly Statement[];
  frames: Frame[];
  stack: Frame[];
  /** Per block type, the stack positions of its open frames, innermost last. */
  byKind: Map<BlockType, number[]>;
  /** Stack positions of the open barrier frames, innermost last. */
  barriers: number[];
  diagnostics: Diagnostic[];
  flowLogic: boolean;
  /**
   * ADR-134 Q6: statements where indentation may break a tie, or null for none.
   * Set for the second pass only, over the routines where the first pass (nearest
   * block, as the compiler reads) found damage.
   */
  indent: Uint8Array | null;
  /** The frames the first pass found damage in: an unclosed block's routine, a stray closer's routine. */
  damaged: Set<Frame>;
}

function diag(s: Scan, at: number, code: Diagnostic['code'], message: string, severity: Diagnostic['severity']): void {
  const st = s.list[at];
  s.diagnostics.push({ code, message, row: st.start.row, col: st.start.col, severity });
}

function nameOf(st: Statement, kind: BlockType): string | null {
  const units = unitsOf(st.tokens);
  if (kind === 'event') return units[0] === 'AT' ? `AT ${units[1] ?? ''}`.trim() : units[0];
  if (['form', 'function', 'module', 'method', 'class', 'interface', 'define'].includes(kind)) return units[1] ?? null;
  return null;
}

function push(s: Scan, kind: BlockType, at: number, candidate: boolean): void {
  const st = s.list[at];
  const block: Block = {
    id: -1, kind, name: nameOf(st, kind), opener: at, closer: null, termination: 'implicit',
    first: at, last: at, start: st.start, end: st.end, parent: null, depth: 0, branches: [],
  };
  const frame: Frame = { block, candidate, dropped: false, middles: [] };
  s.frames.push(frame);
  const pos = s.stack.length;
  s.stack.push(frame);
  let list = s.byKind.get(kind);
  if (!list) s.byKind.set(kind, (list = []));
  list.push(pos);
  if (BARRIER.has(kind)) s.barriers.push(pos);
}

/** Pop the innermost frame; it ends on statement `last`. `byCloser` when its own closer ended it. */
function pop(s: Scan, last: number, byCloser: boolean): void {
  const frame = s.stack.pop() as Frame;
  const pos = s.stack.length;
  const b = frame.block;
  s.byKind.get(b.kind)?.pop();
  if (s.barriers[s.barriers.length - 1] === pos) s.barriers.pop();
  b.last = Math.max(b.first, last);
  if (byCloser) {
    b.closer = last;
    b.termination = 'closer';
    return;
  }
  if (frame.candidate) { frame.dropped = true; return; }
  if (b.kind === 'event') return;
  b.termination = 'unclosed';
  s.damaged.add(ROUTINE_LIKE.has(b.kind) ? frame : damageHost(s));
  const opener = s.list[b.first];
  const keyword = OPENER_KEYWORD.get(b.kind as BlockKind) ?? b.kind;
  const closer = CLOSER_KEYWORD.get(b.kind as BlockKind) ?? 'its closer';
  const until = last + 1 < s.list.length ? `before line ${s.list[last + 1].start.row}` : 'at the end of the source';
  diag(s, b.first, 'unclosed-block', `${keyword} on line ${opener.start.row} has no ${closer}; the block ends ${until}.`, 'warning');
}

/** Frames that are their own damage region when they lose their closer (ADR-134 Q6). */
const ROUTINE_LIKE = new Set<BlockType>(['form', 'function', 'module', 'method', 'class', 'interface', 'enhancement', 'enhancementSection']);

/** The innermost open routine-like frame (or the program): where damage at the current statement lies. */
function damageHost(s: Scan): Frame {
  for (let k = s.barriers.length - 1; k >= 0; k--) {
    const f = s.stack[s.barriers[k]];
    if (f && f.block.kind !== 'define') return f;
  }
  return s.stack[0];
}

/** How many open blocks of one kind the indentation rule looks past. A constant keeps the layer linear. */
const INDENT_LOOKBACK = 8;

/**
 * Stack position of the open block of `kind` the closer or middle at `at` takes,
 * or -1. The nearest one, unless indentation says otherwise: when the nearest
 * opener stands in another column than the closer, and one of the next few
 * blocks of the same kind further out stands exactly in the closer's column,
 * that one is taken and the nearer ones are the unclosed ones. A deleted inner
 * `ENDLOOP` then flags the inner LOOP, not the outer one whose ENDLOOP is
 * still there. Code without consistent indentation gets the nearest block.
 */
function target(s: Scan, kind: BlockKind, at: number): number {
  const list = s.byKind.get(kind);
  if (!list || list.length === 0) return -1;
  const floor = BARRIER.has(kind) ? -1 : (s.barriers[s.barriers.length - 1] ?? -1);
  const nearest = list[list.length - 1];
  if (nearest <= floor) return -1;
  if (!s.indent || !s.indent[at]) return nearest;
  const col = s.list[at].start.col;
  if (s.list[s.stack[nearest].block.first].start.col === col) return nearest;
  for (let k = list.length - 2; k >= 0 && k >= list.length - 1 - INDENT_LOOKBACK; k--) {
    const pos = list[k];
    if (pos <= floor) break;
    if (s.list[s.stack[pos].block.first].start.col === col) return pos;
  }
  return nearest;
}

function close(s: Scan, at: number, kind: BlockKind): void {
  const pos = target(s, kind, at);
  if (pos < 0) {
    const keyword = CLOSER_KEYWORD.get(kind) ?? kind;
    diag(s, at, 'unexpected-closer', `${keyword} closes no open ${OPENER_KEYWORD.get(kind) ?? kind}.`, 'warning');
    s.damaged.add(damageHost(s));
    return;
  }
  while (s.stack.length - 1 > pos) pop(s, at - 1, false);
  pop(s, at, true);
}

function middle(s: Scan, at: number, kind: BlockKind): boolean {
  const pos = target(s, kind, at);
  if (pos < 0) {
    const keyword = unitsOf(s.list[at].tokens)[0];
    diag(s, at, 'unexpected-middle', `${keyword} stands outside an open ${OPENER_KEYWORD.get(kind) ?? kind}.`, 'warning');
    s.damaged.add(damageHost(s));
    return false;
  }
  while (s.stack.length - 1 > pos) pop(s, at - 1, false);
  s.stack[pos].middles.push(at);
  return true;
}

function open(s: Scan, at: number, kind: BlockType, candidate: boolean): void {
  while (!fits(kind, s.stack[s.stack.length - 1].block.kind)) {
    if (s.stack.length === 1) {
      const where = kind === 'method' ? 'a CLASS … IMPLEMENTATION' : 'program level';
      diag(s, at, 'block-outside-container', `${unitsOf(s.list[at].tokens)[0]} stands outside ${where}.`, 'info');
      break;
    }
    pop(s, at - 1, false);
  }
  push(s, kind, at, candidate);
}

/** One statement's effect on the open blocks. */
function step(s: Scan, at: number): void {
  const st = s.list[at];
  if (st.context !== 'abap') return;
  if (st.kind === 'Process') s.flowLogic = true;
  if (st.kind === 'Module' && s.flowLogic) {
    // A flow-logic call (`MODULE status_0100.`, `… ON CHAIN-REQUEST`) opens nothing. `MODULE x OUTPUT|INPUT.` is
    // the ABAP implementation of a module: the flow logic is over and the module opens its block as usual.
    const units = unitsOf(st.tokens);
    const last = units[units.length - 1];
    if (last !== 'OUTPUT' && last !== 'INPUT') return;
    s.flowLogic = false;
  }
  const info = kindInfo(st.kind);
  // ADR-134 Q5: a macro body holds only macro-context statements. Once L1 has
  // ended a body that lost its END-OF-DEFINITION, the DEFINE ends with it.
  const top = s.stack[s.stack.length - 1].block;
  if (top.kind === 'define' && st.kind !== 'EndOfDefinition') pop(s, at - 1, false);
  if (info.closes) close(s, at, info.closes);
  else if (info.middle) middle(s, at, info.middle);
  else if (info.opens) open(s, at, info.opens, !!info.candidate);
  else if (info.event) open(s, at, 'event', false);
}

/** Second pass: kept blocks into a tree, statements into branches, owners. */
function assemble(list: readonly Statement[], frames: Frame[]): { blocks: Block[]; owner: Int32Array } {
  const kept = frames.filter((f) => !f.dropped);
  const blocks: Block[] = [];
  const byOpener = new Map<number, Frame>();
  for (const f of kept) {
    f.block.id = blocks.length;
    blocks.push(f.block);
    if (f.block.opener !== null) byOpener.set(f.block.opener, f);
    const heads = [f.block.opener, ...f.middles];
    const stop = f.block.closer !== null ? f.block.closer - 1 : f.block.last;
    f.block.branches = heads.map((head, k) => ({
      head,
      first: head ?? f.block.first,
      last: k + 1 < heads.length ? (heads[k + 1] as number) - 1 : stop,
      children: [],
    }));
  }
  const owner = new Int32Array(list.length);
  const live: Array<{ frame: Frame; branch: number }> = [{ frame: kept[0], branch: 0 }];
  for (let i = 0; i < list.length; i++) {
    while (live.length > 1 && live[live.length - 1].frame.block.last < i) live.pop();
    const top = live[live.length - 1];
    const b = top.frame.block;
    const next = b.branches[top.branch + 1];
    if (next && next.head === i) {
      top.branch += 1;
      owner[i] = b.id;
      continue;
    }
    if (b.closer === i) { owner[i] = b.id; continue; }
    const opened = byOpener.get(i);
    if (opened) {
      opened.block.parent = b;
      opened.block.depth = b.depth + 1;
      b.branches[top.branch].children.push({ type: 'block', block: opened.block });
      live.push({ frame: opened, branch: 0 });
      owner[i] = opened.block.id;
      continue;
    }
    b.branches[top.branch].children.push({ type: 'statement', index: i });
    owner[i] = b.id;
  }
  return { blocks, owner };
}

function scan(list: readonly Statement[], indent: Uint8Array | null): { s: Scan; root: Block } {
  const origin: Position = list.length ? list[0].start : { row: 1, col: 1 };
  const root: Block = {
    id: 0, kind: 'program', name: null, opener: null, closer: null, termination: 'implicit',
    first: 0, last: list.length - 1, start: origin, end: list.length ? list[list.length - 1].end : origin,
    parent: null, depth: 0, branches: [],
  };
  const rootFrame: Frame = { block: root, candidate: false, dropped: false, middles: [] };
  const s: Scan = {
    list, frames: [rootFrame], stack: [rootFrame], byKind: new Map([['program', [0]]]), barriers: [0], diagnostics: [], flowLogic: false,
    indent, damaged: new Set(),
  };
  for (let at = 0; at < list.length; at++) step(s, at);
  while (s.stack.length > 1) pop(s, list.length - 1, false);
  return { s, root };
}

/**
 * The block tree of a statement list. Never throws; damage is recovered and diagnosed.
 *
 * Two passes at most (ADR-134 Q6). The first reads as the compiler does: every
 * closer takes the nearest open block of its kind. A source that balances is
 * done. Where the first pass found damage (an unclosed block, a stray closer or
 * middle), the routine around it is read again with indentation as the
 * tie-breaker, so a lost inner `ENDLOOP` flags the inner LOOP. Indentation
 * never decides anything in a routine that balances.
 */
export function blocks(list: readonly Statement[]): BlockTree {
  let { s, root } = scan(list, null);
  if (s.damaged.size > 0) {
    const delta = new Int32Array(list.length + 1);
    for (const f of s.damaged) {
      delta[f.block.first] += 1;
      delta[Math.min(list.length, f.block.last + 1)] -= 1;
    }
    const indent = new Uint8Array(list.length);
    let run = 0;
    for (let i = 0; i < list.length; i++) {
      run += delta[i];
      indent[i] = run > 0 ? 1 : 0;
    }
    ({ s, root } = scan(list, indent));
  }
  for (const f of s.frames) {
    const b = f.block;
    if (b.opener === null || list.length === 0) continue;
    b.start = list[b.first].start;
    b.end = list[b.last].end;
  }
  const { blocks: kept, owner } = assemble(list, s.frames);
  s.diagnostics.sort((a, b) => a.row - b.row || a.col - b.col);
  return { root, blocks: kept, owner, diagnostics: s.diagnostics };
}

/** The blocks around statement `index`, outermost first, the program left out. */
export function enclosingBlocks(tree: BlockTree, index: number): Block[] {
  const out: Block[] = [];
  for (let b: Block | null = tree.blocks[tree.owner[index]] ?? null; b && b.kind !== 'program'; b = b.parent) out.push(b);
  return out.reverse();
}
