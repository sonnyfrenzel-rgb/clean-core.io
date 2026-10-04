import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { PHASES, workflowSteps, workflowSummary } from '../lib/workflow-steps';
import { workspaceTools } from '../lib/workspace-model';
import type { Project, TestCase } from '../lib/types';
// The current Terms version, not a literal: seeding a stale one makes the
// account fail `requireCurrentTerms` on every protected route, so a version
// bump would break this spec for a reason that has nothing to do with it.
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * One phase model, and every view reads it (roadmap E01-F01, CR-11).
 *
 * Measured before the fix, one project, three views:
 *
 *   stepper    Upload · Analyze · Design · Transformation · Testing · Documentation · Delivery
 *              — no Economics; the TCO page rendered itself as step 1; every step
 *              left of the open page ticked, whatever existed
 *   rail       Testing "done" as soon as test cases were generated
 *   dashboard  `status: 'testing'` (written when tests are *generated*) shown as
 *              "Testing & QA (85%)", plus a downloadable "Quality Engineering
 *              Report" that said every test "compiled and executed successfully"
 *
 * The acceptance for E01-F01-US01 is the rendered test at the bottom of this
 * file: generated, never-executed tests, and dashboard, stepper and delivery all
 * say "Test draft" — none says testing is complete — with Economics as phase 6.
 */
