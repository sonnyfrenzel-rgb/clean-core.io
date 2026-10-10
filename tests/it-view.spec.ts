import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { itFindingsView, type ItFindingRow, type ItFindingsSource } from '../lib/it-findings';
import { findingsOf } from '../lib/it-findings-build';
// Registers the Private Edition snapshots, as the findings route's import does.
import '../lib/abap/catalog-snapshots';
import {
  NO_FILTERS,
  catalogProfile,
  catalogSnapshotWords,
  filterRows,
  isItRight,
  itAnswerHead,
  kindBreakdown,
  objectsOf,
  routesNamed,
  whereTo,
} from '../lib/it-view';
import type { PublicCloudFitAssignment } from '../lib/abap/public-cloud-fit';
import { itObjects } from '../lib/it-objects';
import { IT_ANCHORS, IT_LAYER_ELSEWHERE, IT_SECTION_IDS, runTrust } from '../lib/it-sections';
import { LAYERS } from '../lib/workspace-model';
import type { ItUseRow } from '../lib/it-findings';
import type { Project } from '../lib/types';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The 3.0 IT view (mockup v2.8 `s4`, gap audit row 6): the answer first, facet
 * tiles, a live filter bar, the clean core level per SAP object and a side
 * column with the target profile, the route and the imports.
 *
 * The pure half drives `lib/it-view.ts` from fixtures; the source half holds
 * the order of the shell and the honesty of the catalog note; the rendered half
 * opens a real project in IT.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const row = (over: Partial<ItFindingRow> = {}): ItFindingRow => ({
  id: 'CC-001',
  kind: 'standard-table-read',
  kindLabel: 'reads of SAP standard tables',
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
  rulesCoveringLine: [],
  rulesInRoutine: [],
  ...over,
});

