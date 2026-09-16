import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';

/**
 * A profile read by one sign-in does not reach the next (QA review of
 * 0ce6b0b508e6; roadmap 0.17, finding 1738da3d6e64).
 *
 * `releaseProfile` tears the snapshot listener down when the user changes; the
 * one-time `getDoc` started beside it has no such handle and used to call
 * `setProfile` whenever it settled. After a sign-out, or a switch to another
 * account, the previous account's profile could land on the next one's screen.
 *
 * This file used to be three `readFileSync` regexes and nothing else. It never
 * ran the hook, so it could not tell a guard that works from a guard that is
 * only written down: rename the counter, compare the wrong pair, and as long as
 * the shapes still matched, the spec was green. The roadmap recorded the
 * blocker as "a hook renderer the repo does not have" — which turned out not to
 * be the obstacle. The hook runs in the real app on every page, and the thing it
 * protects is something a user would see: the wrong person's name.
 *
 * So the race is provoked where it happens. Every answer that carries the first
 * account's own user document is held at the network; the session is then
 * switched to the second account, and only afterwards are those answers
 * delivered. What is on screen from that moment on is the property a user would
 * lose, and it is asserted directly.
 *
 * It holds responses rather than requests because it has to: `lib/firebase.ts`
 * sets `experimentalForceLongPolling`, and under it the SDK implements a
 * one-time `getDoc` as a temporary listen target on the same multiplexed
 * channel as the snapshot listener. There is no separate request to catch —
 * measured on the wire: every call is a POST or GET on
 * `/google.firestore.v1.Firestore/Listen/channel`. The document name inside the
 * answer is what tells the two accounts apart.
 *
 * What the browser showed, and what it means for this guard
 * ---------------------------------------------------------
 * Holding the answer works: with it held the shell is up and the initials are
 * not there, and releasing it — without changing the session — puts them there.
 * Across a sign-out it never does, and the reason is in the page's own log:
 *
 *     [PROFILE HOOK LOG] onAuthStateChanged fired. user: null
 *     Immediate getDoc profile fetch error: FirebaseError: [code=permission-denied]
 *
 * The in-flight read is REFUSED the moment the credential goes. `firestore.rules`
 * lets an account read only its own document, and the retry the SDK sends after
 * the auth change carries the new session. So the `.then` the generation guard
 * sits in is never entered on an account switch at all — the server got there
 * first. The guard is defence in depth behind a rule, and its own branch has no
 * visible consequence that can be provoked from outside.
 *
 * Both facts are therefore asserted below: the property (nothing of the first
 * account ever reaches the second one's screen) and the mechanism that enforces
 * it (the previous account's in-flight read is refused, not served). The second
 * is the one that would go red if the rules were ever loosened to let one
 * account read another's profile — at which point the hook's guard would be all
 * that is left, which is exactly when somebody should be looking.
 *
 * Nothing waits for a state to be observed mid-request: the schedule is
 * controlled, not sampled, so the result does not depend on whether a dev
 * server or a production build is answering. The two things that could make the
 * test vacuous — a matcher that stops matching, and a hold that holds nothing —
 * are asserted, not assumed, and both are established on the first account
 * before anything is switched.
 *
 * What stays a source check, and why: the generation counter and the cleanup
 * branch have no visible form, for the reason above. They are read from the
 * source, and that is said out loud rather than dressed up as behaviour.
 */

