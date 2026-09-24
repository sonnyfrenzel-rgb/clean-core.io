import type { getAdminDb } from '@/lib/firebase-admin';
import { sha256Hex } from '@/lib/artefact-digest';
import { contractOfProject } from '@/lib/contract-build';
import { evidenceDigest } from '@/lib/run-evidence-digest';
import { parseBpmn } from '@/lib/process-map';
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
 */
async function needFactsOf(
  db: AdminDb,
  projectId: string,
  source: string,
): Promise<DecisionDraftFacts['need']> {
  const projectRef = db.collection('projects').doc(projectId);

  let revision = 0;
  let entries: StateEntry[] = [];
  const statesSnap = await projectRef.collection(PROCESS_STATE_COLLECTION).orderBy('revision', 'desc').limit(1).get();
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
  let drops = entries.filter((e) => e.state === 'drop').length;
  const baselineSnap = await projectRef.collection(PROCESS_REVISION_COLLECTION).doc('1').get();
  if (baselineSnap.exists) {
    const baseline = baselineSnap.data() as Record<string, unknown>;
    const record = { ...baseline, savedAt: isoOf(baseline.savedAt) ?? '' };
    if (
      isProcessRevisionRecord(record) &&
      Buffer.byteLength(source, 'utf8') <= MAX_RULE_SOURCE_BYTES &&
      sha256Hex(source) === record.sourceSha256
    ) {
      const elements = parseBpmn(record.xml).elements.map((e) => e.id);
      const rules = deriveBusinessRules(source).rules.map((r) => r.id);
      const states = readProcessStates(entries, { elements, rules });
      undecided = states.counts.undecided;
      // Counted over the subjects that still exist, like the rest of the need.
      drops = states.counts.drop;
    }
  }

  return { revision: revision > 0 ? revision : null, confirmedDrops: drops, undecided };
}

export type ProjectDecisionDerivation =
  | { ok: true; answer: DecisionDraftAnswer; runId: string | null; evidenceDigest: string | null }
  | { ok: false; code: 'no-source' | 'too-large' };

/** Derive the decision of the project `data` is the document of. `data.decision` is the stored record. */
export async function deriveProjectDecision(
  db: AdminDb,
  projectId: string,
  data: Record<string, unknown>,
  now: string,
): Promise<ProjectDecisionDerivation> {
  const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
  if (!source.trim()) return { ok: false, code: 'no-source' };
  if (Buffer.byteLength(source, 'utf8') > DECISION_MAX_SOURCE_BYTES) return { ok: false, code: 'too-large' };

  let run: Record<string, unknown> | null = null;
  const activeRunId = typeof data.activeRunId === 'string' && data.activeRunId ? data.activeRunId : null;
  if (activeRunId) {
    const runSnap = await db.collection('projects').doc(projectId).collection('runs').doc(activeRunId).get();
    run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
  }
  const digest = run ? evidenceDigest(run) : null;

  const built = contractOfProject(data, manifestOfRun(run));
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
    need: await needFactsOf(db, projectId, source),
    handedOver: isoOf(auditMetadata.auditPackExportedAt) !== null,
    stored: data.decision,
    now,
  });
  return { ok: true, answer, runId: run ? activeRunId : null, evidenceDigest: digest };
}
