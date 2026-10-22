'use client';

import { useState, useEffect, useId } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getAuth } from '@/lib/firebase';
import LegalOverlay from '@/app/components/LegalOverlay';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { PrivacyConsentLabel, TermsConsentLabel, signupNoticeAbove, signupNoticeBelow } from '@/components/legal/SignupConsent';

/** The full legal texts, fetched when a dialog opens (`components/legal/LegalOverlayBody.tsx`). */
const LegalOverlayBody = dynamic(() => import('@/components/legal/LegalOverlayBody'), {
  ssr: false,
  loading: () => <p className="m-0 cc-text-cell text-cc-ink-muted">Loading the text&hellip;</p>,
});

/** A link inside running text: ink and underlined, never a surface of its own. */
const INLINE_LINK =
  'font-semibold text-cc-ink underline underline-offset-2 hover:text-cc-information';

/**
 * One consent line: the box, and a sentence that links to the text it agrees to.
 *
 * Not `CcCheckbox`, whose label is a string, because the sentence has to carry
 * the link to the document — a consent to a text the form does not let you
 * open is not informed. Drawn exactly like it (§2.7): the native input *is* the
 * box, so Space toggles it and the focus ring lands on what the reader sees;
 * checked is ink, not green, because ticking a box is a choice, not a proof.
 */
function ConsentLine({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div data-onboarding-consent={checked ? 'on' : 'off'} className="flex items-start gap-2">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer m-0 size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-cc-field-border bg-cc-surface checked:border-cc-ink checked:bg-cc-ink forced-colors:appearance-auto"
        />
        <Check
          size={12}
          strokeWidth={3}
          aria-hidden={true}
          className="pointer-events-none absolute top-0.5 left-0.5 hidden text-cc-on-dark peer-checked:block forced-colors:hidden"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer cc-text-cell text-cc-ink">
        {children}
      </label>
    </div>
  );
}

