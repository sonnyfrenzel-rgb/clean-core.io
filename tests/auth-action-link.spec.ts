import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ownDomainVerifyEmailLink, AUTH_ACTION_PATH } from '../lib/auth-action-link';

/**
 * The address-confirmation link points at our own domain (roadmap 3.0.9).
 *
 * Firebase's `generateEmailVerificationLink` points at
 * `<project>.firebaseapp.com/__/auth/action`. A mail from clean-core.io whose
 * only button leads to another domain is the classic phishing shape, and seed
 * run 20260924-a delivered this mail to no inbox but Gmail. The route now keeps
 * only Firebase's one-time code and links to `/auth/action`, where the browser
 * redeems it with `applyActionCode`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the link', () => {
  test('keeps the one-time code and nothing else, on the base URL it is given', () => {
    const firebase =
      'https://cleancore-491216.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=AbC-12_xyz890&apiKey=not-a-real-key&lang=en&continueUrl=https%3A%2F%2Fevil.example';
    expect(ownDomainVerifyEmailLink(firebase, 'https://clean-core.io')).toBe(
      'https://clean-core.io/auth/action?mode=verifyEmail&oobCode=AbC-12_xyz890',
    );
    // A trailing slash on the base does not double up.
    expect(ownDomainVerifyEmailLink(firebase, 'https://clean-core.io/')).toBe(
      'https://clean-core.io/auth/action?mode=verifyEmail&oobCode=AbC-12_xyz890',
    );
    // The emulator's link has the same parameters on another host.
    expect(
      ownDomainVerifyEmailLink('http://127.0.0.1:9099/emulator/action?mode=verifyEmail&lang=en&oobCode=Zz9yY8xX7w&apiKey=fake', 'http://localhost:3000'),
    ).toBe('http://localhost:3000/auth/action?mode=verifyEmail&oobCode=Zz9yY8xX7w');
    expect(AUTH_ACTION_PATH).toBe('/auth/action');
  });

  test('refuses anything that is not a verify-email link with a usable code', () => {
    for (const bad of [
      'not a url',
      'https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=AbC-12_xyz890',
      'https://x.firebaseapp.com/__/auth/action?mode=verifyEmail',
      'https://x.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=short',
      'https://x.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=has%20space%20in%20it',
    ]) {
      expect(() => ownDomainVerifyEmailLink(bad, 'https://clean-core.io'), bad).toThrow();
    }
  });

  test('the accept route mails the rewritten link, never Firebase\'s own', () => {
    const src = read('app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts');
    expect(src).toMatch(/ownDomainVerifyEmailLink\(\s*await \(await getAdminAuth\(\)\)\.generateEmailVerificationLink\(accountEmail\),?\s*\)/);
    expect(src).toMatch(/buildAddressConfirmationEmail\(\{ recipient: escapeHtml\(accountEmail\), link \}\)/);
  });
});

test.describe('the page', () => {
  const page = read('app/auth/action/page.tsx');
  const client = read('app/auth/action/AuthActionClient.tsx');

  test('is not indexed, not in the sitemap, and leaks no referrer', () => {
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(page).toContain("referrer: 'no-referrer'");
    expect(read('app/sitemap.ts')).not.toContain('/auth');
  });

  test('redeems the code on a click, never on load, and explains a used or expired link', () => {
    // Scanners open links and some run the page; a code they redeem is gone.
    expect(client).not.toMatch(/useEffect/);
    const confirm = client.slice(client.indexOf('const confirm = async'), client.indexOf('if (state ==='));
    expect(confirm).toContain('await applyActionCode(auth, oobCode)');
    expect(client).toMatch(/onClick=\{confirm\}/);
    for (const code of ['auth/expired-action-code', 'auth/invalid-action-code']) expect(client).toContain(`'${code}'`);
    expect(client).toMatch(/already been used/);
    expect(client).toMatch(/expired/);
  });

  test('talks to Firebase only through hosts the CSP already allows', () => {
    // applyActionCode posts to identitytoolkit.googleapis.com.
    expect(read('middleware.ts')).toContain('https://identitytoolkit.googleapis.com');
  });
});
