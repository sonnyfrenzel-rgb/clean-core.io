import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * lib/auth-subscribe.ts loads the Auth SDK after hydration (docs/perf/REPORT.md). A chunk that does not load
 * must not leave the header button in its placeholder for good, nor surface as an unhandled rejection
 * (QA review of 1503ad188710, finding afd6e6a0f91f).
 *
 * Source-level: a dynamic import cannot be made to fail under Playwright's transform without replacing the
 * module system, and the failure is a chunk the deployed revision no longer serves.
 */
const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/auth-subscribe.ts'), 'utf8').replace(/\r\n/g, '\n');

test('a failed SDK load falls back to signed out, once, unless the subscriber already left', () => {
  const body = src.slice(src.indexOf('export function subscribeToAuth'));
  expect(body).toMatch(/\.then\(\(\[\{ getAuth \}, \{ onAuthStateChanged \}\]\) => \{/);
  const handler = body.slice(body.indexOf('.catch('));
  expect(body.indexOf('.catch(')).toBeGreaterThan(body.indexOf('.then('));
  expect(handler).toMatch(/^\.catch\(\(\) => \{[\s\S]*?if \(!cancelled\) callback\(null\);\s*\}\);/);
  // Every caller treats `null` as signed out, so the fallback is a state they already render.
  for (const caller of ['components/HeaderAuthButton.tsx', 'components/landing/AuthLink.tsx']) {
    expect(fs.readFileSync(path.resolve(__dirname, '..', caller), 'utf8')).toContain('subscribeToAuth(');
  }
});
