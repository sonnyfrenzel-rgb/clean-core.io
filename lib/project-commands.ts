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

import {
  EVIDENCE_DIGEST_MAX_CHARS,
  describeEvidenceDiff,
  evidenceDiff,
  evidenceDigest,
  parseEvidenceDigest,
  type EvidenceChange,
} from '@/lib/run-evidence-digest';
import {
  SELF_DECLARATION,
  decisionCoverage,
  emptyProjectDecision,
  normaliseProjectDecision,
} from '@/lib/project-decision';

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
export const SERVER_ONLY_PROJECT_FIELDS = [...RELEASE_FIELDS, 'usageReport', 'atcReport', 'decision'] as const;

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

/** Keys of a single finding the server stores; anything else is dropped. */
const ATC_FINDING_KEYS = [
  'objectName',
  'objectType',
  'checkId',
  'checkTitle',
  'message',
  'priority',
  'line',
  'exempted',
] as const;

/**
 * Keys of a quarantined row, from `AtcQuarantineEntry` in `lib/abap/atc-model.ts`:
 * the spreadsheet row, the object name as far as it was readable, and why the
 * parser could not use it. Written from the model rather than from memory — the
 * first cut of this list guessed `raw`, dropped `row` and `objectName`, and
 * `tests/atc-import-guard.spec.ts` caught it on the stored shape.
 */
const ATC_QUARANTINE_KEYS = ['row', 'objectName', 'reason'] as const;

/** A ceiling per string, so one row cannot carry a document. Exported so the
 * guard measures the edge against this number and not a typed-in copy of it. */
export const ATC_FIELD_MAX_CHARS = 4000;

/**
 * One row, reduced to the keys the model declares.
 *
 * The top level was closed from the start; the rows were not, and a QA review of
 * a81b30dc12a9 said so. The browser parses, then posts what it parsed — so
 * without this, a crafted request stores finding objects of any shape, and the
 * closed `AtcFinding` type is a promise only the browser keeps. Unknown keys are
 * dropped rather than refused: a newer export carrying an extra column should
 * import, it just should not persist a field nothing reads.
 *
 * What this does **not** do is enforce privacy. The personal-data hint is a
 * warning with an acknowledgement and deliberately not a control (Sonny,
 * 18.09.2026), so the server cannot and must not claim to have filtered
 * anything — it bounds the shape, not the meaning.
 */
function normaliseAtcRow(
  row: unknown,
  keys: readonly string[],
  required: readonly string[],
): Record<string, unknown> | null {
  if (!isPlainObject(row)) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = row[key];
    if (v === undefined) continue;
    if (typeof v === 'string') out[key] = v.length > ATC_FIELD_MAX_CHARS ? v.slice(0, ATC_FIELD_MAX_CHARS) : v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    // Anything else — an object, a list, a NaN — is not a field of a row.
  }
  for (const key of required) {
    if (typeof out[key] !== 'string' || (out[key] as string).length === 0) return null;
  }
  return out;
}

/**
 * The ATC import, reduced to the fields the model declares — the same
 * shallow contract `normaliseUsageReport` keeps: a closed top-level key set,
 * a closed source vocabulary and a ceiling on size, and since the QA review of
 * a81b30dc12a9 a closed key set per row as well. Which rows are worth keeping,
 * and what the personal-data hint says about them, stays the browser's parser's
 * job (`lib/abap/atc-parser.ts`, `lib/abap/atc-privacy.ts`); the shape of what
 * gets stored is the part the browser cannot be trusted with regardless of what
 * its own code does.
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

  // A row that cannot carry its two required fields is refused outright rather
  // than dropped: a silently shorter list would be a wrong count, and this
  // import's whole point is that ATC's numbers stay ATC's numbers.
  const findings: Record<string, unknown>[] = [];
  for (const row of value.findings) {
    const clean = normaliseAtcRow(row, ATC_FINDING_KEYS, ['objectName', 'message']);
    if (!clean) return { ok: false, error: 'atcReport.findings holds a row without an object name and a message.' };
    findings.push(clean);
  }

  const quarantined: Record<string, unknown>[] = [];
  for (const row of (value.quarantined as unknown[]) ?? []) {
    const clean = normaliseAtcRow(row, ATC_QUARANTINE_KEYS, ['reason']);
    if (!clean) return { ok: false, error: 'atcReport.quarantined holds a row without a reason.' };
    quarantined.push(clean);
  }

  const warnings = (value.warnings as unknown[])
    .filter((w): w is string => typeof w === 'string')
    .map((w) => (w.length > ATC_FIELD_MAX_CHARS ? w.slice(0, ATC_FIELD_MAX_CHARS) : w));

  const report: Record<string, unknown> = {};
  for (const key of ATC_REPORT_KEYS) {
    if (value[key] !== undefined) report[key] = value[key];
  }
  report.findings = findings;
  report.warnings = warnings;
  if (value.quarantined !== undefined) report.quarantined = quarantined;
  return { ok: true, report };
}

/* ---------------------------------------------------------------- commands */

