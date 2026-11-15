import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { CC_MESSAGES } from '../lib/cc-messages';
import { WORKSPACE_MESSAGES } from '../lib/workspace-messages';
import { DEMO_PROJECT_TITLE, DEMO_TAG, DEMO_WORKSPACE_ROUTE } from '../lib/demo-marks';
import { signInViaLanding } from './helpers/sign-in';

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
 *   4. **The demo is a door below the list, not a row, and not an achievement.**
 *      Roadmap 0.10 builds it unproven on purpose (a door since AB-14b).
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
const LEGACY_ID = `ws-legacy-${STAMP}`;
const RUN_ID = `ws-run-${STAMP}`;
const SHARED_ID = `ws-shared-${STAMP}`;
const INVITE_ID = `wsInvite${STAMP}`;

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
  await signInViaLanding(page, email, SIGN_IN);
}

/** Signs in as the admin and opens the list report. */
async function openWorkspace(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN_EMAIL);
  // Since 01.10.2026 there is one "My workspace", at /dashboard: the 3.0 list,
  // for every account in good standing since roadmap 3.0.1.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-cc-workspace]', { timeout: 60000 });
  await page.waitForSelector('[data-cc-object-identifier-title]', { timeout: 60000 });
  // Measured styles, not animations. Disabling transitions before anything is
  // read is the difference between a spec that is green locally and one that is
  // green in CI.
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  });
}

/**
 * Signs in and opens /dashboard for an account with no project yet. Since
 * AB-14a that is the first view (home mockup v2.1, state 1), not a list holding
 * only the demo row.
 */
async function openFirstView(page: Page, email: string) {
  await signIn(page, email);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-home-first-view]', { timeout: 60000 });
}

/**
 * The titles actually in the My projects table — so no later assertion can pass on an empty render. Since AB-14b the
 * Shared with me tab keeps its own table, mounted and hidden beside this one; it is not counted here.
 */
async function rowTitles(page: Page): Promise<string[]> {
  return page.locator('#home-panel-mine [data-cc-table] [data-cc-object-identifier-title]').allInnerTexts();
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
  // Several dev servers run on this machine; a suite that measured another one
  // would report the old behaviour as a regression. The first view of a new
  // account exists only with AB-14a.
  await openFirstView(page, ADMIN_EMAIL);
  await expect(page.locator('[data-cc-workspace]')).toHaveCount(1);
  await expect(page.locator('[data-home-first-view]')).toHaveCount(1);
});

test('a community account gets the same "My workspace", and the old address of the list leads there', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page, COMMUNITY_EMAIL);

  // /admin/workspace was where the 3.0 list grew; it now redirects to the one
  // "My workspace" — which since roadmap 3.0.1 (ADR-061) is the 3.0 list for
  // every account in good standing, not only for an administrator.
  await page.goto('/admin/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/dashboard$/, { timeout: 60000 });
  await expect(page.locator('[data-cc-workspace]'), 'a community account still gets the old page').toHaveCount(1, {
    timeout: 60000,
  });
  expect(await page.locator('[data-dashboard]').count(), 'both workspaces rendered').toBe(0);
  // AB-14a: no project yet, so the first view — and the demo is its line
  // "Prefer to look first?", leading to the workspace demo with its tour.
  await expect(page.locator('h1')).toHaveText(WORKSPACE_MESSAGES['home.title']);
  await expect(page.locator('[data-home-open-demo]:visible')).toHaveAttribute('href', '/demo/workspace');
});

test('there is only one "My workspace" at a time on /dashboard', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openFirstView(page, ADMIN_EMAIL);
  await expect(page.locator('[data-cc-workspace]')).toHaveCount(1);
  expect(await page.locator('[data-dashboard]').count(), 'both workspaces rendered').toBe(0);
  await expect(page.locator('h1')).toHaveCount(1);
});

