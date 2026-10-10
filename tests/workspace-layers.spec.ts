import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { isProvenanceValue } from '../lib/provenance';
import fs from 'node:fs';
import path from 'node:path';
import { LAYERS, RETIRED_LAYERS, layerFromHash, usageRecordRows, workspaceLayers } from '../lib/workspace-model';
import { MANAGEMENT_LAYER_ELSEWHERE } from '../lib/management-sections';
import type { Project } from '../lib/types';
import type { UsageRecord, UsageReport } from '../lib/abap/usage-model';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 6.2 — the layers (five since ADR-087), and the one rule that outranks the rest of the
 * step: *"A layer without content says so, instead of inventing something" (W22-A03)*.
 *
 * Until this step the Anchor Bar was a navigation to nothing. It named six
 * layers, marked one of them, and the page underneath it did not change — and
 * the four that are empty on every project this release can produce sat in a
 * menu that could not be opened at all. Both halves are failures of the same
 * kind: a screen that offers a place and does not have one.
 *
 * Three things are checked and they are not interchangeable:
 *
 *   - **the derivation, pure.** Which layer has content, what that content is,
 *     and what an empty one says — `lib/workspace-model.ts` is the only place
 *     that decides, so it is read directly with fixtures the components could
 *     never produce (a usage export with no call column, seven objects against
 *     a five-row cap).
 *   - **the invariant, pure.** The bar's count and the section's rows are two
 *     renderings of one fact, and a project on which they disagree is the bug
 *     this step is most likely to grow later.
 *   - **the place, rendered.** That an empty layer can actually be opened, says
 *     which layer it is and why it is empty, and that the choice survives a
 *     reload and the Back button — the "URL und Browser" half — are claims
 *     about the shipped page and are made against it.
 */

/* ------------------------------------------------------------- fixtures */

const empty: Project = { name: 'Nothing here yet' };

/** A usage export, with the fields the parser always writes beside the records. */
const usageOf = (records: UsageRecord[]): UsageReport => ({
  records,
  source: 'scmon',
  importedAt: '2026-09-22T09:00:00.000Z',
  warnings: [],
});

const populated: Project = {
  name: 'Emergency purchase approval',
  legacyCode: 'REPORT z_mm_po_approval.\n',
  activeRunId: 'run-4b8c1f2e9a77',
  cleanCoreScore: 62,
  codeInventory: [
    { objectName: 'Z_MM_PO_APPROVAL', type: 'Report', criticality: 'High', lineStart: 1, lineEnd: 640 },
    { objectName: 'CHECK_VENDOR', type: 'Form Routine', criticality: 'Medium', lineStart: 225, lineEnd: 234 },
  ],
  dataCoupling: [
    {
      tableName: 'ZMM_VEND_BLOCK',
      accessType: 'Read',
      isCustom: true,
      riskLevel: 'Low',
      recommendation: 'Keep',
      lineNumbers: [228],
    },
  ],
  auditMetadata: {
    inputFingerprint: {
      sha256: 'f'.repeat(64),
      fileName: 'Z_MM_PO_APPROVAL.abap',
      lineCount: 640,
      byteSize: 21_400,
      uploadedAt: '2026-09-22T09:00:00.000Z',
      objectType: 'Report',
    },
  },
};

/* ------------------------------------------------- the derivation, pure */

