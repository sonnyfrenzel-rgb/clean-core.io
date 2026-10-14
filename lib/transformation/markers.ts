/**
 * Fill markers, the body guards and the safe splice (design §9).
 *
 * Every place the model may write is a region between two marker lines the
 * engine wrote:
 *
 *     // @cc-fill BEGIN U02 9f2c41d0          (TypeScript)
 *     throw new NotImplementedFill('U02', 'validatePolicy');
 *     // @cc-fill END U02
 *
 *     "! @cc-fill BEGIN U02 9f2c41d0           (ABAP)
 *     RAISE EXCEPTION NEW zcx_…_not_filled( unit = 'U02' ).
 *     "! @cc-fill END U02
 *
 * A region id is a unit (`U02`, the function body) or a unit and a guard
 * (`U02.G0506`, the guard's predicate). The 8 hex characters are the first 8
 * of the sha256 of the region's engine-owned anchor text (signature, guard
 * calls, doc comment), so a marker copied elsewhere does not match.
 *
 * `spliceBodies` replaces only the text between the two marker lines — a
 * text search, no AST — and then recomputes `scaffoldDigest` over every
 * character outside the regions. A candidate whose digest differs from the
 * scaffold's is refused: that proves the model changed no engine-owned
 * character. A body that fails `bodyGuards` is not spliced; its stub stays.
 *
 * Pure and deterministic. No network, no model.
 */

import { sha256Hex } from '../artefact-digest';
import { readBlocks } from '../abap/block-structure';
import { readStatements } from '../abap/statement-reader';
import { codeMask } from '../ts-source-scan';
import {
  BODY_MAX_CHARS,
  BODY_SLICE_FACTOR,
  type BodyGuardContext,
  type BodyRefusal,
  type FillRegion,
  type RegionBody,
  type Scaffold,
  type ScaffoldFile,
  type SpliceResult,
} from './types';

export const MARKER_TAG = '@cc-fill';

const BEGIN = /^([ \t]*)(\/\/|"!)[ \t]*@cc-fill BEGIN ([A-Za-z0-9.]+) ([0-9a-f]{8})[ \t]*$/;
const END = /^([ \t]*)(\/\/|"!)[ \t]*@cc-fill END ([A-Za-z0-9.]+)[ \t]*$/;

/** First 8 hex characters of sha256 over a region's engine-owned anchor text. */
export function regionHash(anchor: string): string {
  return sha256Hex(anchor).slice(0, 8);
}

/** The two marker lines of a region, for a file of `track`. */
export function markerLines(track: 'node' | 'rap', regionId: string, hash: string, indent: string): { begin: string; end: string } {
  const c = track === 'node' ? '//' : '"!';
  return { begin: `${indent}${c} ${MARKER_TAG} BEGIN ${regionId} ${hash}`, end: `${indent}${c} ${MARKER_TAG} END ${regionId}` };
}

/** A region written out: marker, stub indented, marker. */
export function regionText(track: 'node' | 'rap', regionId: string, anchor: string, indent: string, stub: string): string {
  const m = markerLines(track, regionId, regionHash(anchor), indent);
  return [m.begin, ...stub.split('\n').map((l) => (l ? `${indent}${l}` : l)), m.end].join('\n');
}

/**
 * Engine text that quotes the original (a condition, a comment, an owner's
 * proposal) could carry the marker tag; on a line that is not a marker it is
 * defused, so only the engine's own marker lines open a region.
 */
export function defuseMarkers(content: string): string {
  if (!content.includes(MARKER_TAG)) return content;
  return content
    .split('\n')
    .map((line) => (line.includes(MARKER_TAG) && !BEGIN.test(line) && !END.test(line) ? line.split(MARKER_TAG).join('@cc_fill') : line))
    .join('\n');
}

interface RegionSpan extends FillRegion {
  /** Index of the first character after the BEGIN line's newline. */
  start: number;
  /** Index of the first character of the END line. */
  end: number;
}

/** Every region of one file, or the reason the markers are broken. */
function regionsOf(file: ScaffoldFile): { regions: RegionSpan[]; error: string | null } {
  const regions: RegionSpan[] = [];
  const lines = file.content.split('\n');
  let offset = 0;
  let open: { id: string; hash: string; indent: string; start: number } | null = null;
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!line.includes(MARKER_TAG)) continue;
    const b = BEGIN.exec(line);
    const e = END.exec(line);
    if (b) {
      if (open) return { regions, error: `${file.path}: region ${b[3]} opens inside ${open.id}` };
      open = { id: b[3], hash: b[4], indent: b[1], start: offset };
      continue;
    }
    if (e) {
      if (!open || open.id !== e[3]) return { regions, error: `${file.path}: END ${e[3]} without its BEGIN` };
      const stub = file.content.slice(open.start, lineStart).replace(/\n$/, '');
      regions.push({
        regionId: open.id,
        unitId: open.id.split('.')[0],
        guard: open.id.includes('.') ? `G-${open.id.split('.')[1].replace(/^G/, '')}` : null,
        file: file.path,
        hash: open.hash,
        indent: open.indent,
        stub: stub
          .split('\n')
          .map((l) => (l.startsWith(open!.indent) ? l.slice(open!.indent.length) : l))
          .join('\n'),
        start: open.start,
        end: lineStart,
      });
      open = null;
      continue;
    }
    return { regions, error: `${file.path}: a line mentions ${MARKER_TAG} but is no marker` };
  }
  if (open) return { regions, error: `${file.path}: region ${open.id} is never closed` };
  return { regions, error: null };
}

