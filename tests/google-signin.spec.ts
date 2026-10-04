import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTermsSha256 } from '../lib/terms-versions';

/**
 * The Google sign-in, through the real dialog and a real popup — the Auth
 * emulator's own Google widget stands in for accounts.google.com.
 *
 * The owner reported (04.10.2026) that as an admin the Google sign-in sometimes
 * only worked on the second attempt, with no error. Two ways to get there were
 * reproduced and are held here:
 *
 *  - A second click while the first Google window was still opening started a
 *    second `signInWithPopup`. Firebase cancels the first operation, but cannot
 *    close a window it has not finished opening, so the first window stayed on
 *    screen; signing in there was ignored, and the cancellation was swallowed.
 *  - A page load on the second-factor step (a reload, a phone discarding the
 *    tab while the reader fetched the code, a switch to a new build) loses the
 *    pending sign-in, which lives only in memory; the dialog fell back to
 *    "Welcome Back" without a word. A load that finds the sign-in already done
 *    asked for it again.
 *
 * The emulator has no TOTP second factor, so the second-factor step itself is
 * entered by address, exactly as a reload enters it.
 *
 * The widget's helper iframe is served from the Auth emulator (127.0.0.1:9099),
 * which the enforced CSP rightly does not list in `frame-src`, and which
 * Chromium's Local Network Access checks refuse to frame. The browser under
 * test gets that one host added to the app's documents and the check switched
 * off; the server, and every policy it sends, are untouched. The app is opened
 * on 127.0.0.1 rather than localhost: the widget hands its result to the
 * helper iframe through the opener, and from a localhost page it never arrives.
 */

const API_KEY = (firebaseConfig as { apiKey: string }).apiKey;

/** The app under test, on 127.0.0.1 (see above). Set per test from `baseURL`. */
let app = '';

test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

async function allowEmulatorFrame(context: BrowserContext, baseURL: string) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    // The app's own pages only; the emulator's widget and iframe pass untouched.
    if (request.resourceType() !== 'document' || !request.url().startsWith(baseURL)) return route.continue();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
      if (headers[name]) headers[name] = headers[name].replace("frame-src 'self'", "frame-src 'self' http://127.0.0.1:9099");
    }
    await route.fulfill({ response, headers });
  });
}

