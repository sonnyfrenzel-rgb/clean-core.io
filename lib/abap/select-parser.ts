import type {
  SelectModel, JoinClause, JoinType, SelectField, SqlTableRef, SqlQuirk,
} from './sql-model';
import type { SourceRef } from './class-model';
import { maskLiterals, maskNonCode } from './statement-reader';

const up = (s: string) => s.trim().toUpperCase();

/** Extract all SELECT statements (each terminated by '.') from a source file. */
/**
 * Does a statement begin with SELECT on this line, outside of any literal?
 *
 * Text literals are masked first — all four forms, the string template
 * included — so a SELECT that only exists inside one is gone before the
 * question is asked. What remains counts when it opens the line or follows a
 * statement end (`.`) or a chain separator (`:` / `,`), which is where an ABAP
 * statement can start.
 */
export function startsSelectStatement(line: string): boolean {
  return selectStatementStart(line) !== -1;
}

/**
 * Where the SELECT statement begins on this line, or -1.
 *
 * The offset matters as much as the answer: `IF sy-subrc = 0. SELECT * FROM
 * mara INTO TABLE @lt.` does open a query, and buffering the whole line put
 * `IF sy-subrc = 0.` at the head of the statement that was handed on as SQL
 * metadata (QA review of 5e598828093c, 09ebbf100061).
 *
 * Literals are masked rather than removed, character for character, so the
 * offset in the masked line is the offset in the real one.
 */
export function selectStatementStart(line: string): number {
  const masked = maskLiterals(line);
  const match = /(?:^|[.:,])\s*SELECT\b/i.exec(masked);
  if (!match) return -1;
  // The match may start at the statement separator; the statement starts at SELECT.
  return match.index + match[0].toUpperCase().indexOf('SELECT');
}

/**
 * The offset of the period that ends the statement in `bare`, or -1.
 *
 * `bare` is masked code, so every period still in it is code. One is still not
 * a terminator: a period between two digits is a decimal point.
 * `… INNER JOIN b ON b~amount > 1.50 INNER JOIN c ON …` was cut at that point,
 * and `detectComplexJoinFindings` then counted two tables in a three-table
 * query — no partial-support finding, no architect's sign-off (full review of
 * a19945ef01dc, a3b0bfd48551). `statement-reader.ts` states the rule and the
 * argument for it; this is the same rule, one parser over.
 */
function terminatorIn(bare: string): number {
  for (let c = 0; c < bare.length; c++) {
    if (bare[c] !== '.') continue;
    if (/\d/.test(bare[c - 1] ?? '') && /\d/.test(bare[c + 1] ?? '')) continue;
    return c;
  }
  return -1;
}

export function extractSelects(content: string): { text: string; line: number }[] {
  const raw = content.split(/\r?\n/);
  // Comments and literal contents are blanked once, for the whole file, with
  // every line and every column kept — so an offset in `code` is an offset in
  // `raw`, and this parser needs no literal bookkeeping of its own. It used to
  // keep three copies of it, and all three knew `'…'` and `` `…` `` and not the
  // string template.
  const code = maskNonCode(content).split(/\r?\n/);
  const out: { text: string; line: number }[] = [];
  /** What the query says, literals included — this is the text handed on. */
  let buf = '';
  /** The same characters masked, which is what the parser reads. */
  let bare = '';
  let start = 0;
  let inSel = false;

  for (let i = 0; i < raw.length; i++) {
    // Trimmed on the masked line and sliced from both at the same offsets: an
    // inline comment is already blank there, so the two stay aligned.
    const from = code[i].length - code[i].trimStart().length;
    const to = code[i].trimEnd().length;
    if (to <= from) continue;
    const lineCode = code[i].slice(from, to);
    const lineText = raw[i].slice(from, to);

    // `WRITE 'SELECT data FROM cache.'.` is not a query. The old condition was
    // "the line contains SELECT", so a literal mentioning the word opened a
    // statement, the parser buffered everything up to the next period, and the
    // transformation prompt received a sentence as deterministic SQL metadata
    // (QA review of 33471220d6e9, 14d4000c4586). SELECT has to be a statement
    // keyword: outside any literal, and at the start of a statement.
    let openedAt = -1;
    if (!inSel) {
      openedAt = selectStatementStart(lineCode);
      if (openedAt === -1) continue;
      inSel = true;
      start = i + 1;
      buf = '';
      bare = '';
    }

    // From the SELECT, not from the start of the line: a statement that shares
    // its line with the one before it would otherwise carry that one's text.
    const at = openedAt === -1 ? 0 : openedAt;
    buf += (buf ? ' ' : '') + lineText.slice(at);
    bare += (bare ? ' ' : '') + lineCode.slice(at);

    const termIdx = terminatorIn(bare);
    if (termIdx === -1) continue;
    out.push({ text: buf.slice(0, termIdx).replace(/\s+/g, ' ').trim(), line: start });
    inSel = false;
    buf = '';
    bare = '';
  }
  return out;
}

