import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { managementAnswers, runHistoryEntry, type RunHistoryEntry } from '../lib/management-answers';
import { itFindingsView, type ItFindingRow, type ItFindingsSource } from '../lib/it-findings';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { buildArchitectureContract } from '../lib/architecture-contract';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { sha256Hex } from '../lib/artefact-digest';
import { containsAmount } from '../lib/money-honesty';
import { isProvenanceValue } from '../lib/provenance';
import type { ProjectDecision } from '../lib/project-decision';
import type { NotDetermined } from '../lib/workspace-model';
import type { Project } from '../lib/types';
import { steeringOnePager, STEERING_GROUPS, type SteeringSource } from '../lib/steering-one-pager';

/**
 * Roadmap 8.6 — the steering one-pager.
 *
 * *„Eine Seite (PDF) mit ausschließlich Zahlen, die per Link zur Evidenz
 * führen, jede mit ihrer Abdeckung, und der Spalte ‚nicht bestimmt'."*
 *
 * Every clause is a way to lie on one page, so each has its own check:
 *   - **only numbers that exist elsewhere** — each figure on the page is one a
 *     workspace model already derived, with the same value;
 *   - **each with its coverage and a link** — no figure without either;
 *   - **„nicht bestimmt"** — a figure a model could not give moves into its own
 *     column with the reason in words, never as a zero;
 *   - **costs** — never an amount, and not determined while the decision binds
 *     no cost revision (8.4: costs are never bound until 7.4's assumptions are
 *     stored).
 *
 * The first five blocks are pure and need no server. The last one renders the
 * page and needs the emulators and a dev server.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------- fixtures */

const SOURCE = 'REPORT z_mm_po_approval.\nWRITE 1.\n';

const signed: Project = {
  name: 'Emergency purchase approval',
  legacyCode: SOURCE,
  activeRunId: 'run-1',
  cleanCoreScore: 62,
  auditMetadata: {
    inputFingerprint: {
      sha256: sha256Hex(SOURCE),
      fileName: 'Z_MM_PO_APPROVAL.abap',
      lineCount: 640,
      byteSize: 21_400,
      uploadedAt: '2026-09-01T09:00:00.000Z',
      objectType: 'Report',
    },
  },
};

const run = (over: Record<string, unknown> = {}): RunHistoryEntry => {
  const parsed = runHistoryEntry({
    runId: 'run-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    cleanCoreScore: 62,
    rulesetVersion: 'rules-v1.0',
    analyzerVersion: '2.9.0',
    sapApiCatalogVersion: 'cat-2026-08',
    ...over,
  });
  if (!parsed) throw new Error('fixture is not a run');
  return parsed;
};

const open: NotDetermined = {
  items: [
    { label: 'Dynamic call', why: 'the target is read at runtime', anchor: 'L502' },
    { label: 'Macro', why: 'macros are not expanded', anchor: 'L88' },
  ],
  count: 2,
  noSource: false,
};

const row = (over: Partial<ItFindingRow> = {}): ItFindingRow => ({
  id: 'CC-001',
  kind: 'standard-table-read',
  title: 'Direct read of an SAP table',
  severity: 'Medium',
  objectName: 'VBAK',
  objectType: 'Database Table',
  lineStart: 228,
  lineEnd: null,
  routine: 'READ_ORDERS',
  level: 'C',
  releaseView: 'Not to be released',
  classificationView: 'Not listed',
  successor: 'API_SALES_ORDER_SRV',
  targetOptions: ['Developer Extensibility / RAP'],
  rulesCoveringLine: ['BR-001'],
  rulesInRoutine: ['BR-001'],
  ...over,
});

const findings: ItFindingsSource = {
  rows: [row(), row({ id: 'CC-002', level: 'A' }), row({ id: 'CC-003', objectName: null, level: null })],
  sourceSha256: sha256Hex(SOURCE),
  rulesDerived: 3,
};

const CONTRACT_SOURCE = 'REPORT z_mm_report.\nDATA: lv_c TYPE i.\nSELECT COUNT(*) FROM ekpo INTO lv_c.\nWRITE lv_c.\n';

