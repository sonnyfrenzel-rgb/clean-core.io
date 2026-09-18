/**
 * The release fields of a project, and the only commands that write them.
 *
 * Roadmap 0.7 (`docs/roadmap/SCHNITT-0-UMFANG.md` §8, package 1): *„Eine
 * Freigabe entsteht auf dem Server oder gar nicht."* Until this module existed,
 * `firestore.rules` carried five release fields in the client-writable
 * allowlist — `targetArchitecture`, `approvedByArchitect`,
 * `architectJustifiedOverride`, `architectSignOffAt`, `approvedBy` — and the
 * design stage wrote all five straight from the browser, `approvedBy` included.
 * That last one is the whole problem in miniature: the browser decided whose
 * name went on the sign-off. It read `auth.currentUser.email` because the page
 * was honest, not because anything made it.
 *
 * The first full security audit named `usageReport` in the same breath, for a
 * different reason: the rules validated it as `is map` and nothing else, so a
 * browser could put an arbitrary structure of arbitrary size on a project
 * document that later drives the risk matrix.
 *
 * Roadmap 7.1 adds a seventh field the same way, for the same reason and one
 * more: `atcReport` (the imported ABAP Test Cockpit worklist) is exactly the
 * shape `usageReport` was — arbitrary size, arbitrary structure, if a browser
 * could write it directly — and it carries an additional honesty obligation
 * this module is also the place to hold: an ATC finding is what ATC reported,
 * never what this product's own engine verified, and the two must stay
 * distinguishable everywhere the field is read (see `lib/abap/atc-model.ts`).
 *
 * So: seven fields leave the client allowlist, and this module is the contract
 * both halves read. It is pure on purpose — the route validates with it, the
 * design stage sends what it accepts, and `tests/project-command-boundary.spec.ts`
 * holds client, server, index and export to the same list (QA24-A12).
 *
 * What it deliberately does NOT change: a sign-off is still a **self-declaration
 * by the signed-in account**, not an organisational mandate, and the audit pack
 * still carries it as attested rather than signed. Moving the write to the
 * server makes the record true — it does not make it an authority.
 */

/* ------------------------------------------------------------------ fields */

/** The five release fields of `docs/roadmap/SCHNITT-0-UMFANG.md` §8, package 1. */
export const RELEASE_FIELDS = [
  'targetArchitecture',
  'approvedByArchitect',
  'architectJustifiedOverride',
  'architectSignOffAt',
  'approvedBy',
] as const;

/**
 * Every project field a browser may no longer write: the five release fields,
 * the usage import that same audit named, and the ATC import (roadmap 7.1)
 * that followed the same reasoning before a browser ever got the chance to
 * write it. None of these may appear in the `affectedKeys().hasOnly([…])`
 * allowlist of `firestore.rules`.
 */
export const SERVER_ONLY_PROJECT_FIELDS = [...RELEASE_FIELDS, 'usageReport', 'atcReport'] as const;

export type ServerOnlyProjectField = (typeof SERVER_ONLY_PROJECT_FIELDS)[number];

/* ------------------------------------------------------ target architecture */

export const TARGET_ARCHITECTURES = ['rap', 'cap', 'integration', 'event', 'retire'] as const;
export type TargetArchitectureCode = (typeof TARGET_ARCHITECTURES)[number];

export function isTargetArchitecture(value: unknown): value is TargetArchitectureCode {
  return typeof value === 'string' && (TARGET_ARCHITECTURES as readonly string[]).includes(value);
}

/**
 * The engine's recommendation, in the vocabulary the decision is made in.
 *
 * Two shapes reach this from the same field. `POST /api/runs/create` stores
 * `originalRecommendation` as the router's own route name — `'Side-by-Side (SAP
 * BTP)'` or `'In-App (ABAP Cloud)'` — while the design stage reads it as one of
 * the five architecture codes. Nothing translated between them, so confirming
 * the recommendation used to write the route *name* into `targetArchitecture`.
 * A server that validates a closed set has to translate, and both halves now
 * read the translation from here.
 *
 * Returns `null` when nothing is known. Deliberately conservative, for the same
 * reason `routeWasOverridden()` is: an unknown recommendation is not an
 * override, and a decision must not be refused because the engine said nothing.
 */
