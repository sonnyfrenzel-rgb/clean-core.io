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
 * 2. Consent is recorded only where it was given. A Google popup asks for
 *    nothing, yet the auto-provisioning branch wrote termsVersionAccepted — so
 *    the record existed and the person was never asked again.
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

  test('the Google auto-provisioning branch records no terms acceptance', () => {
    const s = source();
    // Exactly one profile literal may carry the acceptance: the email
    // registration path, which is gated on both checkboxes.
    const occurrences = s.split('termsVersionAccepted: TERMS_VERSION').length - 1;
    expect(occurrences, 'a second code path writes terms acceptance').toBe(1);
    // …and that one sits in the password flow.
    const idx = s.indexOf('termsVersionAccepted: TERMS_VERSION');
    const around = s.slice(Math.max(0, idx - 600), idx);
    expect(around).toContain("authMethod: 'password'");
  });

  test('the sign-up Google button is gated on the same checkboxes as the form', () => {
    const s = source();
    expect(s).toContain('disabled={!agreedGDPR || !agreedTerms}');
    // A disabled control has to say why it is disabled.
    expect(s).toContain('to continue with Google');
  });
});
