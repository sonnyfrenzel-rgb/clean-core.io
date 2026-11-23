import { test, expect, type Page, type Locator } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { buildHandoverChain, bundleContentsLine, handoverFacets, packChainRows, type HandoverProject } from '../lib/handover';
import { workflowSteps } from '../lib/workflow-steps';
import { documentationProgress, type DocProgressInput } from '../lib/documentation-progress';
import { DOCUMENTATION_MESSAGES } from '../lib/messages/documentation';
import { fitWhole, type ViewboxCanvas } from '../components/process-map/bpmn-view';

/**
 * Defects of the UX review of 22.11.2026 that are wrong whatever the 3.5.0
 * redesign brings (quick wins Q1, Q4, Q6).
 *
 * - **Q6, Delivery.** "The pack's own chain" drew the *kind* of coverage of a
 *   link as a status chip — "Decision — Confirmed · your statement", "Receipt —
 *   Proven · signed" — on a project with no decision and no test, directly above
 *   "Nobody has confirmed anything on this project yet". Each row now says the
 *   status of this project. The Audit pack facet says whether the pack is
 *   sealed, and the bundle card says what the ZIP holds now.
 * - **Q4, dead ends.** "No process map yet … Open Analyze" on Analyze itself;
 *   Transformation's "Copy Code" with nothing to copy; Documentation's "Nothing
 *   more to write — Not written yet."
 * - **Q1, the map.** Analyze's inline map opened at 42 % on a desktop (about
 *   5 px text): it now opens no smaller than the readable floor of 80 % there,
 *   from the top of the level, and the reader pans; *Fit* and full screen still
 *   show the whole level, and the phone keeps its 40 % floor.
 *
 * `UXFIX_SHOTS=<dir>` and `UXFIX_LABEL=<before|after>` write screenshots at 1440 and 390.
 */

const SHOTS = process.env.UXFIX_SHOTS;
const LABEL = process.env.UXFIX_LABEL ?? 'after';
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = 'REPORT z_handover.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

function project(extra: Record<string, unknown> = {}): HandoverProject {
  return {
    id: 'p1',
    name: 'Handover fixture',
    legacyCode: SOURCE,
    activeRunId: 'run-0001',
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(SOURCE), fileName: 'z.abap', lineCount: 2, byteSize: SOURCE.length, uploadedAt: '2026-09-16T07:59:00.000Z', objectType: 'Report' },
      modelCard: { provider: 'google', model: 'stub', modelParticipation: 'narrative-attested', engineVersion: 'v3.2.0', byokUsed: false },
    },
    ...extra,
  } as HandoverProject;
}

/* ------------------------------------------------------------ server-free */

test.describe('Q6 — the pack chain says the status of this project', () => {
  test('no decision: the decision row is not "confirmed"; the receipt row names the model receipt, not a test', () => {
    const rows = packChainRows(project());
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(rows.map((r) => r.id)).toEqual(['requirement', 'decision', 'receipt', 'delivery']);
    expect(by.decision.provenance).toBe('not-determined');
    expect(by.decision.text).toMatch(/Nothing confirmed yet/);
    expect(by.receipt.provenance).toBe('proven');
    expect(by.receipt.text).toContain('It is not a test run.');
    expect(by.requirement.provenance).toBe('not-determined');
    expect(by.delivery.provenance).toBe('not-determined');
  });

  test('a signed-off target is the statement the pack seals, and only then "confirmed"', () => {
    const rows = packChainRows(project({ approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: 'a@b.io' }));
    const decision = rows.find((r) => r.id === 'decision')!;
    expect(decision.provenance).toBe('confirmed');
    expect(decision.note).toBe('your statement');
    expect(decision.text).toContain('your own statement');
  });

  test('without a model receipt the receipt row is not determined', () => {
    const p = project();
    p.auditMetadata!.modelCard!.modelParticipation = 'none';
    const receipt = packChainRows(p).find((r) => r.id === 'receipt')!;
    expect(receipt.provenance).toBe('not-determined');
    expect(receipt.text).toContain('No model took part');
  });

  test('the Audit pack facet says whether the pack is sealed', () => {
    const p = project();
    const phases = workflowSteps(p);
    const chain = buildHandoverChain(p, phases);
    const facet = (exportedAt: string | null) =>
      handoverFacets(p, phases, chain, { blockers: [], exportedAt }).find((f) => f.key === 'audit-pack')!;
    expect(facet(null).value).toBe('Available');
    expect(facet(null).sub).toMatch(/^Not sealed yet/);
    expect(facet('2026-11-20T10:00:00.000Z').sub).toMatch(/^Sealed/);
  });

  test('the bundle card says what the ZIP holds now', () => {
    const empty = bundleContentsLine({ code: false, tests: false, documentation: false });
    expect(empty).toBe('One ZIP with the analysis and STATUS.md with a manifest. Not in it yet: the generated code, the test suite and the documentation. A review version, built in your browser and not signed.');
    const docs = bundleContentsLine({ code: false, tests: false, documentation: true });
    expect(docs).toContain('the analysis, the documentation and STATUS.md');
    expect(docs).toContain('Not in it yet: the generated code and the test suite.');
    expect(bundleContentsLine({ code: true, tests: true, documentation: true })).not.toContain('Not in it yet');
  });

  test('the page draws the rows, not the coverage kinds', () => {
    const src = read('app/(app)/project/[projectId]/delivery/page.tsx');
    const chain = src.slice(src.indexOf('data-pack-chain=""'), src.indexOf('The server signs with HMAC-SHA256'));
    expect(chain).toContain('packChainRows(hp, packChain)');
    expect(chain).not.toContain("s.coverage === 'attested'");
  });
});

