import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import firebaseConfig from '../firebase-config.json';
import * as workspaceModel from '../lib/workspace-model';
import {
  DEFAULT_VIEW,
  META_ABSENT,
  STATUS_FACETS,
  VIEW_ABOUT,
  VIEW_QUESTIONS,
  WORKSPACE_VIEWS,
  metaLine,
  notDetermined,
  statusOfPhase,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
  viewFromParam,
} from '../lib/workspace-model';
import { objectStatus } from '../lib/object-status';
import { phaseTone, workflowSteps, type RailStep } from '../lib/workflow-steps';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { sha256Hex } from '../lib/artefact-digest';
import type { Project, TestCase } from '../lib/types';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Roadmap 1.4 — the workspace shell, and the two promises it makes.
 *
 * **One: every account has it, and nobody has somebody else's.** Until roadmap
 * 3.0.1 the shell was an administrator's preview behind a switch; since then
 * (ADR-061) every signed-in account opens its projects in it, and there is no
 * switch left to read. What stays closed is what was always closed: a
 * signed-out visitor gets the 404, and a project that is not the reader's is a
 * 404 too — the Firestore rules decide, not the page. It is checked from the
 * browser rather than from the source, because a gate that is right in a
 * component and wrong in a route is still a leak.
 *
 * **Two: every chip is honest.** The row asks for it in as many words —
 * *seven status chips — each one honest, "not started" as long as nothing is
 * there*. A tick, a colour or a percentage for a phase nobody ran is the defect
 * this phase exists to remove. So the check below opens a genuinely empty
 * project as an ordinary community account and reads what the browser
 * **painted**: seven statuses, all "not started", and no green anywhere. A
 * source guard would be satisfied by a constant; computed colour is not.
 *
 * The third thing it holds is the link back to roadmap 1.7: green means proven,
 * and this screen does not get its own ladder. `statusOfPhase` is the only
 * bridge from `workflowSteps()` to the object-status vocabulary, and the test
 * below drives every project the phase contract can produce through it to show
 * that `success` is reached from `proven` and from nothing else.
 */

/* ------------------------------------------------------------------ fixtures */

const draft: TestCase[] = [
  { id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 't2', name: 'Rounding', category: 'Unit', description: 'd', priority: 'Medium' },
];

const SUITE = { code: "import { test } from 'node:test';\ntest('t1', () => {});\n" };

/**
 * A project where every phase that can have something on it has something on it
 * — including an executed suite, which since the QA full review of a19945ef01dc
 * means passing verdicts **and** the receipt `/api/run-tests` writes beside
 * them. `testCases[].status` alone is a self-report, and Execution reads
 * `draft`, not `done`, on one.
 */
const populated = (over: Partial<Project> = {}): Project => {
  const base: Project = {
    name: 'Shell fixture',
    legacyCode: 'REPORT z_x.\nCALL FUNCTION \'Z_LOCAL\'.\n',
    activeRunId: 'run-1',
    cleanCoreScore: 62,
    solutionDesign: '{"architectureOverview":{}}',
    approvedByArchitect: true,
    approvedBy: 'architect@example.com',
    generatedCode: 'export const ok = true;\n',
    documentation: '{"l1":{}}',
    testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    testSuite: SUITE,
    ...over,
  };
  return { ...base, testRunReceipt: receiptFor(base), ...over };
};

const facetStatus = (project: Project | null) =>
  Object.fromEntries(workspaceStatusLine(project).map((s) => [s.facet, s.status])) as Record<string, string>;

/* ----------------------------------------------------------- no switch left */

