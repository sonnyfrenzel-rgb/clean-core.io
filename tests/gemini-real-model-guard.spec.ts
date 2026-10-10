import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { GEMINI_TEST_REAL_MODEL_HEADER, GEMINI_TEST_STUB_DEFAULT_ENV } from '../lib/gemini-test-stub';

/**
 * Roadmap "before 3.0.7 — Tests never spend the production model budget",
 * part (2): the number of specs that call the real model at all.
 *
 * Not yet the whole promise (QA review of 1c5d882f3b6a): part (1), a separate
 * test key in its own project with its own cap, is still outstanding. Until it
 * is in place, CI and production share one key, and every spec listed below
 * spends production's budget on each run. The list is kept to one for that
 * reason.
 *
 * On the evening of the 3.0.6 release production's model calls answered 429
 * "monthly spending cap exceeded": production, CI and local runs shared one
 * key, and about 1,270 of 1,304 Gemini calls on 06./07.10.2026 came from test
 * runs. Since then the test server answers `/api/gemini` with the provider stub
 * by default (`lib/gemini-test-stub.ts`, `GEMINI_TEST_STUB_DEFAULT` in
 * playwright.config.ts), and a spec reaches the real model only by sending
 * `x-test-gemini-real-model` with the test secret.
 *
 * This guard is the count. Every file under tests/ that names the real-model
 * header is listed below with the reason it needs a real answer; a new one
 * fails here until it is added, which is the point: the number cannot grow
 * without someone writing down why.
 *
 * Server-free: it reads files and nothing else.
 */

const ROOT = path.resolve(__dirname, '..');

/**
 * The specs allowed to call the real model, and why each needs a real answer.
 * The inventory of 10.10.2026 went through every spec that reached the
 * provider while CI handed the server a key — direct calls (model-receipt,
 * process-naming-route, security-compliance, statement-proposal-route,
 * zero-llm-path) and browser walks that open a stage which generates on open
 * (g4-chain-acceptance, design-signoff-real-run, own-code-import-page,
 * first-look, workspace-a11y, starter-examples, the documentation/process-map
 * specs, …). Each asserts a gate, a receipt, a refusal or a page state that the
 * stub proves equally — or, without a key, is not asked at all. One needs the
 * model's words.
 */
const REAL_MODEL_SPECS: Record<string, string> = {
  'tests/full-pipeline.spec.ts':
    'The live walk through all seven stages: it asserts the design blueprint (`/project-root` under "Target Project Blueprint"), which only a real, schema-valid design answer produces, then confirms that design and opens a transformation generated from it. The stub answer is refused as a design.',
};

/** Raise only together with an entry above, never on its own. */
const MAX_REAL_MODEL_SPECS = 1;

function filesUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .map((f) => path.join(dir, f))
    .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && fs.statSync(f).isFile());
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

test('only the listed specs opt in to the real model, and the list does not grow silently', () => {
  // Server-free guards that name the header to hold its gates and send no request.
  const exempt = new Set([rel(__filename), 'tests/gemini-test-stub-guard.spec.ts']);
  const optIns = filesUnder(path.join(ROOT, 'tests'))
    .filter((file) => !exempt.has(rel(file)))
    .filter((file) => {
      const src = fs.readFileSync(file, 'utf8');
      // By constant or by spelling — a copied string literal is the same opt-in.
      return src.includes('GEMINI_TEST_REAL_MODEL_HEADER') || src.includes(GEMINI_TEST_REAL_MODEL_HEADER);
    })
    .map(rel)
    .sort();

  expect(optIns, 'a spec opts in to the real model without being listed in this guard').toEqual(Object.keys(REAL_MODEL_SPECS).sort());
  expect(Object.keys(REAL_MODEL_SPECS).length).toBeLessThanOrEqual(MAX_REAL_MODEL_SPECS);
  // …and the exempt guard stays server-free: it sends nothing anywhere.
  const stubGuard = fs.readFileSync(path.join(ROOT, 'tests', 'gemini-test-stub-guard.spec.ts'), 'utf8');
  expect(stubGuard).not.toMatch(/\brequest\.(post|get|fetch)\(|\bfetch\(|page\.goto\(|\{\s*(page|request)\s*\}/);
  for (const [spec, why] of Object.entries(REAL_MODEL_SPECS)) {
    expect(why.trim().length, `${spec} is listed without a reason`).toBeGreaterThan(20);
  }
});

test('no spec switches the stub default off', () => {
  // The default is set once, for the server Playwright starts. A spec that set it
  // to anything else — or started a server of its own without it — would reach
  // the real model for every call it makes, unlisted.
  const allowed = new Set(['tests/gemini-test-stub-guard.spec.ts', rel(__filename)]);
  for (const file of filesUnder(path.join(ROOT, 'tests'))) {
    if (allowed.has(rel(file))) continue;
    expect(fs.readFileSync(file, 'utf8'), `${rel(file)} touches the stub default`).not.toContain(GEMINI_TEST_STUB_DEFAULT_ENV);
  }
  const config = fs.readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
  const webServer = config.slice(config.indexOf('webServer:'));
  expect(webServer, 'the test server is no longer started on the stub').toMatch(/\n\s+GEMINI_TEST_STUB_DEFAULT: 'true',/);
  // One server for the suite, and it is the one with the default.
  expect(config.match(/webServer:/g)?.length).toBe(1);
});
