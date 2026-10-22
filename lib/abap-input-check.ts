/**
 * Does this text contain ABAP at all?
 *
 * The analyze stage asked that question and answered it with "is the box not
 * empty?" — the keyword list was there, but an `|| code.trim().length > 0`
 * behind it meant a pasted e-mail passed, went to the model, cost a run of the
 * quota and was signed into the trust chain as legacy code.
 *
 * This is a gate, not a parser: it says "there is at least one ABAP top-level
 * construct in here", so a snippet, an include or a single form routine passes
 * and prose does not. The deterministic engine (`lib/abap/`) is what actually
 * reads the code afterwards.
 */

import { readStatements, type AbapStatement } from './abap/statement-reader';

/** Top-level constructs. One of them appearing at the start of a line is ABAP. */
const CONSTRUCTS = [
  /^\s*REPORT\b/im,
  /^\s*PROGRAM\b/im,
  /^\s*(?:TYPE-POOL|TYPE-POOLS)\b/im,
  /^\s*INCLUDE\b/im,
  /^\s*FUNCTION\b/im,
  /^\s*FORM\b/im,
  /^\s*MODULE\b/im,
  /^\s*(?:CLASS|INTERFACE)\s+\S+\s+(?:DEFINITION|IMPLEMENTATION)\b/im,
  /^\s*METHOD\b/im,
  /^\s*START-OF-SELECTION\b/im,
  /^\s*(?:INITIALIZATION|AT SELECTION-SCREEN|END-OF-SELECTION|TOP-OF-PAGE)\b/im,
  /^\s*(?:DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|STATICS|PARAMETERS|SELECT-OPTIONS|TABLES)\b/im,
  /^\s*SELECT\b/im,
  /^\s*(?:LOOP\s+AT|READ\s+TABLE|CALL\s+FUNCTION|CALL\s+METHOD|PERFORM|WRITE|MOVE-CORRESPONDING|MODIFY|INSERT|UPDATE|DELETE)\b/im,
  /^\s*(?:DEFINE\s+VIEW|@AbapCatalog|@EndUserText)\b/im,
];

export function looksLikeAbap(code: string | null | undefined): boolean {
  if (typeof code !== 'string') return false;
  const text = code.trim();
  if (text.length === 0) return false;
  return CONSTRUCTS.some((rx) => rx.test(text));
}

/** Which construct answered — for messages that say what was recognised. */
export function abapConstructFound(code: string | null | undefined): boolean {
  return looksLikeAbap(code);
}

/* ------------------------------------------------- declarations that cannot activate */

/** A LENGTH or DECIMALS in a declaration whose operand is neither a number nor a constant the source declares. */
export interface DeclarationOperandProblem {
  /** The source line the operand stands on. */
  line: number;
  keyword: 'LENGTH' | 'DECIMALS';
  /** The operand as written: `ode`. */
  operand: string;
  /** The declaration without its keyword, on one line: `status TYPE c LENGTH ode`. */
  declaration: string;
}

const DECLARATION_KEYWORDS = new Set(['DATA', 'TYPES', 'CONSTANTS', 'STATICS', 'CLASS-DATA', 'PARAMETERS', 'PARAMETER']);
const OPERAND = /\b(LENGTH|DECIMALS)\s+([^\s,.()]+)/gi;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The declarations of a source whose LENGTH or DECIMALS names something that is no number and no constant the
 * source declares — `status TYPE c LENGTH ode` where nothing defines `ode`. SAP would not activate the program as
 * written; this says so, with the line, and repairs nothing.
 *
 * Empty when the source names an include it does not hold or a type pool: the constant may be defined there. An
 * operand with a component selector (`gc_len-short`) is held to its first name; one of a class or interface
 * (`zif_x=>co_len`) is not judged, since its declaration is outside this source.
 */
export function invalidDeclarationOperands(code: string | null | undefined): DeclarationOperandProblem[] {
  if (typeof code !== 'string' || !code.trim()) return [];
  const text = code.replace(/\r\n?/g, '\n');
  let statements: AbapStatement[];
  try {
    statements = readStatements(text);
  } catch {
    return [];
  }
  const elsewhere = statements.some(
    (s) => (s.keyword === 'INCLUDE' && !/^INCLUDE\s+(?:STRUCTURE|TYPE)\b/i.test(s.text)) || s.keyword === 'TYPE-POOLS' || s.keyword === 'TYPE-POOL',
  );
  if (elsewhere) return [];
  const constants = new Set<string>();
  for (const s of statements) {
    if (s.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(s.text);
    if (m) constants.add(m[1].toLowerCase());
  }
  const lines = text.split('\n');
  const out: DeclarationOperandProblem[] = [];
  for (const s of statements) {
    if (!DECLARATION_KEYWORDS.has(s.keyword)) continue;
    const masked = s.text.replace(/'(?:[^']|'')*'/g, "''").replace(/`(?:[^`]|``)*`/g, '``');
    for (const m of masked.matchAll(OPERAND)) {
      const operand = m[2];
      if (/^[+-]?\d+$/.test(operand) || /^['`]/.test(operand) || operand.includes('=>')) continue;
      if (constants.has(operand.split('-')[0].toLowerCase())) continue;
      const keyword = m[1].toUpperCase() as 'LENGTH' | 'DECIMALS';
      const at = new RegExp(`\\b${keyword}\\s+${escapeRe(operand)}(?![\\w/-])`, 'i');
      let line = s.lineStart;
      for (let i = s.lineStart; i <= s.lineEnd; i++) {
        if (at.test(lines[i - 1] ?? '')) {
          line = i;
          break;
        }
      }
      out.push({ line, keyword, operand, declaration: s.text.slice(s.keyword.length).trim() });
    }
  }
  return out;
}

/** The problem in a reader's words: "Line 251 declares a length `ode` that is no number and no constant …". */
export function declarationOperandSentence(p: DeclarationOperandProblem): string {
  const what = p.keyword === 'LENGTH' ? 'a length' : 'a number of decimals';
  return `Line ${p.line} declares ${what} \`${p.operand}\` that is no number and no constant the program defines (\`${p.declaration}\`) — the program would not activate as written.`;
}
