/**
 * MFA is a server-side control, and since roadmap 0.13 the factor is Firebase's.
 *
 * Firebase Auth issues no ID token before an enrolled second factor is
 * resolved, and the token it then issues names the factor
 * (`firebase.sign_in_second_factor`). The gate on the server reads that field:
 * assertMfaSatisfied rejects a first-factor token from an account whose
 * profile says `mfaEnabled`. What this replaced was an application-level TOTP
 * whose prompt was a React state change after a valid session already
 * existed, backed by an `mfa_session` cookie — a stolen ID token from such an
 * account read every document the owner could, because the rules never saw
 * the cookie (QA full review of 33471220d6e9, cfafefac08ec).
 *
 * That gate was once applied to the S/4, Gemini and secrets routes but not to
 * the two that MINT the trust chain, nor to project deletion. This spec pins
 * the coverage. The lists are explicit rather than derived so that adding a
 * route forces a decision about which side it belongs on.
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
 * Routes that must NOT require it. Recording an enrolment cannot depend on the
 * factor — the session that enrols predates it — and public verification has
 * no session at all.
 */
const MUST_NOT_GATE = [
  'app/api/mfa/enrolled/route.ts',
  'app/api/export/verify/route.ts',
];

/** Removing the factor is the one action that needs the stronger step-up: recent sign-in with the factor. */
const MUST_STEP_UP = ['app/api/mfa/disable/route.ts'];

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

  for (const rel of MUST_STEP_UP) {
    test(`${rel} needs a fresh sign-in with the factor`, () => {
      const s = read(rel);
      expect(s).toContain('assertMfaStepUp');
      expect(s).toContain('assertRecentAuth');
      // The factor itself is removed in Firebase Auth, not in a document of ours.
      expect(s).toContain('multiFactor: { enrolledFactors: null }');
      // Two systems, no transaction: the factor goes first (a failure changes
      // nothing), the flag second (a failure leaves a state every gate refuses).
      //
      // This is a source guard and only a source guard: it holds the order in
      // the file, not at runtime. The behavioural test needs an account with an
      // enrolled factor, and the Auth emulator cannot enrol TOTP
      // (firebase-tools 15.30.1). Roadmap 0.17 carries the emulator tests that
      // replace source greps; until then the runtime path is verified on `dev`
      // against the real Auth project.
      const removal = s.indexOf('multiFactor: { enrolledFactors: null }');
      const flag = s.indexOf('mfaEnabled: false');
      expect(removal, 'the factor is removed before the flag is cleared').toBeLessThan(flag);
      // And never the other way round: a compensating write that can itself
      // fail is where a factor with the gate off would come from
      // (QA review of 0c35311c7aff, b30f4ec006a5).
      expect(s).not.toContain('mfaEnabled: true');
    });
  }

  test('the application-level TOTP routes and libraries are gone', () => {
    for (const rel of ['app/api/mfa/verify/route.ts', 'app/api/mfa/setup/start/route.ts', 'app/api/mfa/setup/verify/route.ts', 'lib/mfa.ts', 'lib/totp.ts']) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} is back`).toBe(false);
    }
    // No route mints or reads the old session cookie.
    expect(read('lib/firebase-admin.ts')).not.toMatch(/cookies\['mfa_session'\]/);
    // The decision reads the factor off the token, in the pure module the gates call.
    expect(read('lib/firebase-admin.ts')).toContain("from './mfa-gate'");
    expect(read('lib/mfa-gate.ts')).toMatch(/sign_in_second_factor/);
  });

  test('admin routes keep the stronger step-up, not the plain gate', () => {
    const admin = [
      // 'app/api/admin/approve-user/route.ts' was here. It went away with the
      // signup approval gate; console-action is the route that changes account
      // state now, and it is in this list.
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

test.describe('the client never holds a session that is waiting for its second factor', () => {
  const source = () => read('components/LandingModals.tsx');

  test('every sign-in path hands a multi-factor challenge to the resolver', () => {
    const s = source();
    // Popup, redirect result and e-mail sign-in: each catch routes the
    // challenge into the second-factor screen before anything else.
    expect(s).toContain('const interceptSecondFactor = (error: unknown): boolean =>');
    expect(s.split('interceptSecondFactor(').length - 1).toBeGreaterThanOrEqual(3); // popup, redirect result, e-mail
    expect(s).toContain("code !== 'auth/multi-factor-auth-required'");
    expect(s).toContain('getMultiFactorResolver(auth');
    expect(s).toContain('TotpMultiFactorGenerator.assertionForSignIn(');
    expect(s).toContain('resolveSignIn(assertion)');
  });

  test('no path decides the second factor from the profile, and no session is kept while waiting', () => {
    const s = source();
    // The profile flag used to route into a TOTP screen after the password had
    // already produced a valid session; that session was the finding.
    expect(s).not.toMatch(/profileData\?\.mfaEnabled/);
    expect(s).not.toContain('pendingMfaUser,');
    expect(s).not.toContain('/api/mfa/verify');
    // Closing the screen drops the resolver — there is no user to sign out.
    const idx = s.indexOf('const closeAuthModal');
    expect(idx).toBeGreaterThan(-1);
    expect(s.slice(idx, idx + 400)).toContain('setMfaResolver(null)');
  });

  test('the screen promises no recovery code it cannot take', () => {
    const s = source();
    expect(s).not.toMatch(/backup (recovery )?code/i);
    expect(s).not.toContain("'CC-'");
    expect(s).toContain('Lost the authenticator?');
  });
});
