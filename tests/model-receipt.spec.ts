import { test, expect, type APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { verifyRunIntegrity } from '../lib/run-signature';
import {
  issueModelReceipt,
  narrativeDigest,
  MODEL_RECEIPT_MAX_AGE_MS,
  MODEL_PROVIDER_ID,
  type ModelReceipt,
} from '../lib/model-receipt';
import { INPUT_IDS, type ManifestInput } from '../lib/input-manifest';

/**
 * A signed run may name a model only where the platform watched one run.
 *
 * `/api/runs/create` used to decide it from the request body alone:
 *
 *     const modelParticipation = finalAnalysisText.trim().length > 0 ? 'narrative' : 'none';
 *
 * Any text at all, and the **signed** run recorded `provider: 'google-gemini'`
 * and a model id for a call nobody had seen. The audit pack said in a "Narrative
 * origin" row that the server had not observed the generation, which documents
 * the claim without making it true.
 *
 * `/api/gemini` now issues a receipt over the account, the digest of the text it
 * returned, the model that served it and the time; `/api/runs/create` verifies
 * it and records a provider only when it verifies. The four cases below are the
 * ones that matter, and every one of them goes through the real routes against
 * the emulators:
 *
 *   1. a narrative with a valid receipt — the signed run names the provider and
 *      the model, and the model it names is the receipt's, not a default;
 *   2. a narrative with no receipt — the run exists, the text is kept, and the
 *      model fields name nothing;
 *   3. a receipt whose digest does not match the text — the same, and the pack
 *      says so. This is the case that separates a signature from a rubber
 *      stamp: a receipt that is not bound to *this* text is a receipt for
 *      "a model was called once", attachable to anything;
 *   4. a receipt issued for a different account — refused.
 *
 * Nothing here waits for a state mid-request: every observation is of a
 * completed HTTP response or a document written before it returned.
 *
 * The receipts are minted here with the same `AUDIT_SIGNING_KEY` the server
 * under test holds, for the same reason `zero-llm-path.spec.ts` re-derives the
 * run HMAC rather than trusting a field called `signature`. The last test closes
 * the loop the other way round, on a machine that has a Gemini key: a receipt
 * this spec never touched, minted by the proxy itself, is accepted.
 */

const STAMP = Date.now();
const EMAIL = `model-receipt-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `model-receipt-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `model-receipt-${STAMP}`;

/** Real ABAP, so the deterministic engine has findings to sign either way. */
const PROGRAM = [
  'REPORT z_model_receipt.',
  'DATA: ls_order TYPE vbak,',
  '      lv_flag  TYPE c LENGTH 1.',
  "SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.",
  "UPDATE vbak SET cmgst = 'B' WHERE vbeln = p_vbeln.",
  "CALL FUNCTION 'Z_LEGACY_CREDIT_CHECK'",
  '  EXPORTING iv_vbeln = p_vbeln',
  '  IMPORTING ev_flag  = lv_flag.',
  "WRITE: / 'Credit status', lv_flag.",
].join('\n');

/**
 * The narrative, exactly as a model would return it — fenced, and carrying two
 * figures the model must not own. The route strips the fence and drops the
 * figures before it signs; the receipt is over the text *as sent*, which is why
 * the browser may no longer rewrite it on the way.
 */
const NARRATIVE_MARKER = `narrative-${STAMP}`;
const NARRATIVE = [
  '```json',
  JSON.stringify({
    summary: NARRATIVE_MARKER,
    complexityScore: 99,
    criticalityScore: 98,
    cleanCoreScore: 97,
    // `strategy` is not optional in practice: `runs/create` maps a gap straight
    // into the project worklist, and Firestore refuses a document with an
    // `undefined` field, so a gap without one fails the whole run with a 500.
    // That is the route as it stands, not something this change introduced.
    gaps: [{ title: 'Credit check', severity: 'High', rationale: 'No standard equivalent', strategy: 'Adopt standard credit management', complexity: 'Medium' }],
  }),
  '```',
].join('\n');

/**
 * Not the route's old hard-coded default (`gemini-3-flash-preview`), on purpose.
 * If the run came back naming that one, the value would be the constant the
 * defect wrote, not the receipt's.
 */
const RECEIPT_MODEL = 'gemini-2.5-pro';

let uid = '';
let otherUid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });
const signingKey = () => {
  const key = process.env.AUDIT_SIGNING_KEY;
  if (!key) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return key;
};

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  connectFirestoreEmulator(clientDb, host || '127.0.0.1', Number(port) || 8080);
}

