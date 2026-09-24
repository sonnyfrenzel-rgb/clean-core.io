/**
 * The trust chain, end to end.
 *
 * What it verifies, in the order the chain runs:
 *   1. the run guard's decision, on projects with and without an active run;
 *   2. the client-side gate in `generateAuditPack`, which refuses before it asks;
 *   3. the server: no run → a refusal with a reason; a run → a pack that IS that
 *      run, signed, verifiable, and refused again the moment the run is altered;
 *   4. the retired `/api/export/sign`, answering rather than merely reading as if
 *      it would;
 *   5. the downstream pages, which must call the guard at all.
 *
 * Layers 3 and 4 used to be source greps and one assertion that proved nothing:
 * `rejects.not.toThrow('Cannot generate Audit Pack without an active analysis
 * run')` passes for every error that is not that one — including the fetch
 * error you get when the endpoint does not exist, which is exactly what the
 * call produced in this process. So the whole suite passed while audit-pack
 * creation was, as far as it could tell, completely broken (QA review
 * 812cbce3b485). The greps had the same shape one level down: `content`
 * containing `'createHmac'` says a route mentions HMAC, not that it signs
 * anything a verifier accepts.
 *
 * So the middle of this file now runs against the emulators and asserts the
 * answers: the bytes that come back, what they hash to, and what the public
 * verifier says about them.
 */
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { USER_ATTESTED_FILE } from '../lib/audit-pack';
import { hasActiveRun } from '../lib/run-guard';
import { generateAuditPack } from '../lib/audit-pack';
import type { Project } from '../lib/types';

