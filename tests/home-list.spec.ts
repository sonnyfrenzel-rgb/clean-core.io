import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex } from '../lib/artefact-digest';
import { WORKSPACE_MESSAGES } from '../lib/workspace-messages';

/** The key an earlier build of AB-14b wrote for the "Figures" switch; nothing writes it since 15.11.2026. */
const OLD_FIGURES_KEY = 'cc.workspace.figures';

/**
 * Home page v2, part 2 (AB-14b) — rendered, on a seeded account with 30 projects. Needs the emulators and a server;
 * run with `playwright.config.ts` on a production build (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` set for the build).
 * The pure and source half is `tests/home-rows.spec.ts`.
 *
 *   1. Every one of the 30 is reachable (QA `c559b61a9b31`: the list read the newest 25), and search finds the oldest.
 *   2. The rows reach the browser without source code.
 *   3. Four columns, the new status words, dates as "6 Nov 2026".
 *   4. Filters from ten projects on, over all of them.
 *   5. "Needs your attention" only with a reason (the count tile's: code changed or not analysed) — at most three, and
 *      not at all for an account without one.
 *   6. A run from a row only through the confirmation dialog with its cost and model; Cancel starts nothing.
 *   7. The "Figures" switch, for this page view only: nothing stored, off again after a reload (owner, 15.11.2026).
 *   8. Tabs: Shared with me appears with a shared project.
 */

const STAMP = Date.now();
const OWNER_EMAIL = `home-list-${STAMP}@cleancore-test.io`;
const CALM_EMAIL = `home-calm-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `home-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const COUNT = 30;

const PROGRAM = (n: number) =>
  [`REPORT z_home_${n}.`, 'DATA: ls_order TYPE vbak.', 'SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.', "WRITE: / 'Order'."].join('\n');

let ownerUid = '';
let calmUid = '';
let otherUid = '';
const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

async function createAccount(email: string): Promise<string> {
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  return (await createUserWithEmailAndPassword(auth, email, SIGN_IN)).user.uid;
}

/** A project with a signed run of its source on record — or, with `changed`, a source that moved since. */
function analysed(uid: string, n: number, changed = false) {
  const source = PROGRAM(n);
  return {
    name: `Home program ${String(n).padStart(2, '0')}`,
    status: 'analyzed',
    userId: uid,
    legacyCode: changed ? `${source}\n* changed` : source,
    activeRunId: `run-home-${STAMP}-${n}`,
    auditMetadata: { inputFingerprint: { sha256: sha256Hex(source), lineCount: 4, fileName: `Z_HOME_${n}.abap` } },
    createdAt: new Date(Date.UTC(2026, 9, 1 + n)),
    updatedAt: new Date(Date.UTC(2026, 9, 1 + n)),
  };
}

function staged(uid: string, n: number) {
  return {
    name: `Home program ${String(n).padStart(2, '0')}`,
    status: 'uploaded',
    userId: uid,
    legacyCode: PROGRAM(n),
    createdAt: new Date(Date.UTC(2026, 9, 1 + n)),
  };
}

async function open(page: Page, email: string) {
  // 3.3.0 (ADR-123): My workspace opens on tiles; this spec holds the home list of 3.2.0, which is its list mode,
  // remembered by the browser (`lib/workspace-prefs.ts`). The spec opens it there.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cc.workspace.mode', 'list');
    } catch {
      /* storage refused: the tiles stand */
    }
  });
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signInViaLanding(page, email, SIGN_IN);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-cc-workspace] [data-home-tab="mine"]', { timeout: 60000 });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
}

test.beforeAll(async () => {
  test.setTimeout(240 * 1000);
  ownerUid = await createAccount(OWNER_EMAIL);
  calmUid = await createAccount(CALM_EMAIL);
  otherUid = await createAccount(OTHER_EMAIL);
  const profile = {
    lastName: 'Home', tier: 'pilot', status: 'approved', activatedAt: new Date(), transformationsUsed: 2,
    transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  };
  await adminSetDoc('users', ownerUid, { ...profile, firstName: 'Mara', email: OWNER_EMAIL, isAdmin: false });
  await adminSetDoc('users', calmUid, { ...profile, firstName: 'Calm', email: CALM_EMAIL, isAdmin: false });
  await adminSetDoc('users', otherUid, { ...profile, firstName: 'Other', email: OTHER_EMAIL, isAdmin: false });
  // 30 own projects: every third analysed, four of those with code changed since, the rest staged.
  for (let n = 1; n <= COUNT; n++) {
    const data = n % 3 === 0 ? analysed(ownerUid, n, n >= 18) : staged(ownerUid, n);
    await adminSetDoc('projects', `home-${STAMP}-${n}`, data);
  }
  // One project the other account shares with the owner to read.
  await adminSetDoc('projects', `home-shared-${STAMP}`, { ...analysed(otherUid, 99), name: 'Shared pick list', readers: [ownerUid] });
  // An account whose projects have no reason for attention.
  for (let n = 1; n <= 2; n++) await adminSetDoc('projects', `home-calm-${STAMP}-${n}`, analysed(calmUid, n));
});

test('every one of the 30 projects is reachable, and search finds the oldest', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const answers: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/workspace-rows')) answers.push(await res.text().catch(() => ''));
  });
  await open(page, OWNER_EMAIL);
  await expect(page.locator('[data-home-tab="mine"]')).toContainText(String(COUNT));
  await page.locator('[data-workspace-show-all]').click();
  // Counted in the My projects panel: the Shared with me panel is mounted too (hidden), and its row is not one of the 30.
  const mine = page.locator('#home-panel-mine [data-cc-table] [data-workspace-open]');
  await expect(mine).toHaveCount(COUNT);
  // The rows carry no source code.
  expect(answers.length).toBeGreaterThan(0);
  for (const body of answers) {
    expect(body).not.toContain('REPORT z_home_');
    expect(body).not.toContain('legacyCode');
  }
  // The oldest project — beyond the newest 25 — found by search.
  await page.locator('[data-home-filters] input[type="search"]').fill('Home program 01');
  await expect(mine).toHaveCount(1);
  await expect(page.locator('#home-panel-mine [data-cc-table] [data-cc-object-identifier-title]').first()).toHaveText('Home program 01');
});

