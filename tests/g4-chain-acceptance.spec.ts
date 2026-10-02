/**
 * G4 / DW-2 — the proven handover: four complete paths through the chain, each
 * with negative probes (docs/ROADMAP.md §4 "Acceptance order before 3.0" and
 * §15 G4; docs/release/3.0-acceptance.md rows DW-2 and G4; Codex synthesis of
 * 02.10.2026, open question 2). Protocol: docs/release/g4-chain-acceptance.md.
 *
 *   1. Standard adoption   — CC-001, a KNA1 list report with a released successor.
 *   2. Targeted extension  — CC-031, a custom-table write plus an RFC: routed
 *                            Side-by-Side, CAP package generated, run in the
 *                            emulator build's sandbox runner, receipt recorded.
 *   3. Retirement          — CC-047, a logical-database report with a measured
 *                            zero over a 13-month window.
 *   4. Undecidable         — CC-021, the deciding logic sits in an INCLUDE that
 *                            was not supplied; nobody can choose an option.
 *
 * What runs is the product: `/api/runs/create` signs the run, the commands
 * route records the sign-off and the decision, `/api/projects/{id}/contract`
 * stores the generation, `/api/run-tests` executes it, `/api/audit-pack/create`
 * seals the pack, and `lib/audit-pack-verify.ts` plus `scripts/verify-pack.mjs`
 * check it. The handover is read with the functions the Delivery page draws
 * from (`lib/handover.ts`, `lib/workflow-steps.ts`) over the project as the
 * page hydrates it, and the Delivery page itself is opened in a browser.
 *
 * What does not run is a model. The three texts a model writes on the way —
 * the design document, the generated package and the test scenarios — are
 * fixtures written where the browser writes the model's answer (the design and
 * the scenarios by the owner's own Firestore client, the package through the
 * server's generation store with its token). No request in this file reaches
 * `/api/gemini`, and the server under test is started with every model and mail
 * key blank. A fixture standing in for the model's words changes nothing the
 * chain asserts: the chain is about who signed, confirmed, ran and sealed what.
 *
 * Needs the Firebase emulators (:9099, :8080) and an emulator build of the app
 * (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`): the test runner's local path only
 * exists there (`resolveRunnerTarget`), which is exactly the "mock runner" this
 * acceptance is about.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, updateDoc, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { signInThroughForm } from './helpers/seed-project';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTermsSha256 } from '../lib/terms-versions';
import { hydrateProject } from '../lib/project-loader';
import { workflowSteps, handoverBlockers } from '../lib/workflow-steps';
import {
  buildHandoverChain,
  handoverStatusLine,
  handoverStillNeeded,
  handoverGroups,
  handoverFacets,
  storedDecisionOf,
  decisionIsCurrent,
  isoOf,
  type HandoverProject,
  type HandoverLinkKey,
} from '../lib/handover';
import { coveringTestRunReceipt } from '../lib/test-receipt';
import { verifyRunIntegrity } from '../lib/run-signature';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import { USER_ATTESTED_FILE } from '../lib/audit-pack';
import { joinUsageWithEvidence, QUADRANT_META } from '../lib/abap/usage-join';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import type { UsageReport } from '../lib/abap/usage-model';
import type { ProjectDecision } from '../lib/project-decision';
import type { Project } from '../lib/types';

/* ------------------------------------------------------------ the corpus */

const CASES = {
  adoption: 'CC-001',
  extension: 'CC-031',
  retirement: 'CC-047',
  undecidable: 'CC-021',
} as const;

const caseSource = (id: string) => fs.readFileSync(path.join(__dirname, 'korpus', 'cases', id, 'source.abap'), 'utf8');

/* ------------------------------------------------------------ the emulators */

/**
 * Server-side seeding and read-back through the app's own test seed route
 * (`app/api/test/seed`, three gates: no Cloud Run, emulator build, the test
 * secret), against the base URL of this run — so the spec follows the server it
 * is pointed at, as `scripts/release/acceptance.mjs --base-url` points it.
 * The Admin SDK in the test process was tried first and lost its gRPC channel
 * to the emulator after a worker restart ("Waiting for LB pick").
 */
