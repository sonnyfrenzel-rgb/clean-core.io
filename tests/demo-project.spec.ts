import { test, expect } from '@playwright/test';
import { fillEconomics } from './helpers/economics';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { buildDemoProject, assertNoTrustChain } from '../lib/demo-project';
import { findTrustChainField, DEMO_SOURCE_FILE, DEMO_STORAGE_KEY, DEMO_TITLE_PREFIX } from '../lib/demo-marks';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { PHASES } from '../lib/workflow-steps';
import { TERMS_VERSION } from '../lib/constants';
import { scoreBreakdown, scoreBand } from '../lib/clean-core-score';
import { findingRows } from '../lib/findings-view';

/**
 * The demo project — roadmap step 0.10, `DESIGN.md` §6.1.2.
 *
 * A demo is the one artefact in this product that a reader could mistake for
 * evidence about their own system: same screens, same engine, same line numbers,
 * and none of it a measurement of anything they own. So the checks here are not
 * about the feature working. They are about the four things that make it safe:
 *
 *   1. every figure in it is the engine's, computed now, not a number typed in;
 *   2. it carries no field of the trust chain and no account, ever;
 *   3. there is no code path from it to a run, a pack, an export or a write —
 *      not a disabled button, no path at all;
 *   4. every screen says it is a demo, says it is unsigned, and offers exactly
 *      one way out to the reader's own code.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const STAGES = PHASES.map((p) => p.key);

/**
 * Opens a demo stage and waits for the browser to take it over.
 *
 * The demo is server-rendered, so every control on it is inert until hydration
 * finishes — which on a cold dev server is well past the default expect timeout.
 * Clicking before that tests nothing and fails intermittently, so the page says
 * when it is ready instead of the test guessing.
 */
async function openStage(page: import('@playwright/test').Page, stage: string) {
  await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
}

