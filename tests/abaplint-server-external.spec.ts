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
 * This is the fast source half. The behaviour is held in CI on a production
 * build: the `build` job runs `npm run build` and the `e2e` shards serve that
 * build with `npm start` (`.github/workflows/deploy.yml`; `playwright.config.ts`
 * picks `npm start` when `CI` is set), and these specs store an ABAP Cloud
 * package through `POST /api/projects/{id}/contract`, whose store loads
 * `@/lib/transformation/abaplint-check` for that track and must answer 200:
 * `tests/generation-store-cas.spec.ts` ("happy path") and
 * `tests/project-document-size.spec.ts` ("a package that fits is stored as
 * before"). Both seed a program the router sends to `in-app-rap` (checked
 * 13.10.2026; `tests/generation-reads-run-analysis.spec.ts` routes to CAP and
 * does not load abaplint). A double-loaded abaplint turns those stores into
 * 500s, which is how it was found.
 */
test('the server loads @abaplint/core from node_modules, never from a bundle', () => {
  const config = fs.readFileSync(path.resolve(__dirname, '..', 'next.config.mjs'), 'utf8');
  const external = config.match(/serverExternalPackages:\s*\[([^\]]*)\]/);
  expect(external, 'next.config.mjs names serverExternalPackages').not.toBeNull();
  expect(external![1]).toContain("'@abaplint/core'");
});
