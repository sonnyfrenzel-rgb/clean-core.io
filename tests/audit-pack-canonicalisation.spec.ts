import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import {
  canonicalAuditManifest,
  MANIFEST_VERSION_ED25519,
  MANIFEST_VERSION_HMAC,
} from '../lib/audit-pack-canonical';
import { buildEvidenceChain, coversOf } from '../lib/evidence-chain';

/**
 * Three ways a signed audit pack could be rewritten and still verify
 * (QA full review of a19945ef01dc, twelve findings over three files).
 *
 * 1. **The canonical form was not canonical.** `path:hash;path:hash;` with no
 *    escaping and no length prefixes: delete the file `a`, rename `b` to
 *    `a:<hash of a>;b`, and replace the two manifest rows with that one row.
 *    The string the issuer signed comes out byte for byte identical, the
 *    renamed file hashes correctly, nothing in the archive is unlisted — and a
 *    signed evidence file has vanished from a pack both verifiers call
 *    authentic. The same trick swallows the `attested=` section into
 *    `sapApiCatalogVersion`. The counter-examples below build the collision and
 *    then show the refusal; they fail against the old form, which produced the
 *    colliding strings happily.
 * 2. **An attested file could be rewritten.** Only its name was bound, so
 *    "Architect sign-off: not given" could become a board approval after
 *    sealing, and the verdict stayed "Authenticity & Integrity Verified".
 * 3. **Issuance metadata was never signed.** `generatedAt` is printed by both
 *    verifiers as part of a successful result and nothing bound it.
 *
 * What must not break: a pack sealed before 17.09.2026 still verifies, because
 * the string built for it is byte for byte the one it was signed with.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');

const BODY_A = '# Findings\nRisk: CRITICAL. Twelve blocking modifications.';
const BODY_B = '# Executive Summary\nClean core score 42.';
const ATTESTATION = '# User-attested\nArchitect sign-off: not given.';
const FORGED_ATTESTATION = '# User-attested\nArchitect sign-off: given by the board.';
const HA = sha(BODY_A);
const HB = sha(BODY_B);

const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
/**
 * The handover chain of roadmap 8.5, as a pack with this file list carries it:
 * the decision link points at the attested file, the other three are open. A
 * manifest sealed in format 4 must name it, so every fixture below that claims
 * today's version carries it too.
 */
const COVERS = coversOf(buildEvidenceChain({ projectId: 'p-1', runId: 'r-1' }));
const GENUINE_FILES = [
  { path: 'a-findings.md', sha256: HA },
  { path: 'b-summary.md', sha256: HB },
];
/** Two rows collapsed into one whose path carries the first row's record. */
const COLLAPSED_FILES = [{ path: `a-findings.md:${HA};b-summary.md`, sha256: HB }];

/** The form as it stood until 17.09.2026, so the collision is shown and not merely asserted. */
function formUpTo1709(m: {
  files: { path: string; sha256: string }[];
  attested?: { path: string }[];
  projectId?: string; runId?: string; runHash?: string; engineVersion?: string; sapApiCatalogVersion?: string;
}): string {
  const sorted = [...m.files].sort((a, b) => a.path.localeCompare(b.path));
  let c = sorted.map((f) => `${f.path}:${f.sha256}`).join(';') + ';';
  if (m.runHash !== undefined) {
    c += `${m.projectId || ''}:${m.runId || ''}:${m.runHash || ''}:${m.engineVersion || ''}:${m.sapApiCatalogVersion || ''};`;
  }
  const attested = [...(m.attested || [])].map((a) => a.path).sort((a, b) => a.localeCompare(b));
  if (attested.length > 0) c += `attested=${attested.join(',')};`;
  return c;
}

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { privateKey, rawPublicBase64: der.subarray(der.length - 32).toString('base64') };
}

/** A ZIP whose manifest is written verbatim — the point is to hand a verifier a manifest no issuer would write. */
async function packOf(manifest: Record<string, unknown>, entries: Record<string, string>) {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(entries)) zip.file(path, body);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function writePack(manifest: Record<string, unknown>, entries: Record<string, string>) {
  const packPath = join(mkdtempSync(join(tmpdir(), 'canon-')), 'pack.zip');
  writeFileSync(packPath, await packOf(manifest, entries));
  return packPath;
}

