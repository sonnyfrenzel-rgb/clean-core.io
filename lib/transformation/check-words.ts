/**
 * The words for the checks of an engine-led generation (roadmap 3.0.12, step
 * E) — one source for the generation screen, the Built-on card, STATUS.md and
 * TRACE.md, so none of them can say it differently.
 *
 * Two rules the words keep:
 *
 *   - Three outcomes, never two. A result is passed, failed or not run; a case
 *     the runner skipped is not a run that passed. "26 run, 0 failed" over 26
 *     cases that never ran was the defect this module replaced.
 *   - Who decides the outcome. A check of engine-written code (the input
 *     contract, decimals, CSV, run store) says nothing about the functions the
 *     model wrote, and is never worded as if it did; the checks that can reach
 *     the written functions are counted apart, even when none of them ran.
 *
 * A check is green ('met') only when something of the written functions
 * passed and nothing failed or was not run. A record from before the split
 * (no `scope`, no `passed`) is read as it was stored: its total is called
 * "reported", never "run" or "passed".
 *
 * Pure: no imports beyond types.
 */

export type CheckScopeWord = 'engine-code' | 'fills';

/** A check as the record, the trace or the event carries it — every split field optional (older records). */
export interface CheckLike {
  kind: string;
  total: number;
  failed: number;
  passed?: number;
  notRun?: number;
  scope?: CheckScopeWord;
  notRunReason?: string | null;
  baseThrew?: string | null;
}

/** Said once under the checks wherever a check of engine-written code is listed. */
export const ENGINE_CODE_NOTE =
  "Checks of the engine's own code run only what Clean-Core.io wrote (input contract, decimals, CSV, run store); they do not test the functions the model wrote.";

/**
 * Who ran the checks of a stored record. The page runs the guards, lints,
 * engine cases, probes and file formats while it generates, and sends their
 * outcome with the package; the store route checks the record's shape and its
 * trace, not that the checks ran (QA review of c38f8043, 05d1530a1092). Only
 * abaplint is run by the server itself when it stores the package.
 */
const SERVER_RUN_KINDS = new Set(['abaplint', 'abaplint-syntax', 'abaplint-sap', 'abaplint-unread', 'tsc']);

/** Said once under the checks of a stored record when any of them is the page's report. */
export const PAGE_REPORTED_NOTE =
  "Every check listed here except abaplint and the server's type check (tsc) is the report of the browser that generated the package: Clean-Core.io's server stored it as sent and did not run those checks again.";

/** True when a stored record lists a check (run or not run) that the server did not run itself. */
export function hasPageReportedChecks(e: { checks: readonly { kind: string }[]; notRun: readonly { kind: string }[] }): boolean {
  return [...e.checks, ...e.notRun].some((c) => !SERVER_RUN_KINDS.has(c.kind));
}