export default function UserOnboarding() {
  const { profile, loading, createProfile } = useUserProfile();
  const auth = getAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [motivation, setMotivation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedGDPR, setAgreedGDPR] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showDatenschutz, setShowDatenschutz] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  /**
   * Who is signed in, as state that follows the auth state rather than a read
   * of `auth.currentUser` during render — a snapshot that only changed when
   * something else happened to re-render this component. Subscribed, a
   * sign-out takes the card away on its own.
   */
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!auth) return;
    // Firebase calls the observer once with the current state on subscribe.
    return onAuthStateChanged(auth, setUser);
  }, [auth]);

  /**
   * An account whose profile this session has already seen is not signing up.
   *
   * The account erasure on /settings removes the profile on the server first
   * and signs out after the answer arrives. In between, this component saw
   * "signed in, no profile" — the shape of a new account — and laid the sign-up
   * card over the page for an account that no longer existed, hiding whatever
   * the erasure had to say (coordinator's note to D.7, 30.09.2026). A profile
   * that vanishes under a signed-in session is an erasure, not a sign-up, so
   * once one has been seen for this user the card stays away until the next
   * sign-in. The address must match, so a profile still on screen from a
   * previous account never marks the next one.
   *
   * Set during render, not in an effect: it is derived from the two values
   * above and has to hold in the same render in which the profile goes.
   */
  const [profileSeenFor, setProfileSeenFor] = useState<string | null>(null);
  if (
    profile &&
    user &&
    profileSeenFor !== user.uid &&
    !!profile.email &&
    profile.email.toLowerCase() === user.email?.toLowerCase()
  ) {
    setProfileSeenFor(user.uid);
  }

  // The effect must run on every render, so it cannot sit behind the SSR guard
  // below: the server render returned before reaching it while the browser
  // render ran it, and React throws on the hook-count mismatch during
  // hydration. Guard inside the effect instead of around it.
  useEffect(() => {
    if (user?.displayName && !firstName && !lastName) {
      const displayName = user.displayName.trim();
      const parts = displayName.split(/\s+/);
      if (parts.length > 0) {
        setFirstName(parts[0]);
        if (parts.length > 1) {
          setLastName(parts.slice(1).join(' '));
        }
      }
    }
  }, [user, firstName, lastName]);

  // Firebase Auth is bypassed on the server; render nothing there.
  if (!auth) return null;

  if (loading) return null;
  if (profile || !user || profileSeenFor === user.uid) return null;

  const cancelSignUp = () => setShowCancelConfirmation(true);

  const handleSubmit = async () => {
    if (!agreedGDPR || !agreedTerms) return;
    setSubmitError('');
    setIsSubmitting(true);
    try {
      // Creates the profile and hands it straight to /api/account/register,
      // which records the consent the two checkboxes above collected, activates
      // the account and sends the welcome mail. Nothing is queued for review.
      await createProfile(user, firstName, lastName, motivation);
      setShowSuccess(true);
    } catch (error) {
      console.error('Error creating profile:', error);
      setSubmitError(error instanceof Error ? error.message : 'Could not finish setting up your account.');
      setIsSubmitting(false);
    }
  };

  /*
   * Three dialogs, all `CcDialog` since Block D (D.7): focus
   * in and held, the page behind inert, focus back on close. The sign-up is
   * mandatory, so its two ways out — Escape and the close button — both lead
   * to the "Leave the sign-up?" question rather than away; that question's own
   * Escape goes back to the form, which stays open underneath it.
   */
  return (
    <>
      <CcDialog
        open={!showSuccess}
        title="Join the platform"
        lead="Two details and two agreements, then your Free Community Edition workspace is live. No approval step."
        onClose={cancelSignUp}
        onSubmit={handleSubmit}
        actions={
          <>
            <CcButton variant="ghost" onClick={cancelSignUp}>
              Cancel
            </CcButton>
            <CcButton
              type="submit"
              variant="primary"
              busy={isSubmitting}
              disabled={!agreedGDPR || !agreedTerms || !firstName || !lastName}
            >
              {isSubmitting ? 'Setting up your workspace...' : 'Create my workspace'}
            </CcButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CcField label="First Name" required>
              {(control) => (
                <input
                  id={control.id}
                  autoComplete="given-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required={control.required}
                  aria-required={control.ariaRequired}
                  aria-describedby={control.describedBy}
                  placeholder="John"
                  className={control.className}
                />
              )}
            </CcField>
            <CcField label="Last Name" required>
              {(control) => (
                <input
                  id={control.id}
                  autoComplete="family-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required={control.required}
                  aria-required={control.ariaRequired}
                  aria-describedby={control.describedBy}
                  placeholder="Doe"
                  className={control.className}
                />
              )}
            </CcField>
          </div>

          <CcField label="Why do you want to join? (Optional)">
            {(control) => (
              <textarea
                id={control.id}
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                aria-describedby={control.describedBy}
                placeholder="Tell us a bit about your use-case..."
                rows={2}
                className={`${control.className} resize-y py-2 leading-normal`}
              />
            )}
          </CcField>

          {/* C1 of the legal texts (Fassung 1.1): the notice above the boxes,
              the two boxes — "taken note of" the Privacy Policy, which is
              information, not something one agrees to; "accept" the Terms,
              which are the contract — and the notice below. */}
          <div className="space-y-3 border-t border-cc-line pt-4">
            <p className="m-0 cc-text-cell text-cc-ink-muted" data-signup-notice="above">{signupNoticeAbove()}</p>
            <ConsentLine checked={agreedGDPR} onChange={setAgreedGDPR}>
              <PrivacyConsentLabel onOpen={() => setShowDatenschutz(true)} linkClassName={INLINE_LINK} />
            </ConsentLine>

            <ConsentLine checked={agreedTerms} onChange={setAgreedTerms}>
              <TermsConsentLabel onOpen={() => setShowTerms(true)} linkClassName={INLINE_LINK} />
            </ConsentLine>
            <p className="m-0 cc-text-cell text-cc-ink-muted" data-signup-notice="below">{signupNoticeBelow(user.email)}</p>
          </div>

          <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
            <h3 className="m-0 mb-1 cc-text-label text-cc-ink-muted">Free Community Edition</h3>
            <ul className="m-0 list-disc space-y-1 pl-5 cc-text-cell text-cc-ink">
              <li>Up to 5 App Transformations for testing</li>
              <li>Community feedback &amp; collaboration</li>
              <li className="font-semibold">Active immediately — no approval step</li>
            </ul>
          </div>

          {/* System disclaimer and terms. It says what happens — the engine
              computes findings, route and score without a model; the model steps
              are written by a language model — and leaves out the label: §3.1
              has no "powered by Generative AI", and the provenance of a given
              text is the job of the chip where that text is shown. The same fact
              as section 4.1 of Terms v2.3.0. */}
          <CcMessageStrip state="warning" headline="System disclaimer and terms.">
            This application is a <strong>free community project</strong>. Findings, route and score come from a
            deterministic engine, without a language model. Summaries, designs, generated code, documentation and
            tests are written by a language model (Google Gemini, or the provider of your own key) where you use those steps, and may contain
            inaccuracies, invented details or syntax errors.
            <span className="mt-2 block">
              Both are drafts, not a guarantee. Before deploying any output, it must be thoroughly inspected and verified by qualified software architects. Liability is set out in section 4 of the Terms.
            </span>
          </CcMessageStrip>

          {submitError && (
            <CcMessageStrip state="error" announce>
              {submitError}
            </CcMessageStrip>
          )}
        </div>
      </CcDialog>

      {/* Roadmap 0.2 (UX-076). This dialog used to read "you will lose
          access to our advanced Generative AI modernization tools and
          fail to modernise your ERP core", over a list headed "What you
          will miss" whose fourth entry promised a "Developer Community
          Forum" that posted nothing anywhere. Telling somebody who is
          closing a sign-up form that they will fail is a guilt trip, and
          it sat in the one product that positions itself on saying only
          what it can show. The list keeps the three things the free
          workspace actually does, and says so in the present tense. */}
      <CcDialog
        open={showCancelConfirmation && !showSuccess}
        title="Leave the sign-up?"
        lead="Nothing is saved: no workspace is created and what you typed here is discarded. You can sign up again at any time."
        onClose={() => setShowCancelConfirmation(false)}
        actions={
          <>
            <CcButton
              variant="ghost"
              tone="danger"
              onClick={async () => {
                try {
                  await auth.signOut();
                  window.location.reload();
                } catch (e) {
                  console.error("Sign-out error:", e);
                }
              }}
            >
              Cancel &amp; Sign Out
            </CcButton>
            <CcButton variant="primary" onClick={() => setShowCancelConfirmation(false)}>
              Back to sign-up
            </CcButton>
          </>
        }
      >
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
          <h3 className="m-0 mb-2 cc-text-label text-cc-ink-muted">What the free workspace includes:</h3>
          <ul className="m-0 list-none space-y-2 p-0 cc-text-cell text-cc-ink">
            <li className="flex items-start gap-2">
              <Check size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div>
                <strong className="font-semibold">5 free analyses</strong>: the seven-stage workflow on your own ABAP, or on a starter example — each example is free the first time you run it.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Check size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div>
                <strong className="font-semibold">Process Blueprinting</strong>: the process reconstructed from the code, with a BPMN 2.0 XML export.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Check size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div>
                <strong className="font-semibold">Stakeholder Presentations</strong>: management-ready briefs built from the measured findings — no ROI is estimated.
              </div>
            </li>
          </ul>
        </div>
      </CcDialog>

      <CcDialog
        open={showSuccess}
        title="You're in"
        lead="Your Clean-Core.io workspace is active — there is nothing to approve and nothing to wait for."
        onClose={() => window.location.reload()}
        actions={
          <CcButton variant="primary" onClick={() => window.location.reload()}>
            Open my workspace
          </CcButton>
        }
      >
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
          <p className="m-0 mb-1 cc-text-h3 text-cc-ink">What&apos;s next</p>
          <p className="m-0 cc-text-cell text-cc-ink-muted">A welcome email is on its way to {user.email} with the first-run guide and the security details your IT department will ask for. Or start right now — the dashboard has ready-made ABAP examples, so you need no system connection and no code of your own.</p>
        </div>
      </CcDialog>

      {/* The two legal texts the consent lines link to, in full (C1: "Please
          read both texts"). Dialogs of their own, stacked over the sign-up. */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy">
        <LegalOverlayBody id="privacy" />
      </LegalOverlay>

      <LegalOverlay isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms of Service & Community Guidelines">
        <LegalOverlayBody id="terms" />
      </LegalOverlay>
    </>
  );
}
