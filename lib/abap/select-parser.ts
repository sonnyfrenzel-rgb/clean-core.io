import type {
  SelectModel, JoinClause, JoinType, SelectField, SqlTableRef, SqlQuirk,
} from './sql-model';
import type { SourceRef } from './class-model';

const up = (s: string) => s.trim().toUpperCase();

/** Helper to clean inline comments from a line, respecting string literals and backticks. */
function cleanComments(line: string): string {
  if (/^\s*\*/.test(line)) return '';
  let clean = '';
  let inSingleQuote = false;
  let inBacktick = false;
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === "'" && !inBacktick) inSingleQuote = !inSingleQuote;
    if (ch === "`" && !inSingleQuote) inBacktick = !inBacktick;
    if (ch === '"' && !inSingleQuote && !inBacktick) {
      break;
    }
    clean += ch;
  }
  return clean;
}

/** Extract all SELECT statements (each terminated by '.') from a source file. */
export function extractSelects(content: string): { text: string; line: number }[] {
  const lines = content.split(/\r?\n/);
  const out: { text: string; line: number }[] = [];
  let buf = '';
  let start = 0;
  let inSel = false;
  let inSingleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cleanLine = cleanComments(rawLine);
    const trimmedClean = cleanLine.trim();
    if (!trimmedClean) continue;

    if (!inSel && /\bSELECT\b/i.test(trimmedClean)) {
      inSel = true;
      start = i + 1;
      buf = '';
    }

    if (!inSel) continue;

    buf += (buf ? ' ' : '') + trimmedClean;

    // Track quotes inside the accumulated buffer
    let str = false;
    let bt = false;
    for (let c = 0; c < buf.length; c++) {
      const ch = buf[c];
      if (ch === "'" && !bt) str = !str;
      if (ch === "`" && !str) bt = !bt;
    }

    if (buf.includes('.') && !str && !bt) {
      // Find the terminator '.' outside strings
      let termIdx = -1;
      let s = false;
      let b = false;
      for (let c = 0; c < buf.length; c++) {
        const ch = buf[c];
        if (ch === "'" && !b) s = !s;
        if (ch === "`" && !s) b = !b;
        if (ch === '.' && !s && !b) {
          termIdx = c;
          break;
        }
      }
      if (termIdx !== -1) {
        const statement = buf.slice(0, termIdx).replace(/\s+/g, ' ').trim();
        out.push({ text: statement, line: start });
        inSel = false;
        buf = '';
      }
    }
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

function parseJoins(fromClause: string): { from: SqlTableRef; joins: JoinClause[] } {
  // Split on JOIN keywords, keep the type.
  const joinRe = /\b(INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|CROSS)\s+JOIN\b/i;
  const firstJoin = fromClause.search(joinRe);
  const head = firstJoin === -1 ? fromClause : fromClause.slice(0, firstJoin);
  const fromTok = head.trim().split(/\s+/).filter(Boolean);
  const from: SqlTableRef = {
    name: up(fromTok[0] || ''),
    alias: fromTok[2] ? up(fromTok[2]) : (fromTok[1] && !/AS/i.test(fromTok[1]) ? up(fromTok[1]) : undefined),
  };

  const joins: JoinClause[] = [];
  if (firstJoin === -1) return { from, joins };

  const rest = fromClause.slice(firstJoin);
  const parts = rest.split(/(?=\b(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|CROSS)\s+JOIN\b)/i).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|CROSS)\s+JOIN\s+(\S+)(?:\s+AS\s+(\S+)|\s+(\S+))?(?:\s+ON\s+(.+))?$/i);
    if (!m) continue;
    const typeRaw = up(m[1]);
    const type: JoinType = typeRaw.startsWith('LEFT') ? 'left-outer'
      : typeRaw.startsWith('RIGHT') ? 'right-outer'
      : typeRaw === 'CROSS' ? 'cross' : 'inner';
    joins.push({
      type,
      table: { name: up(m[2]), alias: m[3] ? up(m[3]) : (m[4] ? up(m[4]) : undefined) },
      on: (m[5] || '').trim(),
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
