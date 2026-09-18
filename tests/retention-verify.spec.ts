import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  POLICY_FILE,
  READ_ONLY_VERBS,
  compareRetention,
  gcloudCommands,
  parseRetentionClaims,
  readDatabaseFact,
  readLogBucketFact,
  readScheduleFacts,
  readTtlFacts,
  type RetentionClaims,
  type RetentionFacts,
} from '../scripts/retention-verify';

/**
 * A retention policy is a claim about infrastructure, and for months nobody
 * compared the two.
 *
 * `docs/DATA-RETENTION.md` described managed exports to a GCS bucket, thirty
 * days rolling, and an annual restore test. None of it existed: no backup
 * schedules, no backups, one folder from a one-off export in August. The
 * privacy policy was promising users the thirty days on the strength of that
 * paragraph. The `rate_limits` TTL policy that `lib/rate-limit.ts` described in
 * a comment did not exist either. Both were found by hand.
 *
 * `scripts/retention-verify.ts` is the comparison. What is tested here is the
 * half that has no credentials in it: reading the expected values out of the
 * document, reading the gcloud responses into facts, and the verdicts that come
 * out of putting the two side by side — including the failures, which are the
 * only interesting half of a checker. Nothing here runs gcloud or touches a
 * project; the specs that would need a login belong nowhere near CI, exactly as
 * `tests/rules-deploy-order.spec.ts` decided for the rules.
 */

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'retention-verify.ts');
const source = fs.readFileSync(SCRIPT, 'utf8');
const policy = fs.readFileSync(path.join(ROOT, POLICY_FILE), 'utf8');

/* ------------------------------------------------------------------ fixtures */

/** The shapes the four gcloud commands actually returned on 18.09.2026, with
 *  the project and database renamed: a fixture that does not match the real
 *  response shape tests only itself. */
const RAW_SCHEDULES = [
  {
    createTime: '2026-09-18T07:33:47.400775Z',
    name: 'projects/example-project/databases/example-db/backupSchedules/58a096b0-0000-0000-0000-000000000001',
    retention: '2419200s',
    weeklyRecurrence: { day: 'SUNDAY' },
  },
  {
    createTime: '2026-09-18T07:33:46.025601Z',
    dailyRecurrence: {},
    name: 'projects/example-project/databases/example-db/backupSchedules/66c2fb46-0000-0000-0000-000000000002',
    retention: '604800s',
  },
];

const RAW_TTLS = [
  {
    indexConfig: { usesAncestorConfig: true },
    name: 'projects/example-project/databases/example-db/collectionGroups/rate_limits/fields/expiresAt',
    ttlConfig: { state: 'ACTIVE' },
  },
];

const RAW_DATABASE = {
  backupConfig: { backupSchedulesEnabled: true },
  locationId: 'europe-west1',
  name: 'projects/example-project/databases/example-db',
  pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
  type: 'FIRESTORE_NATIVE',
  versionRetentionPeriod: '604800s',
};

/** Facts that agree with the document in every respect, as the baseline each
 *  failure case below breaks in exactly one place. */
const agreeingFacts = (): RetentionFacts => ({
  schedules: readScheduleFacts(RAW_SCHEDULES),
  ttls: readTtlFacts(RAW_TTLS),
  defaultLogBucket: readLogBucketFact({ name: 'projects/p/locations/global/buckets/_Default', retentionDays: 30, lifecycleState: 'ACTIVE' }),
  requiredLogBucket: readLogBucketFact({ name: 'projects/p/locations/global/buckets/_Required', retentionDays: 400, lifecycleState: 'ACTIVE' }),
  database: readDatabaseFact(RAW_DATABASE),
});

const claims = (): RetentionClaims => parseRetentionClaims(policy);

const verdict = (facts: RetentionFacts, check: string) => {
  const found = compareRetention(claims(), facts).find((v) => v.check.includes(check));
  expect(found, `no verdict whose name contains "${check}"`).toBeTruthy();
  return found!;
};

