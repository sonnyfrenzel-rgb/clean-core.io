import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { isStaleBuildError, reloadOnceForStaleBuild } from '../lib/stale-build';

/**
 * A tab opened before a deploy must not run two builds at once (owner,
 * 02./03.10.2026: "(0 , j.getAuth) is not a function" when starting an example,
 * then "Cannot read properties of undefined (reading 'call')" on /dashboard,
 * both on dev right after a deploy, neither reproducible on a fresh load).
 *
 * Two layers hold it: Next's skew protection, which needs a deployment id that
 * changes with every deploy, and the error boundary, which reloads once when
 * the mix shows up anyway.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test('the build carries a deployment id from the environment', () => {
  expect(read('next.config.mjs')).toMatch(/deploymentId:\s*process\.env\.NEXT_DEPLOYMENT_ID\s*\|\|\s*undefined/);
});

test('the deploy sets the deployment id at build time, to the commit', () => {
  const buildVars = read('.github/workflows/deploy.yml')
    .split('\n')
    .find((line) => line.includes('--set-build-env-vars='));
  expect(buildVars, 'no build variables in the deploy step').toBeTruthy();
  expect(buildVars).toContain('NEXT_DEPLOYMENT_ID=${{ github.sha }}');
});

test('the error boundary reloads once on the two mixed-build errors, and on nothing else new', async () => {
  const src = read('lib/stale-build.ts');
  const m = src.match(/\/reading 'call'\\\)\|\^\\\(0\\s\*,\\s\*\[\\w\$\]\+\\\.\[\\w\$\]\+\\\) is not a function\//);
  expect(m, 'the mixed-build pattern is gone from lib/stale-build.ts').toBeTruthy();
  const pattern = /reading 'call'\)|^\(0\s*,\s*[\w$]+\.[\w$]+\) is not a function/;
  expect(pattern.test("Cannot read properties of undefined (reading 'call')")).toBe(true);
  expect(pattern.test('(0 , j.getAuth) is not a function')).toBe(true);
  expect(pattern.test('(0 , $.xI) is not a function')).toBe(true);
  // An ordinary bug is not reloaded away.
  expect(pattern.test("Cannot read properties of undefined (reading 'name')")).toBe(false);
  expect(pattern.test('foo is not a function')).toBe(false);
  // The loop guard is still there.
  expect(src).toContain("const KEY = 'cc_chunk_reload_at';");
  expect(src).toMatch(/Date\.now\(\) - last > 10000/);
});

/**
 * Roadmap 3.0.6 (decision Sonny, 07.10.2026): a tab from the previous build says
 * so. After the 3.0.5 deploy an open 3.0.4 tab showed "Something went wrong!" and
 * "(0 , j.getAuth) is not a function" — it read like a crash. Every boundary that
 * recovers from a stale chunk now shares one matcher and, while the reload lands
 * or once it is spent, shows the new-version card with a reload button.
 */
test.describe('a tab from the previous build says so', () => {
  const BOUNDARIES = [
    'app/error.tsx',
    'app/(app)/project/[projectId]/documentation/error.tsx',
    'app/(app)/project/[projectId]/testing/error.tsx',
  ];

  test('the matcher knows stale chunks and mixed builds, and nothing else', async () => {
    for (const message of [
      'Loading chunk 123 failed.',
      'Failed to fetch dynamically imported module: https://clean-core.io/_next/static/chunks/x.js',
      "Cannot read properties of undefined (reading 'call')",
      '(0 , j.getAuth) is not a function',
    ]) {
      expect(isStaleBuildError(new Error(message)), message).toBe(true);
    }
    const chunk = new Error('x');
    chunk.name = 'ChunkLoadError';
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isStaleBuildError(new Error('foo is not a function'))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  test('the reload is attempted once and then reported as spent', async () => {
    const store = new Map<string, string>();
    let reloads = 0;
    const g = globalThis as unknown as Record<string, unknown>;
    const hadWindow = 'window' in g;
    const prevStorage = g.sessionStorage;
    g.window = { location: { reload: () => { reloads += 1; } } };
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    try {
      expect(reloadOnceForStaleBuild()).toBe(true);
      expect(reloadOnceForStaleBuild(), 'a second reload inside ten seconds would loop').toBe(false);
      expect(reloads).toBe(1);
    } finally {
      if (!hadWindow) delete g.window;
      g.sessionStorage = prevStorage;
      if (prevStorage === undefined) delete g.sessionStorage;
    }
  });

  for (const file of BOUNDARIES) {
    test(`${file} uses the shared matcher and shows the new-version card`, () => {
      const src = read(file);
      expect(src).toContain("from '@/lib/stale-build'");
      expect(src).toMatch(/const staleBuild = isStaleBuildError\(error\);/);
      expect(src).toMatch(/if \(staleBuild\) reloadOnceForStaleBuild\(\);/);
      // The card comes before the crash card, so a stale build never reaches the raw message.
      const notice = src.indexOf('<NewVersionAvailable />');
      expect(notice, 'no new-version card').toBeGreaterThan(-1);
      expect(src.indexOf('if (staleBuild) {')).toBeGreaterThan(-1);
      expect(src.indexOf('if (staleBuild) {')).toBeLessThan(notice);
      expect(notice).toBeLessThan(src.indexOf('error.message'));
      // No copy of the matcher left behind to drift.
      expect(src).not.toContain('/Loading chunk [');
    });
  }

  test('the card says what happened and offers the reload, without the raw message', () => {
    const src = read('components/NewVersionAvailable.tsx');
    expect(src).toContain('A new version of Clean-Core.io is available');
    expect(src).toMatch(/onClick=\{\(\) => window\.location\.reload\(\)\}/);
    expect(src).not.toMatch(/\berror\.message\b/);
    expect(src).not.toMatch(/Something went wrong/);
  });
});
