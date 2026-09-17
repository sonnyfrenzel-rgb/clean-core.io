import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminDocExists } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { diffProcessRevisions, type ProcessRevisionRecord, type ProcessRevisionSummary } from '../lib/process-revisions';

/**
 * Roadmap 3.2 — the store that makes a revision a revision, against the
 * emulators and the real route.
 *
 * Six claims, and the third is the one the phase is accepted on:
 *
 *   1. revision 1 is **reconstructed by the server** from the source the active
 *      run signed, and a browser cannot post one;
 *   2. every revision carries the **account and a server time**, and the time a
 *      browser sends is not the time that is stored;
 *   3. a written revision is never written again — not by a second save, not by
 *      a second POST of revision 1, and the **Ist is byte for byte unchanged
 *      after editing**;
 *   4. saving the same bytes twice adds no revision, and a save from a stale
 *      revision is refused rather than silently branching;
 *   5. only the owner reads or writes, and no browser reads the subcollection
 *      straight out of Firestore;
 *   6. deleting the project takes the revisions with it (`recursiveDelete`);
 *   7. **revision 1 comes from a run that was loaded and verified.** The route
 *      used to take `activeRunId` on faith and reconstruct from the project's
 *      mirrored fingerprint, so any truthy id — one naming no run at all, or a
 *      run whose document had been altered — produced a revision 1 claiming to
 *      be the source that run signed (QA finding 33e0feb4fe87).
 *
 * The editor is roadmap 3.1 and is not under test here. The bodies posted below
 * are BPMN edited the way an editor edits it — the id stays, the name moves —
 * because that is the contract the comparison of two revisions rests on.
 *
 * The run seeded below is **signed**, with the same hash and HMAC
 * `api/runs/create` produces, because claim 7 is what makes the difference
 * between a fixture and a decoration: a run document with no signature would be
 * refused, and every test here would fail for that reason instead of its own.
 */

const STAMP = Date.now();
const EMAIL = `process-revisions-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `process-revisions-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `process-revisions-${STAMP}`;
const DOOMED_ID = `process-revisions-doomed-${STAMP}`;
/** Claim 7: a project pointing at a run that was never written. */
const GHOST_RUN_ID = `process-revisions-ghost-${STAMP}`;
/** Claim 7: a project whose run document exists and no longer hashes to its own runHash. */
const ALTERED_RUN_ID = `process-revisions-altered-${STAMP}`;
const RUN_ID = `run-${STAMP}`;

const PROGRAM = [
  'REPORT z_revision_store.',
  'START-OF-SELECTION.',
  '  PERFORM check_access.',
  '  PERFORM release.',
  'FORM check_access.',
  "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
  '  IF sy-subrc <> 0.',
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM release.',
  "  UPDATE eban SET frgkz = 'X' WHERE banfn = gv_banfn.",
  "  CALL FUNCTION 'Z_NOTIFY_REQUESTER' EXPORTING iv_banfn = gv_banfn.",
  'ENDFORM.',
].join('\n');

const FILE_NAME = 'z_revision_store.abap';
const SOURCE_SHA = sha256Hex(PROGRAM);

/**
 * A run document the way `api/runs/create` writes one: the payload, its hash
 * recomputed over exactly that payload, and the HMAC over the hash.
 *
 * `AUDIT_SIGNING_KEY` is set at module scope in `playwright.config.ts` and the
 * server inherits it, so what is signed here is what the route verifies with.
 */
function signedRun(projectId: string, runId: string, over: Record<string, unknown> = {}) {
  const unsigned = {
    runId,
    projectId,
    userId: uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    inputFingerprint: {
      sha256: SOURCE_SHA,
      fileName: FILE_NAME,
      lineCount: PROGRAM.split('\n').length,
      byteSize: Buffer.byteLength(PROGRAM, 'utf8'),
      objectType: 'Report',
    },
    analyzerVersion: '2.11.0',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: '2024.FPS02',
    extensibilityRoute: 'rap',
    cleanCoreScore: 71,
    complexityScore: 40,
    criticalityScore: 55,
    evidenceReport: [],
    dataCoupling: [],
    codeInventory: [],
    worklist: [],
    ...over,
  };
  const runHash = recomputeStoredRunHash(unsigned);
  return { ...unsigned, analysis: '{}', runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) };
}

