import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { DOC_STAGE_ORDER } from '../lib/documentation-progress';
import { businessLayerFor, engineDocumentationOf, fixtureSource, FIXTURE_FILE } from './helpers/business-layer-fixture';

/**
 * Roadmap 3.0.13 — the Documentation tool says what it is doing and how long
 * it takes, and finishes on large programs (owner, dev acceptance 14.10.2026).
 * On the page, signed in, with a model answer that is a stub and takes its time
 * — never a real call:
 *
 *   - from the first moment the card is there and something in it runs; the
 *     stages become active in their order, the model stage says what it
 *     expects before it is done, and its elapsed time moves while it waits;
 *     the card ends "written", and the call names its answer shape;
 *   - a stopped call ends the card with its reason and *Try again*, and the
 *     retry writes it;
 *   - a program too large for one answer is written in parts — one call per
 *     part, each asking for its own elements — and the joined layer is stored
 *     with every step.
 */

const SOURCE = fixtureSource();
const LAYER = businessLayerFor(engineDocumentationOf(SOURCE));

/** A report that performs `n` routines in turn — `n` steps of the process; 120 is more than one answer holds. */
function largeProgram(n: number): string {
  const name = (i: number) => `check_${String(i).padStart(3, '0')}`;
  const out = ['REPORT zbig_synthetic.', 'DATA gv_total TYPE p DECIMALS 2.', 'DATA gv_count TYPE i.', 'PARAMETERS p_limit TYPE i DEFAULT 10.', '', 'START-OF-SELECTION.'];
  // An assignment between the calls, so the engine does not read them as one sentence naming every routine
  // (that sentence, stored with every step, made the layer outgrow the project document).
  for (let i = 1; i <= n; i++) out.push(`  PERFORM ${name(i)}.`, `  gv_count = gv_count + ${i}.`);
  out.push('');
  for (let i = 1; i <= n; i++) {
    out.push(`FORM ${name(i)}.`, '  IF gv_count > p_limit.', `    gv_total = gv_total + ${i}.`, `    MESSAGE 'Limit ${i} reached' TYPE 'I'.`, '  ELSE.', '    gv_count = gv_count + 1.', '  ENDIF.', 'ENDFORM.');
  }
  return out.join('\n');
}
const LARGE = largeProgram(120);
const LARGE_FILE = 'zbig_synthetic.abap';

const fence = (layer: unknown) => `\`\`\`json\n${JSON.stringify(layer)}\n\`\`\``;