const ROWS: ItFindingRow[] = [
  row(),
  row({ id: 'CC-002', kind: 'standard-table-write', kindLabel: 'direct writes to SAP standard tables', level: 'D', lineStart: 300 }),
  row({ id: 'CC-003', kind: 'authority-check', kindLabel: 'authority checks', objectName: null, objectType: null, level: null, releaseView: null, classificationView: null, successor: null, targetOptions: [], lineStart: 12 }),
  row({ id: 'CC-004', objectName: 'EKKO', level: 'B', lineStart: 40, targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'] }),
];

const assignment = (objectName: string, bucket: PublicCloudFitAssignment['bucket']): PublicCloudFitAssignment =>
  ({ objectName, bucket, rule: null, evidence: bucket ? 'because' : null, reason: bucket ? null : { code: 'level-unknown', detail: 'why' }, openCheck: false, reviewTask: null, catalogListed: true }) as unknown as PublicCloudFitAssignment;

const FIT = {
  target: 'private' as const,
  private: { assignments: [assignment('VBAK', 'rebuild'), assignment('EKKO', 'keep')] },
  public: { assignments: [assignment('VBAK', 'rebuild'), assignment('EKKO', 'rebuild')] },
};

test.describe('the IT answer, derived', () => {
  test('the answer leads with the count and the worst level, and names what was read', () => {
    const src: ItFindingsSource = {
      rows: ROWS, sourceSha256: 'a'.repeat(64), rulesDerived: 0,
      coverage: { lines: 669, gaps: [{ label: 'Local function-module call', count: 6, firstLine: 121 }] },
    };
    const head = itAnswerHead(src);
    // Findings as Analyze counts them; the rows, and the level count, are places in the code.
    expect(head.title).toBe('4 findings at 4 places in the code · 1 place at level D');
    // A second place of the same pattern and object is one finding at two places.
    const twice = itAnswerHead({ ...src, rows: [...ROWS, row({ id: 'CC-005', lineStart: 400 })] });
    expect(twice.title).toBe('4 findings at 5 places in the code · 1 place at level D');
    expect(head.coverage).toContain('669 lines');
    expect(head.coverage).toContain('6 constructs it saw but does not assess');
    // Not recorded is said, never a zero.
    expect(itAnswerHead({ ...src, coverage: undefined }).coverage).toContain('not recorded');
    expect(itAnswerHead(null).title).toContain('could not be read');
  });

  test('is it right: the chain coverage with where it stops', () => {
    const view = itFindingsView({ rows: ROWS, sourceSha256: 'a', rulesDerived: 0 });
    expect(isItRight(view)).toBe('The chain from requirement to target is complete for 0 of 4 places in the code — 4 stop at Requirement.');
  });

  test('kinds are counted in the router’s words, largest first', () => {
    const kinds = kindBreakdown(ROWS);
    expect(kinds[0]).toEqual({ kind: 'standard-table-read', label: 'reads of SAP standard tables', count: 2 });
    expect(kinds.reduce((s, k) => s + k.count, 0)).toBe(ROWS.length);
  });

  test('where to: the declared platform, and the default said as one', () => {
    const w = whereTo(FIT);
    expect(w.platformLabel).toBe('Private Edition');
    expect(w.sentence).toContain('the project\'s target');
    expect(w.counts.find((c) => c.bucket === 'keep')?.count).toBe(1);
    const undeclared = whereTo({ ...FIT, target: null });
    expect(undeclared.platformLabel).toBe('Public Edition');
    expect(undeclared.sentence).toContain('no target is declared');
  });

  test('the filter bar: kind, level, not determined, bucket and search by line', () => {
    const w = whereTo(FIT);
    expect(filterRows(ROWS, { ...NO_FILTERS, level: 'none' }, w).map((r) => r.id)).toEqual(['CC-003']);
    expect(filterRows(ROWS, { ...NO_FILTERS, level: 'D' }, w).map((r) => r.id)).toEqual(['CC-002']);
    expect(filterRows(ROWS, { ...NO_FILTERS, kind: 'authority-check' }, w)).toHaveLength(1);
    expect(filterRows(ROWS, { ...NO_FILTERS, bucket: 'keep' }, w).map((r) => r.id)).toEqual(['CC-004']);
    expect(filterRows(ROWS, { ...NO_FILTERS, search: 'L300' }, w).map((r) => r.id)).toEqual(['CC-002']);
    expect(filterRows(ROWS, { ...NO_FILTERS, search: 'ekko' }, w).map((r) => r.id)).toEqual(['CC-004']);
    // A bucket filter before the lookup answered filters nothing rather than everything.
    expect(filterRows(ROWS, { ...NO_FILTERS, bucket: 'keep' }, null)).toHaveLength(ROWS.length);
  });

  test('the level per SAP object keeps a read and a write apart, and statements apart from Unknown', () => {
    const { objects, withoutObject } = objectsOf(ROWS);
    expect(withoutObject).toBe(1);
    const vbak = objects.find((o) => o.name === 'VBAK')!;
    expect(vbak.levels).toEqual(['D', 'C']);
    expect(vbak.findings.map((f) => f.line)).toEqual([228, 300]);
    expect(objects[0].name).toBe('VBAK'); // worst level first
  });

  test('the routes the router named are counted per finding', () => {
    expect(routesNamed(ROWS)).toEqual([
      { route: 'Developer Extensibility / RAP', count: 3 },
      { route: 'Key User Extensibility', count: 1 },
    ]);
  });
});

test.describe('the target profile names the snapshot that answered', () => {
  test('snapshot words for the keys the sync writes', () => {
    expect(catalogSnapshotWords('latest')).toContain('Public Edition');
    expect(catalogSnapshotWords('pce-latest')).toContain('Private Edition');
    expect(catalogSnapshotWords('pce-2023-3')).toContain('2023 FPS03');
    expect(catalogSnapshotWords('something-else')).toBeNull();
  });

  test('the note names the snapshot the route read — not the stale "Public only" sentence', () => {
    const p = catalogProfile({ edition: 'private', release: '' }, true, { registryKey: 'pce-latest', sourceSha256: 'abcdef0123' });
    expect(p.edition).toBe('S/4HANA Cloud Private Edition');
    expect(p.release).toBeNull();
    expect(p.catalogKey).toBe('pce-latest · abcdef01');
    expect(p.note).toContain('abap-atc-cr-cv-s4hc');
    expect(p.note).toContain('Private Edition');
    expect(p.note).not.toContain('There is no second snapshot');
    expect(catalogProfile({ edition: 'public', release: '' }, false, null).note).toContain('not recorded');
  });

  test('the findings route answers with the snapshot, the kind words and what was read', () => {
    const src = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
    const built = findingsOf(src, 'Z_MM_PO_APPROVAL.abap', 'private', 'pce-latest');
    expect(built.catalog?.registryKey).toBe('pce-latest');
    // As an editor counts them: the final newline adds no line (UX-182).
    expect(built.coverage?.lines).toBe(src.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length);
    expect(built.coverage?.lines).toBe(668);
    expect(built.rows.every((r) => typeof r.kindLabel === 'string' && r.kindLabel.length > 0)).toBe(true);
    expect(findingsOf(src, 'Z_MM_PO_APPROVAL.abap').catalog?.registryKey).toBe('latest');
  });
});

test.describe('Objects & dependencies, Run & trust, the IT sections (ADR-086)', () => {
  const use = (over: Partial<ItUseRow>): ItUseRow => ({
    object: 'BAPI_PO_CREATE1', kind: 'bapi', use: 'call', lines: [230], remote: false, custom: false,
    level: 'B', levelBasis: 'catalog', releaseView: null, classificationView: null, findingIds: [], ...over,
  });
  const inventory = [
    { objectName: 'Z_MM_PO_APPROVAL', type: 'Report' as const, criticality: 'Low' as const, lineStart: 1, lineEnd: 640 },
    { objectName: 'CHECK_VENDOR', type: 'Form Routine' as const, criticality: 'Medium' as const, lineStart: 225, lineEnd: 234 },
  ];

  test('one table: what the code uses first, then the own objects; "used by" is the innermost object holding the line', () => {
    const out = itObjects({
      inventory,
      coupling: [
        { tableName: 'EKKO', accessType: 'Read', isCustom: false, isStandard: true, riskLevel: 'Low', recommendation: '', lineNumbers: [228] },
        // Already a use of the route: not listed twice.
        { tableName: 'EBAN', accessType: 'Read', isCustom: false, isStandard: true, riskLevel: 'Low', recommendation: '', lineNumbers: [700] },
        { tableName: '/ACME/T_ORDER', accessType: 'Write', isCustom: false, isStandard: false, riskLevel: 'Low', recommendation: '', lineNumbers: [10] },
        // A reference is not a use.
        { tableName: 'KNA1', accessType: 'Reference', isCustom: false, isStandard: true, riskLevel: 'Low', recommendation: '' },
      ],
      uses: [use({}), use({ object: 'EBAN', kind: 'table', use: 'read', lines: [700] }), use({ object: 'Z_OWN_FM', kind: 'function-module', custom: true, lines: [5], level: 'A', levelBasis: 'own-object' })],
      findings: [row({ objectName: 'EKKO', successor: 'API_PURCHASEORDER_PROCESS_SRV' })],
    });
    expect(out.rows.map((r) => `${r.side}:${r.object}@${r.use}`)).toEqual([
      'dependency:BAPI_PO_CREATE1@call',
      'dependency:EBAN@read',
      'dependency:Z_OWN_FM@call',
      'dependency:EKKO@read',
      'dependency:/ACME/T_ORDER@write',
      'own-object:Z_MM_PO_APPROVAL@defined',
      'own-object:CHECK_VENDOR@defined',
    ]);
    const by = Object.fromEntries(out.rows.map((r) => [`${r.object}@${r.use}`, r]));
    // Line 230 is in CHECK_VENDOR (225–234) and in the report (1–640): the innermost wins.
    expect(by['BAPI_PO_CREATE1@call'].usedBy).toEqual(['CHECK_VENDOR']);
    expect(by['BAPI_PO_CREATE1@call'].owner).toBe('sap');
    // Line 700 stands outside every listed object, and says so.
    expect(by['EBAN@read'].usedBy).toEqual([]);
    expect(by['EBAN@read'].usedOutside).toBe(true);
    expect(by['Z_OWN_FM@call'].owner).toBe('own');
    // A reserved namespace is neither yours nor SAP's by its name.
    expect(by['/ACME/T_ORDER@write'].owner).toBe('undetermined');
    // The successor is the one a finding on that object names — none is invented.
    expect(by['EKKO@read'].successor).toBe('API_PURCHASEORDER_PROCESS_SRV');
    expect(by['BAPI_PO_CREATE1@call'].successor).toBeNull();
    expect(by['CHECK_VENDOR@defined'].range).toEqual({ start: 225, end: 234 });
    // The count line counts what it says: own objects, distinct tables, distinct calls.
    expect(out.own).toBe(2);
    expect(out.tables).toBe(3);
    expect(out.calls).toBe(2);
    expect(out.recorded).toBe(true);
  });

  test('a table changed through batch input is a write, graded as one, and said so (3.0.7)', () => {
    const src = read('public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const built = findingsOf(src, 'ZLEGACY_ORDER_FULFILLMENT_AUDIT.abap');
    const change = built.rows.find((r) => r.kind === 'batch-input' && r.objectName === 'VBAK');
    expect(change, 'the batch input to VA02 names no table it changes').toBeTruthy();
    // The kind reads as what the finding says; the session keeps its own words.
    expect(change!.kindLabel).toBe('changes through batch input');
    expect(built.rows.find((r) => r.kind === 'bdc')!.kindLabel).not.toBe('changes through batch input');
    // Graded as a write: D for VBAK, where a read is C.
    expect(change!.level).toBe('D');
    const write = (built.uses ?? []).find((u) => u.object === 'VBAK' && u.use === 'write');
    expect(write?.kind).toBe('table');
    expect(write?.findingIds).toContain(change!.id);
    const objects = itObjects({ inventory: [], coupling: [], uses: built.uses, findings: built.rows });
    expect(objects.rows.find((r) => r.object === 'VBAK' && r.use === 'write')?.batchInput).toBe('all');
    expect(objects.rows.find((r) => r.object === 'VBAK' && r.use === 'read')?.batchInput).toBeNull();
  });

  test('nothing recorded is said, never a table of nothing', () => {
    const none = itObjects({ inventory: undefined, coupling: undefined, uses: undefined, findings: undefined });
    expect(none.recorded).toBe(false);
    expect(none.rows).toEqual([]);
  });

  test('Run & trust reads the run, the fingerprint and the pack of this run — nothing for an unreadable run', () => {
    const signed = runTrust({
      name: 'x', activeRunId: 'run-4b8c1f2e9a77',
      auditMetadata: {
        inputFingerprint: { sha256: 'abcdef0123456789', fileName: 'Z.abap', lineCount: 1, byteSize: 1, uploadedAt: '2026-10-01T00:00:00Z', objectType: 'Report' },
        modelCard: { provider: null, model: null, engineVersion: 'e', byokUsed: false, analysisTimestamp: '2026-10-09T10:00:00Z' },
        auditPackExportedAt: '2026-10-09T12:00:00Z', auditPackExportedRunId: 'run-4b8c1f2e9a77',
      },
    } as Project);
    expect(signed).toEqual({
      signed: true, unreadable: false, runId: 'run-4b8c', runDay: '2026-10-09',
      fingerprint: { sha: 'abcdef01', fileName: 'Z.abap' }, packDay: '2026-10-09',
    });
    // A pack exported for an earlier run is not this run's pack.
    expect(runTrust({ name: 'x', activeRunId: 'run-new-000000', auditMetadata: { auditPackExportedAt: '2026-10-09', auditPackExportedRunId: 'run-old' } } as Project).packDay).toBeNull();
    const unreadable = runTrust({ name: 'x', activeRunId: 'run-1234567890', _runLoadFailed: true } as Project);
    expect(unreadable.signed).toBe(false);
    expect(unreadable.unreadable).toBe(true);
    expect(unreadable.runId).toBeNull();
    expect(runTrust(null).signed).toBe(false);
  });

  test('every layer address has a home in IT, and IT\'s anchors follow the page', () => {
    expect(Object.keys(IT_LAYER_ELSEWHERE).sort()).toEqual([...LAYERS].sort());
    expect(IT_LAYER_ELSEWHERE.need).toEqual({ kind: 'view', view: 'business', hash: 'process-map' });
    expect(IT_LAYER_ELSEWHERE.standard).toEqual({ kind: 'view', view: 'business', hash: 'standard' });
    expect(IT_LAYER_ELSEWHERE.costs).toEqual({ kind: 'economics' });
    expect(IT_LAYER_ELSEWHERE.architecture).toEqual({ kind: 'view', view: 'it', hash: 'it-objects' });
    expect(IT_LAYER_ELSEWHERE.evidence).toEqual({ kind: 'view', view: 'it', hash: 'it-trust' });
    expect(IT_LAYER_ELSEWHERE.changes).toEqual({ kind: 'view', view: 'management', hash: 'decision-card' });
    // Main column, then the side column — the order Sonny confirmed.
    expect([...IT_ANCHORS]).toEqual(['findings', 'objects', 'questions', 'route', 'trust']);
    const answers = read('components/workspace/ItAnswers.tsx');
    const at = (needle: string) => answers.indexOf(needle);
    expect(at('id={IT_SECTION_IDS.findings}')).toBeGreaterThan(0);
    expect(at('<ObjectsCard')).toBeGreaterThan(at('id={IT_SECTION_IDS.findings}'));
    expect(at('id={IT_SECTION_IDS.questions}')).toBeGreaterThan(at('<ObjectsCard'));
    expect(at('<ItRail')).toBeGreaterThan(at('id={IT_SECTION_IDS.questions}'));
    const rail = read('components/workspace/ItRail.tsx');
    expect(rail.indexOf('id={IT_TARGET_PROFILE_ID}')).toBeLessThan(rail.indexOf('id={IT_SECTION_IDS.route}'));
    expect(rail.indexOf('id={IT_SECTION_IDS.route}')).toBeLessThan(rail.indexOf('id={IT_SECTION_IDS.trust}'));
    expect(IT_SECTION_IDS.questions).toBe('not-determined');
    // No anchor is ever an "empty" chip: the bar has no word for it.
    expect(answers).not.toMatch(/layerBar\.empty|itv\.anchorEmpty/);
  });
});

test.describe('the IT order in the shell, as the source writes it (the page is measured below)', () => {
  test('IT shows only its own answer: no layers, no first look, no "Ask this case" (ADR-086)', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell).toMatch(/const IT_HEAD: readonly ContentBlock\[\] = \[\];/);
    expect(shell).not.toContain('IT_TAIL');
    expect(shell.indexOf('<ItAnswers')).toBeGreaterThan(0);
    // The reading the search, the print sheet and the counts use is still
    // computed in IT, without rendering the first look there.
    expect(shell).toMatch(/useSourceReading\([\s\S]*?view === 'it' && firstLookReading === null/);
    // The demo twin follows: no layer bar and no map in its IT view.
    const demo = read('components/demo/DemoWorkspaceShell.tsx');
    const itBlock = demo.slice(demo.indexOf("{view === 'it' ? ("), demo.indexOf("{view === 'management' ? ("));
    expect(itBlock).toContain('<ItAnswers');
    expect(itBlock).not.toContain('layerBar');
    expect(itBlock).not.toContain('mapCard');
    // No catalog in the browser: the panel and its side column fetch, never import the engine.
    for (const file of ['components/workspace/ItAnswers.tsx', 'components/workspace/ItRail.tsx', 'lib/it-view.ts']) {
      // A type-only import is erased at build and reaches nothing.
      const imports = read(file)
        .split(/\r?\n/)
        .filter((l) => /^import\b/.test(l.trim()) && !/^import type\b/.test(l.trim()))
        .join('\n');
      for (const forbidden of ['catalog-service', 'evidence-model', 'it-findings-build', 'catalog-snapshots']) {
        expect(imports, `${file} imports ${forbidden}`).not.toContain(forbidden);
      }
    }
    // Read-only: nothing on the IT view writes.
    for (const file of ['components/workspace/ItRail.tsx', 'lib/it-view.ts']) {
      for (const forbidden of ['setDoc', 'updateDoc', 'addDoc', '/api/gemini', "method: 'POST'"]) {
        expect(read(file), `${file} reaches ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

/* ------------------------------------------------------- the rendered view */

const clientApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ItViewRebuild123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await signInViaLanding(page, email, PASSWORD);
}

test.describe('the IT view on a real project', () => {
  const ADMIN = `${unique('itv-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('it-view');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'IT', lastName: 'View', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'created', s4Deployment: 'private',
      legacyCode: read('public/starter-examples/Z_MM_PO_APPROVAL.abap'),
    });
  });

  test('answer first, facets, filter bar, objects and the side column', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });
    const view = page.locator('[data-it-view=""]');
    await expect(view, 'the IT answers never arrived').toBeVisible({ timeout: 90000 });

    // The answer stands above the Business blocks that used to push it 2,700 px down.
    const answerTop = await page.locator('[data-it-headline]').boundingBox();
    const notDetermined = await page.locator('#not-determined').boundingBox();
    expect(answerTop && notDetermined && answerTop.y < notDetermined.y).toBe(true);
    // IT shows only its own content (ADR-086): no layer bar, no first look, no
    // "Ask this case" — its own anchor bar under the answer, in the page's order.
    await expect(page.locator('[data-workspace-layers]')).toHaveCount(0);
    await expect(page.locator('[data-first-look]')).toHaveCount(0);
    await expect(page.locator('[data-ask-this-case]')).toHaveCount(0);
    const anchors = page.locator('[data-it-anchor]');
    await expect(anchors.first()).toBeVisible({ timeout: 30000 });
    const order = await anchors.evaluateAll((els) => els.map((e) => e.getAttribute('data-it-anchor')));
    const expected = ['findings', 'objects', 'questions', 'route', 'trust'].filter((k) => order.includes(k));
    expect(order).toEqual(expected);
    await expect(page.locator('[data-it-anchors]')).not.toContainText(/\bempty\b/);
    const bar = await page.locator('[data-it-anchors]').boundingBox();
    expect(answerTop && bar && answerTop.y < bar.y, 'the IT answer does not stand above its anchor bar').toBe(true);
    // Findings → Objects & dependencies → Open questions, top to bottom.
    const findingsBox = await page.locator('#it-findings').boundingBox();
    const objectsBox = await page.locator('#it-objects').boundingBox();
    expect(findingsBox && objectsBox && notDetermined && findingsBox.y < objectsBox.y && objectsBox.y < notDetermined.y).toBe(true);
    // One quiet row of links out.
    await expect(page.locator('[data-it-elsewhere-link]')).toHaveCount(4);
    await expect(page.locator('[data-it-headline]')).toContainText(/\d+ findings at \d+ places in the code · /);

    // Four figures under the answer, each with its coverage (v3.0.1: what the
    // code uses took the target tile's place; the buckets stand with the findings).
    for (const id of ['uses', 'findings', 'level', 'not-determined']) {
      await expect(page.locator(`[data-it-figure="${id}"] [data-figure-coverage]`)).toHaveCount(1);
    }
    // Where to resolves under the Private Edition.
    await expect(page.locator('[data-it-where-to]')).toContainText('Private Edition', { timeout: 60000 });

    // The side column: target profile with the PCE snapshot, the route, the imports.
    await expect(page.locator('[data-it-profile-catalog]')).toContainText('Private Edition');
    await expect(page.locator('[data-it-catalog-note]')).toContainText('abap-atc-cr-cv-s4hc');
    await expect(page.locator('[data-it-routes] li').first()).toBeVisible();
    await expect(page.locator('[data-it-import="usage-none"]')).toContainText('never “unused”');

    // The filter bar: "no level" leaves only findings that name no object. (The
    // Not determined figure counts the engine's open points since v3.0.1, the
    // same number as the list — `tests/it-view-uses.spec.ts`.)
    await page.locator('[data-it-show-no-level]').click();
    await expect(page.locator('[data-cc-filter-bar="active"]')).toBeVisible();
    const absent = page.locator('[data-it-level-absent]');
    const graded = page.locator('[data-it-level]');
    await expect(graded).toHaveCount(0);
    expect(await absent.count()).toBeGreaterThan(0);
    await page.locator('[data-cc-clear-filters]').first().click();
    await expect(graded.first()).toBeVisible();

    // The level per SAP object the code uses.
    await expect(page.locator('[data-it-use-level]').first()).toBeVisible();
  });

  test('on a phone the page does not scroll sideways', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-it-view=""]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-it-where-to]')).toContainText('Private Edition', { timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The filter bar folds behind one button on a phone.
    await expect(page.locator('[data-it-filter-bar]')).toBeHidden();
    await page.locator('[data-it-filter-toggle] button, button[data-it-filter-toggle]').first().click();
    await expect(page.locator('[data-it-filter-bar]')).toBeVisible();
  });
});