export function recommendedArchitecture(source: {
  originalRecommendation?: unknown;
  extensibilityRoute?: unknown;
}): TargetArchitectureCode | null {
  const fromRoute = (value: unknown): TargetArchitectureCode | null => {
    if (typeof value !== 'string') return null;
    if (isTargetArchitecture(value)) return value;
    if (value.includes('BTP') || value.includes('Side-by-Side')) return 'cap';
    if (value.includes('ABAP Cloud') || value.includes('In-App')) return 'rap';
    return null;
  };
  return fromRoute(source.originalRecommendation) ?? fromRoute(source.extensibilityRoute);
}

/* ------------------------------------------------------------- usage report */

/** Top-level keys of a `UsageReport` the server stores; anything else is dropped. */
const USAGE_REPORT_KEYS = [
  'records',
  'source',
  'observedSpanDays',
  'observedFrom',
  'observedTo',
  'measuredFrom',
  'measuredTo',
  'window',
  'dateLocale',
  'quarantined',
  'importedAt',
  'warnings',
  'retentionExpiresAt',
] as const;

const USAGE_SOURCES = ['scmon', 'upl', 'st03n', 'manual'] as const;

/** One import, one project document: a ceiling the rules could never express. */
export const USAGE_REPORT_MAX_RECORDS = 20000;
export const USAGE_REPORT_MAX_QUARANTINED = 20000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The usage import, reduced to the fields the model declares.
 *
 * Not a type guard and not a parser: the browser already parsed the export and
 * showed the reader what it found (`tests/usage-import-guard.spec.ts` pins that
 * the stored report is the one that was shown). What this adds is the part the
 * browser cannot be trusted with — a closed key set, a closed source vocabulary
 * and a ceiling on size.
 */
export function normaliseUsageReport(
  value: unknown,
): { ok: true; report: Record<string, unknown> } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'usageReport must be an object.' };
  if (!Array.isArray(value.records)) return { ok: false, error: 'usageReport.records must be a list.' };
  if (value.records.length > USAGE_REPORT_MAX_RECORDS) {
    return { ok: false, error: `usageReport.records exceeds ${USAGE_REPORT_MAX_RECORDS} rows.` };
  }
  if (typeof value.source !== 'string' || !(USAGE_SOURCES as readonly string[]).includes(value.source)) {
    return { ok: false, error: `usageReport.source must be one of ${USAGE_SOURCES.join(', ')}.` };
  }
  if (typeof value.importedAt !== 'string' || value.importedAt.length === 0) {
    return { ok: false, error: 'usageReport.importedAt must be an ISO date string.' };
  }
  if (!Array.isArray(value.warnings)) return { ok: false, error: 'usageReport.warnings must be a list.' };
  if (value.quarantined !== undefined) {
    if (!Array.isArray(value.quarantined)) return { ok: false, error: 'usageReport.quarantined must be a list.' };
    if (value.quarantined.length > USAGE_REPORT_MAX_QUARANTINED) {
      return { ok: false, error: `usageReport.quarantined exceeds ${USAGE_REPORT_MAX_QUARANTINED} rows.` };
    }
  }

  const report: Record<string, unknown> = {};
  for (const key of USAGE_REPORT_KEYS) {
    if (value[key] !== undefined) report[key] = value[key];
  }
  return { ok: true, report };
}

/* --------------------------------------------------------------- atc report */

/** Top-level keys of an `AtcReport` the server stores; anything else is dropped. */
const ATC_REPORT_KEYS = [
  'findings',
  'source',
  'quarantined',
  'importedAt',
  'warnings',
  'retentionExpiresAt',
] as const;

const ATC_SOURCES = ['atc'] as const;

/** Same reasoning as `USAGE_REPORT_MAX_RECORDS`: a ceiling the rules could never express. */
export const ATC_REPORT_MAX_FINDINGS = 20000;
export const ATC_REPORT_MAX_QUARANTINED = 20000;