function decisionFixture(): ProjectDecision {
  const evidence = buildAbapEvidence(CONTRACT_SOURCE, 'Z_TEST.abap', 'public');
  const route = routeExtensibility(evidence, 'public');
  const contract = buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: buildInputManifest(
      analysisRunInputs({
        sourceSha256: 'a'.repeat(64),
        deploymentTarget: 'public',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.15.0',
        model: null,
      }),
      null,
    ),
    evidence,
    route,
  });
  const digest = evidenceDigest({
    inputFingerprint: { sha256: 'a'.repeat(64), lineCount: 4 },
    evidenceReport: [{ id: 'f1' }],
    originalRecommendation: 'In-App (ABAP Cloud)',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: 'catalog-1',
    analyzerVersion: 'engine-1',
    runHash: 'b'.repeat(64),
  });
  const facts: DecisionDraftFacts = {
    runId: 'run-1',
    evidenceDigest: digest,
    runSignedAt: '2026-09-20T08:00:00.000Z',
    contract,
    signedOffArchitecture: 'rap',
    need: { revision: 4, confirmedDrops: 0, undecided: 0 },
    handedOver: false,
    stored: undefined,
    now: '2026-09-24T10:00:00.000Z',
  };
  return deriveDecisionDraft(facts).draft;
}

const full = (over: Partial<SteeringSource> = {}): SteeringSource => ({
  projectId: 'p-1',
  project: signed,
  history: [run()],
  open,
  findings,
  decision: decisionFixture(),
  ...over,
});

/* ---------------------------------------- 1. only numbers that exist elsewhere */

test.describe('8.6 one-pager — every number comes from a workspace model', () => {
  test('each Management and IT figure on the page carries the value its own view shows', () => {
    const src = full();
    const page = steeringOnePager(src);
    const management = managementAnswers(src.project, src.history, src.open).answers.flatMap((a) => a.figures);
    const it = itFindingsView(src.findings).figures;

    for (const f of management) {
      const onPage = page.figures.find((p) => p.key === f.key || p.key === `management-${f.key}`);
      const gap = page.notDetermined.find((g) => g.key === f.key || g.key === `management-${f.key}`);
      if (f.value === null) {
        expect(onPage, `${f.key} has no value and still stands among the figures`).toBeUndefined();
        expect(gap, `${f.key} has no value and is missing from "Not determined"`).toBeDefined();
      } else {
        expect(onPage?.value, `${f.key} differs from the Management view`).toBe(f.value);
        expect(onPage?.coverage).toBe(f.coverage.sentence);
      }
    }
    for (const f of it) {
      const onPage = page.figures.find((p) => p.key === `it-${f.key}`);
      if (f.value !== null) expect(onPage?.value, `it-${f.key} differs from the IT view`).toBe(f.value);
    }
  });

  test('the level distribution is the IT view’s, Unknown included', () => {
    const page = steeringOnePager(full());
    const dist = page.figures.find((f) => f.key === 'it-level-distribution');
    expect(dist?.value).toBe('A 1 · B 0 · C 1 · D 0 · Unknown 0');
    expect(dist?.coverage).toContain('2 of 3 findings in this run');
  });

  test('the decision figures are counted from the record, out of all five bindings', () => {
    const decision = decisionFixture();
    const page = steeringOnePager(full({ decision }));
    const bound = decision.bindings.filter((b) => b.revision !== null).length;
    expect(page.figures.find((f) => f.key === 'decision-bindings')?.value).toBe(`${bound} of 5`);
    const openConds = decision.conditions.filter((c) => c.status === 'open' || c.status === 'not-determined').length;
    expect(page.figures.find((f) => f.key === 'decision-conditions')?.value).toBe(
      `${openConds} of ${decision.conditions.length}`,
    );
  });
});

/* ------------------------------------------ 2. coverage and link on every figure */

