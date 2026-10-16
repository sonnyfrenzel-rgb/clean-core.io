/**
 * scripts/sync-cloudification-repo.ts
 *
 * Fetches the SAP Cloudification Repository JSON (release-specific), normalizes
 * it and writes a compact artifact to lib/abap/generated/.
 *
 * Usage:
 *   npx tsx scripts/sync-cloudification-repo.ts               # syncs 'latest'
 *   npx tsx scripts/sync-cloudification-repo.ts pce-latest    # syncs a PCE file
 *   npx tsx scripts/sync-cloudification-repo.ts all           # syncs every registry entry
 *
 * Designed to run in CI (see .github/workflows/sync-catalog.yml): when the
 * generated artifact changes, the workflow pushes it to the branch
 * `chore/sync-cloudification-repo` (no pull request since 2026-09-14), from
 * where it is reviewed and brought in through `dev` — so every catalog update
 * is reviewed, versioned and lands in the Audit Pack traceability chain.
 */

import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import {
  RELEASE_FILES,
  CLASSIFICATION_RELEASES,
  normalizeCrFile,
  normalizeClassificationFile,
  deriveReleasedClasses,
  deriveReleasedInterfaces,
  RELEASED_CLASSES_FILE,
  RELEASED_INTERFACES_FILE,
  type CrFile,
  type CrClassificationFile,
} from '../lib/abap/cloudification-repo';

const OUT_DIR = path.resolve(__dirname, '../lib/abap/generated');

async function syncOne(release: string): Promise<boolean> {
  const url = RELEASE_FILES[release];
  if (!url) {
    console.error(`Unknown release '${release}'. Known: ${Object.keys(RELEASE_FILES).join(', ')}`);
    process.exit(1);
  }

  console.log(`[sync] fetching ${release} ← ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const rawText = await res.text();
  const sourceSha256 = createHash('sha256').update(rawText).digest('hex');

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${(e as Error).message}`);
  }

  // The repository ships two schemas. Dispatch on the registry entry rather than
  // sniffing the payload, and fail loudly on a shape mismatch — a silently
  // half-parsed catalog would produce confidently wrong clean core grades.
  const isClassification = CLASSIFICATION_RELEASES.has(release);
  let artifact;
  if (isClassification) {
    const file = raw as CrClassificationFile;
    if (!Array.isArray(file.objectClassifications)) {
      throw new Error(
        `Unexpected schema for '${release}' (missing objectClassifications[]) — repo format may have changed.`,
      );
    }
    artifact = normalizeClassificationFile(file, { source: url, release, sourceSha256 });
  } else {
    const file = raw as CrFile;
    if (!Array.isArray(file.objectReleaseInfo)) {
      throw new Error(
        `Unexpected schema for '${release}' (missing objectReleaseInfo[]) — repo format may have changed.`,
      );
    }
    artifact = normalizeCrFile(file, { source: url, release, sourceSha256 });
  }

  // Deterministic serialization (sorted keys) → clean CI diffs.
  const sortedEntries = Object.fromEntries(
    Object.keys(artifact.entries).sort().map((k) => [k, artifact.entries[k]]),
  );
  const out = JSON.stringify({ meta: artifact.meta, entries: sortedEntries }, null, 1);

  mkdirSync(OUT_DIR, { recursive: true });
  // `release` originates from a CLI argument — constrain it so it can never traverse
  // out of OUT_DIR via the path.join below.
  if (!/^[A-Za-z0-9._-]+$/.test(release)) {
    throw new Error(`Invalid release identifier: ${release}`);
  }
  const outFile = path.join(OUT_DIR, `cloudification-repo.${release}.json`);

  // The released class names the transformation's body guard reads (acceptance run 4, 14.10.2026): derived from
  // `latest` on every sync of it, written only when the names change. Since 3.0.14 (item 4) the released interface
  // names beside them, from the same list, in a file of their own.
  let classesChanged = false;
  if (release === 'latest' && !isClassification) {
    const lists: Array<[string, string, unknown]> = [
      ['class', RELEASED_CLASSES_FILE, deriveReleasedClasses({ meta: artifact.meta, entries: sortedEntries })],
      ['interface', RELEASED_INTERFACES_FILE, deriveReleasedInterfaces({ meta: artifact.meta, entries: sortedEntries })],
    ];
    for (const [what, name, list] of lists) {
      const listFile = path.join(OUT_DIR, name);
      const listOut = JSON.stringify(list, null, 0) + '\n';
      if (!existsSync(listFile) || readFileSync(listFile, 'utf8') !== listOut) {
        writeFileSync(listFile, listOut);
        classesChanged = true;
        console.log(`[sync] ${release}: wrote the released ${what} names → ${listFile}`);
      }
    }
  }

  // Only rewrite when content (minus fetchedAt) actually changed → stable diffs.
  if (existsSync(outFile)) {
    const prev = readFileSync(outFile, 'utf8');
    const strip = (s: string) => s.replace(/"fetchedAt":\s*"[^"]+"/, '"fetchedAt":"-"');
    if (strip(prev) === strip(out)) {
      console.log(`[sync] ${release}: no changes (${artifact.meta.entryCount} entries) — skipping write`);
      return classesChanged;
    }
  }

  writeFileSync(outFile, out);
  console.log(`[sync] ${release}: wrote ${artifact.meta.entryCount} entries → ${outFile}`);
  console.log(`[sync] source sha256: ${sourceSha256}`);
  return true;
}

async function main() {
  const arg = process.argv[2] || 'latest';
  const releases = arg === 'all' ? Object.keys(RELEASE_FILES) : [arg];
  let changed = false;
  for (const r of releases) changed = (await syncOne(r)) || changed;
  // Exit code 20 signals "changes written" so CI can decide to open a PR.
  process.exit(changed ? 20 : 0);
}

main().catch((e) => {
  console.error('[sync] failed:', e.message);
  process.exit(1);
});
