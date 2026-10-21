import { NextRequest, NextResponse } from 'next/server';
import type { Transaction } from 'firebase-admin/firestore';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { sha256Hex } from '@/lib/artefact-digest';
import { catalogSnapshotKeyForProject } from '@/lib/abap/catalog-snapshots';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { projectEvidenceFileName } from '@/lib/project-evidence-build';
import { signedSourceShaOf } from '@/lib/key-user-acceptance';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { decisionKindOf } from '@/lib/rule-decision-flow';
import { parseBpmn } from '@/lib/process-map';
import { PROCESS_REVISION_COLLECTION, isProcessRevisionRecord } from '@/lib/process-revisions';
import {
  MAX_STATE_ENTRIES,
  PROCESS_STATE_COLLECTION,
  PROCESS_STATE_FORMAT_VERSION,
  applyStateChoices,
  isStateEntry,
  type StateEntry,
} from '@/lib/process-states';
import { readFitToStandard, designFromReading, type FitToStandardReading } from '@/lib/fit-to-standard-read';
import type { FitGateAnalyzeState } from '@/lib/fit-to-standard-gate';
import {
  FIT_REVISION_FORMAT_VERSION,
  FIT_TO_STANDARD_COLLECTION,
  applyFitChoices,
  checkFitChoices,
  droppedObjectsOf,
  needChoicesOf,
  summaryOf,
  type FitAccount,
  type FitToStandardRevision,
} from '@/lib/fit-to-standard-store';
import { countEntries, fitDesignSummary } from '@/lib/fit-to-standard-design';
import { buildFitPackage, fitConditionLines } from '@/lib/fit-to-standard-package';
import { buildKeyUserSteps } from '@/lib/key-user-steps';
import { applyFitProposals } from '@/lib/fit-to-standard-proposal';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { verifyModelReceipt } from '@/lib/model-receipt';
import { loadSapNameLists } from '@/lib/sap-identifiers';

/**
 * Fit to standard — roadmap 3.0.20, steps F1–F3
 * (`docs/design/fit-to-standard-concept.md`; owner decisions 18.10.2026).
 *
 *   GET  → `{ gate, design, stored }`: the gate's reading of the signed run,
 *          the engine's design where the gate offers, and the stored revision
 *          when one stands on the current run.
 *   GET `?files=1` → `{ files, conditions, summary }`: the files of the package
 *          without code (`lib/fit-to-standard-package.ts`) for the confirmed
 *          design on the current run; 409 without one.
 *   POST `{ action: 'make', againstGate? }` → revision n+1 of kind `engine`:
 *          the engine's design, stored. `againstGate: true` asks for it although
 *          the gate does not offer (owner decision 3); the design then carries,
 *          visibly, that the engine does not recommend this path.
 *   POST `{ action: 'confirm', baseRevision, choices? }` → a revision of kind
 *          `confirmation`: the account confirms the design, with its choices
 *          written over the engine's — account and server time, a
 *          self-declaration. It also writes one need revision (`process_states`)
 *          when the process was reconstructed, so the to-be model follows.
 *
 * Every write refuses with 409 when the source on the project is not the one
 * the signed run read, or the stored design stands on another run.
 *
 * Revisions live in `projects/{id}/fit_to_standard/{n}`, created with
 * `create()` and never written again; `firestore.rules` has no match for the
 * subcollection, so no client reads or writes it. The summary the phase
 * contract reads sits on the project document as `fitToStandard`, a key outside
 * the client allowlist. Nothing here reaches a run, a signature or an audit
 * pack. Reading is by membership; writing is the owner's; a stranger gets the
 * 404 of a project that does not exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_LIMITS = { maxBytes: 256 * 1024, timeoutMs: 10_000 };
/** The same ceiling the process-states and standard-fit routes use. */
const MAX_ANALYSED_SOURCE_BYTES = 256 * 1024;

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

type Gate =
  | { ok: true; uid: string; projectId: string; project: Record<string, unknown> }
  | { ok: false; response: NextResponse };

