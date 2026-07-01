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
 * Designed to run in CI (see .github/workflows/sync-catalog.yml): the workflow
 * opens a PR when the generated artifact changes, so every catalog update is
 * reviewed, versioned and lands in the Audit Pack traceability chain.
 */

import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { RELEASE_FILES, normalizeCrFile, type CrFile } from '../lib/abap/cloudification-repo';

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

  let raw: CrFile;
  try {
    raw = JSON.parse(rawText) as CrFile;
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw.objectReleaseInfo)) {
    throw new Error(`Unexpected schema (missing objectReleaseInfo[]) — repo format may have changed.`);
  }

  const artifact = normalizeCrFile(raw, { source: url, release, sourceSha256 });

  // Deterministic serialization (sorted keys) → clean CI diffs.
  const sortedEntries = Object.fromEntries(
    Object.keys(artifact.entries).sort().map((k) => [k, artifact.entries[k]]),
  );
  const out = JSON.stringify({ meta: artifact.meta, entries: sortedEntries }, null, 1);

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `cloudification-repo.${release}.json`);

  // Only rewrite when content (minus fetchedAt) actually changed → stable diffs.
  if (existsSync(outFile)) {
    const prev = readFileSync(outFile, 'utf8');
    const strip = (s: string) => s.replace(/"fetchedAt":\s*"[^"]+"/, '"fetchedAt":"-"');
    if (strip(prev) === strip(out)) {
      console.log(`[sync] ${release}: no changes (${artifact.meta.entryCount} entries) — skipping write`);
      return false;
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
