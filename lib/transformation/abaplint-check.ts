/**
 * abaplint over a RAP package, on the server (roadmap 3.0.12, DSAG ABAP guide
 * review B5: record which checks actually ran; roadmap 3.0.13, item 1: the
 * activation check).
 *
 * `@abaplint/core` reads the package's ABAP with exactly the configuration the
 * package ships (`abaplint-config.ts`) and the result is recorded as passed,
 * failed or not run — never a pass for what it did not read. What it reads
 * and what it does not, measured on @abaplint/core 2.120:
 *
 *   - ABAP source of classes and interfaces (`*.abap`): parsed under ABAP
 *     Cloud (a statement ABAP Cloud does not have is a parser error), and
 *     since 3.0.13 checked semantically (`check_syntax`, `unknown_types`)
 *     with the SAP classes the package inherits from as declarations
 *     (`abap-sap-stubs.ts`); see `abap-check.ts` for how a reference to an SAP
 *     object the check cannot see is counted apart;
 *   - CDS data definitions (`*.ddls.asddls`): parsed by abaplint's CDS parser;
 *   - tables (`*.tabl.xml`, abapGit's form and the only one abaplint reads):
 *     the fields, the delivery class and size category (`xml_consistency`),
 *     the name within 16 characters (`allowed_object_naming`);
 *   - the metadata of every object (`*.<type>.xml`) is read with its object:
 *     a class's or interface's name and description (`xml_consistency`), every
 *     name's length (`allowed_object_naming`), one format per object (`aff_and_xml`);
 *   - **not read**: tables in a source form (`*.tabl.astabl`, written before
 *     scaffold version 3 — abapGit and abaplint read a table's XML only), behavior definitions (abaplint reads only the
 *     entity names, no grammar), access controls (`*.dcls.asdcls`), service
 *     definitions and bindings, job catalog entries and templates — abaplint
 *     knows these types but has no parser for their content. Each is listed
 *     as not run, with that reason.
 *
 * The record says what ran. Since 3.0.13 it carries `activation`
 * (`AbapActivation`): the parser and syntax errors in the package's own
 * objects — what makes a generation "complete" or "generated — not
 * activatable". A record from before has no `activation` and keeps its words.
 *
 * Server-only: `@abaplint/core` is large and is imported only by the routes
 * that check or store a generation.
 */

import { abapCheck } from './abap-check';
import { unresolvedSentence, type AbapActivation } from './check-words';

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
  /** The first issues, in path and line order (a reference to an SAP object the check cannot see is not one). */
  issues: AbaplintIssue[];
  /** Files abaplint did not read, and why. */
  notRun: Array<{ path: string; reason: string }>;
  /** Checks that ran for no file, and why. */
  checksNotRun: Array<{ check: string; reason: string }>;
  /** Why nothing ran at all; null when something did. */
  reason: string | null;
  /** The activation check (3.0.13): parser and syntax errors in the package's own objects. Absent on a record from before. */
  activation?: AbapActivation;
}

/** At most this many issues are recorded; the count is complete. */
export const MAX_ABAPLINT_ISSUES = 40;

const READ: ReadonlyArray<[RegExp, string]> = [
  [/\.(?:clas|intf)(?:\.[a-z_]+)?\.abap$/i, 'ABAP'],
  [/\.ddls\.asddls$/i, 'CDS'],
  [/\.tabl\.xml$/i, 'TABL'],
];

const NOT_READ: ReadonlyArray<[RegExp, string]> = [
  [/\.tabl\.astabl$/i, 'abaplint reads a table from its XML form only, not from its source (.astabl)'],
  [/\.bdef\.asbdef$/i, 'abaplint reads only the entity names of a behavior definition; it has no parser for it'],
  [/\.dcls\.asdcls$/i, 'abaplint has no parser for access controls'],
  [/\.srvd\.(?!xml$)[a-z]+$/i, 'abaplint has no parser for service definitions'],
  [/\.srvb\.[a-z]+$/i, 'abaplint has no parser for service bindings'],
  [/\.saj[ct]\.[a-z]+$/i, 'abaplint has no parser for job catalog entries and templates'],
];

/**
 * What a record from before 3.0.13 said about the semantic check, which did
 * not run then. Kept for those records' words; a record written since runs it.
 */