/** Every fill region of a file set, in file order. Throws when the markers are broken. */
export function findRegions(files: readonly ScaffoldFile[]): FillRegion[] {
  const out: FillRegion[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const { regions, error } = regionsOf(f);
    if (error) throw new Error(error);
    for (const r of regions) {
      if (seen.has(r.regionId)) throw new Error(`region ${r.regionId} appears twice`);
      seen.add(r.regionId);
      out.push({ regionId: r.regionId, unitId: r.unitId, guard: r.guard, file: r.file, hash: r.hash, indent: r.indent, stub: r.stub });
    }
  }
  return out;
}

/** A file's text with every region's interior removed — the engine-owned characters. */
function engineText(file: ScaffoldFile): string {
  const { regions, error } = regionsOf(file);
  if (error) throw new Error(error);
  let out = '';
  let at = 0;
  for (const r of regions) {
    out += file.content.slice(at, r.start);
    at = r.end;
  }
  return out + file.content.slice(at);
}

/** sha256 over every engine-owned character of a file set (paths included, sorted by path). */
export function scaffoldDigest(files: readonly ScaffoldFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256Hex(sorted.map((f) => `${f.path}\n${engineText(f)}`).join('\u0000'));
}

/* ------------------------------------------------------------ body guards */

const TS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'void', 'delete', 'await', 'yield', 'new', 'in', 'of',
  'instanceof', 'do', 'else', 'case', 'throw', 'super', 'this', 'import', 'require',
]);
/** Plain callables a body may use without declaring them. */
const TS_BUILTIN_CALLS = new Set(['String', 'Boolean', 'BigInt', 'Array', 'Object', 'Symbol', 'structuredClone']);
/** Roots of member calls a body may use: built-in namespaces and the step's own parameters. */
const TS_BUILTIN_ROOTS = new Set(['Math', 'JSON', 'Object', 'Array', 'String', 'BigInt', 'Date', 'Symbol', 'Number', 'sel', 'st', 'args', 'local', 'input', 'record', 'this']);
/** Constructors a body may use with `new`. */
const TS_NEW = new Set(['Map', 'Set', 'Error', 'Refusal', 'Array', 'Date']);
/**
 * §9.2 rule 6, as the refusal says it (defect F, A/B 13.10.2026). Not narrowed to packed values on
 * purpose: a TYPE i component of a record reaches a body as unvalidated text (the input contract carries
 * it as `text`), and `Number('1x')` is NaN, which passes every range comparison — U10's `priority < 1 ||
 * priority > 99` let it through. `dec.compare` is exact on whole numbers too and throws on a text that is no
 * number. The message names what to write instead, so a repair round can follow it.
 */
export const BINARY_NUMBER_MESSAGE =
  'Number(), parseFloat() or parseInt() — never in a body, whole numbers (TYPE i) included: a packed value loses digits, and a text that is no number becomes NaN, which passes every range check. ' +
  'Instead: compare a number given as text with dec.compare(a, b) (< 0, === 0, > 0; exact, throws on a text that is no number), e.g. dec.compare(text ?? \'0\', \'99\') > 0; ' +
  'compute with dec.add / dec.sub / dec.mul / dec.div(a, b, places); test zero with dec.isZero(a); check digits with /^\\d+$/.test(text); ' +
  'check a calendar date with new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) === `${y}-${m}-${d}` (toJSON is null for no date; toISOString throws)';