/** A Google account that already exists, created the way the emulator's widget would. */
async function createGoogleAccount(name: string): Promise<{ uid: string; email: string }> {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `gsignin-${tag}@cleancore-test.io`;
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(
          JSON.stringify({ sub: `gsignin-${tag}`, email, email_verified: true, name }),
        )}&providerId=google.com`,
        requestUri: 'http://localhost',
        returnSecureToken: true,
      }),
    },
  );
  const body = (await res.json()) as { localId?: string };
  if (!res.ok || !body.localId) throw new Error(`could not create the Google account (HTTP ${res.status})`);
  return { uid: body.localId, email };
}

/** An administrator as production has one: claim, profile, current Terms accepted. */
async function seedGoogleAdmin(): Promise<{ name: string }> {
  const name = `Gadmin ${Math.random().toString(36).slice(2, 8)}`;
  const { uid, email } = await createGoogleAccount(name);
  await adminSetCustomClaim(uid, { admin: true });
  const acceptedAt = new Date();
  await adminSetDoc('consent_events', `gsignin-consent-${uid}`, {
    uid, userId: uid, email,
    termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION,
    contentSha256: archivedTermsSha256(TERMS_VERSION),
    locale: null, source: 'api/consent', createdAt: acceptedAt,
  });
  await adminSetDoc('users', uid, {
    firstName: 'Gadmin', lastName: 'Signin', email,
    tier: 'enterprise', status: 'approved', isAdmin: true,
    identityProvider: 'google', authMethod: 'google',
    transformationsUsed: 0, transformationsLimit: 999, createdAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: acceptedAt,
  });
  return { name };
}

const googleButton = (page: Page) => page.locator('[data-access-dialog] button:has-text("Google Account")');

/** Picks an account in the emulator's widget: an existing one by name, or a new generated one. */
async function chooseInWidget(popup: Page, accountName?: string) {
  await popup.waitForLoadState();
  if (accountName) {
    await popup.getByText(accountName, { exact: true }).click();
  } else {
    await popup.getByText('Add new account').click();
    await popup.getByText('Auto-generate user information').click();
    await popup.getByRole('button', { name: /Sign in with Google\.com/ }).click();
  }
}

test.describe('Google sign-in', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ context, baseURL }) => {
    app = new URL(baseURL ?? 'http://localhost:3000').origin.replace('//localhost', '//127.0.0.1');
    await allowEmulatorFrame(context, app);
  });

  test('a double click opens one Google window, and signing in there lands', async ({ page }) => {
    const popups: Page[] = [];
    page.on('popup', (p) => popups.push(p));
    await page.goto(`${app}/?auth=signin`);
    await googleButton(page).dblclick();
    await expect.poll(() => popups.length, { timeout: 10_000 }).toBeGreaterThan(0);
    // Long enough for a second window to have appeared if a second click started one.
    await page.waitForTimeout(2_000);
    expect(popups.filter((p) => !p.isClosed()), 'a second Google window was opened').toHaveLength(1);

    await chooseInWidget(popups[0]);
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });
  });

  test("an admin's Google sign-in lands on the workspace on the first attempt and stays there", async ({ page }) => {
    const admin = await seedGoogleAdmin();
    await page.goto(`${app}/?auth=signin`);
    const popupPromise = page.waitForEvent('popup');
    await googleButton(page).click();
    await chooseInWidget(await popupPromise, admin.name);

    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });
    // The profile is the admin's — the shell shows the initials, not the empty avatar.
    await expect(page.locator('[data-account-menu]')).toHaveText('GS', { timeout: 30_000 });
    // And nothing sends the reader back: the dashboard's own guard waits 3 s for a
    // session before it gives up, so 6 s covers it twice.
    await page.waitForTimeout(6_000);
    expect(new URL(page.url()).pathname).toBe('/dashboard');
    await expect(page.locator('[data-access-dialog]')).toHaveCount(0);
  });

  test('a page loaded on the sign-in dialog after the sign-in went through moves on', async ({ page }) => {
    const admin = await seedGoogleAdmin();
    await page.goto(`${app}/?auth=signin`);
    const popupPromise = page.waitForEvent('popup');
    await googleButton(page).click();
    await chooseInWidget(await popupPromise, admin.name);
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });

    // The reload the logs show on the second-factor step, after the factor was given.
    await page.goto(`${app}/?auth=mfa`);
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 30_000 });
  });

  test('a reload on the second-factor step says what happened instead of silently asking again', async ({ page }) => {
    await page.goto(`${app}/?auth=mfa`);
    const notice = page.locator('[data-access-dialog] [data-auth-notice]');
    await expect(notice).toContainText('reloaded while it was waiting for your authenticator code', { timeout: 30_000 });
    // The address is put back on the step the reader is on.
    await page.waitForURL((url) => url.searchParams.get('auth') === 'signin');
    await expect(page.locator('[data-access-dialog]')).toHaveAttribute('data-access-dialog', 'signin');
  });

  test('closing the Google window is said, and the button works again', async ({ page }) => {
    await page.goto(`${app}/?auth=signin`);
    const popupPromise = page.waitForEvent('popup');
    await googleButton(page).click();
    const popup = await popupPromise;
    await expect(page.locator('[data-google-pending]')).toBeVisible();
    await popup.close();

    // Firebase notices a closed window by polling, then waits for a late result.
    await expect(page.locator('[data-access-dialog] [data-auth-notice]')).toContainText(
      'The Google window was closed before the sign-in finished',
      { timeout: 40_000 },
    );
    await expect(page.locator('[data-google-pending]')).toHaveCount(0);
    const again = page.waitForEvent('popup');
    await googleButton(page).click();
    await chooseInWidget(await again);
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });
  });
});
