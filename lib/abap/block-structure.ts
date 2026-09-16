import type { AbapStatement, SourceRange } from './statement-reader';

/**
 * Which block encloses which — the nesting, before anything is read into it.
 *
 * An `IF` inside a `LOOP` inside a `CASE` is three facts, not one, and a process
 * skeleton that flattens them draws a gateway in the wrong place. Both readers
 * above this file — branches (roadmap 2.1) and calls (2.2) — need the same
 * answer to "what am I inside of", so it is computed once here.
 *
 * Openers are matched to closers with a stack rather than by counting keywords,
 * because counting cannot tell an unterminated `IF` from a missing `ENDIF`
 * somewhere else. What the stack cannot match is reported as unterminated rather
 * than repaired by guessing.
 *
 * One opener is conditional. `SELECT … ENDSELECT.` is a loop; `SELECT … INTO
 * TABLE …` is a single statement, and both begin with the same word. So `SELECT`
 * is pushed as a candidate and is only a block if an `ENDSELECT` closes it before
 * the enclosing block does. A candidate nobody closes is dropped in silence — the
 * array form is not an unterminated loop, it is not a loop.
 */
export type BlockKind =
  | 'if'
  | 'case'
  | 'loop'
  | 'do'
  | 'while'
  | 'try'
  | 'select'
  | 'at'
  | 'provide'
  | 'form'
  | 'method'
  | 'module'
  | 'class'
  | 'interface'
  | 'define';

export interface Block extends SourceRange {
  kind: BlockKind;
  /** Index of the opening statement in the statement list. */
  openIndex: number;
  /** Index of the closing statement, or of the last statement when there is none. */
  closeIndex: number;
  /** False when nothing closed this block — the range then runs to the end. */
  terminated: boolean;
}

/**
 * A named region of the program a line can be attributed to: a subroutine, a
 * method, a dialog module, or an event block such as `START-OF-SELECTION`.
 */
export interface Container extends SourceRange {
  kind: 'form' | 'method' | 'module' | 'class' | 'event';
  /** Upper-cased subroutine, method or module name, or the event keyword. */
  name: string;
}

export interface BlockStructure {
  blocks: Block[];
  containers: Container[];
  /** Openers nothing closed. Named, because an element that cannot be anchored says so. */
  unterminated: Array<{ kind: BlockKind; lineStart: number }>;
  /** `enclosing[i]` are the blocks around statement `i`, outermost first. */
  enclosing: Block[][];
}

/** Closing keyword for each block kind. */
const CLOSER: Record<BlockKind, string> = {
  if: 'ENDIF',
  case: 'ENDCASE',
  loop: 'ENDLOOP',
  do: 'ENDDO',
  while: 'ENDWHILE',
  try: 'ENDTRY',
  select: 'ENDSELECT',
  at: 'ENDAT',
  provide: 'ENDPROVIDE',
  form: 'ENDFORM',
  method: 'ENDMETHOD',
  module: 'ENDMODULE',
  class: 'ENDCLASS',
  interface: 'ENDINTERFACE',
  define: 'END-OF-DEFINITION',
};

const BY_CLOSER = new Map<string, BlockKind>(
  (Object.entries(CLOSER) as Array<[BlockKind, string]>).map(([kind, closer]) => [closer, kind]),
);

/**
 * `AT` opens a block only in its group-change form. `AT SELECTION-SCREEN.` and
 * `AT LINE-SELECTION.` are event blocks and have no `ENDAT`.
 */
const AT_BLOCK = /^AT\s+(?:NEW\b|END\s+OF\b|FIRST\b|LAST\b)/i;

/** Event blocks of a report — the entry points a process starts from. */
const EVENT_KEYWORDS = new Set([
  'INITIALIZATION',
  'START-OF-SELECTION',
  'END-OF-SELECTION',
  'LOAD-OF-PROGRAM',
  'TOP-OF-PAGE',
  'END-OF-PAGE',
]);

const AT_EVENT = /^AT\s+(?:SELECTION-SCREEN\b|LINE-SELECTION\b|USER-COMMAND\b|PF\d)/i;

function openerKind(statement: AbapStatement): BlockKind | null {
  // Native SQL uses some of the same words and none of the same structure.
  if (statement.nativeSql) return null;
  switch (statement.keyword) {
    case 'IF': return 'if';
    case 'CASE': return 'case';
    case 'LOOP': return 'loop';
    case 'DO': return 'do';
    case 'WHILE': return 'while';
    case 'TRY': return 'try';
    case 'PROVIDE': return 'provide';
    case 'FORM': return 'form';
    case 'METHOD': return 'method';
    case 'MODULE': return 'module';
    // `CLASS x DEFINITION DEFERRED.` and `… LOAD.` are single statements with no
    // ENDCLASS; reading them as openers swallowed the rest of the program.
    case 'CLASS': return /\b(?:DEFERRED|LOAD)\s*$/i.test(statement.text) ? null : 'class';
    case 'INTERFACE': return /\bDEFERRED\s*$/i.test(statement.text) ? null : 'interface';
    case 'DEFINE': return 'define';
    case 'SELECT': return 'select';
    case 'AT': return AT_BLOCK.test(statement.text) ? 'at' : null;
    default: return null;
  }
}

/** True for the openers that may turn out not to be blocks at all. */
function isCandidate(kind: BlockKind): boolean {
  return kind === 'select';
}

