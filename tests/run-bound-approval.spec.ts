import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import { validateProjectCommand } from '../lib/project-commands';
import {
  EVIDENCE_DIGEST_VERSION,
  describeEvidenceDiff,
  evidenceDiff,
  evidenceDigest,
  evidenceFacts,
  parseEvidenceDigest,
} from '../lib/run-evidence-digest';

/**
 * Roadmap 8.8 · CR-11 · gate G1: *„A lesen, B aktivieren, A freigeben → 409"*.
 *
 * The sign-off used to name an architecture and nothing else. Whatever
 * `activeRunId` pointed at when the request arrived became the evidence the
 * decision was recorded against — so a second tab finishing an analysis between
 * reading the design and pressing the button silently re-bound the sign-off to
 * a run the approver had never seen. The transaction added in 0.7 does not
 * close this: it proves nothing moved *during* the request, and this moves
 * before it.
 *
 * Two halves, and both are needed. The first is the comparison itself, exercised
 * as a pure function: a digest that is legible, a diff that names fields rather
 * than hashes, and a validator that refuses in every direction — moved run,
 * moved evidence, unreadable run, missing claim, malformed claim. The second is
 * the route against the live emulator, because the comparison is only worth
 * anything if the value it compares comes from the **run document** and is read
 * inside the transaction. `firestore.rules` leaves `projects/{id}/runs/{runId}`
 * `allow write: if false`, which is why the digest is taken from there and not
 * from the project document the owner writes.
 *
 * No timing window is sampled anywhere here (CLAUDE.md, *Gotchas*): the
 * conflict is made by moving `activeRunId` to a second run **before** the
 * request, so the refusal does not depend on catching anything in flight and
 * reads the same against `npm run dev` and against a production build.
 */

/* ========================================================= the digest itself */

const RUN_A = {
  runId: 'run-a',
  inputFingerprint: { sha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000', lineCount: 907 },
  evidenceReport: [{ id: 'f1' }, { id: 'f2' }],
  originalRecommendation: 'In-App (ABAP Cloud)',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: 'catalog-2026-09',
  analyzerVersion: 'engine-2.17',
  runHash: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
};

/** Same source, a later analysis: more findings and the other route. */
const RUN_B = {
  ...RUN_A,
  runId: 'run-b',
  evidenceReport: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }, { id: 'f4' }],
  originalRecommendation: 'Side-by-Side (SAP BTP)',
  runHash: 'ffff9999eeee8888dddd7777cccc6666bbbb5555aaaa4444ffff3333eeee2222',
};

test.describe('what the approver read, in a form that can be compared', () => {
  test('the digest is built from run fields only, and every one of them is named', () => {
    const keys = evidenceFacts(RUN_A).map((f) => f.key);
    expect(keys).toEqual(['source', 'lines', 'findings', 'route', 'rules', 'catalog', 'engine', 'run']);
    const line = evidenceDigest(RUN_A);
    expect(line.startsWith(`${EVIDENCE_DIGEST_VERSION}|`)).toBe(true);
    // The fingerprint travels short — twelve characters, the `fp12` of
    // `lib/assessment-profile.ts` — and the full sha256 does not leave the run.
    expect(line).toContain('source=a1b2c3d4e5f6');
    expect(line).not.toContain(RUN_A.inputFingerprint.sha256);
    expect(line).toContain('findings=2');
    expect(line).toContain('route=In-App (ABAP Cloud)');
  });

  test('a project document cannot change the digest of its run', () => {
    // The whole reason the digest is not taken from the project: the owner
    // writes `targetArchitecture`, `extensibilityRoute`, `solutionDesign` and
    // the rest from the browser (`firestore.rules`, the client allowlist). A
    // digest that moved with them would bind the sign-off to something the
    // approver authors.
    const tampered = {
      ...RUN_A,
      targetArchitecture: 'retire',
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      approvedByArchitect: true,
      solutionDesign: 'whatever the owner typed',
      worklist: [{ id: 'invented' }],
    };
    expect(evidenceDigest(tampered)).toBe(evidenceDigest(RUN_A));
  });

  test('a missing fact says so rather than disappearing', () => {
    const line = evidenceDigest({});
    expect(parseEvidenceDigest(line)).not.toBeNull();
    expect(line).toContain('findings=not recorded');
    // Two runs that both recorded nothing are equal; a run that recorded
    // something is not equal to one that did not.
    expect(evidenceDigest({})).toBe(evidenceDigest({ somethingElse: 1 }));
    expect(evidenceDigest({})).not.toBe(evidenceDigest(RUN_A));
  });

  test('a line that is not ours parses to nothing rather than to half a diff', () => {
    expect(parseEvidenceDigest('ev2|source=x')).toBeNull();
    expect(parseEvidenceDigest(`${EVIDENCE_DIGEST_VERSION}|source=x`)).toBeNull();
    expect(parseEvidenceDigest(`${EVIDENCE_DIGEST_VERSION}|unknown=x`)).toBeNull();
    expect(parseEvidenceDigest('')).toBeNull();
    expect(parseEvidenceDigest(42)).toBeNull();
    expect(parseEvidenceDigest(`${EVIDENCE_DIGEST_VERSION}|${'x'.repeat(2000)}=1`)).toBeNull();
  });

  test('the diff is a field name and two values, not a hash difference', () => {
    const changes = evidenceDiff(evidenceDigest(RUN_A), evidenceDigest(RUN_B));
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual(['findings', 'route', 'run']);
    expect(byKey.findings).toMatchObject({ label: 'findings', read: '2', now: '4' });
    expect(byKey.route).toMatchObject({ read: 'In-App (ABAP Cloud)', now: 'Side-by-Side (SAP BTP)' });
    const sentence = describeEvidenceDiff(changes);
    expect(sentence).toContain('findings 2 → 4');
    expect(sentence).toContain('recommended route In-App (ABAP Cloud) → Side-by-Side (SAP BTP)');
  });

  test('a value cannot smuggle the separators the line is made of', () => {
    const line = evidenceDigest({ ...RUN_A, originalRecommendation: 'a|b=c\nd' });
    expect(parseEvidenceDigest(line)).not.toBeNull();
    expect(line).toContain('route=a b c d');
  });
});