export const CHECK_SYNTAX_NOT_RUN =
  "The semantic syntax check (abaplint check_syntax) did not run: it needs the definitions of SAP's released objects, which the check does not have.";

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
    checksNotRun: [],
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
    base.reason = src.length === 0 ? 'The package has no src/ folder: there was no ABAP object to check.' : 'No file of the package is one abaplint reads (ABAP classes and interfaces, CDS data definitions, tables).';
    return base;
  }
  const r = abapCheck(src);
  if (!r.ran) return { ...base, reason: r.reason };
  // A reference to an SAP object the check cannot see is not an issue of the package; it is counted in `activation`.
  const issues = r.findings.filter((f) => f.kind !== 'unresolved').map((f) => ({ path: f.path, line: f.line, rule: f.rule, message: f.message }));
  const failed = new Set(issues.map((i) => i.path));
  return {
    ...base,
    state: issues.length > 0 ? 'failed' : 'passed',
    abaplint: r.activation.abaplint,
    checked: read.length,
    failedFiles: failed.size,
    issueCount: issues.length,
    issues: issues.slice(0, MAX_ABAPLINT_ISSUES),
    activation: r.activation,
  };
}

/**
 * The check as the generation record lists checks (`{ kind, total, failed }`)
 * and checks not run (`{ kind, reason }`).
 *
 * A record with `activation` (3.0.13): `abaplint` counts the files of the
 * package's own objects three ways (passed, failed with a parser or syntax
 * error, not run 0); what the check could not see is said under
 * `abaplint-sap`, the files abaplint has no parser for under `abaplint-unread`.
 * A record from before: as it was — the parse only, `abaplint-syntax` not run.
 */
export function abaplintCheckEntries(r: AbaplintRecord): { checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number }>; notRun: Array<{ kind: string; reason: string }> } {
  const unreadFiles = r.notRun.length > 0 ? `abaplint did not read ${r.notRun.length} file${r.notRun.length === 1 ? '' : 's'} (${[...new Set(r.notRun.map((n) => n.path.split('.').slice(-2).join('.')))].join(', ')}).` : '';
  if (r.state === 'not-run') {
    return { checks: [], notRun: [{ kind: 'abaplint', reason: (r.reason ?? 'abaplint did not run.').slice(0, 500) }] };
  }
  const a = r.activation;
  if (!a) {
    const syntax = { kind: 'abaplint-syntax', reason: `${CHECK_SYNTAX_NOT_RUN}${unreadFiles ? ` ${unreadFiles}` : ''}`.slice(0, 500) };
    return { checks: [{ kind: 'abaplint', total: r.checked, failed: r.failedFiles }], notRun: [syntax] };
  }
  const notRun: Array<{ kind: string; reason: string }> = [];
  const unresolved = unresolvedSentence(a);
  if (unresolved) notRun.push({ kind: 'abaplint-sap', reason: unresolved.slice(0, 500) });
  if (unreadFiles) notRun.push({ kind: 'abaplint-unread', reason: unreadFiles.slice(0, 500) });
  return { checks: [{ kind: 'abaplint', total: a.files, failed: a.failedFiles, passed: Math.max(0, a.files - a.failedFiles), notRun: 0 }], notRun };
}

const ABAPLINT_KINDS = new Set(['abaplint', 'abaplint-syntax', 'abaplint-sap', 'abaplint-unread']);

/**
 * The engine-led record's checks with the server's abaplint result in place
 * of anything the page sent under that kind: the page cannot report its own.
 * With the activation check, the record's status is the server's too: a
 * package with a parser or syntax error in its own objects is
 * `not-activatable`, whatever the page said.
 */
export function withAbaplint<
  T extends { status?: string; checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number }>; notRun: Array<{ kind: string; reason: string }> },
>(engine: T, r: AbaplintRecord): T {
  const entries = abaplintCheckEntries(r);
  const out = {
    ...engine,
    checks: [...engine.checks.filter((c) => !ABAPLINT_KINDS.has(c.kind)), ...entries.checks],
    notRun: [...engine.notRun.filter((n) => !ABAPLINT_KINDS.has(n.kind)), ...entries.notRun],
  };
  if (r.activation && typeof engine.status === 'string') {
    if (!r.activation.activatable) out.status = 'not-activatable';
    else if (engine.status === 'not-activatable') {
      // The page saw errors the server does not: the status is the functions' again.
      const notWritten = (engine as { notWritten?: unknown }).notWritten;
      out.status = Array.isArray(notWritten) && notWritten.length > 0 ? 'partial' : 'complete';
    }
  }
  return out;
}
