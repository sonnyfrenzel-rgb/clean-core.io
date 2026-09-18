import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, updateDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { adminSetDoc } from './helpers/admin-seed';
import {
  RELEASE_FIELDS,
  SERVER_ONLY_PROJECT_FIELDS,
  fieldsWrittenByCommands,
  recommendedArchitecture,
  validateProjectCommand,
} from '../lib/project-commands';
import { parseClientWritableProjectFields, normaliseRulesText } from '../lib/firestore-rules-contract';
import { attestationsOf, signedGeneratorInput, buildAuditPackContents } from '../lib/audit-pack-build';
import { USER_ATTESTED_FILE } from '../lib/audit-pack';

/**
 * QA24-A12: client, server, index and export have the same limits.
 *
 * Roadmap 0.7 took six fields off the browser — the five release fields
 * (`targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`,
 * `architectSignOffAt`, `approvedBy`) and `usageReport`. Each half of that is
 * easy to get right on its own and useless alone: a rule that refuses a field
 * the export still carries as evidence, or a route that permits a transition
 * the rules would not, is the same failure with better manners.
 *
 * So one list — `SERVER_ONLY_PROJECT_FIELDS` — and four places held to it here:
 *
 *   client  `firestore.rules` does not allow them, and no page writes them
 *   server  the command route writes exactly them, and validates the transition
 *   index   both registers name the same set
 *   export  the audit pack carries them as attested and signs none of them
 *
 * The refusals in the second half run against the **live emulator rules with
 * the real client SDK**: a `PERMISSION_DENIED` for each field, then an allowed
 * write on the same document in the same session, so a refusal cannot be a
 * broken document or a signed-out user wearing the costume of a rule.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sorted = (v: Iterable<string>) => [...v].sort();

const RULES = normaliseRulesText(read('firestore.rules'));
const ALLOWED = parseClientWritableProjectFields(RULES);
const REGISTER = JSON.parse(read('docs/registers/preservation-register.json'));
const DEPLOYMENT = JSON.parse(read('docs/registers/rules-deployment.json'));
const COMMAND_ROUTE = 'app/api/projects/[projectId]/commands/route.ts';

/* ================================================================ the list */

