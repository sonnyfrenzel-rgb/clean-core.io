/**
 * The golden master: the original's own demo cases, carried into the package
 * as ABAP Unit test data (roadmap 3.0.13 item 6, owner 14.10.2026).
 *
 * Two external reviews of the SD example found that ZSD_RETURN_CREDIT_RECON
 * carries 32 demo cases — fixture routines, a CASE on the case number, a
 * title per case — that together are an executable specification: a reviewer
 * rebuilt the logic from them and every case gave what its title says. The
 * package dropped them ("Demo data … not carried over"), and its test class
 * skipped 40 of 45 methods. This module reads those cases from the source and
 * writes them as test data; it computes no expected value and asks no model.
 *
 * What it reads, by shape and never by name:
 *
 *   - **fixture routines**: a FORM whose USING parameters are copied into the
 *     components of one work area and that work area appended to one table
 *     (`ls-org = iv_org. … APPEND ls TO gt_claims.`);
 *   - **the baseline**: the FORM that calls fixture routines most often, with
 *     literal arguments — its rows are the input every case starts from;
 *   - **the case switch**: a CASE whose WHEN arms are integer literals and whose
 *     arms change the fixture tables (at least two arms do). Its arms are the
 *     cases. A title is the text literal the arms assign to one variable
 *     (`gv_case_text = '…'`), or else the comment on the WHEN line
 *     (`WHEN 1. " partial_orders`);
 *   - **each arm, executed** on a copy of the baseline by a small interpreter of
 *     the statements such arms are written in: a fixture call, `CLEAR` of a
 *     table, `READ TABLE … WITH KEY` + component assignments + `APPEND`, `LOOP AT
 *     … WHERE … MODIFY … INDEX`, `DELETE … WHERE`, a table rebuilt in reverse
 *     (`INSERT … INDEX 1`) and assigned back, a select-option filled through its
 *     header line, and a literal assigned to a parameter or another variable (a
 *     *setting*). A statement outside these is not guessed: it is listed under
 *     `unread` with its line, and the case says it was read only in part.
 *
 * Expected values: none are invented. The title is what the original says the
 * case shows. Since 3.0.14 (item 8, owner 15.10.2026) a case compares its result
 * where an expected result of the original is on record (`GoldenMasterExpected`,
 * the seam for the owner's characterization samples of 3.0.19); otherwise it runs
 * the logic and then reports itself as skipped — "not compared", never as passed.
 * Pure and deterministic: no network, no model, no React.
 *
 * ---------------------------------------------------------------------------
 * STABLE INTERFACE (route-neutral; owner 14.10.2026: the golden master feeds
 * both routes). Consumers depend on these and nothing else:
 *
 *   originalDemoCases(source: string): OriginalDemoCases | null
 *     The original's demo cases as plain JSON (format
 *     `clean-core.original-demo/1`): the case selector (`switch`), the demo
 *     flag, the parameters with their DEFAULTs, the baseline rows per table,
 *     and per case its number, title (and where the title came from), line
 *     range, input rows per table (complete, after the case ran on the
 *     baseline), changed tables, settings (parameters and other variables the
 *     case assigns), select-option rows, and the statements not read
 *     (`unread`: empty means the case was read whole). A value is a string as
 *     the original writes it, or `{ param, op, n }` for a value relative to a
 *     parameter (`p_key + 10`). Null: the source has no demo cases this
 *     reader recognises. The Node route writes it as
 *     `test/fixtures/original-demo.json`.
 *   ORIGINAL_DEMO_FORMAT — the format string above; it changes only with an
 *     incompatible change of the shape.
 *
 * Consumers inside this module (not part of the interface): the ABAP Unit
 * writer (`goldenMasterTestClass`, `goldenMasterForScaffold`) for the RAP
 * scaffold's test include, on the richer internal `readGoldenMaster`.
 * ---------------------------------------------------------------------------
 */

import { readStatements, type AbapStatement } from '../abap/statement-reader';

export const GOLDEN_MASTER_VERSION = 1;

/** One input row: component → value as the original writes it (`'0.300'` → `0.300`). */
export type GmRow = Record<string, string>;

export interface GmFixtureRoutine {
  name: string;
  /** The table the routine appends to, upper case: `GT_CLAIMS`. */
  table: string;
  /** USING parameters in order, upper case. */
  params: string[];
  /** Parameter → component it fills (lower case). */
  components: Record<string, string>;
  lineStart: number;
  lineEnd: number;
}

export interface GmSetting {
  /** The variable the arm assigns, upper case: `P_KNOWN`, `GS_SEL-ATOMIC`, `GV_SEALED`. */
  target: string;
  value: string;
  line: number;
}

export interface GmUnread {
  line: number;
  text: string;
}

export interface GoldenMasterCase {
  number: number;
  title: string;
  titleSource: 'assignment' | 'comment' | 'none';
  lineStart: number;
  lineEnd: number;
  /** Every fixture table's input rows for this case, after the arm ran on the baseline. */
  tables: Record<string, GmRow[]>;
  /** Per table and row: the baseline row it came from (0-based), or null for a row the arm added. */
  provenance: Record<string, Array<number | null>>;
  /** Fixture tables whose rows differ from the baseline. */
  changed: string[];
  /** Literal assignments to parameters and other variables, in order. */
  settings: GmSetting[];
  /** Select-options the arm filled: name → rows (`sign`, `option`, `low`, `high`). */
  ranges: Record<string, GmRow[]>;
  /** Statements the reader did not execute. Empty: the case was read whole. */
  unread: GmUnread[];
}

export interface GoldenMaster {
  version: number;
  /** The CASE operand: `P_CASE`, `GS_SEL-CASE_NO`. */
  switchOperand: string;
  /** The selection parameter the case number comes from, when it is one (directly or through one assignment). */
  switchParameter: string | null;
  /** A parameter that decides whether the demo data is built at all (`IF p_demo = 'X'.` around the baseline). */
  demoFlag: string | null;
  caseRoutine: { name: string; lineStart: number; lineEnd: number };
  baseRoutine: { name: string; lineStart: number; lineEnd: number };
  fixtures: GmFixtureRoutine[];
  baseline: Record<string, GmRow[]>;
  /** A variable the program fills straight from a parameter (`gs_sel-atomic = p_atom.`): variable → parameter, upper case. */
  aliases: Record<string, string>;
  /** Statements of the baseline routine the reader did not execute. */
  baselineUnread: GmUnread[];
  /** Parameter (upper case) → its type as declared (`SY-DATUM`, `I`, `CHECKBOX`), and its DEFAULT as written (`sy-datum`). */
  parameterTypes: Record<string, string>;
  parameterDefaults: Record<string, string>;
  /** Parameter (upper case) → DEFAULT literal. */
  parameters: Record<string, string>;
  selectOptions: string[];
  cases: GoldenMasterCase[];
}

/* ------------------------------------------------------------------ reading */

interface Form {
  name: string;
  lineStart: number;
  lineEnd: number;
  head: AbapStatement;
  body: AbapStatement[];
}

const IDENT = /^[a-z_][\w\-~]*$/i;

function formsOf(statements: AbapStatement[]): Form[] {
  const out: Form[] = [];
  let open: Form | null = null;
  for (const s of statements) {
    if (s.keyword === 'FORM') {
      const name = s.text.split(/\s+/)[1] ?? '';
      open = { name: name.toUpperCase(), lineStart: s.lineStart, lineEnd: s.lineEnd, head: s, body: [] };
    } else if (s.keyword === 'ENDFORM') {
      if (open) {
        open.lineEnd = s.lineEnd;
        out.push(open);
      }
      open = null;
    } else if (open) open.body.push(s);
  }
  return out;
}

