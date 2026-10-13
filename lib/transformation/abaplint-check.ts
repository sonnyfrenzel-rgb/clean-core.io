/**
 * abaplint over a RAP package, on the server (roadmap 3.0.12, DSAG ABAP guide
 * review B5: record which checks actually ran).
 *
 * `@abaplint/core` parses the package's ABAP under ABAP Cloud syntax
 * (`abaplint-config.ts`) and the result is recorded as passed, failed or not
 * run — never a pass for what it did not read. What it reads and what it does
 * not, measured on @abaplint/core 2.120:
 *
 *   - ABAP source of classes and interfaces (`*.abap`): parsed under ABAP
 *     Cloud; a statement ABAP Cloud does not have is a parser error;
 *   - CDS data definitions (`*.ddls.asddls`): parsed by abaplint's CDS parser;
 *   - **not read**: tables in their source form (`*.tabl.astabl` — abaplint
 *     reads a table's XML only), behavior definitions (abaplint reads only the
 *     entity names, no grammar), access controls (`*.dcls.asdcls`), service
 *     definitions and bindings, job catalog entries and templates — abaplint
 *     knows these types but has no parser for their content. Each is listed
 *     as not run, with that reason;
 *   - **not run for any file**: the semantic syntax check (`check_syntax`). It
 *     needs the definitions of SAP's released objects, which are not here; run
 *     without them it reports every SAP class as unknown.
 *
 * The record says what ran. Server-only: `@abaplint/core` is large and is
 * imported only by the route that stores a generation.
 */

import * as abaplint from '@abaplint/core';
import { ABAPLINT_CONFIG } from './abaplint-config';

export type AbaplintState = 'passed' | 'failed' | 'not-run';

export interface AbaplintIssue {
  path: string;
  line: number;
  rule: string;
  message: string;
}

export interface AbaplintRecord {
  kind: 'abaplint';
  state: AbaplintState;
  /** The `@abaplint/core` version that ran, or null when it did not. */
  abaplint: string | null;
  syntax: 'Cloud';
  /** Files abaplint read and checked. */
  checked: number;
  /** Of those, files with at least one issue. */
  failedFiles: number;
  issueCount: number;
  /** The first issues, in path and line order. */
  issues: AbaplintIssue[];
  /** Files abaplint did not read, and why. */
  notRun: Array<{ path: string; reason: string }>;
  /** Checks that ran for no file, and why. */
  checksNotRun: Array<{ check: string; reason: string }>;
  /** Why nothing ran at all; null when something did. */
  reason: string | null;
}

/** At most this many issues are recorded; the count is complete. */
export const MAX_ABAPLINT_ISSUES = 40;

const READ: ReadonlyArray<[RegExp, string]> = [
  [/\.(?:clas|intf)(?:\.[a-z_]+)?\.abap$/i, 'ABAP'],
  [/\.ddls\.asddls$/i, 'CDS'],
];

const NOT_READ: ReadonlyArray<[RegExp, string]> = [
  [/\.tabl\.astabl$/i, 'abaplint reads a table from its XML form only, not from its source (.astabl)'],
  [/\.bdef\.asbdef$/i, 'abaplint reads only the entity names of a behavior definition; it has no parser for it'],
  [/\.dcls\.asdcls$/i, 'abaplint has no parser for access controls'],
  [/\.srvd\.[a-z]+$/i, 'abaplint has no parser for service definitions'],
  [/\.srvb\.[a-z]+$/i, 'abaplint has no parser for service bindings'],
  [/\.saj[ct]\.[a-z]+$/i, 'abaplint has no parser for job catalog entries and templates'],
];

export const CHECK_SYNTAX_NOT_RUN =
  "The semantic syntax check (abaplint check_syntax) did not run: it needs the definitions of SAP's released objects, which the check does not have.";

