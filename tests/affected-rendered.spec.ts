import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Release 3.0.21, test-quality measure 3: before a push, the rendered specs
 * that open a changed page or call a changed route run against a production
 * build (scripts/test/affected-rendered.mjs; docs/QA-REVIEW-LOOP.md). Here the
 * mapping, on a fixture diff and fixture specs. Server-free.
 */
const ROOT = path.resolve(__dirname, '..');
const lib = () => import(path.join(ROOT, 'scripts/test/affected-rendered.mjs'));

const APP = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/(app)/layout.tsx',
  'app/(app)/dashboard/page.tsx',
  'app/(app)/demo/workspace/page.tsx',
  'app/(app)/demo/[stage]/page.tsx',
  'app/(app)/project/[projectId]/layout.tsx',
  'app/(app)/project/[projectId]/page.tsx',
  'app/(app)/project/[projectId]/analyze/page.tsx',
  'app/(app)/project/[projectId]/analyze/FindingsPanel.tsx',
  'app/(app)/project/[projectId]/tco/page.tsx',
  'app/api/runs/create/route.ts',
  'app/api/projects/[projectId]/process-states/route.ts',
  'app/docs/[...slug]/page.tsx',
];

const SPECS = new Map<string, string>([
  ['tests/analyze-open.spec.ts', "test('x', async ({ page }) => { await page.goto(`/project/${acct.projectId}/analyze?view=it`); });"],
  ['tests/tco-open.spec.ts', "test('x', async ({ page }) => { await page.goto(`/project/${id}/tco#costs`); });"],
  ['tests/runs-route.spec.ts', "test('x', async ({ request }) => { const r = await request.post('/api/runs/create', { data: {} }); });"],
  ['tests/states-fetch.spec.ts', "const BASE = 'http://localhost:3000';\nawait fetch(`${BASE}/api/projects/${id}/process-states`, { method: 'POST' });"],
  ['tests/demo-literal.spec.ts', "test('x', async ({ page }) => { await page.goto('/demo/workspace'); });"],
  ['tests/demo-stage.spec.ts', "test('x', async ({ page }) => { await page.goto('/demo/analyze'); });"],
  ['tests/docs-deep.spec.ts', "const DOCS_PATH = '/docs/a/b';\ntest('x', async ({ page }) => { await page.goto(DOCS_PATH); });"],
  ['tests/landing.spec.ts', "test('x', async ({ page }) => { await page.goto('/'); });"],
  ['tests/pure-unit.spec.ts', "import { f } from '../lib/f';\ntest('x', () => { expect(f('/project/a/analyze')).toBe(1); });"],
  ['tests/changed-rendered.spec.ts', "test('x', async ({ page }) => { await page.click('a'); });"],
  ['tests/core-one.spec.ts', "test('x', async ({ page }) => { await page.goto('/dashboard'); });"],
]);

async function pick(changed: string[]) {
  const { affectedSpecs } = await lib();
  return affectedSpecs({ changed, appFiles: APP, specs: SPECS, core: ['tests/core-one.spec.ts', 'tests/gone.spec.ts'] }) as { spec: string; reasons: string[] }[];
}
const names = (r: { spec: string }[]) => r.map((x) => x.spec);

test('the paths a spec opens or calls: goto, request, fetch behind a base, and named constants', async () => {
  const { specPaths } = await lib();
  expect(specPaths(SPECS.get('tests/analyze-open.spec.ts')!)).toEqual(['/project/${acct.projectId}/analyze']);
  expect(specPaths(SPECS.get('tests/states-fetch.spec.ts')!)).toEqual(['/api/projects/${id}/process-states']);
  expect(specPaths(SPECS.get('tests/docs-deep.spec.ts')!)).toEqual(['/docs/a/b']);
  // A path in an assertion is not a page the spec opens; an emulator URL is not ours.
  expect(specPaths(SPECS.get('tests/pure-unit.spec.ts')!)).toEqual([]);
  expect(specPaths("await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects`)")).toEqual([]);
});