test.describe('what a layer holds (roadmap 6.2)', () => {
  test('the five are the five of DESIGN.md §2.3 item 4, in its order — Changes & commitments is no layer (ADR-087)', () => {
    expect(LAYERS).toEqual(['need', 'standard', 'costs', 'architecture', 'evidence']);
    expect(workspaceLayers(populated).map((l) => l.label)).toEqual([
      'Need & process',
      'Standard fit',
      'Costs & assumptions',
      'Architecture & dependencies',
      'Evidence & controls',
    ]);
    // It held a hard-coded "empty" beside a decision with a timeline. Its
    // address still arrives from old links and is read, so it can be sent to
    // the decision instead of nowhere.
    expect(RETIRED_LAYERS).toEqual(['changes']);
    expect(layerFromHash('#changes')).toBe('changes');
    expect(workspaceLayers(populated).some((l) => (l.key as string) === 'changes')).toBe(false);
  });

  test('Management has no layers: every old layer address has a home that is not an empty place (ADR-087)', () => {
    expect(MANAGEMENT_LAYER_ELSEWHERE).toEqual({
      need: { kind: 'view', view: 'business', hash: 'process-map' },
      standard: { kind: 'view', view: 'business', hash: 'standard' },
      costs: { kind: 'view', view: 'management', hash: 'decision-rests-on-cost' },
      architecture: { kind: 'view', view: 'it', hash: 'it-objects' },
      evidence: { kind: 'view', view: 'it', hash: 'it-trust' },
      changes: { kind: 'view', view: 'management', hash: 'decision-card' },
    });
    // The ids it names are rendered: the cost row and the decision card in
    // Management, the objects and Run & trust in IT.
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    expect(read('components/workspace/DecisionCard.tsx')).toContain('MANAGEMENT_IDS.costs');
    expect(read('components/workspace/WorkspaceShell.tsx')).toContain('<div id="decision-card">');
    // No layer bar and no layer section are rendered for Management.
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell).not.toMatch(/data-management-fold|ManagementFold id="(?:process|costs)"/);
    // Read from the address as it is, not the layer state (QA 6ec03d013196).
    expect(shell).toContain('MANAGEMENT_LAYER_ELSEWHERE[layer]');
  });

  test('an empty project has five empty layers, each saying what is missing — and inventing no row', () => {
    for (const layer of workspaceLayers(empty)) {
      expect(layer.rows, `${layer.key} invented a row on an empty project`).toEqual([]);
      expect(layer.total, `${layer.key} claims a total it cannot show`).toBe(0);
      expect(layer.count, `${layer.key} claims content on an empty project`).toBeNull();
      expect(layer.missing.trim().length, `${layer.key} is empty and does not say why`).toBeGreaterThan(10);
      // Absence has a vocabulary and it is `lib/provenance.ts`'s, not this
      // module's: "not determined — could not be determined, with a reason".
      expect(layer.provenance, `${layer.key} dressed its emptiness up as something else`).toBe(
        'not-determined',
      );
    }
  });

  test('the count and the rows are one fact, on every project shape — the bar cannot promise what the section lacks', () => {
    const shapes: Array<[string, Project]> = [
      ['empty', empty],
      ['populated', populated],
      ['a run and nothing else', { name: 'x', activeRunId: 'run-1' }],
      ['usage only', {
        name: 'x',
        usageReport: usageOf([{ objectName: 'Z_A', callCount: 3, source: 'scmon' }]),
      }],
      ['dependencies but no objects', {
        name: 'x',
        dataCoupling: [{ tableName: 'ZT', accessType: 'Read', isCustom: true, riskLevel: 'Low', recommendation: 'Keep' }],
      }],
    ];
    for (const [label, project] of shapes) {
      for (const layer of workspaceLayers(project)) {
        expect(
          layer.rows.length > 0,
          `${label}: the ${layer.key} layer's count (${JSON.stringify(layer.count)}) and its ${layer.rows.length} rows disagree`,
        ).toBe(layer.count !== null);
        expect(
          isProvenanceValue(layer.provenance),
          `${label}: ${layer.key} carries "${layer.provenance}", which is not one of the nine values of lib/provenance.ts`,
        ).toBe(true);
      }
    }
  });

  test('a signed run fills evidence and costs, and says where each figure comes from', () => {
    const by = Object.fromEntries(workspaceLayers(populated).map((l) => [l.key, l]));

    expect(by.evidence.count).toBe('1 signed run');
    expect(by.evidence.provenance).toBe('proven');
    // The run is quoted at the length a person can compare by eye, never in full.
    expect(by.evidence.rows.find((r) => r.key === 'run')!.value).toBe('run-4b8c');
    expect(by.evidence.rows.find((r) => r.key === 'fingerprint')!.value).toContain('Z_MM_PO_APPROVAL.abap');

    // A signed run gives the cost model its basis, not a price: nothing is
    // estimated until the reader enters their own figures, and the label says so.
    // There is no observed cost anywhere in this product.
    expect(by.costs.count).toBe('not priced yet');
    expect(by.costs.provenance).toBe('simulation');
    expect(by.costs.rows.find((r) => r.key === 'basis')!.value).toMatch(/not observed costs/);
  });

  test('architecture carries the objects and the dependencies, each with the line it sits on', () => {
    const architecture = workspaceLayers(populated).find((l) => l.key === 'architecture')!;
    expect(architecture.count).toBe('2 objects · 1 dependency');
    expect(architecture.provenance).toBe('reconstructed');
    expect(architecture.rows.map((r) => r.anchor)).toEqual(['L1–L640', 'L225–L234', 'L228']);
    expect(architecture.rows.find((r) => r.label === 'ZMM_VEND_BLOCK')!.value).toBe('Read · custom table');
  });

  test('a usage export with no call column says that, and never "0 calls"', () => {
    const noColumn = workspaceLayers({
      name: 'x',
      usageReport: usageOf([
        { objectName: 'Z_NEVER', callCount: 0, source: 'scmon' },
        { objectName: 'Z_UNKNOWN', callCount: null, source: 'scmon' },
      ]),
    }).find((l) => l.key === 'need')!;

    // Zero is a measurement — the object was never called — and the absence of
    // the column is not that measurement. `lib/workspace-rows.ts` learned this
    // the expensive way: coercing one into the other turned "we have no usage
    // data" into "delete this code" for every object in the export.
    expect(noColumn.rows[0].value).toMatch(/^0 calls/);
    expect(noColumn.rows[1].value).toBe('no call count in the export');
    expect(noColumn.provenance).toBe('imported');
  });

  test('a long layer shows the first five and says how many there are (§2.11)', () => {
    const many = workspaceLayers({
      name: 'x',
      codeInventory: Array.from({ length: 7 }, (_, i) => ({
        objectName: `Z_OBJ_${i}`,
        type: 'Report' as const,
        criticality: 'Low' as const,
      })),
    }).find((l) => l.key === 'architecture')!;

    expect(many.rows).toHaveLength(5);
    expect(many.total).toBe(7);
    expect(many.count).toBe('7 objects');
  });

  test('the five-row cut no longer hides the usage records behind the rules (ADR-080)', () => {
    const rules = Array.from({ length: 6 }, (_, i) => ({
      id: `BR-00${i + 1}`,
      label: `Rule ${i + 1}`,
      sentences: [{ anchors: [{ lineStart: 10 + i, lineEnd: 10 + i }] }],
      parameters: [],
      sources: [],
    }));
    const project: Project = {
      name: 'x',
      usageReport: usageOf([
        { objectName: 'Z_A', callCount: 12, source: 'scmon' },
        { objectName: 'Z_B', callCount: 0, source: 'scmon' },
        { objectName: 'Z_C', callCount: null, source: 'scmon' },
      ]),
    };
    const need = workspaceLayers(project, { ruleSet: { rules } } as unknown as Parameters<typeof workspaceLayers>[1]).find(
      (l) => l.key === 'need',
    )!;
    // The layer's own rows are still the first five — all rules here …
    expect(need.rows.every((r) => r.key.startsWith('rule-'))).toBe(true);
    expect(need.count).toContain('3 objects with usage');
    // … and the usage records are read in full, for the card beside the map
    // in Business.
    const usage = usageRecordRows(project);
    expect(usage.map((r) => r.label)).toEqual(['Z_A', 'Z_B', 'Z_C']);
    expect(usage[0].value).toBe('12 calls in the measured window');
    expect(usage[2].value).toBe('no call count in the export');
    expect(usageRecordRows({ name: 'none' })).toEqual([]);
  });

  test('the usage records stand beside the map in Business and in the section elsewhere (ADR-080)', () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    const shell = read('components/workspace/WorkspaceShell.tsx');
    const block = shell.slice(shell.indexOf('    process:'), shell.indexOf('    layerSection: null'));
    expect(block).toContain('<UsageRecords project={project}');
    const section = read('components/workspace/LayerSection.tsx');
    expect(section).toContain('<UsageRecords project={project}');
    // The section never prints the usage rows of the cut list itself.
    expect(section).toContain("!row.key.startsWith('usage-')");
    expect(section).not.toContain('aboveInView');
  });
});

