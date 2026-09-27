import { sha256Hex } from './artefact-digest';
import {
  STATEMENT_PROMPT_FORMAT_VERSION,
  buildStatementContext,
  buildStatementPrompt,
  type ProposedStatement,
  type StatementContext,
  type StatementDiscardTally,
} from './business-statement-prompt';
import {
  NOT_GENERATED,
  absenceFromError,
  modelAbsenceReason,
  type ModelAbsence,
  type ModelStage,
} from './model-stages';
import {
  checkStatementAgainstCode,
  contradictionSourceOf,
  type StatementContradiction,
} from './statement-contradiction';

/**
 * The model's business sentences in the product — roadmap 17.10.
 *
 * Sonny's decision of 27.09.2026, after five judges had read 2,273 target
 * sentences blind: Weg B (`lib/business-statement-prompt.ts`) meets the
 * business sense far more often (86.5 % "same" against 10.3 % for Weg A), and
 * invents more often (39 false statements against 11). So B supplies the
 * readable sentence, marked *Model proposal*; A's sentence stands beneath it
 * as the evidence, marked *Reconstructed*; and where the code at B's anchors
 * says otherwise, `lib/statement-contradiction.ts` marks it.
 *
 * The whole construction is the naming stage's (`lib/process-naming.ts`), on
 * purpose:
 *
 *   - **One way out.** The browser asks `/api/gemini` under the `statements`
 *     stage — the per-stage switch, the missing key, BYOK and the per-account
 *     rate limit are all answered there — and posts the answer as it came back,
 *     with the receipt the proxy issued over exactly those bytes.
 *   - **The server validates.** `POST /api/projects/{id}/statement-proposal`
 *     rebuilds the context from the stored source, refuses a digest that is not
 *     the project's, refuses an answer without a verifying receipt, and runs
 *     `validateStatementAnswer`: an anchor on no ABAP statement, an element off
 *     its anchor, a key outside the format — dropped and counted, never
 *     repaired.
 *   - **Outside every signature.** Stored at
 *     `projects/{id}/statement_proposal/current` by the Admin SDK, never in a
 *     run, a receipt or an audit pack. A sentence is a reading; its wording may
 *     change without any receipt breaking.
 *   - **Asked for, never automatic.** Once per source; a second request is a
 *     second click, and the button says what it costs before it is pressed.
 *
 * The contradiction check is not stored. It runs where the sentences are
 * shown, against the same source, so a better rule applies to every stored
 * proposal the next time it is read.
 *
 * Pure: the browser and the route both read this file.
 */

/** The model stage this module calls under (`lib/model-stages.ts`). */
export const STATEMENT_STAGE = 'statements' satisfies ModelStage;

/** Bumped only when the stored record changes shape. */
export const STATEMENT_PROPOSAL_FORMAT_VERSION = 1;

/**
 * The file name the prompt and the anchors use. One source per project, so one
 * fixed name: the browser and the server have to build the same prompt, and a
 * name from the upload would be one more thing to agree on.
 */
export const STATEMENT_SOURCE_NAME = 'source.abap';

/** What the button says before it is pressed — DESIGN.md §2.8: what it costs, and whether a model is called. */
export const STATEMENT_COST_LINE =
  'One model call. Not counted against your analysis runs; it counts toward the hourly limit on model calls of this account.';
export const STATEMENT_COST_LINE_BYOK =
  'One model call, with your own Gemini key. Not counted against your analysis runs; it counts toward the hourly limit on model calls of this account.';

/** What the reader keeps when there is no proposal. */
export const EVIDENCE_KEPT = 'The sentences reconstructed from the code stand as they are.';

/* ------------------------------------------------------------------ *
 * The context: the one source, and a fingerprint of it.
 * ------------------------------------------------------------------ */

export interface StatementProposalContext {
  statementContext: StatementContext;
  /** `bs1-` + SHA-256 of the source as the prompt reads it, with the prompt's format version. */
  digest: string;
}

