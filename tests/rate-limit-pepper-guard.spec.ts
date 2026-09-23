import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The rate limiter's pepper is a secret or it is nothing.
 *
 * `rate_limits` used to hold `gemini:<uid>:<ip>` in cleartext. F-10 replaced the
 * document ID with an HMAC so the collection keeps no durable PII — and then
 * gave the HMAC a third fallback, the string literal `'rate-limit-dev-pepper'`.
 * A literal in a public repository is not a pepper: anyone can recompute every
 * document ID and read the collection back as the cleartext key it was meant to
 * replace. That is the whole of F-10 undone by its own default (security audit
 * of b88c77b, SEC-b88c77b-132).
 *
 * It then had a second branch, `AUDIT_SIGNING_KEY`, and that one was not a
 * defect but a sequence: production ran on it, and removing it before a
 * dedicated secret existed would have taken rate limiting off the live service.
 * Sonny created the repository secret on 23.09.2026, the same commit passes it
 * to Cloud Run, and the branch went with it — so the pepper is now one named
 * secret and the audit signing key is read by the one module that signs.
 *
 * What must never come back is a value that is *in* the source.
 */
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'lib/rate-limit.ts'), 'utf8');

test.describe('the rate limiter never pseudonymises with a value from the source', () => {
  test('the pepper comes from the environment, and from nowhere else', () => {
    // One branch, one environment read, one named secret.
    expect(source).toContain('const pepper = process.env.RATE_LIMIT_PEPPER;');
    // And the signing key is not a pepper: it signs what an outsider is invited
    // to verify, and a second reader of it is a second way for it to travel.
    expect(source, 'the limiter reads the audit signing key again').not.toContain('process.env.AUDIT_SIGNING_KEY');

    // The line that resolves the pepper must not fall back to a literal. Read the
    // expression itself rather than searching the file for a banned word: a
    // comment explaining the old default is fine, a third `||` branch is not.
    const at = source.indexOf('process.env.RATE_LIMIT_PEPPER');
    expect(at, 'the pepper is still resolved from the environment').toBeGreaterThan(-1);
    const expression = source.slice(at, source.indexOf(';', at));
    expect(expression, 'a literal fallback is a published pepper').not.toMatch(/\|\|\s*['"`]/);
  });

  test('a deployment without the secret fails loudly instead of using a known value', () => {
    expect(source, 'the missing-secret case throws').toMatch(
      /if \(!pepper\) \{[\s\S]*?throw new Error\(/,
    );
    expect(source).toContain('refuses to pseudonymise with a known value');
  });

  test('the pepper is read per call, so an import cannot take a route down', () => {
    // Throwing at module load would break every route that merely imports the
    // limiter, including the ones that never reach a limited path.
    expect(source).toMatch(/function rateLimitPepper\(\): string \{/);
    expect(source).toContain("crypto.createHmac('sha256', rateLimitPepper())");
    expect(source, 'no module-level constant holds the pepper').not.toMatch(
      /^const RATE_LIMIT_PEPPER\s*=/m,
    );
  });
});
