import { readStatements, afterKeyword, type AbapStatement, type SourceRange } from './statement-reader';
import { readBlocks, containerAt, type Block, type BlockKind, type BlockStructure } from './block-structure';

/**
 * Where the program decides — roadmap 2.1.
 *
 * `IF`/`ELSEIF`/`ELSE` and `CASE`/`WHEN`, each arm with the condition **as it
 * stands in the source** and with a line range. Until now the engine counted
 * branches for a nesting-depth number and nothing else
 * (`code-assessment.ts`, `docs/ROADMAP.md` §3), which is why the BPMN it produced
 * had gateways without conditions.
 *
 * Two decisions, both deliberate:
 *
 * **The condition is the reader's text, not a parsed tree.** `gs_eban-dispo =
 * 'EMG' OR gs_eban-bednr CP 'EMERG*'` is what an ABAP developer will recognise on
 * a gateway; a normalised boolean structure is what a parser would rather have.
 * Nothing here derives the second one. The only liberty taken is that runs of
 * whitespace — line breaks included, since a condition may span four lines —
 * collapse to one space; the range says where to read the original.
 *
 * **Nesting is kept.** An `IF` inside a `LOOP` inside a `CASE` carries all three
 * in `enclosing`, outermost first, so a skeleton can place the gateway inside the
 * right sub-flow instead of flattening it onto the top level.
 *
 * What is not read here: `CHECK`, `RETURN`, `EXIT` and `AT` group changes (they
 * are flow, not branches, and belong to the skeleton in 2.3); `COND`/`CASE`
 * expressions inside an assignment; and anything inside a macro body, which is
 * expanded by the compiler and not by this engine — a branch found there is
 * reported under `notHandled` rather than drawn.
 */

export type BranchKind = 'if' | 'case';

export type ArmKind = 'if' | 'elseif' | 'else' | 'when' | 'when-others';

export interface BranchArm extends SourceRange {
  kind: ArmKind;
  /**
   * The condition exactly as the source writes it, with whitespace collapsed.
   * Empty for `ELSE` and `WHEN OTHERS`, which state no condition.
   */
  condition: string;
  /** The range of the arm's own statement — `IF …`, `ELSEIF …`, `WHEN …`. */
  header: SourceRange;
  /**
   * Index of the arm's own statement in the statement list.
   *
   * A line is not an identity: `IF sy-subrc = 0. x = 1. ENDIF.` puts three
   * statements on one line, and the skeleton of 2.3 has to walk an arm's body by
   * statement rather than by line to keep them apart.
   */
  headerIndex: number;
  /**
   * `lineStart`/`lineEnd` cover the arm *including* its header, up to the line
   * before the next arm or the closing statement. An arm with no body has
   * `lineEnd` equal to the header's last line.
   */
}

export interface Branch extends SourceRange {
  /** `BR-001`, in source order. Stable for one reading of one source. */
  id: string;
  kind: BranchKind;
  /**
   * For `CASE`, the selector as written — `<fs_order>-action`, or `TYPE OF lo_x`
   * for `CASE TYPE OF`. Undefined for `IF`.
   */
  selector?: string;
  /**
   * Index of the opening and of the closing statement in the statement list.
   *
   * The seam 2.3 builds the gateway on: it has to walk the arms of *this*
   * construct by statement index, and re-deriving which block a `BR-0nn` came
   * from by comparing line numbers would put two `IF`s written on one line into
   * one gateway.
   */
  openIndex: number;
  closeIndex: number;
  arms: BranchArm[];
  /** Blocks around this one, outermost first — the nesting, not a depth number. */
  enclosing: Array<{ kind: BlockKind; lineStart: number }>;
  /** The `id` of the innermost enclosing branch, when there is one. */
  parentId?: string;
  /** Upper-cased name of the subroutine, method, module or event block it sits in. */
  container?: string;
  /** False when no `ENDIF`/`ENDCASE` closed it; the range then runs to the end. */
  terminated: boolean;
}

export interface NotHandled extends SourceRange {
  /** Machine-readable reason, so a surface can group without parsing prose. */
  reason: 'chained-branch' | 'macro-body' | 'unterminated';
  /** Why this is reported rather than drawn. */
  detail: string;
  snippet: string;
}

export interface ControlFlowReport {
  branches: Branch[];
  /** What the reader saw and would not guess at. Empty is the normal case. */
  notHandled: NotHandled[];
}

const ARM_KEYWORDS = new Set(['ELSEIF', 'ELSE', 'WHEN']);

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

function armKind(statement: AbapStatement): ArmKind {
  if (statement.keyword === 'ELSEIF') return 'elseif';
  if (statement.keyword === 'ELSE') return 'else';
  return /^WHEN\s+OTHERS\s*$/i.test(statement.text) ? 'when-others' : 'when';
}