test.describe.configure({ mode: 'serial' });

interface StoredRun {
  analysis: string;
  modelParticipation?: string;
  model: { provider: string | null; modelId: string | null; byokUsed: boolean };
  aiNarrativeMeta: { provider: string | null; modelId: string | null; responseHash: string | null };
  inputManifest: { inputs: ManifestInput[] };
}

/** Create a run through the real route and read back the document it wrote. */
async function createRun(
  request: APIRequestContext,
  receipt: ModelReceipt | null,
  narrative: string = NARRATIVE,
): Promise<StoredRun> {
  const res = await request.post('/api/runs/create', {
    headers: headers(),
    data: {
      projectId: PROJECT_ID,
      legacyCode: PROGRAM,
      s4Deployment: 'private',
      analysis: narrative,
      uploadedFileName: 'z_model_receipt.abap',
      ...(receipt ? { modelReceipt: receipt } : {}),
    },
  });
  // A run is never refused for a receipt — not a missing one, not a broken one.
  expect(res.status(), await res.text()).toBe(200);
  const { runId } = await res.json();
  const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID, 'runs', runId));
  expect(snap.exists(), 'the run was not written').toBe(true);
  return snap.data() as unknown as StoredRun;
}

function modelInputRevision(run: StoredRun): string | undefined {
  return run.inputManifest.inputs.find((i) => i.id === INPUT_IDS.model)?.revision;
}

/** The narrative is in the run, whatever the run says about where it came from. */
function expectNarrativeKept(run: StoredRun) {
  expect(run.analysis, 'the narrative was dropped').toContain(NARRATIVE_MARKER);
  expect(run.aiNarrativeMeta.responseHash, 'the stored narrative was not hashed').toMatch(/^[0-9a-f]{64}$/);
}

/** Nothing is named, and the run says why: a narrative whose origin is unknown. */
function expectOriginNotEstablished(run: StoredRun) {
  expect(run.modelParticipation).toBe('narrative');
  expect(run.model.provider, 'the run named a provider nobody checked').toBeNull();
  expect(run.model.modelId, 'the run named a model nobody checked').toBeNull();
  expect(run.aiNarrativeMeta.provider).toBeNull();
  expect(run.aiNarrativeMeta.modelId).toBeNull();
  expect(modelInputRevision(run), 'the signed input manifest named a model input').toBe('unattested');
}

async function modelCardOf(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId: PROJECT_ID } });
  expect(res.status(), res.status() === 200 ? '' : await res.text()).toBe(200);
  const zip = await JSZip.loadAsync(await res.body());
  const entry = zip.file('04-model-card.md');
  expect(entry, 'the pack has no model card').toBeTruthy();
  return entry!.async('string');
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  // A second real account, so "issued for someone else" is a receipt for an
  // account that exists rather than for a string that does not. Created first,
  // on purpose: `createUserWithEmailAndPassword` also signs that user in, and
  // `clientDb` below reads the run documents as whoever is signed in. Created
  // last, it would leave every read to this spec coming from an account that
  // owns nothing, and the refusal would look like a rules regression.
  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherUid = other.user.uid;

  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  for (const [id, email] of [[uid, EMAIL], [otherUid, OTHER_EMAIL]] as const) {
    await adminSetDoc('users', id, {
      firstName: 'Model', lastName: 'Receipt', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }

  // One project, one source, re-analysed. The quota is idempotent per source
  // fingerprint, so the whole spec costs a single unit on a shared emulator.
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Credit check with a receipt', userId: uid, createdAt: new Date(),
    status: 'uploaded', legacyCode: PROGRAM, s4Deployment: 'private',
  });
});

