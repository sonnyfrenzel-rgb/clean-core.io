/**
 * A program and its includes, read as the one source a project analyses — and
 * every line of that source traced back to the file it came from.
 *
 * **What "the source" is for a project of several files.** SAP expands an
 * `INCLUDE` statement by putting the include's text where the statement
 * stands, and so does this: the statement stays, turned into a comment, and
 * the include's text follows between two marker comments that name the
 * include and the file it came from. Includes that name further includes are
 * expanded the same way, depth first. Sources nobody names are read after the
 * program, between the same markers. The result — markers included — is the
 * text a project stores (`legacyCode`), the text every engine reads and the
 * text a signed run digests (`inputFingerprint.sha256`). Nothing about the
 * files is stored beside it, because nothing needs to be: the markers are part
 * of the signed text, so the way back from a line to its file is bound by the
 * same digest as the code itself (`readIncludeAnchors`).
 *
 * **A single file is not touched.** One source with nothing put in place is
 * returned byte for byte as it was read, so its line numbers are the file's
 * own and its digest is the digest it always had.
 *
 * **What is never guessed.** An include the code names and nobody uploaded is
 * left exactly as written; the engine then reports it as "Include whose source
 * was not uploaded" (`coverage.ts`, gap `include-not-read`) and the workspace
 * as the open question "Add the includes" (`lib/open-questions.ts`). An include
 * named twice, or includes that loop, are reported rather than read once
 * quietly: SAP activates neither, so reading them would analyse a program that
 * does not exist.
 *
 * Pure — no imports, no I/O — so the own-code upload (`lib/own-code-import.ts`),
 * a batch upload and the specs all run the same join.
 */

/* ------------------------------------------------------------ the markers */

export const INCLUDE_OPEN_MARK = '*>>> Clean-Core.io: include';
export const INCLUDE_CLOSE_MARK = '*<<< Clean-Core.io: end of include';

/* ------------------------------------------------------- naming a source */

export type IncludeSourceRole = 'program' | 'function-group' | 'class' | 'interface' | 'include';

/** One ABAP source with the object it defines. */
export interface IncludeSource {
  /** The object the text defines, upper-cased. */
  object: string;
  /** File name, or the entry's path inside a ZIP. */
  file: string;
  role: IncludeSourceRole;
  text: string;
}

