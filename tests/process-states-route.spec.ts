import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import type { ProcessRevisionRecord } from '../lib/process-revisions';
import {
  markAffectedDerivations,
  readProcessStates,
  subjectIdsOf,
  type ProcessStateView,
} from '../lib/process-states';

/**
 * Keep · Change deliberately · Drop · Clarify, against the emulators and the
 * real route — roadmap 3.5.
 *
 * Five claims, and the fourth is the phase's acceptance condition:
 *
 *   1. a confirmation is a **new revision**, written with
 *      `DocumentReference.create()` into a subcollection of its own, and no
 *      client can read or write it straight out of Firestore;
 *   2. the **account and the time come from this server**. A body carrying its
 *      own `account` and `confirmedAt` — and a different account's uid — is
 *      ignored;
 *   3. `undecided` counts the subjects of this process that have no answer, over
 *      the elements of the reconstructed Ist and the rules of the source it was
 *      reconstructed from;
 *   4. **the Ist revision is unchanged after confirming.** Revision 1 of the
 *      process is byte for byte what it was, no process revision was added, and
 *      the need lives on its own counter;
 *   5. **W22-A14** — a rule confirmed as Change marks only the elements drawn
 *      from it, through the links this route hands out.
 *
 * The run seeded below is signed with the same hash and HMAC `api/runs/create`
 * produces, because revision 1 is only written for a run that verifies; an
 * unsigned fixture would fail every test here for a reason that is not its own.
 */

const STAMP = Date.now();
const EMAIL = `process-states-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `process-states-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `process-states-${STAMP}`;
const RUN_ID = `run-${STAMP}`;

const PROGRAM = [
  'REPORT z_states_route.',
  'START-OF-SELECTION.',
  '  PERFORM check_vendor.',
  '  PERFORM check_price.',
  'FORM check_vendor.',
  "  IF gv_lifnr = '0000100001'.",
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM check_price.',
  '  IF gv_netpr > 5000.',
  '    MESSAGE e002(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM notify_buyer.',
  "  CALL FUNCTION 'Z_NOTIFY_BUYER'.",
  'ENDFORM.',
].join('\n');

const FILE_NAME = 'z_states_route.abap';
const SOURCE_SHA = sha256Hex(PROGRAM);

let uid = '';
let otherUid = '';
let idToken = '';
let otherToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const path = `/api/projects/${PROJECT_ID}/process-states`;
const revisionsPath = `/api/projects/${PROJECT_ID}/process-revisions`;

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectFirestoreToEmulator(clientDb);

test.describe.configure({ mode: 'serial' });

async function view(request: APIRequestContext, token = idToken): Promise<ProcessStateView> {
  const res = await request.get(path, { headers: headers(token) });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).view as ProcessStateView;
}

async function revisionOne(request: APIRequestContext): Promise<ProcessRevisionRecord> {
  const res = await request.get(`${revisionsPath}?revision=1`, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).record as ProcessRevisionRecord;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);

  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherUid = other.user.uid;
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  for (const [id, email, first] of [[uid, EMAIL, 'Mara'], [otherUid, OTHER_EMAIL, 'Other']]) {
    await adminSetDoc('users', id, {
      firstName: first, lastName: 'Weber', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }

  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release', userId: uid, createdAt: new Date(),
    status: 'analyzed', legacyCode: PROGRAM, s4Deployment: 'private',
    activeRunId: RUN_ID,
    inputFingerprint: { sha256: SOURCE_SHA, fileName: FILE_NAME },
  });

  const unsigned = {
    runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed',
    inputFingerprint: {
      sha256: SOURCE_SHA, fileName: FILE_NAME,
      lineCount: PROGRAM.split('\n').length,
      byteSize: Buffer.byteLength(PROGRAM, 'utf8'),
      objectType: 'Report',
    },
  };
  const runHash = recomputeStoredRunHash(unsigned);
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
});

test('a process that was never reconstructed has nothing to confirm', async ({ request }) => {
  // Before revision 1 exists. The need is stated about the Ist, so the refusal
  // names the next step instead of handing out an empty list, which would read
  // as "there is nothing here to answer".
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('no-baseline');

  // Now reconstruct it through 3.2's route — the one write that verifies the run.
  const built = await request.post(revisionsPath, { headers: headers(), data: {} });
  expect(built.status(), await built.text()).toBe(201);

  const current = await view(request);
  expect(current.revision, 'a process nobody confirmed is at revision 0').toBe(0);
  expect(current.baselineRevision).toBe(1);
  expect(current.entries).toEqual([]);
  expect(current.subjects.filter((s) => s.kind === 'element').length).toBeGreaterThan(2);
  expect(current.subjects.filter((s) => s.kind === 'rule').length).toBeGreaterThanOrEqual(2);
  // C23-A06: an element with no line range carries no anchor, and none is invented.
  for (const subject of current.subjects) {
    expect(subject.anchor === null || /^line/.test(subject.anchor)).toBe(true);
  }
});