const ROOT = path.resolve(__dirname, '..');
const rendered = () =>
  fs
    .readFileSync(path.resolve(ROOT, 'hooks/useUserProfile.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the guard, as the hook is written — read from the source, and only that', () => {
  test('each auth change takes a generation before it starts the fetch', () => {
    const src = rendered();
    expect(src).toMatch(/let generation = 0;/);
    expect(src).toMatch(/onAuthStateChanged\(async \(user\) => \{\s*const thisGeneration = \+\+generation;/);
  });

  test('the fetched document becomes the profile only for the sign-in that fetched it', () => {
    const src = rendered();
    // Compared before anything is set: generation, and the user the fetch was
    // started for against the one signed in now. The behaviour behind this is
    // what the browser test below actually runs.
    expect(src).toMatch(
      /getDoc\(userDocRef\)\.then\(\(docSnap\) => \{\s*if \(thisGeneration !== generation \|\| auth\.currentUser\?\.uid !== user\.uid\) return;/,
    );
  });

  test('unmounting retires the generation, so a fetch that settles afterwards is dropped', () => {
    // The one claim in this file with no observable consequence: a profile set
    // on an unmounted component changes nothing a user or a spec can see. Read
    // from the source on purpose, and that is said out loud rather than left to
    // look like the others.
    const src = rendered();
    expect(src).toMatch(/return \(\) => \{\s*generation \+= 1;\s*releaseProfile\(\);\s*unsubscribeAuth\(\);/);
  });
});

/* ------------------------------------------------------ the guard, running */

const STAMP = Date.now();
const PASSWORD = 'ProfileSession123!';

interface Account {
  email: string;
  uid: string;
  firstName: string;
  lastName: string;
  initials: string;
  limit: number;
}

const ALPHA: Account = {
  email: `profile-alpha-${STAMP}@cleancore-test.io`,
  uid: '',
  firstName: 'Alphonse',
  lastName: 'Aardvark',
  initials: 'AA',
  limit: 3,
};
const BRAVO: Account = {
  email: `profile-bravo-${STAMP}@cleancore-test.io`,
  uid: '',
  firstName: 'Brunhilde',
  lastName: 'Bison',
  initials: 'BB',
  limit: 9,
};

/**
 * The avatar in the app shell. It is there with or without a profile — the
 * initials are `profile.firstName[0] + profile.lastName[0]`, an icon otherwise —
 * so "nobody" and "the wrong person" are different readings of the same element.
 */
const avatar = (page: Page) => page.locator('[data-account-menu]');

/** The document name as it appears in a Firestore answer. */
const documentOf = (uid: string) => `users/${uid}`;

/**
 * Signs in from whatever page is open, without a reload.
 *
 * Deliberately no `page.goto` after the first one: a full navigation throws the
 * JS context away, and with it the in-flight fetch, the listener and the
 * generation counter this test is about. Sign-out and the landing page are both
 * client-side in this app, so the second sign-in happens in the same context the
 * first one left behind — which is the only way the two sessions can overlap at
 * all.
 */
async function signInOnCurrentPage(page: Page, account: Account) {
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await expect(avatar(page), `${account.email} never reached the app shell`).toBeVisible({ timeout: 90_000 });
}

async function signInAndWaitForProfile(page: Page, account: Account) {
  await signInOnCurrentPage(page, account);
  await expect(avatar(page), `${account.email}'s profile never arrived`).toHaveText(account.initials, {
    timeout: 90_000,
  });
}

async function signOut(page: Page) {
  await avatar(page).click();
  await page.click('button:has-text("Sign Out")');
  await page.click('button:has-text("Sign Out Now")');
  await expect(avatar(page), 'the shell survived the sign-out').toHaveCount(0, { timeout: 60_000 });
}

test.describe('the profile of one sign-in never reaches the next', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    for (const account of [ALPHA, BRAVO]) {
      const cred = await createUserWithEmailAndPassword(auth, account.email, PASSWORD);
      account.uid = cred.user.uid;
      await adminSetDoc('users', account.uid, {
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        tier: 'pilot',
        status: 'approved',
        transformationsUsed: 0,
        // Different for the two accounts, so the number on the dashboard is a
        // second, independent witness of whose document is on screen.
        transformationsLimit: account.limit,
        termsVersionAccepted: TERMS_VERSION,
        mfaEnabled: false,
        createdAt: new Date(),
      });
    }
  });

  test('a profile answer held across a sign-out and a second sign-in is dropped', async ({ page }) => {
    test.setTimeout(300 * 1000);

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let caught = 0;
    let delivered = 0;
    const log: string[] = [];
    page.on('console', (message) => log.push(message.text()));

    await page.route(/127\.0\.0\.1:8080/, async (route) => {
      try {
        const response = await route.fetch();
        const body = await response.text();
        if (ALPHA.uid && body.includes(documentOf(ALPHA.uid))) {
          caught += 1;
          await held;
          delivered += 1;
        }
        await route.fulfill({ response, body });
      } catch {
        // The page moved on, or the long poll was cut short with it. Nothing to
        // hold and nothing to report: the assertions below are the test.
        await route.abort().catch(() => {});
      }
    });

    // Alphonse signs in and his profile is held at the door: the shell is there,
    // the initials are not, and both the snapshot listener and the one-time
    // fetch are waiting for the same answer.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInOnCurrentPage(page, ALPHA);
    await expect
      .poll(() => caught, {
        timeout: 60_000,
        message: 'no answer carrying the first account\'s document was caught — the matcher no longer matches the SDK, so this test would prove nothing',
      })
      .toBeGreaterThan(0);
    await expect(avatar(page), 'the held profile arrived anyway').not.toHaveText(ALPHA.initials);

    await signOut(page);

    // The mechanism, from the page's own log: the read that was in flight for
    // the previous account is refused, not served. If this ever stops being
    // true, one account can read another's profile document and the hook's
    // generation guard is the only thing left in the way.
    await expect
      .poll(() => log.filter((line) => line.includes('Immediate getDoc profile fetch error')).length, {
        timeout: 60_000,
        message:
          'the previous account\'s in-flight profile read was not refused when its session ended — it came back with a document instead, and the hook\'s guard is now the only thing between it and the next screen',
      })
      .toBeGreaterThan(0);

    await signInAndWaitForProfile(page, BRAVO);

    // Now let Alphonse's answers arrive. His listener went with `releaseProfile`
    // on the user change; the one-time fetch did not, and unguarded its `.then`
    // calls `setProfile` right here.
    release();
    await expect
      .poll(() => delivered, { timeout: 60_000, message: 'the held answer never reached the page' })
      .toBeGreaterThan(0);

    // From that moment on, never — not once, not for a frame. Sampled in a tight
    // loop rather than by one late look, so a profile that lands and is replaced
    // again is still caught.
    const seen = new Set<string>();
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      seen.add(((await avatar(page).textContent()) ?? '').trim());
      await page.waitForTimeout(50);
    }
    expect([...seen].sort(), 'the previous account reached the next one\'s screen').toEqual([BRAVO.initials]);

    // The second witness, from the same document: the quota the dashboard
    // quotes, and the name and address behind the avatar. Read without a
    // reload, for the same reason as the sign-in above.
    await expect(page.locator('body')).toContainText(String(BRAVO.limit), { timeout: 90_000 });
    await avatar(page).click();
    await expect(page.getByText(BRAVO.email, { exact: true })).toBeVisible();
    await expect(page.getByText(ALPHA.email, { exact: true })).toHaveCount(0);
    await expect(page.getByText(ALPHA.firstName, { exact: false })).toHaveCount(0);

    // Long polls outlive the last assertion; without this the handler is still
    // holding one when the page closes, and the run reports an error that
    // belongs to no test.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});