/** Splits an argument list into tokens, keeping quoted literals whole. */
export function tokens(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c) {
          if (text[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !/\s/.test(text[j])) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

/** A literal's value, or null when the token is not a literal the reader can resolve. */
function literalValue(token: string, constants: Map<string, string>): string | null {
  if (/^'[\s\S]*'$/.test(token)) return token.slice(1, -1).replace(/''/g, "'");
  if (/^`[\s\S]*`$/.test(token)) return token.slice(1, -1).replace(/``/g, '`');
  if (/^-?\d+(\.\d+)?$/.test(token)) return token;
  const upper = token.toUpperCase();
  if (upper === 'SPACE' || upper === 'ABAP_FALSE') return '';
  if (upper === 'ABAP_TRUE') return 'X';
  return constants.get(upper) ?? null;
}

function constantsOf(statements: AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of statements) {
    if (s.keyword !== 'CONSTANTS') continue;
    const t = tokens(s.text.replace(/^CONSTANTS:?\s*/i, ''));
    const v = t.findIndex((x) => x.toUpperCase() === 'VALUE');
    if (v < 0 || !t[0] || !t[v + 1]) continue;
    const value = literalValue(t[v + 1], new Map());
    if (value !== null) out.set(t[0].toUpperCase(), value);
  }
  return out;
}

/** The FORM's USING/CHANGING parameter names, upper case: `iv_org TYPE c`, `VALUE(iv_werks) TYPE ty_plant`. */
function formParams(head: AbapStatement): string[] {
  const t = tokens(head.text).slice(2);
  const out: string[] = [];
  for (let i = 0; i + 1 < t.length; i++) {
    if (!/^(TYPE|LIKE)$/i.test(t[i + 1])) continue;
    const m = /^(?:VALUE|REFERENCE)\((\w+)\)$/i.exec(t[i]);
    const name = m ? m[1] : t[i];
    if (IDENT.test(name) && !/^(USING|CHANGING|TABLES|TYPE|LIKE|REF|TO)$/i.test(name)) out.push(name.toUpperCase());
  }
  return out;
}

function fixtureOf(form: Form): GmFixtureRoutine | null {
  const params = formParams(form.head);
  if (params.length === 0) return null;
  let wa: string | null = null;
  let table: string | null = null;
  const components: Record<string, string> = {};
  for (const s of form.body) {
    if (s.keyword === 'DATA' || s.keyword === 'CLEAR') continue;
    const append = /^APPEND\s+(\w+)\s+TO\s+(\w+)$/i.exec(s.text);
    if (append) {
      if (table) return null;
      if (wa && append[1].toUpperCase() !== wa) return null;
      wa = append[1].toUpperCase();
      table = append[2].toUpperCase();
      continue;
    }
    const set = /^(\w+)-(\w+)\s*=\s*(\w+)$/i.exec(s.text);
    if (set && params.includes(set[3].toUpperCase())) {
      if (wa && wa !== set[1].toUpperCase()) return null;
      wa = set[1].toUpperCase();
      components[set[3].toUpperCase()] = set[2].toLowerCase();
      continue;
    }
    return null;
  }
  if (!table || Object.keys(components).length === 0) return null;
  return { name: form.name, table, params, components, lineStart: form.lineStart, lineEnd: form.lineEnd };
}

/** `PERFORM add_claim USING 'a' 'b' 1.` against a fixture routine: the row, or null when an argument is not a literal. */
function fixtureCall(s: AbapStatement, fixtures: Map<string, GmFixtureRoutine>, constants: Map<string, string>): { fixture: GmFixtureRoutine; row: GmRow | null } | null {
  if (s.keyword !== 'PERFORM') return null;
  const t = tokens(s.text);
  const fixture = fixtures.get((t[1] ?? '').toUpperCase());
  if (!fixture) return null;
  const using = t.findIndex((x) => x.toUpperCase() === 'USING');
  const args = using < 0 ? [] : t.slice(using + 1);
  if (args.length !== fixture.params.length) return { fixture, row: null };
  const row: GmRow = {};
  for (let i = 0; i < args.length; i++) {
    const v = literalValue(args[i], constants);
    if (v === null) return { fixture, row: null };
    const comp = fixture.components[fixture.params[i]];
    if (comp) row[comp] = v;
  }
  return { fixture, row };
}

interface CaseBlock {
  operand: string;
  arms: Array<{ number: number; when: AbapStatement; body: AbapStatement[] }>;
  start: AbapStatement;
  end: AbapStatement;
}

/** Every CASE block with at least two integer WHEN arms; nested blocks are found too. */
function caseBlocks(statements: AbapStatement[]): CaseBlock[] {
  const out: CaseBlock[] = [];
  for (let i = 0; i < statements.length; i++) {
    if (statements[i].keyword !== 'CASE') continue;
    const operand = statements[i].text.replace(/^CASE\s+/i, '').trim();
    const arms: CaseBlock['arms'] = [];
    let depth = 0;
    let current: CaseBlock['arms'][number] | null = null;
    let j = i + 1;
    for (; j < statements.length; j++) {
      const s = statements[j];
      if (s.keyword === 'CASE') depth++;
      if (s.keyword === 'ENDCASE') {
        if (depth === 0) break;
        depth--;
      }
      if (depth === 0 && s.keyword === 'WHEN') {
        const m = /^WHEN\s+(-?\d+)$/i.exec(s.text);
        current = m ? { number: Number(m[1]), when: s, body: [] } : null;
        if (current) arms.push(current);
        continue;
      }
      if (current) current.body.push(s);
    }
    if (j >= statements.length) continue;
    if (arms.length >= 2) out.push({ operand, arms, start: statements[i], end: statements[j] });
  }
  return out;
}

/* ---------------------------------------------------------------- the interpreter */

interface Row {
  v: GmRow;
  src: number | null;
}

interface Machine {
  tables: Map<string, Row[]>;
  /** Work areas (copies) and field symbols (`<S>`: the row itself, so a write goes through to the table). */
  areas: Map<string, Row>;
  /** Selection parameters, upper case: `CLEAR p_atom.` is a setting, and `p_key + 10` a value relative to one. */
  params: Set<string>;
  vars: Map<string, string>;
  settings: GmSetting[];
  ranges: Set<string>;
  unread: GmUnread[];
  subrc: number;
  titleVar: string | null;
  /** Data objects declared as internal tables (DATA … TYPE STANDARD TABLE OF / a table type). */
  tableNames: Set<string>;
  /** Select-options: a name without `[]` is their header line. */
  headerLines: Set<string>;
  title: string | null;
}

const copyRow = (r: Row): Row => ({ v: { ...r.v }, src: r.src });

/** `a = 'x' AND b = 'y'` (WHERE) or `a = 'x' b = 'y'` (WITH KEY): the pairs, or null when not all are literal equalities. */
function conditions(text: string, constants: Map<string, string>): Array<[string, string]> | null {
  const t = tokens(text).filter((x) => x.toUpperCase() !== 'AND');
  if (t.length % 3 !== 0) return null;
  const out: Array<[string, string]> = [];
  for (let i = 0; i < t.length; i += 3) {
    if (t[i + 1] !== '=' && t[i + 1].toUpperCase() !== 'EQ') return null;
    const v = literalValue(t[i + 2], constants);
    if (v === null || !IDENT.test(t[i])) return null;
    out.push([t[i].toLowerCase(), v]);
  }
  return out;
}

const matches = (row: GmRow, cond: Array<[string, string]>) => cond.every(([k, v]) => (row[k] ?? '') === v);

function tableOf(m: Machine, name: string): Row[] {
  const key = name.toUpperCase().replace(/\[\]$/, '');
  let t = m.tables.get(key);
  if (!t) {
    t = [];
    m.tables.set(key, t);
  }
  return t;
}

/** Statements of a block up to its matching end keyword: the body and the index after the end. */
function blockOf(list: AbapStatement[], from: number, open: string, close: string): { body: AbapStatement[]; next: number } {
  let depth = 0;
  for (let j = from + 1; j < list.length; j++) {
    if (list[j].keyword === open) depth++;
    if (list[j].keyword === close) {
      if (depth === 0) return { body: list.slice(from + 1, j), next: j + 1 };
      depth--;
    }
  }
  return { body: list.slice(from + 1), next: list.length };
}

/** A value relative to a parameter (`p_key + 10`), kept as such: the marker, the parameter, the sign and the offset. */
export const GM_EXPRESSION = '\u0001';

export function gmExpression(value: string): { param: string; op: '+' | '-'; n: string } | null {
  if (!value.startsWith(GM_EXPRESSION)) return null;
  const m = /^([\w-]+)([+-])(\d+)$/.exec(value.slice(1));
  return m ? { param: m[1], op: m[2] as '+' | '-', n: m[3] } : null;
}

/** A literal, or a parameter plus or minus an integer literal; null otherwise. */
function valueOf(rhs: string, m: Machine, constants: Map<string, string>): string | null {
  const lit = literalValue(rhs, constants);
  if (lit !== null) return lit;
  const expr = /^([\w-]+)\s*([+-])\s*(\d+)$/.exec(rhs.trim());
  if (expr && m.params.has(expr[1].toUpperCase())) return `${GM_EXPRESSION}${expr[1].toUpperCase()}${expr[2]}${expr[3]}`;
  if (/^[\w-]+$/.test(rhs) && m.params.has(rhs.toUpperCase())) return `${GM_EXPRESSION}${rhs.toUpperCase()}+0`;
  return null;
}

/** ABAP's sort on the components named: numbers as numbers, everything else as text. */
function sortRows(rows: Row[], keys: Array<{ col: string; desc: boolean }>): void {
  const cmp = (a: string, b: string) => {
    const na = Number(a);
    const nb = Number(b);
    if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((x, y) => {
    for (const k of keys) {
      const c = cmp(x.r.v[k.col] ?? '', y.r.v[k.col] ?? '');
      if (c !== 0) return k.desc ? -c : c;
    }
    return x.i - y.i;
  });
  rows.splice(0, rows.length, ...indexed.map((x) => x.r));
}

const AREA = String.raw`(<\w+>|\w+)`;

function run(list: AbapStatement[], m: Machine, ctx: { fixtures: Map<string, GmFixtureRoutine>; constants: Map<string, string>; loop: { table: string; index: number } | null }): void {
  const unread = (s: AbapStatement) => m.unread.push({ line: s.lineStart, text: s.text });
  /** `wa-f` / `<s>-f`: the area and the component, when the area is one the arm holds. */
  const component = (target: string): { area: Row; col: string } | null => {
    const dash = target.indexOf('-');
    if (dash <= 0) return null;
    const area = m.areas.get(target.slice(0, dash).toUpperCase());
    return area ? { area, col: target.slice(dash + 1).toLowerCase() } : null;
  };
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const text = s.text;
    const call = fixtureCall(s, ctx.fixtures, ctx.constants);
    if (call) {
      if (call.row) tableOf(m, call.fixture.table).push({ v: call.row, src: null });
      else unread(s);
      continue;
    }
    if (s.keyword === 'DATA' || s.keyword === 'FIELD-SYMBOLS' || s.keyword === 'RETURN' || s.keyword === 'MESSAGE') {
      if (s.keyword === 'MESSAGE') unread(s);
      continue;
    }
    if (s.keyword === 'IF') {
      const { body, next } = blockOf(list, i, 'IF', 'ENDIF');
      // The anchor guard of a mutation (`IF sy-subrc <> 0. MESSAGE … ENDIF.`): it stops the demo when its row is missing.
      if (/^IF\s+sy-subrc\s*(<>|NE)\s*0$/i.test(text) && body.every((b) => b.keyword === 'MESSAGE')) {
        if (m.subrc !== 0) unread(s);
      } else {
        unread(s);
        for (const b of body) unread(b);
      }
      i = next - 1;
      continue;
    }
    if (s.keyword === 'LOOP') {
      const { body, next } = blockOf(list, i, 'LOOP', 'ENDLOOP');
      i = next - 1;
      const lp = new RegExp(String.raw`^LOOP\s+AT\s+(\w+)\s+(INTO|ASSIGNING)\s+${AREA}(?:\s+WHERE\s+(.+))?$`, 'i').exec(text);
      const cond = lp ? (lp[4] ? conditions(lp[4], ctx.constants) : []) : null;
      if (!lp || cond === null) {
        unread(s);
        for (const b of body) unread(b);
        continue;
      }
      const table = lp[1].toUpperCase();
      const wa = lp[3].toUpperCase();
      const assigning = lp[2].toUpperCase() === 'ASSIGNING';
      // The rows the loop visits; MODIFY writes back by index, a field symbol writes through.
      const visit = tableOf(m, table)
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => matches(r.v, cond));
      for (const { r, idx } of visit) {
        m.areas.set(wa, assigning ? r : copyRow(r));
        run(body, m, { ...ctx, loop: { table, index: idx } });
      }
      continue;
    }
    if (s.keyword === 'READ') {
      const rd = new RegExp(String.raw`^READ\s+TABLE\s+(\w+)\s+(INTO|ASSIGNING)\s+${AREA}\s+(?:WITH\s+KEY\s+(.+)|INDEX\s+(\d+))$`, 'i').exec(text);
      const cond = rd && rd[4] ? conditions(rd[4], ctx.constants) : null;
      if (!rd || (rd[4] && !cond)) {
        unread(s);
        continue;
      }
      const rows = tableOf(m, rd[1]);
      const hit = cond ? rows.find((r) => matches(r.v, cond)) : rows[Number(rd[5]) - 1];
      m.subrc = hit ? 0 : 4;
      if (hit) m.areas.set(rd[3].toUpperCase(), rd[2].toUpperCase() === 'ASSIGNING' ? hit : copyRow(hit));
      else unread(s);
      continue;
    }
    if (s.keyword === 'APPEND') {
      const ap = /^APPEND\s+(\w+)(?:\s+TO\s+(\w+))?$/i.exec(text);
      const wa = ap ? m.areas.get(ap[1].toUpperCase()) : undefined;
      if (!ap || !wa) {
        unread(s);
        continue;
      }
      const target = (ap[2] ?? ap[1]).toUpperCase();
      // A row appended from a work area read out of a table is a new row, not the old one.
      tableOf(m, target).push({ v: { ...wa.v }, src: null });
      if (!ap[2]) m.ranges.add(target);
      continue;
    }
    if (s.keyword === 'INSERT') {
      const ins = /^INSERT\s+(\w+)\s+INTO\s+(\w+)\s+INDEX\s+1$/i.exec(text);
      const wa = ins ? m.areas.get(ins[1].toUpperCase()) : undefined;
      if (!ins || !wa) {
        unread(s);
        continue;
      }
      tableOf(m, ins[2]).unshift(copyRow(wa));
      continue;
    }
    if (s.keyword === 'MODIFY') {
      const md = /^MODIFY\s+(\w+)\s+FROM\s+(\w+)\s+INDEX\s+(\w+)$/i.exec(text);
      const wa = md ? m.areas.get(md[2].toUpperCase()) : undefined;
      const idx = md ? (/^\d+$/.test(md[3]) ? Number(md[3]) - 1 : Number(m.vars.get(md[3].toUpperCase()) ?? NaN) - 1) : NaN;
      const table = md ? tableOf(m, md[1]) : [];
      if (!md || !wa || !Number.isInteger(idx) || !table[idx]) {
        unread(s);
        continue;
      }
      table[idx] = { v: { ...wa.v }, src: table[idx].src };
      continue;
    }
    if (s.keyword === 'DELETE') {
      const dl = /^DELETE\s+(\w+)\s+WHERE\s+(.+)$/i.exec(text);
      const cond = dl ? conditions(dl[2], ctx.constants) : null;
      if (!dl || !cond) {
        unread(s);
        continue;
      }
      const t = tableOf(m, dl[1]);
      const kept = t.filter((r) => !matches(r.v, cond));
      t.splice(0, t.length, ...kept);
      continue;
    }
    if (s.keyword === 'SORT') {
      const so = /^SORT\s+(\w+)\s+BY\s+(.+)$/i.exec(text);
      const words = so ? so[2].split(/\s+/) : [];
      const keys: Array<{ col: string; desc: boolean }> = [];
      for (const w of words) {
        if (/^DESCENDING$/i.test(w) && keys.length) keys[keys.length - 1].desc = true;
        else if (/^ASCENDING$/i.test(w)) continue;
        else if (/^\w+$/.test(w)) keys.push({ col: w.toLowerCase(), desc: false });
        else keys.splice(0);
      }
      if (!so || keys.length === 0 || !m.tables.has(so[1].toUpperCase())) {
        unread(s);
        continue;
      }
      sortRows(tableOf(m, so[1]), keys);
      continue;
    }
    if (s.keyword === 'CLEAR' || s.keyword === 'REFRESH') {
      const names = text.replace(/^(CLEAR|REFRESH):?\s*/i, '').split(/[\s,]+/).filter(Boolean);
      for (const raw of names) {
        const name = raw.toUpperCase();
        const comp = component(name);
        if (comp) comp.area.v[comp.col] = '';
        else if (name.endsWith('[]') || s.keyword === 'REFRESH' || (!m.headerLines.has(name) && (m.tableNames.has(name) || (m.tables.has(name) && !m.areas.has(name))))) tableOf(m, name).splice(0);
        else if (m.params.has(name) || name.includes('-')) m.settings.push({ target: name, value: '', line: s.lineStart });
        else m.areas.set(name, { v: {}, src: null });
        if (name.endsWith('[]')) m.ranges.add(name.slice(0, -2));
      }
      continue;
    }
    const assign = /^([\w\-~<>]+)\s*=\s*(.+)$/.exec(text);
    if (assign) {
      const target = assign[1].toUpperCase();
      const rhs = assign[2].trim();
      if (/^sy-tabix$/i.test(rhs) && ctx.loop) {
        m.vars.set(target, String(ctx.loop.index + 1));
        continue;
      }
      // A table assigned from a table (`gt_raw = lt_events.`).
      if (IDENT.test(rhs) && !rhs.includes('-') && m.tables.has(rhs.toUpperCase()) && (m.tables.has(target) || m.tableNames.has(target))) {
        const from = tableOf(m, rhs).map(copyRow);
        tableOf(m, target).splice(0, Infinity, ...from);
        continue;
      }
      const value = valueOf(rhs, m, ctx.constants);
      if (value === null) {
        unread(s);
        continue;
      }
      if (m.titleVar && target === m.titleVar) {
        m.title = value;
        continue;
      }
      const comp = component(target);
      if (comp) {
        comp.area.v[comp.col] = value;
        continue;
      }
      m.settings.push({ target, value, line: s.lineStart });
      continue;
    }
    unread(s);
  }
}

