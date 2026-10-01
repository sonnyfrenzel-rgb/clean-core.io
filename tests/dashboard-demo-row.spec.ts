import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { demoListRow } from '../lib/demo-list-row';

/**
 * The demo row of My workspace is computed once per server process, not once
 * per request — QA review of 072f79996d01 (6794b045c131).
 *
 * `/dashboard` is rendered on every request (the page is `force-dynamic`), so
 * the layout's old "ISR" claim did not hold; what keeps the engine off the
 * request path is the per-process memo in `lib/demo-list-row.ts`. This holds
 * that, and holds the layout to not claiming a cache it does not have.
 */

test('the engine runs once: the second call hands back the same row', () => {
  const first = demoListRow();
  expect(first.lines).toBeGreaterThan(0);
  expect(demoListRow()).toBe(first);
});

test('the layout claims no ISR it cannot have under a force-dynamic page', () => {
  const root = path.resolve(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'app', '(app)', 'dashboard', 'page.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'app', '(app)', 'dashboard', 'layout.tsx'), 'utf8');
  if (page.includes("export const dynamic = 'force-dynamic'")) {
    expect(layout).not.toMatch(/export const revalidate\b/);
    expect(layout).not.toMatch(/\bISR for\b/);
  }
});