async function openProject(req: NextRequest, params: Promise<{ projectId: string }>, mutating: boolean): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return { ok: false, response: NextResponse.json({ error: q?.message || 'Multi-factor authentication required.' }, { status: q?.status || 403 }) };
  }
  try {
    await assertRateLimit(
      mutating ? `fit-to-standard:${decodedToken.uid}` : `fit-to-standard-read:${decodedToken.uid}`,
      mutating ? 60 : 240,
      60 * 60 * 1000,
    );
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
  }
  if (mutating) {
    try {
      await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
      }
      throw gateErr;
    }
  } else {
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return { ok: false, response: inactive };
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }
  if (!isFirestoreId(projectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  }
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  const project = (snap.data() || {}) as Record<string, unknown>;
  if (mutating ? project.userId !== decodedToken.uid : !mayReadProject(project, decodedToken.uid)) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  return { ok: true, uid: decodedToken.uid, projectId, project };
}

const bad = (error: string, code: string, status = 400) => NextResponse.json({ error, code }, { status });

function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

async function accountOf(db: AdminDb, uid: string): Promise<FitAccount> {
  let name = '';
  let email = '';
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() || {}) as { firstName?: string; lastName?: string; email?: string };
    name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    email = typeof data.email === 'string' ? data.email : '';
  } catch {
    /* named by its account id below */
  }
  return { uid, name: name || email || uid };
}

interface RunFacts {
  runId: string | null;
  signedSha: string | null;
  sourceSha: string;
  analyzeState: FitGateAnalyzeState;
}

function runFactsOf(project: Record<string, unknown>, source: string): RunFacts {
  const runId = typeof project.activeRunId === 'string' && project.activeRunId ? project.activeRunId : null;
  const signedSha = signedSourceShaOf(project);
  const sourceSha = sha256Hex(source);
  const analyzeState: FitGateAnalyzeState = !runId ? 'empty' : !signedSha ? 'partial' : signedSha !== sourceSha ? 'stale' : 'done';
  return { runId, signedSha, sourceSha, analyzeState };
}

/**
 * The rules the account marked as customizing, with their first line — class D
 * of the gate — and the rules it answered "Move to SAP standard" (3.0.20 (5)).
 */
async function customizingRules(db: AdminDb, projectId: string, source: string) {
  type Marked = Array<{ ruleId: string; lineStart: number; lineEnd?: number }>;
  const none = { revision: 0, entries: [] as StateEntry[], customizing: [] as Marked, standard: [] as Marked };
  const snap = await db.collection('projects').doc(projectId).collection(PROCESS_STATE_COLLECTION).orderBy('revision', 'desc').limit(1).get();
  if (snap.empty) return none;
  const data = (snap.docs[0].data() || {}) as Record<string, unknown>;
  if (data.formatVersion !== PROCESS_STATE_FORMAT_VERSION) return none;
  const entries = (Array.isArray(data.entries) ? data.entries : [])
    .map((e) => ({ ...(e as Record<string, unknown>), confirmedAt: isoOf((e as Record<string, unknown>).confirmedAt) }) as StateEntry)
    .filter(isStateEntry);
  const marked = entries.filter((e) => e.kind === 'rule' && e.valueSource?.kind === 'customizing' && (e.state === 'keep' || e.state === 'change'));
  // Read as the Business view reads it: the answer `standard`, or an older Keep whose note says so.
  const wanted = entries.filter((e) => e.kind === 'rule' && decisionKindOf(e) === 'standard');
  const customizing: Marked = [];
  const standard: Marked = [];
  if (marked.length > 0 || wanted.length > 0) {
    const rules = new Map(deriveBusinessRules(source).rules.map((r) => [r.id, r]));
    const lineOf = (subject: string) => rules.get(subject)?.sentences.flatMap((s) => s.anchors)[0];
    for (const m of marked) {
      const anchor = lineOf(m.subject);
      if (anchor) customizing.push({ ruleId: m.subject, lineStart: anchor.lineStart, lineEnd: anchor.lineEnd });
    }
    for (const m of wanted) {
      const anchor = lineOf(m.subject);
      if (anchor) standard.push({ ruleId: m.subject, lineStart: anchor.lineStart, lineEnd: anchor.lineEnd });
    }
  }
  return { revision: typeof data.revision === 'number' ? data.revision : 0, entries, customizing, standard };
}

async function latestRevision(db: AdminDb, projectId: string): Promise<FitToStandardRevision | null> {
  const snap = await db.collection('projects').doc(projectId).collection(FIT_TO_STANDARD_COLLECTION).orderBy('revision', 'desc').limit(1).get();
  if (snap.empty) return null;
  const data = (snap.docs[0].data() || {}) as Record<string, unknown>;
  if (data.formatVersion !== FIT_REVISION_FORMAT_VERSION || !Array.isArray(data.entries)) return null;
  return { ...(data as unknown as FitToStandardRevision), createdAt: isoOf(data.createdAt) };
}

