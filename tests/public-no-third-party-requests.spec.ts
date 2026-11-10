import { test, expect, devices, type Browser } from './helpers/test';
import { PUBLIC_SHELL_ROUTES } from '../lib/shell-routes';
import { PHASES } from '../lib/workflow-steps';
import { SIGNED_IN_HINT_KEY } from '../lib/auth-hint';

/**
 * Privacy policy section 7: the public pages contact nobody but clean-core.io
 * before sign-in (`noRequestWithoutSignIn`, lib/legal/open-values.ts). This is
 * the network capture behind that sentence: every request a signed-out visit
 * makes is recorded, and every one has to go to the page's own origin.
 *
 * Twice per page: as a desktop browser, and as an iPhone. The second matters —
 * the Firebase Auth SDK loads Google's sign-in frame (apis.google.com, the
 * project's firebaseapp.com domain) as soon as Auth is initialised on a mobile
 * browser or Safari, which a desktop capture never shows (@firebase/auth
 * `_shouldInitProactively`). In an emulator build the same mistake shows as a
 * request to the Auth emulator on 127.0.0.1:9099, which is another origin too.
 *
 * Each visit runs in a fresh context — no cookies, no storage, so no signed-in
 * hint (lib/auth-hint.ts) — and waits past the point where the landing used to
 * mount its dialogs on idle (2 s), so a deferred load is caught as well.
 *
 * Covered: the landing (also with a legal dialog open, which shares the
 * component with sign-in), the public pages outside the signed-in shell, and
 * every public page inside it (`app/(app)/layout.tsx`: About, Knowledge, Trust,
 * the demo …) — read from lib/shell-routes.ts, so a new public page of the
 * shell is captured without an edit here. `/demo/workspace` needs an account
 * and sends a visitor without the hint to the sign-in dialog; it has a test of
 * its own below.
 */

/** A route of lib/shell-routes.ts as addresses to visit: a dynamic segment becomes every value the page renders. */
function shellAddresses(route: string): string[] {
  if (route === '/demo/[stage]') return PHASES.map((phase) => `/demo/${phase.key}`);
  // Only Design has a requirements page (app/(app)/demo/[stage]/requirements/page.tsx).
  if (route === '/demo/[stage]/requirements') return ['/demo/design/requirements'];
  if (route.includes('[')) throw new Error(`no addresses known for ${route} — add them here`);
  return [route];
}

/** Sends a visitor without the hint to sign in, which starts Auth by design; see its own test. */
const SIGN_IN_FIRST = new Set(['/demo/workspace']);

const SHELL_PAGES = PUBLIC_SHELL_ROUTES.filter((route) => !SIGN_IN_FIRST.has(route)).flatMap(shellAddresses);

const PAGES = [
  '/',
  '/?legal=privacy',
  '/?legal=impressum',
  '/datenschutz',
  '/datenschutz/de',
  '/impressum',
  '/terms',
  '/terms/de',
  '/licenses',
  '/report',
  '/facts',
  '/method/levels',
  '/catalog',
  '/reference-analysis',
  '/whitepaper',
  ...SHELL_PAGES,
  // Deep links into the shell: a query and a fragment change nothing.
  '/knowledge?q=clean-core#levels',
  '/how-to#first-run',
];

/** A device's context options; the browser type is the suite's (Chromium), only the device is emulated. */
function contextOptions(name: string) {
  const { defaultBrowserType, ...options } = devices[name];
  void defaultBrowserType;
  return options;
}

const PROFILES = {
  desktop: contextOptions('Desktop Chrome'),
  // The user agent is what @firebase/auth reads to decide whether to load Google's frame at once.
  iphone: contextOptions('iPhone 13'),
};

