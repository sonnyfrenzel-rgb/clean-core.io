/**
 * Invariant tests for a shared selection — written by the product, not by a model.
 *
 * External review of the FI case, F-02: `WorklistItems` read the
 * customer filter `kunnr`, `CustomerAgingTotals` and `ExportWorklistFile` did
 * not. For customer 0000100001 the list showed 9 items worth 4,780 EUR, the
 * totals endpoint 7,135 EUR and the CSV 15 rows. The original builds the list,
 * the totals and the file from one internal table filled by one selection, so
 * the three cannot disagree there. None of the ten generated tests compared
 * them.
 *
 * This module reads the generated code — no model — for a list, a totals and
 * an export endpoint (by route name), and the request parameters each reads.
 * When the pattern is there it adds one test to the suite, TC_INV_01, that:
 *
 *   1. calls the list without a selection and picks, from its rows, a value of
 *      a field that a selection parameter names (`kunnr` → the rows' `kunnr`)
 *      which narrows the population;
 *   2. calibrates, on the unfiltered call, which number of the totals answer
 *      is the list's row count and which is the sum of which list field, and
 *      which column of the export sums to it — so it needs no knowledge of
 *      the field names beyond what the answers themselves show;
 *   3. sends the same selection to all three and asserts the same population
 *      (count) and the same sums everywhere.
 *
 * When the pattern is not there, the Testing view lists the invariant as "not
 * applicable", with the reason. Nothing here guesses.
 *
 * The test runs the route handlers in-process through the request harness of
 * the sandbox's `express` fake (`lib/test-sandbox/express-fake.ts`). A runner
 * built before that fake has no harness; the test then says so and is
 * reported as skipped — never as passed.
 *
 * Pure: the plan and the suite text are deterministic functions of the code.
 */

import { sandboxFilesFromStoredCode, type SandboxFile } from './test-sandbox/files';
import { codeMask, codeMatches, lineAt, matchClose } from './ts-source-scan';

/* ------------------------------------------------------------------ types */

export type EndpointRole = 'list' | 'totals' | 'export';

export interface DetectedEndpoint {
  role: EndpointRole | null;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  path: string;
  file: string;
  line: number;
  /** Request parameters the handler reads, and where it reads them. */
  params: Array<{ name: string; from: 'query' | 'body' }>;
}

export interface InvariantEndpoint {
  role: EndpointRole;
  method: DetectedEndpoint['method'];
  path: string;
  file: string;
  line: number;
  /** Parameter names the handler reads. */
  reads: string[];
  /** Where the selection goes on this endpoint: query for GET, else body unless the handler reads the query. */
  send: 'query' | 'body';
}

export type InvariantPlan =
  | {
      applicable: true;
      /** The import path of the module that builds the app, relative to the suite: `./srv/service`. */
      module: string;
      /** How the app is obtained: a factory call or an exported value. */
      app: { kind: 'call' | 'value'; name: string };
      endpoints: InvariantEndpoint[];
      /** Parameters any of the three reads — the selection they are meant to share. */
      selection: string[];
      /** Static reading: parameters the list reads that another endpoint does not. */
      gaps: Array<{ role: EndpointRole; path: string; missing: string[] }>;
      sentence: string;
    }
  | { applicable: false; reason: string; endpoints: DetectedEndpoint[] };

export const INVARIANT_CASE_ID = 'TC_INV_01';

/* -------------------------------------------------------------- detection */

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/i;
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\.[cm]?[jt]sx?$|playwright\.config/i;
/** Paging, ordering and format knobs — not part of what is selected. */
const TECHNICAL_PARAM = /^(\$.*|top|skip|limit|offset|page|pagesize|pageSize|sort|order|orderby|orderBy|format|select|expand|count)$/;

function roleOf(path: string): EndpointRole | null {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const word = last.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (/export|csv|download|file|extract/.test(word)) return 'export';
  if (/total|summary|summar|aggregate|sum|kpi|overview/.test(word)) return 'totals';
  if (/item|items|list|worklist|entries|entry|lines|documents|records|positions/.test(word)) return 'list';
  return null;
}