export const PROJECT_COMMANDS = [
  'approve-architecture',
  'revoke-architecture',
  'record-usage-report',
  'record-atc-report',
  'record-decision-draft',
  'confirm-decision',
  'withdraw-decision',
] as const;
export type ProjectCommandName = (typeof PROJECT_COMMANDS)[number];

/** What a caller sends. The route validates it again; this only shapes it. */
export type ProjectCommandBody =
  | {
      command: 'approve-architecture';
      targetArchitecture: TargetArchitectureCode;
      justification?: string;
      /** Roadmap 8.8 — the run this sign-off was read from. Not optional. */
      expectedRunId: string;
      /** Roadmap 8.8 — `evidenceDigest()` of that run, as the reader saw it. */
      expectedEvidenceDigest: string;
    }
  | { command: 'revoke-architecture' }
  | { command: 'record-usage-report'; usageReport: unknown }
  | { command: 'record-atc-report'; atcReport: unknown }
  /** Roadmap 8.4 — the derived draft, normalised and re-fingerprinted by the server. */
  | { command: 'record-decision-draft'; decision: unknown }
  | {
      command: 'confirm-decision';
      /** The fingerprint of the draft the reader confirmed, as their screen showed it. */
      expectedDecisionFingerprint: string;
      /** Roadmap 8.8, unchanged and not negotiable: the run the decision was read from. */
      expectedRunId: string;
      expectedEvidenceDigest: string;
    }
  | { command: 'withdraw-decision' };

/** The part of the project document a command is allowed to look at. */
export interface ProjectCommandState {
  activeRunId?: unknown;
  approvedByArchitect?: unknown;
  originalRecommendation?: unknown;
  extensibilityRoute?: unknown;
  /**
   * Roadmap 8.8 — `evidenceDigest()` of `projects/{id}/runs/{activeRunId}`,
   * computed by the caller from the **run document** inside the same
   * transaction that reads `activeRunId`. Never from the project document:
   * every field of that one is the owner's to write, and a sign-off bound to
   * something the approver can rewrite is not bound (`lib/audit-pack-build.ts`
   * drew the same line for the signed half of the audit pack).
   *
   * `null` means the run could not be read; `undefined` means the caller did
   * not supply it. Both refuse a sign-off, and deliberately in the same way —
   * a caller that cannot say what the evidence is cannot approve it.
   */
  activeRunEvidence?: string | null;
  /**
   * Roadmap 8.4 — the decision record stored on the project, exactly as it
   * sits there. Read raw and normalised again here rather than trusted: the
   * document was written by a previous command, but the fingerprint on it is
   * still only a claim until this file recomputes it, and a confirmation
   * compared against a claimed fingerprint would bind nothing.
   */
  decision?: unknown;
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
  /**
   * Roadmap 8.8 — field name, what the caller read, what the run says now.
   * Present on `run-moved` and `evidence-moved` and on nothing else. The
   * sentence in `error` already carries the same content for a reader; this is
   * the machine-readable half, so a screen can lay it out as a table without
   * parsing prose.
   */
  details?: EvidenceChange[];
  /** The run the project actually stands on, when that is the disagreement. */
  activeRunId?: string;
}

export interface ProjectCommandWrite {
  ok: true;
  /** What goes into the journal entry for this change. */
  action: string;
  /** The exact field/value pairs to merge onto the project document. */
  fields: Record<string, unknown>;
}

export type ProjectCommandResult = ProjectCommandWrite | ProjectCommandRefusal;

const refuse = (
  status: number,
  code: string,
  error: string,
  extra?: { details?: EvidenceChange[]; activeRunId?: string },
): ProjectCommandRefusal => ({
  ok: false,
  status,
  code,
  error,
  ...(extra?.details && extra.details.length > 0 ? { details: extra.details } : {}),
  ...(extra?.activeRunId ? { activeRunId: extra.activeRunId } : {}),
});

