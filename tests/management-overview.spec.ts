import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  MAX_OVERVIEW_CARDS,
  OVERVIEW_CARD_ORDER,
  blockersCard,
  bucketMoves,
  bucketsCard,
  chartLabel,
  decisionOverviewCard,
  levelsCard,
  managementOverview,
  readinessCard,
  type FitByPlatform,
  type FitResult,
  type Loaded,
  type OverviewSource,
} from '../lib/management-overview';
import { managementAnswers, runHistoryEntry, scoreTrend, type RunHistoryEntry } from '../lib/management-answers';
import {
  assignPublicCloudFit,
  summarizePublicCloudFit,
  type PublicCloudFitObjectInput,
  type TargetPlatform,
} from '../lib/abap/public-cloud-fit';
import { emptyProjectDecision } from '../lib/project-decision';
import type { ItFindingRow, ItFindingsSource } from '../lib/it-findings';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.0.10 — the Management view becomes readable in seconds.
 *
 * Two halves. The first drives `lib/management-overview.ts` from fixtures and
 * holds the three limits of the roadmap line where they are decided: *not
 * determined* is its own segment of every chart and never folded away, every
 * card names its coverage, and no card carries an amount of money. The second
 * renders the overview on a seeded project, one test per diagram, and reads
 * each chart as a reader without a mouse or without sight would: the
 * `aria-label`, the table, the dashed *not determined* area.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------- fixtures */

const obj = (over: Partial<PublicCloudFitObjectInput> & { objectName: string }): PublicCloudFitObjectInput => ({
  level: 'A',
  levelProvenance: 'catalog',
  dropDecision: null,
  usage: null,
  catalog: { pathEvidence: 'successor-named' },
  hasModification: false,
  hasOwnWriteAccess: false,
  ...over,
});

/** A: keep anywhere. B: keep in Private, rebuild in Public. C-none: no catalogued path. U: level unknown. */
const OBJECTS: PublicCloudFitObjectInput[] = [
  obj({ objectName: 'I_PURCHASEORDERAPI01', level: 'A' }),
  obj({ objectName: 'BAPI_PO_CREATE1', level: 'B' }),
  obj({ objectName: 'T16FS', level: 'C', catalog: { pathEvidence: 'none-named' } }),
  obj({ objectName: 'ZZ_UNKNOWN', level: 'Unknown', levelProvenance: 'heuristic', catalog: null }),
];

function fitFor(platform: TargetPlatform, objects = OBJECTS): FitResult {
  const assignments = objects.map((o) => assignPublicCloudFit(o, platform));
  return { assignments, summary: summarizePublicCloudFit(assignments, { targetPlatform: platform, usageImported: false }) };
}

const FIT = (target: TargetPlatform | null, objects = OBJECTS): FitByPlatform => ({
  target,
  private: fitFor('private', objects),
  public: fitFor('public', objects),
});

const row = (over: Partial<ItFindingRow> & { id: string }): ItFindingRow => ({
  kind: 'standard-table-read',
  title: 'Direct read',
  severity: 'Medium',
  objectName: 'EKPO',
  objectType: 'TABL',
  lineStart: 10,
  lineEnd: null,
  routine: null,
  level: 'C',
  releaseView: null,
  classificationView: null,
  successor: null,
  targetOptions: [],
  rulesCoveringLine: [],
  rulesInRoutine: [],
  ...over,
});

const FINDINGS: ItFindingsSource = {
  rows: [
    row({ id: 'CC-001', level: 'A', objectName: 'I_PURCHASEORDERAPI01' }),
    row({ id: 'CC-002', level: 'C' }),
    row({ id: 'CC-003', level: 'D', objectName: 'T16FS' }),
    row({ id: 'CC-004', level: 'Unknown', objectName: 'ZZ_UNKNOWN' }),
    row({ id: 'CC-005', level: null, objectName: null, kind: 'commit-work' }),
  ],
  sourceSha256: 'a'.repeat(64),
  rulesDerived: 0,
};

