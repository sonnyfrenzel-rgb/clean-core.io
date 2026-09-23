/**
 * An invited reader can read the process, and only read it.
 *
 * Gegenreview c5085bb, CR-13: the four process routes — map, naming,
 * revisions, states — asked for the owner on GET as well, so a valid invitation
 * opened the project and hid its process. Reading is by membership
 * (`mayReadProject`), writing is the owner's; a stranger gets neither. Run
 * against the emulators with three real accounts, not against a mock of the
 * gate.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';

const STAMP = Date.now();
const SIGN_IN = 'Sign-in-Pass-1!';
const PROJECT_ID = `reader-routes-${STAMP}`;
const ROUTES = ['process-map', 'process-naming', 'process-revisions', 'process-states'] as const;

const tokens: Record<'owner' | 'reader' | 'stranger', string> = { owner: '', reader: '', stranger: '' };
const headersOf = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const uids: Record<keyof typeof tokens, string> = { owner: '', reader: '', stranger: '' };
  for (const who of ['stranger', 'reader', 'owner'] as const) {
    const cred = await createUserWithEmailAndPassword(auth, `${who}-${STAMP}@example.com`, SIGN_IN);
    uids[who] = cred.user.uid;
    tokens[who] = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: who, lastName: 'Account', email: `${who}-${STAMP}@example.com`, tier: 'pilot', status: 'approved',
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Shared process', userId: uids.owner, createdAt: new Date(), status: 'analyzed',
    legacyCode: "REPORT z_shared.\nSELECT SINGLE * FROM mara INTO @DATA(ls) WHERE matnr = '1'.\nIF sy-subrc = 0.\n  WRITE 'found'.\nENDIF.\n",
    readers: [uids.reader],
  });
});

for (const route of ROUTES) {
  test(`${route}: the invited reader reads, the stranger does not, and neither writes`, async ({ request }: { request: APIRequestContext }) => {
    const url = `/api/projects/${PROJECT_ID}/${route}`;

    // 404 is in the refusal list as well: since 23.09.2026 these routes refuse
    // a non-owner with the same "Project not found." they answer for an id that
    // names nothing, so a reader who is wrongly turned away is turned away with
    // a 404 and would otherwise slip past this check.
    const REFUSALS = [401, 403, 404];

    const asReader = await request.get(url, { headers: headersOf('reader') });
    expect(REFUSALS, `${route}: the invited reader was refused (${asReader.status()}: ${(await asReader.text()).slice(0, 120)})`).not.toContain(asReader.status());

    const asOwner = await request.get(url, { headers: headersOf('owner') });
    expect(REFUSALS, `${route}: the owner was refused`).not.toContain(asOwner.status());

    const asStranger = await request.get(url, { headers: headersOf('stranger') });
    expect(asStranger.status(), `${route}: a stranger read the process`).toBe(404);

    // Writing stays the owner's — the reader's POST is refused at the gate,
    // before any body is looked at. The reader is told what a stranger is told:
    // they may see the project, and the refusal still says nothing about it.
    const readerWrites = await request.post(url, { headers: headersOf('reader'), data: {} });
    expect(readerWrites.status(), `${route}: the reader was allowed to write`).toBe(404);
  });
}
