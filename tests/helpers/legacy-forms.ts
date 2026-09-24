import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { computeRunHash, signRunHash } from '../../lib/run-signature';
import { analysisRunInputs, buildInputManifest } from '../../lib/input-manifest';
import { sha256Hex } from '../../lib/artefact-digest';
import type { HistoricalForm } from '../../lib/legacy-project';

/**
 * Roadmap 3.0.2 — the stored shapes of a project across the versions of this
 * product, for `tests/legacy-projects.spec.ts` (derivations, no server) and
 * `tests/legacy-projects-page.spec.ts` (the rendered workspace). One set of
 * fixtures, so the two halves cannot drift into testing different forms.
 */

export const SOURCE = [
  'REPORT z_legacy_po_release.',
  'DATA lv_amount TYPE p DECIMALS 2.',
  'SELECT SINGLE * FROM ekko INTO @DATA(ls_ekko) WHERE ebeln = @p_ebeln.',
  'IF ls_ekko-netwr > 10000.',
  '  UPDATE zpo_release SET status = \'H\' WHERE ebeln = @p_ebeln.',
  'ELSE.',
  '  CALL FUNCTION \'Z_RELEASE_PO\' EXPORTING iv_ebeln = p_ebeln.',
  'ENDIF.',
].join('\n');

/** A run signed the way `/api/runs/create` signs one: canonical hash, HMAC, narrative outside. */
function signedWith(key: string, run: Record<string, unknown>): Record<string, unknown> {
  const { analysis, ...unsigned } = run;
  const runHash = computeRunHash(unsigned);
  return { ...run, analysis, runHash, signature: signRunHash(runHash, key) };
}

/** The payload every run from v1.10 on carries — the oldest signed form. */
function runV110(owner: string, projectId: string, runId: string): Record<string, unknown> {
  return {
    runId,
    projectId,
    userId: owner,
    createdAt: '2025-03-04T09:00:00.000Z',
    status: 'completed',
    inputFingerprint: {
      sha256: sha256Hex(SOURCE), fileName: 'z_legacy_po_release.abap',
      lineCount: SOURCE.split('\n').length, byteSize: SOURCE.length, objectType: 'Report',
    },
    analyzerVersion: '1.10.0',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: 'catalog-2025-02',
    model: { provider: 'google', modelId: 'gemini-1.5-pro', engineVersion: '1.10.0', byokUsed: false },
    extensibilityRoute: 'RAP',
    cleanCoreScore: 41,
    complexityScore: 30,
    criticalityScore: 55,
    analysis: 'Narrative from an early model call.',
    evidenceReport: [],
  };
}

/** The manifest of a run over `SOURCE` with no model in it (roadmap 0.5, 1.2). */
const manifestFor = () =>
  buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(SOURCE),
      deploymentTarget: 'private',
      catalogVersion: 'catalog-2026-09',
      rulesetVersion: 'rules-v1.0',
      engineVersion: '2.9.0',
      model: null,
    }),
  );

export interface LegacyForm {
  /** What the code calls it, and where it says so. */
  name: string;
  project: Record<string, unknown>;
  /** The run the project points at — absent for a dangling pointer or no run. */
  run?: Record<string, unknown>;
  /** Earlier runs of the project, never active. */
  history?: Record<string, unknown>[];
  /** The record gaps the workspace must name — exactly these. */
  gaps: HistoricalForm[];
  /** The analyze phase as the status line must read it. */
  provenance: 'not-started' | 'partial' | 'done';
}

export interface LegacyFormOptions {
  /** The uid that owns every seeded project. */
  owner: string;
  /** The HMAC key the runs are signed with — the server's, when a server verifies them. */
  key: string;
  /** The project id of a form, unique per run of the suite. */
  pid: (form: string) => string;
}

/**
 * The historical forms, as documents — see the header of `tests/legacy-projects.spec.ts`
 * for where the code records each one.
 */
