import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'mfa-reset.ts');

/**
 * Removing someone's second factor leaves a record that names who did it.
 *
 * The privacy policy tells readers that administrative actions on an account
 * are recorded in an audit log "together with the acting administrator, the
 * affected account and the time". Approval, revocation and deletion write that
 * record through `logAuditEvent`. The recovery script for a lost authenticator
 * — the most security-relevant administrative action there is — wrote only an
 * `mfaResetAt` stamp on the user document: one field, overwritten by the next
 * reset, naming nobody (security audit of v2.11.0, SEC-2026-023).
 *
 * Run rather than read. Application Default Credentials are ignored when the
 * emulator host variables are set, and the script's hard-coded project id is
 * the emulator's, so the real script can be executed here with its real writes.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const EMAIL = `mfa-reset-${STAMP}@cleancore-test.io`;
const PASSWORD = 'MfaResetAudit123!';
const OPERATOR = 'operator@clean-core.io';
let uid = '';

// `shell: true` is needed for `npx` on Windows, and a shell joins the argument
// array with spaces without quoting it — so an argument that contains a space
// arrives as several. Quote them here rather than avoiding spaces in fixtures:
// the reason line is prose, and testing it with a single word would be testing
// something the operator will never type.
const quote = (a: string) => (process.platform === 'win32' && /\s/.test(a) ? `"${a}"` : a);

const runScript = (args: string[]) =>
  spawnSync('npx', ['tsx', SCRIPT, ...args].map(quote), {
    encoding: 'utf8',
    cwd: ROOT,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
      GOOGLE_APPLICATION_CREDENTIALS: '',
    },
  });

const auditEvents = async () => {
  const snap = await db().collection('audit_events').where('targetUid', '==', uid).get();
  return snap.docs.map((d) => d.data() as Record<string, unknown>);
};

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Reset', lastName: 'Audit', email: EMAIL, tier: 'pilot', status: 'approved',
    mfaEnabled: true, termsVersionAccepted: TERMS_VERSION, createdAt: new Date(),
  });
});

test.describe('the second-factor reset', () => {
  test('refuses to apply without naming the operator, and changes nothing', async () => {
    const r = runScript([EMAIL, '--apply']);
    expect(r.status, `the script applied without an operator:\n${r.stdout}\n${r.stderr}`).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toContain('--operator');

    // The refusal has to come before any write, not after one.
    const profile = (await db().collection('users').doc(uid).get()).data() || {};
    expect(profile.mfaEnabled, 'the flag was cleared despite the refusal').toBe(true);
    expect(await auditEvents(), 'a refused reset still wrote a record').toEqual([]);
  });

  test('a dry run writes nothing at all', async () => {
    const r = runScript([EMAIL]);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('DRY RUN');
    const profile = (await db().collection('users').doc(uid).get()).data() || {};
    expect(profile.mfaEnabled, 'a dry run cleared the flag').toBe(true);
    expect(await auditEvents(), 'a dry run wrote a record').toEqual([]);
  });

  test('an applied reset names the operator, the account and the time', async () => {
    const r = runScript([EMAIL, '--apply', '--operator', OPERATOR, '--reason', 'authenticator lost, confirmed by phone']);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);

    const profile = (await db().collection('users').doc(uid).get()).data() || {};
    expect(profile.mfaEnabled, 'the factor flag was not cleared').toBe(false);

    const events = await auditEvents();
    expect(events.length, 'the reset left no record').toBe(1);
    const event = events[0];
    expect(event.action).toBe('mfa.reset');
    expect(event.actorEmail, 'the record does not name who did it').toBe(OPERATOR);
    expect(event.targetEmail).toBe(EMAIL);
    expect(event.reason).toBe('authenticator lost, confirmed by phone');
    expect(event.timestamp, 'the record carries no time').toBeTruthy();
  });

  test('the record is server-only, so nobody can write or read it from a browser', () => {
    // A log a client could append to is not a log. `firestore.rules` denies
    // both directions on `audit_events`; the Admin SDK bypasses rules by design.
    const rules = require('fs').readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') as string;
    const at = rules.indexOf('match /audit_events/');
    expect(at, 'the audit_events rule is gone').toBeGreaterThan(-1);
    expect(rules.slice(at, at + 200)).toMatch(/allow\s+read,\s*write:\s*if\s+false/);
  });
});