test.describe('the layer in the URL fragment (ADR-018)', () => {
  test('reads a layer, and reads a line anchor as what it is — not as a layer', () => {
    expect(layerFromHash('#evidence')).toBe('evidence');
    expect(layerFromHash('evidence')).toBe('evidence');
    expect(layerFromHash('#need')).toBe('need');

    // `#L231` is the CR-14 deep link a shared address carries. It names a line,
    // not a layer, and turning it into "the first layer" would make a choice
    // the reader never made.
    expect(layerFromHash('#L231')).toBeNull();
    expect(layerFromHash('#')).toBeNull();
    expect(layerFromHash('')).toBeNull();
    expect(layerFromHash(null)).toBeNull();
    expect(layerFromHash(undefined)).toBeNull();
    // The keys are the fragment, exactly: `#Evidence` is a different address,
    // and guessing at it would make `#EVIDENCE` and `#evidence` the same place.
    expect(layerFromHash('#Evidence')).toBeNull();
  });

  test('every layer names the fragment it is held in', () => {
    for (const layer of workspaceLayers(null)) {
      expect(layer.hash).toBe(`#${layer.key}`);
      expect(layerFromHash(layer.hash)).toBe(layer.key);
    }
  });
});

/* ----------------------------------------------------- the place, rendered */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
try {
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceLayers123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await signInViaLanding(page, email, PASSWORD);
}