const V1 = { rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08' };
const V2 = { ...V1, sapApiCatalogVersion: 'cat-2026-09' };
const entry = (over: Record<string, unknown>): RunHistoryEntry => {
  const e = runHistoryEntry({ runId: 'run-1', createdAt: '2026-09-01T10:00:00.000Z', cleanCoreScore: 42, ...V1, ...over });
  if (!e) throw new Error('fixture is not a run');
  return e;
};

const project = (over: Partial<Project> = {}): Project => ({
  name: 'Emergency purchase approval',
  legacyCode: 'REPORT z.\nWRITE 1.\n',
  activeRunId: 'run-2',
  ...over,
});

const HISTORY = [
  entry({ runId: 'run-1', createdAt: '2026-05-20T10:00:00.000Z', cleanCoreScore: 42 }),
  entry({ runId: 'run-2', createdAt: '2026-09-09T10:00:00.000Z', cleanCoreScore: 58 }),
  entry({ runId: 'run-0', createdAt: '2026-04-01T10:00:00.000Z', cleanCoreScore: 30, ...V2 }),
];

const ready = <T,>(value: T): Loaded<T> => ({ state: 'ready', value });

function source(over: Partial<OverviewSource> = {}): OverviewSource {
  return {
    view: managementAnswers(project(), HISTORY, null),
    fit: ready(FIT('private')),
    findings: ready(FINDINGS),
    decision: ready({ draft: emptyProjectDecision(), stored: null }),
    ...over,
  };
}

/* ------------------------------------------------ (b) the four buckets */

test.describe('(b) the four buckets', () => {
  test('not assigned is its own segment, present even at zero, and never a bucket colour', () => {
    const card = bucketsCard(ready(FIT('private')));
    if (card.state !== 'ready') throw new Error('not ready');
    for (const chart of card.charts) {
      const na = chart.segments.find((s) => s.key === 'not-assigned')!;
      expect(na.notDetermined).toBe(true);
      expect(na.tone).toBe('not-determined');
      expect(na.count).toBe(1);
      // §1.8: a chart that does not count states takes the categorical palette.
      for (const s of chart.segments) expect(s.tone).toMatch(/^(chart-\d|not-determined)$/);
    }
    const none = bucketsCard(ready(FIT('private', OBJECTS.slice(0, 2))));
    if (none.state !== 'ready') throw new Error('not ready');
    const zero = none.charts[0].segments.find((s) => s.key === 'not-assigned')!;
    expect(zero.count, 'a zero is still a row of the table').toBe(0);
  });

  test('the target platform leads, and the title answers for it', () => {
    const card = bucketsCard(ready(FIT('public')));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.charts[0].platform).toBe('public');
    expect(card.charts[0].isTarget).toBe(true);
    expect(card.title).toMatch(/^For Public Edition: /);
    expect(card.title).toContain('1 not assigned');
    expect(card.coverage).toContain('of 4 objects');
  });

  test('what moves between the editions is named object by object', () => {
    const moves = bucketMoves(FIT('private'));
    expect(moves.map((m) => m.objectName)).toEqual(['BAPI_PO_CREATE1']);
    expect(moves[0]).toMatchObject({ privateBucket: 'Keep', publicBucket: 'Rebuild' });
  });

  test('without a target platform both editions are shown, and nothing is assigned by default', () => {
    const card = bucketsCard(ready(FIT(null)));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.title).toContain('No target platform set');
    expect(card.charts.every((c) => !c.isTarget)).toBe(true);
  });

  test('a lookup that failed is an absent card with its reason, not a chart of zeros', () => {
    const card = bucketsCard({ state: 'absent', reason: 'The catalog lookup failed.' });
    expect(card).toEqual({ state: 'absent', title: 'The four buckets are not determined', reason: 'The catalog lookup failed.' });
  });
});

/* ------------------------------------------------ (c) the score history */

