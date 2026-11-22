import registry from './engine-releases.json';

/**
 * The engine digest of this build (roadmap 3.4.0 item (3), owner decision 22.11.2026), and which release it is.
 *
 * Computed at build time by `next.config.mjs` from the engine's sources (`scripts/engine/engine-digest.cjs` defines
 * exactly which files) and inlined as `CC_ENGINE_DIGEST`. Null where no build computed it (a script, a spec): a run
 * is only created by a built server, and a card without a digest reads "not recorded", never a guess.
 *
 * A signed run carries it beside `engineVersion` (`model.engineDigest`, `app/api/runs/create/route.ts`), and so does
 * the project's model card. A run signed before 3.4.0 has none and verifies as it was sealed: the run hash is over the
 * stored document (`recomputeStoredRunHash`).
 *
 * Pure apart from the registry it reads.
 */
export const ENGINE_DIGEST: string | null = /^[0-9a-f]{64}$/.test(process.env.CC_ENGINE_DIGEST ?? '') ? (process.env.CC_ENGINE_DIGEST as string) : null;

export interface EngineRelease {
  digest: string;
  commit: string;
  captured: string;
  how?: string;
}

/** Every released engine, by version: `lib/engine-releases.json`, written by the release capture. */
export const ENGINE_RELEASES: Readonly<Record<string, EngineRelease>> = Object.freeze({ ...(registry.releases as Record<string, EngineRelease>) });

/** The releases whose engine has this digest (several when a release left the engine unchanged), oldest first. */
export function releasesOfDigest(digest: string | null | undefined): string[] {
  if (!digest) return [];
  return Object.entries(ENGINE_RELEASES)
    .filter(([, r]) => r.digest === digest)
    .map(([v]) => v)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** What a model card prints beside the digest: the release it matches, "unreleased build", or "not recorded". */
export function engineDigestLabel(digest: string | null | undefined): string {
  if (!digest) return 'not recorded';
  const releases = releasesOfDigest(digest);
  return releases.length ? `release ${releases.join(', ')}` : 'unreleased build';
}

/** The digest and its label on one line: `237f3208… (release v3.2.0)`. */
export function engineDigestLine(digest: string | null | undefined): string {
  return digest ? `${digest} (${engineDigestLabel(digest)})` : 'not recorded';
}
