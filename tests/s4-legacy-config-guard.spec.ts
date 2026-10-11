import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * SEC-2026-759 — the retired connection field `s4Config` stays retired.
 *
 * Connections are saved through the server (`lib/s4-credentials.ts`): the
 * secret is stored encrypted and only non-secret metadata (`s4Meta`) reaches
 * a document. The field that came before is no longer read anywhere in the
 * application — not by a page, not by a hook, not in a request body, not as a
 * type. The one place allowed to name it is the server-side store, and only to
 * delete it (`FieldValue.delete()`).
 *
 * A source guard, server-free: it walks app/, components/, hooks/ and lib/.
 */

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib'];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const FIELD = /\bs4Config\b/;
/** The only permitted mention: the server deleting the field. */
const ALLOWED_FILE = 'lib/s4-credentials.ts';
const ALLOWED_LINE = /\bs4Config:\s*FieldValue\.delete\(\)/;

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (EXT.test(entry.name)) {
      out.push(full);
    }
  }
}

function sources(): string[] {
  const files: string[] = [];
  for (const d of DIRS) walk(path.join(ROOT, d), files);
  return files;
}

test.describe('SEC-2026-759 — retired connection field', () => {
  test('no file under app/, components/, hooks/ or lib/ reads s4Config', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(100);

    const hits: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!FIELD.test(line)) return;
        if (rel === ALLOWED_FILE && ALLOWED_LINE.test(line)) return;
        hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits, 'the retired field may only be deleted, server-side').toEqual([]);
  });

  test('the server-side store still deletes the field when a connection is saved or removed', () => {
    const text = fs.readFileSync(path.join(ROOT, ALLOWED_FILE), 'utf8');
    const deletions = text.split(/\r?\n/).filter(l => ALLOWED_LINE.test(l));
    expect(deletions.length).toBeGreaterThanOrEqual(2);
  });

  test('the Testing page shows only the encrypted-store wording for a saved connection', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/testing/page.tsx'), 'utf8');
    expect(page).toContain('project.s4Meta?.configured');
    expect(page).toContain('profile?.s4Meta?.configured');
    expect(page).toContain('Stored encrypted (AES-256-GCM) on the server');
    expect(page).not.toMatch(/savedS4\.legacy|legacy:\s*true/);
  });
});