let uid = '';
let otherUid = '';
let idToken = '';
let otherToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const path = `/api/projects/${PROJECT_ID}/process-revisions`;

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  connectFirestoreEmulator(clientDb, host || '127.0.0.1', Number(port) || 8080);
}

test.describe.configure({ mode: 'serial' });

/** One revision with its BPMN. */
async function revision(request: APIRequestContext, n: number): Promise<ProcessRevisionRecord> {
  const res = await request.get(`${path}?revision=${n}`, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).record as ProcessRevisionRecord;
}

async function history(request: APIRequestContext): Promise<ProcessRevisionSummary[]> {
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).revisions as ProcessRevisionSummary[];
}

const ACTIVITY = /<bpmn:(serviceTask|task|userTask|manualTask|sendTask|receiveTask|scriptTask|businessRuleTask) id="([^"]+)" name="([^"]+)"/;

/** The way an editor renames a step: the element id stays, the name moves. */
function rename(xml: string, to: string): string {
  const first = ACTIVITY.exec(xml);
  if (!first) throw new Error('fixture has no activity to rename');
  return xml.replace(first[0], `<bpmn:${first[1]} id="${first[2]}" name="${to}"`);
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherUid = other.user.uid;
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  for (const [id, email, first] of [[uid, EMAIL, 'Process'], [otherUid, OTHER_EMAIL, 'Other']]) {
    await adminSetDoc('users', id, {
      firstName: first, lastName: 'Revisions', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  for (const id of [PROJECT_ID, DOOMED_ID, GHOST_RUN_ID, ALTERED_RUN_ID]) {
    await adminSetDoc('projects', id, {
      name: 'Requisition release', userId: uid, createdAt: new Date(),
      status: 'analyzed', legacyCode: PROGRAM, s4Deployment: 'private',
      activeRunId: RUN_ID,
      inputFingerprint: { sha256: SOURCE_SHA, fileName: FILE_NAME },
    });
  }
  // Two of them get a run; the third points at nothing and the fourth at a
  // document that was altered after it was signed.
  for (const id of [PROJECT_ID, DOOMED_ID]) {
    await adminSetDoc(`projects/${id}/runs`, RUN_ID, signedRun(id, RUN_ID));
  }
  const altered = signedRun(ALTERED_RUN_ID, RUN_ID);
  await adminSetDoc(`projects/${ALTERED_RUN_ID}/runs`, RUN_ID, {
    ...altered,
    // One field moved after signing, and `runHash` left where it was — exactly
    // what an Admin-SDK repair or a compromised path leaves behind.
    cleanCoreScore: 99,
  });
});

test('the server under test has the route', async ({ request }) => {
  // Several dev servers run on this machine; one without 3.2 answers 404 here
  // and every refusal below would pass for the wrong reason.
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), 'no process-revisions route — wrong server or stale build').toBe(200);
  expect(await res.json()).toEqual({ latest: null, revisions: [] });
});

test('revision 1 is the process reconstructed by the server, and a browser cannot post one', async ({ request }) => {
  // A browser posting its own "revision 1" would be posting an Ist nobody read
  // out of the code. The route reconstructs it and ignores the body.
  const forged = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="forged"><bpmn:process id="p"/></bpmn:definitions>';
  const created = await request.post(path, { headers: headers(), data: { xml: forged, baseRevision: 1 } });
  expect(created.status(), await created.text()).toBe(201);

  const one = await revision(request, 1);
  const expected = buildBpmnExportFromSource(PROGRAM, { processName: 'Requisition release', sourceFileName: FILE_NAME });
  expect(one.revision).toBe(1);
  expect(one.origin).toBe('reconstructed');
  expect(one.xml, 'revision 1 is not what the engine reads out of the source').toBe(expected.xml);
  expect(one.xml).not.toBe(forged);
  expect(one.sourceSha256).toBe(SOURCE_SHA);
  expect(one.fileName).toBe(FILE_NAME);
  expect(one.runId).toBe(RUN_ID);
  expect(one.flowNodes).toBe(expected.stats.flowNodes);
  expect(one.anchored).toBe(expected.stats.anchored);

  // The edit that came with it did not become revision 1 — it became revision 2.
  const two = await revision(request, 2);
  expect(two.origin).toBe('edited');
  expect(two.xml).toBe(forged);
});

test('every revision carries the account and a time this server put on it', async ({ request }) => {
  const before = Date.now();
  const saved = await request.post(path, {
    headers: headers(),
    // A time and an account in the body. Neither may reach the record.
    data: {
      xml: rename(buildBpmnExportFromSource(PROGRAM, { processName: 'Requisition release', sourceFileName: FILE_NAME }).xml, 'Check the request'),
      baseRevision: 2,
      savedAt: '1999-01-01T00:00:00.000Z',
      account: { uid: otherUid, name: 'Somebody Else', email: OTHER_EMAIL },
    },
  });
  expect(saved.status(), await saved.text()).toBe(201);
  const record = (await saved.json()).record as ProcessRevisionRecord;

  expect(record.revision).toBe(3);
  expect(record.account).toEqual({ uid, name: 'Process Revisions', email: EMAIL });
  expect(record.savedAt).not.toBe('1999-01-01T00:00:00.000Z');
  const at = Date.parse(record.savedAt);
  expect(Number.isNaN(at), `savedAt is not a time: ${record.savedAt}`).toBe(false);
  expect(at).toBeGreaterThanOrEqual(before - 60_000);
  expect(at).toBeLessThanOrEqual(Date.now() + 60_000);

  const list = await history(request);
  expect(list.map((r) => r.revision)).toEqual([1, 2, 3]);
  expect(list.map((r) => r.origin)).toEqual(['reconstructed', 'edited', 'edited']);
  // The list is the history, not the models: it carries no BPMN at all.
  expect(JSON.stringify(list)).not.toContain('bpmn:definitions');
});

test('a written revision is never written again, and the Ist is unchanged after editing', async ({ request }) => {
  const one = await revision(request, 1);

  // Ask for revision 1 again: no reconstruction, no overwrite, the same bytes.
  const again = await request.post(path, { headers: headers(), data: {} });
  expect(again.status(), await again.text()).toBe(200);
  expect((await again.json()).created).toBe(false);

  // Try to change it the only way a client can reach Firestore at all.
  await expect(
    setDoc(doc(clientDb, 'projects', PROJECT_ID, 'process_revisions', '1'), { xml: 'rewritten' }),
  ).rejects.toMatchObject({ code: 'permission-denied' });

  // And keep editing through the route.
  const base = (await history(request)).slice(-1)[0].revision;
  const edited = rename(one.xml, 'Deliberately different');
  const next = await request.post(path, { headers: headers(), data: { xml: edited, baseRevision: base } });
  expect(next.status(), await next.text()).toBe(201);

  const still = await revision(request, 1);
  expect(still.xml, 'the reconstructed Ist moved while somebody was modelling').toBe(one.xml);
  expect(still.xmlSha256).toBe(one.xmlSha256);
  expect(still.savedAt).toBe(one.savedAt);
  expect(still.origin).toBe('reconstructed');
  expect(still.account).toEqual(one.account);

  // What changed is on the later revision, and the comparison says so.
  const latest = await revision(request, base + 1);
  const diff = diffProcessRevisions(one, latest);
  expect(diff.identical).toBe(false);
  expect(diff.changed.some((c) => c.fields.some((f) => f.field === 'name' && f.after === 'Deliberately different'))).toBe(true);
});

test('the same bytes again add no revision, and a save from a stale revision is refused', async ({ request }) => {
  const list = await history(request);
  const latest = await revision(request, list.slice(-1)[0].revision);

  const repeat = await request.post(path, { headers: headers(), data: { xml: latest.xml, baseRevision: latest.revision } });
  expect(repeat.status(), await repeat.text()).toBe(200);
  const body = await repeat.json();
  expect(body.created).toBe(false);
  expect(body.unchanged).toBe(true);
  expect(body.record.revision).toBe(latest.revision);
  expect((await history(request)).length, 'saving the same drawing twice added a revision').toBe(list.length);

  // A second editor that opened an older revision does not branch over the newer one.
  const stale = await request.post(path, {
    headers: headers(),
    data: { xml: rename(latest.xml, 'From a stale tab'), baseRevision: 1 },
  });
  expect(stale.status(), await stale.text()).toBe(409);
  const refusal = await stale.json();
  expect(refusal.code).toBe('revision-moved');
  expect(refusal.latest).toBe(latest.revision);
  expect((await history(request)).length).toBe(list.length);

  // And a model that is not BPMN is refused with its own reason.
  const wrong = await request.post(path, { headers: headers(), data: { xml: '{"nodes":[]}', baseRevision: latest.revision } });
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).code).toBe('not-bpmn');
  expect((await history(request)).length).toBe(list.length);
});