/** Helpers a fill may name in `needs` beyond `available` (§9.2 rule 4). */
export const NEEDS_ALLOWLIST: readonly string[] = ['dec.compare', 'dec.max', 'dec.min', 'dec.abs', 'dec.neg', 'dec.isZero', 'csv.table'];

function refusal(code: BodyRefusal['code'], message: string): BodyRefusal {
  return { code, message };
}

/** Names the body declares itself: `const x`, `let [a, b]`, `function f`, parameters of arrows are not tracked. */
function declaredNames(body: string, mask: Uint8Array): Set<string> {
  const out = new Set<string>();
  const re = /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) if (mask[m.index]) out.add(m[1]);
  const destructure = /\b(?:const|let|var)\s*[[{]([^\]}=]*)[\]}]/g;
  while ((m = destructure.exec(body)) !== null) {
    if (!mask[m.index]) continue;
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop()!.trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
    }
  }
  // Arrow and function parameters: `(a, b) =>`, `x =>`, `function f(a, b)`.
  const arrow = /\(([^()]*)\)\s*(?::\s*[^=]+)?=>|([A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = arrow.exec(body)) !== null) {
    if (!mask[m.index]) continue;
    const list = m[1] ?? m[2] ?? '';
    for (const part of list.split(',')) {
      const name = part.split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
    }
  }
  const catchParam = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  while ((m = catchParam.exec(body)) !== null) if (mask[m.index]) out.add(m[1]);
  return out;
}