test.describe('(c) the Clean Core Score over one rule version', () => {
  test('only runs of the active rule version are points; the other version is a named break', () => {
    const card = readinessCard(scoreTrend(project(), HISTORY));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.points.map((p) => p.score)).toEqual([42, 58]);
    expect(card.points.map((p) => p.date)).toEqual(['2026-05-20', '2026-09-09']);
    expect(card.ruleVersion).toContain('catalog cat-2026-08');
    expect(card.breaks).toHaveLength(1);
    expect(card.breaks[0]).toContain('cat-2026-09');
    expect(card.breaks[0]).toContain('not drawn');
    expect(card.title).toBe('Clean Core Score 58, up from 42 with the same rules');
    // ADR-029: the Einordnung stands under the title, not only in a popover.
    expect(card.lead).toContain('A grade, not a compliance percentage');
  });

  test('one run is no history: one point, no line, and the title says so', () => {
    const card = readinessCard(scoreTrend(project({ activeRunId: 'run-1' }), [entry({ runId: 'run-1' })]));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.points).toHaveLength(1);
    expect(card.title).toContain('no history yet');
  });

  test('runs that cannot be placed are counted as not determined, not dropped', () => {
    const history = [...HISTORY, entry({ runId: 'run-3', cleanCoreScore: null }), entry({ runId: 'run-4', analyzerVersion: null })];
    const card = readinessCard(scoreTrend(project(), history));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.notDetermined.count).toBe(2);
    expect(card.notDetermined.sentence).toContain('with no score');
    expect(card.notDetermined.sentence).toContain('no complete rule version');
  });

  test('without a run there is no score and no point', () => {
    const card = readinessCard(scoreTrend(project({ activeRunId: undefined }), []));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.points).toEqual([]);
    expect(card.provenance).toBe('not-determined');
    expect(card.title).toContain('No Clean Core Score');
  });
});

/* ------------------------------------------------ (d) the level chart */

test.describe('(d) the level distribution A–D', () => {
  test('state colours for the four levels, Unknown as not determined, and the letter in every label', () => {
    const card = levelsCard(ready(FINDINGS));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.segments.map((s) => [s.key, s.tone, s.count])).toEqual([
      ['A', 'level-A', 1],
      ['B', 'level-B', 0],
      ['C', 'level-C', 1],
      ['D', 'level-D', 1],
      ['Unknown', 'not-determined', 1],
    ]);
    expect(card.segments.find((s) => s.key === 'Unknown')!.label).toBe('Not determined');
    for (const g of ['A', 'B', 'C', 'D']) expect(card.segments.find((s) => s.key === g)!.label).toBe(`Level ${g}`);
    expect(card.title).toBe('4 of 5 findings carry a level: A 1, B 0, C 1, D 1, 1 not determined');
    // The finding that names no object is an exclusion with its reason, not an Unknown.
    expect(card.coverage).toContain('4 of 5 findings in this run');
    expect(card.coverage).toContain('1 about a statement');
    expect(card.provenance).toBe('imported');
  });

  test('every number of a chart is also in its label', () => {
    const card = levelsCard(ready(FINDINGS));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(chartLabel('Levels', card.segments)).toBe(
      'Levels: Level A 1, Level B 0, Level C 1, Level D 1, Not determined 1.',
    );
  });
});

/* ------------------------------------------------ (e) what blocks */

test.describe('(e) what blocks the decision', () => {
  test('an ordered list with evidence per line; an object without a catalogued path blocks Public Edition', () => {
    const card = blockersCard(source());
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.rows.map((r) => r.rank)).toEqual(card.rows.map((_, i) => i + 1));
    for (const r of card.rows) expect(r.evidence.length, `${r.key} carries no evidence`).toBeGreaterThan(10);
    const noPath = card.rows.find((r) => r.key === 'no-path-T16FS')!;
    expect(noPath.scope).toBe('public-edition');
    expect(noPath.evidence).toContain('names no released successor');
    // The decision record's own blocking gaps come before the platform question.
    const firstDecision = card.rows.findIndex((r) => r.key.startsWith('decision-'));
    expect(firstDecision).toBeGreaterThanOrEqual(0);
    expect(firstDecision).toBeLessThan(card.rows.indexOf(noPath));
    expect(card.coverage).toContain('3 of 3 sources read');
  });

  test('with no run, "no signed run" is the first line and the run gap is not repeated', () => {
    const view = managementAnswers(project({ activeRunId: undefined }), [], null);
    const card = blockersCard(source({ view }));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.rows[0].key).toBe('view-no-run');
    expect(card.rows.some((r) => r.key === 'decision-run-not-bound')).toBe(false);
  });

  test('a source that could not be read is named, so an empty list is not read as "nothing blocks"', () => {
    const view = managementAnswers(project(), HISTORY, null);
    const card = blockersCard({
      view,
      fit: { state: 'absent', reason: 'the findings could not be read.' },
      findings: { state: 'absent', reason: 'x' },
      decision: { state: 'absent', reason: 'No source is staged.' },
    });
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.unread).toHaveLength(2);
    expect(card.coverage).toContain('1 of 3 sources read');
    expect(card.title).not.toBe('Nothing blocks the decision');
  });
});

/* ------------------------------------------------ (f) the decision */