test.describe('client, server, index and export name the same six fields', () => {
  test('client: firestore.rules allows a browser none of them', () => {
    const leaked = SERVER_ONLY_PROJECT_FIELDS.filter((f) => ALLOWED.includes(f));
    expect(leaked, `still client-writable in firestore.rules: ${leaked.join(', ')}`).toEqual([]);
  });

  test('client: no page or component writes one of them to Firestore', () => {
    // The whole call expression, not a window of characters: a `setDoc(` two
    // statements above an unrelated `approvedBy:` would otherwise read as a
    // write, and a write split over many lines would not read as one at all.
    const callPayloads = (source: string): string[] => {
      const payloads: string[] = [];
      for (const m of source.matchAll(/\b(?:updateDoc|setDoc|addDoc)\s*\(/g)) {
        const open = m.index! + m[0].length - 1;
        let depth = 0;
        for (let i = open; i < source.length; i += 1) {
          if (source[i] === '(') depth += 1;
          else if (source[i] === ')') {
            depth -= 1;
            if (depth === 0) {
              payloads.push(source.slice(open, i + 1));
              break;
            }
          }
        }
      }
      return payloads;
    };

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (entry.isDirectory()) {
          // Route handlers are the server. They are allowed to write these.
          if (rel === 'app/api') continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const payload of callPayloads(source)) {
          for (const field of SERVER_ONLY_PROJECT_FIELDS) {
            if (new RegExp(`(^|[^\\w'"])${field}\\s*:`).test(payload)) offenders.push(`${rel} → ${field}`);
          }
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));
    expect(sorted(new Set(offenders)), 'these write a server-only field from the browser').toEqual([]);
  });

  test('server: the command route writes exactly them, and is the only writer', () => {
    expect(sorted(fieldsWrittenByCommands())).toEqual(sorted(SERVER_ONLY_PROJECT_FIELDS));
    const route = read(COMMAND_ROUTE);
    // The route decides nothing itself; it asks the shared contract, which is
    // the same object the design stage sends against.
    expect(route).toContain("from '@/lib/project-commands'");
    expect(route).toContain('validateProjectCommand(');
    // A verified token, the second factor, the owner — in that order, before
    // anything is written.
    expect(route.indexOf('verifyRequestAuth(')).toBeGreaterThan(-1);
    expect(route.indexOf('assertMfaSatisfied(')).toBeGreaterThan(route.indexOf('verifyRequestAuth('));
    expect(route.indexOf('project.userId !== decodedToken.uid')).toBeGreaterThan(route.indexOf('assertMfaSatisfied('));
    expect(route.indexOf('tx.set(ref,'), 'nothing is written before the owner check').toBeGreaterThan(
      route.indexOf('project.userId !== decodedToken.uid'),
    );

    // Every change into the journal (SCHNITT-0-UMFANG §8, package 1) — and in
    // the same write as the change itself. Two awaits let the journal entry fail
    // on its own and leave a recorded sign-off that nothing records; reversing
    // them only moves the lie to the other side (QA review of fafb3299ae6c).
    expect(route, 'the journal entry is no longer written here').toContain("db.collection('audit_events')");

    // …and the read the decision is made on is the read the write is conditional
    // on. A batch was atomic but not isolated: between `ref.get()` and
    // `batch.commit()` a concurrent `/api/runs/create` could make a different run
    // the active one, so a sign-off validated against run A landed on a project
    // whose active run was B (QA full review of a19945ef01dc). The project read,
    // `validateProjectCommand` and both writes are inside one transaction body.
    expect(route, 'the command is not read, decided and written in one transaction').toMatch(
      /db\.runTransaction\([\s\S]*tx\.get\(ref\)[\s\S]*validateProjectCommand\([\s\S]*tx\.set\(ref,[\s\S]*audit_events[\s\S]*\}\,?\s*\)\;/,
    );
    expect(route, 'the project is read outside the transaction').not.toMatch(/await ref\.get\(\)/);
    // And no second, separate write that could succeed or fail on its own.
    expect(
      route.match(/await ref\.set\(|db\.batch\(\)|await db\.collection\('audit_events'\)\.add\(/g) ?? [],
      'a write outside the transaction',
    ).toEqual([]);
  });

  test('index: both registers name the set the rules and the route agree on', () => {
    expect(sorted(REGISTER.trustChain.serverOnlyProjectFields.fields)).toEqual(sorted(SERVER_ONLY_PROJECT_FIELDS));
    expect(REGISTER.trustChain.serverOnlyProjectFields.route).toBe(COMMAND_ROUTE);
    // The index of what a browser may write is the rules file, read back.
    expect(sorted(REGISTER.baseline.rules.projectDocument.clientWritableFields)).toEqual(ALLOWED);
    // …and the deployment record accounts for the six leaving it.
    const record = DEPLOYMENT.pending ?? DEPLOYMENT.deployed;
    expect(record.sha256OfLfNormalisedText).toMatch(/^[0-9a-f]{64}$/);
    const six = SERVER_ONLY_PROJECT_FIELDS as readonly string[];
    // This used to read "if there is a pending block, it removes exactly the
    // six" — true while 0.7 was the only rules change anyone had written down,
    // and wrong the moment a second one (roadmap 5.4, which widens a *read* and
    // moves no field at all) sat pending on top of it. The invariant was never
    // about which change is pending; it is that the six are not client-writable
    // in the text that is live, in the text in the working copy, and in
    // anything pending in between.
    expect(DEPLOYMENT.deployed.clientWritableProjectFields.filter((f: string) => six.includes(f)), 'live').toEqual([]);
    expect(ALLOWED.filter((f) => six.includes(f)), 'working copy').toEqual([]);
    expect((DEPLOYMENT.pending?.addsToClient ?? []).filter((f: string) => six.includes(f)), 'pending').toEqual([]);
    // No stage claims to write them from the browser any more.
    for (const stage of REGISTER.stages) {
      for (const field of stage.outputs.clientWrites) {
        expect(SERVER_ONLY_PROJECT_FIELDS, `${stage.key} still lists ${field} as a client write`).not.toContain(field);
      }
    }
  });

  test('`status` stays the client\'s, because nothing on the server believes it', () => {
    // The v2.11.0 audit named `status` next to the sign-off fields (SEC-2026-008).
    // It is a different case and it stays where it is: `status` is a draft label
    // the browser owns, and the phase contract is `lib/workflow-steps.ts`
    // (`docs/ARCHITECTURE.md` §2 — "project.status is not read"). Taking it away
    // would move five stages and buy nothing. What must stay true is the reason:
    // no server decision may read it.
    expect(ALLOWED, 'status left the client allowlist — then this test is the wrong shape').toContain('status');

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (entry.name !== 'route.ts') continue;
        const source = fs.readFileSync(full, 'utf8');
        if (/\b(projectData|projectDoc\.data\(\))\s*\??\.?\s*(\.|\?\.)?status\b/.test(source)) {
          offenders.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(ROOT, 'app', 'api'));
    expect(offenders, 'a route decides something from the project document\'s client-written status').toEqual([]);

    // And the export says whose word it is: attested, never signed.
    const attested = attestationsOf({ status: 'completed' });
    expect(attested.status).toBe('completed');
    const input = signedGeneratorInput({ projectId: 'p', runId: 'r', run: {}, attested }) as unknown as Record<string, unknown>;
    expect(input.status, 'the project\'s status reached the signed generators').toBeUndefined();
  });

  test('export: the pack carries the release fields as attested and signs none of them', () => {
    // Attested: named in the file the manifest lists as not covered by the
    // signature. Server-validated does not mean signed — the sign-off is still
    // a self-declaration of the signed-in account.
    const attested = attestationsOf({
      name: 'Order intake',
      status: 'analyzed',
      targetArchitecture: 'retire',
      approvedByArchitect: true,
      approvedBy: 'owner@example.com',
      architectSignOffAt: '2026-09-16T09:00:00.000Z',
      architectJustifiedOverride: 'Nothing to migrate.',
    });
    for (const field of RELEASE_FIELDS) {
      expect(Object.keys(attested), `the pack drops ${field}`).toContain(field);
    }

    // Signed: a run carrying all six — which it never should — contributes none
    // of them to the generators' input, and the manifest lists the attested file
    // separately from the hashed ones.
    const run: Record<string, unknown> = {
      status: 'completed',
      createdAt: '2026-09-16T08:00:00.000Z',
      extensibilityRoute: 'rap',
      worklist: [],
      targetArchitecture: 'cap',
      approvedByArchitect: true,
      approvedBy: 'smuggled@example.com',
      architectSignOffAt: '2026-09-16T09:00:00.000Z',
      architectJustifiedOverride: 'smuggled',
      usageReport: { records: [] },
    };
    const input = signedGeneratorInput({ projectId: 'p', runId: 'r', run, attested }) as unknown as Record<string, unknown>;
    for (const field of SERVER_ONLY_PROJECT_FIELDS) {
      expect(input[field], `${field} reached the signed generators`).toBeUndefined();
    }
    const pack = buildAuditPackContents({ projectId: 'p', runId: 'r', run, attested });
    expect(Object.keys(pack.attested)).toEqual([USER_ATTESTED_FILE]);
    expect(Object.keys(pack.signed)).not.toContain(USER_ATTESTED_FILE);
    for (const body of Object.values(pack.signed)) {
      expect(body, 'a signed file carries the approver').not.toContain('owner@example.com');
      expect(body, 'a signed file carries the smuggled approver').not.toContain('smuggled@example.com');
    }
  });
});

/* ======================================================= the transition rules */

test.describe('the transition, decided once and in one place', () => {
  const actor = { email: 'owner@example.com', now: '2026-09-16T10:00:00.000Z' };

  test('a sign-off needs a signed run', () => {
    const r = validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'rap' }, {}, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no-run');
  });

  test('the architecture is one of five, and the approver is the token', () => {
    const state = { activeRunId: 'run-1', originalRecommendation: 'In-App (ABAP Cloud)' };
    const bad = validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'whatever' }, state, actor);
    expect(bad.ok).toBe(false);
    const good = validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'rap' }, state, actor);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.fields.approvedBy).toBe('owner@example.com');
      expect(good.fields.architectSignOffAt).toBe(actor.now);
    }
  });

  test('a body cannot name its own approver or its own timestamp', () => {
    const state = { activeRunId: 'run-1', originalRecommendation: 'rap' };
    const r = validateProjectCommand(
      {
        command: 'approve-architecture',
        targetArchitecture: 'rap',
        approvedBy: 'cto@example.com',
        architectSignOffAt: '1999-01-01T00:00:00.000Z',
      },
      state,
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.approvedBy).toBe('owner@example.com');
      expect(r.fields.architectSignOffAt).toBe(actor.now);
    }
  });

  test('departing from the recommendation needs a reason — and an unknown one does not', () => {
    const known = { activeRunId: 'run-1', originalRecommendation: 'In-App (ABAP Cloud)' };
    const refused = validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'retire' }, known, actor);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('override-needs-reason');

    const withReason = validateProjectCommand(
      { command: 'approve-architecture', targetArchitecture: 'retire', justification: 'Nothing runs it.' },
      known,
      actor,
    );
    expect(withReason.ok).toBe(true);

    // Conservative, like lib/route-override.ts: no recommendation, no override.
    const unknown = { activeRunId: 'run-1', originalRecommendation: undefined };
    expect(recommendedArchitecture(unknown)).toBeNull();
    expect(validateProjectCommand({ command: 'approve-architecture', targetArchitecture: 'retire' }, unknown, actor).ok).toBe(true);
  });

  test('a withdrawal needs something to withdraw, and clears all five', () => {
    const nothing = validateProjectCommand({ command: 'revoke-architecture' }, { approvedByArchitect: false }, actor);
    expect(nothing.ok).toBe(false);
    const r = validateProjectCommand({ command: 'revoke-architecture' }, { approvedByArchitect: true }, actor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sorted(Object.keys(r.fields))).toEqual(sorted(RELEASE_FIELDS));
  });

  test('the usage import is held to its model, not to `is map`', () => {
    const state = { activeRunId: 'run-1' };
    expect(validateProjectCommand({ command: 'record-usage-report', usageReport: { records: [] } }, state, actor).ok).toBe(false);
    const r = validateProjectCommand(
      {
        command: 'record-usage-report',
        usageReport: {
          records: [{ objectName: 'ZFI', callCount: 3, source: 'scmon' }],
          source: 'scmon',
          importedAt: '2026-09-16',
          warnings: [],
          smuggled: { anything: 'at all' },
        },
      },
      state,
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const report = r.fields.usageReport as Record<string, unknown>;
      expect(Object.keys(report), 'a key the model does not declare was stored').not.toContain('smuggled');
      expect(report.source).toBe('scmon');
    }
  });

  test('the ATC import is held to its model, not to `is map` (roadmap 7.1)', () => {
    const state = { activeRunId: 'run-1' };
    expect(validateProjectCommand({ command: 'record-atc-report', atcReport: { findings: [] } }, state, actor).ok).toBe(false);
    const r = validateProjectCommand(
      {
        command: 'record-atc-report',
        atcReport: {
          findings: [{ objectName: 'ZFI', message: 'Direct table write', priority: 'error' }],
          source: 'atc',
          importedAt: '2026-09-18',
          warnings: [],
          smuggled: { anything: 'at all' },
        },
      },
      state,
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const report = r.fields.atcReport as Record<string, unknown>;
      expect(Object.keys(report), 'a key the model does not declare was stored').not.toContain('smuggled');
      expect(report.source).toBe('atc');
    }
  });
});