test.describe('the demo is a real run, not a story about one', () => {
  test('its figures are the engine’s, recomputed here independently', () => {
    const demo = buildDemoProject();

    const source = read(path.posix.join('public', 'starter-examples', DEMO_SOURCE_FILE));
    const evidence = buildAbapEvidence(source, DEMO_SOURCE_FILE, 'private');
    const route = routeExtensibility(evidence, 'private');

    // Not a vacuous comparison: this example is the eighth starter example and a
    // 668-line program. An engine that suddenly finds nothing would satisfy an
    // equality check on two empty arrays, so the floor is asserted first.
    expect(
      evidence.findings.length,
      'the engine found almost nothing in Z_MM_PO_APPROVAL — the equality below would prove nothing',
    ).toBeGreaterThan(10);

    expect(demo.analyze.findings.map((f) => `${f.id}@${f.lineStart}`)).toEqual(
      evidence.findings.map((f) => `${f.id}@${f.lineStart}`),
    );
    expect(demo.analyze.summary).toEqual(evidence.summary);
    expect(demo.analyze.cleanCoreScore).toBe(route.cleanCoreScore);
    // The score is computed, by the table the real run uses, and the breakdown
    // the page shows arrives at it — recomputed here the way the Analyze page
    // recomputes it, not read back from the demo.
    const gaps = evidence.coverage && !evidence.coverage.complete ? evidence.coverage.gaps.length : 0;
    expect(scoreBreakdown(evidence.findings, gaps).score).toBe(route.cleanCoreScore);
    expect(demo.analyze.scoreBreakdown).toEqual(scoreBreakdown(evidence.findings, gaps));
    // Two counts, two units: occurrences (one per line) and findings as the
    // Analyze stage lists them (one per pattern and object). This example has
    // patterns that repeat on one object, so the two differ — a demo that
    // printed the first under the second's name said 31 where a run says 25.
    expect(demo.analyze.distinctFindings).toBe(findingRows(evidence.findings).length);
    expect(demo.analyze.distinctFindings, 'no repeated pattern left — the unit check below proves nothing').toBeLessThan(
      evidence.findings.length,
    );
    expect(demo.rail.find((r) => r.key === 'analyze')?.detail).toContain(
      `${demo.analyze.distinctFindings} findings at ${evidence.findings.length} places`,
    );
    expect(demo.design.recommendedRoute).toBe(route.recommendedRoute);
    expect(demo.design.confidenceScore).toBe(route.confidenceScore);
    expect(demo.analyze.coverage.gaps).toEqual(evidence.coverage.gaps);
    expect(demo.economics.scoreBefore).toBe(route.cleanCoreScore);
    expect(demo.linesOfCode).toBe(source.split(/\r?\n/).filter((l) => l.trim() && !/^\s*\*/.test(l)).length);
    // Economics models on the source's line count, the one every other screen
    // states - not the code-only count (it said 550 against 669 until 01.10.2026).
    // Since 03.10.2026 (UX-182) the final newline ends the last line instead of
    // starting an empty one, so the 668-line program counts 668, not 669.
    expect(demo.economics.loc, 'the demo economics models on the whole source').toBe(
      source.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length,
    );
    expect(demo.economics.loc).toBe(668);
    expect(demo.economics.loc).toBe(demo.totalLines);
  });

  test('the stages the model would write carry no invented model output', () => {
    const demo = buildDemoProject();
    // Transformation, documentation and testing are a model's work in a real
    // run. The demo may show what the deterministic half produced and must not
    // manufacture the rest: no generated code, no written blueprint, no verdicts.
    expect(demo.testing.verdicts).toEqual({ total: 0, passed: 0, failed: 0, withoutVerdict: 0 });
    expect(demo.transformation.plan.length).toBeGreaterThan(0);
    for (const item of demo.transformation.plan) {
      // Every line of the plan points at a line of the source — it is derived,
      // not composed.
      expect(item.lineStart).toBeGreaterThan(0);
      expect(item.lineStart).toBeLessThanOrEqual(demo.totalLines);
    }
    expect(demo.documentation.inventory.length).toBeGreaterThan(0);
    expect(demo.testing.manualAreas.map((a) => a.line)).toEqual(
      demo.analyze.coverage.unassessed.map((u) => u.line),
    );
  });
});