/**
 * The ATC import, reduced to the fields the model declares — the same
 * shallow contract `normaliseUsageReport` keeps: a closed top-level key set,
 * a closed source vocabulary and a ceiling on size. What goes into each
 * finding is the browser's own parser's job (`lib/abap/atc-parser.ts`,
 * `lib/abap/atc-privacy.ts`); this is the part the browser cannot be trusted
 * with regardless of what its own code does.
 */
export function normaliseAtcReport(
  value: unknown,
): { ok: true; report: Record<string, unknown> } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'atcReport must be an object.' };
  if (!Array.isArray(value.findings)) return { ok: false, error: 'atcReport.findings must be a list.' };
  if (value.findings.length > ATC_REPORT_MAX_FINDINGS) {
    return { ok: false, error: `atcReport.findings exceeds ${ATC_REPORT_MAX_FINDINGS} rows.` };
  }
  if (typeof value.source !== 'string' || !(ATC_SOURCES as readonly string[]).includes(value.source)) {
    return { ok: false, error: `atcReport.source must be one of ${ATC_SOURCES.join(', ')}.` };
  }
  if (typeof value.importedAt !== 'string' || value.importedAt.length === 0) {
    return { ok: false, error: 'atcReport.importedAt must be an ISO date string.' };
  }
  if (!Array.isArray(value.warnings)) return { ok: false, error: 'atcReport.warnings must be a list.' };
  if (value.quarantined !== undefined) {
    if (!Array.isArray(value.quarantined)) return { ok: false, error: 'atcReport.quarantined must be a list.' };
    if (value.quarantined.length > ATC_REPORT_MAX_QUARANTINED) {
      return { ok: false, error: `atcReport.quarantined exceeds ${ATC_REPORT_MAX_QUARANTINED} rows.` };
    }
  }

  const report: Record<string, unknown> = {};
  for (const key of ATC_REPORT_KEYS) {
    if (value[key] !== undefined) report[key] = value[key];
  }
  return { ok: true, report };
}

/* ---------------------------------------------------------------- commands */

export const PROJECT_COMMANDS = [
  'approve-architecture',
  'revoke-architecture',
  'record-usage-report',
  'record-atc-report',
] as const;
export type ProjectCommandName = (typeof PROJECT_COMMANDS)[number];

/** What a caller sends. The route validates it again; this only shapes it. */
export type ProjectCommandBody =
  | { command: 'approve-architecture'; targetArchitecture: TargetArchitectureCode; justification?: string }
  | { command: 'revoke-architecture' }
  | { command: 'record-usage-report'; usageReport: unknown }
  | { command: 'record-atc-report'; atcReport: unknown };

/** The part of the project document a command is allowed to look at. */
export interface ProjectCommandState {
  activeRunId?: unknown;
  approvedByArchitect?: unknown;
  originalRecommendation?: unknown;
  extensibilityRoute?: unknown;
}

/** Facts only the server knows. Never taken from the request body. */
export interface ProjectCommandActor {
  /** The address on the verified ID token. This is what `approvedBy` becomes. */
  email: string;
  /** ISO timestamp the sign-off is recorded at. */
  now: string;
}

export interface ProjectCommandRefusal {
  ok: false;
  status: number;
  code: string;
  error: string;
}

export interface ProjectCommandWrite {
  ok: true;
  /** What goes into the journal entry for this change. */
  action: string;
  /** The exact field/value pairs to merge onto the project document. */
  fields: Record<string, unknown>;
}

export type ProjectCommandResult = ProjectCommandWrite | ProjectCommandRefusal;

const refuse = (status: number, code: string, error: string): ProjectCommandRefusal => ({
  ok: false,
  status,
  code,
  error,
});

/**
 * Who may do it, from which state to which state, and what is recorded.
 *
 * "Who" is not decided here — the route has already established that the caller
 * owns the project and met the second factor. What is decided here is the
 * transition, and it is the same decision wherever it is asked.
 */
