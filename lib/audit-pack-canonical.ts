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
 * Format, version 2 (every pack issued up to 17.09.2026):
 *
 *   <path>:<sha256>;…;<projectId>:<runId>:<runHash>:<engineVersion>:<catalogVersion>;
 *
 * followed, only when the pack carries user-attested files, by
 *
 *   attested=<path>,<path>;
 *
 * Format, version 3 — the same string, with two sections that close what the
 * QA full review of a19945ef01dc found:
 *
 *   attested=<path>:<sha256>,<path>:<sha256>;
 *   issued=<version>:<generatedAt>;
 *
 * **Why a path may not contain `:` `;` `,`.** A concatenation without escaping
 * or length prefixes is not a canonical form — it is a string that several
 * different manifests can produce. Take a sealed pack with the consecutive
 * entries `a` (hash H1) and `b` (hash H2): delete `a` from the archive, rename
 * `b` to `a:H1;b`, and replace the two manifest rows with the single row
 * `{ path: 'a:H1;b', sha256: H2 }`. The canonical string is byte-for-byte what
 * the issuer signed, the renamed file hashes correctly, nothing in the archive
 * is unlisted — and both verifiers call a pack authentic that has lost a signed
 * evidence file. The same trick moves the `attested=` section into
 * `sapApiCatalogVersion`, so an attested file can be dropped without trace.
 * Rejecting the separators (and holding every digest to 64 lowercase hex
 * digits) makes the mapping injective again, which is the property the whole
 * chain assumed it had. No pack the issuer ever wrote carries such a name, so
 * this refuses forgeries and nothing else — the check applies to version 2
 * packs too, and closes the hole for packs already delivered.
 *
 * **Why attested files now carry a digest.** The attested paths were bound into
 * the signature and their contents were not — an architect's sign-off is the
 * account holder's own statement, and a signature over it would dress it up as
 * server evidence. But leaving the bytes unbound did not keep that promise, it
 * broke a different one: the pack's own provenance file says these exact bytes
 * were produced server-side and not altered since, and anyone holding the pack
 * could rewrite `07-user-attested.md` from "sign-off: not given" to a fabricated
 * board approval and still get "Authenticity & Integrity Verified". A digest
 * says *which* self-declaration was in the archive when it was sealed; it does
 * not say the declaration is true. The provenance label keeps saying the latter,
 * and the verifiers keep reporting the file as user-attested.
 *
 * **Why issuance metadata is in the string.** `generatedAt` is printed by the
 * command-line verifier and by the verification page as part of a successful
 * result, and until version 3 nothing bound it: a genuine pack could be given
 * any issue date and still verify. `bytes` is deliberately left out — the
 * content hash already pins the file, so a wrong byte count is contradicted by
 * the file itself.
 *
 * **Compatibility.** A manifest with no `version`, or a version below 3,
 * canonicalises exactly as before, down to the byte, so every pack already in
 * the world still verifies. A version-3 pack that had its `version` edited down
 * to `2.1` produces a different string and fails the hash, so the format cannot
 * be downgraded.
 */

export interface CanonicalManifestParts {
  files: ReadonlyArray<{ path: string; sha256: string }>;
  /**
   * Paths the issuer placed in the archive without vouching for what they say.
   * From format 3 each carries the SHA-256 of the bytes that were sealed.
   */
  attested?: ReadonlyArray<{ path: string; sha256?: string }>;
  projectId?: string;
  runId?: string;
  /** Absent only on packs issued before the run binding existed; those canonicalise without the suffix. */
  runHash?: string;
  engineVersion?: string;
  sapApiCatalogVersion?: string;
  /** `manifest.version`. Absent or below 3 → the version-2 form, byte for byte. */
  version?: string;
  /** `manifest.generatedAt` — bound from format 3 on, ignored before it. */
  generatedAt?: string;
}

/** The manifest version packs are issued with from 17.09.2026; `.1` when an Ed25519 key is configured. */
export const MANIFEST_VERSION_HMAC = '3.0';
export const MANIFEST_VERSION_ED25519 = '3.1';

/** Every character the canonical form uses as a separator. No path may contain one. */
const SEPARATOR = /[:;,]/;
/**
 * The run-binding fields are held to less, because they must be: the live
 * catalog version reads `2024.FPS02 + CR:latest@407843e4 (25467 entries,
 * fetched 2026-09-15)` — a colon and a comma in a value every pack already
 * issued was signed with. `;` is the one that matters there: it is what ends
 * the section, so a field carrying one can write an `attested=` section of its
 * own and drop a bound file without moving a byte. The colon can only shift the
 * boundary between two neighbouring metadata fields; from format 3 the suffix
 * is escaped, which removes even that.
 */
