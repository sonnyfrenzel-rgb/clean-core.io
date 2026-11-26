import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { toolMark, workspaceTools } from '../lib/workspace-model';
import { nextPhaseKey, PHASE_PURPOSE, workflowSteps } from '../lib/workflow-steps';
import { outsideSubjectOf } from '../lib/sap-test-results';
import { nextTagShown } from '../lib/analyze-progress';
import { hydrateProject } from '../lib/project-loader';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { sha256Hex } from '../lib/artefact-digest';
import { WORKSPACE_MESSAGES } from '../lib/workspace-messages';
import type { Project } from '../lib/types';

/**
 * The workspace's tools, side by side on a wide screen, each marked when it has
 * been used in this project — ADR-060, Sonny 02.10.2026: "responsive layout,
 * in desktop mode always side by side, with small green check marks where I
 * have already used it in the project", and the same day: "one has to know what
 * the red dots mean, but I also wanted them to have small green ticks for a
 * tool already used once."
 *
 * Amended 03.10.2026 by the owner: "green check on Analyze, and 'Run the
 * analysis' as the next step — a contradiction". The check meant the tool's
 * OWN output is on record (`toolOnRecord`): Analyze a signed run, never a
 * staged source; Economics and Delivery never for what other tools made.
 *
 * Amended again the same day: "The tests are green, but you're supposed to do
 * the tests — that contradicts itself." A check now means the phase is `done`;
 * the tool's own output on a `partial` phase is "started" (a half circle in the
 * information colour); the tool marked Next never carries a check.
 *
 * What holds it:
 *   - the mark is derived from the phase state in `workflowSteps` alone and
 *     never from a client-set `status` or a visit: a green check where the
 *     tool's own output is on record and not out of date, an amber dot where
 *     it is `stale`, nothing otherwise;
 *   - the mark says "used", never "proven" or "verified" — proof strength stays
 *     with the stepper and the status chips;
 *   - a legend in text explains both marks, beside "Tools" and at the top of
 *     the phone menu; each mark has its words for a screen reader — and no
 *     hover-only tooltip (owner 03.10.2026: hover does not exist on a phone);
 *   - every tool has its purpose as an accessible description and behind a
 *     tap- and keyboard-reachable "i"; exactly one tool is marked next;
 *   - from breakpoint L the seven are visible in every view without opening a
 *     menu; on a phone (390 px) the bar is the menu and nothing scrolls sideways.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const SOURCE = 'REPORT z_toolbar.\nOPEN DATASET lv_f FOR OUTPUT IN TEXT MODE ENCODING UTF-8.\n';
const manifestFor = (source: string) =>
  buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(source),
      deploymentTarget: 'private',
      catalogVersion: 'catalog-7.7',
      rulesetVersion: 'levels/1.3',
      engineVersion: '3.0.0',
      model: null,
    }),
  );

/** Analyze done by a signed run on this very source — nothing else on record. */
const analyzedDoc = (uid: string): Record<string, unknown> => ({
  name: 'Toolbar — analyzed', userId: uid, createdAt: new Date(),
  legacyCode: SOURCE, s4Deployment: 'private', cleanCoreScore: 62,
  // A client-set status that claims the opposite: the bar must not read it.
  status: 'completed',
});
const analyzedRun = (projectId: string, uid: string, runId: string): Record<string, unknown> => ({
  runId, projectId, userId: uid, createdAt: new Date().toISOString(), status: 'completed',
  cleanCoreScore: 62, inputManifest: manifestFor(SOURCE),
});

/** The run's manifest names a different source: Analyze is stale, and so is what hangs on it. */
const staleDoc = (uid: string): Record<string, unknown> => ({
  ...analyzedDoc(uid), name: 'Toolbar — stale', solutionDesign: '# Target architecture\n',
});
const staleRun = (projectId: string, uid: string, runId: string): Record<string, unknown> => ({
  ...analyzedRun(projectId, uid, runId), inputManifest: manifestFor('REPORT z_earlier_source.\n'),
});

/** What the workspace computes: the document with its run spread over it, exactly as it opens it. */
const expectedSteps = (projectId: string, doc: Record<string, unknown>, runId: string, run: Record<string, unknown>) =>
  workflowSteps(hydrateProject(projectId, { ...doc, activeRunId: runId } as Project, { kind: 'found', data: run }));

/* ------------------------------------------------------------- the derivation */

