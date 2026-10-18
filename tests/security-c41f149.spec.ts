import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Security audit of c41f14953c1d: the comment items. Server-free. */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('SEC-c41f149-06', () => {
  for (const file of ['lib/test-sandbox/probe-suite.ts', 'lib/test-sandbox/engine-suite.ts']) {
    expect(read(file), file).not.toContain('said in every report');
  }
});

test('SEC-c41f149-14', () => {
  // The source and the runtime copy `sync-engine-runtime.mjs` writes from it.
  for (const file of ['scripts/acceptance/child/engine-cases-core.mjs', 'lib/test-sandbox/engine-runtime.ts']) {
    expect(read(file), file).not.toMatch(/why a run was refused, never as a verdict/);
  }
});