async function seed(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const baseURL = (test.info().project.use as { baseURL?: string }).baseURL;
  if (!baseURL) throw new Error('no baseURL: this suite runs against a local server on the emulators only');
  const res = await fetch(`${baseURL}/api/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-seed-token': process.env.PILOT_APPROVAL_SECRET || '' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`seed ${String(body.action)} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}
const seedSet = (collectionPath: string, docId: string, data: Record<string, unknown>) => seed({ action: 'setDoc', collectionPath, docId, data });
const seedMerge = (collectionPath: string, docId: string, data: Record<string, unknown>) => seed({ action: 'mergeDoc', collectionPath, docId, data });
async function readBack(collectionPath: string, docId: string): Promise<Record<string, unknown> | null> {
  return ((await seed({ action: 'getDoc', collectionPath, docId })).data as Record<string, unknown> | null) ?? null;
}

interface Account {
  uid: string;
  email: string;
  password: string;
  token: () => Promise<string>;
  /** The account's own Firestore client — what its browser writes with, rules and all. */
  db: Firestore;
}

/** A fresh account with an approved profile and the current Terms accepted, the way `recordConsent` stores them. */
async function makeAccount(tag: string): Promise<Account> {
  const app = initializeApp(firebaseConfig, `g4-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const auth = connectAuthToEmulator(getAuth(app));
  const db = connectFirestoreToEmulator(initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId));
  const email = disposableEmail(`g4-${tag}`);
  const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
  const uid = cred.user.uid;
  const acceptedAt = new Date();
  await seedSet('consent_events', `g4-consent-${uid}`, {
    uid, userId: uid, email,
    termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION,
    contentSha256: archivedTermsSha256(TERMS_VERSION),
    locale: null, source: 'api/consent', createdAt: acceptedAt,
  });
  await seedSet('users', uid, {
    firstName: 'G4', lastName: tag, email, tier: 'pilot', status: 'approved', activatedAt: acceptedAt,
    transformationsUsed: 0, transformationsLimit: 50, mfaEnabled: false, createdAt: acceptedAt,
    termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: acceptedAt,
  });
  return { uid, email, password: EMULATOR_PASSWORD, token: () => cred.user.getIdToken(), db };
}

/** An empty project as the dashboard creates one: a name, an owner, a source staged, a deployment target. */
async function makeProject(owner: Account, tag: string, source: string): Promise<string> {
  const id = `g4-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await seedSet('projects', id, {
    name: `G4 ${tag}`, userId: owner.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: source, s4Deployment: 'private',
  });
  return id;
}

/** The fields this suite reads back; everything else stays `unknown`. */
type StoredProject = Record<string, unknown> & {
  activeRunId?: unknown;
  auditMetadata?: { auditPackExportedRunId?: string; auditPackExportedAt?: string };
  generationBinding?: { contractFingerprint?: string };
  decision?: { status?: string };
};
type StoredRun = Record<string, unknown> & { runHash?: string; cleanCoreScore?: number };

async function stored(projectId: string) {
  const project = ((await readBack('projects', projectId)) ?? {}) as StoredProject;
  const runId = typeof project.activeRunId === 'string' ? project.activeRunId : '';
  const run = runId ? ((await readBack(`projects/${projectId}/runs`, runId)) as StoredRun | null) : null;
  return { project, runId, run };
}

/** The handover as the Delivery page computes it: the project hydrated with its run, then the page's own functions. */
async function handover(projectId: string) {
  const { project, runId, run } = await stored(projectId);
  const hydrated = hydrateProject(projectId, project as unknown as Project, run ? { kind: 'found', data: run } : null) as HandoverProject;
  const phases = workflowSteps(hydrated);
  const chain = buildHandoverChain(hydrated, phases);
  const blockers = handoverBlockers(hydrated);
  const state = { blockers, exportedAt: isoOf(hydrated.auditMetadata?.auditPackExportedAt) };
  const link = (k: HandoverLinkKey) => chain.find((l) => l.key === k)!;
  return {
    project, run, runId, hydrated, phases, chain, blockers, link,
    phase: (k: string) => phases.find((p) => p.key === k)!,
    status: (k: string) => handoverStatusLine(hydrated, chain).find((s) => s.key === k)!,
    stillNeeded: handoverStillNeeded(hydrated, chain, state).map((n) => n.key),
    groups: handoverGroups(hydrated, chain, state),
    facets: handoverFacets(hydrated, phases, chain, state),
    decision: storedDecisionOf(hydrated),
  };
}

/* ------------------------------------------------------------ the routes */

function api(request: APIRequestContext, account: Account) {
  const headers = async () => ({ Authorization: `Bearer ${await account.token()}`, 'Content-Type': 'application/json' });
  return {
    run: async (projectId: string, legacyCode: string) =>
      request.post('/api/runs/create', {
        headers: await headers(),
        // No narrative: no model took part, and the run says so (`modelParticipation: 'none'`).
        data: { projectId, legacyCode, analysis: '', uploadedFileName: 'source.abap' },
      }),
    decision: async (projectId: string) => request.get(`/api/projects/${projectId}/decision`, { headers: await headers() }),
    command: async (projectId: string, body: Record<string, unknown>) =>
      request.post(`/api/projects/${projectId}/commands`, { headers: await headers(), data: body }),
    contract: async (projectId: string) => request.get(`/api/projects/${projectId}/contract`, { headers: await headers() }),
    storeGeneration: async (projectId: string, body: Record<string, unknown>) =>
      request.post(`/api/projects/${projectId}/contract`, { headers: await headers(), data: body }),
    runTests: async (projectId: string) => request.post('/api/run-tests', { headers: await headers(), data: { projectId } }),
    standardFit: async (projectId: string) => request.get(`/api/projects/${projectId}/standard-fit`, { headers: await headers() }),
    pack: async (projectId: string) => request.post('/api/audit-pack/create', { headers: await headers(), data: { projectId } }),
    revokeReader: async (projectId: string, uid: string) =>
      request.delete(`/api/projects/${projectId}/readers`, { headers: await headers(), data: { uid } }),
  };
}

type Api = ReturnType<typeof api>;

interface DecisionRead {
  draft: ProjectDecision;
  stored: (ProjectDecision & { status: string }) | null;
  unchanged: boolean;
  runId: string | null;
  evidenceDigest: string | null;
  canDecide: boolean;
}

async function readDecision(a: Api, projectId: string): Promise<DecisionRead> {
  const res = await a.decision(projectId);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as DecisionRead;
}

/** The sign-off as the Design stage sends it: bound to the run and the evidence the page read (roadmap 8.8). */
async function signOff(a: Api, projectId: string, targetArchitecture: string, justification = '') {
  const read = await readDecision(a, projectId);
  return a.command(projectId, {
    command: 'approve-architecture', targetArchitecture, justification,
    expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
  });
}

/** Draft and confirm as the decision card does: the draft the server derived, echoed back with its fingerprint. */
async function draftAndConfirm(a: Api, projectId: string) {
  const read = await readDecision(a, projectId);
  const drafted = await a.command(projectId, { command: 'record-decision-draft', decision: read.draft });
  expect(drafted.status(), await drafted.text()).toBe(200);
  const confirmed = await a.command(projectId, {
    command: 'confirm-decision',
    expectedRunId: read.runId,
    expectedEvidenceDigest: read.evidenceDigest,
    expectedDecisionFingerprint: read.draft.fingerprint,
  });
  return { read, confirmed };
}

/**
 * Finding G4-F1 (docs/release/g4-chain-acceptance.md), closed 02.10.2026. A
 * sign-off of `retire` — the only option the product offers for a standard
 * adoption as well as for a retirement — takes the project off both generation
 * tracks, so `contractOfProject` answers `off-track` and no architecture
 * contract exists. The decision no longer needs one: an option that generates
 * nothing binds, in its `contract` slot, the sign-off it rests on
 * (`none-required:retire/sign-off@…`), next to the run; a sign-off that is not
 * current blocks it (`sign-off-not-current`). Until then these two
 * confirmations were marked as expected failures.
 */
async function confirmRetire(a: Api, projectId: string, account: Account) {
  const read = await readDecision(a, projectId);
  const contract = read.draft.bindings.find((b) => b.key === 'contract');
  expect(contract?.revision, 'Retire binds the sign-off, not a contract').toMatch(/^none-required:retire\/sign-off@/);
  expect(contract?.note).toContain('No architecture contract is required');
  expect(read.draft.boundRunId).toBe(read.runId);
  const confirmed = await a.command(projectId, {
    command: 'confirm-decision', expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
    expectedDecisionFingerprint: read.draft.fingerprint,
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);
  const after = await handover(projectId);
  expect(after.decision?.status).toBe('confirmed');
  expect(after.decision?.confirmation?.account).toBe(account.email);
  expect(after.decision?.boundRunId).toBe(read.runId);
  return read;
}

/* ------------------------------------------------------------ analysis */

/** Stage 1 through the real route, and what makes it a signed run: the stored run verifies against its own HMAC. */
async function analyse(a: Api, projectId: string, source: string) {
  const res = await a.run(projectId, source);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { runId: string; runHash: string; modelParticipation: string };
  expect(body.modelParticipation, 'no model took part in this run').toBe('none');
  const { project, runId, run } = await stored(projectId);
  expect(runId).toBe(body.runId);
  expect(run?.runHash).toBe(body.runHash);
  const integrity = verifyRunIntegrity(run as Record<string, unknown>, process.env.AUDIT_SIGNING_KEY || '');
  expect(integrity.valid, `the stored run does not verify: ${JSON.stringify(integrity)}`).toBe(true);
  return { runId, run: run as Record<string, unknown>, project };
}

/* ------------------------------------------------------------ the pack */

async function fetchPack(a: Api, projectId: string) {
  const res = await a.pack(projectId);
  expect(res.status(), res.status() === 200 ? '' : await res.text()).toBe(200);
  const body = await res.body();
  const zip = await JSZip.loadAsync(body);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  return { body, zip, manifest };
}

/**
 * The production verifier (`lib/audit-pack-verify.ts`, what /verify runs), with
 * its HMAC question sent to this server and its Ed25519 key read from this
 * server's published key document — the pattern of `audit-pack-route-boundary`.
 */
async function verifyHere(body: Buffer, baseURL: string) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(typeof input === 'string' && input.startsWith('/') ? `${baseURL}${input}` : input, init)) as typeof fetch;
  try {
    return await verifyAuditPack(body, {
      fetchKeyDocument: async () => {
        const res = await realFetch(`${baseURL}/.well-known/clean-core-io-signing.json`);
        if (!res.ok) throw new Error(`the key document answered HTTP ${res.status}`);
        return res.json();
      },
    });
  } finally {
    globalThis.fetch = realFetch;
  }
}

/**
 * The offline verifier a recipient runs: `node scripts/verify-pack.mjs`, with
 * the key this instance publishes passed in, so nothing reaches clean-core.io.
 * Exit 0 verified · 1 failed · 2 could not check (a pack without an Ed25519
 * signature can only be checked by its issuer).
 */
async function verifyOffline(body: Buffer, file: string, baseURL: string): Promise<{ code: number; out: string }> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  const res = await fetch(`${baseURL}/.well-known/clean-core-io-signing.json`);
  const doc = res.ok ? ((await res.json()) as { keys?: Array<{ publicKey?: string; status?: string }> }) : { keys: [] };
  const key = doc.keys?.find((k) => k.status === 'active')?.publicKey ?? doc.keys?.[0]?.publicKey ?? '';
  const args = [path.join(__dirname, '..', 'scripts', 'verify-pack.mjs'), file, ...(key ? ['--key', key] : [])];
  try {
    const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** One byte of a signed evidence file changed after sealing — what a recipient must be told is not the pack. */
async function tamper(zip: JSZip): Promise<Buffer> {
  const copy = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  const csv = await copy.file('03-findings.csv')!.async('string');
  copy.file('03-findings.csv', `${csv}\n"forged","row"`);
  return copy.generateAsync({ type: 'nodebuffer' });
}

/**
 * The pack is the handover's sealed half: it is authentic, it names the active
 * run and its hash, and both verifiers refuse it once one signed byte changes.
 * Returns the manifest for path-specific checks.
 */
async function sealAndVerify(a: Api, projectId: string, baseURL: string, outDir: string) {
  const { body, zip, manifest } = await fetchPack(a, projectId);
  const { project, runId, run } = await stored(projectId);
  expect(manifest.runId, 'the pack names the active run').toBe(runId);
  expect(manifest.runHash).toBe(run?.runHash);
  expect(manifest.projectId).toBe(projectId);
  expect(project.auditMetadata?.auditPackExportedRunId, 'the export is recorded against the run it sealed').toBe(runId);

  const verdict = await verifyHere(body, baseURL);
  expect(verdict.integrityValid, verdict.errors.join(' | ')).toBe(true);
  expect(verdict.signatureValid, verdict.errors.join(' | ')).toBe(true);
  expect(verdict.status).toBe('authentic');
  expect(verdict.success, verdict.errors.join(' | ')).toBe(true);
  // The pack says out loud which links of the chain its signature does not cover.
  expect(verdict.covers?.map((c) => c.step)).toEqual(['requirement', 'decision', 'receipt', 'delivery']);

  const offline = await verifyOffline(body, path.join(outDir, `${projectId}.zip`), baseURL);
  if (manifest.signatureEd25519) {
    expect(offline.code, offline.out).toBe(0);
  } else {
    // Only the HMAC: the offline script cannot vouch for the issuer and says so.
    expect(offline.code, offline.out).toBe(2);
    test.info().annotations.push({ type: 'offline-verify', description: `${projectId}: server has no Ed25519 key — verify-pack exit 2 (HMAC only), checked online instead` });
  }

  // Negative probe: one appended row in a signed file.
  const forged = await tamper(zip);
  const forgedVerdict = await verifyHere(forged, baseURL);
  expect(forgedVerdict.status, 'a tampered pack verified').toBe('failed');
  expect(forgedVerdict.errors.join(' ')).toContain('03-findings.csv');
  const forgedOffline = await verifyOffline(forged, path.join(outDir, `${projectId}-tampered.zip`), baseURL);
  expect(forgedOffline.code, forgedOffline.out).toBe(1);

  const attested = await zip.file(USER_ATTESTED_FILE)!.async('string');
  return { manifest, zip, attested, runId };
}

/* ------------------------------------------------------------ the page */

async function openDelivery(page: Page, account: Account, projectId: string) {
  await signInThroughForm(page, account);
  await page.goto(`/project/${projectId}/delivery`);
  await expect(page.locator('[data-delivery-status-item="decision"]')).toBeVisible({ timeout: 90_000 });
}

/* ------------------------------------------------------------ model fixtures */

/** Stands in for the design document a model writes on the Design stage. */
const designFixture = (what: string) =>
  `# Target architecture\n\n${what}\n\n## Sign-off\n\nTo be confirmed by the account holder.\n\n> Fixture for tests/g4-chain-acceptance.spec.ts — no model wrote this.\n`;

/** Stands in for the model's CAP package for CC-031 (BTP track: .ts, .cds, package.json, Dockerfile, ERP-side publisher). */
const CAP_FILES: Array<{ path: string; content: string }> = [
  {
    path: 'srv/decision-service.ts',
    content: [
      '// Side-by-side rebuild of ZCC_REF_031: record the route of a case, notify, commit or roll back.',
      'export interface DecisionTx { update(caseId: string, route: string): boolean; commit(): void; rollback(): void }',
      "export type Outcome = 'RECORDED' | 'MISSING_CASE' | 'NOTIFY_FAILED';",
      'export function recordDecision(tx: DecisionTx, notify: (caseId: string) => void, caseId: string, route: string): Outcome {',
      "  if (!tx.update(caseId, route)) return 'MISSING_CASE';",
      '  try {',
      '    notify(caseId);',
      '  } catch {',
      '    tx.rollback();',
      "    return 'NOTIFY_FAILED';",
      '  }',
      '  tx.commit();',
      "  return 'RECORDED';",
      '}',
      '',
    ].join('\n'),
  },
  { path: 'db/schema.cds', content: 'namespace zcc;\nentity Decision { key caseId : String(10); route : String(20); }\n' },
  { path: 'package.json', content: '{\n  "name": "zcc-decision-service",\n  "version": "0.0.1",\n  "private": true\n}\n' },
  { path: 'Dockerfile', content: 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "srv/decision-service.js"]\n' },
  { path: 'erp/zcl_cc_decision_event.clas.abap', content: 'CLASS zcl_cc_decision_event DEFINITION PUBLIC FINAL CREATE PUBLIC.\nENDCLASS.\nCLASS zcl_cc_decision_event IMPLEMENTATION.\nENDCLASS.\n' },
];

/** Stands in for the model's test suite: node:test, named by case id so the runner's verdicts map onto the cases. */
const CAP_SUITE = {
  config: '// node:test needs no configuration file; the sandbox runs this spec as it is.\n',
  spec: [
    "import { test } from 'node:test';",
    "import assert from 'node:assert';",
    "import { recordDecision, type DecisionTx } from './srv/decision-service';",
    'function store(found: boolean) {',
    '  const log: string[] = [];',
    "  const tx: DecisionTx = {",
    "    update: () => { log.push('update'); return found; },",
    "    commit: () => { log.push('commit'); },",
    "    rollback: () => { log.push('rollback'); },",
    '  };',
    '  return { tx, log };',
    '}',
    "test('TC_01: records the route and notifies', () => {",
    '  const { tx, log } = store(true);',
    '  const notified: string[] = [];',
    "  assert.strictEqual(recordDecision(tx, (id) => { notified.push(id); }, 'C1', 'AUTO'), 'RECORDED');",
    "  assert.deepStrictEqual(notified, ['C1']);",
    "  assert.deepStrictEqual(log, ['update', 'commit']);",
    '});',
    "test('TC_02: a missing case is reported and nobody is notified', () => {",
    '  const { tx, log } = store(false);',
    '  let notified = false;',
    "  assert.strictEqual(recordDecision(tx, () => { notified = true; }, 'C2', 'AUTO'), 'MISSING_CASE');",
    '  assert.strictEqual(notified, false);',
    "  assert.deepStrictEqual(log, ['update']);",
    '});',
    "test('TC_03: a failed notification rolls the update back', () => {",
    '  const { tx, log } = store(true);',
    "  assert.strictEqual(recordDecision(tx, () => { throw new Error('communication_failure'); }, 'C3', 'AUTO'), 'NOTIFY_FAILED');",
    "  assert.deepStrictEqual(log, ['update', 'rollback']);",
    '});',
    '',
  ].join('\n'),
};

/** Stands in for the scenarios a model writes on the Testing stage ("Generate scenarios"). */
const CAP_CASES = [
  { id: 'TC_01', name: 'records the route and notifies', category: 'Unit', priority: 'High', description: 'Happy path of ZCC_REF_031', status: 'Pending', message: '' },
  { id: 'TC_02', name: 'a missing case is reported and nobody is notified', category: 'Unit', priority: 'High', description: 'sy-subrc <> 0 after UPDATE', status: 'Pending', message: '' },
  { id: 'TC_03', name: 'a failed notification rolls the update back', category: 'Unit', priority: 'High', description: 'RFC exception → ROLLBACK WORK', status: 'Pending', message: '' },
];

/* =================================================================== path 1 */

test.describe('G4 path 1 — standard adoption (CC-001: KNA1 list → SAP standard / released successor)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  const source = caseSource(CASES.adoption);
  let owner: Account;
  let stranger: Account;
  let projectId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owner = await makeAccount('adopt-owner');
    stranger = await makeAccount('adopt-stranger');
    projectId = await makeProject(owner, 'adopt', source);
  });

  test('analyze: a signed run, routed by the engine, with the standard successor as a candidate only', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const { run } = await analyse(a, projectId, source);
    expect(run.extensibilityRoute).toBe('In-App (ABAP Cloud)');
    expect(JSON.stringify(run.evidenceReport)).toContain('KNA1');

    // The architecture contract names the released successor of KNA1 from the
    // catalogue and leaves "cover it with SAP standard" open as an alternative —
    // an option for the account, not a fit the engine claims.
    const contract = await a.contract(projectId);
    expect(contract.status(), await contract.text()).toBe(200);
    const { contract: c } = (await contract.json()) as { contract: { route: { recommended: string }; fields: Array<{ key: string; statement: string | null }> } };
    expect(c.route.recommended).toBe('in-app-rap');
    expect(c.fields.find((f) => f.key === 'apis')?.statement).toContain('KNA1 → API_BUSINESS_PARTNER');
    expect(c.fields.find((f) => f.key === 'rejected-alternatives')?.statement).toContain('Cover the requirement with SAP standard');

    // G3, "no standard fit from a legacy construct": the standard-fit layer
    // claims no fit. For this case it holds no row at all — the report carries
    // no business rule for a capability to be read from — and says nothing
    // rather than something.
    const res = await a.standardFit(projectId);
    expect(res.status(), await res.text()).toBe(200);
    const { view } = (await res.json()) as { view: { rows: Array<{ fit: string | null }>; catalogConsulted: boolean } };
    test.info().annotations.push({ type: 'standard-fit', description: `CC-001: ${view.rows.length} capability rows, catalogue consulted: ${view.catalogConsulted}` });
    expect(view.rows.every((r) => r.fit === null), 'a catalogue hit was turned into a standard fit').toBe(true);

    // Nothing is decided yet, and the handover says so.
    const h = await handover(projectId);
    expect(h.link('run').provenance).toBe('proven');
    expect(h.link('decision').state).toBe('open');
    expect(h.status('decision').value).toBe('not confirmed');
  });

  test('design: the account adopts the standard — a departure from the engine route needs its reason; wrong evidence is refused', async ({ request }) => {
    const a = api(request, owner);
    await updateDoc(doc(owner.db, 'projects', projectId), {
      solutionDesign: designFixture('Retire ZCC_REF_001 in favour of the SAP standard customer list; the catalogue names API_BUSINESS_PARTNER as the released successor of KNA1.'),
    });

    // Negative probe — a sign-off read from evidence that is not the run's
    // (the run's digest with one fact changed: the finding count).
    const read = await readDecision(a, projectId);
    const wrong = String(read.evidenceDigest).replace(/findings=\d+/, 'findings=99');
    expect(wrong).not.toBe(read.evidenceDigest);
    const refused = await a.command(projectId, {
      command: 'approve-architecture', targetArchitecture: 'retire', justification: 'x',
      expectedRunId: read.runId, expectedEvidenceDigest: wrong,
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe('evidence-moved');

    // Negative probe — "retire in favour of the standard" departs from the
    // engine's In-App route, and a departure without a reason is refused.
    const bare = await signOff(a, projectId, 'retire');
    expect(bare.status()).toBe(400);
    expect((await bare.json()).code).toBe('override-needs-reason');
    expect((await stored(projectId)).project.approvedByArchitect, 'a refused sign-off wrote something').not.toBe(true);

    // Negative probe — another account cannot sign off on this project, even
    // naming the right run and evidence; it is told what a missing project is told.
    const foreign = await api(request, stranger).command(projectId, {
      command: 'approve-architecture', targetArchitecture: 'retire', justification: 'x',
      expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
    });
    expect(foreign.status()).toBe(404);
    expect((await stored(projectId)).project.approvedByArchitect).not.toBe(true);

    // The account's sign-off: retire the custom report, the standard covers it.
    // The product has no "adopt the standard" target; "Retire (Standard
    // Replacement / Deprecation)" is the option the Design stage offers for it.
    const ok = await signOff(a, projectId,
      'retire',
      'SAP standard covers the need: the customer list is a standard app, and the catalogue names API_BUSINESS_PARTNER as the released successor of KNA1.',
    );
    expect(ok.status(), await ok.text()).toBe(200);
    const h = await handover(projectId);
    expect(h.link('design').provenance).toBe('confirmed');
    expect(h.link('design').by).toBe(owner.email);
  });

  test('decision: drafted from the sign-off; nobody else can read or confirm it; cost stays not determined', async ({ request }) => {
    const a = api(request, owner);
    const s = api(request, stranger);
    const strangerRead = await s.decision(projectId);
    expect(strangerRead.status(), 'a stranger read the decision of a project not shared with them').toBe(404);

    const read = await readDecision(a, projectId);
    expect(read.draft.summary).toBe('Retire this object, as the signed-off target architecture says.');
    const drafted = await a.command(projectId, { command: 'record-decision-draft', decision: read.draft });
    expect(drafted.status(), await drafted.text()).toBe(200);
    const strangerConfirm = await s.command(projectId, {
      command: 'confirm-decision', expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
      expectedDecisionFingerprint: read.draft.fingerprint,
    });
    expect(strangerConfirm.status()).toBe(404);

    const h = await handover(projectId);
    expect(h.decision?.status).toBe('draft');
    expect(h.decision?.boundRunId).toBe(h.runId);
    // Economics: the decision binds no cost revision — 7.4's comparison is not stored.
    const cost = h.decision?.bindings.find((b) => b.key === 'cost');
    expect(cost?.revision).toBeNull();
    expect(cost?.notDeterminedReason).toBeTruthy();
    expect(h.link('economics').provenance).toBe('not-determined');
  });

  test('decision: the account confirms the standard adoption — no contract is required; it rests on the run and the sign-off (G4-F1)', async ({ request }) => {
    await confirmRetire(api(request, owner), projectId, owner);
  });

  test('delivery: the pack is sealed against the current run and verifies; the handover names run, sign-off and the confirmed decision', async ({ request, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const a = api(request, owner);
    const { attested, runId } = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(attested).toContain('Retire');
    expect(attested).toContain(owner.email);
    expect(attested).toContain('given (self-attested)');

    const h = await handover(projectId);
    expect(h.link('run').value).toContain(runId.slice(0, 12));
    expect(h.link('design').provenance).toBe('confirmed');
    // What the decision binds instead of a contract, said as such.
    expect(h.link('design').missing).toContain('No architecture contract is required');
    const decisionLink = h.link('decision');
    expect(decisionLink.state).toBe('on-record');
    expect(decisionLink.value).toContain('DEC-1 · revision 1');
    expect(decisionLink.provenance).toBe('confirmed');
    expect(h.decision?.boundRunId).toBe(runId);
    expect(h.status('decision').value).toBe('confirmed');
    expect(h.stillNeeded).not.toContain('decision');
    // A standard adoption generates nothing and tests nothing, and the handover says so rather than filling it in.
    expect(h.link('transformation').state).toBe('open');
    expect(h.link('tests').state).toBe('open');
    expect(h.groups.find((g) => g.key === 'delivery')?.sub).toBe('Audit pack sealed and downloaded.');
  });

  test('delivery page: the rendered handover shows the sign-off and the confirmed decision', async ({ page }) => {
    test.setTimeout(240_000);
    await openDelivery(page, owner, projectId);
    await expect(page.locator('[data-delivery-status-item="decision"]')).toContainText('confirmed');
    await expect(page.locator('[data-delivery-status-item="decision"]')).not.toContainText('not confirmed');
    await expect(page.locator('[data-still-needed-item="decision"]')).toHaveCount(0);
    await expect(page.locator('[data-delivery-status-item="run"]')).toContainText('signed');
  });

  test('probe: after the source changes, the Retire sign-off is not current and a new decision on it is refused', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const changed = `${source}* G4 probe: the source changed after the sign-off.\n`;
    await analyse(a, projectId, changed);

    // The confirmed decision of the old source is history; a new one may be drafted only after a withdrawal …
    const withdrawn = await a.command(projectId, { command: 'withdraw-decision' });
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
    const read = await readDecision(a, projectId);
    expect(read.draft.bindings.find((b) => b.key === 'contract')?.revision).toMatch(/^not-current:none-required:retire\//);
    // … and it rests on a sign-off given for the previous source, so it cannot be confirmed.
    const { confirmed } = await draftAndConfirm(a, projectId);
    expect(confirmed.status()).toBe(409);
    const body = (await confirmed.json()) as { code: string; error: string };
    expect(body.code).toBe('decision-blocked');
    expect(body.error).toContain('It was given for a previous source');
    expect((await stored(projectId)).project.decision?.status).toBe('draft');
  });
});

/* =================================================================== path 2 */

test.describe('G4 path 2 — targeted extension (CC-031: side-by-side CAP, sandbox run, receipt)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  const source = caseSource(CASES.extension);
  let owner: Account;
  let stranger: Account;
  let projectId = '';
  let firstRunId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owner = await makeAccount('ext-owner');
    stranger = await makeAccount('ext-stranger');
    projectId = await makeProject(owner, 'ext', source);
  });

  test('analyze: the engine routes the custom-table write plus RFC side-by-side, and the contract says CAP', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const { run, runId } = await analyse(a, projectId, source);
    firstRunId = runId;
    expect(run.extensibilityRoute).toBe('Side-by-Side (SAP BTP)');
    const contract = await a.contract(projectId);
    expect(contract.status(), await contract.text()).toBe(200);
    const body = (await contract.json()) as { contract: { route: { recommended: string } } };
    expect(body.contract.route.recommended).toBe('side-by-side-cap');
  });

  test('design: the CAP target is signed off without a departure; a sign-off on another run is refused', async ({ request }) => {
    const a = api(request, owner);
    await updateDoc(doc(owner.db, 'projects', projectId), {
      solutionDesign: designFixture('A CAP service on the SAP Business AI Platform records the route of a case and notifies; the ERP side publishes an event.'),
    });
    const read = await readDecision(a, projectId);
    const otherRun = await a.command(projectId, {
      command: 'approve-architecture', targetArchitecture: 'cap', justification: '',
      expectedRunId: 'a-run-nobody-read', expectedEvidenceDigest: read.evidenceDigest,
    });
    expect(otherRun.status()).toBe(409);
    expect((await otherRun.json()).code).toBe('run-moved');

    const ok = await signOff(a, projectId, 'cap');
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).recommendationBasis).toBe('contract');
  });

  test('transformation: the generation is stored against the contract; an incomplete package and a stale token are refused', async ({ request }) => {
    const a = api(request, owner);
    const read = await a.contract(projectId);
    expect(read.status(), await read.text()).toBe(200);
    const { contract, generation } = (await read.json()) as { contract: { fingerprint: string }; generation: { token: string } };

    // Negative probe — faulty generation: the package the model was asked for, without its Dockerfile.
    const incomplete = await a.storeGeneration(projectId, {
      generatedCode: JSON.stringify(CAP_FILES.filter((f) => f.path !== 'Dockerfile')),
      testSuite: CAP_SUITE, expectedContractFingerprint: contract.fingerprint, generationToken: generation.token,
    });
    expect(incomplete.status()).toBe(400);
    expect((await incomplete.json()).code).toBe('package-incomplete');

    // Negative probe — a token from before the design changed.
    await updateDoc(doc(owner.db, 'projects', projectId), {
      solutionDesign: designFixture('A CAP service records the route of a case and notifies (revised).'),
    });
    const stale = await a.storeGeneration(projectId, {
      generatedCode: JSON.stringify(CAP_FILES), testSuite: CAP_SUITE,
      expectedContractFingerprint: contract.fingerprint, generationToken: generation.token,
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe('generation-stale');
    expect((await stored(projectId)).project.generatedCode, 'a refused generation wrote code').toBeUndefined();

    const fresh = (await (await a.contract(projectId)).json()) as { contract: { fingerprint: string }; generation: { token: string } };
    const ok = await a.storeGeneration(projectId, {
      generatedCode: JSON.stringify(CAP_FILES), testSuite: CAP_SUITE,
      expectedContractFingerprint: fresh.contract.fingerprint, generationToken: fresh.generation.token,
    });
    expect(ok.status(), await ok.text()).toBe(200);
    const h = await handover(projectId);
    expect(h.project.generationBinding?.contractFingerprint).toBe(fresh.contract.fingerprint);
    expect(h.link('transformation').state).toBe('on-record');
    expect(h.link('transformation').provenance, 'generated code is a model proposal, never proven').toBe('proposed');
  });

  test('documentation: the Documentation stage reads the process out of the signed source', async ({ page }) => {
    test.setTimeout(300_000);
    await signInThroughForm(page, owner);
    await page.goto(`/project/${projectId}/documentation`);
    const start = page.locator('[data-generate-blueprint]');
    await expect(start).toBeEnabled({ timeout: 120_000 });
    await start.click();
    await expect(page.locator('[data-engine-documentation]')).toBeVisible({ timeout: 120_000 });
    const h = await handover(projectId);
    expect(h.link('documentation').provenance).toBe('reconstructed');
  });

  test('testing: the suite runs in the sandbox runner; the receipt is "Demonstrated · mock" and never Proven', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    // "Generate scenarios" (Testing step 1, `hooks/useTestGeneration.ts`) writes the cases and the
    // runnable suite as `testSuite.code` — the model's answer, here the fixture.
    await updateDoc(doc(owner.db, 'projects', projectId), { testCases: CAP_CASES, testSuite: { code: CAP_SUITE.spec } });

    // Negative probe — the browser cannot write a receipt, least of all a live one.
    const { runId } = await stored(projectId);
    await expect(
      updateDoc(doc(owner.db, 'projects', projectId), {
        testRunReceipt: { v: 2, environment: 'live', runId, verdicts: CAP_CASES.map((c) => ({ id: c.id, status: 'Passed' })) },
      }),
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);

    // Negative probe — verdicts the owner writes are self-reported, not a run.
    await updateDoc(doc(owner.db, 'projects', projectId), { testCases: CAP_CASES.map((c) => ({ ...c, status: 'Passed' })) });
    let h = await handover(projectId);
    expect(h.phase('testing').badge).toBe('Self-reported');
    expect(h.phase('testing').proven).toBe(false);
    expect(h.link('tests').provenance).not.toBe('demonstrated-mock');
    expect(h.link('tests').provenance).not.toBe('proven');

    // Negative probe — nobody but the owner runs the suite.
    const foreign = await api(request, stranger).runTests(projectId);
    expect(foreign.status()).toBe(403);

    const res = await a.runTests(projectId);
    expect(res.status(), await res.text()).toBe(200);
    const ran = (await res.json()) as { receipt: { environment: string; runner?: { kind: string }; verdicts: Array<{ id: string; status: string }> } | null; buildError?: boolean };
    expect(ran.buildError, JSON.stringify(ran)).toBeFalsy();
    expect(ran.receipt?.environment).toBe('mock');
    expect(ran.receipt?.runner?.kind).toBe('local-emulator');
    expect(ran.receipt?.verdicts).toEqual(CAP_CASES.map((c) => ({ id: c.id, status: 'Passed' })));

    h = await handover(projectId);
    expect(coveringTestRunReceipt(h.hydrated as Parameters<typeof coveringTestRunReceipt>[0])?.runId).toBe(h.runId);
    expect(h.phase('testing').badge).toBe('Passed · mock');
    expect(h.phase('testing').mock).toBe(true);
    expect(h.link('tests').provenance).toBe('demonstrated-mock');
    expect(h.link('tests').missing).toContain('against mocks, not against an SAP system');
    expect(h.facets.find((f) => f.key === 'quality')?.provenance).toBe('demonstrated-mock');
    expect(h.groups.find((g) => g.key === 'receipt')?.provenance).toBe('demonstrated-mock');
    expect(h.phase('delivery').badge).toBe('Ready · mock tests');
    expect(h.chain.filter((l) => l.provenance === 'proven').map((l) => l.key), 'only the signed run and its analysis may read as proven').toEqual(['run', 'analysis']);
  });

  test('decision and delivery: confirmed CAP decision, pack sealed and verified, handover names decision, run and receipt', async ({ request, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const { confirmed } = await draftAndConfirm(a, projectId);
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    const { attested, runId } = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(attested).toContain('given (self-attested)');

    const h = await handover(projectId);
    expect(h.link('decision').value).toContain('DEC-1 · revision 1');
    expect(h.link('decision').provenance).toBe('confirmed');
    expect(h.decision?.boundRunId).toBe(runId);
    expect(h.decision?.summary).toContain('Build this object as Side-by-Side');
    expect(h.status('receipts').value).toBe('sandbox test run');
    expect(h.blockers).toEqual([]);
    expect(h.stillNeeded, 'only the cost model stays open').toEqual(['economics']);
  });

  test('delivery page: the receipt reads "Demonstrated · mock", the decision confirmed', async ({ page }) => {
    test.setTimeout(240_000);
    await openDelivery(page, owner, projectId);
    const receipt = page.locator('[data-chain-group="receipt"]');
    await expect(receipt).toHaveAttribute('data-chain-group-provenance', 'demonstrated-mock');
    await expect(receipt).toContainText('Demonstrated · mock');
    await expect(receipt).not.toContainText('Proven');
    await expect(page.locator('[data-delivery-status-item="receipts"]')).toContainText('sandbox test run');
    await expect(page.locator('[data-delivery-status-item="decision"]')).toContainText('confirmed');
  });

  test('probe: a decision confirmed on an older run is history after a new run — confirming again is revision 2', async ({ request, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    const a = api(request, owner);
    // A new run of the same source: nothing built on it is stale, but the confirmation of run A is not the decision of run B.
    const { runId } = await analyse(a, projectId, source);
    expect(runId).not.toBe(firstRunId);
    let h = await handover(projectId);
    expect(h.decision?.status).toBe('confirmed');
    expect(h.decision?.boundRunId).toBe(firstRunId);
    expect(decisionIsCurrent(h.hydrated, h.decision)).toBe(false);
    expect(h.link('decision').state).toBe('stale');
    expect(h.link('decision').missing).toContain('Recorded for a previous analysis run');
    expect(h.status('decision').value).not.toBe('confirmed');
    expect(h.groups.find((g) => g.key === 'delivery')?.sub, 'the export of run A is not one of run B').toBe('Audit pack not sealed yet.');
    // The receipt named run A, so it covers nothing now — no run is carried over.
    expect(h.link('tests').provenance).not.toBe('demonstrated-mock');

    // A confirmed decision is not redrafted in place: withdraw, then a new revision.
    const redraft = await readDecision(a, projectId);
    expect(redraft.unchanged).toBe(false);
    expect(redraft.draft.revision).toBe(2);
    const inPlace = await a.command(projectId, { command: 'record-decision-draft', decision: redraft.draft });
    expect(inPlace.status()).toBe(409);
    expect((await inPlace.json()).code).toBe('decision-confirmed');
    const withdrawn = await a.command(projectId, { command: 'withdraw-decision' });
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
    const { confirmed } = await draftAndConfirm(a, projectId);
    expect(confirmed.status(), await confirmed.text()).toBe(200);

    const sealed = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(sealed.runId).toBe(runId);
    h = await handover(projectId);
    expect(h.link('decision').state).toBe('on-record');
    expect(h.link('decision').provenance).toBe('confirmed');
    expect(h.link('decision').value).toContain('DEC-1 · revision 2');
    expect(h.decision?.boundRunId).toBe(runId);
    // The receipt is re-earned on the new run by running the suite again.
    const rerun = await a.runTests(projectId);
    expect(rerun.status(), await rerun.text()).toBe(200);
    expect((await handover(projectId)).link('tests').provenance).toBe('demonstrated-mock');
  });

  test('probe: the source changes after generation — everything built on it is stale and nothing leaves', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const before = await readDecision(a, projectId);
    const changed = `${source}* G4 probe: the source changed after generation.\n`;
    const { runId } = await analyse(a, projectId, changed);
    expect(runId).not.toBe(firstRunId);

    const h = await handover(projectId);
    expect(h.blockers).toEqual(expect.arrayContaining(['the solution design', 'the architecture sign-off', 'the generated code', 'the test suite', 'the documentation']));
    expect(h.link('transformation').state).toBe('stale');
    expect(h.link('tests').state).toBe('stale');
    expect(coveringTestRunReceipt(h.hydrated as Parameters<typeof coveringTestRunReceipt>[0]), 'a receipt for the old code covers the new run').toBeNull();
    expect(h.link('decision').state).toBe('stale');
    expect(h.link('decision').missing).toContain('Recorded for a previous analysis run');
    expect(decisionIsCurrent(h.hydrated, h.decision)).toBe(false);
    expect(h.status('decision').value).not.toBe('confirmed');
    expect(h.facets.find((f) => f.key === 'handover')?.value).toBe('Blocked');

    // The server refuses the pack over the stale sign-off …
    const pack = await a.pack(projectId);
    expect(pack.status()).toBe(409);
    expect((await pack.json()).blockers).toContain('sign-off-stale');
    // … and the confirmation prepared on the old run cannot be moved onto the new one.
    const late = await a.command(projectId, {
      command: 'confirm-decision', expectedRunId: before.runId, expectedEvidenceDigest: before.evidenceDigest,
      expectedDecisionFingerprint: before.draft.fingerprint,
    });
    expect(late.status()).toBe(409);
    expect((await late.json()).code).toBe('run-moved');
  });
});

