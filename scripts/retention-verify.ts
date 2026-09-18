/**
 * scripts/retention-verify.ts — compare `docs/DATA-RETENTION.md` with the
 * infrastructure it describes.
 *
 * Usage:
 *   npm run retention:verify        # read-only; needs a developer's gcloud login
 *
 * Why this exists. On 18.09.2026 the Backups section of the retention policy
 * claimed "Firestore scheduled exports (managed) to a dedicated GCS bucket",
 * "30 days rolling" and "restore is tested at least annually". None of it was
 * configured: `gcloud firestore backups schedules list` returned nothing,
 * `gcloud firestore backups list` returned nothing, and the backup bucket held
 * a single folder from a one-off export taken in August. The privacy policy was
 * promising users a thirty-day ageing window on the strength of that document.
 * The same day, the comment in `lib/rate-limit.ts` turned out to describe a
 * Firestore TTL policy on `rate_limits.expiresAt` that also did not exist.
 *
 * Both were found by hand, while answering a legal review. That is the gap this
 * closes: a retention policy is a *claim about infrastructure*, and until now
 * nothing in this repository compared the two. A document cannot drift away
 * from a setting that nobody ever reads back.
 *
 * What it will not do. It is read-only and it stays read-only: every gcloud
 * call below is a `list` or a `describe`, there is no `--apply`, and
 * `tests/retention-verify.spec.ts` fails if a mutating verb ever appears in
 * this file. Configuring backups is a deliberate human act — a script that can
 * "fix" the infrastructure to match the document would make the document true
 * by changing production, which is precisely the wrong direction. And it is not
 * in CI, for the same reason `npm run rules:verify` is not: CI must not hold
 * credentials that can read, let alone touch, production configuration.
 *
 * Where the expected values come from. Out of `docs/DATA-RETENTION.md`, by
 * parsing the sentences that state them. A checker that keeps its own copy of
 * "7 days" is a third place for the number to drift, and the one place that
 * would still look right while the other two disagreed. Where a value cannot be
 * read out of prose without the parse becoming fragile, it is hard-coded with a
 * comment naming the line it mirrors.
 *
 * The four things it checks, and how it learns each fact:
 *   1. Backup schedules — `gcloud firestore backups schedules list`
 *   2. The `rate_limits.expiresAt` TTL policy — `gcloud firestore fields ttls list`
 *   3. Cloud Logging retention on `_Default` — `gcloud logging buckets describe`
 *   4. Point-in-time recovery and region — `gcloud firestore databases describe`
 *
 * It prints configuration only. These APIs return no personal data, but the
 * responses are not dumped wholesale either: each check prints the values it
 * compared and nothing else.
 */

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

export const POLICY_FILE = 'docs/DATA-RETENTION.md';

/** Seconds in a day, for turning the API's `"604800s"` into "7 days". */
const SECONDS_PER_DAY = 86400;

/* ------------------------------------------------ what the document claims */

export interface ScheduleClaim {
  /** `daily` or `weekly` — the two recurrences the policy names. */
  recurrence: 'daily' | 'weekly';
  /** Upper-case day name for a weekly schedule, as the API spells it. */
  day?: string;
  retentionDays: number;
}

export interface RetentionClaims {
  project: string;
  database: string;
  region: string;
  schedules: ScheduleClaim[];
  /** The ceiling the privacy policy repeats: nothing survives beyond this. */
  ceilingDays: number;
  pitrWindowDays: number;
  ttl: { collectionGroup: string; field: string };
  logBuckets: { defaultDays: number; requiredDays: number };
}

/** A parse that half-succeeds is worse than one that fails: it would compare
 *  production against a value nobody wrote down. So every miss throws, and the
 *  message names the sentence that has moved. */
function claim(markdown: string, pattern: RegExp, what: string): RegExpMatchArray {
  const match = markdown.match(pattern);
  if (!match) {
    throw new Error(
      `${POLICY_FILE} no longer states ${what} in a form this script can read ` +
        `(pattern: ${pattern.source}). Either the sentence was rewritten — then fix the pattern — ` +
        'or the claim was dropped, in which case there is nothing left to verify and that is the finding.',
    );
  }
  return match;
}

/**
 * Read the expected values out of the policy document.
 *
 * Exported and pure so the spec can exercise it against the real file and
 * against fixtures, without a network or a gcloud login anywhere near it.
 */