test.describe('the Documentation tool says what it is doing', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-progress-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocProgress123!';
  const SLOW = `doc-progress-slow-${STAMP}`;
  const STOP = `doc-progress-stop-${STAMP}`;
  const PARTS = `doc-progress-parts-${STAMP}`;
  const RUN_ID = `doc-progress-run-${STAMP}`;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Progress', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    for (const [id, source, file] of [[SLOW, SOURCE, FIXTURE_FILE], [STOP, SOURCE, FIXTURE_FILE], [PARTS, LARGE, LARGE_FILE]] as const) {
      const fingerprint = {
        sha256: sha256Hex(source), fileName: file, lineCount: source.split('\n').length,
        byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
      };
      await adminSetDoc('projects', id, {
        name: 'Documentation progress fixture', userId: uid, createdAt: new Date(), status: 'analyzed',
        legacyCode: source, analysis: '', cleanCoreScore: 62, activeRunId: RUN_ID, inputFingerprint: fingerprint,
      });
      const unsignedRun = {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
      };
      const runHash = recomputeStoredRunHash(unsignedRun);
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
      });
    }
  });

  async function modelOn(page: Page) {
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true, naming: true, statements: true }, keyAvailable: true, keySource: 'community' }),
    }));
  }

  /** The states of the card's stages, in document order. */
  const stagesOf = (page: Page) => page.locator('[data-doc-stage]').evaluateAll(
    (els) => els.map((e) => [e.getAttribute('data-doc-stage'), e.getAttribute('data-stage-state')] as [string, string]),
  );

  test('with a slow model: the stages run in order, the elapsed time moves, and the card ends written', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const bodies: Array<Record<string, unknown>> = [];
    await modelOn(page);
    await page.route('**/api/gemini', async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? '{}'));
      await new Promise((r) => setTimeout(r, 7000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: fence(LAYER), receipt: null }) });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${SLOW}/documentation`, { waitUntil: 'domcontentloaded' });

    // From the first moment: the card is there, and something in it runs.
    const card = page.locator('[data-doc-progress]');
    await expect(card).toBeVisible({ timeout: 60000 });
    expect(await stagesOf(page)).toHaveLength(DOC_STAGE_ORDER.length);
    expect((await stagesOf(page)).map(([k]) => k)).toEqual([...DOC_STAGE_ORDER]);

    // Sample the card until it ends: every stage that ran became active in the order of the card,
    // no stage was ever done after a later one was active, and the card never stood still with nothing running.
    const activeOrder: string[] = [];
    const businessTimes = new Set<string>();
    let sawExpected = false;
    const deadline = Date.now() + 180_000;
    for (;;) {
      const end = await card.getAttribute('data-doc-progress-end');
      const states = await stagesOf(page);
      if (end === 'running') expect(states.some(([, s]) => s === 'active'), `nothing runs: ${JSON.stringify(states)}`).toBe(true);
      for (const [key, state] of states) if (state === 'active' && !activeOrder.includes(key)) activeOrder.push(key);
      const firstOpen = states.findIndex(([, s]) => s !== 'done');
      if (firstOpen >= 0) expect(states.slice(firstOpen).some(([, s]) => s === 'done'), `a later stage is done before an earlier one: ${JSON.stringify(states)}`).toBe(false);
      if (states.find(([k]) => k === 'business')?.[1] === 'active') {
        businessTimes.add((await page.locator('[data-doc-stage="business"] [data-doc-stage-time]').textContent()) ?? '');
        if (await page.locator('[data-doc-stage="business"]').getByText('Expected: about').count()) sawExpected = true;
      }
      if (end !== 'running') break;
      expect(Date.now(), 'the card did not end').toBeLessThan(deadline);
      await page.waitForTimeout(250);
    }
    expect(activeOrder.length).toBeGreaterThan(1);
    expect(activeOrder).toEqual(DOC_STAGE_ORDER.filter((k) => activeOrder.includes(k)));
    expect(activeOrder).toContain('business');
    expect(sawExpected, 'the expected time was not said while the model wrote').toBe(true);
    expect(businessTimes.size, `the elapsed time did not move: ${[...businessTimes].join(', ')}`).toBeGreaterThan(2);

    await expect(card).toHaveAttribute('data-doc-progress-end', 'written');
    await expect(card).toContainText('Written — the process description and the SOP and RACI are stored with this project.');
    await expect(page.locator('[data-business-sop]')).toBeVisible({ timeout: 60000 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].stage).toBe('documentation');
    expect(bodies[0].responseShape).toBe('documentation-business');
    expect(String(bodies[0].prompt)).not.toContain('THIS IS PART');
  });

  test('a stopped call ends the card with its reason and Try again; the retry writes it', async ({ page }) => {
    test.setTimeout(300 * 1000);
    let calls = 0;
    await modelOn(page);
    await page.route('**/api/gemini', async (route) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 1500));
      if (calls === 1) {
        await route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ error: 'The model did not answer within 870 seconds, so the call was stopped. Nothing from it was used — try again.', code: 'model-timeout' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: fence(LAYER), receipt: null }) });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${STOP}/documentation`, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-doc-progress]');
    await expect(card).toHaveAttribute('data-doc-progress-end', 'failed', { timeout: 120000 });
    await expect(page.locator('[data-doc-stage="business"]')).toHaveAttribute('data-stage-state', 'failed');
    await expect(card).toContainText('Stopped at “Writing the SOP and the RACI”: The model did not answer within 870 seconds');
    await page.locator('[data-doc-progress-retry]').click();
    await expect(card).toHaveAttribute('data-doc-progress-end', 'written', { timeout: 120000 });
    expect(calls).toBe(2);
  });

  test('a program too large for one answer is written in parts, and the joined layer has every step', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const prompts: string[] = [];
    await modelOn(page);
    await page.route('**/api/gemini', async (route) => {
      const prompt = String(JSON.parse(route.request().postData() ?? '{}').prompt ?? '');
      prompts.push(prompt);
      const ids = (/for EXACTLY these business step ids, and for no other: ([^\n]+)\./.exec(prompt)?.[1] ?? '').split(', ').filter(Boolean);
      await new Promise((r) => setTimeout(r, 2500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: fence({
            raci_matrix: [...ids.map((stepId) => ({ stepId, r: 'Clerk', a: 'Process Owner', c: '', i: '' })), { stepId: 'not-this-part', r: 'Stray', a: 'Stray', c: '', i: '' }],
            sop_details: ids.map((stepId) => ({ stepId, claims: [{ text: 'The case is checked against the limit.', basis: 'proposal', lines: [] }], businessException: '' })),
          }),
          receipt: null,
        }),
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PARTS}/documentation`, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-doc-progress]');
    await expect(page.locator('[data-doc-parts] [data-doc-part]')).toHaveCount(2, { timeout: 120000 });
    await expect(card).toContainText('Written in 2 parts of up to 60 steps — 120 steps in all');
    await expect(page.locator('[data-model-proposals-cost]')).toContainText('written in 2 parts, one model call each');
    await expect(card).toHaveAttribute('data-doc-progress-end', 'written', { timeout: 120000 });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('THIS IS PART 1 OF 2');
    expect(prompts[1]).toContain('THIS IS PART 2 OF 2');
    // The second part reuses the roles the first one named.
    expect(prompts[1]).toContain('Roles the earlier part already uses: Clerk, Process Owner.');
    const stored = JSON.parse(String((await adminGetDoc('projects', PARTS))?.businessDocumentation ?? '{}')) as { raci_matrix: Array<{ stepId: string }>; sop_details: unknown[] };
    const ids = stored.raci_matrix.map((r) => r.stepId);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(ids).not.toContain('not-this-part');
    expect(stored.sop_details).toHaveLength(120);
  });
});