function runCli(packPath: string, rawPublicBase64: string) {
  const r = spawnSync(process.execPath, [SCRIPT, packPath, '--key', rawPublicBase64], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.replace(/\[\d+m/g, '') };
}

/** A pack sealed the way `/api/audit-pack/create` seals one today, signed with `key`. */
async function sealedPack(key: KeyObject, opts: { attestation?: string; generatedAt?: string } = {}) {
  const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(ATTESTATION) }];
  const generatedAt = opts.generatedAt ?? '2026-09-17T08:00:00.000Z';
  const files = GENUINE_FILES.map((f) => ({ ...f, bytes: 1 }));
  const manifestHash = sha(canonicalAuditManifest({ files, attested, covers: COVERS, ...bound, version: MANIFEST_VERSION_ED25519, generatedAt }));
  const manifest = {
    version: MANIFEST_VERSION_ED25519, ...bound, generatedAt, files, attested, covers: COVERS, manifestHash,
    signed: true, signature: '', signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), key).toString('base64'),
  };
  return {
    manifest,
    entries: {
      'a-findings.md': BODY_A,
      'b-summary.md': BODY_B,
      '07-user-attested.md': opts.attestation ?? ATTESTATION,
    },
  };
}

// ── 1. The canonical form is canonical again ──────────────────────────────

test.describe('a file list can no longer be replaced without moving the signed bytes', () => {
  test('the collision is real, and the form now refuses the input that makes it', () => {
    // Exactly the substitution the reviewer described, in the old form.
    expect(formUpTo1709({ files: COLLAPSED_FILES, ...bound })).toBe(formUpTo1709({ files: GENUINE_FILES, ...bound }));

    // The genuine list is unaffected; the colliding one has no canonical form.
    expect(canonicalAuditManifest({ files: GENUINE_FILES, ...bound })).toBe(formUpTo1709({ files: GENUINE_FILES, ...bound }));
    expect(() => canonicalAuditManifest({ files: COLLAPSED_FILES, ...bound })).toThrow(/field separator/);
  });

  test('the run suffix can no longer swallow the attested section', () => {
    const withAttested = { files: GENUINE_FILES, ...bound, attested: [{ path: '07-user-attested.md' }] };
    const withoutAttested = { files: GENUINE_FILES, ...bound, sapApiCatalogVersion: '2024.FPS02;attested=07-user-attested.md' };
    expect(formUpTo1709(withoutAttested)).toBe(formUpTo1709(withAttested));
    expect(() => canonicalAuditManifest(withoutAttested)).toThrow(/sapApiCatalogVersion contains a field separator/);
  });

  test('the catalog version every live pack carries still canonicalises, colon, comma and all', () => {
    // `getMergedCatalogVersion()` on 17.09.2026. Refusing a colon or a comma in
    // the run-binding fields would have refused every pack ever issued — which
    // is how the first version of this rule failed, loudly, against the route.
    const live = '2024.FPS02 + CR:latest@407843e4 (25467 entries, fetched 2026-09-15)';
    const parts = { files: GENUINE_FILES, ...bound, sapApiCatalogVersion: live };
    expect(canonicalAuditManifest(parts)).toBe(formUpTo1709(parts));
    // In format 3 the same value is escaped, so the four boundaries in the run
    // suffix cannot be moved either.
    const v3 = canonicalAuditManifest({ ...parts, attested: [{ path: '07-user-attested.md', sha256: sha(ATTESTATION) }], covers: COVERS, version: MANIFEST_VERSION_HMAC, generatedAt: '2026-09-17T08:00:00.000Z' });
    expect(v3).toContain('2024.FPS02 + CR%3Alatest@407843e4 (25467 entries, fetched 2026-09-15)');
    expect(canonicalAuditManifest({ ...parts, attested: [{ path: '07-user-attested.md', sha256: sha(ATTESTATION) }], covers: COVERS, engineVersion: 'v1.0:2024.FPS02 + CR', sapApiCatalogVersion: 'latest@407843e4 (25467 entries, fetched 2026-09-15)', version: MANIFEST_VERSION_HMAC, generatedAt: '2026-09-17T08:00:00.000Z' }))
      .not.toBe(v3);
  });

  test('a digest that is not a SHA-256, and a path listed twice, are refused too', () => {
    expect(() => canonicalAuditManifest({ files: [{ path: 'a.md', sha256: 'not-a-hash' }], ...bound }))
      .toThrow(/carries no 64-digit lowercase SHA-256/);
    expect(() => canonicalAuditManifest({ files: [GENUINE_FILES[0], GENUINE_FILES[0]], ...bound }))
      .toThrow(/the same path is listed twice/);
    expect(() => canonicalAuditManifest({ files: GENUINE_FILES, ...bound, attested: [{ path: 'a-findings.md' }] }))
      .toThrow(/listed as both signed and attested/);
  });

  test('the web verifier refuses the collapsed manifest instead of calling it consistent', async () => {
    const files = COLLAPSED_FILES.map((f) => ({ ...f, bytes: BODY_B.length }));
    const buf = await packOf(
      { version: '2.0', ...bound, generatedAt: '2026-09-17T08:00:00.000Z', files, manifestHash: sha(formUpTo1709({ files: GENUINE_FILES, ...bound })), signed: false, signature: '' },
      { [COLLAPSED_FILES[0].path]: BODY_B },
    );
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.integrityValid, 'a collapsed file list passed integrity').toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errors.join(' ')).toContain('no unambiguous canonical form');
  });

  test('the offline verifier refuses it as well, with the signature the issuer wrote', async () => {
    const kp = keyPair();
    const manifestHash = sha(formUpTo1709({ files: GENUINE_FILES, ...bound }));
    const files = COLLAPSED_FILES.map((f) => ({ ...f, bytes: BODY_B.length }));
    const packPath = await writePack(
      {
        version: '2.1', ...bound, generatedAt: '2026-09-17T08:00:00.000Z', files, manifestHash, signed: true, signature: '',
        signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), kp.privateKey).toString('base64'),
      },
      { [COLLAPSED_FILES[0].path]: BODY_B },
    );
    const { code, out } = runCli(packPath, kp.rawPublicBase64);
    expect(out).toContain('no unambiguous canonical form');
    expect(out).not.toContain('Verified.');
    expect(code, 'the offline verifier accepted a pack missing a signed file').toBe(1);
  });
});