test('a confirmation is a new revision, and its name and time come from this server', async ({ request }) => {
  const before = Date.now();
  const current = await view(request);
  const rule = current.subjects.find((s) => s.kind === 'rule')!;

  const res = await request.post(path, {
    headers: headers(),
    data: {
      baseRevision: 0,
      choices: [{ subject: rule.subject, kind: 'rule', state: 'keep' }],
      // A time, an account and somebody else's uid in the body. None may reach
      // the record.
      confirmedAt: '1999-01-01T00:00:00.000Z',
      account: { uid: otherUid, name: 'Somebody Else' },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.created).toBe(true);

  const stored = (body.view as ProcessStateView).entries.find((e) => e.subject === rule.subject)!;
  expect(stored.state).toBe('keep');
  expect(stored.revision, 'the first confirmation is revision 1 of the need').toBe(1);
  expect(stored.account).toEqual({ uid, name: 'Mara Weber' });
  expect(stored.confirmedAt).not.toBe('1999-01-01T00:00:00.000Z');
  const at = Date.parse(stored.confirmedAt);
  expect(Number.isNaN(at), `confirmedAt is not a time: ${stored.confirmedAt}`).toBe(false);
  expect(at).toBeGreaterThanOrEqual(before - 60_000);
  expect(at).toBeLessThanOrEqual(Date.now() + 60_000);

  // And it is in the store, not only in the answer.
  const again = await view(request);
  expect(again.revision).toBe(1);
  expect(again.entries.find((e) => e.subject === rule.subject)?.account.name).toBe('Mara Weber');

  // Confirming exactly the same answer again writes nothing — a retried request
  // must not become a second revision.
  const repeat = await request.post(path, {
    headers: headers(),
    data: { baseRevision: 1, choices: [{ subject: rule.subject, kind: 'rule', state: 'keep' }] },
  });
  expect(repeat.status(), await repeat.text()).toBe(200);
  expect((await repeat.json()).created).toBe(false);
  expect((await view(request)).revision).toBe(1);
});

test('undecided counts the subjects of this process that have no answer', async ({ request }) => {
  const current = await view(request);
  const ids = subjectIdsOf(current.subjects);
  const total = ids.elements.length + ids.rules.length;
  const states = readProcessStates(current.entries, ids);

  expect(states.counts.keep).toBe(1);
  expect(states.counts.undecided).toBe(total - 1);
  expect(
    states.counts.keep + states.counts.change + states.counts.drop + states.counts.clarify + states.counts.undecided,
  ).toBe(total);
});

test('a changed confirmed rule marks only the elements drawn from it', async ({ request }) => {
  const current = await view(request);
  // Two rules, each with derivations of its own and the two sets disjoint.
  // Without a second one, "marks only its own" would be true of a function that
  // marks every element it is told about — the marking W22-A14 forbids.
  const withElements = current.links.filter((l) => l.elements.length > 0);
  expect(withElements.length, 'this fixture has fewer than two rules with derivations').toBeGreaterThanOrEqual(2);
  const link = withElements[0];
  const other = withElements[1];
  expect(link.elements.some((id) => other.elements.includes(id)), 'the two rules share an element').toBe(false);

  const res = await request.post(path, {
    headers: headers(),
    data: {
      baseRevision: current.revision,
      choices: [{
        subject: link.rule,
        kind: 'rule',
        state: 'change',
        note: 'The tolerance comes from configuration per material group.',
      }],
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const next = (await res.json()).view as ProcessStateView;

  const states = readProcessStates(next.entries, subjectIdsOf(next.subjects));
  const marks = markAffectedDerivations(states, next.links);
  expect(marks.map((m) => m.element).sort()).toEqual([...link.elements].sort());

  const elements = next.subjects.filter((s) => s.kind === 'element').map((s) => s.subject);
  const untouched = elements.filter((id) => !link.elements.includes(id));
  expect(untouched.length, 'every element is drawn from the one changed rule').toBeGreaterThan(0);
  for (const id of untouched) {
    expect(marks.some((m) => m.element === id), `${id} is drawn from no changed rule and was marked anyway`).toBe(false);
  }
  for (const id of other.elements) {
    expect(marks.some((m) => m.element === id), `${id} belongs to ${other.rule}, which nobody changed`).toBe(false);
  }
});

test('the reconstructed Ist is unchanged after confirming, and no process revision was added', async ({ request }) => {
  // Phase 3's acceptance condition. The need has its own counter, and nothing
  // a confirmation does reaches the drawing.
  const one = await revisionOne(request);
  expect(one.origin).toBe('reconstructed');

  const current = await view(request);
  const element = current.subjects.find((s) => s.kind === 'element')!;
  const res = await request.post(path, {
    headers: headers(),
    data: {
      baseRevision: current.revision,
      choices: [{ subject: element.subject, kind: 'element', state: 'drop', note: 'This step is not needed any more.' }],
    },
  });
  expect(res.status(), await res.text()).toBe(201);

  const still = await revisionOne(request);
  expect(still.xml, 'the reconstructed Ist moved while somebody was confirming').toBe(one.xml);
  expect(still.xmlSha256).toBe(one.xmlSha256);
  expect(still.savedAt).toBe(one.savedAt);
  expect(still.account).toEqual(one.account);

  const history = await request.get(revisionsPath, { headers: headers() });
  expect(history.status()).toBe(200);
  const revisions = (await history.json()).revisions as Array<{ revision: number }>;
  expect(revisions.map((r) => r.revision), 'confirming the need added a revision of the drawing').toEqual([1]);
});

test('Change and Drop need a reason, and a refused confirmation writes nothing', async ({ request }) => {
  const current = await view(request);
  const rule = current.subjects.filter((s) => s.kind === 'rule')[1]!;

  const noReason = await request.post(path, {
    headers: headers(),
    data: { baseRevision: current.revision, choices: [{ subject: rule.subject, kind: 'rule', state: 'drop' }] },
  });
  expect(noReason.status()).toBe(400);
  expect((await noReason.json()).code).toBe('note-required');
  expect((await view(request)).revision, 'a refused confirmation added a revision').toBe(current.revision);

  // A subject this process does not have is refused by name, and writes nothing.
  const unknown = await request.post(path, {
    headers: headers(),
    data: { baseRevision: current.revision, choices: [{ subject: 'BR-404', kind: 'rule', state: 'keep' }] },
  });
  expect(unknown.status()).toBe(409);
  expect((await unknown.json()).code).toBe('unknown-subject');

  // And answers read from a revision that has moved do not branch over the newer one.
  const stale = await request.post(path, {
    headers: headers(),
    data: { baseRevision: 0, choices: [{ subject: rule.subject, kind: 'rule', state: 'keep' }] },
  });
  expect(stale.status()).toBe(409);
  const refusal = await stale.json();
  expect(refusal.code).toBe('revision-moved');
  expect(refusal.latest).toBe(current.revision);
  expect((await view(request)).revision).toBe(current.revision);
});

test('only the owner reads or writes, and no browser reads the confirmations out of Firestore', async ({ request }) => {
  // 404, not 403: the route answers a non-owner exactly as it answers an id
  // that names nothing, so a refusal cannot be used to ask whether a project
  // exists (tests/project-access-matrix.spec.ts, '403-vs-404').
  const read = await request.get(path, { headers: headers(otherToken) });
  expect(read.status()).toBe(404);

  const write = await request.post(path, {
    headers: headers(otherToken),
    data: { baseRevision: 0, choices: [{ subject: 'BR-001', kind: 'rule', state: 'keep' }] },
  });
  expect(write.status()).toBe(404);

  // Not even the owner reaches the documents directly: the route is the only way in.
  const auth = getAuth(app);
  expect(auth.currentUser?.uid, 'the client SDK is not signed in as the owner').toBe(uid);
  await expect(getDoc(doc(clientDb, 'projects', PROJECT_ID, 'process_states', '1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setDoc(doc(clientDb, 'projects', PROJECT_ID, 'process_states', '1'), { entries: [] }))
    .rejects.toMatchObject({ code: 'permission-denied' });
  // …while the same session reads the project itself, so the refusal above is
  // the rule and not a signed-out client.
  expect((await getDoc(doc(clientDb, 'projects', PROJECT_ID))).exists()).toBe(true);
});
