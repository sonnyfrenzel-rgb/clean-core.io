/**
 * A view switch keeps a subject `#fragment` — Gegenreview c5085bb, CR-14 —
 * but not a place of the old view, and opens the new view at its top
 * (Sonny, 10.10.2026: from IT on `#architecture`, Business bounced straight
 * back to IT).
 *
 * Source pin for the page, the demo shell and the helper; the behaviour in a
 * browser is held by `workspace-view-switch.spec.ts`.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { viewSwitchHash } from '../lib/view-switch';
import { LAYERS } from '../lib/workspace-model';
import { IT_SECTION_IDS } from '../lib/it-sections';
import { BUSINESS_MAP_ID } from '../lib/business-layers';
import { MANAGEMENT_IDS } from '../lib/management-sections';

const PAGE = path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'page.tsx');
const DEMO = path.join(__dirname, '..', 'components', 'demo', 'DemoWorkspaceShell.tsx');

test('every query rewrite of the workspace page carries the fragment the helper lets through, and opens at the top', () => {
  const src = fs.readFileSync(PAGE, 'utf8');
  const pushes = src.match(/router\.push\(`\?\$\{query\.toString\(\)\}[^`]*`/g) ?? [];
  expect(pushes.length, 'the view switch pushes a query').toBeGreaterThanOrEqual(1);
  for (const call of pushes) {
    expect(call, `${call} drops the fragment`).toContain('${currentHash()}');
  }
  // The fragment comes from the window and nowhere else, through the helper.
  expect(src).toMatch(/function currentHash\(\): string \{[\s\S]*?return viewSwitchHash\(window\.location\.hash\);/);
  // And the new view opens at its top.
  expect(src).toMatch(/router\.push\(`\?\$\{query\.toString\(\)\}\$\{currentHash\(\)\}`, \{ scroll: false \}\);\s*window\.scrollTo\(\{ top: 0 \}\);/);
  // The demo's switch does the same.
  const demo = fs.readFileSync(DEMO, 'utf8');
  const set = demo.slice(demo.indexOf('const setView = useCallback('));
  const body = set.slice(0, set.indexOf('[router, searchParams]'));
  expect(body).toContain('viewSwitchHash(window.location.hash)');
  expect(body).toContain('window.scrollTo({ top: 0 });');
});

test('a subject is carried over, a place of the old view is not', () => {
  for (const subject of ['#L42', '#L231', '#BR-004', '']) expect(viewSwitchHash(subject), subject).toBe(subject);
  for (const layer of LAYERS) expect(viewSwitchHash(`#${layer}`), layer).toBe('');
  for (const id of Object.values(IT_SECTION_IDS)) expect(viewSwitchHash(`#${id}`), id).toBe('');
  for (const id of Object.values(MANAGEMENT_IDS)) expect(viewSwitchHash(`#${id}`), id).toBe('');
  for (const place of [BUSINESS_MAP_ID, 'business-rules']) expect(viewSwitchHash(`#${place}`), place).toBe('');
});