const plural =(n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The noun of a check, in the singular and plural, and what it checks. */
function nounOf(kind: string, scope: CheckScopeWord | undefined): { one: string; many: string; of: string } {
  if (kind === 'cases') {
    if (scope === 'fills') return { one: 'engine case', many: 'engine cases', of: 'of the written functions' };
    if (scope === 'engine-code') return { one: 'engine case', many: 'engine cases', of: "of the engine's input-contract, decimal and run-store code" };
    return { one: 'engine case', many: 'engine cases', of: '' };
  }
  if (kind === 'probes') {
    if (scope === 'fills') return { one: 'probe', many: 'probes', of: 'of the written functions' };
    if (scope === 'engine-code') return { one: 'probe', many: 'probes', of: "of the engine's decimal, CSV and run-store code" };
    return { one: 'probe', many: 'probes', of: '' };
  }
  if (kind === 'guards') return { one: 'body guard', many: 'body guards', of: '' };
  if (kind === 'lint') return { one: 'lint check', many: 'lint checks', of: '' };
  if (kind === 'abaplint') return { one: 'ABAP file', many: 'ABAP files', of: 'checked by abaplint for parser and syntax errors (shipped config)' };
  if (kind === 'abap') return { one: 'ABAP file', many: 'ABAP files', of: 'checked by abaplint for parser and syntax errors (shipped config)' };
  if (kind === 'formats') return { one: 'object file', many: 'object files', of: "against SAP's ABAP file formats (AFF schemas) and abapGit's serializer format" };
  if (kind === 'types') return { one: 'TypeScript file', many: 'TypeScript files', of: "type-checked with the package's tsconfig.json (tsc --noEmit)" };
  if (kind === 'tsc') return { one: 'TypeScript file', many: 'TypeScript files', of: "type-checked by Clean-Core.io's server before saving (the package's tsconfig.json)" };
  return { one: kind, many: kind, of: '' };
}

const withOf = (head: string, of: string) => (of ? `${head} ${of}` : head);

/** True when the check carries the three-way split (written since the honest count). */
export function isSplit(c: CheckLike): boolean {
  return typeof c.passed === 'number' && typeof c.notRun === 'number';
}

/**
 * One check as a phrase: "5 probes of the engine's decimal, CSV and run-store
 * code passed", "26 engine cases of the written functions not run — no valid
 * base value known for P_BANFN", "engine cases of the written functions: 0 run".
 */
export function checkPhrase(c: CheckLike): string {
  const n = nounOf(c.kind, c.scope);
  if (c.kind === 'guards') return `body guards: ${plural(c.total, 'body', 'bodies')} checked${c.failed > 0 ? `, ${c.failed} refused and sent back for repair` : ', none refused'}`;
  if (c.kind === 'lint') return `lint checks: ${c.total === 0 ? 'no finding' : plural(c.total, 'finding')}`;
  const threw = c.baseThrew ? `; the base request threw in the written functions (${c.baseThrew})` : '';
  if (!isSplit(c)) {
    // A record from before the split: its total mixed passed and not run.
    return `${withOf(n.many, n.of)}: ${c.total} reported, ${c.failed} failed (passed and not run were not counted apart)`;
  }
  const passed = c.passed ?? 0;
  const notRun = c.notRun ?? 0;
  const reason = c.notRunReason ? ` — ${c.notRunReason}` : '';
  if (c.total === 0) return `${withOf(n.many, n.of)}: 0 run${threw}`;
  if (passed === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} passed`;
  if (notRun === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} not run${reason}${threw}`;
  if (c.failed === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} failed${threw}`;
  const parts = [`${passed} passed`, `${c.failed} failed`, `${notRun} not run${reason}`];
  return `${withOf(n.many, n.of)}: ${parts.join(', ')}${threw}`;
}

/** The checks of one kind (both scopes) as the screen's state: green only when the written functions passed something and nothing else is open. */
export function checkStateOf(checks: readonly CheckLike[]): 'met' | 'warning' | 'failed' {
  if (checks.some((c) => c.failed > 0 || c.baseThrew)) return 'failed';
  if (checks.length === 0 || checks.some((c) => !isSplit(c) || (c.notRun ?? 0) > 0)) return 'warning';
  const fills = checks.filter((c) => c.scope === 'fills');
  return fills.some((c) => (c.passed ?? 0) > 0) ? 'met' : 'warning';
}

/** The order the phrases of one kind are said in: the written functions first, then the engine's own code. */
export function orderedChecks<T extends CheckLike>(checks: readonly T[]): T[] {
  const rank = (c: CheckLike) => ['guards', 'lint', 'types', 'tsc', 'abap', 'abaplint', 'cases', 'probes', 'formats'].indexOf(c.kind) * 3 + (c.scope === 'fills' ? 0 : c.scope === 'engine-code' ? 1 : 2);
  return [...checks].sort((a, b) => rank(a) - rank(b));
}

/** A check with only the fields it carries — no `undefined` reaches Firestore or the trace. */
export function checkSummaryOf<T extends CheckLike>(c: T): T {
  const out = { kind: c.kind, total: c.total, failed: c.failed } as T;
  if (typeof c.passed === 'number') out.passed = c.passed;
  if (typeof c.notRun === 'number') out.notRun = c.notRun;
  if (c.scope) out.scope = c.scope;
  if (c.notRunReason) out.notRunReason = c.notRunReason;
  if (c.baseThrew) out.baseThrew = c.baseThrew;
  return out;
}

/* ------------------------------------------------- the activation check (3.0.13) */

/**
 * The activation check of an ABAP package (`abap-check.ts`, roadmap 3.0.13
 * item 1): abaplint with the configuration the package ships, parser and
 * syntax over the package's own objects. Written by the server onto the
 * generation binding (`binding.abaplint.activation`), never by the page; a
 * binding from before 3.0.13 has none and keeps its own words.
 */
export type AbapFindingKind = 'parser' | 'syntax' | 'unresolved' | 'lint';

export interface AbapFinding {
  path: string;
  line: number;
  rule: string;
  kind: AbapFindingKind;
  message: string;
}

export interface AbapActivation {
  v: 1;
  /** The `@abaplint/core` version that ran. */
  abaplint: string;
  /** Always the configuration the package ships as `abaplint.json`. */
  config: 'shipped';
  /** Files of the package's own objects abaplint read. */
  files: number;
  /** Their paths (at most 100) — a file added to the package later (an ABAP Unit class from Testing) is not among them. */
  paths: string[];
  /** Of those, files with a parser or syntax error. */
  failedFiles: number;
  parserErrors: number;
  syntaxErrors: number;
  /** References to SAP objects the check cannot see, and the findings that follow from them — not the package's errors. */
  unresolved: number;
  /** The SAP names behind them (at most 20). */
  unresolvedNames: string[];
  /** Findings of the other rules (Clean ABAP, ABAP Doc, metadata) — findings, not activation errors. */
  lint: number;
  /** 0 parser and 0 syntax errors in the package's own objects. */
  activatable: boolean;
  /** The SAP classes given to the check as declarations (`checks/sap-stubs/`). */
  stubs: string[];
  /** The first findings: errors first, then unresolved, then the other rules. */
  findings: AbapFinding[];
}

/** Where the raw findings travel in the delivered package. */
export const ABAP_CHECK_JSON_PATH = 'checks/abaplint.json';
export const ABAP_CHECK_MD_PATH = 'checks/abaplint.md';

const FINDING_KINDS = new Set<AbapFindingKind>(['parser', 'syntax', 'unresolved', 'lint']);
const nat = (v: unknown, max = 1_000_000) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);
const names = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string').slice(0, 20).map((n) => n.slice(0, 60)) : []);

/** A stored activation record, shape-checked; null when there is none (a binding from before 3.0.13) or it is malformed. */
export function activationOf(raw: unknown): AbapActivation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const parserErrors = nat(a.parserErrors);
  const syntaxErrors = nat(a.syntaxErrors);
  const version = text(a.abaplint, 40);
  if (a.v !== 1 || a.config !== 'shipped' || parserErrors === null || syntaxErrors === null || !version) return null;
  const findings: AbapFinding[] = Array.isArray(a.findings)
    ? a.findings.slice(0, 200).flatMap((f): AbapFinding[] => {
        const x = (f ?? {}) as Record<string, unknown>;
        const line = nat(x.line);
        const path = text(x.path, 200);
        return path && line !== null && FINDING_KINDS.has(x.kind as AbapFindingKind)
          ? [{ path, line, rule: text(x.rule, 60) ?? '', kind: x.kind as AbapFindingKind, message: text(x.message, 300) ?? '' }]
          : [];
      })
    : [];
  return {
    v: 1,
    abaplint: version,
    config: 'shipped',
    files: nat(a.files) ?? 0,
    paths: Array.isArray(a.paths) ? a.paths.filter((n): n is string => typeof n === 'string').slice(0, 100).map((n) => n.slice(0, 200)) : [],
    failedFiles: nat(a.failedFiles) ?? 0,
    parserErrors,
    syntaxErrors,
    unresolved: nat(a.unresolved) ?? 0,
    unresolvedNames: names(a.unresolvedNames),
    lint: nat(a.lint) ?? 0,
    // Derived, never read: a record cannot call itself activatable with errors on it.
    activatable: parserErrors === 0 && syntaxErrors === 0,
    stubs: names(a.stubs),
    findings,
  };
}

const errorsWord = (n: number, what: string) => `${n.toLocaleString('en-US')} ${what} error${n === 1 ? '' : 's'}`;

/** "abaplint 2.120.54, shipped config". */
export const activationSource = (a: AbapActivation) => `abaplint ${a.abaplint}, shipped config`;

/**
 * The status of an ABAP generation in one phrase — the generation record,
 * STATUS.md, TRACE.md and the Built-on card all say this: "generated — not
 * activatable: 107 parser errors, 841 syntax errors (abaplint 2.120.54, shipped config)".
 */
export function activationStatusPhrase(a: AbapActivation): string {
  if (a.activatable) return `activatable as far as abaplint can see: 0 parser errors, 0 syntax errors (${activationSource(a)})`;
  return `generated — not activatable: ${errorsWord(a.parserErrors, 'parser')}, ${errorsWord(a.syntaxErrors, 'syntax')} (${activationSource(a)})`;
}

/** The same in plain words, for the generation screen and the Built-on card. */
export function activationPlainWords(a: AbapActivation): string {
  if (a.activatable) {
    return `abaplint finds no parser and no syntax error in the generated objects (${activationSource(a)}). That is not an activation: only your SAP system activates the objects.`;
  }
  return `The code was generated but cannot be activated: abaplint finds ${errorsWord(a.parserErrors, 'parser')} and ${errorsWord(a.syntaxErrors, 'syntax')} in the generated objects (${activationSource(a)}). Each finding is in ${ABAP_CHECK_MD_PATH} of the delivered package.`;
}

/** What the check could not see, in one sentence, or null when it saw everything. */
export function unresolvedSentence(a: AbapActivation): string | null {
  if (a.unresolved === 0) return null;
  const list = a.unresolvedNames.length ? ` (${a.unresolvedNames.join(', ')})` : '';
  return `${a.unresolved.toLocaleString('en-US')} finding${a.unresolved === 1 ? '' : 's'} concern SAP objects the check cannot see${list}: SAP's released objects are not available to it, so these are not counted as errors of this package.`;
}

/** `checks/abaplint.md` — the short form of the findings, referenced from STATUS.md. */
export function activationMarkdown(a: AbapActivation): string {
  const lines: string[] = ['# abaplint — the activation check of this package', ''];
  lines.push(
    `Run by Clean-Core.io's server before the package was stored: ${activationSource(a)} — the \`abaplint.json\` at the root of this package, over the objects under \`src/\`, with the SAP classes the objects inherit from read from \`checks/sap-stubs/\` (declarations only: ${a.stubs.join(', ') || 'none'}). Run \`npx @abaplint/cli abaplint.json\` in this folder to repeat it.`,
    '',
    `- Result: **${activationStatusPhrase(a)}**.`,
    `- Files of the package's own objects read: ${a.files}; with a parser or syntax error: ${a.failedFiles}.`,
  );
  const unresolved = unresolvedSentence(a);
  if (unresolved) lines.push(`- ${unresolved}`);
  lines.push(`- Findings of the other rules (Clean ABAP, ABAP Doc, metadata — not activation errors): ${a.lint}.`);
  lines.push('- abaplint is not an SAP system: "activatable" here means only that abaplint finds no error. Activation happens in your system.', '');
  const shown = a.findings.length;
  const total = a.parserErrors + a.syntaxErrors + a.unresolved + a.lint;
  lines.push(`## Findings${shown < total ? ` (the first ${shown} of ${total.toLocaleString('en-US')}; errors first)` : ''}`, '');
  if (shown === 0) lines.push('None.');
  for (const f of a.findings) lines.push(`- ${f.kind} \`${f.path}:${f.line}\` ${f.rule} — ${f.message.replace(/\r?\n/g, ' ')}`);
  lines.push('', `The same findings, as data: \`${ABAP_CHECK_JSON_PATH}\`.`, '');
  return lines.join('\n');
}

/** `checks/abaplint.json` — the record as data. */
export function activationJson(a: AbapActivation): string {
  return `${JSON.stringify({ format: 'clean-core.abaplint/1', ...a }, null, 2)}\n`;
}

/**
 * Why Testing cannot be closed on this package, or null when this check does
 * not stand in the way. Roadmap 3.0.13 item 1: code that cannot be activated
 * has no test a closure could conclude.
 */
export function activationClosureRefusal(a: AbapActivation | null): string | null {
  if (!a || a.activatable) return null;
  return `Testing cannot be closed: the stored package is ${activationStatusPhrase(a)}. A suite is not concluded on code that does not activate — generate the code again in Transformation, then test it.`;
}

/** True when the files are an ABAP package (class or interface sources under `src/`). */
export function isAbapPackage(files: ReadonlyArray<{ path: string }>): boolean {
  return files.some((f) => /^(?:\.\/)?src\/.+\.(?:clas|intf)(?:\.[a-z_]+)?\.abap$/i.test(f.path.replace(/\\/g, '/')));
}

/* -------------------------------------------------------- not run, per route */

/** Why the engine cases do not run here on the ABAP route — not the Node runner's reason. */
export const ABAP_CASES_NOT_RUN = 'Engine cases not run here: on the ABAP route they are ABAP Unit test data, and ABAP Unit runs only in your SAP system.';
/** Why the failure-pattern probes do not run here on the ABAP route. */
export const ABAP_PROBES_NOT_RUN = 'Failure-pattern probes not run here: they call Node code, and this package is ABAP.';

/* ------------------------------------------- the type check of a Node package (3.0.13) */

/** One TypeScript error of a Node package: its file, line, code (`TS2339`) and message. */
export interface TypeFindingWords {
  path: string;
  line: number;
  code: string;
  message: string;
}

/**
 * The type check of a Node package (`lib/test-sandbox/type-check.ts`, roadmap
 * 3.0.13, A1): the TypeScript compiler with the options of the package's own
 * `tsconfig.json` over its `srv/` and `test/` TypeScript. Written by the server
 * onto the generation binding (`binding.typeCheck`) when it stores a Node
 * package; the page's own check of the last round goes into its status only.
 */
export interface NodeTypeCheck {
  v: 1;
  /** The TypeScript version that ran. */
  typescript: string;
  config: 'shipped';
  files: number;
  failedFiles: number;
  errors: number;
  /** 0 errors: the package compiles under its own tsconfig.json. Derived, never read. */
  runnable: boolean;
  findings: TypeFindingWords[];
}

/** A stored type-check record, shape-checked; null when there is none or it is malformed. */
export function typeCheckOf(raw: unknown): NodeTypeCheck | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const errors = nat(a.errors);
  const version = text(a.typescript, 40);
  if (a.v !== 1 || a.config !== 'shipped' || errors === null || !version) return null;
  const findings: TypeFindingWords[] = Array.isArray(a.findings)
    ? a.findings.slice(0, 200).flatMap((f): TypeFindingWords[] => {
        const x = (f ?? {}) as Record<string, unknown>;
        const line = nat(x.line);
        const path = text(x.path, 200);
        return path && line !== null ? [{ path, line, code: text(x.code, 12) ?? '', message: text(x.message, 400) ?? '' }] : [];
      })
    : [];
  return { v: 1, typescript: version, config: 'shipped', files: nat(a.files) ?? 0, failedFiles: nat(a.failedFiles) ?? 0, errors, runnable: errors === 0, findings };
}

