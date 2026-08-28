import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Release 4: the session, the mail, and the second factor.
 *
 * Five findings that share a shape — something reports success it did not
 * establish. A backup code that can be spent twice still calls itself single
 * use. A mail route that never reads the provider's answer still logs "Success".
 * A QR code that encodes nothing still says "Scan". None of them fails loudly;
 * all of them are believed.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const rendered = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('a backup code can only be spent once', () => {
  const REL = 'app/api/mfa/verify/route.ts';

  test('read, verify and redeem happen in one transaction', () => {
    const src = rendered(REL);
    // Three separate steps let two parallel requests read the same array before
    // either wrote it back. Both verified, both wrote their own remainder, and
    // one code produced two twelve-hour sessions.
    expect(src).toContain('runTransaction');
    expect(src).toMatch(/tx\.get\(mfaRef\)/);
    expect(src).toMatch(/tx\.update\(mfaRef/);
  });

  test('no unguarded read-then-write remains', () => {
    const src = rendered(REL);
    expect(src).not.toMatch(/await db\.collection\('mfa_secrets'\)\.doc\(uid\)\.update\(/);
  });

  test('a failed transaction issues no session', () => {
    const src = rendered(REL);
    // Handing out a cookie for a code that may not have been redeemed is the one
    // outcome worth refusing over.
    expect(src).toMatch(/catch \(txErr\)[\s\S]{0,400}?status: 503/);
  });
});

test.describe('the second factor can actually be enrolled', () => {
  const REL = 'app/(app)/settings/page.tsx';

  test('no QR-like graphic that encodes nothing', () => {
    const src = rendered(REL);
    // `MockQrCode` ignored its `value` prop and drew the same hand-authored SVG
    // every time, under a heading telling people to scan it. The documented
    // primary path into 2FA did not work at all.
    expect(src).not.toContain('MockQrCode');
    expect(src).not.toContain('Scan Authenticator QR');
  });

  test('the otpauth URI the server generates is offered', () => {
    const jsx = rendered(REL);
    expect(jsx).toContain('href={qrCodeUrl}');
    expect(jsx).toContain('Open in authenticator app');
    // The typed path stays, and is now the documented fallback rather than the
    // only thing that worked.
    expect(jsx).toContain('Secret Setup Key');
  });
});

test.describe('no mail route claims a delivery it did not get', () => {
  const ROUTES = [
    'app/api/send-approval-email/route.ts',
    'app/api/send-tenant-approval-email/route.ts',
    'app/api/send-tenant-revoke-email/route.ts',
  ];

  test('every send inspects the provider response', () => {
    for (const rel of ROUTES) {
      const src = rendered(rel);
      const sends = (src.match(/api\.resend\.com\/emails/g) || []).length;
      const checks = (src.match(/!resendRes\.ok/g) || []).length;
      expect(checks, `${rel}: ${sends} send(s), ${checks} response check(s)`).toBeGreaterThanOrEqual(sends);
    }
  });

  test('a rejected message is an error, not a logged aside', () => {
    for (const rel of ROUTES) {
      const src = rendered(rel);
      // Two of these three never read the response at all and logged "Success";
      // the third logged the failure and returned `success: true` anyway.
      expect(src, `${rel} swallows a rejection`).toMatch(/!resendRes\.ok[\s\S]{0,600}?status: 502/);
      expect(src).not.toMatch(/console\.log\('\[Email\] Success/);
    }
  });

  test('the message id is kept so a later delivery event can be joined', () => {
    for (const rel of ROUTES) {
      expect(read(rel), `${rel} discards the message id`).toContain('recordEmailSent');
    }
  });
});

test.describe('a tenant request that reached nobody says so', () => {
  const REL = 'app/api/request-tenant-access/route.ts';

  test('success is not reported when the administrator was not notified', () => {
    const src = rendered(REL);
    // The applicant used to be told the request was in, `s4TenantAccessRequested`
    // was set, and no one held an approval token.
    expect(src).toContain('adminNotified');
    expect(src).toMatch(/if \(!adminNotified\)[\s\S]{0,600}?status: 502/);
  });

  test('the request is still recorded, and findable', () => {
    const src = rendered(REL);
    // Not lost — an un-notified request has to be distinguishable from one an
    // administrator is simply sitting on.
    expect(src).toContain('s4TenantAccessNotified: adminNotified');
    expect(src).toContain('s4TenantAccessRequested: true');
  });
});

test.describe('the profile listener does not outlive its user', () => {
  const REL = 'hooks/useUserProfile.ts';

  test('it is released by the effect, not by a value Firebase ignores', () => {
    const src = rendered(REL);
    // `return () => unsubscribeProfile();` sat inside the onAuthStateChanged
    // callback, whose return value Firebase discards. The previous account's
    // snapshot listener stayed live and could still call setProfile.
    expect(src).not.toMatch(/return \(\) => unsubscribeProfile\(\);\s*\}\);/);
    expect(src).toContain('releaseProfile');
    expect(src).toMatch(/return \(\) => \{[\s\S]{0,200}?releaseProfile\(\);[\s\S]{0,200}?unsubscribeAuth\(\);/);
  });

  test('and it is released again when the user changes', () => {
    const src = rendered(REL);
    expect(src).toMatch(/onAuthStateChanged\(async \(user\) => \{[\s\S]{0,300}?releaseProfile\(\);/);
  });
});
