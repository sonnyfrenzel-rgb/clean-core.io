import type { ReactNode } from 'react';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import type { TermsLanguage } from '@/lib/terms-versions';
import CcRadioGroup from '@/components/cc/RadioGroup';

/**
 * The words of the sign-up consent (C1 of the legal texts, Fassung 1.1), for
 * both places that register an account: the landing sign-up form
 * (`components/LandingModals.tsx`) and the onboarding dialog after a Google
 * sign-in (`components/UserOnboarding.tsx`).
 *
 * German or English (section 1.4 of Terms v2.3.0; acceptance test T02): the
 * reader chooses the contract language with `ContractLanguageChoice`, the boxes
 * and notices then speak that language, and the choice travels to
 * `/api/account/register` as `termsLanguage`, where the record stores it with
 * the digest of exactly that language version's archived wording
 * (`lib/consent.ts`). The interface language plays no part in it.
 *
 * The document names in the two checkbox labels open the full text in a
 * dialog (`onOpen`).
 */

const C1 = CONSENT_TEXTS.signup;

/** Splits `text` at the first `phrase` and puts `render(phrase)` in its place. */
function withPhrase(text: string, phrase: string, render: (p: string) => ReactNode): ReactNode {
  const at = text.indexOf(phrase);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      {render(phrase)}
      {text.slice(at + phrase.length)}
    </>
  );
}

/** The words of the document names the two boxes open, per language version. */
const PRIVACY_PHRASE: Record<TermsLanguage, string> = { en: 'Privacy Policy', de: 'Datenschutzerklärung' };
const TERMS_PHRASE: Record<TermsLanguage, string> = {
  en: 'Terms of Service and Community Guidelines',
  de: 'Nutzungsbedingungen und Community-Richtlinien',
};

export function signupNoticeAbove(lang: TermsLanguage = 'en'): string {
  return consentText(C1.noticeAbove, lang);
}

/** The notice below the boxes, with the account's address filled in. */
export function signupNoticeBelow(email: string | null | undefined, lang: TermsLanguage = 'en'): string {
  return consentText(C1.noticeBelow, lang).replace('{E-Mail}', email || (lang === 'de' ? 'Ihre Kontoadresse' : 'your account address'));
}

/**
 * The choice of the contract language (Terms 1.4), above the two boxes. Each
 * option is named in its own language. Changing it changes the words of the
 * boxes and notices — and so what the ticks accept — which is why the caller
 * clears both ticks on a change.
 */
export function ContractLanguageChoice({
  value,
  onChange,
  disabled,
}: {
  value: TermsLanguage;
  onChange: (lang: TermsLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <div data-contract-language={value}>
      <CcRadioGroup
        legend="Contract language / Vertragssprache"
        options={[
          { value: 'en', label: 'English' },
          { value: 'de', label: 'Deutsch' },
        ]}
        value={value}
        onChange={(l) => onChange(l as TermsLanguage)}
        orientation="horizontal"
        disabled={disabled}
      />
    </div>
  );
}

export function PrivacyConsentLabel({ onOpen, linkClassName, lang = 'en' }: { onOpen: () => void; linkClassName: string; lang?: TermsLanguage }) {
  return (
    <span data-signup-consent="privacy" lang={lang}>
      {withPhrase(consentText(C1.privacyCheckbox, lang), PRIVACY_PHRASE[lang], (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
          className={linkClassName}
        >
          {p}
        </button>
      ))}
    </span>
  );
}

export function TermsConsentLabel({ onOpen, linkClassName, lang = 'en' }: { onOpen: () => void; linkClassName: string; lang?: TermsLanguage }) {
  return (
    <span data-signup-consent="terms" lang={lang}>
      {withPhrase(consentText(C1.termsCheckbox, lang), TERMS_PHRASE[lang], (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
          className={linkClassName}
        >
          {p}
        </button>
      ))}
    </span>
  );
}
