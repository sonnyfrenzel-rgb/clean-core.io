import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The two copy buttons of the second-factor setup fail separately.
 *
 * Carried QA finding 91cf1930b78a: one shared `failed` state told the reader to
 * select the key by hand even when the setup link was what failed to copy. The
 * setup screen needs a TOTP enrolment the emulator does not offer, so the
 * branch is read off the page.
 */
const PAGE = fs.readFileSync(path.resolve(__dirname, '..', 'app', '(app)', 'settings', 'page.tsx'), 'utf8');

test('a failed copy remembers which item it was', () => {
  expect(PAGE).toContain("setMfaCopied(what === 'secret' ? 'failed-secret' : 'failed-link');");
  expect(PAGE).not.toContain("mfaCopied === 'failed' ");
});

test('the link failure names the link, the key failure the key', () => {
  const link = PAGE.slice(PAGE.indexOf('data-mfa-copy-failed="link"'), PAGE.indexOf('</span>', PAGE.indexOf('data-mfa-copy-failed="link"')));
  expect(link).toContain('copy of the setup link');
  const key = PAGE.slice(PAGE.indexOf('data-mfa-copy-failed="secret"'), PAGE.indexOf('</span>', PAGE.indexOf('data-mfa-copy-failed="secret"')));
  expect(key).toContain('Select the key above');
  expect(key).not.toContain('setup link');
});
