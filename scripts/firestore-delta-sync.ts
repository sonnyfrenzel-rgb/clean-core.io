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
 * And it never replaces a target document just because it differs. The procedure
 * above runs after the switch, when the app is already writing to the target; a
 * project a user edited in that window differed from its pre-cutover copy in the
 * source, and the earlier version took every difference as source-authoritative
 * and put the stale copy back over the user's edit. A differing document is
 * written only when the source is provably newer by `updatedAt`; everything else
 * is a conflict, listed for a person to look at, and left as it is.
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

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const maybe = v as { toMillis?: () => number };
  if (typeof maybe.toMillis === 'function') return maybe.toMillis();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export type Verdict = 'create' | 'unchanged' | 'update' | 'conflict';

/**
 * What to do with one document. Exported so the rule can be tested without a
 * database: the only case that ever writes over an existing document is a
 * source that carries a later `updatedAt` than the target. No timestamp on
 * either side, equal timestamps, a newer target — all conflicts.
 */
export function reconcile(existing: Record<string, unknown> | undefined, incoming: Record<string, unknown>): Verdict {
  if (!existing) return 'create';
  if (fingerprint(existing) === fingerprint(incoming)) return 'unchanged';
  const source = toMillis(incoming.updatedAt);
  const target = toMillis(existing.updatedAt);
  if (source !== null && target !== null && source > target) return 'update';
  return 'conflict';
}

interface Plan {
  created: string[];
  updated: string[];
  conflicts: string[];
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

      switch (reconcile(existing.data(), doc.data())) {
        case 'create':
          plan.created.push(tgtRef.path);
          if (APPLY) await tgtRef.set(doc.data());
          break;
        case 'update':
          plan.updated.push(tgtRef.path);
          if (APPLY) await tgtRef.set(doc.data());
          break;
        case 'conflict':
          plan.conflicts.push(tgtRef.path);
          break;
        default:
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
  if (!SOURCE || !TARGET) {
    console.error('Usage: --source <database-id> --target <database-id> [--apply]');
    process.exit(1);
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const app = getApps()[0];
  const srcDb = getFirestore(app, SOURCE);
  const tgtDb = getFirestore(app, TARGET);

  const plan: Plan = { created: [], updated: [], conflicts: [], unchanged: 0, onlyInTarget: [] };

  console.log(`source: ${SOURCE}`);
  console.log(`target: ${TARGET}`);
  console.log(`mode  : ${APPLY ? 'APPLY' : 'dry run'}`);
  console.log('');

  await walk(srcDb, tgtDb, plan);
  await findTargetOnly(srcDb, tgtDb, plan);

  console.log(`identical      : ${plan.unchanged}`);
  console.log(`to create      : ${plan.created.length}`);
  plan.created.forEach((p) => console.log(`    + ${p}`));
  console.log(`to update      : ${plan.updated.length}  (source provably newer)`);
  plan.updated.forEach((p) => console.log(`    ~ ${p}`));
  console.log(`conflicts      : ${plan.conflicts.length}  (differ, target not provably older — left untouched)`);
  plan.conflicts.forEach((p) => console.log(`    ? ${p}`));
  console.log(`only in target : ${plan.onlyInTarget.length}  (left untouched)`);
  plan.onlyInTarget.forEach((p) => console.log(`    ! ${p}`));

  console.log('');
  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply.');
  } else {
    console.log(`Done. ${plan.created.length} created, ${plan.updated.length} updated, ${plan.conflicts.length} conflict(s) left for a person.`);
  }
  process.exit(plan.conflicts.length ? 2 : 0);
}

// Run only as the entry script; the spec imports `reconcile` from here.
if (process.argv[1] && /firestore-delta-sync/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
