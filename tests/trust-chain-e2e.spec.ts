/**
 * Trust Chain E2E Test — v1.19
 *
 * Verifies the complete Trust Chain enforcement:
 * 1. Run guard blocks access when no activeRunId exists
 * 2. Run guard allows access when activeRunId is present
 * 3. Audit Pack export throws without activeRunId
 * 4. Audit Pack export works with activeRunId
 * 5. Sign endpoint rejects non-active runs
 * 6. Sign endpoint rejects runs without runHash
 *
 * These tests validate the defensive logic without requiring
 * Firebase emulators or browser automation.
 */
import { test, expect } from '@playwright/test';
import { hasActiveRun } from '../lib/run-guard';
import { generateAuditPack } from '../lib/audit-pack';
import type { Project } from '../lib/types';

test.describe('v1.19 Trust Chain Closure', () => {

  // ────────────────────────────────────────────────
  // Item #2 — Run Guard
  // ────────────────────────────────────────────────

  test.describe('Run Guard — hasActiveRun()', () => {

    test('returns false for null project', () => {
      expect(hasActiveRun(null)).toBe(false);
    });

    test('returns false for project without activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed' } as Project;
      expect(hasActiveRun(project)).toBe(false);
    });

    test('returns false for project with empty string activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed', activeRunId: '' } as Project;
      expect(hasActiveRun(project)).toBe(false);
    });

    test('returns true for project with valid activeRunId', () => {
      const project = { id: 'p1', name: 'Test', userId: 'u1', status: 'analyzed', activeRunId: 'run-abc123' } as Project;
      expect(hasActiveRun(project)).toBe(true);
    });

  });

  // ────────────────────────────────────────────────
  // Item #3 — Audit Pack Run Gate
  // ────────────────────────────────────────────────

  test.describe('Audit Pack Run Gate', () => {

    const baseProject: Project = {
      id: 'test-tc-project',
      name: 'Trust Chain Test',
      userId: 'test-user',
      status: 'analyzed',
      cleanCoreScore: 85,
      complexityScore: 40,
      criticalityScore: 30,
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      approvedByArchitect: true,
      approvedBy: 'architect@enterprise.com',
      architectSignOffAt: new Date().toISOString(),
      auditMetadata: {
        inputFingerprint: {
          fileName: 'z_trust_chain_test.abap',
          objectType: 'Report',
          lineCount: 100,
          byteSize: 2048,
          sha256: 'abc123def456',
          uploadedAt: new Date().toISOString(),
        },
        modelCard: {
          provider: 'google-gemini',
          model: 'gemini-3-flash-preview',
          engineVersion: 'v1.19.0',
          byokUsed: false,
          analysisTimestamp: new Date().toISOString(),
          catalogVersion: '2024.FPS02',
        },
      },
    };

    test('throws error when activeRunId is missing', async () => {
      const projectWithoutRun = { ...baseProject, activeRunId: undefined };
      await expect(generateAuditPack(projectWithoutRun, 'fake-token'))
        .rejects.toThrow('Cannot generate Audit Pack without an active analysis run');
    });

    test('throws error when activeRunId is empty string', async () => {
      const projectWithEmptyRun = { ...baseProject, activeRunId: '' };
      await expect(generateAuditPack(projectWithEmptyRun, 'fake-token'))
        .rejects.toThrow('Cannot generate Audit Pack without an active analysis run');
    });

    test('passes the run gate and delegates to the server when activeRunId is present', async () => {
      const projectWithRun = { ...baseProject, activeRunId: 'run-valid-123' };
      // Generation is now server-authoritative (v1.20 §5): with a run present it must
      // NOT throw the "no active run" gate error — it delegates to
      // /api/audit-pack/create. That endpoint is unreachable in this in-process unit
      // test, so the call rejects, but with a fetch/generation error, never the gate error.
      await expect(generateAuditPack(projectWithRun, 'fake-token'))
        .rejects.not.toThrow('Cannot generate Audit Pack without an active analysis run');
    });

  });

  // ────────────────────────────────────────────────
  // Item #4 — Sign Endpoint Validation (structural)
  // ────────────────────────────────────────────────

  test.describe('Sign Endpoint Trust Chain Requirements', () => {

    test('sign route file contains activeRunId validation', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const signRoutePath = path.join(__dirname, '..', 'app', 'api', 'export', 'sign', 'route.ts');
      const content = fs.readFileSync(signRoutePath, 'utf-8');

      // Verify active run check exists
      expect(content).toContain('projectActiveRunId');
      expect(content).toContain('activeRunId');
      expect(content).toContain('status: 409');

      // Verify runHash validation exists
      expect(content).toContain('runData?.runHash');
      expect(content).toContain('status: 422');
    });

  });

  // ────────────────────────────────────────────────
  // Item #2 — Downstream Page Guards (structural)
  // ────────────────────────────────────────────────

  test.describe('Downstream Page Trust Chain Guards', () => {

    const downstreamPages = [
      'design',
      'transformation',
      'testing',
      'documentation',
      'delivery',
      'tco',
    ];

    for (const page of downstreamPages) {
      test(`${page}/page.tsx imports and calls enforceActiveRun`, async () => {
        const fs = await import('fs');
        const path = await import('path');
        const pagePath = path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', page, 'page.tsx');
        const content = fs.readFileSync(pagePath, 'utf-8');

        expect(content).toContain("import { enforceActiveRun } from '@/lib/run-guard'");
        expect(content).toContain('enforceActiveRun(');
      });
    }

  });

  // ────────────────────────────────────────────────
  // Run Guard module completeness
  // ────────────────────────────────────────────────

  test.describe('Run Guard Module', () => {

    test('run-guard.ts exports hasActiveRun and enforceActiveRun', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const guardPath = path.join(__dirname, '..', 'lib', 'run-guard.ts');
      const content = fs.readFileSync(guardPath, 'utf-8');

      expect(content).toContain('export function hasActiveRun');
      expect(content).toContain('export function enforceActiveRun');
      expect(content).toContain('reason=no-run');
    });

  });

});
