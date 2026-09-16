import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, updateDoc } from 'firebase/firestore';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { starterExampleIndex, fingerprintExampleSource } from '../lib/starter-example-fingerprints';
import { starterExampleIsFree } from '../lib/run-quota-rule';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Roadmap 0.9 — the eight shipped examples cost no quota, each once per account.
 *
 * Executed against the emulators through the route that actually meters, because
 * every interesting part of this rule is a *second* fact about the same request:
 * that the example was recognised from its source text and not from anything the
 * caller said, that the second start of the same example is charged although the
 * re-analysis exemption would have made it free, that an example somebody edited
 * is their own code, and that a run which does not complete costs nothing — free
 * slot or unit. A source grep sees none of those.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe.configure({ mode: 'serial' });

const EMAIL = `starter-quota-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

const EXAMPLE = STARTER_EXAMPLES.find((e) => e.name === 'Z_MATERIAL_STOCK_CALC')!;
/** The one shipped source that carries a byte-order mark — see the fingerprint module. */
const BOM_EXAMPLE = STARTER_EXAMPLES.find((e) => e.name === 'ZLEGACY_ORDER_FULFILLMENT_AUDIT')!;

/** Exactly what the browser hands on: UTF-8 decoded, byte-order mark dropped. */
async function exampleSource(request: APIRequestContext, file: string): Promise<string> {
  const res = await request.get(`/starter-examples/${file}`);
  expect(res.status(), file).toBe(200);
  return new TextDecoder().decode(await res.body());
}

interface QuotaDoc {
  transformationsUsed?: number;
  chargedInputs?: Record<string, boolean>;
  starterExamplesUsed?: Record<string, boolean>;
  [key: string]: unknown;
}

async function profile(): Promise<QuotaDoc> {
  return ((await db().collection('users').doc(uid).get()).data() ?? {}) as QuotaDoc;
}

/** Puts the account back to a fresh, approved, nothing-used state. */
async function resetAccount(over: Record<string, unknown> = {}) {
  await adminSetDoc('users', uid, {
    firstName: 'Starter', lastName: 'Quota', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(), ...over,
  });
}

let projectSeq = 0;
async function newProject(): Promise<string> {
  const projectId = `starter-quota-${Date.now()}-${projectSeq++}`;
  await adminSetDoc('projects', projectId, {
    userId: uid, name: 'Starter example quota', status: 'uploaded', createdAt: new Date(),
  });
  return projectId;
}

async function analyse(
  request: APIRequestContext,
  legacyCode: string,
  extra: Record<string, unknown> = {},
) {
  const projectId = await newProject();
  return request.post('/api/runs/create', {
    headers: headers(),
    data: { projectId, legacyCode, s4Deployment: 'public', analysis: '{}', ...extra },
  });
}

/**
 * A run that fails *after* the quota reservation. `uploadedFileName` travels
 * straight into the run document, and Firestore refuses an array inside an array,
 * so the write throws where a signing or storage failure would — which is the
 * path "never on an abort or an error" has to survive.
 */
const BREAKS_AFTER_RESERVATION = { uploadedFileName: [['not a file name']] };

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  await resetAccount();
});

test.describe('the shipped examples are recognised from the source text alone', () => {
  test('every example has a distinct fingerprint, and it is the one the browser produces', async ({ request }) => {
    const index = await starterExampleIndex();
    expect(index.size, 'all eight shipped sources were read and fingerprinted').toBe(STARTER_EXAMPLES.length);
    expect(new Set(index.values()).size, 'one entry per example, no collisions').toBe(STARTER_EXAMPLES.length);

    // The half that matters: the fingerprint taken off disk equals the fingerprint
    // of the bytes the product actually serves, byte-order mark and line endings
    // included. A committed constant could not say this on both platforms.
    for (const example of [EXAMPLE, BOM_EXAMPLE]) {
      const served = await exampleSource(request, example.file);
      expect(index.get(fingerprintExampleSource(served)), example.name).toBe(example.name);
    }
  });
});

test.describe('the four places that state the rule state the whole of it', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  // Roadmap 0.9 names these four: each said "re-analysing the same source is
  // free" and nothing else, which stopped being the whole truth the moment a
  // second start of an example began to cost a run.
  for (const rel of [
    'app/terms/page.tsx',
    'lib/welcome-email.ts',
    'lib/clean-core-capabilities.ts',
    'components/admin/UsageQuotaPanel.tsx',
  ]) {
    test(`${rel} says what a second start of an example costs`, () => {
      const s = read(rel);
      expect(s, 'the starter examples are named').toMatch(/starter\s+examples?/i);
      expect(s, 'and so is what a further start costs').toMatch(/further|again|second/i);
    });
  }
});

test.describe('an example costs nothing the first time, and counts every time after', () => {
  test('every example name is a safe Firestore field path segment', () => {
    // The free-run record is keyed by these names and released through a dotted
    // field path in `refundRunQuota`. A dot or a slash in one of them would point
    // that path at a different field.
    for (const example of STARTER_EXAMPLES) {
      expect(example.name, example.file).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });

  test('the first run of an unchanged example spends no unit', async ({ request }) => {
    await resetAccount();
    const source = await exampleSource(request, EXAMPLE.file);

    const res = await analyse(request, source);
    expect(res.status(), await res.text()).toBe(200);

    const after = await profile();
    expect(after.transformationsUsed, 'no unit was spent on the first example run').toBe(0);
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'the free run was recorded server-side').toBe(true);
    // Bookkeeping stays out of chargedInputs — that map is what makes a re-run
    // free, which is precisely what must not happen to an example.
    expect(after.chargedInputs?.[fingerprintExampleSource(source)]).toBeUndefined();
  });

  test('two simultaneous first starts consume one free run, not two', async ({ request }) => {
    // The free run is bookkeeping read and then written, so the interesting
    // question is what happens when two requests read it in the same instant.
    // Every other test here is serial and cannot see it: both would find
    // `starterExamplesUsed` empty, both would take the free path, and the
    // account would get two free analyses of the same example (QA review of
    // 6a24b632ff44). The reservation is a transaction, so exactly one wins.
    await resetAccount();
    const source = await exampleSource(request, EXAMPLE.file);

    const [a, b] = await Promise.all([analyse(request, source), analyse(request, source)]);
    const completed = [a, b].filter((r) => r.status() === 200);
    expect(completed.length, `neither run completed: ${a.status()} / ${b.status()}`).toBeGreaterThanOrEqual(1);

    const after = await profile();
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'the free run was not recorded').toBe(true);
    // Exactly one of the completed runs was the free one. Two completed runs
    // must therefore have spent one unit; a single completed run, none.
    expect(after.transformationsUsed, 'more than one run was given away free').toBe(completed.length - 1);
  });

  test('the file with a byte-order mark is recognised too', async ({ request }) => {
    await resetAccount();
    const source = await exampleSource(request, BOM_EXAMPLE.file);
    test.setTimeout(120 * 1000);

    const res = await analyse(request, source);
    expect(res.status(), await res.text()).toBe(200);
    const after = await profile();
    expect(after.transformationsUsed).toBe(0);
    expect(after.starterExamplesUsed?.[BOM_EXAMPLE.name]).toBe(true);
  });

  test('every further start of the same example is charged, past the re-analysis rule', async ({ request }) => {
    await resetAccount();
    const source = await exampleSource(request, EXAMPLE.file);

    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed, 'first run: free').toBe(0);

    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed, 'second run: one unit').toBe(1);

    // The third one is the case the ordinary rule would give away: the same
    // fingerprint is now in chargedInputs, which makes any other source free
    // forever. An example is charged again anyway.
    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed, 'third run: another unit').toBe(2);
  });

  test('an edited example is the visitor\'s own code and is charged', async ({ request }) => {
    await resetAccount();
    const source = await exampleSource(request, EXAMPLE.file);
    const edited = `${source}\n* one line of my own\n`;
    expect(
      (await starterExampleIndex()).has(fingerprintExampleSource(edited)),
      'a changed example is not one of the shipped fingerprints any more',
    ).toBe(false);

    const res = await analyse(request, edited);
    expect(res.status(), await res.text()).toBe(200);

    const after = await profile();
    expect(after.transformationsUsed, 'a changed example costs a unit').toBe(1);
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'and it did not eat the free run').toBeUndefined();

    // Which the unchanged source then still has.
    expect((await analyse(request, source)).status()).toBe(200);
    const later = await profile();
    expect(later.transformationsUsed, 'the untouched example is still free').toBe(1);
    expect(later.starterExamplesUsed?.[EXAMPLE.name]).toBe(true);
  });
});

test.describe('nothing is spent on a run that does not complete', () => {
  test('a failed first run leaves the free example free', async ({ request }) => {
    await resetAccount();
    const source = await exampleSource(request, EXAMPLE.file);

    const failed = await analyse(request, source, BREAKS_AFTER_RESERVATION);
    expect(failed.status(), 'the run failed after the reservation').toBe(500);

    const after = await profile();
    expect(after.transformationsUsed).toBe(0);
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'the free run was handed back').toBeUndefined();

    // And it is genuinely still there: the next attempt is the free one.
    expect((await analyse(request, source)).status()).toBe(200);
    const later = await profile();
    expect(later.transformationsUsed, 'still nothing spent').toBe(0);
    expect(later.starterExamplesUsed?.[EXAMPLE.name]).toBe(true);
  });

  test('a failed repeat spends no unit', async ({ request }) => {
    await resetAccount({ starterExamplesUsed: { [EXAMPLE.name]: true } });
    const source = await exampleSource(request, EXAMPLE.file);

    const failed = await analyse(request, source, BREAKS_AFTER_RESERVATION);
    expect(failed.status()).toBe(500);

    const after = await profile();
    expect(after.transformationsUsed, 'the unit was given back').toBe(0);
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'and the spent free run stayed spent').toBe(true);

    // The next completed attempt does charge, so the refund did not simply
    // disable metering for this source.
    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed).toBe(1);
  });

  test('a first run refused because the source moved gives the free example back', async ({ request }) => {
    // The second way a run ends without becoming state: 0.6 refuses to commit
    // when the project's source changed while the analysis ran. That path has
    // its own refund, and it was releasing the wrong thing — it ran the charged
    // branch for a free starter reservation, so it decremented a unit that was
    // never taken and left the example marked as used. The reader lost the free
    // run for good and it looked like a gift (QA review of 6a24b632ff44).
    await resetAccount({ transformationsUsed: 2 });
    const source = await exampleSource(request, EXAMPLE.file);

    const projectId = `starter-quota-moved-${Date.now()}`;
    await adminSetDoc('projects', projectId, {
      userId: uid, name: 'Starter example, source moved', status: 'uploaded',
      createdAt: new Date(), legacyCode: source,
    });

    const inFlight = request.post('/api/runs/create', {
      headers: headers(),
      data: { projectId, legacyCode: source, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });

    // Not a sleep: the reservation is taken strictly after the route has read
    // the project and long before it commits, so its appearance is proof that
    // the read has happened. A wall-clock delay would be a guess.
    const deadline = Date.now() + 20_000;
    for (;;) {
      if ((await profile()).starterExamplesUsed?.[EXAMPLE.name] === true) break;
      expect(Date.now(), 'the run never reserved the free example').toBeLessThan(deadline);
      await new Promise((r) => setTimeout(r, 10));
    }
    await db().collection('projects').doc(projectId).update({ legacyCode: 'REPORT z_moved.\nWRITE / 1.\n' });

    const res = await inFlight;
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('source-moved');

    const after = await profile();
    expect(after.starterExamplesUsed?.[EXAMPLE.name], 'the free example was not given back').toBeUndefined();
    expect(after.transformationsUsed, 'a unit was refunded that was never taken').toBe(2);
    expect(after.chargedInputs ?? {}, 'nothing was charged, so nothing is on the charged list').toEqual({});

    // And it really is free again, not merely absent from the bookkeeping.
    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed, 'the retry spent a unit after all').toBe(2);
  });
});

test.describe('after the five analyses only your own key continues', () => {
  test('the fifth run is the last free-tier one, and BYOK carries on from there', async ({ request }) => {
    await resetAccount({ transformationsUsed: 4, starterExamplesUsed: { [EXAMPLE.name]: true } });
    const source = await exampleSource(request, EXAMPLE.file);

    // The fifth: still allowed, and it is the one that fills the allowance.
    expect((await analyse(request, source)).status()).toBe(200);
    expect((await profile()).transformationsUsed).toBe(5);

    const refused = await analyse(request, source);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toContain('Add your own Gemini API key');
    expect((await profile()).transformationsUsed, 'a refusal spends nothing').toBe(5);

    await adminSetDoc('users', uid, { ...(await profile()), byokConfigured: true });
    const withKey = await analyse(request, source);
    expect(withKey.status(), await withKey.text()).toBe(200);
    expect((await profile()).transformationsUsed, 'an own key is not metered').toBe(5);
  });

  test('a first example is still free for an account that has spent its five', async ({ request }) => {
    // Roadmap 0.9 reads "examples cost no quota — each once per account". A run
    // that costs nothing has nothing to be stopped by, so an example nobody has
    // run yet stays open at the limit; every repeat of it is charged and is
    // stopped like any other analysis (the test above). If this is not what Sonny
    // meant, this is the one line to turn around.
    await resetAccount({ transformationsUsed: 5 });
    const source = await exampleSource(request, EXAMPLE.file);

    expect((await analyse(request, source)).status()).toBe(200);
    const after = await profile();
    expect(after.transformationsUsed).toBe(5);
    expect(after.starterExamplesUsed?.[EXAMPLE.name]).toBe(true);

    // And only once: the next start is refused for want of quota.
    const refused = await analyse(request, source);
    expect(refused.status()).toBe(403);
    expect((await profile()).transformationsUsed).toBe(5);
  });
});

test.describe('the account cannot write its own bookkeeping', () => {
  test('starterExamplesUsed is refused from the client, like chargedInputs', async () => {
    await resetAccount();
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
    try {
      connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
    } catch { /* already connected in this worker */ }

    // Signed in as the owner of the document — the rules are the only thing
    // between this account and a free run of every example it likes.
    await expect(
      updateDoc(doc(clientDb, 'users', uid), { starterExamplesUsed: { [EXAMPLE.name]: true } }),
    ).rejects.toThrow(/permission|insufficient/i);
    expect((await profile()).starterExamplesUsed, 'and nothing landed').toBeUndefined();

    // The account can still change what it is allowed to change, so the refusal
    // above is the rule and not a broken document.
    await updateDoc(doc(clientDb, 'users', uid), { firstName: 'Starter', updatedAt: new Date() });
  });
});

test.describe('the screen says what the click costs, before the click', () => {
  test('the rule module answers for a fresh account and for one that ran the example', () => {
    const fresh = { tier: 'pilot', transformationsUsed: 0, transformationsLimit: 5 };
    expect(starterExampleIsFree(fresh, 'Z_MATERIAL_STOCK_CALC')).toBe(true);
    expect(starterExampleIsFree({ ...fresh, starterExamplesUsed: { Z_MATERIAL_STOCK_CALC: true } }, 'Z_MATERIAL_STOCK_CALC')).toBe(false);
    // A different example is untouched by the one that ran.
    expect(starterExampleIsFree({ ...fresh, starterExamplesUsed: { Z_MATERIAL_STOCK_CALC: true } }, 'Z_INVOICE_EXTRACTOR')).toBe(true);
    // Nothing is metered for these two, so nothing has to be warned about.
    expect(starterExampleIsFree({ ...fresh, byokConfigured: true, starterExamplesUsed: { Z_MATERIAL_STOCK_CALC: true } }, 'Z_MATERIAL_STOCK_CALC')).toBe(true);
    expect(starterExampleIsFree({ ...fresh, tier: 'enterprise', starterExamplesUsed: { Z_MATERIAL_STOCK_CALC: true } }, 'Z_MATERIAL_STOCK_CALC')).toBe(true);
    expect(starterExampleIsFree(null, 'Z_MATERIAL_STOCK_CALC')).toBe(true);
  });

  test('the dashboard warns before restarting an example, and does not start it', async ({ page }) => {
    test.setTimeout(150 * 1000);
    await resetAccount({ starterExamplesUsed: { [EXAMPLE.name]: true } });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SIGN_IN);
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.stop()).catch(() => {});
    try {
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    } catch {
      // The sign-in redirect can still be in flight and abort this navigation —
      // the same recovery tests/starter-examples.spec.ts makes, for the same race.
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(1000);
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    }

    const panel = page.getByTestId('starter-examples');
    await expect(panel.getByRole('heading', { name: /Try it with an example/i })).toBeVisible({ timeout: 45000 });

    // The one that ran is marked as such; the others are marked free.
    await expect(panel.getByTestId('starter-example-ran-before')).toHaveCount(1);
    await expect(panel.getByTestId('starter-example-free')).toHaveCount(STARTER_EXAMPLES.length - 1);

    await panel.getByTestId('starter-example-name').filter({ hasText: /^Z_MATERIAL_STOCK_CALC$/ }).click();

    const warning = panel.getByTestId('starter-example-rerun-warning');
    await expect(warning).toBeVisible({ timeout: 15000 });
    await expect(warning).toContainText(
      'You ran this example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes.',
    );
    // The warning is a stop, not a label: nothing was started by the click.
    await expect(page).toHaveURL(/\/dashboard/);

    // A free one goes straight through, so the warning is not simply a broken card.
    await panel.getByTestId('starter-example-name').filter({ hasText: /^Z_INVOICE_EXTRACTOR$/ }).click();
    await page.waitForURL(/\/project\/[^/]+\/analyze/, { timeout: 45000 });
  });
});
