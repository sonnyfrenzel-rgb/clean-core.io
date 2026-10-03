import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import {
  assignPublicCloudFit,
  summarizePublicCloudFit,
  type PublicCloudFitObjectInput,
  type TargetPlatform,
} from '../lib/abap/public-cloud-fit';
import { fitPercent, standardFit, STANDARD_FIT_DEFINITION, type StandardFitSource } from '../lib/standard-fit';
import type { FitByPlatform, FitResult, Loaded } from '../lib/management-overview';
import type { ItFindingRow, ItFindingsSource } from '../lib/it-findings';

/**
 * Fit to standard — ADR-069, owner 03.10.2026: "for Public Cloud a clear
 * fit-to-standard value — not only the four buckets, but clearly more visual:
 * what prevents standard here and what does not", and "on desktop, use the
 * whole screen".
 *
 * What holds it:
 *   - the figure is computed from the evidence — the buckets of the SAP
 *     objects on the target platform — and nothing else: Keep and Rebuild on a
 *     path SAP names fit; no catalogued path and own work on an SAP object
 *     block; Retire, unsorted and the project's own objects are not counted;
 *   - it is *not determined*, with its reason, without a signed run, without a
 *     target platform and without SAP objects — never 0 % or 100 % by default;
 *   - every blocker names its object, its level, its line and its provenance;
 *   - rendered, Management uses the frame's width on a desktop and does not
 *     scroll sideways on a phone, and it carries exactly one primary next step.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ---------------------------------------------------------------- fixtures */

const sap = (over: Partial<PublicCloudFitObjectInput> & { objectName: string }): PublicCloudFitObjectInput => ({
  level: 'A',
  levelProvenance: 'catalog',
  dropDecision: null,
  usage: null,
  catalog: { pathEvidence: 'successor-named' },
  hasModification: false,
  hasOwnWriteAccess: false,
  ...over,
});

/** Two fit (released, successor), three block (no path ×2, a direct write), one own object, one unknown. */
const OBJECTS: PublicCloudFitObjectInput[] = [
  sap({ objectName: 'I_SALESORDER', level: 'A' }),
  sap({ objectName: 'BAPI_SALESORDER_CREATEFROMDAT2', level: 'C', catalog: { pathEvidence: 'successor-named', state: 'deprecated' } }),
  sap({ objectName: 'VBAK', level: 'D', hasOwnWriteAccess: true }),
  sap({ objectName: 'T16FS', level: 'C', catalog: { pathEvidence: 'none-named' } }),
  sap({ objectName: 'ZUNKNOWN_SAP', level: 'D', levelProvenance: 'catalog-residual', catalog: { pathEvidence: 'not-in-release-file' } }),
  sap({ objectName: 'ZOWN_TABLE', level: 'C', levelProvenance: 'own-object', catalog: null }),
  sap({ objectName: 'SOMETHING', level: 'Unknown' }),
];

const row = (objectName: string, kind: string, lineStart: number, level: ItFindingRow['level']): ItFindingRow => ({
  id: `CC-${lineStart}`,
  kind,
  title: kind,
  severity: 'Medium',
  objectName,
  objectType: 'TABL',
  lineStart,
  lineEnd: null,
  routine: null,
  level,
  releaseView: null,
  classificationView: null,
  successor: null,
  targetOptions: [],
  rulesCoveringLine: [],
  rulesInRoutine: [],
});

const ROWS: ItFindingRow[] = [
  row('I_SALESORDER', 'standard-table-read', 12, 'A'),
  row('BAPI_SALESORDER_CREATEFROMDAT2', 'rfc-call', 40, 'C'),
  row('VBAK', 'standard-table-read', 20, 'C'),
  row('VBAK', 'standard-table-write', 61, 'D'),
  row('T16FS', 'standard-table-read', 33, 'C'),
  row('ZUNKNOWN_SAP', 'standard-table-read', 70, 'D'),
];

function fitFor(platform: TargetPlatform): FitResult {
  const assignments = OBJECTS.map((o) => assignPublicCloudFit(o, platform));
  return { assignments, summary: summarizePublicCloudFit(assignments, { targetPlatform: platform, usageImported: false }) };
}
const FIT = (target: TargetPlatform | null): Loaded<FitByPlatform> => ({
  state: 'ready',
  value: { target, private: fitFor('private'), public: fitFor('public') },
});
const FINDINGS: Loaded<ItFindingsSource> = { state: 'ready', value: { rows: ROWS, sourceSha256: 'a'.repeat(64), rulesDerived: 0 } };

