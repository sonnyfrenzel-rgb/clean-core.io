import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash } from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-applet-config.json';
import { sha256Hex, artefactDigest, buildSourceChangeRecord } from '../lib/artefact-digest';
import { staleness, handoverBlockers, generationBlockers, workflowSteps } from '../lib/workflow-steps';
import { TERMS_VERSION } from '../lib/constants';
import type { Project, TestCase } from '../lib/types';

/**
 * After a source change, nothing built for the old source passes as current
 * (roadmap E01-F01-US02, CR-10).
 *
 * The acceptance: "If the source digest differs from the analysis input used,
 * transformation and controlled handover are blocked until re-assessment. A
 * client status change does not bypass the lock."
 *
 * Before: a new run left the design, code, tests, documentation and the
 * architect's sign-off in place, all reading as current, and the signed audit
 * pack carried a sign-off given for code that was no longer the code under
 * review.
 */

const node256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

test.describe('the digest the browser computes is the one the server signs', () => {
  test('sync SHA-256 matches node crypto, including the padding boundaries and non-ASCII', () => {
    const cases = [
      '',
      'abc',
      'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65),
      'REPORT zgrüße.\nWRITE: / \'€ — 日本語 🚀\'.\n',
      Array.from({ length: 3000 }, (_, i) => `  SELECT * FROM vbak WHERE vbeln = ${i}.`).join('\n'),
    ];
    for (const s of cases) expect(sha256Hex(s), JSON.stringify(s.slice(0, 20))).toBe(node256(s));
  });

  test('test cases hash without their verdicts: running a stale suite does not freshen it', () => {
    const cases: TestCase[] = [{ id: 't1', name: 'n', category: 'c', description: 'd', priority: 'High' }];
    const ran = cases.map((t) => ({ ...t, status: 'Passed' as const, message: 'ok' }));
    expect(artefactDigest('testCases', ran)).toBe(artefactDigest('testCases', cases));
    // …and key order does not matter either.
    expect(artefactDigest('testCases', [{ priority: 'High', description: 'd', category: 'c', name: 'n', id: 't1' }]))
      .toBe(artefactDigest('testCases', cases));
  });
});