/**
 * `cds compile` of a Node package's CAP shell (`cds-compile.ts`, roadmap 3.0.13): SAP's CDS compiler over the
 * package's `.cds` files, then the OData transformation of its services. Written by the server onto the
 * generation binding (`binding.cdsCompile`) — whether it ran (`ran`) and, if so, what it said. Where the compiler
 * is not installed (Clean-Core.io's production server: `@sap/cds-compiler` is under the SAP Developer License and
 * is a devDependency only) the record keeps why, but the reader is not told about a check that did not happen
 * (owner decision 14.10.2026): they are told that SAP CAP is theirs to install, and how to check and start the
 * package (`CAP_YOURS`); the CAP capabilities read "to be checked in your environment" (delivery-package.ts).
 */
export type CdsCompileCheck =
  | { v: 1; ran: true; compiler: string; files: number; errors: number; warnings: number; services: string[]; findings: Array<{ path: string; line: number; severity: string; id: string; message: string }>; compiles: boolean }
  | { v: 1; ran: false; reason: string };

/** A stored `cds compile` record, shape-checked; null when there is none or it is malformed. */
export function cdsCompileOf(raw: unknown): CdsCompileCheck | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (a.v !== 1) return null;
  if (a.ran === false) {
    const reason = text(a.reason, 500);
    return reason ? { v: 1, ran: false, reason } : null;
  }
  const errors = nat(a.errors);
  const compiler = text(a.compiler, 40);
  if (a.ran !== true || errors === null || !compiler) return null;
  const findings = Array.isArray(a.findings)
    ? a.findings.slice(0, 50).flatMap((f) => {
        const x = (f ?? {}) as Record<string, unknown>;
        const path = text(x.path, 200);
        return path ? [{ path, line: nat(x.line) ?? 0, severity: text(x.severity, 10) ?? '', id: text(x.id, 60) ?? '', message: text(x.message, 400) ?? '' }] : [];
      })
    : [];
  const services = Array.isArray(a.services) ? a.services.slice(0, 20).flatMap((s) => (text(s, 120) ? [text(s, 120)!] : [])) : [];
  return { v: 1, ran: true, compiler, files: nat(a.files) ?? 0, errors, warnings: nat(a.warnings) ?? 0, services, findings, compiles: errors === 0 };
}