test.describe('(f) where the decision stands', () => {
  test('an open draft says what it waits for', () => {
    const card = decisionOverviewCard(ready({ draft: emptyProjectDecision(), stored: null }));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.title).toBe(
      'One decision open (DEC-1). It waits for a bound analysis run, an architecture contract and a chosen option',
    );
    expect(card.conditions.map((c) => c.status)).toEqual(['open', 'not-determined', 'met', 'waived']);
    expect(card.coverage).toContain('0 of 5 bindings');
  });

  test('a confirmed record is shown instead of the draft, as a self-declaration', () => {
    const stored = { ...emptyProjectDecision(), status: 'confirmed' as const, revision: 3 };
    const card = decisionOverviewCard(ready({ draft: emptyProjectDecision(), stored }));
    if (card.state !== 'ready') throw new Error('not ready');
    expect(card.title).toMatch(/^Decision DEC-1 is confirmed \(revision 3\)/);
    expect(card.lead).toContain('self-declaration');
  });
});

/* ------------------------------------------------ (a) the whole */

test.describe('(a) one sentence, at most six cards', () => {
  test('the headline answers with the decision, the Public Edition blockers and the score', () => {
    const o = managementOverview(source(), { hasSource: true, hasRun: true });
    expect(o.headline).toBe(
      'One decision open (DEC-1). It waits for a bound analysis run, an architecture contract and a chosen option. ' +
        '1 object blocks a Public Edition decision. Clean Core Score 58.',
    );
    expect(OVERVIEW_CARD_ORDER.length).toBeLessThanOrEqual(MAX_OVERVIEW_CARDS);
  });

  test('without a signed run the view’s own sentence stands, whatever arrives later', () => {
    const view = managementAnswers(project({ activeRunId: undefined }), [], null);
    const o = managementOverview(source({ view }), { hasSource: true, hasRun: false });
    expect(o.headline).toContain('No signed run');
  });

  test('every ready card names its coverage', () => {
    const o = managementOverview(source(), { hasSource: true, hasRun: true });
    for (const id of OVERVIEW_CARD_ORDER) {
      const card = o[id];
      if (card.state !== 'ready') throw new Error(`${id} not ready`);
      expect(card.coverage.length, `${id} has no coverage`).toBeGreaterThan(10);
      expect(card.title.length, `${id} has no answer title`).toBeGreaterThan(10);
    }
  });

  test('no amount of money anywhere in the overview', () => {
    const text = JSON.stringify(managementOverview(source(), { hasSource: true, hasRun: true }));
    expect(text).not.toMatch(/€|\$\s?\d|\bEUR\b|\bUSD\b|currency/i);
    for (const rel of ['lib/management-overview.ts', 'components/workspace/ManagementOverview.tsx']) {
      expect(read(rel), `${rel} formats money`).not.toMatch(/style:\s*'currency'|€/);
    }
  });

  test('the module is pure and stores nothing', () => {
    const src = read('lib/management-overview.ts');
    for (const line of src.split('\n').filter((l) => /^\s*import\b/.test(l))) {
      expect(line).not.toMatch(/react|firebase|firestore|gemini/i);
    }
    expect(src).not.toContain('fetch(');
    const component = read('components/workspace/ManagementOverview.tsx');
    expect(component, 'the overview writes').not.toMatch(/setDoc|updateDoc|addDoc|method:\s*'(POST|PUT|PATCH|DELETE)'/);
  });
});

/* -------------------------------------------------------- on the screen */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ManagementOverview123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** Reads, standard-table access, a modification: enough objects for every chart to have segments. */
const SEEDED_SOURCE = `REPORT z_mgmt_overview.
DATA: lt_ekpo TYPE TABLE OF ekpo.
SELECT * FROM ekpo INTO TABLE lt_ekpo.
SELECT SINGLE * FROM t16fs INTO @DATA(ls_t16fs).
UPDATE ekpo SET loekz = 'L' WHERE ebeln = '1'.
CALL FUNCTION 'BAPI_PO_CREATE1'.
`;