test('four columns, the new status words, and dates as "6 Nov 2026"', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await open(page, OWNER_EMAIL);
  // The My projects table (the hidden Shared with me panel holds a table of its own), read as written: the heads are
  // drawn uppercase by CSS (components/cc/Table.tsx), and the row menu's column has a label for screen readers only.
  const heads = await page.locator('#home-panel-mine [data-cc-table] thead th:not(:has(> .sr-only))').allTextContents();
  expect(heads.map((h) => h.trim()).filter(Boolean)).toEqual(['Project', 'Status', 'Next step', 'Last change']);
  const titles = await page.locator('[data-home-status-title]').allInnerTexts();
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) expect(['No code yet', 'Not analysed yet', 'Analysed', 'Re-design under way', 'Re-design done', 'Handed over']).toContain(title.trim());
  for (const date of await page.locator('[data-home-date]').allInnerTexts()) expect(date.trim()).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  // Owner decision 22.11.2026: the Next step is the tile's own — an analysed project with nothing changed reads
  // "Re-design this program" here as on its tile, never "Nothing open". The newest ten (21–30) are staged or changed;
  // the unchanged analysed ones (3–15) are behind "Show all".
  await page.locator('[data-workspace-show-all]').click();
  await expect(page.locator('#home-panel-mine [data-home-next="design"]').first()).toContainText('Re-design this program');
  await expect(page.locator('#home-panel-mine [data-home-next="none"]')).toHaveCount(0);
  // 3.3.0: the head is the tiles' head in both modes — the next analysis starts from "Analyse another Z program".
  await expect(page.locator('[data-ws-analyse-another]')).toBeVisible();
});

test('the filters run over every project; "Needs your attention" lists at most three, with their reason', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await open(page, OWNER_EMAIL);
  const card = page.locator('[data-home-attention]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-home-attention-row]')).toHaveCount(3);
  // Owner decision 22.11.2026: the reason is the "Needs attention" tile's own — code changed, or not analysed yet.
  const reasons = (await card.locator('[data-home-attention-reason]').allInnerTexts()).map((r) => r.trim());
  for (const reason of reasons) expect(['The code changed since the analysis', 'Not analysed yet']).toContain(reason);
  // The newest three: 30 (code changed), 29 and 28 (staged).
  expect(reasons).toEqual(['The code changed since the analysis', 'Not analysed yet', 'Not analysed yet']);
  // Twenty-five have a reason: the twenty staged projects, and the analysed 18, 21, 24, 27 and 30 whose code changed.
  await expect(card).toContainText('25');
  await card.locator('[data-home-attention-all]').click();
  await page.locator('[data-workspace-show-all]').click();
  const attention = page.locator('#home-panel-mine [data-cc-table] [data-workspace-open]');
  await expect(attention).toHaveCount(25);
});

test('a run from a row asks first, with cost and model; Cancel starts nothing', async ({ page }) => {
  test.setTimeout(180 * 1000);
  let runs = 0;
  await page.route('**/api/runs/create', (route) => {
    runs++;
    return route.abort();
  });
  await open(page, OWNER_EMAIL);
  await page.locator('[data-home-run]').first().click();
  const dialog = page.locator('[data-cc-message-box]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-cc-run-cost-quota]')).not.toBeEmpty();
  await expect(dialog.locator('[data-cc-run-cost-model]')).not.toBeEmpty();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(runs).toBe(0);
});

test('the "Figures" switch shows the figures for this page view and stores nothing', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await open(page, OWNER_EMAIL);
  await expect(page.locator('[data-workspace-card-facts]')).toHaveCount(0);
  await page.locator('[data-home-figures]').click();
  await expect(page.locator('[data-workspace-card-facts]').first()).toBeVisible();
  // Owner decision 15.11.2026: not remembered in the browser (privacy policy 1.3 does not name it).
  expect(await page.evaluate((k) => window.localStorage.getItem(k), OLD_FIGURES_KEY)).toBeNull();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-home-tab="mine"]', { timeout: 60000 });
  await expect(page.locator('[data-home-figures]')).toHaveAttribute('aria-checked', 'false');
});

test('Shared with me is a tab of its own, read only', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await open(page, OWNER_EMAIL);
  await page.locator('[data-home-tab="shared"]').click();
  const row = page.locator(`[data-workspace-shared-row="home-shared-${STAMP}"]`).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Shared pick list');
  await expect(page.locator('#home-panel-shared')).toContainText(WORKSPACE_MESSAGES['homeList.sharedNote']);
});

test('an account without a reason for attention sees no attention card, and the demo and examples as doors', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await open(page, CALM_EMAIL);
  await expect(page.locator('#home-panel-mine [data-cc-table] [data-workspace-open]')).toHaveCount(2);
  await expect(page.locator('[data-home-attention]')).toHaveCount(0);
  // Below ten projects there are no filters.
  await expect(page.locator('[data-home-filters]')).toHaveCount(0);
  await expect(page.locator('[data-home-door="demo"] a')).toHaveAttribute('href', '/demo/workspace');
  await expect(page.locator('[data-home-door="examples"] a')).toHaveAttribute('href', '/admin/new-project');
});
