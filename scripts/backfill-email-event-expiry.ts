/**
 * scripts/backfill-email-event-expiry.ts — one-off: give the delivery records
 * of mails (`email_events`) written before 3.0.21 the deletion date every
 * record written since carries.
 *
 * Since 3.0.21 the send and the webhook set `expiresAt` (`lib/email-events.ts`)
 * and a Firestore TTL policy on it deletes the record then
 * (`docs/DATA-RETENTION.md`). A record written before has no `expiresAt`, so
 * the policy never touches it and it is kept for ever — against the 90 days
 * the privacy policy names (section 6, open value `mailDeliveryRecordRetention`).
 *
 * The rule is `emailEventBackfillExpiry` below (pure): the period is the live
 * writer's (`mailDeliveryRecordExpiry`, `lib/proof-log.ts`), counted from the
 * record's own time — `sentAt`, else the earliest event in `timeline`, else
 * `lastEventAt`, else `updatedAt`. A record that already has `expiresAt` is
 * never touched, so a second run finds nothing to do. A record with no usable
 * time is left alone and counted. A record whose date lies in the past gets it
 * all the same: the TTL policy then deletes it within about a day, which is
 * what the 90 days promised.
 *
 * Usage:
 *   npx tsx scripts/backfill-email-event-expiry.ts                  # dry run: counts only
 *   npx tsx scripts/backfill-email-event-expiry.ts --apply          # write expiresAt
 *   npx tsx scripts/backfill-email-event-expiry.ts --database <id>  # another database (default FIRESTORE_DB_ID)
 *   npm run retention:backfill-email-expiry [-- --apply]
 *
 * Needs Application Default Credentials (`gcloud auth application-default
 * login`); with `FIRESTORE_EMULATOR_HOST` set it talks to the emulator instead.
 *
 * **Whether and when this runs against production is the owner's decision.**
 * It is not wired into any workflow and refuses to run in CI: the repository
 * and its Actions logs are public. **It prints counts only** — no address, no
 * subject, no document id.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath, type QueryDocumentSnapshot, type Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { mailDeliveryRecordExpiry } from '../lib/proof-log';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'email_events';
const PAGE_SIZE = 500;
const BATCH_SIZE = 400;

/** A Firestore Timestamp, a Date or an ISO string, as a Date; anything else null. */
function asDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? asDate(t.toDate()) : null;
}

/**
 * The deletion date a pre-3.0.21 record gets, or null when it is not to be
 * touched: it already has `expiresAt` (`'has-expiry'`) or carries no time to
 * count from (`'no-time'`).
 */
export function emailEventBackfillExpiry(
  data: Record<string, unknown>,
): { expiresAt: Date } | { skip: 'has-expiry' | 'no-time' } {
  if (data.expiresAt !== undefined && data.expiresAt !== null) return { skip: 'has-expiry' };
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const earliestEvent = timeline
    .map((e) => asDate((e as { at?: unknown } | null)?.at))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const from = asDate(data.sentAt) ?? earliestEvent ?? asDate(data.lastEventAt) ?? asDate(data.updatedAt);
  if (!from) return { skip: 'no-time' };
  return { expiresAt: mailDeliveryRecordExpiry(from) };
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

  const updates = new Map<string, { expiresAt: Date; updateTime: Timestamp }>();
  let scanned = 0;
  let hasExpiry = 0;
  let noTime = 0;
  let alreadyDue = 0;
  const now = Date.now();
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      scanned++;
      const plan = emailEventBackfillExpiry(doc.data() as Record<string, unknown>);
      if ('skip' in plan) {
        if (plan.skip === 'has-expiry') hasExpiry++;
        else noTime++;
        continue;
      }
      updates.set(doc.id, { expiresAt: plan.expiresAt, updateTime: doc.updateTime });
      if (plan.expiresAt.getTime() <= now) alreadyDue++;
    }
    cursor = page.docs[page.size - 1];
    if (page.size < PAGE_SIZE) break;
  }

  console.log('');
  console.log(`records scanned:                         ${scanned}`);
  console.log(`records with expiresAt already:          ${hasExpiry}`);
  console.log(`records without a time (left alone):     ${noTime}`);
  console.log(`records to get expiresAt:                ${updates.size}`);
  console.log(`  of which the date has already passed:  ${alreadyDue}`);

  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing was changed. Re-run with --apply to write expiresAt.');
    return;
  }

  const ids = [...updates.keys()];
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + BATCH_SIZE)) {
      // `update` with the record's last update time as precondition: a record
      // deleted or written (a late webhook sets its own `expiresAt`) since it
      // was read fails the batch instead of being overwritten or coming back
      // as a stub. Batches already committed stay; a re-run picks up the rest.
      const { expiresAt, updateTime } = updates.get(id)!;
      batch.update(db.collection(COLLECTION).doc(id), { expiresAt }, { lastUpdateTime: updateTime });
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, ids.length - i);
  }
  console.log('');
  console.log(`wrote expiresAt on ${written} record(s).`);
}

if (process.argv[1] && /backfill-email-event-expiry/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message.split('\n')[0] : String(err));
    process.exit(1);
  });
}