test.describe('the overview on the screen — one rendered test per chart', () => {
  const ADMIN = `${unique('mgmt-ov-admin')}@cleancore-test.io`;
  const ID = unique('mgmt-ov');
  const RUN = { rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08' };

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Overview', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', ID, {
      name: 'Overview charts', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: SEEDED_SOURCE, s4Deployment: 'private', activeRunId: 'run-b',
    });
    for (const [runId, createdAt, score, version] of [
      ['run-a', '2026-05-20T10:00:00.000Z', 42, RUN],
      ['run-b', '2026-09-09T10:00:00.000Z', 58, RUN],
      ['run-old', '2026-04-01T10:00:00.000Z', 30, { ...RUN, sapApiCatalogVersion: 'cat-2026-01' }],
    ] as const) {
      await adminSetDoc(`projects/${ID}/runs`, runId, {
        runId, userId: cred.user.uid, createdAt, cleanCoreScore: score, ...version,
      });
    }
  });

  async function open(page: Page) {
    await signIn(page, ADMIN);
    await page.goto(`/project/${ID}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-management-overview]')).toBeVisible({ timeout: 60000 });
  }

  test('(b) buckets: a labelled bar per edition, one table, not assigned as its own row', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await open(page);
    const card = page.locator('[data-overview-card="buckets"][data-overview-state="ready"]');
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card.locator('h3')).toContainText('For Private Edition:');
    for (const platform of ['private', 'public']) {
      const bar = card.locator(`[data-overview-bar="buckets-${platform}"]`);
      await expect(bar).toHaveAttribute('role', 'img');
      await expect(bar).toHaveAttribute('aria-label', /Not assigned \d+/);
    }
    await expect(card.locator('[data-overview-row="not-assigned"]')).toHaveCount(1);
    await expect(card.locator('[data-overview-coverage]')).toContainText('objects named in the staged source');
    await expect(card, 'an amount of money on the overview').not.toContainText(/€|EUR/);
  });

  test('(c) score history: two points on one rule version, the older version named as a break', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await open(page);
    const card = page.locator('[data-overview-card="readiness"]');
    await expect(card.locator('h3')).toHaveText('Clean Core Score 58, up from 42 with the same rules', { timeout: 60000 });
    await expect(card.locator('[data-overview-trend]')).toHaveAttribute('aria-label', /42 on 2026-05-20, 58 on 2026-09-09/);
    await expect(card.locator('[data-overview-breaks]')).toContainText('cat-2026-01');
    await expect(card.locator('[data-overview-not-determined="readiness"]')).toBeVisible();
    await expect(card).toContainText('A grade, not a compliance percentage');
  });

  test('(d) levels: state colours with letters, Unknown as a dashed not-determined area', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await open(page);
    const card = page.locator('[data-overview-card="levels"][data-overview-state="ready"]');
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card.locator('[data-overview-bar="levels"]')).toHaveAttribute('aria-label', /Level A \d+, Level B \d+, Level C \d+, Level D \d+, Not determined \d+/);
    for (const key of ['A', 'B', 'C', 'D', 'Unknown']) await expect(card.locator(`[data-overview-row="${key}"]`)).toHaveCount(1);
    const nd = card.locator('[data-overview-row="Unknown"] [data-chart-swatch]');
    expect(await nd.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
  });

  test('(e) blockers: an ordered list, evidence on every line', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await open(page);
    const card = page.locator('[data-overview-card="blockers"][data-overview-state="ready"]');
    await expect(card).toBeVisible({ timeout: 60000 });
    const items = card.locator('[data-overview-blockers] > li');
    const n = await items.count();
    for (let i = 0; i < Math.min(n, 5); i++) {
      await expect(items.nth(i)).toContainText(`${i + 1}.`);
      await expect(items.nth(i).locator('p')).not.toBeEmpty();
    }
  });

  test('(f) decision: what is open and what it waits for, with a way to the card', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await open(page);
    const card = page.locator('[data-overview-card="decision"][data-overview-state="ready"]');
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card.locator('h3')).toContainText(/One decision open \(DEC-1\)|Decision DEC-1/);
    await expect(card.locator('a[href="#decision-card"]')).toBeVisible();
  });

  test('forced colours and print keep every chart readable', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await open(page);
    const seg = page.locator('[data-overview-bar="levels"] [data-chart-segment]').first();
    await expect(seg).toBeVisible({ timeout: 60000 });
    expect(await seg.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('solid');
    await page.emulateMedia({ media: 'print' });
    // On paper the numbers are in the tables, whatever the printer does with the fills.
    await expect(page.locator('[data-overview-card="levels"] [data-overview-table]')).toBeVisible();
    await context.close();
  });
});