test('only the owner reads or writes, and no browser reads the revisions out of Firestore', async ({ request }) => {
  const read = await request.get(path, { headers: headers(otherToken) });
  expect(read.status()).toBe(403);
  expect(JSON.stringify(await read.json())).not.toContain('bpmn:definitions');

  const write = await request.post(path, { headers: headers(otherToken), data: {} });
  expect(write.status()).toBe(403);

  // Not even the owner reads the documents directly: the route is the only way in.
  const auth = getAuth(app);
  expect(auth.currentUser?.uid, 'the client SDK is not signed in as the owner').toBe(uid);
  // The code, not the message: the emulator words a rules denial differently
  // from production ("No matching allow statements").
  await expect(getDoc(doc(clientDb, 'projects', PROJECT_ID, 'process_revisions', '1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  // …while the same session reads the project itself, so the refusal above is
  // the rule and not a signed-out client.
  expect((await getDoc(doc(clientDb, 'projects', PROJECT_ID))).exists()).toBe(true);
});

test('an activeRunId that names no run reconstructs nothing', async ({ request }) => {
  // The finding, as a request. This project carries a truthy `activeRunId` and
  // the mirrored fingerprint of its own source — everything the route used to
  // check — and there is no such run. Before the fix this answered 201 and
  // wrote a revision 1 saying it was the source that run signed.
  const ghost = `/api/projects/${GHOST_RUN_ID}/process-revisions`;
  const res = await request.post(ghost, { headers: headers(), data: {} });
  expect(res.status(), await res.text()).toBe(409);
  const body = await res.json();
  expect(body.code).toBe('run-unverified');
  // It names no reason a caller could probe with: not "no such run", not
  // "signature", not the id.
  expect(body.error).not.toContain(RUN_ID);

  expect(
    await adminDocExists(`projects/${GHOST_RUN_ID}/process_revisions`, '1'),
    'a revision 1 was written for a run that does not exist',
  ).toBe(false);
  const history = await request.get(ghost, { headers: headers() });
  expect(history.status()).toBe(200);
  expect((await history.json()).revisions).toEqual([]);
});

test('a run altered after it was signed reconstructs nothing', async ({ request }) => {
  // `runHash` is still the hash of the payload as it was signed, and the payload
  // is not that payload any more. Confirming that the field is present — which
  // is all this route could have done without loading the run — would pass.
  const altered = `/api/projects/${ALTERED_RUN_ID}/process-revisions`;
  const res = await request.post(altered, { headers: headers(), data: {} });
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('run-unverified');
  expect(await adminDocExists(`projects/${ALTERED_RUN_ID}/process_revisions`, '1')).toBe(false);

  // Put the run back as it was signed and the same request writes revision 1:
  // the refusal above was the alteration and not the fixture.
  await adminSetDoc(`projects/${ALTERED_RUN_ID}/runs`, RUN_ID, signedRun(ALTERED_RUN_ID, RUN_ID));
  const repaired = await request.post(altered, { headers: headers(), data: {} });
  expect(repaired.status(), await repaired.text()).toBe(201);
  const record = (await repaired.json()).record as ProcessRevisionRecord;
  expect(record.revision).toBe(1);
  expect(record.origin).toBe('reconstructed');
  expect(record.runId).toBe(RUN_ID);
  expect(record.sourceSha256).toBe(SOURCE_SHA);
});

test('deleting the project takes its revisions with it', async ({ request }) => {
  const doomed = `/api/projects/${DOOMED_ID}/process-revisions`;
  const created = await request.post(doomed, { headers: headers(), data: {} });
  expect(created.status(), await created.text()).toBe(201);
  expect(await adminDocExists(`projects/${DOOMED_ID}/process_revisions`, '1')).toBe(true);

  const deleted = await request.delete(`/api/projects/${DOOMED_ID}`, { headers: headers() });
  expect(deleted.status(), await deleted.text()).toBe(200);

  // `recursiveDelete` descends into every subcollection of the project document,
  // named or not — this is the check that it really covers this one.
  expect(
    await adminDocExists(`projects/${DOOMED_ID}/process_revisions`, '1'),
    'the project is gone and its revisions are still there',
  ).toBe(false);
});