/** The record from the compiler's result (`cdsCompileCandidate`); null when the package has no CDS file. */
export function cdsCompileRecordOf(
  r: { ran: true; compiler: string; files: number; errors: number; warnings: number; services: string[]; findings: Array<{ path: string; line: number; severity: string; id: string; message: string }> } | { ran: false; reason: string } | null | undefined,
): CdsCompileCheck | null {
  if (!r) return null;
  if (!r.ran) return /no \.cds file/.test(r.reason) ? null : { v: 1, ran: false, reason: r.reason.slice(0, 500) };
  return { v: 1, ran: true, compiler: r.compiler, files: r.files, errors: r.errors, warnings: r.warnings, services: r.services.slice(0, 20), findings: r.findings.slice(0, 50), compiles: r.errors === 0 };
}

/**
 * SAP CAP in the customer's environment (owner decision 14.10.2026): `@sap/cds` and its CDS compiler are installed
 * by the customer, not by Clean-Core.io, and that is where the package is checked and started. Said wherever the
 * server's compile did not run, instead of naming the check.
 */
export const CAP_YOURS = 'SAP CAP (@sap/cds and its CDS compiler) is installed by you, not by Clean-Core.io';
/** The three commands that install, check and start the package where CAP is installed. */
export const CAP_CHECK_AND_START = '`npm install`, then `npm run compile` to check the model and `cds watch` to start the service';
/** The capability status's words where nothing here checked it. */
export const CAP_TO_CHECK = 'to be checked in your environment';

