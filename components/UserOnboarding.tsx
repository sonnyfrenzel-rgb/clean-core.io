'use client';

import { useState, useEffect, useId } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Check, ExternalLink } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getAuth } from '@/lib/firebase';
import LegalOverlay from '@/app/components/LegalOverlay';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';

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
   * Three dialogs (QA b0b3150a1974), all `CcDialog` since Block D (D.7): focus
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

          <div className="space-y-3 border-t border-cc-line pt-4">
            <ConsentLine checked={agreedGDPR} onChange={setAgreedGDPR}>
              I agree to the{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                className={INLINE_LINK}
              >
                GDPR provisions and Privacy Policy
              </button>{' '}
              and understand that this is a Free Community Edition.
            </ConsentLine>

            <ConsentLine checked={agreedTerms} onChange={setAgreedTerms}>
              I accept the{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                className={INLINE_LINK}
              >
                Terms of Service and Guidelines
              </button>
              .
            </ConsentLine>
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
              as section 4.1 of Terms v2.2.0 (QA c9ab2c6a6c1c). */}
          <CcMessageStrip state="warning" headline="System disclaimer and terms.">
            This application is a <strong>free community project</strong>. Findings, route and score come from a
            deterministic engine, without a language model. Summaries, designs, generated code, documentation and
            tests are written by a language model (Google Gemini) where you use those steps, and may contain
            inaccuracies, invented details or syntax errors.
            <span className="mt-2 block">
              Both are drafts, not a guarantee. Before deploying any output, it must be thoroughly inspected and verified by qualified software architects. Liability is set out in section 4 of the Terms.
            </span>
            <span className="mt-2 block font-semibold">
              By creating a workspace, you acknowledge these conditions and agree to our{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                className={INLINE_LINK}
              >
                Privacy Policy (Datenschutz)
              </button>{' '}
              and standard terms.
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

      {/* The two legal summaries the consent lines link to. Dialogs of their own,
          stacked over the sign-up while open. */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-cc-ink">
          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">1. Privacy at a Glance</h3>
            <p className="m-0 mb-2 cc-text-body">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our platform program.
            </p>
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">2. Data Collection & Processing Purposes</h3>
            <p className="m-0 mb-3 cc-text-body">
              We process personal data of our users only as far as necessary to provide a functional community platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-2 cc-text-cell text-cc-ink-muted">
              <li>
                <strong>Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges.
              </li>
              <li>
                <strong>Firestore User Profiles:</strong> We store metadata about your platform usage (e.g., number of performed code transformations, system limits, as well as your first and last name) in our secure database.
              </li>
              <li>
                <strong>Bring Your Own Key (BYOK):</strong> If you configure your own Google Gemini API key in the settings, this key is encrypted and stored in our secure Firestore instance. It is used exclusively to forward your transformation requests directly via a secure backend proxy to the Gemini API, never exposing your key to the browser.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">3. Processing of Source Code & Project Assets</h3>
            <p className="m-0 cc-text-body">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <p className="mt-2 mb-0 cc-text-cell text-cc-ink-muted">
              <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong> using stateless API requests. Which of Google&apos;s data-use terms apply depends on the key that makes the request. The shared community key is a paid Gemini API key, so the paid Gemini API terms govern every request made with it: Google does not use your code to train its models. When you use your own key (BYOK), the terms of your own Google account apply — a key on Google&apos;s free tier is governed by Google&apos;s free-tier data-use terms, which differ.
            </p>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">4. Cloud Node Hosting & Third-Party Services</h3>
            <p className="m-0 cc-text-body">
              To provide this service, we rely on the following trusted cloud services:
            </p>
            <ul className="list-disc pl-5 space-y-2 cc-text-cell text-cc-ink-muted">
              <li>
                <strong>Google Cloud Platform & Firebase:</strong> Hosting (Cloud Run) and database (Firestore) on secure European servers in the <strong>Belgium (europe-west1)</strong> region. The sign-in, Firebase Authentication, is a Google service not tied to a region and is covered by the international-transfer safeguards in the full privacy policy.
              </li>
              <li>
                <strong>Google Gemini API:</strong> Generative AI models for the model-written parts of the service — the analysis narrative, business names and sentences for the process reconstructed from the code, the solution design, the code proposal, the documentation and the test suite — via secure stateless proxy layers. The findings, the route and the Clean Core Score are computed without a model.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">5. Your Rights Under GDPR (including Art. 17 Deletion)</h3>
            <p className="m-0 mb-2 cc-text-body">
              Since our platform is hosted in compliance with EU regulations, you have all rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-1 cc-text-cell text-cc-ink-muted">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / "Right to be Forgotten" (Art. 17 GDPR)</li>
              <li>Right to Restriction of Processing (Art. 18 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="mt-2 mb-0 cc-text-cell text-cc-ink-muted">
              To exercise these rights, particularly to cascadingly erase all your data immediately, you can trigger account deletion directly in your Profile Settings under the <strong>Danger Zone</strong>, which will permanently and instantly wipe all database and authentication entries. Alternatively, contact us at <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Terms of Service & Guidelines overlay */}
      <LegalOverlay isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms of Service & Guidelines">
        <div className="space-y-6 text-cc-ink">
          <CcMessageStrip state="information">
            This is a short summary.{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
              Read the full, authoritative Terms of Service &amp; Community Guidelines at clean-core.io/terms
              <ExternalLink size={12} aria-hidden={true} className="ml-1 inline align-baseline" />
            </a>
          </CcMessageStrip>
          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">1. Scope and Purpose</h3>
            <p className="m-0 cc-text-body">
              This Clean-Core.io free community program is designed solely for research and evaluation purposes in the domain of automated code modernization (ABAP to Cloud-Native Node.js). By participating, you help shape and improve this community utility.
            </p>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">2. Free Community Edition Usage</h3>
            <CcMessageStrip state="warning">
              Platform access is completely free of charge. Clean-Core.io is a non-commercial community project provided for research and evaluation purposes. Generated code is a draft — it must be reviewed, tested and approved by qualified architects before deployment to any live production environment.
            </CcMessageStrip>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">3. What is computed, and what is generated</h3>
            <p className="m-0 cc-text-body">
              The findings, the route, the Clean Core Score, the clean core levels and the process reconstructed from your code are computed by a deterministic engine, without a language model. They are evidence, not a guarantee. Summaries, the solution design, generated code, documentation and test suites are written by a language model where you use those steps. Liability is set out in section 4 of the Terms.
            </p>
            <p className="mt-2 mb-0 cc-text-cell text-cc-ink-muted">
              <strong>Architect Directive:</strong> Before applying or utilizing any generated code in staging or production environments, all files must be thoroughly inspected, validated, and approved by qualified software architects.
            </p>
          </div>

          <div>
            <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">4. Community Guidelines & Code of Conduct</h3>
            <p className="m-0 mb-2 cc-text-body">
              As a Free Community Edition participant, you agree to adhere to constructive and respectful rules of engagement:
            </p>
            <ul className="list-disc pl-5 space-y-1 cc-text-cell text-cc-ink-muted">
              <li>Do not upload malicious software, illegal scripts, or proprietary source code that violates intellectual property rights.</li>
              <li>Maintain a respectful, collaborative, and professional tone in our community spaces.</li>
              <li>Report system hallucinations, security vulnerabilities, or compilation errors to help us continuously refine the engine.</li>
            </ul>
          </div>
        </div>
      </LegalOverlay>
    </>
  );
}
