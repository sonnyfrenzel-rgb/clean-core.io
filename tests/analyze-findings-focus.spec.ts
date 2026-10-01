import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * The focused findings list on the Analyze stage, rendered (owner, 01.10.2026):
 * "Look here first" above the list, the groups by kind with critical and high
 * open, five rows and "Show N more", filters opening what they match, and no
 * shouting in titles. The rules themselves are held in
 * `tests/findings-view.spec.ts`; this checks the page uses them.
 */
const SOURCE = fs
  .readFileSync(path.resolve(__dirname, '..', 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

test('focus first, groups by kind, progressive disclosure, calm titles', async ({ page }) => {
  test.setTimeout(300 * 1000);
  const acct = await seedStageProject({ prefix: 'anlzfocus', admin: true, acceptTerms: true, rich: true });
  await adminMergeDoc('projects', acct.projectId, { legacyCode: SOURCE, sourceFileName: 'Z_MM_PO_APPROVAL.abap' });
  await adminMergeDoc(`projects/${acct.projectId}/runs`, acct.runId, { legacyCode: SOURCE });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, acct);
  await page.goto(`/project/${acct.projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });

  const list = page.locator('[data-analysis-findings]');
  await expect(list).toBeVisible({ timeout: 120000 });

  // Focus first: at most three cards, above the groups.
  const focus = list.locator('[data-findings-focus]');
  await expect(focus).toBeVisible();
  const cards = focus.locator('[data-focus-kind]');
  const nCards = await cards.count();
  expect(nCards).toBeGreaterThan(0);
  expect(nCards).toBeLessThanOrEqual(3);
  const kinds = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-focus-kind')));
  expect(new Set(kinds).size, 'one card per kind').toBe(kinds.length);

  // The pictures carry their figures as text.
  await expect(list.locator('[data-severity-bar]')).toHaveAttribute('aria-label', /Findings by severity: \d+ critical/);

  // Groups: critical/high open, the others closed.
  const groups = list.locator('[data-findings-group]');
  const states = await groups.evaluateAll((els) =>
    els.map((e) => ({
      kind: e.getAttribute('data-findings-group'),
      open: e.getAttribute('data-findings-group-open'),
      sev: Array.from(e.querySelectorAll('[data-cc-severity]')).map((s) => s.getAttribute('data-cc-severity')),
    })),
  );
  expect(states.length).toBeGreaterThan(2);
  for (const g of states) {
    const serious = g.sev.includes('Critical') || g.sev.includes('High');
    expect(g.open, `${g.kind} open state`).toBe(serious ? 'true' : 'false');
  }

  // A closed group with more than five rows: open it, then "Show N more".
  const big = list.locator('[data-findings-group="standard-table-read"]');
  if (await big.count()) {
    await big.locator('[data-cc-disclosure-trigger]').first().click();
    await expect(big).toHaveAttribute('data-findings-group-open', 'true');
    const more = big.locator('[data-findings-more]');
    if (await more.count()) {
      const before = await big.locator('tbody tr').count();
      await more.click();
      await expect(big.locator('tbody tr')).not.toHaveCount(before);
    }
  }

  // A severity filter opens every group it matches.
  await list.getByLabel('Severity', { exact: true }).selectOption('Medium');
  const filtered = await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-findings-group-open')));
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.every((o) => o === 'true')).toBe(true);

  // No shouting.
  const text = await list.innerText();
  expect(text).not.toMatch(/CRITICAL:|REPLACE IMMEDIATELY|Do NOT/);
});