test.describe('v1.19 Trust Chain Closure', () => {

  // ────────────────────────────────────────────────
  // Item #2 — Run Guard
  // ────────────────────────────────────────────────

  test.describe('Run Guard — hasActiveRun()', () => {

    test('returns false for null project', () => {
      expect(hasActiveRun(null)).toBe(false);
    });

    test('returns false for project without activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed' } as Project;
      expect(hasActiveRun(project)).toBe(false);
    });

    test('returns false for project with empty string activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed', activeRunId: '' } as Project;
      expect(hasActiveRun(project)).toBe(false);
    });

    test('returns true for project with valid activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed', activeRunId: 'run-abc123' } as Project;
      expect(hasActiveRun(project)).toBe(true);
    });

  });

  // ────────────────────────────────────────────────
  // Item #3 — Audit Pack Run Gate (client side)
  // ────────────────────────────────────────────────

  test.describe('Audit Pack Run Gate', () => {

    const baseProject: Project = {
      id: 'test-tc-project',
      name: 'Trust Chain Test',
      userId: 'test-user',
      status: 'analyzed',
      cleanCoreScore: 85,
      complexityScore: 40,
      criticalityScore: 30,
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      approvedByArchitect: true,
      approvedBy: 'architect@enterprise.com',
      architectSignOffAt: new Date().toISOString(),
      auditMetadata: {
        inputFingerprint: {
          fileName: 'z_trust_chain_test.abap',
          objectType: 'Report',
          lineCount: 100,
          byteSize: 2048,
          sha256: 'abc123def456',
          uploadedAt: new Date().toISOString(),
        },
        modelCard: {
          provider: 'google-gemini',
          model: 'gemini-3-flash-preview',
          engineVersion: 'v1.19.0',
          byokUsed: false,
          analysisTimestamp: new Date().toISOString(),
          catalogVersion: '2024.FPS02',
        },
      },
    };

    test('throws error when activeRunId is missing', async () => {
      const projectWithoutRun = { ...baseProject, activeRunId: undefined };
      await expect(generateAuditPack(projectWithoutRun, 'fake-token'))
        .rejects.toThrow('Cannot generate Audit Pack without an active analysis run');
    });

    test('throws error when activeRunId is empty string', async () => {
      const projectWithEmptyRun = { ...baseProject, activeRunId: '' };
      await expect(generateAuditPack(projectWithEmptyRun, 'fake-token'))
        .rejects.toThrow('Cannot generate Audit Pack without an active analysis run');
    });

    // The third case here — "passes the gate and delegates to the server" —
    // was `rejects.not.toThrow(<the gate message>)`, which every failure mode
    // satisfies. What it was reaching for is the server, and the server is
    // below, where it answers for itself.

  });

  // ────────────────────────────────────────────────
  // Item #4 — The server: the chain against the emulators
  // ────────────────────────────────────────────────

  test.describe('the audit pack the server actually makes', () => {
    test.describe.configure({ mode: 'serial' });

    const STAMP = Date.now();
    const EMAIL = `trust-chain-${STAMP}@cleancore-test.io`;
    const PASSWORD = 'TrustChain123!';
    /** Two projects: one that never gets a run, one that gets one and then has it altered. */
    const NO_RUN = `tc-no-run-${STAMP}`;
    const WITH_RUN = `tc-with-run-${STAMP}`;
    const SOURCE = 'REPORT z_trust_chain.\nSELECT * FROM vbak INTO TABLE @DATA(lt_orders).\n';

    let token = '';
    const headers = () => ({ Authorization: `Bearer ${token}` });
    const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

    const db = () => {
      const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
      return adminFirestore(app, FIRESTORE_DB_ID);
    };

    /** The run the server stored — the thing every signed byte has to be traceable to. */
    async function storedRun(projectId: string) {
      const project = (await db().collection('projects').doc(projectId).get()).data()!;
      const runId = project.activeRunId as string;
      const run = (await db().collection('projects').doc(projectId).collection('runs').doc(runId).get()).data()!;
      return { runId, run };
    }

    test.beforeAll(async () => {
      // Account creation plus three seed calls, each a round trip through the
      // app under test and the emulator; the default 30 s hook budget is not
      // enough on a cold dev server.
      test.setTimeout(180 * 1000);
      const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
      const auth = getAuth(app);
      try {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      } catch { /* already connected */ }
      const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
      token = await cred.user.getIdToken();
      await adminSetDoc('users', cred.user.uid, {
        firstName: 'Trust', lastName: 'Chain', email: EMAIL, tier: 'pilot', status: 'approved',
        transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
        mfaEnabled: false, createdAt: new Date(),
      });
      for (const id of [NO_RUN, WITH_RUN]) {
        await adminSetDoc('projects', id, {
          name: `Trust chain ${id}`, userId: cred.user.uid, createdAt: new Date(),
          status: 'uploaded', legacyCode: SOURCE,
        });
      }
    });

    test('without a run the server refuses, with the reason and not a generic error', async ({ request }) => {
      const res = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId: NO_RUN } });
      expect(res.status()).toBe(422);
      // The answer, not the presence of `status: 422` somewhere in the file:
      // the reason has to be the missing run and has to be readable.
      expect((await res.json()).error).toBe('No active analysis run. Please run the analysis first.');
      // And nothing was minted on the way out.
      expect((await db().collection('projects').doc(NO_RUN).get()).data()?.activeRunId).toBeUndefined();
    });

    test('with a run the pack is that run: its files, its hash, and a signature the public verifier accepts', async ({ request }) => {
      // Two routes that compile on first use, one full analysis run and a ZIP.
      test.setTimeout(180 * 1000);
      const run = await request.post('/api/runs/create', {
        headers: headers(),
        data: { projectId: WITH_RUN, legacyCode: SOURCE, analysis: '{"gaps":[]}', uploadedFileName: 'z_trust_chain.abap' },
      });
      expect(run.status(), await run.text()).toBe(200);

      const res = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId: WITH_RUN } });
      expect(res.status(), res.status() === 200 ? '' : await res.text()).toBe(200);
      const body = await res.body();
      expect(body.byteLength, 'the server answered 200 with nothing in it').toBeGreaterThan(1000);

      const zip = await JSZip.loadAsync(body);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      const stored = await storedRun(WITH_RUN);

      // The pack names the run the server chose, not one the client asked for.
      expect(manifest.runId).toBe(stored.runId);
      expect(manifest.projectId).toBe(WITH_RUN);
      expect(manifest.runHash).toBe(stored.run.runHash);
      expect(manifest.signed).toBe(true);

      // The archive is exactly what the manifest says it is, byte for byte.
      const entries = Object.values(zip.files).filter((e) => !e.dir).map((e) => e.name).sort();
      expect(entries).toEqual([...manifest.files.map((f: { path: string }) => f.path), USER_ATTESTED_FILE, 'manifest.json'].sort());
      expect(manifest.files.length).toBeGreaterThan(3);
      for (const f of manifest.files) {
        expect(sha(await zip.file(f.path)!.async('nodebuffer')), `${f.path} does not hash to its record`).toBe(f.sha256);
      }

      // The manifest hash is the shared canonical form — recomputed here rather
      // than read off the manifest, so a route that stopped hashing what it
      // claims to hash cannot pass.
      const canonicalManifest = canonicalAuditManifest({
        files: manifest.files,
        attested: manifest.attested,
        // Bound since manifest format 4 (roadmap 8.5): the handover chain is in the signed string.
        covers: manifest.covers,
        projectId: manifest.projectId,
        runId: manifest.runId,
        runHash: manifest.runHash,
        engineVersion: manifest.engineVersion,
        sapApiCatalogVersion: manifest.sapApiCatalogVersion,
        // Bound since 17.09.2026, so the rebuild has to carry them too.
        version: manifest.version,
        generatedAt: manifest.generatedAt,
      });
      expect(sha(canonicalManifest)).toBe(manifest.manifestHash);

      // And the signature is one the public endpoint accepts. This is the whole
      // claim the trust chain makes to a recipient, and until now nothing ran it.
      const verified = await request.post('/api/export/verify', {
        data: { canonicalManifest, signature: manifest.signature },
      });
      expect(verified.status()).toBe(200);
      const verdict = await verified.json();
      expect(verdict.valid, `the verifier rejected a pack the server just signed: ${JSON.stringify(verdict)}`).toBe(true);
      expect(verdict.manifestHash).toBe(manifest.manifestHash);

      // The same verifier says no to one byte of difference — otherwise "valid:
      // true" above would be a constant rather than an answer.
      const tampered = await request.post('/api/export/verify', {
        data: { canonicalManifest: canonicalManifest + ' ', signature: manifest.signature },
      });
      expect((await tampered.json()).valid).toBe(false);

      // The evidence inside is the run's own: the engine's finding on VBAK, and
      // the decision record pointing back at the same run.
      const csv = await zip.file('03-findings.csv')!.async('string');
      expect(csv).toMatch(/VBAK/i);
      const record = JSON.parse(await zip.file('02-decision-record.json')!.async('string'));
      expect(record.runId).toBe(stored.runId);
      expect(record.projectId).toBe(WITH_RUN);
      expect(record.scores.cleanCoreScore).toBe(stored.run.cleanCoreScore);
    });

    test('a run altered after the fact is refused, not signed over', async ({ request }) => {
      // The signature covers the manifest, and the manifest covers the run
      // hash — so a run edited behind the server's back would come back out as
      // a validly signed pack attesting to the edited content unless the run's
      // own signature is checked first. Only the Admin SDK can do this edit;
      // `firestore.rules` answers `allow write: if false` for the whole runs
      // subcollection, which is a different guarantee and not this one.
      const { runId } = await storedRun(WITH_RUN);
      await adminSetDoc(`projects/${WITH_RUN}/runs`, runId, {
        ...(await db().collection('projects').doc(WITH_RUN).collection('runs').doc(runId).get()).data(),
        cleanCoreScore: 99,
      });

      const res = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId: WITH_RUN } });
      expect(res.status(), 'the altered run was signed over').toBe(409);
      expect((await res.json()).error).toContain('no longer matches its own signature');
    });

    test('the retired signing endpoint answers 410 and points at the server route', async ({ request }) => {
      // It used to sign a hash the client supplied. Reading `'410'` out of the
      // file says the token is in the source; this says the endpoint refuses.
      const res = await request.post('/api/export/sign', {
        headers: headers(),
        data: { fileHash: 'a'.repeat(64), projectId: WITH_RUN },
      });
      expect(res.status()).toBe(410);
      const answer = JSON.stringify(await res.json());
      expect(answer).toContain('/api/audit-pack/create');
      // Whatever it says, it may not carry a signature.
      expect(answer).not.toMatch(/"signature"\s*:\s*"[0-9a-f]{64}"/);
    });

    test.afterAll(async () => {
      test.setTimeout(120 * 1000);
      for (const id of [NO_RUN, WITH_RUN]) {
        await db().collection('projects').doc(id).delete().catch(() => {});
      }
    });

  });

  // ────────────────────────────────────────────────
  // Item #2 — Downstream Page Guards (structural)
  // ────────────────────────────────────────────────

  test.describe('Downstream Page Trust Chain Guards', () => {

    const downstreamPages = [
      'design',
      'transformation',
      'testing',
      'documentation',
      'delivery',
      'tco',
    ];

    for (const page of downstreamPages) {
      test(`${page}/page.tsx imports and calls enforceActiveRun`, async () => {
        const fs = await import('fs');
        const path = await import('path');
        const pagePath = path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', page, 'page.tsx');
        const content = fs.readFileSync(pagePath, 'utf-8');

        expect(content).toContain("import { enforceActiveRun } from '@/lib/run-guard'");
        expect(content).toContain('enforceActiveRun(');
      });
    }

  });

  // ────────────────────────────────────────────────
  // Run Guard module completeness
  // ────────────────────────────────────────────────

  test.describe('Run Guard Module', () => {

    test('run-guard.ts exports hasActiveRun and enforceActiveRun', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const guardPath = path.join(__dirname, '..', 'lib', 'run-guard.ts');
      const content = fs.readFileSync(guardPath, 'utf-8');

      expect(content).toContain('export function hasActiveRun');
      expect(content).toContain('export function enforceActiveRun');
      expect(content).toContain('reason=no-run');
    });

  });

});