// ── 2. The attested file's bytes are bound ────────────────────────────────

test.describe('a sealed self-declaration cannot be rewritten unnoticed', () => {
  test('the web verifier fails a pack whose attestation changed after sealing', async () => {
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(ATTESTATION) }];
    const files = GENUINE_FILES.map((f) => ({ ...f, bytes: 1 }));
    const generatedAt = '2026-09-17T08:00:00.000Z';
    const manifestHash = sha(canonicalAuditManifest({ files, attested, covers: COVERS, ...bound, version: MANIFEST_VERSION_HMAC, generatedAt }));
    const manifest = { version: MANIFEST_VERSION_HMAC, ...bound, generatedAt, files, attested, covers: COVERS, manifestHash, signed: false, signature: '' };

    const intact = await verifyAuditPack((await packOf(manifest, {
      'a-findings.md': BODY_A, 'b-summary.md': BODY_B, '07-user-attested.md': ATTESTATION,
    })) as unknown as Blob);
    expect(intact.integrityValid, 'an untouched pack was rejected').toBe(true);
    // Still reported as the account holder's own statement, never as evidence.
    expect(intact.fileIntegrity.find((f) => f.path === '07-user-attested.md')?.signed).toBe(false);

    const rewritten = await verifyAuditPack((await packOf(manifest, {
      'a-findings.md': BODY_A, 'b-summary.md': BODY_B, '07-user-attested.md': FORGED_ATTESTATION,
    })) as unknown as Blob);
    expect(rewritten.integrityValid, 'a rewritten attestation passed integrity').toBe(false);
    expect(rewritten.status).toBe('failed');
    expect(rewritten.errors.join(' ')).toContain('Hash mismatch for attested file 07-user-attested.md');
  });

  test('the offline verifier calls the rewritten attestation altered and does not say Verified', async () => {
    const kp = keyPair();
    const { manifest, entries } = await sealedPack(kp.privateKey, { attestation: FORGED_ATTESTATION });
    const { code, out } = runCli(await writePack(manifest, entries), kp.rawPublicBase64);
    expect(out).toContain('altered');
    expect(out).toContain('07-user-attested.md');
    expect(out).not.toContain('Verified.');
    expect(code).toBe(1);
  });

  test('an untouched sealed pack still reads as verified, and names what nobody vouches for', async () => {
    const kp = keyPair();
    const { manifest, entries } = await sealedPack(kp.privateKey);
    const { code, out } = runCli(await writePack(manifest, entries), kp.rawPublicBase64);
    expect(code, out).toBe(0);
    expect(out).toContain('Verified. Contents, manifest and signature all agree');
    expect(out).toContain("user-attested — the sealed bytes, the account holder's own statement");
    // The whole-archive sentence is only used where it is true.
    expect(out).not.toContain('carry no digest');
  });
});

// ── 3. Issuance metadata is part of what was signed ───────────────────────