export function validateProjectCommand(
  body: unknown,
  state: ProjectCommandState,
  actor: ProjectCommandActor,
): ProjectCommandResult {
  if (!isPlainObject(body)) return refuse(400, 'malformed', 'A command is an object.');
  const command = body.command;
  if (typeof command !== 'string' || !(PROJECT_COMMANDS as readonly string[]).includes(command)) {
    return refuse(400, 'unknown-command', `command must be one of ${PROJECT_COMMANDS.join(', ')}.`);
  }

  if (command === 'approve-architecture') {
    // A sign-off is a statement about evidence. Without a signed run there is
    // no evidence to make it about, and the browser could previously record one
    // on an empty project.
    if (typeof state.activeRunId !== 'string' || state.activeRunId.length === 0) {
      return refuse(409, 'no-run', 'The project has no signed analysis run to sign off on.');
    }
    const target = body.targetArchitecture;
    if (!isTargetArchitecture(target)) {
      return refuse(400, 'unknown-architecture', `targetArchitecture must be one of ${TARGET_ARCHITECTURES.join(', ')}.`);
    }
    const justification = typeof body.justification === 'string' ? body.justification.trim() : '';
    if (justification.length > 4000) {
      return refuse(400, 'justification-too-long', 'The justification is longer than 4000 characters.');
    }
    // Departing from the engine's recommendation needs a reason on the record.
    // The browser enforced this and could equally well not have. Unknown
    // recommendation, no requirement — an override is only claimed when both
    // routes are known (`lib/route-override.ts`, same conservatism).
    const recommended = recommendedArchitecture(state);
    if (recommended !== null && recommended !== target && justification.length === 0) {
      return refuse(
        400,
        'override-needs-reason',
        'Choosing an architecture other than the recommended one needs a written reason.',
      );
    }
    return {
      ok: true,
      action: 'PROJECT_ARCHITECTURE_APPROVED',
      fields: {
        targetArchitecture: target,
        approvedByArchitect: true,
        architectJustifiedOverride: justification,
        architectSignOffAt: actor.now,
        // The server's own answer to "who", not the browser's.
        approvedBy: actor.email,
      },
    };
  }

  if (command === 'revoke-architecture') {
    if (state.approvedByArchitect !== true) {
      return refuse(409, 'not-approved', 'There is no architecture sign-off to withdraw.');
    }
    return {
      ok: true,
      action: 'PROJECT_ARCHITECTURE_REVOKED',
      fields: {
        approvedByArchitect: false,
        targetArchitecture: null,
        architectJustifiedOverride: '',
        architectSignOffAt: null,
        approvedBy: '',
      },
    };
  }

  if (command === 'record-usage-report') {
    const usage = normaliseUsageReport(body.usageReport);
    if (!usage.ok) return refuse(400, 'malformed-usage-report', usage.error);
    return { ok: true, action: 'PROJECT_USAGE_REPORT_RECORDED', fields: { usageReport: usage.report } };
  }

  // The only command left after the switch above: `record-atc-report`. An
  // `if` rather than a bare fallthrough, the same way `record-usage-report`
  // just became one — a third command added here later must say which one it
  // is rather than silently inheriting whatever sits last in the function.
  const atc = normaliseAtcReport(body.atcReport);
  if (!atc.ok) return refuse(400, 'malformed-atc-report', atc.error);
  return { ok: true, action: 'PROJECT_ATC_REPORT_RECORDED', fields: { atcReport: atc.report } };
}

/**
 * Every field any command can write, derived from the commands themselves.
 *
 * The boundary guard compares this with the rules allowlist and with the
 * registers, so a command that started writing a sixth field would be caught
 * rather than described.
 */
export function fieldsWrittenByCommands(): string[] {
  const actor: ProjectCommandActor = { email: 'a@b.c', now: '1970-01-01T00:00:00.000Z' };
  const state: ProjectCommandState = { activeRunId: 'run', approvedByArchitect: true };
  const bodies: unknown[] = [
    { command: 'approve-architecture', targetArchitecture: 'rap' },
    { command: 'revoke-architecture' },
    { command: 'record-usage-report', usageReport: { records: [], source: 'manual', importedAt: 'x', warnings: [] } },
    { command: 'record-atc-report', atcReport: { findings: [], source: 'atc', importedAt: 'x', warnings: [] } },
  ];
  const written = new Set<string>();
  for (const body of bodies) {
    const result = validateProjectCommand(body, state, actor);
    if (result.ok) for (const key of Object.keys(result.fields)) written.add(key);
  }
  return [...written].sort();
}