/** `#ns#name` is how abapGit writes the namespace `/NS/` into a file name. */
function withNamespace(name: string): string {
  return name.replace(/^#([^#]+)#/, '/$1/').toUpperCase();
}

/**
 * The abapGit file name of a source — `zfoo.prog.abap`, `zfoo.fugr.lzfootop.abap`,
 * `zcl_x.clas.locals_imp.abap`, `#ns#foo.prog.abap` — split into its parts, or
 * null for any other name.
 */
export function abapGitNameOf(file: string): { name: string; type: string; part: string | null } | null {
  const base = file.split('/').pop() ?? file;
  const m = /^([^.]+)\.(prog|fugr|clas|intf)(?:\.([^.]+))?\.abap$/i.exec(base);
  if (!m) return null;
  return { name: m[1], type: m[2].toLowerCase(), part: m[3] ?? null };
}

/**
 * The object a file stands for when its text has no header that names one.
 *
 * An abapGit export names the object in the file: `zfoo_top.prog.abap` is the
 * include `ZFOO_TOP`, `zfoo.fugr.lzfootop.abap` the include `LZFOOTOP` of the
 * function group `ZFOO`, `#ns#foo_f01.prog.abap` the include `/NS/FOO_F01`.
 * Read as a plain file name, the first was `ZFOO_TOP.PROG` — a name no
 * `INCLUDE` statement ever names, so every include of an abapGit export was
 * reported as not uploaded. A class's local parts (`zcl_x.clas.locals_imp.abap`)
 * are named `ZCL_X.LOCALS_IMP`: no statement includes them, and they are not a
 * second program either.
 */
export function objectNameOfFile(file: string): string {
  const abapGit = abapGitNameOf(file);
  if (abapGit) {
    if (abapGit.type === 'fugr' && abapGit.part) return withNamespace(abapGit.part);
    if (abapGit.part) return `${withNamespace(abapGit.name)}.${abapGit.part.toUpperCase()}`;
    return withNamespace(abapGit.name);
  }
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  return (dot < 0 ? base : base.slice(0, dot)).toUpperCase();
}

const HEADER: { role: IncludeSourceRole; rx: RegExp }[] = [
  { role: 'function-group', rx: /^\s*FUNCTION-POOL\s+([\w/]+)/im },
  { role: 'program', rx: /^\s*(?:REPORT|PROGRAM)\s+([\w/]+)/im },
  { role: 'class', rx: /^\s*CLASS\s+([\w/]+)\s+DEFINITION\b/im },
  { role: 'interface', rx: /^\s*INTERFACE\s+([\w/]+)\s+PUBLIC\b/im },
];

/**
 * What a source is, read from its first header statement; an include has none.
 *
 * An abapGit file names its object, and that name wins over the header: the
 * TOP include of a function group carries `FUNCTION-POOL zfoo.`, yet the main
 * program includes it as `LZFOOTOP`, not as `ZFOO`. A class's local parts are
 * includes whatever classes they define.
 */
export function classifySource(text: string, file: string): { object: string; role: IncludeSourceRole } {
  const abapGit = abapGitNameOf(file);
  if (abapGit && abapGit.part && (abapGit.type === 'clas' || abapGit.type === 'intf')) {
    return { object: objectNameOfFile(file), role: 'include' };
  }
  for (const { role, rx } of HEADER) {
    const name = rx.exec(text)?.[1];
    if (name) return { object: abapGit ? objectNameOfFile(file) : name.toUpperCase(), role };
  }
  return { object: objectNameOfFile(file), role: 'include' };
}

/* ---------------------------------------------------- the INCLUDE statement */

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

function newlineOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/* ------------------------------------------------------------ the join */

/**
 * The main source with every include it names — and every include those name —
 * put in place. Returns the text, the objects that went in and the includes
 * nobody uploaded.
 */
export function expandIncludeSources(
  main: IncludeSource,
  byName: ReadonlyMap<string, IncludeSource>,
): { text: string; used: string[]; missing: string[]; repeated: { in: string; name: string; line: number }[] } {
  const used: string[] = [main.object];
  const repeated: { in: string; name: string; line: number }[] = [];
  const missing: string[] = [];
  const nl = newlineOf(main.text);

  const expand = (source: IncludeSource, stack: string[]): string => {
    const lines = source.text.replace(/\r?\n$/, '').split(/\r?\n/);
    const out: string[] = [];
    lines.forEach((line, index) => {
      const match = isCommentLine(line) ? null : INCLUDE_LINE.exec(line);
      const name = match?.[2]?.toUpperCase();
      const include = name ? byName.get(name) : undefined;
      // A second INCLUDE of a text already put in place, which is also how a
      // loop shows up from inside. Left as written and reported: the caller
      // refuses the join.
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
 * Every loop among the sources' INCLUDE statements, each once, as a chain that
 * starts and ends with the same name (`A → B → A`). Looked for over all
 * sources, not only from the main program: a loop between two includes nobody
 * else names would otherwise slip through as "read after the program".
 */
export function includeCycles(byName: ReadonlyMap<string, IncludeSource>): string[][] {
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
  // In name order, not upload order: the cycle is reported on the source it
  // starts from, and that must not depend on which file came first.
  for (const name of [...byName.keys()].sort()) visit(name, []);
  return cycles;
}

/**
 * The join itself: the main source with its includes in place, then every
 * source in `rest` nobody named, each between markers. One source with nothing
 * put in place comes back byte for byte.
 */
export function joinIncludeSources(
  main: IncludeSource,
  byName: ReadonlyMap<string, IncludeSource>,
  rest: readonly IncludeSource[],
): {
  source: string;
  used: string[];
  missing: string[];
  repeated: { in: string; name: string; line: number }[];
  unreferenced: string[];
} {
  const expanded = expandIncludeSources(main, byName);
  const parts = [expanded.text];
  const used = [...expanded.used];
  const unreferenced: string[] = [];
  const nl = newlineOf(main.text);
  for (const s of rest) {
    if (s === main || used.includes(s.object)) continue;
    used.push(s.object);
    unreferenced.push(s.object);
    parts.push([`${INCLUDE_OPEN_MARK} ${s.object} · ${s.file}`, s.text.replace(/\r?\n$/, ''), `${INCLUDE_CLOSE_MARK} ${s.object}`].join(nl));
  }
  const source = parts.length === 1 && expanded.used.length === 1 ? main.text : parts.join(nl);
  return { source, used, missing: expanded.missing, repeated: expanded.repeated, unreferenced };
}

/* ------------------------------------------------- one call for a batch */

const MAIN_ROLES: readonly IncludeSourceRole[] = ['program', 'function-group', 'class', 'interface'];

export interface ResolvedIncludes {
  /** The source a project of these files analyses; `''` when no file was given. */
  source: string;
  /** The main source, or null when there was none. */
  main: IncludeSource | null;
  /** Every object that went into `source`, main first. */
  used: string[];
  /** Includes the code names and no file holds — the analysis reports each as not read. */
  missing: string[];
  /** Sources nobody names, read after the program. */
  unreferenced: string[];
  /** Further programs among the files: one project analyses one program, so these were left out. */
  otherPrograms: string[];
  /** Two files that define one object; the first was read. */
  duplicates: { object: string; file: string; keptFrom: string }[];
  /** Includes that loop; SAP activates no such program. */
  cycles: string[][];
  /** An include named a second time, by the source and line that names it again. */
  repeated: { in: string; name: string; line: number }[];
  /** False when a loop or a repeated include makes the join a program SAP would not activate. */
  activatable: boolean;
  /** Every line of `source` traced back to its file (`readIncludeAnchors(source)`). */
  anchors: IncludeAnchorMap;
}

/**
 * A program and its includes from a set of files — file name → text — as the
 * one source a project analyses. `main` names the main source by file name or
 * object; without it, the first program (or class, or function group) nobody
 * includes is the main source, as in the own-code upload. Pure.
 */
export function resolveIncludes(
  files: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  main?: string,
): ResolvedIncludes {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files as Record<string, string>);
  const byName = new Map<string, IncludeSource>();
  const duplicates: ResolvedIncludes['duplicates'] = [];
  for (const [file, text] of entries) {
    const { object, role } = classifySource(text, file);
    const kept = byName.get(object);
    if (kept) {
      duplicates.push({ object, file, keptFrom: kept.file });
      continue;
    }
    byName.set(object, { object, file, role, text });
  }
  const all = [...byName.values()];
  const wanted = main?.trim();
  const named = new Set<string>();
  for (const s of all) for (const n of includesNamed(s.text)) named.add(n);
  const roots = all.filter((s) => !named.has(s.object));
  const headed = roots.filter((s) => MAIN_ROLES.includes(s.role));
  const chosen = wanted
    ? (all.find((s) => s.file === wanted) ?? byName.get(wanted.toUpperCase()) ?? null)
    : (headed[0] ?? roots[0] ?? all[0] ?? null);
  if (!chosen) {
    return {
      source: '', main: null, used: [], missing: [], unreferenced: [], otherPrograms: [],
      duplicates, cycles: [], repeated: [], activatable: true, anchors: readIncludeAnchors(''),
    };
  }
  const otherPrograms = headed.filter((s) => s !== chosen).map((s) => s.object);
  const rest = all.filter((s) => !otherPrograms.includes(s.object));
  const joined = joinIncludeSources(chosen, byName, rest);
  const cycles = includeCycles(byName);
  return {
    source: joined.source,
    main: chosen,
    used: joined.used,
    missing: joined.missing,
    unreferenced: joined.unreferenced,
    otherPrograms,
    duplicates,
    cycles,
    repeated: joined.repeated,
    activatable: cycles.length === 0 && joined.repeated.length === 0,
    anchors: readIncludeAnchors(joined.source),
  };
}

/* ------------------------------------------------- the way back to a file */

/** Where one line of the analysed source stands in the files it was joined from. */
export interface SourceLocation {
  /** The include, or null for the main program (whose name the project carries). */
  object: string | null;
  /** The include's file as uploaded, or null for the main program. */
  file: string | null;
  /** 1-based line in that file; 0 for a marker line, which stands in no file. */
  line: number;
  /** True for a marker line this product wrote. */
  marker: boolean;
}

/** One part of a joined source: the main program, or one include between its markers. */
export interface IncludePart {
  object: string | null;
  file: string | null;
  /** First and last line of the analysed source this part's own lines stand on (markers excluded). */
  lineStart: number;
  lineEnd: number;
  /** How many lines of its file it holds. */
  lines: number;
}

export interface IncludeAnchorMap {
  /** True when the source was joined from several files; false for a single file. */
  joined: boolean;
  /** The main program first, then every include in the order it opens. */
  parts: IncludePart[];
  /** `at[n - 1]` is where line `n` of the analysed source stands. Empty when not joined. */
  at: SourceLocation[];
}

const OPEN_LINE = /^\*>>> Clean-Core\.io: include ([\w/.]+) · (.*)$/;
const CLOSE_LINE = /^\*<<< Clean-Core\.io: end of include ([\w/.]+)$/;

/**
 * Every line of an analysed source traced back to the file it came from — read
 * off the markers the join wrote, so it needs nothing but the signed text.
 *
 * A source without markers, or with markers that do not pair up (a text edited
 * by hand), is read as one file: every line is its own line, which is what a
 * single upload has always been. Nothing is guessed from a half-matching map.
 */
export function readIncludeAnchors(source: string): IncludeAnchorMap {
  const single: IncludeAnchorMap = { joined: false, parts: [], at: [] };
  if (!source.includes(INCLUDE_OPEN_MARK)) return single;
  const lines = source.split(/\r?\n/);
  const parts: IncludePart[] = [{ object: null, file: null, lineStart: 0, lineEnd: 0, lines: 0 }];
  const stack: number[] = [0];
  const at: SourceLocation[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const n = i + 1;
    const open = OPEN_LINE.exec(lines[i]);
    if (open) {
      parts.push({ object: open[1], file: open[2], lineStart: 0, lineEnd: 0, lines: 0 });
      stack.push(parts.length - 1);
      at.push({ object: open[1], file: open[2], line: 0, marker: true });
      continue;
    }
    const close = CLOSE_LINE.exec(lines[i]);
    if (close) {
      const top = stack.pop();
      if (top === undefined || top === 0 || parts[top].object !== close[1]) return single;
      at.push({ object: parts[top].object, file: parts[top].file, line: 0, marker: true });
      continue;
    }
    const part = parts[stack[stack.length - 1]];
    part.lines += 1;
    if (part.lineStart === 0) part.lineStart = n;
    part.lineEnd = n;
    at.push({ object: part.object, file: part.file, line: part.lines, marker: false });
  }
  if (stack.length !== 1 || parts.length === 1) return single;
  return { joined: true, parts, at };
}

/** Where line `line` of the analysed source stands; null for a single file or a line outside the source. */
export function locateSourceLine(map: IncludeAnchorMap, line: number): SourceLocation | null {
  if (!map.joined || !Number.isInteger(line) || line < 1 || line > map.at.length) return null;
  return map.at[line - 1];
}

/**
 * The line of the analysed source that holds line `line` of `object` — the
 * other direction, for a result another tool reports against the include it
 * read (an ATC finding, say). `object` null or the main program's name means
 * the main program. Null when that object is not part of the source or the
 * line is beyond its end.
 */
export function joinedLineOf(map: IncludeAnchorMap, object: string | null, line: number, mainObject?: string | null): number | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const wanted = object?.toUpperCase() ?? null;
  const isMain = wanted === null || (mainObject != null && wanted === mainObject.toUpperCase());
  if (!map.joined) return isMain ? line : null;
  for (let i = 0; i < map.at.length; i += 1) {
    const here = map.at[i];
    if (here.marker || here.line !== line) continue;
    if (isMain ? here.object === null : here.object === wanted) return i + 1;
  }
  return null;
}