/* =================================================================== path 3 */

test.describe('G4 path 3 — retirement (CC-047: measured zero over 13 months, Retire signed off by the account)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  const source = caseSource(CASES.retirement);
  let owner: Account;
  let reader: Account;
  let projectId = '';
  let firstRunId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owner = await makeAccount('retire-owner');
    reader = await makeAccount('retire-reader');
    projectId = await makeProject(owner, 'retire', source);
  });

  const usage = (days: number, from: string) => ({
    records: [{ objectName: 'ZCC_REF_047', objectType: 'PROG', callCount: 0, source: 'scmon' }],
    source: 'scmon',
    window: { from, to: '2026-08-31', days },
    importedAt: new Date().toISOString(),
    warnings: [],
  });

  /** The quadrant the Analyze stage's usage matrix computes (`UsageRiskMatrix` → `joinUsageWithEvidence`) from the stored import. */
  async function quadrant() {
    const { project, run } = await stored(projectId);
    const route = routeExtensibility(buildAbapEvidence(source, 'source.abap', 'private'), 'private');
    const findings = (run?.evidenceReport ?? []) as Parameters<typeof joinUsageWithEvidence>[1]['findings'];
    const rows = joinUsageWithEvidence(project.usageReport as UsageReport, { findings }, route, () => false);
    return rows.find((r) => r.objectName === 'ZCC_REF_047')?.quadrant;
  }

  test('analyze and usage: zero calls over 13 months make a Retire candidate — over six weeks they make nothing', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const { runId } = await analyse(a, projectId, source);
    firstRunId = runId;

    // Negative probe — a zero over a window too short to contain a year-end run is no evidence of disuse.
    const short = await a.command(projectId, { command: 'record-usage-report', usageReport: usage(42, '2026-07-21') });
    expect(short.status(), await short.text()).toBe(200);
    expect(await quadrant()).toBe('unknown');

    const long = await a.command(projectId, { command: 'record-usage-report', usageReport: usage(396, '2025-08-01') });
    expect(long.status(), await long.text()).toBe(200);
    expect(await quadrant()).toBe('retire-candidate');
    expect(QUADRANT_META['retire-candidate'].description).toContain('after business owner confirmation');

    // A candidate is not a decision: with nothing signed off the decision picks nothing and cannot be confirmed.
    const read = await readDecision(a, projectId);
    expect(read.draft.bindings.find((b) => b.key === 'option')?.revision).toBeNull();
    const drafted = await a.command(projectId, { command: 'record-decision-draft', decision: read.draft });
    expect(drafted.status()).toBe(200);
    const early = await a.command(projectId, {
      command: 'confirm-decision', expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
      expectedDecisionFingerprint: read.draft.fingerprint,
    });
    expect(early.status()).toBe(409);
    expect((await early.json()).code).toBe('decision-blocked');
    const h = await handover(projectId);
    expect(h.status('decision').value, 'a retire candidate read as a decision').not.toBe('confirmed');
  });

  test('design and decision: the account signs off Retire; the decision is drafted and stays a candidate', async ({ request }) => {
    const a = api(request, owner);
    await updateDoc(doc(owner.db, 'projects', projectId), {
      solutionDesign: designFixture('Decommission ZCC_REF_047: no executions recorded across a 13-month SCMON window including a year-end close.'),
    });
    const bare = await signOff(a, projectId, 'retire');
    expect(bare.status()).toBe(400);
    expect((await bare.json()).code).toBe('override-needs-reason');
    const ok = await signOff(a, projectId, 'retire', 'SCMON shows zero executions 2025-08-01 to 2026-08-31; the business owner confirmed nothing depends on the list.');
    expect(ok.status(), await ok.text()).toBe(200);

    // Drafted, not confirmed: the handover says "derived by rules" and keeps the decision open.
    const read = await readDecision(a, projectId);
    expect(read.draft.summary).toBe('Retire this object, as the signed-off target architecture says.');
    const drafted = await a.command(projectId, { command: 'record-decision-draft', decision: read.draft });
    expect(drafted.status(), await drafted.text()).toBe(200);
    const h = await handover(projectId);
    expect(h.link('design').provenance).toBe('confirmed');
    expect(h.link('decision').provenance).toBe('reconstructed');
    expect(h.link('decision').by).toBe('Derived by rules, not confirmed');
    expect(h.status('decision').value).toBe('draft, not confirmed');
    expect(h.stillNeeded).toContain('decision');
    // The cost revision a retirement should bind (DW-2) is not bound: no simulation is stored.
    expect(h.decision?.bindings.find((b) => b.key === 'cost')?.revision).toBeNull();
  });

  test('decision: the account confirms the retirement — it rests on the run and the sign-off with the usage evidence (G4-F1)', async ({ request }) => {
    await confirmRetire(api(request, owner), projectId, owner);
  });

  test('access: an invited reader reads but cannot write or decide; once revoked, reads nothing', async ({ request }) => {
    const a = api(request, owner);
    const r = api(request, reader);
    // What accepting an invitation writes (`readersAfterGrant`); the invitation mail itself is not sent here.
    await seedMerge('projects', projectId, { readers: [reader.uid] });

    const read = await r.decision(projectId);
    expect(read.status(), await read.text()).toBe(200);
    const body = (await read.json()) as DecisionRead;
    expect(body.canDecide).toBe(false);

    const confirm = await r.command(projectId, {
      command: 'confirm-decision', expectedRunId: body.runId, expectedEvidenceDigest: body.evidenceDigest,
      expectedDecisionFingerprint: body.draft.fingerprint,
    });
    expect(confirm.status()).toBe(404);
    const revoke = await r.command(projectId, { command: 'revoke-architecture' });
    expect(revoke.status()).toBe(404);
    const pack = await r.pack(projectId);
    expect(pack.status()).toBe(403);
    await expect(
      updateDoc(doc(reader.db, 'projects', projectId), { solutionDesign: 'written by a reader' }),
    ).rejects.toThrow(/permission|PERMISSION_DENIED/i);
    const after = await stored(projectId);
    expect(after.project.approvedByArchitect).toBe(true);
    expect(after.project.decision?.status).toBe('confirmed');

    const revoked = await a.revokeReader(projectId, reader.uid);
    expect(revoked.status(), await revoked.text()).toBe(200);
    const gone = await r.decision(projectId);
    expect(gone.status()).toBe(404);
  });

  test('delivery: the pack verifies; after a new run the Retire decision is stale, is confirmed again as the next revision, and the pack is sealed against that run', async ({ request, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    const a = api(request, owner);
    const before = await readDecision(a, projectId);
    const first = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(first.runId).toBe(firstRunId);
    expect(first.attested).toContain('Retire');
    expect(first.attested).toContain('given (self-attested)');

    // A new run of the same source: the export of run A is not one of run B, and the decision of run A is history.
    const { runId } = await analyse(a, projectId, source);
    expect(runId).not.toBe(firstRunId);
    let h = await handover(projectId);
    expect(h.groups.find((g) => g.key === 'delivery')?.sub, 'the export of run A is not one of run B').toBe('Audit pack not sealed yet.');
    expect(h.decision?.boundRunId).toBe(firstRunId);
    expect(h.link('decision').state).toBe('stale');
    expect(h.status('decision').value).not.toBe('confirmed');
    // The usage evidence is the project's, not the run's: it still makes a candidate, and still only a candidate.
    expect(await quadrant()).toBe('retire-candidate');

    // Probe — Retire on a stale run: a confirmation prepared on run A is not moved onto run B.
    const late = await a.command(projectId, {
      command: 'confirm-decision', expectedRunId: before.runId, expectedEvidenceDigest: before.evidenceDigest,
      expectedDecisionFingerprint: before.draft.fingerprint,
    });
    expect(late.status()).toBe(409);
    expect((await late.json()).code).toBe('run-moved');

    // The same source, so the sign-off still stands: withdraw, and confirm the decision of run B as revision 2.
    const withdrawn = await a.command(projectId, { command: 'withdraw-decision' });
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
    const drafted = await readDecision(a, projectId);
    // The draft without a sign-off was revision 1 and the confirmed Retire revision 2; run B's is the next.
    expect(before.draft.revision).toBe(2);
    expect(drafted.draft.revision).toBe(3);
    const redrafted = await a.command(projectId, { command: 'record-decision-draft', decision: drafted.draft });
    expect(redrafted.status(), await redrafted.text()).toBe(200);
    await confirmRetire(a, projectId, owner);

    const second = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(second.runId).toBe(runId);
    h = await handover(projectId);
    expect(h.link('decision').state).toBe('on-record');
    expect(h.link('decision').provenance).toBe('confirmed');
    expect(h.link('decision').value).toContain('DEC-1 · revision 3');
    expect(h.decision?.boundRunId).toBe(runId);
  });

  test('delivery page: the retirement is signed off and the decision is shown as confirmed', async ({ page }) => {
    test.setTimeout(240_000);
    await openDelivery(page, owner, projectId);
    await expect(page.locator('[data-delivery-status-item="decision"]')).toContainText('confirmed');
    await expect(page.locator('[data-delivery-status-item="decision"]')).not.toContainText('not confirmed');
    await expect(page.locator('[data-still-needed-item="decision"]')).toHaveCount(0);
  });
});