/** "SAP CAP (…) is installed by you, not by Clean-Core.io — check and start the package with `npm install`, …". */
export const CAP_YOURS_SENTENCE = `${CAP_YOURS} — check and start the package with ${CAP_CHECK_AND_START}.`;

/** "cds compile: 0 errors in 4 CDS files (@sap/cds-compiler 7.1.2)" — or, where it did not run, that CAP is the reader's to install and check. */
export function cdsCompilePhrase(c: CdsCompileCheck): string {
  if (!c.ran) return `${CAP_TO_CHECK}: ${CAP_YOURS_SENTENCE.replace(/\.$/, '')}`;
  return `cds compile: ${plural(c.errors, 'error')}${c.warnings ? `, ${plural(c.warnings, 'warning')}` : ''} in ${plural(c.files, 'CDS file')} (@sap/cds-compiler ${c.compiler})`;
}

/** The record from the compiler's result (`typeCheckCandidate`); null when it did not run. */
export function typeCheckRecordOf(r: { ran: true; typescript: string; files: number; failedFiles: number; errors: number; findings: TypeFindingWords[] } | { ran: false; reason: string } | null | undefined): NodeTypeCheck | null {
  if (!r || !r.ran) return null;
  return { v: 1, typescript: r.typescript, config: 'shipped', files: r.files, failedFiles: r.failedFiles, errors: r.errors, runnable: r.errors === 0, findings: r.findings.slice(0, 50) };
}

