import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { assertRateLimit } from '@/lib/rate-limit';
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
import { deriveDecisionDraft, type DecisionDraftFacts } from '@/lib/decision-draft';
import type { InputManifest } from '@/lib/input-manifest';

/**
 * The decision of one project, derived — roadmap 8.4, the half the workspace
 * card reads.
 *
 * `GET` → `{ draft, stored, unchanged, runId, evidenceDigest, canDecide }`.
 *
 * **Why a route and not a call in the browser.** The draft binds the
 * architecture contract, and the contract is built from `buildAbapEvidence`,
 * which reaches the 4.3 MB merged SAP catalog — the rule `lib/first-look.ts`,
 * `/api/projects/{id}/findings` (8.1) and `/api/projects/{id}/contract` (8.3)
 * all keep. The need facts come from the reconstructed process and the rules
 * of the source, which `process-states` reads from the same place.
 *
 * **Why it writes nothing.** `decision` is a server-only project field, and
 * `POST /api/projects/{id}/commands` is its only writer (`record-decision-draft`,
 * `confirm-decision`, `withdraw-decision`). The card sends the draft this route
 * derived back through that command, where it is normalised and re-fingerprinted
 * again — this route is the reader, not a second writer.
 *
 * **`evidenceDigest` is the run the draft was derived from.** The card echoes
 * it as `expectedEvidenceDigest` when it confirms, so the 8.8 binding compares
 * the run the reader was shown against the run the project stands on at commit
 * time; a re-analysis in between ends in 409 with the server's sentence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The bound `/api/projects/{id}/findings` and `/contract` set, for the same reason. */
const MAX_SOURCE_BYTES = 400_000;

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    // The decision is derived from the customer's own code. A token from before
    // the second factor reads neither, here as in Firestore.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }
    // Not the cheap half: every read rebuilds the evidence and the rules of the
    // source. A budget of its own, as `process-states` gives its read.
    try {
      await assertRateLimit(`decision-read:${decodedToken.uid}`, 240, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }

    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });

    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(projectId).get();
    // One answer for "not there" and "not yours".
    if (!snap.exists || !mayReadProject(snap.data(), decodedToken.uid)) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;

    const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (!source.trim()) {
      return NextResponse.json(
        { error: 'No source is staged on this project, so no decision could be derived.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        {
          error: `This source is larger than the ${MAX_SOURCE_BYTES} bytes a decision is derived from in one request.`,
          code: 'too-large',
        },
        { status: 413 },
      );
    }

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
      now: new Date().toISOString(),
    });

    return NextResponse.json({
      ...answer,
      runId: run ? activeRunId : null,
      evidenceDigest: digest,
      // Reading is a share; deciding is the owner's (`commands` refuses anyone
      // else). Said here so the card does not offer a button that can only fail.
      canDecide: data.userId === decodedToken.uid,
    });
  } catch (err: unknown) {
    logger.error('project decision read failed', {
      route: 'api/projects/decision',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not derive the decision of this project.' }, { status: 500 });
  }
}
