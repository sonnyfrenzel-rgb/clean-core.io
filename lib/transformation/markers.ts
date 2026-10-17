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
 *     " @cc-fill BEGIN U02 9f2c41d0            (ABAP; `"!` before scaffold version 11)
 *     RAISE EXCEPTION NEW zcx_…_not_filled( unit = 'U02' ).
 *     " @cc-fill END U02
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
import { createLiteralScanner, readStatements } from '../abap/statement-reader';
import { codeMask } from '../ts-source-scan';
// The class names SAP releases for ABAP Cloud (~1,400, 9 kB gzip; written by the catalog sync) — never the catalog itself.
import releasedClassList from '../abap/generated/released-classes.latest.json';
import releasedInterfaceList from '../abap/generated/released-interfaces.latest.json';
import {
  BODY_MAX_CHARS,
  BODY_SLICE_FACTOR,
  type AbapRegionNames,
  type BodyGuardContext,
  type BodyRefusal,
  type FillRegion,
  type RegionBody,
  type Scaffold,
  type ScaffoldFile,
  type SpliceResult,
} from './types';

export const MARKER_TAG = '@cc-fill';

/**
 * An ABAP marker is a plain comment (`" @cc-fill …`) since scaffold version 11: as ABAP Doc (`"! @cc-fill …`, versions
 * 1–10) inside a method it drew 71 activation warnings in the first SAP activation (15.10.2026, "ABAP Doc comment is in
 * the wrong position"). Both forms are read, so a package stored before keeps its regions and its digest.
 */
const BEGIN = /^([ \t]*)(\/\/|"!?)[ \t]*@cc-fill BEGIN ([A-Za-z0-9.]+) ([0-9a-f]{8})[ \t]*$/;
const END = /^([ \t]*)(\/\/|"!?)[ \t]*@cc-fill END ([A-Za-z0-9.]+)[ \t]*$/;

/** First 8 hex characters of sha256 over a region's engine-owned anchor text. */
export function regionHash(anchor: string): string {
  return sha256Hex(anchor).slice(0, 8);
}

/** The two marker lines of a region, for a file of `track`. */
export function markerLines(track: 'node' | 'rap', regionId: string, hash: string, indent: string): { begin: string; end: string } {
  const c = track === 'node' ? '//' : '"';
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
/**
 * The classes SAP's `latest` list marks released (acceptance run 4, 14.10.2026: `cl_system_uuid=>` refused as a
 * call outside the logic class in 2 of 3 runs). A body may call them; a name neither declared by the package nor
 * released — an invented or an internal class — is still refused.
 */
const RELEASED_CLASSES: ReadonlySet<string> = new Set((releasedClassList as { classes: string[] }).classes);
/** Whether SAP releases this class for ABAP Cloud (lower-case or not). */
export function isReleasedSapClass(name: string): boolean {
  return RELEASED_CLASSES.has(name.toLowerCase());
}
/**
 * The interfaces SAP's `latest` list marks released (roadmap 3.0.14 item 4): a body reads a released interface's
 * constants and types through `=>` as it does a class's (`if_abap_behv=>mk-on`, `if_oo_adt_classrun=>…`), and the
 * guard read only the class list, so it refused them as calls outside the logic class. Synced beside the class list
 * (`released-interfaces.latest.json`, names only).
 */
const RELEASED_INTERFACES: ReadonlySet<string> = new Set((releasedInterfaceList as { interfaces: string[] }).interfaces);
/** Whether SAP releases this interface for ABAP Cloud (lower-case or not). */
export function isReleasedSapInterface(name: string): boolean {
  return RELEASED_INTERFACES.has(name.toLowerCase());
}
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

/**
 * The body lines where a semicolon stands in code — outside literals, templates and comments. ABAP ends a statement
 * with a period and has no `;` of its own (native SQL is refused as a foreign call), so each is a TypeScript habit:
 * `RETURN;` swallowed the `ENDIF.` below it into one statement, and the only refusal the repair round saw was
 * "an IF … without its end" with no line to look at (acceptance runs 15.10.2026: `RETURN;` in the SD main path,
 * `ENDLOOP;` read as "the last statement has no period").
 */
function abapSemicolonLines(body: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  body.split('\n').forEach((raw, i) => {
    if (/^\*/.test(raw)) return;
    const outside = createLiteralScanner();
    for (let c = 0; c < raw.length; c++) {
      const ch = raw[c];
      if (!outside(ch)) continue;
      if (ch === '"') return;
      if (ch === ';') {
        out.push({ line: i + 1, text: raw.trim().slice(0, 40) });
        return;
      }
    }
  });
  return out;
}

/**
 * Where an IF, CASE, LOOP, DO, WHILE or TRY of a body is not closed, or an end has no opener — in body lines, so a
 * repair round is told which line to look at, not only that one is wrong.
 */
function unbalancedAt(statements: ReturnType<typeof readStatements>): string[] {
  const closerOf = new Map(Object.entries(OPENERS).map(([open, close]) => [close, open]));
  const stack: Array<{ keyword: string; line: number }> = [];
  const out: string[] = [];
  for (const s of statements) {
    if (OPENERS[s.keyword]) {
      stack.push({ keyword: s.keyword, line: s.lineStart });
      continue;
    }
    const opener = closerOf.get(s.keyword);
    if (!opener) continue;
    const at = stack.map((o) => o.keyword).lastIndexOf(opener);
    if (at === -1) {
      out.push(`${s.keyword} at body line ${s.lineStart} has no ${opener}`);
      continue;
    }
    for (const o of stack.splice(at).slice(1)) out.push(`${o.keyword} at body line ${o.line} has no ${OPENERS[o.keyword]}`);
  }
  for (const o of stack) out.push(`${o.keyword} at body line ${o.line} has no ${OPENERS[o.keyword]}`);
  return out;
}

function rapBodyGuards(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const out: BodyRefusal[] = [];
  if (!abapLiteralsClosed(body)) out.push(refusal('unterminated', 'an unterminated literal'));
  const semicolons = abapSemicolonLines(body);
  if (semicolons.length > 0) {
    const where = semicolons.slice(0, 4).map((s) => `body line ${s.line}: ${s.text}`).join('; ');
    out.push(refusal('unterminated', `a semicolon where ABAP ends a statement with a period (${where}) — every ABAP statement ends with ".", never ";"`));
  }
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
  if (blocks.unterminated.length > 0 || Object.values(counts).some((n) => n !== 0)) {
    const where = unbalancedAt(statements);
    out.push(refusal('unbalanced', `an IF, CASE, LOOP, DO, WHILE or TRY without its end, or an end without its opener${where.length > 0 ? ` (${where.slice(0, 4).join('; ')})` : ''}`));
  }
  const foreign: string[] = [];
  const available = new Set(ctx.available.map((n) => n.toLowerCase()));
  for (const s of statements) {
    if (ABAP_FOREIGN.test(s.text)) foreign.push(s.text.slice(0, 40));
    for (const m of s.text.matchAll(/([\w/]+)=>/g)) {
      const cls = m[1].toLowerCase();
      if (!available.has(cls) && !ABAP_ALLOWED_CLASS.test(cls) && !RELEASED_CLASSES.has(cls) && !RELEASED_INTERFACES.has(cls)) foreign.push(`${cls}=>`);
    }
  }
  if (foreign.length > 0) out.push(refusal('foreign-call', `calls outside the logic class: ${[...new Set(foreign)].slice(0, 6).join(', ')} — neither declared by this package nor released by SAP for ABAP Cloud`));
  if (statements.some((s) => /\bTYPE\s+f\b/i.test(s.text))) out.push(refusal('binary-number', 'TYPE f is binary floating point — amounts and quantities are packed'));
  // Scaffold version 6 (3.0.13): what ABAP Cloud does not have, a SELECT on SAP's tables, names the class does not declare.
  const cloud = statements.filter((s) => ABAP_NOT_CLOUD.test(s.text) || ABAP_NOT_CLOUD_DECL.test(s.text)).map((s) => s.text.split(/\s+/).slice(0, 2).join(' '));
  if (cloud.length > 0) {
    out.push(
      refusal(
        'cloud-statement',
        `statements ABAP Cloud does not have: ${[...new Set(cloud)].slice(0, 6).join(', ')} — a list is left out (its data is in the attributes), a message of TYPE E/A/X is the refusal exception, of TYPE I/S/W a line in mt_messages, DESCRIBE TABLE is lines( )`,
      ),
    );
  }
  const sapTables: string[] = [];
  for (const s of statements) {
    if (!/^(?:SELECT|OPEN\s+CURSOR|WITH)\b/i.test(s.text)) continue;
    for (const m of s.text.matchAll(/\b(?:FROM|JOIN)\s+@?(\/?[A-Za-z][\w/]*)/gi)) if (!/^(?:\/?[zy])/i.test(m[1]) && !/^@/.test(m[1])) sapTables.push(m[1].toUpperCase());
  }
  if (sapTables.length > 0) out.push(refusal('sap-select', `a SELECT on SAP tables (${[...new Set(sapTables)].slice(0, 6).join(', ')}) — SAP is read through mo_access, with the methods the class lists`));
  // A customer table the package does not ship (acceptance run 14.10.2026, PO: `SELECT … FROM zmm_vend_block`):
  // read through the access method the layer has for it, never selected directly.
  if (ctx.abap?.tables) {
    const own = new Set(ctx.abap.tables.map((t) => t.toLowerCase()));
    const reads = ctx.abap.customerReads ?? {};
    const undeclared = new Map<string, string | null>();
    for (const s of statements) {
      if (!/^(?:SELECT|OPEN\s+CURSOR|WITH)\b/i.test(s.text)) continue;
      for (const m of s.text.matchAll(/\b(?:FROM|JOIN)\s+@?(\/?[A-Za-z][\w/]*)/gi)) {
        const t = m[1].toLowerCase();
        if (!/^\/?[zy]/.test(t) || own.has(t)) continue;
        undeclared.set(t, reads[t] ?? null);
      }
    }
    if (undeclared.size > 0) {
      const words = [...undeclared].slice(0, 6).map(([t, method]) => (method ? `${t.toUpperCase()} (read it with mo_access->${method}( ))` : `${t.toUpperCase()} (not in this package and not in the access layer)`));
      out.push(refusal('customer-select', `a SELECT on customer tables this package does not ship: ${words.join(', ')}`));
    }
    // A write to one (acceptance run 4, 14.10.2026, PO: `INSERT zmm_po_appr FROM ls_appr`): through its write method.
    // A data object the body declares under the same name is an internal table, not the database table.
    const writes = ctx.abap.customerWrites ?? {};
    const local = new Set<string>();
    for (const s of statements) {
      const d = /^(?:DATA|STATICS|FIELD-SYMBOLS)\s*:?\s*(<?[\w/]+>?)/i.exec(s.text);
      if (d) local.add(d[1].toLowerCase());
      for (const m of s.text.matchAll(/\b(?:DATA|FINAL)\(\s*([\w/]+)\s*\)/gi)) local.add(m[1].toLowerCase());
    }
    const written = new Map<string, string | null>();
    for (const s of statements) {
      const w = /^(?:INSERT|MODIFY|UPDATE|DELETE)\s+(?:FROM\s+)?(\/?[A-Za-z][\w/]*)(?![\w/-])([\s\S]*)$/i.exec(s.text);
      if (!w) continue;
      const t = w[1].toLowerCase();
      if (!/^\/?[zy]/.test(t) || own.has(t) || local.has(t)) continue;
      // `INSERT ls INTO TABLE lt`, `INSERT … INTO lt INDEX n`: an internal table.
      if (/^\s+INTO\b/i.test(w[2]) || /\bINTO\s+TABLE\b/i.test(w[2])) continue;
      written.set(t, writes[t] ?? null);
    }
    if (written.size > 0) {
      const words = [...written].slice(0, 6).map(([t, method]) => (method ? `${t.toUpperCase()} (write it with mo_access->${method}( is_row = … ) or ( it_rows = … ))` : `${t.toUpperCase()} (not in this package and not in the access layer)`));
      out.push(refusal('customer-write', `a database write to customer tables this package does not ship: ${words.join(', ')}`));
    }
  }
  if (ctx.abap?.sapTypes) out.push(...sapTypeRefusals(statements, ctx.abap));
  if (ctx.abap) out.push(...unknownAbapNames(body, statements, ctx.abap));
  return out;
}

/**
 * Data typed by an SAP table the access layer reads or writes (scaffold version 11, the first SAP activation,
 * 15.10.2026: `DATA lt_vbak TYPE STANDARD TABLE OF vbak` — "Type VBAK is unknown"; abaplint cannot see SAP's types and
 * let it through). ABAP Cloud has no type of an SAP table nor of its fields; the class declares a row type for each.
 */
function sapTypeRefusals(statements: ReturnType<typeof readStatements>, names: AbapRegionNames): BodyRefusal[] {
  const sap = names.sapTypes ?? {};
  const typed = new Map<string, string | null>();
  const re = /\bTYPE\s+(?:(?:STANDARD\s+|SORTED\s+|HASHED\s+|ANY\s+|INDEX\s+)?TABLE\s+OF\s+|LINE\s+OF\s+|REF\s+TO\s+|RANGE\s+OF\s+)?(\/?[A-Za-z][\w/]*)(?:-[\w/]+)*(?![\w/-])/gi;
  for (const s of statements) {
    const text = s.text.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`|\|(?:[^|\\]|\\.)*\|/g, "''");
    for (const m of text.matchAll(re)) {
      const t = m[1].toLowerCase();
      if (Object.prototype.hasOwnProperty.call(sap, t)) typed.set(t, sap[t]);
    }
  }
  if (typed.size === 0) return [];
  const words = [...typed].slice(0, 6).map(([t, row]) => {
    const read = names.sapReads?.[t];
    const how = read ? `, read with mo_access->${read}( CHANGING ct_rows = lt_rows )` : '';
    return row
      ? `${t.toUpperCase()} (use ${row}, the row type of the logic class: DATA lt_rows TYPE STANDARD TABLE OF ${row} WITH EMPTY KEY${how}; a field by its component, ${row}-<field>)`
      : `${t.toUpperCase()} (the class has no row type for it: declare a structure of your own with the fields you need, typed with built-in types${how})`;
  });
  return [refusal('sap-type', `types data by SAP tables ABAP Cloud does not release: ${words.join('; ')}`)];
}

