import { expect, test, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import {
  ANALYSIS_READ_EVENT,
  ANALYSIS_READ_KEY,
  DEMO_ANALYSIS_KEY,
  analysisKeyOfBase,
  analysisRead,
  markAnalysisRead,
  resultReadyTag,
} from '../lib/analysis-read';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * "Your analysis is ready" — ADR-090, owner 10.10.2026.
 *
 * On the Business view of Z_MM_PO_APPROVAL the hub's "Continue with" names
 * Design, correctly — Analyze is done — and a first-time reader walks from the
 * Business view straight past the Analyze tool. Until this browser has opened
 * Analyze once for the project, the Analyze tool carries "Result ready" and
 * the hub one line with the signed run's figures. The phase contract is not
 * touched: Analyze stays done and the next step stays Design.
 *
 * Since v3.1.0 (AB-2) the project opens on Analyze itself and the hub with its
 * "Your analysis is ready" line is gone with the workspace's Business view; the
 * "Result ready" tag on the Analyze tool stays (the IT and Management tool bars,
 * the stage tool bars).
 *
 * The pure rules, the browser storage against a stand-in `window`, and the
 * source lines that keep it an addition are server-free. The rendered half
 * (the tag stands in the IT view's tool bar, Analyze is opened, the tag is
 * gone) moved here from the retired `tests/workspace-hub.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the analysis-ready rules (pure)', () => {
  // The work area's line ("Your analysis is ready", its figures and its sentences, `analysisReadyResult`,
  // `resultOfWorklist`) retired with the hub and the demo workspace's Business view in v3.1.0 (AB-2, O10).
  test('the tag stands on the Analyze tool only, while done and unread', () => {
    expect(resultReadyTag({ key: 'analyze', state: 'done' }, false)).toBe(true);
    expect(resultReadyTag({ key: 'analyze', state: 'done' }, true)).toBe(false);
    expect(resultReadyTag({ key: 'analyze', state: 'partial' }, false)).toBe(false);
    expect(resultReadyTag({ key: 'design', state: 'done' }, false)).toBe(false);
  });

  test('a stage bar finds its key in its base', () => {
    expect(analysisKeyOfBase('/demo')).toBe(DEMO_ANALYSIS_KEY);
    expect(analysisKeyOfBase('/project/abc-123')).toBe('abc-123');
    expect(analysisKeyOfBase('/project/a%20b')).toBe('a b');
    expect(analysisKeyOfBase('/project/abc/analyze')).toBeNull();
    expect(analysisKeyOfBase('/elsewhere')).toBeNull();
  });
});

test.describe('the analysis-ready state lives in this browser only', () => {
  type Win = { localStorage: Storage; dispatchEvent: (e: Event) => boolean };
  const g = globalThis as unknown as { window?: Win };
  let saved: Win | undefined;
  let events: string[];

  function fakeStorage(throwing = false): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => {
        if (throwing) throw new Error('blocked');
        return map.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throwing) throw new Error('blocked');
        map.set(k, v);
      },
      removeItem: (k: string) => void map.delete(k),
    };
  }

  test.beforeEach(() => {
    saved = g.window;
    events = [];
  });
  test.afterEach(() => {
    g.window = saved;
  });

  test('unread until marked, per project, and the mark tells the open page', () => {
    g.window = { localStorage: fakeStorage(), dispatchEvent: (e) => (events.push(e.type), true) };
    expect(analysisRead('p1')).toBe(false);
    markAnalysisRead('p1');
    expect(analysisRead('p1')).toBe(true);
    expect(analysisRead('p2')).toBe(false);
    expect(events).toEqual([ANALYSIS_READ_EVENT]);
    // A second mark changes nothing and says nothing.
    markAnalysisRead('p1');
    expect(events).toHaveLength(1);
    expect(JSON.parse(g.window.localStorage.getItem(ANALYSIS_READ_KEY) ?? '[]')).toEqual(['p1']);
  });

  test('bounded to the last fifty projects', () => {
    g.window = { localStorage: fakeStorage(), dispatchEvent: () => true };
    for (let i = 0; i < 60; i += 1) markAnalysisRead(`p${i}`);
    const ids = JSON.parse(g.window.localStorage.getItem(ANALYSIS_READ_KEY) ?? '[]') as string[];
    expect(ids).toHaveLength(50);
    expect(analysisRead('p0')).toBe(false);
    expect(analysisRead('p59')).toBe(true);
  });

  test('blocked storage answers "read", so a marker that cannot be cleared is never shown', () => {
    g.window = { localStorage: fakeStorage(true), dispatchEvent: () => true };
    expect(analysisRead('p1')).toBe(true);
    expect(() => markAnalysisRead('p1')).not.toThrow();
  });
});

test.describe('the hint is an addition, never a phase state (source)', () => {
  test('nothing of it reaches the project, the run or the account', () => {
    for (const rel of ['lib/analysis-read.ts', 'hooks/useAnalysisRead.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/firebase|getDb|setDoc|updateDoc|fetch\(|\/api\//);
    }
  });

  test('the phase contract does not read it', () => {
    for (const rel of ['lib/workflow-steps.ts', 'lib/next-step.ts', 'lib/business-next-step.ts', 'lib/workspace-model.ts']) {
      expect(read(rel), rel).not.toMatch(/analysis-read|analysisRead/);
    }
  });

  // The hub ("Continue with" and its "Your analysis is ready" line) retired with the workspace's
  // Business view in v3.1.0 (AB-2, ADR-090 retired): the project opens on Analyze itself.
  test('the workspace has no hub any more, and reads no analysis-ready result', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/workspace/WorkspaceHub.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'components/workspace/AnalysisReady.tsx'))).toBe(false);
    expect(read('components/workspace/WorkspaceShell.tsx')).not.toMatch(/analysisReadyResult|WorkspaceHub|AnalysisReady/);
  });

  test('the tool bar tags Analyze from the phase contract and leaves "Next" where it was', () => {
    const bar = read('components/workspace/ToolBar.tsx');
    expect(bar).toContain('resultReadyTag(tool, analysisRead)');
    expect(bar).toContain('const next = nextPhaseKey(tools);');
    expect(bar).toContain('readKey={projectId}');
    expect(bar).toContain('readKey={analysisKeyOfBase(base)}');
  });

  test('Analyze marks it read only with a result on the page, never on a first run that goes on to the workspace', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    const calls = page.match(/markAnalysisRead\(/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(page).toContain('if (hydratedProject.activeRunId?.trim()) markAnalysisRead(projectId as string);');
    // A first run goes on to the project's entry, Analyze in the Business view, since AB-2 (ADR-109).
    expect(page).toMatch(/router\.push\(`\/project\/\$\{projectId\}\/analyze\?first=1`\);\s*\} else \{[\s\S]{0,300}markAnalysisRead\(projectId as string\);/);
  });

  test('the demo is the twin: its Analyze stage marks it, the demo workspace\'s stage row tags it', () => {
    expect(read('components/demo/DemoWorkspace.tsx')).toContain("if (stage === 'analyze') markAnalysisRead(DEMO_ANALYSIS_KEY);");
    const shell = read('components/demo/DemoWorkspaceShell.tsx');
    expect(shell).not.toContain('AnalysisReady');
    expect(shell).toContain("p.key === 'analyze' && !demoAnalysisRead ? <ResultReadyTag /> : null");
  });
});

test.describe('rendered: the Analyze tool says "Result ready" until Analyze has been opened once', () => {
  const PO = fs.readFileSync(path.resolve('public/starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let projectId = '';

  async function idToken(email: string, password: string): Promise<string> {
    const res = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
    );
    return ((await res.json()) as { idToken: string }).idToken;
  }

  async function withoutTips(page: Page) {
    await page.addInitScript(
      ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
      [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
    );
  }

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'ready-tag', acceptTerms: true });
    const token = await idToken(account.email, account.password);
    projectId = `${account.projectId}-po`;
    await adminSetDoc('projects', projectId, {
      name: 'Z_MM_PO_APPROVAL',
      userId: account.uid,
      createdAt: new Date(),
      status: 'created',
      legacyCode: PO,
    });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, s4Deployment: 'private', analysis: '', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' }),
    });
    expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
  });

  test('the IT view\'s tool bar tags Analyze, opening it clears the tag, and the phase does not move', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90_000 });

    const analyzeTool = page.locator('[data-workspace-tools="open"] [data-workspace-tool="analyze"]');
    await expect(analyzeTool).toHaveAttribute('data-phase-state', 'done', { timeout: 60_000 });
    await expect(analyzeTool).toHaveAttribute('data-workspace-tool-unread', '');
    await expect(analyzeTool.locator('[data-workspace-tool-result-ready]')).toHaveText('Result ready');

    // Analyze with its result on the page marks it read (IT keeps today's score page until AB-9).
    await page.goto(`/project/${projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 90_000 });
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('cc.workspace.analysis.read') ?? ''), { timeout: 60_000 })
      .toContain(projectId);

    // Back in the workspace the tag is gone; the phase is as it was.
    await page.goto(`/project/${projectId}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90_000 });
    await expect(analyzeTool).toHaveAttribute('data-phase-state', 'done', { timeout: 60_000 });
    await expect(analyzeTool).not.toHaveAttribute('data-workspace-tool-unread', '');
    await expect(page.locator('[data-workspace-tool-result-ready]')).toHaveCount(0);
  });
});
