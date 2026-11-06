import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { CONSENT_TEXTS, consentText } from '../lib/legal/consent-texts';
import { signupNoticeBelow } from '../components/legal/SignupConsent';
import { renderOpenValue } from '../lib/legal/open-values';
import { createHash } from 'crypto';
import { wordingFile } from '../lib/legal/wording-file';
import { runFreeNotice, runModelCallNotice } from '../lib/legal/run-notice';
import { archivedTermsSha256For } from '../lib/terms-versions';
import { archivedAddendumSha256 } from '../lib/legal/byok-addendum-versions';
import { TERMS_VERSION } from '../lib/constants';

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

test.describe('C1 and C2 — save or print the offered wording (§ 312i Abs. 1 S. 1 Nr. 4 BGB, 06.11.2026)', () => {
  for (const rel of ['components/UserOnboarding.tsx', 'components/LandingModals.tsx', 'components/TermsReacceptGate.tsx']) {
    test(`${rel} offers "Save as file" and "Print" for the Terms, in the contract language`, () => {
      expect(read(rel)).toMatch(/<SaveWordingActions key=\{.+?\} documents=\{\['terms'\]\} lang=\{(termsLanguage|lang)\} \/>/);
    });
  }

  test('the file is the archived wording, so its SHA-256 is the digest the record and the mail name', () => {
    const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
    for (const lang of ['de', 'en'] as const) {
      const t = wordingFile('terms', lang);
      expect(t.filename).toBe(`clean-core-${lang === 'de' ? 'nutzungsbedingungen' : 'terms-of-service'}-v2.3.0-${lang}.txt`);
      expect(sha(t.text)).toBe(archivedTermsSha256For(TERMS_VERSION, lang));
      expect(sha(wordingFile('byok-addendum', lang).text)).toBe(archivedAddendumSha256('ZV-BYOK-1.0', lang));
    }
    expect(consentText(CONSENT_TEXTS.saveWording.save, 'de')).toBe('Als Datei speichern');
    expect(consentText(CONSENT_TEXTS.saveWording.save, 'en')).toBe('Save as file');
    const comp = read('components/legal/SaveWordingActions.tsx');
    expect(comp).toContain("await import('@/lib/legal/wording-file')");
    expect(comp).toContain('w.print()');
  });
});

test.describe('B5/N2 — the sentence at the button that starts a run of own code', () => {
  test('it names the company of the key the run uses, and says the run is free, without a dash', () => {
    expect(runModelCallNotice({ callsModel: true, provider: null, lang: 'de' })).toBe('Ruft das KI-Modell auf (Google). Dafür geht Ihr Code an Google.');
    expect(runModelCallNotice({ callsModel: true, provider: 'anthropic', lang: 'en' })).toBe('Calls the AI model (Anthropic). Your code is sent to Anthropic for this.');
    expect(runModelCallNotice({ callsModel: false, provider: 'gemini', lang: 'en' })).toBe('Calls no AI model. Your code does not leave the platform.');
    expect(runFreeNotice({ kind: 'platform-key', limit: 5, remainingAfter: 4 }, 'de')).toBe('Kostenlos. Dieser Lauf verbraucht eine Ihrer 5 Analysen; danach bleiben 4.');
    expect(runFreeNotice({ kind: 'own-key' }, 'en')).toBe("Free. With your own key the run does not count against your analyses; only your provider's usage fees apply, on your own account.");
    expect(consentText(CONSENT_TEXTS.startRun.free, 'de')).toBe(
      'Kostenlos. Ein Lauf verbraucht eine Ihrer {Anzahl} Analysen; mit eigenem Schlüssel fallen nur die Nutzungsentgelte Ihres Anbieters an.',
    );
    for (const v of Object.values(CONSENT_TEXTS.startRun)) {
      for (const lang of ['de', 'en'] as const) {
        const s = consentText(v, lang);
        expect(s).not.toMatch(/[—–]/);
        expect(s).not.toMatch(/\bKosten\b|\bcosts?\b/i);
      }
    }
  });
});