type Opened =
  | { ok: true; source: string; facts: RunFacts; reading: FitToStandardReading; states: Awaited<ReturnType<typeof customizingRules>> }
  | { ok: false; response: NextResponse };

async function open(db: AdminDb, gate: Extract<Gate, { ok: true }>): Promise<Opened> {
  const source = typeof gate.project.legacyCode === 'string' ? gate.project.legacyCode : '';
  if (!source.trim()) {
    return { ok: false, response: bad('No source is staged on this project, so nothing was compared.', 'no-source', 409) };
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_ANALYSED_SOURCE_BYTES) {
    return { ok: false, response: bad('This source is larger than one request compares.', 'source-too-large', 413) };
  }
  const facts = runFactsOf(gate.project, source);
  const states = await customizingRules(db, gate.projectId, source);
  const edition = gate.project.s4Deployment === 'private' ? 'private' : gate.project.s4Deployment === 'public' ? 'public' : null;
  const reading = readFitToStandard({
    source,
    fileName: projectEvidenceFileName(gate.project),
    edition,
    catalogSnapshot: catalogSnapshotKeyForProject(gate.project),
    // The engine of the signed run: the findings are the ones it signed.
    engineVersion: engineVersionOfProject(gate.project),
    mode: 'project',
    hasRun: facts.runId !== null,
    analyzeState: facts.analyzeState,
    signedSourceSha256: facts.signedSha,
    customizing: states.customizing,
    standardRules: states.standard,
  });
  return { ok: true, source, facts, reading, states };
}

const ALREADY_EXISTS = 6;
const isAlreadyExists = (err: unknown) => {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === ALREADY_EXISTS || String(e?.message ?? '').includes('ALREADY_EXISTS');
};

