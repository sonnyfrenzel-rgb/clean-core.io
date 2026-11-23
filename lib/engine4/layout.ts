/**
 * Engine 4.0, layer L3 (first part): the upload layout and its includes.
 *
 * `layout(files) → UploadLayout`. Given the files of an upload as the product
 * receives them — one pasted source, several files, an abapGit folder, or the
 * joined source a project stores — it determines the objects (programs,
 * function groups, function modules, classes, interfaces, type pools) and
 * their parts, the order SAP would read each object in, the includes the code
 * names that the upload does not hold, and the macro names every part sees.
 *
 * Pure: imports only within `lib/engine4/`, and nothing outside it reads this
 * (ADR-125). The statement layer (L1) decides what an `INCLUDE`, a header or a
 * `DEFINE` is, so a commented-out or chained `INCLUDE` is read the way ABAP
 * reads it. Nothing is guessed silently: every attachment says why it was made
 * (`how`), and every conflict is a diagnostic.
 */
import {
  HR_LDB_NODES,
  HR_MACRO_INCLUDES,
  JOIN_CLOSE_MARK,
  JOIN_OPEN_MARK,
  ROLE_RANK,
  SOURCE_EXTENSIONS,
  SYSTEM_MACROS,
  abapGitName,
  classIncludeOf,
  hostOfStem,
  includeSuffixOf,
  isCustomerName,
  type PartRole,
} from './conventions';
import { lex } from './lexer';
import { unitsOf } from './statement-kinds';
import { macroNames, statements, type Statement } from './statements';
import type { Diagnostic, Token } from './tokens';

export type { PartRole } from './conventions';

/** One file as uploaded: its name (a path inside a ZIP is fine) and its text. */
export interface UploadFile {
  name: string;
  source: string;
}

export type ObjectType = 'program' | 'functionGroup' | 'functionModule' | 'class' | 'interface' | 'typePool' | 'include';

/** Why a part belongs to its object. */
export type Attachment = 'header' | 'include' | 'abapGit' | 'convention' | 'prefix' | 'onlyGroup' | 'alone';

export type IncludeState = 'resolved' | 'missing' | 'optional-missing' | 'generated' | 'cycle' | 'repeated';

/** One `INCLUDE` statement. */
export interface IncludeRef {
  /** The include named, upper-cased. */
  name: string;
  row: number;
  col: number;
  ifFound: boolean;
  /** The part it resolves to, or null. */
  target: string | null;
  state: IncludeState;
}

/** What a part defines that later layers look up by name. */
export interface Definition {
  kind: 'class' | 'interface' | 'function' | 'form' | 'module' | 'macro';
  name: string;
  row: number;
  /** `CLASS … DEFINITION PUBLIC` / `INTERFACE … PUBLIC`. */
  global: boolean;
}

export interface UploadPart {
  /** The name an `INCLUDE` statement uses for it, upper-cased. */
  name: string;
  /** The uploaded file it came from. */
  file: string;
  /** For a part cut out of a joined source: `lineMap[r - 1]` is the file row of its row `r`. Null: the whole file. */
  lineMap: number[] | null;
  source: string;
  object: string;
  role: PartRole;
  how: Attachment;
  /** The header statement, if any (`REPORT`, `FUNCTION-POOL`, …), and the name it gives. */
  header: { kind: string; name: string } | null;
  includes: IncludeRef[];
  defines: Definition[];
  /** Statements of the part, read without outside macros (a header, an INCLUDE, a DEFINE never depend on them). */
  statements: Statement[];
  tokens: Token[];
  /** What the lexer reported for the part. */
  lexDiagnostics: Diagnostic[];
}

export interface UploadObject {
  name: string;
  type: ObjectType;
  /** The part the object is read from (report, `SAPL…`, class pool), or null when the upload lacks it. */
  main: string | null;
  /** Every part, in the order SAP reads the object: includes in place, depth first. */
  order: string[];
  /** Includes the object's code names and the upload does not hold. */
  missing: Array<{ name: string; from: string; row: number; optional: boolean; customer: boolean }>;
  /** Macro names visible in the object: its own `DEFINE`s across all its parts, then system macros. */
  macros: string[];
  /** The system macros among `macros`, and why they are visible. */
  systemMacros: Array<{ name: string; from: 'hrLogicalDatabase' | 'trmac' }>;
}

