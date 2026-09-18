import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  BYOK_MFA_ENROLMENT_REQUIRED,
  S4_MFA_ENROLMENT_REQUIRED,
  byokRequiresEnrolment,
  s4AccessRequiresEnrolment,
} from '../lib/mfa-gate';

/**
 * MFA is required for S/4HANA access - enrolled, not merely honoured.
 *
 * Decided by Sonny on 18.09.2026 ("MFA-Zwang für S/4-Zugang, ja") after two
 * security audits (bc2f786, def8262) described the gap accurately: the
 * conditional gate `mfaSatisfied` lets an account that never enrolled a factor
 * through with any token, so on the six routes that reach a customer's tenant
 * with stored credentials a stolen first-factor token was enough. The routes
 * that keep optional MFA are unchanged; this is a decision about S/4, not a
 * change to the gate everybody else uses.
 *
 * Two halves, because the Firebase Auth emulator cannot enrol a TOTP factor:
 *
 *   1. The decision is a pure function and is proven here without the emulator.
 *   2. The wiring is proven on the source: the one gate every S/4 route calls
 *      asks the pure function outside the emulator, and every S/4 route calls
 *      both that gate and the token check. A route that called only one of the
 *      two would be the finding again.
 *
 * Non-vacuous by construction and checked by breaking: removing the call from
 * `assertS4TenantAccess` fails the second block; adding a seventh S/4 route
 * without `assertMfaSatisfied` fails the third.
 */

const ROOT = path.resolve(__dirname, '..');
// LF-normalised: the checkout is CRLF on Windows and LF in CI, and a function
// boundary searched as '\n}\n' finds nothing in a CRLF file - which is how the
// first run of this spec went red on a source that was correct.
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** Every route that reaches a live tenant. Adding one means adding it here, on purpose. */
const S4_ROUTES = [
  'app/api/fetch-odata-metadata/route.ts',
  'app/api/fetch-s4-metadata/route.ts',
  'app/api/run-tests/route.ts',
  'app/api/s4-credentials/route.ts',
  'app/api/test-s4-connection/route.ts',
  'app/api/test-s4-odata-read/route.ts',
];

test.describe('the decision, without the emulator', () => {
  test('an account without an enrolled factor is refused, and told what to do', () => {
    const refusal = s4AccessRequiresEnrolment(false);
    expect(refusal).toEqual(S4_MFA_ENROLMENT_REQUIRED);
    expect(refusal?.status).toBe(403);
    // The message has to name the way out; a bare 403 on a route the reader
    // cannot see is the lockout shape this codebase has been bitten by.
    expect(refusal?.message).toContain('multi-factor authentication');
    expect(refusal?.message).toContain('Settings');
  });

  test('an enrolled account passes this gate - the token check is the next one, not this one', () => {
    expect(s4AccessRequiresEnrolment(true)).toBeNull();
  });
});

test.describe('the wiring, on the source', () => {
  test('the one S/4 gate asks the enrolment question outside the emulator', () => {
    const src = read('lib/firebase-admin.ts');
    const fn = src.slice(src.indexOf('export async function assertS4TenantAccess'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(body, 'assertS4TenantAccess no longer asks whether a factor is enrolled').toContain(
      's4AccessRequiresEnrolment(data.mfaEnabled === true)',
    );
    // The skip is for the emulator alone - the same shape assertAdminStepUp
    // uses - and it has to be the emulator flag, not a broader switch.
    expect(body).toContain("process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true'");
    // And the refusal is thrown, not logged.
    expect(body).toMatch(/if \(refusal\) throw new QuotaError\(refusal\.message, refusal\.status\)/);
  });

  test('every route that reaches a tenant calls the gate and the token check', () => {
    for (const rel of S4_ROUTES) {
      const src = read(rel);
      expect(src, `${rel} does not ask the S/4 gate`).toMatch(/await assertS4TenantAccess\(/);
      expect(src, `${rel} does not check the factor on the token`).toMatch(/await assertMfaSatisfied\(/);
    }
  });

  /**
   * The second decision of the evening (Sonny, 18.09.2026): the routes that
   * hold a person's own Gemini key require enrolment too - a stolen
   * first-factor token could otherwise replace the key. Everything else keeps
   * the conditional gate; `runs/create` in particular, because requiring the
   * factor there would stop every un-enrolled account from analysing at all.
   */
  test('the own-key routes require enrolment through the shared MFA helper, and nothing else does', () => {
    expect(byokRequiresEnrolment(false)).toEqual(BYOK_MFA_ENROLMENT_REQUIRED);
    expect(byokRequiresEnrolment(true)).toBeNull();
    expect(BYOK_MFA_ENROLMENT_REQUIRED.message).toContain('Settings');

    // The helper honours the option outside the emulator only.
    const admin = read('lib/firebase-admin.ts');
    const helper = admin.slice(admin.indexOf('export async function assertMfaSatisfied'));
    const body = helper.slice(0, helper.indexOf('\n}\n') + 3);
    expect(body).toContain("opts?.requireEnrolment && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true'");
    expect(body).toMatch(/if \(enrolment\) throw new QuotaError\(enrolment\.message, enrolment\.status\)/);
    // A missing profile is a refusal where enrolment is required, not a pass:
    // the helper used to `return` on `!userDoc.exists` before it ever looked at
    // the option, so a verified Auth account without a Firestore document went
    // straight through (QA review of 14ab490793cb). The refusal has to sit
    // inside the missing-profile branch, before the early return.
    const missing = body.slice(body.indexOf('if (!userDoc.exists) {'), body.indexOf('const mfaEnabled ='));
    expect(missing, 'a missing profile no longer refuses a route that requires enrolment').toMatch(
      /opts\?\.requireEnrolment[\s\S]*throw new QuotaError\([\s\S]*403\)/,
    );
    expect(missing.indexOf('throw new QuotaError'), 'the refusal comes after the early return').toBeLessThan(missing.lastIndexOf('return;'));

    // Every handler that stores, tests or removes the key passes the decision.
    for (const rel of ['app/api/secrets/gemini/route.ts', 'app/api/secrets/gemini/test/route.ts']) {
      const src = read(rel);
      const calls = src.match(/await assertMfaSatisfied\(/g)?.length ?? 0;
      const withEnrolment = src.match(/await assertMfaSatisfied\(req, decodedToken, \{ requireEnrolment: byokRequiresEnrolment \}\)/g)?.length ?? 0;
      expect(calls, `${rel} has no MFA check at all`).toBeGreaterThan(0);
      expect(withEnrolment, `${rel}: a handler checks the factor without requiring enrolment`).toBe(calls);
    }

    // And the core path does not: an un-enrolled account can still analyse.
    expect(read('app/api/runs/create/route.ts')).not.toContain('requireEnrolment');
  });

  test('the list above is the list of routes that use the gate - nothing reaches a tenant unlisted', () => {
    const apiDir = path.resolve(ROOT, 'app/api');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts' && fs.readFileSync(full, 'utf8').includes('assertS4TenantAccess(')) {
          found.push(path.relative(ROOT, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(apiDir);
    expect(found.sort(), 'a route started using the S/4 gate without being added to this guard').toEqual([...S4_ROUTES].sort());
  });
});
