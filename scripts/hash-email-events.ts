/**
 * scripts/hash-email-events.ts — one-off: bring the delivery records of mails
 * (`email_events`) written before 3.0.21 to the shape the privacy policy of
 * Fassung 1.1 describes (sections 2 and 6): the recipient address and the
 * subject only as keyed hashes.
 *
 * The rule is `planEmailEventRewrite` in `lib/email-event-hashing.ts` (pure;
 * the same hashes the send and the webhook write since this change):
 *
 *   - `to`: every address in clear becomes its keyed hash (HMAC-SHA256 under
 *     `PSEUDONYM_PEPPER`, `accountHashOf`); a record to a CI test account is
 *     marked `testRecipient`, so the weekly report still leaves it out;
 *   - `subject` goes; its keyed hash stays in `subjectHash`;
 *   - an address quoted in the provider's diagnostic (`lastDetail`,
 *     `timeline[].detail`) becomes "[address]".
 *
 * Kind, message id, status, times, uid and `expiresAt` stay — the 90 days run
 * on unchanged. A second run finds nothing to do.
 *
 * Usage:
 *   npx tsx scripts/hash-email-events.ts                     # dry run: counts only
 *   npx tsx scripts/hash-email-events.ts --apply             # rewrite the records
 *   npx tsx scripts/hash-email-events.ts --database <id>     # another database (default FIRESTORE_DB_ID)
 *
 * Needs `PSEUDONYM_PEPPER` — the deployment's own value, or the hashes it
 * writes match nothing an erasure looks for — and Application Default
 * Credentials (`gcloud auth application-default login`); with
 * `FIRESTORE_EMULATOR_HOST` set it talks to the emulator instead.
 *
 * **Whether and when this runs against production is the owner's decision.**
 * It is not wired into any workflow and refuses to run in CI: the repository
 * and its Actions logs are public. **It prints counts only** — no address, no
 * subject, no document id. There is no backup file: one would be another copy
 * of exactly what is being removed; the managed Firestore backups (at most 30
 * days, `docs/DATA-RETENTION.md`) are the way back.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { planEmailEventRewrite } from '../lib/email-event-hashing';
import { pseudonymPepperConfigured, PSEUDONYM_PEPPER_ENV } from '../lib/pseudonym';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'email_events';
const PAGE_SIZE = 500;
const BATCH_SIZE = 400;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('Refusing to run in CI: the Actions log of this repository is public, and this script is run by hand.');
    process.exit(2);
  }
  if (!pseudonymPepperConfigured()) {
    console.error(`${PSEUDONYM_PEPPER_ENV} is not set (at least 32 characters, the deployment's value); nothing was read or changed.`);
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

  const updates = new Map<string, Record<string, unknown>>();
  let scanned = 0;
  let addresses = 0;
  let subjects = 0;
  let details = 0;
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      scanned++;
      const update = planEmailEventRewrite(doc.data() as Record<string, unknown>, FieldValue.delete());
      if (!update) continue;
      updates.set(doc.id, update);
      if ('to' in update) addresses++;
      if ('subject' in update) subjects++;
      if ('lastDetail' in update || 'timeline' in update) details++;
    }
    cursor = page.docs[page.size - 1];
    if (page.size < PAGE_SIZE) break;
  }

  console.log('');
  console.log(`records scanned:                       ${scanned}`);
  console.log(`records to change:                     ${updates.size}`);
  console.log(`  recipient address to its hash:       ${addresses}`);
  console.log(`  subject to its hash:                 ${subjects}`);
  console.log(`  address removed from the diagnostic: ${details}`);

  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing was changed. Re-run with --apply to rewrite the records.');
    return;
  }

  const ids = [...updates.keys()];
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + BATCH_SIZE)) batch.update(db.collection(COLLECTION).doc(id), updates.get(id)!);
    await batch.commit();
    written += Math.min(BATCH_SIZE, ids.length - i);
  }
  console.log('');
  console.log(`rewrote ${written} record(s).`);
}

if (process.argv[1] && /hash-email-events/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message.split('\n')[0] : String(err));
    process.exit(1);
  });
}