/** "TypeScript 5.9.3, the package's tsconfig.json". */
export const typeCheckSource = (t: Pick<NodeTypeCheck, 'typescript'>) => `TypeScript ${t.typescript}, the package's tsconfig.json`;

/**
 * The status of a Node generation in one phrase, as the record, STATUS.md,
 * TRACE.md and the generation screen say it: "generated — not runnable: 3
 * type errors in 2 files (TypeScript 5.9.3, the package's tsconfig.json)".
 */
export function typeCheckStatusPhrase(t: NodeTypeCheck): string {
  if (t.runnable) return `compiles: 0 type errors in ${plural(t.files, 'TypeScript file')} (${typeCheckSource(t)})`;
  return `generated — not runnable: ${plural(t.errors, 'type error')} in ${plural(t.failedFiles, 'file')} (${typeCheckSource(t)})`;
}

/**
 * "generated — not verified: …" — a Node package whose type check, engine
 * cases or probes did not run (or ran in part). A case that was skipped or not
 * run is never evidence (A5); the phrase names what did not run and why.
 */
export function notVerifiedPhrase(reasons: readonly string[]): string {
  const shown = reasons.slice(0, 3).map((r) => r.replace(/\.$/, ''));
  return `generated — not verified: ${shown.join('; ')}${reasons.length > shown.length ? `; and ${reasons.length - shown.length} more` : ''}`;
}

