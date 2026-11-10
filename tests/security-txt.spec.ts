import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * L-21 — a reporting path for vulnerabilities (RFC 9116 and SECURITY.md).
 *
 * The contact is the operator's address from the imprint, read from the
 * imprint page itself, so the three places cannot name different addresses.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

function imprintAddress(): string {
  const m = read('app/impressum/page.tsx').match(/mailto:([^"'\s]+@[^"'\s]+)/);
  expect(m, 'the imprint names an e-mail address').not.toBeNull();
  return m![1];
}

test('security.txt names the imprint address and a future expiry', () => {
  const txt = read('public/.well-known/security.txt');
  const fields = new Map(
    txt.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
      const at = l.indexOf(':');
      return [l.slice(0, at).trim().toLowerCase(), l.slice(at + 1).trim()] as const;
    }),
  );
  expect(fields.get('contact')).toBe(`mailto:${imprintAddress()}`);
  const expires = fields.get('expires') ?? '';
  expect(Number.isNaN(Date.parse(expires)), 'Expires is an RFC 3339 instant').toBe(false);
  // RFC 9116 §2.5.5: less than a year ahead is recommended; it must not have lapsed.
  expect(Date.parse(expires)).toBeGreaterThan(Date.now());
  expect(fields.get('canonical')).toBe('https://clean-core.io/.well-known/security.txt');
});

test('SECURITY.md has a reporting section with the same contact', () => {
  const md = read('SECURITY.md');
  const at = md.indexOf('## Reporting a vulnerability');
  expect(at, 'SECURITY.md has a "Reporting a vulnerability" section').toBeGreaterThan(-1);
  const section = md.slice(at, md.indexOf('\n## ', at + 5));
  expect(section).toContain(imprintAddress());
  expect(section).toContain('/.well-known/security.txt');
});