/* ---------------------------------------------------------------- entry point */

/** Every data object declared as an internal table: `TYPE STANDARD TABLE OF …`, or a type declared as one. */
function tableNamesOf(statements: AbapStatement[]): Set<string> {
  const tableTypes = new Set<string>();
  const isTable = (rest: string) => /\bTABLE\s+OF\b|\bRANGE\s+OF\b/i.test(rest);
  for (const s of statements) {
    if (s.keyword !== 'TYPES') continue;
    const m = /^TYPES:?\s+(\w+)\s+(.*)$/i.exec(s.text);
    if (m && isTable(m[2])) tableTypes.add(m[1].toUpperCase());
  }
  const out = new Set<string>();
  for (const s of statements) {
    if (s.keyword !== 'DATA' && s.keyword !== 'STATICS') continue;
    const m = /^(?:DATA|STATICS):?\s+(\w+)\s+(?:TYPE|LIKE)\s+(.*)$/i.exec(s.text);
    if (!m) continue;
    const type = (m[2].split(/\s+/)[0] ?? '').toUpperCase();
    if (isTable(m[2]) || tableTypes.has(type)) out.add(m[1].toUpperCase());
  }
  return out;
}

/** The variable most arms (at least two) assign a text literal to first — the case title. */
function titleVariable(block: CaseBlock): string | null {
  const counts = new Map<string, number>();
  for (const arm of block.arms) {
    const first = arm.body.find((s) => s.keyword !== 'DATA');
    const m = first ? /^([\w\-]+)\s*=\s*'(.*)'$/.exec(first.text) : null;
    // A title is words, not a flag or a code: a space, or a word of four letters or more.
    if (m && (/\s/.test(m[2].trim()) || /[A-Za-z]{4,}/.test(m[2]))) counts.set(m[1].toUpperCase(), (counts.get(m[1].toUpperCase()) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= Math.min(2, block.arms.length) ? best[0] : null;
}

/** The comment on a WHEN line: `WHEN 1. " partial_orders` → `partial_orders`. */
function whenComment(lines: string[], when: AbapStatement): string | null {
  const raw = lines[when.lineEnd - 1] ?? '';
  const m = /^\s*WHEN\s+-?\d+\s*\.\s*"\s*(.+?)\s*$/i.exec(raw);
  return m ? m[1] : null;
}

function parametersOf(statements: AbapStatement[], constants: Map<string, string>): { defaults: Record<string, string>; rawDefaults: Record<string, string>; types: Record<string, string>; selectOptions: string[] } {
  const defaults: Record<string, string> = {};
  const rawDefaults: Record<string, string> = {};
  const types: Record<string, string> = {};
  const selectOptions: string[] = [];
  for (const s of statements) {
    if (s.keyword === 'PARAMETERS' || s.keyword === 'PARAMETER') {
      const t = tokens(s.text.replace(/^PARAMETERS?:?\s*/i, ''));
      const name = (t[0] ?? '').toUpperCase();
      if (!name) continue;
      const d = t.findIndex((x) => x.toUpperCase() === 'DEFAULT');
      const ty = t.findIndex((x) => /^(TYPE|LIKE)$/i.test(x));
      defaults[name] = d >= 0 && t[d + 1] ? literalValue(t[d + 1], constants) ?? '' : '';
      rawDefaults[name] = d >= 0 && t[d + 1] ? t[d + 1] : '';
      types[name] = ty >= 0 && t[ty + 1] ? t[ty + 1].toUpperCase() : /\bAS\s+CHECKBOX\b/i.test(s.text) ? 'CHECKBOX' : '';
    } else if (s.keyword === 'SELECT-OPTIONS') {
      const name = tokens(s.text.replace(/^SELECT-OPTIONS:?\s*/i, ''))[0];
      if (name) selectOptions.push(name.toUpperCase());
    }
  }
  return { defaults, rawDefaults, types, selectOptions };
}

/** Rows a FORM builds from literals: fixture calls, and `APPEND wa TO table` of a work area it fills with a literal. */
function rowStatements(f: Form, fixtures: Map<string, GmFixtureRoutine>, constants: Map<string, string>): { count: number; tables: Set<string> } {
  const literalAreas = new Set<string>();
  for (const s of f.body) {
    const a = /^(\w+)-\w+\s*=\s*(.+)$/.exec(s.text);
    if (a && literalValue(a[2].trim(), constants) !== null) literalAreas.add(a[1].toUpperCase());
  }
  let count = 0;
  const tables = new Set<string>();
  for (const s of f.body) {
    const call = fixtureCall(s, fixtures, constants);
    if (call) {
      count++;
      tables.add(call.fixture.table);
      continue;
    }
    const ap = /^APPEND\s+(\w+)\s+TO\s+(\w+)$/i.exec(s.text);
    if (ap && literalAreas.has(ap[1].toUpperCase())) {
      count++;
      tables.add(ap[2].toUpperCase());
    }
  }
  return { count, tables };
}

/**
 * The original's demo cases, or null when the source has none in the shape
 * this reader knows (see the file comment).
 */
export function readGoldenMaster(source: string): GoldenMaster | null {
  const statements = readStatements(source);
  const lines = source.split(/\r?\n/);
  const constants = constantsOf(statements);
  const forms = formsOf(statements);
  const fixtures = new Map<string, GmFixtureRoutine>();
  for (const f of forms) {
    const fx = fixtureOf(f);
    if (fx) fixtures.set(f.name, fx);
  }
  const tableNames = tableNamesOf(statements);
  const { defaults, rawDefaults, types, selectOptions } = parametersOf(statements, constants);
  const headerLines = new Set(selectOptions);
  const params = new Set(Object.keys(defaults));

  // Candidate baselines: FORMs that build at least two rows from literals.
  const builders = forms
    .filter((f) => !fixtures.has(f.name))
    .map((f) => ({ f, ...rowStatements(f, fixtures, constants) }))
    .filter((b) => b.count >= 2);
  if (builders.length === 0) return null;
  const candidateTables = new Set<string>([...fixtures.values()].map((f) => f.table));
  for (const b of builders) for (const t of b.tables) candidateTables.add(t);

  // The case switch: integer arms, at least two of which change the demo data.
  const touches = (arm: CaseBlock['arms'][number]) =>
    arm.body.some((s) => fixtureCall(s, fixtures, constants) || [...candidateTables].some((t) => new RegExp(`\\b${t}\\b`, 'i').test(s.text)));
  const blocks = caseBlocks(statements).filter((b) => b.arms.filter(touches).length >= 2);
  const block = blocks.sort((a, b) => b.arms.length - a.arms.length)[0];
  if (!block) return null;
  const caseForm = forms.find((f) => f.lineStart <= block.start.lineStart && f.lineEnd >= block.end.lineEnd) ?? null;

  // The baseline: the FORM outside the case switch that builds the most rows.
  const baseBuilder = builders.filter((b) => b.f !== caseForm).sort((a, b) => b.count - a.count)[0];
  if (!baseBuilder) return null;
  const base = baseBuilder.f;
  // The demo data: the tables the baseline fills, and those a case fills through a fixture routine.
  const armTables = block.arms.flatMap((a) => a.body.map((s) => fixtureCall(s, fixtures, constants)?.fixture.table).filter((t): t is string => !!t));
  const fixtureTables = [...new Set([...baseBuilder.tables, ...armTables])];

  // Baseline rows, by running the base routine on empty tables.
  const machineOf = (tables: Map<string, Row[]>, titleVar: string | null): Machine => ({
    tables,
    areas: new Map(),
    params,
    vars: new Map(),
    settings: [],
    ranges: new Set(),
    unread: [],
    subrc: 0,
    titleVar,
    tableNames,
    headerLines,
    title: null,
  });
  const baseMachine = machineOf(new Map(fixtureTables.map((t) => [t, []])), null);
  run(base.body, baseMachine, { fixtures, constants, loop: null });
  const baseRows = new Map<string, Row[]>();
  for (const t of fixtureTables) baseRows.set(t, (baseMachine.tables.get(t) ?? []).map((r, i) => ({ v: r.v, src: i })));

  const operand = block.operand.toUpperCase();
  let switchParameter: string | null = operand in defaults ? operand : null;
  if (!switchParameter) {
    for (const s of statements) {
      const m = /^([\w\-]+)\s*=\s*(\w+)$/.exec(s.text);
      if (m && m[1].toUpperCase() === operand && m[2].toUpperCase() in defaults) switchParameter = m[2].toUpperCase();
    }
  }
  const aliases: Record<string, string> = {};
  for (const s of statements) {
    const m = /^([\w-]+)\s*=\s*(\w+)$/.exec(s.text);
    if (m && m[2].toUpperCase() in defaults && !(m[1].toUpperCase() in defaults)) aliases[m[1].toUpperCase()] = m[2].toUpperCase();
  }
  const demoFlag = demoFlagOf(statements, base.name, defaults);
  const titleVar = titleVariable(block);

  const cases: GoldenMasterCase[] = [];
  for (const arm of block.arms) {
    const machine = machineOf(new Map([...baseRows].map(([t, rows]) => [t, rows.map(copyRow)])), titleVar);
    run(arm.body, machine, { fixtures, constants, loop: null });
    const tables: Record<string, GmRow[]> = {};
    const provenance: Record<string, Array<number | null>> = {};
    const changed: string[] = [];
    for (const t of fixtureTables) {
      const rows = machine.tables.get(t) ?? [];
      tables[t] = rows.map((r) => r.v);
      provenance[t] = rows.map((r) => r.src);
      const before = baseRows.get(t) ?? [];
      if (rows.length !== before.length || rows.some((r, i) => r.src !== i || JSON.stringify(r.v) !== JSON.stringify(before[i].v))) changed.push(t);
    }
    const ranges: Record<string, GmRow[]> = {};
    for (const r of machine.ranges) ranges[r] = (machine.tables.get(r) ?? []).map((x) => x.v);
    const comment = whenComment(lines, arm.when);
    const next = block.arms[block.arms.indexOf(arm) + 1];
    cases.push({
      number: arm.number,
      title: machine.title ?? comment ?? `Case ${arm.number}`,
      titleSource: machine.title !== null ? 'assignment' : comment ? 'comment' : 'none',
      lineStart: arm.when.lineStart,
      lineEnd: next ? next.when.lineStart - 1 : (arm.body[arm.body.length - 1]?.lineEnd ?? arm.when.lineEnd),
      tables,
      provenance,
      changed,
      settings: machine.settings,
      ranges,
      unread: machine.unread,
    });
  }
  const baseline: Record<string, GmRow[]> = {};
  for (const [t, rows] of baseRows) baseline[t] = rows.map((r) => r.v);
  return {
    version: GOLDEN_MASTER_VERSION,
    switchOperand: operand,
    switchParameter,
    demoFlag,
    caseRoutine: caseForm ? { name: caseForm.name, lineStart: caseForm.lineStart, lineEnd: caseForm.lineEnd } : { name: '', lineStart: block.start.lineStart, lineEnd: block.end.lineEnd },
    baseRoutine: { name: base.name, lineStart: base.lineStart, lineEnd: base.lineEnd },
    fixtures: [...fixtures.values()],
    baseline,
    aliases,
    baselineUnread: baseMachine.unread,
    parameterTypes: types,
    parameterDefaults: rawDefaults,
    parameters: defaults,
    selectOptions,
    cases,
  };
}

/** The parameter of the nearest IF that encloses `PERFORM <base>` (`IF p_demo = 'X'.`, or its ELSE branch). */
function demoFlagOf(statements: AbapStatement[], baseName: string, params: Record<string, string>): string | null {
  const at = statements.findIndex((s) => s.keyword === 'PERFORM' && (s.text.split(/\s+/)[1] ?? '').toUpperCase() === baseName);
  if (at < 0) return null;
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const k = statements[i].keyword;
    if (k === 'ENDIF') depth++;
    else if (k === 'IF') {
      if (depth === 0) {
        const name = tokens(statements[i].text).map((x) => x.toUpperCase()).find((x) => x in params);
        return name ?? null;
      }
      depth--;
    } else if (k === 'FORM' || k === 'START-OF-SELECTION' || k === 'ENDFORM') return null;
  }
  return null;
}

/* ---------------------------------------------------------------- the ABAP Unit writer */

/** How the test data reaches the class under test. Built by the scaffold from its own declarations. */
export interface GoldenMasterBinding {
  /** `zcl_<name>_logic`. */
  logicClass: string;
  /** The run entry: `run_steps( EXPORTING is_sel = … CHANGING cs_st = … )`. */
  runMethod: string;
  /** The selection and state types, relative to the logic class: `ty_selection`, `ty_state`. */
  selectionType: string;
  stateType: string;
  /** The local test double of the access layer, when the logic class takes one. */
  accessDouble: string | null;
  /** Selection field of the original (upper case, `P_KNOWN`) → component of the selection type, and whether it is a range. */
  selection: Record<string, { component: string; range: boolean }>;
  /** Fixture table of the original (upper case, `GT_CLAIMS`) → component of the state type. */
  state: Record<string, string>;
  /** The exception the logic raises where the original refuses (`zcx_<name>_refusal`, with `guard` and `text`), or null. */
  refusalClass?: string | null;
  /** Components of the state type an expected value may name (lower case); none known: no value is compared. */
  stateComponents?: readonly string[];
}

/**
 * What the original gave for one demo case — the seam for the owner's characterization samples (roadmap 3.0.19).
 * Never derived by a model or guessed: a case without one is reported as not compared. Nothing passes it yet.
 */
export interface GoldenMasterExpected {
  /** Where it comes from, said in the test: `characterization sample of 20.10.2026`. */
  source: string;
  /** The original refused this case (with its guard id and message text, where known) — or did not. Absent: not compared. */
  refused?: { guard?: string; text?: string } | false;
  /** A scalar component of the run's state after the case, as the original shows it (`gv_total` = `1250.00`). */
  values?: Array<{ component: string; value: string }>;
  /** The number of rows a table component holds after the case (`gt_result`: 3). */
  rows?: Array<{ component: string; count: number }>;
}

/** Maps fixture tables to state components by name: `GT_CLAIMS` → `claims` or `gt_claims` (singular/plural alike). */
export function stateBindingByName(tables: readonly string[], stateComponents: readonly string[]): Record<string, string> {
  const norm = (x: string) => x.toLowerCase().replace(/^[gl][tv]_/, '').replace(/ies$/, 'y').replace(/s$/, '');
  const out: Record<string, string> = {};
  for (const t of tables) {
    const hit = stateComponents.find((c) => c.toLowerCase() === t.toLowerCase()) ?? stateComponents.find((c) => norm(c) === norm(t));
    if (hit) out[t] = hit;
  }
  return out;
}

export const GOLDEN_MASTER_TEST_CLASS = 'ltc_golden_master';

export interface GoldenMasterTestClass {
  className: string;
  /** Source lines of the local test class (definition and implementation). */
  lines: string[];
  /** Test method per case, in case order. `compared`: the case asserts an expected result of the original; else it skips after running. */
  methods: Array<{ name: string; case: number; title: string; bound: boolean; partial: boolean; compared: boolean }>;
  /** Fixture tables with no place in the state type: rows kept in the test, not passed. */
  unboundTables: string[];
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const short = (table: string) => table.toLowerCase().replace(/^[gl]t_/, '').slice(0, 26) || 'rows';
const comment = (text: string, indent: string) => {
  const out: string[] = [];
  const words = text.replace(/[\r\n]+/g, ' ').split(' ');
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).length > 110) {
      out.push(`${indent}" ${line}`);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(`${indent}" ${line}`);
  return out;
};

/** Renders one value of the test data as ABAP: a literal, or an expression on the selection the case runs with. */
type Render = (value: string) => string;

const DATE_TYPES = /^(D|SY-DATUM|SYST-DATUM|SY-DATLO|DATS|DATUM|SYDATUM)$/;
const TODAY = /^SY-(DATUM|DATLO)$/i;

/**
 * The renderer for values on a selection variable (`is_sel`, `ls_sel`): a value
 * relative to a parameter (`p_key + 10`) reads the parameter's field when the
 * selection type has one, else its DEFAULT (today for `sy-datum`), and keeps
 * date arithmetic a date.
 */
function rendererFor(gm: GoldenMaster, binding: GoldenMasterBinding, sel: string): Render {
  return (value) => {
    const e = gmExpression(value);
    if (!e) return lit(value);
    const type = gm.parameterTypes[e.param] ?? '';
    const raw = gm.parameterDefaults[e.param] ?? '';
    const isDate = DATE_TYPES.test(type) || TODAY.test(raw);
    const b = binding.selection[e.param];
    const src =
      b && !b.range
        ? `${sel}-${b.component}`
        : TODAY.test(raw)
          ? 'cl_abap_context_info=>get_system_date( )'
          : gm.parameters[e.param]
            ? isDate
              ? `CONV d( ${lit(gm.parameters[e.param])} )`
              : gm.parameters[e.param]
            : null;
    if (src === null) return lit('');
    const sum = e.n === '0' ? src : `${src} ${e.op} ${e.n}`;
    return isDate ? `CONV string( CONV d( ${sum} ) )` : `CONV string( ${sum} )`;
  };
}

/** The components of one row, `a = 'x' b = 'y'`, wrapped at 120 characters. */
function fieldLines(row: GmRow, columns: readonly string[], indent: string, render: Render): string[] {
  const parts = columns.filter((c) => c in row).map((c) => `${c} = ${render(row[c])}`);
  const out: string[] = [];
  let line = '';
  for (const p of parts) {
    if (line && indent.length + line.length + p.length > 118) {
      out.push(`${indent}${line.trimEnd()}`);
      line = '';
    }
    line += `${p} `;
  }
  out.push(`${indent}${line.trimEnd()}`);
  return out;
}

/** One row of a VALUE table: `( a = 'x' b = 'y' )`. */
function rowLines(row: GmRow, columns: readonly string[], indent: string, render: Render): string[] {
  const f = fieldLines(row, columns, `${indent}  `, render);
  f[0] = `${indent}( ${f[0].trimStart()}`;
  f[f.length - 1] = `${f[f.length - 1]} )`;
  return f;
}

const appendLines = (row: GmRow, columns: readonly string[], target: string, render: Render) => ['    APPEND VALUE #(', ...fieldLines(row, columns, '        ', render), `      ) TO ${target}.`];

/** The ABAP statements that turn the baseline into this case's rows, on `ls_data-<table>`. */
function deltaLines(gm: GoldenMaster, c: GoldenMasterCase, table: string, columns: readonly string[], render: Render): string[] {
  const target = `ls_data-${short(table)}`;
  const base = gm.baseline[table] ?? [];
  const rows = c.tables[table] ?? [];
  const prov = c.provenance[table] ?? [];
  const kept = prov.filter((p): p is number => p !== null);
  const increasing = kept.every((p, i) => i === 0 || p > kept[i - 1]);
  const firstNew = prov.findIndex((p) => p === null);
  const appendedAtEnd = firstNew < 0 || prov.slice(firstNew).every((p) => p === null);
  const out: string[] = [];
  if (kept.length === 0) {
    out.push(`    CLEAR ${target}.`);
    for (const r of rows) out.push(...appendLines(r, columns, target, render));
    return out;
  }
  if (!increasing || !appendedAtEnd) {
    out.push(`    ${target} = VALUE #(`, ...rows.flatMap((r) => rowLines(r, columns, '      ', render)), '    ).');
    return out;
  }
  const keptSet = new Set(kept);
  for (let i = base.length - 1; i >= 0; i--) if (!keptSet.has(i)) out.push(`    DELETE ${target} INDEX ${i + 1}.`);
  rows.forEach((r, j) => {
    const src = prov[j];
    if (src === null) return;
    for (const col of columns) if ((r[col] ?? '') !== (base[src][col] ?? '') && col in r) out.push(`    ${target}[ ${j + 1} ]-${col} = ${render(r[col])}.`);
  });
  for (const r of rows.filter((_, j) => prov[j] === null)) out.push(...appendLines(r, columns, target, render));
  return out;
}

/** The ABAP of one case's expected result: assertions, and what could not be compared. */
function expectedLines(c: GoldenMasterCase, e: GoldenMasterExpected, binding: GoldenMasterBinding): { lines: string[]; compared: number; notCompared: string[] } {
  const lines: string[] = [...comment(`Expected: ${e.source}.`, '    ')];
  const notCompared: string[] = [];
  let compared = 0;
  const known = new Set((binding.stateComponents ?? []).map((x) => x.toLowerCase()));
  const label = (what: string) => lit(`Case ${c.number}: ${what}`.replace(/[\r\n]+/g, ' ').slice(0, 120));
  if (e.refused !== undefined) {
    if (!binding.refusalClass) notCompared.push('a refusal (the logic class has no refusal exception)');
    else {
      lines.push(`    cl_abap_unit_assert=>assert_equals( act = ls_out-refused exp = ${e.refused ? 'abap_true' : 'abap_false'}`, `      msg = ${label(e.refused ? 'the original refuses this case' : 'the original does not refuse this case')} ).`);
      compared++;
      if (e.refused && e.refused.guard) {
        lines.push(`    cl_abap_unit_assert=>assert_equals( act = ls_out-guard exp = ${lit(e.refused.guard)}`, `      msg = ${label(`refused by ${e.refused.guard}`)} ).`);
        compared++;
      }
      if (e.refused && e.refused.text) {
        lines.push(`    cl_abap_unit_assert=>assert_equals( act = ls_out-text exp = ${lit(e.refused.text)}`, `      msg = ${label('the refusal text of the original')} ).`);
        compared++;
      }
    }
  } else if ((e.values?.length ?? 0) + (e.rows?.length ?? 0) > 0 && binding.refusalClass) {
    // A result is expected, so the case must not be refused.
    lines.push('    cl_abap_unit_assert=>assert_equals( act = ls_out-refused exp = abap_false', `      msg = ${label('the original gives a result, not a refusal')} ).`);
  }
  let n = 0;
  for (const v of e.values ?? []) {
    const comp = v.component.toLowerCase();
    if (!/^[a-z_]\w*$/.test(comp) || !known.has(comp)) {
      notCompared.push(`${v.component} (no component of ${binding.stateType})`);
      continue;
    }
    // The expected value in the component's own type: a copy of it, assigned the original's text.
    const exp = `lv_exp_${++n}`;
    lines.push(`    DATA(${exp}) = ls_out-state-${comp}.`, `    ${exp} = ${lit(v.value)}.`, `    cl_abap_unit_assert=>assert_equals( act = ls_out-state-${comp} exp = ${exp}`, `      msg = ${label(`${comp} as the original shows it`)} ).`);
    compared++;
  }
  for (const r of e.rows ?? []) {
    const comp = r.component.toLowerCase();
    if (!/^[a-z_]\w*$/.test(comp) || !known.has(comp) || !Number.isInteger(r.count) || r.count < 0) {
      notCompared.push(`${r.component} rows (no table component of ${binding.stateType})`);
      continue;
    }
    lines.push(`    cl_abap_unit_assert=>assert_equals( act = lines( ls_out-state-${comp} ) exp = ${r.count}`, `      msg = ${label(`rows of ${comp} as the original shows them`)} ).`);
    compared++;
  }
  if (notCompared.length) lines.push(...comment(`Not compared: ${notCompared.join('; ')}.`, '    '));
  return { lines, compared, notCompared };
}

/**
 * The local ABAP Unit test class of the golden master: the baseline as test
 * data, one test method per case that applies the case to the baseline and
 * calls the run entry with it. A case with an expected result of the original
 * on record (`expected`, by case number — the characterization samples of
 * 3.0.19) asserts it; every other case runs the logic and then skips, saying
 * its result is not yet compared — ABAP Unit reports it as skipped, never as
 * passed (3.0.14 item 8). Nothing expected is invented.
 */
export function goldenMasterTestClass(
  gm: GoldenMaster,
  binding: GoldenMasterBinding,
  program: string | null = null,
  expected: Readonly<Record<number, GoldenMasterExpected>> = {},
): GoldenMasterTestClass {
  const tables = Object.keys(gm.baseline);
  const columnsOf = (t: string) => {
    const cols: string[] = [];
    for (const f of gm.fixtures.filter((x) => x.table === t)) for (const p of f.params) if (f.components[p] && !cols.includes(f.components[p])) cols.push(f.components[p]);
    for (const r of gm.baseline[t] ?? []) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    for (const c of gm.cases) for (const r of c.tables[t] ?? []) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
    return cols;
  };
  const columns = new Map(tables.map((t) => [t, columnsOf(t)]));
  const unboundTables = tables.filter((t) => !binding.state[t]);
  const cut = binding.logicClass;
  const selType = `${cut}=>${binding.selectionType}`;
  const onBaseline = rendererFor(gm, binding, 'is_sel');
  const onCase = rendererFor(gm, binding, 'ls_sel');
  const methodName = (n: number) => `case_${String(n).padStart(2, '0')}`.slice(0, 30);
  const checks = new Map(gm.cases.map((c) => [c.number, expected[c.number] ? expectedLines(c, expected[c.number], binding) : null]));
  const methods = gm.cases.map((c) => ({
    name: methodName(c.number),
    case: c.number,
    title: c.title,
    bound: tables.every((t) => (c.tables[t] ?? []).length === 0 || !!binding.state[t]),
    partial: c.unread.length > 0 || gm.baselineUnread.length > 0,
    compared: (checks.get(c.number)?.compared ?? 0) > 0,
  }));

  const def: string[] = [
    ...comment(
      `The demo cases of ${program ?? 'the original'} (${gm.caseRoutine.name || 'CASE'} L${gm.caseRoutine.lineStart}-L${gm.caseRoutine.lineEnd}, baseline ${gm.baseRoutine.name} L${gm.baseRoutine.lineStart}-L${gm.baseRoutine.lineEnd}), carried over by Clean-Core.io as test data - read from the original, not written by a model. Each method runs its case through the logic. Where an expected result of the original is on record it is compared; otherwise the method reports the case as skipped - its result not yet compared, never as passed.`,
      '',
    ).map((l) => l.replace(/^" /, '"! ')),
    `CLASS ${GOLDEN_MASTER_TEST_CLASS} DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.`,
    '  PRIVATE SECTION.',
    '    TYPES:',
  ];
  for (const t of tables) {
    const n = short(t);
    def.push(`      BEGIN OF ty_${n},`, ...columns.get(t)!.map((c) => `        ${c} TYPE string,`), `      END OF ty_${n},`, `      tt_${n} TYPE STANDARD TABLE OF ty_${n} WITH EMPTY KEY,`);
  }
  def.push('      BEGIN OF ty_data,', ...tables.map((t) => `        ${short(t)} TYPE tt_${short(t)},`), '      END OF ty_data,');
  def.push(
    '      BEGIN OF ty_outcome,',
    '        refused TYPE abap_bool,',
    '        guard   TYPE string,',
    '        text    TYPE string,',
    `        state   TYPE ${cut}=>${binding.stateType},`,
    '      END OF ty_outcome.',
  );
  def.push(
    '    "! The original\'s baseline rows, before any case changes them; a value relative to a parameter reads it from is_sel.',
    `    METHODS baseline IMPORTING is_sel TYPE ${selType} RETURNING VALUE(rs_data) TYPE ty_data.`,
    "    \"! The selection the original starts from: its parameters' DEFAULT values.",
    `    METHODS selection RETURNING VALUE(rs_sel) TYPE ${selType}.`,
    '    "! Passes one case to the class under test: fails when it does not run, returns what it gave (refused, and the state).',
    `    METHODS run_case IMPORTING iv_case TYPE i is_data TYPE ty_data is_sel TYPE ${selType} RETURNING VALUE(rs_out) TYPE ty_outcome.`,
    '    "! The message of a case whose result is not compared: that it ran, and how it ended.',
    '    METHODS not_compared IMPORTING iv_case TYPE i is_out TYPE ty_outcome RETURNING VALUE(rv_msg) TYPE string.',
    ...methods.map((m) => `    METHODS ${m.name} FOR TESTING.`),
    'ENDCLASS.',
    '',
  );

  const impl: string[] = [`CLASS ${GOLDEN_MASTER_TEST_CLASS} IMPLEMENTATION.`, ''];
  impl.push('  METHOD baseline.');
  if (gm.baselineUnread.length)
    impl.push(...comment(`Read in part: ${gm.baselineUnread.length} statement(s) of ${gm.baseRoutine.name} are not carried over (${gm.baselineUnread.map((u) => `L${u.line}`).join(', ')}); check them against the original.`, '    '));
  for (const t of tables) {
    const rows = gm.baseline[t] ?? [];
    impl.push(`    " ${t}: ${rows.length} row(s) of ${gm.baseRoutine.name}.`);
    if (rows.length === 0) continue;
    impl.push(`    rs_data-${short(t)} = VALUE #(`, ...rows.flatMap((r) => rowLines(r, columns.get(t)!, '      ', onBaseline)), '    ).');
  }
  impl.push('  ENDMETHOD.', '');
  impl.push('  METHOD selection.');
  const skipped = [gm.switchParameter, gm.demoFlag].filter((x): x is string => !!x);
  for (const [p, v] of Object.entries(gm.parameters)) {
    if (skipped.includes(p)) continue;
    const b = binding.selection[p];
    if (!b || b.range) continue;
    if (v !== '') impl.push(`    rs_sel-${b.component} = ${lit(v)}.`);
    else if (TODAY.test(gm.parameterDefaults[p] ?? '')) impl.push(`    rs_sel-${b.component} = cl_abap_context_info=>get_system_date( ). " DEFAULT ${gm.parameterDefaults[p]}`);
  }
  if (skipped.length) impl.push(...comment(`Not set: ${skipped.join(', ')} - the demo switch and the case number are the original's way to choose this data; the test passes the data itself.`, '    '));
  impl.push('  ENDMETHOD.', '');
  impl.push('  METHOD run_case.');
  impl.push(`    DATA(lo_cut) = NEW ${cut}( ${binding.accessDouble ? `io_access = NEW ${binding.accessDouble}( ) ` : ''}).`);
  impl.push(`    DATA(ls_st) = VALUE ${cut}=>${binding.stateType}( ).`);
  for (const t of tables) {
    if (binding.state[t]) impl.push(`    ls_st-${binding.state[t]} = CORRESPONDING #( is_data-${short(t)} ).`);
    else impl.push(...comment(`Not passed: ${t} (is_data-${short(t)}) - ${binding.stateType} has no component for it yet.`, '    '));
  }
  impl.push(
    '    TRY.',
    `        lo_cut->${binding.runMethod}( EXPORTING is_sel = is_sel CHANGING cs_st = ls_st ).`,
    ...(binding.refusalClass
      ? [
          `      CATCH ${binding.refusalClass} INTO DATA(lx_refusal).`,
          "        \" A refusal is the original's own outcome of a case, not a failure of the run: it is compared, or reported.",
          '        rs_out-refused = abap_true.',
          '        rs_out-guard = lx_refusal->guard.',
          '        rs_out-text = lx_refusal->text.',
        ]
      : []),
    '      CATCH cx_root INTO DATA(lx_error).',
    "        cl_abap_unit_assert=>fail( msg = |Case { iv_case } of the original did not run: { lx_error->get_text( ) }| ).",
    '    ENDTRY.',
    '    rs_out-state = ls_st.',
    '  ENDMETHOD.',
    '',
    '  METHOD not_compared.',
    '    IF is_out-refused = abap_true.',
    "      rv_msg = |Case { iv_case } ran and was refused ({ is_out-guard }: { is_out-text }); not compared - no expected result of the original is on record|.",
    '    ELSE.',
    "      rv_msg = |Case { iv_case } ran; its result is not compared - no expected result of the original is on record|.",
    '    ENDIF.',
    '  ENDMETHOD.',
    '',
  );
  for (const c of gm.cases) {
    const m = methods.find((x) => x.case === c.number)!;
    impl.push(`  METHOD ${m.name}.`);
    impl.push(...comment(`Case ${c.number} of the original, L${c.lineStart}-L${c.lineEnd}: ${c.title}`, '    '));
    if (c.unread.length) impl.push(...comment(`Read in part: ${c.unread.length} statement(s) of this case are not carried over (${c.unread.map((u) => `L${u.line}`).join(', ')}); check them against the original.`, '    '));
    impl.push('    DATA(ls_sel) = selection( ).');
    impl.push('    DATA(ls_data) = baseline( ls_sel ).');
    for (const t of c.changed) impl.push(...deltaLines(gm, c, t, columns.get(t)!, onCase));
    for (const s of c.settings) {
      // A variable filled straight from a parameter (`gs_sel-atomic = p_atom.`) is set through that parameter.
      const b = binding.selection[s.target] ?? binding.selection[gm.aliases[s.target] ?? ''];
      if (b && !b.range) impl.push(`    ls_sel-${b.component} = ${onCase(s.value)}.${binding.selection[s.target] ? '' : ` " ${s.target} = ${gm.aliases[s.target]}`}`);
      else impl.push(...comment(`Not passed: ${s.target} = ${gmExpression(s.value) ? s.value.slice(1) : lit(s.value)} (L${s.line}) - ${binding.selectionType} has no field for it.`, '    '));
    }
    for (const [name, rows] of Object.entries(c.ranges)) {
      const b = binding.selection[name];
      if (b && b.range) impl.push(`    ls_sel-${b.component} = VALUE #(`, ...rows.flatMap((r) => rowLines(r, ['sign', 'option', 'low', 'high'], '      ', onCase)), '    ).');
      else impl.push(...comment(`Not passed: ${name} with ${rows.length} row(s) - ${binding.selectionType} has no range for it.`, '    '));
    }
    impl.push(`    DATA(ls_out) = run_case( iv_case = ${c.number} is_data = ls_data is_sel = ls_sel ).`);
    const check = checks.get(c.number);
    if (check) impl.push(...check.lines);
    // 3.0.14 item 8: ran, but nothing compared — reported as skipped, never as passed.
    if (!check || check.compared === 0) impl.push(`    cl_abap_unit_assert=>skip( msg = not_compared( iv_case = ${c.number} is_out = ls_out ) ).`);
    impl.push('  ENDMETHOD.', '');
  }
  impl.push('ENDCLASS.', '');
  return { className: GOLDEN_MASTER_TEST_CLASS, lines: [...def, ...impl], methods, unboundTables };
}

/** "3 demo cases of the original carried over as ABAP Unit test data (3 of 3 passed to the logic with all their rows) — each runs …" */
export function goldenMasterSentence(cls: Pick<GoldenMasterTestClass, 'methods'>): string {
  const n = cls.methods.length;
  if (n === 0) return 'No demo case of the original was recognised.';
  const bound = cls.methods.filter((m) => m.bound).length;
  const partial = cls.methods.filter((m) => m.partial).length;
  const compared = cls.methods.filter((m) => m.compared).length;
  return (
    `${n} demo ${n === 1 ? 'case' : 'cases'} of the original carried over as ABAP Unit test data` +
    ` (${bound} of ${n} passed to the logic with all their rows${partial ? `; ${partial} read only in part` : ''})` +
    ` — ${goldenMasterComparedWords(n, compared)}.`
  );
}

/** How many demo cases compare a result: the same words in the sentence above and in the testing evidence. */
export function goldenMasterComparedWords(cases: number, compared: number): string {
  if (compared === 0)
    return `${cases === 1 ? 'it runs' : 'each runs'} through the logic, but no result is compared yet (no expected result of the original is on record), so ABAP Unit reports ${cases === 1 ? 'it' : 'them'} as skipped, not passed`;
  if (compared === cases) return "each is compared with the original's result on record";
  return `${compared} compared with the original's result on record; the other ${cases - compared} run through the logic and are reported as skipped, not passed`;
}

/* ---------------------------------------------------------------- the route-neutral interface */

export const ORIGINAL_DEMO_FORMAT = 'clean-core.original-demo/1';

/** A value as the original writes it, or relative to a parameter (`p_key + 10` → `{ param: 'P_KEY', op: '+', n: 10 }`). */
export type OriginalDemoValue = string | { param: string; op: '+' | '-'; n: number };
export type OriginalDemoRow = Record<string, OriginalDemoValue>;

export interface OriginalDemoCase {
  number: number;
  title: string;
  /** `assignment`: a text the case assigns; `comment`: the comment on its WHEN line; `none`: the original gives none (`Case N`). */
  titleSource: 'assignment' | 'comment' | 'none';
  lines: { start: number; end: number };
  /** Every demo table's input rows for this case (complete, not a delta). Table names upper case, as the original names them. */
  rows: Record<string, OriginalDemoRow[]>;
  changedTables: string[];
  /** Parameters and other variables the case assigns, in order (`P_KNOWN`, `GS_SEL-ATOMIC`, `GV_SEALED`). */
  settings: Array<{ target: string; value: OriginalDemoValue; line: number; parameter: string | null }>;
  /** Select-options the case fills: name → rows of `sign`, `option`, `low`, `high`. */
  ranges: Record<string, Array<Record<string, string>>>;
  /** Statements of the case the reader did not execute; empty when it was read whole. */
  unread: Array<{ line: number; text: string }>;
}

export interface OriginalDemoCases {
  format: typeof ORIGINAL_DEMO_FORMAT;
  /** The CASE operand, and the selection parameter it comes from. */
  switch: { operand: string; parameter: string | null; routine: string; lines: { start: number; end: number } };
  /** The parameter that decides whether the demo data is built (`P_DEMO`), or null. */
  demoFlag: string | null;
  /** Parameter → DEFAULT value (literal, or '' when none or not a literal), as written, and its declared type. */
  parameters: Record<string, { default: string; written: string; type: string }>;
  /** Variables filled straight from a parameter: variable → parameter. */
  aliases: Record<string, string>;
  baseline: { routine: string; lines: { start: number; end: number }; rows: Record<string, OriginalDemoRow[]>; unread: Array<{ line: number; text: string }> };
  cases: OriginalDemoCase[];
}

const plainValue = (v: string): OriginalDemoValue => {
  const e = gmExpression(v);
  return e ? { param: e.param, op: e.op, n: Number(e.n) } : v;
};
const plainRow = (r: GmRow): OriginalDemoRow => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plainValue(v)]));
const plainRows = (t: Record<string, GmRow[]>) => Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, rows.map(plainRow)]));

