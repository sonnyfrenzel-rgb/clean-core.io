/**
 * Deterministic checks over a generated package's code (roadmap 3.0.12, part B).
 *
 * Three external reviews of packages built by 3.0.10 (CO, PP and SD, 12.10.2026) found
 * the same classes of error in what the model wrote, whatever the prompt said:
 * `parseInt` accepting "2026x", a module-level "latest result" every request
 * overwrote, run ids from `Date.now()` that two runs in the same millisecond
 * shared, binary floating point on packed quantities (a status changed at
 * 0.3 kg), CSV without the original's escaping or formula guard, a server that
 * started when a test imported the module, an in-memory class named after an
 * S/4HANA API answering "Successfully updated … via OData PATCH", dependencies
 * nothing imports, and a display filter parsed and never applied.
 *
 * Each check below reads the files — never the original program, never a
 * model — and says what it found and where. A finding is a reason to look, not
 * a proof: the checks are lexical (`lib/ts-source-scan.ts`), so they read
 * strings and comments as what they are, but they do not follow data through
 * calls. What they get wrong they get wrong the same way every time.
 *
 * Pure, no network, no model.
 */

import { sandboxFilesFromStoredCode, type SandboxFile } from './test-sandbox/files';
import { codeMask, codeMatches, lineAt, matchClose } from './ts-source-scan';

export type LintSeverity = 'P0' | 'P1' | 'P2';

export type LintId =
  | 'lenient-number-parsing'
  | 'global-mutable-result'
  | 'weak-run-id'
  | 'run-overwrite'
  | 'float-decimal-arithmetic'
  | 'csv-unescaped'
  | 'start-on-import'
  | 'claimed-integration'
  | 'sap-event-namespace'
  | 'unused-dependency'
  | 'ignored-option'
  | 'abap-doc-missing';

export interface GeneratedCodeLintFinding {
  id: LintId;
  severity: LintSeverity;
  file: string;
  line: number;
  message: string;
  /** Where the check comes from in the roadmap. */
  source: string;
}

export interface GeneratedCodeLintOptions {
  /**
   * Names the original declares as packed decimals (`TYPE p`, or a DDIC
   * quantity/amount field) — see `packedDecimalFields`. Without them the
   * decimal check falls back to names (quantity, amount, menge, netwr, price …).
   */
  decimalFields?: readonly string[];
}

export const LINT_SEVERITIES: readonly LintSeverity[] = ['P0', 'P1', 'P2'];

const SOURCES: Readonly<Record<LintId, string>> = Object.freeze({
  'lenient-number-parsing': 'Roadmap 3.0.12 — CO review F05/F08: every input channel validates the same contract',
  'global-mutable-result': 'Roadmap 3.0.12 — CO review F09: no global "latest result"',
  'weak-run-id': 'Roadmap 3.0.12 — PP review: collision-free run ids',
  'run-overwrite': 'Roadmap 3.0.12 — PP review: a run is never overwritten',
  'float-decimal-arithmetic': 'Roadmap 3.0.12 — CO review F06/F07, PP review: exact decimal arithmetic for packed values',
  'csv-unescaped': "Roadmap 3.0.12 — PP review: the original's CSV escaping and formula guard",
  'start-on-import': 'Roadmap 3.0.12 — CO review F12, PP review: importing the module never starts a server',
  'claimed-integration': 'Roadmap 3.0.12 — SD review: generated code never claims an integration it lacks',
  'sap-event-namespace': "Roadmap 3.0.12 — SD review: no event publisher in SAP's namespace",
  'unused-dependency': 'Roadmap 3.0.12 — SD review: dependencies follow the import graph',
  'ignored-option': 'Roadmap 3.0.12 — PP review F07, FI review: an option is honoured or refused, never ignored',
  'abap-doc-missing': "Roadmap 3.0.12 — DSAG ABAP guide (documentation/dev_object_related_doc.md): ABAP Doc on public methods, why and not what, with the original's line",
});

const SEVERITY: Readonly<Record<LintId, LintSeverity>> = Object.freeze({
  'lenient-number-parsing': 'P0',
  'global-mutable-result': 'P0',
  'weak-run-id': 'P0',
  'run-overwrite': 'P0',
  'float-decimal-arithmetic': 'P1',
  'csv-unescaped': 'P1',
  'start-on-import': 'P1',
  'claimed-integration': 'P0',
  'sap-event-namespace': 'P1',
  'unused-dependency': 'P2',
  'ignored-option': 'P1',
  'abap-doc-missing': 'P2',
});

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/i;
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\.[cm]?[jt]sx?$|playwright\.config/i;
const ABAP_FILE = /\.abap$/i;

/* ------------------------------------------------------------ the reading */

interface Block {
  open: number;
  close: number;
  kind: 'fn' | 'control' | 'other';
  /** For `if (…) {`: the condition text. */
  cond: string;
}

interface Source {
  path: string;
  src: string;
  mask: Uint8Array;
  blocks: Block[];
  /** `(`…`)` ranges of `app.get(…)`, `router.post(…)` and the like. */
  handlers: Array<[number, number]>;
}

const CONTROL_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

function prevCode(src: string, mask: Uint8Array, i: number): number {
  let p = i - 1;
  while (p >= 0 && (!mask[p] || /\s/.test(src[p]))) p--;
  return p;
}

function nextCode(src: string, mask: Uint8Array, i: number): number {
  let p = i;
  while (p < src.length && mask[p] && /\s/.test(src[p])) p++;
  return p;
}

