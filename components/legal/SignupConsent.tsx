import type { ReactNode } from 'react';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';

/**
 * The words of the sign-up consent (C1 of the legal texts, Fassung 1.1), for
 * both places that register an account: the landing sign-up form
 * (`components/LandingModals.tsx`) and the onboarding dialog after a Google
 * sign-in (`components/UserOnboarding.tsx`).
 *
 * English only for now. The Terms can be concluded in German as well (section
 * 1.4), but the acceptance record does not yet store the language a person
 * accepted in (acceptance test T02, open value `t02AcceptedLanguage`); offering
 * the German checkbox before it does would record a German acceptance as an
 * English one. The German strings are in `lib/legal/consent-texts.ts`.
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

export function signupNoticeAbove(): string {
  return consentText(C1.noticeAbove, 'en');
}

/** The notice below the boxes, with the account's address filled in. */
export function signupNoticeBelow(email: string | null | undefined): string {
  return consentText(C1.noticeBelow, 'en').replace('{E-Mail}', email || 'your account address');
}

export function PrivacyConsentLabel({ onOpen, linkClassName }: { onOpen: () => void; linkClassName: string }) {
  return (
    <span data-signup-consent="privacy">
      {withPhrase(consentText(C1.privacyCheckbox, 'en'), 'Privacy Policy', (p) => (
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

export function TermsConsentLabel({ onOpen, linkClassName }: { onOpen: () => void; linkClassName: string }) {
  return (
    <span data-signup-consent="terms">
      {withPhrase(consentText(C1.termsCheckbox, 'en'), 'Terms of Service and Community Guidelines', (p) => (
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
