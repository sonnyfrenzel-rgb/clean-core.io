import { test, expect, devices, type Browser } from './helpers/test';

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
 * component with sign-in) and the public pages outside the signed-in shell.
 * Not covered yet: the public pages that render inside `app/(app)/layout.tsx`
 * (About, Knowledge, Trust, How it works …) — that shell initialises Auth on
 * every page, and is a separate step (see `noRequestWithoutSignIn`).
 */

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
});
