import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { CONSENT_TEXTS, consentText } from '../lib/legal/consent-texts';
import { signupNoticeBelow } from '../components/legal/SignupConsent';
import { renderOpenValue } from '../lib/legal/open-values';

/**
 * Where the product shows the consent texts of Fassung 1.1 (3.0.21), it shows
 * those words and no others.
 *
 * - C1, the sign-up: both places that register an account (the landing form
 *   and the onboarding dialog after a Google sign-in) take the boxes and the
 *   two notices from `components/legal/SignupConsent.tsx`; the privacy box says
 *   the policy was *taken note of* — it is information, not something agreed
 *   to — and the dialogs behind the two links show the full texts, not
 *   summaries of them.
 * - C2, the amendment dialog: the lead, the statement to tick and the buttons
 *   come from `lib/legal/consent-texts.ts`, and Accept stays disabled until the
 *   statement is ticked.
 *
 * Source-level and server-free; the rendered half is in the Terms dialog specs
 * (`terms-reaccept-gate`, `terms-30-reconsent`).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('C1 — the sign-up consent', () => {
  for (const rel of ['components/UserOnboarding.tsx', 'components/LandingModals.tsx']) {
    test(`${rel} shows the C1 words and the full texts`, () => {
      const s = read(rel);
      expect(s).toContain('<PrivacyConsentLabel');
      expect(s).toContain('<TermsConsentLabel');
      // Since T02 (3.0.21) the notices speak the contract language chosen in the dialog.
      expect(s).toContain('signupNoticeAbove(termsLanguage)');
      expect(s).toMatch(/signupNoticeBelow\(.*termsLanguage\)/);
      expect(s).toContain('<ContractLanguageChoice');
      expect(s, `${rel} still asks the reader to agree to the privacy policy`).not.toMatch(/I agree to the\{' '\}/);
      expect(s).toContain('<LegalOverlayBody id="privacy" lang={termsLanguage} />');
      expect(s).toContain('<LegalOverlayBody id="terms" lang={termsLanguage} />');
      expect(s, `${rel} still shows a summary of the policy`).not.toContain('1. Privacy at a Glance');
    });
  }

  test('the privacy box says "taken note of", the Terms box says "accept", both name the version', () => {
    const privacy = consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'en');
    const terms = consentText(CONSENT_TEXTS.signup.termsCheckbox, 'en');
    expect(privacy).toMatch(/^I have taken note of the Privacy Policy \(version of /);
    expect(privacy).toContain(renderOpenValue('releaseDate', 'en'));
    expect(terms).toMatch(/^I accept the Clean-Core\.io Terms of Service and Community Guidelines \(version v2\.3\.0, English version/);
    expect(consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'de')).toMatch(/^Ich habe die Datenschutzerklärung \(Stand /);
  });

  test('the notice below names the address the confirmation goes to', () => {
    expect(signupNoticeBelow('someone@example.com')).toContain('You will receive a contract confirmation at someone@example.com');
    expect(signupNoticeBelow(null)).not.toContain('{E-Mail}');
    expect(signupNoticeBelow('x@y.z')).toContain('The contract language is English; the English version v2.3.0 governs');
  });
});

test.describe('C2 — the amendment dialog', () => {
  test('the Terms dialog takes its words from the consent texts and asks for the statement first', () => {
    const s = read('components/TermsReacceptGate.tsx');
    expect(s).toContain('CONSENT_TEXTS.amendment');
    expect(s).toContain('consentText(C2.lead');
    expect(s).toContain('consentText(C2.afterList');
    expect(s).toContain('consentText(C2.checkbox');
    expect(s).toMatch(/data-terms-gate-accept[^>]*disabled=\{!ticked\}/);
    expect(s).toContain('data-terms-gate-checkbox');
  });

  test('the statement names the version and the language', () => {
    // G14 (Fassung 1.1, 23.10.2026): the statement names the day it takes effect.
    expect(CONSENT_TEXTS.amendment.checkbox.en).toBe('I accept the Terms of Service in version {Fassung} (English version) with effect from {{termsEffectiveDate}}.');
    expect(CONSENT_TEXTS.amendment.checkbox.de).toBe('Ich nehme die Nutzungsbedingungen in der Fassung {Fassung} (deutsche Fassung) mit Wirkung zum {{termsEffectiveDate}} an.');
    // After that day there is no later day to name.
    expect(CONSENT_TEXTS.amendment.checkboxPastDate.en).toBe('I accept the Terms of Service in version {Fassung} (English version).');
    expect(CONSENT_TEXTS.amendment.checkboxPastDate.de).toBe('Ich nehme die Nutzungsbedingungen in der Fassung {Fassung} (deutsche Fassung) an.');
  });
});
