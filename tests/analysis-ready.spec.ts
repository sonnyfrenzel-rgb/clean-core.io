import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  ANALYSIS_READ_EVENT,
  ANALYSIS_READ_KEY,
  DEMO_ANALYSIS_KEY,
  analysisKeyOfBase,
  analysisRead,
  analysisReadyResult,
  markAnalysisRead,
  resultOfWorklist,
  resultReadyTag,
} from '../lib/analysis-read';
import { demoAnalysisReady, hubAnalysisReady } from '../lib/messages/workspace-shell';
import type { WorklistItem } from '../lib/types';

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
 * Server-free: the pure rules, the browser storage against a stand-in
 * `window`, and the source lines that keep it an addition. The rendered half
 * (the hint appears, Analyze is opened, the hint is gone) is in
 * `tests/workspace-hub.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function item(over: Partial<WorklistItem>): WorklistItem {
  return {
    id: 'f',
    title: 't',
    category: 'Finding',
    location: 'Z.abap:1',
    recommendation: '',
    status: 'open',
    effort: 'Low',
    ...over,
  };
}

test.describe('the analysis-ready rules (pure)', () => {
  test('only a done Analyze with a signed run has a result to point at', () => {
    const worklist = [item({ severity: 'High' }), item({ severity: 'Low' })];
    expect(analysisReadyResult({ analyzeState: 'done', hasSignedRun: true, worklist })).toEqual({ findings: 2, high: 1 });
    // Analyze is itself the next step in each of these — already named, nothing to add.
    for (const state of ['empty', 'partial', 'stale'] as const) {
      expect(analysisReadyResult({ analyzeState: state, hasSignedRun: true, worklist })).toBeNull();
    }
    expect(analysisReadyResult({ analyzeState: 'done', hasSignedRun: false, worklist })).toBeNull();
    expect(analysisReadyResult({ analyzeState: undefined, hasSignedRun: true, worklist })).toBeNull();
  });

  test('the figures count findings, not the model’s functional gaps, and say nothing without a worklist', () => {
    const worklist = [
      item({ severity: 'High' }),
      item({ severity: 'High' }),
      item({ severity: 'Medium' }),
      item({ category: 'Functional Gap', severity: 'High' }),
    ];
    expect(resultOfWorklist(worklist)).toEqual({ findings: 3, high: 2 });
    expect(resultOfWorklist(undefined)).toEqual({ findings: null, high: null });
    expect(resultOfWorklist([])).toEqual({ findings: 0, high: 0 });
  });

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

  test('the sentences carry the run’s figures and never invent one', () => {
    expect(hubAnalysisReady(25, 4)).toBe('25 findings in the signed run, 4 of them high severity. Analyze shows each one with its line in the code.');
    expect(hubAnalysisReady(1, 0)).toBe('1 finding in the signed run. Analyze shows each one with its line in the code.');
    expect(hubAnalysisReady(0, 0)).toMatch(/no finding/);
    expect(hubAnalysisReady(null, null)).not.toMatch(/\d/);
    expect(demoAnalysisReady(25, 4)).toBe('25 findings in the example, 4 of them high severity — a demo run, unsigned. Analyze shows each one with its line in the code.');
    expect(demoAnalysisReady(25, 4)).toMatch(/unsigned/);
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
    for (const rel of ['lib/analysis-read.ts', 'hooks/useAnalysisRead.ts', 'components/workspace/AnalysisReady.tsx']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/firebase|getDb|setDoc|updateDoc|fetch\(|\/api\//);
    }
  });

  test('the phase contract does not read it', () => {
    for (const rel of ['lib/workflow-steps.ts', 'lib/next-step.ts', 'lib/business-next-step.ts', 'lib/workspace-model.ts']) {
      expect(read(rel), rel).not.toMatch(/analysis-read|analysisRead/);
    }
  });

  test('the workspace reads Analyze’s state from the tools it already has, and the hub gets the result', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell).toMatch(/analysisReadyResult\(\{\s*analyzeState: tools\.find\(\(t\) => t\.key === 'analyze'\)\?\.state/);
    expect(shell).toContain('analysis={analysisResult}');
    const hub = read('components/workspace/WorkspaceHub.tsx');
    expect(hub).toContain('<AnalysisReady');
    // The next step of the hub is still the one "Next step" at the top decided.
    expect(hub).toContain('const next = nextPhaseKey(tools);');
  });

  test('the action is secondary — the page keeps its one primary in "Next step"', () => {
    const src = read('components/workspace/AnalysisReady.tsx');
    expect(src).toContain('variant="secondary"');
    expect(src).not.toMatch(/variant="primary"/);
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
    expect(page).toMatch(/router\.push\(`\/project\/\$\{projectId\}\?first=1`\);\s*\} else \{[\s\S]{0,300}markAnalysisRead\(projectId as string\);/);
  });

  test('the demo is the twin: /demo/analyze marks it, the demo workspace points at it', () => {
    expect(read('components/demo/DemoWorkspace.tsx')).toContain("if (stage === 'analyze') markAnalysisRead(DEMO_ANALYSIS_KEY);");
    const shell = read('components/demo/DemoWorkspaceShell.tsx');
    expect(shell).toContain('<AnalysisReady');
    expect(shell).toContain("p.key === 'analyze' && !demoAnalysisRead ? <ResultReadyTag /> : null");
  });
});