test.describe('there is no switch any more (roadmap 3.0.1, ADR-061)', () => {
  const root = path.join(__dirname, '..');
  const exists = (rel: string) => fs.existsSync(path.join(root, rel));

  test('the module, the route and the preview toggle are gone', () => {
    for (const rel of [
      'lib/workspace-shell.ts',
      'app/api/workspace-shell/route.ts',
      'components/workspace/ShellSwitch.tsx',
      // The old no-workspace path: the seven-circle stepper, its rail, the
      // component that drew them, and the "Back to X / Proceed to Y" footer.
      'components/StageProgress.tsx',
      'components/Stepper.tsx',
      'components/VerificationRail.tsx',
      'components/NavigationButtons.tsx',
    ]) {
      expect(exists(rel), `${rel} is still there — the switch was meant to collapse, not linger`).toBe(false);
    }
  });

  test('nothing in the product decides by the old flag — every branch collapsed to the workspace', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
      }
    };
    for (const dir of ['app', 'components', 'lib', 'hooks']) walk(dir);
    files.push('middleware.ts');
    expect(files.length, 'nothing was scanned — the check would be vacuous').toBeGreaterThan(200);

    const offenders = files.filter((rel) =>
      /workspaceShellEnabled|workspaceShellEligible|lib\/workspace-shell'|\bworkspaceShell\??\s*[:=)]|\.workspaceShell\b|StageProgress|NavigationButtons/.test(
        fs.readFileSync(path.join(root, rel), 'utf8'),
      ),
    );
    expect(offenders, `still branching on the old switch:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('the workspace page asks for a signed-in account and nothing else', () => {
    const page = fs.readFileSync(path.join(root, 'app', '(app)', 'project', '[projectId]', 'page.tsx'), 'utf8');
    expect(page).toContain('const enabled = profile != null;');
    expect(page, 'the workspace page reads an admin flag again').not.toMatch(/isAdmin/);
    const demo = fs.readFileSync(path.join(root, 'components', 'demo', 'DemoWorkspaceShell.tsx'), 'utf8');
    expect(demo).toContain('const enabled = profile != null;');
    expect(demo, 'the workspace demo reads an admin flag again').not.toMatch(/isAdmin/);
    for (const rel of ['components/workspace/NewProject.tsx', 'components/workspace/OwnCodeImport.tsx']) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src, `${rel}: "New project" is the list's own action, and the list is every account's`).not.toMatch(/isAdmin/);
    }
  });
});

/* ------------------------------------------------- the seven, and their honesty */

test.describe('the seven statuses', () => {
  test('are the seven of DESIGN.md §2.3, in its order', () => {
    expect(workspaceStatusLine(null).map((s) => s.facet)).toEqual([
      'provenance',
      'need',
      'standard',
      'costs',
      'confirmed',
      'execution',
      'handover',
    ]);
    expect(STATUS_FACETS).toHaveLength(7);
  });

  test('an empty project says "not started" seven times and nothing else', () => {
    for (const empty of [null, { name: 'Fresh' } as Project, { name: 'Fresh', legacyCode: '' } as Project]) {
      const line = workspaceStatusLine(empty);
      expect(
        line.map((s) => `${s.facet}=${s.status}`),
        'a facet claims something on a project with nothing on it',
      ).toEqual(STATUS_FACETS.map((f) => `${f}=not-started`));
    }
  });

  test('every status carries a reason, including the ones that say nothing happened', () => {
    for (const project of [null, populated()]) {
      for (const status of workspaceStatusLine(project)) {
        expect(status.detail.trim().length, `${status.facet} has no reason behind it`).toBeGreaterThan(10);
      }
    }
  });

  test('a populated project moves the five facets that have an artefact behind them', () => {
    const s = facetStatus(populated());

    // A signed run, and the run is server-written — this one is proven.
    expect(s.provenance).toBe('done');
    // A design the account signed off on itself is on record and unverified.
    expect(s.confirmed).toBe('draft');
    // Every generated case carries an executed pass.
    expect(s.execution).toBe('done');
    // No Economics figures are stored on this fixture, so it is not finished.
    expect(s.costs).toBe('partial');
    expect(s.handover).toBe('done');
  });

  test('and leaves the two with no artefact where they were', () => {
    // Need and Standard are not oversights. Rule confirmation arrives with the
    // process model and an evidence level with roadmap 7.2; the routing
    // recommendation sitting on the project is not either of them, and reading
    // it would be the "the standard covers it" claim DESIGN.md §5.3 forbids.
    const s = facetStatus(populated());
    expect(s.need).toBe('not-started');
    expect(s.standard).toBe('not-started');

    const standard = workspaceStatusLine(populated()).find((x) => x.facet === 'standard')!;
    expect(standard.from, 'Standard claims to read a phase').toBeNull();
    expect(standard.detail).toMatch(/evidence level/i);
  });

  test('an imported usage report is half an answer to Need, and says so', () => {
    const withUsage = populated({
      usageReport: { records: [{}, {}], source: 'SUSG' } as unknown as Project['usageReport'],
    });
    const need = workspaceStatusLine(withUsage).find((s) => s.facet === 'need')!;
    expect(need.status).toBe('partial');
    expect(need.provenance).toBe('imported');
    expect(need.detail).toMatch(/no business rule has been confirmed/i);
  });

  test('a simulation is "mock only" and never a partial pass', () => {
    const s = facetStatus(
      populated({ testCases: draft.map((t) => ({ ...t, status: 'Simulated' as const })) }),
    );
    expect(s.execution).toBe('mock-only');
    const execution = workspaceStatusLine(
      populated({ testCases: draft.map((t) => ({ ...t, status: 'Simulated' as const })) }),
    ).find((x) => x.facet === 'execution')!;
    expect(execution.provenance).toBe('demonstrated-mock');
  });

  test('a failing run is failed, not partial', () => {
    const s = facetStatus(
      populated({
        testCases: [
          { ...draft[0], status: 'Passed' as const },
          { ...draft[1], status: 'Failed' as const },
        ],
      }),
    );
    expect(s.execution).toBe('failed');
  });

  test('stale is a provenance chip beside the status, never a status of its own', () => {
    // The source on the project is not the one the signed run analysed.
    const stale = populated({
      legacyCode: 'REPORT z_changed.\n',
      auditMetadata: { inputFingerprint: { sha256: 'a'.repeat(64) } } as Project['auditMetadata'],
    });
    const provenanceFacet = workspaceStatusLine(stale).find((s) => s.facet === 'provenance')!;
    expect(provenanceFacet.status, 'a stale phase is not finished').toBe('partial');
    expect(provenanceFacet.provenance).toBe('stale');
    // And it is never painted as a failure: stale means recompute, not wrong.
    expect(objectStatus(provenanceFacet.status).state).toBe('warning');
  });
});

/* --------------------------------------------------- one ladder, not a second */

test.describe('the shell does not invent a second ladder', () => {
  test('green is reached from `proven` and from nothing else, on every project the contract can produce', () => {
    const variants: Project[] = [];
    for (const activeRunId of [undefined, 'run-1']) {
      for (const legacyCode of [undefined, 'REPORT z.\n']) {
        for (const solutionDesign of [undefined, '{"a":1}']) {
          for (const approvedByArchitect of [undefined, true]) {
            for (const generatedCode of [undefined, 'x']) {
              for (const documentation of [undefined, 'd']) {
                for (const status of [undefined, 'Passed', 'Failed', 'Simulated'] as const) {
                  variants.push({
                    name: 'v',
                    activeRunId,
                    legacyCode,
                    solutionDesign,
                    approvedByArchitect,
                    generatedCode,
                    documentation,
                    testCases: status ? draft.map((t) => ({ ...t, status })) : undefined,
                  } as Project);
                }
              }
            }
          }
        }
      }
    }
    expect(variants.length).toBeGreaterThan(200);

    const breaks: string[] = [];
    for (const project of variants) {
      for (const step of workflowSteps(project)) {
        const green = objectStatus(statusOfPhase(step)).state === 'success';
        const proven = phaseTone(step) === 'proven';
        if (green !== proven) {
          breaks.push(
            `${step.key}: state=${step.state} proven=${step.proven} → status ${statusOfPhase(step)} (green ${green}) vs phaseTone ${phaseTone(step)}`,
          );
        }
      }
    }
    expect(
      [...new Set(breaks)],
      `the status line and the phase contract disagree about what green means:\n${[...new Set(breaks)].join('\n')}`,
    ).toEqual([]);
  });

  test('a done phase nothing checked is a draft, and an empty one is not started', () => {
    const step = (over: Partial<RailStep>): RailStep =>
      ({ n: 1, key: 'design', label: 'Design', path: 'design', state: 'done', done: true, proven: false, badge: '', detail: '', ...over }) as RailStep;

    expect(statusOfPhase(step({ state: 'done', proven: true }))).toBe('done');
    expect(statusOfPhase(step({ state: 'done', proven: false }))).toBe('draft');
    expect(statusOfPhase(step({ state: 'partial', proven: false }))).toBe('partial');
    expect(statusOfPhase(step({ state: 'stale', proven: false }))).toBe('partial');
    expect(statusOfPhase(step({ state: 'empty', proven: false }))).toBe('not-started');
  });

  test('the toolbar takes its seven from the phase contract rather than restating them', () => {
    expect(workspaceTools(null).map((t) => t.key)).toEqual(workflowSteps(null).map((s) => s.key));
    expect(workspaceTools(null)).toHaveLength(7);
  });
});

/* ---------------------------------------------------------- not determined */

test.describe('not determined is shown as a thing', () => {
  test('no source is not the same statement as none', () => {
    const none = notDetermined({ name: 'x' } as Project);
    expect(none.noSource).toBe(true);
    expect(none.count).toBe(0);
  });

  test('a construct the detectors stepped over comes back with its reason and its line', () => {
    const open = notDetermined({
      name: 'x',
      legacyCode: "REPORT z.\nOPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.\n",
    } as Project);
    expect(open.noSource).toBe(false);
    expect(open.count).toBeGreaterThan(0);
    expect(open.items[0].anchor).toMatch(/^L\d+$/);
    expect(open.items[0].why.length, 'an open point with no reason is an apology').toBeGreaterThan(20);
  });

  test('a source with nothing outside the detectors reports zero, not "no source"', () => {
    const clean = notDetermined({ name: 'x', legacyCode: 'REPORT z.\nDATA lv_x TYPE i.\n' } as Project);
    expect(clean.noSource).toBe(false);
    expect(clean.count).toBe(0);
  });
});

/* ------------------------------------------------------------- the meta line */

test.describe('the meta line reads the signed run', () => {
  const manifest = buildInputManifest(
    analysisRunInputs({
      sourceSha256: 'b'.repeat(64),
      deploymentTarget: 'private',
      catalogVersion: 'catalog-9.9',
      rulesetVersion: 'levels/1.3',
      engineVersion: '3.0.0',
      model: null,
    }),
  );

  test('every value comes from the manifest the run signed', () => {
    const entries = metaLine({ name: 'x', inputManifest: manifest } as Project, 'P-0412');
    const by = Object.fromEntries(entries.map((e) => [e.key, e.value]));

    expect(by.project).toBe('P-0412');
    expect(by.manifest).toBe(manifest.hash.slice(0, 8));
    expect(by.revision).toBe(String(manifest.revision));
    expect(by.source).toBe('sha256:bbbbbbbbbbbb');
    expect(by.engine).toBe('3.0.0');
    expect(by.rules).toBe('levels/1.3');
    expect(by.catalog).toBe('catalog-9.9');
  });

  test('a run signed before the manifest existed says so rather than showing a dash', () => {
    const entries = metaLine({ name: 'x' } as Project, 'P-1');
    const absent = entries.filter((e) => e.key !== 'project');
    expect(absent.every((e) => e.value === null), 'a value appeared from nowhere').toBe(true);
    expect(META_ABSENT).toBe('not recorded');
  });

  test('the manifest also arrives through auditMetadata on a bare project document', () => {
    const entries = metaLine(
      { name: 'x', auditMetadata: { inputManifest: manifest } } as Project,
      'P-2',
    );
    expect(entries.find((e) => e.key === 'manifest')!.value).toBe(manifest.hash.slice(0, 8));
  });
});

test.describe('the layer bar', () => {
  test('says what is missing from every empty layer', () => {
    for (const layer of workspaceLayers(null)) {
      expect(layer.count, `${layer.key} has content on an empty project`).toBeNull();
      expect(layer.missing.trim().length, `${layer.key} is empty and does not say why`).toBeGreaterThan(10);
    }
  });

  test('a signed run fills the evidence layer and the costs layer', () => {
    const layers = Object.fromEntries(workspaceLayers(populated()).map((l) => [l.key, l.count]));
    expect(layers.evidence).toBe('1 signed run');
    expect(layers.costs).toBe('not priced yet');
  });
});

test.describe('a view in the URL', () => {
  test('is a perspective, and an unknown one falls back to the view the workspace opens in', () => {
    expect(DEFAULT_VIEW).toBe('business');
    expect(viewFromParam('management')).toBe('management');
    expect(viewFromParam('it')).toBe('it');
    expect(viewFromParam('admin')).toBe('business');
    expect(viewFromParam(null)).toBe('business');
  });

  test('Business leads, IT follows, Management decides — always in that order (ADR-044)', () => {
    expect(WORKSPACE_VIEWS).toEqual(['business', 'it', 'management']);
  });
});

test.describe('there is no IT focus (ADR-058, owner 02.10.2026)', () => {
  // The "Focus: Application · Solution · Enterprise" switch changed nothing on
  // screen — a button that does nothing breaks "a button does what it says".
  // Removed, not hidden: no option list, no parser, no label, no prop.
  test('the model, the page and the message catalogue carry no focus any more', () => {
    for (const name of ['IT_FOCUS_OPTIONS', 'IT_FOCUS_LABELS', 'DEFAULT_IT_FOCUS', 'itFocusFromParam', 'isItFocus']) {
      expect(name in workspaceModel, `lib/workspace-model.ts still exports ${name}`).toBe(false);
    }
    const root = path.join(__dirname, '..');
    const pageSrc = fs.readFileSync(path.join(root, 'app', '(app)', 'project', '[projectId]', 'page.tsx'), 'utf8');
    expect(pageSrc, 'the workspace page still reads ?focus=').not.toMatch(/get\(\s*'focus'\s*\)/);
    const shellSrc = fs.readFileSync(path.join(root, 'components', 'workspace', 'WorkspaceShell.tsx'), 'utf8');
    expect(shellSrc).not.toMatch(/data-workspace-it-focus|onFocusChange|page\.focus/);
    const messages = fs.readFileSync(path.join(root, 'lib', 'messages', 'workspace-shell.ts'), 'utf8');
    expect(messages).not.toContain("'page.focus'");
    expect(VIEW_ABOUT.it, '"About this view" still promises a Focus').not.toMatch(/\bFocus\b/);
  });
});

test.describe('"About this view" (`DESIGN.md` §6.1)', () => {
  test('names one paragraph per view, and none of them is empty or a restatement of the question', () => {
    for (const view of WORKSPACE_VIEWS) {
      expect(VIEW_ABOUT[view].trim().length, `${view} has no "About this view" paragraph`).toBeGreaterThan(60);
      expect(VIEW_ABOUT[view]).not.toBe(VIEW_QUESTIONS[view]);
    }
    // Every paragraph names something it does not show, per DESIGN.md's own
    // wording for the affordance ("what the view shows and what it does not") — a
    // paragraph that only restates what is visible would pass a length check
    // while still failing the one thing this text exists to say.
    for (const view of WORKSPACE_VIEWS) {
      expect(VIEW_ABOUT[view], `${view}'s paragraph never says what it does NOT show`).toMatch(/not show|does not|never/i);
    }
  });
});

