import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The way back to the workspace has one label everywhere: "Back to workspace"
 * (`components/BackLink.tsx`, `components/StageHeader.tsx`). Settings said
 * "Back to My workspace", so the same target carried two names from one page
 * to the next (UX review of 69b4f522e5ea, finding 743606ce5961).
 */
const ROOT = path.join(__dirname, '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.(tsx?|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every link back to the workspace reads "Back to workspace"', () => {
  const offenders = ['app', 'components', 'lib']
    .flatMap((d) => sources(path.join(ROOT, d)))
    .filter((f) => /Back to My workspace/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  expect(offenders).toEqual([]);
});

test('the settings page links back with the shared label', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'settings', 'page.tsx'), 'utf8');
  expect(src).toMatch(/>\s*Back to workspace\s*<\/CcLinkButton>/);
});

test('the admin console links back to the workspace with the shared label (owner, 03.10.2026)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'admin', 'page.tsx'), 'utf8');
  expect(src).toMatch(/<CcLinkButton href="\/dashboard"[\s\S]{0,200}?>\s*Back to workspace\s*<\/CcLinkButton>/);
});