export function legacyForms({ owner, key, pid }: LegacyFormOptions): Record<string, LegacyForm> {
  const OWNER = owner;
  const signed = (run: Record<string, unknown>) => signedWith(key, run);
  const v110Run = 'run-v110-0001';
  const pre12Run = 'run-pre12-0001';
  const currentRun = 'run-current-0001';
  return {
    // The first drafts: a name and nothing else. No source, no status, no run.
    empty: {
      name: 'a project with a name and nothing else',
      project: { name: 'Draft from 2024', userId: OWNER, createdAt: Timestamp.fromDate(new Date('2024-11-02')) },
      gaps: [],
      provenance: 'not-started',
    },
    // Before v1.9: source and the stored workflow status only. The status is not
    // a gap — every stage page still writes it — and nothing reads it.
    'source-only': {
      name: 'source staged, stored status "created" (pre v1.9)',
      project: {
        name: 'Upload from 2024', userId: OWNER, legacyCode: SOURCE, status: 'created',
        createdAt: Timestamp.fromDate(new Date('2024-12-01')),
      },
      gaps: [],
      provenance: 'partial',
    },
    // Before v1.10: the analysis lived on the project document and nothing signed
    // it; v1.9 added the inventory, the coupling and the architect sign-off; the
    // status says "completed" and tests claim a pass with no receipt behind them.
    'before-signed-runs': {
      name: 'analysis and artefacts on the document, no activeRunId (v1.9, before v1.10)',
      project: {
        name: 'Completed in 2025', userId: OWNER, legacyCode: SOURCE, status: 'completed',
        analysis: '## Analysis\nWritten before signed runs.', cleanCoreScore: 48,
        extensibilityRoute: 'RAP',
        codeInventory: [{ objectName: 'Z_LEGACY_PO_RELEASE', type: 'Report', criticality: 'High' }],
        dataCoupling: [
          { tableName: 'EKKO', accessType: 'Read', isCustom: false, riskLevel: 'Low', recommendation: 'Use I_PurchaseOrderAPI01' },
          { tableName: 'ZPO_RELEASE', accessType: 'Write', isCustom: true, riskLevel: 'High', recommendation: 'Wrap in RAP' },
        ],
        worklist: [{ id: 'w1', title: 'Direct write to ZPO_RELEASE', category: 'Finding', location: 'L5', recommendation: 'r', status: 'open', effort: 'Medium' }],
        solutionDesign: '# Target\n', approvedByArchitect: true, approvedBy: 'someone@example.com',
        architectSignOffAt: Timestamp.fromDate(new Date('2025-01-10')),
        generatedCode: 'CLASS zcl_x DEFINITION.\n', documentation: '# Blueprint\n',
        testCases: [
          { id: 't1', name: 'a', category: 'Unit', description: 'd', priority: 'High', status: 'Passed' },
          { id: 't2', name: 'b', category: 'Unit', description: 'd', priority: 'Low', status: 'Passed' },
        ],
        createdAt: Timestamp.fromDate(new Date('2025-01-05')),
      },
      gaps: ['before-signed-runs', 'coupling-before-ownership'],
      provenance: 'partial',
    },
    // v1.10–v1.16: the first signed runs. Inventory, coupling and worklist stay on
    // the project (v1.17 moved copies into the run), no narrative meta (v1.20),
    // no input manifest (roadmap 0.5), no model participation (roadmap 1.2).
    'run-v110': {
      name: 'signed run without manifest, model participation or narrative meta (v1.10–v1.16)',
      project: {
        name: 'Signed in 2025', userId: OWNER, legacyCode: SOURCE, status: 'analyzed',
        activeRunId: v110Run, cleanCoreScore: 41,
        worklist: [{ id: 'w1', title: 'Direct write to ZPO_RELEASE', category: 'Finding', location: 'L5', recommendation: 'r', status: 'open', effort: 'Medium' }],
        codeInventory: [{ objectName: 'Z_LEGACY_PO_RELEASE', type: 'Report', criticality: 'High', lineStart: 1, lineEnd: 8 }],
        auditMetadata: {
          inputFingerprint: {
            sha256: sha256Hex(SOURCE), fileName: 'z_legacy_po_release.abap', lineCount: 8,
            byteSize: SOURCE.length, uploadedAt: '2025-03-04T08:59:00.000Z', objectType: 'Report',
          },
          modelCard: { provider: 'google', model: 'gemini-1.5-pro', engineVersion: '1.10.0', byokUsed: false },
          auditPackExportedAt: Timestamp.fromDate(new Date('2025-03-05')),
        },
        createdAt: Timestamp.fromDate(new Date('2025-03-01')),
      },
      run: signed(runV110(owner, pid('run-v110'), v110Run)),
      gaps: ['run-before-manifest', 'run-before-model-record'],
      provenance: 'done',
    },
    // After roadmap 0.5, before 1.2: the manifest is signed, model participation
    // is not recorded yet. v1.17/v1.20 fields are on the run.
    'run-before-model-record': {
      name: 'signed run with manifest, without model participation (0.5, before 1.2)',
      project: {
        name: 'Signed in September', userId: OWNER, legacyCode: SOURCE, s4Deployment: 'private',
        activeRunId: pre12Run, cleanCoreScore: 44,
        auditMetadata: { inputManifest: manifestFor() },
        createdAt: new Date('2026-09-16T10:00:00.000Z'),
      },
      run: signed({
        ...runV110(owner, pid('run-before-model-record'), pre12Run),
        analyzerVersion: '2.9.0',
        inputManifest: manifestFor(),
        aiNarrativeMeta: { provider: null, modelId: null, responseHash: null, evidentiary: false },
        codeInventory: [{ objectName: 'Z_LEGACY_PO_RELEASE', type: 'Report', criticality: 'High' }],
        dataCoupling: [{ tableName: 'EKKO', accessType: 'Read', isCustom: false, isStandard: true, riskLevel: 'Low', recommendation: 'r' }],
        worklist: [],
      }),
      history: [signed(runV110(owner, pid('run-before-model-record'), 'run-older-0001'))],
      gaps: ['run-before-model-record'],
      provenance: 'done',
    },
    // The form this version writes — the control: no gap at all.
    current: {
      name: 'the current form (manifest and model participation recorded)',
      project: {
        name: 'Signed this week', userId: OWNER, legacyCode: SOURCE, s4Deployment: 'private',
        activeRunId: currentRun, cleanCoreScore: 44,
        auditMetadata: { inputManifest: manifestFor() },
        createdAt: new Date('2026-09-22T10:00:00.000Z'),
      },
      run: signed({
        ...runV110(owner, pid('current'), currentRun),
        analyzerVersion: '3.0.0',
        inputManifest: manifestFor(),
        modelParticipation: 'none',
        model: { provider: null, modelId: null, engineVersion: '3.0.0', byokUsed: false },
        aiNarrativeMeta: { provider: null, modelId: null, responseHash: null, evidentiary: false },
        analysis: '',
      }),
      gaps: [],
      provenance: 'done',
    },
    // `activeRunId` points at a run that is not there (deleted by hand, or an
    // interrupted migration). The id alone signs nothing.
    'dangling-run': {
      name: 'activeRunId without a run document',
      project: {
        name: 'Run gone', userId: OWNER, legacyCode: SOURCE, activeRunId: 'run-that-is-gone-0001',
        cleanCoreScore: 39,
        createdAt: Timestamp.fromDate(new Date('2025-06-01')),
      },
      gaps: ['run-unreadable'],
      provenance: 'partial',
    },
    // Lists written by hand-edits and half-migrations: entries without the fields
    // the current types require, a reserved-namespace table that is neither a
    // customer's nor SAP's, a worklist item without a title, a usage record
    // without a name, null test cases.
    'malformed-lists': {
      name: 'stored lists with missing fields and null entries',
      project: {
        name: 'Hand-edited', userId: OWNER, legacyCode: SOURCE,
        codeInventory: [{}, null, { objectName: 'Z_ONLY_NAME' }],
        dataCoupling: [
          { tableName: '/ACME/T_ORDER', accessType: 'Write', isCustom: false, isStandard: false },
          { tableName: 'MARA' },
        ],
        usageReport: { records: [{}, { objectName: 'Z_LEGACY_PO_RELEASE', callCount: null }], source: 'scmon', warnings: [] },
        worklist: [{ id: 'w-untitled' }, null],
        testCases: [null, { id: 't1' }, { id: 't2', status: 'Simulated' }],
        createdAt: Timestamp.fromDate(new Date('2025-02-01')),
      },
      gaps: ['before-signed-runs', 'coupling-before-ownership'],
      provenance: 'partial',
    },
  };
}


