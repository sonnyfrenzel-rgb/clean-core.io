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
 * Format, version 4 — the same string again, with one more section, for the
 * handover chain of roadmap 8.5:
 *
 *   covers=<step>:<coverage>:<ref>,…;
 *
 * **Why `covers[]` is in the signed string and not beside it.** The point of
 * naming the chain is to say which of its four links the signature stands
 * behind. A `covers[]` that is merely carried in `manifest.json`, unbound, says
 * that in a place anyone holding the pack can rewrite: move the decision link
 * from `attested` to `signed` and the archive reads as though the platform had
 * vouched for the account holder's own sign-off. It is bound, so the claim about
 * the signature is itself signed. Both verifiers additionally hold every row to
 * the manifest it sits in — a `signed` row must name a file listed under
 * `files`, an `attested` row a file listed under `attested`, and a
 * `not-determined` row nothing at all — so `covers[]` cannot promote a file
 * across the boundary `lib/audit-pack-build.ts` draws, and all four links must
 * be present exactly once, so a link cannot be dropped to make a chain look
 * complete.
 *
 * **Compatibility.** A manifest with no `version`, or a version below 3,
 * canonicalises exactly as before, down to the byte, so every pack already in
 * the world still verifies; a version-3 pack canonicalises exactly as it did
 * before version 4 existed, because the new section is written only from major
 * 4 on. A pack that had its `version` edited down — 4 to 3, or 3 to 2.1 —
 * produces a different string and fails the hash, so the format cannot be
 * downgraded.
 */

import { CHAIN_STEPS, COVERAGE_KINDS, type CoverEntry } from './evidence-chain';

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
  /**
   * The handover chain's coverage, one row per link (roadmap 8.5). Bound from
   * format 4 on; a manifest below that version must not carry one, for the same
   * reason an attested digest may not appear in a format it is not bound by.
   */
  covers?: ReadonlyArray<CoverEntry>;
}

/** The manifest version packs are issued with from 23.09.2026; `.1` when an Ed25519 key is configured. */
export const MANIFEST_VERSION_HMAC = '4.0';
export const MANIFEST_VERSION_ED25519 = '4.1';

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

/** True for a manifest whose signature binds the handover chain's `covers[]` (roadmap 8.5). */
export function bindsCoverage(version: string | undefined): boolean {
  const major = Number.parseInt(String(version ?? ''), 10);
  return Number.isFinite(major) && major >= 4;
}

/**
 * Why this `covers[]` cannot be read as a statement about this manifest, or null.
 *
 * Shared with `canonicalManifestDefect` and repeated in `scripts/verify-pack.mjs`;
 * `tests/evidence-chain-covers.spec.ts` holds the two to the same verdicts.
 */
function coversDefect(
  covers: ReadonlyArray<CoverEntry>,
  signedPaths: ReadonlySet<string>,
  attestedPaths: ReadonlySet<string>,
): string | null {
  const seen = new Set<string>();
  for (const c of covers) {
    if (!CHAIN_STEPS.includes(c?.step as never)) return `covers names a link that is not part of the chain: ${JSON.stringify(String(c?.step ?? ''))}`;
    if (!COVERAGE_KINDS.includes(c?.coverage as never)) return `the chain link ${JSON.stringify(c.step)} carries an unknown coverage: ${JSON.stringify(String(c?.coverage ?? ''))}`;
    if (seen.has(c.step)) return `the chain link ${JSON.stringify(c.step)} is listed twice`;
    seen.add(c.step);
    const ref = typeof c.ref === 'string' ? c.ref : '';
    if (SEPARATOR.test(ref)) return `the chain link ${JSON.stringify(c.step)} names a file whose path contains a field separator: ${JSON.stringify(ref)}`;
    // The boundary of roadmap 0.12, asked of every row: a link cannot say the
    // signature covers a file the signature does not cover, and cannot point at
    // a file the archive does not carry.
    if (c.coverage === 'signed' && !signedPaths.has(ref)) {
      return `the chain link ${JSON.stringify(c.step)} claims the signature covers ${JSON.stringify(ref)}, which this manifest does not list under files`;
    }
    if (c.coverage === 'attested' && !attestedPaths.has(ref)) {
      return `the chain link ${JSON.stringify(c.step)} points at ${JSON.stringify(ref)} as a user-attested file, which this manifest does not list under attested`;
    }
    if (c.coverage === 'not-determined' && ref !== '') {
      return `the chain link ${JSON.stringify(c.step)} is not determined and still names a file: ${JSON.stringify(ref)}`;
    }
  }
  // Not a subset: a chain that drops the links it cannot fill reads as a
  // complete one, which is the defect roadmap 8.5 exists to refuse.
  const missing = CHAIN_STEPS.filter((s) => !seen.has(s));
  if (missing.length > 0) return `covers does not account for every link of the chain; missing: ${missing.join(', ')}`;
  return null;
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

  if (bindsCoverage(m.version)) {
    if (!Array.isArray(m.covers)) return 'a manifest of this version must name the handover chain in covers[]';
    const defect = coversDefect(
      m.covers,
      new Set(m.files.map((f) => f.path)),
      new Set((m.attested || []).map((a) => a.path)),
    );
    if (defect) return defect;
  } else if (m.covers !== undefined) {
    // The same rule as for an attested digest in a format that does not bind
    // one: a statement that reads as signed and is not is worse than none.
    return `covers[] is present but manifest version ${JSON.stringify(String(m.version ?? ''))} does not bind it`;
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
  if (bindsCoverage(m.version)) {
    const covers = [...(m.covers || [])].sort((a, b) => a.step.localeCompare(b.step));
    canonical += `covers=${covers.map((c) => `${c.step}:${c.coverage}:${c.ref}`).join(',')};`;
  }
  return canonical;
}