test.describe('before the first project', () => {
  test('the first view stands where an empty list stood: no table, no empty state, no filter bar', async ({ page }) => {
    // AB-14a (home mockup v2.1, state 1). The empty list with the demo as its
    // only row was a list with nothing of the reader's in it; the first view
    // says what happens and holds the start instead.
    test.setTimeout(180 * 1000);
    await openFirstView(page, ADMIN_EMAIL);
    await expect(page.locator('h1')).toHaveText(WORKSPACE_MESSAGES['home.title']);
    expect(await page.locator('[data-cc-table]').count()).toBe(0);
    expect(await page.locator('[data-workspace-projects]').count()).toBe(0);
    expect(await page.locator('[data-cc-empty-state]').count()).toBe(0);
    expect(await page.locator('[data-workspace-your-turn]').count()).toBe(0);
    await expect(page.locator('[data-home-start] [data-home-way]')).toHaveCount(2);
  });
});

test.describe('with projects', () => {
  test('the demo is a door below the list, not a row and not an achievement, and an own project means no empty state', async ({ page }) => {
    test.setTimeout(180 * 1000);
    // The projects of this block's beforeAll are there (AB-14a: before the
    // first one, the first view stands instead of the list).
    await openWorkspace(page);

    const titles = await rowTitles(page);
    expect(titles.length, 'the table rendered no rows at all').toBeGreaterThan(0);
    // AB-14b (CHANGELOG [Unreleased], "Home page v2 part 2": "The demo and the
    // examples are two doors below the list"): the demo was the first row, a
    // project of nobody's with a status it had not earned. Roadmap 0.10 still
    // holds — it produces no signed run and executes no test — so it must not
    // come back as a row, and the door carries no status word, no step bar and
    // no proof chip.
    expect(titles.some((t) => t.includes(DEMO_PROJECT_TITLE)), 'the demo is a row again').toBe(false);
    expect(await page.locator(`[data-cc-table] [data-cc-tag]:has-text("${DEMO_TAG}")`).count(), 'a row carries the demo tag').toBe(0);
    expect(await page.locator('[data-cc-table-row="demo"]').count(), 'the demo is a row again').toBe(0);
    const door = page.locator('[data-home-door="demo"]');
    await expect(door).toBeVisible();
    await expect(door.locator('a')).toHaveAttribute('href', DEMO_WORKSPACE_ROUTE);
    await expect(door).not.toContainText('handed over');
    expect(await door.locator('[data-progress-bar], [data-home-status], [data-provenance]').count(), 'the demo door claims a state').toBe(0);
    expect(
      await page.locator('[data-cc-table] [data-provenance="proven"]').count(),
      'a row carries a proof chip',
    ).toBe(0);

    // A project of the reader's own: no empty state of either kind.
    expect(await page.locator('[data-cc-empty-state="empty"]').count()).toBe(0);
    expect(await page.locator('[data-cc-empty-state="no-matches"]').count()).toBe(0);
  });

  test.beforeAll(async () => {
    await adminSetDoc('projects', STAGED_ID, {
      name: 'Staged, never analysed',
      userId: adminUid,
      createdAt: new Date(),
      status: 'uploaded',
      legacyCode: PROGRAM,
      s4Deployment: 'private',
    });

    // A project from before the trust chain, as on the owner's own account on
    // 02.10.2026: design, code, documentation and a test draft on record, and no
    // signed run. Its row used to say "Not analysed yet" above "2 of 7 steps done".
    await adminSetDoc('projects', LEGACY_ID, {
      name: 'Made before the trust chain',
      userId: adminUid,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'completed',
      legacyCode: PROGRAM,
      s4Deployment: 'private',
      solutionDesign: '# Design',
      generatedCode: 'CLASS zcl_credit DEFINITION. ENDCLASS.',
      documentation: '# Blueprint',
      testCases: [{ id: 't1', title: 'Credit check', status: 'Not run' }],
    });

    // Seven more own projects, staged: with the three of this block that makes ten, the number the filters appear
    // from (AB-14b, FILTERS_FROM in lib/home-rows.ts), so the filter and no-match tests have a filter bar to use.
    for (let n = 1; n <= 7; n++) {
      await adminSetDoc('projects', `ws-filler-${STAMP}-${n}`, {
        name: `Filler program ${n}`,
        userId: adminUid,
        createdAt: new Date(Date.UTC(2026, 8, n)),
        status: 'uploaded',
        legacyCode: PROGRAM,
        s4Deployment: 'private',
      });
    }

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

  test('a project shared with the account is listed read only in its own tab, offers no owner action, and is not one of the own rows', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await adminSetDoc('projects', SHARED_ID, {
      name: 'Shared credit limit check', userId: communityUid, createdAt: new Date(), status: 'uploaded',
      legacyCode: PROGRAM, readers: [adminUid],
    });
    await openWorkspace(page);

    // AB-14b (CHANGELOG [Unreleased], Home page v2 part 2): "Tabs: My projects, Shared with me, Invitations sent; the
    // Sharing card lives in them" — the tab replaced the Access filter and the Sharing card. The own list keeps it out.
    await expect(page.locator(`#home-panel-mine [data-cc-table-row="${SHARED_ID}"]`)).toHaveCount(0);
    const tab = page.locator('[data-home-tab="shared"]');
    await expect(tab).toBeVisible({ timeout: 60000 });
    await tab.click();
    const panel = page.locator('#home-panel-shared');
    const row = panel.locator(`[data-workspace-shared-row="${SHARED_ID}"]`);
    await expect(row).toBeVisible({ timeout: 60000 });
    // The tab holds the shared project and nothing else: no own row, no demo.
    const sharedIds = await panel.locator('[data-workspace-shared-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-workspace-shared-row')));
    expect([...new Set(sharedIds)]).toEqual([SHARED_ID]);
    const tableIds = await panel.locator('[data-cc-table-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-cc-table-row')));
    expect(tableIds.filter((id) => id !== SHARED_ID), 'an own row or the demo is in the shared tab').toEqual([]);
    await expect(row.locator('[data-workspace-access="shared"]')).toBeVisible();
    await expect(row).toContainText(WORKSPACE_MESSAGES['homeList.readOnly']);
    await expect(panel).toContainText(WORKSPACE_MESSAGES['homeList.sharedNote']);
    // Read access only: no run, no menu of owner actions — just open.
    expect(await panel.locator(`[data-home-run="${SHARED_ID}"]`).count()).toBe(0);
    expect(await panel.locator(`[data-workspace-more="${SHARED_ID}"]`).count()).toBe(0);
    await expect(row.locator(`a[data-workspace-open="${SHARED_ID}"]`)).toHaveAttribute('href', `/project/${SHARED_ID}`);
  });

  test('the row menu keeps every owner action and opens the invite dialog with what is still waiting', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const now = Date.now();
    await adminSetDoc(`projects/${STAGED_ID}/invitations`, INVITE_ID, {
      id: INVITE_ID, projectId: STAGED_ID, email: 'waiting.reader@example.com',
      invitedBy: { uid: adminUid, name: 'List Report' }, invitedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 7 * 864e5).toISOString(), status: 'pending',
      acceptedBy: null, acceptedAt: null, revokedAt: null,
    });
    await openWorkspace(page);

    await page.click(`[data-workspace-more="${STAGED_ID}"]`);
    const panel = page.locator(`[data-workspace-more-panel="${STAGED_ID}"]`);
    await expect(panel).toBeVisible();
    for (const label of ['Invite to read…', 'Duplicate', 'Export as JSON', 'Deliverables', 'Delete…']) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await panel.locator('[data-invite-open]').click();

    const dialog = page.locator('[data-invite-dialog]');
    await expect(dialog).toBeVisible();
    const waiting = dialog.locator(`[data-open-invitation="${INVITE_ID}"]`);
    await expect(waiting).toBeVisible({ timeout: 60000 });
    await expect(waiting).toContainText('waiting.reader@example.com');
    await expect(waiting.locator('[data-open-invitation-expires]')).toContainText('Link expires on');

    // Withdraw asks first, then the link is dead and the entry leaves the list.
    await waiting.locator(`[data-open-invitation-withdraw="${INVITE_ID}"]`).click();
    await page.locator('[data-cc-message-box]').getByRole('button', { name: 'Withdraw' }).click();
    await expect(dialog.locator(`[data-open-invitation="${INVITE_ID}"]`)).toHaveCount(0, { timeout: 60000 });
  });

  test('on a phone each project is one compact card, with no per-column labels', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const card = page.locator(`[data-workspace-card="${STAGED_ID}"]`);
    await expect(card).toBeVisible({ timeout: 60000 });
    // The table and its column labels are not rendered at all on S.
    expect(await page.locator('#home-panel-mine [data-cc-table]').count()).toBe(0);
    // The status words of AB-14b (H-O3): not analysed, no step count and no step bar.
    await expect(card.locator('[data-home-status]')).toHaveAttribute('data-home-status', 'notrun');
    await expect(card.locator('[data-home-status-title]')).toHaveText('Not analysed yet');
    await expect(card).not.toContainText(/\d of 6 steps done/);
    expect(await card.locator('[data-home-redesign-bar]').count(), 'a step bar on a project nothing analysed').toBe(0);
    // One next step: the run, through its dialog.
    await expect(card.locator('[data-home-next]')).toHaveCount(1);
    await expect(card.locator(`[data-home-run="${STAGED_ID}"]`)).toBeVisible();
    await expect(card.locator(`[data-workspace-more="${STAGED_ID}"]`)).toBeVisible();
    // No sideways scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every column of a project that has done nothing says so', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const titles = await rowTitles(page);
    expect(titles.length, 'the table rendered no rows at all').toBeGreaterThanOrEqual(3);

    const row = page.locator(`#home-panel-mine [data-cc-table-row="${STAGED_ID}"]`);
    await expect(row).toBeVisible();

    // Status (AB-14b, H-O3): a status word and the line under it, never a bare "draft" — and nothing counted as done.
    await expect(row.locator('[data-home-status]')).toHaveAttribute('data-home-status', 'notrun');
    await expect(row.locator('[data-home-status-title]')).toHaveText('Not analysed yet');
    await expect(row.locator('[data-home-status-detail]')).toHaveText('Code uploaded');
    expect(await row.locator('[data-cc-object-status]').count(), 'a bare status word is back').toBe(0);
    expect(await row.locator('[data-home-redesign-bar]').count(), 'the step bar is back').toBe(0);
    // Next step: one action, the row's own run — offered once.
    await expect(row.locator('[data-home-next]')).toHaveAttribute('data-home-next', 'analyze');
    await expect(row.locator(`[data-home-run="${STAGED_ID}"]`)).toHaveText('Run the analysis');
    await expect(row.locator('[data-home-run]')).toHaveCount(1);

    // Figures (the switch): the staged lines are counted, and findings are left out, never a zero — a zero would mean
    // the engine looked.
    await page.locator('[data-home-figures]').click();
    // The figures stand in the row's note, a table row of its own under it.
    const facts = page.locator(`#home-panel-mine [data-cc-table-note="${STAGED_ID}"] [data-workspace-card-facts]`);
    await expect(facts).toContainText(`${PROGRAM.split('\n').length} lines`);
    await expect(facts).not.toContainText('findings');
    await page.locator('[data-home-figures]').click();

    // Last change: today, as "6 Nov 2026" (H-O10).
    const today = new Date();
    const date = row.locator('[data-home-date]');
    await expect(date).toHaveText(/^\d{1,2} [A-Z][a-z]{2,3} \d{4}$/);
    await expect(date).toContainText(`${today.getDate()} `);
    await expect(date).toContainText(String(today.getFullYear()));
  });

  test('a stale run is a warning on the status line, not a status of its own', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const row = page.locator(`#home-panel-mine [data-cc-table-row="${STALE_ID}"]`);
    await expect(row).toBeVisible();

    // DESIGN.md §4.1: *stale* is provenance, not a status of its own — the row stays "Analysed", the line under it
    // says the code changed as a warning (never the error look), and the next step is the analysis again (AB-14b).
    await expect(row.locator('[data-home-status]')).toHaveAttribute('data-home-status', 'analysed');
    await expect(row.locator('[data-home-status-title]')).toHaveText('Analysed');
    await expect(row.locator('[data-home-status-detail]')).toHaveAttribute('data-home-status-detail', 'warn');
    await expect(row.locator('[data-home-status-detail]')).toHaveText('The code changed since');
    await expect(row.locator(`[data-home-run="${STALE_ID}"]`)).toHaveText('Run the analysis again');
    // "Needs your attention" names it, with its reason.
    const attention = page.locator('[data-home-attention]');
    await expect(attention).toContainText('Source changed after the run');
    await expect(attention).toContainText('The code changed since the analysis');

    // It counted the findings that are on record, and did not invent a level.
    await page.locator('[data-home-figures]').click();
    await expect(page.locator(`#home-panel-mine [data-cc-table-note="${STALE_ID}"] [data-workspace-card-facts]`)).toContainText('2 findings');
    await page.locator('[data-home-figures]').click();
  });

  test('a project with no signed run reads "not analysed" throughout — no step count, no step bar', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const row = page.locator(`#home-panel-mine [data-cc-table-row="${LEGACY_ID}"]`);
    await expect(row).toBeVisible({ timeout: 60000 });
    // Design, code, documentation and a test draft on record, and no signed run: the status is read from the phase
    // contract, never from `project.status` ('completed' here), and nothing counts as done (AB-14b, H-O3).
    await expect(row.locator('[data-home-status]')).toHaveAttribute('data-home-status', 'notrun');
    await expect(row.locator('[data-home-status-title]')).toHaveText('Not analysed yet');
    await expect(row.locator(`[data-home-run="${LEGACY_ID}"]`)).toBeVisible();
    await expect(row).not.toContainText(/\d of \d steps done/);
    await expect(row).not.toContainText('Re-design');
    await expect(row).not.toContainText('Handed over');
    expect(await row.locator('[data-home-redesign-bar]').count(), 'a step bar is back').toBe(0);

    // The Status filter agrees with the status word.
    await page.locator('[data-home-filters]').getByLabel('Status').selectOption('notrun');
    expect(await rowTitles(page)).toContain('Made before the trust chain');
    for (const title of await page.locator('#home-panel-mine [data-home-status-title]').allInnerTexts()) {
      expect(title.trim()).toBe('Not analysed yet');
    }
  });

  test('no projects yet and no matches are two different states', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openWorkspace(page);

    const before = await rowTitles(page);
    expect(before.length, 'the table rendered no rows at all').toBeGreaterThanOrEqual(3);

    // With ten projects of the reader's own there is something to filter (AB-14b: filters from ten on).
    const filter = page.locator('[data-home-filters] [data-cc-filter-bar]');
    await expect(filter).toBeVisible();

    await page.fill('[data-home-filters] input[type="search"]', 'zzz-nothing-matches-this-zzz');
    await expect(page.locator('[data-cc-empty-state="no-matches"]')).toBeVisible();

    // The distinction this test exists for: the no-match state never wears the
    // empty one's clothes, and its sentence names what did not match.
    expect(
      await page.locator('[data-cc-empty-state="empty"]').count(),
      'the empty state was shown for a filter that matched nothing',
    ).toBe(0);
    const noMatchTitle = await page.locator('[data-cc-no-match-title]').innerText();
    expect(noMatchTitle).toBe(WORKSPACE_MESSAGES['homeList.noMatchTitle']);
    expect(noMatchTitle).not.toBe(CC_MESSAGES['workspace.emptyTitle']);
    await expect(page.locator('[data-home-filters] [data-cc-clear-filters]')).toBeVisible();

    // And the count says how many of how many, in a live region; clearing the filter shows exactly that many rows.
    const count = page.locator('[data-home-filters] [data-cc-filter-count]');
    const counted = new RegExp(
      `^\\s*0 ${CC_MESSAGES['filter.of']} (\\d+) ${WORKSPACE_MESSAGES['homeList.noun']}\\s*$`,
    );
    await expect(count).toHaveText(counted);
    const total = Number(counted.exec(await count.innerText())?.[1]);
    expect(total, 'the count names fewer projects than the table first showed').toBeGreaterThanOrEqual(
      before.length,
    );

    await page.click('[data-home-filters] [data-cc-clear-filters]');
    await expect(page.locator('[data-cc-empty-state="no-matches"]')).toHaveCount(0);
    const showAll = page.locator('[data-workspace-show-all]');
    if (await showAll.count()) await showAll.click();
    await expect(page.locator('#home-panel-mine [data-cc-table] [data-cc-object-identifier-title]')).toHaveCount(total);
  });

  test('a run says its price before the click', async ({ page }) => {
    test.setTimeout(180 * 1000);
    let runs = 0;
    await page.route('**/api/runs/create', (route) => {
      runs++;
      return route.abort();
    });
    await openWorkspace(page);

    // AB-14b: a run from a row starts only through a confirmation dialog with its cost and model.
    const row = page.locator(`#home-panel-mine [data-cc-table-row="${STAGED_ID}"]`);
    await row.locator(`[data-home-run="${STAGED_ID}"]`).click();
    const dialog = page.locator('[data-cc-message-box]');
    await expect(dialog.locator(`[data-home-run-dialog="${STAGED_ID}"]`)).toBeVisible();

    // DESIGN.md §2.8: the quota and whether a model is called are two separate
    // claims, and both stand before the click. No percentage anywhere.
    const cost = dialog.locator('[data-cc-run-cost]');
    await expect(cost).toBeVisible();
    await expect(cost.locator('[data-cc-run-cost-quota]')).not.toBeEmpty();
    await expect(cost.locator('[data-cc-run-cost-model]')).not.toBeEmpty();
    // The consent texts `startRun.*` (legal review 06.11.2026): free, and who
    // receives the code — never a word about costs.
    await expect(cost.locator('[data-cc-run-cost-quota]')).toHaveText(/^Free\. /);
    await expect(cost.locator('[data-cc-run-cost-model]')).toHaveText(
      /^(Calls no AI model\. Your code does not leave the platform\.|Calls the AI model \((Google|Anthropic)\)\. Your code is sent to \2 for this\.)$/,
    );
    expect(await cost.innerText()).not.toMatch(/cost/i);
    expect(await cost.innerText()).not.toMatch(/\d\s*%/);

    // Cancel starts nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(runs).toBe(0);
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

    // AB-14b: the row's run opens the confirmation dialog; "Run analysis" starts it.
    await page.click(`[data-home-run="${STAGED_ID}"]`);
    await page.locator('[data-cc-message-box]').getByRole('button', { name: WORKSPACE_MESSAGES['homeList.runConfirm'] }).click();

    const row = page.locator(`#home-panel-mine [data-cc-table-row="${STAGED_ID}"]`);
    await expect(row.locator('[data-cc-run-indicator]')).toBeVisible();
    await expect(row.locator('[data-cc-run-stage="done"]').first()).toBeVisible();
    // Stages, never a percentage (§2.8).
    expect(await row.locator('[data-cc-run-indicator]').innerText()).not.toMatch(/\b\d{1,3}\s?%/);

    await expect(row.locator('[data-cc-run-cancel]')).toBeVisible();
    await expect(row).toContainText(CC_MESSAGES['run.cancelReach']);

    await row.locator('[data-cc-run-cancel]').click();
    await expect(row.locator('[data-cc-run-indicator]')).toHaveCount(0);
    await expect(row.locator(`[data-home-run="${STAGED_ID}"]`)).toBeVisible();

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

    // AB-14b: through the confirmation dialog.
    await page.click(`[data-home-run="${STAGED_ID}"]`);
    await page.locator('[data-cc-message-box]').getByRole('button', { name: WORKSPACE_MESSAGES['homeList.runConfirm'] }).click();

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
    await expect(page.locator(`#home-panel-mine [data-cc-table-row="${STAGED_ID}"]`)).toBeVisible();
  });

  test('a delete whose project is already gone is not reported as a failure', async ({ page }) => {
    // Carried QA finding ac74ebf5a627: the first delete went through and its
    // answer was lost; the retry hears 404, and the page said the delete failed.
    test.setTimeout(180 * 1000);
    await page.route(`**/api/projects/${STAGED_ID}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Project not found.' }) })
        : route.continue(),
    );
    await openWorkspace(page);
    await page.click(`[data-workspace-more="${STAGED_ID}"]`);
    await page.locator(`[data-workspace-delete="${STAGED_ID}"]`).click();
    const answered = page.waitForResponse(
      (r) => r.url().endsWith(`/api/projects/${STAGED_ID}`) && r.request().method() === 'DELETE',
    );
    await page.locator('[data-cc-message-box]').getByRole('button', { name: 'Delete project' }).click();
    await answered;
    await expect(page.locator('[data-cc-message-box]')).toHaveCount(0);
    // A refusal lands in the action strip on the next render; give it one.
    await page.waitForTimeout(1000);
    await expect(page.getByText('Project not found.')).toHaveCount(0);
  });
});
