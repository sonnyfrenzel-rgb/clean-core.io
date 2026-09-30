import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { figuresOnly, personalDataFields, withoutAccount } from '../lib/usage-snapshot-scrub';

/**
 * The one-off clean-up of old weekly-report snapshots, and the helper the
 * account erasure shares with it.
 *
 * The script is run for real, as a child process, against the emulator — but in
 * a database of its own (`--database`, accepted under the emulator only), so its
 * `--apply` never rewrites a snapshot another spec seeded into the default one
 * and is racing to read back.
 */

const ROOT = path.resolve(__dirname, '..');
const DATABASE = 'scrub-usage-reports-spec';
const TSX = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function db(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, DATABASE);
}

/** The script, with the CI markers of this very test run taken out unless asked for. */
function runScript(args: string[], extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080' };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  delete env.SCRUB_USAGE_REPORTS_CONFIRM;
  const res = spawnSync(TSX, ['scripts/scrub-usage-report-snapshots.ts', ...args], {
    cwd: ROOT,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 90_000,
  });
  return { status: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

const NAME_A = 'Scrubspec Annegret';
const MAIL_A = 'scrubspec.annegret@scrub-spec.example.org';
const NAME_B = 'Scrubspec Bartholomew';
const MAIL_B = 'scrubspec.b@scrub-spec.example.org';
const ADMIN = 'scrubspec.admin@scrub-spec.example.org';

const oldShape = () => ({
  periodStart: new Date('2026-09-01T10:00:00Z'),
  current: { registrations: 2, activations: 2, activeAccounts: 2, runs: 5, projects: 2, units: 5 },
  totals: { accounts: 9, activated: 4, atLimit: 2 },
  newAccounts: [
    { name: NAME_A, email: MAIL_A, when: new Date('2026-08-30T10:00:00Z') },
    { name: NAME_B, email: MAIL_B, when: null },
  ],
  newlyActivated: [
    { name: NAME_B, email: MAIL_B, runs: 1 },
    { name: NAME_A, email: MAIL_A, runs: 4 },
  ],
  reachedLimit: [{ name: NAME_A, email: MAIL_A }, { name: NAME_B, email: MAIL_B }],
  delivery: {
    sent: 4, delivered: 1, bounced: 2, complained: 1,
    failures: [
      { to: MAIL_A, kind: 'welcome', status: 'email.bounced', detail: `550 <${MAIL_A}> unknown`, at: null },
      { to: MAIL_B, kind: 'welcome', status: 'email.bounced', detail: null, at: null },
      { to: MAIL_B, kind: 'survey', status: 'email.complained', detail: null, at: null },
    ],
  },
  recipient: ADMIN,
  providerId: 'seed',
});

const newShape = () => ({
  periodStart: new Date('2026-10-02T10:00:00Z'),
  newAccounts: 1, newlyActivated: [2], reachedLimit: 0,
  delivery: { sent: 1, bounced: 0, failures: [] },
  providerId: 'seed',
});

test.describe('the snapshot helpers', () => {
  test('name the fields that carry personal data, and nothing of a current snapshot', () => {
    expect(personalDataFields(oldShape())).toEqual(['newAccounts', 'newlyActivated', 'reachedLimit', 'delivery.failures', 'recipient']);
    expect(personalDataFields(newShape())).toEqual([]);
    expect(figuresOnly(newShape())).toBeNull();
    expect(withoutAccount(newShape(), [MAIL_A])).toBeNull();
  });

  test('match an address only as a whole address (QA 9e198a0085d0)', () => {
    const snapshot = {
      delivery: {
        failures: [
          { to: 'other@x.io', kind: 'welcome', status: 'email.bounced', detail: '550 <ba@x.io> unknown' },
          { to: 'other@x.io', kind: 'welcome', status: 'email.bounced', detail: '550 <a@x.io.uk> unknown' },
          { to: 'other@x.io', kind: 'welcome', status: 'email.bounced', detail: '550 <a@x.io> unknown' },
        ],
      },
    };
    const change = withoutAccount(snapshot, ['a@x.io']);
    expect(change).not.toBeNull();
    expect((change!.update['delivery.failures'] as Array<{ detail: string }>).map((f) => f.detail)).toEqual([
      '550 <ba@x.io> unknown',
      '550 <a@x.io.uk> unknown',
    ]);
  });

  test('take one account out and leave the others', () => {
    const change = withoutAccount(oldShape(), [MAIL_A.toUpperCase()]);
    expect(change).not.toBeNull();
    expect(change!.deleteRecipient).toBe(false);
    expect(change!.update.newAccounts).toEqual([{ name: NAME_B, email: MAIL_B, when: null }]);
    expect(change!.update.newlyActivated).toEqual([{ name: NAME_B, email: MAIL_B, runs: 1 }]);
    expect(change!.update.reachedLimit).toEqual([{ name: NAME_B, email: MAIL_B }]);
    expect((change!.update['delivery.failures'] as { to: string }[]).map((f) => f.to)).toEqual([MAIL_B, MAIL_B]);
    expect(withoutAccount(oldShape(), [ADMIN])).toEqual({ update: {}, deleteRecipient: true });
  });
});

test.describe.serial('the clean-up script, against the emulator', () => {
  const ids = { old: `old-${Date.now()}`, current: `new-${Date.now()}` };

  test.beforeAll(async () => {
    await db().collection('usage_reports').doc(ids.old).set(oldShape());
    await db().collection('usage_reports').doc(ids.current).set(newShape());
  });
  test.afterAll(async () => {
    await Promise.all(Object.values(ids).map((id) => db().collection('usage_reports').doc(id).delete().catch(() => {})));
  });

  const unchanged = async () => {
    const data = (await db().collection('usage_reports').doc(ids.old).get()).data() || {};
    expect(personalDataFields(data).length, 'the old snapshot was changed').toBe(5);
  };
  const saysNothingPersonal = (out: string) => {
    for (const needle of [NAME_A, MAIL_A, NAME_B, MAIL_B, ADMIN, ids.old, ids.current]) {
      expect(out.toLowerCase().includes(needle.toLowerCase()), `the output names ${needle}`).toBe(false);
    }
  };

  test('refuses to run in CI', async () => {
    test.setTimeout(120_000);
    const run = runScript(['--database', DATABASE], { CI: 'true' });
    expect(run.status, run.out).toBe(2);
    expect(run.out).toContain('Refusing to run in CI');
    await unchanged();
  });

  test('a dry run counts and changes nothing', async () => {
    test.setTimeout(120_000);
    const run = runScript(['--database', DATABASE]);
    expect(run.status, run.out).toBe(0);
    expect(run.out).toMatch(/with personal data: [1-9]/);
    expect(run.out).toContain('DRY RUN');
    saysNothingPersonal(run.out);
    await unchanged();
  });

  test('--apply without the confirmation changes nothing', async () => {
    test.setTimeout(120_000);
    const run = runScript(['--database', DATABASE, '--apply']);
    expect(run.status, run.out).toBe(2);
    await unchanged();
  });

  test('--apply with the confirmation leaves figures only, and every figure', async () => {
    test.setTimeout(120_000);
    const run = runScript(['--database', DATABASE, '--apply'], { SCRUB_USAGE_REPORTS_CONFIRM: 'remove-personal-data' });
    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain('still carrying personal data: 0');
    saysNothingPersonal(run.out);

    const data = (await db().collection('usage_reports').doc(ids.old).get()).data() || {};
    expect(personalDataFields(data)).toEqual([]);
    const serialised = JSON.stringify(data).toLowerCase();
    for (const needle of [NAME_A, MAIL_A, NAME_B, MAIL_B, ADMIN]) {
      expect(serialised.includes(needle.toLowerCase()), `the snapshot still names ${needle}`).toBe(false);
    }
    expect(data.newAccounts).toBe(2);
    expect(data.newlyActivated).toEqual([4, 1]);
    expect(data.reachedLimit).toBe(2);
    expect(data.delivery.failures).toEqual([
      { kind: 'welcome', status: 'email.bounced', count: 2 },
      { kind: 'survey', status: 'email.complained', count: 1 },
    ]);
    expect(data.delivery.sent).toBe(4);
    expect(data.current).toEqual(oldShape().current);
    expect(data.totals).toEqual(oldShape().totals);
    expect(data.providerId).toBe('seed');
    expect('recipient' in data).toBe(false);

    const current = (await db().collection('usage_reports').doc(ids.current).get()).data() || {};
    expect({ ...current, periodStart: null }).toEqual({ ...newShape(), periodStart: null });
  });

  test('--database is refused outside the emulator', async () => {
    test.setTimeout(120_000);
    const run = runScript(['--database', DATABASE], { FIRESTORE_EMULATOR_HOST: '' });
    expect(run.status, run.out).toBe(2);
    expect(run.out).toContain('emulator only');
  });
});