const ROOT = path.resolve(__dirname, '..');
// Comment-stripped, as in unearned-verdicts-guard.spec.ts: the notes left beside
// each fix quote the very strings these assertions say are gone.
const read = (rel: string) =>
  fs
    .readFileSync(path.resolve(ROOT, rel), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stage = (s: string) => `app/(app)/project/[projectId]/${s}/page.tsx`;

const draftTests: TestCase[] = [
  { id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 't2', name: 'Rounding', category: 'Unit', description: 'd', priority: 'Medium' },
];

/** Everything through Documentation on record; tests generated, never run. */
const acceptanceProject = (over: Partial<Project> = {}): Project => ({
  name: 'Acceptance',
  legacyCode: 'REPORT z_x.\n',
  activeRunId: 'run-1',
  cleanCoreScore: 62,
  solutionDesign: '{"architectureOverview":{}}',
  approvedByArchitect: true,
  approvedBy: 'architect@example.com',
  generatedCode: 'export const ok = true;\n',
  documentation: '{"l1":{}}',
  testCases: draftTests,
  ...over,
});

const byKey = (p: Project | null) => Object.fromEntries(workflowSteps(p).map((s) => [s.key, s]));

test.describe('the contract', () => {
  test('seven phases in the roadmap order; Upload is part of Analyze, Economics is sixth', () => {
    expect(PHASES.map((p) => p.key)).toEqual([
      'analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery',
    ]);
    expect(PHASES.find((p) => p.key === 'tco')).toMatchObject({ n: 6, label: 'Economics' });
    expect(PHASES.map((p) => p.label)).not.toContain('Upload');
    expect(workflowSteps(null)).toHaveLength(7);
  });

  test('generated tests that never ran are a draft, and delivery is not ready on them', () => {
    const s = byKey(acceptanceProject());
    expect(s.testing.state).toBe('partial');
    expect(s.testing.badge).toBe('Test draft');
    expect(s.testing.detail).toContain('no test run on record');
    expect(s.delivery.state).toBe('partial');
    expect(s.delivery.detail).toContain('tests not run');
    expect(workflowSummary(workflowSteps(acceptanceProject())).next.key).toBe('testing');
  });

  test('a simulation is not a pass, not even beside real passes', () => {
    const sim = byKey(acceptanceProject({ testCases: draftTests.map((t) => ({ ...t, status: 'Simulated' as const })) }));
    expect(sim.testing.state).toBe('partial');
    expect(sim.testing.detail).toMatch(/simulated — a simulation is not a test run/);

    // The delivery page's old condition — passed > 0, no failures, no missing
    // verdicts — went green on exactly this.
    const mixed = byKey(acceptanceProject({
      testCases: [{ ...draftTests[0], status: 'Passed' }, { ...draftTests[1], status: 'Simulated' }],
    }));
    expect(mixed.testing.state).toBe('partial');
    expect(mixed.delivery.done).toBe(false);
  });

  test('every case passed is the only way Testing is done', () => {
    const s = byKey(acceptanceProject({ testCases: draftTests.map((t) => ({ ...t, status: 'Passed' as const })) }));
    expect(s.testing.state).toBe('done');
    expect(s.delivery.state).toBe('done');
  });

  test('`status` is not read: a client-written label moves nothing', () => {
    const s = byKey({ name: 'Label only', status: 'completed' } as Project);
    expect(Object.values(s).every((p) => p.state === 'empty')).toBe(true);
  });

  test('a design nobody confirmed is not a finished phase', () => {
    const s = byKey(acceptanceProject({ approvedByArchitect: false }));
    expect(s.design.state).toBe('partial');
    expect(s.design.badge).toBe('Awaiting sign-off');
  });

  test('Economics is visible and never claims to be done without stored figures', () => {
    expect(byKey(acceptanceProject()).tco).toMatchObject({ state: 'partial', badge: 'Model estimate' });
    expect(byKey({ name: 'No run', legacyCode: 'REPORT z.' } as Project).tco.state).toBe('empty');
    // And "continue" does not park the reader there for good.
    const allElse = acceptanceProject({ testCases: draftTests.map((t) => ({ ...t, status: 'Passed' as const })) });
    expect(workflowSummary(workflowSteps(allElse)).next.key).toBe('delivery');
  });

  test('a staged source without a run is partial, not done', () => {
    const s = byKey({ name: 'Staged', legacyCode: 'REPORT z.' } as Project);
    expect(s.analyze.state).toBe('partial');
    expect(s.analyze.badge).toBe('Source staged');
  });
});

test.describe('every view reads the contract', () => {
  const PAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

  test('no stepper is driven by position any more', () => {
    // The seven-circle stepper itself went with roadmap 3.0.1 (ADR-061); the
    // tools bar reads `workflowSteps` and nothing positional.
    expect(fs.existsSync(path.resolve(process.cwd(), 'components/Stepper.tsx')), 'the old stepper came back').toBe(false);
    const bar = read('components/workspace/ToolBar.tsx');
    expect(bar).not.toMatch(/currentStep|stepNum/);
    expect(bar).not.toContain("name: 'Upload'");
    for (const p of PAGES) {
      expect(read(stage(p)), `${p} still passes a step number`).not.toContain('currentStep=');
    }
  });

  test('every stage header carries the tools bar — in the loaded page, not only the loading state', () => {
    // Four pages once rendered the rail in their early `loading` return and
    // nowhere else, so it disappeared as soon as there was something to
    // report. The stepper and the rail went with roadmap 3.0.1 (ADR-061); the
    // way across and its marks are the tools bar under every stage header now
    // (ADR-060), so every return of every stage hands its header the phases.
    for (const p of PAGES) {
      const src = read(stage(p));
      expect(src, `${p} draws a stepper of its own`).not.toMatch(/<Stepper\s|<VerificationRail\s|<StageProgress\s/);
      const headers = (src.match(/<StageHeader\s/g) || []).length;
      const withTools = (src.match(/<StageHeader[^>]*?\btools=\{\{\s*steps:\s*phases/g) || []).length;
      expect(headers, `${p} renders no stage header`).toBeGreaterThan(0);
      expect(withTools, `${p}: ${withTools} of ${headers} header(s) carry the tools bar`).toBe(headers);
    }
  });

  test('the TCO page is phase 6, not a borrowed step 1', () => {
    const src = read(stage('tco'));
    // The tools bar under its header names it (the stepper's `current="tco"`
    // went with roadmap 3.0.1).
    expect(src).toContain("tools={{ steps: phases, current: 'tco' }}");
    expect(src).not.toMatch(/currentStep=\{1\}/);
  });

  test('the way across follows the canonical order, and no stage keeps a forward button of its own', () => {
    // The forward buttons ("Proceed to …") were the linear flow of accounts
    // without the workspace; they went with roadmap 3.0.1 (ADR-061). The order
    // they held is the tools bar's now, taken from the phase contract.
    expect(workspaceTools(null).map((t) => t.key)).toEqual(PHASES.map((p) => p.key));
    for (const p of PAGES) {
      expect(read(stage(p)), `${p} still hands a forward path to its footer`).not.toContain('proceedPath=');
    }
  });

  test('the dashboard derives progress from artefacts, not from `status`', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).not.toContain('getStatusInfo');
    expect(src).not.toMatch(/project\.status\s*===/);
    expect(src).not.toContain('Testing & QA (85%)');
    expect(src).toContain('workflowSteps(project)');
  });

  test('the dashboard no longer writes a test report for a run that never happened', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    // The template that printed the claim; the comment quoting it is allowed.
    expect(src).not.toContain('successfully in the ${');
    expect(src).not.toContain('Verified via ${');
    expect(src).not.toContain("'6. Quality Engineering Report'");
  });

  test('delivery does not open with "the lifecycle is complete"', () => {
    const src = read(stage('delivery'));
    expect(src).not.toContain('The transformation lifecycle is complete');
    expect(src).not.toContain('All artefacts present');
    // Readiness comes from the phase contract: the page hands the phases to
    // the handover facets (proposal A), and those read the delivery phase.
    expect(src).toContain('handoverFacets(hp, phases, chain, handoverState)');
    const handover = read('lib/handover.ts');
    expect(handover).toContain("const delivery = phase('delivery');");
    expect(handover).toContain('delivery.done');
  });
});