export function parseRetentionClaims(markdown: string): RetentionClaims {
  // "project `cleancore-491216`, database `clean-core-eu`, region **europe-west1 (Belgium, EU)**"
  const where = claim(
    markdown,
    /project `([a-z0-9-]+)`, database `([a-z0-9-]+)`, region \*\*([a-z0-9-]+)/,
    'the project, database and region under "Storage location"',
  );

  // "a **daily** backup kept **7 days** and a **weekly** backup (Sunday) kept **28 days**"
  const backups = claim(
    markdown,
    /a \*\*daily\*\* backup kept \*\*(\d+) days\*\* and a \*\*weekly\*\* backup \(([A-Za-z]+)\) kept \*\*(\d+) days\*\*/,
    'the two backup schedules and their retention',
  );

  // "Nothing therefore survives beyond 30 days." — the number the privacy
  // policy repeats to users, which the schedules above have to stay under.
  const ceiling = claim(
    markdown,
    /Nothing therefore survives beyond (\d+) days/,
    'the ceiling that nothing survives beyond',
  );

  // "**Point-in-time recovery** is enabled on the same database; its window is 7 days"
  const pitr = claim(
    markdown,
    /\*\*Point-in-time recovery\*\* is enabled[^.]*?its window is (\d+) days/,
    'the point-in-time recovery window',
  );

  // The TTL claim lives in a table row, so it is read from the one line that
  // makes it: the collection id in the first cell, the field name immediately
  // before "drives a Firestore TTL policy".
  // The row, not the prose: the note below the table quotes the same phrase,
  // and a checker that read the quotation would be verifying a sentence about
  // an old comment instead of the registry entry.
  const ttlRow = markdown
    .split('\n')
    .find((line) => line.trimStart().startsWith('|') && line.includes('drives a Firestore TTL policy'));
  if (!ttlRow) {
    throw new Error(
      `${POLICY_FILE} no longer has a collection row claiming a Firestore TTL policy. ` +
        'If the policy was removed on purpose, remove this check with it; otherwise the claim has gone missing.',
    );
  }
  const collectionGroup = claim(ttlRow, /^\|\s*`([A-Za-z0-9_]+)\/\{/, 'the collection the TTL policy covers')[1];
  const field = claim(ttlRow, /`([A-Za-z0-9_]+)` drives a Firestore TTL policy/, 'the field the TTL policy uses')[1];

  // "...the Cloud Logging bucket `_Default` ... kept **30 days**" and the
  // `_Required` line beside it, which exists so the two are never read as one.
  const defaultBucket = claim(
    markdown,
    /Cloud Logging bucket `_Default`[\s\S]{0,200}?kept \*\*(\d+) days\*\*/,
    'the retention of the `_Default` log bucket',
  );
  const requiredBucket = claim(
    markdown,
    /`_Required` is a different bucket[\s\S]{0,200}?\*\*(\d+) days\*\*/,
    'the retention of the `_Required` log bucket',
  );

  return {
    project: where[1],
    database: where[2],
    region: where[3],
    schedules: [
      { recurrence: 'daily', retentionDays: Number(backups[1]) },
      { recurrence: 'weekly', day: backups[2].toUpperCase(), retentionDays: Number(backups[3]) },
    ],
    ceilingDays: Number(ceiling[1]),
    pitrWindowDays: Number(pitr[1]),
    ttl: { collectionGroup, field },
    logBuckets: { defaultDays: Number(defaultBucket[1]), requiredDays: Number(requiredBucket[1]) },
  };
}

/* --------------------------------------------------- what production serves */

export interface ScheduleFact {
  id: string;
  recurrence: 'daily' | 'weekly' | 'unknown';
  day?: string;
  retentionDays: number;
}

export interface TtlFact {
  collectionGroup: string;
  field: string;
  state: string;
}

export interface LogBucketFact {
  name: string;
  retentionDays: number;
  lifecycleState: string;
}

export interface DatabaseFact {
  locationId: string;
  pointInTimeRecoveryEnabled: boolean;
  versionRetentionDays: number;
  backupSchedulesEnabled: boolean;
}

export interface RetentionFacts {
  schedules: ScheduleFact[];
  ttls: TtlFact[];
  defaultLogBucket: LogBucketFact;
  requiredLogBucket: LogBucketFact;
  database: DatabaseFact;
}

/** `"604800s"` → 7. The API states retention as a duration string. */
function durationToDays(duration: unknown): number {
  const seconds = Number(String(duration ?? '').replace(/s$/, ''));
  return Number.isFinite(seconds) ? seconds / SECONDS_PER_DAY : Number.NaN;
}

/** The last path segment of a resource name — the schedule id, the field name. */
function lastSegment(name: unknown): string {
  return String(name ?? '').split('/').filter(Boolean).pop() ?? '';
}

/** Shape of `gcloud firestore backups schedules list --format=json`. */
export function readScheduleFacts(raw: unknown): ScheduleFact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const schedule = entry as { name?: string; retention?: string; dailyRecurrence?: unknown; weeklyRecurrence?: { day?: string } };
    const weekly = schedule.weeklyRecurrence;
    return {
      id: lastSegment(schedule.name),
      // The API expresses the recurrence by which of the two fields is present,
      // not by a value, so absence of both is a shape this script does not know.
      recurrence: weekly ? 'weekly' : schedule.dailyRecurrence ? 'daily' : 'unknown',
      day: weekly?.day ? String(weekly.day).toUpperCase() : undefined,
      retentionDays: durationToDays(schedule.retention),
    };
  });
}

/** Shape of `gcloud firestore fields ttls list --format=json`. */
export function readTtlFacts(raw: unknown): TtlFact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const ttl = entry as { name?: string; ttlConfig?: { state?: string } };
    // …/collectionGroups/<group>/fields/<field>
    const match = String(ttl.name ?? '').match(/collectionGroups\/([^/]+)\/fields\/(.+)$/);
    return {
      collectionGroup: match?.[1] ?? '',
      field: match?.[2] ?? '',
      state: String(ttl.ttlConfig?.state ?? 'UNKNOWN'),
    };
  });
}

/** Shape of `gcloud logging buckets describe <name> --format=json`. */
export function readLogBucketFact(raw: unknown): LogBucketFact {
  const bucket = raw as { name?: string; retentionDays?: number; lifecycleState?: string };
  return {
    name: lastSegment(bucket.name),
    // Cloud Logging omits `retentionDays` when it is the 30-day default, so an
    // absent value is 30 and not "unset" — reading it as 0 would raise a false
    // alarm on a bucket that is configured exactly as the document says.
    retentionDays: typeof bucket.retentionDays === 'number' ? bucket.retentionDays : 30,
    lifecycleState: String(bucket.lifecycleState ?? 'UNKNOWN'),
  };
}

/** Shape of `gcloud firestore databases describe --format=json`. */
export function readDatabaseFact(raw: unknown): DatabaseFact {
  const database = raw as {
    locationId?: string;
    pointInTimeRecoveryEnablement?: string;
    versionRetentionPeriod?: string;
    backupConfig?: { backupSchedulesEnabled?: boolean };
  };
  return {
    locationId: String(database.locationId ?? ''),
    pointInTimeRecoveryEnabled: database.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED',
    versionRetentionDays: durationToDays(database.versionRetentionPeriod),
    backupSchedulesEnabled: database.backupConfig?.backupSchedulesEnabled === true,
  };
}

/* ------------------------------------------------------------ the comparison */

export interface Verdict {
  check: string;
  ok: boolean;
  detail: string;
}

const days = (value: number) => (Number.isFinite(value) ? `${value} day${value === 1 ? '' : 's'}` : 'an unreadable period');

/**
 * Compare the document's claims with the facts, and return one verdict per
 * claim. Pure: the spec drives it with matching, mismatching and missing
 * fixtures, so the comparison is tested without a project id in sight.
 */
export function compareRetention(claims: RetentionClaims, facts: RetentionFacts): Verdict[] {
  const verdicts: Verdict[] = [];

  /* 1. Backup schedules. */
  for (const expected of claims.schedules) {
    const label = expected.recurrence === 'weekly' ? `weekly (${expected.day})` : 'daily';
    const live = facts.schedules.find(
      (s) => s.recurrence === expected.recurrence && (expected.recurrence !== 'weekly' || s.day === expected.day),
    );
    if (!live) {
      verdicts.push({
        check: `backup schedule: ${label}`,
        ok: false,
        detail: `the document promises one, the database has none — this is the August failure repeating`,
      });
      continue;
    }
    const ok = live.retentionDays === expected.retentionDays;
    verdicts.push({
      check: `backup schedule: ${label}`,
      ok,
      detail: ok
        ? `kept ${days(live.retentionDays)}, as documented`
        : `kept ${days(live.retentionDays)}, the document says ${days(expected.retentionDays)}`,
    });
  }

  // A schedule the document does not mention is not harmless: the policy states
  // a ceiling, and an undocumented schedule can hold data past it.
  const undocumented = facts.schedules.filter(
    (live) =>
      !claims.schedules.some(
        (c) => c.recurrence === live.recurrence && (c.recurrence !== 'weekly' || c.day === live.day),
      ),
  );
  if (undocumented.length > 0) {
    verdicts.push({
      check: 'backup schedules: nothing undocumented',
      ok: false,
      detail: `${undocumented.length} schedule(s) exist that ${POLICY_FILE} does not describe: ` +
        undocumented.map((s) => `${s.recurrence}${s.day ? ` (${s.day})` : ''} kept ${days(s.retentionDays)}`).join(', '),
    });
  }

  verdicts.push({
    check: 'backup schedules: enabled on the database',
    ok: facts.database.backupSchedulesEnabled,
    detail: facts.database.backupSchedulesEnabled
      ? 'the database reports backup schedules enabled'
      : 'the database reports backup schedules disabled, whatever the schedule list says',
  });

  /* 2. The TTL policy that keeps `rate_limits` from accumulating forever. */
  const ttl = facts.ttls.find(
    (t) => t.collectionGroup === claims.ttl.collectionGroup && t.field === claims.ttl.field,
  );
  verdicts.push({
    check: `TTL policy: ${claims.ttl.collectionGroup}.${claims.ttl.field}`,
    ok: ttl?.state === 'ACTIVE',
    detail: !ttl
      ? 'no TTL policy on that field — the documents accumulate, exactly as they did before 18.09.2026'
      : ttl.state === 'ACTIVE'
        ? 'ACTIVE'
        : `state is ${ttl.state}, not ACTIVE — nothing is being deleted yet`,
  });

  /* 3. Cloud Logging. `_Default` is where Cloud Run request logs land, client
   *    IP addresses included; `_Required` holds admin activity audit logs and
   *    is fixed by Google at 400 days. Confusing the two reads the wrong
   *    number back as proof of the user-facing promise, so both are checked. */
  const defaultOk = facts.defaultLogBucket.retentionDays === claims.logBuckets.defaultDays;
  verdicts.push({
    check: 'Cloud Logging: _Default retention',
    ok: defaultOk,
    detail: defaultOk
      ? `${days(facts.defaultLogBucket.retentionDays)}, as documented`
      : `${days(facts.defaultLogBucket.retentionDays)}, the document and the privacy notice say ${days(claims.logBuckets.defaultDays)}`,
  });
  const requiredOk = facts.requiredLogBucket.retentionDays === claims.logBuckets.requiredDays;
  verdicts.push({
    check: 'Cloud Logging: _Required retention',
    ok: requiredOk,
    detail: requiredOk
      ? `${days(facts.requiredLogBucket.retentionDays)}, as documented (admin audit logs, not visitor traffic)`
      : `${days(facts.requiredLogBucket.retentionDays)}, the document says ${days(claims.logBuckets.requiredDays)}`,
  });

  /* 4. Point-in-time recovery, and the region the whole document depends on. */
  verdicts.push({
    check: 'point-in-time recovery: enabled',
    ok: facts.database.pointInTimeRecoveryEnabled,
    detail: facts.database.pointInTimeRecoveryEnabled
      ? 'enabled'
      : 'DISABLED — for months this was the only real protection the database had',
  });
  const pitrOk = facts.database.versionRetentionDays === claims.pitrWindowDays;
  verdicts.push({
    check: 'point-in-time recovery: window',
    ok: pitrOk,
    detail: pitrOk
      ? `${days(facts.database.versionRetentionDays)}, as documented`
      : `${days(facts.database.versionRetentionDays)}, the document says ${days(claims.pitrWindowDays)}`,
  });
  const regionOk = facts.database.locationId === claims.region;
  verdicts.push({
    check: 'database region',
    ok: regionOk,
    detail: regionOk ? facts.database.locationId : `${facts.database.locationId}, the document says ${claims.region}`,
  });

  /* The derived promise. Every window above has to fit under the ceiling the
   * privacy policy quotes to users; a schedule lengthened by one click in the
   * console would otherwise make that sentence untrue with nothing to say so. */
  const longest = Math.max(
    facts.database.versionRetentionDays,
    ...facts.schedules.map((s) => s.retentionDays),
    0,
  );
  const ceilingOk = Number.isFinite(longest) && longest <= claims.ceilingDays;
  verdicts.push({
    check: `the ${claims.ceilingDays}-day ceiling holds`,
    ok: ceilingOk,
    detail: ceilingOk
      ? `the longest window is ${days(longest)}`
      : `the longest window is ${days(longest)}, past the ${days(claims.ceilingDays)} the privacy policy promises`,
  });

  return verdicts;
}

/* ------------------------------------------------------- reaching the facts */

/**
 * The gcloud commands this script is allowed to run, built from the project and
 * database the *document* names — so pointing the policy at another database
 * points the check at it too.
 *
 * Exported because `tests/retention-verify.spec.ts` asserts every one of them
 * is a `list` or a `describe`. The read-only promise is worth more as a test
 * than as a sentence in this comment.
 */
export const READ_ONLY_VERBS = ['list', 'describe'] as const;

export function gcloudCommands(target: { project: string; database: string }): Record<string, string[]> {
  const scope = [`--database=${target.database}`, `--project=${target.project}`, '--format=json'];
  return {
    backupSchedules: ['firestore', 'backups', 'schedules', 'list', ...scope],
    ttlPolicies: ['firestore', 'fields', 'ttls', 'list', ...scope],
    database: ['firestore', 'databases', 'describe', ...scope],
    // Log buckets are a project resource, not a database one, and the two
    // buckets every project has live in the `global` location. Hard-coded
    // because there is no sentence in the document that could name it without
    // inventing prose for a checker to read back.
    logBucketDefault: ['logging', 'buckets', 'describe', '_Default', '--location=global', `--project=${target.project}`, '--format=json'],
    logBucketRequired: ['logging', 'buckets', 'describe', '_Required', '--location=global', `--project=${target.project}`, '--format=json'],
  };
}

/** Run one read-only gcloud command and parse its JSON. Never scrape a table:
 *  the column layout is not an interface and changes without notice. */
function gcloudJson(label: string, args: string[]): unknown {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    // On Windows gcloud is a .cmd shim, which only spawns through a shell —
    // the same accommodation `scripts/rules-deploy.ts` makes.
    shell: process.platform === 'win32',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    throw new Error(
      code === 'ENOENT'
        ? 'gcloud is not on PATH. Install the Google Cloud CLI and sign in — a missing tool must never read as a passing check.'
        : `gcloud could not be started for ${label}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split('\n').slice(0, 3).join(' | ');
    throw new Error(
      `\`gcloud ${args.join(' ')}\` failed (exit ${result.status}): ${stderr || 'no output'}\n` +
        'If this is an authentication error, run `gcloud auth login` — an unanswered question is not a verified claim.',
    );
  }
  try {
    return JSON.parse(String(result.stdout ?? ''));
  } catch {
    throw new Error(`${label}: gcloud did not return JSON. Was --format=json dropped from the command?`);
  }
}