/* ================================================= the live rules, executed */

const OWNER = `cmd-owner-${Date.now()}@cleancore-test.io`;
const STRANGER = `cmd-stranger-${Date.now()}@cleancore-test.io`;
const PASSWORD = 'CommandBoundary123!';
const PROJECT_ID = `cmd-project-${Date.now()}`;
const FOREIGN_PROJECT_ID = `cmd-foreign-${Date.now()}`;

const app = getApps().find((a) => a.name === 'command-boundary') ?? initializeApp(firebaseConfig, 'command-boundary');
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

/**
 * The rules in the tree are the rules under test.
 *
 * The emulator loads `firestore.rules` once, at start-up, for the default
 * database; the app uses the named one (`clean-core-eu`), and on a developer's
 * machine the emulator has usually been running since before the change. A
 * rules test that seems to ignore an edit is almost always this. Pushing the
 * working copy first costs a request and removes the whole class.
 */
async function loadWorkingCopyRules() {
  const url = `http://127.0.0.1:8080/emulator/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}:securityRules`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: RULES }] } }),
  });
  expect(res.ok, 'the emulator rejected firestore.rules').toBe(true);
}

/** `true` when the write was refused, whatever the SDK chose to call it. */
async function refused(write: Promise<unknown>): Promise<string | null> {
  try {
    await write;
    return null;
  } catch (err: unknown) {
    return (err as { code?: string })?.code ?? 'unknown';
  }
}