/** The `(` that `close` closes, counting only code; -1 when none. */
function matchOpenBack(src: string, mask: Uint8Array, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (!mask[i]) continue;
    if (src[i] === ')') depth++;
    else if (src[i] === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function wordBefore(src: string, mask: Uint8Array, i: number): string {
  const p = prevCode(src, mask, i);
  if (p < 0) return '';
  let s = p;
  while (s >= 0 && /[\w$]/.test(src[s])) s--;
  return src.slice(s + 1, p + 1);
}

function readBlocks(src: string, mask: Uint8Array): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < src.length; i++) {
    if (!mask[i] || src[i] !== '{') continue;
    // `${` of a template substitution is not a block.
    if (i > 0 && src[i - 1] === '$' && mask[i - 1]) continue;
    const close = matchClose(src, mask, i);
    if (close < 0) continue;
    const p = prevCode(src, mask, i);
    let kind: Block['kind'] = 'other';
    let cond = '';
    if (p >= 1 && src[p] === '>' && src[p - 1] === '=') kind = 'fn';
    else if (p >= 0 && src[p] === ')') {
      const o = matchOpenBack(src, mask, p);
      const w = o >= 0 ? wordBefore(src, mask, o) : '';
      if (CONTROL_WORDS.has(w)) {
        kind = 'control';
        if (w === 'if') cond = src.slice(o + 1, p);
      } else kind = 'fn';
    } else {
      const w = wordBefore(src, mask, i);
      if (['else', 'try', 'finally', 'do'].includes(w)) kind = 'control';
    }
    out.push({ open: i, close, kind, cond });
  }
  return out;
}

function readHandlers(src: string, mask: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of codeMatches(src, mask, /\b([\w$]+)\s*\.\s*(get|post|put|patch|delete|all|use|route)\s*\(/g)) {
    if (!/app|router|server|api|routes?$/i.test(m[1])) continue;
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, mask, open);
    if (close > open) out.push([open, close]);
  }
  return out;
}

function readSource(path: string, src: string): Source {
  const mask = codeMask(src);
  return { path, src, mask, blocks: readBlocks(src, mask), handlers: readHandlers(src, mask) };
}

function enclosing(s: Source, at: number): Block[] {
  return s.blocks.filter((b) => b.open < at && at < b.close);
}

function innermostFn(s: Source, at: number): Block | null {
  let best: Block | null = null;
  for (const b of s.blocks) if (b.kind === 'fn' && b.open < at && at < b.close && (!best || b.open > best.open)) best = b;
  return best;
}

function handlerAt(s: Source, at: number): number {
  let best = -1;
  s.handlers.forEach(([o, c], i) => {
    if (o < at && at < c && (best < 0 || o > s.handlers[best][0])) best = i;
  });
  return best;
}

