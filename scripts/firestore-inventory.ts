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
 * Every manifest entry carries `docHash`, a canonical hash of the *whole*
 * document. The manifest used to carry a name and an owner, and
 * `firestore-verify-migration.ts` then announced that every project "survived
 * intact" after comparing those two fields — a target that had lost `legacyCode`,
 * the analysis, the generated output or the audit metadata compared equal (QA
 * review of 33471220d6e9, finding 5a660ef009dc). Signed runs additionally carry
 * the verdict of recomputing their own hash, because copying `runHash` across
 * proves the field was copied and nothing about the content behind it.
 *
 * Usage:
 *   npx tsx scripts/firestore-inventory.ts --db <database-id> --out <file.json>
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';

const PROJECT_ID = 'cleancore-491216';

/**
 * A canonical, type-tagged serialisation of a whole document.
 *
 * Type-tagged because a comparison that cannot tell `1` from `"1"`, `null` from
 * a missing field, or a Timestamp from the object it serialises to is a
 * comparison a corrupted migration can pass. Lengths prefix every string and
 * key, so `{ab: 1, c: 2}` and `{a: 'b1c', ...}` cannot collide. Keys are sorted,
 * so Firestore's own ordering never shows up as a difference.
 *
 * Exported for `tests/firestore-migration-verify.spec.ts`.
 */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'n';
  if (typeof value === 'boolean') return `b:${value}`;
  if (typeof value === 'number') return Number.isFinite(value) ? `f:${value}` : `f:${String(value)}`;
  if (typeof value === 'string') return `s${value.length}:${value}`;
  if (typeof value === 'bigint') return `i:${value}`;
  if (Array.isArray(value)) return `a${value.length}:[${value.map(canonical).join(',')}]`;
  if (value instanceof Date) return `t:${value.toISOString()}`;
  if (value instanceof Uint8Array) return `y:${Buffer.from(value).toString('base64')}`;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // Firestore's own value types, each with a lossless form of its own.
    if (typeof o._seconds === 'number' && typeof o._nanoseconds === 'number') return `t:${o._seconds}.${String(o._nanoseconds).padStart(9, '0')}`;
    if (typeof (o as { toDate?: () => Date }).toDate === 'function') return `t:${(o as { toDate: () => Date }).toDate().toISOString()}`;
    if (typeof o.latitude === 'number' && typeof o.longitude === 'number' && Object.keys(o).length === 2) return `g:${o.latitude},${o.longitude}`;
    if (typeof o.path === 'string' && typeof (o as { collection?: unknown }).collection === 'function') return `r:${o.path}`;
    const keys = Object.keys(o).sort();
    return `o${keys.length}:{${keys.map((k) => `s${k.length}:${k}=${canonical(o[k])}`).join(';')}}`;
  }
  return `u:${String(value)}`;
}

/** SHA-256 over the canonical form — what the two inventories are compared on. */
export function docHash(data: unknown): string {
  return crypto.createHash('sha256').update(canonical(data)).digest('hex');
}

/**
 * Whether a stored run still hashes to the `runHash` it carries, and — when the
 * signing key is in the environment — whether that hash is still signed.
 *
 * Without the key the signature cannot be checked, and the manifest says so
 * rather than reporting an unchecked run as verified.
 */
export function runIntegrity(data: Record<string, unknown>, key?: string): string {
  if (typeof data.runHash !== 'string' || !data.runHash) return 'missing-runHash';
  if (typeof data.signature !== 'string' || !data.signature) return 'missing-signature';
  if (recomputeStoredRunHash(data) !== data.runHash) return 'hash-mismatch';
  if (!key) return 'hash-ok-signature-unchecked';
  return signRunHash(data.runHash, key) === data.signature ? 'verified' : 'signature-mismatch';
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DB_ID = argValue('--db');
const OUT = argValue('--out');

/** Subcollection names to census via collection group. */
const COLLECTION_GROUPS = ['runs', 'providers'];

interface Inventory {
  database: string;
  takenAt: string;
  /** Bumped when the manifest gains a field the verifier relies on. */
  manifestVersion: number;
  collections: Record<string, number>;
  collectionGroups: Record<string, number>;
  totals: { topLevelDocuments: number; groupDocuments: number };
  manifest: {
    users: { uid: string; email: string; docHash: string }[];
    projects: { id: string; userId: string; name: string; docHash: string }[];
    runs: { path: string; runHash: string; signature: string; projectId: string; userId: string; docHash: string; integrity: string }[];
  };
}

/** The manifest shape `firestore-verify-migration.ts` needs to prove anything. */
export const MANIFEST_VERSION = 2;

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

  const signingKey = process.env.AUDIT_SIGNING_KEY;

  return {
    database: DB_ID!,
    takenAt: new Date().toISOString(),
    manifestVersion: MANIFEST_VERSION,
    collections: counts,
    collectionGroups: groupCounts,
    totals: {
      topLevelDocuments: Object.values(counts).reduce((a, b) => a + b, 0),
      groupDocuments: Object.values(groupCounts).filter((n) => n >= 0).reduce((a, b) => a + b, 0),
    },
    manifest: {
      users: usersSnap.docs
        .map((d) => ({ uid: d.id, email: (d.data().email || '').toLowerCase(), docHash: docHash(d.data()) }))
        .sort((a, b) => a.uid.localeCompare(b.uid)),
      projects: projectsSnap.docs
        .map((d) => ({ id: d.id, userId: d.data().userId || '', name: d.data().name || '', docHash: docHash(d.data()) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      runs: runsSnap.docs
        .map((d) => ({
          path: d.ref.path,
          runHash: d.data().runHash || '',
          signature: d.data().signature || '',
          projectId: d.data().projectId || '',
          userId: d.data().userId || '',
          docHash: docHash(d.data()),
          integrity: runIntegrity(d.data(), signingKey),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    },
  };
}

async function main() {
  if (!DB_ID) {
    console.error('Missing --db <database-id>');
    process.exit(1);
  }
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
  const byIntegrity = inv.manifest.runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.integrity] = (acc[r.integrity] || 0) + 1;
    return acc;
  }, {});
  console.log(`run integrity       : ${Object.entries(byIntegrity).map(([k, n]) => `${k}=${n}`).join(' ') || 'no runs'}`);
  if (!process.env.AUDIT_SIGNING_KEY) {
    console.log('                      (AUDIT_SIGNING_KEY not set — hashes recomputed, signatures not checked)');
  }

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify(inv, null, 2));
    console.log('');
    console.log(`baseline written to ${OUT}`);
  }
  process.exit(0);
}

// Run only as the entry script; the spec imports `canonical`, `docHash` and
// `runIntegrity` from here — the three things the census is now believed on.
if (process.argv[1] && /firestore-inventory/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