/** The original's demo cases, route-neutral and JSON-ready — see STABLE INTERFACE at the top of this file. */
export function originalDemoCases(source: string): OriginalDemoCases | null {
  const gm = readGoldenMaster(source);
  if (!gm || gm.cases.length === 0) return null;
  return {
    format: ORIGINAL_DEMO_FORMAT,
    switch: { operand: gm.switchOperand, parameter: gm.switchParameter, routine: gm.caseRoutine.name, lines: { start: gm.caseRoutine.lineStart, end: gm.caseRoutine.lineEnd } },
    demoFlag: gm.demoFlag,
    parameters: Object.fromEntries(Object.keys(gm.parameters).map((p) => [p, { default: gm.parameters[p], written: gm.parameterDefaults[p] ?? '', type: gm.parameterTypes[p] ?? '' }])),
    aliases: { ...gm.aliases },
    baseline: { routine: gm.baseRoutine.name, lines: { start: gm.baseRoutine.lineStart, end: gm.baseRoutine.lineEnd }, rows: plainRows(gm.baseline), unread: gm.baselineUnread },
    cases: gm.cases.map((c) => ({
      number: c.number,
      title: c.title,
      titleSource: c.titleSource,
      lines: { start: c.lineStart, end: c.lineEnd },
      rows: plainRows(c.tables),
      changedTables: [...c.changed],
      settings: c.settings.map((s) => ({ target: s.target, value: plainValue(s.value), line: s.line, parameter: s.target in gm.parameters ? s.target : gm.aliases[s.target] ?? null })),
      ranges: c.ranges,
      unread: c.unread,
    })),
  };
}

