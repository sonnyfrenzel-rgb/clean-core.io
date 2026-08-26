/**
 * MFA has to be a server-side control, not a modal.
 *
 * Firebase Auth issues a valid ID token before any custom second factor runs —
 * the TOTP prompt is a React state change, not an authentication step. So the
 * client cannot enforce MFA; it can only ask. The real gate is
 * assertMfaSatisfied on the server, which rejects a token from an mfaEnabled
 * account unless the mfa_session cookie is present.
 *
 * That gate was applied to the S/4, Gemini and secrets routes but not to the
 * two that MINT the trust chain, nor to project deletion. A stolen ID token was
 * therefore enough to write a signed run and a signed audit pack — into the very
 * chain that exists to prove provenance — or to erase one.
 *
 * This spec pins the coverage. The lists are explicit rather than derived so
 * that adding a route forces a decision about which side it belongs on.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Routes that mint, mutate or destroy evidence — MFA is required. */
const MUST_GATE = [
  'app/api/runs/create/route.ts',
  'app/api/audit-pack/create/route.ts',
  'app/api/projects/[projectId]/route.ts',
  'app/api/gemini/route.ts',
  'app/api/run-tests/route.ts',
  'app/api/s4-credentials/route.ts',
  'app/api/secrets/gemini/route.ts',
  'app/api/test-s4-connection/route.ts',
  'app/api/fetch-s4-metadata/route.ts',
  'app/api/fetch-odata-metadata/route.ts',
  'app/api/test-s4-odata-read/route.ts',
];

/**
 * Routes that must NOT require it. Enrolment and verification cannot depend on
 * the factor being enrolled, and public verification has no session at all.
 */
const MUST_NOT_GATE = [
  'app/api/mfa/setup/start/route.ts',
  'app/api/mfa/setup/verify/route.ts',
  'app/api/mfa/verify/route.ts',
  'app/api/export/verify/route.ts',
];

test.describe('server-side MFA coverage', () => {
  for (const rel of MUST_GATE) {
    test(`${rel} enforces MFA`, () => {
      expect(read(rel), `${rel} must call assertMfaSatisfied or assertMfaStepUp`).toMatch(
        /assertMfa(Satisfied|StepUp)\s*\(/,
      );
    });
  }

  for (const rel of MUST_NOT_GATE) {
    test(`${rel} does not require MFA`, () => {
      // Requiring the factor here would make enrolment impossible.
      expect(read(rel)).not.toMatch(/assertMfa(Satisfied|StepUp)\s*\(/);
    });
  }

  test('admin routes keep the stronger step-up, not the plain gate', () => {
    const admin = [
      'app/api/admin/approve-user/route.ts',
      'app/api/admin/approve-tenant/route.ts',
      'app/api/admin/console-action/route.ts',
      'app/api/admin/set-admin-claim/route.ts',
    ];
    for (const rel of admin) {
      // assertAdminStepUp additionally requires recent auth and an actually
      // enrolled factor, and fails closed when the admin never enabled MFA.
      expect(read(rel), `${rel} lost its admin step-up`).toContain('assertAdminStepUp');
    }
  });
});

test.describe('client sign-in paths fail closed', () => {
  const source = () => read('components/LandingModals.tsx');

  test('a failed profile read signs the user out instead of leaving a live session', () => {
    const s = source();
    // The email path shared the outer catch, so a Firestore error surfaced as
    // "Invalid email or password" while the session stayed live and MFA never ran.
    expect(s).toContain('[handleEmailSignIn] profile read failed');
    expect(s).toContain('[getRedirectResult] profile read failed');
    // Both must sign out on that path.
    const signOuts = s.split('await signOut(auth)').length - 1;
    expect(signOuts).toBeGreaterThanOrEqual(3); // email, redirect, modal close
  });

  test('the redirect path consults the profile before navigating', () => {
    const s = source();
    const idx = s.indexOf('getRedirectResult(auth)');
    expect(idx).toBeGreaterThan(-1);
    const block = s.slice(idx, idx + 1800);
    // It used to push straight to /dashboard, skipping MFA on this path only.
    expect(block).toContain('mfaEnabled');
    expect(block.indexOf('mfaEnabled')).toBeLessThan(block.indexOf("router.push('/dashboard')"));
  });

  test('closing the MFA modal ends the session', () => {
    const s = source();
    const idx = s.indexOf('const closeAuthModal');
    expect(idx).toBeGreaterThan(-1);
    const block = s.slice(idx, idx + 400);
    expect(block).toContain('signOut(auth)');
  });
});
