import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { IMPORT_RETENTION_DAYS, IMPORT_WARNINGS_MAX, IMPORT_WARNING_MAX_CHARS, validateProjectCommand } from '../lib/project-commands';

/**
 * How a project command is stored: its body is bounded before it is parsed, every field it returns replaces the
 * stored value (no merge that keeps removed keys), and what the server owns — the retention date of an import,
 * the size of its warnings — is the server's.
 */
const ROOT = path.resolve(__dirname, '..');
const route = () => fs.readFileSync(path.join(ROOT, 'app/api/projects/[projectId]/commands/route.ts'), 'utf8');
const actor = { email: 'owner@example.test', now: '2026-11-25T10:00:00.000Z' };

test('the route reads a bounded body and replaces the fields it writes', () => {
  const src = route();
  expect(src).not.toMatch(/req\.json\(/);
  expect(src).toContain('readBoundedRequestJson(req, PROJECT_COMMAND_BODY_LIMITS)');
  expect(src).toMatch(/tx\.update\(ref, \{ \.\.\.decision\.fields, updatedAt: new Date\(\) \}\)/);
  expect(src).not.toMatch(/tx\.set\(ref, \{ \.\.\.decision\.fields[^)]*\{ merge: true \}/);
});

test('a reopened answer is absent from the value written, so replacing the field removes it', () => {
  const state = { activeRunId: 'run-1', openQuestions: { 'confirm-owner': { end: 'confirmed', by: 'x', at: 'y' } }, openQuestionBases: {} };
  const r = validateProjectCommand({ command: 'record-open-question', action: 'confirm-owner', end: 'reopen' }, state as never, actor);
  if (r.ok) expect(Object.keys(r.fields.openQuestions as object)).not.toContain('confirm-owner');
});

test('the retention date of an import is the server\'s, and warnings are bounded', () => {
  const r = validateProjectCommand(
    {
      command: 'record-usage-report',
      usageReport: {
        records: [{ objectName: 'ZFI', callCount: 3, source: 'scmon' }],
        source: 'scmon',
        importedAt: '2026-11-25',
        warnings: [...Array.from({ length: IMPORT_WARNINGS_MAX + 50 }, () => 'w'.repeat(IMPORT_WARNING_MAX_CHARS + 10)), 7],
        retentionExpiresAt: '2999-01-01T00:00:00.000Z',
      },
    },
    { activeRunId: 'run-1' },
    actor,
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const report = r.fields.usageReport as { retentionExpiresAt: string; warnings: string[] };
  expect(report.retentionExpiresAt).toBe(new Date(Date.parse(actor.now) + IMPORT_RETENTION_DAYS * 86_400_000).toISOString());
  expect(report.warnings.length).toBe(IMPORT_WARNINGS_MAX);
  expect(report.warnings.every((w) => typeof w === 'string' && w.length <= IMPORT_WARNING_MAX_CHARS)).toBe(true);
});