test.describe('Q4 — no dead ends', () => {
  const base: DocProgressInput = {
    loading: false,
    loadError: null,
    signedSource: true,
    runFact: '552 lines of Z_MM_PO_APPROVAL.abap, signed by the active run.',
    map: { status: 'ready', reason: null, fact: 'Process with 45 steps and 18 decision points.' },
    description: { writing: false, error: null, onRecord: true, legacy: false, reader: false, blocked: null },
    business: {
      phase: 'idle', error: null, failedAt: null, onRecord: false, absence: null, availabilityLoading: false,
      expected: null, plan: null, parts: null,
    },
    wrote: { description: true, business: false },
  };

  test('Documentation: a layer that waits for the click says so in one sentence', () => {
    const { end, stages } = documentationProgress({
      ...base,
      business: { ...base.business, absence: DOCUMENTATION_MESSAGES['doc.businessWaitsForClick'], waitsForClick: true },
    });
    expect(end.kind).toBe('nothing');
    if (end.kind !== 'nothing') return;
    expect(end.text).not.toContain('Nothing more to write');
    expect(end.text).not.toMatch(/Not written yet/);
    expect(end.text).toBe(DOCUMENTATION_MESSAGES['doc.endWaitsForClick']);
    expect(stages.find((s) => s.key === 'business')!.detail).not.toMatch(/Not written yet/);
    // A real stop keeps its sentence.
    const off = documentationProgress({ ...base, business: { ...base.business, absence: 'The model is switched off for Documentation in your settings.' } });
    expect(off.end.kind === 'nothing' && off.end.text).toBe('Nothing more to write — The model is switched off for Documentation in your settings.');
  });

  test('Analyze: the map\'s empty state on Analyze links nowhere back to Analyze', () => {
    const src = read('components/workspace/WorkspaceProcess.tsx');
    const absent = src.slice(src.indexOf("wt('biz.mapNoRun') : wt('biz.mapChanged')"), src.indexOf('/* --------------------------------------------------------- the column */'));
    expect(absent).toContain('codeOnClick ? undefined');
  });

  test('Transformation: Copy Code stands only where there is code', () => {
    const src = read('app/(app)/project/[projectId]/transformation/page.tsx');
    const copy = src.slice(src.indexOf('onClick={handleCopy}') - 200, src.indexOf('onClick={handleCopy}'));
    expect(copy).toContain('transformedCode.trim()');
  });
});

test.describe('Q1 — the inline map opens readable on a desktop', () => {
  function fake(outer: { width: number; height: number }, inner: { x: number; y: number; width: number; height: number }) {
    let box = { x: 0, y: 0, width: outer.width, height: outer.height };
    const canvas: ViewboxCanvas = {
      viewbox: ((next?: typeof box) => {
        if (next) {
          box = next;
          return undefined;
        }
        return { inner, outer };
      }) as ViewboxCanvas['viewbox'],
    };
    return { canvas, scale: () => outer.width / box.width, box: () => box };
  }
  const BIG = { x: 0, y: 0, width: 1360, height: 900 };

  test('readable: a large level opens at the 80 % floor on a desktop canvas, from its top', () => {
    const c = fake({ width: 1350, height: 420 }, BIG);
    fitWhole(c.canvas, { readable: true });
    expect(c.scale()).toBeCloseTo(0.8, 5);
    expect(c.box().y).toBeLessThan(BIG.y);
  });

  test('the overview (Fit, full screen, the tour, Documentation) still shows the whole level', () => {
    const c = fake({ width: 1350, height: 420 }, BIG);
    fitWhole(c.canvas);
    expect(c.scale()).toBeLessThan(0.5);
  });

  test('a level that fits opens at its fit, and the phone keeps its 40 % floor', () => {
    const small = fake({ width: 1350, height: 420 }, { x: 0, y: 0, width: 400, height: 200 });
    fitWhole(small.canvas, { readable: true });
    expect(small.scale()).toBe(1);
    const phone = fake({ width: 340, height: 420 }, BIG);
    fitWhole(phone.canvas, { readable: true });
    expect(phone.scale()).toBeCloseTo(0.4, 5);
  });

  test('Analyze\'s map asks for the readable opening; the other maps keep the whole level', () => {
    const src = read('components/process-map/ProcessMap.tsx');
    expect(src).toContain("openFit={page ? 'whole-readable' : 'whole'}");
  });
});

/* ------------------------------------------------------------ on screen */

