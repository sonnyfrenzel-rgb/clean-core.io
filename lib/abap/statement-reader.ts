/**
 * ABAP source, read as statements that know where they start and where they end.
 *
 * `declaration-parser.ts` already tokenises, and for what it does — resolving
 * class declarations — a start line is enough. Phase 2 needs more: its acceptance
 * is that "jeder Task, jedes Gateway und jede Lane trägt einen Zeilenanker oder
 * ist sichtbar unbelegt" (`docs/ROADMAP.md` §4, Phase 2). A gateway drawn from an
 * `IF` whose condition runs over four lines has to be able to point at all four,
 * and a reader who clicks it has to land on the whole condition rather than on
 * its first word. So every statement here carries a range, not a line.
 *
 * Two lessons from the neighbouring parsers are built in rather than repeated:
 *
 *   - **A keyword inside a text literal is not a keyword.** `selectStatementStart`
 *     in `select-parser.ts` masks literals character for character before looking
 *     for `SELECT`, because `WRITE 'SELECT data FROM cache.'.` is prose (QA review
 *     of 33471220d6e9, 14d4000c4586). Here the literals are walked once, at the
 *     front: a `.` inside `'…'` or `` `…` `` does not end a statement, a `"`
 *     inside one does not open a comment, and a `PERFORM` inside one is never
 *     seen by anything downstream.
 *   - **The offset matters as much as the answer.** Buffering from the start of
 *     the line put `IF sy-subrc = 0.` at the head of the next statement (QA review
 *     of 5e598828093c). Statements are cut at the period, so two on one line are
 *     two statements, each with that line as its whole range.
 *
 * Chained statements are expanded rather than reported as unhandled. ABAP's `:`
 * repeats everything before it for every comma-separated part after it, so
 * `PERFORM: read, check.` is two PERFORMs and `DATA: a TYPE i, b TYPE c.` is two
 * declarations. Each part keeps its own line range — which is the anchor a reader
 * wants — and `chainHeadLine` says where the keyword it borrowed stands.
 *
 * What this reader does not do: expand macros (`DEFINE … END-OF-DEFINITION`) or
 * follow `INCLUDE`. Native SQL between `EXEC SQL` and `ENDEXEC` is marked with
 * `nativeSql` rather than parsed — it carries no ABAP periods, and its
 * `:host_variable` colons are not chain operators.
 */

/** Where something sits in the source. Always a range, never a bare line. */
export interface SourceRange {
  /** 1-based line where it starts. */
  lineStart: number;
  /** 1-based line where it ends. Equal to `lineStart` for a one-line element. */
  lineEnd: number;
}

export interface AbapStatement extends SourceRange {
  /**
   * The statement with comments removed and every run of whitespace — line
   * breaks included — collapsed to one space. Case is the source's own.
   */
  text: string;
  /**
   * The first token, upper-cased: `IF`, `PERFORM`, `AUTHORITY-CHECK`. Empty when
   * the statement does not begin with a word, as an assignment to a field symbol
   * does not.
   */
  keyword: string;
  /** True when this statement was one part of a `KEYWORD: a, b.` chain. */
  fromChain: boolean;
  /** Line the chain's head stands on. Only set when `fromChain` is true. */
  chainHeadLine?: number;
  /**
   * True between `EXEC SQL` and `ENDEXEC`. The text there is native SQL, not
   * ABAP: it carries no ABAP periods, and its `:host_variable` colons are not
   * chain operators. Marked rather than parsed.
   */
  nativeSql: boolean;
  /** Position in the statement list — the order the program is written in. */
  index: number;
}

interface Scanned {
  chars: string[];
  /** `lineAt[i]` is the 1-based source line character `chars[i]` came from. */
  lineAt: number[];
}

