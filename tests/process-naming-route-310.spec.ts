import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { issueModelReceipt } from '../lib/model-receipt';
import {
  NAMING_MADE_FROM_FACTS,
  applyNaming,
  namingContextHasFacts,
  namingContextOf,
  type ProcessNamingRecord,
} from '../lib/process-naming';

/**
 * The naming route for a project whose run was read by engine 3.1.0, against the emulators and the real route
 * (`tests/process-naming-route.spec.ts` holds the paused 3.0.21 reading). The model is not called: the answer is
 * written here and its receipt minted with the `AUDIT_SIGNING_KEY` the server under test holds. Under test: a
 * verified answer is validated against the server's own 3.1.0 reading, stored with `madeFrom: engine-facts` and its
 * origin, read back, and applies to that reading; a receipt that does not verify stores nothing.
 */

const STAMP = Date.now();
const EMAIL = `naming-310-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `naming-310-${STAMP}`;
const ENGINE = 'v3.1.0';

const PROGRAM = [
  'REPORT z_naming_route.',
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

const CONTEXT = namingContextOf(PROGRAM, { engineVersion: ENGINE });
const DENIED = CONTEXT.skeleton.nodes.find((n) => n.kind === 'gateway' && n.label === 'IF sy-subrc <> 0')!.id;
/** The ids of the facts the engine proved about the check: a 3.1.0 name has to cite them. */
const CITED = (CONTEXT.facts?.get(DENIED) ?? []).map((f) => f.id);
/** One name that fits and cites its facts, and one id the reading does not have. */
const ANSWER = JSON.stringify({ names: [{ id: DENIED, name: 'Access authorized?', facts: CITED }, { id: 'nd-999-0', name: 'Approve by phone' }], lanes: [] });

let uid = '';
let token = '';
const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const path = `/api/projects/${PROJECT_ID}/process-naming`;
const key = () => {
  const k = process.env.AUDIT_SIGNING_KEY;
  if (!k) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return k;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  token = await cred.user.getIdToken();
  await adminSetDoc('users', uid, {
    firstName: 'Naming', lastName: 'Facts', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  // A run read by engine 3.1.0: the route reads the source with the project's own engine version.
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release', userId: uid, createdAt: new Date(), status: 'analyzed',
    legacyCode: PROGRAM, s4Deployment: 'private', activeRunId: `run-${STAMP}`, analyzerVersion: ENGINE,
  });
});

test('the fixture is a reading with the engine\'s facts', () => {
  expect(namingContextHasFacts(CONTEXT)).toBe(true);
});

test('a receipt that does not verify stores nothing', async ({ request }) => {
  const forged = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-test', byok: false, stage: 'naming' }, 'not-the-signing-key');
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt: forged } });
  expect(res.status(), await res.text()).toBe(422);
  expect(await adminGetDoc(`projects/${PROJECT_ID}/process_naming`, 'current')).toBeNull();
});

test('a verified answer is stored as made from the engine\'s facts, read back, and applies to the 3.1.0 reading', async ({ request }) => {
  const receipt = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-test', byok: false, stage: 'naming' }, key());
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: ProcessNamingRecord };
  expect(record.madeFrom).toBe(NAMING_MADE_FROM_FACTS);
  expect(record.digest).toBe(CONTEXT.digest);
  expect(record.names).toEqual([expect.objectContaining({ id: DENIED, name: 'Access authorized?' })]);
  expect(record.discarded.total).toBe(1);
  expect(record.origin).toMatchObject({ source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-test', byok: false });

  const stored = await adminGetDoc(`projects/${PROJECT_ID}/process_naming`, 'current');
  expect(stored?.madeFrom).toBe(NAMING_MADE_FROM_FACTS);
  expect(stored?.requestedBy).toBe(uid);
  const read = await request.get(path, { headers: headers() });
  expect(read.status()).toBe(200);
  const back = ((await read.json()) as { record: ProcessNamingRecord }).record;
  expect(back).toEqual(record);

  const view = applyNaming(CONTEXT, back);
  expect(view.counts.named).toBe(1);
  expect(view.nodes.find((n) => n.id === DENIED)?.businessName).toBe('Access authorized?');
});