function normalise(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

export function statementDigestOf(source: string): string {
  return `bs${STATEMENT_PROMPT_FORMAT_VERSION}-${sha256Hex(normalise(source))}`;
}

export function statementProposalContextOf(source: string): StatementProposalContext {
  return {
    statementContext: buildStatementContext([{ name: STATEMENT_SOURCE_NAME, code: normalise(source) }]),
    digest: statementDigestOf(source),
  };
}

export function buildStatementProposalPrompt(context: StatementProposalContext): string {
  return buildStatementPrompt(context.statementContext);
}

/* ------------------------------------------------------------------ *
 * The stored record.
 * ------------------------------------------------------------------ */

/**
 * Where the sentences came from. Written by the server after it verified the
 * receipt `/api/gemini` issued for exactly this answer — the browser cannot
 * produce one of these. The same shape as the naming stage's origin.
 */
export interface StatementProposalOrigin {
  source: 'model';
  receipt: 'verified';
  provider: string;
  modelId: string;
  byok: boolean;
  /** When the model call happened, ms since the epoch — the receipt's `iat`. */
  issuedAt: number;
  /** SHA-256 of the answer. The answer itself is not kept. */
  textSha256: string;
}

export interface StatementProposalRecord {
  formatVersion: typeof STATEMENT_PROPOSAL_FORMAT_VERSION;
  /** `statementDigestOf` of the source the sentences were validated against. */
  digest: string;
  statements: ProposedStatement[];
  discarded: StatementDiscardTally;
  origin: StatementProposalOrigin;
  /** ISO time the server stored the proposal. */
  proposedAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProposedStatement(value: unknown): value is ProposedStatement {
  if (!isPlainObject(value)) return false;
  return typeof value.id === 'string'
    && typeof value.text === 'string'
    && typeof value.core === 'string'
    && value.provenance === 'proposed'
    && (value.uncertainty === null || (isPlainObject(value.uncertainty) && typeof value.uncertainty.note === 'string'))
    && (value.element === null || (isPlainObject(value.element) && typeof value.element.id === 'string'))
    && Array.isArray(value.anchors) && value.anchors.length > 0
    && value.anchors.every((a) => isPlainObject(a) && typeof a.file === 'string'
      && typeof a.lineStart === 'number' && typeof a.lineEnd === 'number');
}

/** Shape check for a record that arrives over the wire. Anything else is treated as absent. */
export function isStatementProposalRecord(value: unknown): value is StatementProposalRecord {
  if (!isPlainObject(value)) return false;
  const origin = value.origin;
  const discarded = value.discarded;
  return value.formatVersion === STATEMENT_PROPOSAL_FORMAT_VERSION
    && typeof value.digest === 'string'
    && typeof value.proposedAt === 'string'
    && Array.isArray(value.statements) && value.statements.every(isProposedStatement)
    && isPlainObject(discarded) && typeof discarded.total === 'number' && isPlainObject(discarded.byRule)
    && isPlainObject(origin) && origin.source === 'model' && origin.receipt === 'verified'
    && typeof origin.modelId === 'string' && typeof origin.provider === 'string';
}

/* ------------------------------------------------------------------ *
 * Applying a proposal — what the documentation draws.
 * ------------------------------------------------------------------ */

export interface CheckedProposal extends ProposedStatement {
  /** What `lib/statement-contradiction.ts` found at the sentence's anchors, or null. */
  contradiction: StatementContradiction | null;
}

export type ProposalState = 'proposed' | 'not-requested' | 'stale';

export interface ProposalView {
  state: ProposalState;
  /** Empty unless `state` is `proposed`. In source order. */
  statements: CheckedProposal[];
  /**
   * One sentence for the reader, or null when the proposals are shown and
   * nothing needs saying. Never an error tone: without a proposal, the evidence
   * stands alone, as it did before.
   */
  notice: string | null;
  counts: { statements: number; discarded: number | null; contradicts: number; unsupported: number };
  origin: StatementProposalOrigin | null;
  proposedAt: string | null;
}

const firstLine = (s: ProposedStatement) => Math.min(...s.anchors.map((a) => a.lineStart));

/**
 * The stored proposal for this source, checked against it — or the reason there
 * is none. A proposal made for another reading of the source is not shown.
 */
export function applyStatementProposal(
  source: string,
  record: StatementProposalRecord | null | undefined,
  absence: ModelAbsence = null,
): ProposalView {
  const digest = statementDigestOf(source);
  const usable = record && record.formatVersion === STATEMENT_PROPOSAL_FORMAT_VERSION && record.digest === digest ? record : null;
  const state: ProposalState = usable ? 'proposed' : record ? 'stale' : 'not-requested';

  let statements: CheckedProposal[] = [];
  if (usable) {
    const code = contradictionSourceOf(source);
    statements = usable.statements
      .map((s) => ({ ...s, contradiction: checkStatementAgainstCode(code, { text: s.text, anchors: s.anchors }) }))
      .sort((a, b) => firstLine(a) - firstLine(b));
  }

  let notice: string | null = null;
  if (state === 'not-requested' && absence) {
    notice = `${NOT_GENERATED}. ${modelAbsenceReason(absence, STATEMENT_STAGE)} ${EVIDENCE_KEPT}`;
  } else if (state === 'stale') {
    notice = `Not shown. These business sentences were proposed for an earlier version of this source. ${EVIDENCE_KEPT}`;
  } else if (state === 'proposed' && statements.length === 0) {
    const dropped = usable?.discarded.total ?? 0;
    notice = `No usable sentence. Nothing in the model's answer fit this source (${dropped} ${dropped === 1 ? 'proposal' : 'proposals'} dropped). ${EVIDENCE_KEPT}`;
  }

  return {
    state,
    statements,
    notice,
    counts: {
      statements: statements.length,
      discarded: usable ? usable.discarded.total : null,
      contradicts: statements.filter((s) => s.contradiction?.verdict === 'contradicts').length,
      unsupported: statements.filter((s) => s.contradiction?.verdict === 'unsupported').length,
    },
    origin: usable?.origin ?? null,
    proposedAt: usable?.proposedAt ?? null,
  };
}

interface Anchored {
  anchors: ReadonlyArray<{ lineStart: number; lineEnd: number }>;
}

const overlaps = (a: Anchored, range: { lineStart: number; lineEnd: number }) =>
  a.anchors.some((span) => span.lineStart <= range.lineEnd && range.lineStart <= span.lineEnd);

/**
 * The proposal standing at one element: the first whose anchors contain the
 * element's first line, else the first that overlaps its range. Null when
 * none does — the element then shows its reconstructed sentence alone.
 */
export function proposalAt(
  proposals: readonly CheckedProposal[],
  anchor: { lineStart: number; lineEnd: number } | null,
): CheckedProposal | null {
  if (!anchor) return null;
  return (
    proposals.find((p) => overlaps(p, { lineStart: anchor.lineStart, lineEnd: anchor.lineStart }))
    ?? proposals.find((p) => overlaps(p, anchor))
    ?? null
  );
}

export interface PairedRow<E extends Anchored> {
  /** The model's sentences for these lines, on top. Empty when it said nothing here. */
  proposals: CheckedProposal[];
  /** The reconstructed sentence beneath them, or null when the engine formed none at these lines. */
  evidence: E | null;
}

/**
 * The whole-program list: every reconstructed sentence, each with the model's
 * sentences that share a line with it on top, and the model's sentences no
 * reconstructed one meets as rows of their own — in the order of the program.
 * No sentence of either side is dropped.
 */
export function pairWithEvidence<E extends Anchored>(
  evidence: readonly E[],
  proposals: readonly CheckedProposal[],
): PairedRow<E>[] {
  const taken = new Set<CheckedProposal>();
  const rows: Array<PairedRow<E> & { line: number }> = evidence.map((e) => {
    const mine = proposals.filter((p) => !taken.has(p) && e.anchors.some((range) => overlaps(p, range)));
    mine.forEach((p) => taken.add(p));
    return { proposals: mine, evidence: e, line: Math.min(...e.anchors.map((a) => a.lineStart)) };
  });
  for (const p of proposals) {
    if (!taken.has(p)) rows.push({ proposals: [p], evidence: null, line: firstLine(p) });
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.line - b.row.line || a.index - b.index)
    .map(({ row }) => ({ proposals: row.proposals, evidence: row.evidence }));
}

/* ------------------------------------------------------------------ *
 * Asking for a proposal — the sequence, with its two calls injected.
 * ------------------------------------------------------------------ */

export interface StatementSubmission {
  digest: string;
  text: string;
  receipt: unknown;
}

export interface StatementAvailability {
  known: boolean;
  keyAvailable: boolean;
  stages: Partial<Record<string, boolean>>;
}

export interface StatementRequestDeps {
  /** `/api/gemini` with `stage: 'statements'`. Throws with the route's message on refusal. */
  callModel: (prompt: string) => Promise<{ text: string; receipt: unknown }>;
  /** `POST /api/projects/{id}/statement-proposal`. */
  store: (submission: StatementSubmission) => Promise<
    { ok: true; record: StatementProposalRecord } | { ok: false; status: number; error: string }
  >;
}

export type StatementRequestOutcome =
  | { ok: true; record: StatementProposalRecord }
  | { ok: false; absence: 'no-key' | 'stage-off' | 'failed'; message: string };

/** Why no call should be made at all, when that is already known — a refusal still costs a rate-limit slot. */
export function statementAbsenceBeforeCall(availability: StatementAvailability | null | undefined): 'no-key' | 'stage-off' | null {
  if (!availability?.known) return null;
  if (!availability.keyAvailable) return 'no-key';
  if (availability.stages[STATEMENT_STAGE] === false) return 'stage-off';
  return null;
}

/**
 * Prompt → model → route. Never throws: every way it can end is an outcome
 * the page can show beside the reconstructed sentences. The answer is posted
 * as it came back — the receipt is a MAC over those bytes.
 */
export async function runStatementRequest(
  context: StatementProposalContext,
  deps: StatementRequestDeps,
  availability?: StatementAvailability | null,
): Promise<StatementRequestOutcome> {
  const before = statementAbsenceBeforeCall(availability);
  if (before) return { ok: false, absence: before, message: modelAbsenceReason(before, STATEMENT_STAGE) };

  let answer: { text: string; receipt: unknown };
  try {
    answer = await deps.callModel(buildStatementProposalPrompt(context));
  } catch (err) {
    const absence = absenceFromError(err);
    const reason = absence === 'failed' && err instanceof Error && err.message ? err.message : modelAbsenceReason(absence, STATEMENT_STAGE);
    return { ok: false, absence: absence === 'declined' ? 'failed' : absence, message: reason };
  }

  try {
    const stored = await deps.store({ digest: context.digest, text: answer.text, receipt: answer.receipt });
    if (stored.ok) return stored;
    return { ok: false, absence: 'failed', message: stored.error };
  } catch (err) {
    return { ok: false, absence: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
