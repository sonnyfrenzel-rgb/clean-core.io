import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Public claims held to what the product does (Codex review pass "usp").
 *
 * Source-level, no server: each test reads the files a visitor's copy comes
 * from and fails on the sentence that promised more than the code delivers.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

const PUBLIC_COPY = [
  'README.md',
  'app/page.tsx',
  'lib/landing-faq.ts',
  'lib/whitepaper.ts',
  'app/llms.txt/route.ts',
  'app/llms-full.txt/route.ts',
];

test('usp-06: no public line says read access expires after acceptance', () => {
  // Owner decision 02.10.2026: only an unaccepted link expires; an accepted
  // invitation reads until it is withdrawn (SECURITY.md, "Expiry bounds acceptance").
  for (const file of PUBLIC_COPY) {
    const text = flat(read(file));
    expect(text, `${file} says sharing comes "with expiry"`).not.toMatch(/with expiry and revocation/);
    expect(text, `${file} says the read access expires`).not.toMatch(/gives read access including the source code, expires/);
  }
});

test('usp-09: a stored run is not described as Ed25519-signed', () => {
  // /api/runs/create signs a run with HMAC only; Ed25519 signs the audit pack.
  const runs = read('app/api/runs/create/route.ts');
  expect(runs).not.toMatch(/signEd25519/);
  expect(flat(read('README.md'))).not.toMatch(/stored as an immutable run, signed with HMAC and Ed25519/);
  expect(read('app/page.tsx')).not.toContain('signed run (HMAC and Ed25519)');
  expect(read('app/llms-full.txt/route.ts')).not.toContain('signed by the Clean-Core.io server (HMAC and Ed25519)');
});

