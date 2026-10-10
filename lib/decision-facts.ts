import type { DocumentReference, Query, Transaction } from 'firebase-admin/firestore';
import type { getAdminDb } from '@/lib/firebase-admin';
import { sha256Hex, signOffKey } from '@/lib/artefact-digest';
import { contractOfProject, inputsDifferingFromRun } from '@/lib/contract-build';
import type { SignOffBasis } from '@/lib/project-decision-build';
import { evidenceDigest } from '@/lib/run-evidence-digest';
import { isDecisionTag, parseBpmn } from '@/lib/process-map';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { PROCESS_REVISION_COLLECTION, isProcessRevisionRecord } from '@/lib/process-revisions';
import {
  PROCESS_STATE_COLLECTION,
  PROCESS_STATE_FORMAT_VERSION,
  isStateEntry,
  readProcessStates,
  type StateEntry,
} from '@/lib/process-states';
import { deriveDecisionDraft, type DecisionDraftAnswer, type DecisionDraftFacts } from '@/lib/decision-draft';
import type { InputManifest } from '@/lib/input-manifest';

/**
 * The decision of one project as the server derives it from the project's own
 * sources — roadmap 8.4. Server-only: it reaches the architecture contract, and
 * with it the merged SAP catalog.
 *
 * Two callers, one derivation. `GET /api/projects/{id}/decision` shows the
 * result to the card; `POST /api/projects/{id}/commands` (`confirm-decision`)
 * compares the stored record with it. The second is why this is a module and
 * not code in the first route: a decision record arrives from the browser, and
 * `normaliseProjectDecision()` can only check its shape and its fingerprint —
 * the bindings, conditions and reversibility in it are whatever the sender
 * wrote. A confirmation is only a confirmation of *this product's* decision
 * when the record equals what the server derives here (QA review of
 * 4b4586aff273).
 */

/** The bound `/api/projects/{id}/findings` and `/contract` set, for the same reason. */
export const DECISION_MAX_SOURCE_BYTES = 400_000;

/** `process-states` derives rules only up to this size (quadratic); above it the need is not counted. */
const MAX_RULE_SOURCE_BYTES = 256 * 1024;

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

/** A Firestore Timestamp, a Date or an ISO string, as ISO — or `null`. */
function isoOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

function manifestOfRun(run: Record<string, unknown> | null): InputManifest | null {
  const manifest = run?.inputManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as Partial<InputManifest>;
  return typeof m.hash === 'string' && Array.isArray(m.inputs) ? (manifest as InputManifest) : null;
}

/**
 * The newest confirmed need revision and what it says, counted against the
 * subjects that exist — the same count `process-states` makes.
 *
 * `undecided: null` whenever the subjects cannot be read: no revision 1, a
 * source that moved since it was reconstructed, or one too large to derive
 * rules from in one request. "Not counted" is not "none undecided".
 *
 * What is counted as undecided (ADR-085): the rules and the decision points
 * of the reconstructed process without a business answer — what the decision
 * asks the business, and what the rules card and the walk-through put in front
 * of it. Every other element (steps, starts, ends, error boundaries) may still
 * be answered and is stored in the same need revision; it is not counted here.
 * Before ADR-085 every element of the map was, and a 40-line program read as
 * "84 process elements have no confirmed state".
 */
async function needFactsOf(
  db: AdminDb,
  projectId: string,
  source: string,
  tx: Transaction | undefined,
): Promise<DecisionDraftFacts['need']> {
  const projectRef = db.collection('projects').doc(projectId);

  let revision = 0;
  let entries: StateEntry[] = [];
  const newestState: Query = projectRef.collection(PROCESS_STATE_COLLECTION).orderBy('revision', 'desc').limit(1);
  const statesSnap = await (tx ? tx.get(newestState) : newestState.get());
  if (!statesSnap.empty) {
    const data = (statesSnap.docs[0].data() || {}) as Record<string, unknown>;
    if (data.formatVersion === PROCESS_STATE_FORMAT_VERSION && typeof data.revision === 'number') {
      revision = data.revision;
      entries = (Array.isArray(data.entries) ? data.entries : [])
        .map((e) => {
          const entry = e as Record<string, unknown>;
          return { ...entry, confirmedAt: isoOf(entry.confirmedAt) ?? '' } as StateEntry;
        })
        .filter(isStateEntry);
    }
  }

  let undecided: number | null = null;
  let open: DecisionDraftFacts['need']['open'] = null;
  let drops = entries.filter((e) => e.state === 'drop').length;
  const baselineRef: DocumentReference = projectRef.collection(PROCESS_REVISION_COLLECTION).doc('1');
  const baselineSnap = await (tx ? tx.get(baselineRef) : baselineRef.get());
  if (baselineSnap.exists) {
    const baseline = baselineSnap.data() as Record<string, unknown>;
    const record = { ...baseline, savedAt: isoOf(baseline.savedAt) ?? '' };
    if (
      isProcessRevisionRecord(record) &&
      Buffer.byteLength(source, 'utf8') <= MAX_RULE_SOURCE_BYTES &&
      sha256Hex(source) === record.sourceSha256
    ) {
      const parsed = parseBpmn(record.xml).elements;
      const elements = parsed.map((e) => e.id);
      const decisions = parsed.filter((e) => isDecisionTag(e.tag)).map((e) => e.id);
      const rules = deriveBusinessRules(source).rules.map((r) => r.id);
      const states = readProcessStates(entries, { elements, rules });
      // Counted over the subjects that still exist, like the rest of the need.
      drops = states.counts.drop;
      open = {
        rules: readProcessStates(entries, { elements: [], rules }).counts.undecided,
        decisions: readProcessStates(entries, { elements: decisions, rules: [] }).counts.undecided,
      };
      undecided = open.rules + open.decisions;
    }
  }

  return { revision: revision > 0 ? revision : null, confirmedDrops: drops, undecided, open };
}

