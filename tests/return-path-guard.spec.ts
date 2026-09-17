import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { safeReturnPath, signInLinkFor } from '../lib/return-path';
import { invitationLinkPath } from '../lib/invitations';

/**
 * Roadmap 5.1 — the app returns to the invitation link after sign-in, and to
 * nothing else.
 *
 * The acceptance is a negative one: **no open redirect**. `?next=` travels in a
 * URL anybody can write and mail, so a login that forwards to whatever it says
 * is the credible first half of a phishing flow — the victim signs in on the
 * real site, with the real certificate, and lands somewhere else still
 * believing they are here.
 *
 * A target is one of ours as written, or it is discarded. Never repaired,
 * never stripped, never decoded first: every published bypass of a redirect
 * validator is a bypass of some cleaning step, and there is no cleaning step
 * here to bypass.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('a target outside our own paths is discarded', () => {
  const REJECTED: [string, string][] = [
    ['https://evil.example/login', 'an absolute URL'],
    ['http://clean-core.io.evil.example', 'a look-alike host'],
    ['//evil.example', 'protocol-relative'],
    ['///evil.example', 'three slashes'],
    ['/\\evil.example', 'a backslash a browser reads as a slash'],
    ['/dashboard/../../evil', 'traversal'],
    ['/dashboard?next=https://evil.example', 'a query string'],
    ['/dashboard#@evil.example', 'a fragment'],
    ['/%2f%2fevil.example', 'percent-encoded slashes'],
    ['/dashboard%00', 'a null byte'],
    ['/ dashboard', 'a leading space'],
    ['dashboard', 'no leading slash'],
    ['/dashboard/', 'a trailing slash'],
    ['javascript:alert(1)', 'a scheme'],
    ['/admin/console-action', 'an internal path that is not on the list'],
    ['/project/abc/secrets', 'a stage that does not exist'],
    ['', 'the empty string'],
    ['/' + 'x'.repeat(600), 'an absurd length'],
  ];

  for (const [raw, why] of REJECTED) {
    test(`discards ${why}`, () => {
      expect(safeReturnPath(raw), `${JSON.stringify(raw)} was accepted`).toBeNull();
    });
  }

  test('a non-string is discarded rather than coerced', () => {
    for (const raw of [null, undefined, 42, {}, ['/dashboard']]) {
      expect(safeReturnPath(raw)).toBeNull();
    }
  });

  test('nothing is ever returned that was not passed in', () => {
    // The refusal is `null`, not a cleaned-up variant of the attacker's string.
    for (const [raw] of REJECTED) expect(safeReturnPath(raw)).not.toBe(raw.replace(/[?#].*$/, ''));
  });
});

test.describe('our own paths survive', () => {
  const ACCEPTED = [
    '/dashboard',
    '/settings',
    '/first-run',
    '/demo',
    '/trust',
    '/verify-pack',
    '/project/abc123',
    '/project/abc123/analyze',
    '/project/abc123/delivery',
    '/invitation/proj-1/Ab3-_xyz',
  ];

  for (const raw of ACCEPTED) {
    test(`keeps ${raw}`, () => {
      expect(safeReturnPath(raw)).toBe(raw);
    });
  }

  test('the invitation link this phase exists for is one of them', () => {
    const here = invitationLinkPath('p-42', 'tOkEn_-123');
    expect(safeReturnPath(here)).toBe(here);
    expect(signInLinkFor(here)).toBe(`/?auth=signin&next=${encodeURIComponent(here)}`);
  });

  test('a link builder cannot smuggle a target the reader would be refused', () => {
    // Otherwise a page could hand out a link this module later declines to
    // honour, and the reader would sign in and land nowhere.
    expect(signInLinkFor('https://evil.example')).toBe('/?auth=signin');
  });
});

test.describe('the sign-in modal actually uses it', () => {
  const src = read('components/LandingModals.tsx');

  test('every landing after a sign-in goes through the checked target', () => {
    expect(src).toContain("import { safeReturnPath } from '@/lib/return-path';");
    expect(src).toContain("const afterSignIn = safeReturnPath(searchParams.get('next')) ?? '/dashboard';");
    // Google popup, Google redirect, password sign-in, registration and the
    // second factor — all five, or one path silently keeps the old behaviour.
    expect((src.match(/router\.push\(afterSignIn\)/g) || []).length).toBe(5);
    expect(src, 'a sign-in still lands on a hard-coded dashboard').not.toContain("router.push('/dashboard')");
  });

  test('registration and sign-in themselves are untouched', () => {
    // The roadmap rule above every step of this phase: "Anmeldung und Konto
    // bleiben, wie sie sind." The only thing 5.1 may change is the destination.
    for (const unchanged of [
      'createUserWithEmailAndPassword(auth, email, password)',
      'signInWithEmailAndPassword(auth, email, password)',
      'finishRegistration(signedInUser',
      "identityProvider: 'password'",
    ]) {
      expect(src, `${unchanged} was changed by 5.1`).toContain(unchanged);
    }
  });
});