test.describe('dashboard, stepper and delivery agree on a test draft', () => {
  const EMAIL = `phases-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'PhaseGuard123!';
  const PROJECT_ID = `phases-${Date.now()}`;
  const RUN_ID = `phases-run-${Date.now()}`;

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Phase', lastName: 'Guard', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION,
      createdAt: new Date(),
    });

    // `status: 'completed'` on purpose: the old dashboard would have shown this
    // as "Completed (100%)". Nothing in the contract reads it.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Phase guard fixture',
      userId: uid,
      createdAt: new Date(),
      status: 'completed',
      legacyCode: 'REPORT z_phase.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      approvedByArchitect: true,
      approvedBy: EMAIL,
      generatedCode: 'export const ok = true;\n',
      testCases: draftTests,
      documentation: '# Blueprint\n\nLevel 1.\n',
      activeRunId: RUN_ID,
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('none of the three calls a generated suite tested', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await signInViaLanding(page, EMAIL, PASSWORD);

    // Dashboard. The stop-then-commit dance is starter-examples.spec.ts's: an
    // in-flight RSC stream from the sign-in redirect can otherwise hold the next
    // navigation.
    await page.evaluate(() => window.stop()).catch(() => {});
    try {
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    } catch {
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(1000);
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    }
    const row = page.locator('[data-project-progress]').first();
    await row.waitFor({ timeout: 60000 });
    // The row no longer draws the seven steps (owner feedback 02.10.2026): it
    // names the step it is at and the next action, from the same contract. A
    // test draft is step 5 with "Run the tests" still to do — never done.
    await expect(row.locator('[data-project-sentence]')).toHaveText('Analysed — in progress.');
    await expect(row.locator('[data-project-step]')).toHaveText('Step 5 of 7');
    await expect(row.locator('[data-project-next]')).toHaveText('Next: Run the tests');
    await expect(row).not.toContainText('Completed');
    await expect(row).not.toContainText('100%');

    // The tools bar, on a stage page (it replaced the stepper, roadmap 3.0.1) —
    // and Economics is the sixth tool. A test draft is started, never done:
    // `partial` in the phase state; the bar marks it "started", a half circle,
    // never the check (ADR-060 as amended 03.10.2026: a check means done).
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    const bar = page.locator('[data-stage-tools="open"]');
    await bar.waitFor({ timeout: 30000 });
    const tools = bar.locator('a[data-workspace-tool]');
    await expect(tools).toHaveCount(7);
    await expect(tools.nth(5)).toHaveAttribute('data-workspace-tool', 'tco');
    const toolTesting = bar.locator('a[data-workspace-tool="testing"]');
    // The bar stands before the project is read (every phase empty); wait for the reading.
    await expect(toolTesting).toHaveAttribute('data-phase-state', 'partial', { timeout: 60000 });
    await expect(toolTesting).toHaveAttribute('data-workspace-tool-mark-meaning', 'started');
    await expect(toolTesting).toHaveAttribute('data-workspace-tool-mark-kind', 'half');
    await expect(toolTesting, 'the bar calls a test draft proven').not.toHaveAccessibleName(/prove|proof|verif/i);

    // Delivery
    await page.goto(`/project/${PROJECT_ID}/delivery`, { waitUntil: 'domcontentloaded' });
    // The nine links sit one level deeper, behind "Link by link" (proposal A).
    await page.locator('[data-chain-detail] [data-cc-disclosure-trigger]').click({ timeout: 30000 });
    const deliveryTesting = page.locator('[data-delivery-testing]');
    await deliveryTesting.waitFor({ timeout: 30000 });
    await expect(deliveryTesting).toContainText('Test draft');
    const body = page.locator('body');
    await expect(body).not.toContainText('lifecycle is complete');
    await expect(body).not.toContainText('Ready to hand over');
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="testing"]'))
      .toHaveAttribute('data-phase-state', 'partial', { timeout: 60000 });

    // Economics shows itself as the current tool on its own page.
    await page.goto(`/project/${PROJECT_ID}/tco`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="tco"]'))
      .toHaveAttribute('aria-current', 'page', { timeout: 30000 });
  });
});
