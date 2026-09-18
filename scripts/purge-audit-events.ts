/**
 * scripts/purge-audit-events.ts — delete `audit_events` records that have
 * outlived the retention period, and keep a copy of every one of them.
 *
 * **Why the period is 24 months.** `docs/DATA-RETENTION.md` promised only that
 * the journal is "retained for security accountability", and that is not a
 * retention period: Art. 13(2)(a) GDPR asks for the storage duration or, where
 * none can be given, the criteria used to determine it, and "we keep it" is
 * neither. Sonny decided the period on 18.09.2026 — 24 months from the recorded
 * action. Two annual security reviews fall inside that window, so a privileged
 * action stays traceable across both of them, while the administrator
 * identities the record names do not outlive the reason for holding them.
 *
 * **Why this is a script a person runs, and not a scheduled job.** Two reasons,
 * and both of them expire.
 *
 *   1. Nothing in the collection can be 24 months old. The product's first
 *      records are from 2026, so the earliest document that can reach the
 *      period does so in 2028. A scheduler built today would delete nothing for
 *      a year and a half, which is exactly long enough for it to rot unnoticed
 *      and then be trusted on the day it matters.
 *   2. A new workflow could not authenticate anyway. The Workload Identity
 *      provider condition was narrowed on 18.09.2026 to `deploy.yml` and
 *      `usage-report.yml` on `main`/`dev`; a third workflow asking for
 *      `id-token: write` is refused by the provider, not by a reviewer.
 *
 * **Automation has to exist before the first records reach 24 months — first
 * possible in 2028.** A promise in a privacy notice that depends on somebody
 * remembering to run a command is kept only by luck. Until then, this is the
 * tool that makes the promise keepable, and the dated obligation is written
 * into `docs/DATA-RETENTION.md` beside the period itself.
 *
 * Usage:
 *   npx tsx scripts/purge-audit-events.ts                        # dry run, 24 months
 *   npx tsx scripts/purge-audit-events.ts --older-than 30        # dry run, other period
 *   npx tsx scripts/purge-audit-events.ts --backup <file>        # dry run, backup elsewhere
 *   npx tsx scripts/purge-audit-events.ts --apply                # back up, then delete
 *
 * Authentication is Application Default Credentials, like the other production
 * scripts here (`gcloud auth application-default login`).
 *
 * **It prints counts and document ids and nothing else.** Every record in this
 * collection names the administrator who acted and the account acted on; the
 * survey scripts put addresses into a public Actions log once (15.09.2026) and
 * that is not a mistake to make twice. The selection below is therefore handed
 * document ids and timestamps only — there is no address in the data structure
 * the report is built from, so there is none to leak. The backup file is the
 * other half: it holds the full records, it is written to disk beside the
 * operator, and it must not be committed or left on a shared runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import {
  getFirestore,
  FieldPath,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'audit_events';

/** The period Sonny decided on 18.09.2026. `--older-than` overrides it. */
export const RETENTION_MONTHS = 24;

/** One read page. Large enough to keep the round trips down, small enough that
 *  a collection of any size is never held in memory in full: only the records
 *  that are actually being deleted are kept, and those have to be backed up. */
const PAGE_SIZE = 500;

/** Firestore allows 500 writes per batch; the deletion cascade in
 *  `lib/firebase-admin.ts` uses 400, and there is no reason to differ. */
const BATCH_SIZE = 400;

/* ------------------------------------------------------- the pure selection */

/** What the selection is allowed to see: an id and whatever stands in the
 *  document's `timestamp` field. Deliberately not the record — see the note on
 *  printing above. */
export interface DatedEvent {
  readonly id: string;
  readonly timestamp: unknown;
}

export interface Selection {
  /** Ids old enough to delete. */
  readonly expired: string[];
  /** Ids whose `timestamp` cannot be read as a point in time. Never deleted. */
  readonly undated: string[];
  /** How many records are inside the retention period. */
  readonly kept: number;
}

