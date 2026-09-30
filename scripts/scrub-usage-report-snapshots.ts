/**
 * scripts/scrub-usage-report-snapshots.ts — one-off: take the personal data
 * out of the weekly-report snapshots stored before 30.09.2026.
 *
 * Until that day `scripts/send-usage-report.ts` stored the whole report object
 * in `usage_reports`, and the report listed people: name and address of every
 * new account, every account with its first analysis and every account at its
 * limit, the recipient and provider text of every failed delivery, and the
 * administrator's own address as `recipient`. Snapshots written since carry
 * figures only (`usageReportSnapshot` in `lib/usage-report.ts`). This script
 * brings the old ones to the same shape: each list becomes the figure the
 * current report stores in its place (see `figuresOnly` in
 * `lib/usage-snapshot-scrub.ts`), and `recipient` is removed. Every figure the
 * snapshot held — `current`, `previous`, `totals`, the delivery counts — is
 * left untouched.
 *
 * Usage:
 *   npx tsx scripts/scrub-usage-report-snapshots.ts            # dry run: counts only
 *   SCRUB_USAGE_REPORTS_CONFIRM=remove-personal-data \
 *     npx tsx scripts/scrub-usage-report-snapshots.ts --apply  # rewrite the documents
 *
 * Production is reached with Application Default Credentials
 * (`gcloud auth application-default login`); with `FIRESTORE_EMULATOR_HOST`
 * set it talks to the emulator instead, and says which one it is using. Under
 * the emulator, `--database <id>` picks another database, so a spec can run the
 * real thing without touching what other specs have seeded; against production
 * the flag is refused and the database is always `FIRESTORE_DB_ID`.
 *
 * **Whether and when this runs against production is Sonny's decision.** It is
 * not wired into any workflow, and it refuses to run in CI at all: the
 * repository is public and so is every Actions log.
 *
 * **It prints counts and field names, never a value** — no name, no address, no
 * document id — so its output is safe wherever it ends up.
 *
 * **There is no backup file**, deliberately: a backup of these documents would
 * be one more copy of exactly the data being removed. The managed Firestore
 * backups (`docs/DATA-RETENTION.md`, at most 30 days) are the way back, and they
 * age out on their own.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { figuresOnly, personalDataFields } from '../lib/usage-snapshot-scrub';

const PROJECT_ID = 'cleancore-491216';
const CONFIRM_VARIABLE = 'SCRUB_USAGE_REPORTS_CONFIRM';
const CONFIRM_VALUE = 'remove-personal-data';

async function main() {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('Refusing to run in CI: the Actions log of this repository is public, and this script is run by hand.');
    process.exit(2);
  }

  const apply = process.argv.includes('--apply');
  if (apply && process.env[CONFIRM_VARIABLE] !== CONFIRM_VALUE) {
    console.error(`--apply rewrites documents. Set ${CONFIRM_VARIABLE}=${CONFIRM_VALUE} to confirm; nothing was changed.`);
    process.exit(2);
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const databaseFlag = process.argv.indexOf('--database');
  if (databaseFlag >= 0 && !emulator) {
    console.error('--database is for the emulator only; nothing was changed.');
    process.exit(2);
  }
  const databaseId = databaseFlag >= 0 ? process.argv[databaseFlag + 1] : FIRESTORE_DB_ID;
  if (!databaseId || databaseId.startsWith('--')) {
    console.error('--database needs a database id; nothing was changed.');
    process.exit(2);
  }
  if (!getApps().length) {
    initializeApp(emulator ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], databaseId);
  console.log(`target: ${emulator ? `emulator (${emulator})` : 'production'}, database ${databaseId}, collection usage_reports`);

  const snapshot = await db.collection('usage_reports').get();
  const byField = new Map<string, number>();
  const pending: { ref: DocumentReference; change: NonNullable<ReturnType<typeof figuresOnly>> }[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    for (const field of personalDataFields(data)) byField.set(field, (byField.get(field) || 0) + 1);
    const change = figuresOnly(data);
    if (change) pending.push({ ref: doc.ref, change });
  }

  console.log(`snapshots: ${snapshot.size}, with personal data: ${pending.length}`);
  for (const [field, count] of [...byField].sort()) console.log(`  ${field}: ${count}`);

  if (!apply) {
    console.log('DRY RUN: nothing changed. Re-run with --apply and the confirmation variable to rewrite.');
    return;
  }

  // 400 writes per batch, under Firestore's 500.
  let written = 0;
  for (let i = 0; i < pending.length; i += 400) {
    const batch = db.batch();
    for (const { ref, change } of pending.slice(i, i + 400)) {
      batch.update(ref, {
        ...change.update,
        ...(change.deleteRecipient ? { recipient: FieldValue.delete() } : {}),
      });
    }
    await batch.commit();
    written += Math.min(400, pending.length - i);
  }

  // Read back: the run is done when nothing is left, not when the writes returned.
  const after = await db.collection('usage_reports').get();
  const left = after.docs.filter((d) => personalDataFields(d.data()).length > 0).length;
  console.log(`rewritten: ${written}, still carrying personal data: ${left}`);
  if (left > 0) process.exit(1);
}

main().catch((error) => {
  // The message only, not the error object with its request details.
  console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