test.describe('the mark is the stepper\'s reading of the phase', () => {
  test('state and proven come from workflowSteps, for every tool', () => {
    const fixtures: Array<Project | null> = [
      null,
      hydrateProject('a', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('a', 'u', 'r') }),
      hydrateProject('s', { ...staleDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: staleRun('s', 'u', 'r') }),
    ];
    for (const project of fixtures) {
      const steps = workflowSteps(project);
      const tools = workspaceTools(project);
      expect(tools.map((t) => [t.key, t.state, t.proven])).toEqual(steps.map((s) => [s.key, s.state, s.proven]));
    }
  });

  test('a check where the phase is done, a half circle where the tool\'s own work is started, a dot where it is out of date, nothing otherwise', () => {
    const done = { kind: 'check', meaning: 'done', words: 'tools.mark.done' };
    const started = { kind: 'half', meaning: 'started', words: 'tools.mark.started' };
    const none = { kind: 'none', meaning: 'none', words: null };
    expect(toolMark({ key: 'design', state: 'done' })).toEqual(done);
    // A generated design awaiting its sign-off, a test draft: the tool's own
    // output, and its work not done — started, never a check (owner 03.10.2026).
    expect(toolMark({ key: 'design', state: 'partial' })).toEqual(started);
    expect(toolMark({ key: 'testing', state: 'partial' })).toEqual(started);
    // A staged source is an upload, not an analysis; a baseline is not a cost
    // estimate; review material is other tools' output (owner 03.10.2026).
    expect(toolMark({ key: 'analyze', state: 'partial' })).toEqual(none);
    expect(toolMark({ key: 'tco', state: 'partial' })).toEqual(none);
    expect(toolMark({ key: 'delivery', state: 'partial' })).toEqual(none);
    expect(toolMark({ key: 'analyze', state: 'done' })).toEqual(done);
    expect(toolMark({ key: 'analyze', state: 'stale' })).toEqual({ kind: 'dot', meaning: 'stale', words: 'tools.mark.stale' });
    expect(toolMark({ key: 'design', state: 'empty' })).toEqual(none);
    // Proof strength is not the bar's to say: a proven phase and an unproven one
    // carry the same mark (the stepper and the chips keep telling them apart).
    const proven = { key: 'testing' as const, state: 'done' as const, proven: true };
    const unproven = { key: 'testing' as const, state: 'done' as const, proven: false };
    expect(toolMark(proven)).toEqual(toolMark(unproven));
  });

  test('scenarios written and not run are started, never a check; a passing result from your SAP system earns it', () => {
    const run = hydrateProject('t', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('t', 'u', 'r') });
    const abap = {
      ...run,
      extensibilityRoute: 'ABAP Cloud (RAP)',
      solutionDesign: '# Target\n',
      generatedCode: 'CLASS zcl_x DEFINITION. ENDCLASS.',
      testSuite: { code: 'CLASS ltcl_x DEFINITION FOR TESTING. ENDCLASS.' },
      testCases: [{ id: 'TC_01', name: 'one' }, { id: 'TC_02', name: 'two' }],
    } as unknown as Project;
    const draft = workflowSteps(abap).find((s) => s.key === 'testing')!;
    expect(draft.state).toBe('partial');
    expect(toolMark(draft)).toMatchObject({ kind: 'half', meaning: 'started' });

    const subject = outsideSubjectOf(abap);
    const passing = {
      ...abap,
      outsideTestResult: {
        v: 1, kind: 'imported', subject, recordedAt: '2026-10-03T10:00:00.000Z', recordedBy: 'owner@example.com',
        scenarioCount: 2, passed: 2, failed: 0, skipped: 0,
        coverage: { passed: 2, failed: 0, skipped: 0, none: 0 },
        file: { name: 'r.xml', sha256: 'a'.repeat(64), format: 'junit' }, system: null, ranOn: null,
      },
    } as unknown as Project;
    const testing = workflowSteps(passing).find((s) => s.key === 'testing')!;
    expect(testing).toMatchObject({ state: 'done', proven: false, verifiedOutside: 'imported' });
    expect(toolMark(testing)).toMatchObject({ kind: 'check', meaning: 'done' });
  });

  test('O8: no "Next" tag for an analysis-only reader until a later tool was opened once in this browser (plan AB-4)', () => {
    const run = hydrateProject('o', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('o', 'u', 'r') });
    const analysed = workflowSteps(run);
    // ADR-128 (5): right after the analysis, the next tool is Economics.
    expect(nextPhaseKey(analysed)).toBe('tco');
    // Analysis-only: Analyze done, nothing after it on record but the free Economics baseline.
    expect(nextTagShown(analysed, 'tco', false)).toBe(false);
    expect(nextTagShown(analysed, 'tco', true)).toBe(true);
    // A reader with a later tool's work on record is not analysis-only.
    const designed = workflowSteps({ ...run, solutionDesign: '# Target\n' } as Project);
    expect(nextTagShown(designed, nextPhaseKey(designed), false)).toBe(true);
    // Analyze itself next is not a later tool: its tag stays.
    const fresh = workflowSteps({ name: 'fresh', legacyCode: SOURCE } as Project);
    expect(nextTagShown(fresh, nextPhaseKey(fresh), false)).toBe(true);
    // The bar reads the rule, and a stage after Analyze counts itself as opened.
    const bar = read('components/workspace/ToolBar.tsx');
    expect(bar).toContain('nextTagShown(tools, phaseNext, progress.laterToolOpened) ? phaseNext : null');
    expect(bar).toMatch(/if \(current && current !== 'analyze'\) markLaterToolOpened\(\);/);
    // Journey review 26.11.2026 (Q3): never "Next" on the tool the reader is on, and the demo reads the way on as its
    // Re-design page does — the bar said "Analyze · Next" while Re-design said "Start with Economics".
    expect(bar).toContain('const next = ruled === current ? null : ruled;');
    expect(bar).toContain("readKey === 'demo' ? tools.map((t) => (t.key === 'analyze' ? { ...t, state: 'done' as const } : t)) : tools");
    // Q7: the Re-design group stands on every tool, not only on Analyze.
    expect(read('components/StageHeader.tsx')).toContain('(projectId || demo) && (onRedesign || Boolean(toolCurrent))');
  });

  test('the tool marked Next never carries a check', () => {
    const run = hydrateProject('n', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('n', 'u', 'r') });
    const fixtures: Array<Project | null> = [
      null,
      { name: 'fresh', legacyCode: SOURCE } as Project,
      run,
      { ...run, solutionDesign: '# Target\n' } as Project,
      { ...run, solutionDesign: '# Target\n', approvedByArchitect: true, generatedCode: 'x', testCases: [{ id: 'TC_01' }] } as unknown as Project,
      hydrateProject('s', { ...staleDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: staleRun('s', 'u', 'r') }),
    ];
    for (const project of fixtures) {
      const steps = workflowSteps(project);
      const next = nextPhaseKey(steps);
      if (!next) continue;
      expect(toolMark(steps.find((s) => s.key === next)!).kind, `${next} is next and carries a check`).not.toBe('check');
    }
  });

  test('a fresh project shows no check on Analyze; a signed run earns it', () => {
    const fresh = workflowSteps({ name: 'fresh', legacyCode: SOURCE } as Project);
    expect(fresh.find((s) => s.key === 'analyze')?.state).toBe('partial');
    expect(toolMark(fresh.find((s) => s.key === 'analyze')!).kind).toBe('none');
    const signed = workflowSteps(
      hydrateProject('a', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('a', 'u', 'r') }),
    );
    expect(toolMark(signed.find((s) => s.key === 'analyze')!).kind).toBe('check');
  });

  test('every tool has a purpose of its own, from one source', () => {
    const purposes = Object.values(PHASE_PURPOSE);
    expect(purposes).toHaveLength(7);
    expect(new Set(purposes).size).toBe(7);
    for (const p of purposes) expect(p.length).toBeGreaterThan(10);
    // The bar writes no purpose of its own.
    expect(read('components/workspace/ToolBar.tsx')).toContain('PHASE_PURPOSE[tool.key]');
  });

  test('the marks and the legend never claim proof', () => {
    const toolWords = Object.entries(WORKSPACE_MESSAGES).filter(([key]) => key.startsWith('tools.'));
    expect(toolWords.map(([key]) => key)).toEqual(
      expect.arrayContaining([
        'tools.mark.done', 'tools.mark.started', 'tools.mark.stale',
        'tools.legend.done', 'tools.legend.started', 'tools.legend.stale',
      ]),
    );
    for (const [key, words] of toolWords) {
      expect(words, `${key} claims proof`).not.toMatch(/prove|proof|verif|confirm|evidence|signed/i);
    }
    // The bar draws no proof: no tone ladder, no `proven` read.
    const bar = read('components/workspace/ToolBar.tsx');
    expect(bar).not.toContain('PHASE_TONE_CLASS');
    expect(bar).not.toMatch(/\.proven\b/);
  });

  test('the toolbar never reads a client-set status', () => {
    for (const rel of ['components/workspace/ToolBar.tsx', 'lib/workspace-model.ts']) {
      expect(read(rel)).not.toMatch(/project\??\.status\b/);
    }
  });
});

