import fs from 'fs';
import path from 'path';
import { test as playwrightTest } from '@playwright/test';
import { test, expect } from './helpers/test';

/**
 * Roadmap 3.0.18 — the emulator's abandoned-channel hang.
 *
 * Playwright's own `context` fixture closes the context with its pages open, so
 * `pagehide` never fires at the end of a test and the Firestore terminate in
 * `lib/firebase.ts` never runs: every test that used `page` left its last
 * page's channel open in the emulator. `tests/helpers/test.ts` closes the
 * pages first. This file keeps every spec on that helper and proves, in a real
 * browser and without a server, that its teardown fires `pagehide` and that the
 * built-in one does not.
 */

const TESTS_DIR = path.resolve(__dirname);
const SELF = 'test-helper-guard.spec.ts';

function specFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : specFiles(full);
    return e.name.endsWith('.spec.ts') ? [full] : [];
  });
}

/** A test, hook or fixture callback that destructures `page` or `context`. */
const USES_BROWSER_FIXTURE = /async\s*\(\s*\{[^}]*\b(page|context)\b[^}]*\}/;

/**
 * `test` imported from Playwright directly — under its own name or an alias, through the namespace
 * (`import * as pw` → `pw.test`) or as the default export, which is Playwright's `test` (QA review of 62eae6a082bb).
 */
function importsPlaywrightTest(source: string): boolean {
  const named = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@playwright\/test['"]/g)].some((m) =>
    m[1].split(',').some((spec) => /^(?!type\s)\s*test\b/.test(spec.trim())),
  );
  // `import * as pw from …`, `import pw from …`, `import pw, { expect } from …` — never `import type …`.
  const whole = /import\s+(?!type\s)(?:\*\s+as\s+\w+|\w+\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s*['"]@playwright\/test['"]/.test(source);
  return named || whole;
}

test.describe('every spec that opens a page closes it at teardown', () => {
  test('no spec that uses `page` or `context` imports `test` from @playwright/test', () => {
    const users: string[] = [];
    const offenders: string[] = [];
    for (const file of specFiles(TESTS_DIR)) {
      const rel = path.relative(TESTS_DIR, file).replace(/\\/g, '/');
      if (rel === SELF) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (!USES_BROWSER_FIXTURE.test(source)) continue;
      users.push(rel);
      if (importsPlaywrightTest(source)) offenders.push(rel);
    }
    // Not vacuous: the detection finds the specs it is about (200 on 18.10.2026).
    expect(users.length).toBeGreaterThan(100);
    expect(
      offenders,
      `import { test, expect } from './helpers/test' (or '../helpers/test') in:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('the guard recognises the imports and the fixture use it is about', () => {
    expect(importsPlaywrightTest("import { test, expect } from '@playwright/test';")).toBe(true);
    expect(importsPlaywrightTest("import { expect, test as base, type Page } from '@playwright/test';")).toBe(true);
    expect(importsPlaywrightTest('import {\n  test,\n  expect,\n} from "@playwright/test";')).toBe(true);
    expect(importsPlaywrightTest("import { expect, type Page } from '@playwright/test';")).toBe(false);
    expect(importsPlaywrightTest("import { test, expect } from './helpers/test';")).toBe(false);
    // QA review of 62eae6a082bb: the namespace and the default export reach Playwright's `test` too.
    expect(importsPlaywrightTest("import * as pw from '@playwright/test';")).toBe(true);
    expect(importsPlaywrightTest("import pw from '@playwright/test';")).toBe(true);
    expect(importsPlaywrightTest("import pw, { expect } from '@playwright/test';")).toBe(true);
    expect(importsPlaywrightTest("import type * as pw from '@playwright/test';")).toBe(false);
    expect(importsPlaywrightTest("import * as helpers from './helpers/test';")).toBe(false);
    expect(USES_BROWSER_FIXTURE.test("pw.test('a', async ({ page }) => {")).toBe(true);
    expect(USES_BROWSER_FIXTURE.test("test('a', async ({ page }) => {")).toBe(true);
    expect(USES_BROWSER_FIXTURE.test("test.beforeEach(async ({\n  request,\n  context,\n}) => {")).toBe(true);
    expect(USES_BROWSER_FIXTURE.test("test('a', async ({ request }) => {")).toBe(false);
  });
});

/**
 * Teardown is observable only from the next test: the first of each pair opens
 * a page whose `pagehide` calls a binding into this worker, the second reads
 * what the binding recorded. Serial, so both run in order in one worker.
 */
const fired: string[] = [];
const PAGE = `<!doctype html><title>teardown probe</title><script>
  addEventListener('pagehide', () => { window.recordPagehide(document.title); });
</script>`;

test.describe('the helper closes every page before the context goes', () => {
  test.describe.configure({ mode: 'serial' });

  test('opens two pages and leaves them open', async ({ page, context }) => {
    await context.exposeBinding('recordPagehide', (_source, title: string) => {
      fired.push(`helper:${title}`);
    });
    await page.setContent(PAGE.replace('teardown probe', 'fixture page'));
    const second = await context.newPage();
    await second.setContent(PAGE.replace('teardown probe', 'second page'));
    expect(fired).toEqual([]);
  });

  test('both pages said pagehide on the way out', () => {
    expect(fired.filter((f) => f.startsWith('helper:')).sort()).toEqual(['helper:fixture page', 'helper:second page']);
  });
});

playwrightTest.describe("Playwright's own fixture does not — which is why the helper exists", () => {
  playwrightTest.describe.configure({ mode: 'serial' });

  playwrightTest('opens a page and leaves it open', async ({ page, context }) => {
    await context.exposeBinding('recordPagehide', (_source, title: string) => {
      fired.push(`builtin:${title}`);
    });
    await page.setContent(PAGE);
  });

  playwrightTest('no pagehide reached the test runner', () => {
    // If this ever fails, Playwright closes pages itself at teardown and the
    // helper's close is redundant — not wrong, but worth knowing.
    expect(fired.filter((f) => f.startsWith('builtin:'))).toEqual([]);
  });
});