test.describe('the layers on the screen', () => {
  const ADMIN = `${unique('layers-admin')}@cleancore-test.io`;
  const BARE_ID = unique('layers-bare');
  const RUN_ID = unique('layers-run');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Layers', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', BARE_ID, {
      name: 'Nothing analysed yet', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_bare.\nWRITE 1.\n',
    });
    await adminSetDoc('projects', RUN_ID, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'analyzed',
      legacyCode: 'REPORT z_mm_po_approval.\nWRITE 1.\n',
      activeRunId: 'run-4b8c1f2e9a77',
      cleanCoreScore: 62,
      codeInventory: [
        { objectName: 'CHECK_VENDOR', type: 'Form Routine', criticality: 'Medium', lineStart: 225, lineEnd: 234 },
      ],
    });
    // The run the project names has to exist. Until roadmap 3.0.2 the workspace
    // showed a run as proven from the id on the project alone, and this fixture
    // never created one; since then an id without a readable run is "could not
    // be read", which is the honest answer — so the fixture gives it a run.
    // `userId` on the run itself: the rule for runs reads it there, not on the project.
    await adminSetDoc(`projects/${RUN_ID}/runs`, 'run-4b8c1f2e9a77', {
      userId: cred.user.uid,
      status: 'completed', createdAt: new Date(), cleanCoreScore: 62,
      codeInventory: [
        { objectName: 'CHECK_VENDOR', type: 'Form Routine', criticality: 'Medium', lineStart: 225, lineEnd: 234 },
      ],
    });
  });

  test('an empty layer is a place: it names itself and says why it is empty', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // Business: the one view with layers — Standard fit and Evidence &
    // controls (ADR-080). IT has its own sections (ADR-086), Management none
    // (ADR-087).
    await page.goto(`/project/${BARE_ID}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    // Nothing has been analysed, so every layer is empty — and the first of
    // them stands open rather than the bar marking nothing.
    const section = page.locator('[data-workspace-layer-section]');
    await expect(section, 'the anchor bar still leads nowhere').toBeVisible({ timeout: 30000 });
    await expect(section).toHaveAttribute('data-workspace-layer-section', 'standard');
    await expect(section).toHaveAttribute('data-layer-empty', 'yes');
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Standard fit');
    await expect(page.locator('[data-workspace-layer-absent-reason]')).toHaveText(
      'No standard candidate carries an evidence level yet.',
    );
    // An empty layer is empty in the vocabulary, not in prose (§4).
    await expect(section.locator('[data-provenance]')).toHaveAttribute('data-provenance', 'not-determined');
    // And it does not pretend to hold rows.
    await expect(page.locator('[data-workspace-layer-rows]')).toHaveCount(0);

    // The other is a tab of the same bar since 03.10.2026 — the empty ones
    // muted and marked "empty", no "More" (owner: "no recognisable menu") —
    // and opening it is a real move: the section changes, and so does the
    // address.
    const evidence = page.locator('nav[data-workspace-layers] [data-workspace-layer="evidence"]');
    await expect(evidence).toHaveAttribute('data-layer-empty', 'yes', { timeout: 15000 });
    await evidence.click();

    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Evidence & controls', { timeout: 15000 });
    await expect(page.locator('[data-workspace-layer-absent-reason]')).toHaveText(
      'No signed run — every figure in this product derives from one.',
    );
    expect(new URL(page.url()).hash, 'the layer is not held in the address').toBe('#evidence');

    // Held in the URL **and** the browser (roadmap 6.1/6.2, ADR-018): a reload
    // arrives back in the same layer, and Back returns to the one before it.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Evidence & controls', { timeout: 60000 });

    await page.goBack();
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Standard fit', { timeout: 30000 });
  });

  test('a layer with content shows it, with the line each row sits on', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // Business: Evidence & controls, from the address. (IT has its own
    // sections since ADR-086 — the next test.)
    await page.goto(`/project/${RUN_ID}?view=business#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const section = page.locator('[data-workspace-layer-section]');
    await expect(section).toHaveAttribute('data-workspace-layer-section', 'evidence', { timeout: 30000 });
    await expect(section).toHaveAttribute('data-layer-empty', 'no');
    await expect(section.locator('[data-provenance]')).toHaveAttribute('data-provenance', 'proven');
    await expect(section.locator('[data-workspace-layer-row="run"]')).toContainText('run-4b8c');
  });

  test('Management has no layers: an old layer address lands where the content lives now (ADR-087)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // Changes → the decision card with its timeline, in Management itself.
    await page.goto(`/project/${RUN_ID}?view=management#changes`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=management#decision-card$/, { timeout: 90000 });
    await expect(page.locator('#decision-card')).toBeVisible({ timeout: 90000 });
    // No layer bar, no layer section, no "Process" or "Costs" fold.
    await expect(page.locator('[data-workspace-layers]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-layer-section]')).toHaveCount(0);
    await expect(page.locator('[data-management-fold="process"], [data-management-fold="costs"]')).toHaveCount(0);

    // Architecture → IT's Objects & dependencies, the routine with its line range.
    await page.goto(`/project/${RUN_ID}?view=management#architecture`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=it#it-objects$/, { timeout: 90000 });
    const routine = page.locator('#it-objects [data-it-object="CHECK_VENDOR"]');
    await expect(routine).toBeVisible({ timeout: 90000 });
    // `has` is matched inside the row, so it names the cell alone: with the
    // section's id in front (`#it-objects …`) it matched no row at all, since
    // that id stands above the row, not in it (CI 38051799180).
    await expect(
      page.locator('#it-objects tr', { has: page.locator('[data-it-object="CHECK_VENDOR"]') }).locator('[data-cc-anchor]'),
    ).toHaveText('L225–L234');

    // Evidence → IT's Run & trust; Need → the Business map.
    await page.goto(`/project/${RUN_ID}?view=management#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=it#it-trust$/, { timeout: 90000 });
    await page.goto(`/project/${RUN_ID}?view=management#need`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=business#process-map$/, { timeout: 90000 });
  });

  test('IT has its own sections: an old layer address lands where the content lives now (ADR-086)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // Evidence → IT's Run & trust card, with the signed run.
    await page.goto(`/project/${RUN_ID}?view=it#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-it-view=""]')).toBeVisible({ timeout: 90000 });
    await expect(page).toHaveURL(/\?view=it#it-trust$/, { timeout: 30000 });
    await expect(page.locator('#it-trust [data-it-trust="signed"]')).toBeVisible();
    await expect(page.locator('[data-it-trust-run]')).toContainText('run-4b8c');
    // No layer bar and no layer section in IT — and no "empty" anchor.
    await expect(page.locator('[data-workspace-layers]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-layer-section]')).toHaveCount(0);
    await expect(page.locator('[data-it-anchors]')).not.toContainText(/\bempty\b/);

    // Architecture → Objects & dependencies, the routine with its line range.
    await page.goto(`/project/${RUN_ID}?view=it#architecture`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=it#it-objects$/, { timeout: 90000 });
    const routine = page.locator('#it-objects [data-it-object="CHECK_VENDOR"]');
    await expect(routine).toBeVisible({ timeout: 90000 });
    // `has` is matched inside the row, so it names the cell alone: with the
    // section's id in front (`#it-objects …`) it matched no row at all, since
    // that id stands above the row, not in it (CI 38051799180).
    await expect(
      page.locator('#it-objects tr', { has: page.locator('[data-it-object="CHECK_VENDOR"]') }).locator('[data-cc-anchor]'),
    ).toHaveText('L225–L234');
    await expect(page.locator('[data-it-objects-count]')).toContainText('1 own object');

    // Changes → Management's decision; costs → the Economics tool.
    await page.goto(`/project/${RUN_ID}?view=it#changes`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\?view=management#decision-card$/, { timeout: 90000 });
    await page.goto(`/project/${RUN_ID}?view=it#costs`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/tco\?view=it/, { timeout: 90000 });
  });

  test('a view switch starts the new view at its top, and a layer switch keeps the view (ADR-018; owner 10.10.2026)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // Evidence & controls: a section both views show (Business keeps three, owner 03.10.2026).
    await page.goto(`/project/${RUN_ID}?view=business#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Evidence & controls', {
      timeout: 30000,
    });

    // The layer does not move the view: Business keeps its two layers
    // (ADR-080); IT has its own sections (ADR-086), Management none (ADR-087).
    await page.locator('nav[data-workspace-layers] [data-workspace-layer="standard"]').click();
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Standard fit', {
      timeout: 15000,
    });
    expect(
      new URL(page.url()).searchParams.get('view'),
      'choosing a layer threw the reader back into another view',
    ).toBe('business');

    // A plain view switch starts the new view at its top and carries no
    // fragment (owner 10.10.2026, replacing CR-14): the old view's place
    // bounced the reader back (Business, #architecture, back to IT).
    await page.evaluate(() => window.scrollTo(0, 600));
    await page
      .locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'Management' })
      .click();
    await expect(page).toHaveURL(/[?&]view=management$/, { timeout: 30000 });
    expect(new URL(page.url()).hash).toBe('');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // Into IT from a layer: IT opens at its top, not at Run & trust.
    await page.goto(`/project/${RUN_ID}?view=business#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Evidence & controls', { timeout: 60000 });
    await page
      .locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'IT' })
      .click();
    await expect(page).toHaveURL(/[?&]view=it$/, { timeout: 30000 });
    // An old layer address linked into IT still goes where it lives now.
    await page.goto(`/project/${RUN_ID}?view=it#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/[?&]view=it#it-trust$/, { timeout: 30000 });
  });
  test('the view switch moves the focus with the selection on the arrow keys (QA review of a88149856dcc)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${RUN_ID}?view=business#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    const radio = (name: string) =>
      page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: name });
    await radio('Business').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/[?&]view=it\b/, { timeout: 30000 });
    await expect(radio('IT')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radio('Business')).toBeFocused();
  });
});
