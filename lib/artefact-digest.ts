/**
 * Digests of a project's source and of what was built from it — computed the
 * same way in the browser and on the server.
 *
 * Why this exists (roadmap E01-F01-US02): after a source change, the design,
 * the generated code, the tests, the documentation and the architect's sign-off
 * were all still there and still read as current. A reviewer could approve a
 * design written for code that was no longer the code under review.
 *
 * `/api/runs/create` records, at the moment the source digest changes, the
 * digests of every artefact as it then stood. Anything still carrying one of
 * those digests was built for the previous source and is stale until it is
 * regenerated. The record lives in `auditMetadata`, which only the server
 * writes, so no client write — least of all a `status` change — clears it.
 *
 * Synchronous on purpose. The phase contract (`lib/workflow-steps.ts`) is a
 * plain function every view calls during render, and `crypto.subtle` only
 * offers a Promise. It is also imported by the server route that writes the
 * record, so the producer and the reader cannot hash differently. No imports:
 * this file has to load in both places.
 *
 * Not a security boundary. Anyone who can edit a field can change its digest;
 * what this guards against is reusing an artefact nobody touched since the
 * source changed. The immutable, parent-linked revision store that would make
 * the chain tamper-evident is E01-F02.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function sha256Bytes(bytes: Uint8Array): string {
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

// Every view calls the contract on every render, and generated code runs to
// hundreds of kilobytes. A handful of recent inputs is all a page ever repeats.
const cache = new Map<string, string>();

/** SHA-256 of the UTF-8 bytes of `text`, lowercase hex — the digest `runs/create` signs. */
export function sha256Hex(text: string): string {
  const hit = cache.get(text);
  if (hit) return hit;
  const digest = sha256Bytes(new TextEncoder().encode(text));
  if (cache.size >= 32) cache.clear();
  cache.set(text, digest);
  return digest;
}

/** Keys sorted, no whitespace — so the same test cases hash the same wherever they were read. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(obj[k]))
      .join(',') +
    '}'
  );
}

/** The artefacts a source change can leave behind. */
export const TRACKED_ARTEFACTS = ['solutionDesign', 'generatedCode', 'testCases', 'documentation'] as const;
export type TrackedArtefact = (typeof TRACKED_ARTEFACTS)[number];

/**
 * Digest of one artefact, or null when there is nothing there.
 *
 * Test cases are hashed without their verdicts: a stale suite that someone runs
 * is still the stale suite, and running it must not freshen it.
 */
export function artefactDigest(key: TrackedArtefact, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() ? sha256Hex(value) : null;
  if (key === 'testCases' && Array.isArray(value)) {
    if (value.length === 0) return null;
    const withoutVerdicts = value.map((t) => {
      if (!t || typeof t !== 'object') return t;
      const copy = { ...(t as Record<string, unknown>) };
      delete copy.status;
      delete copy.message;
      return copy;
    });
    return sha256Hex(canonical(withoutVerdicts));
  }
  return sha256Hex(canonical(value));
}

/**
 * A sign-off, reduced to something comparable across SDKs. The design page
 * writes an ISO string; an older record may hold a Firestore Timestamp, which
 * the client and Admin SDKs both expose through `toMillis()`.
 */
export function signOffKey(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return `ms:${(value as { toMillis: () => number }).toMillis()}`;
  }
  return null;
}

/**
 * What `runs/create` stores at `auditMetadata.sourceChange` when the analysed
 * source changes. Server-written; not in the client update allowlist.
 */
export interface SourceChangeRecord {
  /** Server time the change was seen, ISO 8601. */
  at: string;
  /** The run that brought the new source. */
  runId: string;
  /** Digest of the source everything below was built for. */
  previousSha256: string;
  /** Digests of the artefacts as they stood at the change. */
  artefacts: Partial<Record<TrackedArtefact, string>>;
  /** `signOffKey` of the sign-off standing at the change, if there was one. */
  signOff?: string;
}

/** Build the record from the project as it stands just before the new run is written. */
export function buildSourceChangeRecord(
  project: Record<string, unknown>,
  previousSha256: string,
  runId: string,
  at: string,
): SourceChangeRecord {
  const artefacts: Partial<Record<TrackedArtefact, string>> = {};
  for (const key of TRACKED_ARTEFACTS) {
    const d = artefactDigest(key, project[key]);
    if (d) artefacts[key] = d;
  }
  const record: SourceChangeRecord = { at, runId, previousSha256, artefacts };
  const signOff = project.approvedByArchitect === true ? signOffKey(project.architectSignOffAt) : null;
  if (signOff) record.signOff = signOff;
  return record;
}
