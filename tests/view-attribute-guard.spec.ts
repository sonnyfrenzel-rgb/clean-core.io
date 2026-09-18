import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, updateDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { buildAuditPackContents, signedGeneratorInput, attestationsOf, type AuditPackSource } from '../lib/audit-pack-build';

/**
 * `expect.arrayContaining([a, b, c])` matches when the array holds **all** of
 * `a`, `b` and `c` — it is an AND, not an OR. `.not.toEqual(arrayContaining([
 * 'view', 'workspaceView', 'itFocus']))` therefore only fails when every one
 * of the three keys is present together, and passes right through a leak of
 * `view` alone. This is the actual check: which of the forbidden keys, if
 * any, showed up. Caught by planting `view` in `RUN_FIELDS` below and
 * watching the wrong form of this assertion pass anyway — see the report.
 */
function keysPresent(keys: readonly string[], forbidden: readonly string[]): string[] {
  return keys.filter((k) => (forbidden as readonly string[]).includes(k));
}

/**
 * Phase 6's acceptance line, and the one roadmap step 6.1 is the first to be
 * measured against (`docs/ROADMAP.md` §Phase 6, "Fertig, wenn"):
 *
 *   > ein Wechsel erhält Element, Revision und Auswahl und erzeugt keine neue
 *   > Hypothese; ein Wechsel löst keinen Modellaufruf aus; und ein Guard
 *   > belegt, dass kein gespeichertes Artefakt, kein Run und kein Pack ein
 *   > Sichtattribut trägt.
 *
 * `lib/workspace-model.ts` keeps the view and IT's secondary focus in
 * `?view=`/`?focus=` and nowhere else — a claim about where the *reader's own
 * code* looks. It says nothing about whether a project, a run or an audit
 * pack could still end up carrying one: by a client trying to smuggle a value
 * in, or by a later change that spreads a request body somewhere it should
 * not. A UI test that only opens the workspace and checks the switcher would
 * pass either way, because the product would still *render* the three views
 * correctly while quietly persisting one of them.
 *
 * This file is the guard the acceptance line asks for, against the three
 * surfaces `docs/ROADMAP.md` names for this step:
 *
 *   - `firestore.rules` — the client-writable field lists for `projects/{id}`
 *     and `users/{id}` do not include a view or a focus, dynamically proven:
 *     a signed-in owner's own attempt to write one is rejected by the rules
 *     themselves, not by application code that happens not to expose a button
 *     for it.
 *   - `app/api/runs/create/route.ts` — the one route that mints a signed run
 *     is sent a view/focus in the request body anyway, and neither the run
 *     document nor the project document it writes carries it afterwards.
 *   - `lib/audit-pack-build.ts` — the named allowlist (`RUN_FIELDS`) that
 *     builds the signed generators' input is fed a run and a project that
 *     both carry a planted view, and no signed or attested file of the pack
 *     repeats it.
 *
 * Every plant below uses a unique marker string rather than a plausible value
 * such as `"business"` or `"it"`: a marker cannot already occur in unrelated
 * pack prose by coincidence, so its absence is a fact about the code path,
 * not a fact about which English words the generators happen to use.
 */

/* ----------------------------------------------- A: firestore.rules ----- */

