import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * A tool's provenance — file · lines · catalog · engine — is said where it belongs, never as a monospace line behind
 * a "Details" button. Analyze says it in the score hero, open (ADR-093); Testing (ADR-131), Delivery (ADR-132) and
 * Economics (ADR-128, the family answer card and the assumption revision) carry no meta line at all since 3.5.0, so
 * the "Details" toggle that hid one (`StageMetaDetails`, owner 02.10.2026) left with the last of them.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('no tool hides a meta line behind "Details"', () => {
  test('no tool page draws a meta line, and the toggle is gone', () => {
    expect(fs.existsSync(path.resolve(ROOT, 'components/StageMetaDetails.tsx')), 'the Details toggle came back').toBe(false);
    const stages = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];
    for (const s of stages) {
      const src = read(`app/(app)/project/[projectId]/${s}/page.tsx`);
      expect(src, `${s} draws a meta line again`).not.toMatch(/<WorkspaceMetaLine\b|<StageMetaDetails\b/);
    }
    // Analyze is the exception since ADR-093 (11.10.2026): its file · lines · catalog · engine is the score's
    // provenance, said once beside the figure it describes, in the hero.
    expect(read('components/analyze/CleanCoreScoreSection.tsx')).toContain('data-analysis-meta=""');
  });

  test('on the demo stages', async ({ page }) => {
    test.setTimeout(5 * 60_000);
    // Delivery has no meta line since ADR-132 (its facts stand open in the side column, "Built on"), and Testing none
    // since ADR-131: the program's technical name is under the title, the answer says what the tests rest on.
    for (const stage of ['testing', 'delivery'] as const) {
      await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90_000 });
      await expect(page.locator(`[data-testid="demo-stage-${stage}"] [data-stage-meta-toggle]`)).toHaveCount(0);
    }
    // Analyze: in the score hero, open, and the demo says it was never signed (ADR-093).
    // The score hero is the demo's Analyze in IT since v3.1.0 (its Business view is the map page, AB-2, O10).
    await page.goto('/demo/analyze?view=it', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90_000 });
    const meta = page.locator('[data-testid="demo-stage-analyze"] [data-analysis-meta]');
    await expect(meta).toBeVisible();
    await expect(meta).toContainText('Demo — never signed');
    await expect(meta).toContainText(/lines/);
    await expect(page.locator('[data-testid="demo-stage-analyze"] [data-analysis-answer] [data-stage-meta-toggle]')).toHaveCount(0);
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
    // Analyze: the provenance stands open in the score hero (ADR-093).
    await page.goto(`/project/${acct.projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-analysis-meta]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-analysis-meta]')).toContainText('v2.20.0');
    await expect(page.locator('[data-analysis-answer] [data-stage-meta-toggle]')).toHaveCount(0);
    // Economics: no toggle and no meta line (ADR-128).
    await page.goto(`/project/${acct.projectId}/tco`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-stage-meta-toggle]')).toHaveCount(0);
  });
});