/** The request variable of a handler: the first parameter of its function. */
function requestName(handler: string): string {
  const m = handler.match(/^\s*(?:async\s+)?(?:function\s*\w*\s*)?\(\s*([A-Za-z_$][\w$]*)/) ?? handler.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);
  return m ? m[1] : 'req';
}

/** Names read off one object: `obj.a`, `obj['a']`, `const { a, b = 1 } = obj`. */
function namesReadOff(text: string, objectExpr: string): string[] {
  const out: string[] = [];
  const mask = codeMask(text);
  const o = objectExpr.replace(/[$.]/g, (c) => `\\${c}`);
  for (const m of codeMatches(text, mask, new RegExp(`\\b${o}\\.([A-Za-z_$][\\w$]*)`, 'g'))) out.push(m[1]);
  for (const m of codeMatches(text, mask, new RegExp(`\\b${o}\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g'))) out.push(m[1]);
  for (const m of codeMatches(text, mask, new RegExp(`\\{([^{}]*)\\}\\s*(?::\\s*[^=]+)?=\\s*${o}\\b(?!\\.)`, 'g'))) {
    for (const part of m[1].split(',')) {
      const name = part.split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
    }
  }
  return out;
}

/**
 * The body and first parameter of a function this file declares — so a
 * handler that hands `req.query` to one shared selection function
 * (`selectionFrom(req.query)`) is read through it. That is the pattern the
 * prompt asks for, and it must not make the invariant "not applicable".
 */
function functionBody(fileSrc: string, name: string): { param: string; body: string } | null {
  const n = name.replace(/\$/g, '\\$');
  const decl =
    fileSrc.match(new RegExp(`\\bfunction\\s+${n}\\s*\\(\\s*([A-Za-z_$][\\w$]*)`)) ??
    fileSrc.match(new RegExp(`\\bconst\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?\\(\\s*([A-Za-z_$][\\w$]*)`));
  if (!decl || decl.index === undefined) return null;
  const mask = codeMask(fileSrc);
  const open = fileSrc.indexOf('{', decl.index + decl[0].length);
  if (open === -1) return null;
  const close = matchClose(fileSrc, mask, open);
  if (close === -1) return null;
  return { param: decl[1], body: fileSrc.slice(open, close + 1) };
}

function paramsRead(handler: string, reqName: string, fileSrc: string): Array<{ name: string; from: 'query' | 'body' }> {
  const out: Array<{ name: string; from: 'query' | 'body' }> = [];
  const add = (name: string, from: 'query' | 'body') => {
    if (!name || TECHNICAL_PARAM.test(name)) return;
    if (!out.some((p) => p.name === name && p.from === from)) out.push({ name, from });
  };
  for (const from of ['query', 'body'] as const) {
    for (const name of namesReadOff(handler, `${reqName}.${from}`)) add(name, from);
  }
  // `selectionFrom(req.query)`, `selectionFrom(req.query as …)` — read through the helper.
  const mask = codeMask(handler);
  const r = reqName.replace(/\$/g, '\\$');
  for (const m of codeMatches(handler, mask, new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*\\(\\s*${r}\\.(query|body)\\b(?!\\s*\\.)`, 'g'))) {
    const fn = functionBody(fileSrc, m[1]);
    if (!fn) continue;
    for (const name of namesReadOff(fn.body, fn.param)) add(name, m[2] as 'query' | 'body');
  }
  return out;
}

/** Every Express-style route of the generated code, with the parameters its handler reads. */
export function detectEndpoints(files: readonly SandboxFile[]): DetectedEndpoint[] {
  const out: DetectedEndpoint[] = [];
  for (const file of files) {
    if (!CODE_FILE.test(file.path) || TEST_FILE.test(file.path)) continue;
    const src = file.content;
    const mask = codeMask(src);
    for (const m of codeMatches(src, mask, /\b[A-Za-z_$][\w$]*\.(get|post|put|patch)\s*\(\s*(['"`])([^'"`\n]+)\2\s*,/g)) {
      const open = src.indexOf('(', m.index);
      const close = matchClose(src, mask, open);
      if (close === -1) continue;
      const afterPath = m.index + m[0].length;
      // The last argument is the handler (middlewares may come before it).
      const args = src.slice(afterPath, close);
      const handlerStart = lastTopLevelArg(args);
      const handler = args.slice(handlerStart);
      const path = m[3].trim();
      if (!path.startsWith('/')) continue;
      out.push({
        role: roleOf(path),
        method: m[1].toUpperCase() as DetectedEndpoint['method'],
        path,
        file: file.path,
        line: lineAt(src, m.index),
        params: paramsRead(handler, requestName(handler), src),
      });
    }
  }
  return out;
}

function lastTopLevelArg(args: string): number {
  const mask = codeMask(args);
  let depth = 0;
  let last = 0;
  for (let i = 0; i < args.length; i++) {
    if (!mask[i]) continue;
    const c = args[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) last = i + 1;
  }
  return last;
}

/** The exported factory (or value) that builds the Express app, and the module it is in. */
function findApp(files: readonly SandboxFile[]): { module: string; app: { kind: 'call' | 'value'; name: string } } | null {
  for (const file of files) {
    if (!CODE_FILE.test(file.path) || TEST_FILE.test(file.path)) continue;
    const src = file.content;
    if (!/\bexpress\s*\(\s*\)/.test(src)) continue;
    const modulePath = `./${file.path.replace(/\.(ts|tsx|js|mjs|cjs)$/i, '')}`;
    const mask = codeMask(src);
    for (const m of codeMatches(src, mask, /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(\s*\)/g)) {
      const open = src.indexOf('{', m.index + m[0].length);
      const close = open === -1 ? -1 : matchClose(src, mask, open);
      if (close !== -1 && /\bexpress\s*\(\s*\)/.test(src.slice(open, close))) return { module: modulePath, app: { kind: 'call', name: m[1] } };
    }
    for (const m of codeMatches(src, mask, /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
      const rest = src.slice(m.index, m.index + 4000);
      if (/\bexpress\s*\(\s*\)/.test(rest.slice(0, rest.indexOf('\n}') === -1 ? rest.length : rest.indexOf('\n}')))) return { module: modulePath, app: { kind: 'call', name: m[1] } };
    }
    const value = src.match(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*express\s*\(\s*\)/);
    if (value) return { module: modulePath, app: { kind: 'value', name: value[1] } };
    const named = src.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*express\s*\(\s*\)[\s\S]*\bexport\s*\{[^}]*\b\1\b/);
    if (named) return { module: modulePath, app: { kind: 'value', name: named[1] } };
    const dflt = src.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*express\s*\(\s*\)[\s\S]*\bexport\s+default\s+\1\b/);
    if (dflt) return { module: modulePath, app: { kind: 'value', name: 'default' } };
  }
  return null;
}

/**
 * The invariant plan for a stored `generatedCode` (or its files). Applicable
 * when a list endpoint and at least one of totals/export exist, the app can be
 * obtained from an export, and the list reads at least one selection parameter.
 */
export function invariantPlan(code: string | readonly SandboxFile[] | null | undefined): InvariantPlan {
  const files = typeof code === 'string' ? sandboxFilesFromStoredCode(code) : code ? [...code] : [];
  const detected = detectEndpoints(files);
  const pick = (role: EndpointRole) => detected.find((e) => e.role === role) ?? null;
  const list = pick('list');
  const totals = pick('totals');
  const exp = pick('export');
  if (files.length === 0) return { applicable: false, reason: 'There is no generated code to read.', endpoints: detected };
  if (detected.length === 0) {
    return { applicable: false, reason: 'The generated code registers no HTTP route the product can read (Express-style app.get/post), so no list, totals or export endpoint was found.', endpoints: detected };
  }
  if (!list || (!totals && !exp)) {
    const found = (['list', 'totals', 'export'] as const).filter((r) => pick(r)).join(', ') || 'none of them';
    return {
      applicable: false,
      reason: `The invariant needs a list endpoint and a totals or an export endpoint that share a selection; the generated routes give ${found}.`,
      endpoints: detected,
    };
  }
  const listReads = list.params.map((p) => p.name);
  if (listReads.length === 0) {
    return { applicable: false, reason: `The list endpoint ${list.path} reads no selection parameter, so there is no selection to share.`, endpoints: detected };
  }
  const located = findApp(files);
  if (!located) {
    return {
      applicable: false,
      reason: 'The module that builds the Express app does not export it (no exported factory or app value), so a test cannot reach the routes.',
      endpoints: detected,
    };
  }
  const chosen = [list, totals, exp].filter((e): e is DetectedEndpoint => !!e);
  const endpoints: InvariantEndpoint[] = chosen.map((e) => ({
    role: e.role as EndpointRole,
    method: e.method,
    path: e.path,
    file: e.file,
    line: e.line,
    reads: [...new Set(e.params.map((p) => p.name))],
    send: e.method === 'GET' ? 'query' : e.params.some((p) => p.from === 'query') && !e.params.some((p) => p.from === 'body') ? 'query' : 'body',
  }));
  const selection = [...new Set(endpoints.flatMap((e) => e.reads))];
  const gaps = endpoints
    .filter((e) => e.role !== 'list')
    .map((e) => ({ role: e.role, path: e.path, missing: listReads.filter((p) => !e.reads.includes(p)) }))
    .filter((g) => g.missing.length > 0);
  const names = endpoints.map((e) => `${e.role} ${e.method} ${e.path}`).join(', ');
  const gapWords = gaps.map((g) => `the ${g.role} endpoint does not read ${g.missing.join(', ')}`).join('; ');
  return {
    applicable: true,
    module: located.module,
    app: located.app,
    endpoints,
    selection,
    gaps,
    sentence:
      `${INVARIANT_CASE_ID} compares ${names} for one selection (${selection.join(', ')}): same population, same sums.` +
      (gaps.length > 0 ? ` Read from the code: ${gapWords}, which the list reads.` : ''),
  };
}

/* ---------------------------------------------------------- suite + case */

/**
 * The runtime of the invariant, as the sandbox runs it. Plain JavaScript (it
 * goes into a `.ts` suite and esbuild accepts it unchanged); it only uses the
 * harness and the answers of the routes.
 */
export const INVARIANT_RUNTIME_JS = String.raw`
async function __ccSharedSelectionInvariant(h, app, spec) {
  const notes = [];
  const problems = [];
  const round = (x) => Math.round(x * 100) / 100;
  const same = (a, b) => Math.abs(a - b) < 0.005;
  const call = (ep, sel) => h.invoke(app, ep.method, ep.path, ep.send === 'query' ? { query: sel } : { body: sel });
  const rowsOf = (json) => {
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      for (const k of ['value', 'items', 'data', 'results', 'rows', 'records']) if (Array.isArray(json[k])) return json[k];
      if (json.d && Array.isArray(json.d.results)) return json.d.results;
    }
    return null;
  };
  const measures = (json) => {
    const out = {};
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      for (const [k, v] of Object.entries(json)) if (typeof v === 'number') out[k] = v;
    }
    const rows = rowsOf(json);
    if (rows && rows.length > 0) {
      const keys = new Set();
      for (const r of rows) if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) if (typeof v === 'number') keys.add(k);
      for (const k of keys) out['rows[].' + k] = round(rows.reduce((s, r) => s + (r && typeof r[k] === 'number' ? r[k] : 0), 0));
      out['rows.length'] = rows.length;
    }
    return out;
  };
  // RFC 4180 records: a line break inside a quoted field is part of the field,
  // not the end of a record ("" is a quote, CRLF or LF ends a record). Split on
  // physical lines first and one quoted note with a line break becomes a
  // phantom row (QA review of 35b97d90c6e1).
  const csvOf = (text) => {
    const s = String(text);
    let headEnd = s.length;
    for (let i = 0, q = false; i < s.length; i++) {
      if (s[i] === '"') q = !q;
      else if (!q && s[i] === '\n') { headEnd = i; break; }
    }
    const head = s.slice(0, headEnd);
    // Counted outside quotes: a quoted header "Customer, account" holds no separator.
    const outside = (d) => {
      let n = 0;
      for (let i = 0, q = false; i < head.length; i++) {
        if (head[i] === '"') q = !q;
        else if (!q && head[i] === d) n++;
      }
      return n;
    };
    const delim = [';', '\t', ','].map((d) => [d, outside(d)]).sort((a, b) => b[1] - a[1])[0][0];
    const records = [];
    let cells = [];
    let cur = '';
    let quoted = false;
    const endRecord = () => {
      cells.push(cur);
      if (cells.length > 1 || cells[0].trim() !== '') records.push(cells);
      cells = [];
      cur = '';
    };
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) { cells.push(cur); cur = ''; }
      else if (c === '\r' && s[i + 1] === '\n') { endRecord(); i++; }
      else if (c === '\n') endRecord();
      else cur += c;
    }
    if (cur !== '' || cells.length > 0) endRecord();
    if (records.length === 0) return { header: [], rows: [] };
    return { header: records[0], rows: records.slice(1) };
  };
  const exportRows = (res) => {
    const rows = rowsOf(res.json);
    if (rows) return { kind: 'json', rows };
    if (typeof res.text === 'string' && res.text.length > 0) return { kind: 'csv', ...csvOf(res.text) };
    return null;
  };
  const num = (cell) => {
    const t = String(cell == null ? '' : cell).trim().replace(/^'/, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  };

  const list = spec.endpoints.find((e) => e.role === 'list');
  const totals = spec.endpoints.find((e) => e.role === 'totals');
  const exp = spec.endpoints.find((e) => e.role === 'export');

  const base = await call(list, {});
  const baseRows = rowsOf(base.json);
  if (base.status >= 400 || !baseRows) return { skip: 'the list endpoint ' + list.path + ' answered ' + base.status + ' without rows, so there is nothing to select from' };
  if (baseRows.length < 2) return { skip: 'the list endpoint returned fewer than two rows without a selection, so no selection can narrow it' };

  let chosen = null;
  for (const p of spec.selection) {
    const keys = Object.keys(baseRows[0] || {});
    const field = keys.find((k) => k === p) || keys.find((k) => k.toLowerCase() === String(p).toLowerCase());
    if (!field) continue;
    const counts = new Map();
    for (const r of baseRows) {
      const v = r[field];
      if (v === null || v === undefined || typeof v === 'object') continue;
      counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    }
    const best = [...counts.entries()].filter((e) => e[1] < baseRows.length).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (best) { chosen = { param: p, field, value: best[0], expected: best[1] }; break; }
  }
  if (!chosen) return { skip: 'no selection parameter (' + spec.selection.join(', ') + ') names a field of the list rows, so no selection value can be chosen' };

  const numFields = Object.keys(baseRows[0]).filter((k) => baseRows.every((r) => typeof r[k] === 'number'));
  const sumOf = (rows, f) => round(rows.reduce((s, r) => s + r[f], 0));
  const sel = { [chosen.param]: chosen.value };
  const where = chosen.param + ' = ' + chosen.value;

  const listRes = await call(list, sel);
  const listRows = rowsOf(listRes.json) || [];
  if (listRows.length !== chosen.expected || !listRows.every((r) => String(r[chosen.field]) === chosen.value)) {
    problems.push('With ' + where + ' the list ' + list.path + ' holds ' + listRows.length + ' rows; ' + chosen.expected + ' rows of the unselected list carry that value.');
  }
  const listSums = {};
  for (const f of numFields) listSums[f] = sumOf(listRows, f);
  let compared = 0;

  if (totals) {
    const baseTotals = measures((await call(totals, {})).json);
    const pairs = [];
    for (const [k, v] of Object.entries(baseTotals)) if (v !== 0 && same(v, baseRows.length)) pairs.push({ key: k, of: 'count' });
    for (const f of numFields) {
      const s = sumOf(baseRows, f);
      if (s === 0) continue;
      for (const [k, v] of Object.entries(baseTotals)) if (same(v, s) && !pairs.some((p) => p.key === k)) pairs.push({ key: k, of: f });
    }
    if (pairs.length === 0) notes.push('totals: no number of the totals answer equals the list count or a list sum without a selection; not compared');
    else {
      const t = measures((await call(totals, sel)).json);
      for (const p of pairs) {
        const want = p.of === 'count' ? listRows.length : listSums[p.of];
        compared++;
        if (typeof t[p.key] !== 'number' || !same(t[p.key], want)) {
          problems.push('With ' + where + ' the list ' + list.path + ' holds ' + (p.of === 'count' ? listRows.length + ' rows' : 'a sum of ' + p.of + ' of ' + want) + ', but the totals endpoint ' + totals.path + ' reports ' + p.key + ' = ' + t[p.key] + '.');
        }
      }
    }
  }

  if (exp) {
    const baseExp = exportRows(await call(exp, {}));
    const selExp = exportRows(await call(exp, sel));
    if (!baseExp || !selExp) notes.push('export: the answer is neither rows nor a delimited file; not compared');
    else {
      compared++;
      if (baseExp.rows.length !== baseRows.length) {
        problems.push('Without a selection the export ' + exp.path + ' holds ' + baseExp.rows.length + ' data rows, the list ' + baseRows.length + '.');
      }
      if (selExp.rows.length !== listRows.length) {
        problems.push('With ' + where + ' the export ' + exp.path + ' holds ' + selExp.rows.length + ' data rows, the list ' + listRows.length + '.');
      }
      if (baseExp.kind === 'csv' && selExp.kind === 'csv') {
        for (const f of numFields) {
          const s = sumOf(baseRows, f);
          if (s === 0) continue;
          const col = baseExp.header.findIndex((_, i) => same(round(baseExp.rows.reduce((acc, r) => acc + (num(r[i]) || 0), 0)), s));
          if (col === -1) continue;
          const got = round(selExp.rows.reduce((acc, r) => acc + (num(r[col]) || 0), 0));
          compared++;
          if (!same(got, listSums[f])) problems.push('With ' + where + ' the export column ' + baseExp.header[col] + ' sums to ' + got + ', the list\'s ' + f + ' to ' + listSums[f] + '.');
          break;
        }
      }
    }
  }
  if (compared === 0 && problems.length === 0) return { skip: 'nothing could be compared: ' + notes.join('; ') };
  return { problems, notes, selection: where, listRows: listRows.length };
}
`;

/**
 * The words of the case, from the roles the plan actually holds: a plan of a
 * list and an export compares no totals, and its case must not say it does.
 */
function invariantWords(plan: Extract<InvariantPlan, { applicable: true }>) {
  const has = (role: EndpointRole) => plan.endpoints.some((e) => e.role === role);
  const totals = has('totals');
  const exp = has('export');
  const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const pick = (all: Array<string | false>) => all.filter((x): x is string => typeof x === 'string');
  return {
    roles: and(pick(['list', totals && 'totals', exp && 'export'])),
    calibrate: `Find ${and(pick([totals && 'which number of the totals answer is the row count and which is a sum', exp && 'which export column sums to a list field']))}.`,
    expected: `The same number of rows and the same sums in ${and(pick(['the list', totals && 'the totals', exp && 'the export']))}.`,
    builds: and(pick(['the list', totals && 'the totals', exp && 'the file'])),
  };
}

/** The block appended to a generated suite, or null when the plan is not applicable. */
export function invariantSuiteBlock(plan: InvariantPlan): string | null {
  if (!plan.applicable) return null;
  const spec = {
    endpoints: plan.endpoints.map((e) => ({ role: e.role, method: e.method, path: e.path, send: e.send })),
    selection: plan.selection,
  };
  const appExpr =
    plan.app.kind === 'call'
      ? `(mod.${plan.app.name} ?? mod.default?.${plan.app.name})()`
      : plan.app.name === 'default'
        ? 'mod.default'
        : `(mod.${plan.app.name} ?? mod.default?.${plan.app.name})`;
  const words = invariantWords(plan);
  return `

// ── ${INVARIANT_CASE_ID} — written by Clean-Core.io, not by the model ─────────────
// One selection, one population: ${words.builds} answer for
// the same selection with the same rows and the same sums (external review F-02).
// Deterministic; the plan was read from the generated routes.
import { test as __ccInvariantTest } from 'node:test';
import { strict as __ccInvariantAssert } from 'node:assert';

__ccInvariantTest('${INVARIANT_CASE_ID}: one selection gives the same population and the same sums in ${words.roles}', async (t: any) => {
  const h = (globalThis as any).__ccRequestHarness;
  if (!h) {
    t.skip('this runner has no request harness for Express routes yet, so the invariant was not run');
    return;
  }
  const mod: any = await import('${plan.module}');
  const app = ${appExpr};
  const result: any = await __ccSharedSelectionInvariant(h, app, ${JSON.stringify(spec)});
  if (result.skip) {
    t.skip(result.skip);
    return;
  }
  __ccInvariantAssert.deepEqual(result.problems, [], result.problems.join('\\n'));
});
${INVARIANT_RUNTIME_JS}`;
}

/** The case that stands for the invariant in the case list. */
export function invariantTestCase(plan: Extract<InvariantPlan, { applicable: true }>): Record<string, unknown> {
  const words = invariantWords(plan);
  return {
    id: INVARIANT_CASE_ID,
    name: `One selection gives the same population and the same sums in ${words.roles}`,
    category: 'Invariant',
    priority: 'High',
    description:
      `Written by Clean-Core.io from the generated routes, not by the testing model. The original fills one internal table from one selection and builds ${words.builds} from it; the target must answer one selection with one population.`,
    steps: [
      'Call the list without a selection and pick a value of a selection field that narrows it.',
      words.calibrate,
      `Send the same selection to ${plan.endpoints.map((e) => e.path).join(', ')}.`,
      'Compare the row counts and sums.',
    ],
    expectedResult: words.expected,
    invariant: true,
  };
}

/**
 * A generated suite with the invariant added: the suite text and the case list.
 * Idempotent — a suite that already carries the block gets it replaced.
 */
export function withInvariants(
  suiteCode: string,
  cases: ReadonlyArray<Record<string, unknown>>,
  generatedCode: string | null | undefined,
): { suiteCode: string; cases: Array<Record<string, unknown>>; plan: InvariantPlan } {
  const plan = invariantPlan(generatedCode);
  const marker = `\n\n// ── ${INVARIANT_CASE_ID} — written by Clean-Core.io`;
  const at = suiteCode.indexOf(marker);
  const base = at === -1 ? suiteCode : suiteCode.slice(0, at);
  const kept = cases.filter((c) => String(c.id ?? '') !== INVARIANT_CASE_ID);
  const block = invariantSuiteBlock(plan);
  if (!block || !plan.applicable) return { suiteCode: base, cases: kept, plan };
  return { suiteCode: base + block, cases: [...kept, invariantTestCase(plan)], plan };
}

/** The sentence the Testing view shows for the invariant. */
export function invariantSentence(plan: InvariantPlan): string {
  return plan.applicable ? plan.sentence : `Shared-selection invariant: not applicable — ${plan.reason}`;
}
