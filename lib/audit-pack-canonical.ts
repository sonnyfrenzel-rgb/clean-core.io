/**
 * The one canonical form of an audit-pack manifest.
 *
 * The issuer (`/api/audit-pack/create`) hashes and signs this string; the web
 * verifier (`lib/audit-pack-verify.ts`) rebuilds it from the manifest and
 * checks the hash. Both used to carry their own copy of the concatenation, and
 * the same rule holds here as for runs (`lib/run-signature.ts`): two
 * implementations of "canonical" drift, and a verification that drifts is a
 * verification that passes. The offline verifier (`scripts/verify-pack.mjs`)
 * is dependency-free by design and repeats the form; `tests/verify-pack-cli.spec.ts`
 * holds it to the same bytes.
 *
 * Format, unchanged for the signed part since the run binding was added:
 *
 *   <path>:<sha256>;…;<projectId>:<runId>:<runHash>:<engineVersion>:<catalogVersion>;
 *
 * followed, only when the pack carries user-attested files, by
 *
 *   attested=<path>,<path>;
 *
 * The attested paths are bound into the signature; their contents are not.
 * That is the whole point of the section: an architect's sign-off or a chosen
 * target architecture is the account holder's own statement, recorded in the
 * user's session and writable by the user, and a signature over it would only
 * dress it up as server evidence. So the signature says "the issuer wrote a
 * file of this name and nothing else next to the evidence" — a reader can see
 * the file was there when the pack was sealed, and can see that nobody vouches
 * for what is in it. A pack issued before this section existed has no attested
 * files and canonicalises exactly as before.
 */

export interface CanonicalManifestParts {
  files: ReadonlyArray<{ path: string; sha256: string }>;
  /** Paths the issuer placed in the archive without signing their contents. */
  attested?: ReadonlyArray<{ path: string }>;
  projectId?: string;
  runId?: string;
  /** Absent only on packs issued before the run binding existed; those canonicalise without the suffix. */
  runHash?: string;
  engineVersion?: string;
  sapApiCatalogVersion?: string;
}

export function canonicalAuditManifest(m: CanonicalManifestParts): string {
  const sorted = [...m.files].sort((a, b) => a.path.localeCompare(b.path));
  let canonical = sorted.map((f) => `${f.path}:${f.sha256}`).join(';') + ';';
  if (m.runHash !== undefined) {
    canonical += `${m.projectId || ''}:${m.runId || ''}:${m.runHash || ''}:${m.engineVersion || ''}:${m.sapApiCatalogVersion || ''};`;
  }
  const attested = [...(m.attested || [])].map((a) => a.path).sort((a, b) => a.localeCompare(b));
  if (attested.length > 0) canonical += `attested=${attested.join(',')};`;
  return canonical;
}