test('the server under test is the one that was changed', async ({ request }: { request: APIRequestContext }) => {
  // Several dev servers run on this machine, and a suite that measured the
  // wrong one would report the old behaviour as a regression. A receipt that
  // the route ignores would leave case 1 looking exactly like case 2, so this
  // asserts the discriminator itself before anything depends on it.
  const res = await request.post('/api/runs/create', {
    headers: headers(),
    data: {
      projectId: PROJECT_ID, legacyCode: PROGRAM, s4Deployment: 'private',
      analysis: NARRATIVE, uploadedFileName: 'z_model_receipt.abap',
      modelReceipt: issueModelReceipt({ uid, text: NARRATIVE, modelId: RECEIPT_MODEL, byok: false }, signingKey()),
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { runId } = await res.json();
  const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID, 'runs', runId));
  expect(
    (snap.data() as { modelParticipation?: string }).modelParticipation,
    'this server does not know `narrative-attested` — wrong server or stale build',
  ).toBe('narrative-attested');
});

test('case 1 — a narrative with a valid receipt: the signed run names the provider and the model', async ({ request }) => {
  const receipt = issueModelReceipt({ uid, text: NARRATIVE, modelId: RECEIPT_MODEL, byok: false }, signingKey());
  const run = await createRun(request, receipt);

  expect(run.modelParticipation).toBe('narrative-attested');
  expect(run.model.provider).toBe(MODEL_PROVIDER_ID);
  // The receipt's model, not the constant the defect used to write.
  expect(run.model.modelId, 'the run named a default instead of the observed model').toBe(RECEIPT_MODEL);
  expect(run.model.modelId).not.toBe('gemini-3-flash-preview');
  expect(run.aiNarrativeMeta.provider).toBe(MODEL_PROVIDER_ID);
  expect(run.aiNarrativeMeta.modelId).toBe(RECEIPT_MODEL);
  expectNarrativeKept(run);

  // Inside the signature, not beside it: the manifest names the same model, and
  // the stored hash recomputes under the deployment's key.
  expect(modelInputRevision(run)).toBe(`${MODEL_PROVIDER_ID}/${RECEIPT_MODEL}`);
  expect(verifyRunIntegrity(run as unknown as Record<string, unknown>, signingKey())).toEqual({ valid: true });

  // The narrative may now be sent exactly as the proxy returned it, because the
  // receipt is over that text. The two figures the model must not own are
  // dropped by the route instead of by the browser, and the authoritative
  // Clean Core Score replaces the model's.
  const stored = JSON.parse(run.analysis);
  expect(stored.complexityScore, 'the model kept a figure it does not own').toBeUndefined();
  expect(stored.criticalityScore, 'the model kept a figure it does not own').toBeUndefined();
  expect(stored.cleanCoreScore, 'the narrative kept the model\'s own score').not.toBe(97);

  const card = await modelCardOf(request);
  expect(card).toContain(`| Model Provider | ${MODEL_PROVIDER_ID} |`);
  expect(card).toContain(`| Model Identifier | ${RECEIPT_MODEL} |`);
  expect(card).toMatch(/\| Narrative origin \| Observed — the platform issued a receipt/);
});

test('case 2 — a narrative with no receipt: the run exists, the text is kept, nothing is named', async ({ request }) => {
  const run = await createRun(request, null);
  expectNarrativeKept(run);
  expectOriginNotEstablished(run);
  expect(verifyRunIntegrity(run as unknown as Record<string, unknown>, signingKey())).toEqual({ valid: true });

  const card = await modelCardOf(request);
  expect(card, 'the pack named a provider for a narrative nobody vouched for').not.toContain(MODEL_PROVIDER_ID);
  expect(card).toContain('| Model Provider | Not established');
  expect(card).toMatch(/\| Narrative origin \| Not established — submitted with the analysis/);
});

test('case 3 — a receipt whose digest does not match the text is not a receipt for it', async ({ request }) => {
  // Issued over a different narrative, attached to this one. Everything else
  // about it is genuine: the account is right, the MAC verifies, it is minutes
  // old. Only the binding to the text is missing — and without that binding a
  // receipt says no more than "a model was called once".
  const elsewhere = issueModelReceipt(
    { uid, text: 'a narrative the model wrote for some other run', modelId: RECEIPT_MODEL, byok: false },
    signingKey(),
  );
  expect(elsewhere.textSha256, 'the fixture is not actually a mismatch').not.toBe(narrativeDigest(NARRATIVE));

  const run = await createRun(request, elsewhere);
  expectNarrativeKept(run);
  expectOriginNotEstablished(run);
  expect(verifyRunIntegrity(run as unknown as Record<string, unknown>, signingKey())).toEqual({ valid: true });

  const card = await modelCardOf(request);
  expect(card, 'a mismatched receipt still put a provider in the pack').not.toContain(MODEL_PROVIDER_ID);
  expect(card).toContain('| Model Provider | Not established');
  expect(card).toContain('| Model Identifier | Not established');
  expect(card).toMatch(/\| Narrative origin \| Not established — submitted with the analysis/);
  expect(card).toContain('| BYOK (Bring Your Own Key) | Not established');
  // And the paragraph no longer credits a model for the text.
  expect(card).toContain('A written narrative is stored with this run and its origin was not established');
});

test('case 4 — a receipt issued for a different account is refused', async ({ request }) => {
  const borrowed = issueModelReceipt(
    { uid: otherUid, text: NARRATIVE, modelId: RECEIPT_MODEL, byok: true },
    signingKey(),
  );
  const run = await createRun(request, borrowed);
  expectNarrativeKept(run);
  expectOriginNotEstablished(run);
  // The borrowed receipt claimed BYOK. Nothing of it reached the run.
  expect(run.model.byokUsed).toBe(false);
});

test('a receipt signed with another key, one that has expired, and a hand-written one are all refused', async ({ request }) => {
  const forged = issueModelReceipt({ uid, text: NARRATIVE, modelId: RECEIPT_MODEL, byok: false }, 'not-the-signing-key');
  expectOriginNotEstablished(await createRun(request, forged));

  const stale = issueModelReceipt(
    { uid, text: NARRATIVE, modelId: RECEIPT_MODEL, byok: false, issuedAt: Date.now() - MODEL_RECEIPT_MAX_AGE_MS - 60_000 },
    signingKey(),
  );
  expectOriginNotEstablished(await createRun(request, stale));

  // No MAC at all — the shape of a receipt with none of its authority.
  const bare = {
    v: 1, uid, textSha256: narrativeDigest(NARRATIVE), provider: MODEL_PROVIDER_ID,
    modelId: RECEIPT_MODEL, byok: false, iat: Date.now(), mac: 'f'.repeat(64),
  } as ModelReceipt;
  expectOriginNotEstablished(await createRun(request, bare));
});

test('the proxy issues a receipt the run route accepts', async ({ request }) => {
  // The other half of the loop, with a receipt this spec never touched. It
  // needs a real Gemini key, which not every machine has; the four cases above
  // do not depend on it.
  const stages = await request.get('/api/model-stages', { headers: headers() });
  expect(stages.status(), await stages.text()).toBe(200);
  const { keyAvailable } = await stages.json();
  test.skip(!keyAvailable, 'no Gemini key on this machine — the proxy cannot make a call to issue a receipt for');

  const proxied = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Reply with the single word: acknowledged.', stage: 'analyze' },
  });
  expect(proxied.status(), await proxied.text()).toBe(200);
  const { text, receipt } = await proxied.json();
  expect(typeof text, 'the proxy returned no text').toBe('string');
  expect(receipt, 'the proxy returned no receipt').toBeTruthy();

  // The receipt describes the call that was actually made.
  expect(receipt.uid).toBe(uid);
  expect(receipt.provider).toBe(MODEL_PROVIDER_ID);
  expect(receipt.textSha256, 'the receipt is not bound to the text it came with').toBe(narrativeDigest(text));
  expect(Date.now() - receipt.iat).toBeLessThan(MODEL_RECEIPT_MAX_AGE_MS);

  const run = await createRun(request, receipt as ModelReceipt, text);
  expect(run.modelParticipation).toBe('narrative-attested');
  expect(run.model.provider).toBe(MODEL_PROVIDER_ID);
  expect(run.model.modelId).toBe(receipt.modelId);
});
