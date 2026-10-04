import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { TERMS_VERSION } from '../lib/constants';

/**
 * The design document as a reader finds their way around it (owner,
 * 03.10.2026: "more visual and appealing, so I can find my way around"). The
 * stored design is the same; what changed is how it is shown: an overview
 * with the route, a small diagram and the headline facts, then four groups by
 * question, the SAP API mapping as a table with clean core levels, and a phone
 * width without a sideways scroll. No model is called here: the design is on
 * record.
 *
 * With `DESIGN_SHOTS_DIR` set, the 1440 and 390 pictures are written there.
 */

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
const PASSWORD = 'DesignLayout123!';
const SHOTS = process.env.DESIGN_SHOTS_DIR || '';

/** A side-by-side design of the size the owner's screenshot showed: 7 files, 5 endpoints, 4 mappings, 5 services, 4 phases. */
const DESIGN = JSON.stringify({
  projectName: 'Purchase requisition approval',
  architectureOverview: {
    approachDescription:
      'Move the approval logic for purchase requisitions into a CAP service on SAP BTP that reads requisitions and vendors through released APIs, raises approval events through SAP Event Mesh instead of the workflow call, and keeps its own approval log in PostgreSQL, so the core keeps only standard objects and the direct updates of EBAN disappear.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model) — the side-by-side extension model for SAP BTP',
    runtimePlatform: 'SAP BTP, part of the SAP Business AI Platform',
  },
  nodeAppBlueprint: {
    projectStructure: [
      { path: 'db/schema.cds', purpose: 'Approval log and budget entities' },
      { path: 'srv/approval-service.cds', purpose: 'Service definition' },
      { path: 'srv/approval-service.ts', purpose: 'Approval handlers' },
      { path: 'srv/external/API_PURCHASEREQ_PROCESS_SRV.cds', purpose: 'Imported released API' },
      { path: 'package.json', purpose: 'Dependencies' },
      { path: 'mta.yaml', purpose: 'Deployment descriptor' },
      { path: 'xs-security.json', purpose: 'Roles and scopes' },
    ],
    apiEndpoints: [
      { path: '/approval/Requisitions', method: 'GET', description: 'Requisitions waiting for approval' },
      { path: '/approval/approve', method: 'POST', description: 'Approve a requisition item' },
      { path: '/approval/reject', method: 'POST', description: 'Reject a requisition item' },
      { path: '/approval/Budget', method: 'GET', description: 'Remaining budget per cost center' },
      { path: '/approval/ApprovalLog', method: 'GET', description: 'Who approved what, and when' },
    ],
  },
  cloudServices: [
    { serviceName: 'SAP Authorization and Trust Management service', purpose: 'Authenticates approvers and carries the approver role.', npmPackages: ['@sap/xssec'] },
    { serviceName: 'SAP Destination service', purpose: 'Holds the connection to the S/4HANA system.', npmPackages: ['@sap-cloud-sdk/connectivity'] },
    { serviceName: 'SAP Event Mesh', purpose: 'Publishes approval and rejection events.', npmPackages: ['@sap/xb-msg-amqp-v100'] },
    { serviceName: 'PostgreSQL on SAP BTP', purpose: 'Stores the approval log and the budget snapshot.', npmPackages: ['@cap-js/postgres'] },
    { serviceName: 'SAP Document Management service', purpose: 'Keeps the uploaded quotation files.', npmPackages: ['@sap/cds'] },
  ],
  dataSync: {
    patternName: 'Released API calls with events back',
    description: 'The service reads and changes requisitions only through the released purchase requisition API; the core publishes the change event, and the service updates its log from it.',
  },
  sapStandardApiMapping: [
    { legacyTableOrFunction: 'EBAN', sapStandardApiName: 'API_PURCHASEREQ_PROCESS_SRV', apiHubUrl: 'https://api.sap.com/api/API_PURCHASEREQ_PROCESS_SRV/overview', apiId: 'SAP_COM_0102', description: 'Reads and changes requisition items instead of SELECT and UPDATE on EBAN.' },
    { legacyTableOrFunction: 'LFA1', sapStandardApiName: 'API_BUSINESS_PARTNER', apiHubUrl: 'https://api.sap.com/api/API_BUSINESS_PARTNER/overview', apiId: 'SAP_COM_0008', description: 'Vendor master through the business partner.' },
    { legacyTableOrFunction: 'EKKO', sapStandardApiName: 'API_PURCHASEORDER_PROCESS_SRV', apiHubUrl: 'https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV/overview', apiId: 'SAP_COM_0053', description: 'Purchase orders instead of reading EKKO.' },
    { legacyTableOrFunction: 'BAPI_PO_CREATE1', sapStandardApiName: 'API_PURCHASEORDER_PROCESS_SRV', apiHubUrl: 'https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV/overview', apiId: 'SAP_COM_0053', description: 'Creates the order through the released API.' },
  ],
  securityHardening: [
    { category: 'Authentication', requirement: 'Validate the JWT of every call', packageOrConfig: '@sap/xssec' },
    { category: 'Authorization', requirement: 'Approver role per release group', packageOrConfig: 'xs-security.json' },
    { category: 'Coding', requirement: 'No dependency with a known high vulnerability', packageOrConfig: 'npm audit --audit-level=high' },
    { category: 'Audit', requirement: 'Log every approval with user and time', packageOrConfig: 'ApprovalLog entity' },
  ],
  roadmap: [
    { phase: 'Phase 0', title: 'Foundation', deliverables: ['Subaccount and spaces', 'Destination to S/4HANA'] },
    { phase: 'Phase 1', title: 'Service', deliverables: ['CDS model', 'Approval handlers'] },
    { phase: 'Phase 2', title: 'Events', deliverables: ['Event Mesh queue', 'Log update'] },
    { phase: 'Phase 3', title: 'Hardening', deliverables: ['Roles', 'Load test'] },
  ],
});

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

