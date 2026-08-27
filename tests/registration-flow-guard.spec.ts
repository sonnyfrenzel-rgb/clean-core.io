/**
 * Registration has one shape now, and these are the parts of it that are easy to
 * undo by accident.
 *
 * Until v2.4.2 a signup produced three emails and a wait. The applicant got a
 * "we are reviewing your application" note, the administrator got two HMAC-signed
 * one-click links, and if one of them was ever clicked the applicant got a second,
 * near-identical "approved" note. Until then the account sat on a waiting-room
 * screen. What replaced it: the account activates itself through one server
 * endpoint, the new user gets a single welcome mail carrying both the first-run
 * guide and the security answers, and the administrator gets a notification with
 * no privileged action in it.
 *
 * Source-level assertions where the property is a shape (a deleted route, a mail
 * that must not be sent twice), rendered assertions where it is content.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildWelcomeEmail, WELCOME_EMAIL_SUBJECT } from '../lib/welcome-email';
import { buildAdminSignupEmail } from '../lib/admin-signup-email';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the approval gate is gone, not merely bypassed', () => {
  const REMOVED = [
    'app/api/request-pilot/route.ts',
    'app/api/send-pending-email/route.ts',
    'app/api/admin/approve-user/route.ts',
    'app/(app)/admin/approve/page.tsx',
  ];

  for (const rel of REMOVED) {
    test(`${rel} no longer exists`, () => {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} came back`).toBe(false);
    });
  }

  test('nothing still calls the removed endpoints', () => {
    const dirs = ['app', 'components', 'hooks', 'lib'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(rel);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const s = read(rel);
          // The comment in firebase-admin.ts explaining the removal is allowed to
          // name it; a fetch or an import is not.
          if (/['"`]\/api\/(request-pilot|send-pending-email|admin\/approve-user)/.test(s)) {
            offenders.push(rel);
          }
        }
      }
    };
    dirs.forEach(walk);
    expect(offenders, `still calling a removed endpoint: ${offenders.join(', ')}`).toEqual([]);
  });

  test('a revoked account becomes suspended, not pending', () => {
    const s = read('lib/firebase-admin.ts');
    const idx = s.indexOf('export async function adminRevokeUser');
    expect(idx).toBeGreaterThan(-1);
    const body = s.slice(idx, s.indexOf('\nexport ', idx + 1));
    // 'pending' would be indistinguishable from a fresh signup, and
    // activateAccount would happily reinstate it.
    expect(body).toContain("status: 'suspended'");
    expect(body).not.toContain("status: 'pending'");
  });

  test('activation refuses anything that is not a fresh pending account', () => {
    const s = read('lib/firebase-admin.ts');
    const idx = s.indexOf('export async function activateAccount');
    expect(idx).toBeGreaterThan(-1);
    const body = s.slice(idx, s.indexOf('\nexport ', idx + 1));
    expect(body).toContain("status !== 'pending' || data.activatedAt");
    // A reinstated account must not have its spent quota wiped.
    expect(body).not.toContain('transformationsUsed');
  });

  test('the dashboard no longer tells anyone to wait for an administrator', () => {
    const s = read('app/(app)/dashboard/page.tsx');
    expect(s).not.toContain('manually approve');
    expect(s).not.toContain('under review');
    // The pending branch offers the same idempotent call instead of a wait.
    expect(s).toContain("'/api/account/register'");
  });
});

test.describe('registration sends one mail to the user and one to the administrator', () => {
  const route = () => read('app/api/account/register/route.ts');

  test('both mails go out only when this call performed the activation', () => {
    const s = route();
    const guard = s.indexOf('if (!activated)');
    const firstSend = s.indexOf('sendMail(');
    expect(guard).toBeGreaterThan(-1);
    // Returning before the sends is what makes a retry — or a page refresh —
    // harmless rather than a second copy of the welcome mail.
    expect(guard, 'the activation guard must precede the sends').toBeLessThan(firstSend);
  });

  test('the welcome mail can only go to the authenticated address', () => {
    const s = route();
    // The old routes accepted a recipient in the body; this one derives it from
    // the verified token and validates it before use (the F-13 rule).
    expect(s).toContain('decodedToken.email');
    expect(s).not.toMatch(/to:\s*body/);
    expect(s).not.toMatch(/const\s+recipient\s*=\s*body/);
  });

  test('the administrator mail carries no privileged action', () => {
    const html = buildAdminSignupEmail({
      name: 'Test Person',
      email: 'test@example.com',
      uid: 'uid-123',
      motivation: '',
      authMethod: 'Email / password',
      termsVersion: '2026-07-07',
      signedUpAt: '2026-08-27 09:00:00 UTC',
    });
    // No approve/reject links, and above all no token in a URL.
    expect(html).not.toMatch(/token=/);
    expect(html).not.toMatch(/Approve &amp; Provision|Reject &amp; Delete/);
    expect(html).toContain('/admin');
  });

  test('the administrator mail names a missing consent instead of staying quiet', () => {
    const html = buildAdminSignupEmail({
      name: 'Test Person',
      email: 'test@example.com',
      uid: 'uid-123',
      motivation: '',
      authMethod: 'Google',
      termsVersion: null,
      signedUpAt: '2026-08-27 09:00:00 UTC',
    });
    expect(html).toContain('No consent record');
  });
});

test.describe('the one welcome mail does the whole job', () => {
  const html = () => buildWelcomeEmail({ name: 'Test Person', recipient: 'test@example.com' });

  test('it says the account is already usable', () => {
    expect(WELCOME_EMAIL_SUBJECT.toLowerCase()).toContain('welcome');
    const s = html();
    expect(s).toContain('Your workspace is live');
    // Nothing in it may point back at a review that no longer happens.
    expect(s).not.toMatch(/under review|being reviewed|pending|approval|approved/i);
  });

  test('it carries the first-run guide, not just a link to one', () => {
    const s = html();
    // The five steps are the point: a link alone puts a click between the
    // person and their first result.
    expect(s).toContain('Your first run');
    expect(s).toContain('Try it with an example');
    expect(s).toContain('Z_MATERIAL_STOCK_CALC');
    expect(s).toContain('/first-run');
    expect(s).toContain('/dashboard');
  });

  test('it answers the security questions an IT department will ask', () => {
    const s = html();
    for (const claim of [
      'europe-west1',
      'AES-256-GCM',
      'HMAC-signed',
      'TOTP',
      'GDPR',
    ]) {
      expect(s, `the security block lost "${claim}"`).toContain(claim);
    }
    expect(s).toContain('/trust');
  });

  test('it states the quota honestly', () => {
    const s = html();
    expect(s).toContain('5 free transformations');
    // Only the analysis is metered — claiming otherwise reads as a smaller
    // allowance than the person actually has.
    expect(s).toContain('Only the analysis in stage 2 is metered');
  });

  test('it escapes nothing on the caller\'s behalf', () => {
    // The builder interpolates verbatim; every route feeding it must escape.
    const s = buildWelcomeEmail({ name: '<script>x</script>', recipient: 'a@b.c' });
    expect(s).toContain('<script>x</script>');
    for (const rel of ['app/api/account/register/route.ts', 'app/api/send-approval-email/route.ts']) {
      expect(read(rel), `${rel} must escape before building the mail`).toContain('escapeHtml');
    }
  });
});