/* ============================================== the transition, as a function */

test.describe('the sign-off refuses a run it was not read from', () => {
  const actor = { email: 'owner@example.com', now: '2026-09-23T10:00:00.000Z' };
  const digestA = evidenceDigest(RUN_A);
  const digestB = evidenceDigest(RUN_B);
  const approve = (extra: Record<string, unknown> = {}) => ({
    command: 'approve-architecture',
    targetArchitecture: 'rap',
    expectedRunId: 'run-a',
    expectedEvidenceDigest: digestA,
    ...extra,
  });

  test('read A, B became active, sign off A → 409 with the diff', () => {
    const r = validateProjectCommand(
      approve(),
      { activeRunId: 'run-b', activeRunEvidence: digestB, originalRecommendation: 'In-App (ABAP Cloud)' },
      actor,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe('run-moved');
    expect(r.activeRunId).toBe('run-b');
    // The reader is told which run the project stands on and what moved — a
    // bare "409 Conflict" does not satisfy this step.
    expect(r.error).toContain('run-a');
    expect(r.error).toContain('run-b');
    expect(r.error).toContain('findings 2 → 4');
    expect(r.details?.map((d) => d.key).sort()).toEqual(['findings', 'route', 'run']);
  });

  test('same run, different evidence → 409 too, and not silently accepted', () => {
    const r = validateProjectCommand(
      approve(),
      { activeRunId: 'run-a', activeRunEvidence: digestB },
      actor,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.code).toBe('evidence-moved');
      expect(r.error).toContain('findings 2 → 4');
    }
  });

  test('an unreadable run is not an unchanged one', () => {
    for (const evidence of [null, undefined]) {
      const r = validateProjectCommand(approve(), { activeRunId: 'run-a', activeRunEvidence: evidence }, actor);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(409);
        expect(r.code).toBe('run-unreadable');
      }
    }
  });

  test('the binding is required, so omitting it is not a way around it', () => {
    const state = { activeRunId: 'run-a', activeRunEvidence: digestA };
    const noRun = validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'rap' }, state, actor);
    expect(noRun.ok).toBe(false);
    if (!noRun.ok) expect(noRun.code).toBe('missing-expected-run');

    const noDigest = validateProjectCommand(
      { command: 'approve-architecture', targetArchitecture: 'rap', expectedRunId: 'run-a' },
      state,
      actor,
    );
    expect(noDigest.ok).toBe(false);
    if (!noDigest.ok) expect(noDigest.code).toBe('missing-evidence-digest');

    const junk = validateProjectCommand(approve({ expectedEvidenceDigest: 'ev1|nope' }), state, actor);
    expect(junk.ok).toBe(false);
    if (!junk.ok) expect(junk.code).toBe('malformed-evidence-digest');
  });

  test('and the matching pair still signs off', () => {
    const r = validateProjectCommand(
      approve(),
      { activeRunId: 'run-a', activeRunEvidence: digestA, originalRecommendation: 'In-App (ABAP Cloud)' },
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.approvedByArchitect).toBe(true);
  });
});