/* =================================================================== path 4 */

test.describe('G4 path 4 — undecidable (CC-021: the deciding logic is in an INCLUDE nobody supplied)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  const source = caseSource(CASES.undecidable);
  let owner: Account;
  let projectId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owner = await makeAccount('open-owner');
    projectId = await makeProject(owner, 'open', source);
  });

  test('analyze and decision: no option can be chosen, and a decision that picks nothing cannot be confirmed', async ({ request }) => {
    test.setTimeout(240_000);
    const a = api(request, owner);
    const { run } = await analyse(a, projectId, source);
    // Recorded, not asserted as right: what the engine says about a program whose logic it was not given.
    test.info().annotations.push({
      type: 'engine-on-undecidable',
      description: JSON.stringify({ route: run.extensibilityRoute, score: run.cleanCoreScore, findings: (run.evidenceReport as unknown[] | undefined)?.length ?? 0 }),
    });
    await updateDoc(doc(owner.db, 'projects', projectId), {
      solutionDesign: designFixture('The route rule lives in INCLUDE zcc_ref_021_rules, which was not supplied. No target can be chosen from what is here.'),
    });

    const read = await readDecision(a, projectId);
    expect(read.draft.summary).toBe('No target architecture is signed off yet, so this decision picks nothing.');
    expect(read.draft.bindings.find((b) => b.key === 'option')?.revision).toBeNull();
    const drafted = await a.command(projectId, { command: 'record-decision-draft', decision: read.draft });
    expect(drafted.status(), await drafted.text()).toBe(200);
    const confirm = await a.command(projectId, {
      command: 'confirm-decision', expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest,
      expectedDecisionFingerprint: read.draft.fingerprint,
    });
    expect(confirm.status(), 'an undecidable case was confirmed as decided').toBe(409);
    expect((await confirm.json()).code).toBe('decision-blocked');
    expect((await stored(projectId)).project.decision?.status).toBe('draft');
  });

  test('delivery: the pack seals the analysis and claims no decision; the handover keeps "not determined" visible', async ({ request, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const a = api(request, owner);
    const { attested } = await sealAndVerify(a, projectId, baseURL!, testInfo.outputDir);
    expect(attested).toMatch(/Target architecture chosen \| Not chosen/);
    expect(attested).toMatch(/Architect sign-off \| not given/);

    const h = await handover(projectId);
    expect(h.link('decision').provenance).not.toBe('confirmed');
    expect(h.link('decision').value).toContain('picks nothing');
    expect(h.link('design').provenance).toBe('proposed');
    expect(h.status('decision').value).toBe('draft, not confirmed');
    expect(h.facets.find((f) => f.key === 'decision')?.value).toBe('Pending');
    expect(h.stillNeeded).toEqual(expect.arrayContaining(['design', 'decision']));
    expect(h.chain.some((l) => l.provenance === 'confirmed'), 'something in the chain claims a confirmation').toBe(false);
  });

  test('design and delivery pages: nothing reads as decided', async ({ page }) => {
    test.setTimeout(300_000);
    await signInThroughForm(page, owner);
    await page.goto(`/project/${projectId}/design`);
    const answer = page.locator('[data-design-answer]');
    await expect(answer).toBeVisible({ timeout: 120_000 });
    // The route is read on the server first ("Reading the route…"); the answer settles after it.
    await expect(answer).toContainText('Confidence', { timeout: 120_000 });
    await expect(answer).not.toContainText('Reading the route', { timeout: 120_000 });
    await expect(answer).not.toHaveAttribute('data-design-answer', 'confirmed');
    await expect(answer).toContainText('Recommended');
    await expect(answer).not.toContainText('Confirmed by');
    // Recorded for the protocol (finding G4-F2): what the Design stage says about a case it cannot decide.
    test.info().annotations.push({ type: 'design-on-undecidable', description: (await answer.innerText()).replace(/\s+/g, ' ') });

    await page.goto(`/project/${projectId}/delivery`);
    await expect(page.locator('[data-delivery-status-item="decision"]')).toContainText('draft, not confirmed', { timeout: 90_000 });
    await expect(page.locator('[data-chain-group="decision"]')).not.toHaveAttribute('data-chain-group-provenance', 'confirmed');
    await expect(page.locator('[data-still-needed-item="decision"]')).toBeVisible();
  });
});