test.describe('the demo can never be mistaken for a signed run', () => {
  test('it carries no trust-chain field and no account', () => {
    const demo = buildDemoProject();
    expect(demo.signed).toBe(false);
    expect(findTrustChainField(demo)).toBeNull();
  });

  test('and the check that says so can actually fail', () => {
    // A guard nobody has seen fail is a comment. Both the detector and the
    // refusal built on it are run against a deliberately poisoned object.
    expect(findTrustChainField({ a: { b: [{ runHash: 'deadbeef' }] } })).toBe('a.b[0].runHash');
    expect(findTrustChainField({ analyze: { findings: [{ userId: 'u1' }] } })).toBe('analyze.findings[0].userId');
    expect(() => assertNoTrustChain({ ...buildDemoProject(), activeRunId: 'run_1' })).toThrow(/activeRunId/);
    expect(() => assertNoTrustChain(buildDemoProject())).not.toThrow();
  });

  test('nothing the demo owns can reach a run, a pack, an export or a write', () => {
    // The guarantee is structural. A demo that merely hides its export button is
    // one refactor away from shipping a pack that looks like evidence, so the
    // files the demo is made of may not so much as name the machinery.
    const FORBIDDEN: Array<[RegExp, string]> = [
      [/firebase\/firestore/, 'a Firestore import'],
      [/\bgetDb\s*\(/, 'a Firestore handle'],
      [/\b(addDoc|setDoc|updateDoc|deleteDoc|serverTimestamp)\s*\(/, 'a Firestore write'],
      [/\/api\/runs/, 'the run route'],
      [/\/api\/audit-pack/, 'the audit-pack route'],
      [/\/api\/export/, 'the signing or verify route'],
      [/\/api\/gemini/, 'the model proxy'],
      [/\baudit-pack(-build|-canonical|-verify)?['"]/, 'the audit-pack modules'],
      [/\brun-signature\b/, 'the signing module'],
      [/\brun-guard\b/, 'the run guard'],
      [/\bfetch\s*\(/, 'a network call'],
    ];

    const owned: string[] = ['lib/demo-marks.ts', 'lib/demo-project.ts'];
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.resolve(ROOT, rel), { withFileTypes: true })) {
        const child = path.posix.join(rel, e.name);
        if (e.isDirectory()) walk(child);
        else if (/\.tsx?$/.test(e.name)) owned.push(child);
      }
    };
    walk('components/demo');
    walk('app/(app)/demo');

    const offenders: string[] = [];
    for (const rel of owned) {
      // Comments may describe the machinery the demo stays away from; code may
      // not reach it.
      const code = read(rel)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const [re, what] of FORBIDDEN) {
        if (re.test(code)) offenders.push(`${rel} reaches ${what}`);
      }
    }

    expect(owned.length, 'the demo files were not found — this test would pass on an empty list').toBeGreaterThan(4);
    expect(offenders, `the demo must have no path to the trust chain:\n${offenders.join('\n')}`).toEqual([]);
  });
});

test.describe('every demo screen says what it is', () => {
  for (const stage of STAGES) {
    test(`/demo/${stage} is marked, unsigned, and invites once`, async ({ page }) => {
      await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByTestId('demo-notice')).toContainText('Demo project');
      await expect(page.getByTestId('demo-notice')).toContainText('Nothing you do here is saved');
      await expect(page.getByTestId('demo-unsigned')).toContainText('never signed');

      // The title is never mistakable for a project of the reader's own.
      await expect(page.locator('[data-stage-title]')).toContainText(DEMO_TITLE_PREFIX.trim());

      // `DESIGN.md` §6.1.2: at most one invitation per screen, and never
      // blocking — a link the reader can ignore, not something to dismiss.
      const invitation = page.locator('[data-demo-invitation]');
      await expect(invitation).toHaveCount(1);
      expect(await invitation.evaluate((el) => el.tagName)).toBe('A');
      await expect(invitation).toHaveAttribute('href', '/dashboard');

      // The stage actually rendered its own content, so the marking above is not
      // marking an empty page.
      await expect(page.getByTestId(`demo-stage-${stage}`)).toBeVisible();
    });
  }

  test('the delivery stage offers no pack, no export and no signature', async ({ page }) => {
    await page.goto('/demo/delivery', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('demo-no-pack')).toContainText('no download here');

    const stage = page.getByTestId('demo-stage-delivery');
    await expect(stage.locator('a, button').filter({ hasText: /download|audit pack|export|sign off|signature/i })).toHaveCount(0);
    await expect(stage.locator('a[download]')).toHaveCount(0);
  });
});

