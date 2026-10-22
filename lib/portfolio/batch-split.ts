/**
 * One upload, many programs — the batch half of roadmap 3.0.21 (1).
 *
 * "One upload (ZIP, abapGit export or several files) becomes one project per
 * program." The single-project import (`lib/own-code-import.ts`) joins
 * everything dropped into **one** source and refuses a second program; this
 * module does the opposite cut and then hands each program to that very
 * module, so a program in a batch is joined, checked and counted exactly as
 * the same program uploaded on its own would be — same include expansion, same
 * markers, same limits, same refusals.
 *
 * **Where the cut is made.**
 *
 *   - **An abapGit object of type CLAS, INTF or FUGR is one program**: every
 *     file of `zcl_x.clas.*.abap` (the class, its local implementations, its
 *     test classes), every file of `zfg.fugr.*.abap` (the `SAPL…` main program,
 *     its includes, its function modules). The object's main file leads; the
 *     others are read after it, marked, as the single import reads a file the
 *     program does not include.
 *   - **Everything else — plain `.abap`/`.txt` files and abapGit PROG files —
 *     is cut along the INCLUDE statements**: a source no other uploaded source
 *     includes starts a program, and every include it names (and those name)
 *     goes into it. An include two programs share goes into both, because SAP
 *     expands it into both. An abapGit PROG file is named after its object
 *     (`zrep_top.prog.abap` is `ZREP_TOP`), so `INCLUDE zrep_top.` finds it.
 *
 * Nothing is guessed: an include a program names and nobody uploaded stays as
 * written and is counted as not read ("Not determined"); an include loop or a
 * repeated include makes that program not ready, with the reason, while the
 * other programs of the upload go ahead.
 *
 * Pure apart from `TextEncoder`/`TextDecoder` (through `own-code-import.ts`),
 * so it runs in the browser — where the upload is read — and in the specs.
 */

import {
  assembleOwnCode,
  assemblyReady,
  includesNamed,
  issueIsError,
  OWN_CODE_MAX_SOURCE_BYTES,
  type OwnCodeFile,
  type OwnCodeIssue,
  type OwnCodeSource,
} from '../own-code-import';
import { countSourceLines } from '../source-lines';
import { PORTFOLIO_BATCH_MAX_PROGRAMS } from './limits';

/** One program of the upload, ready to become one project. */
export interface BatchProgram {
  /** The project name: the program's main object, upper-cased. */
  name: string;
  /** The main file's own name, without its folder — the run records it. */
  fileName: string;
  /** The joined source the project will hold. */
  source: string;
  bytes: number;
  lines: number;
  /** Every source that went in, main first. */
  objects: string[];
  /** Includes the program names and nobody uploaded — "Not determined". */
  missing: string[];
  /** What the checks found, errors first. */
  issues: OwnCodeIssue[];
  /** Whether it may become a project; `false` names its reason in `issues`. */
  ready: boolean;
}

/** A file of the upload that brought no source, with the reason. */
export interface BatchRefusedFile {
  name: string;
  issues: OwnCodeIssue[];
}

export interface BatchSplit {
  programs: BatchProgram[];
  refused: BatchRefusedFile[];
  /** Programs that may be queued, in name order, at most `PORTFOLIO_BATCH_MAX_PROGRAMS`. */
  ready: BatchProgram[];
  /** Ready programs beyond the batch limit — named, never dropped in silence. */
  overLimit: string[];
}

/* ------------------------------------------------------------- abapGit names */

type AbapGitType = 'prog' | 'clas' | 'intf' | 'fugr';

interface AbapGitName {
  type: AbapGitType;
  /** The object, upper-cased, `#` turned back into the namespace slash. */
  object: string;
  /** The part between type and extension (`locals_imp`, `lzfgtop`), upper-cased; `null` for the main file. */
  sub: string | null;
}

const ABAPGIT_FILE = /^([^.]+)\.(prog|clas|intf|fugr)(?:\.([^/]+?))?\.abap$/i;

