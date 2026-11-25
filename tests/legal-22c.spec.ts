import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { TERMS_DE } from '../lib/legal/texts/terms.de';
import { TERMS_EN } from '../lib/legal/texts/terms.en';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { MODEL_CALLS_PER_HOUR } from '../lib/model-hourly-limit';

/**
 * The lawyer's statement 22c (25.11.2026) on document 22, the parts built with 3.5.2 that the other specs do not hold:
 *
 *   - 3 (a): the notice over the contract names the button that concludes it. C1 stays word for word, so both
 *     sign-up forms carry the button name C1 cites — the e-mail form and the Google path's onboarding dialog.
 *   - 5: the onboarding line on the free quota is a description of the service and must agree with the Terms
 *     (section 6) and the Trust page — "included" only together with the limit that still applies to model calls.
 *
 * Privacy policy 1.5 (22c, 1) is held by `tests/legal-names-wording.spec.ts` and `tests/storage-keys-register.spec.ts`;
 * the recipient on the business-sentences button (22c, 4) by `tests/auto-steps-tools-on-open-3021.spec.ts` and
 * `tests/statement-proposal-view.spec.ts`. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test.describe('22c, 3 (a): the sign-up button is the one C1 names', () => {
  /** The button name as C1's notice below the boxes cites it, per language. */
  const cited = {
    de: /Mit „([^“]+)“ geben Sie Ihr Angebot ab;/.exec(CONSENT_TEXTS.signup.noticeBelow.de)?.[1],
    en: /By clicking "([^"]+)" you make your offer;/.exec(CONSENT_TEXTS.signup.noticeBelow.en)?.[1],
  };

  test('C1 cites one button name in both languages, and it is the button of record', () => {
    expect(cited.de, 'C1 (de) no longer names a button in its sentence on the offer').toBeTruthy();
    expect(cited.en, 'C1 (en) no longer names a button in its sentence on the offer').toBeTruthy();
    expect(cited.de).toBe(cited.en);
    expect(CONSENT_TEXTS.signup.button.de).toBe(cited.de);
    expect(CONSENT_TEXTS.signup.button.en).toBe(cited.en);
  });

  for (const file of ['components/LandingModals.tsx', 'components/UserOnboarding.tsx']) {
    test(`${file}: the submit button reads the name C1 cites`, () => {
      const src = read(file);
      const label = `{isSubmitting ? 'Setting up your workspace...' : '${cited.en}'}`;
      const at = src.indexOf(label);
      expect(at, `${file}: the submit button does not read "${cited.en}"`).toBeGreaterThan(-1);
      // It is the submit button of the form, not a label elsewhere.
      const button = src.slice(src.lastIndexOf('<CcButton', at), at);
      expect(button).toContain('type="submit"');
      // The name of 3.4.0, which C1 never cited, is not a submit label any more.
      expect(src).not.toMatch(/type="submit"[^>]*>\s*(?:\{[^}]*\}\s*)?Register\b/);
    });
  }
});

test.describe('22c, 5: the onboarding line on the quota agrees with the Terms and the Trust page', () => {
  const LINE =
    '5 free analysis runs; every tool after the analysis is included, its model calls within the fair-use rate limit (the hourly limit on model calls)';

  test('the line names the limit that still applies after the analysis', () => {
    const src = read('components/UserOnboarding.tsx');
    expect(src).toContain(`<li data-onboarding-quota="">${LINE}</li>`);
    // "Included" without the limit was the contradiction 22c, 5 points at.
    expect(src).not.toContain('<li>5 free analysis runs; every tool after the analysis is included</li>');
  });

  test('each part of it stands in the Terms (section 6) and the Trust page', () => {
    // Five counted analyses, the stages after the analysis not counted.
    expect(TERMS_EN).toContain('currently a total of 5 transformations per user account. One transformation is counted when a new ABAP source object is submitted for analysis.');
    expect(TERMS_EN).toContain('All subsequent stages of that transformation — solution design, code transformation, documentation, testing, TCO and delivery — as well as the glossary assistant are not counted');
    expect(TERMS_DE).toContain('derzeit insgesamt 5 Transformationen je Nutzerkonto');
    // The limit for every account: the Terms' own words, which the line quotes.
    expect(TERMS_EN).toContain('Fair-use rate limits apply to all accounts.');
    expect(TRUST_EN).toContain('server-side quota/rate limiting');
    // The limit the tools name is an hourly one on model calls.
    expect(MODEL_CALLS_PER_HOUR).toBeGreaterThan(0);
    expect(read('lib/statement-proposal.ts')).toContain('it counts toward the hourly limit on model calls of this account.');
    expect(read('lib/messages/documentation.ts')).toContain('each counts toward the hourly limit on model calls of this account.');
  });
});
