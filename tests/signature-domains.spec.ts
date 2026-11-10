import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';
import {
  canonicalizeJson,
  computeRunHash,
  expectedRunSignature,
  purposeKey,
  RUN_SIGNATURE_SCHEME,
  signRunHash,
  signRunHashV2,
  verifyRunIntegrity,
} from '../lib/run-signature';
import { manifestHmacValid, signManifestHash } from '../lib/pack-signature';
import {
  canonicalAuditManifest,
  parseCanonicalManifest,
  MANIFEST_VERSION_HMAC,
  type CanonicalManifestParts,
} from '../lib/audit-pack-canonical';
import { buildEvidenceChain, coversOf } from '../lib/evidence-chain';

/**
 * CA-INT-03 — runs and audit-pack manifests are signed under separate keys,
 * and the public verify endpoint answers only for canonical manifests.
 *
 * What must not break: every run and every pack signed before keeps verifying.
 */
const KEY = 'k'.repeat(48);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ROOT = path.resolve(__dirname, '..');

function run(extra: Record<string, unknown> = {}) {
  const unsigned = { projectId: 'p-1', userId: 'u-1', cleanCoreScore: 71, uploadedFileName: 'z.abap', ...extra };
  return { unsigned, runHash: computeRunHash(unsigned) };
}

test.describe('runs', () => {
  test('a run sealed in the new scheme verifies, and its signature is not the legacy one', () => {
    const { unsigned, runHash } = run({ signatureScheme: RUN_SIGNATURE_SCHEME });
    const signature = signRunHashV2(runHash, KEY);
    expect(signature).not.toBe(signRunHash(runHash, KEY));
    expect(verifyRunIntegrity({ ...unsigned, runHash, signature }, KEY)).toEqual({ valid: true });
  });

  test('a run sealed before the scheme existed verifies exactly as it was sealed', () => {
    const { unsigned, runHash } = run();
    expect(verifyRunIntegrity({ ...unsigned, runHash, signature: signRunHash(runHash, KEY) }, KEY)).toEqual({ valid: true });
    // ...and a new-scheme signature on a run that does not name the scheme is refused.
    expect(verifyRunIntegrity({ ...unsigned, runHash, signature: signRunHashV2(runHash, KEY) }, KEY).valid).toBe(false);
  });

  test('a new-scheme run cannot be moved back to the legacy form', () => {
    const { unsigned, runHash } = run({ signatureScheme: RUN_SIGNATURE_SCHEME });
    // The legacy signature over the same hash is refused for a run naming the scheme...
    expect(verifyRunIntegrity({ ...unsigned, runHash, signature: signRunHash(runHash, KEY) }, KEY).reason).toBe('signature-mismatch');
    // ...and removing the scheme changes the hash the signature covers.
    const withoutScheme: Record<string, unknown> = { ...unsigned };
    delete withoutScheme.signatureScheme;
    expect(verifyRunIntegrity({ ...withoutScheme, runHash, signature: signRunHashV2(runHash, KEY) }, KEY).reason).toBe('hash-mismatch');
  });

  test('an unknown scheme is refused, never guessed', () => {
    const { unsigned, runHash } = run({ signatureScheme: 'something-else' });
    expect(expectedRunSignature({ ...unsigned, runHash }, KEY)).toBeNull();
    expect(verifyRunIntegrity({ ...unsigned, runHash, signature: signRunHashV2(runHash, KEY) }, KEY).reason).toBe('unknown-scheme');
  });
});