const current = (rev: FitToStandardRevision | null, facts: RunFacts) =>
  !!rev && rev.runId === facts.runId && rev.sourceSha256 === facts.sourceSha;

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const opened = await open(db, gate);
    if (!opened.ok) return opened.response;
    const stored = await latestRevision(db, gate.projectId);
    const fresh = current(stored, opened.facts);
    // F7: the files of the package without code, for the confirmed design on the current run.
    if (req.nextUrl.searchParams.get('files') === '1') {
      if (!stored || !fresh || stored.kind !== 'confirmation') {
        return bad('There is no confirmed fit-to-standard design on the current run, so there is no package without code.', 'no-confirmed-design', 409);
      }
      const files = buildFitPackage({
        projectName: typeof gate.project.name === 'string' && gate.project.name ? gate.project.name : 'Project',
        sourceFileName: projectEvidenceFileName(gate.project),
        source: opened.source,
        skeleton: opened.reading.skeleton,
        revision: stored,
        keyUserSteps: buildKeyUserSteps(opened.reading.evidence.keyUser),
      });
      return NextResponse.json({ files, conditions: fitConditionLines(stored), summary: fitDesignSummary(stored.counts) });
    }
    return NextResponse.json({
      gate: opened.reading.gate,
      design: fresh ? { ...stored, counts: countEntries(stored!.entries) } : designFromReading(opened.reading, false),
      stored: stored ? { revision: stored.revision, kind: stored.kind, stale: !fresh, createdAt: stored.createdAt, createdBy: stored.createdBy.name } : null,
    });
  } catch (err: unknown) {
    logger.error('fit-to-standard read failed', { route: 'api/projects/fit-to-standard', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the fit-to-standard design.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    let body: { action?: unknown; againstGate?: unknown; baseRevision?: unknown; choices?: unknown; text?: unknown; receipt?: unknown } | null = null;
    try {
      body = await readBoundedJson(new Response(req.body, { headers: req.headers }), BODY_LIMITS);
    } catch (bodyErr) {
      if (bodyErr instanceof ResponseLimitError) return bad('The request is too large.', 'too-large', 413);
      body = null;
    }
    if (!body || (body.action !== 'make' && body.action !== 'confirm' && body.action !== 'propose')) {
      return bad("Expected { action: 'make', againstGate? }, { action: 'propose', baseRevision, text, receipt } or { action: 'confirm', baseRevision, choices? }.", 'bad-request');
    }

    const { db } = await getAdminDb();
    const opened = await open(db, gate);
    if (!opened.ok) return opened.response;
    const { facts, reading } = opened;
    if (facts.analyzeState !== 'done') {
      return bad(
        facts.analyzeState === 'stale'
          ? 'The source on the project is not the one the signed run read. Run the analysis again first.'
          : 'There is no current signed run to make a fit-to-standard design from. Run the analysis first.',
        'run-not-current',
        409,
      );
    }
    const stored = await latestRevision(db, gate.projectId);
    const nextRevision = (stored?.revision ?? 0) + 1;
    const account = await accountOf(db, gate.uid);
    const now = new Date().toISOString();
    const engineVersion = engineVersionOfProject(gate.project);
    const projectRef = db.collection('projects').doc(gate.projectId);
    const revisions = projectRef.collection(FIT_TO_STANDARD_COLLECTION);

    let record: FitToStandardRevision;
    let needRevision: number | null = null;
    let droppedObjects = {};
    let stateRecord: (Record<string, unknown> & { revision: number }) | null = null;
    if (body.action === 'make') {
      const against = body.againstGate === true;
      if (reading.gate.outcome === 'not-determined') {
        return bad(`The gate cannot read this program yet: ${reading.gate.reason}`, 'gate-not-determined', 409);
      }
      if (reading.gate.outcome === 'not-offered' && !against) {
        return bad(`The gate does not offer a fit-to-standard design: ${reading.gate.reason} You can still ask for one against the gate.`, 'not-offered', 409);
      }
      const design = designFromReading(reading, against)!;
      record = {
        formatVersion: FIT_REVISION_FORMAT_VERSION,
        revision: nextRevision,
        kind: 'engine',
        runId: facts.runId,
        sourceSha256: facts.sourceSha,
        edition: design.edition,
        engineVersion,
        gateClasses: design.gateClasses,
        againstGate: design.againstGate,
        entries: design.entries,
        counts: design.counts,
        createdBy: account,
        createdAt: now,
      };
    } else if (body.action === 'propose') {
      // F5: a model's standard candidates for the open steps — only with the proxy's receipt of the
      // call (stage `design`, shared key within its limits or BYOK), every identifier checked.
      if (!stored || !current(stored, facts)) {
        return bad('There is no fit-to-standard design on the current run to add proposals to. Make it first.', 'no-current-design', 409);
      }
      if (!Number.isInteger(body.baseRevision) || body.baseRevision !== stored.revision) {
        return NextResponse.json(
          { error: `This design was read at revision ${String(body.baseRevision)}, and revision ${stored.revision} is the latest. Reload it first.`, code: 'revision-moved', latest: stored.revision },
          { status: 409 },
        );
      }
      if (typeof body.text !== 'string' || body.text.length > 64 * 1024) return bad('Expected the model answer as text.', 'bad-request');
      const key = getAuditSigningKey();
      if (!key) {
        console.error(MISSING_SIGNING_KEY_LOG);
        return bad('The origin of the proposal cannot be checked on this deployment.', 'no-signing-key', 503);
      }
      const verdict = verifyModelReceipt(body.receipt, { uid: gate.uid, text: body.text, key, stage: 'design' });
      if (!verdict.ok) {
        return NextResponse.json(
          { error: 'This answer carries no valid receipt from the model call, so it is not stored as a model proposal.', code: 'receipt-refused', refusal: verdict.refusal },
          { status: 422 },
        );
      }
      // The synced SAP name lists, so the check reads them as the screens do.
      await loadSapNameLists();
      const outcome = applyFitProposals(stored.entries, body.text);
      if (outcome.unreadable) return bad('The model answer could not be read as the proposal schema; nothing was applied.', 'unreadable', 422);
      record = {
        ...stored,
        revision: nextRevision,
        kind: 'proposal',
        entries: outcome.entries,
        counts: countEntries(outcome.entries),
        modelProposal: {
          provider: verdict.receipt.provider,
          modelId: verdict.receipt.modelId,
          byok: verdict.receipt.byok,
          kept: outcome.kept,
          dropped: outcome.dropped,
        },
        createdBy: account,
        createdAt: now,
      };
    } else {
      if (!stored || !current(stored, facts)) {
        return bad('There is no fit-to-standard design on the current run to confirm. Make it first.', 'no-current-design', 409);
      }
      if (!Number.isInteger(body.baseRevision) || body.baseRevision !== stored.revision) {
        return NextResponse.json(
          { error: `This design was read at revision ${String(body.baseRevision)}, and revision ${stored.revision} is the latest. Reload it before confirming.`, code: 'revision-moved', latest: stored.revision },
          { status: 409 },
        );
      }
      const checked = checkFitChoices(body.choices, stored.entries);
      if (!checked.ok) return bad(checked.error, checked.code, checked.code === 'unknown-element' ? 409 : 400);
      const entries = applyFitChoices(stored.entries, checked.choices);
      record = {
        ...stored,
        revision: nextRevision,
        kind: 'confirmation',
        entries,
        counts: countEntries(entries),
        createdBy: account,
        createdAt: now,
      };
      // Confirmed drops: the SAP objects only given-up steps use go to Retire.
      droppedObjects = droppedObjectsOf(entries, reading.skeleton.nodes, reading.findings, { revision: nextRevision, confirmedAt: now, accountName: account.name });

      // The need revision of 3.5 — written when the as-is process exists and stands on this source.
      const baseline = await projectRef.collection(PROCESS_REVISION_COLLECTION).doc('1').get();
      const base = baseline.exists ? { ...(baseline.data() as Record<string, unknown>), savedAt: isoOf((baseline.data() as Record<string, unknown>).savedAt) } : null;
      if (base && isProcessRevisionRecord(base) && base.sourceSha256 === facts.sourceSha) {
        const elementsOfNode = new Map<string, string[]>();
        for (const el of parseBpmn(base.xml).elements) {
          const node = el.trace?.node;
          if (node) elementsOfNode.set(node, [...(elementsOfNode.get(node) ?? []), el.id]);
        }
        const choices = needChoicesOf(entries, elementsOfNode);
        if (choices.length > 0) {
          const revision = opened.states.revision + 1;
          const stateEntries = applyStateChoices(opened.states.entries, choices, { account, confirmedAt: now, revision });
          if (stateEntries.length <= MAX_STATE_ENTRIES) {
            stateRecord = {
              formatVersion: PROCESS_STATE_FORMAT_VERSION,
              revision,
              account,
              savedAt: now,
              baselineRevision: 1,
              entries: stateEntries,
              origin: { kind: 'fit-to-standard', revision: nextRevision },
            };
            needRevision = revision;
          }
        }
      }
    }

    // One transaction for the fit revision, the need revision it derives and the summary
    // (QA review of 4ea0324a13cb, 222b1b571ee8): the latest revisions are read again inside
    // it, so a session that wrote either first makes this one write nothing at all.
    const summary = { ...summaryOf(record, needRevision), droppedObjects };
    const statesRef = projectRef.collection(PROCESS_STATE_COLLECTION);
    const moved = await db.runTransaction(async (tx: Transaction) => {
      const latestFit = await tx.get(revisions.orderBy('revision', 'desc').limit(1));
      const fitNow = latestFit.empty ? 0 : Number((latestFit.docs[0].data() as { revision?: unknown }).revision ?? 0);
      if (fitNow !== (stored?.revision ?? 0)) return true;
      if (stateRecord) {
        const latestState = await tx.get(statesRef.orderBy('revision', 'desc').limit(1));
        const stateNow = latestState.empty ? 0 : Number((latestState.docs[0].data() as { revision?: unknown }).revision ?? 0);
        if (stateNow !== opened.states.revision) return true;
        tx.create(statesRef.doc(String(stateRecord.revision)), stateRecord);
      }
      tx.create(revisions.doc(String(nextRevision)), record);
      tx.update(projectRef, { fitToStandard: summary });
      return false;
    }).catch((err: unknown) => {
      if (isAlreadyExists(err)) return true;
      throw err;
    });
    if (moved) {
      return NextResponse.json(
        { error: 'The design or the confirmed need was written by another session at the same time. Nothing was stored; reload and try again.', code: 'revision-moved' },
        { status: 409 },
      );
    }
    logger.info('fit-to-standard revision written', {
      route: 'api/projects/fit-to-standard',
      kind: record.kind,
      revision: record.revision,
      entries: record.entries.length,
    });
    return NextResponse.json({ design: record, summary }, { status: 201 });
  } catch (err: unknown) {
    logger.error('fit-to-standard write failed', { route: 'api/projects/fit-to-standard', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the fit-to-standard design.' }, { status: 500 });
  }
}
