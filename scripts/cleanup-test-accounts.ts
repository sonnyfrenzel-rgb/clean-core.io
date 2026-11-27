/**
 * Removes the accounts the CI leaves behind.
 *
 * Every pipeline run registers a user to drive the E2E suite and never deletes it.
 * They had reached 125 of 155 documents in `users`, along with their projects, runs
 * and Firebase Auth accounts.
 *
 * Deletion goes through `deleteUserDataAndAccount` — the same audited GDPR erasure
 * cascade used by self-service and admin deletion. That matters: a plain document
 * delete would orphan each project's immutable `runs` subcollection, because
 * Firestore does not cascade. Hand-rolling this would silently leave data behind.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-accounts.ts            # dry run
 *   npx tsx scripts/cleanup-test-accounts.ts --apply    # delete
 *   npx tsx scripts/cleanup-test-accounts.ts --apply --limit 10
 *
 * `--limit` takes a positive whole number; any other value stops the script before it reads anything
 * (`scripts/lib/cleanup-limit.ts`). The accounts that are kept are counted, not listed: they are real people.
 */

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'cleancore-491216';

import { getAdminDb, deleteUserDataAndAccount } from '../lib/firebase-admin';
import { isTestAccount } from '../lib/test-accounts';
import { parseCleanupLimit } from './lib/cleanup-limit';

const APPLY = process.argv.includes('--apply');

async function main() {
  const parsed = parseCleanupLimit(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Refusing to run: ${parsed.error}`);
    process.exit(2);
  }
  const LIMIT = parsed.limit;

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Refusing to run against an emulator — this script targets production.');
    process.exit(1);
  }

  const { db } = await getAdminDb();
  const users = await db.collection('users').get();

  const candidates: { uid: string; email: string; projects: number }[] = [];
  let kept = 0;

  for (const doc of users.docs) {
    const email = (doc.data().email || '') as string;
    if (isTestAccount(email)) {
      candidates.push({ uid: doc.id, email, projects: 0 });
    } else {
      kept++;
    }
  }

  // Count what comes with them, so the blast radius is visible before deleting.
  const projects = await db.collection('projects').get();
  const byUser = new Map<string, number>();
  projects.docs.forEach((p: FirebaseFirestore.QueryDocumentSnapshot) => {
    const u = p.data().userId;
    if (u) byUser.set(u, (byUser.get(u) || 0) + 1);
  });
  candidates.forEach((c) => { c.projects = byUser.get(c.uid) || 0; });

  const targets = LIMIT === null ? candidates : candidates.slice(0, LIMIT);

  console.log(`users total          : ${users.size}`);
  console.log(`test accounts        : ${candidates.length}`);
  console.log(`real accounts (kept) : ${kept}`);
  console.log(`their projects       : ${candidates.reduce((n, c) => n + c.projects, 0)}`);
  console.log('');
  console.log(`${kept} real account(s) will NOT be touched (not listed).`);
  console.log('');

  if (!APPLY) {
    console.log(`Would delete ${targets.length} test account(s), e.g.:`);
    targets.slice(0, 10).forEach((c) => console.log(`  delete ${c.email} (${c.projects} project(s))`));
    if (targets.length > 10) console.log(`  … and ${targets.length - 10} more`);
    console.log('');
    console.log('DRY RUN — nothing was deleted. Re-run with --apply.');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const c of targets) {
    try {
      await deleteUserDataAndAccount(c.uid);
      done++;
      if (done % 10 === 0 || done === targets.length) {
        console.log(`  ${done}/${targets.length} deleted`);
      }
    } catch (error) {
      failed++;
      console.error(`  FAILED ${c.email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('');
  console.log(`Done. ${done} deleted, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