export type LayoutCode =
  | 'not-source'
  | 'duplicate-part'
  | 'missing-include'
  | 'missing-sap-include'
  | 'include-cycle'
  | 'include-repeated'
  | 'include-shared'
  | 'missing-main'
  | 'not-referenced'
  | 'joined-source'
  | 'second-header';

export interface LayoutDiagnostic {
  code: LayoutCode;
  message: string;
  file: string;
  row: number;
  severity: 'error' | 'warning' | 'info';
}

export interface UploadLayout {
  parts: UploadPart[];
  /** Objects in reading order: the primary one first (see `objectRank`). */
  objects: UploadObject[];
  /** The object a single-process reading starts from: the first of `objects`, or null for an empty upload. */
  primary: string | null;
  /** Every part once, objects in order, each object's parts in its order. */
  order: Array<{ object: string; part: string }>;
  diagnostics: LayoutDiagnostic[];
  /** False when an include loops or is named twice: SAP activates no such program. */
  activatable: boolean;
}

/* ------------------------------------------------------------ files to parts */

interface RawPart {
  name: string;
  file: string;
  lineMap: number[] | null;
  source: string;
}

const escapeRx = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPEN_LINE = new RegExp(`^${escapeRx(JOIN_OPEN_MARK)} ([\\w/.=]+) · (.*)$`);
const CLOSE_LINE = new RegExp(`^${escapeRx(JOIN_CLOSE_MARK)} ([\\w/.=]+)$`);

/**
 * A source the product joined (`lib/abap/include-resolution.ts`) cut back into
 * the files it was joined from: the include texts between their markers, and
 * the main text with each `INCLUDE` the join commented out restored. Null when
 * the source holds no markers or they do not pair up — then it is one file.
 */
export function splitJoined(file: string, source: string): RawPart[] | null {
  if (!source.includes(JOIN_OPEN_MARK)) return null;
  const lines = source.split(/\r?\n/);
  const nl = source.includes('\r\n') ? '\r\n' : '\n';
  const frames: Array<{ name: string; file: string; lines: string[]; rows: number[] }> = [{ name: '', file, lines: [], rows: [] }];
  const done: typeof frames = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN_LINE.exec(lines[i]);
    if (open) {
      const top = frames[frames.length - 1];
      const prev = top.lines.length - 1;
      // The join wrote `*` + the INCLUDE line just before the marker: give it back.
      if (prev >= 0 && new RegExp(`^\\*\\s*INCLUDE\\s+${open[1].replace(/[/.=]/g, '\\$&')}\\b`, 'i').test(top.lines[prev])) {
        top.lines[prev] = top.lines[prev].slice(1);
      }
      frames.push({ name: open[1].toUpperCase(), file: open[2], lines: [], rows: [] });
      continue;
    }
    const close = CLOSE_LINE.exec(lines[i]);
    if (close) {
      const top = frames.pop();
      if (!top || frames.length === 0 || top.name !== close[1].toUpperCase()) return null;
      done.push(top);
      continue;
    }
    frames[frames.length - 1].lines.push(lines[i]);
    frames[frames.length - 1].rows.push(i + 1);
  }
  if (frames.length !== 1 || done.length === 0) return null;
  const main = frames[0];
  const trimmed = main.lines[main.lines.length - 1] === '' ? main.lines.slice(0, -1) : main.lines;
  return [
    { name: '', file, lineMap: main.rows.slice(0, trimmed.length), source: trimmed.join(nl) + nl },
    ...done.map((f) => ({ name: f.name, file: f.file, lineMap: f.rows, source: f.lines.join(nl) + nl })),
  ];
}

/** The name an `INCLUDE` would use for a file: abapGit's part, else the file name without its extension. */
export function partNameOfFile(file: string): string {
  const git = abapGitName(file);
  if (git) {
    if (git.part && (git.type === 'clas' || git.type === 'intf')) return `${git.name}.${git.part}`;
    return git.part ?? git.name;
  }
  const base = file.split(/[\\/]/).pop() ?? file;
  const dot = base.lastIndexOf('.');
  return (dot <= 0 ? base : base.slice(0, dot)).toUpperCase();
}