test.describe('firestore.rules keeps a view off the project and the account', () => {
  test.describe.configure({ mode: 'serial' });

  const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const clientDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
  const clientAuth = getAuth(firebaseApp);
  try {
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  try {
    connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
  } catch {
    /* already connected */
  }

  const EMAIL = `view-guard-rules-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'ViewAttributeGuard123!';
  const PROJECT_ID = `p-view-guard-rules-${Date.now()}`;
  let uid = '';

  test.beforeAll(async () => {
    test.setTimeout(60 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    uid = cred.user.uid;
    await setDoc(doc(clientDb, 'users', uid), {
      firstName: 'View',
      lastName: 'Guard',
      email: EMAIL,
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
    await setDoc(doc(clientDb, 'projects', PROJECT_ID), {
      name: 'View guard fixture',
      status: 'created',
      userId: uid,
      createdAt: new Date(),
    });
  });

  test('a project cannot be created carrying a view', async () => {
    const freshId = `p-view-guard-create-${Date.now()}`;
    await expect(
      setDoc(doc(clientDb, 'projects', freshId), {
        name: 'x',
        status: 'created',
        userId: uid,
        createdAt: new Date(),
        view: 'management',
      }),
      'a project document was created carrying a view attribute',
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);
  });

  test('the owner cannot write a view onto their own project — alone, or beside an allowed field', async () => {
    await expect(
      updateDoc(doc(clientDb, 'projects', PROJECT_ID), { view: 'management' }),
      'the rules let a view be written alone',
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);

    await expect(
      updateDoc(doc(clientDb, 'projects', PROJECT_ID), { status: 'analyzed', workspaceView: 'it' }),
      'a view attribute was smuggled in beside a legitimately allowed field',
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);

    await expect(
      updateDoc(doc(clientDb, 'projects', PROJECT_ID), { itFocus: 'enterprise' }),
      'the rules let the IT focus be written',
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);
  });

  test('the account cannot write a view onto its own user document either — not on the account, per the roadmap line', async () => {
    await expect(
      updateDoc(doc(clientDb, 'users', uid), { view: 'management' }),
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);
  });

  test('an allowed field on the same project still updates cleanly — the rejections above are not a blanket deny', async () => {
    await expect(updateDoc(doc(clientDb, 'projects', PROJECT_ID), { status: 'analyzed' })).resolves.toBeUndefined();
  });
});

/* ------------------------------------------- B: the signed run route ---- */

test.describe('a signed run and its project never store a smuggled view', () => {
  test.describe.configure({ mode: 'serial' });

  const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
  const adminDb: Firestore = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

  const EMAIL = `view-guard-run-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'ViewAttributeGuard123!';
  const PROJECT_ID = `p-view-guard-run-${Date.now()}`;
  const SOURCE = 'REPORT z_view_guard.\nWRITE: / \'hello\'.\n';
  const MARKER = 'VIEW-ATTRIBUTE-ROUTE-MARKER-93be1c7f';
  let token = '';

  test.beforeAll(async () => {
    test.setTimeout(60 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminDb.doc(`users/${cred.user.uid}`).set({
      firstName: 'View',
      lastName: 'Guard',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 10,
      termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false,
      createdAt: new Date(),
    });
    await adminDb.doc(`projects/${PROJECT_ID}`).set({
      name: 'View guard run fixture',
      userId: cred.user.uid,
      createdAt: new Date(),
      status: 'uploaded',
      legacyCode: SOURCE,
    });
  });

  test('the route accepts an extra view/focus field in the body and stores neither', async ({ request }) => {
    test.setTimeout(120 * 1000);
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId: PROJECT_ID,
        legacyCode: SOURCE,
        s4Deployment: 'public',
        analysis: '{}',
        uploadedFileName: 'z.abap',
        // Not a field this route reads — planted the way a bug that spread
        // `...req.body` into the stored document, or a client trying to "save
        // its own view", would send it.
        view: MARKER,
        workspaceView: MARKER,
        itFocus: MARKER,
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { runId } = await res.json();

    const runDoc = (await adminDb.doc(`projects/${PROJECT_ID}/runs/${runId}`).get()).data()!;
    const projectDoc = (await adminDb.doc(`projects/${PROJECT_ID}`).get()).data()!;

    for (const [label, storedDoc] of [
      ['run', runDoc],
      ['project', projectDoc],
    ] as const) {
      expect(
        keysPresent(Object.keys(storedDoc), ['view', 'workspaceView', 'itFocus']),
        `the ${label} document carries a view-shaped top-level key`,
      ).toEqual([]);
      // The deep check: even a marker nested inside `worklist`, `auditMetadata`
      // or anywhere else would still show up in the serialised document, which
      // is why this does not need to walk the object by hand.
      expect(JSON.stringify(storedDoc), `the ${label} document leaked the planted marker`).not.toContain(MARKER);
    }
  });
});

/* --------------------------------------------- C: the audit pack -------- */

const RUN_MARKER = 'VIEW-ATTRIBUTE-RUN-MARKER-5f2ad1e0';
const PROJECT_MARKER = 'VIEW-ATTRIBUTE-PROJECT-MARKER-a1d90244';

// Modelled on the fixture `tests/audit-pack-signed-input.spec.ts` already
// uses for the same allowlist — a run with every field the signed generators
// are allowed to see, plus two that are not on that list at all.
const poisonedRun: AuditPackSource['run'] = {
  runId: 'run-1',
  projectId: 'proj-1',
  userId: 'u-1',
  createdAt: '2026-09-18T08:00:00.000Z',
  status: 'completed',
  inputFingerprint: { sha256: 'a'.repeat(64), fileName: 'zcl_x.abap', lineCount: 10, byteSize: 200, objectType: 'Class' },
  analyzerVersion: '2.10.8',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: '2026.09',
  model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.10.8', byokUsed: false },
  extensibilityRoute: 'rap',
  cleanCoreScore: 71,
  complexityScore: 40,
  criticalityScore: 55,
  evidenceReport: [],
  dataCoupling: [],
  codeInventory: [],
  worklist: [],
  originalRecommendation: 'rap',
  recommendationConfidence: 82,
  recommendationJustification: 'Released CDS views cover every read.',
  runHash: 'b'.repeat(64),
  signature: 'c'.repeat(64),
  // Not a field of a run this product ever writes — planted as if a bug had
  // once let a workspace view reach the document this pack is built from.
  view: RUN_MARKER,
  workspaceView: RUN_MARKER,
};

const auditMetadata = {
  inputFingerprint: { ...(poisonedRun.inputFingerprint as Record<string, unknown>), uploadedAt: '2026-09-18T08:00:00.000Z' },
  modelCard: {
    provider: 'google-gemini',
    model: 'gemini-3-flash-preview',
    engineVersion: '2.10.8',
    catalogVersion: '2026.09',
    byokUsed: false,
    analysisTimestamp: '2026-09-18T08:00:00.000Z',
  },
} as AuditPackSource['auditMetadata'];

test.describe('the audit-pack allowlist keeps a planted view off every generated file', () => {
  test('signedGeneratorInput — the named allowlist — carries no view-shaped key from the run', () => {
    const input = signedGeneratorInput({ projectId: 'proj-1', runId: 'run-1', run: poisonedRun, auditMetadata, attested: {} });
    expect(keysPresent(Object.keys(input), ['view', 'workspaceView', 'itFocus'])).toEqual([]);
  });

  test('none of the signed files carry the marker planted on the run', () => {
    const { signed } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: poisonedRun,
      auditMetadata,
      attested: attestationsOf({}),
    });
    const everythingSigned = Object.values(signed).join('\n');
    expect(everythingSigned).not.toContain(RUN_MARKER);
  });

  test('a view planted on the project document does not reach the attested file either', () => {
    const poisonedProjectData = {
      name: 'Order intake',
      status: 'analyzed',
      view: PROJECT_MARKER,
      workspaceView: PROJECT_MARKER,
    };
    const attested = attestationsOf(poisonedProjectData);
    expect(keysPresent(Object.keys(attested), ['view', 'workspaceView'])).toEqual([]);

    const { attested: files } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: poisonedRun,
      auditMetadata,
      attested,
    });
    expect(Object.values(files).join('\n')).not.toContain(PROJECT_MARKER);
  });

  test('a real client-writable field DOES reach the attested file — the checks above are not vacuous', () => {
    const attested = attestationsOf({ name: 'Order intake, forged', status: 'analyzed' });
    const { attested: files } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: poisonedRun,
      auditMetadata,
      attested,
    });
    expect(Object.values(files).join('\n')).toContain('Order intake, forged');
  });
});
