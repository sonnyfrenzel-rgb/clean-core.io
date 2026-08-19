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
 */

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'cleancore-491216';

import { getAdminDb, deleteUserDataAndAccount } from '../lib/firebase-admin';
import { isTestAccount } from '../lib/test-accounts';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(argValue('--limit') || 0);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Refusing to run against an emulator — this script targets production.');
    process.exit(1);
  }

  const { db } = await getAdminDb();
  const users = await db.collection('users').get();

  const candidates: { uid: string; email: string; projects: number }[] = [];
  const keep: string[] = [];

  for (const doc of users.docs) {
    const email = (doc.data().email || '') as string;
    if (isTestAccount(email)) {
      candidates.push({ uid: doc.id, email, projects: 0 });
    } else {
      keep.push(email || '(no email)');
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

  const targets = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

  console.log(`users total          : ${users.size}`);
  console.log(`test accounts        : ${candidates.length}`);
  console.log(`real accounts (kept) : ${keep.length}`);
  console.log(`their projects       : ${candidates.reduce((n, c) => n + c.projects, 0)}`);
  console.log('');
  console.log('REAL accounts that will NOT be touched:');
  keep.sort().forEach((e) => console.log(`  keep  ${e}`));
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