/** Seed every form through the Admin SDK — the way they sit in production, past the rules. */
export async function seedLegacyForms(
  db: Firestore,
  forms: Record<string, LegacyForm>,
  pid: (form: string) => string,
): Promise<void> {
  for (const [key, form] of Object.entries(forms)) {
    const id = pid(key);
    await db.doc(`projects/${id}`).set(form.project);
    if (form.run) await db.doc(`projects/${id}/runs/${String(form.run.runId)}`).set(form.run);
    for (const old of form.history ?? []) await db.doc(`projects/${id}/runs/${String(old.runId)}`).set(old);
  }
}

/**
 * Update times and signatures of the project and of every document under it —
 * the thing opening a project must not change. A subcollection that appears
 * (a process revision minted on read, say) shows up as a new key.
 */
export async function storedFingerprint(db: Firestore, projectId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const project = await db.doc(`projects/${projectId}`).get();
  out.project = project.updateTime?.toMillis().toString() ?? 'absent';
  for (const sub of await db.doc(`projects/${projectId}`).listCollections()) {
    const docs = await sub.get();
    for (const d of docs.docs) {
      out[`${sub.id}/${d.id}`] = `${d.updateTime.toMillis()}|${String(d.data().signature ?? '')}`;
    }
  }
  return out;
}