const SOURCE_A = 'REPORT z_a.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
const SOURCE_B = 'REPORT z_b.\nSELECT * FROM vbap INTO TABLE @DATA(lt).\n';
const CASES: TestCase[] = [{ id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' }];

/** A project analysed on A, fully built, then re-analysed on B. */
function afterChange(over: Partial<Project> = {}): Project {
  const before = {
    solutionDesign: 'design for A',
    generatedCode: 'code for A',
    testCases: CASES,
    documentation: 'docs for A',
    approvedByArchitect: true,
    architectSignOffAt: '2026-09-01T10:00:00.000Z',
  };
  return {
    name: 'p',
    legacyCode: SOURCE_B,
    activeRunId: 'run-b',
    ...before,
    auditMetadata: {
      inputFingerprint: { sha256: node256(SOURCE_B), fileName: 'z', lineCount: 2, byteSize: 1, uploadedAt: '', objectType: 'Report' },
      sourceChange: buildSourceChangeRecord(before, node256(SOURCE_A), 'run-b', '2026-09-11T08:00:00.000Z'),
    },
    ...over,
  } as Project;
}

test.describe('the contract', () => {
  test('everything left from the previous source is stale, and the handover is blocked', () => {
    const p = afterChange();
    const s = staleness(p);
    expect(s).toMatchObject({ sourceChanged: false, design: true, code: true, tests: true, docs: true, signOff: true });
    const byKey = Object.fromEntries(workflowSteps(p).map((x) => [x.key, x]));
    expect(byKey.design.state).toBe('stale');
    expect(byKey.transformation.state).toBe('stale');
    expect(byKey.delivery).toMatchObject({ state: 'stale', badge: 'Blocked' });
    expect(handoverBlockers(p)).toEqual([
      'the solution design', 'the architecture sign-off', 'the generated code', 'the test suite', 'the documentation',
    ]);
    expect(generationBlockers(p, 'transformation').length).toBe(2);
  });

  test('a client status change moves nothing', () => {
    const p = afterChange({ status: 'completed' });
    expect(handoverBlockers(p).length).toBe(5);
  });

  test('regenerating clears an artefact; re-confirming clears the sign-off; each only itself', () => {
    const redesigned = afterChange({ solutionDesign: 'design for B' });
    expect(staleness(redesigned).design).toBe(false);
    // The design is new, the sign-off is still the old one — confirm it again.
    const design = workflowSteps(redesigned).find((x) => x.key === 'design')!;
    expect(design).toMatchObject({ state: 'partial', badge: 'Re-confirm' });
    expect(generationBlockers(redesigned, 'transformation')).toEqual([
      'The architecture sign-off was given for a previous source. Confirm it again in stage 2.',
    ]);

    const reconfirmed = afterChange({ solutionDesign: 'design for B', architectSignOffAt: '2026-09-11T09:00:00.000Z' });
    expect(generationBlockers(reconfirmed, 'transformation')).toEqual([]);
    // Documentation and testing still wait for code built on the current design.
    expect(generationBlockers(reconfirmed, 'documentation')).toEqual([
      'The code was generated from a previous source. Regenerate it in stage 3 first.',
    ]);

    const all = afterChange({
      solutionDesign: 'design for B', architectSignOffAt: '2026-09-11T09:00:00.000Z',
      generatedCode: 'code for B', testCases: [{ ...CASES[0], name: 'Totals B' }], documentation: 'docs for B',
    });
    expect(handoverBlockers(all)).toEqual([]);
  });

  test('a source written without a new run makes the analysis itself stale', () => {
    const p = afterChange({ legacyCode: 'REPORT z_c.\n' });
    expect(staleness(p).sourceChanged).toBe(true);
    expect(workflowSteps(p)[0]).toMatchObject({ key: 'analyze', state: 'stale', badge: 'Source changed' });
    expect(generationBlockers(p, 'transformation')).toEqual([
      'The source changed after the signed run. Re-run the analysis in stage 1 first.',
    ]);
  });

  test('without a recorded change nothing is stale', () => {
    const p = afterChange();
    delete p.auditMetadata!.sourceChange;
    expect(handoverBlockers(p)).toEqual([]);
  });
});

// ── End to end: the server records the change and the audit pack enforces it ──

const EMU = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

type RestValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
};

/** The emulator's REST shape, decoded. */
function decode(v: RestValue | undefined): unknown {
  if (v == null) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if ('nullValue' in v) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  return undefined;
}

test.describe('server side', () => {
  test.describe.configure({ mode: 'serial' });

  const EMAIL = `srcchange-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'SourceChange123!';
  const PROJECT_ID = `srcchange-${Date.now()}`;
  let token = '';

  const readProject = async () => {
    const res = await fetch(`${EMU}/projects/${PROJECT_ID}`, { headers: { Authorization: 'Bearer owner' } });
    expect(res.ok).toBe(true);
    const json = await res.json();
    return decode({ mapValue: { fields: json.fields } }) as Project;
  };

  /** A write the way a browser would make it: the owner's token, the real rules. */
  const clientWrite = async (field: string, value: string) => {
    const res = await fetch(`${EMU}/projects/${PROJECT_ID}?updateMask.fieldPaths=${field}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [field]: { stringValue: value } } }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  };

  const run = (request: APIRequestContext, legacyCode: string) =>
    request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode, analysis: '{}', uploadedFileName: 'z.abap' },
    });

  const pack = (request: APIRequestContext) =>
    request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID },
    });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Source', lastName: 'Change', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Source change fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE_A,
    });
  });

  test('re-analysing the same source records nothing', async ({ request }) => {
    expect((await run(request, SOURCE_A)).status()).toBe(200);
    expect((await run(request, SOURCE_A)).status()).toBe(200);
    const p = await readProject();
    expect(p.auditMetadata?.inputFingerprint?.sha256).toBe(node256(SOURCE_A));
    expect(p.auditMetadata?.sourceChange).toBeUndefined();
  });

  test('a new source records what was built for the old one', async ({ request }) => {
    await adminMergeDoc('projects', PROJECT_ID, {
      solutionDesign: 'design for A', generatedCode: 'code for A', testCases: CASES, documentation: 'docs for A',
      targetArchitecture: 'cap', approvedByArchitect: true, approvedBy: EMAIL, architectSignOffAt: '2026-09-01T10:00:00.000Z',
    });
    // Before the change, the pack is fine.
    expect((await pack(request)).status()).toBe(200);

    const res = await run(request, SOURCE_B);
    expect(res.status()).toBe(200);
    const { runId } = await res.json();

    const p = await readProject();
    const rec = p.auditMetadata!.sourceChange!;
    expect(rec).toMatchObject({ runId, previousSha256: node256(SOURCE_A), signOff: '2026-09-01T10:00:00.000Z' });
    expect(rec.artefacts).toEqual({
      solutionDesign: node256('design for A'),
      generatedCode: node256('code for A'),
      testCases: artefactDigest('testCases', CASES),
      documentation: node256('docs for A'),
    });
    expect(handoverBlockers(p).length).toBe(5);
  });

  test('the signed pack refuses a sign-off given for the previous source — and a client status write does not change that', async ({ request }) => {
    const refused = await pack(request);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).blockers).toEqual(['sign-off-stale']);

    await clientWrite('status', 'completed');
    const still = await pack(request);
    expect(still.status()).toBe(409);
    expect((await still.json()).blockers).toEqual(['sign-off-stale']);
  });

  test('the pages say so, and the handover buttons are disabled', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    await page.goto(`/project/${PROJECT_ID}/delivery`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stale-notice]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-handover-bundle]')).toBeDisabled();
    await expect(page.locator('nav[aria-label="Workflow phases"] [data-phase="design"]'))
      .toHaveAttribute('data-phase-state', 'stale');
    await expect(page.locator('nav[aria-label="Workflow phases"] [data-phase="delivery"]'))
      .toHaveAttribute('data-phase-state', 'stale');

    await page.goto(`/project/${PROJECT_ID}/transformation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stale-notice]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button:has-text("Re-Run Engine")')).toBeDisabled();
  });

  test('regenerating and re-confirming lifts it', async ({ request }) => {
    await adminMergeDoc('projects', PROJECT_ID, {
      solutionDesign: 'design for B', generatedCode: 'code for B', documentation: 'docs for B',
      testCases: [{ ...CASES[0], name: 'Totals B' }], architectSignOffAt: '2026-09-11T09:00:00.000Z',
    });
    expect(handoverBlockers(await readProject())).toEqual([]);
    expect((await pack(request)).status()).toBe(200);
  });

  test('a source written without a new run is refused by the pack', async ({ request }) => {
    // The analyze page never does this. A direct write can — legacyCode is in
    // the client allowlist — so the server checks the digest itself.
    await clientWrite('legacyCode', 'REPORT z_c.\n');
    const res = await pack(request);
    expect(res.status()).toBe(409);
    expect((await res.json()).blockers).toContain('source-changed');
    expect(staleness(await readProject()).sourceChanged).toBe(true);
  });
});