/**
 * Is this line a comment line?
 *
 * `*` in column 1 always is. An **indented** asterisk is where the two shipped
 * examples disagree with each other, so the answer depends on whether a statement
 * is still open:
 *
 *     lv_dev_pct = ( lv_price - lv_ref )      "Z_MM_PO_APPROVAL.abap:411-412
 *                * 100 / lv_ref.
 *
 *     ENDFORM.                                 "Z_SALES_ORDER_CREATOR.txt:70
 *       * Call BAPI Function Module Simulation
 *       CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
 *
 * The first is a continuation of an arithmetic expression; the second is a
 * comment a developer indented, which ABAP would reject but which this product
 * ships as a starter example and users upload every day. Treating every indented
 * asterisk as a comment — which `declaration-parser.ts` and `select-parser.ts` do
 * with the pattern `^\s*\*` — loses the multiplication, and with it the `IF` that
 * follows, because the statement never finds its period. Treating none of them as
 * a comment loses the BAPI call.
 *
 * A statement cannot begin with `*`, and an expression cannot continue where no
 * statement is open. So: an indented asterisk continues an open statement and
 * comments out a line where none is open. Both examples then read correctly, and
 * where the source is genuinely ambiguous — an indented asterisk inside an open
 * statement that was meant as prose — the reader continues the statement, which
 * ABAP would too.
 */
function isCommentLine(raw: string, statementOpen: boolean): boolean {
  if (raw.startsWith('*')) return true;
  return !statementOpen && /^\s+\*/.test(raw);
}

/**
 * Remove the inline comment from a line: a `"` that is not inside a literal.
 * A literal cannot span lines in ABAP, so the quote state starts fresh here.
 */
function stripInlineComment(raw: string): string {
  let inQuote = false;
  let inTick = false;
  let kept = '';
  for (let c = 0; c < raw.length; c++) {
    const ch = raw[c];
    if (ch === '"' && !inQuote && !inTick) break;
    if (ch === "'" && !inTick) inQuote = !inQuote;
    else if (ch === '`' && !inQuote) inTick = !inTick;
    kept += ch;
  }
  return kept;
}

/** Narrow `[from, to)` to the first and last non-space character, or null. */
function trimRange(chars: string[], from: number, to: number): [number, number] | null {
  let a = from;
  let b = to;
  while (a < b && /\s/.test(chars[a])) a += 1;
  while (b > a && /\s/.test(chars[b - 1])) b -= 1;
  return a < b ? [a, b] : null;
}

function sliceText(chars: string[], from: number, to: number): string {
  return chars.slice(from, to).join('').replace(/\s+/g, ' ').trim();
}

/**
 * The offset of the chain colon in `[from, to)`, or -1.
 *
 * ABAP allows the colon after any part of a statement, not only after the first
 * word: `WRITE: / a, / b.` and `MOVE: a TO b, c TO d.` are both chains. So the
 * head is whatever stands before it. Colons inside literals and inside
 * parentheses are not chain operators.
 */
function chainColon(chars: string[], from: number, to: number): number {
  let inQuote = false;
  let inTick = false;
  let depth = 0;
  for (let p = from; p < to; p++) {
    const ch = chars[p];
    if (ch === "'" && !inTick) { inQuote = !inQuote; continue; }
    if (ch === '`' && !inQuote) { inTick = !inTick; continue; }
    if (inQuote || inTick) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) return p;
  }
  return -1;
}

/** Offsets of the top-level commas in `[from, to)`. */
function topLevelCommas(chars: string[], from: number, to: number): number[] {
  const out: number[] = [];
  let inQuote = false;
  let inTick = false;
  let depth = 0;
  for (let p = from; p < to; p++) {
    const ch = chars[p];
    if (ch === "'" && !inTick) { inQuote = !inQuote; continue; }
    if (ch === '`' && !inQuote) { inTick = !inTick; continue; }
    if (inQuote || inTick) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) out.push(p);
  }
  return out;
}

function firstKeyword(text: string): string {
  const m = /^[A-Za-z][\w-]*/.exec(text);
  return m ? m[0].toUpperCase() : '';
}

function push(
  out: AbapStatement[],
  scanned: Scanned,
  from: number,
  to: number,
  nativeSql: boolean,
  chainHead?: { text: string; line: number },
): void {
  const range = trimRange(scanned.chars, from, to);
  if (!range) return;
  const [a, b] = range;
  const body = sliceText(scanned.chars, a, b);
  const text = chainHead ? `${chainHead.text} ${body}`.replace(/\s+/g, ' ').trim() : body;
  if (!text) return;
  out.push({
    text,
    keyword: firstKeyword(text),
    lineStart: scanned.lineAt[a],
    lineEnd: scanned.lineAt[b - 1],
    fromChain: chainHead !== undefined,
    chainHeadLine: chainHead?.line,
    nativeSql,
    index: out.length,
  });
}

