import { readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, type Block } from './block-structure';

/**
 * "Why is there no result?" — the concrete states in which a run of the program ends with nothing to show (external
 * MM review of 22.10.2026, point 6: the answer said "no early exit found" instead of naming them).
 *
 * Read from the statements, each with its line, in four kinds a business reader can check one by one:
 *
 *   - `input-rejected` — what was entered is refused: an error message, `STOP`, `LEAVE` or `RETURN` in
 *     `AT SELECTION-SCREEN`, or in an `IF`/`CHECK` on a selection parameter (`p_…`, `s_…`, `so_…`);
 *   - `no-candidate` — nothing was found to work on: an `IF`/`CHECK` on `sy-subrc` or on a table being initial
 *     whose arm leaves (message, `RETURN`, `EXIT`, `STOP`, `LEAVE`);
 *   - `excluded` — a document is left out inside a loop: `CHECK`, `CONTINUE` in an `IF`, or a `DELETE … WHERE`;
 *   - `filtered-display` — the rows are narrowed before they are shown: a `DELETE … WHERE` outside a loop, or a
 *     `LOOP AT … WHERE` that writes the list.
 *
 * Nothing is guessed: a kind the code does not show is not listed. Pure: the statement reader and the blocks.
 */

export type NoResultKind = 'input-rejected' | 'no-candidate' | 'excluded' | 'filtered-display';

export interface NoResultState {
  kind: NoResultKind;
  lineStart: number;
  lineEnd: number;
  /** The statement as written, shortened. */
  text: string;
}

export const NO_RESULT_KIND_WORDS: Readonly<Record<NoResultKind, string>> = Object.freeze({
  'input-rejected': 'input rejected',
  'no-candidate': 'nothing found to work on',
  excluded: 'a document excluded',
  'filtered-display': 'rows filtered before they are shown',
});

const LEAVES = /^(?:RETURN|EXIT|STOP|LEAVE)\b|^MESSAGE\b[\s\S]*\bTYPE\s+'?[EAX]'?/i;
const SELECTION = /(?<![\w-])(?:p|s|so|pa)_\w+/i;
const NOT_FOUND = /\bsy-subrc\s*(?:<>|NE|>)\s*0\b|\b0\s*(?:<>|NE|<)\s*sy-subrc\b|\bIS\s+INITIAL\b|\blines\s*\([^)]*\)\s*(?:=|EQ)\s*0\b|\bNOT\s+line_exists\b/i;
const short = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

export function readNoResultStates(source: string): NoResultState[] {
  const statements = readStatements(source);
  const blocks = readBlocks(statements);
  const out: NoResultState[] = [];
  const seen = new Set<string>();
  const push = (kind: NoResultKind, s: AbapStatement) => {
    const key = `${kind}@${s.lineStart}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, lineStart: s.lineStart, lineEnd: s.lineEnd, text: short(s.text) });
  };
  let event: string | null = null;
  statements.forEach((s, i) => {
    const keyword = s.keyword.toUpperCase();
    if (/^(?:AT SELECTION-SCREEN|START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|TOP-OF-PAGE|LOAD-OF-PROGRAM)/.test(s.text.toUpperCase())) event = s.text.toUpperCase();
    if (keyword === 'FORM' || keyword === 'METHOD') event = null;
    const around: Block[] = blocks.enclosing[i] ?? [];
    const inLoop = around.some((b) => b.kind === 'loop' || b.kind === 'do' || b.kind === 'while' || b.kind === 'select');
    const ifAround = [...around].reverse().find((b) => b.kind === 'if');
    const ifHead = ifAround ? statements[ifAround.openIndex] : undefined;
    // A statement that leaves: under which condition?
    if (LEAVES.test(s.text)) {
      if (event?.startsWith('AT SELECTION-SCREEN') || (ifHead && SELECTION.test(ifHead.text) && !NOT_FOUND.test(ifHead.text))) {
        push('input-rejected', ifHead ?? s);
        return;
      }
      if (ifHead && NOT_FOUND.test(ifHead.text) && !inLoop) {
        push('no-candidate', ifHead);
        return;
      }
    }
    if (keyword === 'CHECK') {
      if (inLoop) push('excluded', s);
      else if (SELECTION.test(s.text) && !NOT_FOUND.test(s.text)) push('input-rejected', s);
      else if (NOT_FOUND.test(s.text.replace(/\bsy-subrc\s*(?:=|EQ)\s*0\b/i, 'sy-subrc <> 0')) || /\bIS\s+NOT\s+INITIAL\b/i.test(s.text)) push('no-candidate', s);
      return;
    }
    if (keyword === 'CONTINUE' && inLoop && ifHead) {
      push('excluded', ifHead);
      return;
    }
    // An internal table narrowed (`DELETE lt_rows WHERE …`), not a database delete (`DELETE FROM ztab WHERE …`).
    if (keyword === 'DELETE' && /\bWHERE\b/i.test(s.text) && !/^DELETE\s+FROM\b/i.test(s.text)) {
      push(inLoop ? 'excluded' : 'filtered-display', s);
      return;
    }
    if (keyword === 'LOOP' && /\bWHERE\b/i.test(s.text)) {
      const block = blocks.blocks.find((b) => b.openIndex === i);
      const body = block ? statements.slice(i + 1, block.closeIndex) : [];
      if (body.some((b) => /^(?:WRITE|FORMAT)$/i.test(b.keyword))) push('filtered-display', s);
    }
  });
  const order: NoResultKind[] = ['input-rejected', 'no-candidate', 'excluded', 'filtered-display'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.lineStart - b.lineStart);
}
