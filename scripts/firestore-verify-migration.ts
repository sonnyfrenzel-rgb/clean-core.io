/**
 * Proves that a migration lost nothing.
 *
 * Compares two inventories document by document, not by totals — matching counts
 * can hide a swapped or truncated document. Every user, every project and every
 * signed run has to be present, and its **whole content** has to hash to the same
 * value on both sides.
 *
 * The comparison used to be three fields: a project matched if its owner and its
 * name matched, a user if its email did. A target that had lost `legacyCode`, the
 * analysis, the generated code, the documentation or the audit metadata while
 * keeping its id, owner and name compared equal, and this script then printed
 * that every project survived intact and exited zero — which is exactly the
 * sentence a cutover is decided on (QA review of 33471220d6e9, finding
 * 5a660ef009dc). `scripts/firestore-inventory.ts` now emits `docHash`, a
 * canonical type-tagged hash of the complete document, and that is what is
 * compared. Signed runs carry, in addition, the verdict of recomputing their own
 * hash from their own content: two identical copies of a corrupted run are still
 * a corrupted run.
 *
 * An inventory taken before `docHash` existed cannot support the claim, so it is
 * a failure rather than a pass — the gate is allowed to be over-strict and is not
 * allowed to be over-confident.
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

export interface ManifestUser {
  uid: string;
  email: string;
  docHash?: string;
}
export interface ManifestProject {
  id: string;
  userId: string;
  name: string;
  docHash?: string;
}
export interface ManifestRun {
  path: string;
  runHash: string;
  signature: string;
  projectId: string;
  userId: string;
  docHash?: string;
  integrity?: string;
}

export interface Inventory {
  database: string;
  manifestVersion?: number;
  collections: Record<string, number>;
  collectionGroups: Record<string, number>;
  manifest: {
    users: ManifestUser[];
    projects: ManifestProject[];
    runs: ManifestRun[];
  };
}

export interface Comparison {
  ok: string[];
  problems: string[];
}

/**
 * Transient infrastructure that firestore-delta-sync.ts deliberately does not copy —
 * rate-limit counters rebuild from traffic within the hour, and carrying stale ones
 * across would be worse than starting clean. Both scripts must agree on this, or the
 * gate reports a difference that is by design.
 */
const TRANSIENT_COLLECTIONS = new Set(['rate_limits']);

/**
 * The verdicts `runIntegrity` can produce that still allow a cutover.
 *
 * `hash-ok-signature-unchecked` is the honest state of a census taken without
 * `AUDIT_SIGNING_KEY` in the environment: the content still hashes to its stored
 * `runHash`, and whether that hash is signed was not established. Everything
 * else — a mismatched hash, a mismatched signature, a missing one — is a run
 * whose evidence chain would no longer verify.
 */
const RUN_INTEGRITY_OK = new Set(['verified', 'hash-ok-signature-unchecked']);

/**
 * The whole comparison, as data. Exported so the rule can be tested without two
 * live databases: `tests/firestore-migration-verify.spec.ts` feeds it manifests
 * that differ in exactly one way each.
 */
export function compareInventories(src: Inventory, tgt: Inventory): Comparison {
  const problems: string[] = [];
  const ok: string[] = [];

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

  /**
   * The comparison every manifest entry passes: the hash of the complete
   * document. A missing hash on either side is a difference the verifier cannot
   * rule out, which is not the same as no difference.
   */
  const sameDocument = (x: { docHash?: string }, y: { docHash?: string }): string | null => {
    if (!x.docHash || !y.docHash) {
      return 'no document hash in one of the inventories — retake the baseline with the current scripts/firestore-inventory.ts';
    }
    return x.docHash !== y.docHash ? 'the document content differs (canonical hash mismatch)' : null;
  };

  // An inventory from before full-document hashing cannot support the claim this
  // script makes, and saying so is the whole point of the version.
  for (const [side, inv] of [['source', src], ['target', tgt]] as const) {
    if ((inv.manifestVersion ?? 1) < 2) {
      problems.push(`${side} inventory is manifestVersion ${inv.manifestVersion ?? 1} — it carries no document hashes, so "nothing was lost" cannot be checked`);
    }
  }

  compareCounts('collection', src.collections, tgt.collections);
  compareCounts('collection group', src.collectionGroups, tgt.collectionGroups);

  compareManifest(
    'user',
    src.manifest.users,
    tgt.manifest.users,
    (u) => u.uid,
    (x, y) => (x.email !== y.email ? `email "${x.email}" vs "${y.email}"` : sameDocument(x, y)),
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
          : sameDocument(x, y),
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
            : sameDocument(x, y),
  );

  // Copying a run faithfully is not the same as the run being intact: the stored
  // `runHash` is a field like any other, and a document altered before the export
  // carries its old hash across unchanged. The census recomputes the hash from
  // the run's own content; this is where that verdict is read.
  const brokenRuns = tgt.manifest.runs.filter((r) => !RUN_INTEGRITY_OK.has(r.integrity ?? ''));
  if (brokenRuns.length) {
    for (const r of brokenRuns) {
      problems.push(`signed run ${r.path}: integrity "${r.integrity ?? 'not checked'}" — recomputed from its own content, this run does not verify`);
    }
  } else if (tgt.manifest.runs.length) {
    const unchecked = tgt.manifest.runs.filter((r) => r.integrity === 'hash-ok-signature-unchecked').length;
    ok.push(
      `all ${tgt.manifest.runs.length} signed run(s) in the target rehash to their stored runHash` +
        (unchecked ? ` (${unchecked} without a signature check — AUDIT_SIGNING_KEY was not set when the census ran)` : ' and their signatures verify'),
    );
  }

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

  return { ok, problems };
}

function main() {
  const SOURCE = argValue('--source');
  const TARGET = argValue('--target');
  if (!SOURCE || !TARGET) {
    console.error('Usage: --source <baseline.json> --target <baseline.json>');
    process.exit(1);
  }

  const src: Inventory = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const tgt: Inventory = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  const { ok, problems } = compareInventories(src, tgt);

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
  console.log('No differences. Every user, project and signed run survived intact, compared over its whole content.');
  process.exit(0);
}

// Run only as the entry script; the spec imports `compareInventories` from here.
if (process.argv[1] && /firestore-verify-migration/.test(process.argv[1])) {
  main();
}