function nodeBodyGuards(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const out: BodyRefusal[] = [];
  const probe = `${body}\n;`;
  const mask = codeMask(probe);
  // A quoted string ends on its own line; codeMask ends it at the line break, so check the closing quote here.
  let openQuote = false;
  for (let i = 0; i < body.length && !openQuote; i++) {
    const c = body[i];
    if ((c !== "'" && c !== '"') || mask[i] || (i > 0 && !mask[i - 1])) continue;
    let j = i + 1;
    while (j < body.length && body[j] !== c && body[j] !== '\n') j += body[j] === '\\' ? 2 : 1;
    if (j >= body.length || body[j] !== c) openQuote = true;
  }
  if (!mask[probe.length - 1] || openQuote) out.push(refusal('unterminated', 'an unterminated string, template, regular expression or comment'));
  const code = (re: RegExp) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const hits: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = g.exec(body)) !== null) {
      if (mask[m.index]) hits.push(m);
      if (m[0].length === 0) g.lastIndex++;
    }
    return hits;
  };
  if (code(/\bimport\s*[\s({*'"]|\bexport\s|\brequire\s*\(/).length > 0) out.push(refusal('module-syntax', 'imports, exports and require() are engine-written'));

  // Brackets, on code characters only; and top-level declarations (depth 0).
  const stack: string[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let unbalanced = false;
  const depthAt = new Int32Array(body.length + 1);
  for (let i = 0; i < body.length; i++) {
    depthAt[i] = stack.length;
    if (!mask[i]) continue;
    const c = body[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) unbalanced = true;
    }
  }
  if (unbalanced || stack.length > 0) out.push(refusal('unbalanced', 'unbalanced (), [] or {}'));
  const decl = code(/\b(?:function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(|class\s+[A-Za-z_$]|interface\s+[A-Za-z_$]|enum\s+[A-Za-z_$]|namespace\s+[A-Za-z_$]|declare\s+|type\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=)/);
  // A function or class expression (`const f = function g() {}`) is a value, not a declaration.
  const isExpression = (at: number) => {
    const before = body.slice(0, at).replace(/\s+$/, '');
    return /[=(,:?!&|]$/.test(before) || /\breturn$/.test(before);
  };
  if (decl.some((m) => depthAt[m.index] === 0 && !isExpression(m.index))) out.push(refusal('declaration', 'a top-level function, class, interface or type declaration — the engine writes the declarations'));

  const declared = declaredNames(body, mask);
  const guardNames = new Set(ctx.guardCalls ?? []);
  const shadow = [...declared].filter((n) => guardNames.has(n) || /^(?:guard|stop|skip)_/.test(n));
  if (shadow.length > 0) out.push(refusal('guard-shadowed', `the body redeclares the guard ${shadow.join(', ')}`));
  if (code(/\b(?:guard|stop|skip)_[\w$]*\s*=(?!=)/).length > 0) out.push(refusal('guard-shadowed', 'the body assigns to a guard function'));

  if (code(/\b(?:Number|parseFloat|parseInt)\s*\(|\bNumber\s*\.\s*(?:parseFloat|parseInt)\s*\(/).length > 0) {
    out.push(refusal('binary-number', BINARY_NUMBER_MESSAGE));
  }

  // Calls: a plain call names something available, needed and allowed, declared here, or a built-in;
  // a member call's root is a parameter, a declared name, an available namespace or a built-in namespace.
  const available = new Set(ctx.available);
  const allow = new Set(NEEDS_ALLOWLIST);
  for (const n of ctx.needs ?? []) if (allow.has(n)) available.add(n);
  const roots = new Set([...[...available].map((n) => n.split('.')[0]), ...(ctx.params ?? [])]);
  const foreign = new Set<string>();
  const calls = /(^|[^.\w$])(new\s+)?([A-Za-z_$][\w$]*)((?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*(?:\?\.\s*)?\(/g;
  for (let m = calls.exec(body); m !== null; m = calls.exec(body)) {
    const at = m.index + m[1].length;
    const isNew = Boolean(m[2]);
    const root = m[3];
    calls.lastIndex = at + (m[2]?.length ?? 0) + root.length;
    if (!mask[at]) continue;
    const chain = m[4].replace(/\s|\?/g, '');
    if (TS_KEYWORDS.has(root) && !isNew) continue;
    if (isNew) {
      if (!TS_NEW.has(root) && !declared.has(root)) foreign.add(`new ${root}`);
      continue;
    }
    if (!chain) {
      if (declared.has(root) || available.has(root) || TS_BUILTIN_CALLS.has(root)) continue;
      foreign.add(root);
      continue;
    }
    const full = `${root}${chain}`;
    if (declared.has(root) || TS_BUILTIN_ROOTS.has(root) || available.has(full) || roots.has(root)) continue;
    foreign.add(full);
  }
  if (foreign.size > 0) out.push(refusal('foreign-call', `calls names that are neither available nor declared: ${[...foreign].slice(0, 8).join(', ')}`));

  // Fields: a parameter typed by a closed interface of the scaffold has no other property (`type-shapes.ts`).
  const unknown = new Set<string>();
  for (const [param, fields] of Object.entries(ctx.shapes ?? {})) {
    if (declared.has(param)) continue;
    const known = new Set(fields);
    for (const m of code(new RegExp(`(?:^|[^.\\w$])${param.replace(/\$/g, '\\$')}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`))) {
      const at = m.index + m[0].length - m[1].length;
      if (mask[at] && !known.has(m[1])) unknown.add(`${param}.${m[1]}`);
    }
  }
  if (unknown.size > 0) {
    const has = Object.entries(ctx.shapes ?? {})
      .filter(([p]) => [...unknown].some((u) => u.startsWith(`${p}.`)))
      .map(([p, f]) => `${p}: ${f.slice(0, 30).join(', ') || 'no fields'}`);
    out.push(refusal('unknown-field', `reads fields its parameters' types do not have: ${[...unknown].slice(0, 8).join(', ')} (they have — ${has.join('; ')})`));
  }
  return out;
}

/** ABAP statements a fill body may not hold: declarations of the frame, calls out of the logic class. */
const ABAP_FRAME = /^(METHOD|ENDMETHOD|CLASS|ENDCLASS|INTERFACE|ENDINTERFACE|FORM|ENDFORM|REPORT|PROGRAM|FUNCTION|ENDFUNCTION|MODULE|ENDMODULE)$/;
const ABAP_FOREIGN = /^(?:CALL\s+FUNCTION|CALL\s+TRANSACTION|PERFORM|SUBMIT|EXEC\s+SQL|CALL\s+METHOD\s+\(|CALL\s+'|GENERATE|INSERT\s+REPORT|EDITOR-CALL)\b/i;
const ABAP_ALLOWED_CLASS = /^(?:cl_abap_|cx_|xco_cp|me$|lcl_|lhc_|lsc_)/i;
const OPENERS: Record<string, string> = { IF: 'ENDIF', CASE: 'ENDCASE', LOOP: 'ENDLOOP', DO: 'ENDDO', WHILE: 'ENDWHILE', TRY: 'ENDTRY' };

function abapLiteralsClosed(body: string): boolean {
  for (const raw of body.split('\n')) {
    if (/^\*/.test(raw)) continue;
    let q: string | null = null;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) {
        if (c === q) {
          if (raw[i + 1] === q) i++;
          else q = null;
        }
        continue;
      }
      if (c === '"') break;
      if (c === "'" || c === '`' || c === '|') q = c;
    }
    if (q) return false;
  }
  return true;
}

function rapBodyGuards(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const out: BodyRefusal[] = [];
  if (!abapLiteralsClosed(body)) out.push(refusal('unterminated', 'an unterminated literal'));
  const code = body.split('\n').filter((l) => !/^\s*\*/.test(l) && !/^\s*"/.test(l)).join('\n').trim();
  if (code && !code.replace(/".*$/gm, '').trim().endsWith('.')) out.push(refusal('unterminated', 'the last statement has no period'));
  const statements = readStatements(body);
  if (statements.some((s) => ABAP_FRAME.test(s.keyword) || /\bDEFINITION\b/i.test(s.text) && s.keyword === 'CLASS')) {
    out.push(refusal('declaration', 'METHOD, CLASS, FORM or another frame statement — the engine writes the frame'));
  }
  const blocks = readBlocks(statements);
  const counts: Record<string, number> = {};
  for (const s of statements) {
    if (OPENERS[s.keyword]) counts[s.keyword] = (counts[s.keyword] ?? 0) + 1;
    for (const [open, close] of Object.entries(OPENERS)) if (s.keyword === close) counts[open] = (counts[open] ?? 0) - 1;
  }
  if (blocks.unterminated.length > 0 || Object.values(counts).some((n) => n !== 0)) out.push(refusal('unbalanced', 'an IF, CASE, LOOP, DO, WHILE or TRY without its end, or an end without its opener'));
  const foreign: string[] = [];
  const available = new Set(ctx.available.map((n) => n.toLowerCase()));
  for (const s of statements) {
    if (ABAP_FOREIGN.test(s.text)) foreign.push(s.text.slice(0, 40));
    for (const m of s.text.matchAll(/([\w/]+)=>/g)) {
      const cls = m[1].toLowerCase();
      if (!available.has(cls) && !ABAP_ALLOWED_CLASS.test(cls)) foreign.push(`${cls}=>`);
    }
  }
  if (foreign.length > 0) out.push(refusal('foreign-call', `calls outside the logic class: ${[...new Set(foreign)].slice(0, 6).join(', ')}`));
  if (statements.some((s) => /\bTYPE\s+f\b/i.test(s.text))) out.push(refusal('binary-number', 'TYPE f is binary floating point — amounts and quantities are packed'));
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Literals too common to say a body re-implements a check (`sy-subrc <> 0`, a flag `'X'`). */
const TRIVIAL_LITERALS = new Set(['', ' ', '0', '1', 'X', 'x']);
const JS_OP: Record<string, string> = { '>': '>(?!=)', '>=': '>=', '<': '<(?!=)', '<=': '<=', '=': '===?', '<>': '!==?' };
const ABAP_OP: Record<string, string> = { '>': '(?:>(?!=)|\\bGT\\b)', '>=': '(?:>=|\\bGE\\b)', '<': '(?:<(?![=>])|\\bLT\\b)', '<=': '(?:<=|\\bLE\\b)', '=': '(?:=|\\bEQ\\b)', '<>': '(?:<>|\\bNE\\b)' };

/**
 * Derived checks keep the original's position (rule 15, QA finding
 * 4e9d1315469d): the body must call each required guard, and may not write
 * the guard's comparison itself instead.
 */
function requiredGuardRefusals(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const required = ctx.required ?? [];
  if (required.length === 0) return [];
  const code =
    ctx.track === 'node'
      ? body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      : body
          .split('\n')
          .filter((l) => !/^\s*\*/.test(l))
          .map((l) => l.replace(/"[^']*$/, ''))
          .join('\n');
  const flags = ctx.track === 'rap' ? 'i' : '';
  const out: BodyRefusal[] = [];
  const missing = required.filter((g) => !new RegExp(`(?:^|[^\\w$])${escapeRe(g.helper)}\\s*\\(`, flags).test(code));
  if (missing.length > 0) {
    out.push(refusal('guard-missing', `the body does not call ${missing.map((g) => `${g.helper} (the original checks at L${g.line})`).join(', ')} — a check on a computed value is called where the original makes it`));
  }
  const inlined: string[] = [];
  for (const g of required) {
    const ops = g.op ? [g.op] : Object.keys(JS_OP);
    for (const lit of g.literals) {
      if (TRIVIAL_LITERALS.has(lit)) continue;
      const l = escapeRe(lit);
      const opPatterns = ops.map((o) => (ctx.track === 'node' ? JS_OP[o] : ABAP_OP[o])).filter(Boolean);
      const compare = new RegExp(`(?:${opPatterns.join('|')})\\s*['"\`]?${l}['"\`]?(?![\\w.])`, flags);
      const viaDec = ctx.track === 'node' ? new RegExp(`compare\\([^()]*['"\`]${l}['"\`]`) : null;
      if (compare.test(code) || (viaDec && viaDec.test(code))) {
        inlined.push(`${g.helper} (${lit})`);
        break;
      }
    }
  }
  if (inlined.length > 0) out.push(refusal('guard-inlined', `the body writes the condition of ${inlined.join(', ')} itself — call the guard instead`));
  return out;
}

/**
 * §9.2 — why a body may not be spliced, or `[]` when it may. Checked before
 * the splice; a refused body goes to repair with these reasons.
 */
export function bodyGuards(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const out: BodyRefusal[] = [];
  if (body.includes(MARKER_TAG)) out.push(refusal('marker', `the body contains ${MARKER_TAG}`));
  const limit = Math.min(BODY_MAX_CHARS, Math.max(BODY_SLICE_FACTOR * ctx.sliceChars, 0));
  if (body.length > BODY_MAX_CHARS || body.length > BODY_SLICE_FACTOR * ctx.sliceChars) {
    out.push(refusal('too-long', `${body.length} characters, more than ${limit} (4× the ABAP slice, at most ${BODY_MAX_CHARS})`));
  }
  out.push(...(ctx.track === 'node' ? nodeBodyGuards(body, ctx) : rapBodyGuards(body, ctx)));
  out.push(...requiredGuardRefusals(body, ctx));
  return out;
}

/* ------------------------------------------------- line references (3.0.13, B5) */

/** What a line reference the function was not given is marked with — said once, after the reference. */
export const FOREIGN_LINE_NOTE = ' (not a line of this function’s ABAP)';

/** The comment spans of a body: `//` and `/* *\/` in TypeScript, `*` lines and `"` tails in ABAP. */
function commentSpans(body: string, track: 'node' | 'rap'): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (track === 'rap') {
    let at = 0;
    for (const line of body.split('\n')) {
      if (/^\*/.test(line)) out.push([at, at + line.length]);
      else {
        // A `"` outside a literal starts the comment.
        let q: string | null = null;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (q) {
            if (c === q) q = null;
            continue;
          }
          if (c === "'" || c === '`' || c === '|') q = c;
          else if (c === '"') {
            out.push([at + i, at + line.length]);
            break;
          }
        }
      }
      at += line.length + 1;
    }
    return out;
  }
  const mask = codeMask(`${body}\n;`);
  for (let i = 0; i < body.length; ) {
    if (mask[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < body.length && !mask[j]) j++;
    // Strings are not code either; a comment starts with its marker.
    let k = i;
    while (k < j && /\s/.test(body[k])) k++;
    if (body.startsWith('//', k) || body.startsWith('/*', k)) out.push([k, j]);
    i = j;
  }
  return out;
}

/**
 * The model's line references in a body's comments (`L812`, `L500–540`, `line 812`) checked against the lines
 * the function was given — its ABAP slice, its declarations and call sites, its guards (3.0.13, B5). A reference
 * outside them is marked where it stands (`FOREIGN_LINE_NOTE`), so TRACE and a reviewer never read it as the
 * engine's anchor. Only comments are touched: code and string literals stay as the model wrote them.
 * Idempotent. Returns the body and the references marked.
 */
export function markForeignLineRefs(body: string, track: 'node' | 'rap', allowed: ReadonlySet<number>): { body: string; marked: string[] } {
  if (allowed.size === 0) return { body, marked: [] };
  const spans = commentSpans(body, track);
  if (spans.length === 0) return { body, marked: [] };
  const marked: string[] = [];
  const edits: Array<{ at: number; text: string }> = [];
  const ref = /\b(?:L|lines?\s+)(\d{1,5})(?:\s*[–-]\s*L?(\d{1,5}))?\b/g;
  for (const [s, e] of spans) {
    const text = body.slice(s, e);
    for (const m of text.matchAll(ref)) {
      const end = s + (m.index ?? 0) + m[0].length;
      if (body.startsWith(FOREIGN_LINE_NOTE, end)) continue;
      const lines = [Number(m[1]), ...(m[2] ? [Number(m[2])] : [])];
      if (lines.every((n) => allowed.has(n))) continue;
      marked.push(m[0]);
      edits.push({ at: end, text: FOREIGN_LINE_NOTE });
    }
  }
  if (edits.length === 0) return { body, marked };
  let out = body;
  for (const ed of edits.sort((a, b) => b.at - a.at)) out = `${out.slice(0, ed.at)}${ed.text}${out.slice(ed.at)}`;
  return { body: out, marked };
}

/* ----------------------------------------------------------------- splice */

/**
 * Replace the answered regions' interiors and prove that nothing else
 * changed. `guardContext(regionId)` supplies the body-guard context per region
 * (null: the body is taken unchecked — for the engine's own tests only).
 */
export function spliceBodies(
  scaffold: Pick<Scaffold, 'files' | 'digest' | 'track'> & { required?: Scaffold['required'] },
  bodies: readonly RegionBody[],
  guardContext: (regionId: string) => BodyGuardContext | null,
): SpliceResult {
  const regionFile = new Map<string, string>();
  for (const f of scaffold.files) {
    const { regions, error } = regionsOf(f);
    if (error) return { ok: false, reason: `the scaffold's markers are broken: ${error}`, files: scaffold.files, applied: [], refused: [], digest: scaffold.digest };
    for (const r of regions) regionFile.set(r.regionId, f.path);
  }
  const applied: string[] = [];
  const refused: SpliceResult['refused'] = [];
  const wanted = new Map<string, string>();
  for (const b of bodies) {
    if (!regionFile.has(b.regionId)) {
      refused.push({ regionId: b.regionId, reasons: [refusal('marker', `no region ${b.regionId} in the scaffold`)] });
      continue;
    }
    const given = guardContext(b.regionId);
    // The guards this region must call come from the scaffold, whatever the caller passes (rule 15).
    const ctx = given ? { ...given, required: [...(given.required ?? []), ...(scaffold.required?.[b.regionId] ?? [])] } : null;
    const reasons = ctx ? bodyGuards(b.body, ctx) : b.body.includes(MARKER_TAG) ? [refusal('marker', `the body contains ${MARKER_TAG}`)] : [];
    if (reasons.length > 0) {
      refused.push({ regionId: b.regionId, reasons });
      continue;
    }
    wanted.set(b.regionId, b.body);
  }
  const files = scaffold.files.map((f) => {
    const { regions } = regionsOf(f);
    const hits = regions.filter((r) => wanted.has(r.regionId));
    if (hits.length === 0) return f;
    let content = '';
    let at = 0;
    for (const r of hits) {
      const body = wanted.get(r.regionId)!.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      const indented = body
        .split('\n')
        .map((l) => (l.trim() ? `${r.indent}${l}` : ''))
        .join('\n');
      content += f.content.slice(at, r.start) + indented + '\n';
      at = r.end;
      applied.push(r.regionId);
    }
    content += f.content.slice(at);
    return { ...f, content };
  });
  let digest: string;
  try {
    digest = scaffoldDigest(files);
  } catch (err) {
    return { ok: false, reason: `the candidate's markers are broken: ${(err as Error).message}`, files: scaffold.files, applied: [], refused, digest: scaffold.digest };
  }
  if (digest !== scaffold.digest) {
    return { ok: false, reason: 'the candidate changes engine-written text (scaffold digest differs)', files: scaffold.files, applied: [], refused, digest };
  }
  return { ok: true, reason: null, files, applied, refused, digest };
}

/** Check a candidate file set against a scaffold's digest — for a package edited after generation (§18). */
export function verifyScaffoldDigest(files: readonly ScaffoldFile[], digest: string): boolean {
  try {
    return scaffoldDigest(files) === digest;
  } catch {
    return false;
  }
}