test.describe('8.6 one-pager — coverage and evidence', () => {
  test('every figure has a coverage sentence, a provenance and a link into this project', () => {
    const page = steeringOnePager(full());
    expect(page.figures.length).toBeGreaterThan(5);
    for (const f of page.figures) {
      expect(f.coverage.trim(), `${f.key} has no coverage`).not.toBe('');
      expect(isProvenanceValue(f.provenance), `${f.key}: ${f.provenance}`).toBe(true);
      expect(f.evidence.href.startsWith('/project/p-1'), `${f.key} links outside the project`).toBe(true);
      expect(f.evidence.place.trim()).not.toBe('');
    }
  });

  test('what the engine stepped over carries its line anchors', () => {
    const page = steeringOnePager(full());
    const nd = page.figures.find((f) => f.key === 'not-determined');
    expect(nd?.value).toBe('2');
    expect(nd?.anchors).toEqual(['L502', 'L88']);
  });

  test('both columns come in the same group order', () => {
    const page = steeringOnePager(full());
    const idx = (g: string) => STEERING_GROUPS.indexOf(g as (typeof STEERING_GROUPS)[number]);
    for (const list of [page.figures, page.notDetermined]) {
      const order = list.map((x) => idx(x.group));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

/* ------------------------------------------------ 3. not determined, never zero */

test.describe('8.6 one-pager — the "Not determined" column', () => {
  test('a project with nothing readable has no zero anywhere, only reasons', () => {
    const page = steeringOnePager({
      projectId: 'p-2',
      project: { name: 'Nothing analysed yet', legacyCode: 'REPORT z.\n' },
      history: null,
      open: null,
      findings: null,
      decision: null,
      decisionUnreadable: 'The decision of this project could not be derived (404).',
    });
    const keys = page.notDetermined.map((g) => g.key);
    for (const k of ['clean-core-score', 'it-findings', 'it-chain-complete', 'it-level', 'decision-bindings', 'cost']) {
      expect(keys, `${k} is not under "Not determined"`).toContain(k);
    }
    for (const g of page.notDetermined) expect(g.reason.trim(), `${g.key} has no reason`).not.toBe('');
    expect(page.figures.find((f) => f.key.startsWith('it-')), 'an IT figure without findings').toBeUndefined();
    expect(page.figures.find((f) => f.key.startsWith('decision-')), 'a decision figure without a decision').toBeUndefined();
    expect(page.notDetermined.find((g) => g.key === 'decision-bindings')?.reason).toContain('404');
  });

  test('the summary counts both columns', () => {
    const page = steeringOnePager(full());
    expect(page.summary).toBe(`${page.figures.length} figures · ${page.notDetermined.length} not determined`);
  });
});

/* -------------------------------------------------------------- 4. costs */

test.describe('8.6 one-pager — costs', () => {
  test('while the decision binds no cost revision, costs are not determined with the decision’s reason', () => {
    const decision = decisionFixture();
    const cost = decision.bindings.find((b) => b.key === 'cost');
    expect(cost?.revision, 'the fixture now binds a cost revision — the premise moved').toBeNull();
    const page = steeringOnePager(full({ decision }));
    const gap = page.notDetermined.find((g) => g.key === 'cost');
    expect(gap?.reason).toBe(cost?.notDeterminedReason);
    expect(gap?.evidence?.href).toBe('/project/p-1/tco');
    expect(page.figures.find((f) => f.group === 'costs')).toBeUndefined();
  });

  test('a bound cost revision is a binding, never an amount', () => {
    const decision = decisionFixture();
    const withCost: ProjectDecision = {
      ...decision,
      bindings: decision.bindings.map((b) =>
        b.key === 'cost'
          ? { ...b, revision: 'CS-2', notDeterminedReason: null, note: null, provenance: 'confirmed' }
          : b,
      ),
    };
    const page = steeringOnePager(full({ decision: withCost }));
    const cost = page.figures.find((f) => f.key === 'cost');
    expect(cost?.value).toBe('1 of 1');
    expect(page.notDetermined.find((g) => g.key === 'cost')).toBeUndefined();
  });

  test('no line of the page carries an amount of money', () => {
    for (const page of [steeringOnePager(full()), steeringOnePager(full({ decision: null }))]) {
      const text = [
        page.title,
        page.scope,
        page.summary,
        ...page.figures.flatMap((f) => [f.label, f.value, f.coverage, f.evidence.place]),
        ...page.notDetermined.flatMap((g) => [g.label, g.reason]),
      ];
      for (const line of text) expect(containsAmount(line), line).toBe(false);
    }
  });
});

/* ------------------------------------------------------ 5. shape of the thing */

test.describe('8.6 one-pager — a view, not a record', () => {
  test('the module is pure and the component adds no number of its own', () => {
    const lib = read('lib/steering-one-pager.ts');
    expect(lib).not.toMatch(/from ['"]react['"]|firebase|fetch\(/);
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toContain('steeringOnePager(');
    // No write: the one-pager is never stored.
    expect(component).not.toMatch(/setDoc|updateDoc|addDoc|runProjectCommand|method:\s*['"]POST/);
  });

  test('every opening reads anew: an earlier read is dropped before the page or Print can show it', () => {
    // QA review of 4b4586aff273: reopening kept the previous read, so the
    // page (and Print) showed stale figures while the new reads were pending.
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toMatch(
      /const openFresh = \(\) => \{\s*setHistory\(undefined\);\s*setFindings\(undefined\);\s*setDecision\(undefined\);\s*setOpen\(true\);/,
    );
    expect(component).toContain('onClick={openFresh}');
    expect(component).not.toContain('onClick={() => setOpen(true)}');
  });

  test('it is not part of the signed audit pack', () => {
    for (const rel of ['lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts']) {
      expect(read(rel), `${rel} reaches the one-pager`).not.toContain('steering');
    }
  });

  test('it prints through the browser: a print rule keeps only the one-pager, and no PDF package was added', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/body:has\(\[data-steering-print\]\)/);
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(name, 'a PDF package crept in for 8.6').not.toMatch(/pdf/i);
    }
  });
});

/* -------------------------------------------------------- 6. on the screen */
/* Needs the emulators and a dev server (`npx playwright test` as in CI). */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'SteeringPage123!';
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

test.describe('8.6 rendered — the one-pager in the Management view', () => {
  const OWNER = `${unique('steering-owner')}@cleancore-test.io`;
  const PROJECT_ID = unique('steering');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Steering', lastName: 'Owner', email: OWNER,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Nothing analysed yet', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_bare.\nWRITE 1.\n',
    });
  });

  test('opens with figures and reasons, links into the project, and prints alone', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, OWNER);
    await page.goto(`/project/${PROJECT_ID}?view=management`, { waitUntil: 'domcontentloaded' });

    const button = page.locator('[data-steering-one-pager="closed"] button');
    await expect(button).toBeVisible({ timeout: 60000 });
    await button.click();

    const pager = page.locator('[data-steering-one-pager="open"]');
    await expect(pager.locator('[data-steering-summary]')).toBeVisible({ timeout: 60000 });

    // No signed run: the score is under "Not determined", with a reason, not a zero.
    const score = pager.locator('[data-steering-not-determined="clean-core-score"]');
    await expect(score.locator('[data-figure-absent-reason]')).toHaveText('no signed run');

    // Every figure has coverage and a link into this project.
    const figures = pager.locator('[data-steering-figure]');
    const n = await figures.count();
    expect(n).toBeGreaterThan(0);
    expect(await pager.locator('[data-steering-figure] [data-figure-coverage]').count()).toBe(n);
    for (const href of await pager.locator('[data-steering-figure] [data-steering-evidence]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') ?? ''),
    )) {
      expect(href.startsWith(`/project/${PROJECT_ID}`)).toBe(true);
    }

    // On paper, nothing but the one-pager, and no buttons.
    await page.emulateMedia({ media: 'print' });
    await expect(pager).toBeVisible();
    await expect(page.locator('[data-management-view=""]')).toBeHidden();
    for (const b of await pager.locator('button').all()) await expect(b).toBeHidden();
  });
});