/**
 * Roadmap 8.8 · CR-11, once — for the sign-off and for the decision.
 *
 * The caller says which run it was read from and what that run said, and both
 * are compared here: inside the caller's transaction, against the project's
 * `activeRunId` and against the digest the caller computed from the **run
 * document**. A check before the transaction would be a window; this is the
 * same place 0.6 put its own comparison (`app/api/runs/create`, the re-read of
 * `legacyCode` at commit time, acceptance W22-A06), and it ends the same way:
 * 409, nothing written, and a refusal that says what to do.
 *
 * Required rather than optional. An optional binding is not one — a caller that
 * omits it gets the behaviour CR-11 describes, which is the behaviour 8.8
 * exists to remove.
 *
 * One function rather than two copies because roadmap 8.4 adds the second
 * caller: a decision bound to a run the decider never saw is CR-11 again under
 * a different name, and a second copy of this comparison is a second place for
 * it to come back.
 *
 * Returns `null` when the binding holds.
 */
function refuseUnlessBoundToReadRun(
  body: Record<string, unknown>,
  state: ProjectCommandState,
  what: 'sign-off' | 'decision',
): ProjectCommandRefusal | null {
  // `state.activeRunId` is `unknown` by declaration — the state is whatever the
  // project document happened to hold. Narrowed once, here, so that every
  // sentence below names a string and not the word `undefined`.
  const activeRunId = typeof state.activeRunId === 'string' && state.activeRunId.length > 0 ? state.activeRunId : '';
  const expectedRunId = body.expectedRunId;
  if (typeof expectedRunId !== 'string' || expectedRunId.length === 0) {
    return refuse(
      400,
      'missing-expected-run',
      `A ${what} names the run it was read from. Send expectedRunId and expectedEvidenceDigest.`,
    );
  }
  const expectedEvidence = body.expectedEvidenceDigest;
  if (typeof expectedEvidence !== 'string' || expectedEvidence.length === 0) {
    return refuse(
      400,
      'missing-evidence-digest',
      `A ${what} names the evidence it was read from. Send expectedEvidenceDigest alongside expectedRunId.`,
    );
  }
  if (expectedEvidence.length > EVIDENCE_DIGEST_MAX_CHARS || parseEvidenceDigest(expectedEvidence) === null) {
    return refuse(
      400,
      'malformed-evidence-digest',
      'expectedEvidenceDigest is not a digest this server can read. Reload the analysis and try again.',
    );
  }
  // `null` (the run could not be read) and `undefined` (the caller did not
  // look) end here together. Conservative on purpose, like 0.6: an evidence
  // digest that cannot be established is not an unchanged one.
  const actualEvidence = state.activeRunEvidence;
  if (typeof actualEvidence !== 'string' || actualEvidence.length === 0) {
    return refuse(
      409,
      'run-unreadable',
      `The signed analysis run ${activeRunId} of this project could not be read, so there is nothing to bind this ${what} to. Nothing was written.`,
      { activeRunId: activeRunId || undefined },
    );
  }
  if (expectedRunId !== activeRunId) {
    const changes = evidenceDiff(expectedEvidence, actualEvidence);
    const detail = describeEvidenceDiff(changes);
    return refuse(
      409,
      'run-moved',
      `This ${what} was prepared on analysis run ${expectedRunId}, and run ${activeRunId} has been this project's analysis since. Nothing was written and nothing was moved to the newer run. ` +
        (detail
          ? `What changed: ${detail}. `
          : 'The two runs agree on every fact this comparison names, but they are not the same run. ') +
        `Open the current analysis, read it, and ${what === 'sign-off' ? 'sign off on' : 'decide on'} that.`,
      { details: changes, activeRunId: typeof state.activeRunId === 'string' ? state.activeRunId : undefined },
    );
  }
  if (expectedEvidence !== actualEvidence) {
    const changes = evidenceDiff(expectedEvidence, actualEvidence);
    const detail = describeEvidenceDiff(changes);
    return refuse(
      409,
      'evidence-moved',
      `This ${what} names analysis run ${activeRunId}, and the evidence that run carries is not the evidence this ${what} was read from. Nothing was written. ` +
        (detail ? `What changed: ${detail}. ` : '') +
        `Reload the analysis and ${what === 'sign-off' ? 'sign off on' : 'decide on'} what it says now.`,
      { details: changes, activeRunId: typeof state.activeRunId === 'string' ? state.activeRunId : undefined },
    );
  }
  return null;
}

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

    // ------------------------------------------------ roadmap 8.8 · CR-11
    //
    // The sign-off says which run it was read from and what that run said, and
    // both are compared here — inside the caller's transaction, against the
    // project's `activeRunId` and against the digest the caller computed from
    // the run document. A check before the transaction would be a window; this
    // is the same place 0.6 put its own comparison (`app/api/runs/create`, the
    // re-read of `legacyCode` at commit time, acceptance W22-A06), and it ends
    // the same way: 409, nothing written, and a refusal that says what to do.
    //
    // Required rather than optional. An optional binding is not one — a caller
    // that omits it gets the behaviour CR-11 describes, which is the behaviour
    // this step exists to remove.
    const unbound = refuseUnlessBoundToReadRun(body, state, 'sign-off');
    if (unbound) return unbound;

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

  if (command === 'record-atc-report') {
    const atc = normaliseAtcReport(body.atcReport);
    if (!atc.ok) return refuse(400, 'malformed-atc-report', atc.error);
    return { ok: true, action: 'PROJECT_ATC_REPORT_RECORDED', fields: { atcReport: atc.report } };
  }

  /* ------------------------------------------------------- roadmap 8.4 */

  if (command === 'record-decision-draft') {
    // The draft is derived (`lib/project-decision-build.ts`), but it arrives
    // over the wire, so it is read the way `atcReport` is read: a closed key
    // set, closed vocabularies, ceilings — and, the part only this record
    // needs, a fingerprint recomputed rather than believed.
    const draft = normaliseProjectDecision(body.decision);
    if (!draft.ok) return refuse(400, 'malformed-decision', draft.error);
    return {
      ok: true,
      action: 'PROJECT_DECISION_DRAFTED',
      // `status` and `confirmation` come from here and from nowhere else. A
      // draft that could arrive already confirmed would make the confirmation
      // command decorative, which is the shape `approvedBy` had before 0.7.
      fields: { decision: { ...draft.decision, status: 'draft', confirmation: null } },
    };
  }

  if (command === 'confirm-decision') {
    if (typeof state.activeRunId !== 'string' || state.activeRunId.length === 0) {
      return refuse(409, 'no-run', 'The project has no signed analysis run to decide on.');
    }
    // Same binding as the sign-off, same function, same refusals. 8.8's CR-11
    // is about a confirmation bound to a run nobody read, and a decision is a
    // confirmation.
    const unbound = refuseUnlessBoundToReadRun(body, state, 'decision');
    if (unbound) return unbound;

    const expectedFingerprint = body.expectedDecisionFingerprint;
    if (typeof expectedFingerprint !== 'string' || expectedFingerprint.length === 0) {
      return refuse(
        400,
        'missing-decision-fingerprint',
        'A confirmation names the decision it confirms. Send expectedDecisionFingerprint.',
      );
    }
    if (state.decision === undefined || state.decision === null) {
      return refuse(409, 'no-decision', 'There is no decision draft on this project to confirm.');
    }
    const stored = normaliseProjectDecision(state.decision);
    if (!stored.ok) {
      return refuse(
        409,
        'decision-unreadable',
        `The decision stored on this project cannot be read back: ${stored.error} Nothing was written; draft it again.`,
      );
    }
    const storedStatus = isPlainObject(state.decision) ? state.decision.status : undefined;
    if (storedStatus === 'confirmed') {
      return refuse(409, 'already-confirmed', 'This decision is already confirmed. A change is a new revision.');
    }
    // The fingerprint the reader saw against the fingerprint of the record as
    // it is now — recomputed by `normaliseProjectDecision`, never taken off
    // the document. Same shape as the evidence comparison above, for the same
    // reason: a confirmation of a decision that has moved since it was read is
    // a confirmation of something else.
    if (expectedFingerprint !== stored.decision.fingerprint) {
      return refuse(
        409,
        'decision-moved',
        `This confirmation was prepared on decision ${expectedFingerprint.slice(0, 12)}, and the decision on this project is ${stored.decision.fingerprint.slice(0, 12)} (revision ${stored.decision.revision}). Nothing was written. Open the decision, read it, and confirm that.`,
      );
    }
    // The decision's own binding has to agree with the project's run as well.
    // The comparison above establishes that the *caller* read the current run;
    // this one establishes that the *decision* was derived from it. Two tabs
    // are enough to separate them: read decision A, re-analyse, reload the
    // page, confirm — the caller's digest is current and the decision's is not.
    if (stored.decision.boundRunId !== state.activeRunId) {
      return refuse(
        409,
        'decision-run-mismatch',
        `This decision was derived from analysis run ${stored.decision.boundRunId}, and run ${state.activeRunId} has been this project's analysis since. Nothing was written. Draft the decision again on the current analysis.`,
        { activeRunId: state.activeRunId },
      );
    }
    if (stored.decision.boundEvidenceDigest !== state.activeRunEvidence) {
      return refuse(
        409,
        'decision-evidence-mismatch',
        'This decision names evidence that is not the evidence its run carries. Nothing was written. Draft the decision again on the current analysis.',
        { activeRunId: state.activeRunId },
      );
    }
    const coverage = decisionCoverage(stored.decision);
    if (coverage.state === 'blocked') {
      return refuse(409, 'decision-blocked', `This decision cannot be confirmed. ${coverage.sentence}`);
    }
    return {
      ok: true,
      action: 'PROJECT_DECISION_CONFIRMED',
      fields: {
        decision: {
          ...stored.decision,
          status: 'confirmed',
          confirmation: {
            // The server's answer to "who", off the verified ID token — and the
            // sentence that says what that means, from `lib/provenance.ts` so
            // that the product carries one spelling of it.
            account: actor.email,
            at: actor.now,
            selfDeclaration: SELF_DECLARATION,
          },
        },
      },
    };
  }

  // The only command left: `withdraw-decision`. An `if` rather than a bare
  // fallthrough — a command added here later must say which one it is rather
  // than silently inheriting whatever sits last in the function.
  if (command === 'withdraw-decision') {
    const stored = normaliseProjectDecision(state.decision);
    const storedStatus = isPlainObject(state.decision) ? state.decision.status : undefined;
    if (!stored.ok || storedStatus !== 'confirmed') {
      return refuse(409, 'not-confirmed', 'There is no confirmed decision to withdraw.');
    }
    const confirmation = isPlainObject(state.decision) ? state.decision.confirmation : null;
    return {
      ok: true,
      action: 'PROJECT_DECISION_WITHDRAWN',
      fields: {
        // The confirmation stays on the record. Who confirmed it and when is
        // what happened, and a withdrawal that erased it would leave a decision
        // nobody ever made — the audit pack would then be missing the half that
        // explains why anything downstream exists.
        decision: { ...stored.decision, status: 'withdrawn', confirmation },
      },
    };
  }

  return refuse(400, 'unknown-command', `command must be one of ${PROJECT_COMMANDS.join(', ')}.`);
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
  // Roadmap 8.8: the sign-off is bound, so the derivation has to satisfy the
  // binding like any other caller. The digest is computed rather than typed —
  // a literal here would go stale the day a fact is added and this function
  // would silently stop reporting the field set of a sign-off.
  const runEvidence = evidenceDigest({});
  const state: ProjectCommandState = {
    activeRunId: 'run',
    approvedByArchitect: true,
    activeRunEvidence: runEvidence,
  };
  const bodies: unknown[] = [
    {
      command: 'approve-architecture',
      targetArchitecture: 'rap',
      expectedRunId: 'run',
      expectedEvidenceDigest: runEvidence,
    },
    { command: 'revoke-architecture' },
    { command: 'record-usage-report', usageReport: { records: [], source: 'manual', importedAt: 'x', warnings: [] } },
    { command: 'record-atc-report', atcReport: { findings: [], source: 'atc', importedAt: 'x', warnings: [] } },
    // Roadmap 8.4. The draft is built rather than typed out, for the reason the
    // digest above is computed: a literal decision record here would go stale
    // the day the model gains a binding, and this function would then report a
    // field set for a command that no longer validates.
    { command: 'record-decision-draft', decision: emptyProjectDecision() },
  ];
  const written = new Set<string>();
  for (const body of bodies) {
    const result = validateProjectCommand(body, state, actor);
    if (result.ok) for (const key of Object.keys(result.fields)) written.add(key);
  }
  return [...written].sort();
}
