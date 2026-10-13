import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * @abaplint/core registers its statement syntax handlers when it loads. Bundled
 * into the server by webpack it loaded twice and every generation store on a
 * production build answered 500 ("syntax.ts duplicate statement syntax
 * handler") — invisible to the server-free specs, which never bundle. Found in
 * the 3.0.12 production-build run; Next must load it from node_modules.
 */
test('the server loads @abaplint/core from node_modules, never from a bundle', () => {
  const config = fs.readFileSync(path.resolve(__dirname, '..', 'next.config.mjs'), 'utf8');
  const external = config.match(/serverExternalPackages:\s*\[([^\]]*)\]/);
  expect(external, 'next.config.mjs names serverExternalPackages').not.toBeNull();
  expect(external![1]).toContain("'@abaplint/core'");
});
