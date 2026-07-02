import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { verifyAuditPack } from '../lib/audit-pack-verify';

test.describe('Audit & Compliance Hardening v1.18.1 Tests', () => {

  test('verifyAuditPack classifies an unsigned pack as integrity-only', async () => {
    // Generation is now server-authoritative and always signed (v1.20 §5), so an
    // unsigned pack is constructed directly here to exercise the verify path — the
    // integrity-only tier still applies to externally-supplied unsigned packs.
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');
    const content = '# Executive Summary\nUnsigned integrity-only test pack.';
    const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: new TextEncoder().encode(content).byteLength }];
    const projectId = 'test-project-123', runId = 'run-555', runHash = 'runhash777', engineVersion = 'v1.18.1', sapApiCatalogVersion = '2024.FPS02';
    const suffix = `${projectId}:${runId}:${runHash}:${engineVersion}:${sapApiCatalogVersion};`;
    const canonical = [...files].sort((a, b) => a.path.localeCompare(b.path)).map(f => `${f.path}:${f.sha256}`).join(';') + ';' + suffix;
    const manifestHash = sha(canonical);
    const manifest = {
      version: '2.0', runId, projectId, generatedAt: new Date().toISOString(),
      engineVersion, sapApiCatalogVersion, files, manifestHash,
      signed: false, signature: '', runHash,
    };
    const zip = new JSZip();
    zip.file('00-executive-summary.md', content);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.success).toBe(true);
    expect(result.status).toBe('integrity-only');
    expect(result.manifestHashValid).toBe(true);
    expect(result.signatureValid).toBeNull();
    expect(result.errors).toContain('Manifest is unsigned. Cryptographic authenticity cannot be verified.');
  });

  test('api/export/verify should reject invalid input formats', async ({ request }) => {
    // Test too long manifest
    const longManifest = 'A'.repeat(33000);
    const res1 = await request.post('/api/export/verify', {
      data: {
        canonicalManifest: longManifest,
        signature: 'a'.repeat(64),
      }
    });
    expect(res1.status()).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain('exceeds maximum allowed size');

    // Test invalid signature format (wrong length)
    const res2 = await request.post('/api/export/verify', {
      data: {
        canonicalManifest: 'test-manifest',
        signature: 'abc12345',
      }
    });
    expect(res2.status()).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toContain('Invalid signature format');

    // Test invalid signature format (non-hex)
    const res3 = await request.post('/api/export/verify', {
      data: {
        canonicalManifest: 'test-manifest',
        signature: 'g'.repeat(64),
      }
    });
    expect(res3.status()).toBe(400);
  });

  test('api/export/verify should validate correct signature using dev fallback key', async ({ request }) => {
    const canonicalManifest = '00-executive-summary.md:hash123;';
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');
    const signature = crypto.createHmac('sha256', 'dev_audit_signing_key_fallback_clean_core').update(expectedHash).digest('hex');

    const res = await request.post('/api/export/verify', {
      data: { canonicalManifest, signature }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.manifestHash).toBe(expectedHash);
  });

  test('api/export/verify should validate run-bound signature and reject tampered metadata', async ({ request }) => {
    const crypto = require('crypto');
    const filesString = '00-executive-summary.md:hash123;';
    const projectId = 'test-project-123';
    const runId = 'run-555';
    const runHash = 'runhash777';
    const engineVersion = 'v1.18.1';
    const sapApiCatalogVersion = '2024.FPS02';
    
    // Correct bound manifest
    const correctManifest = `${filesString}${projectId}:${runId}:${runHash}:${engineVersion}:${sapApiCatalogVersion};`;
    const correctHash = crypto.createHash('sha256').update(correctManifest).digest('hex');
    const signature = crypto.createHmac('sha256', 'dev_audit_signing_key_fallback_clean_core').update(correctHash).digest('hex');

    // Verify correct signature
    const res1 = await request.post('/api/export/verify', {
      data: { canonicalManifest: correctManifest, signature }
    });
    expect(res1.status()).toBe(200);
    expect((await res1.json()).valid).toBe(true);

    // Verify with tampered runId
    const tamperedManifest = `${filesString}${projectId}:run-666:${runHash}:${engineVersion}:${sapApiCatalogVersion};`;
    const res2 = await request.post('/api/export/verify', {
      data: { canonicalManifest: tamperedManifest, signature }
    });
    expect(res2.status()).toBe(200);
    expect((await res2.json()).valid).toBe(false);
  });
});
