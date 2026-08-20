/**
 * Reconciles the migration target with the source, document by document.
 *
 * The bulk export/import is a point-in-time copy, and users keep writing after it.
 * A silent cutover therefore loses whatever was written between the export and the
 * moment Cloud Run switches traffic to the new revision — which is exactly what the
 * verification caught: a real project created twenty minutes after the export.
 *
 * This closes that gap. Run it immediately after traffic has switched, when the app
 * writes to the new database and the old one is quiet: everything written to the old
 * database in the meantime is carried across.
 *
 * Only ever writes, never deletes. If a document exists in the target but not in the
 * source it is reported and left alone — deleting on a hunch is how migrations lose
 * data, and nothing here is authoritative enough to justify it.
 *
 * Usage:
 *   npx tsx scripts/firestore-delta-sync.ts --source <db> --target <db>            # dry run
 *   npx tsx scripts/firestore-delta-sync.ts --source <db> --target <db> --apply
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore, type DocumentReference } from 'firebase-admin/firestore';

const PROJECT_ID = 'cleancore-491216';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SOURCE = argValue('--source');
const TARGET = argValue('--target');
const APPLY = process.argv.includes('--apply');

if (!SOURCE || !TARGET) {
  console.error('Usage: --source <database-id> --target <database-id> [--apply]');
  process.exit(1);
}

/**
 * Transient infrastructure, not user data. Rate-limit counters are rebuilt from
 * traffic within the hour and copying them across would only import stale state.
 */
const SKIP_COLLECTIONS = new Set(['rate_limits']);

/** Stable comparison that tolerates key order and Firestore's own value types. */
function fingerprint(data: unknown): string {
  const normalise = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(normalise);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // Timestamps and other Firestore types expose a stable string form.
      if (typeof (o as { toDate?: () => Date }).toDate === 'function') {
        return `ts:${(o as { toDate: () => Date }).toDate().toISOString()}`;
      }
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = normalise(o[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(normalise(data));
}

interface Plan {
  created: string[];
  updated: string[];
  unchanged: number;
  onlyInTarget: string[];
}

async function walk(
  srcDb: Firestore,
  tgtDb: Firestore,
  plan: Plan,
  parentSrc?: DocumentReference,
  parentTgt?: DocumentReference,
): Promise<void> {
  const collections = parentSrc ? await parentSrc.listCollections() : await srcDb.listCollections();

  for (const col of collections) {
    if (!parentSrc && SKIP_COLLECTIONS.has(col.id)) continue;

    const snap = await col.get();
    for (const doc of snap.docs) {
      const tgtRef = parentTgt ? parentTgt.collection(col.id).doc(doc.id) : tgtDb.collection(col.id).doc(doc.id);
      const existing = await tgtRef.get();

      if (!existing.exists) {
        plan.created.push(tgtRef.path);
        if (APPLY) await tgtRef.set(doc.data());
      } else if (fingerprint(existing.data()) !== fingerprint(doc.data())) {
        plan.updated.push(tgtRef.path);
        if (APPLY) await tgtRef.set(doc.data());
      } else {
        plan.unchanged++;
      }

      await walk(srcDb, tgtDb, plan, doc.ref, tgtRef);
    }
  }
}

async function findTargetOnly(srcDb: Firestore, tgtDb: Firestore, plan: Plan): Promise<void> {
  for (const col of await tgtDb.listCollections()) {
    if (SKIP_COLLECTIONS.has(col.id)) continue;
    const snap = await col.get();
    for (const doc of snap.docs) {
      const inSource = await srcDb.collection(col.id).doc(doc.id).get();
      if (!inSource.exists) plan.onlyInTarget.push(`${col.id}/${doc.id}`);
    }
  }
}

async function main() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const app = getApps()[0];
  const srcDb = getFirestore(app, SOURCE!);
  const tgtDb = getFirestore(app, TARGET!);

  const plan: Plan = { created: [], updated: [], unchanged: 0, onlyInTarget: [] };

  console.log(`source: ${SOURCE}`);
  console.log(`target: ${TARGET}`);
  console.log(`mode  : ${APPLY ? 'APPLY' : 'dry run'}`);
  console.log('');

  await walk(srcDb, tgtDb, plan);
  await findTargetOnly(srcDb, tgtDb, plan);

  console.log(`identical      : ${plan.unchanged}`);
  console.log(`to create      : ${plan.created.length}`);
  plan.created.forEach((p) => console.log(`    + ${p}`));
  console.log(`to update      : ${plan.updated.length}`);
  plan.updated.forEach((p) => console.log(`    ~ ${p}`));
  console.log(`only in target : ${plan.onlyInTarget.length}  (left untouched)`);
  plan.onlyInTarget.forEach((p) => console.log(`    ! ${p}`));

  console.log('');
  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply.');
  } else {
    console.log(`Done. ${plan.created.length} created, ${plan.updated.length} updated.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
