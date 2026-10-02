import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * A stage's provenance line — file · lines · catalog · engine, in monospace —
 * sits behind a "Details" button, collapsed until the reader asks for it
 * (owner 02.10.2026; DESIGN.md §2.11 "Metadata on demand"). One component,
 * `components/StageMetaDetails.tsx`, does it for every stage and every demo
 * stage; opened, the line is the one the stage handed in, unchanged.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** Where each stage draws its line, and the hook the line keeps. */
const LINES = {
  analyze: '[data-analysis-meta]',
  testing: '[data-testing-meta]',
  tco: '[data-workspace-meta]',
  delivery: '[data-delivery-meta]',
} as const;

/** Closed, then open by mouse, closed again, then open and closed by keyboard. */
async function expectBehindDetails(page: Page, scope: string, line: string, content: string | RegExp) {
  const toggle = page.locator(`${scope} [data-stage-meta-toggle]`);
  await expect(toggle).toBeVisible({ timeout: 90_000 });
  await expect(toggle).toHaveText(/Details/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(line), `${line} is on screen before Details was pressed`).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(line)).toBeVisible();
  await expect(page.locator(line)).toContainText(content);
  // The button names what it opens.
  const controls = await toggle.getAttribute('aria-controls');
  expect(controls).toBeTruthy();
  await expect(page.locator(`[id="${controls}"]`).locator(line)).toHaveCount(1);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(line)).toHaveCount(0);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(line)).toContainText(content);
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(line)).toHaveCount(0);
}

test.describe('the stage meta line is behind "Details"', () => {
  test('every stage meta line goes through StageMetaDetails', () => {
    for (const rel of [
      'components/testing/TestingHeader.tsx',
      'components/delivery/DeliveryObjectPage.tsx',
      'components/analyze/AnalysisAnswer.tsx',
      'app/(app)/project/[projectId]/tco/page.tsx',
    ]) {
      expect(read(rel), `${rel} draws a meta line outside StageMetaDetails`).toContain('<StageMetaDetails');
    }
    // The workspace's own line is not a stage's: it keeps its view rule (open in IT, §2.11).
    const stages = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];
    for (const s of stages) {
      const src = read(`app/(app)/project/[projectId]/${s}/page.tsx`);
      const bare = (src.match(/<WorkspaceMetaLine\b/g) || []).length;
      const wrapped = (src.match(/<StageMetaDetails>\s*<WorkspaceMetaLine\b/g) || []).length;
      expect(wrapped, `${s} renders the workspace meta line without "Details"`).toBe(bare);
    }
    const c = read('components/StageMetaDetails.tsx');
    expect(c).toContain('aria-expanded={open}');
    expect(c).toContain("wt('page.details')");
    expect(c).toContain('useState(false)');
  });

  test('on the demo stages', async ({ page }) => {
    test.setTimeout(5 * 60_000);
    for (const stage of ['analyze', 'testing', 'delivery'] as const) {
      await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90_000 });
      await expectBehindDetails(page, `[data-testid="demo-stage-${stage}"]`, LINES[stage], /lines/);
    }
  });

  test('on the project stages', async ({ page }) => {
    test.setTimeout(8 * 60_000);
    const acct = await seedStageProject({ prefix: 'stagemeta', acceptTerms: true, rich: true });
    await adminMergeDoc('projects', acct.projectId, {
      sourceFileName: 'Z_STAGE_META.abap',
      auditMetadata: {
        inputFingerprint: { fileName: 'Z_STAGE_META.abap', lineCount: 88, sha256: 'a'.repeat(64) },
        modelCard: { catalogVersion: '2024.FPS02', engineVersion: 'v2.20.0' },
      },
    });
    await signInThroughForm(page, acct);
    for (const stage of ['analyze', 'testing', 'tco', 'delivery'] as const) {
      await page.goto(`/project/${acct.projectId}/${stage}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 120_000 });
      // Economics reads the signed run's manifest (`metaLine`), which this seed
      // does not write — its line says so ("not recorded"); the others read the
      // project's audit metadata.
      await expectBehindDetails(page, 'body', LINES[stage], stage === 'tco' ? /lines\s*12/ : 'v2.20.0');
    }
  });
});
