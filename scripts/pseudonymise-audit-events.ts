/**
 * scripts/pseudonymise-audit-events.ts — one-off: bring the rows of the
 * security log (`audit_events`) written before 3.0.21 to the shape the legal
 * review of 05.11.2026 asks for.
 *
 * Two changes, both from `planAuditBackfill` in `lib/audit-pseudonymisation.ts`
 * (pure; the same rule the account erasure applies since this change):
 *
 *   1. A self-service row (an account acting on its own key, projects,
 *      readers, invitations or repair drafts) by an account that still exists
 *      loses `actorEmail` — rows of that kind written before 3.0.21 carried the
 *      account's address; the current code records them by uid alone.
 *   2. A row naming an account that no longer exists — neither a sign-in
 *      (Firebase Auth) nor a profile (`users/{uid}`) — has that uid replaced by
 *      the keyed hash (HMAC-SHA256 under `PSEUDONYM_PEPPER`, the hash of the
 *      account's address where some row reveals it, else of its uid) and the
 *      address of that side (`actorEmail`, `targetEmail`) removed. This also
 *      replaces the `acct_…` placeholder an erasure before this change wrote.
 *
 * Rows of scripts and migrations, and the address of a live administrator on
 * an administrative row, stay as they are. A second run finds nothing to do.
 *
 * Usage:
 *   npx tsx scripts/pseudonymise-audit-events.ts                     # dry run: counts only
 *   npx tsx scripts/pseudonymise-audit-events.ts --apply             # rewrite the rows
 *   npx tsx scripts/pseudonymise-audit-events.ts --database <id>     # another database (default FIRESTORE_DB_ID)
 *
 * Needs `PSEUDONYM_PEPPER` — the deployment's own value, or every hash it
 * writes will match nothing the erasure writes — and Application Default
 * Credentials (`gcloud auth application-default login`); with
 * `FIRESTORE_EMULATOR_HOST` (and `FIREBASE_AUTH_EMULATOR_HOST`) set it talks to
 * the emulators instead.
 *
 * **Whether and when this runs against production is the owner's decision.**
 * It is not wired into any workflow and refuses to run in CI: the repository
 * and its Actions logs are public. **It prints counts only** — no uid, no
 * address, no document id. There is no backup file: one would be another copy
 * of exactly what is being removed; the managed Firestore backups (at most 30
 * days, `docs/DATA-RETENTION.md`) are the way back.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldPath, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { accountUidsOf, planAuditBackfill } from '../lib/audit-pseudonymisation';
import { pseudonymPepperConfigured, PSEUDONYM_PEPPER_ENV } from '../lib/pseudonym';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'audit_events';
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
  const auth = getAuth(getApps()[0]);
  console.log(`target: ${emulator ? `emulator (${emulator})` : 'production'}, project ${PROJECT_ID}, database ${databaseId}, collection ${COLLECTION}`);

  // Every row, paged by document id (a total, stable order).
  const rows: Array<{ id: string; data: Record<string, unknown> }> = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) rows.push({ id: doc.id, data: doc.data() as Record<string, unknown> });
    cursor = page.docs[page.size - 1];
    if (page.size < PAGE_SIZE) break;
  }

  // Which of the accounts the rows name still exist: a sign-in or a profile.
  const uids = [...new Set(rows.flatMap((r) => accountUidsOf(r.data)))];
  const existing = new Set<string>();
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    const found = await auth.getUsers(chunk.map((uid) => ({ uid })));
    for (const user of found.users) existing.add(user.uid);
    const profiles = await db.getAll(...chunk.map((uid) => db.collection('users').doc(uid)));
    for (const profile of profiles) if (profile.exists) existing.add(profile.id);
  }

  // Not one of them found means the wrong project or database, not a log of
  // nobody but deleted accounts — and pseudonymising live accounts cannot be
  // undone. Stop.
  if (uids.length > 0 && existing.size === 0) {
    console.error('None of the accounts the log names exists in this project and database — wrong target? Nothing was changed.');
    process.exit(2);
  }

  const plan = planAuditBackfill(rows, existing, FieldValue.delete());
  const c = plan.counts;
  console.log('');
  console.log(`rows scanned:                          ${c.scanned}`);
  console.log(`accounts named, still existing:        ${existing.size}`);
  console.log(`accounts named, no longer existing:    ${c.deletedAccounts}`);
  console.log(`rows to change:                        ${c.changed}`);
  console.log(`  self-service rows losing an address: ${c.selfServiceAddressesRemoved}`);
  console.log(`  rows of deleted accounts:            ${c.rowsOfDeletedAccounts} (${c.sidesPseudonymised} actor/subject entries)`);

  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing was changed. Re-run with --apply to rewrite the rows.');
    return;
  }

  const ids = [...plan.updates.keys()];
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + BATCH_SIZE)) batch.update(db.collection(COLLECTION).doc(id), plan.updates.get(id)!);
    await batch.commit();
    written += Math.min(BATCH_SIZE, ids.length - i);
  }

  // One row of the run itself, naming no person, as the purge writes one.
  if (written > 0) {
    await db.collection(COLLECTION).add({
      actorUid: 'script:pseudonymise-audit-events',
      action: 'audit.backfill.pseudonymise',
      targetUid: 'system',
      changedCount: written,
      selfServiceAddressesRemoved: c.selfServiceAddressesRemoved,
      rowsOfDeletedAccounts: c.rowsOfDeletedAccounts,
      timestamp: new Date(),
    });
  }
  console.log('');
  console.log(`rewrote ${written} row(s)${written > 0 ? `; the run itself is recorded in ${COLLECTION}` : ''}.`);
}

if (process.argv[1] && /pseudonymise-audit-events/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message.split('\n')[0] : String(err));
    process.exit(1);
  });
}