test('a changed page selects the specs that open it, by Next precedence, plus the core list', async () => {
  const r = await pick(['app/(app)/project/[projectId]/analyze/page.tsx']);
  expect(names(r)).toEqual(['tests/analyze-open.spec.ts', 'tests/core-one.spec.ts']);
  expect(r[0].reasons).toEqual(['/project/${acct.projectId}/analyze → app/(app)/project/[projectId]/analyze/page.tsx']);
  // A core spec that no longer exists is not invented.
  expect(r[1].reasons).toEqual(['core list (run 39857130588)']);

  // /demo/workspace is the static page, not demo/[stage]; /demo/analyze is demo/[stage].
  expect(names(await pick(['app/(app)/demo/[stage]/page.tsx']))).toEqual(['tests/core-one.spec.ts', 'tests/demo-stage.spec.ts']);
  expect(names(await pick(['app/(app)/demo/workspace/page.tsx']))).toEqual(['tests/core-one.spec.ts', 'tests/demo-literal.spec.ts']);
  // A catch-all takes the deeper path.
  expect(names(await pick(['app/docs/[...slug]/page.tsx']))).toEqual(['tests/core-one.spec.ts', 'tests/docs-deep.spec.ts']);
});

test('a changed route handler selects the specs that call it, with request or fetch', async () => {
  expect(names(await pick(['app/api/runs/create/route.ts']))).toEqual(['tests/core-one.spec.ts', 'tests/runs-route.spec.ts']);
  expect(names(await pick(['app/api/projects/[projectId]/process-states/route.ts']))).toEqual(['tests/core-one.spec.ts', 'tests/states-fetch.spec.ts']);
});

test('a layout or a colocated module counts for every page beneath it; the root layout for every opened page', async () => {
  expect(names(await pick(['app/(app)/project/[projectId]/layout.tsx']))).toEqual(['tests/analyze-open.spec.ts', 'tests/core-one.spec.ts', 'tests/tco-open.spec.ts']);
  expect(names(await pick(['app/(app)/project/[projectId]/analyze/FindingsPanel.tsx']))).toEqual(['tests/analyze-open.spec.ts', 'tests/core-one.spec.ts']);
  const root = names(await pick(['app/layout.tsx']));
  for (const s of ['tests/analyze-open.spec.ts', 'tests/landing.spec.ts', 'tests/runs-route.spec.ts', 'tests/demo-literal.spec.ts']) expect(root).toContain(s);
  expect(root).not.toContain('tests/pure-unit.spec.ts');
});

test('a deleted page still selects the specs that open it; a changed rendered spec selects itself; lib changes only the core list', async () => {
  expect(names(await pick(['app/(app)/old/page.tsx']))).toEqual(['tests/core-one.spec.ts']);
  const { affectedSpecs } = await lib();
  const withOld = affectedSpecs({
    changed: ['app/(app)/old/page.tsx'],
    appFiles: APP,
    specs: new Map([['tests/old.spec.ts', "test('x', async ({ page }) => { await page.goto('/old'); });"]]),
    core: [],
  });
  expect(withOld).toEqual([{ spec: 'tests/old.spec.ts', reasons: ['/old → app/(app)/old/page.tsx'] }]);

  expect(names(await pick(['tests/changed-rendered.spec.ts', 'tests/pure-unit.spec.ts']))).toEqual(['tests/changed-rendered.spec.ts', 'tests/core-one.spec.ts']);
  expect(names(await pick(['lib/abap/evidence-model.ts']))).toEqual(['tests/core-one.spec.ts']);
  // middleware.ts sits in front of every request.
  expect(names(await pick(['middleware.ts'])).length).toBe(9);
});

test('the commands are a production emulator build, then the specs with CI=1', async () => {
  const { commandsFor, CORE_SPECS } = await lib();
  expect(commandsFor(['tests/a.spec.ts', 'tests/b.spec.ts'])).toEqual([
    'NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run build',
    'CI=1 npx playwright test tests/a.spec.ts tests/b.spec.ts',
  ]);
  // The core list is the 25 spec files that failed in run 39857130588, and each still exists.
  expect(CORE_SPECS.length).toBe(25);
  for (const s of CORE_SPECS) expect(fs.existsSync(path.join(ROOT, s)), s).toBe(true);
});

test('the server-free config is versioned, and the local name keeps working', () => {
  const versioned = fs.readFileSync(path.join(ROOT, 'playwright.serverfree.config.ts'), 'utf8');
  expect(versioned).toContain("import base from './playwright.config';");
  expect(versioned).toContain('webServer: undefined');
  const doc = fs.readFileSync(path.join(ROOT, 'docs/QA-REVIEW-LOOP.md'), 'utf8');
  expect(doc).toContain('npx playwright test -c playwright.serverfree.config.ts');
  expect(doc).toContain('playwright.serverfree.local.config.ts');
  expect(doc).toContain('node scripts/test/affected-rendered.mjs');
});