const versionOf = (): string | null => {
  try {
    const v = (abaplint.Registry as unknown as { abaplintVersion?: () => string }).abaplintVersion?.();
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
};

/**
 * abaplint over the package's files under `src/` (abapGit layout). A package
 * with no file abaplint reads is `not-run`; an exception inside abaplint is
 * `not-run` with its message — never a pass.
 */
export function abaplintPackageCheck(files: ReadonlyArray<{ path: string; content: string }>): AbaplintRecord {
  const base: AbaplintRecord = {
    kind: 'abaplint',
    state: 'not-run',
    abaplint: null,
    syntax: 'Cloud',
    checked: 0,
    failedFiles: 0,
    issueCount: 0,
    issues: [],
    notRun: [],
    checksNotRun: [{ check: 'check_syntax', reason: CHECK_SYNTAX_NOT_RUN }],
    reason: null,
  };
  const src = files.map((f) => ({ path: f.path.replace(/\\/g, '/').replace(/^\.?\//, ''), content: f.content })).filter((f) => f.path.startsWith('src/'));
  const read = src.filter((f) => READ.some(([re]) => re.test(f.path)));
  for (const f of src) {
    if (read.includes(f)) continue;
    const why = NOT_READ.find(([re]) => re.test(f.path));
    if (why) base.notRun.push({ path: f.path, reason: why[1] });
    else if (!/\.xml$/i.test(f.path)) base.notRun.push({ path: f.path, reason: 'not an object abaplint checks here' });
  }
  if (read.length === 0) {
    base.reason = src.length === 0 ? 'The package has no src/ folder: there was no ABAP object to check.' : 'No file of the package is one abaplint reads (ABAP classes and interfaces, CDS data definitions).';
    return base;
  }
  try {
    const registry = new abaplint.Registry(new abaplint.Config(JSON.stringify(ABAPLINT_CONFIG)));
    // Every src/ file is added, so the object-type rules see the whole package; only `read` counts as checked.
    for (const f of src) registry.addFile(new abaplint.MemoryFile(f.path.slice('src/'.length), f.content));
    registry.parse();
    const issues = registry
      .findIssues()
      .map((i) => ({ path: `src/${i.getFilename()}`, line: i.getStart().getRow(), rule: i.getKey(), message: i.getMessage() }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
    const failed = new Set(issues.map((i) => i.path));
    return {
      ...base,
      state: issues.length > 0 ? 'failed' : 'passed',
      abaplint: versionOf(),
      checked: read.length,
      failedFiles: [...failed].length,
      issueCount: issues.length,
      issues: issues.slice(0, MAX_ABAPLINT_ISSUES).map((i) => ({ ...i, message: i.message.slice(0, 300) })),
    };
  } catch (err) {
    return { ...base, reason: `abaplint stopped: ${err instanceof Error ? err.message.slice(0, 300) : 'unknown error'}` };
  }
}

/**
 * The check as the generation record lists checks (`{ kind, total, failed }`)
 * and checks not run (`{ kind, reason }`): `abaplint` is the parse under ABAP
 * Cloud syntax (total = files read, failed = files with an issue);
 * `abaplint-syntax` is the semantic check, which never runs here, and names the
 * files abaplint did not read.
 */
export function abaplintCheckEntries(r: AbaplintRecord): { checks: Array<{ kind: string; total: number; failed: number }>; notRun: Array<{ kind: string; reason: string }> } {
  const unread = r.notRun.length > 0 ? ` abaplint did not read ${r.notRun.length} file${r.notRun.length === 1 ? '' : 's'} (${[...new Set(r.notRun.map((n) => n.path.split('.').slice(-2).join('.')))].join(', ')}).` : '';
  const syntax = { kind: 'abaplint-syntax', reason: `${CHECK_SYNTAX_NOT_RUN}${unread}`.slice(0, 500) };
  if (r.state === 'not-run') return { checks: [], notRun: [{ kind: 'abaplint', reason: (r.reason ?? 'abaplint did not run.').slice(0, 500) }, syntax] };
  return { checks: [{ kind: 'abaplint', total: r.checked, failed: r.failedFiles }], notRun: [syntax] };
}

/**
 * The engine-led record's checks with the server's abaplint result in place
 * of anything the page sent under that kind: the page cannot report its own.
 */
export function withAbaplint<T extends { checks: Array<{ kind: string; total: number; failed: number }>; notRun: Array<{ kind: string; reason: string }> }>(engine: T, r: AbaplintRecord): T {
  const entries = abaplintCheckEntries(r);
  const ours = (kind: string) => kind === 'abaplint' || kind === 'abaplint-syntax';
  return {
    ...engine,
    checks: [...engine.checks.filter((c) => !ours(c.kind)), ...entries.checks],
    notRun: [...engine.notRun.filter((n) => !ours(n.kind)), ...entries.notRun],
  };
}
