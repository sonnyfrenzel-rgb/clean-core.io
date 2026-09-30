/**
 * QA full review of v2.20.0 — the component findings (slice D), held at the
 * source. Pure reading: no server, no browser. The rendered behaviour of the
 * modal and focus fixes is the library's (`components/cc/modal.ts`, covered by
 * `cc-style-guard` and `cc-d31-addenda`); what is held here is that each
 * component now uses it, and that each corrected sentence stays corrected.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments, so a comment quoting the old defect cannot satisfy or fail a check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('accessibility', () => {
  test('ff8ea3bf638e · the sign-in overlay is a modal dialog', () => {
    const src = code('components/LandingModals.tsx');
    expect(src).toMatch(/useCcModal<HTMLDivElement>\(\{\s*open: hydrated && Boolean\(authParam\),\s*onClose: closeAuthModal,/);
    expect(src).toMatch(/hydrated && createPortal\(\s*<AnimatePresence>/);
    expect(src).toMatch(/<motion\.div\s*ref=\{authDialogRef\}\s*role="dialog"\s*aria-modal="true"/);
  });

});

test.describe('state and ordering', () => {
});

test.describe('what the text claims', () => {
});