function isEventStatement(statement: AbapStatement): boolean {
  if (EVENT_KEYWORDS.has(statement.keyword)) return true;
  return statement.keyword === 'AT' && AT_EVENT.test(statement.text);
}

function nameOf(statement: AbapStatement, kind: BlockKind): string {
  const m = new RegExp(`^${kind}\\s+([\\w/]+)`, 'i').exec(statement.text);
  return m ? m[1].toUpperCase() : '';
}

/** Event name as written: `START-OF-SELECTION`, or `AT SELECTION-SCREEN`. */
function eventName(statement: AbapStatement): string {
  if (statement.keyword === 'AT') {
    const m = /^AT\s+([\w-]+)/i.exec(statement.text);
    return m ? `AT ${m[1].toUpperCase()}` : 'AT';
  }
  return statement.keyword;
}

function readEventBlocks(statements: AbapStatement[]): Container[] {
  const starts: number[] = [];
  for (let i = 0; i < statements.length; i++) {
    if (isEventStatement(statements[i])) starts.push(i);
  }

  const out: Container[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    // An event block runs until the next event, or until the first declaration
    // of a subroutine, module, class or macro — whichever comes first.
    let to = statements.length - 1;
    for (let j = from + 1; j < statements.length; j++) {
      const kind = openerKind(statements[j]);
      const boundary =
        isEventStatement(statements[j]) ||
        kind === 'form' ||
        kind === 'module' ||
        kind === 'class' ||
        kind === 'interface' ||
        kind === 'define';
      if (boundary) { to = j - 1; break; }
    }
    if (to < from) to = from;
    out.push({
      kind: 'event',
      name: eventName(statements[from]),
      lineStart: statements[from].lineStart,
      lineEnd: statements[to].lineEnd,
    });
  }
  return out;
}

export function readBlocks(statements: AbapStatement[]): BlockStructure {
  const blocks: Block[] = [];
  const unterminated: BlockStructure['unterminated'] = [];
  const stack: Array<{ kind: BlockKind; index: number; candidate: boolean }> = [];
  const last = statements.length - 1;

  const close = (openerAt: number, closeIndex: number, kind: BlockKind, terminated: boolean) => {
    blocks.push({
      kind,
      openIndex: openerAt,
      closeIndex,
      terminated,
      lineStart: statements[openerAt].lineStart,
      lineEnd: statements[closeIndex].lineEnd,
    });
  };

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const closes = BY_CLOSER.get(statement.keyword);

    if (closes) {
      // Find the opener this closer belongs to. Anything above it never closed.
      let at = -1;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].kind === closes) { at = s; break; }
      }
      if (at !== -1) {
        for (let s = stack.length - 1; s > at; s--) {
          const orphan = stack[s];
          close(orphan.index, i - 1 >= orphan.index ? i - 1 : orphan.index, orphan.kind, false);
          // A candidate that never became a block is not an unterminated block.
          if (!orphan.candidate) {
            unterminated.push({ kind: orphan.kind, lineStart: statements[orphan.index].lineStart });
          }
        }
        stack.length = at + 1;
        const opener = stack.pop();
        if (opener) close(opener.index, i, opener.kind, true);
      }
      continue;
    }

    const opens = openerKind(statement);
    if (opens) stack.push({ kind: opens, index: i, candidate: isCandidate(opens) });
  }

  for (const orphan of stack) {
    close(orphan.index, Math.max(orphan.index, last), orphan.kind, false);
    if (!orphan.candidate) {
      unterminated.push({ kind: orphan.kind, lineStart: statements[orphan.index].lineStart });
    }
  }

  // A candidate opener that never closed is not a block at all.
  const real = blocks.filter((b) => !(isCandidate(b.kind) && !b.terminated));
  real.sort((a, b) => a.openIndex - b.openIndex);

  const openedAt = new Map<number, Block>();
  for (const block of real) openedAt.set(block.openIndex, block);

  const enclosing: Block[][] = [];
  const live: Block[] = [];
  for (let i = 0; i < statements.length; i++) {
    while (live.length && live[live.length - 1].closeIndex < i) live.pop();
    enclosing.push([...live]);
    const opened = openedAt.get(i);
    if (opened) live.push(opened);
  }

  const containers: Container[] = readEventBlocks(statements);
  for (const block of real) {
    if (block.kind === 'form' || block.kind === 'method' || block.kind === 'module' || block.kind === 'class') {
      containers.push({
        kind: block.kind,
        name: nameOf(statements[block.openIndex], block.kind),
        lineStart: block.lineStart,
        lineEnd: block.lineEnd,
      });
    }
  }

  return { blocks: real, containers, unterminated, enclosing };
}

/**
 * The innermost container a line sits in, or null.
 *
 * A subroutine, method or module wins over the event block it is written after:
 * the code belongs to the routine, and only the routine has a name worth
 * carrying into a process element.
 */
export function containerAt(containers: Container[], line: number): Container | null {
  const rank = (c: Container) => (c.kind === 'event' ? 0 : 1);
  let best: Container | null = null;
  for (const container of containers) {
    if (line < container.lineStart || line > container.lineEnd) continue;
    if (!best) { best = container; continue; }
    if (rank(container) > rank(best)) { best = container; continue; }
    if (rank(container) === rank(best) && container.lineStart > best.lineStart) best = container;
  }
  return best;
}
