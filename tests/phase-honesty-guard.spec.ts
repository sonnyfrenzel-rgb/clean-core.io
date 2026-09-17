import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import firebaseConfig from '../firebase-config.json';
import { PHASE_TONE_CLASS, phaseTone, workflowSteps, type RailStep } from '../lib/workflow-steps';
import type { Project, TestCase } from '../lib/types';

/**
 * Roadmap 1.7 — the stepper and the rail mean the same thing by "done", and
 * green is reserved for what something verified.
 *
 * Measured on one project before the fix, with the reader standing on Economics:
 *
 *   phase           stepper circle                     rail dot
 *   analyze         green  (done)                      green  (done)
 *   design          green  (done, signed off)          green  (done)
 *   transformation  green  (done, generated code)      green  (done)
 *   documentation   green  (done, generated blueprint) green  (done)
 *   testing         green  (done, all passed)          green  (done)
 *   tco             amber  (partial) + green ring      GREEN  — because it was the open page
 *   delivery        green  (done)                      green  (done)
 *
 * Two separate dishonesties in one row. The rail painted the phase the reader
 * was *on* green before it asked anything else, so Economics — a phase nothing
 * in this release can finish — was the greenest thing on the screen while the
 * stepper two hundred pixels above showed it amber. And five of the seven greens
 * stood for work nothing had checked: a design the account signed off on itself,
 * code the model wrote and nobody compiled, a blueprint nobody read back.
 *
 * The one rule is `phaseTone` in `lib/workflow-steps.ts`, and the stepper, the
 * rail and the dashboard row all read it. Green ⇔ `RailStep.proven`: a signed
 * run, an executed passing verdict, or a handover gated on one.
 *
 * The rendered half is the half that matters (the idiom of
 * `tests/workflow-style-guard.spec.ts`): a source guard is satisfied by a
 * constant, computed colour is not. So the comparisons below read
 * `getComputedStyle` off both surfaces, on every one of the seven stage pages,
 * and ask three things a constant cannot answer — do the two surfaces paint the
 * same phase the same, does the colour stay put when the reader moves, and is
 * the colour of verified work different from the colour of work nothing checked.
 */

const draft: TestCase[] = [
  { id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 't2', name: 'Rounding', category: 'Unit', description: 'd', priority: 'Medium' },
];

const SUITE = { code: "import { test } from 'node:test';\ntest('t1', () => {});\n" };

const project = (over: Partial<Project> = {}): Project => ({
  name: 'Honesty',
  legacyCode: 'REPORT z_x.\n',
  activeRunId: 'run-1',
  cleanCoreScore: 62,
  solutionDesign: '{"architectureOverview":{}}',
  approvedByArchitect: true,
  approvedBy: 'architect@example.com',
  generatedCode: 'export const ok = true;\n',
  documentation: '{"l1":{}}',
  testCases: draft,
  testSuite: SUITE,
  ...over,
});

/**
 * The same project after the suite actually ran: every case passed **and** the
 * server wrote the receipt that says so.
 *
 * Both halves are needed since the QA full review of a19945ef01dc. `Passed`
 * strings on `testCases` are in the client allowlist of `firestore.rules` and
 * nothing in the product writes them, so they are a self-report; the receipt is
 * `/api/run-tests`'s own record, bound to the run and to the digests of the
 * code, the suite and the case list.
 */
const ran = (over: Partial<Project> = {}): Project => {
  const withPasses = project({ ...over, testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })) });
  return { ...withPasses, testRunReceipt: receiptFor(withPasses) };
};

const byKey = (p: Project | null) => Object.fromEntries(workflowSteps(p).map((s) => [s.key, s])) as Record<string, RailStep>;