/** Emit one source statement, expanding it first when it is a chain. */
function emit(out: AbapStatement[], scanned: Scanned, from: number, to: number, nativeSql: boolean): void {
  const range = trimRange(scanned.chars, from, to);
  if (!range) return;
  const [a, b] = range;

  // Inside EXEC SQL the colons are host variables, not chain operators:
  // `SELECT COUNT(*) INTO :lv_count FROM vbak` split into a head and a part, and
  // the ENDEXEC that closes the region went along with it.
  const colon = nativeSql ? -1 : chainColon(scanned.chars, a, b);
  if (colon === -1) {
    push(out, scanned, a, b, nativeSql);
    return;
  }

  const headRange = trimRange(scanned.chars, a, colon);
  // `: a, b.` with nothing before the colon is not a chain this reader can read.
  if (!headRange) {
    push(out, scanned, a, b, nativeSql);
    return;
  }
  const head = {
    text: sliceText(scanned.chars, headRange[0], headRange[1]),
    line: scanned.lineAt[headRange[0]],
  };

  const tailFrom = colon + 1;
  const commas = topLevelCommas(scanned.chars, tailFrom, b);
  let cursor = tailFrom;
  for (const comma of commas) {
    push(out, scanned, cursor, comma, nativeSql, head);
    cursor = comma + 1;
  }
  push(out, scanned, cursor, b, nativeSql, head);
}

/**
 * Every statement in the source, in the order it is written.
 *
 * Comments are gone, literals are respected, chains are expanded, and each
 * statement carries the line it starts on and the line it ends on.
 */
export function readStatements(source: string): AbapStatement[] {
  const lines = source.split(/\r?\n/);
  const out: AbapStatement[] = [];
  // Characters of the statement being assembled, with the line each came from.
  // Emptied every time a period completes one, so "is a statement open" is just
  // "does this hold anything" — which is what `isCommentLine` needs to know.
  const pending: Scanned = { chars: [], lineAt: [] };
  // Native SQL is not ABAP; it is marked rather than parsed. The flag is read
  // off the statement just emitted, so `EXEC SQL.` itself is ABAP and the
  // statement carrying `ENDEXEC` is still the last native one.
  let nativeSql = false;
  const noteNativeSqlBoundary = () => {
    const last = out[out.length - 1];
    if (!last) return;
    if (/^EXEC\s+SQL\b/i.test(last.text)) nativeSql = true;
    else if (/\bENDEXEC\b/i.test(last.text)) nativeSql = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isCommentLine(raw, pending.chars.length > 0)) continue;

    const trimmed = stripInlineComment(raw).trim();
    if (!trimmed) continue;

    // Where this line's contribution begins — scanning resumes there, with a
    // fresh literal state, because a literal never spans lines.
    const from = pending.chars.length;
    if (from) { pending.chars.push(' '); pending.lineAt.push(i + 1); }
    for (const ch of trimmed) { pending.chars.push(ch); pending.lineAt.push(i + 1); }

    let p = from;
    let inQuote = false;
    let inTick = false;
    while (p < pending.chars.length) {
      const ch = pending.chars[p];
      if (ch === "'" && !inTick) { inQuote = !inQuote; p += 1; continue; }
      if (ch === '`' && !inQuote) { inTick = !inTick; p += 1; continue; }
      if (ch === '.' && !inQuote && !inTick) {
        emit(out, pending, 0, p, nativeSql);
        noteNativeSqlBoundary();
        pending.chars.splice(0, p + 1);
        pending.lineAt.splice(0, p + 1);
        p = 0;
        inQuote = false;
        inTick = false;
        continue;
      }
      p += 1;
    }
  }

  // A last statement without its period — a truncated upload, a snippet.
  if (pending.chars.length) emit(out, pending, 0, pending.chars.length, nativeSql);

  return out;
}

/** The text of a statement with its leading keyword removed. */
export function afterKeyword(statement: AbapStatement): string {
  return statement.text.slice(statement.keyword.length).trim();
}