const failures = (facts: RetentionFacts) => compareRetention(claims(), facts).filter((v) => !v.ok);

/* ------------------------------------------- the document is read, not copied */

test.describe('the expected values come out of the document', () => {
  test('every claim the checker needs is still stated in the policy', () => {
    const c = claims();
    expect(c.project).toBe('cleancore-491216');
    expect(c.database).toBe('clean-core-eu');
    expect(c.region).toBe('europe-west1');
    expect(c.schedules).toEqual([
      { recurrence: 'daily', retentionDays: 7 },
      { recurrence: 'weekly', day: 'SUNDAY', retentionDays: 28 },
    ]);
    expect(c.ceilingDays, 'the ceiling the privacy policy quotes to users').toBe(30);
    expect(c.pitrWindowDays).toBe(7);
    expect(c.ttl).toEqual({ collectionGroup: 'rate_limits', field: 'expiresAt' });
    expect(c.logBuckets).toEqual({ defaultDays: 30, requiredDays: 400 });
  });

  test('the TTL claim is read from the registry row, not from the prose quoting it', () => {
    // The note under the table quotes the old `lib/rate-limit.ts` comment
    // verbatim. Reading that sentence would verify a description of the bug.
    const doc = policy.replace(
      '| `rate_limits/{key}` |',
      '| `window_counters/{key}` |',
    );
    expect(parseRetentionClaims(doc).ttl.collectionGroup).toBe('window_counters');
  });

  test('a claim that goes missing is an error, not a default', () => {
    // A checker that silently falls back to its own number is the third place
    // for the number to drift — and the one that would still look right.
    const withoutBackups = policy.replace(/a \*\*daily\*\* backup kept \*\*7 days\*\*/, 'backups are taken regularly');
    expect(() => parseRetentionClaims(withoutBackups)).toThrow(/backup schedules/);

    const withoutTtl = policy.split('\n').filter((l) => !l.includes('drives a Firestore TTL policy')).join('\n');
    expect(() => parseRetentionClaims(withoutTtl)).toThrow(/TTL policy/);

    const withoutLogs = policy.replace('Cloud Logging bucket `_Default`', 'Cloud Logging bucket');
    expect(() => parseRetentionClaims(withoutLogs)).toThrow(/_Default/);

    const withoutPitr = policy.replace('its window is 7 days', 'its window is short');
    expect(() => parseRetentionClaims(withoutPitr)).toThrow(/point-in-time recovery window/);
  });

  test('the error names the file and says what to do about it', () => {
    let message = '';
    try {
      parseRetentionClaims('# nothing here\n');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain(POLICY_FILE);
    expect(message.length, 'a bare "no match" tells nobody which sentence moved').toBeGreaterThan(80);
  });
});

/* ------------------------------------------ the responses are read into facts */

test.describe('the gcloud responses are read, not scraped', () => {
  test('backup schedules keep their recurrence, day and retention in days', () => {
    expect(readScheduleFacts(RAW_SCHEDULES)).toEqual([
      { id: '58a096b0-0000-0000-0000-000000000001', recurrence: 'weekly', day: 'SUNDAY', retentionDays: 28 },
      { id: '66c2fb46-0000-0000-0000-000000000002', recurrence: 'daily', day: undefined, retentionDays: 7 },
    ]);
  });

  test('an empty list is an empty list — the state this whole script exists for', () => {
    // `gcloud firestore backups schedules list` returned exactly this, and the
    // document claimed thirty days of backups anyway.
    expect(readScheduleFacts([])).toEqual([]);
    expect(readTtlFacts([])).toEqual([]);
  });

  test('a TTL policy is read down to its state', () => {
    expect(readTtlFacts(RAW_TTLS)).toEqual([{ collectionGroup: 'rate_limits', field: 'expiresAt', state: 'ACTIVE' }]);
    expect(readTtlFacts([{ name: 'a/b/collectionGroups/x/fields/y' }])[0].state).toBe('UNKNOWN');
  });

  test('a log bucket without retentionDays is the 30-day default, not zero', () => {
    // Cloud Logging omits the field when the bucket is at its default. Reading
    // that as 0 would raise an alarm on a bucket configured as documented.
    expect(readLogBucketFact({ name: 'projects/p/locations/global/buckets/_Default' }).retentionDays).toBe(30);
    expect(readLogBucketFact({ name: 'projects/p/locations/global/buckets/_Required', retentionDays: 400 }).retentionDays).toBe(400);
  });

  test('the database answers for recovery, region and whether schedules run at all', () => {
    expect(readDatabaseFact(RAW_DATABASE)).toEqual({
      locationId: 'europe-west1',
      pointInTimeRecoveryEnabled: true,
      versionRetentionDays: 7,
      backupSchedulesEnabled: true,
    });
    expect(readDatabaseFact({ pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED' }).pointInTimeRecoveryEnabled).toBe(false);
  });
});

/* -------------------------------------------------------------- the verdicts */

test.describe('production and the document, side by side', () => {
  test('infrastructure that matches the document passes every check', () => {
    const verdicts = compareRetention(claims(), agreeingFacts());
    expect(verdicts.length).toBeGreaterThanOrEqual(9);
    expect(failures(agreeingFacts()).map((v) => v.check)).toEqual([]);
  });

  test('a shortened backup retention fails, and says both numbers', () => {
    const facts = agreeingFacts();
    facts.schedules = facts.schedules.map((s) => (s.recurrence === 'weekly' ? { ...s, retentionDays: 14 } : s));
    const v = verdict(facts, 'weekly');
    expect(v.ok).toBe(false);
    expect(v.detail).toContain('14 days');
    expect(v.detail, 'a mismatch that does not name the documented value cannot be acted on').toContain('28 days');
    expect(failures(facts)).toHaveLength(1);
  });

  test('no schedules at all — the August state — fails both of them', () => {
    const facts = agreeingFacts();
    facts.schedules = [];
    facts.database = { ...facts.database, backupSchedulesEnabled: false };
    const names = failures(facts).map((v) => v.check);
    expect(names).toContain('backup schedule: daily');
    expect(names).toContain('backup schedule: weekly (SUNDAY)');
    expect(names).toContain('backup schedules: enabled on the database');
    expect(verdict(facts, 'daily').detail).toContain('the database has none');
  });

  test('a schedule nobody wrote down is a finding, not a bonus', () => {
    const facts = agreeingFacts();
    facts.schedules = [...facts.schedules, { id: 'x', recurrence: 'weekly', day: 'MONDAY', retentionDays: 90 }];
    const undocumented = verdict(facts, 'nothing undocumented');
    expect(undocumented.ok).toBe(false);
    expect(undocumented.detail).toContain('MONDAY');
    // …and it also breaks the promise the privacy policy makes to users.
    expect(verdict(facts, 'ceiling holds').ok).toBe(false);
    expect(verdict(facts, 'ceiling holds').detail).toContain('90 days');
  });

  test('a missing or half-built TTL policy fails', () => {
    const missing = agreeingFacts();
    missing.ttls = [];
    expect(verdict(missing, 'TTL policy').ok).toBe(false);
    expect(verdict(missing, 'TTL policy').detail).toContain('accumulate');

    const creating = agreeingFacts();
    creating.ttls = [{ collectionGroup: 'rate_limits', field: 'expiresAt', state: 'CREATING' }];
    expect(verdict(creating, 'TTL policy').ok).toBe(false);
    expect(verdict(creating, 'TTL policy').detail).toContain('CREATING');

    // The right state on the wrong field is still no policy on the right one.
    const elsewhere = agreeingFacts();
    elsewhere.ttls = [{ collectionGroup: 'rate_limits', field: 'updatedAt', state: 'ACTIVE' }];
    expect(verdict(elsewhere, 'TTL policy').ok).toBe(false);
  });

  test('the two log buckets are never read as one', () => {
    // Reading `_Required`'s 400 days as the answer would "confirm" a 30-day
    // promise with a number that has nothing to do with visitor IP addresses.
    const facts = agreeingFacts();
    facts.defaultLogBucket = { ...facts.defaultLogBucket, retentionDays: 400 };
    const v = verdict(facts, '_Default');
    expect(v.ok).toBe(false);
    expect(v.detail).toContain('400 days');
    expect(v.detail).toContain('privacy notice');
    expect(verdict(facts, '_Required').ok, 'the other bucket is judged on its own').toBe(true);
  });

  test('point-in-time recovery is checked as state and as window', () => {
    const off = agreeingFacts();
    off.database = { ...off.database, pointInTimeRecoveryEnabled: false };
    expect(verdict(off, 'recovery: enabled').ok).toBe(false);

    const shorter = agreeingFacts();
    shorter.database = { ...shorter.database, versionRetentionDays: 1 };
    expect(verdict(shorter, 'recovery: window').ok).toBe(false);
    expect(verdict(shorter, 'recovery: window').detail).toContain('1 day');
  });

  test('a database that moved region fails, because everything above assumes it', () => {
    const facts = agreeingFacts();
    facts.database = { ...facts.database, locationId: 'us-west1' };
    const v = verdict(facts, 'database region');
    expect(v.ok).toBe(false);
    expect(v.detail).toContain('us-west1');
  });
});

/* -------------------------------------------------------- read-only, in fact */

test.describe('the script cannot change anything', () => {
  /** Anything that would write, in gcloud's vocabulary. */
  const MUTATING = [
    'create', 'update', 'delete', 'set', 'add', 'remove', 'patch',
    'enable', 'disable', 'import', 'export', 'restore', 'clone', 'undelete', 'apply',
  ];

  test('every command it may run is a list or a describe', () => {
    const commands = Object.entries(gcloudCommands({ project: 'example-project', database: 'example-db' }));
    expect(commands.length).toBeGreaterThanOrEqual(5);
    for (const [name, args] of commands) {
      const words = args.filter((a) => !a.startsWith('--') && !a.startsWith('_'));
      const verb = words[words.length - 1];
      expect([...READ_ONLY_VERBS], `${name} ends in "${verb}"`).toContain(verb);
      for (const word of words) {
        expect(MUTATING, `${name} contains the mutating verb "${word}"`).not.toContain(word);
      }
      expect(args, `${name} carries an --apply flag`).not.toContain('--apply');
    }
  });

  test('no mutating verb appears as a literal anywhere in the file', () => {
    // String literals only: prose in the comments says "created" and "deleted"
    // about what happened in production, which is history and not a command.
    const literals = [...source.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)].map((m) => m[1] ?? m[2] ?? '');
    for (const literal of literals) {
      expect(MUTATING, `the file passes "${literal}" somewhere`).not.toContain(literal.toLowerCase());
      expect(literal.toLowerCase(), 'an --apply flag has appeared').not.toBe('--apply');
    }
  });

  test('there is exactly one way out of the process, and it runs gcloud', () => {
    expect((source.match(/spawnSync/g) ?? []).length, 'more than the one runner and its import').toBeLessThanOrEqual(2);
    expect(source).not.toMatch(/\bexecSync\b|\bspawn\(|\bfetch\(/);
    // Reading the policy is the only file access; nothing here writes.
    expect(source).toMatch(/import \{ readFileSync \} from 'fs'/);
    expect(source).not.toMatch(/writeFileSync|appendFileSync|unlinkSync|rmSync|mkdirSync/);
  });

  test('the repository can run it, and the policy names it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['retention:verify']).toBe('tsx scripts/retention-verify.ts');
    expect(policy, 'the policy no longer names the command that proves it').toContain('npm run retention:verify');
    expect(policy).toContain('scripts/retention-verify.ts');
    // The account of the failure stays: it is the reason the script exists.
    expect(policy, 'the record of what the document claimed and did not have was removed')
      .toContain('What this section said until 2026-09-18, and why it was wrong');
  });
});