function isSourceFile(name: string): boolean {
  const lower = name.toLowerCase();
  return !/\.[a-z0-9]+$/.test(lower) || SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The name an INCLUDE statement names: the tokens after `INCLUDE` written without blanks (`zcl_x=====ccdef`). */
function includedName(s: Statement): string {
  let name = s.tokens[1]?.text ?? '';
  for (let i = 2; i < s.tokens.length && !s.tokens[i].spaceBefore; i++) name += s.tokens[i].text;
  return name.toUpperCase();
}

const HEADER_KINDS = new Set(['Report', 'Program', 'FunctionPool', 'ClassPool', 'InterfacePool', 'TypePool']);

function readPart(raw: RawPart): Pick<UploadPart, 'header' | 'includes' | 'defines' | 'statements' | 'tokens' | 'lexDiagnostics'> & { headers: number } {
  const lexed = lex(raw.source);
  const tokens = lexed.tokens;
  const list = statements(tokens);
  let header: UploadPart['header'] = null;
  let headers = 0;
  const includes: IncludeRef[] = [];
  const defines: Definition[] = [];
  for (const s of list) {
    if (s.context !== 'abap') continue;
    const units = unitsOf(s.tokens);
    if (HEADER_KINDS.has(s.kind)) {
      headers += 1;
      if (!header) header = { kind: s.kind, name: units[1] ?? '' };
    } else if (s.kind === 'Include') {
      includes.push({ name: includedName(s), row: s.start.row, col: s.start.col, ifFound: units.includes('FOUND'), target: null, state: 'missing' });
    } else if (s.kind === 'ClassDefinition') {
      defines.push({ kind: 'class', name: units[1], row: s.start.row, global: units.includes('PUBLIC') });
    } else if (s.kind === 'Interface') {
      defines.push({ kind: 'interface', name: units[1], row: s.start.row, global: units.includes('PUBLIC') });
    } else if (s.kind === 'Function' || s.kind === 'Form') {
      defines.push({ kind: s.kind === 'Function' ? 'function' : 'form', name: units[1], row: s.start.row, global: s.kind === 'Function' });
    } else if (s.kind === 'Module') {
      defines.push({ kind: 'module', name: units[1], row: s.start.row, global: false });
    }
  }
  for (const name of macroNames(list)) {
    const def = list.find((s) => s.kind === 'Define' && unitsOf(s.tokens)[1] === name);
    defines.push({ kind: 'macro', name, row: def?.start.row ?? 0, global: false });
  }
  return { header, includes, defines, statements: list, tokens, lexDiagnostics: lexed.diagnostics, headers };
}

/* ------------------------------------------------------------ the layout */

interface Work {
  parts: UploadPart[];
  byName: Map<string, UploadPart>;
  objects: Map<string, UploadObject>;
  diagnostics: LayoutDiagnostic[];
}

function diag(w: Work, code: LayoutCode, severity: LayoutDiagnostic['severity'], file: string, row: number, message: string): void {
  w.diagnostics.push({ code, severity, file, row, message });
}

function object(w: Work, name: string, type: ObjectType): UploadObject {
  let o = w.objects.get(name);
  if (!o) {
    o = { name, type, main: null, order: [], missing: [], macros: [], systemMacros: [] };
    w.objects.set(name, o);
  }
  return o;
}

function attach(w: Work, part: UploadPart, o: UploadObject, role: PartRole, how: Attachment): void {
  part.object = o.name;
  part.role = role;
  part.how = how;
  if (role === 'main' && !o.main) o.main = part.name;
}

/** Step 1: every file to parts, joined sources cut back, duplicates kept once. */
function collectParts(w: Work, files: readonly UploadFile[]): void {
  for (const f of files) {
    if (!isSourceFile(f.name)) {
      diag(w, 'not-source', 'info', f.name, 0, `${f.name} is no ABAP source and was not read.`);
      continue;
    }
    const split = splitJoined(f.name, f.source);
    if (split) diag(w, 'joined-source', 'info', f.name, 0, `${f.name} is a joined source; read as the ${split.length} files it was joined from.`);
    const raws: RawPart[] = split ?? [{ name: '', file: f.name, lineMap: null, source: f.source }];
    for (const raw of raws) {
      const { headers, ...read } = readPart(raw);
      const fileName = raw.name || partNameOfFile(raw.file);
      // A pasted source, or the main text of a joined one, has no telling file name: its header names it.
      const name = !raw.name && (files.length === 1 || split) && read.header && !abapGitName(raw.file) ? read.header.name : fileName;
      if (headers > 1) diag(w, 'second-header', 'warning', raw.file, 0, `${raw.file} holds ${headers} program headers; the first names it.`);
      const kept = w.byName.get(name);
      if (kept) {
        diag(w, 'duplicate-part', 'warning', raw.file, 0, `${raw.file} defines ${name} again; the copy from ${kept.file} is read.`);
        continue;
      }
      const part: UploadPart = { ...read, name, file: raw.file, lineMap: raw.lineMap, source: raw.source, object: '', role: 'include', how: 'alone' };
      w.parts.push(part);
      w.byName.set(name, part);
    }
  }
}

/** The name an INCLUDE resolves under: exact, or a class include written with other `=` padding. */
function resolveName(w: Work, name: string): UploadPart | undefined {
  const exact = w.byName.get(name);
  if (exact) return exact;
  const cls = classIncludeOf(name);
  if (!cls) return undefined;
  return w.parts.find((p) => {
    const other = classIncludeOf(p.name);
    return other !== null && other.object === cls.object && other.role === cls.role && (cls.role !== 'classMethod' || p.name.replace(/=+/, '=') === name.replace(/=+/, '='));
  });
}

/** Step 2: the parts that found an object by what they say about themselves. */
function anchorObjects(w: Work): void {
  for (const p of w.parts) {
    const git = abapGitName(p.file);
    const cls = classIncludeOf(p.name);
    const globalClass = p.defines.find((d) => d.kind === 'class' && d.global);
    const globalIntf = p.defines.find((d) => d.kind === 'interface' && d.global);
    const fms = p.defines.filter((d) => d.kind === 'function');
    if (git?.type === 'clas' || git?.type === 'intf') {
      const o = object(w, git.name, git.type === 'clas' ? 'class' : 'interface');
      attach(w, p, o, git.part ? (cls?.role ?? 'include') : 'main', 'abapGit');
    } else if (git?.type === 'fugr' && git.part) {
      const role: PartRole = /^SAPL/.test(git.part) ? 'main' : fms.length > 0 && !includeSuffixOf(git.part) ? 'functionModule' : (includeSuffixOf(git.part)?.role ?? 'include');
      attach(w, p, object(w, git.name, 'functionGroup'), role, 'abapGit');
    } else if (p.header?.kind === 'Report' || p.header?.kind === 'Program') {
      // A module pool's TOP carries `PROGRAM sapmzfoo.`, as a group's TOP carries FUNCTION-POOL: it is the TOP, not the main.
      const top = p.name !== p.header.name && includeSuffixOf(p.name)?.role === 'top';
      attach(w, p, object(w, p.header.name, 'program'), top ? 'top' : 'main', 'header');
    } else if (p.header?.kind === 'FunctionPool') {
      const suffix = includeSuffixOf(p.name);
      attach(w, p, object(w, p.header.name, 'functionGroup'), suffix?.role === 'top' ? 'top' : 'main', 'header');
    } else if (p.header?.kind === 'ClassPool') {
      attach(w, p, object(w, cls?.object ?? globalClass?.name ?? p.name, 'class'), 'main', 'header');
    } else if (p.header?.kind === 'InterfacePool') {
      attach(w, p, object(w, cls?.object ?? globalIntf?.name ?? p.name, 'interface'), 'main', 'header');
    } else if (p.header?.kind === 'TypePool') {
      attach(w, p, object(w, p.header.name, 'typePool'), 'main', 'header');
    } else if (/^SAPL./.test(p.name)) {
      attach(w, p, object(w, p.name.slice(4), 'functionGroup'), 'main', 'convention');
    } else if (cls && w.parts.some((q) => q !== p && (q.name === cls.object || q.defines.some((d) => d.kind === 'class' && d.global && d.name === cls.object)))) {
      attach(w, p, object(w, cls.object, 'class'), cls.role, 'convention');
    } else if (globalClass) {
      attach(w, p, object(w, globalClass.name, 'class'), 'main', 'header');
    } else if (globalIntf) {
      attach(w, p, object(w, globalIntf.name, 'interface'), 'main', 'header');
    } else if (fms.length > 0 && !includeSuffixOf(p.name)) {
      attach(w, p, object(w, fms[0].name, 'functionModule'), 'main', 'header');
    }
  }
}

/** Step 3: what the anchored parts include belongs to their object, transitively. */
function followIncludes(w: Work): void {
  const queue = w.parts.filter((p) => p.object !== '');
  while (queue.length > 0) {
    const p = queue.shift()!;
    for (const ref of p.includes) {
      const target = resolveName(w, ref.name);
      if (!target || target.object !== '') continue;
      const o = w.objects.get(p.object)!;
      const role = classIncludeOf(target.name)?.role ?? includeSuffixOf(target.name)?.role ?? 'include';
      attach(w, target, o, role === 'main' ? 'include' : role, 'include');
      queue.push(target);
    }
  }
}

/** Step 4: parts nobody includes, attached by the workbench's naming, or by an object's name as their prefix. */
function attachByConvention(w: Work): void {
  for (const p of w.parts) {
    if (p.object !== '') continue;
    const cls = classIncludeOf(p.name);
    if (cls) {
      attach(w, p, object(w, cls.object, 'class'), cls.role, 'convention');
      continue;
    }
    const suffix = includeSuffixOf(p.name);
    if (suffix) {
      const host = hostOfStem(suffix.stem);
      const existing = w.objects.get(host.object) ?? w.objects.get(host.program);
      attach(w, p, existing ?? object(w, host.object, host.type), suffix.role, 'convention');
      continue;
    }
    const prefix = [...w.objects.keys()].filter((n) => p.name.startsWith(`${n}_`)).sort((a, b) => b.length - a.length)[0];
    if (prefix) {
      const o = w.objects.get(prefix)!;
      attach(w, p, o, o.type === 'class' ? 'classLocalImplementations' : 'include', 'prefix');
      continue;
    }
    attach(w, p, object(w, p.name, 'include'), 'main', 'alone');
  }
}

/**
 * Step 4b: a function module uploaded as its own file names no group. When the
 * upload holds exactly one function group, the module is read as part of it —
 * it then sees the group's TOP, its macros and its routines, as it would in
 * the system. With two groups or none it stays its own object.
 */
function joinOnlyGroup(w: Work): void {
  const groups = [...w.objects.values()].filter((o) => o.type === 'functionGroup');
  if (groups.length !== 1) return;
  for (const o of [...w.objects.values()]) {
    if (o.type !== 'functionModule') continue;
    for (const p of w.parts) if (p.object === o.name) attach(w, p, groups[0], 'functionModule', 'onlyGroup');
    w.objects.delete(o.name);
  }
}

/** The parts of an object in convention order, for the parts its main program does not reach. */
function byRank(parts: UploadPart[]): UploadPart[] {
  return [...parts].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Step 5: the reading order of one object, includes expanded in place. */
function orderObject(w: Work, o: UploadObject): void {
  const own = w.parts.filter((p) => p.object === o.name);
  const seen = new Set<string>();
  const order: string[] = [];
  const fms = byRank(own.filter((p) => p.role === 'functionModule'));
  const visit = (p: UploadPart, stack: string[]): void => {
    seen.add(p.name);
    order.push(p.name);
    for (const ref of p.includes) visitRef(p, ref, [...stack, p.name]);
  };
  const visitRef = (p: UploadPart, ref: IncludeRef, stack: string[]): void => {
    const target = resolveName(w, ref.name);
    ref.target = target?.name ?? null;
    if (target && stack.includes(target.name)) {
      ref.state = 'cycle';
      diag(w, 'include-cycle', 'error', p.file, ref.row, `${[...stack.slice(stack.indexOf(target.name)), target.name].join(' → ')}: the includes loop.`);
    } else if (target && seen.has(target.name)) {
      ref.state = 'repeated';
      diag(w, 'include-repeated', 'error', p.file, ref.row, `${target.name} is included a second time.`);
    } else if (target) {
      ref.state = 'resolved';
      if (target.object !== o.name) diag(w, 'include-shared', 'info', p.file, ref.row, `${target.name} belongs to ${target.object} and is read in ${o.name} too.`);
      visit(target, stack);
    } else if (/UXX$/.test(ref.name) && fms.length > 0) {
      // abapGit keeps a group's function modules as their own files and no UXX: they stand where UXX would.
      ref.state = 'generated';
      for (const fm of fms) if (!seen.has(fm.name)) visit(fm, stack);
    } else {
      ref.state = ref.ifFound ? 'optional-missing' : 'missing';
      const customer = isCustomerName(ref.name);
      if (!o.missing.some((m) => m.name === ref.name)) o.missing.push({ name: ref.name, from: p.name, row: ref.row, optional: ref.ifFound, customer });
      const code = customer ? 'missing-include' : 'missing-sap-include';
      diag(w, code, customer && !ref.ifFound ? 'warning' : 'info', p.file, ref.row, `${ref.name} is included and not part of the upload.`);
    }
  };
  const main = o.main ? w.byName.get(o.main) : undefined;
  // A class's main file holds no INCLUDE (abapGit, or a pasted class): its parts go by role, local definitions first.
  const byRoles = o.type === 'class' && main !== undefined && main.includes.length === 0;
  if (main && !byRoles) visit(main, []);
  else if (!main && o.type !== 'include') diag(w, 'missing-main', 'info', own[0]?.file ?? '', 0, `${o.name}: its main program is not part of the upload; read in the workbench's order.`);
  for (const p of byRank(own)) {
    if (seen.has(p.name)) continue;
    if (main && main.includes.length > 0 && p.how !== 'abapGit') {
      diag(w, 'not-referenced', 'info', p.file, 0, `${p.name} is not included by ${o.main}; read after it.`);
    }
    visit(p, []);
  }
  o.order = order;
}

/** Step 6: the macros every part of an object sees. */
function objectMacros(w: Work, o: UploadObject): void {
  const names: string[] = [];
  let hr = false;
  for (const name of o.order) {
    const p = w.byName.get(name)!;
    for (const d of p.defines) if (d.kind === 'macro' && !names.includes(d.name)) names.push(d.name);
    for (const s of p.statements) {
      if (s.context !== 'abap') continue;
      const units = unitsOf(s.tokens);
      if ((s.kind === 'Nodes' || s.kind === 'Tables' || s.kind === 'Get') && units.slice(1).some((u) => HR_LDB_NODES.has(u))) hr = true;
    }
    if (p.includes.some((r) => HR_MACRO_INCLUDES.has(r.name))) hr = true;
  }
  for (const m of SYSTEM_MACROS) {
    if (names.includes(m.name) || (m.from === 'hrLogicalDatabase' && !hr)) continue;
    o.systemMacros.push(m);
    names.push(m.name);
  }
  o.macros = names;
}

const TYPE_RANK: Record<ObjectType, number> = { program: 0, functionGroup: 1, functionModule: 2, class: 3, interface: 4, typePool: 5, include: 6 };

/**
 * The order of the objects: programs first, then function groups, function
 * modules, classes, interfaces, type pools and loose includes; an object with
 * its main part before one without; by name within each. Independent of the
 * order the files were added in.
 */
function objectRank(a: UploadObject, b: UploadObject): number {
  return TYPE_RANK[a.type] - TYPE_RANK[b.type] || Number(b.main !== null) - Number(a.main !== null) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** The layout of an upload. Pure; the order of `files` matters only for which of two copies is kept. */
export function layout(files: readonly UploadFile[]): UploadLayout {
  const w: Work = { parts: [], byName: new Map(), objects: new Map(), diagnostics: [] };
  collectParts(w, files);
  anchorObjects(w);
  followIncludes(w);
  attachByConvention(w);
  followIncludes(w);
  joinOnlyGroup(w);
  const objects = [...w.objects.values()].sort(objectRank);
  for (const o of objects) orderObject(w, o);
  for (const o of objects) objectMacros(w, o);
  const order: UploadLayout['order'] = [];
  const placed = new Set<string>();
  for (const o of objects) {
    for (const part of o.order) {
      if (placed.has(part)) continue;
      placed.add(part);
      order.push({ object: o.name, part });
    }
  }
  return {
    parts: w.parts,
    objects,
    primary: objects[0]?.name ?? null,
    order,
    diagnostics: w.diagnostics,
    activatable: !w.diagnostics.some((d) => d.code === 'include-cycle' || d.code === 'include-repeated'),
  };
}

/** The macro names a part sees: those of every object that reads it. */
export function macrosFor(l: UploadLayout, part: string): string[] {
  const out: string[] = [];
  for (const o of l.objects) {
    if (!o.order.includes(part)) continue;
    for (const m of o.macros) if (!out.includes(m)) out.push(m);
  }
  return out;
}
