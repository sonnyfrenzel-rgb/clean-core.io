import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

/**
 * The evidence sweep (`components/analyze/EvidenceSweep.tsx`, `DESIGN.md`
 * §5.1, §5.2, §5.4), observed on the real analyze page rather than read in the
 * source (QA review of d259f6f3c69a, df22bae8a8f1).
 *
 * The component promises four things, and each test holds one of them:
 *
 *   1. The findings are replayed in line order and the last one ends the
 *      sweep inside the budget — 2.4 s for the whole replay, no step slower
 *      than 120 ms. A ceiling, not a floor: the six-second minimum this sweep
 *      used to be held open for is exactly what §5.4 rules out, and the first
 *      test fails on it at the first step.
 *   2. "Skip" ends it at once and shows the end state.
 *   3. `prefers-reduced-motion: reduce` shows the end state at once, without
 *      a single intermediate frame.
 *   4. `onComplete` is called exactly once — also when "Skip" is pressed twice
 *      before React has re-rendered, and when time keeps running after the
 *      natural end.
 *
 * How it is made observable, and why that is honest:
 *
 *   - The run is started through the page's own buttons. The narrative stage
 *     is switched off for the account, so no model is called, and
 *     `/api/runs/create` is held by the test: the page shows the sweep for
 *     exactly as long as that request is open, so holding it keeps the sweep
 *     on screen without touching the component. Nothing is written.
 *   - Time is the page's clock under `page.clock`, paused before the sweep
 *     mounts and moved by the test. No assertion depends on how fast the
 *     machine is: the same steps pass on the compiling dev server and on the
 *     production build CI runs, because nothing here races a real timer.
 *   - The component reports its state as `data-sweep-*` attributes. The count
 *     of `onComplete` calls is one of them (`data-sweep-completions`): the
 *     page's callback only sets a ref (`sweepCompleteRef`), which has no
 *     visible consequence, so the call itself is what is counted.
 */