/** What an abapGit file name says about its object — `null` for any other name. */
export function abapGitNameOf(file: string): AbapGitName | null {
  const base = file.split('/').pop() ?? file;
  const m = ABAPGIT_FILE.exec(base);
  if (!m) return null;
  return {
    type: m[2].toLowerCase() as AbapGitType,
    object: m[1].replace(/#/g, '/').toUpperCase(),
    sub: m[3] ? m[3].replace(/#/g, '/').toUpperCase() : null,
  };
}

function baseName(file: string): string {
  return file.split('/').pop() ?? file;
}

/* ------------------------------------------------------------------ helpers */

let synthetic = 0;

/** One source as the single import's row, so `assembleOwnCode` reads it as uploaded. */
function rowOf(source: OwnCodeSource): OwnCodeFile {
  synthetic += 1;
  return { id: `b${synthetic}`, name: source.file, bytes: source.bytes, zip: false, sources: [source], issues: [] };
}

function programOf(sources: OwnCodeSource[]): BatchProgram {
  const assembly = assembleOwnCode(sources.map(rowOf));
  const issues: OwnCodeIssue[] = assembly.rows.flatMap((r) => r.issues);
  if (assembly.tooLarge) issues.push({ kind: 'too-large', bytes: assembly.bytes, limit: OWN_CODE_MAX_SOURCE_BYTES });
  if (assembly.blocked) issues.push({ kind: 'blocked', reason: assembly.blocked });
  issues.sort((a, b) => Number(issueIsError(b)) - Number(issueIsError(a)));
  const main = assembly.main ?? sources[0];
  return {
    name: main.object,
    fileName: baseName(main.file),
    source: assembly.source,
    bytes: assembly.bytes,
    lines: assembly.source ? countSourceLines(assembly.source) : 0,
    objects: assembly.objects,
    missing: assembly.missing,
    issues,
    ready: assemblyReady(assembly),
  };
}

/* -------------------------------------------------------------------- split */

/**
 * Cut the read files into programs. `files` are the rows the single import's
 * readers produce (`readUploadedFile` — a ZIP is one row with many sources).
 */
export function splitIntoPrograms(files: readonly OwnCodeFile[]): BatchSplit {
  const refused: BatchRefusedFile[] = [];
  const groups = new Map<string, { type: AbapGitType; object: string; main: OwnCodeSource | null; rest: OwnCodeSource[] }>();
  const loose: OwnCodeSource[] = [];

  for (const file of files) {
    const errors = file.issues.filter(issueIsError);
    if (file.sources.length === 0) {
      refused.push({ name: file.name, issues: file.issues.length > 0 ? file.issues : [{ kind: 'zip-empty' }] });
      continue;
    }
    // A ZIP that was read in part keeps its notes (skipped entries, encoding)
    // on a row of its own, so nothing it held passes in silence.
    if (file.zip && file.issues.length > 0) refused.push({ name: file.name, issues: file.issues });
    else if (errors.length > 0) refused.push({ name: file.name, issues: errors });

    for (const source of file.sources) {
      const git = abapGitNameOf(source.file);
      if (!git || git.type === 'prog') {
        // An abapGit PROG file is one ABAP program or include, named after its
        // object; a header statement still wins for a main program.
        loose.push(git && source.role === 'include' ? { ...source, object: git.object } : source);
        continue;
      }
      const key = `${git.type}:${git.object}`;
      const group = groups.get(key) ?? { type: git.type, object: git.object, main: null, rest: [] };
      const isMain =
        git.type === 'fugr'
          ? git.sub !== null && git.sub === `SAPL${git.object.replace(/^\//, '').replace(/\//g, '')}`.toUpperCase()
          : git.sub === null;
      if (isMain && !group.main) {
        group.main = { ...source, object: git.object };
      } else {
        // Read after the main file, never as a second program: a class's local
        // implementation declares classes of its own, and a function group's
        // TOP include carries the FUNCTION-POOL statement.
        const object = git.type === 'fugr' ? git.sub ?? git.object : `${git.object}.${git.sub ?? 'MAIN'}`;
        group.rest.push({ ...source, object, role: 'include' });
      }
      groups.set(key, group);
    }
  }

  const programs: BatchProgram[] = [];
  const taken = new Set<string>();

  for (const group of groups.values()) {
    // A function group without its SAPL file: the file with the FUNCTION-POOL
    // statement leads, else the first one.
    let main = group.main;
    let rest = group.rest;
    if (!main) {
      const pool = rest.find((s) => /^\s*FUNCTION-POOL\s/im.test(s.text)) ?? rest[0];
      main = { ...pool, object: group.object };
      rest = rest.filter((s) => s !== pool);
    }
    const program = programOf([main, ...rest]);
    program.name = group.object;
    programs.push(program);
    taken.add(group.object);
  }

  // Loose sources: one copy per object, as the single import keeps it.
  const byName = new Map<string, OwnCodeSource>();
  const duplicates = new Map<string, OwnCodeIssue[]>();
  for (const source of loose) {
    const kept = byName.get(source.object);
    if (!kept) {
      byName.set(source.object, source);
      continue;
    }
    const same = kept.text.replace(/\r\n/g, '\n').trimEnd() === source.text.replace(/\r\n/g, '\n').trimEnd();
    const list = duplicates.get(source.object) ?? [];
    list.push(
      same
        ? { kind: 'duplicate-same', object: source.object, keptFrom: kept.file }
        : { kind: 'duplicate-different', object: source.object, other: kept.file },
    );
    duplicates.set(source.object, list);
  }

  const named = new Set<string>();
  for (const s of byName.values()) for (const n of includesNamed(s.text)) named.add(n);

  const closureOf = (root: OwnCodeSource): OwnCodeSource[] => {
    const out: OwnCodeSource[] = [root];
    const seen = new Set([root.object]);
    const walk = (s: OwnCodeSource) => {
      for (const n of includesNamed(s.text)) {
        const inc = byName.get(n);
        if (!inc || seen.has(n)) continue;
        seen.add(n);
        out.push(inc);
        walk(inc);
      }
    };
    walk(root);
    return out;
  };

  const roots = [...byName.values()].filter((s) => !named.has(s.object));
  // Sources only reachable through a loop have no root; each such loop is cut
  // at its first name in order, so the loop is reported rather than lost.
  const reached = new Set<string>();
  for (const root of roots) for (const s of closureOf(root)) reached.add(s.object);
  const orphans = [...byName.values()].filter((s) => !reached.has(s.object)).sort((a, b) => a.object.localeCompare(b.object, 'en'));
  for (const orphan of orphans) {
    if (reached.has(orphan.object)) continue;
    roots.push(orphan);
    for (const s of closureOf(orphan)) reached.add(s.object);
  }

  for (const root of roots) {
    const program = programOf(closureOf(root));
    const dup = duplicates.get(root.object);
    if (dup) {
      program.issues.push(...dup);
      if (dup.some(issueIsError)) program.ready = false;
    }
    if (taken.has(program.name)) {
      program.issues.unshift({ kind: 'duplicate-different', object: program.name, other: program.fileName });
      program.ready = false;
    }
    taken.add(program.name);
    programs.push(program);
  }

  programs.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const readyAll = programs.filter((p) => p.ready);
  return {
    programs,
    refused,
    ready: readyAll.slice(0, PORTFOLIO_BATCH_MAX_PROGRAMS),
    overLimit: readyAll.slice(PORTFOLIO_BATCH_MAX_PROGRAMS).map((p) => p.name),
  };
}