const BIG_FILE = 'Z_MM_PO_APPROVAL.abap';

async function seedMapProject(prefix: string): Promise<SeededProject> {
  const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', BIG_FILE), 'utf8').replace(/\r\n/g, '\n');
  const acct = await seedStageProject({ prefix, acceptTerms: true, rich: true });
  const fingerprint = {
    sha256: sha256Hex(source), fileName: BIG_FILE, lineCount: source.split('\n').length,
    byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  await adminMergeDoc('projects', acct.projectId, { legacyCode: source, inputFingerprint: fingerprint });
  const unsignedRun = {
    runId: acct.runId, projectId: acct.projectId, userId: acct.uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62, inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${acct.projectId}/runs`, acct.runId, {
    ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
  return acct;
}

async function shoot(page: Page, name: string, target?: Locator) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(1200);
    if (target) await target.scrollIntoViewIfNeeded();
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `${name}-${width}-${LABEL}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const zoomOf = async (frame: Locator) => Number((await frame.locator('[data-map-zoom]').innerText()).replace(/[^\d]/g, ''));

test.describe('on screen', () => {
  test('Delivery: no "Confirmed" decision on a project nobody confirmed; the pack says it is not sealed', async ({ page }) => {
    test.setTimeout(240_000);
    // A signed run with its input fingerprint, so the pack is available; nobody signed off the target.
    const acct = await seedMapProject('uxfix-delivery');
    const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', BIG_FILE), 'utf8').replace(/\r\n/g, '\n');
    await adminMergeDoc('projects', acct.projectId, {
      auditMetadata: { inputFingerprint: { sha256: sha256Hex(source), fileName: BIG_FILE, lineCount: source.split('\n').length, byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString() } },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/delivery`, { waitUntil: 'domcontentloaded' });
    const chain = page.locator('[data-pack-chain]');
    await expect(chain).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-confirmations]')).toContainText('Nobody has confirmed anything');
    await shoot(page, 'delivery-chain', page.locator('[data-signature-covers]'));
    await shoot(page, 'delivery-top');
    const decision = chain.locator('li', { hasText: 'Decision' });
    await expect(decision).toHaveCount(1);
    await expect(decision).not.toContainText('Confirmed');
    await expect(page.locator('[data-delivery-facet]', { hasText: 'Audit pack' }).first()).toContainText('Not sealed yet');
  });

  test('Transformation: no Copy Code without code', async ({ page }) => {
    test.setTimeout(240_000);
    const acct = await seedStageProject({ prefix: 'uxfix-copy', acceptTerms: true });
    await adminMergeDoc('projects', acct.projectId, { generatedCode: null });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 90_000 });
    await shoot(page, 'transformation-header');
    await expect(page.getByRole('button', { name: 'Copy Code' })).toHaveCount(0);
  });

  test('Analyze: "No process map yet" on Analyze does not send the reader to Analyze', async ({ page }) => {
    test.setTimeout(240_000);
    // The plain fixture records no input fingerprint, so the map has no signed source: the "changed" state.
    const acct = await seedStageProject({ prefix: 'uxfix-nomap', acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    const absent = page.locator('[data-workspace-process="absent"][data-absence="changed"]');
    await expect(absent).toBeVisible({ timeout: 90_000 });
    await shoot(page, 'analyze-nomap', absent);
    await expect(absent.getByRole('link', { name: 'Open Analyze' })).toHaveCount(0);
    await expect(absent.getByRole('link')).toHaveCount(0);
  });

  test('Analyze: the big example opens readable on a desktop, and at 40 % or more on a phone', async ({ page }) => {
    test.setTimeout(300_000);
    const acct = await seedMapProject('uxfix-map');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    const frame = page.locator('[data-workspace-process] [data-map-canvas-frame]').first();
    await expect(frame).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(2);
    await page.waitForTimeout(800);
    const desktop = await zoomOf(frame);
    console.log(`Analyze map at 1440: ${desktop} %`);
    if (SHOTS) {
      await shoot(page, 'analyze-map', frame);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(frame).toBeVisible({ timeout: 120_000 });
      await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(2);
      await page.waitForTimeout(800);
    }
    expect(desktop, 'the opening zoom on a desktop').toBeGreaterThanOrEqual(80);
    // Fit still shows the whole level.
    await frame.locator('[data-map-fit]').click();
    await expect.poll(() => zoomOf(frame)).toBeLessThan(desktop);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const phoneFrame = page.locator('[data-workspace-process] [data-map-canvas-frame]').first();
    const radio = page.locator('[data-workspace-process]').getByRole('radio', { name: /^Map$/ }).first();
    await expect(radio.or(phoneFrame).first()).toBeVisible({ timeout: 120_000 });
    if ((await radio.count()) && (await radio.getAttribute('aria-checked')) !== 'true') await radio.click();
    await expect(phoneFrame).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => phoneFrame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(2);
    await page.waitForTimeout(800);
    const phone = await zoomOf(phoneFrame);
    console.log(`Analyze map at 390: ${phone} %`);
    expect(phone).toBeGreaterThanOrEqual(40);
  });
});