const SECTION_END = /;/;
const SHA256 = /^[0-9a-f]{64}$/;
/** What `new Date().toISOString()` produces, and nothing else. Its colons are safe: it is the last field. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Escape the run-binding fields of a format-3 manifest.
 *
 * `%` first, so the escape is reversible and no two different values can escape
 * to the same string. Format 2 is left exactly as it was: those bytes are
 * already signed.
 */
function escapeField(value: string): string {
  return value.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/;/g, '%3B');
}

/** True for a manifest sealed in the bound form — attested digests and issuance metadata. */
export function bindsIssuanceMetadata(version: string | undefined): boolean {
  const major = Number.parseInt(String(version ?? ''), 10);
  return Number.isFinite(major) && major >= 3;
}

/**
 * Why this manifest cannot be canonicalised to one unambiguous string, or null.
 *
 * Exported so a verifier can report the reason instead of a stack trace: a pack
 * that trips a rule here is a pack no issuer wrote, and the reader deserves to
 * be told which rule.
 */
export function canonicalManifestDefect(m: CanonicalManifestParts): string | null {
  const bound = bindsIssuanceMetadata(m.version);
  const seen = new Set<string>();

  for (const f of m.files) {
    if (!f.path) return 'a file entry has no path';
    if (SEPARATOR.test(f.path)) return `a file path contains a field separator: ${JSON.stringify(f.path)}`;
    if (!SHA256.test(f.sha256)) return `${JSON.stringify(f.path)} carries no 64-digit lowercase SHA-256`;
    if (seen.has(f.path)) return `the same path is listed twice: ${JSON.stringify(f.path)}`;
    seen.add(f.path);
  }

  for (const a of m.attested || []) {
    if (!a.path) return 'an attested entry has no path';
    if (SEPARATOR.test(a.path)) return `an attested path contains a field separator: ${JSON.stringify(a.path)}`;
    if (seen.has(a.path)) return `${JSON.stringify(a.path)} is listed as both signed and attested`;
    seen.add(a.path);
    if (bound) {
      if (!SHA256.test(a.sha256 ?? '')) return `the attested file ${JSON.stringify(a.path)} carries no 64-digit lowercase SHA-256`;
    } else if (a.sha256 !== undefined) {
      // A digest that is not in the string it is claimed to be in is worse than
      // no digest: it reads as bound and is not.
      return `the attested file ${JSON.stringify(a.path)} carries a digest that manifest version ${JSON.stringify(String(m.version ?? ''))} does not bind`;
    }
  }

  if (!bound) {
    for (const [name, value] of [
      ['projectId', m.projectId],
      ['runId', m.runId],
      ['runHash', m.runHash],
      ['engineVersion', m.engineVersion],
      ['sapApiCatalogVersion', m.sapApiCatalogVersion],
    ] as const) {
      if (value !== undefined && SECTION_END.test(value)) return `${name} contains a field separator: ${JSON.stringify(value)}`;
    }
  }

  if (bound) {
    if (SEPARATOR.test(String(m.version))) return `version contains a field separator: ${JSON.stringify(m.version)}`;
    if (!ISO_INSTANT.test(String(m.generatedAt ?? ''))) return `generatedAt is not an ISO-8601 instant: ${JSON.stringify(String(m.generatedAt ?? ''))}`;
  }

  return null;
}

export function canonicalAuditManifest(m: CanonicalManifestParts): string {
  const defect = canonicalManifestDefect(m);
  if (defect) throw new Error(`This manifest has no unambiguous canonical form: ${defect}`);

  const bound = bindsIssuanceMetadata(m.version);
  const sorted = [...m.files].sort((a, b) => a.path.localeCompare(b.path));
  let canonical = sorted.map((f) => `${f.path}:${f.sha256}`).join(';') + ';';
  if (m.runHash !== undefined) {
    const f = bound ? escapeField : (s: string) => s;
    canonical += `${f(m.projectId || '')}:${f(m.runId || '')}:${f(m.runHash || '')}:${f(m.engineVersion || '')}:${f(m.sapApiCatalogVersion || '')};`;
  }
  const attested = [...(m.attested || [])].sort((a, b) => a.path.localeCompare(b.path));
  if (attested.length > 0) {
    const section = bound ? attested.map((a) => `${a.path}:${a.sha256}`) : attested.map((a) => a.path);
    canonical += `attested=${section.join(',')};`;
  }
  if (bound) canonical += `issued=${m.version}:${m.generatedAt};`;
  return canonical;
}
