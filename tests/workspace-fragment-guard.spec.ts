/**
 * A view or focus switch keeps the `#fragment` — Gegenreview c5085bb, CR-14.
 *
 * Source pin only: the workspace's deep-link contract is rendered in 6.9 with
 * its revision hint. What this holds is that both `router.push` calls of the
 * workspace page carry the current hash, and that the hash comes from the
 * window and nowhere else.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const PAGE = path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'page.tsx');

test('every query rewrite of the workspace page carries the fragment', () => {
  const src = fs.readFileSync(PAGE, 'utf8');
  const pushes = src.match(/router\.push\(`\?\$\{query\.toString\(\)\}[^`]*`/g) ?? [];
  expect(pushes.length, 'the view and focus switches both push a query').toBeGreaterThanOrEqual(2);
  for (const call of pushes) {
    expect(call, `${call} drops the fragment`).toContain('${currentHash()}');
  }
  expect(src).toMatch(/function currentHash\(\): string \{\s*return typeof window === 'undefined' \? '' : window\.location\.hash;/);
});