test.describe('what green is allowed to mean', () => {
  test('a signed run and an executed pass are proven; everything a model wrote is not', () => {
    const s = byKey(ran());

    // Proven — server-written, or the result of an execution.
    expect(s.analyze).toMatchObject({ state: 'done', proven: true });
    expect(s.testing).toMatchObject({ state: 'done', proven: true });
    expect(s.delivery).toMatchObject({ state: 'done', proven: true });

    // Done, and nothing checked it. All three keep their tick and lose their green.
    for (const key of ['design', 'transformation', 'documentation']) {
      expect(s[key].done, `${key} should still be done`).toBe(true);
      expect(s[key].proven, `${key} claims to be proven`).toBe(false);
      expect(phaseTone(s[key]), `${key} is painted as if something checked it`).toBe('unproven');
    }
  });

  test('generated tests that never ran leave Testing and Delivery unproven', () => {
    const s = byKey(project());
    expect(s.testing).toMatchObject({ state: 'partial', proven: false });
    expect(s.delivery).toMatchObject({ state: 'partial', proven: false });
    expect(phaseTone(s.testing)).toBe('unproven');
  });

  test('a simulation never earns green, not even beside real passes', () => {
    const s = byKey(project({
      testCases: [{ ...draft[0], status: 'Passed' }, { ...draft[1], status: 'Simulated' }],
    }));
    expect(s.testing.proven).toBe(false);
    expect(s.delivery.proven).toBe(false);
  });

  test('Economics can never be proven in this release, and an empty phase is not amber', () => {
    expect(phaseTone(byKey(project()).tco)).toBe('unproven');
    const nothing = byKey({ name: 'Empty' } as Project);
    expect(nothing.analyze).toMatchObject({ state: 'empty', proven: false });
    expect(phaseTone(nothing.analyze)).toBe('none');
  });

  test('stale takes the green away, whatever the artefact contains', () => {
    const stale = { ...byKey(project()).analyze, state: 'stale' as const, proven: true };
    expect(phaseTone(stale)).toBe('stale');
  });

  test('a row of Passed strings nobody executed is done, and never green', () => {
    // QA24-A17 — a fingerprint without a confirmation is not a green status.
    // `firestore.rules` lets the owner write `testCases`, and this is what that
    // write used to buy: Testing green, Delivery "Ready", and the sentence "a
    // passing test run is on record" under both.
    const selfReported = project({ testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })) });
    const s = byKey(selfReported);
    expect(s.testing).toMatchObject({ state: 'done', proven: false, badge: 'Self-reported' });
    expect(s.delivery).toMatchObject({ state: 'done', proven: false });
    expect(phaseTone(s.testing)).toBe('unproven');
    expect(phaseTone(s.delivery)).toBe('unproven');
    expect(s.delivery.detail).not.toContain('a passing test run');

    // And the receipt is what changes it — the same project, with the server's
    // record of the run that produced those verdicts.
    const executed = byKey({ ...selfReported, testRunReceipt: receiptFor(selfReported) });
    expect(executed.testing).toMatchObject({ state: 'done', proven: true });
    expect(executed.delivery).toMatchObject({ state: 'done', proven: true });
  });

  test('a receipt for other code, another run or another suite does not count', () => {
    const base = project({ testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })) });
    const good = receiptFor(base);
    expect(byKey({ ...base, testRunReceipt: good }).testing.proven).toBe(true);

    // The code was rewritten after the run…
    expect(byKey({ ...base, generatedCode: 'export const ok = false;\n', testRunReceipt: good }).testing.proven).toBe(false);
    // …the suite was regenerated…
    expect(byKey({ ...base, testSuite: { code: 'other' }, testRunReceipt: good }).testing.proven).toBe(false);
    // …a case was added…
    expect(
      byKey({ ...base, testCases: [...base.testCases!, { id: 't3', name: 'New', category: 'Unit', description: 'd', priority: 'Low' as const }], testRunReceipt: good })
        .testing.proven,
    ).toBe(false);
    // …a new analysis run replaced the one it was taken under…
    expect(byKey({ ...base, activeRunId: 'run-2', testRunReceipt: good }).testing.proven).toBe(false);
    // …and one case the runner never reported on is not a pass.
    expect(byKey({ ...base, testRunReceipt: receiptFor(base, [{ id: 't1', status: 'Passed' }]) }).testing.proven).toBe(false);
  });

  test('`proven` cannot be true without `done`, on any project the contract can produce', () => {
    const shapes: Project[] = [
      project(),
      project({ approvedByArchitect: false }),
      project({ testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })) }),
      ran(),
      project({ testCases: [] }),
      project({ generatedCode: '', documentation: '' }),
      { name: 'Empty' } as Project,
    ];
    for (const p of shapes) {
      for (const step of workflowSteps(p)) {
        if (step.proven) expect(step.done, `${step.key} is proven but not done`).toBe(true);
        expect(phaseTone(step) === 'proven', `${step.key} tone and proven disagree`).toBe(step.proven);
      }
    }
  });

  test('green belongs to one tone and to no other', () => {
    expect(PHASE_TONE_CLASS.proven.border).toContain('green');
    for (const tone of ['unproven', 'stale', 'none'] as const) {
      expect(JSON.stringify(PHASE_TONE_CLASS[tone]), `${tone} reaches for green`).not.toContain('green');
    }
  });
});

