import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { adminGetDoc, adminMergeDoc } from './helpers/admin-seed';
import { seedStageProject, type SeededProject } from './helpers/seed-project';
import { validateProjectCommand } from '../lib/project-commands';
import { recommendationOfProject, MAX_CONTRACT_SOURCE_BYTES } from '../lib/contract-build';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';

/**
 * The design sign-off checks a departure against the architecture contract —
 * owner decision 02.10.2026.
 *
 * `approve-architecture` used to decide whether a reason was required by
 * comparing the chosen architecture with `originalRecommendation`, else
 * `extensibilityRoute`, on the project document. The second is on the client
 * allowlist of `firestore.rules`: the approver could write "side-by-side"
 * from the browser and then sign side-by-side off as "the recommendation",
 * with no reason, over code the engine routes in-app. And the Design page,
 * which names the contract's route, had to hand the sign-off dialog the
 * stored value, or the server refused the reader's own confirmation.
 *
 * Now the server derives the recommendation from the source the way
 * `GET /api/projects/{id}/contract` does, and only when no contract can be
 * derived does the stored value decide — said so in the answer.
 */

const actor = { email: 'owner@example.com', now: '2026-10-02T10:00:00.000Z' };
const RUN = { evidenceReport: [{ id: 'f1' }], runHash: 'b'.repeat(64) };
const DIGEST = evidenceDigest(RUN);
const bound = (extra: Record<string, unknown>) => ({
  command: 'approve-architecture',
  expectedRunId: 'run-1',
  expectedEvidenceDigest: DIGEST,
  ...extra,
});

test.describe('the rule', () => {
  // The browser has flipped the route switch to side-by-side; the contract
  // derived from the code says in-app RAP.
  const state = {
    activeRunId: 'run-1',
    activeRunEvidence: DIGEST,
    extensibilityRoute: SIDE_BY_SIDE_ROUTE,
    contractRecommendation: 'rap' as const,
  };

  test('choosing the contract’s route needs no reason, whatever the stored route says', () => {
    const r = validateProjectCommand(bound({ targetArchitecture: 'rap' }), state, actor);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recommendationBasis).toBe('contract');
      expect(r.notice).toBeUndefined();
    }
  });

  test('choosing the client-written stored route is a departure and needs a reason', () => {
    const refused = validateProjectCommand(bound({ targetArchitecture: 'cap' }), state, actor);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe('override-needs-reason');
      expect(refused.recommendationBasis).toBe('contract');
    }
    const withReason = validateProjectCommand(
      bound({ targetArchitecture: 'cap', justification: 'The credit service is shared with two other systems.' }),
      state,
      actor,
    );
    expect(withReason.ok).toBe(true);
  });

  test('without a contract the stored value decides, as before, and the answer says so', () => {
    const noContract = { ...state, contractRecommendation: null };
    const refused = validateProjectCommand(bound({ targetArchitecture: 'rap' }), noContract, actor);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe('override-needs-reason');
      expect(refused.recommendationBasis).toBe('stored');
    }
    const accepted = validateProjectCommand(bound({ targetArchitecture: 'cap' }), noContract, actor);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.recommendationBasis).toBe('stored');
      expect(accepted.notice).toMatch(/No architecture contract could be derived/);
    }
  });

  test('the recommendation is the contract’s derivation, and stops where the contract route stops', () => {
    // The plain fixture's code reads a standard table; nothing drives it off the stack.
    const plain = 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
    expect(recommendationOfProject({ legacyCode: plain, extensibilityRoute: SIDE_BY_SIDE_ROUTE })).toBe('rap');
    expect(recommendationOfProject({ legacyCode: '' })).toBeNull();
    expect(recommendationOfProject({ legacyCode: `REPORT z.\n${'*'.repeat(MAX_CONTRACT_SOURCE_BYTES)}` })).toBeNull();
    // An off-track decision on the record does not take the recommendation away.
    expect(recommendationOfProject({ legacyCode: plain, targetArchitecture: 'retire' })).toBe('rap');
  });
});

test.describe('the route', () => {
  test.describe.configure({ mode: 'serial' });

  let seeded: SeededProject;
  let idToken = '';
  let binding: { expectedRunId: string; expectedEvidenceDigest: string };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    seeded = await seedStageProject({ prefix: 'signoff-contract', acceptTerms: true });
    // What the Analyze stage's route switch writes from the browser.
    await adminMergeDoc('projects', seeded.projectId, { extensibilityRoute: SIDE_BY_SIDE_ROUTE });
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = connectAuthToEmulator(getAuth(app));
    const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
    idToken = await cred.user.getIdToken(true);
    const run = await adminGetDoc(`projects/${seeded.projectId}/runs`, seeded.runId);
    binding = { expectedRunId: seeded.runId, expectedEvidenceDigest: evidenceDigest(run || {}) };
  });

  const post = (request: APIRequestContext, body: Record<string, unknown>) =>
    request.post(`/api/projects/${seeded.projectId}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data: { ...body, ...binding },
    });

  test('the stored side-by-side route is not the recommendation: choosing it without a reason is refused', async ({ request }) => {
    test.setTimeout(120_000);
    const res = await post(request, { command: 'approve-architecture', targetArchitecture: 'cap' });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('override-needs-reason');
    expect(body.recommendationBasis).toBe('contract');
    expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect).toBeUndefined();
  });

  test('the contract’s route is signed off without a reason', async ({ request }) => {
    test.setTimeout(120_000);
    const res = await post(request, { command: 'approve-architecture', targetArchitecture: 'rap' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recommendationBasis).toBe('contract');
    expect(body.notice).toBeUndefined();
    const stored = await adminGetDoc('projects', seeded.projectId);
    expect(stored?.targetArchitecture).toBe('rap');
    expect(stored?.architectJustifiedOverride).toBe('');
  });

  test('without source the stored route decides again, and the answer says it fell back', async ({ request }) => {
    test.setTimeout(120_000);
    const revoked = await request.post(`/api/projects/${seeded.projectId}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data: { command: 'revoke-architecture' },
    });
    expect(revoked.status()).toBe(200);
    await adminMergeDoc('projects', seeded.projectId, { legacyCode: '' });
    const res = await post(request, { command: 'approve-architecture', targetArchitecture: 'cap' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recommendationBasis).toBe('stored');
    expect(body.notice).toMatch(/No architecture contract could be derived/);
  });
});
