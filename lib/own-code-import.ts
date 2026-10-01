/**
 * Own code, before a project exists — mockup 2.8 s11, `DESIGN.md` §6.1.
 *
 * "Use your own code" used to create an empty "Untitled project" the moment it
 * was chosen and then ask for one file on the old Analyze page. This module is
 * the half of the replacement that has no screen: it reads what the reader
 * dropped, checks every file on its own, joins a program and its includes into
 * the one source a project holds, and counts what the analysis will read —
 * all in the browser, before anything is written anywhere.
 *
 * Pure apart from `TextDecoder`, so the specs run it in Node. The ZIP half is
 * in `lib/own-code-zip.ts`.
 *
 * **The limits are the server's.** `/api/runs/create` refuses a source above
 * 256 KiB (`MAX_ANALYSED_SOURCE_BYTES`, measured in UTF-8 bytes) and
 * `firestore.rules` refuses a stored `legacyCode` of a million characters or
 * more. The first is the tighter one, so it is the one this screen applies to
 * the joined source; `tests/own-code-import.spec.ts` reads the route and fails
 * the day the two numbers part. Nothing here raises a limit — a file the
 * server would refuse is refused here first, with the reason.
 *
 * **Joining.** SAP expands an `INCLUDE` statement by putting the include's text
 * where the statement stands, and so does this: the statement stays, turned
 * into a comment, and the include's text follows between two marker comments
 * that name the file it came from. Declarations in a TOP include therefore
 * stand before their use, as they do in the system. An include the program
 * names and nobody uploaded is left exactly as written, and the engine reports
 * it as a check task — "Not determined", never guessed at. A single file is
 * stored byte for byte as it was read, so its line numbers are the file's own.
 */

import { looksLikeAbap } from './abap-input-check';
import { scanCodeContent } from './staged-code-scan';
import { extractDataCoupling } from './abap/code-assessment';
import { readStatements } from './abap/statement-reader';

/** `MAX_ANALYSED_SOURCE_BYTES` in `app/api/runs/create/route.ts`. */
export const OWN_CODE_MAX_SOURCE_BYTES = 256 * 1024;

/** One source file read in full. A program is far below this; a dump is not. */
export const OWN_CODE_MAX_FILE_BYTES = 1024 * 1024;

/** What a ZIP may cost the browser that opens it. */
export const OWN_CODE_ZIP_LIMITS = {
  archiveBytes: 5 * 1024 * 1024,
  entries: 200,
  entryBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
} as const;

export const OWN_CODE_SOURCE_EXTENSIONS = ['.abap', '.txt'] as const;

export type OwnCodeRole = 'program' | 'function-group' | 'class' | 'interface' | 'include';

/** One ABAP source read out of an uploaded file or out of a ZIP entry. */
export interface OwnCodeSource {
  /** The object the text defines, upper-cased: header statement, else the file name. */
  object: string;
  /** File name, or the entry's path inside the ZIP. */
  file: string;
  role: OwnCodeRole;
  text: string;
  lines: number;
  bytes: number;
  /** `windows-1252` when the bytes were not UTF-8 and were read as the SAP GUI download default. */
  encoding: 'utf-8' | 'windows-1252';
}

/** What a check found. Every kind has its sentence in `lib/messages/own-code.ts`. */
export type OwnCodeIssue =
  | { kind: 'not-source' }
  | { kind: 'too-large'; bytes: number; limit: number }
  | { kind: 'binary' }
  | { kind: 'not-abap' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'encoding'; encoding: 'windows-1252' }
  | { kind: 'duplicate-same'; object: string; keptFrom: string }
  | { kind: 'duplicate-different'; object: string; other: string }
  | { kind: 'zip-unreadable' }
  | { kind: 'zip-limit' }
  | { kind: 'zip-empty' }
  | { kind: 'zip-skipped'; names: readonly string[] }
  | { kind: 'second-program'; object: string; main: string }
  | { kind: 'not-referenced'; object: string }
  | { kind: 'missing-includes'; names: readonly string[] }
  /** The includes form a loop — `chain` starts and ends with the same name. */
  | { kind: 'include-cycle'; chain: readonly string[] }
  /** One include is named more than once; `lines` are lines of this file. */
  | { kind: 'include-repeated'; name: string; lines: readonly number[] };

export type OwnCodeState = 'ok' | 'warning' | 'error';

/** One row of the list: one uploaded file (a ZIP is one row), with its checks. */
export interface OwnCodeFile {
  id: string;
  name: string;
  bytes: number;
  zip: boolean;
  /** The sources this file contributes. Empty when it was refused. */
  sources: OwnCodeSource[];
  /** Found while reading the file itself. */
  issues: OwnCodeIssue[];
}