/**
 * The architecture sign-off as the project records it, and whether it can
 * still be stood on — what a decision whose option generates nothing rests on
 * in place of a contract (G4-F1). `null` when nothing is signed off.
 *
 * "Current" asks what a contract would have asked for a rebuild: is the source
 * on the project the source the run read (`inputsDifferingFromRun`, as
 * `contractOfProject` does), and was the sign-off given after the last change
 * of source or profile (`auditMetadata.sourceChange.signOff`, the rule
 * `/api/audit-pack/create` and `lib/workflow-steps.ts` apply). A re-run of the
 * same source leaves the sign-off standing, as it does for a rebuild.
 */
export function signOffFactsOf(
  data: Record<string, unknown>,
  manifest: InputManifest | null,
): SignOffBasis | null {
  if (data.approvedByArchitect !== true) return null;
  const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
  const auditMetadata = (data.auditMetadata ?? {}) as {
    sourceChange?: { signOff?: unknown; reason?: unknown };
    inputFingerprint?: { sha256?: unknown };
  };

  let notCurrent: string | null = null;
  const given = signOffKey(data.architectSignOffAt);
  const change = auditMetadata.sourceChange;
  if (given && typeof change?.signOff === 'string' && change.signOff === given) {
    notCurrent =
      change.reason === 'profile'
        ? 'It was given for a previous target profile. Sign off again on the current analysis.'
        : 'It was given for a previous source. Sign off again on the current analysis.';
  } else {
    const deployment =
      data.s4Deployment === 'private' ? 'private' : data.s4Deployment === 'public' ? 'public' : undefined;
    const differ = manifest
      ? inputsDifferingFromRun(manifest, source, deployment)
      : typeof auditMetadata.inputFingerprint?.sha256 === 'string' && auditMetadata.inputFingerprint.sha256 !== sha256Hex(source)
        ? ['source']
        : [];
    if (differ.length > 0) {
      notCurrent = `The ${differ.join(' and ')} on the project is not what the analysis run read. Re-run the analysis and sign off on what it says.`;
    }
  }

  return {
    by: typeof data.approvedBy === 'string' && data.approvedBy ? data.approvedBy : null,
    at: isoOf(data.architectSignOffAt),
    reason: typeof data.architectJustifiedOverride === 'string' ? data.architectJustifiedOverride.trim() : '',
    notCurrent,
  };
}

export type ProjectDecisionDerivation =
  | { ok: true; answer: DecisionDraftAnswer; runId: string | null; evidenceDigest: string | null }
  | { ok: false; code: 'no-source' | 'too-large' };

/**
 * Derive the decision of the project `data` is the document of. `data.decision` is the stored record.
 *
 * `tx`: the transaction `data` was read in. A confirmation passes it, so the
 * run, the newest need revision and the baseline are read in the same
 * transaction as the project — a need revision written after these reads and
 * before the confirmation commits then aborts the confirmation instead of
 * leaving it bound to the revision before (QA review of 8adfa0e6db63).
 */
export async function deriveProjectDecision(
  db: AdminDb,
  projectId: string,
  data: Record<string, unknown>,
  now: string,
  tx?: Transaction,
): Promise<ProjectDecisionDerivation> {
  const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
  if (!source.trim()) return { ok: false, code: 'no-source' };
  if (Buffer.byteLength(source, 'utf8') > DECISION_MAX_SOURCE_BYTES) return { ok: false, code: 'too-large' };

  let run: Record<string, unknown> | null = null;
  const activeRunId = typeof data.activeRunId === 'string' && data.activeRunId ? data.activeRunId : null;
  if (activeRunId) {
    const runRef: DocumentReference = db.collection('projects').doc(projectId).collection('runs').doc(activeRunId);
    const runSnap = await (tx ? tx.get(runRef) : runRef.get());
    run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
  }
  const digest = run ? evidenceDigest(run) : null;

  const manifest = manifestOfRun(run);
  const built = contractOfProject(data, manifest);
  const auditMetadata = (data.auditMetadata ?? {}) as { auditPackExportedAt?: unknown };

  const answer = deriveDecisionDraft({
    runId: run ? activeRunId : null,
    evidenceDigest: digest,
    runSignedAt: run ? isoOf(run.createdAt) : null,
    contract: built.ok ? built.contract : null,
    // A recommendation nobody signed off is not a chosen option.
    signedOffArchitecture:
      data.approvedByArchitect === true && typeof data.targetArchitecture === 'string'
        ? data.targetArchitecture
        : null,
    signOff: signOffFactsOf(data, manifest),
    need: await needFactsOf(db, projectId, source, tx),
    handedOver: isoOf(auditMetadata.auditPackExportedAt) !== null,
    stored: data.decision,
    now,
  });
  return { ok: true, answer, runId: run ? activeRunId : null, evidenceDigest: digest };
}