/* ------------------------------------------------- the rendered half */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceShell123!';
const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await signInViaLanding(page, email, PASSWORD);
}

/** Either the shell renders or the address is a 404. Nothing in between. */
async function openWorkspace(page: Page, projectId: string, query = ''): Promise<'shell' | '404'> {
  await page.goto(`/project/${projectId}${query}`, { waitUntil: 'domcontentloaded' });
  const shell = page.locator('[data-workspace-shell]');
  const notFound = page.locator('h1:has-text("404")');
  await expect(shell.or(notFound).first()).toBeVisible({ timeout: 60000 });
  return (await shell.count()) > 0 ? 'shell' : '404';
}

test.describe('every account opens its own projects in the workspace — and only its own', () => {
  const COMMUNITY = `${unique('shell-community')}@cleancore-test.io`;
  const STRANGER = `${unique('shell-stranger')}@cleancore-test.io`;
  const PROJECT_ID = unique('shell-own');

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);

    // An ordinary community account: no admin claim, no `isAdmin`, no flag.
    const community = await createUserWithEmailAndPassword(clientAuth, COMMUNITY, PASSWORD);
    await adminSetDoc('users', community.user.uid, {
      firstName: 'Community', lastName: 'Account', email: COMMUNITY,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // A second ordinary account, with no access to the first one's project.
    const stranger = await createUserWithEmailAndPassword(clientAuth, STRANGER, PASSWORD);
    await adminSetDoc('users', stranger.user.uid, {
      firstName: 'Some', lastName: 'Stranger', email: STRANGER,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, {
      name: 'A community project', userId: community.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_own.\n',
    });
  });

  test('a signed-out visitor gets the 404 the address has always been', async ({ page }) => {
    test.setTimeout(120 * 1000);
    expect(await openWorkspace(page, PROJECT_ID)).toBe('404');
  });

  test('a community account opens its project in the workspace, and its stages lead back there', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, COMMUNITY);
    expect(
      await openWorkspace(page, PROJECT_ID),
      'an ordinary account was refused its own workspace',
    ).toBe('shell');
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'business');

    // A stage is a tool of it: the shell path names the project from the
    // stage's own read (D.29) and leads back to the workspace, the stage's own
    // way back does too, and the seven tools stand under it.
    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 60000 });
    const crumb = page.locator('header [data-shell-path] [data-shell-path-project]');
    await expect(crumb).toHaveText('A community project', { timeout: 30000 });
    await expect(crumb).toHaveAttribute('href', `/project/${PROJECT_ID}`);
    await expect(page.locator('header [data-shell-path] [aria-current="page"]')).toHaveText('Analyze');
    await expect(page.locator('[data-stage-back]')).toHaveAttribute('href', `/project/${PROJECT_ID}`);
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool]')).toHaveCount(7);
    await expect(page.locator('nav[aria-label="Workflow phases"]'), 'the old stepper').toHaveCount(0);
    // No project search on a stage, so no search button in the shell.
    await expect(page.locator('header [data-command-search-trigger]')).toHaveCount(0);
  });

  test('another account gets the 404 for a project that is not theirs', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, STRANGER);
    expect(
      await openWorkspace(page, PROJECT_ID),
      "the workspace showed a stranger somebody else's project",
    ).toBe('404');
  });
});