/** Statements ABAP Cloud does not have (the SD review: 81 WRITE, 19 MESSAGE, 4 ULINE, 2 DESCRIBE in one class). */
const ABAP_NOT_CLOUD =
  /^(?:WRITE|ULINE|SKIP|NEW-LINE|NEW-PAGE|FORMAT|MESSAGE|DESCRIBE|PRINT-CONTROL|TOP-OF-PAGE|END-OF-PAGE|TABLES|RANGES|REFRESH|SUPPRESS|SET\s+(?:PF-STATUS|TITLEBAR|SCREEN|CURSOR)|CALL\s+(?:SCREEN|SELECTION-SCREEN|DIALOG)|LEAVE\s+(?:TO\s+SCREEN|TO\s+TRANSACTION|PROGRAM|LIST-PROCESSING|SCREEN)|STOP|ON\s+CHANGE\s+OF|LOOP\s+AT\s+SCREEN|MODIFY\s+SCREEN)\b/i;
/** Declarations ABAP Cloud does not have: header lines and OCCURS. */
const ABAP_NOT_CLOUD_DECL = /^(?:DATA|STATICS|TYPES)\b[\s\S]*\b(?:OCCURS\s+\d+|WITH\s+HEADER\s+LINE)\b/i;

/** Built-in functions and constructor operators a body may call besides the class's methods. */
const ABAP_BUILTINS = new Set(
  (
    'abs ceil floor frac sign trunc round rescale ipow sqrt exp log log10 sin cos tan asin acos atan sinh cosh tanh nmax nmin ' +
    'lines strlen xstrlen numofchar dbmaxlen charlen boolc boolx xsdbool condense concat_lines_of escape find find_end find_any_of find_any_not_of ' +
    'insert match matches repeat replace reverse segment shift_left shift_right substring substring_after substring_before substring_from substring_to ' +
    'to_lower to_upper to_mixed from_mixed translate cmax cmin count count_any_of count_any_not_of distance contains contains_any_of contains_any_not_of ' +
    'line_exists line_index char_off utclong_current utclong_add utclong_diff value conv corresponding cond switch reduce filter exact ref cast new'
  ).split(' '),
);

