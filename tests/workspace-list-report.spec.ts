import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { CC_MESSAGES } from '../lib/cc-messages';
import { DEMO_PROJECT_TITLE, DEMO_TAG } from '../lib/demo-marks';
import { OBJECT_STATUS } from '../lib/object-status';

/**
 * Roadmap 1.8 — "My workspace" as a List Report, observed rather than grepped.
 *
 * A list report is the screen a product flatters itself on, and a source guard
 * cannot see flattery: `return null` is an ordinary line, a `0` in a cell is an
 * ordinary literal, and a green tick is a class name. So every assertion below
 * reads the rendered page, and several of them would pass on an empty render if
 * they were not written to fail on one — `rowTitles()` counts what is actually
 * in the table before anything else is asked about it.
 *
 * Five claims, each checked where it is made:
 *
 *   1. **Nothing changed for a community account.** It cannot reach the screen,
 *      and its dashboard is the one it had yesterday. This is the phase-exit
 *      criterion of roadmap phase 1 and it is asserted, not assumed.
 *   2. **Every column can say that nothing happened.** A project with a staged
 *      source and no run prints a word in the findings column, never a zero.
 *   3. **The two empty states are different.** "No projects yet" and "No
 *      projects match these filters" are different components with different
 *      sentences, and only one of them offers *Clear filters*. An empty state
 *      after a filter tells someone their work is gone.
 *   4. **The demo is the first row and is not an achievement.** Roadmap 0.10
 *      builds it unproven on purpose.
 *   5. **A run says its price before the click, its stages while it runs, what
 *      a cancel does not reach, and — when it fails — what to do next.**
 *
 * Nothing here waits for a state mid-request. The one test that needs a run to
 * be in flight holds the request open with `page.route` and releases it, so the
 * running state is a settled state for as long as the assertions take.
 */