test.describe('pack manifests', () => {
  const files = [{ path: '00-summary.md', sha256: sha('a') }, { path: '01-findings.csv', sha256: sha('b') }];
  const covers = coversOf(buildEvidenceChain({ projectId: 'p-1', runId: 'r-1' }));
  const v2: CanonicalManifestParts = {
    files, projectId: 'p-1', runId: 'r-1', runHash: sha('run'), engineVersion: '3.0.20',
    sapApiCatalogVersion: '2024.FPS02 + CR:latest@407843e4 (25467 entries, fetched 2026-09-15)',
  };
  const v5: CanonicalManifestParts = {
    ...v2,
    version: MANIFEST_VERSION_HMAC,
    generatedAt: '2026-10-22T10:11:12.345Z',
    attested: [{ path: '07-user-attested.md', sha256: sha('att') }],
    covers,
    aiGeneration: { artefact: 'analysis-narrative', statement: 'Written by a model: x; y', provider: 'google', model: 'gemini-3.8-flash', generatedOn: '2026-10-22', basis: 'signed-run' },
  };

  test('the manifest key is not the run key', () => {
    const h = sha('same hex string');
    expect(signManifestHash(h, KEY)).not.toBe(signRunHashV2(h, KEY));
    expect(signManifestHash(h, KEY)).not.toBe(signRunHash(h, KEY));
    expect(purposeKey(KEY, 'pack-manifest').equals(purposeKey(KEY, 'run-signature'))).toBe(false);
  });

  test('a pack signed in the new form and a pack signed before both verify', () => {
    const h = sha(canonicalAuditManifest(v5));
    expect(manifestHmacValid(h, signManifestHash(h, KEY), KEY)).toBe(true);
    expect(manifestHmacValid(h, createHmac('sha256', KEY).update(h).digest('hex'), KEY)).toBe(true);
    expect(manifestHmacValid(h, 'f'.repeat(64), KEY)).toBe(false);
    expect(manifestHmacValid(h, signManifestHash(sha('other'), KEY), KEY)).toBe(false);
  });

  test('every manifest format the issuer wrote reads back to the same bytes', () => {
    const v3 = { ...v2, version: '3.0', generatedAt: '2026-09-18T08:00:00.000Z', attested: [{ path: '07-user-attested.md', sha256: sha('att') }] };
    const v4 = { ...v3, version: '4.0', covers: coversOf(buildEvidenceChain({ projectId: 'p-1', runId: 'r-1' })) };
    const old = { files }; // before the run binding existed
    const v2attested = { ...v2, attested: [{ path: '07-user-attested.md' }] };
    for (const parts of [old, v2, v2attested, v3, v4, v5, { ...v5, version: '5.1' }]) {
      const canonical = canonicalAuditManifest(parts as CanonicalManifestParts);
      const parsed = parseCanonicalManifest(canonical);
      expect(parsed, canonical).not.toBeNull();
      expect(canonicalAuditManifest(parsed!)).toBe(canonical);
    }
  });

  test('a string the issuer could not have written as a manifest is not one', () => {
    const { unsigned } = run({ signatureScheme: RUN_SIGNATURE_SCHEME });
    for (const s of [
      canonicalizeJson(unsigned), // a run's canonical JSON
      '',
      'test-manifest',
      `00-summary.md:${sha('a')}`, // no closing ';'
      `00-summary.md:hash123;`, // not a SHA-256
      `${canonicalAuditManifest(v5)} `,
      canonicalAuditManifest(v5).replace('issued=5.0:', 'issued=5.0:x'),
    ]) {
      expect(parseCanonicalManifest(s), JSON.stringify(s).slice(0, 80)).toBeNull();
    }
  });

  test('/api/export/verify parses the manifest before it checks any signature', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/api/export/verify/route.ts'), 'utf8');
    const parse = src.indexOf('parseCanonicalManifest(canonicalManifest) === null');
    expect(parse).toBeGreaterThan(-1);
    expect(parse).toBeLessThan(src.indexOf('verifyEd25519('));
    expect(parse).toBeLessThan(src.indexOf('manifestHmacValid('));
    expect(src, 'the HMAC is computed with the raw key again').not.toContain('createHmac');
  });

  test('runs/create and audit-pack/create sign each with its own key', () => {
    const runs = fs.readFileSync(path.join(ROOT, 'app/api/runs/create/route.ts'), 'utf8');
    expect(runs).toContain('signatureScheme: RUN_SIGNATURE_SCHEME');
    expect(runs).toContain('signRunHashV2(runHash, signingKey)');
    expect(runs).not.toContain('createHmac');
    const pack = fs.readFileSync(path.join(ROOT, 'app/api/audit-pack/create/route.ts'), 'utf8');
    expect(pack).toContain('signManifestHash(manifestHash, signingKey)');
    expect(pack).not.toContain('createHmac');
  });
});
