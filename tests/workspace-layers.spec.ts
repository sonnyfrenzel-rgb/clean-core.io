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
import { LAYERS, layerFromHash, workspaceLayers } from '../lib/workspace-model';
import type { Project } from '../lib/types';
import type { UsageRecord, UsageReport } from '../lib/abap/usage-model';

/**
 * Roadmap 6.2 — the six layers, and the one rule that outranks the rest of the
 * step: *„Eine Ebene ohne Inhalt sagt das, statt etwas zu erfinden" (W22-A03)*.
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
  test('the six are the six of DESIGN.md §2.3 item 4, in its order', () => {
    expect(LAYERS).toEqual(['need', 'standard', 'costs', 'architecture', 'evidence', 'changes']);
    expect(workspaceLayers(populated).map((l) => l.label)).toEqual([
      'Need & process',
      'Standard fit',
      'Costs & assumptions',
      'Architecture & dependencies',
      'Evidence & controls',
      'Changes & commitments',
    ]);
  });

  test('an empty project has six empty layers, each saying what is missing — and inventing no row', () => {
    for (const layer of workspaceLayers(empty)) {
      expect(layer.rows, `${layer.key} invented a row on an empty project`).toEqual([]);
      expect(layer.total, `${layer.key} claims a total it cannot show`).toBe(0);
      expect(layer.count, `${layer.key} claims content on an empty project`).toBeNull();
      expect(layer.missing.trim().length, `${layer.key} is empty and does not say why`).toBeGreaterThan(10);
      // Absence has a vocabulary and it is `lib/provenance.ts`'s, not this
      // module's: "not determined — konnte nicht bestimmt werden, mit Grund".
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

    // Costs is a model estimate and says so in the vocabulary, not in prose:
    // there is no observed cost anywhere in this product.
    expect(by.costs.count).toBe('model estimate');
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
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
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
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
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
    await page.goto(`/project/${BARE_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    // Nothing has been analysed, so every layer is empty — and the first of
    // them stands open rather than the bar marking nothing.
    const section = page.locator('[data-workspace-layer-section]');
    await expect(section, 'the anchor bar still leads nowhere').toBeVisible({ timeout: 30000 });
    await expect(section).toHaveAttribute('data-workspace-layer-section', 'need');
    await expect(section).toHaveAttribute('data-layer-empty', 'yes');
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Need & process');
    await expect(page.locator('[data-workspace-layer-absent-reason]')).toHaveText(
      'The process reconstructed from the code, and the rules hidden in it, are not here yet.',
    );
    // An empty layer is empty in the vocabulary, not in prose (§4).
    await expect(section.locator('[data-provenance]')).toHaveAttribute('data-provenance', 'not-determined');
    // And it does not pretend to hold rows.
    await expect(page.locator('[data-workspace-layer-rows]')).toHaveCount(0);

    // The other five are reachable through "More", which is where §2.11 puts
    // them, and opening one is a real move: the section changes, and so does
    // the address.
    await page.locator('[data-workspace-layer-more]').click();
    const standard = page.locator('[data-workspace-layer-more-panel] [data-workspace-layer="standard"]');
    await expect(standard).toBeVisible({ timeout: 15000 });
    await standard.click();

    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Standard fit', { timeout: 15000 });
    await expect(page.locator('[data-workspace-layer-absent-reason]')).toHaveText(
      'No standard candidate carries an evidence level yet.',
    );
    expect(new URL(page.url()).hash, 'the layer is not held in the address').toBe('#standard');

    // Held in the URL **and** the browser (roadmap 6.1/6.2, ADR-018): a reload
    // arrives back in the same layer, and Back returns to the one before it.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Standard fit', { timeout: 60000 });

    await page.goBack();
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Need & process', { timeout: 30000 });
  });

  test('a layer with content shows it, with the line each row sits on', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${RUN_ID}#evidence`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const section = page.locator('[data-workspace-layer-section]');
    await expect(section).toHaveAttribute('data-workspace-layer-section', 'evidence', { timeout: 30000 });
    await expect(section).toHaveAttribute('data-layer-empty', 'no');
    await expect(section.locator('[data-provenance]')).toHaveAttribute('data-provenance', 'proven');
    await expect(section.locator('[data-workspace-layer-row="run"]')).toContainText('run-4b8c');

    // Architecture, from the bar this time, carries the anchor of the routine.
    await page.locator('nav[data-workspace-layers] [data-workspace-layer="architecture"]').click();
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Architecture & dependencies', {
      timeout: 15000,
    });
    await expect(page.locator('[data-workspace-layer-row="object-0"]')).toContainText('CHECK_VENDOR');
    await expect(page.locator('[data-workspace-layer-row="object-0"] [data-cc-anchor]')).toHaveText('L225–L234');
    expect(new URL(page.url()).hash).toBe('#architecture');
  });

  test('a view switch keeps the layer, and a layer switch keeps the view (ADR-018, CR-14)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${RUN_ID}?view=business#costs`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Costs & assumptions', {
      timeout: 30000,
    });

    // Each of the three navigations has one job: the view does not move the
    // layer, and the layer does not move the view.
    await page
      .locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: 'IT' })
      .click();
    await expect(page).toHaveURL(/[?&]view=it\b/, { timeout: 30000 });
    await expect(page.locator('[data-workspace-layer-title]'), 'the view switch moved the reader to another layer').toHaveText(
      'Costs & assumptions',
    );
    expect(new URL(page.url()).hash).toBe('#costs');

    await page.locator('nav[data-workspace-layers] [data-workspace-layer="evidence"]').click();
    await expect(page.locator('[data-workspace-layer-title]')).toHaveText('Evidence & controls', {
      timeout: 15000,
    });
    expect(
      new URL(page.url()).searchParams.get('view'),
      'choosing a layer threw the reader back into another view',
    ).toBe('it');
  });
});