/** String literals (and template text pieces): the text between the quotes. */
function stringLiterals(s: Source): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  const { src, mask } = s;
  for (let i = 0; i < src.length; i++) {
    if (mask[i] || !`'"\``.includes(src[i])) continue;
    if (i > 0 && !mask[i - 1]) continue;
    let e = i + 1;
    while (e < src.length && !mask[e]) e++;
    let text = src.slice(i + 1, e);
    if (text.endsWith(src[i])) text = text.slice(0, -1);
    out.push({ at: i, text });
    i = e - 1;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Code occurrences of an identifier that are not a property name (`x.name`). */
function identifierUses(s: Source, name: string): number[] {
  return codeMatches(s.src, s.mask, new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`, 'g'))
    .filter((m) => {
      const p = prevCode(s.src, s.mask, m.index);
      return !(p >= 0 && s.src[p] === '.' && !(p >= 2 && s.src.slice(p - 2, p + 1) === '...'));
    })
    .map((m) => m.index);
}

const lineOf = (s: Source, at: number) => lineAt(s.src, at);

function finding(id: LintId, file: string, line: number, message: string): GeneratedCodeLintFinding {
  return { id, severity: SEVERITY[id], file, line, message, source: SOURCES[id] };
}

/* ------------------------------------------------------ 1. number parsing */

const REQUEST_INPUT = /\breq(?:uest)?\s*\??\.\s*(?:query|body|params|headers)\b/;

/** Names a file assigns from request input: `const x = req.query.x`, `const { a } = req.body`. */
function requestNames(s: Source): Set<string> {
  const out = new Set<string>();
  for (const m of codeMatches(s.src, s.mask, /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=;\n]+)?=\s*([^;\n]*)/g)) {
    if (REQUEST_INPUT.test(m[2])) out.add(m[1]);
  }
  for (const m of codeMatches(s.src, s.mask, /\b(?:const|let|var)\s*\{([^}]*)\}\s*(?::[^=;\n]+)?=\s*([^;\n]*)/g)) {
    if (!REQUEST_INPUT.test(m[2])) continue;
    for (const part of m[1].split(',')) {
      const name = part.split(/[:=]/).pop()?.trim().replace(/^\.\.\./, '');
      if (name && /^[\w$]+$/.test(name)) out.add(name);
    }
  }
  // One hop: a function called with the request's query or body reads it through its first parameter.
  for (const m of codeMatches(s.src, s.mask, /\b([\w$]+)\s*\(\s*req(?:uest)?\s*\??\.\s*(?:query|body|params)\s*[,)]/g)) {
    const fn = escapeRe(m[1]);
    const decl =
      s.src.match(new RegExp(`\\bfunction\\s+${fn}\\s*(?:<[^>]*>)?\\(\\s*([\\w$]+)`)) ??
      s.src.match(new RegExp(`\\b${fn}\\s*=\\s*(?:async\\s*)?\\(\\s*([\\w$]+)`)) ??
      s.src.match(new RegExp(`(?:^|\\s)${fn}\\s*\\(\\s*([\\w$]+)\\s*:`, 'm'));
    if (decl) out.add(decl[1]);
  }
  return out;
}

function targetName(src: string, at: number): string | null {
  const lineStart = src.lastIndexOf('\n', at - 1) + 1;
  const before = src.slice(lineStart, at);
  const m =
    before.match(/(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*[^=]*$/) ??
    before.match(/([\w$]+)\s*:\s*[^:]*$/) ??
    before.match(/([\w$]+)\s*=\s*[^=]*$/);
  return m ? m[1] : null;
}

function lenientNumberParsing(s: Source): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const tainted = requestNames(s);
  const fromRequest = (text: string) =>
    REQUEST_INPUT.test(text) || [...tainted].some((n) => new RegExp(`(?<![\\w$.])${escapeRe(n)}(?![\\w$])`).test(text));
  const guarded = (names: string[]) =>
    names.some((n) =>
      new RegExp(`\\b(?:isFinite|isInteger|isSafeInteger|test)\\s*\\([^)]*(?<![\\w$])${escapeRe(n)}(?![\\w$])`).test(s.src),
    );
  const seen = new Set<number>();
  const report = (at: number, how: string, arg: string) => {
    const line = lineOf(s, at);
    if (seen.has(line)) return;
    const target = targetName(s.src, at);
    const last = arg.match(/([\w$]+)\s*\)?\s*(?:\?\?|\|\||,|$)/)?.[1];
    const names = [target, last].filter((x): x is string => !!x && !['String', 'req', 'body', 'query'].includes(x));
    if (guarded(names)) return;
    seen.add(line);
    out.push(
      finding(
        'lenient-number-parsing',
        s.path,
        line,
        `${how} reads request input${target ? ` into "${target}"` : ''} without a finiteness or format check: "2026x" parses as 2026, and NaN passes every range comparison. Validate the format (or Number.isFinite) before the value is used, and refuse what does not match.`,
      ),
    );
  };
  for (const m of codeMatches(s.src, s.mask, /\b(?:Number\s*\.\s*)?(parseInt|parseFloat|Number)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(s.src, s.mask, open);
    if (close < 0) continue;
    const arg = s.src.slice(open + 1, close);
    if (!fromRequest(arg)) continue;
    report(m.index, `${m[1]}()`, arg);
  }
  for (const m of codeMatches(s.src, s.mask, /(?:[=(,:?]|\breturn)\s*\+\s*(?!\+)([\w$][\w$.?]*)/g)) {
    if (!fromRequest(m[1])) continue;
    report(m.index, 'Unary +', m[1]);
  }
  return out;
}

/* ------------------------------------------ 2. global mutable "latest result" */

interface ModuleState {
  name: string;
  at: number;
  kind: 'let' | 'map' | 'collection';
}

function moduleState(s: Source): ModuleState[] {
  const out: ModuleState[] = [];
  for (const m of codeMatches(s.src, s.mask, /^[ \t]*(?:export\s+)?(let|var|const)\s+([\w$]+)\s*(?::\s*([^=;\n]+))?(?:=\s*([^;\n]*))?/gm)) {
    const at = m.index + m[0].indexOf(m[2]);
    if (enclosing(s, at).length > 0) continue;
    const init = (m[4] ?? '').trim();
    const type = m[3] ?? '';
    if (m[1] !== 'const') out.push({ name: m[2], at, kind: /new\s+(?:Map|WeakMap)\b/.test(init) ? 'map' : 'let' });
    else if (/^new\s+(?:Map|WeakMap)\b/.test(init)) out.push({ name: m[2], at, kind: 'map' });
    else if (/^new\s+(?:Set|Array)\b|^\[\s*\]/.test(init) || (/\[\]\s*$/.test(type) && /^\[/.test(init))) out.push({ name: m[2], at, kind: 'collection' });
  }
  return out;
}

function mutationAt(s: Source, at: number, name: string, kind: ModuleState['kind']): boolean {
  const rest = s.src.slice(at + name.length, at + name.length + 80);
  if (kind === 'let' && /^\s*(?:=(?!=)|\+=|-=|\?\?=|\|\|=)/.test(rest)) return true;
  if (/^\s*\??\.\s*(?:set|push|unshift|splice|add|delete|clear|pop|shift)\s*\(/.test(rest)) return true;
  if (/^\s*(?:\[[^\]\n]*\]|\.[\w$]+)\s*=(?!=)/.test(rest)) return true;
  return false;
}

function globalMutableResult(s: Source, states: ModuleState[]): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  if (s.handlers.length < 2) return out;
  for (const st of states) {
    const uses = identifierUses(s, st.name).filter((u) => u !== st.at);
    const writers = new Set<number>();
    const readers = new Set<number>();
    for (const u of uses) {
      const h = handlerAt(s, u);
      if (h < 0) continue;
      (mutationAt(s, u, st.name, st.kind) ? writers : readers).add(h);
    }
    const shared = [...writers].some((w) => [...readers].some((r) => r !== w));
    if (!shared) continue;
    out.push(
      finding(
        'global-mutable-result',
        s.path,
        lineOf(s, st.at),
        `"${st.name}" is module-level mutable state: one request handler writes it and another reads it, so every request sees what the last one left. Bind each result and export to an immutable run id with its selection and rule revision.`,
      ),
    );
  }
  return out;
}

/* ---------------------------------------------------------------- 3. run ids */

function weakRunIds(s: Source, states: ModuleState[]): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const seen = new Set<number>();
  for (const m of codeMatches(s.src, s.mask, /\bDate\s*\.\s*now\s*\(\s*\)|\bnew\s+Date\s*\(\s*\)\s*\.\s*getTime\s*\(\s*\)|\bMath\s*\.\s*random\s*\(\s*\)/g)) {
    const line = lineOf(s, m.index);
    if (seen.has(line)) continue;
    const lineStart = s.src.lastIndexOf('\n', m.index - 1) + 1;
    const lineEnd = s.src.indexOf('\n', m.index);
    const text = s.src.slice(lineStart, lineEnd < 0 ? s.src.length : lineEnd);
    const target = targetName(s.src, m.index);
    if (!target || !/(?:^id$|Id$|_id$|ID$|^runId|run_?id|key$|Key$)/i.test(target)) continue;
    if (/randomUUID|uuid|nanoid|ulid|counter|seq(?:uence)?\b|\+\+/i.test(text)) continue;
    seen.add(line);
    out.push(
      finding(
        'weak-run-id',
        s.path,
        line,
        `"${target}" is built from ${m[0].replace(/\s+/g, '')} alone: two runs in the same millisecond get the same id, and a random number can repeat. Use crypto.randomUUID() (or a counter the store guards).`,
      ),
    );
  }
  for (const st of states.filter((x) => x.kind === 'map')) {
    for (const m of codeMatches(s.src, s.mask, new RegExp(`(?<![\\w$.])${escapeRe(st.name)}\\s*\\.\\s*set\\s*\\(`, 'g'))) {
      const fn = innermostFn(s, m.index);
      const from = fn ? fn.open : 0;
      if (new RegExp(`(?<![\\w$.])${escapeRe(st.name)}\\s*\\.\\s*has\\s*\\(`).test(s.src.slice(from, m.index))) continue;
      out.push(
        finding(
          'run-overwrite',
          s.path,
          lineOf(s, m.index),
          `${st.name}.set(…) stores a run without checking whether its id is taken: a second run with the same id silently replaces the first. Check ${st.name}.has(id) and refuse, or use ids that cannot collide.`,
        ),
      );
    }
  }
  return out;
}

/* ------------------------------------------- 4. floating point on decimals */

const DECIMAL_NAME = /(quantity|qty|amount|amt|menge|netwr|netpr|price|wrbtr|dmbtr|kwmeng|zmeng|bdmng|enmng|kbetr|kwert)/i;

const normName = (n: string) => n.toLowerCase().replace(/^(?:[lgmp][vsa]|iv|ev|cv|rv)_/, '').replace(/[_-]/g, '');

function decimalTest(fields: readonly string[] | undefined): (name: string) => boolean {
  const declared = new Set((fields ?? []).map(normName).filter(Boolean));
  return (name) => (declared.size > 0 && declared.has(normName(name))) || DECIMAL_NAME.test(name);
}

const DECIMAL_LIB = /\b(?:Decimal|Big|BigNumber|Dinero)\b|\.(?:times|plus|minus|div|mul|dividedBy|multipliedBy)\s*\(/;

function floatDecimalArithmetic(s: Source, isDecimal: (name: string) => boolean): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const { src, mask } = s;
  const lines = new Map<number, string>();
  const lineText = (at: number) => {
    const a = src.lastIndexOf('\n', at - 1) + 1;
    const e = src.indexOf('\n', at);
    return src.slice(a, e < 0 ? src.length : e);
  };
  const isOperandEnd = (i: number) => i >= 0 && (/[\w$)\]]/.test(src[i]) || !mask[i]);
  const isQuote = (i: number) => i >= 0 && i < src.length && (!mask[i] || src[i] === '`');
  for (const m of codeMatches(src, mask, /[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*/g)) {
    const segs = m[0].split(/\s*\??\.\s*/);
    const last = segs[segs.length - 1];
    const start = m.index;
    const end = m.index + m[0].length;
    let hit: string | null = null;
    if (last === 'toFixed' && segs.length >= 2 && isDecimal(segs[segs.length - 2]) && /^\s*\(/.test(src.slice(end))) {
      hit = `${segs[segs.length - 2]}.toFixed()`;
    } else if (isDecimal(last) && segs.length >= 1 && !/^(?:const|let|var|function|interface|type)$/.test(segs[0])) {
      const a = nextCode(src, mask, end);
      const op = src[a];
      if (a < src.length && mask[a] && '+-*/'.includes(op) && src[a + 1] !== op && src[a + 1] !== '>') {
        const other = nextCode(src, mask, a + (src[a + 1] === '=' ? 2 : 1));
        if (!(op === '+' && isQuote(other))) hit = `${last} ${op}${src[a + 1] === '=' ? '=' : ''}`;
      }
      if (!hit) {
        const p = prevCode(src, mask, start);
        const q = src[p];
        if (p >= 0 && '+-*/'.includes(q) && src[p - 1] !== q) {
          const before = prevCode(src, mask, p);
          if (isOperandEnd(before) && !(q === '+' && !mask[before])) hit = `${q} ${last}`;
        }
      }
    }
    if (!hit) continue;
    const line = lineOf(s, start);
    if (lines.has(line) || DECIMAL_LIB.test(lineText(start))) continue;
    lines.set(line, hit);
  }
  for (const [line, hit] of lines) {
    out.push(
      finding(
        'float-decimal-arithmetic',
        s.path,
        line,
        `Binary floating point on a decimal quantity or amount (${hit}): 0.1 + 0.2 is not 0.3, and a status or a rounding can flip at a boundary. Compute packed values with their declared places — integer minor units or a decimal type — and round as the original does.`,
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------- 5. CSV */

const QUOTE_DOUBLING = /replace(?:All)?\s*\(\s*(?:\/"\/g?|'"'|"\\""|`"`)\s*,\s*(?:'""'|"\\"\\""|`""`)/;
const FORMULA_GUARD = /\[(?=[^\]\n]*=)(?=[^\]\n]*\+)(?=[^\]\n]*@)[^\]\n]*\]|startsWith\s*\(\s*['"`]=['"`]/;

function csvUnescaped(s: Source): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  if (!/csv/i.test(s.src)) return out;
  const escapes = QUOTE_DOUBLING.test(s.src) || /function\s+\w*(?:escape\w*csv|csv\w*escape|csvCell|csvField|quoteCsv)\w*/i.test(s.src);
  const guards = FORMULA_GUARD.test(s.src);
  if (escapes && guards) return out;
  const missing = [escapes ? null : 'quotes inside a value are not doubled', guards ? null : 'values starting with =, +, - or @ are not neutralised'].filter(Boolean).join(', and ');
  const inCsvFunction = (at: number) => {
    const fn = innermostFn(s, at);
    const from = fn ? Math.max(0, fn.open - 200) : 0;
    const to = fn ? fn.close : s.src.length;
    return /csv/i.test(s.src.slice(from, to));
  };
  const lines = new Set<number>();
  for (const m of codeMatches(s.src, s.mask, /\.\s*join\s*\(\s*(['"`])(,|;|\\t|\|)\1\s*\)/g)) {
    if (inCsvFunction(m.index)) lines.add(lineOf(s, m.index));
  }
  for (const m of s.src.matchAll(/"?\$\{[^}\n]*\}"?\s*[,;]\s*"?\$\{/g)) {
    const at = (m.index ?? 0) + m[0].indexOf('${');
    if (s.mask[at] && inCsvFunction(at)) lines.add(lineOf(s, at));
  }
  for (const line of [...lines].sort((a, b) => a - b)) {
    out.push(
      finding(
        'csv-unescaped',
        s.path,
        line,
        `A CSV row is joined from raw values: ${missing}. A value with the separator, a quote or a line break breaks the row, and a leading = runs as a formula in a spreadsheet. Quote every field, double its quotes and neutralise formula prefixes as the original does.`,
      ),
    );
  }
  return out;
}

/* ----------------------------------------------------- 6. start on import */

const START_GUARD = /require\s*\.\s*main\s*===?\s*module|import\.meta\.(?:main|url)|process\.argv\s*\[\s*1\s*\]/;

function startOnImport(s: Source): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const exportsSomething = codeMatches(s.src, s.mask, /(?:^|[\s;])export\s|\bmodule\s*\.\s*exports\b|\bexports\s*\.\s*[\w$]+\s*=/g).length > 0;
  if (!exportsSomething) return out;
  for (const m of codeMatches(s.src, s.mask, /\.\s*listen\s*\(/g)) {
    const around = enclosing(s, m.index);
    if (around.some((b) => b.kind === 'fn')) continue;
    if (around.some((b) => b.kind === 'control' && START_GUARD.test(b.cond))) continue;
    // An `if (…) app.listen()` without braces guards the statement on its line.
    const lineStart = s.src.lastIndexOf('\n', m.index - 1) + 1;
    const inline = s.src.slice(lineStart, m.index).match(/^\s*if\s*\((.*)\)/)?.[1] ?? null;
    if (inline !== null && START_GUARD.test(inline)) continue;
    const envCond = around.find((b) => b.kind === 'control' && /process\.env/.test(b.cond))?.cond ?? (inline && /process\.env/.test(inline) ? inline : null);
    const env = envCond ? { cond: envCond } : null;
    out.push(
      finding(
        'start-on-import',
        s.path,
        lineOf(s, m.index),
        `The module that exports the service also starts a server when it is imported${env ? ` (guarded only by "${env.cond.trim()}", which every import outside that setting passes)` : ''}. Start it from a separate entry file, or only when require.main === module.`,
      ),
    );
  }
  return out;
}

/* ------------------------------------------------ 7. claimed integration */

const HTTP_CLIENT = /\bfetch\s*\(|\baxios\b|\bexecuteHttpRequest\s*\(|@sap-cloud-sdk\/|\bcds\s*\.\s*connect\b|\bhttps?\s*\.\s*(?:request|get)\s*\(|\bgot\s*\(|\bundici\b|\bnew\s+XMLHttpRequest\b|\bsuperagent\b/;
/** Class and function names that name an SAP system or API. OData alone is a protocol the service may expose, not a claim. */
const SAP_NAME = /S4\s?(?:HANA|Hana|hana)|S4H(?![a-z])|BAPI|Bapi[A-Z]|(?:Sap|SAP)(?:Api|API|Client|Gateway|Connector|Adapter|Service|OData)|API_[A-Z]/;
const SAP_CLAIM_STRING =
  /\bvia\s+(?:the\s+)?(?:standard\s+)?(?:OData|BAPI|RFC|SAP|S\/?4)|\bOData\s+(?:PATCH|PUT|POST|MERGE|DELETE|call|request|API)\b|\b(?:posted|updated|written|sent|saved|created|booked)\s+(?:in|to|into)\s+(?:SAP|S\/?4)/i;
const SAP_API_STRING = /\bAPI_[A-Z0-9_]+\b|\bBAPI_[A-Z0-9_]+/;
const SUCCESS_STRING = /\bsuccessfully\s+(?:updated|posted|created|saved|written|synchroni[sz]ed|sent)\b/i;

function claimedIntegration(s: Source): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const code = s.src.split('').map((c, i) => (s.mask[i] ? c : ' ')).join('');
  if (HTTP_CLIENT.test(code) || /@sap-cloud-sdk\/|['"]axios['"]|['"]undici['"]/.test(s.src)) return out;
  const names = codeMatches(s.src, s.mask, /\b(class|function)\s+([\w$]+)/g).filter((m) => SAP_NAME.test(m[2]));
  const strings = stringLiterals(s).filter((x) => SAP_CLAIM_STRING.test(x.text) || SAP_API_STRING.test(x.text) || (SUCCESS_STRING.test(x.text) && (names.length > 0 || SAP_NAME.test(x.text))));
  for (const m of names) {
    out.push(
      finding(
        'claimed-integration',
        s.path,
        lineOf(s, m.index),
        `${m[1]} "${m[2]}" names an SAP interface, but this file makes no HTTP call (no fetch, axios, SAP Cloud SDK or cds.connect): it does not talk to SAP. Name it for what it is (in-memory, mock) or implement the call.`,
      ),
    );
  }
  for (const x of strings) {
    out.push(
      finding(
        'claimed-integration',
        s.path,
        lineOf(s, x.at),
        `The message "${x.text.trim().slice(0, 100)}" claims an SAP update or API call, but this file makes no HTTP call: nothing was sent to SAP. Say what happened (stored in memory) or implement the call.`,
      ),
    );
  }
  for (const x of stringLiterals(s)) {
    if (!/^sap\.s4(?:\.beh)?\.[\w.]+$/i.test(x.text.trim())) continue;
    const before = s.src.slice(Math.max(0, x.at - 80), x.at);
    if (!/\b(?:emit|publish|send|dispatch|fire|raise)\w*\s*\(\s*$|\b(?:type|event_?type|eventType|topic)\s*[:=]\s*$/i.test(before)) continue;
    out.push(sapEventFinding(s.path, lineOf(s, x.at), x.text.trim()));
  }
  return out;
}

function sapEventFinding(file: string, line: number, name: string): GeneratedCodeLintFinding {
  return finding(
    'sap-event-namespace',
    file,
    line,
    `Custom code publishes the event "${name}" in SAP's namespace (sap.s4.*). Only SAP publishes there; consume SAP's released event where one exists, and give a custom event a namespace of its own.`,
  );
}

function abapSapEvents(path: string, src: string): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  src.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*\*/.test(l)) return;
    const code = l.replace(/"[^']*$/, '');
    for (const m of code.matchAll(/(?:\w*(?:event|type|topic)\w*)\s*=\s*['`](sap\.s4(?:\.beh)?\.[\w.]+)['`]/gi)) {
      out.push(sapEventFinding(path, i + 1, m[1]));
    }
  });
  return out;
}

/* ------------------------------------------------------ 7b. ABAP Doc */

/** A global class's main file or a global interface — where public methods live. */
const ABAP_GLOBAL_FILE = /\.(?:clas|intf)\.abap$/i;
/** ABAP Doc that anchors at the original — `L120`, `L12–L40` — or says there is nothing to anchor at. */
const ABAP_DOC_ANCHOR = /\bL\d+\b|no counterpart in the original/i;

/**
 * Every public method of a global class or interface carries ABAP Doc (`"!`)
 * directly above it that says why it exists and anchors at the original's
 * line, or says it has no counterpart there (DSAG ABAP guide; the RAP
 * scaffold writes it so, 3.0.12). Whether the doc says *why* rather than
 * *what*, and whether it is English, is a reader's judgement — the lint checks
 * that it is there and anchored. Test methods and redefinitions are exempt;
 * a redefinition inherits its doc.
 */
function abapDocMissing(path: string, src: string): GeneratedCodeLintFinding[] {
  if (!ABAP_GLOBAL_FILE.test(path)) return [];
  const out: GeneratedCodeLintFinding[] = [];
  const lines = src.split(/\r?\n/);
  let inPublic = false;
  let doc: string[] = [];
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (/^"!/.test(l)) {
      doc.push(l);
      return;
    }
    const docAbove = doc;
    doc = [];
    if (l === '' || /^\*/.test(raw) || /^"/.test(l)) return;
    if (/^CLASS\s+\S+\s+DEFINITION\b/i.test(l)) {
      inPublic = false;
      return;
    }
    if (/^INTERFACE\s+\S+(?:\s+PUBLIC)?\s*\.$/i.test(l)) {
      inPublic = /\bPUBLIC\b/i.test(l);
      return;
    }
    if (/^PUBLIC\s+SECTION\s*\./i.test(l)) {
      inPublic = true;
      return;
    }
    if (/^(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS|ENDINTERFACE)\b/i.test(l)) {
      inPublic = false;
      return;
    }
    if (!inPublic) return;
    const m = l.match(/^(?:CLASS-)?METHODS\s*:?\s*([\w~]+)/i);
    if (!m || /\bFOR\s+TESTING\b|\bREDEFINITION\b/i.test(l)) return;
    const name = m[1];
    if (docAbove.length === 0) {
      out.push(finding('abap-doc-missing', path, i + 1, `The public method ${name} has no ABAP Doc ("!) above it. Say why it exists, in English, and name the original's line (L<n>) — or that it has no counterpart in the original.`));
    } else if (!ABAP_DOC_ANCHOR.test(docAbove.join(' '))) {
      out.push(finding('abap-doc-missing', path, i + 1, `The ABAP Doc of the public method ${name} names no line of the original (L<n>) and does not say it has no counterpart there.`));
    }
  });
  return out;
}

/* --------------------------------------------------------- 8. dependencies */

/** Tools a package declares to build, type-check or run itself — used by the scripts, not imported. */
const TOOLING = /^(?:typescript|tsx|ts-node|nodemon|@types\/.+|eslint.*|@typescript-eslint\/.+|prettier|@playwright\/test|jest|ts-jest|vitest|mocha|c8|nyc|rimraf|cross-env|concurrently|npm-run-all|@sap\/cds-dk)$/;

/**
 * What a CAP package uses through its configuration, not an import (3.0.15 item 5e): `cds` loads the `@cap-js/*`
 * plugins (`@cap-js/hana`, `@cap-js/sqlite`, `@cap-js/postgres` …) itself, and the XSUAA authentication its
 * `cds.requires` names through `@sap/xssec`. Only in a package that depends on `@sap/cds` and configures it
 * (a `cds` section in package.json, or a `.cdsrc.json`).
 */
const CAP_CONFIGURED = /^(?:@cap-js\/[\w.-]+|@sap\/xssec)$/;
/**
 * The packages of that list that are used only when the configuration names what they serve — the database kind of
 * `@cap-js/hana` and `@cap-js/postgres`, the authentication kinds that run on `@sap/xssec` — so a configuration that
 * names neither does not excuse them (QA 3adfcf87ca21). `@cap-js/sqlite` is the development database `cds` takes by
 * default, and the other `@cap-js/*` packages are plugins `cds` loads by being declared: both stay excused.
 */
const CAP_CONFIGURED_BY: Readonly<Record<string, { service: 'db' | 'auth'; kinds: readonly string[] }>> = {
  '@cap-js/hana': { service: 'db', kinds: ['hana'] },
  '@cap-js/postgres': { service: 'db', kinds: ['postgres'] },
  '@sap/xssec': { service: 'auth', kinds: ['xsuaa', 'ias', 'jwt'] },
};

/**
 * The kinds a CAP configuration names for `requires.db` and `requires.auth`: as a string (`db: "hana"`) or a
 * `kind`, in any profile (`[production]`) around or inside them. Read from the parsed configuration, never from
 * any string value anywhere in it (QA 51233ed8f1e9).
 */
function capRequiredKinds(configs: readonly unknown[]): { db: Set<string>; auth: Set<string> } {
  const out = { db: new Set<string>(), auth: new Set<string>() };
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isProfile = (key: string) => /^\[[^\]]+\]$/.test(key);
  const service = (v: unknown, into: Set<string>) => {
    if (typeof v === 'string') { into.add(v); return; }
    if (!isObject(v)) return;
    if (typeof v.kind === 'string') into.add(v.kind);
    for (const [k, inner] of Object.entries(v)) if (isProfile(k)) service(inner, into);
  };
  const requires = (v: unknown) => {
    if (!isObject(v)) return;
    service(v.db, out.db);
    service(v.auth, out.auth);
    for (const [k, inner] of Object.entries(v)) if (isProfile(k)) requires(inner);
  };
  const config = (v: unknown) => {
    if (!isObject(v)) return;
    requires(v.requires);
    for (const [k, inner] of Object.entries(v)) if (isProfile(k)) config(inner);
  };
  for (const c of configs) config(c);
  return out;
}

function unusedDependencies(files: readonly SandboxFile[]): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const pkgFile = files.find((f) => f.path === 'package.json');
  if (!pkgFile) return out;
  let pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; scripts?: Record<string, unknown>; cds?: unknown };
  try {
    pkg = JSON.parse(pkgFile.content);
  } catch {
    return out;
  }
  if (!pkg || typeof pkg !== 'object') return out;
  const scripts = Object.values(pkg.scripts ?? {}).filter((v): v is string => typeof v === 'string').join(' ');
  const used = new Set<string>();
  const strings = new Set<string>();
  for (const f of files) {
    if (!CODE_FILE.test(f.path)) continue;
    const s = readSource(f.path, f.content);
    // An import, a require, or a triple-slash types reference (`/// <reference types="@cap-js/cds-types" />`).
    for (const m of f.content.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|^\/\/\/\s*<reference\s+types\s*=\s*)(['"`])([^'"`\n]+)\1/gm)) {
      const spec = m[2];
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      const parts = spec.split('/');
      used.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
    }
    for (const x of stringLiterals(s)) strings.add(x.text.trim());
  }
  const lines = pkgFile.content.split(/\r?\n/);
  const capConfigured =
    ('@sap/cds' in (pkg.dependencies ?? {}) || '@sap/cds' in (pkg.devDependencies ?? {})) &&
    ((typeof pkg.cds === 'object' && pkg.cds !== null) || files.some((f) => f.path === '.cdsrc.json'));
  const capKinds = capConfigured
    ? capRequiredKinds([pkg.cds, ...files.filter((f) => f.path === '.cdsrc.json').map((f) => {
        try { return JSON.parse(f.content) as unknown; } catch { return null; }
      })])
    : { db: new Set<string>(), auth: new Set<string>() };
  const capNames = (name: string): boolean => {
    const by = CAP_CONFIGURED_BY[name];
    return !by || by.kinds.some((k) => capKinds[by.service].has(k));
  };
  for (const block of ['dependencies', 'devDependencies'] as const) {
    for (const name of Object.keys(pkg[block] ?? {})) {
      if (TOOLING.test(name)) continue;
      if (capConfigured && CAP_CONFIGURED.test(name) && capNames(name)) continue;
      if (used.has(name) || strings.has(name)) continue;
      if (new RegExp(`(?:^|[\\s;&|/])${escapeRe(name)}(?:$|[\\s;&|])`).test(scripts)) continue;
      const idx = lines.findIndex((l) => l.includes(`"${name}"`));
      out.push(
        finding(
          'unused-dependency',
          'package.json',
          idx >= 0 ? idx + 1 : 1,
          `"${name}" is declared in ${block} but nothing in the package imports it. A declared dependency reads as a capability (authentication, persistence, an SAP client) the code does not have — remove it, or use it.`,
        ),
      );
    }
  }
  return out;
}

/* ------------------------------------------------------ 9. ignored option */

function ignoredOptions(s: Source, all: readonly Source[]): GeneratedCodeLintFinding[] {
  const out: GeneratedCodeLintFinding[] = [];
  const propertyRead = (name: string) =>
    all.some((o) =>
      codeMatches(o.src, o.mask, new RegExp(`\\.\\s*${escapeRe(name)}(?![\\w$])`, 'g')).some((m) => {
        const before = o.src.slice(Math.max(0, m.index - 30), m.index);
        if (/\breq(?:uest)?\s*\??\.\s*(?:query|body|params)\s*\??$/.test(before)) return false;
        return !/^\s*=(?!=)/.test(o.src.slice(m.index + m[0].length, m.index + m[0].length + 4));
      }) ||
      codeMatches(o.src, o.mask, new RegExp(`\\{[^{}]*(?<![\\w$])${escapeRe(name)}(?![\\w$])[^{}]*\\}\\s*(?::[^=;\\n]+)?=(?!=)`, 'g')).some(
        (m) => !REQUEST_INPUT.test(o.src.slice(m.index + m[0].length, m.index + m[0].length + 40)),
      ),
    );
  const seen = new Set<string>();
  const check = (name: string, declAt: number, asProperty: boolean) => {
    if (seen.has(name)) return;
    seen.add(name);
    let passedOn = asProperty;
    if (!asProperty) {
      const fn = innermostFn(s, declAt);
      const uses = identifierUses(s, name).filter((u) => u !== declAt && (!fn || (fn.open < u && u < fn.close)));
      const real = uses.filter((u) => {
        const p = prevCode(s.src, s.mask, u);
        const n = nextCode(s.src, s.mask, u + name.length);
        const shorthand = p >= 0 && '{,'.includes(s.src[p]) && n < s.src.length && ',}'.includes(s.src[n]);
        return !shorthand;
      });
      if (real.length > 0) return;
      passedOn = uses.length > 0;
    }
    if (passedOn && propertyRead(name)) return;
    out.push(
      finding(
        'ignored-option',
        s.path,
        lineOf(s, declAt),
        `The request option "${name}" is parsed but never read${passedOn ? ' after it is passed on' : ''}: the caller asks for it and gets a result without it. Apply it, or refuse it with an error.`,
      ),
    );
  };
  for (const m of codeMatches(s.src, s.mask, /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=;\n]+)?=\s*([^;\n]*)/g)) {
    if (!REQUEST_INPUT.test(m[2]) || /^\s*req(?:uest)?\s*\??\.\s*(?:query|body|params)\s*;?\s*$/.test(m[2])) continue;
    if (!innermostFn(s, m.index)) continue;
    check(m[1], m.index + m[0].indexOf(m[1]), false);
  }
  for (const m of codeMatches(s.src, s.mask, /(?<![\w$.?])([\w$]+)\s*:\s*([^,\n}]*\breq(?:uest)?\s*\??\.\s*(?:query|body|params)\b[^,\n}]*)/g)) {
    if (!innermostFn(s, m.index)) continue;
    // `x ? a : b` is not an object key.
    const p = prevCode(s.src, s.mask, m.index);
    if (p >= 0 && !'{,('.includes(s.src[p])) continue;
    check(m[1], m.index, true);
  }
  return out;
}

/* --------------------------------------------------------------- the entry */

/**
 * Every finding of the checks above over a generated package, ordered by
 * severity, file and line. Test files are read for imports only.
 */
export function generatedCodeLints(
  code: string | readonly SandboxFile[] | null | undefined,
  options: GeneratedCodeLintOptions = {},
): GeneratedCodeLintFinding[] {
  const files = typeof code === 'string' ? sandboxFilesFromStoredCode(code) : code ? [...code] : [];
  const sources = files.filter((f) => CODE_FILE.test(f.path) && !TEST_FILE.test(f.path) && !f.path.startsWith('docs/')).map((f) => readSource(f.path, f.content));
  const isDecimal = decimalTest(options.decimalFields);
  const out: GeneratedCodeLintFinding[] = [];
  for (const s of sources) {
    const states = moduleState(s);
    out.push(
      ...lenientNumberParsing(s),
      ...globalMutableResult(s, states),
      ...weakRunIds(s, states),
      ...floatDecimalArithmetic(s, isDecimal),
      ...csvUnescaped(s),
      ...startOnImport(s),
      ...claimedIntegration(s),
      ...ignoredOptions(s, sources),
    );
  }
  for (const f of files) if (ABAP_FILE.test(f.path)) out.push(...abapSapEvents(f.path, f.content), ...abapDocMissing(f.path, f.content));
  out.push(...unusedDependencies(files));
  const rank = (x: LintSeverity) => LINT_SEVERITIES.indexOf(x);
  return out.sort((a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id));
}

export function lintSeverityCounts(findings: readonly GeneratedCodeLintFinding[]): Record<LintSeverity, number> {
  const out: Record<LintSeverity, number> = { P0: 0, P1: 0, P2: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

/** "2 P0 · 3 P1 · 1 P2", or "none". */
export function lintCountLine(findings: readonly GeneratedCodeLintFinding[]): string {
  if (findings.length === 0) return 'none';
  const c = lintSeverityCounts(findings);
  return LINT_SEVERITIES.map((s) => `${c[s]} ${s}`).join(' · ');
}

/** DDIC fields and data elements that are packed quantities, amounts or prices. */
const DDIC_PACKED = /^(?:menge(?:_d)?|netwr|netpr|wrbtr|dmbtr|kwmeng|zmeng|bdmng|enmng|kbetr|kwert|psmng|wemng|gamng|bmeng|erfmg|lsmng|ntgew|brgew|mzubb|wtgbtr|hsl|ksl|tsl|osl|wkg|wtg|wog|bprme|verpr|stprs|peinh)$/i;

/**
 * Names the ABAP original declares as packed decimals: `x TYPE p …`, and
 * fields or variables typed with a DDIC quantity, amount or price
 * (`zmeng TYPE vbap-zmeng`, `lv_qty TYPE menge_d`). Feeds the decimal check.
 */
export function packedDecimalFields(abap: string | null | undefined): string[] {
  if (!abap) return [];
  const out = new Set<string>();
  for (const raw of abap.split(/\r?\n/)) {
    if (/^\s*\*/.test(raw)) continue;
    const l = raw.replace(/"[^']*$/, '');
    for (const m of l.matchAll(/(?:^|[\s,:(])([A-Za-z_][\w]*)\s+TYPE\s+(?:REF\s+TO\s+)?([\w/]+(?:-[\w]+)?)/gi)) {
      const name = m[1];
      const type = m[2];
      if (/^(?:DATA|TYPES|CONSTANTS|PARAMETERS|STATICS|FIELD-SYMBOLS|CLASS-DATA|BEGIN|END|OF)$/i.test(name)) continue;
      const field = type.includes('-') ? type.split('-').pop() ?? '' : type;
      if (/^p$/i.test(type) || DDIC_PACKED.test(field)) out.add(name.toLowerCase());
    }
  }
  return [...out].sort();
}