/**
 * The engine-led record of a Node package with the server's type check in place of anything the page sent
 * under `tsc` (3.0.13): the page cannot report this check for itself. With the check, the status is the
 * server's too — type errors make it `not-runnable`, whatever the page said; a check that could not run
 * leaves a `complete` record `not-verified`.
 */
export function withTypeCheck<
  T extends {
    status?: string;
    unverified?: string[];
    notWritten?: unknown;
    checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number }>;
    notRun: Array<{ kind: string; reason: string }>;
  },
>(engine: T, t: NodeTypeCheck | null, notRunReason: string | null = null): T {
  const out: T = {
    ...engine,
    checks: [...engine.checks.filter((c) => c.kind !== 'tsc'), ...(t ? [{ kind: 'tsc', total: t.files, failed: t.failedFiles, passed: Math.max(0, t.files - t.failedFiles), notRun: 0 }] : [])],
    notRun: [...engine.notRun.filter((n) => n.kind !== 'tsc'), ...(t ? [] : [{ kind: 'tsc', reason: (notRunReason ?? 'The type check did not run on the server.').slice(0, 500) }])],
  };
  if (typeof engine.status !== 'string') return out;
  const stubs = Array.isArray(engine.notWritten) && engine.notWritten.length > 0;
  if (t && !t.runnable) out.status = 'not-runnable';
  else if (engine.status === 'not-runnable') {
    // The page saw errors the server does not: the status is the functions' and the runs' again.
    out.status = stubs ? 'partial' : (engine.unverified?.length ?? 0) > 0 ? 'not-verified' : 'complete';
  }
  if (!t && out.status === 'complete') {
    out.status = 'not-verified';
    out.unverified = [...(engine.unverified ?? []), `type check not run on the server — ${(notRunReason ?? 'it did not run').replace(/\.$/, '')}`];
  }
  return out;
}

/** Why Testing cannot be closed on a stored Node package, or null: code that does not compile has no test a closure could conclude. */
export function typeCheckClosureRefusal(t: NodeTypeCheck | null): string | null {
  if (!t || t.runnable) return null;
  return `Testing cannot be closed: the stored package is ${typeCheckStatusPhrase(t)}. A suite is not concluded on code that does not compile — generate the code again in Transformation, then test it.`;
}
