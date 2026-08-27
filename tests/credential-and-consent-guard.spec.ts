/**
 * Two invariants that are easy to break by copy-paste and expensive when broken.
 *
 * 1. The S/4 credential vault is all-or-nothing. Four routes used to merge the
 *    stored connection field by field — `url: body.url ?? stored?.url` next to
 *    `password: body.password ?? stored?.password` — so a request could ask for
 *    the stored credentials and supply its own URL, and the decrypted vault
 *    password went there. The SSRF allowlist narrowed the blast radius but is a
 *    config value: unset, any public host qualified; set, the password could
 *    still reach a different tenant on the same domain.
 *
 * 2. Consent is recorded only where it was given, and only by the server. The
 *    browser used to write termsVersionAccepted onto its own profile — an
 *    acceptance asserted by the party it protects, with no consent_events row
 *    behind it (V14). Both fields are out of the Firestore create allowlist now
 *    and the only writer is lib/consent.ts, via the Admin SDK.
 *
 * Source-level assertions, because both defects are shapes rather than
 * behaviours: the next route to be added will be written by copying one of
 * these four, and a rendering test would not notice.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { resolveS4Connection } from '../lib/s4-credentials';

const ROOT = path.resolve(__dirname, '..');

const S4_ROUTES = [
  'app/api/test-s4-connection/route.ts',
  'app/api/fetch-s4-metadata/route.ts',
  'app/api/fetch-odata-metadata/route.ts',
  'app/api/test-s4-odata-read/route.ts',
];

test.describe('the S/4 credential vault is all-or-nothing', () => {
  for (const rel of S4_ROUTES) {
    test(`${rel} does not merge stored credentials field by field`, () => {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      // The exact shape that allowed a body URL to receive a stored password.
      for (const field of ['url', 'username', 'password', 'authType', 'tokenUrl', 'btpDestinationJson']) {
        expect(source, `${rel} reintroduced "body.${field} ?? stored?.${field}"`).not.toContain(
          `body.${field} ?? stored?.${field}`,
        );
      }
      expect(source, `${rel} must resolve the connection through the shared helper`).toContain(
        'resolveS4Connection',
      );
    });
  }

  test('the helper takes the whole identity from storage or none of it', () => {
    const stored = {
      url: 'https://vault.example.com',
      username: 'vaultuser',
      password: 'vault-secret',
      authType: 'basic' as const,
      tokenUrl: '',
      btpDestinationJson: '',
    };

    // A body URL must not be able to redirect the stored password.
    const viaVault = resolveS4Connection(
      { url: 'https://attacker.example.com', password: undefined },
      stored,
    );
    expect(viaVault.source).toBe('stored');
    expect(viaVault.config.url).toBe('https://vault.example.com');
    expect(viaVault.config.password).toBe('vault-secret');

    // Without stored credentials nothing is read from the vault at all.
    const viaRequest = resolveS4Connection(
      { url: 'https://tenant.example.com', username: 'u', password: 'p', authType: 'basic' },
      null,
    );
    expect(viaRequest.source).toBe('request');
    expect(viaRequest.config.url).toBe('https://tenant.example.com');
    expect(viaRequest.config.password).toBe('p');
  });
});

test.describe('consent is recorded only where it was given', () => {
  const source = () => fs.readFileSync(path.join(ROOT, 'components/LandingModals.tsx'), 'utf8');

  const CLIENT_WRITERS = [
    'components/LandingModals.tsx',
    'components/UserOnboarding.tsx',
    'hooks/useUserProfile.ts',
  ];

  for (const rel of CLIENT_WRITERS) {
    test(`${rel} does not write a terms acceptance itself`, () => {
      const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      // Every one of these is a browser context. A consent record written here
      // is the client vouching for itself; the Firestore rules reject it now,
      // and a write that fails silently is worse than one that never happens.
      expect(s, `${rel} writes termsVersionAccepted from the client`).not.toMatch(
        /termsVersionAccepted\s*:/,
      );
      expect(s, `${rel} writes termsAcceptedAt from the client`).not.toMatch(/termsAcceptedAt\s*:/);
    });
  }

  test('the create allowlist no longer accepts the consent fields', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const start = rules.indexOf('function userClientCreateKeys()');
    expect(start).toBeGreaterThan(-1);
    // Only the returned key list counts — the comment left in place names both
    // fields to explain why they are not there any more.
    const block = rules
      .slice(start, rules.indexOf('}', start))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(block).not.toContain("'termsVersionAccepted'");
    expect(block).not.toContain("'termsAcceptedAt'");
    // The rest of the allowlist must still be there — an empty match would pass.
    expect(block).toContain("'firstName'");
  });

  test('the server records consent through the shared Admin-SDK helper', () => {
    const consent = fs.readFileSync(path.join(ROOT, 'lib/consent.ts'), 'utf8');
    expect(consent).toContain("collection('consent_events')");
    expect(consent).toContain('serverTimestamp');
    for (const rel of ['app/api/consent/route.ts', 'app/api/account/register/route.ts']) {
      const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(s, `${rel} must go through lib/consent.ts`).toContain('recordConsent');
    }
  });

  test('registration only claims consent that was actually ticked', () => {
    const s = fs.readFileSync(path.join(ROOT, 'app/api/account/register/route.ts'), 'utf8');
    // Booleans compared strictly, so a truthy string cannot stand in for a tick.
    expect(s).toContain('body?.acceptedTerms === true');
    expect(s).toContain('body?.acceptedPrivacy === true');
    expect(s).toContain('acceptedTerms && acceptedPrivacy');
  });

  test('the sign-up Google button is gated on the same checkboxes as the form', () => {
    const s = source();
    expect(s).toContain('disabled={!agreedGDPR || !agreedTerms}');
    // A disabled control has to say why it is disabled.
    expect(s).toContain('to continue with Google');
  });
});
