/**
 * Takes a verifiable census of a Firestore database.
 *
 * This is the baseline the migration is checked against: run it on the source
 * before exporting, run it on the target after importing, and diff the two. Without
 * it, "the import looked fine" is a feeling rather than a fact.
 *
 * Deliberately uses count() aggregations rather than fetching documents — an
 * aggregation bills roughly one read per 1000 index entries instead of one per
 * document, which matters after yesterday.
 *
 * Subcollections are counted via collection groups. `projects/{id}/runs/{runId}`
 * carries the signed evidence chain and is the one thing that must not be lost
 * quietly, so it is also sampled document by document.
 *
 * Usage:
 *   npx tsx scripts/firestore-inventory.ts --db <database-id> --out <file.json>
 */

import fs from 'node:fs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'cleancore-491216';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DB_ID = argValue('--db');
const OUT = argValue('--out');

if (!DB_ID) {
  console.error('Missing --db <database-id>');
  process.exit(1);
}

/** Subcollection names to census via collection group. */
const COLLECTION_GROUPS = ['runs', 'providers'];

interface Inventory {
  database: string;
  takenAt: string;
  collections: Record<string, number>;
  collectionGroups: Record<string, number>;
  totals: { topLevelDocuments: number; groupDocuments: number };
  manifest: {
    users: { uid: string; email: string }[];
    projects: { id: string; userId: string; name: string }[];
    runs: { path: string; runHash: string; signature: string; projectId: string; userId: string }[];
  };
}

async function census(db: Firestore): Promise<Inventory> {
  const collections = await db.listCollections();
  const counts: Record<string, number> = {};

  for (const col of collections) {
    const snap = await col.count().get();
    counts[col.id] = snap.data().count;
  }

  const groupCounts: Record<string, number> = {};
  for (const group of COLLECTION_GROUPS) {
    try {
      const snap = await db.collectionGroup(group).count().get();
      groupCounts[group] = snap.data().count;
    } catch (e) {
      groupCounts[group] = -1;
      console.warn(`  (collection group "${group}" could not be counted: ${(e as Error).message.slice(0, 60)})`);
    }
  }

  // Full manifests, not samples. Counts alone can match while contents differ, and
  // the promise here is that no user and no project is lost — that has to be
  // provable per document, not per total. At a few hundred documents the read cost
  // is trivial next to the guarantee.
  const usersSnap = await db.collection('users').get();
  const projectsSnap = await db.collection('projects').get();

  // Runs come from the collection group directly, so the signed evidence chain is
  // always captured — sampling projects at random misses it, since only a minority
  // of projects have runs at all.
  const runsSnap = await db.collectionGroup('runs').get();

  return {
    database: DB_ID!,
    takenAt: new Date().toISOString(),
    collections: counts,
    collectionGroups: groupCounts,
    totals: {
      topLevelDocuments: Object.values(counts).reduce((a, b) => a + b, 0),
      groupDocuments: Object.values(groupCounts).filter((n) => n >= 0).reduce((a, b) => a + b, 0),
    },
    manifest: {
      users: usersSnap.docs
        .map((d) => ({ uid: d.id, email: (d.data().email || '').toLowerCase() }))
        .sort((a, b) => a.uid.localeCompare(b.uid)),
      projects: projectsSnap.docs
        .map((d) => ({ id: d.id, userId: d.data().userId || '', name: d.data().name || '' }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      runs: runsSnap.docs
        .map((d) => ({
          path: d.ref.path,
          runHash: d.data().runHash || '',
          signature: d.data().signature || '',
          projectId: d.data().projectId || '',
          userId: d.data().userId || '',
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    },
  };
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], DB_ID!);

  console.log(`Census of ${DB_ID}`);
  const inv = await census(db);

  console.log('');
  console.log('COLLECTION                     DOCUMENTS');
  console.log('-'.repeat(44));
  Object.entries(inv.collections)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => console.log(`${name.padEnd(32)}${String(n).padStart(8)}`));

  console.log('');
  console.log('COLLECTION GROUP (subcollections)');
  console.log('-'.repeat(44));
  Object.entries(inv.collectionGroups).forEach(([name, n]) =>
    console.log(`${name.padEnd(32)}${String(n).padStart(8)}`),
  );

  console.log('');
  console.log(`top-level documents : ${inv.totals.topLevelDocuments}`);
  console.log(`subcollection docs  : ${inv.totals.groupDocuments}`);
  console.log(`users in manifest   : ${inv.manifest.users.length}`);
  console.log(`projects in manifest: ${inv.manifest.projects.length}`);
  console.log(`signed runs captured: ${inv.manifest.runs.length}`);
  const unsigned = inv.manifest.runs.filter((r) => !r.runHash || !r.signature).length;
  console.log(`runs missing a hash : ${unsigned}`);

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify(inv, null, 2));
    console.log('');
    console.log(`baseline written to ${OUT}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