async function foreignRequests(browser: Browser, profile: keyof typeof PROFILES, url: string, baseURL: string) {
  const options = PROFILES[profile];
  const context = await browser.newContext({ ...options, baseURL });
  const own = new URL(baseURL).origin;
  const foreign: string[] = [];
  context.on('request', (request) => {
    const target = request.url();
    if (/^(data|blob|about):/.test(target)) return;
    if (new URL(target).origin !== own) foreign.push(`${request.resourceType()} ${target.split('?')[0]}`);
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // Past the old idle mount of the landing's dialogs (requestIdleCallback, timeout 2000 ms).
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(500);
  } finally {
    await context.close();
  }
  return foreign;
}

test.describe('a signed-out visit contacts only its own origin', () => {
  test.beforeEach(() => {
    test.setTimeout(120000);
  });

  for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    for (const url of PAGES) {
      test(`${url} as ${profile}`, async ({ browser, baseURL }) => {
        const foreign = await foreignRequests(browser, profile, url, baseURL ?? 'http://localhost:3000');
        expect(foreign, `${url} (${profile}) asked someone other than its own origin`).toEqual([]);
      });
    }
  }

  test('opening the sign-in dialog is what loads Auth, and only then', async ({ browser, baseURL }) => {
    // The control for the tests above: on a phone, initialising Auth loads
    // Google's gapi script (apis.google.com) and the sign-in frame — from the
    // project's firebaseapp.com domain, or from the Auth emulator in an emulator
    // build. The open dialog has to cause that, or a capture that finds nothing
    // proves nothing.
    const foreign = await foreignRequests(browser, 'iphone', '/?auth=signin', baseURL ?? 'http://localhost:3000');
    expect(foreign.length, 'the sign-in dialog initialised Auth without a request').toBeGreaterThan(0);
  });

  test('the demo workspace sends a visitor without the hint to sign in, and asks nobody on the way', async ({ browser, baseURL }) => {
    // It needs an account (components/demo/DemoWorkspaceShell.tsx). Without the
    // hint the shell reports "signed out" without starting Auth, and the page
    // moves on to the sign-in dialog — which starts Auth by design, so only
    // the requests made while the address is still the demo's count here.
    const base = baseURL ?? 'http://localhost:3000';
    const context = await browser.newContext({ ...PROFILES.iphone, baseURL: base });
    const own = new URL(base).origin;
    const foreign: string[] = [];
    try {
      const page = await context.newPage();
      context.on('request', (request) => {
        const target = request.url();
        if (/^(data|blob|about):/.test(target)) return;
        if (new URL(target).origin === own) return;
        if (new URL(page.url()).pathname === '/demo/workspace') foreign.push(`${request.resourceType()} ${target.split('?')[0]}`);
      });
      await page.goto('/demo/workspace', { waitUntil: 'load' });
      await expect.poll(() => new URL(page.url()).searchParams.get('auth'), { timeout: 20000 }).toBe('signin');
      expect(new URL(page.url()).searchParams.get('next')).toBe('/demo/workspace');
    } finally {
      await context.close();
    }
    expect(foreign, '/demo/workspace asked someone other than its own origin before it sent the visitor to sign in').toEqual([]);
  });

  test('a stale signed-in hint costs one Auth start, which removes it', async ({ browser, baseURL }) => {
    // The hint says "an account was signed in here", but there is no session:
    // the shell starts Auth once, Firebase answers "nobody", and the hint goes
    // (lib/firebase-app.ts) — the next visit asks nobody again.
    const base = baseURL ?? 'http://localhost:3000';
    const context = await browser.newContext({ ...PROFILES.iphone, baseURL: base });
    const own = new URL(base).origin;
    let counting = false;
    const foreign: string[] = [];
    context.on('request', (request) => {
      const target = request.url();
      if (!counting || /^(data|blob|about):/.test(target)) return;
      if (new URL(target).origin !== own) foreign.push(`${request.resourceType()} ${target.split('?')[0]}`);
    });
    try {
      const page = await context.newPage();
      await page.goto('/knowledge', { waitUntil: 'load' });
      await page.evaluate((key) => window.localStorage.setItem(key, '1'), SIGNED_IN_HINT_KEY);
      await page.reload({ waitUntil: 'load' });
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), SIGNED_IN_HINT_KEY), { timeout: 20000 })
        .toBeNull();
      // The shell shows the signed-out control once Firebase has answered.
      await expect(page.locator('[data-shell-sign-in]')).toBeVisible();
      counting = true;
      await page.reload({ waitUntil: 'load' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(3000);
      await expect(page.locator('[data-shell-sign-in]')).toBeVisible();
    } finally {
      await context.close();
    }
    expect(foreign, 'the visit after the stale hint was removed asked someone other than its own origin').toEqual([]);
  });
});
