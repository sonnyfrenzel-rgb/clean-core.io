import { test, expect, type APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { USER_ATTESTED_FILE } from '../lib/audit-pack';

/**
 * The route, end to end: what the owner writes into the project never reaches
 * a signed file, and what the narrative claims never reaches the signed run.
 *
 * `tests/audit-pack-signed-input.spec.ts` proves it for the builder; this one
 * proves the route is wired to the builder — a route that went back to handing
 * the generators a merged project/run object would pass the builder's tests
 * and fail here (QA review of ca3264f05f39, 9fdd7c9d8841). Runs against the
 * emulators, through /api/runs/create and /api/audit-pack/create, and reads
 * the archive the way a recipient would.
 */

const SOURCE = 'REPORT z_boundary.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// The narrative a client could post as the model's answer.
const NARRATIVE = JSON.stringify({
  gaps: [{ title: 'Board-approved functional gap', severity: 'High', rationale: 'Chosen by the client', strategy: 'retire', complexity: 'Low' }],
});

// Every statement the owner can write from the browser, each worth forging.
const FORGED = {
  name: 'Approved by the board',
  targetArchitecture: 'retire',
  approvedByArchitect: true,
  approvedBy: 'cto@example.com',
  architectJustifiedOverride: 'Nothing to migrate, decommission.',
  solutionDesign: '{"everything":"fine"}',
  documentation: 'All tests passed.',
  presentation: 'Go-live approved.',
  worklist: [{ id: 'finding-forged', title: 'Every finding resolved', status: 'signed_off', level: 'fully', location: 'nowhere', recommendation: 'none', effort: 'Low', category: 'Finding' }],
};
const NEVER_SIGNED = [
  'Approved by the board',
  'cto@example.com',
  'Nothing to migrate',
  'Go-live approved',
  'All tests passed',
  'Retire / Decommission',
  'Every finding resolved',
  'Board-approved functional gap',
  'Chosen by the client',
];

test.describe('the audit-pack route signs the run and nothing the owner wrote', () => {
  test.describe.configure({ mode: 'serial' });

  const EMAIL = `apk-boundary-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'Boundary123!';
  const PROJECT_ID = `apk-boundary-${Date.now()}`;
  let token = '';
  const headers = () => ({ Authorization: `Bearer ${token}` });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Boundary', lastName: 'Fixture', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Boundary fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE,
    });
  });

  async function openPack(request: APIRequestContext) {
    const res = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId: PROJECT_ID } });
    expect(res.status(), res.status() === 200 ? '' : await res.text()).toBe(200);
    const zip = await JSZip.loadAsync(await res.body());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    return { zip, manifest };
  }

  test('the forged statements reach the attested file and no signed file; the narrative reaches no signed file', async ({ request }) => {
    const run = await request.post('/api/runs/create', {
      headers: headers(),
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, analysis: NARRATIVE, uploadedFileName: 'z_boundary.abap' },
    });
    expect(run.status(), await run.text()).toBe(200);
    // Written after the run, the way the design stage would — and the way a
    // direct Firestore write from the owner's session could.
    await adminMergeDoc('projects', PROJECT_ID, { ...FORGED, architectSignOffAt: new Date().toISOString() });

    const { zip, manifest } = await openPack(request);

    // The archive is exactly what the manifest says: the signed files, the one
    // attested file, the manifest.
    const entries = Object.values(zip.files).filter((e) => !e.dir).map((e) => e.name).sort();
    expect(manifest.attested).toEqual([{ path: USER_ATTESTED_FILE, provenance: 'user-attested' }]);
    expect(entries).toEqual([...manifest.files.map((f: { path: string }) => f.path), USER_ATTESTED_FILE, 'manifest.json'].sort());

    // The manifest hash is the shared canonical form, over the signed files and the attested name.
    const canonical = canonicalAuditManifest({
      files: manifest.files,
      attested: manifest.attested,
      projectId: manifest.projectId,
      runId: manifest.runId,
      runHash: manifest.runHash,
      engineVersion: manifest.engineVersion,
      sapApiCatalogVersion: manifest.sapApiCatalogVersion,
    });
    expect(sha(canonical)).toBe(manifest.manifestHash);
    expect(manifest.signed).toBe(true);
    for (const f of manifest.files) {
      expect(sha(await zip.file(f.path)!.async('nodebuffer')), `${f.path} does not hash to its record`).toBe(f.sha256);
    }

    // Not one forged value, not one narrative gap, in anything the signature covers.
    const signed = await Promise.all(manifest.files.map((f: { path: string }) => zip.file(f.path)!.async('string')));
    const signedText = signed.join('\n');
    for (const needle of NEVER_SIGNED) expect(signedText, `"${needle}" reached a signed file`).not.toContain(needle);

    // The engine's own evidence is there — the finding on VBAK from the run —
    // and the run's worklist is the one in the ADR: nothing "fully mapped",
    // because the run's items are open and the project's signed-off list was
    // never read.
    expect(await zip.file('03-findings.csv')!.async('string')).toMatch(/VBAK/i);
    const adr = await zip.file('06-architecture-decision-record.md')!.async('string');
    expect(adr).toContain('Transformed / fully mapped — 0');
    expect(adr).toContain(USER_ATTESTED_FILE);

    // The owner's statements are in the attested file, labelled as such.
    const attested = await zip.file(USER_ATTESTED_FILE)!.async('string');
    expect(attested).toContain('not covered by the pack');
    for (const needle of ['Approved by the board', 'cto@example.com', 'Retire / Decommission', 'Nothing to migrate']) expect(attested).toContain(needle);
    expect(attested).toContain('overrides the engine');
  });

  test('changing the owner\'s statements again changes the attested file and not one signed byte', async ({ request }) => {
    const before = await openPack(request);
    await adminMergeDoc('projects', PROJECT_ID, { approvedBy: 'someone-else@example.com', targetArchitecture: 'cap', architectJustifiedOverride: 'Second thoughts.' });
    const after = await openPack(request);

    // Generation time differs; nothing else may.
    const stable = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<ts>');
    for (const f of before.manifest.files) {
      const a = stable(await before.zip.file(f.path)!.async('string'));
      const b = stable(await after.zip.file(f.path)!.async('string'));
      expect(b, `${f.path} moved with an owner statement`).toBe(a);
    }
    const attested = await after.zip.file(USER_ATTESTED_FILE)!.async('string');
    expect(attested).toContain('someone-else@example.com');
    expect(attested).toContain('Side-by-Side BTP (CAP)');
    expect(attested).not.toContain('cto@example.com');
  });
});