/* ============================================ the route, against the emulator */

const OWNER = `run-bound-${Date.now()}@example.com`;
const PASSWORD = 'TestPassword123!';
const PROJECT_ID = `run-bound-project-${Date.now()}`;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

test.describe('the route compares against the run document, inside the transaction', () => {
  test.describe.configure({ mode: 'serial' });

  let idToken = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const cred = await createUserWithEmailAndPassword(auth, OWNER, PASSWORD);
    idToken = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Run', lastName: 'Bound', email: OWNER, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Run-bound sign-off',
      userId: cred.user.uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_bound.',
      // The project stands on B. The sign-off below was prepared on A — the
      // state after "read A, let the other tab finish, press the button".
      activeRunId: 'run-b',
      originalRecommendation: 'In-App (ABAP Cloud)',
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, 'run-a', { ...RUN_A, userId: cred.user.uid, projectId: PROJECT_ID });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, 'run-b', { ...RUN_B, userId: cred.user.uid, projectId: PROJECT_ID });
  });

  const post = (request: APIRequestContext, data: Record<string, unknown>) =>
    request.post(`/api/projects/${PROJECT_ID}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data,
    });

  test('a sign-off read from A is refused while B is active — and writes nothing', async ({ request }) => {
    const res = await post(request, {
      command: 'approve-architecture',
      targetArchitecture: 'rap',
      expectedRunId: 'run-a',
      expectedEvidenceDigest: evidenceDigest(RUN_A),
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('run-moved');
    expect(body.activeRunId).toBe('run-b');
    expect(body.error, 'the refusal names what moved').toContain('findings 2 → 4');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'route', read: 'In-App (ABAP Cloud)', now: 'Side-by-Side (SAP BTP)' })]),
    );

    // Nothing was hung on the newer run either: the project is exactly as it was.
    const stored = (await adminGetDoc('projects', PROJECT_ID)) || {};
    expect(stored.approvedByArchitect, 'a refused sign-off was recorded').toBeUndefined();
    expect(stored.targetArchitecture).toBeUndefined();
    expect(stored.approvedBy).toBeUndefined();
  });

  test('the digest is the run document’s, not the browser’s claim about it', async ({ request }) => {
    // The caller names the right run and asserts the evidence it wishes the run
    // had. The server recomputes from `projects/{id}/runs/run-b` and refuses.
    const res = await post(request, {
      command: 'approve-architecture',
      targetArchitecture: 'rap',
      expectedRunId: 'run-b',
      expectedEvidenceDigest: evidenceDigest({ ...RUN_B, evidenceReport: [], originalRecommendation: 'In-App (ABAP Cloud)' }),
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('evidence-moved');
  });

  test('a sign-off read from the run the project stands on is recorded', async ({ request }) => {
    const res = await post(request, {
      command: 'approve-architecture',
      // The project's own `originalRecommendation` is the In-App route, so
      // `rap` confirms it and needs no written reason; the override path has
      // its own test in `project-command-boundary.spec.ts`.
      targetArchitecture: 'rap',
      expectedRunId: 'run-b',
      expectedEvidenceDigest: evidenceDigest(RUN_B),
    });
    expect(res.status()).toBe(200);
    const stored = (await adminGetDoc('projects', PROJECT_ID)) || {};
    expect(stored.approvedByArchitect).toBe(true);
    expect(stored.targetArchitecture).toBe('rap');
    expect(stored.approvedBy).toBe(OWNER);
  });

  test('a project whose active run is gone refuses rather than signing off on nothing', async ({ request }) => {
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Run-bound sign-off',
      userId: (await adminGetDoc('projects', PROJECT_ID))?.userId,
      status: 'analyzed',
      activeRunId: 'run-missing',
      originalRecommendation: 'In-App (ABAP Cloud)',
    });
    const res = await post(request, {
      command: 'approve-architecture',
      targetArchitecture: 'rap',
      expectedRunId: 'run-missing',
      expectedEvidenceDigest: evidenceDigest(RUN_A),
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('run-unreadable');
  });
});