const source = (over: Partial<StandardFitSource> = {}): StandardFitSource => ({
  mode: 'project',
  hasRun: true,
  analyzeState: 'done',
  signedSourceSha256: 'a'.repeat(64),
  findings: FINDINGS,
  fit: FIT('public'),
  ...over,
});

/* ----------------------------------------------------------- the figure */

test.describe('the figure is computed from the evidence', () => {
  test('fits = Keep + Rebuild on a named path, over every sorted SAP object; the rest blocks', () => {
    const f = standardFit(source());
    expect(f.state).toBe('ready');
    if (f.state !== 'ready') return;
    expect(f.platformLabel).toBe('Public Edition');
    // 5 SAP objects sorted on Public Edition (the own table and the unknown level are out).
    expect(f.counted).toBe(5);
    expect(f.fits).toBe(2);
    expect(f.released).toBe(1);
    expect(f.successor).toBe(1);
    expect(f.blocking).toBe(3);
    expect(f.percent).toBe(40);
    expect(f.sentence).toBe('2 of 5 SAP objects this code uses have a released path on Public Edition.');
    expect(f.blockers.map((b) => b.objectName).sort()).toEqual(['T16FS', 'VBAK', 'ZUNKNOWN_SAP']);
    expect(f.clear.map((b) => b.objectName)).toEqual(['I_SALESORDER', 'BAPI_SALESORDER_CREATEFROMDAT2']);
    // The meter is the same objects, in three groups that add up.
    const total = f.groups.flatMap((g) => g.segments).reduce((n, s) => n + s.count, 0);
    expect(total).toBe(f.counted + f.notSorted + f.retire);
    expect(f.groups.find((g) => g.key === 'fits')!.count).toBe(f.fits);
    expect(f.groups.find((g) => g.key === 'blocks')!.count).toBe(f.blocking);
  });

  test('every blocker names its object, its level, its line and where the statement comes from', () => {
    const f = standardFit(source());
    if (f.state !== 'ready') throw new Error('not ready');
    for (const b of [...f.blockers, ...f.clear]) {
      expect(b.objectName.length).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D']).toContain(b.level);
      expect(typeof b.line).toBe('number');
      expect(['imported', 'reconstructed']).toContain(b.provenance);
      expect(b.why.length).toBeGreaterThan(10);
    }
    // A direct write is level D whatever the table is on its own (ADR-062), on the write's line.
    const vbak = f.blockers.find((b) => b.objectName === 'VBAK')!;
    expect(vbak).toMatchObject({ level: 'D', line: 61, provenance: 'reconstructed' });
    expect(vbak.why).toMatch(/writes directly/);
    // A catalogue gap is SAP's statement, imported.
    expect(f.blockers.find((b) => b.objectName === 'T16FS')).toMatchObject({ provenance: 'imported', line: 33 });
    // No catalogued path comes before the project's own work.
    expect(f.blockers[f.blockers.length - 1].objectName).toBe('VBAK');
  });

  test('the platform is the project\'s: the same code fits differently on Private Edition', () => {
    const pub = standardFit(source());
    const priv = standardFit(source({ fit: FIT('private') }));
    if (pub.state !== 'ready' || priv.state !== 'ready') throw new Error('not ready');
    expect(priv.platformLabel).toBe('Private Edition');
    expect(priv.counted).toBe(pub.counted);
  });

  test('not determined without a signed run, without a target platform, and without SAP objects', () => {
    const noRun = standardFit(source({ hasRun: false, analyzeState: 'partial' }));
    expect(noRun).toMatchObject({ state: 'not-determined', why: 'no-run' });
    const noTarget = standardFit(source({ fit: FIT(null) }));
    expect(noTarget).toMatchObject({ state: 'not-determined', why: 'no-target' });
    const empty: Loaded<FitByPlatform> = {
      state: 'ready',
      value: {
        target: 'public',
        private: { assignments: [], summary: summarizePublicCloudFit([], { targetPlatform: 'private', usageImported: false }) },
        public: { assignments: [], summary: summarizePublicCloudFit([], { targetPlatform: 'public', usageImported: false }) },
      },
    };
    expect(standardFit(source({ fit: empty }))).toMatchObject({ state: 'not-determined', why: 'no-objects' });
    // Neither while reading nor after a refused read is a figure invented.
    expect(standardFit(source({ fit: { state: 'loading' } }))).toMatchObject({ state: 'not-determined', why: 'reading' });
    expect(standardFit(source({ findings: { state: 'absent', reason: 'refused' } }))).toMatchObject({
      state: 'not-determined',
      reason: 'refused',
    });
    // A source that moved since the signed run counts nothing.
    expect(standardFit(source({ analyzeState: 'stale' }))).toMatchObject({ state: 'not-determined', why: 'source-changed' });
    expect(standardFit(source({ signedSourceSha256: 'b'.repeat(64) }))).toMatchObject({ state: 'not-determined', why: 'source-changed' });
    for (const f of [noRun, noTarget]) expect(JSON.stringify(f)).not.toMatch(/\d\s?%/);
  });

  test('the demo is computed without a run and says it is a demo', () => {
    const demo = standardFit(source({ mode: 'demo', hasRun: false, analyzeState: 'partial', signedSourceSha256: null }));
    expect(demo).toMatchObject({ state: 'ready', basis: 'demo' });
  });

  test('a share is never rounded into 0 % or 100 % it did not earn', () => {
    expect(fitPercent(0, 7)).toBe(0);
    expect(fitPercent(7, 7)).toBe(100);
    expect(fitPercent(1, 400)).toBe(1);
    expect(fitPercent(399, 400)).toBe(99);
    expect(() => fitPercent(0, 0)).toThrow();
  });

  test('it is labelled as our measure, and the module stays pure', () => {
    expect(STANDARD_FIT_DEFINITION).toMatch(/Clean-Core\.io's own measure, not an SAP figure/);
    const src = read('lib/standard-fit.ts');
    for (const line of src.split('\n').filter((l) => /^\s*import\b/.test(l))) {
      expect(line).not.toMatch(/react|firebase|firestore|gemini/i);
    }
    expect(src).not.toContain('fetch(');
    expect(read('components/workspace/ManagementExecutive.tsx')).toContain("wt('stdFit.ownMeasure')");
  });
});

/* -------------------------------------------------------------- rendered */

/** Reads, a released API, an SAP table without a catalogued path, and a direct write. */
const SOURCE = `REPORT z_mgmt_fit.
DATA: lt_ekpo TYPE TABLE OF ekpo.
SELECT * FROM ekpo INTO TABLE lt_ekpo.
SELECT SINGLE * FROM t16fs INTO @DATA(ls_t16fs).
UPDATE ekpo SET loekz = 'L' WHERE ebeln = '1'.
CALL FUNCTION 'BAPI_PO_CREATE1'.
`;

test.describe('Management, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  let acct: SeededProject;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const FRESH = `mgmt-fit-fresh-${tag}`;
  const SIGNED = `mgmt-fit-signed-${tag}`;
  const RUN = `mgmt-fit-run-${tag}`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    acct = await seedStageProject({ prefix: 'mgmtfit', admin: true, acceptTerms: true });
    // (a) a staged source, no run, no target — the owner's screenshot.
    await adminSetDoc('projects', FRESH, {
      name: 'Z_MGMT_FIT fresh', userId: acct.uid, createdAt: new Date(), legacyCode: SOURCE,
    });
    // (b) the same source with a signed run, target Public Edition.
    await adminSetDoc('projects', SIGNED, {
      name: 'Z_MGMT_FIT signed', userId: acct.uid, createdAt: new Date(), legacyCode: SOURCE,
      s4Deployment: 'public', cleanCoreScore: 58, activeRunId: RUN,
    });
    await adminSetDoc(`projects/${SIGNED}/runs`, RUN, {
      runId: RUN, projectId: SIGNED, userId: acct.uid, createdAt: new Date().toISOString(),
      status: 'completed', cleanCoreScore: 58,
    });
  });

  async function open(page: Page, projectId: string): Promise<void> {
    await page.goto(`/project/${projectId}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="management"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-management-executive]')).toBeVisible({ timeout: 60000 });
  }

  /** The primary buttons a reader can see on the page — the next step must be the only one. */
  const visiblePrimaries = (page: Page) =>
    page.locator('[data-workspace-shell="management"] [data-cc-button="primary"]').evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => (el.textContent || '').trim()),
    );

  test('(a) a fresh project: no check on Analyze, the figure not determined, one primary "Run the analysis"', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, FRESH);

    const analyzeTool = page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyzeTool.locator('[data-workspace-tool-mark="check"]')).toHaveCount(0);
    await expect(analyzeTool).toHaveAttribute('data-workspace-tool-next', '');

    const fit = page.locator('#standard-fit');
    await expect(fit).toHaveAttribute('data-standard-fit', 'not-determined', { timeout: 60000 });
    await expect(fit).toHaveAttribute('data-standard-fit-why', 'no-run');
    await expect(fit.locator('[data-standard-fit-value]')).toHaveText('Not determined');
    await expect(fit, 'a percentage nobody measured').not.toContainText('%');

    await expect.poll(() => visiblePrimaries(page)).toEqual(['Run the analysis']);
    await expect(page.locator('[data-executive-next-action]')).toHaveAttribute('href', /\/analyze\?/);
    // "Run the analysis" is said once as an action, not in three cards.
    expect(await page.locator('[data-next-step]').count(), 'a second "Next step" card in Management').toBe(0);
  });

  test('(b) a signed run on Public Edition: the figure, the blockers by name, the whole frame', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, SIGNED);

    await expect(page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"] [data-workspace-tool-mark="check"]')).toHaveCount(1);

    const fit = page.locator('#standard-fit');
    await expect(fit).toHaveAttribute('data-standard-fit', 'ready', { timeout: 90000 });
    await expect(fit.locator('h3')).toHaveText('Fit to standard on Public Edition');
    await expect(fit).toContainText('Clean-Core.io measure, not an SAP figure');
    const percent = Number(await fit.locator('[data-standard-fit-value]').getAttribute('data-standard-fit-percent'));
    const [fits, counted] = (await fit.locator('[data-standard-fit-count]').getAttribute('data-standard-fit-count'))!
      .split('/')
      .map(Number);
    expect(counted).toBeGreaterThan(0);
    expect(percent).toBe(fits === counted ? 100 : fits === 0 ? 0 : Math.min(99, Math.max(1, Math.round((fits / counted) * 100))));
    await expect(fit.locator('[data-overview-bar="standard-fit"]')).toHaveAttribute('role', 'img');

    // Each blocker: object, level, line anchor, provenance chip.
    const blockers = fit.locator('[data-standard-fit-list="blocks"] [data-standard-fit-item]');
    expect(await blockers.count()).toBeGreaterThan(0);
    for (const b of await blockers.all()) {
      await expect(b.locator('[data-standard-fit-object]')).not.toBeEmpty();
      await expect(b.locator('[data-cc-identifier="clean-core-level"]')).toHaveCount(1);
      await expect(b.locator('[data-standard-fit-anchor]')).toHaveAttribute('data-standard-fit-anchor', /^\d+$/);
      await expect(b.locator('[data-standard-fit-anchor] [data-cc-anchor]')).toContainText(/^L\d+/);
      await expect(b.locator('[data-cc-provenance], [data-provenance]').first()).toBeVisible();
    }
    // The direct write to EKPO is named as level D.
    await expect(fit.locator('[data-standard-fit-item="EKPO"] [data-cc-identifier="clean-core-level"]')).toHaveAttribute('data-cc-value', 'D');

    // The whole frame on a desktop, not a 768 px column.
    const width = await page.locator('[data-management-executive]').evaluate((el) => el.getBoundingClientRect().width);
    expect(width, 'Management uses less than the frame').toBeGreaterThan(1000);
    // Decision and fit stand side by side.
    const [d, f] = await Promise.all([
      page.locator('[data-executive-decision]').boundingBox(),
      fit.boundingBox(),
    ]);
    expect(Math.abs(d!.y - f!.y), 'the two answers do not stand side by side').toBeLessThan(4);
    expect(f!.x).toBeGreaterThan(d!.x + d!.width - 1);

    // One primary action; the rest folded, named, with a summary.
    await expect.poll(() => visiblePrimaries(page)).toHaveLength(1);
    for (const id of ['evidence', 'options', 'costs', 'process']) {
      await expect(page.locator(`[data-management-fold="${id}"] > [data-cc-disclosure="closed"]`)).toHaveCount(1);
      await expect(page.locator(`[data-management-fold="${id}"] > [data-cc-disclosure] > [data-cc-disclosure-summary]`)).not.toBeEmpty();
    }
  });

  test('(b) on a phone at 390 px: stacked, and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signInThroughForm(page, acct);
    await open(page, SIGNED);
    await expect(page.locator('#standard-fit')).toHaveAttribute('data-standard-fit', 'ready', { timeout: 90000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Management scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    const [d, f] = await Promise.all([
      page.locator('[data-executive-decision]').boundingBox(),
      page.locator('#standard-fit').boundingBox(),
    ]);
    expect(f!.y, 'the fit card is not under the decision on a phone').toBeGreaterThan(d!.y + d!.height - 1);
    // The definition is a tap away, not behind a hover.
    await page.locator('button[data-info-popover="standard-fit"]').tap();
    await expect(page.locator('[data-info-popover-panel="standard-fit"]')).toContainText('not an SAP figure');
    await context.close();
  });
});
