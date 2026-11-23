import { test, expect, type Page } from './helpers/test';
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
import { fitPercent, NO_SAP_DEPENDENCY_TITLE, sapCallsOf, standardFit, STANDARD_FIT_DEFINITION, type StandardFitSource } from '../lib/standard-fit';
import { resolvePublicCloudFit } from '../lib/abap/public-cloud-fit-resolver';
import { gradeSapObjectUse, hasNoReleasedApiPath } from '../lib/abap/catalog-service';
import type { ObjectUse } from '../lib/abap/abcd-classification';
import { findingsOf } from '../lib/it-findings-build';
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
    expect(priv.platformLabel).toBe('SAP Cloud ERP Private');
    expect(priv.counted).toBe(pub.counted);
  });

  test('not determined without a signed run or a target platform; no SAP object at all is an answer', () => {
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
    // Owner, 03.10.2026: code that touches no SAP object is the best case, not a gap —
    // and it carries no percentage, since 0 of 0 is neither 0 % nor 100 %.
    const none = standardFit(source({ fit: empty }));
    expect(none).toMatchObject({ state: 'none-used', basis: 'signed-run' });
    expect(JSON.stringify(none)).not.toMatch(/\d\s?%/);
    // The run comes first: without one, nothing is said about dependencies either.
    expect(standardFit(source({ fit: empty, hasRun: false, analyzeState: 'partial' }))).toMatchObject({
      state: 'not-determined',
      why: 'no-run',
    });
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

  test('called SAP function modules and BAPIs are SAP objects; a customer module is not (note of 03.10.2026)', () => {
    // Z_SALES_ORDER_CREATOR reaches SAP only through three BAPIs: no finding,
    // and the figure used to say "no SAP object". Its calls are now counted,
    // from the IT view's own `uses`, with the IT view's levels.
    const code = read('public/starter-examples/Z_SALES_ORDER_CREATOR.txt')
      + "\nFORM own_call.\n  CALL FUNCTION 'Z_OWN_MODULE'.\nENDFORM.\n";
    const findings = findingsOf(code, 'Z_SALES_ORDER_CREATOR.txt', 'public');
    // Since engine 3.0.18 (03f0ffe6, E6) the create BAPI is also a classic-api
    // finding; the other two calls and the customer module raise none.
    expect(findings.rows.map((r) => [r.kind, r.objectName])).toEqual([['classic-api', 'BAPI_SALESORDER_CREATEFROMDAT2']]);
    const calls = sapCallsOf(findings);
    expect(calls.sort()).toEqual(['BAPI_SALESORDER_CREATEFROMDAT2', 'BAPI_TRANSACTION_COMMIT', 'BAPI_TRANSACTION_ROLLBACK']);
    const deps = {
      gradeObjectUse: (name: string, use: ObjectUse | null) => gradeSapObjectUse(name, use),
      hasNoPath: (name: string) => hasNoReleasedApiPath(name),
    };
    const fitOn = (platform: TargetPlatform) =>
      resolvePublicCloudFit({ findings: [], calls, usageReport: null, targetPlatform: platform }, deps);
    const fit: Loaded<FitByPlatform> = { state: 'ready', value: { target: 'public', public: fitOn('public'), private: fitOn('private') } };
    const src = source({ findings: { state: 'ready', value: findings }, signedSourceSha256: findings.sourceSha256, fit });

    const pub = standardFit(src);
    if (pub.state !== 'ready') throw new Error(`not ready: ${JSON.stringify(pub)}`);
    // The level on the fit card is the IT view's level for the same call.
    const itLevel = new Map(findings.uses!.map((u) => [u.object, u.level]));
    for (const item of [...pub.blockers, ...pub.clear]) {
      expect(item.level).toBe(itLevel.get(item.objectName));
      expect(item.use).toBe('call');
      expect(item.line).toBe(findings.uses!.find((u) => u.object === item.objectName)!.lines[0]);
    }
    // On Public Edition none of the three has a catalogued released path: the
    // classic BAPI (B) is not in SAP's release file, the two C calls are listed nowhere.
    expect([pub.fits, pub.counted, pub.percent]).toEqual([0, 3, 0]);
    expect(pub.blockers.map((b) => [b.objectName, b.level]).sort()).toEqual([
      ['BAPI_SALESORDER_CREATEFROMDAT2', 'B'],
      ['BAPI_TRANSACTION_COMMIT', 'C'],
      ['BAPI_TRANSACTION_ROLLBACK', 'C'],
    ]);
    expect(pub.blockers.every((b) => /^Called here; not in SAP's release file/.test(b.why))).toBe(true);
    // On Private Edition the classic API at B is kept.
    const priv = standardFit({ ...src, fit: { state: 'ready', value: { ...fit.value, target: 'private' } } });
    if (priv.state !== 'ready') throw new Error('not ready');
    expect([priv.fits, priv.counted, priv.clear.map((c) => c.objectName)]).toEqual([1, 3, ['BAPI_SALESORDER_CREATEFROMDAT2']]);
  });

  test('Z_EMPLOYEE_EXPENSE_VAL uses no SAP object: "No SAP dependency"; a fresh project without a run stays not determined', () => {
    const code = read('tests/fixtures/retired-starter-examples/Z_EMPLOYEE_EXPENSE_VAL.txt');
    const findings = findingsOf(code, 'Z_EMPLOYEE_EXPENSE_VAL.txt', 'private');
    expect(findings.rows.filter((r) => r.objectName)).toEqual([]);
    const calls = sapCallsOf(findings);
    expect(calls).toEqual([]);
    const deps = {
      gradeObjectUse: (name: string, use: ObjectUse | null) => gradeSapObjectUse(name, use),
      hasNoPath: (name: string) => hasNoReleasedApiPath(name),
    };
    const fitOn = (platform: TargetPlatform) =>
      resolvePublicCloudFit({ findings: [], calls, usageReport: null, targetPlatform: platform }, deps);
    const fit: Loaded<FitByPlatform> = { state: 'ready', value: { target: 'private', public: fitOn('public'), private: fitOn('private') } };
    const signed = source({ findings: { state: 'ready', value: findings }, signedSourceSha256: findings.sourceSha256, fit });
    const answer = standardFit(signed);
    expect(answer).toMatchObject({
      state: 'none-used',
      sentence: 'This code reads, writes and calls no SAP object, so nothing in it blocks the standard path.',
    });
    expect(NO_SAP_DEPENDENCY_TITLE).toBe('No SAP dependency');
    expect(standardFit({ ...signed, hasRun: false, analyzeState: 'partial' })).toMatchObject({ state: 'not-determined', why: 'no-run' });
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

  /**
   * Analyze's Management view is a page of its own since ADR-143 (owner request 23.11.2026): the decision's question
   * as the answer card, four facets (the distance to clean core with its Level A–D mix replaces the fit-to-standard
   * card of ADR-069 there), the serious findings by name with their lines, and one way on, Re-design. A project with
   * no signed run gets Analyze's start path in that view.
   */
  async function open(page: Page, projectId: string, ready: string): Promise<void> {
    await page.goto(`/project/${projectId}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(ready).first()).toBeVisible({ timeout: 90000 });
  }

  /** The primary buttons a reader can see on the page — the next step must be the only one. */
  const visiblePrimaries = (page: Page) =>
    page.locator('main [data-cc-button="primary"]').evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => (el.textContent || '').trim()),
    );

  test('(a) a fresh project: no check on Analyze, the figure not determined, one primary "Run the analysis"', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, FRESH, '[data-stage-tools="open"] a[data-workspace-tool="analyze"]');

    const analyzeTool = page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyzeTool.locator('[data-workspace-tool-mark="check"]')).toHaveCount(0);

    // No signed run: no Management page with a figure on it, and no number nobody measured.
    await expect(page.locator('[data-analyze-management="ready"]')).toHaveCount(0);
    await expect(page.locator('[data-facet="distance"]')).toHaveCount(0);
    await expect(page.locator('main'), 'a percentage nobody measured').not.toContainText(/\d\s*%/);

    // One primary action, the start of the analysis; no second "Next step" card.
    await expect.poll(() => visiblePrimaries(page), { timeout: 60000 }).toEqual(['Start Analysis']);
    expect(await page.locator('[data-next-step]').count(), 'a second "Next step" card in Management').toBe(0);
  });

  test('(b) a signed run on Public Edition: the figure, the blockers by name, the whole frame', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, SIGNED, '[data-analyze-management="ready"]');

    await expect(page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"] [data-workspace-tool-mark="check"]')).toHaveCount(1);

    // The figure: the signed score, of 100, with the Level A–D mix of the objects the findings name.
    const distance = page.locator('[data-facet="distance"]');
    await expect(distance).toContainText('Distance to clean core');
    await expect(distance).toContainText('58');
    await expect(distance).toContainText('of 100');
    const levels = distance.locator('[data-management-levels] [data-cc-level-trigger]');
    await expect(levels).toHaveCount(4, { timeout: 90000 });
    // The direct write to EKPO is level D: at least one D.
    await expect(distance.locator('[data-cc-level-trigger="D"]')).toContainText(/D [1-9]/);

    // The blockers by name: the serious findings, grouped, each with its line anchors.
    const risks = page.locator('[data-management-risks] > li');
    expect(await risks.count()).toBeGreaterThan(0);
    for (const r of await risks.all()) {
      await expect(r.locator('span.font-semibold').first()).not.toBeEmpty();
      await expect(r.locator('[data-cc-anchor]').first()).toContainText(/^L\d+/);
    }

    // The whole frame on a desktop, not a 768 px column: the answer card takes it.
    const width = await page.locator('#management-answer').evaluate((el) => el.getBoundingClientRect().width);
    expect(width, 'Management uses less than the frame').toBeGreaterThan(1000);

    // One primary action, the way on to Re-design; no folds of the old view.
    await expect.poll(() => visiblePrimaries(page), { timeout: 60000 }).toHaveLength(1);
    await expect(page.locator('[data-analyze-management-redesign]')).toHaveAttribute('href', `/project/${SIGNED}/redesign`);
    await expect(page.locator('[data-management-fold]')).toHaveCount(0);
    // The four options are listed without a tool link, and the cost is said once.
    await expect(page.locator('[data-management-option]')).toHaveCount(4);
    await expect(page.locator('[data-management-not-priced]')).toHaveCount(1);
  });

  test('(b) on a phone at 390 px: stacked, and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signInThroughForm(page, acct);
    await open(page, SIGNED, '[data-analyze-management="ready"]');
    const trigger = page.locator('[data-management-levels] [data-cc-level-trigger]').first();
    await expect(trigger).toBeVisible({ timeout: 90000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Management scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    const [a, o] = await Promise.all([
      page.locator('#management-answer').boundingBox(),
      page.locator('#mgmt-options').boundingBox(),
    ]);
    expect(o!.y, 'the options are not under the answer on a phone').toBeGreaterThan(a!.y + a!.height - 1);
    // A level is a tap away, not behind a hover.
    await trigger.tap();
    const level = await trigger.getAttribute('data-cc-level-trigger');
    await expect(page.locator(`[data-cc-level-explanation="${level}"]`).first()).toBeVisible();
    await context.close();
  });
});