const STAMP = Date.now();
const EMAIL = `evidence-sweep-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;

/** Real ABAP: one SELECT and one UPDATE per standard table, each a finding. */
function program(tables: string[]): string {
  return [
    'REPORT z_evidence_sweep.',
    'DATA lv_flag TYPE c LENGTH 1.',
    ...tables.flatMap((t) => [
      `SELECT SINGLE * FROM ${t} INTO @DATA(ls_${t}) WHERE mandt = @sy-mandt.`,
      `UPDATE ${t} SET mandt = @sy-mandt WHERE mandt = @sy-mandt.`,
    ]),
  ].join('\n');
}
const TABLES = ['vbak', 'vbap', 'mara', 'marc', 'kna1', 'lfa1', 'bkpf', 'ekko', 'ekpo', 'likp', 'lips', 'vbrk', 'vbrp', 'mseg', 'mkpf'];
/** 30 findings: the budget, not the step cap, sets the pace (2400 / 30 = 80 ms). */
const LONG = program(TABLES);
/** 10 findings: the step cap sets the pace (2400 / 10 would be 240 ms). */
const SHORT = program(TABLES.slice(0, 5));

const BUDGET_MS = 2400;
const MAX_STEP_MS = 120;

/** What the engine finds, in line order — computed here, not read off the page. */
function linesInOrder(code: string): number[] {
  return buildAbapEvidence(code, 'main.abap', 'public').findings
    .map((f) => f.lineStart)
    .sort((a, b) => a - b);
}

const PROJECT_LONG = `evidence-sweep-long-${STAMP}`;
const PROJECT_SHORT = `evidence-sweep-short-${STAMP}`;
const PROJECT_REDUCED = `evidence-sweep-reduced-${STAMP}`;

let idToken = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  const uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  await adminSetDoc('users', uid, {
    firstName: 'Evidence', lastName: 'Sweep', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  for (const [id, code] of [[PROJECT_LONG, LONG], [PROJECT_SHORT, SHORT], [PROJECT_REDUCED, SHORT]]) {
    await adminSetDoc('projects', id, {
      name: 'Evidence sweep fixture', userId: uid, createdAt: new Date(),
      status: 'uploaded', legacyCode: code,
    });
  }

});

const sweep = (page: Page) => page.locator('[data-evidence-sweep]');

/**
 * Signs in, opens the staged project and starts the analysis through the
 * page's own controls. With `pauseClock`, the page's clock is frozen before the
 * start, so the sweep mounts at step 0 and moves only when the test says so.
 */
async function startSweep(page: Page, projectId: string, { pauseClock }: { pauseClock: boolean }) {
  // No model is called on the way to the sweep, on any machine: the narrative
  // stage is off for this account, through the route that owns the switch.
  const res = await page.request.post('/api/model-stages', {
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    data: { stages: { analyze: false } },
  });
  expect(res.status(), await res.text()).toBe(200);

  // The page shows the sweep while the run is being signed. Held, it stays.
  await page.route('**/api/runs/create', () => { /* never answered */ });

  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
  await page.goto(`/project/${projectId}/analyze`, { waitUntil: 'domcontentloaded' });

  const start = page.getByRole('button', { name: /Start Analysis/ });
  await expect(start).toBeVisible({ timeout: 60000 });
  // The page is optimistic until it has read the switch, and would call the
  // model if started before then. The notice is its word that it has read it.
  await expect(page.locator('[data-zero-llm-notice]'), 'the page never learned the narrative is off')
    .toBeVisible({ timeout: 30000 });
  await page.getByText('Public Cloud Edition').first().click();
  await page.getByLabel(/^I agree to the Terms & Conditions/).check();
  await expect(start).toBeEnabled();
  await start.click();
  const confirm = page.getByRole('button', { name: /Confirm and start the analysis/ });
  await expect(confirm).toBeEnabled();

  if (pauseClock) {
    await page.clock.install();
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
  }
  await confirm.click();
  await expect(sweep(page), 'the analysis started but no sweep appeared').toBeVisible({ timeout: 30000 });
}

test('the findings run in line order and the last one ends the sweep inside the budget', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const lines = linesInOrder(LONG);
  expect(lines.length, 'the fixture must be long enough for the budget to set the pace').toBeGreaterThan(BUDGET_MS / MAX_STEP_MS);

  await startSweep(page, PROJECT_LONG, { pauseClock: true });
  const s = sweep(page);
  await expect(s).toHaveAttribute('data-sweep-total', String(lines.length));
  await expect(s).toHaveAttribute('data-sweep-revealed', '0');
  await expect(s).toHaveAttribute('data-sweep-state', 'running');

  // The whole replay fits the budget, so every step is at most budget / n —
  // and never more than the per-step cap. One millisecond before a step is
  // due nothing has moved; at the step, exactly the next line lights up.
  const step = Math.min(BUDGET_MS / lines.length, MAX_STEP_MS);
  expect(Number.isInteger(step), 'the fixture should give a whole-millisecond step').toBe(true);
  for (let k = 1; k <= lines.length; k++) {
    await page.clock.runFor(step - 1);
    await expect(s, `finding ${k} came early`).toHaveAttribute('data-sweep-revealed', String(k - 1));
    await page.clock.runFor(1);
    await expect(s, `finding ${k} was not shown ${step} ms after finding ${k - 1}`)
      .toHaveAttribute('data-sweep-revealed', String(k));
    await expect(s, `finding ${k} is not the ${k}. in line order`)
      .toHaveAttribute('data-sweep-line', String(lines[k - 1]));
  }

  // The last finding is the end — at step × n = the budget, not a clock later.
  await expect(s, 'the last finding did not end the sweep').toHaveAttribute('data-sweep-state', 'complete');
  await expect(s).toHaveAttribute('data-sweep-completions', '1');
  await expect(s.getByRole('button', { name: 'Skip' }), 'Skip is offered after the end').toHaveCount(0);

  // Time running on after the natural end calls nobody a second time.
  await page.clock.runFor(10_000);
  await expect(s).toHaveAttribute('data-sweep-completions', '1');
  await expect(s).toHaveAttribute('data-sweep-revealed', String(lines.length));
});

test('Skip ends the sweep at once, and pressing it twice completes it once', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const lines = linesInOrder(SHORT);
  expect(lines.length * MAX_STEP_MS, 'the fixture must be short enough for the step cap to set the pace').toBeLessThan(BUDGET_MS);

  await startSweep(page, PROJECT_SHORT, { pauseClock: true });
  const s = sweep(page);
  await expect(s).toHaveAttribute('data-sweep-total', String(lines.length));

  // A short list does not crawl: the first finding is there at the step cap.
  await page.clock.runFor(MAX_STEP_MS);
  await expect(s).toHaveAttribute('data-sweep-revealed', '1');
  await expect(s).toHaveAttribute('data-sweep-state', 'running');

  // Two clicks in one task, before React has re-rendered and taken the button
  // away — the double click a quick hand makes. The clock does not move.
  const clicked = await s.getByRole('button', { name: 'Skip' }).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
    return true;
  });
  expect(clicked).toBe(true);

  await expect(s, 'Skip did not end the sweep').toHaveAttribute('data-sweep-state', 'complete');
  await expect(s, 'Skip did not show every finding').toHaveAttribute('data-sweep-revealed', String(lines.length));
  await expect(s, 'onComplete was not called exactly once').toHaveAttribute('data-sweep-completions', '1');
  await expect(s.getByRole('button', { name: 'Skip' })).toHaveCount(0);

  // And the replay is stopped, not merely hidden: time moves on, nothing does —
  // not one step later, and not ten seconds later.
  await page.clock.runFor(MAX_STEP_MS);
  await expect(s, 'the replay kept running behind the end state').toHaveAttribute('data-sweep-revealed', String(lines.length));
  await page.clock.runFor(10_000);
  await expect(s).toHaveAttribute('data-sweep-completions', '1');
  await expect(s).toHaveAttribute('data-sweep-revealed', String(lines.length));
});

test('reduced motion shows the end state at once, without a step in between', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const lines = linesInOrder(SHORT);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Every value the counter takes is recorded as it is committed, from before
  // the sweep mounts. No clock is involved: the claim is about which states
  // appear, not how long they take.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __sweepSeen: string[] }).__sweepSeen = seen;
    new MutationObserver(() => {
      const el = document.querySelector('[data-evidence-sweep]');
      const v = el?.getAttribute('data-sweep-revealed');
      if (v != null && seen[seen.length - 1] !== v) seen.push(v);
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });

  await startSweep(page, PROJECT_REDUCED, { pauseClock: false });
  const s = sweep(page);
  await expect(s).toHaveAttribute('data-sweep-state', 'complete');
  await expect(s).toHaveAttribute('data-sweep-revealed', String(lines.length));
  await expect(s).toHaveAttribute('data-sweep-completions', '1');

  const seen = await page.evaluate(() => (window as unknown as { __sweepSeen: string[] }).__sweepSeen);
  const between = seen.filter((v) => v !== '0' && v !== String(lines.length));
  expect(between, `the sweep animated under reduced motion (${seen.join(' → ')})`).toEqual([]);
});
