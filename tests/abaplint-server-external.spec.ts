import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * @abaplint/core registers its statement syntax handlers when it loads. Bundled
 * into the server by webpack it loaded twice and every generation store on a
 * production build answered 500 ("syntax.ts duplicate statement syntax
 * handler") — invisible to the server-free specs, which never bundle. Found in
 * the 3.0.12 production-build run; Next must load it from node_modules.
 *
 * This file holds the source half only: the config line below. It does not
 * run a production build, and it cannot see whether one ran.
 *
 * Where the behaviour itself can be caught — not established here, only the
 * setup it depends on, which the second test reads: the `build` job of
 * `.github/workflows/deploy.yml` runs `npm run build`, the e2e shards run
 * `npx playwright test`, and `playwright.config.ts` serves `npm start` when
 * `CI` is set. Two specs then store an ABAP Cloud package through
 * `POST /api/projects/{id}/contract`, whose store loads
 * `@/lib/transformation/abaplint-check` for that track and has to answer 200:
 * `tests/generation-store-cas.spec.ts` ("happy path") and
 * `tests/project-document-size.spec.ts` ("a package that fits is stored as
 * before"). That their seeds route to `in-app-rap`, so the store loads
 * abaplint at all, was checked by hand on 13.10.2026 and is not re-checked
 * here; nor is it checked that those specs ran and passed on a given release
 * — read the CI run for that (QA review of 5a559787, ef304272d02f).
 */
test('the server loads @abaplint/core from node_modules, never from a bundle', () => {
  const config = fs.readFileSync(path.resolve(__dirname, '..', 'next.config.mjs'), 'utf8');
  const external = config.match(/serverExternalPackages:\s*\[([^\]]*)\]/);
  expect(external, 'next.config.mjs names serverExternalPackages').not.toBeNull();
  expect(external![1]).toContain("'@abaplint/core'");
});

test('the production-build setup the comment above names is still there (not that it ran)', () => {
  const root = path.resolve(__dirname, '..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
  const workflow = read('.github/workflows/deploy.yml');
  expect(workflow).toContain('run: npm run build');
  expect(workflow).toMatch(/run: npx playwright test --shard=/);
  expect(read('playwright.config.ts')).toMatch(/command: process\.env\.CI \? 'npm start'/);
  for (const [spec, title] of [
    ['tests/generation-store-cas.spec.ts', "test('happy path:"],
    ['tests/project-document-size.spec.ts', "test('a package that would have outgrown the project document is stored beside it'"],
  ] as const) {
    const src = read(spec);
    expect(src, spec).toContain(title);
    expect(src, spec).toContain('/contract`');
  }
});