/** A row after the files have been compared with each other. */
export interface OwnCodeRow extends OwnCodeFile {
  state: OwnCodeState;
  /** Sources of this row that go into the project. */
  used: OwnCodeSource[];
  issues: OwnCodeIssue[];
}

/** What the analysis will read, counted before the run. */
export interface OwnCodeCounts {
  lines: number;
  /** FORM, METHOD, FUNCTION and MODULE bodies, counted by their END statement. */
  routines: number;
  /** Database tables the code reads rows from. */
  tablesRead: string[];
  /** Database tables the code writes rows to. */
  tablesWritten: string[];
}

export interface OwnCodeAssembly {
  rows: OwnCodeRow[];
  /** The source a project would hold — `''` while nothing usable is staged. */
  source: string;
  bytes: number;
  main: OwnCodeSource | null;
  /** Every source that went in, main first. */
  objects: string[];
  /** Includes the code names and nobody uploaded — "Not determined". */
  missing: string[];
  tooLarge: boolean;
  /** The joined text itself fails the payload scan (two halves of a pattern across files). */
  blocked: string | null;
  /** Rows that keep the start button disabled. */
  attention: OwnCodeRow[];
  counts: OwnCodeCounts | null;
}

/* --------------------------------------------------------- reading one file */

function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot).toLowerCase();
}

