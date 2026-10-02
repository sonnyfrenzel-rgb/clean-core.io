import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { verifyAuditPack, ed25519Label, SIGNING_KEY_DOCUMENT_PATH } from '../lib/audit-pack-verify';
import { canonicalAuditManifest, MANIFEST_VERSION_ED25519, MANIFEST_VERSION_HMAC } from '../lib/audit-pack-canonical';
import { buildEvidenceChain, coversOf } from '../lib/evidence-chain';

/**
 * `/verify-pack` checks the Ed25519 signature too (owner decision 02.10.2026).
 *
 * It used to check only the HMAC — through the issuer, because an HMAC needs
 * the secret — and ignore the Ed25519 signature a pack of format 4.1 carries,
 * the one signature anybody can check with a published key. The offline
 * `scripts/verify-pack.mjs` already checked it; the page now does the same in
 * the browser, with the same key selection: the key the pack names, derived
 * from each published key, retired keys honoured, the pack's own key URL never
 * followed. The files are still hashed in the browser and never uploaded.
 *
 * The line it shows is one of four, said as it is: verified, not present,
 * failed, or present but not checked (with the reason).
 */

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const BODY_A = '# Findings\nRisk: CRITICAL.';
const BODY_B = '# Executive Summary\nClean core score 42.';
const ATTESTATION = '# User-attested\nArchitect sign-off: not given.';
const bound = { projectId: 'p-ed', runId: 'r-ed', runHash: 'h-ed', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
const COVERS = coversOf(buildEvidenceChain({ projectId: 'p-ed', runId: 'r-ed' }));
const FILES = [
  { path: 'a-findings.md', sha256: sha(BODY_A), bytes: 1 },
  { path: 'b-summary.md', sha256: sha(BODY_B), bytes: 1 },
];
const ATTESTED = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(ATTESTATION) }];
const GENERATED = '2026-10-02T08:00:00.000Z';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return { privateKey, publicKey: raw.toString('base64'), keyId: sha(raw).slice(0, 16) };
}
type Pair = ReturnType<typeof keyPair>;

const doc = (...keys: Array<{ pair: Pair; status: 'active' | 'retired' }>) => ({
  keys: keys.map(({ pair, status }) => ({ keyId: pair.keyId, algorithm: 'Ed25519', status, publicKey: pair.publicKey })),
});