test.describe('the issue date is no longer a field anyone can choose', () => {
  test('changing generatedAt breaks the manifest hash in the web verifier', async () => {
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(ATTESTATION) }];
    const files = GENUINE_FILES.map((f) => ({ ...f, bytes: 1 }));
    const manifestHash = sha(canonicalAuditManifest({
      files, attested, covers: COVERS, ...bound, version: MANIFEST_VERSION_HMAC, generatedAt: '2026-09-17T08:00:00.000Z',
    }));
    const buf = await packOf(
      { version: MANIFEST_VERSION_HMAC, ...bound, generatedAt: '2019-01-01T00:00:00.000Z', files, attested, covers: COVERS, manifestHash, signed: false, signature: '' },
      { 'a-findings.md': BODY_A, 'b-summary.md': BODY_B, '07-user-attested.md': ATTESTATION },
    );
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.manifestHashValid, 'the issue date could still be chosen freely').toBe(false);
    expect(result.status).toBe('failed');
  });

  test('the offline verifier prints the date it checked, not one it was handed', async () => {
    const kp = keyPair();
    const { manifest, entries } = await sealedPack(kp.privateKey);
    const forged = { ...manifest, generatedAt: '2019-01-01T00:00:00.000Z' };
    const { code, out } = runCli(await writePack(forged, entries), kp.rawPublicBase64);
    expect(out).toContain('FAILED    manifest digest');
    expect(code).toBe(1);
  });

  test('the format cannot be downgraded to the one that bound none of it', async () => {
    const kp = keyPair();
    const { manifest, entries } = await sealedPack(kp.privateKey);
    // Relabelled 2.1, with the attested digest dropped the way a v2 pack carries it.
    const downgraded: Record<string, unknown> = {
      ...manifest,
      version: '2.1',
      attested: manifest.attested.map(({ path, provenance }) => ({ path, provenance })),
    };
    // A format-2 manifest carries neither an attested digest nor a covers[];
    // leaving one in would be refused for saying so, which is a different
    // sentence from the one this test is about.
    delete downgraded.covers;
    const { code, out } = runCli(await writePack(downgraded, entries), kp.rawPublicBase64);
    expect(out).toContain('FAILED    manifest digest');
    expect(code).toBe(1);
  });

  test('a digest the claimed version does not bind is refused rather than ignored', () => {
    expect(() =>
      canonicalAuditManifest({
        files: GENUINE_FILES, ...bound, version: '2.1',
        attested: [{ path: '07-user-attested.md', sha256: sha(ATTESTATION) }],
      }),
    ).toThrow(/does not bind/);
  });
});

// ── 4. Nothing already delivered stops verifying ──────────────────────────

test.describe('packs sealed before 17.09.2026', () => {
  test('canonicalise to the same bytes as before, with and without the run binding', () => {
    const files = [
      { path: '01-input-fingerprint.json', sha256: '1'.repeat(64) },
      { path: '00-executive-summary.md', sha256: '0'.repeat(64) },
    ];
    const legacyBound = { projectId: 'p', runId: 'r', runHash: 'h', engineVersion: 'v', sapApiCatalogVersion: 'c' };
    const attested = [{ path: '07-user-attested.md' }];
    for (const version of [undefined, '2.0', '2.1']) {
      expect(canonicalAuditManifest({ files, ...legacyBound, version })).toBe(
        `00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};p:r:h:v:c;`,
      );
      expect(canonicalAuditManifest({ files, version })).toBe(
        `00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};`,
      );
      expect(canonicalAuditManifest({ files, ...legacyBound, attested, version })).toBe(
        `00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};p:r:h:v:c;attested=07-user-attested.md;`,
      );
    }
  });

  test('still verify offline, and the verdict names the one thing it cannot check', async () => {
    const kp = keyPair();
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const }];
    const files = GENUINE_FILES.map((f) => ({ ...f, bytes: 1 }));
    const manifestHash = sha(formUpTo1709({ files, attested, ...bound }));
    const packPath = await writePack(
      {
        version: '2.1', ...bound, generatedAt: '2026-09-16T08:00:00.000Z', files, attested, manifestHash, signed: true, signature: '',
        signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), kp.privateKey).toString('base64'),
      },
      { 'a-findings.md': BODY_A, 'b-summary.md': BODY_B, '07-user-attested.md': ATTESTATION },
    );
    const { code, out } = runCli(packPath, kp.rawPublicBase64);
    expect(code, out).toBe(0);
    expect(out).toContain('not covered by the signature');
    expect(out).toContain('carry no digest in this pack');
  });

  test('the web verifier accepts them and says the same thing in its notices', async () => {
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const }];
    const files = GENUINE_FILES.map((f) => ({ ...f, bytes: 1 }));
    const buf = await packOf(
      { version: '2.0', ...bound, generatedAt: '2026-09-16T08:00:00.000Z', files, attested, manifestHash: sha(formUpTo1709({ files, attested, ...bound })), signed: false, signature: '' },
      { 'a-findings.md': BODY_A, 'b-summary.md': BODY_B, '07-user-attested.md': ATTESTATION },
    );
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.integrityValid, 'a pack sealed in the old format stopped verifying').toBe(true);
    expect(result.errors.join(' ')).toContain('Attested file not covered by a digest');
    // Its row carries no hash, which is what the page reads to pick the label.
    expect(result.fileIntegrity.find((f) => f.path === '07-user-attested.md')?.expectedHash).toBe('');
  });
});