function armCondition(statement: AbapStatement, kind: ArmKind): string {
  if (kind === 'else' || kind === 'when-others') return '';
  return afterKeyword(statement);
}

/** Selector of a `CASE`, as written. `CASE TYPE OF lo_x` keeps its `TYPE OF`. */
function caseSelector(statement: AbapStatement): string {
  return afterKeyword(statement);
}

function armsOf(
  statements: AbapStatement[],
  structure: BlockStructure,
  block: Block,
): BranchArm[] {
  const arms: BranchArm[] = [];
  const headerIndexes: number[] = [];

  if (block.kind === 'if') headerIndexes.push(block.openIndex);
  for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
    if (!ARM_KEYWORDS.has(statements[i].keyword)) continue;
    // Only arms of *this* construct — an ELSE of a nested IF belongs to that one.
    const enclosing = structure.enclosing[i];
    if (enclosing[enclosing.length - 1] !== block) continue;
    headerIndexes.push(i);
  }

  for (let a = 0; a < headerIndexes.length; a++) {
    const header = statements[headerIndexes[a]];
    const kind = a === 0 && block.kind === 'if' ? 'if' : armKind(header);
    const nextHeader = headerIndexes[a + 1];
    const closerLine = statements[block.closeIndex].lineStart;
    const boundary = nextHeader === undefined ? closerLine : statements[nextHeader].lineStart;
    arms.push({
      kind,
      condition: armCondition(header, kind),
      header: { lineStart: header.lineStart, lineEnd: header.lineEnd },
      headerIndex: headerIndexes[a],
      lineStart: header.lineStart,
      lineEnd: Math.max(header.lineEnd, boundary - 1),
    });
  }

  return arms;
}

export function readControlFlow(source: string): ControlFlowReport {
  const statements = readStatements(source);
  const structure = readBlocks(statements);
  return readControlFlowFrom(statements, structure);
}

/** The same reading, for a caller that already holds the statements. */
export function readControlFlowFrom(
  statements: AbapStatement[],
  structure: BlockStructure,
): ControlFlowReport {
  const branches: Branch[] = [];
  const notHandled: NotHandled[] = [];
  const idOfBlock = new Map<Block, string>();

  const branchBlocks = structure.blocks
    .filter((b) => b.kind === 'if' || b.kind === 'case')
    .sort((a, b) => a.openIndex - b.openIndex);

  for (const block of branchBlocks) {
    const opener = statements[block.openIndex];
    const enclosing = structure.enclosing[block.openIndex];

    if (opener.fromChain) {
      notHandled.push({
        reason: 'chained-branch',
        detail:
          'A branch that arrived as one part of a `KEYWORD: a, b.` chain. The parts were separated, but a chained IF or CASE is not a construct this reader will draw a gateway from.',
        snippet: snippet(opener.text),
        lineStart: opener.lineStart,
        lineEnd: opener.lineEnd,
      });
      continue;
    }

    if (enclosing.some((b) => b.kind === 'define')) {
      notHandled.push({
        reason: 'macro-body',
        detail:
          'A branch inside a macro definition. The body is expanded by the compiler wherever the macro is used, not here, so neither the condition nor its line range describes code that runs at this place.',
        snippet: snippet(opener.text),
        lineStart: opener.lineStart,
        lineEnd: opener.lineEnd,
      });
      continue;
    }

    const id = `BR-${String(branches.length + 1).padStart(3, '0')}`;
    idOfBlock.set(block, id);

    const parentBlock = [...enclosing].reverse().find((b) => b.kind === 'if' || b.kind === 'case');
    const container = containerAt(structure.containers, opener.lineStart);

    branches.push({
      id,
      kind: block.kind === 'if' ? 'if' : 'case',
      selector: block.kind === 'case' ? caseSelector(opener) : undefined,
      openIndex: block.openIndex,
      closeIndex: block.closeIndex,
      arms: armsOf(statements, structure, block),
      enclosing: enclosing.map((b) => ({ kind: b.kind, lineStart: b.lineStart })),
      parentId: parentBlock ? idOfBlock.get(parentBlock) : undefined,
      container: container?.name || undefined,
      terminated: block.terminated,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
    });

    if (!block.terminated) {
      notHandled.push({
        reason: 'unterminated',
        detail: `No ${block.kind === 'if' ? 'ENDIF' : 'ENDCASE'} closes this construct in this source. Its range runs to the end of the file and is a guess, not an anchor.`,
        snippet: snippet(opener.text),
        lineStart: block.lineStart,
        lineEnd: block.lineEnd,
      });
    }
  }

  return { branches, notHandled };
}