test.describe('the demo is operable, and its state never leaves the browser', () => {
  test('a value survives a reload and "Reset demo" throws it away', async ({ page }) => {
    // The demo's own state is the reader's assumptions and decisions; Analyze
    // is the real object page now and keeps nothing of its own.
    await openStage(page, 'tco');
    await fillEconomics(page, '[data-testid="demo-dev-rate"]', '900');
    const stored = () => page.evaluate((key) => window.localStorage.getItem(key), DEMO_STORAGE_KEY);
    // It lives in this browser — and only there.
    await expect.poll(stored, { message: 'the demo did not keep its state in the browser' }).toContain('"devRate":900');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    expect(await stored()).toContain('"devRate":900');

    await page.getByTestId('demo-reset').click();
    await expect.poll(stored).not.toContain('"devRate":900');
  });

  test('Analyze is the object page of a real run, fed by the engine', async ({ page }) => {
    const demo = buildDemoProject();
    await openStage(page, 'analyze');
    const head = page.locator('[data-analysis-answer]');
    await expect(head).toBeVisible();
    // The finding count of a real run of the same example: one per pattern and object.
    await expect(head.locator('h2')).toContainText(`${demo.analyze.distinctFindings} findings to review in this code`);
    await expect(page.locator('[data-analysis-facet="Findings"]')).toContainText(String(demo.analyze.distinctFindings));
    // The score, computed, with Clean-Core.io's band.
    const band = scoreBand(demo.analyze.cleanCoreScore);
    const scoreFacet = page.locator('[data-analysis-facet="Clean Core Score"]');
    await expect(scoreFacet).toContainText(`${demo.analyze.cleanCoreScore} of 100`);
    await expect(scoreFacet).toContainText(band.label);
    await expect(page.locator(`[data-score-band="${band.key}"][data-score-band-current="true"]`)).toBeVisible();
    await expect(page.locator('[data-score-breakdown="shown"]')).toBeVisible();
    // The levels were looked up on the server — a demo never waits on the catalog.
    await expect(page.locator('[data-analysis-facet="Level distribution"] [data-level-bar]')).toBeVisible();
    // The model's part is said to be missing, not filled in.
    await expect(page.getByTestId('demo-stage-analyze')).toContainText('The demo stops where the model begins.');
    await expect(page.locator('[data-analysis-status]')).toContainText('demo, never signed');

    // Where in the program: a dot opens the source at its line.
    const first = demo.analyze.findings.find((f) => f.severity === 'Critical') ?? demo.analyze.findings[0];
    await page.locator(`[data-program-map-dot="${first.lineStart}"]`).first().click();
    const panel = page.locator('[data-analyze-source-panel]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(demo.sourceFile);

    // The worklist a run stores — one item per finding — is still built, but
    // Analyze no longer draws it (owner decision 02.10.2026): the findings
    // list above is that same list, at its lines.
    expect(demo.analyze.worklist).toHaveLength(demo.analyze.distinctFindings);
    await expect(page.locator('[data-worklist-status]')).toHaveCount(0);
    await expect(page.locator('[data-analysis-not-determined]')).toHaveCount(1);
  });

  test('Economics shows no output until the assumptions are the reader’s', async ({ page }) => {
    await openStage(page, 'tco');
    await expect(page.getByTestId('demo-forecast-refused')).toContainText('developer day rate');
    await expect(page.getByTestId('demo-forecast')).toHaveCount(0);

    await fillEconomics(page, '[data-testid="demo-dev-rate"]', '900');
    await fillEconomics(page, '[data-testid="demo-user-rate"]', '600');
    await fillEconomics(page, '[data-testid="demo-investment"]', '40000');

    await expect(page.getByTestId('demo-forecast')).toBeVisible();
    await expect(page.getByTestId('demo-forecast-refused')).toHaveCount(0);
  });
});

test.describe('the demo costs an account nothing', () => {
  const EMAIL = `demo-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'DemoProject123!';

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Demo',
      lastName: 'Reader',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
  });

  test('an account finds it in the workspace, walks it, and still owns no project', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForURL('**/dashboard', { timeout: 60000 });

    // "My workspace" is the 3.0 list for every account (roadmap 3.0.1): the
    // demo is its first row, and it opens the demo workspace with its tour.
    const demoRow = page.locator('[data-workspace-open="demo"]').first();
    await expect(demoRow).toContainText(DEMO_TITLE_PREFIX.trim(), { timeout: 60000 });
    await expect(page.getByText('No projects yet')).toBeVisible();

    await demoRow.click();
    await page.waitForURL('**/demo/workspace', { timeout: 60000 });
    await expect(page.locator('[data-demo-workspace]')).toBeAttached({ timeout: 90000 });

    for (const stage of STAGES) {
      await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('demo-strip')).toBeVisible();
    }

    // Walking the whole demo created nothing: no project document, so nothing
    // that could be charged, signed or stored per account.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No projects yet')).toBeVisible();
  });
});
