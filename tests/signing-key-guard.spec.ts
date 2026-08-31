import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The audit signing key is read in one place and has no fallback.
 *
 * It used to have one: a constant sitting in three production route handlers of
 * a public repository, reached whenever `AUDIT_SIGNING_KEY` was unset. The guard
 * in front of it only refused to run when `NODE_ENV === 'production'` **and** the
 * emulator flag was off, so any deployment failing either half signed runs and
 * audit packs with a string anyone could look up — and `/api/export/verify`, using
 * the same fallback, would then certify a forged pack as genuine.
 *
 * It survived five releases for a boring reason: two tests in
 * `audit-compliance-v181.spec.ts` signed their fixtures with it, so deleting the
 * constant turned the suite red, and the suite is a required gate before deploy.
 * The fixture key now comes from `playwright.config.ts`, where it is a test value
 * and nothing more.
 *
 * These checks exist so it cannot come back quietly.
 */
const ROOT = path.resolve(__dirname, '..');

/** Assembled from parts so this file is not itself a hit for the search. */
const RETIRED_FALLBACK = ['dev', 'audit', 'signing', 'key', 'fallback', 'clean', 'core'].join('_');

const SIGNING_ROUTES = [
  'app/api/runs/create/route.ts',
  'app/api/audit-pack/create/route.ts',
  'app/api/export/verify/route.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test.describe('the audit signing key has no fallback', () => {
  test('the retired constant appears nowhere in the tree', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'lib', 'tests', 'scripts', 'components']) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      for (const file of walk(abs)) {
        if (fs.readFileSync(file, 'utf8').includes(RETIRED_FALLBACK)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(
      offenders,
      'the published fallback signing key is back in the tree:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  test('the signing routes read the key through the one helper', () => {
    for (const rel of SIGNING_ROUTES) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} does not import getAuditSigningKey`).toContain('getAuditSigningKey');
      // One reader means one place to get the policy wrong, and one place to fix it.
      expect(
        src.includes('process.env.AUDIT_SIGNING_KEY'),
        `${rel} reads process.env.AUDIT_SIGNING_KEY directly instead of calling ` +
          'getAuditSigningKey() — that is how the fallback got in three times.',
      ).toBe(false);
    }
  });

  test('the guard is unconditional — no NODE_ENV escape hatch around it', () => {
    for (const rel of SIGNING_ROUTES) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(
        /isProduction/.test(src),
        `${rel} still gates the signing key on an isProduction flag. The whole defect ` +
          'was that a preview or emulator build fell outside it.',
      ).toBe(false);
    }
  });

  test('a signature made with the wrong key is not accepted', async ({ request }) => {
    const crypto = require('crypto');
    const canonicalManifest = 'guard-fixture.md:hash000;';
    const manifestHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');
    // Signed with the constant that used to be honoured everywhere.
    const forged = crypto.createHmac('sha256', RETIRED_FALLBACK).update(manifestHash).digest('hex');

    const res = await request.post('/api/export/verify', { data: { canonicalManifest, signature: forged } });
    expect(res.status()).toBe(200);
    expect((await res.json()).valid, 'a pack forged with the retired key verified').toBe(false);
  });
});