function parseFields(seg: string): { star: boolean; fields: SelectField[] } {
  const s = seg.trim();
  if (s === '*' || /^SINGLE\s+\*$/i.test(s)) return { star: true, fields: [] };
  const fields: SelectField[] = s.split(/\s*,\s*|\s+/).filter(Boolean).map((raw) => {
    const agg = raw.match(/^(SUM|MIN|MAX|AVG|COUNT)\s*\(/i);
    return { raw, aggregate: agg ? (up(agg[1]) as SelectField['aggregate']) : undefined };
  });
  return { star: false, fields };
}

/**
 * Where each join begins in the FROM clause, and which type it names.
 *
 * **The type is optional**, because ABAP's is: `FROM vbak AS h JOIN vbap AS i
 * ON … JOIN vbep AS s ON …` is valid and means INNER three times. The parser
 * required one, so it returned no joins at all and `tableCount` reported one
 * table — a three-table query with neither the partial-support finding nor the
 * architect's sign-off it carries (full review of a19945ef01dc, ed2b52cc2d3f).
 *
 * Matched rather than split: a lookahead with an optional prefix matches both
 * at `INNER` and at the `JOIN` behind it, which cuts one join into two pieces
 * and parses neither. A left-to-right scan takes `INNER JOIN` whole.
 */
function joinStarts(fromClause: string): { at: number; after: number; type?: string }[] {
  const re = /\b(?:(INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|CROSS)\s+)?JOIN\b/gi;
  return [...fromClause.matchAll(re)].map((m) => ({
    at: m.index ?? 0,
    after: (m.index ?? 0) + m[0].length,
    type: m[1],
  }));
}

function parseJoins(fromClause: string): { from: SqlTableRef; joins: JoinClause[] } {
  const starts = joinStarts(fromClause);
  const firstJoin = starts.length ? starts[0].at : -1;
  const head = firstJoin === -1 ? fromClause : fromClause.slice(0, firstJoin);
  const fromTok = head.trim().split(/\s+/).filter(Boolean);
  const from: SqlTableRef = {
    name: up(fromTok[0] || ''),
    alias: fromTok[2] ? up(fromTok[2]) : (fromTok[1] && !/AS/i.test(fromTok[1]) ? up(fromTok[1]) : undefined),
  };

  const joins: JoinClause[] = [];
  for (let k = 0; k < starts.length; k++) {
    const body = fromClause.slice(starts[k].after, k + 1 < starts.length ? starts[k + 1].at : undefined).trim();
    const m = body.match(/^(\S+)(?:\s+AS\s+(\S+)|\s+(\S+))?(?:\s+ON\s+(.+))?$/i);
    if (!m) continue;
    // An omitted type is an inner join — SQL's default and ABAP's.
    const typeRaw = up(starts[k].type ?? 'INNER');
    const type: JoinType = typeRaw.startsWith('LEFT') ? 'left-outer'
      : typeRaw.startsWith('RIGHT') ? 'right-outer'
      : typeRaw === 'CROSS' ? 'cross' : 'inner';
    joins.push({
      type,
      table: { name: up(m[1]), alias: m[2] ? up(m[2]) : (m[3] ? up(m[3]) : undefined) },
      on: (m[4] || '').trim(),
    });
  }
  return { from, joins };
}

function detectQuirks(model: SelectModel): SqlQuirk[] {
  const q: SqlQuirk[] = [];
  if (model.clientSpecified) {
    q.push({ type: 'client-specified', detail: 'CLIENT SPECIFIED — client handling must be replicated explicitly.', affectsResult: true });
  } else {
    q.push({ type: 'implicit-client', detail: 'Implicit client filtering — ensure the target query is client-aware.', affectsResult: false });
  }
  if (model.forAllEntries) {
    q.push({ type: 'for-all-entries', detail: 'FOR ALL ENTRIES: implicit DISTINCT; EMPTY driver selects ALL rows in ABAP.', affectsResult: true });
  }
  if (model.into.kind === 'corresponding') {
    q.push({ type: 'into-corresponding', detail: 'INTO CORRESPONDING: name-based mapping; unmatched fields stay initial.', affectsResult: true });
  }
  if (model.joins.some((j) => j.type === 'left-outer' || j.type === 'right-outer')) {
    q.push({ type: 'outer-join-null', detail: 'OUTER JOIN: DB NULLs become type-initial in ABAP; map null → initial.', affectsResult: true });
  }
  if (model.bypassingBuffer) {
    q.push({ type: 'buffering-bypass', detail: 'BYPASSING BUFFER — read consistency differs from buffered access.', affectsResult: false });
  }
  if (model.fields.some((f) => f.aggregate && f.aggregate !== 'COUNT')) {
    q.push({ type: 'aggregate-null', detail: 'Aggregate over empty set returns NULL in DB; ABAP yields initial.', affectsResult: true });
  }
  return q;
}

export function parseSelect(text: string, file: string, line: number): SelectModel {
  const source: SourceRef = { file, line };
  const t = text.replace(/\s+/g, ' ').trim();

  // 1. Parse INTO segment first regardless of its location (before or after FROM)
  const intoM = t.match(/\bINTO\s+(CORRESPONDING\s+FIELDS\s+OF\s+)?(TABLE\s+)?(@?\w[\w-]*)/i);
  let into: SelectModel['into'] = { kind: 'table', target: '' };
  let statementWithoutInto = t;
  if (intoM) {
    into = {
      kind: intoM[1] ? 'corresponding' : intoM[2] ? 'table' : 'workarea',
      target: up(intoM[3]),
    };
    statementWithoutInto = t.replace(intoM[0], ' ');
  }

  // 2. Parse field segment and from segment from the cleaned statement
  const fieldSeg = (statementWithoutInto.match(/\bSELECT\s+(?:SINGLE\s+|DISTINCT\s+)?(.*?)\s+FROM\s+/i) || [])[1] || '*';
  const fromSeg = (statementWithoutInto.match(/\bFROM\s+(.*?)(?:\s+FOR\s+ALL\s+ENTRIES\b|\s+WHERE\b|\s+GROUP\s+BY\b|\s+ORDER\s+BY\b|\s+UP\s+TO\b|$)/i) || [])[1] || '';
  const { star, fields } = parseFields(fieldSeg);
  const { from, joins } = parseJoins(fromSeg);

  const fae = statementWithoutInto.match(/\bFOR\s+ALL\s+ENTRIES\s+IN\s+(@?\w[\w-]*)/i);
  const upTo = statementWithoutInto.match(/\bUP\s+TO\s+(\d+)\s+ROWS\b/i);

  const model: SelectModel = {
    source, starSelect: star, fields, from, joins, into,
    forAllEntries: fae ? { driver: up(fae[1]) } : undefined,
    where: (statementWithoutInto.match(/\bWHERE\s+(.*?)(?:\s+GROUP\s+BY\b|\s+ORDER\s+BY\b|\s+UP\s+TO\b|$)/i) || [])[1]?.trim(),
    groupBy: (statementWithoutInto.match(/\bGROUP\s+BY\s+(.*?)(?:\s+ORDER\s+BY\b|\s+UP\s+TO\b|$)/i) || [])[1]?.split(/\s*,\s*/).filter(Boolean) || [],
    orderBy: (statementWithoutInto.match(/\bORDER\s+BY\s+(.*?)(?:\s+UP\s+TO\b|$)/i) || [])[1]?.split(/\s*,\s*/).filter(Boolean) || [],
    upToRows: upTo ? parseInt(upTo[1], 10) : undefined,
    distinct: /\bSELECT\s+DISTINCT\b/i.test(statementWithoutInto),
    clientSpecified: /\bCLIENT\s+SPECIFIED\b/i.test(statementWithoutInto),
    bypassingBuffer: /\bBYPASSING\s+BUFFER\b/i.test(statementWithoutInto),
    quirks: [],
  };
  model.quirks = detectQuirks(model);
  return model;
}
