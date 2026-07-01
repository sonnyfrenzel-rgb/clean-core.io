import { test, expect } from '@playwright/test';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import { generateAuditPack } from '../lib/audit-pack';
import type { Project } from '../lib/types';

test.describe('Audit & Compliance Hardening v1.18.1 Tests', () => {

  const mockProject: Project = {
    id: 'test-project-123',
    name: 'Test Project',
    userId: 'test-user',
    status: 'analyzed',
    activeRunId: 'run-555',
    cleanCoreScore: 85,
    complexityScore: 40,
    criticalityScore: 30,
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    approvedByArchitect: true,
    approvedBy: 'architect@enterprise.com',
    architectSignOffAt: new Date().toISOString(),
    auditMetadata: {
      inputFingerprint: {
        fileName: 'zextractor.abap',
        objectType: 'Report',
        lineCount: 150,
        byteSize: 4096,
        sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        uploadedAt: new Date().toISOString(),
      },
      modelCard: {
        provider: 'google-gemini',
        model: 'gemini-3-flash-preview',
        byokUsed: false,
        analysisTimestamp: new Date().toISOString(),
        catalogVersion: '2024.FPS02',
      }
    }
  };

  test('should generate and verify unsigned audit pack as integrity-only', async () => {
    // Generate unsigned pack (empty idToken will cause fetch to fail or fall back)
    const zipBlob = await generateAuditPack(mockProject, '');
    const result = await verifyAuditPack(zipBlob);
    console.log('VERIFY RESULT:', JSON.stringify(result, null, 2));

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
});