/**
 * Names a RAP body uses that the class does not declare (3.0.13): a method of the class or the access layer that
 * does not exist (`mo_access->select_vbak_header( )`, `build_demo( )`), and a global, selection input or
 * parameter-like name (`gt_…`, `p_…`, `s_…`, `is_sel`, `iv_…`) that is neither an attribute, a parameter of the
 * method nor declared in the body. Cheap and textual; the full syntax check runs after the splice.
 */
function unknownAbapNames(body: string, statements: ReturnType<typeof readStatements>, names: AbapRegionNames): BodyRefusal[] {
  const code = statements
    .map((s) => s.text.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`|\|(?:[^|\\]|\\.)*\|/g, "''"))
    .join('\n');
  const lower = (xs: readonly string[]) => new Set(xs.map((x) => x.toLowerCase()));
  const methods = lower(names.methods);
  const access = lower(names.access);
  const known = lower([...names.attributes, ...names.params, ...names.methods, 'me', 'mo_access']);
  const declared = new Set<string>();
  for (const m of code.matchAll(/\b(?:DATA|FINAL|FIELD-SYMBOL)\(\s*(<?[\w/]+>?)\s*\)/gi)) declared.add(m[1].toLowerCase());
  for (const s of statements) {
    const d = /^(?:DATA|STATICS|CONSTANTS|FIELD-SYMBOLS|TYPES)\s*:?\s*(?:BEGIN\s+OF\s+)?(<?[\w/]+>?)/i.exec(s.text);
    if (d) declared.add(d[1].toLowerCase());
  }
  const unknown: string[] = [];
  for (const m of code.matchAll(/\bmo_access->([\w]+)\s*\(/gi)) if (!access.has(m[1].toLowerCase())) unknown.push(`mo_access->${m[1]}( )`);
  for (const m of code.matchAll(/\bme->([\w]+)\s*\(/gi)) if (!methods.has(m[1].toLowerCase())) unknown.push(`me->${m[1]}( )`);
  // A bare method call `name( …` — not after NEW, a constructor operator, a component selector or a reference.
  for (const m of code.matchAll(/(^|[^\w>~=\-#])([A-Za-z_][\w]*)\(\s/g)) {
    const name = m[2].toLowerCase();
    const before = code.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + m[1].length);
    if (/\b(?:NEW|VALUE|CONV|CORRESPONDING|COND|SWITCH|REDUCE|FILTER|EXACT|REF|CAST)\s+$/i.test(before)) continue;
    if (methods.has(name) || ABAP_BUILTINS.has(name) || declared.has(name)) continue;
    unknown.push(`${m[2]}( )`);
  }
  // Global, selection and parameter-like names: an attribute, a parameter of this method or a local — or invented.
  for (const s of statements) {
    const text = s.text.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`|\|(?:[^|\\]|\\.)*\|/g, "''");
    for (const m of text.matchAll(/(^|[^\w\-~>=])((?:g[tvsdcor]|[iecr][vstor]|[ps])_[A-Za-z0-9_]+)\b(\s*=(?!=))?/g)) {
      const name = m[2].toLowerCase();
      // `name = …` inside parentheses (a call, a VALUE) is a formal parameter or a component, not a data object of this body.
      const at = (m.index ?? 0) + m[1].length;
      const depth = (text.slice(0, at).match(/\(/g) ?? []).length - (text.slice(0, at).match(/\)/g) ?? []).length;
      if (m[3] && depth > 0) continue;
      if (known.has(name) || declared.has(name)) continue;
      unknown.push(m[2]);
    }
  }
  if (unknown.length === 0) return [];
  return [refusal('unknown-name', `uses names the logic class does not declare: ${[...new Set(unknown)].slice(0, 8).join(', ')} — call only the methods, attributes and access methods "types" lists`)];
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
 * The original's AUTHORITY-CHECKs keep their force (QA findings ef6865e7ade4, fd3392b066b8, 8394df76b027): a body
 * whose region holds a check must call the frame's `authority_L<line>()` — or, where the engine wrote none,
 * `authority_check(` with the check's object — and its answer must reach a path that ends (`used`). A check the
 * frame runs whole with its check on sy-subrc (`wired`, scaffold-node.ts `wireAuthority`) is not the body's. After
 * the repair rounds a refused unit stays a stub with this reason (fail closed), never a silent port.
 */
function authorityRefusals(body: string, ctx: BodyGuardContext): BodyRefusal[] {
  const entries = ctx.track === 'node' ? (ctx.authority ?? []).filter((e) => !e.wired) : [];
  if (entries.length === 0) return [];
  // Code only: comments and string literals cannot call a check.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (m) => (/^'[\w/]*'$/.test(m) ? m : "''"));
  const missing: string[] = [];
  const unused: string[] = [];
  const calls = (re: RegExp) => [...code.matchAll(re)].map((m) => m.index ?? 0);
  /** The index of the bracket that closes the one at `open`, or -1. */
  const closeOf = (open: number): number => {
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  };
  /** The innermost bracket still open at `at`, or -1. */
  const openerOf = (at: number): number => {
    let depth = 0;
    for (let i = at - 1; i >= 0; i--) {
      const c = code[i];
      if (c === ')' || c === ']' || c === '}') depth++;
      else if (c === '(' || c === '[' || c === '{') {
        if (depth === 0) return i;
        depth--;
      }
    }
    return -1;
  };
  /** Does the statement at `from` (a block or one statement) do something and end the path: return, continue, break, throw? */
  const statementExits = (from: number): { exits: boolean; end: number } => {
    let i = from;
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code[i] === '{') {
      const close = closeOf(i);
      if (close < 0) return { exits: false, end: code.length };
      const inner = code.slice(i + 1, close).replace(/[\s;]+$/, '');
      // The last statement of the block: after the last `;` or block end at its own level.
      let depth = 0;
      let boundary = -1;
      for (let k = 0; k < inner.length; k++) {
        const c = inner[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
          depth--;
          if (depth === 0 && c === '}') boundary = k;
        } else if (c === ';' && depth === 0) boundary = k;
      }
      const last = inner.slice(boundary + 1).trim();
      return { exits: last !== '' && /^(?:return|continue|break|throw)\b/.test(last), end: close + 1 };
    }
    let depth = 0;
    let k = i;
    for (; k < code.length; k++) {
      const c = code[k];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if ((c === ';' || c === '\n') && depth === 0) break;
    }
    return { exits: /^(?:return|continue|break|throw)\b/.test(code.slice(i, k).trim()), end: k + 1 };
  };
  /** After an `if (…)` whose `)` is at `close`: does its branch, or its plain `else`, end the path? */
  const branchExits = (close: number): boolean => {
    const then = statementExits(close + 1);
    if (then.exits) return true;
    const rest = code.slice(then.end);
    const otherwise = /^\s*else\b(?!\s+if\b)/.exec(rest);
    return otherwise ? statementExits(then.end + otherwise[0].length).exits : false;
  };
  /**
   * Can the value at [at, end) change the outcome (QA findings fd3392b066b8, 8394df76b027)? Only along a path that
   * ends: it is tested in the condition of an `if` whose branch (or plain `else`) is not empty and ends with return,
   * continue, break or throw; it is handed to a check helper (`guard_…`, `stop_…`, `skip_…`, `when_…`, through
   * `checked`) whose own result is used so; it is returned; or it is assigned — whole or in an expression — to a name
   * or field whose read is used so. An empty branch, one that only logs or assigns, a ternary into a name never
   * tested, `void rc`, `rc;`, `_ = rc` and every other call are not.
   */
  const used = (at: number, end: number, depth = 0): boolean => {
    if (depth > 6) return false;
    let i = at;
    for (;;) {
      const o = openerOf(i);
      const head = o >= 0 ? code.slice(0, o).replace(/\s+$/, '') : '';
      if (o >= 0 && code[o] === '(') {
        if (/\bif$/.test(head)) {
          const close = closeOf(o);
          return close > 0 && branchExits(close);
        }
        const name = /([A-Za-z_$][\w$]*)$/.exec(head)?.[1];
        if (name && !/^(?:while|for|switch|return|typeof|void|await)$/.test(name)) {
          if (!/^(?:guard|stop|skip|when)_/.test(name) && name !== 'checked') return false;
          let start = o;
          while (start > 0 && /\s/.test(code[start - 1])) start--;
          start -= name.length;
          return used(start, closeOf(o) + 1, depth + 1);
        }
        if (name) return false;
        i = o; // a grouping paren: the expression goes on outside it
        continue;
      }
      if (o >= 0 && code[o] === '[') {
        i = o;
        continue;
      }
      if (o >= 0 && code[o] === '{' && /(?:[(,:=?]|\breturn)$/.test(head)) {
        i = o; // an object literal: what it is handed to
        continue;
      }
      break;
    }
    // The statement the value stands in, from its start at this level.
    const opener = openerOf(i);
    let s = i;
    for (let d = 0; s > opener + 1; s--) {
      const c = code[s - 1];
      if (c === ')' || c === ']' || c === '}') d++;
      else if (c === '(' || c === '[' || c === '{') d--;
      else if ((c === ';' || c === '\n') && d === 0) {
        // A line break continues an expression that is still open on the line before (`=`, `?`, `&&`, an operator).
        if (c === '\n' && /[=?:&|+\-*/,(]\s*$/.test(code.slice(opener + 1, s - 1))) continue;
        break;
      }
    }
    const statement = code.slice(s, i).replace(/^\s+/, '');
    if (/^return\b/.test(statement)) return true;
    const assigned = /^(?:(?:const|let|var)\s+)?((?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?![=>])/.exec(statement);
    if (!assigned || /^_+$/.test(assigned[2])) return false;
    const field = assigned[1] !== '';
    const name = assigned[2];
    const read = new RegExp(field ? `\\.${escapeRe(name)}(?![\\w$])` : `(?<![\\w$.])${escapeRe(name)}(?![\\w$])`, 'g');
    return [...code.slice(end).matchAll(read)].some((m) => {
      const start = end + (m.index ?? 0) + (field ? 1 : 0);
      const stop = start + name.length;
      const next = code.slice(stop);
      if (/^\s*=(?![=>])/.test(next)) return false;
      // A property key of that name (`{ sySubrc: 0 }`) is no read; the shorthand `{ sySubrc }` is.
      if (/^\s*:/.test(next) && /[{,]\s*$/.test(code.slice(0, start))) return false;
      return used(start, stop, depth + 1);
    });
  };
  for (const e of entries) {
    if (e.fn) {
      const at = calls(new RegExp(`(?<![\\w$.])${escapeRe(e.fn)}\\s*\\(\\s*\\)`, 'g'));
      if (at.length === 0) missing.push(`${e.fn}() (the AUTHORITY-CHECK at L${e.line})`);
      else if (!at.some((i) => used(i, i + (code.slice(i).match(/^[\w$]+\s*\(\s*\)/)?.[0].length ?? 0)))) unused.push(`${e.fn}() (L${e.line})`);
      continue;
    }
    const object = `'${e.object}'`;
    const at = calls(/(?<![\w$.])authority_check\s*\(/g).filter((i) => code.slice(i, i + 200).includes(object));
    if (at.length === 0) missing.push(`authority_check(st, ${object}, …, ${e.line}) (the AUTHORITY-CHECK at L${e.line})`);
    else if (!at.some((i) => used(i, i + (code.slice(i).match(/^authority_check\s*\([^;]*?\)\s*(?=[;\n)?:&|!=<>,]|$)/)?.[0].length ?? 0)))) unused.push(`authority_check(…${object}…) (L${e.line})`);
  }
  const out: BodyRefusal[] = [];
  if (missing.length > 0) out.push(refusal('authority-missing', `the body does not call ${missing.join(', ')} — call it where the original checks and use its answer as sy-subrc`));
  if (unused.length > 0) out.push(refusal('authority-unused', `the body calls ${unused.join(', ')} but ignores its answer — it is sy-subrc of the original's check: hand it to the check on sy-subrc or compare it`));
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
  out.push(...authorityRefusals(body, ctx));
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
  scaffold: Pick<Scaffold, 'files' | 'digest' | 'track'> & { required?: Scaffold['required']; rap?: Scaffold['rap']; authority?: Scaffold['authority'] },
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
    const abap = given?.abap ?? scaffold.rap?.regions[b.regionId];
    // The original's authority checks too: the scaffold's, whatever the caller passes (QA finding ef6865e7ade4).
    const authority = given?.authority ?? scaffold.authority?.[b.regionId];
    const ctx = given
      ? { ...given, required: [...(given.required ?? []), ...(scaffold.required?.[b.regionId] ?? [])], ...(abap ? { abap } : {}), ...(authority?.length ? { authority } : {}) }
      : null;
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