/**
 * Reads the `timestamp` field of an audit record as a point in time.
 *
 * Every writer in the tree stores `timestamp: new Date()` through the Admin
 * SDK, which lands as a Firestore `Timestamp` (`lib/firebase-admin.ts`,
 * `app/api/projects/[projectId]/commands/route.ts`,
 * `app/api/projects/[projectId]/readers/route.ts`, `scripts/mfa-reset.ts`,
 * `scripts/reset-quota-v23-fairness.mjs`). The other shapes below are what a
 * restored backup, an older SDK or a hand-written repair can leave behind, and
 * reading them costs four lines.
 *
 * A bare number is **not** accepted. Seconds and milliseconds are
 * indistinguishable by inspection, and reading seconds as milliseconds dates
 * the record to January 1970 — which makes an unreadable value look like the
 * oldest record in the collection and deletes it first. An ambiguous value is
 * reported as undated instead, which is the direction that cannot lose data.
 */
export function readEventTime(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value !== null && typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; _seconds?: unknown; seconds?: unknown };
    if (typeof candidate.toDate === 'function') {
      try {
        const asDate = candidate.toDate();
        if (asDate instanceof Date && !isNaN(asDate.getTime())) return asDate;
      } catch {
        return null;
      }
    }
    // The JSON form of a Timestamp, as a backup file holds it.
    const seconds = typeof candidate._seconds === 'number' ? candidate._seconds : candidate.seconds;
    if (typeof seconds === 'number' && isFinite(seconds)) return new Date(seconds * 1000);
  }

  return null;
}

/**
 * The moment a record has to predate to be older than `months` months.
 *
 * Month arithmetic in UTC and with the day clamped to the length of the target
 * month, so that 31 March minus one month is 28 February and not 3 March. The
 * default period of 24 months never meets the awkward case except on a leap
 * day, but `--older-than` takes any number and a purge that quietly reaches a
 * few days further back than it says is the wrong kind of surprise.
 */
export function cutoffFrom(now: Date, months: number): Date {
  const firstOfTargetMonth = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - months,
    1,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  );
  const cutoff = new Date(firstOfTargetMonth);
  const daysInTargetMonth = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(now.getUTCDate(), daysInTargetMonth));
  return cutoff;
}

/**
 * Splits a page of records into what goes, what stays and what cannot be dated.
 *
 * Strictly older than the cutoff: a record sitting exactly on the boundary has
 * been held for the period and not longer, and the next run takes it. Erring
 * towards one extra day of retention is recoverable; erring the other way is
 * not.
 */
export function selectExpired(events: readonly DatedEvent[], cutoff: Date): Selection {
  const expired: string[] = [];
  const undated: string[] = [];
  let kept = 0;

  for (const event of events) {
    const at = readEventTime(event.timestamp);
    if (at === null) {
      undated.push(event.id);
      continue;
    }
    if (at.getTime() < cutoff.getTime()) expired.push(event.id);
    else kept += 1;
  }

  return { expired, undated, kept };
}