/* -------------------------------------------------------------- rendered */

const PASSWORD = 'ToolbarInline123!';

/** "Analyze (used)" — the name and, in brackets, the mark's words. */
const named = (label: string, key: keyof typeof WORKSPACE_MESSAGES) =>
  new RegExp(`^${label}\\s*\\(${WORKSPACE_MESSAGES[key]}\\)$`);

test.describe('the toolbar, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  let acct: SeededProject;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ANALYZED = `toolbar-analysed-${tag}`;
  const STALE = `toolbar-stale-${tag}`;
  const RUN_A = `toolbar-run-a-${tag}`;
  const RUN_S = `toolbar-run-s-${tag}`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    acct = await seedStageProject({ prefix: 'toolbar', admin: true, acceptTerms: true, password: PASSWORD });
    await adminSetDoc('projects', ANALYZED, { ...analyzedDoc(acct.uid), activeRunId: RUN_A });
    await adminSetDoc(`projects/${ANALYZED}/runs`, RUN_A, analyzedRun(ANALYZED, acct.uid, RUN_A));
    await adminSetDoc('projects', STALE, { ...staleDoc(acct.uid), activeRunId: RUN_S });
    await adminSetDoc(`projects/${STALE}/runs`, RUN_S, staleRun(STALE, acct.uid, RUN_S));
  });

  // The workspace holds IT and Management since v3.1.0: Business is Analyze's page (plan AB-2, ADR-109),
  // whose seven tools are the stage header's bar (`tests/stage-frame.spec.ts`).
  async function open(page: Page, projectId: string, view: 'it' | 'management'): Promise<void> {
    await page.goto(`/project/${projectId}?view=${view}`, { waitUntil: 'domcontentloaded' });
    // The workspace page dissolved into Analyze in 3.5.0 (AB-11): the old address opens Analyze in the view, and the
    // tool row is the one in its header (the same `ToolBar`, `data-stage-tools`).
    await expect(page.locator('[data-stage-view-switch]')).toHaveAttribute('data-stage-view-switch', view, { timeout: 60000 });
    await expect(page.locator('[data-stage-tools="open"]')).toBeVisible({ timeout: 60000 });
  }

  /** Each tool's state and mark as the page shows them. */
  async function shown(page: Page, scope: string) {
    return page.locator(`${scope} a[data-workspace-tool]`).evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-workspace-tool'),
        state: el.getAttribute('data-phase-state'),
        meaning: el.getAttribute('data-workspace-tool-mark-meaning'),
        kind: el.getAttribute('data-workspace-tool-mark-kind'),
        title: el.querySelector('[title]')?.getAttribute('title') ?? null,
        checks: el.querySelectorAll('[data-workspace-tool-mark="check"]').length,
        dots: el.querySelectorAll('[data-workspace-tool-mark="dot"]').length,
        halves: el.querySelectorAll('[data-workspace-tool-mark="half"]').length,
      })),
    );
  }

  test('desktop: seven tools side by side in every view, no menu to open; each used tool carries a green check, with its words and the legend', async ({
    page,
  }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const steps = expectedSteps(ANALYZED, analyzedDoc(acct.uid), RUN_A, analyzedRun(ANALYZED, acct.uid, RUN_A));
    expect(steps.find((s) => s.key === 'analyze')).toMatchObject({ state: 'done', proven: true });

    for (const view of ['it', 'management'] as const) {
      await open(page, ANALYZED, view);
      const bar = page.locator('[data-stage-tools="open"]');
      await expect(bar, `${view}: the open bar`).toBeVisible();
      await expect(page.locator('[data-stage-tools="menu"]'), `${view}: a menu beside the open bar`).toBeHidden();
      const links = bar.locator('a[data-workspace-tool]');
      await expect(links).toHaveCount(7);
      for (let i = 0; i < 7; i++) await expect(links.nth(i), `${view}: tool ${i + 1} is not visible`).toBeVisible();
      // Workflow order, from the one contract.
      expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute('data-workspace-tool')))).toEqual(
        steps.map((s) => s.key),
      );
      // Nothing was opened to see them.
      await expect(page.locator('[data-workspace-tools-panel]')).toHaveCount(0);

      const marks = await shown(page, '[data-stage-tools="open"]');
      expect(marks.map((m) => [m.key, m.state, m.meaning, m.kind])).toEqual(
        steps.map((s) => [s.key, s.state, toolMark(s).meaning, toolMark(s).kind]),
      );
      // A check exactly where the tool's own output is on record — Analyze
      // (the signed run) and nothing else: Economics' `partial` is only the
      // baseline, not an estimate (owner 03.10.2026) — and a dot nowhere,
      // since nothing here is out of date.
      expect(
        marks.filter((m) => m.checks === 1 && m.dots === 0).map((m) => m.key),
        `${view}: the checks are not where the tools have something on record`,
      ).toEqual(steps.filter((s) => toolMark(s).kind === 'check').map((s) => s.key));
      expect(marks.filter((m) => m.checks > 0).map((m) => m.key)).toEqual(['analyze']);
      expect(marks.filter((m) => m.dots > 0).map((m) => m.key), `${view}: a dot on a project with nothing out of date`).toEqual([]);
      for (const m of marks) {
        expect(m.title, `${view}: ${m.key} carries a hover-only tooltip`).toBeNull();
      }

      // Which tool for what: every tool describes itself, and exactly one is next.
      for (const s of steps) {
        const tool = bar.locator(`a[data-workspace-tool="${s.key}"]`);
        await expect(tool, `${view}: ${s.key} has no description`).toHaveAccessibleDescription(/\S/);
        const describedBy = await tool.getAttribute('aria-describedby');
        await expect(page.locator(`[id="${describedBy}"]`), `${view}: ${s.key} does not say what it is for`).toContainText(
          PHASE_PURPOSE[s.key],
        );
      }
      // O8 (plan AB-4, ADR-060 amended): this project is analysis-only and no later tool was opened in this browser
      // yet, so no tool wears the "Next" tag; Design still says what it does, in its description (checked above).
      // The family's tool row has no hint line under it (ADR-140, UX review 22.11.2026, Q9): one row, nothing more.
      await expect(bar.locator('a[data-workspace-tool-next]'), `${view}: a Next tag for an analysis-only reader`).toHaveCount(0);
      await expect(bar.locator('[data-tools-hint]'), `${view}: a hint line under the family's tool row`).toHaveCount(0);

      // The legend says what the marks mean, in text, beside "Tools".
      const legend = bar.locator('[data-tools-legend="bar"]');
      await expect(legend, `${view}: the legend`).toBeVisible();
      await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.done']);
      await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.started']);
      await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.stale']);

      // No tool is ever named proven or verified here.
      const names = await links.evaluateAll((els) => els.map((el) => (el.textContent || '').trim()));
      for (const name of names) expect(name, `${view}: a tool claims proof`).not.toMatch(/prove|proof|verif/i);
    }

    // The words say why the check stands.
    const analyze = page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.done'));
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="tco"]')).toHaveAccessibleName('Economics');
    // A tool with nothing on record says nothing extra.
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]')).toHaveAccessibleName('Design');

    // Keyboard: real links, reached by Tab, with the visible focus ring.
    await analyze.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(analyze).toBeFocused();
    const ring = await analyze.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);

    // O8: once a tool after Analyze was opened in this browser (Design here), exactly one tool is next again —
    // Economics, the phase contract's next tool since ADR-128 (5).
    await page.goto(`/project/${ANALYZED}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]')).toBeVisible({ timeout: 60000 });

    // The check is green — the success token, not a near-green. Read where Analyze is not the open tool: the open
    // tool is filled in ink (ADR-140) and draws its mark in the tint that reads on ink.
    const analyzeElsewhere = page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyzeElsewhere).toHaveAttribute('data-phase-state', 'done', { timeout: 60000 });
    await expect(analyzeElsewhere).not.toHaveAttribute('aria-current', 'page');
    const [tick, legendTick, success] = await analyzeElsewhere.evaluate((el) => {
      const toRgb = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      };
      return [
        getComputedStyle(el.querySelector('[data-workspace-tool-mark="check"]') as Element).color,
        getComputedStyle(document.querySelector('[data-tools-legend="bar"] svg') as Element).color,
        toRgb(getComputedStyle(document.documentElement).getPropertyValue('--cc-success').trim()),
      ];
    });
    expect(success, 'the token never reached the browser').not.toBe('');
    expect(tick).toBe(success);
    expect(tick).toBe('rgb(4, 120, 87)');
    expect(legendTick, 'the legend shows another check than the bar').toBe(tick);

    await open(page, ANALYZED, 'it');
    const bar = page.locator('[data-stage-tools="open"]');
    await expect(bar.locator('a[data-workspace-tool-next]'), 'not exactly one tool is next').toHaveCount(1);
    // The next tool is the phase contract's, in the tool order: Economics after Analyze (ADR-128 (5)).
    expect(nextPhaseKey(steps)).toBe('tco');
    await expect(bar.locator('a[data-workspace-tool-next]')).toHaveAttribute('data-workspace-tool', 'tco');
    await expect(bar.locator('a[data-workspace-tool="tco"] [data-workspace-tool-next-tag]')).toBeVisible();
  });

  test('a stale Analyze: no check, the amber dot, "out of date" in words; a started Design wears the half circle, not a check', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const steps = expectedSteps(STALE, staleDoc(acct.uid), RUN_S, staleRun(STALE, acct.uid, RUN_S));
    expect(steps.find((s) => s.key === 'analyze')?.state, 'the fixture is not stale').toBe('stale');

    await open(page, STALE, 'management');
    const marks = await shown(page, '[data-stage-tools="open"]');
    expect(marks.map((m) => [m.key, m.state, m.meaning, m.kind])).toEqual(
      steps.map((s) => [s.key, s.state, toolMark(s).meaning, toolMark(s).kind]),
    );
    const staleKeys = steps.filter((s) => s.state === 'stale').map((s) => s.key);
    expect(staleKeys, 'the fixture has nothing stale').toContain('analyze');
    expect(marks.filter((m) => m.dots === 1 && m.checks === 0).map((m) => m.key), 'a stale tool without its dot').toEqual(staleKeys);
    // The dot explains itself in words — the description, not a hover tooltip.
    for (const m of marks.filter((x) => x.dots > 0)) {
      await expect(
        page.locator(`[data-stage-tools="open"] a[data-workspace-tool="${m.key}"]`),
        `${m.key}: the dot explains itself`,
      ).toHaveAccessibleDescription(/Out of date — inputs changed since/);
    }
    expect(
      marks.filter((m) => m.checks > 0).map((m) => m.key),
      'a check on an out-of-date tool, or none on a used one',
    ).toEqual(steps.filter((s) => toolMark(s).kind === 'check').map((s) => s.key));
    // Design is on record and current, and awaiting its sign-off: started, not done.
    expect(steps.find((s) => s.key === 'design')?.state, 'the fixture\'s design is not partial').toBe('partial');
    expect(marks.find((m) => m.key === 'design')?.checks, 'a design awaiting its sign-off carries a check').toBe(0);
    expect(marks.find((m) => m.key === 'design')?.halves, 'Design is started').toBe(1);

    const analyze = page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze.locator('[data-workspace-tool-mark="dot"]')).toHaveCount(1);
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.stale'));
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]')).toHaveAccessibleName(
      named('Design', 'tools.mark.started'),
    );
    // The half circle is the information ink, never the success green.
    const [half, information, success] = await page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]').evaluate((el) => {
      const toRgb = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      };
      const root = getComputedStyle(document.documentElement);
      return [
        getComputedStyle(el.querySelector('[data-workspace-tool-mark="half"]') as Element).color,
        toRgb(root.getPropertyValue('--cc-information').trim()),
        toRgb(root.getPropertyValue('--cc-success').trim()),
      ];
    });
    expect(half).toBe(information);
    expect(half).not.toBe(success);
    // The dot is the warning mark, and the legend shows the same one.
    const [dot, legendDot] = await analyze.evaluate((el) => [
      getComputedStyle(el.querySelector('[data-workspace-tool-mark="dot"]') as Element).backgroundColor,
      getComputedStyle(document.querySelector('[data-tools-legend="bar"] span[aria-hidden]') as Element).backgroundColor,
    ]);
    expect(dot).not.toBe('rgba(0, 0, 0, 0)');
    expect(legendDot).toBe(dot);
  });

  test('a phone at 390: the tool strip in every view, "1 of 7", the marks in words, no sideways scroll', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    // The tools' family (ADR-140, UX review 22.11.2026, Q9, Q12, L5) replaced the phone menu: the same strip as on a
    // desktop, at every width and in every view, "1 of 7" where "Tools" stands, every tool with its mark. What the
    // menu said as text stays with each link: the mark in its accessible name, the purpose as its description.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await signInThroughForm(page, acct);
    for (const view of ['management', 'it'] as const) {
      await open(page, ANALYZED, view);
      const strip = page.locator('[data-stage-tools="open"]');
      await expect(strip, `${view}: no tool strip on a phone`).toBeVisible();
      await expect(page.locator('[data-stage-tools="menu"]'), `${view}: a menu beside the strip`).toHaveCount(0);
      await expect(strip.locator('[data-stage-tools-position]')).toBeVisible();
      await expect(strip.locator('[data-stage-tools-position]')).toContainText('1 of 7');
      await expect(strip.locator('a[data-workspace-tool]')).toHaveCount(7);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${view}: the page scrolls sideways at 390 px`).toBeLessThanOrEqual(0);
    }
    const strip = page.locator('[data-stage-tools="open"]');
    // The mark is never colour alone: its meaning is in the name, the check stands visible on Analyze.
    await expect(strip.locator('a[data-workspace-tool="analyze"]')).toHaveAccessibleName(named('Analyze', 'tools.mark.done'));
    await expect(strip.locator('a[data-workspace-tool="analyze"] [data-workspace-tool-mark="check"]')).toBeVisible();
    await expect(strip.locator('a[data-workspace-tool="design"]')).toHaveAccessibleName('Design');
    // Every tool still says what it is for, as its description.
    const designGuide = await strip.locator('a[data-workspace-tool="design"]').evaluate(
      (el) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '',
    );
    expect(designGuide).toContain(PHASE_PURPOSE.design);
    // O8 (plan AB-4): an analysis-only reader in a fresh browser sees no "Next" tag until a later tool was opened.
    await expect(strip.locator('a[data-workspace-tool-next]')).toHaveCount(0);
    await expect(strip.locator('[data-workspace-tool-next-tag]')).toHaveCount(0);
    await context.close();
  });

  test('on a touch screen every tool is a 44 px target and carries its purpose, with no hover and no "i"', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    // A tablet in landscape, no hover at all. The tools' family (ADR-140, UX review 22.11.2026, Q9, Q12) dropped the
    // hint line and its "What the tools do" disclosure: what each tool is for is its link's description, which a
    // screen reader says and nothing has to be tapped open for; no "i" after each (owner 04.10.2026).
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signInThroughForm(page, acct);
    await open(page, ANALYZED, 'management');
    const bar = page.locator('[data-stage-tools="open"]');
    await expect(bar).toBeVisible();
    await expect(bar.locator('button[data-info-popover^="tool-"]'), 'a per-tool "i" is back').toHaveCount(0);
    const tools = bar.locator('a[data-workspace-tool]');
    await expect(tools).toHaveCount(7);
    const looks = await tools.evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-workspace-tool') ?? '',
        height: el.getBoundingClientRect().height,
        guide: document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '',
      })),
    );
    for (const t of looks) {
      // The target grows to 44 px under a coarse pointer (DESIGN.md §2.9, Q12).
      expect(t.height, `${t.key}: a ${t.height} px target on a touch screen`).toBeGreaterThanOrEqual(44);
    }
    expect(looks.find((t) => t.key === 'testing')?.guide).toContain(PHASE_PURPOSE.testing);
    // O8 (ADR-118): an analysis-only reader in a fresh browser is recommended no later tool until one was opened.
    const design = looks.find((t) => t.key === 'design')?.guide ?? '';
    expect(design).toContain(PHASE_PURPOSE.design);
    expect(design).not.toContain(WORKSPACE_MESSAGES['toolGuide.recommended']);
    await context.close();
  });

  test('between the breakpoints Management carries the same tool strip, and no menu (M, 900 px)', async ({ page }) => {
    // The menu between the breakpoints went with the tools' family (ADR-140, UX review 22.11.2026, Q9): one strip at
    // every width, never two navigations at once.
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 900, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, ANALYZED, 'management');
    await expect(page.locator('[data-stage-tools="open"]')).toBeVisible();
    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool]')).toHaveCount(7);
    await expect(page.locator('[data-stage-tools="menu"]')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'the page scrolls sideways at 900 px').toBeLessThanOrEqual(0);
  });
});