// ── The two surfaces, measured on the screen ──────────────────────────────────
test.describe('the stepper and the rail say the same thing about the same phase', () => {
  const EMAIL = `honesty-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'PhaseHonesty123!';
  const PROJECT_ID = `honesty-${Date.now()}`;
  const RUN_ID = `honesty-run-${Date.now()}`;

  // All seven, and populated enough that none of them renders an empty state:
  // an empty stage has no stepper to compare.
  const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

  // What the fixture below is, phase by phase — asserted rather than assumed.
  const PROVEN = ['analyze', 'testing', 'delivery'];
  const UNPROVEN = ['design', 'transformation', 'documentation', 'tco'];

  test.beforeAll(async () => {
    // The first seed call of a run compiles `/api/test/seed`; 30 s is not enough
    // for that on a cold dev server, and a hook that times out reads like a
    // broken fixture.
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Phase', lastName: 'Honesty', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // A deliberate mix: a signed run and a passing suite (proven), a signed-off
    // design and generated code and a generated blueprint (done, unproven), and
    // Economics (partial). If every phase looked the same the comparison below
    // would be vacuous.
    // The executed half of the fixture: passing verdicts *and* the receipt
    // `/api/run-tests` writes beside them. Without the receipt Testing is
    // `Self-reported` and the PROVEN list below would be wrong.
    const executed = {
      activeRunId: RUN_ID,
      generatedCode: 'export const ok = true;\n',
      testSuite: SUITE,
      testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    };

    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Phase honesty fixture',
      userId: uid,
      createdAt: new Date(),
      status: 'completed',
      legacyCode: 'REPORT z_honesty.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      approvedByArchitect: true,
      approvedBy: EMAIL,
      documentation: '# Blueprint\n\nLevel 1.\n',
      ...executed,
      testRunReceipt: receiptFor(executed),
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('same colour, same tick, on every page — and the reader\'s position changes neither', async ({ page }) => {
    test.setTimeout(240 * 1000);
    // Wide enough for the rail: it is `hidden 2xl:flex`, and 2xl is 1536px.
    await page.setViewportSize({ width: 1680, height: 1000 });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    type Mark = { colour: string; tone: string | null; tick: boolean };
    const seen: Record<string, { stepper: Mark; rail: Mark }[]> = {};

    for (const stage of STAGES) {
      await page.goto(`/project/${PROJECT_ID}/${stage}`, { waitUntil: 'domcontentloaded' });
      const stepper = page.locator('nav[aria-label="Workflow phases"]');
      const rail = page.locator('nav[aria-label="Workflow progress"]');
      await stepper.waitFor({ timeout: 45000 });
      await rail.waitFor({ timeout: 45000 });
      // The loaded state, not the loading one: the fixture's Testing is done.
      await expect(stepper.locator('[data-phase="testing"]')).toHaveAttribute('data-phase-state', 'done', { timeout: 45000 });

      // No window to race: the circles carry `transition-all duration-300`, and a
      // read taken mid-transition would pass or fail by how fast the machine is.
      // Killing transitions outright is deterministic; waiting a beat is not.
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });

      const readMark = async (selector: string): Promise<Mark> => {
        const el = page.locator(selector).first();
        const colour = await el.evaluate((node) => {
          const s = getComputedStyle(node);
          return [s.borderTopColor, s.backgroundColor].join(' | ');
        });
        const tone = await el.getAttribute('data-phase-tone');
        const tick = (await el.locator('svg').count()) > 0;
        return { colour, tone, tick };
      };

      for (const p of [...PROVEN, ...UNPROVEN]) {
        if (!seen[p]) seen[p] = [];
        seen[p].push({
          stepper: await readMark(`nav[aria-label="Workflow phases"] [data-phase="${p}"]`),
          rail: await readMark(`nav[aria-label="Workflow progress"] [data-rail-phase="${p}"]`),
        });
      }
    }

    // 1. The two surfaces, on the same page, about the same phase.
    const disagreements: string[] = [];
    for (const [key, rows] of Object.entries(seen)) {
      rows.forEach((row, i) => {
        if (row.stepper.colour !== row.rail.colour) {
          disagreements.push(`${STAGES[i]} page · ${key}: stepper ${row.stepper.colour} vs rail ${row.rail.colour}`);
        }
        if (row.stepper.tick !== row.rail.tick) {
          disagreements.push(`${STAGES[i]} page · ${key}: stepper tick ${row.stepper.tick} vs rail tick ${row.rail.tick}`);
        }
        if (row.stepper.tone !== row.rail.tone) {
          disagreements.push(`${STAGES[i]} page · ${key}: stepper tone ${row.stepper.tone} vs rail tone ${row.rail.tone}`);
        }
      });
    }
    expect(disagreements, `the stepper and the rail disagree:\n${disagreements.join('\n')}`).toEqual([]);

    // 2. Position is not evidence: the same phase looks the same from all seven pages.
    const moved: string[] = [];
    for (const [key, rows] of Object.entries(seen)) {
      for (const surface of ['stepper', 'rail'] as const) {
        const distinct = [...new Set(rows.map((r) => r[surface].colour))];
        if (distinct.length !== 1) {
          moved.push(`${surface} · ${key} changes colour with the open page: ${distinct.join('  /  ')}`);
        }
      }
    }
    expect(moved, `colour follows the reader instead of the evidence:\n${moved.join('\n')}`).toEqual([]);

    // 3. Green means proven. Verified work and unverified work are not the same
    //    colour, and a `done` phase nothing checked is painted like a `partial`
    //    one — because that is what it is.
    const colourOf = (key: string) => seen[key][0].stepper.colour;
    for (const key of PROVEN) expect(seen[key][0].stepper.tone, `${key} should be proven`).toBe('proven');
    for (const key of UNPROVEN) expect(seen[key][0].stepper.tone, `${key} should not be proven`).toBe('unproven');

    expect([...new Set(PROVEN.map(colourOf))], 'the proven phases are not one colour').toHaveLength(1);
    expect([...new Set(UNPROVEN.map(colourOf))], 'the unproven phases are not one colour').toHaveLength(1);
    expect(
      colourOf('transformation'),
      `generated code is painted like a signed run: ${colourOf('transformation')}`,
    ).not.toBe(colourOf('analyze'));
    // Economics is `partial`, Transformation is `done` — and neither was checked.
    expect(colourOf('transformation')).toBe(colourOf('tco'));

    // 4. Done is done in both: the tick is on exactly the phases the contract calls done.
    for (const key of [...PROVEN, ...UNPROVEN]) {
      expect(seen[key][0].stepper.tick, `${key}: stepper tick`).toBe(key !== 'tco');
      expect(seen[key][0].rail.tick, `${key}: rail tick`).toBe(key !== 'tco');
    }
  });
});