async function seedDesigned(prefix: string) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${prefix}-${tag}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
  const uid = (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Design', lastName: 'Layout', email, tier: 'pilot', status: 'approved',
    termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
  });
  const projectId = `${prefix}-${tag}`;
  const runId = `${projectId}-run`;
  const fingerprint = { sha256: sha256Hex(SOURCE), fileName: 'Z_MM_PO_APPROVAL.abap', lineCount: SOURCE.split('\n').length, byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
  await adminSetDoc('projects', projectId, {
    name: 'Z_MM_PO_APPROVAL', userId: uid, createdAt: new Date(), status: 'designed', s4Deployment: 'private',
    legacyCode: SOURCE, analysis: '', solutionDesign: DESIGN, activeRunId: runId, inputFingerprint: fingerprint,
  });
  const unsigned = { runId, projectId, userId: uid, createdAt: new Date().toISOString(), status: 'completed', analysis: '', modelParticipation: 'none', inputFingerprint: fingerprint };
  const runHash = recomputeStoredRunHash(unsigned);
  await adminSetDoc(`projects/${projectId}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
  return { email, projectId };
}

async function openDesign(page: Page, width: number, height: number) {
  const seeded = await seedDesigned('design-layout');
  const calls: string[] = [];
  await page.route('**/api/gemini', async (route: Route) => {
    calls.push(route.request().url());
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no model in this spec' }) });
  });
  await page.setViewportSize({ width, height });
  await signInViaLanding(page, seeded.email, PASSWORD);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-stage-output="solutionDesign"]')).toBeVisible({ timeout: 120_000 });
  // The canvas has read its contract and findings, so the levels are in.
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
  return { calls, ...seeded };
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  // The card layout before 03.10.2026 opened a section from its card.
  const card = page.locator('button[data-design-section="cloud"]');
  if (await card.count()) await card.click();
  await page.locator('[data-design-drawer]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `${name}-viewport.png`) });
  await page.screenshot({ path: path.join(SHOTS, `${name}-full.png`), fullPage: true });
}

test.describe('the design document', () => {
  test('screenshots at 1440 and 390', async ({ page }) => {
    test.skip(!SHOTS, 'only with DESIGN_SHOTS_DIR');
    test.setTimeout(300_000);
    await openDesign(page, 1440, 900);
    await shot(page, 'design-1440');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await shot(page, 'design-390');
  });

  test('the overview names the route, draws the target and states the headline facts', async ({ page }) => {
    test.setTimeout(300_000);
    const { calls } = await openDesign(page, 1440, 900);
    const overview = page.locator('[data-design-overview]');
    await expect(overview).toBeVisible();
    await expect(overview.locator('[data-design-route]')).toContainText('Side-by-side');
    await expect(overview.locator('[data-design-route]')).toContainText('CAP');
    // The full sentence, not a clamp of it.
    await expect(overview.locator('[data-design-approach]')).toContainText('the direct updates of EBAN disappear.');
    const diagram = overview.locator('[data-design-diagram]');
    await expect(diagram).toBeVisible();
    for (const node of ['core', 'connect', 'app', 'data']) {
      await expect(diagram.locator(`[data-design-diagram-node="${node}"]`)).toBeVisible();
    }
    await expect(diagram.locator('[data-design-diagram-node="connect"]')).toContainText('SAP Destination service');
    await expect(diagram.locator('[data-design-diagram-node="connect"]')).toContainText('SAP Event Mesh');
    await expect(diagram.locator('[data-design-diagram-node="data"]')).toContainText('PostgreSQL on SAP BTP');
    await expect(diagram.locator('[data-design-diagram-node="app"]')).toContainText('5 endpoints');
    await expect(overview.locator('[data-design-fact="services"]')).toContainText('5 services');
    await expect(overview.locator('[data-design-fact="endpoints"]')).toContainText('5 endpoints');
    await expect(overview.locator('[data-design-fact="mappings"]')).toContainText('4 SAP API mappings');
    await expect(overview.locator('[data-design-fact="files"]')).toContainText('7 files');
    // One "Model proposal" per section, not one per card.
    expect(await overview.locator('[data-provenance="proposed"]').count()).toBe(1);
    expect(calls).toEqual([]);
  });

  test('four groups by question; the first is open, another opens from the section nav', async ({ page }) => {
    test.setTimeout(300_000);
    await openDesign(page, 1440, 900);
    const groups = page.locator('[data-design-group]');
    await expect(groups).toHaveCount(4);
    expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-design-group')))).toEqual(['build', 'connect', 'secure', 'when']);
    await expect(page.locator('[data-design-group="build"]')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('[data-design-group="build"]')).toContainText('Target Project Blueprint');
    await expect(page.locator('[data-design-group="when"]')).toHaveAttribute('data-open', 'false');
    await page.locator('[data-design-group-nav] a[href="#design-group-when"]').click();
    await expect(page.locator('[data-design-group="when"]')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('[data-design-roadmap-phase]')).toHaveCount(4);
    // The services are a compact list; "Details" opens the side panel.
    const services = page.locator('[data-design-service]');
    await expect(services).toHaveCount(5);
    await services.first().getByRole('button', { name: /Details/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    // The non-functional requirements are linked, not repeated.
    await page.locator('[data-design-group-toggle="secure"]').click();
    await expect(page.locator('[data-design-group="secure"] a[href="#requirements"]')).toBeVisible();
  });

  test('the SAP API mapping is a table, each legacy object with its clean core level', async ({ page }) => {
    test.setTimeout(300_000);
    await openDesign(page, 1440, 900);
    await page.locator('[data-design-group-toggle="connect"]').click();
    const table = page.locator('[data-design-group="connect"] table');
    await expect(table).toBeVisible();
    const rows = table.locator('tr[data-cc-table-row]');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('EBAN');
    await expect(rows.first()).toContainText('API_PURCHASEREQ_PROCESS_SRV');
    // Every row carries a level chip: the engine's level of the object, or "not determined".
    for (const row of await rows.all()) await expect(row.locator('[data-design-mapping-level]')).toHaveCount(1);
    // EBAN is read and updated by the code: the engine grades it, so its row carries a letter.
    await expect(rows.first().locator('[data-design-mapping-level]')).toHaveAttribute('data-level', /^[A-D]$/);
  });

  test('a phone stacks it all without a sideways scroll', async ({ page }) => {
    test.setTimeout(300_000);
    await openDesign(page, 390, 844);
    await expect(page.locator('[data-design-overview]')).toBeVisible();
    for (const key of ['build', 'connect', 'secure', 'when']) {
      const toggle = page.locator(`[data-design-group-toggle="${key}"]`);
      if ((await page.locator(`[data-design-group="${key}"]`).getAttribute('data-open')) !== 'true') await toggle.click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, key).toBeLessThanOrEqual(0);
    }
    const box = await page.locator('[data-design-overview]').boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  });
});