const STAMP = Date.now();
const ADMIN_EMAIL = `workspace-admin-${STAMP}@cleancore-test.io`;
const COMMUNITY_EMAIL = `workspace-community-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;

const STAGED_ID = `ws-staged-${STAMP}`;
const STALE_ID = `ws-stale-${STAMP}`;
const RUN_ID = `ws-run-${STAMP}`;

/** Real ABAP, so the engine has something to find if a run is ever started on it. */
const PROGRAM = [
  'REPORT z_workspace_row.',
  'DATA: ls_order TYPE vbak.',
  "SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.",
  "UPDATE vbak SET cmgst = 'B' WHERE vbeln = p_vbeln.",
  "WRITE: / 'Credit status'.",
].join('\n');

let adminUid = '';
let communityUid = '';

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

async function createAccount(email: string): Promise<string> {
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
  return cred.user.uid;
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** Signs in as the admin and opens the list report. */
async function openWorkspace(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/admin/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-cc-workspace]', { timeout: 60000 });
  await page.waitForSelector('[data-cc-object-identifier-title]', { timeout: 60000 });
  // Measured styles, not animations. Disabling transitions before anything is
  // read is the difference between a spec that is green locally and one that is
  // green in CI.
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  });
}

/** The titles actually in the table — so no later assertion can pass on an empty render. */
async function rowTitles(page: Page): Promise<string[]> {
  return page.locator('[data-cc-table] [data-cc-object-identifier-title]').allInnerTexts();
}

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  adminUid = await createAccount(ADMIN_EMAIL);
  communityUid = await createAccount(COMMUNITY_EMAIL);

  const profile = {
    firstName: 'List', lastName: 'Report', tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  };
  await adminSetDoc('users', adminUid, { ...profile, email: ADMIN_EMAIL, isAdmin: true });
  await adminSetDoc('users', communityUid, { ...profile, email: COMMUNITY_EMAIL, isAdmin: false });
});

test('the server under test is the one that was changed', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openWorkspace(page);
  // `/admin/workspace` exists only with roadmap 1.8. Several dev servers run on
  // this machine; a suite that measured another one would report the old
  // behaviour as a regression.
  await expect(page.locator('[data-cc-workspace]')).toHaveCount(1);
  await expect(page.locator('[data-cc-table]')).toHaveCount(1);
});

test('a community account cannot reach it, and its dashboard is unchanged', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page, COMMUNITY_EMAIL);

  await page.goto('/admin/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  expect(
    await page.locator('[data-cc-workspace]').count(),
    'the list report renders for a community account',
  ).toBe(0);
  await expect(page.locator('text=Access denied')).toBeVisible();

  // The other half of the phase-1 exit criterion: with the switch off, nothing
  // about the product a community account uses has moved.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="demo-entry"]', { timeout: 60000 });
  expect(
    await page.locator('[data-cc-workspace]').count(),
    'the new workspace leaked into /dashboard',
  ).toBe(0);
  await expect(page.locator('[data-testid="demo-entry-title"]')).toBeVisible();
});

test.describe('before the first project', () => {
  test('the demo is the first row, is not an achievement, and the empty state is the empty one', async ({
    page,
  }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const titles = await rowTitles(page);
    expect(titles.length, 'the table rendered no rows at all').toBeGreaterThan(0);
    expect(titles[0], 'the demo is not the first row').toContain(DEMO_PROJECT_TITLE);
    await expect(page.locator(`[data-cc-table] [data-cc-tag]:has-text("${DEMO_TAG}")`)).toBeVisible();

    // Roadmap 0.10 marks every phase of the demo unproven: it produces no signed
    // run and executes no test. A first row that reads as a finished project is
    // the flattery this screen exists to refuse.
    const demoStatus = await page
      .locator('[data-cc-table-row] [data-cc-object-status]')
      .first()
      .getAttribute('data-cc-object-status');
    expect(demoStatus, 'the demo row claims a status it did not earn').not.toBe('handed-over');
    expect(demoStatus).not.toBe('done');
    expect(demoStatus).toBe('partial');
    expect(
      await page.locator('[data-cc-table] [data-provenance="proven"]').count(),
      'the demo row carries a proof chip',
    ).toBe(0);

    // Nothing of the reader's own — so the empty state, the "Your turn" card,
    // and no filter bar (there is nothing to filter).
    await expect(page.locator('[data-cc-empty-state="empty"]')).toBeVisible();
    expect(await page.locator('[data-cc-empty-state="no-matches"]').count()).toBe(0);
    await expect(page.locator('[data-workspace-your-turn]')).toBeVisible();
    expect(
      await page.locator('[data-cc-filter-bar]').count(),
      'a filter bar over a table with nothing to filter',
    ).toBe(0);
  });
});

test.describe('with projects', () => {
  test.beforeAll(async () => {
    await adminSetDoc('projects', STAGED_ID, {
      name: 'Staged, never analysed',
      userId: adminUid,
      createdAt: new Date(),
      status: 'uploaded',
      legacyCode: PROGRAM,
      s4Deployment: 'private',
    });

    // A signed run whose recorded source is not the source on the project: the
    // one thing `staleness()` calls stale without having to be told.
    await adminSetDoc('projects', STALE_ID, {
      name: 'Source changed after the run',
      userId: adminUid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: `${PROGRAM}\nWRITE: / 'added after the run'.`,
      s4Deployment: 'private',
      activeRunId: RUN_ID,
      cleanCoreScore: 61,
      worklist: [
        { id: 'f1', title: 'A', category: 'Finding', location: 'x:1', recommendation: 'r', status: 'open', effort: 'Low' },
        { id: 'f2', title: 'B', category: 'Finding', location: 'x:2', recommendation: 'r', status: 'open', effort: 'Low' },
      ],
      auditMetadata: {
        inputFingerprint: {
          sha256: '0'.repeat(64),
          fileName: 'z_workspace_row.abap',
          lineCount: 5,
          byteSize: 180,
          uploadedAt: new Date().toISOString(),
          objectType: 'Report',
        },
      },
    });
  });

  test('every column of a project that has done nothing says so', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const titles = await rowTitles(page);
    expect(titles.length, 'the table rendered no rows at all').toBeGreaterThanOrEqual(3);

    const row = page.locator(`[data-cc-table-row="${STAGED_ID}"]`);
    await expect(row).toBeVisible();

    // Lines: a count of staged text, said to be staged rather than analysed.
    await expect(row.locator('[data-workspace-lines="staged"]')).toHaveText(
      String(PROGRAM.split('\n').length),
    );

    // Findings: a word, never a zero. A zero would mean the engine looked.
    expect(
      await row.locator('[data-workspace-findings]').count(),
      'a project nothing analysed printed a finding count',
    ).toBe(0);
    await expect(row).toContainText(CC_MESSAGES['workspace.notAnalysed']);

    // Status: one of the ten object statuses, and the one that means "there is
    // text here and nothing has proved anything about it".
    await expect(row.locator('[data-cc-object-status="draft"]')).toBeVisible();
    await expect(row.locator('[data-cc-object-status-label]')).toHaveText(
      OBJECT_STATUS['draft'].label,
    );

    // Last change: the ISO date of §3, in mono.
    await expect(row.locator('[data-cc-table-cell="lastChange"]')).toContainText(
      new Date().toISOString().slice(0, 10),
    );
  });

  test('a stale run is provenance beside the status, not a status of its own', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const row = page.locator(`[data-cc-table-row="${STALE_ID}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-provenance="stale"]')).toBeVisible();

    // DESIGN.md §4.1: *stale* and *signed* are provenance, not object statuses —
    // which is how "stale" once ended up next to "failed" in the same red.
    const status = await row
      .locator('[data-cc-object-status]')
      .first()
      .getAttribute('data-cc-object-status');
    expect(status, 'stale was rendered as an object status').not.toBe('failed');
    expect(Object.keys(OBJECT_STATUS)).toContain(status);

    // It counted the findings that are on record, and did not invent a level.
    await expect(row.locator('[data-workspace-findings]')).toHaveText('2');
  });

  test('no projects yet and no matches are two different states', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const before = await rowTitles(page);
    expect(before.length, 'the table rendered no rows at all').toBeGreaterThanOrEqual(3);

    // With projects of the reader's own there is something to filter.
    const filter = page.locator('[data-cc-filter-bar]');
    await expect(filter).toBeVisible();

    await page.fill('input[type="search"]', 'zzz-nothing-matches-this-zzz');
    await expect(page.locator('[data-cc-empty-state="no-matches"]')).toBeVisible();

    // The distinction this test exists for: the no-match state never wears the
    // empty one's clothes, and its sentence names what did not match.
    expect(
      await page.locator('[data-cc-empty-state="empty"]').count(),
      'the empty state was shown for a filter that matched nothing',
    ).toBe(0);
    const noMatchTitle = await page.locator('[data-cc-no-match-title]').innerText();
    expect(noMatchTitle).toBe(CC_MESSAGES['workspace.noMatch']);
    expect(noMatchTitle).not.toBe(CC_MESSAGES['workspace.emptyTitle']);
    await expect(page.locator('[data-cc-clear-filters]')).toBeVisible();

    // And the count says how many of how many, in a live region.
    await expect(page.locator('[data-cc-filter-count]')).toContainText(
      `0 ${CC_MESSAGES['filter.of']} ${before.length} ${CC_MESSAGES['workspace.noun']}`,
    );

    await page.click('[data-cc-clear-filters]');
    await expect(page.locator('[data-cc-empty-state="no-matches"]')).toHaveCount(0);
    await expect(page.locator('[data-cc-table] [data-cc-object-identifier-title]')).toHaveCount(
      before.length,
    );
  });

  test('a run says its price before the click', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const row = page.locator(`[data-cc-table-row="${STAGED_ID}"]`);
    await expect(row.locator(`[data-workspace-run="${STAGED_ID}"]`)).toBeVisible();

    // DESIGN.md §2.8: the quota and whether a model is called are two separate
    // claims, and both stand before the click. No percentage anywhere.
    const cost = row.locator('[data-cc-run-cost]');
    await expect(cost).toBeVisible();
    await expect(cost.locator('[data-cc-run-cost-quota]')).not.toBeEmpty();
    await expect(cost.locator('[data-cc-run-cost-model]')).not.toBeEmpty();
    expect(await cost.innerText()).toMatch(/No model call|Calls the model/);
  });

  test('a run in flight shows stages and a cancel that says what it cannot cancel', async ({
    page,
  }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    // The run is held open rather than raced: a spec that waits for a state
    // mid-request is green here and red in CI.
    const hold = { release: () => {} };
    const held = new Promise<void>((resolve) => {
      hold.release = resolve;
    });
    await page.route('**/api/gemini', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/api/runs/create', async (route) => {
      await held;
      await route.abort();
    });

    await page.click(`[data-workspace-run="${STAGED_ID}"]`);

    const row = page.locator(`[data-cc-table-row="${STAGED_ID}"]`);
    await expect(row.locator('[data-cc-run-indicator]')).toBeVisible();
    await expect(row.locator('[data-cc-run-stage="done"]').first()).toBeVisible();
    // Stages, never a percentage (§2.8).
    expect(await row.locator('[data-cc-run-indicator]').innerText()).not.toMatch(/\b\d{1,3}\s?%/);

    await expect(row.locator('[data-cc-run-cancel]')).toBeVisible();
    await expect(row).toContainText(CC_MESSAGES['run.cancelReach']);

    await row.locator('[data-cc-run-cancel]').click();
    await expect(row.locator('[data-cc-run-indicator]')).toHaveCount(0);
    await expect(row.locator(`[data-workspace-run="${STAGED_ID}"]`)).toBeVisible();

    hold.release();
  });

  test('a failed run ends in Retry and Run without model', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    await page.route('**/api/gemini', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/api/runs/create', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The run could not be recorded.' }),
      }),
    );

    await page.click(`[data-workspace-run="${STAGED_ID}"]`);

    // §2.8: a failure ends in an action — never a raw error, never a silent
    // empty result.
    const strip = page.locator('[data-cc-message-strip="error"]');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(CC_MESSAGES['run.failed']);
    await expect(page.locator(`[data-workspace-retry="${STAGED_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-workspace-without-model="${STAGED_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-workspace-without-model="${STAGED_ID}"]`)).toHaveText(
      CC_MESSAGES['action.runWithoutModel'],
    );

    // The row is still a row: a failed run does not take the project away.
    await expect(page.locator(`[data-cc-table-row="${STAGED_ID}"]`)).toBeVisible();
  });
});