test.describe('the live emulator rules refuse every one of the six', () => {
  // Serial here and not at file scope: these share one account, one project and
  // one emulator, and they build on each other. The source and contract checks
  // above share nothing, and a failure in one of them must not skip the rest.
  test.describe.configure({ mode: 'serial' });

  let ownerUid = '';
  let idToken = '';

  test.beforeAll(async () => {
    // Pushing rules, creating two accounts and seeding two projects is six
    // round trips to an emulator several suites share. The default 30 s is
    // enough until it is not, and then it reports a logic failure.
    test.setTimeout(120_000);
    await loadWorkingCopyRules();

    const ownerCred = await createUserWithEmailAndPassword(auth, OWNER, PASSWORD);
    ownerUid = ownerCred.user.uid;
    idToken = await ownerCred.user.getIdToken();
    await adminSetDoc('users', ownerUid, {
      firstName: 'Command', lastName: 'Owner', email: OWNER, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Command boundary fixture',
      userId: ownerUid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_cmd.',
      activeRunId: 'run-cmd-1',
      originalRecommendation: 'In-App (ABAP Cloud)',
      extensibilityRoute: 'In-App (ABAP Cloud)',
    });

    const strangerCred = await createUserWithEmailAndPassword(auth, STRANGER, PASSWORD);
    await adminSetDoc('users', strangerCred.user.uid, {
      firstName: 'Not', lastName: 'Yours', email: STRANGER, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', FOREIGN_PROJECT_ID, {
      name: 'Somebody else', userId: strangerCred.user.uid, createdAt: new Date(), status: 'analyzed',
    });

    await signInWithEmailAndPassword(auth, OWNER, PASSWORD);
  });

  const forgery: Record<string, unknown> = {
    targetArchitecture: 'retire',
    approvedByArchitect: true,
    architectJustifiedOverride: 'signed off in a browser',
    architectSignOffAt: '2026-09-16T11:00:00.000Z',
    approvedBy: 'cto@example.com',
    usageReport: { records: [], source: 'manual', importedAt: '2026-09-16', warnings: [] },
    atcReport: { findings: [], source: 'atc', importedAt: '2026-09-18', warnings: [] },
  };

  for (const field of SERVER_ONLY_PROJECT_FIELDS) {
    test(`the owner's own browser cannot write ${field}`, async () => {
      const ref = doc(db, 'projects', PROJECT_ID);
      const code = await refused(updateDoc(ref, { [field]: forgery[field] }));
      expect(code, `${field} was written from the browser`).toBe('permission-denied');
    });
  }

  test('and the refusal is the rule, not a broken document or a lost session', async () => {
    const ref = doc(db, 'projects', PROJECT_ID);
    expect(auth.currentUser?.uid, 'the owner is still the signed-in user').toBe(ownerUid);
    const code = await refused(updateDoc(ref, { solutionDesign: 'a draft the owner may write' }));
    expect(code, 'an allowlisted field was refused too — the fixture is broken').toBeNull();
    const snap = await getDoc(ref);
    expect(snap.data()?.solutionDesign).toBe('a draft the owner may write');
    expect(snap.data()?.approvedByArchitect, 'nothing slipped through on the way').toBeUndefined();
  });

  test('the route records the sign-off, with its own idea of who and when', async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post(`/api/projects/${PROJECT_ID}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data: { command: 'approve-architecture', targetArchitecture: 'rap', approvedBy: 'cto@example.com' },
    });
    expect(res.status()).toBe(200);
    const stored = (await getDoc(doc(db, 'projects', PROJECT_ID))).data() || {};
    expect(stored.approvedByArchitect).toBe(true);
    expect(stored.targetArchitecture).toBe('rap');
    expect(stored.approvedBy, 'the body chose the approver').toBe(OWNER);
    expect(String(stored.architectSignOffAt).slice(0, 4), 'a server timestamp').toBe(String(new Date().getFullYear()));
  });

  test('the route refuses an override without a reason, and writes nothing', async ({ request }: { request: APIRequestContext }) => {
    const before = (await getDoc(doc(db, 'projects', PROJECT_ID))).data() || {};
    const res = await request.post(`/api/projects/${PROJECT_ID}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data: { command: 'approve-architecture', targetArchitecture: 'retire' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('override-needs-reason');
    const after = (await getDoc(doc(db, 'projects', PROJECT_ID))).data() || {};
    expect(after.targetArchitecture).toBe(before.targetArchitecture);
  });

  test('the route refuses a project that is not the caller\'s', async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post(`/api/projects/${FOREIGN_PROJECT_ID}/commands`, {
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      data: { command: 'approve-architecture', targetArchitecture: 'rap' },
    });
    expect(res.status()).toBe(403);
  });

  test('the route refuses a caller with no token at all', async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post(`/api/projects/${PROJECT_ID}/commands`, {
      headers: { 'Content-Type': 'application/json' },
      data: { command: 'revoke-architecture' },
    });
    expect(res.status()).toBe(401);
  });
});
