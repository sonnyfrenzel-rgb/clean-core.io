import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { WRITE_CEILINGS } from '../lib/write-ceiling';

/**
 * SEC-2026-758, SEC-2026-764 — the source half of the per-account write
 * ceiling. firestore.rules refuses a project or support ticket created without
 * a step of the ceiling, so every browser create of one goes through
 * lib/write-ceiling.ts; a bare addDoc/setDoc into either collection would work
 * against today's deployed rules and break the day the ceiling is live. The
 * rules half is tests/firestore-rules-write-ceiling.spec.ts (emulator).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function clientSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (rel === 'app/api') continue; // server routes use the Admin SDK
        walk(rel);
      } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
  return out;
}

test('no browser code creates a project or a support ticket past the write ceiling', () => {
  const offenders: string[] = [];
  for (const rel of clientSources()) {
    if (rel === 'lib/write-ceiling.ts') continue;
    const src = read(rel);
    if (/['"]use server['"]|from ['"]firebase-admin/.test(src)) continue;
    for (const name of Object.keys(WRITE_CEILINGS)) {
      const bare = new RegExp(`\\b(?:addDoc|setDoc)\\(\\s*(?:collection|doc)\\([^)]*['"]${name}['"]`);
      if (bare.test(src)) offenders.push(`${rel} (${name})`);
    }
  }
  expect(offenders, 'create these through createWithinCeiling (lib/write-ceiling.ts)').toEqual([]);
});

test('the create screens use the ceiling path', () => {
  for (const [rel, collectionName] of [
    ['app/(app)/dashboard/page.tsx', 'projects'],
    ['components/StarterExamples.tsx', 'projects'],
    ['components/workspace/OwnCodeImport.tsx', 'projects'],
    ['components/workspace/WorkspaceListReport.tsx', 'projects'],
    ['app/(app)/settings/page.tsx', 'support_tickets'],
  ] as const) {
    expect(read(rel), rel).toMatch(new RegExp(`createWithinCeiling\\([^,]+, '${collectionName}'`));
  }
});

test('the client figures are the rules\' figures', () => {
  const rules = read('firestore.rules');
  for (const { kind, ceiling } of Object.values(WRITE_CEILINGS)) {
    expect(rules).toContain(`ceilingStep(request.resource.data, ceilingBefore(), '${kind}', ${ceiling})`);
  }
  expect(rules).toContain("duration.value(1, 'd')");
  expect(read('lib/write-ceiling.ts')).toContain('const WINDOW_MS = 24 * 60 * 60 * 1000;');
});
