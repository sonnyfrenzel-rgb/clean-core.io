/**
 * Proves that a migration lost nothing.
 *
 * Compares two inventories document by document, not by totals — matching counts
 * can hide a swapped or truncated document. Every user, every project and every
 * signed run has to be present with the same identity, and the run hashes and
 * signatures have to be byte-identical, because they are the evidence chain the
 * product sells.
 *
 * Exits non-zero on any difference, so it can gate the cutover.
 *
 * Usage:
 *   npx tsx scripts/firestore-verify-migration.ts --source <a.json> --target <b.json>
 */

import fs from 'node:fs';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SOURCE = argValue('--source');
const TARGET = argValue('--target');
if (!SOURCE || !TARGET) {
  console.error('Usage: --source <baseline.json> --target <baseline.json>');
  process.exit(1);
}

interface Inventory {
  database: string;
  collections: Record<string, number>;
  collectionGroups: Record<string, number>;
  manifest: {
    users: { uid: string; email: string }[];
    projects: { id: string; userId: string; name: string }[];
    runs: { path: string; runHash: string; signature: string; projectId: string; userId: string }[];
  };
}

const src: Inventory = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const tgt: Inventory = JSON.parse(fs.readFileSync(TARGET, 'utf8'));

const problems: string[] = [];
const ok: string[] = [];

/**
 * Transient infrastructure that firestore-delta-sync.ts deliberately does not copy —
 * rate-limit counters rebuild from traffic within the hour, and carrying stale ones
 * across would be worse than starting clean. Both scripts must agree on this, or the
 * gate reports a difference that is by design.
 */
const TRANSIENT_COLLECTIONS = new Set(['rate_limits']);

function compareCounts(label: string, a: Record<string, number>, b: Record<string, number>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (TRANSIENT_COLLECTIONS.has(k)) {
      ok.push(`${label} "${k}": skipped — transient, not migrated by design`);
      continue;
    }
    const from = a[k] ?? 0;
    const to = b[k] ?? 0;
    if (from !== to) problems.push(`${label} "${k}": source ${from}, target ${to}`);
    else ok.push(`${label} "${k}": ${from}`);
  }
}

/** Compares two manifests by a stable key and reports what is missing or extra. */
function compareManifest<T>(
  label: string,
  a: T[],
  b: T[],
  key: (item: T) => string,
  equal: (x: T, y: T) => string | null,
) {
  const bySource = new Map(a.map((i) => [key(i), i]));
  const byTarget = new Map(b.map((i) => [key(i), i]));

  const missing = [...bySource.keys()].filter((k) => !byTarget.has(k));
  const extra = [...byTarget.keys()].filter((k) => !bySource.has(k));

  missing.forEach((k) => problems.push(`${label} MISSING in target: ${k}`));
  extra.forEach((k) => problems.push(`${label} unexpected in target: ${k}`));

  let mismatched = 0;
  for (const [k, item] of bySource) {
    const other = byTarget.get(k);
    if (!other) continue;
    const diff = equal(item, other);
    if (diff) {
      problems.push(`${label} DIFFERS for ${k}: ${diff}`);
      mismatched++;
    }
  }

  if (!missing.length && !extra.length && !mismatched) {
    ok.push(`${label}: all ${a.length} present and identical`);
  }
}

compareCounts('collection', src.collections, tgt.collections);
compareCounts('collection group', src.collectionGroups, tgt.collectionGroups);

compareManifest(
  'user',
  src.manifest.users,
  tgt.manifest.users,
  (u) => u.uid,
  (x, y) => (x.email !== y.email ? `email "${x.email}" vs "${y.email}"` : null),
);

compareManifest(
  'project',
  src.manifest.projects,
  tgt.manifest.projects,
  (p) => p.id,
  (x, y) =>
    x.userId !== y.userId
      ? `owner "${x.userId}" vs "${y.userId}"`
      : x.name !== y.name
        ? `name "${x.name}" vs "${y.name}"`
        : null,
);

compareManifest(
  'signed run',
  src.manifest.runs,
  tgt.manifest.runs,
  (r) => r.path,
  (x, y) =>
    x.runHash !== y.runHash
      ? 'runHash differs — the evidence chain would no longer verify'
      : x.signature !== y.signature
        ? 'signature differs — the evidence chain would no longer verify'
        : x.userId !== y.userId
          ? `owner "${x.userId}" vs "${y.userId}"`
          : null,
);

// Referential integrity is compared, not asserted absolutely: the source already
// carries orphaned projects from an interrupted cleanup, and a migration that
// reproduces them faithfully is correct. What would be a defect is the target
// having MORE orphans than the source — that would mean a user was lost in transit.
const orphansIn = (inv: Inventory) => {
  const uids = new Set(inv.manifest.users.map((u) => u.uid));
  return inv.manifest.projects.filter((p) => p.userId && !uids.has(p.userId)).map((p) => p.id);
};
const srcOrphans = new Set(orphansIn(src));
const tgtOrphans = new Set(orphansIn(tgt));
const newlyOrphaned = [...tgtOrphans].filter((id) => !srcOrphans.has(id));

if (newlyOrphaned.length) {
  problems.push(
    `${newlyOrphaned.length} project(s) lost their owner in transit: ${newlyOrphaned.join(', ')}`,
  );
} else if (srcOrphans.size) {
  ok.push(
    `referential integrity preserved (${srcOrphans.size} project(s) were already orphaned in the source — pre-existing, not caused by the migration)`,
  );
} else {
  ok.push('every project resolves to an existing user');
}

console.log(`source: ${src.database}`);
console.log(`target: ${tgt.database}`);
console.log('');
ok.forEach((line) => console.log(`  OK    ${line}`));

if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  FAIL  ${p}`));
  console.log('');
  console.log(`${problems.length} problem(s) found — DO NOT CUT OVER.`);
  process.exit(1);
}

console.log('');
console.log('No differences. Every user, project and signed run survived intact.');
process.exit(0);