export function isSourceName(name: string): boolean {
  return (OWN_CODE_SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function isZipName(name: string): boolean {
  return extensionOf(name) === '.zip';
}

function baseObjectName(file: string): string {
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  return (dot < 0 ? base : base.slice(0, dot)).toUpperCase();
}

/**
 * Bytes to text. UTF-8 first, strictly; a file SAP GUI downloaded in the
 * Windows code page is not UTF-8 and is read as that instead, and the row says
 * so. A NUL byte is not text at all.
 */
export function decodeSource(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } | null {
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

const HEADER: { role: OwnCodeRole; rx: RegExp }[] = [
  { role: 'function-group', rx: /^\s*FUNCTION-POOL\s+([\w/]+)/im },
  { role: 'program', rx: /^\s*(?:REPORT|PROGRAM)\s+([\w/]+)/im },
  { role: 'class', rx: /^\s*CLASS\s+([\w/]+)\s+DEFINITION\b/im },
  { role: 'interface', rx: /^\s*INTERFACE\s+([\w/]+)\s+PUBLIC\b/im },
];

/** What a source is, read from its first header statement; an include has none. */
export function classifySource(text: string, file: string): { object: string; role: OwnCodeRole } {
  for (const { role, rx } of HEADER) {
    const name = rx.exec(text)?.[1];
    if (name) return { object: name.toUpperCase(), role };
  }
  return { object: baseObjectName(file), role: 'include' };
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.replace(/\r?\n$/, '').split(/\r?\n/).length;
}

/**
 * Read one ABAP source from bytes. `issues` holds what refuses it (then
 * `source` is null) or what the reader should know (encoding).
 */
export function readSourceBytes(file: string, bytes: Uint8Array): { source: OwnCodeSource | null; issues: OwnCodeIssue[] } {
  if (bytes.length > OWN_CODE_MAX_FILE_BYTES) {
    return { source: null, issues: [{ kind: 'too-large', bytes: bytes.length, limit: OWN_CODE_MAX_FILE_BYTES }] };
  }
  const decoded = decodeSource(bytes);
  if (!decoded) return { source: null, issues: [{ kind: 'binary' }] };
  const { text, encoding } = decoded;
  if (!looksLikeAbap(text)) return { source: null, issues: [{ kind: 'not-abap' }] };
  const blocked = scanCodeContent(text);
  if (blocked) return { source: null, issues: [{ kind: 'blocked', reason: blocked }] };
  const { object, role } = classifySource(text, file);
  const issues: OwnCodeIssue[] = encoding === 'windows-1252' ? [{ kind: 'encoding', encoding }] : [];
  return {
    source: {
      object,
      file,
      role,
      text,
      lines: lineCount(text),
      bytes: new TextEncoder().encode(text).length,
      encoding,
    },
    issues,
  };
}

/* ------------------------------------------------------------- the includes */

/**
 * An `INCLUDE` statement that stands alone on its line — the form SAP writes
 * and the only one replaced. `INCLUDE STRUCTURE` and `INCLUDE TYPE` are
 * dictionary statements, not program includes.
 */
const INCLUDE_LINE = /^(\s*)INCLUDE\s+(?!STRUCTURE\b|TYPE\b)([\w/]+)(\s+IF\s+FOUND)?\s*\.\s*(?:".*)?$/i;

function isCommentLine(line: string): boolean {
  return line.startsWith('*') || /^\s*"/.test(line);
}

/** The includes a source names, upper-cased, in order, once each. */
export function includesNamed(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (isCommentLine(line)) continue;
    const name = INCLUDE_LINE.exec(line)?.[2]?.toUpperCase();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export const INCLUDE_OPEN_MARK = '*>>> Clean-Core.io: include';
export const INCLUDE_CLOSE_MARK = '*<<< Clean-Core.io: end of include';

function newlineOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * The main source with every include it names — and every include those name —
 * put in place. Returns the text, the objects that went in and the includes
 * nobody uploaded.
 */
export function expandIncludes(
  main: OwnCodeSource,
  byName: ReadonlyMap<string, OwnCodeSource>,
): { text: string; used: string[]; missing: string[]; repeated: { in: string; name: string; line: number }[] } {
  const used: string[] = [main.object];
  const repeated: { in: string; name: string; line: number }[] = [];
  const missing: string[] = [];
  const nl = newlineOf(main.text);

  const expand = (source: OwnCodeSource, stack: string[]): string => {
    const lines = source.text.replace(/\r?\n$/, '').split(/\r?\n/);
    const out: string[] = [];
    lines.forEach((line, index) => {
      const match = isCommentLine(line) ? null : INCLUDE_LINE.exec(line);
      const name = match?.[2]?.toUpperCase();
      const include = name ? byName.get(name) : undefined;
      // A second INCLUDE of a text already put in place, which is also how a
      // loop shows up from inside. Left as written and reported: the caller
      // refuses the assembly, see `assembleOwnCode`.
      if (name && include && (stack.includes(name) || used.includes(name))) {
        repeated.push({ in: source.object, name, line: index + 1 });
      }
      if (!name || !include || stack.includes(name) || used.includes(name)) {
        if (name && !include && !missing.includes(name)) missing.push(name);
        out.push(line);
        return;
      }
      used.push(name);
      out.push(`*${line}`);
      out.push(`${INCLUDE_OPEN_MARK} ${name} · ${include.file}`);
      out.push(expand(include, [...stack, name]));
      out.push(`${INCLUDE_CLOSE_MARK} ${name}`);
    });
    return out.join(nl);
  };

  return { text: expand(main, [main.object]), used, missing, repeated };
}

/**
 * Every loop among the uploaded sources' INCLUDE statements, each once, as a
 * chain that starts and ends with the same name (`A → B → A`). Looked for over
 * all sources, not only from the main program: a loop between two includes
 * nobody else names would otherwise slip through as "read after the program".
 */
export function includeCycles(byName: ReadonlyMap<string, OwnCodeSource>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string, path: string[]) => {
    if (path.includes(name)) {
      const chain = [...path.slice(path.indexOf(name)), name];
      const key = [...chain.slice(0, -1)].sort().join('>');
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(chain);
      }
      return;
    }
    if (done.has(name)) return;
    const source = byName.get(name);
    if (!source) return;
    for (const next of includesNamed(source.text)) visit(next, [...path, name]);
    done.add(name);
  };
  for (const name of byName.keys()) visit(name, []);
  return cycles;
}

/* ------------------------------------------------------------ all the files */

function stateOf(issues: OwnCodeIssue[]): OwnCodeState {
  if (issues.some((i) => ERROR_KINDS.has(i.kind))) return 'error';
  if (issues.length > 0) return 'warning';
  return 'ok';
}

const ERROR_KINDS = new Set<OwnCodeIssue['kind']>([
  'not-source',
  'too-large',
  'binary',
  'not-abap',
  'blocked',
  'duplicate-different',
  'zip-unreadable',
  'zip-limit',
  'zip-empty',
  'second-program',
  'include-cycle',
  'include-repeated',
]);

export function issueIsError(issue: OwnCodeIssue): boolean {
  return ERROR_KINDS.has(issue.kind);
}

const MAIN_ROLES: readonly OwnCodeRole[] = ['program', 'function-group', 'class', 'interface'];

/** Count what the analysis will read — the engine's own readers, no model. */
export function countSource(source: string): OwnCodeCounts {
  let routines = 0;
  for (const statement of readStatements(source)) {
    if (['ENDFORM', 'ENDMETHOD', 'ENDFUNCTION', 'ENDMODULE'].includes(statement.keyword)) routines++;
  }
  const tablesRead: string[] = [];
  const tablesWritten: string[] = [];
  for (const entry of extractDataCoupling(source)) {
    if ((entry as { possibleTargetOf?: unknown }).possibleTargetOf) continue;
    if (entry.accessType === 'Read' || entry.accessType === 'Read/Write') tablesRead.push(entry.tableName);
    if (entry.accessType === 'Write' || entry.accessType === 'Read/Write') tablesWritten.push(entry.tableName);
  }
  return {
    lines: lineCount(source),
    routines,
    tablesRead: tablesRead.sort(),
    tablesWritten: tablesWritten.sort(),
  };
}

/**
 * Compare the files with each other and join them. The order of `files` is the
 * order they were added: of two copies of one object the first is kept.
 */
export function assembleOwnCode(files: readonly OwnCodeFile[]): OwnCodeAssembly {
  const rows: OwnCodeRow[] = files.map((f) => ({ ...f, issues: [...f.issues], used: [], state: 'ok' }));

  // One copy per object.
  const byName = new Map<string, OwnCodeSource>();
  const ownerOf = new Map<string, OwnCodeRow>();
  for (const row of rows) {
    for (const source of row.sources) {
      const kept = byName.get(source.object);
      if (!kept) {
        byName.set(source.object, source);
        ownerOf.set(source.object, row);
        row.used.push(source);
        continue;
      }
      const keptFrom = ownerOf.get(source.object)?.name ?? kept.file;
      if (kept.text.replace(/\r\n/g, '\n').trimEnd() === source.text.replace(/\r\n/g, '\n').trimEnd()) {
        row.issues.push({ kind: 'duplicate-same', object: source.object, keptFrom });
      } else {
        row.issues.push({ kind: 'duplicate-different', object: source.object, other: keptFrom });
      }
    }
  }

  // The main source: a program (or class, function group) nobody includes.
  const named = new Set<string>();
  for (const source of byName.values()) for (const n of includesNamed(source.text)) named.add(n);
  const all = [...byName.values()];
  const roots = all.filter((s) => !named.has(s.object));
  const headed = roots.filter((s) => MAIN_ROLES.includes(s.role));
  const main = headed[0] ?? roots[0] ?? all[0] ?? null;

  for (const extra of headed.slice(1)) {
    const row = ownerOf.get(extra.object);
    if (row && main) {
      row.issues.push({ kind: 'second-program', object: extra.object, main: main.object });
      row.used = row.used.filter((s) => s !== extra);
    }
  }

  let source = '';
  let missing: string[] = [];
  const objects: string[] = [];
  if (main) {
    const expanded = expandIncludes(main, byName);
    missing = expanded.missing;
    // Loops and repeats stop the start rather than being resolved quietly.
    // SAP does not activate a program whose includes loop, and an include
    // named twice puts its FORMs and DATA in twice — a program the system
    // would not activate either. Reading each text once would analyse a
    // program that does not exist; leaving the second statement in would let
    // the engine report a text that *was* uploaded as "not read". So the file
    // that carries the statement is named, with its line, and the reader
    // decides which INCLUDE goes.
    const cycles = includeCycles(byName);
    for (const chain of cycles) {
      ownerOf.get(chain[0])?.issues.push({ kind: 'include-cycle', chain });
    }
    const inCycle = new Set(cycles.flatMap((c) => c.slice(0, -1)));
    const repeats = new Map<string, number[]>();
    for (const r of expanded.repeated) {
      if (inCycle.has(r.name) && inCycle.has(r.in)) continue;
      const key = `${r.in}|${r.name}`;
      repeats.set(key, [...(repeats.get(key) ?? []), r.line]);
    }
    for (const [key, lines] of repeats) {
      const [owner, name] = key.split('|');
      ownerOf.get(owner)?.issues.push({ kind: 'include-repeated', name, lines });
    }
    const parts = [expanded.text];
    objects.push(...expanded.used);
    // Sources nobody names are still read — after the program, marked, so
    // nothing the reader uploaded disappears without a word.
    const nl = newlineOf(main.text);
    for (const s of all) {
      if (objects.includes(s.object) || headed.slice(1).includes(s)) continue;
      const row = ownerOf.get(s.object);
      row?.issues.push({ kind: 'not-referenced', object: s.object });
      objects.push(s.object);
      parts.push([`${INCLUDE_OPEN_MARK} ${s.object} · ${s.file}`, s.text.replace(/\r?\n$/, ''), `${INCLUDE_CLOSE_MARK} ${s.object}`].join(nl));
    }
    // A single source, untouched: its lines are the file's lines.
    source = parts.length === 1 && expanded.used.length === 1 ? main.text : parts.join(nl);
    if (missing.length > 0) {
      const row = ownerOf.get(main.object);
      row?.issues.push({ kind: 'missing-includes', names: missing });
    }
  }

  for (const row of rows) row.state = stateOf(row.issues);
  const bytes = source ? new TextEncoder().encode(source).length : 0;
  const tooLarge = bytes > OWN_CODE_MAX_SOURCE_BYTES;
  const blocked = source ? scanCodeContent(source) : null;
  const attention = rows.filter((r) => r.state === 'error');

  return {
    rows,
    source,
    bytes,
    main,
    objects,
    missing,
    tooLarge,
    blocked,
    attention,
    counts: source && !tooLarge ? countSource(source) : null,
  };
}

/** Whether the assembly may become a project. */
export function assemblyReady(a: OwnCodeAssembly): boolean {
  return a.source !== '' && !a.tooLarge && a.blocked === null && a.attention.length === 0;
}