function collectFacts(claims: RetentionClaims): RetentionFacts {
  const commands = gcloudCommands(claims);
  return {
    schedules: readScheduleFacts(gcloudJson('backup schedules', commands.backupSchedules)),
    ttls: readTtlFacts(gcloudJson('TTL policies', commands.ttlPolicies)),
    defaultLogBucket: readLogBucketFact(gcloudJson('_Default log bucket', commands.logBucketDefault)),
    requiredLogBucket: readLogBucketFact(gcloudJson('_Required log bucket', commands.logBucketRequired)),
    database: readDatabaseFact(gcloudJson('database', commands.database)),
  };
}

/* -------------------------------------------------------------- the verdict */

function main(): number {
  const policyPath = path.join(process.cwd(), POLICY_FILE);
  const claims = parseRetentionClaims(readFileSync(policyPath, 'utf8'));

  console.log(`${POLICY_FILE} describes project ${claims.project}, database ${claims.database} (${claims.region}).`);
  console.log('Asking the project what is actually configured — read-only.\n');

  const verdicts = compareRetention(claims, collectFacts(claims));
  for (const verdict of verdicts) {
    console.log(`  ${verdict.ok ? 'OK  ' : 'FAIL'}  ${verdict.check}: ${verdict.detail}`);
  }

  const failed = verdicts.filter((v) => !v.ok);
  if (failed.length === 0) {
    console.log(`\nAll ${verdicts.length} checks agree with ${POLICY_FILE}.`);
    return 0;
  }
  console.error(
    `\n${failed.length} of ${verdicts.length} checks DISAGREE with ${POLICY_FILE}. ` +
      'Either the infrastructure was changed without the document, or the document promises something that was never configured — ' +
      'and the second is the one the privacy policy repeats to users. Fix the setting, or correct the document and the privacy notice with it.',
  );
  return 1;
}

// Run only as the entry script; the spec imports the pure parts from here, and
// the path is matched exactly so that a test runner's own argv can never start
// a production read by accident.
if (process.argv[1] && /scripts[\\/]retention-verify\.ts$/.test(process.argv[1])) {
  try {
    process.exit(main());
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
