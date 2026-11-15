/**
 * scripts/backfill-usage-report-expiry.ts — one-off: give the weekly-report snapshots stored before 3.2.0
 * (`usage_reports`) the deletion date every snapshot written since carries.
 *
 * Since 3.2.0 the Friday job stores each snapshot with `expiresAt`, 24 months after the end of the week it covers
 * (`usageReportSnapshot`, `lib/usage-report.ts`), and a Firestore TTL policy on it deletes the snapshot then
 * (`docs/DATA-RETENTION.md`). A snapshot stored before has no `expiresAt`, so the policy never touches it and it
 * would be kept for ever — against the 24 months the privacy policy names.
 *
 * The rule is `usageReportBackfillExpiry` (`lib/usage-report.ts`, pure): the same 24 months, counted from the
 * snapshot's `periodEnd`, else its `generatedAt`. A snapshot that already has `expiresAt` is never touched, so a
 * second run finds nothing to do; one without a usable time is left alone and counted. The collection holds one
 * document a week, so it is read in one go.
 *
 * Usage:
 *   npx tsx scripts/backfill-usage-report-expiry.ts                  # dry run: counts only
 *   npx tsx scripts/backfill-usage-report-expiry.ts --apply          # write expiresAt
 *   npx tsx scripts/backfill-usage-report-expiry.ts --database <id>  # another database (default FIRESTORE_DB_ID)
 *   npm run retention:backfill-usage-report-expiry [-- --apply]
 *
 * Needs Application Default Credentials (`gcloud auth application-default login`); with `FIRESTORE_EMULATOR_HOST`
 * set it talks to the emulator instead.
 *
 * **Whether and when this runs against production is the owner's decision.** It is not wired into any workflow and
 * refuses to run in CI: the repository and its Actions logs are public. **It prints counts only** — no figure of a
 * report, no document id.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { usageReportBackfillExpiry } from '../lib/usage-report';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'usage_reports';
const BATCH_SIZE = 400;

/** A snapshot as the scan sees it — a Firestore query document snapshot satisfies it. */
export interface UsageReportBackfillDoc {
  id: string;
  data(): Record<string, unknown>;
  updateTime: Timestamp;
}

/** The two things the backfill needs from Firestore, so a test can hand it a fake. */
export interface UsageReportBackfillStore {
  all(): Promise<UsageReportBackfillDoc[]>;
  batch(): {
    update(id: string, data: { expiresAt: Date }, precondition: { lastUpdateTime: Timestamp }): void;
    commit(): Promise<unknown>;
  };
}

export interface UsageReportBackfillCounts {
  scanned: number;
  hasExpiry: number;
  noTime: number;
  /** Snapshots that get (dry run: would get) `expiresAt`. */
  toWrite: number;
  alreadyDue: number;
  /** Snapshots written; 0 on a dry run. */
  written: number;
}

/** Plan every snapshot and, with `apply`, write the dates in batches. A dry run writes nothing. */
export async function backfillUsageReportExpiry(
  store: UsageReportBackfillStore,
  options: { apply: boolean; now?: number },
): Promise<UsageReportBackfillCounts> {
  const now = options.now ?? Date.now();
  const counts: UsageReportBackfillCounts = { scanned: 0, hasExpiry: 0, noTime: 0, toWrite: 0, alreadyDue: 0, written: 0 };
  const pending: Array<{ id: string; expiresAt: Date; updateTime: Timestamp }> = [];
  for (const doc of await store.all()) {
    counts.scanned++;
    const plan = usageReportBackfillExpiry(doc.data());
    if ('skip' in plan) {
      if (plan.skip === 'has-expiry') counts.hasExpiry++;
      else counts.noTime++;
      continue;
    }
    counts.toWrite++;
    if (plan.expiresAt.getTime() <= now) counts.alreadyDue++;
    pending.push({ id: doc.id, expiresAt: plan.expiresAt, updateTime: doc.updateTime });
  }
  if (!options.apply) return counts;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = store.batch();
    // The snapshot's last update time as precondition: one deleted or rewritten since it was read (the scrub
    // script) fails the batch instead of being overwritten or coming back as a stub. A re-run picks up the rest.
    const chunk = pending.slice(i, i + BATCH_SIZE);
    for (const { id, expiresAt, updateTime } of chunk) batch.update(id, { expiresAt }, { lastUpdateTime: updateTime });
    await batch.commit();
    counts.written += chunk.length;
  }
  return counts;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('Refusing to run in CI: the Actions log of this repository is public, and this script is run by hand.');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  const databaseId = process.argv.includes('--database') ? argValue('--database') : FIRESTORE_DB_ID;
  if (!databaseId || databaseId.startsWith('--')) {
    console.error('--database needs a database id; nothing was changed.');
    process.exit(2);
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!getApps().length) {
    initializeApp(emulator ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], databaseId);
  console.log(`target: ${emulator ? `emulator (${emulator})` : 'production'}, project ${PROJECT_ID}, database ${databaseId}, collection ${COLLECTION}`);

  const store: UsageReportBackfillStore = {
    all: async () => (await db.collection(COLLECTION).get()).docs,
    batch() {
      const batch = db.batch();
      return {
        update: (id, data, precondition) => {
          batch.update(db.collection(COLLECTION).doc(id), data, precondition);
        },
        commit: () => batch.commit(),
      };
    },
  };
  const c = await backfillUsageReportExpiry(store, { apply });

  console.log('');
  console.log(`snapshots scanned:                       ${c.scanned}`);
  console.log(`snapshots with expiresAt already:        ${c.hasExpiry}`);
  console.log(`snapshots without a time (left alone):   ${c.noTime}`);
  console.log(`snapshots to get expiresAt:              ${c.toWrite}`);
  console.log(`  of which the date has already passed:  ${c.alreadyDue}`);
  console.log(apply ? `snapshots written:                       ${c.written}` : '\nDRY RUN — nothing written. Re-run with --apply.');
}

// Run only as a script, not when a spec imports the planner.
if (process.argv[1] && /backfill-usage-report-expiry/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
