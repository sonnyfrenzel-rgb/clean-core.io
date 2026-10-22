import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { quotaExhausted, runsRemaining } from '../lib/run-quota-rule';

/**
 * The quota a page shows is the quota the server counts against.
 *
 * The profile hook used to force `transformationsLimit` to 5 for every account of tier `pilot`, whatever was
 * stored. The server (`lib/firebase-admin.ts`, the run charge) counts against the stored limit, so an account
 * whose limit the operator had raised was blocked by the page at five runs while the server would have let it
 * run (owner report 22.10.2026 on dev: "0 of 5 left" with a stored limit of 1000). A browser may create the
 * limit only as 5 and never change it (firestore.rules, the create and update allowlists), so the stored value
 * is the one to show. Server-free.
 */
const ROOT = path.join(__dirname, '..');

test('the profile hook shows the stored limit and never overwrites it', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'hooks/useUserProfile.ts'), 'utf8');
  expect(hook).not.toMatch(/transformationsLimit\s*=\s*\d/);
});

test('a raised limit leaves runs: the page and the server count alike', () => {
  const raised = { tier: 'pilot', transformationsUsed: 5, transformationsLimit: 1000 };
  expect(quotaExhausted(raised)).toBe(false);
  expect(runsRemaining(raised)).toBe(995);
  const community = { tier: 'pilot', transformationsUsed: 5, transformationsLimit: 5 };
  expect(quotaExhausted(community)).toBe(true);
});

test('a browser can neither raise its own limit nor change it later (firestore.rules)', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  expect(rules).toMatch(/request\.resource\.data\.get\('transformationsLimit', 5\) == 5/);
  const update = rules.slice(rules.indexOf('function userClientUpdateKeys'), rules.indexOf('function userClientUpdateKeys') + 300);
  expect(update).not.toContain('transformationsLimit');
  expect(update).not.toContain('transformationsUsed');
});