test.describe('the shell, opened by its owner — an ordinary account', () => {
  const ADMIN = `${unique('shell-owner')}@cleancore-test.io`;
  const EMPTY_ID = unique('shell-empty');
  const FULL_ID = unique('shell-full');
  const RUN_ID = unique('shell-run');
  let adminUid = '';

  // The manifest has to be the manifest of *this* source, and the project has to
  // carry the deployment target the manifest recorded. A fixture that gets
  // either wrong is a genuinely stale project — `staleness()` says so, the
  // status line reports `partial`, and the test would be measuring the wrong
  // thing while looking right.
  const FULL_SOURCE = 'REPORT z_full.\nOPEN DATASET lv_f FOR OUTPUT IN TEXT MODE ENCODING UTF-8.\n';
  const manifest = buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(FULL_SOURCE),
      deploymentTarget: 'private',
      catalogVersion: 'catalog-7.7',
      rulesetVersion: 'levels/1.3',
      engineVersion: '3.0.0',
      model: null,
    }),
  );

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    adminUid = cred.user.uid;
    // No admin claim and no flag: since roadmap 3.0.1 the owner is enough.
    await adminSetDoc('users', adminUid, {
      firstName: 'Shell', lastName: 'Owner', email: ADMIN, termsVersionAccepted: TERMS_VERSION,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // A project with nothing on it. Not even source: this is the case the row
    // is about.
    await adminSetDoc('projects', EMPTY_ID, {
      name: 'Nothing has happened here', userId: adminUid,
      createdAt: new Date(), status: 'created',
    });

    // And one with a signed run, a signed-off design, generated code and docs,
    // and a passing suite — so that the comparison below is not vacuous.
    // The executed suite: verdicts and the server-written receipt behind them.
    const executed = {
      activeRunId: RUN_ID,
      generatedCode: 'export const ok = true;\n',
      testSuite: SUITE,
      testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    };
    await adminSetDoc('projects', FULL_ID, {
      name: 'Emergency purchase approval', userId: adminUid,
      createdAt: new Date(), status: 'completed',
      legacyCode: FULL_SOURCE,
      s4Deployment: 'private',
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n',
      approvedByArchitect: true,
      approvedBy: ADMIN,
      documentation: '# Blueprint\n',
      ...executed,
      testRunReceipt: receiptFor(executed),
    });
    await adminSetDoc(`projects/${FULL_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: FULL_ID, userId: adminUid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
      inputManifest: manifest,
    });
  });

  test('an empty project paints "not started" seven times, and nothing green', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page, ADMIN);

    expect(await openWorkspace(page, EMPTY_ID)).toBe('shell');

    // ADR-002: the workspace opens in the Business view.
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'business');

    // Business folds the seven away; open them, because what this test is about
    // is what they say, not where they are.
    await page.click('[data-workspace-status-toggle]');
    await page.waitForSelector('[data-workspace-status-line]');

    // No window to race: measuring a colour mid-transition passes or fails by
    // how fast the machine is (the note in tests/phase-honesty-guard.spec.ts).
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });

    const chips = await page.locator('[data-workspace-status]').evaluateAll((els) =>
      els.map((el) => ({
        facet: el.getAttribute('data-workspace-status') || '',
        status: el.getAttribute('data-status') || '',
        label: (el.querySelector('[data-cc-object-status-label]')?.textContent || '').trim(),
        colour: getComputedStyle(el.querySelector('[data-cc-object-status-label]') as Element).color,
      })),
    );

    expect(chips.map((c) => c.facet), 'the seven of DESIGN.md §2.3').toEqual([...STATUS_FACETS]);

    const claiming = chips.filter((c) => c.status !== 'not-started' || c.label !== 'not started');
    expect(
      claiming.map((c) => `${c.facet} → ${c.status} "${c.label}"`),
      'a facet of an empty project claims something happened',
    ).toEqual([]);

    // Green is a proof, and nothing here was proved.
    const success = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cc-success').trim(),
    );
    expect(success, 'the token never reached the browser — the comparison would be vacuous').not.toBe('');
    const green = chips.filter((c) => c.colour === success || c.colour === 'rgb(4, 120, 87)');
    expect(green.map((c) => c.facet), 'an untouched facet is painted as proven').toEqual([]);

    // The area the row asks for, and the sentence that is not "0".
    await expect(page.locator('[data-not-determined-state="no-source"]')).toBeVisible();

    // And the meta line, when it is opened, admits it has nothing to show —
    // since 02.10.2026 in one sentence instead of a row of "not recorded".
    await page.click('[data-workspace-details-toggle]');
    const meta = page.locator('[data-workspace-meta]');
    await expect(meta).toHaveAttribute('data-recorded', 'none');
    await expect(meta).toContainText('No signed run yet');
    await expect(page.locator('[data-workspace-meta-value]'), 'a meta value appeared from nowhere').toHaveCount(0);

    // A fold folds back (QA review of 247b20c16e38): the row stays, and the
    // same button closes what it opened.
    const fold = page.locator('[data-workspace-status-toggle]');
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await fold.click();
    await expect(page.locator('[data-workspace-status-line]'), 'the project status cannot be folded again').toHaveCount(0);
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
  });

  test('a project with a signed run says so — and unverified work is still not green', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page, ADMIN);

    // IT has the same calm header as Business since 04.10.2026 (ADR-026
    // note): the seven statuses in one folded row whose summary names the
    // provenance status, the meta line behind "Details". Both one click away.
    expect(await openWorkspace(page, FULL_ID, '?view=it')).toBe('shell');
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'it');
    await expect(page.locator('[data-workspace-status-line]'), 'IT opens with the statuses folded').toHaveCount(0);
    await expect(page.locator('[data-workspace-meta]'), 'IT opens with the meta line behind Details').toHaveCount(0);
    await expect(page.locator('[data-workspace-status-summary-provenance] [data-cc-object-status-label]')).toHaveText('done');
    await page.click('[data-workspace-status-toggle]');
    await page.waitForSelector('[data-workspace-status-line]');
    // Seven statuses, seven "Why?" — and each is the status itself, not a "?" beside it.
    await expect(page.locator('[data-workspace-status] [data-cc-why][data-cc-why-form="statement"]')).toHaveCount(7);
    await page.click('[data-workspace-details-toggle]');
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });

    const chips = await page.locator('[data-workspace-status]').evaluateAll((els) =>
      els.map((el) => ({
        facet: el.getAttribute('data-workspace-status') || '',
        status: el.getAttribute('data-status') || '',
        colour: getComputedStyle(el.querySelector('[data-cc-object-status-label]') as Element).color,
      })),
    );
    const by = Object.fromEntries(chips.map((c) => [c.facet, c]));

    expect(by.provenance.status, 'a signed run is on record').toBe('done');
    expect(by.execution.status).toBe('done');
    expect(by.confirmed.status, 'a design the account signed off on itself is a draft').toBe('draft');
    expect(by.need.status).toBe('not-started');
    expect(by.standard.status).toBe('not-started');

    // The rendered form of the one rule: green ⇔ proven. The design phase is
    // `done` and unverified, so it must not share a colour with the signed run.
    expect(by.confirmed.colour).not.toBe(by.provenance.colour);
    expect(by.execution.colour).toBe(by.provenance.colour);

    // The meta line, opened, reads the manifest the run signed.
    const meta = await page
      .locator('[data-workspace-meta-value]')
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((el) => [el.getAttribute('data-workspace-meta-value'), (el.textContent || '').trim()]),
        ),
      );
    expect(meta.manifest).toBe(manifest.hash.slice(0, 8));
    expect(meta.revision).toBe(String(manifest.revision));
    expect(meta.engine).toBe('3.0.0');
    expect(meta.rules).toBe('levels/1.3');

    // The shell bar carries the path with the project's name and the search
    // button (§2.1, D.29); the page's own path row is gone.
    const crumb = page.locator('header [data-shell-path] [data-shell-path-project]');
    await expect(crumb).toHaveText('Emergency purchase approval');
    await expect(crumb).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('header [data-command-search-trigger]')).toBeVisible();
    await expect(page.locator('[data-workspace-shell] nav[aria-label="Path"]')).toHaveCount(0);

    // Seven tools, open in IT, each a real link to its stage.
    const tools = page.locator('[data-workspace-tools="open"] a[data-cc-button]');
    await expect(tools).toHaveCount(7);
    // …and each carries the view and this bar into the stage, so "Back to
    // workspace" returns to IT at the toolbar (block D, D.29).
    await expect(tools.first()).toHaveAttribute('href', `/project/${FULL_ID}/analyze?view=it&from=workspace-tools`);
    await expect(page.locator('#workspace-tools [data-workspace-tools="open"]')).toHaveCount(1);

    // The open point the engine stepped over, with its reason and its line —
    // in its open-question group, one click deeper (ADR-081).
    const group = page.locator('[data-open-question-group]:has([data-cc-disclosure-trigger])').first();
    await expect(group).toBeVisible();
    await group.locator('[data-cc-disclosure-trigger]').first().click();
    await expect(group.locator('[data-not-determined-item]').first()).toContainText('L2');
  });

  test('the view switcher and "About this view" — roadmap 6.1; no IT focus (ADR-058)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page, ADMIN);

    // W22-A02 of the phase's acceptance line, checked from the network rather
    // than from the component: a switch "creates no new hypothesis" and
    // "triggers no model call". Any request to the one path a model call
    // can leave this product (`/api/gemini`) or to the route that mints a
    // signed run would show up here regardless of what the UI claims to do.
    const modelOrRunCalls: string[] = [];
    await page.route('**/api/gemini', (route) => {
      modelOrRunCalls.push(route.request().url());
      return route.continue();
    });
    await page.route('**/api/runs/create', (route) => {
      modelOrRunCalls.push(route.request().url());
      return route.continue();
    });

    expect(await openWorkspace(page, FULL_ID)).toBe('shell');
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'business');

    // One segmented control in the header: the view. There is no Focus (ADR-058).
    await expect(page.locator('[data-cc-segmented][aria-label="Focus"]')).toHaveCount(0);

    // "About this view" is a real button, collapsed by default, with an
    // accessible name and a proper expanded/controls relationship — not a
    // bare "?" and not a link that goes nowhere.
    const aboutToggle = page.locator('[data-workspace-view-about-toggle]');
    const aboutPanel = page.locator('[data-workspace-view-about]');
    await expect(aboutToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(aboutPanel).toHaveCount(0);
    await aboutToggle.click();
    await expect(aboutToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(aboutPanel).toBeVisible();
    // What the paragraph says and what the code shows must be the same text —
    // a hand-written duplicate in the DOM would drift from `lib/workspace-model.ts`.
    await expect(aboutPanel).toHaveText(VIEW_ABOUT.business);

    // The toggle names the exact paragraph it opens — a real `aria-controls`
    // relationship, not just a visual disclosure two elements happen to sit
    // next to. `useId()` values contain colons, so this is compared as plain
    // strings rather than fed into a CSS id selector.
    const controls = await aboutToggle.getAttribute('aria-controls');
    const panelId = await aboutPanel.getAttribute('id');
    expect(controls, 'the toggle does not name the paragraph it opens').toBeTruthy();
    expect(controls).toBe(panelId);

    // Switching to IT shows IT — and no Focus switch beside the view (ADR-058:
    // the "Application · Solution · Enterprise" switch scoped nothing and was
    // removed on the owner's decision of 02.10.2026).
    //
    // The generous timeout below is not slack for a flaky assertion: the dev
    // server compiles `/project/[projectId]` on demand, and the client-side
    // navigation this click triggers is the *first* hit of that route in this
    // test, which can take several seconds under a full, parallel test run —
    // the same class of gotcha CLAUDE.md documents for a compiling dev server,
    // just on the write side instead of a race between two writes.
    const viewSeg = page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'IT' });
    await viewSeg.click();
    await expect(page).toHaveURL(/[?&]view=it\b/, { timeout: 30000 });
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'it');

    await expect(page.locator('[data-workspace-it-focus]')).toHaveCount(0);
    await expect(page.locator('[data-cc-segmented][aria-label="Focus"]')).toHaveCount(0);
    for (const word of ['Application', 'Solution', 'Enterprise']) {
      await expect(
        page.locator('[data-workspace-shell] button[role="radio"]', { hasText: word }),
        `the IT header still offers a "${word}" segment`,
      ).toHaveCount(0);
    }

    // The "About this view" paragraph re-opens for IT's own text — the toggle
    // state is not reset by a view switch, but the content it shows is.
    await expect(page.locator('[data-workspace-view-about]')).toHaveText(VIEW_ABOUT.it);

    // Management: the view is still in the URL. Tight on purpose: by here the
    // page is loaded and the URL change is client-side (QA review of 4a99d5355716).
    await page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'Management' }).click();
    await expect(page).toHaveURL(/[?&]view=management\b/, { timeout: 5000 });

    // Every switch above — two views, one "About this view" toggle — and not
    // one of them called the model or minted a run.
    expect(modelOrRunCalls, `a view switch reached ${JSON.stringify(modelOrRunCalls)}`).toEqual([]);
  });

  test('an old link with ?focus=solution opens the IT view normally — the parameter is ignored (ADR-058)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await signIn(page, ADMIN);

    expect(await openWorkspace(page, FULL_ID, '?view=it&focus=solution')).toBe('shell');
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'it');
    await expect(page.locator('[data-workspace-gate]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-it-focus]')).toHaveCount(0);
    await expect(page.locator('[data-cc-segmented][aria-label="Focus"]')).toHaveCount(0);
    // The view switch still works from there, and nothing rewrote or acted on the old parameter.
    await page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'Business' }).click();
    await expect(page).toHaveURL(/[?&]view=business\b/, { timeout: 30000 });
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'business');
    expect(pageErrors, `the page threw: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  /**
   * Roadmap 6.10 — the Management view begins with its answer.
   *
   * Until this step the three Management blocks were rendered in two files:
   * the Public-Cloud-Fit panel and "Members on this case" in this shell, the
   * four answers as a sibling *after* it in
   * `app/(app)/project/[projectId]/page.tsx`. Nobody decided that order, and
   * it read Public-Cloud-Fit → members → answers: a decider met an access
   * control list before the verdict, which is exactly the state ADR-029
   * abolished (`DESIGN.md` §5.6: *"Management begins with a sentence above
   * all cards that answers the view's question"*).
   *
   * Measured on the painted page rather than in the source, and twice over:
   * the document order of the three sections **and** their vertical position,
   * because a DOM order can be undone by a grid or an `order:` and the reader
   * only ever sees the second one.
   *
   * The second half is the property both files carried a correct comment
   * about and which the move must not lose: neither Management block exists at
   * all in Business or IT — not hidden, not a stub, absent — while "Members on
   * this case" is in every view because read access is not a perspective.
   */
  test('Management reads answers → Public-Cloud-Fit → members, and neither answer exists in the other two views', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signIn(page, ADMIN);

    expect(await openWorkspace(page, FULL_ID, '?view=management')).toBe('shell');
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute(
      'data-workspace-shell',
      'management',
    );

    // All three have to be on the screen before the order means anything: the
    // answers and the access list both arrive from a fetch, and comparing
    // positions while one of them is still `null` would compare two things.
    await expect(page.locator('[data-management-view]')).toBeVisible({ timeout: 60000 });
    // The bucket panel stands in the "Evidence" fold under the answer (owner
    // 03.10.2026: at most three things above the fold) — open it to lay it out.
    await page.locator('[data-management-fold="evidence"] > [data-cc-disclosure] [data-cc-disclosure-trigger]').first().click();
    await expect(page.locator('[data-public-cloud-fit-panel]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-workspace-access]')).toBeVisible({ timeout: 60000 });

    const SELECTORS = [
      '[data-management-view]',
      '[data-public-cloud-fit-panel]',
      '[data-workspace-access]',
    ];

    // `querySelectorAll` with a selector list answers in document order.
    const documentOrder = await page.evaluate((selectors) => {
      const els = Array.from(document.querySelectorAll(selectors.join(',')));
      return els.map((el) => selectors.find((s) => el.matches(s)) ?? '?');
    }, SELECTORS);
    expect(documentOrder, 'the Management view does not begin with its answer').toEqual(SELECTORS);

    // And on the screen. Tops, not a promise about the markup: `order`,
    // `flex-direction: column-reverse` or a grid row would each satisfy the
    // check above and paint the opposite of it.
    const tops = await page.evaluate(
      (selectors) =>
        selectors.map((s) => {
          const el = document.querySelector(s);
          return el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN;
        }),
      SELECTORS,
    );
    expect(tops.some(Number.isNaN), 'one of the three sections was not laid out at all').toBe(false);
    expect(
      tops[0] < tops[1] && tops[1] < tops[2],
      `painted top to bottom the three sit at ${JSON.stringify(tops)} — the answer is not above the cards`,
    ).toBe(true);

    // The property the move had to keep: in the other two views the Management
    // blocks are not rendered at all, while the access list is.
    for (const other of ['business', 'it'] as const) {
      await page.goto(`/project/${FULL_ID}?view=${other}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-workspace-shell]')).toHaveAttribute(
        'data-workspace-shell',
        other,
        { timeout: 60000 },
      );
      await expect(page.locator('[data-workspace-access]')).toBeVisible({ timeout: 60000 });
      await expect(
        page.locator('[data-management-view]'),
        `Management's answers are rendered in the ${other} view`,
      ).toHaveCount(0);
      await expect(
        page.locator('[data-public-cloud-fit-panel]'),
        `the Public-Cloud-Fit panel is rendered in the ${other} view`,
      ).toHaveCount(0);
    }
  });

  test('the switch route is gone — there is nothing left to turn on', async ({ request }) => {
    test.setTimeout(60 * 1000);
    // It used to write `users/{uid}.workspaceShell` for an administrator's own
    // account. Every account has the workspace since roadmap 3.0.1 (ADR-061);
    // the route went with the switch, and an old client posting to it reaches
    // nothing.
    const cred = await signInWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    const res = await request.post('/api/workspace-shell', {
      headers: { Authorization: `Bearer ${await cred.user.getIdToken(true)}`, 'Content-Type': 'application/json' },
      data: { enabled: true },
    });
    expect(res.status(), await res.text()).toBe(404);
  });
});