/** What the scaffold knows about the class under test, in its own terms. */
export interface ScaffoldGoldenMasterInput {
  logicClass: string;
  runMethod?: string;
  selectionType?: string;
  stateType?: string;
  accessDouble: string | null;
  /** Selection fields: the original's name (upper case), the component in the selection type, and whether it is a range. */
  selection: ReadonlyArray<{ original: string; component: string; range: boolean }>;
  /** Components of the state type (`records`, `claims`, …). */
  stateComponents: readonly string[];
  /** Explicit fixture table → state component, where the scaffold's contract names it; otherwise matched by name. */
  state?: Record<string, string>;
  program?: string | null;
  /** The logic's refusal exception (`zcx_<name>_refusal`): a refused case is the original's outcome, reported or compared. */
  refusalClass?: string | null;
  /** Expected results of the original by case number — the seam for the characterization samples (3.0.19). */
  expected?: Readonly<Record<number, GoldenMasterExpected>>;
}

/**
 * The golden master as the RAP scaffold appends it to the logic class's test
 * include: the class, or null when the original has no demo cases.
 */
export function goldenMasterForScaffold(source: string, input: ScaffoldGoldenMasterInput): { master: GoldenMaster; testClass: GoldenMasterTestClass } | null {
  const master = readGoldenMaster(source);
  if (!master || master.cases.length === 0) return null;
  const tables = Object.keys(master.baseline);
  const binding: GoldenMasterBinding = {
    logicClass: input.logicClass,
    runMethod: input.runMethod ?? 'run_steps',
    selectionType: input.selectionType ?? 'ty_selection',
    stateType: input.stateType ?? 'ty_state',
    accessDouble: input.accessDouble,
    selection: Object.fromEntries(input.selection.map((s) => [s.original.toUpperCase(), { component: s.component, range: s.range }])),
    state: { ...stateBindingByName(tables, input.stateComponents), ...(input.state ?? {}) },
    refusalClass: input.refusalClass ?? null,
    stateComponents: input.stateComponents,
  };
  return { master, testClass: goldenMasterTestClass(master, binding, input.program ?? null, input.expected ?? {}) };
}