/* ------------------------------------------------------------- the I/O shell */

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function months(): number {
  const raw = argValue('--older-than');
  if (raw === undefined) return RETENTION_MONTHS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--older-than takes a whole number of months of at least 1, not "${raw}"`);
  }
  return value;
}

interface Doomed {
  id: string;
  recordedAt: string | null;
  data: Record<string, unknown>;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const retention = months();

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db: Firestore = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const cutoff = cutoffFrom(new Date(), retention);
  console.log(`${COLLECTION} in ${PROJECT_ID}/${FIRESTORE_DB_ID}`);
  console.log(`retention: ${retention} month(s) — anything recorded before ${cutoff.toISOString()} expires`);

  // Paged by document id rather than filtered by `timestamp`, for two reasons:
  // a range filter on `timestamp` matches only the values Firestore holds as a
  // timestamp, so a record repaired into an ISO string would be invisible to
  // the very query meant to catch it; and the id ordering is total and stable,
  // so a cursor cannot skip or repeat a document. Only expired records are kept
  // in memory, and those are the ones the backup has to contain anyway.
  const doomed: Doomed[] = [];
  const undated: string[] = [];
  let total = 0;
  let kept = 0;
  let cursor: QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    const verdict = selectExpired(
      page.docs.map((doc) => ({ id: doc.id, timestamp: doc.get('timestamp') as unknown })),
      cutoff,
    );
    const expired = new Set(verdict.expired);
    for (const doc of page.docs) {
      if (!expired.has(doc.id)) continue;
      const data = doc.data() as Record<string, unknown>;
      doomed.push({
        id: doc.id,
        recordedAt: readEventTime(data.timestamp)?.toISOString() ?? null,
        data,
      });
    }

    total += page.size;
    kept += verdict.kept;
    undated.push(...verdict.undated);
    cursor = page.docs[page.size - 1];
    if (page.size < PAGE_SIZE) break;
  }

  const backupPath = path.resolve(
    argValue('--backup') ||
      path.join(process.cwd(), `audit-events-purge-${new Date().toISOString().slice(0, 10)}.json`),
  );

  // Written on every run, dry or not, and before anything is deleted. A dry run
  // that cannot write its backup is a run that must not be repeated with
  // --apply.
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        collection: COLLECTION,
        project: PROJECT_ID,
        database: FIRESTORE_DB_ID,
        writtenAt: new Date().toISOString(),
        retentionMonths: retention,
        cutoff: cutoff.toISOString(),
        applied: apply,
        documents: doomed,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('');
  console.log(`records scanned:      ${total}`);
  console.log(`inside the period:    ${kept}`);
  console.log(`expired:              ${doomed.length}`);
  console.log(`undated (kept):       ${undated.length}`);
  for (const record of doomed) console.log(`  - ${record.id}`);
  for (const id of undated) console.log(`  ? ${id} — no readable timestamp, left in place`);
  console.log('');
  console.log(`backup written: ${backupPath} (${doomed.length} record(s))`);
  console.log('The backup holds the full records, including who acted. Keep it off the repository and off shared runners.');

  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing was deleted. Re-run with --apply to purge.');
    return;
  }

  // The backup is the only copy once the delete runs, so it is read back rather
  // than assumed: a zero-byte file and a successful write look the same from
  // here otherwise.
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
    throw new Error(`the backup at ${backupPath} is missing or empty — nothing was deleted`);
  }

  if (doomed.length === 0) {
    console.log('');
    console.log('Nothing has reached the retention period. Nothing was deleted.');
    return;
  }

  let deleted = 0;
  for (let i = 0; i < doomed.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const record of doomed.slice(i, i + BATCH_SIZE)) {
      batch.delete(db.collection(COLLECTION).doc(record.id));
    }
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, doomed.length - i);
  }

  // Written last, so a record only exists for a purge that actually happened.
  // A journal that can lose entries without saying so is not a journal, and
  // this one entry is what keeps the deletion itself accountable. It names no
  // person: the script is the actor, and it carries the same placeholder the
  // migration script uses. It is subject to the same period and a later purge
  // will take it.
  await db.collection(COLLECTION).add({
    actorUid: 'script:purge-audit-events',
    actorEmail: 'system-maintenance',
    action: 'audit.retention.purge',
    targetUid: 'system',
    deletedCount: deleted,
    retentionMonths: retention,
    cutoff: cutoff.toISOString(),
    timestamp: new Date(),
  });

  console.log('');
  console.log(`deleted ${deleted} record(s); the purge itself is recorded in ${COLLECTION}`);
  console.log(`backup for the record: ${backupPath}`);
}

// Run only as the entry script; the spec imports the selection from here.
if (process.argv[1] && /purge-audit-events/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