/** A pack sealed the way `/api/audit-pack/create` seals one, with or without Ed25519. */
async function pack(opts: { signer?: KeyObject; keyId?: string; signedHash?: string; body?: string } = {}) {
  const version = opts.signer ? MANIFEST_VERSION_ED25519 : MANIFEST_VERSION_HMAC;
  const manifestHash = sha(
    canonicalAuditManifest({ files: FILES, attested: ATTESTED, covers: COVERS, ...bound, version, generatedAt: GENERATED }),
  );
  const manifest: Record<string, unknown> = {
    version, ...bound, generatedAt: GENERATED, files: FILES, attested: ATTESTED, covers: COVERS, manifestHash,
    signed: true, signature: '',
  };
  if (opts.signer) {
    manifest.signatureEd25519 = sign(null, Buffer.from(opts.signedHash ?? manifestHash, 'utf8'), opts.signer).toString('base64');
    if (opts.keyId) manifest.signingKeyId = opts.keyId;
    // Named by the pack, and never followed by the verifier.
    manifest.signingKeyUrl = 'https://attacker.example/keys.json';
  }
  const zip = new JSZip();
  zip.file('a-findings.md', opts.body ?? BODY_A);
  zip.file('b-summary.md', BODY_B);
  zip.file('07-user-attested.md', ATTESTATION);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const verify = (buf: Buffer, keyDoc: unknown | (() => Promise<unknown>)) =>
  verifyAuditPack(buf as unknown as Blob, {
    fetchKeyDocument: typeof keyDoc === 'function' ? (keyDoc as () => Promise<unknown>) : async () => keyDoc,
  });

test.describe('the Ed25519 signature, checked by the web verifier', () => {
  test('a genuine Ed25519 pack is verified against the published active key, and is authentic', async () => {
    const k = keyPair();
    const result = await verify(await pack({ signer: k.privateKey, keyId: k.keyId }), doc({ pair: k, status: 'active' }));
    expect(result.ed25519, result.errors.join(' | ')).toEqual({ state: 'verified', keyId: k.keyId, reason: null });
    // No HMAC on this fixture: the Ed25519 signature alone carries the verdict.
    expect(result.signatureValid).toBeNull();
    expect(result.status).toBe('authentic');
    expect(result.success).toBe(true);
  });

  test('a pack signed before a rotation verifies against the retired key it names', async () => {
    const old = keyPair();
    const current = keyPair();
    const result = await verify(
      await pack({ signer: old.privateKey, keyId: old.keyId }),
      doc({ pair: current, status: 'active' }, { pair: old, status: 'retired' }),
    );
    expect(result.ed25519?.state, result.errors.join(' | ')).toBe('verified');
    expect(result.ed25519?.keyId).toBe(old.keyId);
    expect(result.status).toBe('authentic');
  });

  test('a signature over a different hash fails, and fails the pack', async () => {
    const k = keyPair();
    const result = await verify(
      await pack({ signer: k.privateKey, keyId: k.keyId, signedHash: sha('something else') }),
      doc({ pair: k, status: 'active' }),
    );
    expect(result.ed25519?.state).toBe('failed');
    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('Ed25519 signature verification failed');
  });

  test('a signature by a key nobody published fails against the key the pack claims', async () => {
    const published = keyPair();
    const forger = keyPair();
    // The forger names the published key's id; the signature is his own.
    const result = await verify(
      await pack({ signer: forger.privateKey, keyId: published.keyId }),
      doc({ pair: published, status: 'active' }),
    );
    expect(result.ed25519?.state).toBe('failed');
    expect(result.status).toBe('failed');
  });

  test('a key the instance no longer publishes leaves the signature unchecked, not verified', async () => {
    const withdrawn = keyPair();
    const current = keyPair();
    const result = await verify(
      await pack({ signer: withdrawn.privateKey, keyId: withdrawn.keyId }),
      doc({ pair: current, status: 'active' }),
    );
    expect(result.ed25519?.state).toBe('unchecked');
    expect(result.ed25519?.reason).toContain('withdrawn');
    expect(result.status, 'an unpublished key made a pack authentic').toBe('integrity-only');
  });

  test('an unreachable key document leaves it unchecked, and nothing is fetched from the pack', async () => {
    const k = keyPair();
    const asked: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input));
      throw new Error('offline');
    }) as typeof fetch;
    let result;
    try {
      result = await verifyAuditPack((await pack({ signer: k.privateKey, keyId: k.keyId })) as unknown as Blob);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(result.ed25519?.state).toBe('unchecked');
    expect(result.status).toBe('integrity-only');
    expect(asked, 'the verifier followed the key URL the pack named').toEqual([SIGNING_KEY_DOCUMENT_PATH]);
  });

  test('an HMAC-only pack says not present, and the verdict is unchanged', async () => {
    const result = await verify(await pack(), () => Promise.reject(new Error('must not be asked')));
    expect(result.ed25519).toEqual({ state: 'not-present', keyId: null, reason: null });
    expect(result.status).toBe('integrity-only');
  });

  test('a changed file still fails, whatever the signature says', async () => {
    const k = keyPair();
    const result = await verify(
      await pack({ signer: k.privateKey, keyId: k.keyId, body: '# Findings\nRisk: LOW.' }),
      doc({ pair: k, status: 'active' }),
    );
    expect(result.integrityValid).toBe(false);
    expect(result.status).toBe('failed');
  });

  test('the four states have their own words', () => {
    expect(ed25519Label('verified')).toBe('Ed25519: verified');
    expect(ed25519Label('not-present')).toBe('Ed25519: not present');
    expect(ed25519Label('failed')).toBe('Ed25519: failed');
    expect(ed25519Label('unchecked')).toBe('Ed25519: present, not checked');
  });
});

test.describe('the page', () => {
  test('shows "Ed25519: verified" for a genuine pack, and "failed" for a forged one, without uploading the archive', async ({ page }) => {
    test.setTimeout(120 * 1000);
    const k = keyPair();
    const uploads: string[] = [];
    await page.route(`**${SIGNING_KEY_DOCUMENT_PATH}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc({ pair: k, status: 'active' })) }),
    );
    page.on('request', (req) => {
      const body = req.postDataBuffer();
      if (body && body.length > 0 && body.subarray(0, 2).toString('latin1') === 'PK') uploads.push(req.url());
    });

    await page.goto('/verify-pack');
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({ name: 'genuine.zip', mimeType: 'application/zip', buffer: await pack({ signer: k.privateKey, keyId: k.keyId }) });
    await expect(page.locator('[data-ed25519-state]')).toHaveAttribute('data-ed25519-state', 'verified', { timeout: 30_000 });
    await expect(page.getByText('Ed25519: verified', { exact: true })).toBeVisible();
    await expect(page.getByText('Authenticity & Integrity Verified', { exact: true })).toBeVisible();

    await input.setInputFiles({
      name: 'forged.zip', mimeType: 'application/zip',
      buffer: await pack({ signer: k.privateKey, keyId: k.keyId, signedHash: sha('something else') }),
    });
    await expect(page.locator('[data-ed25519-state]')).toHaveAttribute('data-ed25519-state', 'failed', { timeout: 30_000 });
    await expect(page.getByText('Ed25519: failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Verification Failed', { exact: true })).toBeVisible();

    await input.setInputFiles({ name: 'hmac-only.zip', mimeType: 'application/zip', buffer: await pack() });
    await expect(page.locator('[data-ed25519-state]')).toHaveAttribute('data-ed25519-state', 'not-present', { timeout: 30_000 });
    await expect(page.getByText('Ed25519: not present', { exact: true })).toBeVisible();

    expect(uploads, 'the archive left the browser').toEqual([]);
  });
});
