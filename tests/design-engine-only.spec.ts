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
import { generationPrerequisites } from '../lib/workflow-steps';
import { engineDesignContext } from '../lib/design-engine-context';
import { buildRequirementSet } from '../lib/functional-requirements';

/**
 * v3.0.1 (coordinator decision 03.10.2026) — an engine-only signed run has no
 * model narrative, and the design used to be written from the narrative alone,
 * so the chain stopped at Design. The design is now written from the signed
 * engine evidence; a narrative is further context where there is one. No model
 * is called here: `/api/gemini` is answered with a recorded fixture.
 */

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_SALES_ORDER_CREATOR.txt'), 'utf8').replace(/\r\n/g, '\n');
const PASSWORD = 'EngineOnly123!';

/** A recorded design answer of the shape the stage asks for. */
const DESIGN_FIXTURE = JSON.stringify({
  projectName: 'Sales order creation',
  architectureOverview: {
    approachDescription: 'Create sales orders through the released sales order API instead of the BAPI call at line 71.',
    nodeFramework: 'SAP RAP (RESTful Application Programming)',
    runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'zr_sales_order_req.bdef', purpose: 'Behavior definition' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Transactional DB Access', description: 'One LUW; commit only without errors (line 86).' },
  securityHardening: [],
  roadmap: [{ phase: 'Phase 0', title: 'Setup', deliverables: ['Package'] }],
});
const NFR_FIXTURE = JSON.stringify({ dataMigration: 'None: the program creates documents and keeps no data of its own.' });

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

async function seedEngineOnly(prefix: string, extraUser: Record<string, unknown> = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${prefix}-${tag}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
  const uid = (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Engine', lastName: 'Only', email, tier: 'pilot', status: 'approved',
    termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(), ...extraUser,
  });
  const projectId = `${prefix}-${tag}`;
  const runId = `${projectId}-run`;
  const fingerprint = { sha256: sha256Hex(SOURCE), fileName: 'Z_SALES_ORDER_CREATOR.txt', lineCount: SOURCE.split('\n').length, byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
  await adminSetDoc('projects', projectId, {
    name: 'Z_SALES_ORDER_CREATOR', userId: uid, createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
    legacyCode: SOURCE, analysis: '', activeRunId: runId, inputFingerprint: fingerprint,
  });
  const unsigned = { runId, projectId, userId: uid, createdAt: new Date().toISOString(), status: 'completed', analysis: '', modelParticipation: 'none', inputFingerprint: fingerprint };
  const runHash = recomputeStoredRunHash(unsigned);
  await adminSetDoc(`projects/${projectId}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
  return { email, projectId };
}

test.describe('the rules', () => {
  test('Design needs a source and a signed run — never a narrative; a missing design always leads to Design', () => {
    const base = { legacyCode: 'REPORT z.' } as Record<string, unknown>;
    expect(generationPrerequisites({ ...base, activeRunId: 'r', analysis: '' } as never, 'design')).toEqual([]);
    expect(generationPrerequisites({ ...base } as never, 'design').map((p) => [p.id, p.action.stage])).toEqual([['run', 'analyze']]);
    expect(generationPrerequisites({} as never, 'design').map((p) => p.id)).toEqual(['source']);
    expect(generationPrerequisites({ ...base, activeRunId: 'r', analysis: '' } as never, 'transformation').map((p) => p.action.stage)).toEqual(['design']);
  });

  test('the engine context carries the process, the rules with their lines and what is not determined', () => {
    const text = engineDesignContext({ requirements: buildRequirementSet({ source: SOURCE }), contract: null, findings: [] });
    expect(text).toContain('BAPI_SALESORDER_CREATEFROMDAT2');
    expect(text).toContain('Roll back changes');
    expect(text).toMatch(/L86/);
    expect(text).toContain('notDetermined');
  });
});

test.describe('on screen', () => {
  async function answerModel(page: Page, prompts: string[]) {
    await page.route('**/api/model-stages', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stages: {}, keyAvailable: true, keySource: 'community' }) }),
    );
    await page.route('**/api/gemini', async (route: Route) => {
      const body = JSON.parse(route.request().postData() || '{}') as { prompt?: string };
      prompts.push(body.prompt ?? '');
      const text = prompts.length === 1 ? DESIGN_FIXTURE : NFR_FIXTURE;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text, receipt: null }) });
    });
  }

  test('an engine-only project offers "Generate the design", and the prompt carries the engine evidence', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedEngineOnly('design-engine-only');
    const prompts: string[] = [];
    await answerModel(page, prompts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    const generate = page.locator('[data-design-generate]');
    await expect(generate).toBeVisible({ timeout: 120_000 });
    // Nothing was asked of the model on opening.
    expect(prompts).toEqual([]);
    await expect(page.getByText('The run has no model narrative, and the design does not need one')).toBeVisible();
    // The contract has been read, so the route goes into the prompt as well.
    await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
    await generate.click();
    await expect(page.locator('[data-design-section="overview"]')).toBeVisible({ timeout: 120_000 });

    const prompt = prompts[0];
    expect(prompt).toContain('Engine Evidence');
    expect(prompt).toContain('Analysis Context: none');
    expect(prompt).toContain('BAPI_SALESORDER_CREATEFROMDAT2');
    expect(prompt).toMatch(/FR-\d{3} \[must\]/);
    expect(prompt).toContain('"route"');
    // The schema is restated after the evidence, where the model reads last: a
    // live answer in CI of b879ad8b came back without its nodeAppBlueprint.
    expect(prompt.lastIndexOf('nodeAppBlueprint'), 'the blueprint is named after the evidence').toBeGreaterThan(prompt.indexOf('Engine Evidence'));
    const stored = await adminGetDoc('projects', seeded.projectId);
    expect(String(stored?.solutionDesign)).toContain('Sales order creation');
  });

  test('with the Design stage switched off, the reason is on screen instead of a button', async ({ page }) => {
    test.setTimeout(240_000);
    const seeded = await seedEngineOnly('design-engine-off');
    await page.route('**/api/model-stages', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stages: { design: false }, keyAvailable: true, keySource: 'community' }) }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Turn the design stage back on in Settings to generate it.')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-design-generate]')).toHaveCount(0);
  });
});
