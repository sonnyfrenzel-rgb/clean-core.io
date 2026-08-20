/**
 * Finds every field that Firestore cannot index.
 *
 * An indexed value may be at most 1500 bytes. The source database sidesteps this
 * with a database-wide "index nothing" setting that AI Studio applied at creation
 * and that a normal Firestore database cannot reproduce — `gcloud` answers
 * "Configuring database-level settings is not supported".
 *
 * The supported equivalent is a single-field exemption per offending field, which
 * is also the better arrangement: everything else stays queryable. This works out
 * which fields those are by measuring the real data rather than guessing from the
 * schema, because a guess that misses one field fails the import — or worse,
 * passes the import and fails the first time a user saves a large object.
 *
 * Usage:
 *   npx tsx scripts/firestore-oversized-fields.ts --db <database-id> [--out file.json]
 */

import fs from 'node:fs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'cleancore-491216';
const INDEX_LIMIT_BYTES = Number(argValueEarly('--threshold') || 1500);

function argValueEarly(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

/**
 * Walks a document and reports the FULL dotted path of every leaf value too large
 * to index.
 *
 * Full paths, not top-level names: Firestore indexes a nested field under its own
 * path, so an exemption on `testSuite` does nothing for `testSuite.code`. Reporting
 * only the top level is what made the first import attempt fail twice.
 *
 * Array elements are indexed under the array's own path rather than per position,
 * so descending into an array keeps the array's path.
 */
function offendingPaths(data: Record<string, unknown>): Map<string, number> {
  const found = new Map<string, number>();

  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      const size = bytes(value);
      if (size > INDEX_LIMIT_BYTES) {
        found.set(path, Math.max(found.get(path) || 0, size));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, path));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${key}` : key);
      }
    }
  };

  for (const [key, value] of Object.entries(data)) walk(value, key);
  return found;
}

async function main() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(getApps()[0], DB_ID!);

  // collectionGroup -> field -> largest observed size
  const result = new Map<string, Map<string, number>>();
  const note = (group: string, field: string, size: number) => {
    if (!result.has(group)) result.set(group, new Map());
    const m = result.get(group)!;
    m.set(field, Math.max(m.get(field) || 0, size));
  };

  const collections = await db.listCollections();
  for (const col of collections) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      offendingPaths(doc.data()).forEach((size, field) => note(col.id, field, size));

      // Subcollections carry the signed evidence; they must be measured too.
      for (const sub of await doc.ref.listCollections()) {
        const subSnap = await sub.get();
        for (const subDoc of subSnap.docs) {
          offendingPaths(subDoc.data()).forEach((size, field) => note(sub.id, field, size));
        }
      }
    }
  }

  const flat: { collectionGroup: string; field: string; maxBytes: number }[] = [];
  result.forEach((fields, group) =>
    fields.forEach((size, field) => flat.push({ collectionGroup: group, field, maxBytes: size })),
  );
  flat.sort((a, b) => b.maxBytes - a.maxBytes);

  console.log(`Fields exceeding the ${INDEX_LIMIT_BYTES}-byte index limit in ${DB_ID}:`);
  console.log('');
  console.log('COLLECTION GROUP          FIELD PATH                          LARGEST');
  console.log('-'.repeat(62));
  flat.forEach((f) =>
    console.log(
      `${f.collectionGroup.padEnd(26)}${f.field.padEnd(36)}${f.maxBytes.toLocaleString().padStart(9)} B`,
    ),
  );
  console.log('');
  console.log(`${flat.length} exemption(s) required.`);

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify(flat, null, 2));
    console.log(`written to ${OUT}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
