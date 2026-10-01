'use client';

import { useState, useEffect, FormEvent, KeyboardEvent, ClipboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
} from 'firebase/auth';
import { getAuth, getDb } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  ArrowRight,
  ShieldCheck,
  Key,
  CheckCircle2,
  Mail,
  Lock,
  ArrowLeft,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import LegalOverlay from '@/app/components/LegalOverlay';
import { COMMUNITY_QUOTA } from '@/lib/constants';
import { finishRegistration } from '@/hooks/useUserProfile';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import MaintenanceNotice from '@/components/MaintenanceNotice';
import { safeReturnPath } from '@/lib/return-path';
import { cn } from '@/lib/utils';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcCheckbox from '@/components/cc/Checkbox';
import CcMessageStrip from '@/components/cc/MessageStrip';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'mfa' | 'success';

/** The dialog's title per step: the heading each screen used to draw itself. */
const AUTH_TITLE: Record<AuthMode, string> = {
  signin: 'Welcome Back',
  signup: 'Create Account',
  forgot: 'Reset Password',
  success: 'Check your Inbox',
  mfa: 'Two-Factor Auth',
};

/** A link inside running text: ink and underlined, never a surface of its own. */
const INLINE_LINK = 'font-semibold text-cc-ink underline underline-offset-2 hover:text-cc-information';

/** A public dialog, so the cozy 40 px field of DESIGN.md §2.7 rather than the compact 32 px one. */
const FIELD = 'min-h-10';
const FIELD_WITH_ICON = 'min-h-10 pl-9';
const FIELD_ICON = 'pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-cc-ink-muted';

/** A heading inside a legal summary, as in the onboarding dialog's. */
const LEGAL_H3 = 'm-0 mb-2 cc-text-h3 text-cc-ink';

/** The icon above a one-purpose step (reset, sent, second factor). Decoration only. */
function DialogMark({ icon: Icon, centered = false }: { icon: LucideIcon; centered?: boolean }) {
  return (
    <div
      aria-hidden={true}
      className={cn(
        'mb-4 flex h-12 w-12 items-center justify-center rounded-cc-card border border-cc-line bg-cc-brand-surface text-cc-brand-strong',
        centered && 'mx-auto',
      )}
    >
      <Icon size={24} />
    </div>
  );
}

/** Show or hide the password: an icon button laid into the field's right edge. */
function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute top-1/2 right-1 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-cc-row text-cc-ink-muted hover:text-cc-ink"
      aria-label="Show password"
      aria-pressed={shown}
    >
      {shown ? <EyeOff size={16} aria-hidden={true} /> : <Eye size={16} aria-hidden={true} />}
    </button>
  );
}

/** The divider between the e-mail form and the Google button. */
function OrContinueWith() {
  return (
    <div className="relative py-2">
      <div className="absolute inset-x-0 top-1/2 border-t border-cc-line" aria-hidden={true} />
      <p className="relative m-0 flex justify-center">
        <span className="bg-cc-surface px-3 cc-text-label text-cc-ink-muted">or continue with</span>
      </p>
    </div>
  );
}

/** The Google "G" in the button's own ink; the button says "Google Account" in words. */
function GoogleMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden={true}>
      <path
        fill="currentColor"
        d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.72 5.72 0 0 1 8.24 12.9a5.72 5.72 0 0 1 5.751-5.7 5.6 5.6 0 0 1 3.916 1.547l3.076-3.076A10.15 10.15 0 0 0 14.004 2a10.05 10.05 0 0 0-10 10.05 10.05 10.05 0 0 0 10 10.05c5.787 0 9.878-3.9 9.878-9.882 0-.67-.066-1.3-.2-1.933H12.24Z"
      />
    </svg>
  );
}

export default function LandingModals() {
  const auth = getAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Modal open states based on search parameters
  const authParam = searchParams.get('auth');
  const legalParam = searchParams.get('legal');

  /**
   * Where a finished sign-in lands — roadmap 5.1.
   *
   * The dashboard, as it always was, unless the visitor arrived from one of our
   * own pages that wants them back: an invitation link is useless if opening it
   * signed out drops the reader on somebody's workspace with the link spent.
   *
   * **Nothing about signing in or registering changes** — not a field, not a
   * step, not an order. The destination does, and only to a path
   * `safeReturnPath` recognises as one of ours. A `next` it does not recognise
   * is discarded, not repaired: that parameter travels in a URL anybody can
   * write and mail, and a login that hands the visitor on to an arbitrary
   * target is the credible first half of a phishing flow — they sign in on the
   * real site and end up somewhere else still believing they are here.
   */
  const afterSignIn = safeReturnPath(searchParams.get('next')) ?? '/dashboard';

  // Local state mirroring
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Legal consent state (for signup)
  const [motivation, setMotivation] = useState('');
  const [agreedGDPR, setAgreedGDPR] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showDatenschutz, setShowDatenschutz] = useState(false);
  const [showTermsOverlay, setShowTermsOverlay] = useState(false);

  // The second factor is Firebase's own (roadmap 0.13): a sign-in on an
  // enrolled account stops with `auth/multi-factor-auth-required` before any
  // session exists, and the resolver it hands over is the only thing this
  // screen holds. There is no signed-in user to keep and nothing to sign out —
  // the old `pendingMfaUser` was exactly the session the finding was about.
  const [mfaCode, setMfaCode] = useState<string[]>(['', '', '', '', '', '']);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

  /** Routes a sign-in error into the second-factor screen when that is what it is. */
  const interceptSecondFactor = (error: unknown): boolean => {
    const code = (error as { code?: string } | null)?.code;
    if (code !== 'auth/multi-factor-auth-required') return false;
    setMfaResolver(getMultiFactorResolver(auth, error as Parameters<typeof getMultiFactorResolver>[1]));
    setMfaCode(['', '', '', '', '', '']);
    setAuthError('');
    setAuthMode('mfa');
    updateQueryParams('auth', 'mfa');
    return true;
  };

  // Sync auth mode with search param
  useEffect(() => {
    if (authParam === 'signin' || authParam === 'signup' || authParam === 'forgot') {
      setAuthMode(authParam);
    }
  }, [authParam]);

  // Declared above the effect that calls it: an arrow function hoists no value,
  // so the effect below was reading it out of the temporal dead zone. It works
  // today only because effects run after the render that initialises the const.
  const updateQueryParams = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/?${params.toString()}`);
  };

  // Handle Google redirect result (fallback from signInWithPopup)
  useEffect(() => {
    if (!auth) return;
    // A redirect sign-in used to go straight to the dashboard without ever
    // consulting the profile, so an account with MFA enabled skipped the second
    // factor entirely on this path while the popup path enforced it. Check the
    // profile first and route into the MFA step when it is required; on a read
    // failure, sign out rather than proceeding — the same fail-closed rule the
    // popup and password paths follow.
    getRedirectResult(auth)
      .then((result) => {
        if (!result?.user) return;
        setIsNavigating(true);
        router.push(afterSignIn);
      })
      .catch((err) => {
        if (interceptSecondFactor(err)) return;
        console.error('[getRedirectResult] Error:', err);
      });
  }, [auth, router, afterSignIn]);

  const closeAuthModal = async () => {
    setMfaResolver(null);
    setAuthError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setMfaCode(['', '', '', '', '', '']);
    updateQueryParams('auth', null);
  };

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);

      // A first-time Google user gets no profile here on purpose.
      //
      // This branch used to provision one silently. It deliberately omitted the
      // consent fields — a popup asks for nothing, so recording an acceptance
      // would have invented one (finding V10) — and left the agreement to the
      // onboarding modal. But that modal only renders when no profile exists, so
      // writing one here guaranteed it never appeared: the account ran with no
      // consent recorded and nobody was ever asked.
      //
      // Signing in is now all this does. `UserOnboarding`, mounted in the app
      // shell, sees the missing profile, asks for a name and both agreements,
      // and creates the account through the one path that records consent
      // server-side. The second factor, where one is enrolled, has already
      // been resolved by the time this line runs — Firebase does not sign in
      // without it.

      setIsNavigating(true);
      setTimeout(() => {
        router.push(afterSignIn);
      }, 850);
    } catch (error: any) {
      if (interceptSecondFactor(error)) return;
      const code = error?.code || '';
      // A closed popup, or a second click that superseded the first popup, is
      // not an error: the reader changed their mind or clicked twice.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Error signing in with popup:', error);
      // Log the actual error for debugging — don't silently redirect
      console.error('[handleSignIn] Google popup error code:', code, 'message:', error?.message);
      if (code === 'auth/popup-blocked') {
        setAuthError('Pop-up was blocked by your browser. Please allow pop-ups for clean-core.io and try again.');
      } else {
        setAuthError(`Google Sign-In failed (${code || error?.message || 'unknown'}). Please try Email/Password sign-in or contact support.`);
      }
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
    try {
      // On an enrolled account this throws before any session exists and the
      // catch below turns it into the second-factor screen.
      await signInWithEmailAndPassword(auth, email, password);

      setIsNavigating(true);
      setTimeout(() => {
        router.push(afterSignIn);
      }, 850);
    } catch (error: any) {
      if (interceptSecondFactor(error)) {
        setIsSubmitting(false);
        return;
      }
      console.error('Sign-in error:', error);
      let errorMsg = 'Invalid email or password.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Invalid email or password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Invalid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed login attempts. Please try again later.';
      }
      setAuthError(errorMsg);
      setIsSubmitting(false);
    }
  };

  const handleEmailSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    
    const strength = getPasswordStrength(password);
    if (strength.score < 2) {
      setAuthError('Password is too weak. Must satisfy at least two guidelines.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const signedInUser = userCredential.user;
      
      const db = getDb();
      const userDocRef = doc(db, 'users', signedInUser.uid);
      
      // All new users start as pilot/pending. Admin bootstrap only via
      // the server-side set-admin-claim API with Firebase Custom Claims.
      const newProfile = {
        firstName,
        lastName,
        email: signedInUser.email || '',
        tier: 'pilot',
        status: 'pending',
        transformationsUsed: 0,
        transformationsLimit: COMMUNITY_QUOTA,
        maxTeamMembers: 1,
        orgId: null,
        // This is the email/password registration path; it recorded 'google',
        // which mislabels the provenance of the consent record beside it.
        identityProvider: 'password',
        createdAt: serverTimestamp(),
        isAdmin: false,
        authMethod: 'password',
        // Consent is not written from here. The two fields that used to sit on
        // this object are finding V14 — an acceptance the browser asserted about
        // itself, timestamped by its own clock, with no consent_events row
        // behind it. They are out of the Firestore create allowlist now, so this
        // write would be rejected outright with them present. The agreement the
        // checkboxes above collect is recorded server-side in the call below.
      };

      await setDoc(userDocRef, newProfile);

      // By now the account exists, so a failure here must not end in "Error
      // creating account": the retry would only meet "already registered". The
      // activation below writes this same request server-side
      // (`app/api/account/register/route.ts`), and the dashboard offers that
      // call again, so a lost write here is repaired there (QA full review of
      // v2.20.0).
      try {
        await setDoc(doc(db, 'registration_requests', signedInUser.uid), {
          email: signedInUser.email,
          name: `${firstName} ${lastName}`,
          motivation: motivation.trim().slice(0, 2000),
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      } catch (requestErr) {
        console.error('[Email Signup] registration request write failed:', requestErr);
      }

      // Activates the account, records the consent and sends the one welcome
      // mail. A failure here leaves a created-but-inactive account rather than
      // no account at all, and the dashboard offers the same call as a retry —
      // so this must not block the person from getting in.
      try {
        await finishRegistration(signedInUser, {
          firstName,
          lastName,
          motivation: motivation.trim().slice(0, 2000),
          acceptedTerms: agreedTerms,
          acceptedPrivacy: agreedGDPR,
        });
      } catch (registerErr) {
        console.error('[Email Signup] account activation failed:', registerErr);
      }

      setIsNavigating(true);
      setTimeout(() => {
        router.push(afterSignIn);
      }, 850);
    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMsg = 'Error creating account. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'This email address is already registered.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Invalid email address.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'The password is too weak.';
      }
      setAuthError(errorMsg);
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthMode('success');
      setIsSubmitting(false);
    } catch (error: any) {
      console.error('Reset error:', error);
      let errorMsg = 'Error sending password reset email.';
      if (error.code === 'auth/user-not-found') {
        errorMsg = 'No account found with this email address.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Invalid email address.';
      }
      setAuthError(errorMsg);
      setIsSubmitting(false);
    }
  };

  const handleVerifyMfa = async (codeStr: string) => {
    if (!mfaResolver) return;
    setAuthError('');
    setIsSubmitting(true);
    try {
      const hint =
        mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ?? mfaResolver.hints[0];
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, codeStr);
      // The session comes into existence here, and its ID token names the factor.
      await mfaResolver.resolveSignIn(assertion);
      setMfaResolver(null);
      setIsNavigating(true);
      setTimeout(() => {
        router.push(afterSignIn);
      }, 850);
    } catch (error: any) {
      console.error('MFA validation error:', error?.code);
      const code = error?.code || '';
      setAuthError(
        code === 'auth/invalid-verification-code'
          ? 'That code is not valid. Enter the current 6-digit code from your authenticator app.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a moment and try again.'
            : code === 'auth/multi-factor-session-expired' || code === 'auth/code-expired'
              ? 'This sign-in has expired. Go back and sign in again.'
              : 'Could not verify the code. Please try again.',
      );
      setMfaCode(['', '', '', '', '', '']);
      setIsSubmitting(false);
    }
  };

  const getPasswordStrength = (pw: string) => {
    let score = 0;
    const feedback: string[] = [];
    if (pw.length >= 8) score++;
    else feedback.push('At least 8 characters');
    
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    else feedback.push('Uppercase & lowercase letters');
    
    if (/[0-9]/.test(pw)) score++;
    else feedback.push('At least one number');
    
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    else feedback.push('At least one special character');
    
    // State colours of §1.1 with the word beside them: the check ran, so
    // success is honest for the two passing grades, and the label tells Good
    // from Strong.
    let label = 'Weak';
    let color = 'bg-cc-error';
    let text = 'text-cc-error';
    if (score === 2) {
      label = 'Fair';
      color = 'bg-cc-warning-line';
      text = 'text-cc-warning';
    } else if (score === 3) {
      label = 'Good';
      color = 'bg-cc-success';
      text = 'text-cc-success';
    } else if (score === 4) {
      label = 'Strong';
      color = 'bg-cc-success';
      text = 'text-cc-success';
    }

    return { score, label, color, text, feedback };
  };

  const handleMfaInputChange = (val: string, index: number) => {
    if (val !== '' && isNaN(Number(val))) return;
    const nextCode = [...mfaCode];
    nextCode[index] = val;
    setMfaCode(nextCode);

    if (val !== '' && index < 5) {
      const nextInput = document.getElementById(`mfa-input-${index + 1}`);
      nextInput?.focus();
    }

    const combined = nextCode.join('');
    if (combined.length === 6) {
      handleVerifyMfa(combined);
    }
  };

  const handleMfaKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (mfaCode[index] === '' && index > 0) {
        const nextCode = [...mfaCode];
        nextCode[index - 1] = '';
        setMfaCode(nextCode);
        const prevInput = document.getElementById(`mfa-input-${index - 1}`);
        prevInput?.focus();
      } else {
        const nextCode = [...mfaCode];
        nextCode[index] = '';
        setMfaCode(nextCode);
      }
    }
  };

  /**
   * Recovery codes used to look like `CC-XXXX-YYYY`, and people kept them.
   *
   * Roadmap 0.13 replaced the application-level TOTP with Firebase's own
   * factor, and those backup codes no longer exist. Someone pasting an old one got
   * "that code is not valid" and no idea why (UX review of 52f171091948,
   * d5f35cf138c5). It is not invalid — it no longer exists, and the way back in
   * is a different one.
   */
  const OLD_RECOVERY_CODE = /^CC-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

  const handleMfaPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (OLD_RECOVERY_CODE.test(pasteData)) {
      setAuthError('That is one of the old recovery codes, which no longer exist. Sign in with the 6-digit code from your authenticator app, or write to info@clean-core.io from your account address if you have lost it.');
      return;
    }
    if (pasteData.length === 6 && !isNaN(Number(pasteData))) {
      const splitCode = pasteData.split('');
      setMfaCode(splitCode);
      handleVerifyMfa(pasteData);
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <>
      {isNavigating && (
        // Above the dialog it follows: the sign-in has gone through and the
        // page is on its way, so this bar belongs on top of every layer.
        <div className="fixed top-0 left-0 z-cc-toast h-1 w-full bg-cc-ink/10">
          <div className="h-full w-full bg-cc-brand-strong motion-safe:animate-pulse"></div>
        </div>
      )}

      {/*
        The access dialog — sign-in, registration, password reset and the second
        factor — as one `CcDialog` (block D, D.27). What changed is the frame:
        the library's dialog holds the focus, puts the page behind it out of
        reach and closes on Escape. What did not change is anything the account
        depends on: every field, which of them are required, both agreements,
        the order of the steps and every call they make are the ones above. Each
        form stays a native <form> inside the dialog body rather than the
        dialog's own `onSubmit`, so the browser still checks `required` and
        `type="email"` before a submit handler runs, exactly as before.
      */}
      <CcDialog open={!!authParam} onClose={closeAuthModal} title={AUTH_TITLE[authMode]} data-access-dialog={authMode}>
        {authMode === 'mfa' ? (
          /* MFA Interceptor Screen */
          <div>
            <DialogMark icon={ShieldCheck} />
            <p className="mb-5 cc-text-body text-cc-ink-muted">
              Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password, …). Your sign-in completes only with it.
            </p>

            <div className="space-y-5">
              {/* 6 Digit Input boxes */}
              <div role="group" aria-label="Authentication code" className="flex justify-between gap-2">
                {mfaCode.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`mfa-input-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    aria-label={`Digit ${idx + 1} of 6`}
                    onChange={(e) => handleMfaInputChange(e.target.value, idx)}
                    onKeyDown={(e) => handleMfaKeyDown(e, idx)}
                    onPaste={idx === 0 ? handleMfaPaste : undefined}
                    className="h-14 w-12 rounded-cc-row border border-cc-field-border bg-cc-surface text-center font-cc-mono text-[22px] font-bold text-cc-ink"
                    autoFocus={idx === 0}
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {authError && <CcMessageStrip state="error">{authError}</CcMessageStrip>}

              <p className="m-0 text-center text-[12px] font-medium leading-normal text-cc-ink-muted">
                Make sure your authenticator's clock is in sync. Lost the authenticator? Write to info@clean-core.io from your account address — an administrator removes the factor after confirming with you, and you set it up again in Settings.
              </p>

              <div className="flex flex-col">
                <CcButton variant="ghost" density="cozy" onClick={closeAuthModal} icon={<ArrowLeft size={16} aria-hidden={true} />}>
                  Back to Sign In
                </CcButton>
              </div>
            </div>
          </div>
        ) : authMode === 'forgot' ? (
          /* Forgot Password Screen */
          <form onSubmit={handleForgotPassword}>
            <DialogMark icon={Key} />
            <p className="mb-5 cc-text-body text-cc-ink-muted">
              Enter your email address and we'll send you a secure link to reset your password.
            </p>

            <div className="space-y-4">
              <CcField label="Email Address" required>
                {(c) => (
                  <div className="relative">
                    <Mail size={16} aria-hidden={true} className={FIELD_ICON} />
                    <input
                      id={c.id}
                      type="email"
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-describedby={c.describedBy}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className={cn(c.className, FIELD_WITH_ICON)}
                    />
                  </div>
                )}
              </CcField>

              {authError && <CcMessageStrip state="error">{authError}</CcMessageStrip>}

              <div className="flex flex-col gap-2">
                <CcButton type="submit" variant="primary" density="cozy" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending...' : 'Send Reset Link'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
                <CcButton
                  variant="ghost"
                  density="cozy"
                  onClick={() => { setAuthMode('signin'); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                  icon={<ArrowLeft size={16} aria-hidden={true} />}
                >
                  Back to Sign In
                </CcButton>
              </div>
            </div>
          </form>
        ) : authMode === 'success' ? (
          /* Reset Password Success Screen */
          <div className="text-center">
            <DialogMark icon={CheckCircle2} centered />
            <p className="mb-5 cc-text-body text-cc-ink-muted">
              We've sent a password reset link to <span className="font-semibold text-cc-ink">{email}</span>. Please click the link in that email to reset your credentials.
            </p>

            <div className="flex flex-col">
              <CcButton
                variant="primary"
                density="cozy"
                onClick={() => { setAuthMode('signin'); setEmail(''); setAuthError(''); updateQueryParams('auth', 'signin'); }}
              >
                Back to Sign In
              </CcButton>
            </div>
          </div>
        ) : authMode === 'signup' ? (
          /* Sign Up Screen */
          <form onSubmit={handleEmailSignUp}>
            <p className="m-0 mb-4 cc-text-cell text-cc-ink-muted">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setAuthMode('signin'); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                className={INLINE_LINK}
              >
                Sign In
              </button>
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CcField label="First Name" required>
                  {(c) => (
                    <input
                      id={c.id}
                      type="text"
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-describedby={c.describedBy}
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className={cn(c.className, FIELD)}
                    />
                  )}
                </CcField>
                <CcField label="Last Name" required>
                  {(c) => (
                    <input
                      id={c.id}
                      type="text"
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-describedby={c.describedBy}
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className={cn(c.className, FIELD)}
                    />
                  )}
                </CcField>
              </div>

              <CcField label="Email Address" required>
                {(c) => (
                  <div className="relative">
                    <Mail size={16} aria-hidden={true} className={FIELD_ICON} />
                    <input
                      id={c.id}
                      type="email"
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-describedby={c.describedBy}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className={cn(c.className, FIELD_WITH_ICON)}
                    />
                  </div>
                )}
              </CcField>

              <div>
                <CcField label="Password" required>
                  {(c) => (
                    <div className="relative">
                      <Lock size={16} aria-hidden={true} className={FIELD_ICON} />
                      <input
                        id={c.id}
                        type={showPassword ? 'text' : 'password'}
                        required={c.required}
                        aria-required={c.ariaRequired}
                        aria-describedby={c.describedBy}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={cn(c.className, FIELD_WITH_ICON, 'pr-12')}
                      />
                      <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                  )}
                </CcField>

                {/* Password strength meter */}
                {password && (
                  <div data-password-strength={strength.score} className="mt-2 space-y-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                    <div className="flex items-center justify-between">
                      <span className="cc-text-label text-cc-ink-muted">Password Strength</span>
                      <span className={cn('cc-text-meta', strength.text)}>{strength.label}</span>
                    </div>
                    <div className="grid h-1 grid-cols-4 gap-1" aria-hidden={true}>
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={cn('h-full rounded-full', strength.score >= step ? strength.color : 'bg-cc-line')}
                        />
                      ))}
                    </div>
                    {strength.feedback.length > 0 && (
                      <ul className="m-0 list-disc space-y-1 pl-4 text-[12px] font-medium text-cc-ink-muted">
                        {strength.feedback.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Match or mismatch is a check that actually ran, so it is a
                  value state on the field (§2.7) — icon and text, not a colour. */}
              <CcField
                label="Confirm Password"
                required
                valueState={confirmPassword ? (password !== confirmPassword ? 'error' : 'success') : undefined}
                message={confirmPassword ? (password !== confirmPassword ? 'Passwords do not match' : 'Passwords match') : undefined}
              >
                {(c) => (
                  <div className="relative">
                    <Lock size={16} aria-hidden={true} className={FIELD_ICON} />
                    <input
                      id={c.id}
                      type={showPassword ? 'text' : 'password'}
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-invalid={c.invalid || undefined}
                      aria-describedby={c.describedBy}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={cn(c.className, FIELD_WITH_ICON)}
                    />
                  </div>
                )}
              </CcField>

              {/*
                Optional, and the only free-text field in the form. Nobody
                is gated on it, but two sentences about the use case is the
                difference between a row in a list and knowing who arrived —
                and the admin notification has always had a place to print
                it. The Google path kept asking; this one stopped, and sent
                an empty string instead.
              */}
              <div>
                <CcField label="Motivation / Use Case (Optional)">
                  {(c) => (
                    <textarea
                      id={c.id}
                      aria-describedby={c.describedBy}
                      value={motivation}
                      onChange={(e) => setMotivation(e.target.value)}
                      placeholder="Which SAP system, and what are you trying to find out?"
                      rows={2}
                      maxLength={2000}
                      className={cn(c.className, 'resize-none py-2 leading-normal')}
                    />
                  )}
                </CcField>
              </div>

              {/* Legal consent checkboxes (required for registration) */}
              <div className="space-y-2 border-t border-cc-line pt-3">
                <CcCheckbox
                  checked={agreedGDPR}
                  onChange={setAgreedGDPR}
                  required
                  label={
                    <>
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                        className={INLINE_LINK}
                      >
                        GDPR provisions and Privacy Policy
                      </button>{' '}
                      and understand this is a Free Community Edition.
                    </>
                  }
                />
                <CcCheckbox
                  checked={agreedTerms}
                  onChange={setAgreedTerms}
                  required
                  label={
                    <>
                      I accept the{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setShowTermsOverlay(true); }}
                        className={INLINE_LINK}
                      >
                        Terms of Service and Guidelines
                      </button>
                      .
                    </>
                  }
                />
              </div>

              {/* The disclaimer states the fact and drops the label (§3.1 has no
                  "powered by Generative AI" and no symbol for it). The fact is
                  the one section 4.1 of the Terms states since v2.2.0: findings,
                  route and score are the deterministic engine's, and only the
                  model steps are written by a language model — which an account
                  can switch off (QA c9ab2c6a6c1c). Kept in step with the Terms
                  summary below and the onboarding dialog. */}
              <CcMessageStrip state="warning" headline="Disclaimer.">
                Findings, route and score come from a deterministic engine, without a language model. Summaries,
                designs, generated code, documentation and tests are written by a language model where you use those
                steps, and may contain errors. Both are drafts, not a guarantee: have qualified architects verify them
                before deployment. Liability: Terms, section 4.
              </CcMessageStrip>

              {authError && <CcMessageStrip state="error">{authError}</CcMessageStrip>}

              <div className="flex flex-col">
                <CcButton
                  type="submit"
                  variant="primary"
                  density="cozy"
                  disabled={isSubmitting || (!!confirmPassword && password !== confirmPassword) || !agreedGDPR || !agreedTerms}
                >
                  {isSubmitting ? 'Registering...' : 'Register'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
              </div>

              <OrContinueWith />

              <div className="flex flex-col gap-2">
                <CcButton
                  variant="ghost"
                  density="cozy"
                  onClick={handleSignIn}
                  disabled={!agreedGDPR || !agreedTerms}
                  icon={<GoogleMark />}
                >
                  Google Account
                </CcButton>
                {(!agreedGDPR || !agreedTerms) && (
                  <p className="m-0 text-center text-[12px] font-medium text-cc-ink-muted">
                    Accept the data protection notice and the terms above to continue with Google.
                  </p>
                )}
              </div>
            </div>
          </form>
        ) : (
          /* Sign In Screen (Default) */
          <form onSubmit={handleEmailSignIn}>
            {/* Incident notice — self-expiring, see components/MaintenanceNotice.tsx */}
            <MaintenanceNotice />
            <div className="mb-5 flex items-center justify-between gap-3 rounded-cc-card border border-cc-line bg-cc-brand-surface p-4">
              <div>
                <p className="m-0 mb-1 cc-text-label text-cc-ink-muted">New to Clean-Core.io?</p>
                <p className="m-0 cc-text-cell text-cc-ink">Join our free community program</p>
              </div>
              <CcButton
                variant="secondary"
                onClick={() => { setAuthMode('signup'); setAuthError(''); updateQueryParams('auth', 'signup'); }}
              >
                Create Account
              </CcButton>
            </div>

            <div className="space-y-4">
              <CcField label="Email Address" required>
                {(c) => (
                  <div className="relative">
                    <Mail size={16} aria-hidden={true} className={FIELD_ICON} />
                    <input
                      id={c.id}
                      type="email"
                      required={c.required}
                      aria-required={c.ariaRequired}
                      aria-describedby={c.describedBy}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className={cn(c.className, FIELD_WITH_ICON)}
                    />
                  </div>
                )}
              </CcField>

              <div>
                <CcField label="Password" required>
                  {(c) => (
                    <div className="relative">
                      <Lock size={16} aria-hidden={true} className={FIELD_ICON} />
                      <input
                        id={c.id}
                        type={showPassword ? 'text' : 'password'}
                        required={c.required}
                        aria-required={c.ariaRequired}
                        aria-describedby={c.describedBy}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={cn(c.className, FIELD_WITH_ICON, 'pr-12')}
                      />
                      <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                  )}
                </CcField>
                <p className="m-0 mt-1 text-right">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setAuthError(''); updateQueryParams('auth', 'forgot'); }}
                    className={cn(INLINE_LINK, 'text-[12px]')}
                  >
                    Forgot Password?
                  </button>
                </p>
              </div>

              {authError && <CcMessageStrip state="error">{authError}</CcMessageStrip>}

              <div className="flex flex-col">
                <CcButton type="submit" variant="primary" density="cozy" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing In...' : 'Sign In'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
              </div>

              <OrContinueWith />

              <div className="flex flex-col">
                <CcButton variant="ghost" density="cozy" onClick={handleSignIn} icon={<GoogleMark />}>
                  Google Account
                </CcButton>
              </div>

              <p className="m-0 text-center text-[12px] font-medium leading-relaxed text-cc-ink-muted">
                By signing in, you agree to our{' '}
                <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>Privacy Policy</a>{' '}
                and{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>Terms</a>.
              </p>
            </div>
          </form>
        )}
      </CcDialog>

      {/* Legal Overlays */}
      <LegalOverlay isOpen={legalParam === 'impressum'} onClose={() => updateQueryParams('legal', null)} title="Legal Notice (Impressum)">
        <div className="space-y-6 text-cc-ink">
          <div>
            <h3 className={LEGAL_H3}>Information according to § 5 TMG</h3>
            <p className="text-sm leading-relaxed">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>Contact</h3>
            <p className="text-sm leading-relaxed">
              Phone: +49 151 59200157<br />
              E-Mail: info@clean-core.io<br />
              Website: www.clean-core.io
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>Responsible for Content under § 18 Abs. 2 MStV</h3>
            <p className="text-sm leading-relaxed">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </div>

          <div className="border-t border-cc-line pt-4">
            <h3 className={LEGAL_H3}>Disclaimer</h3>
            <p className="mb-3 text-xs leading-normal text-cc-ink-muted">
              <strong>Liability for Content:</strong> The contents of our pages were created with the greatest care. Since this is a free community application using generative AI (Free Community Edition), we cannot assume any guarantee for the accuracy, completeness, error-free code transformation, or continuous availability of the provided modernization results.
            </p>
            <p className="text-xs leading-normal text-cc-ink-muted">
              <strong>Copyright:</strong> The content and works created by the site operator on these pages are subject to German copyright law. Contributions from third parties are marked as such. Reproduction, editing, and distribution require written consent.
            </p>
          </div>

          <CcMessageStrip state="warning">
            Important Note: Clean-Core.io is a free community tool for assessing and modernizing legacy SAP code. Generated outputs are drafts and must be reviewed, tested and approved by qualified architects before any productive use.
          </CcMessageStrip>

          <div className="border-t border-cc-line pt-4 text-center font-cc-mono text-[12px] font-semibold text-cc-ink-muted">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </LegalOverlay>

      <LegalOverlay isOpen={legalParam === 'privacy'} onClose={() => updateQueryParams('legal', null)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-cc-ink">
          <div>
            <h3 className={LEGAL_H3}>1. Privacy at a Glance</h3>
            <p className="text-sm leading-relaxed mb-2">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our platform program.
            </p>
            <p className="text-xs text-cc-ink-muted">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>2. Data Collection & Processing Purposes</h3>
            <p className="text-sm leading-relaxed mb-3">
              We process personal data of our users only as far as necessary to provide a functional community platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-cc-ink-muted">
              <li>
                <strong>Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges.
              </li>
              <li>
                <strong>Email and password (Firebase Auth):</strong> You can also register with an email address and a password instead of using Google. In that case we process the email address and the first and last name you enter. The password itself is handled by Firebase Authentication and is never visible to us.
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
            <h3 className={LEGAL_H3}>3. Processing of Source Code & Project Assets</h3>
            <p className="text-sm leading-relaxed">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <p className="text-xs text-cc-ink-muted mt-2">
              <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong> using stateless API requests. Under Google's applicable API data-use terms, this content is not used to train Google's foundational AI models. When you use your own key (BYOK), the terms of your own Google account additionally apply.
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>4. Cloud Node Hosting & Third-Party Services</h3>
            <p className="text-sm leading-relaxed">
              To provide this service, we rely on the following trusted cloud services:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-cc-ink-muted">
              <li>
                <strong>Google Cloud Platform & Firebase:</strong> Hosting (Cloud Run) and database (Firestore) on European servers in the <strong>Belgium (europe-west1)</strong> region — data residency in the EU, operated in line with GDPR requirements. The sign-in, Firebase Authentication, is a Google service not tied to a region and is covered by the international-transfer safeguards in the full privacy policy.
              </li>
              <li>
                <strong>Google Gemini API:</strong> Generative AI models used exclusively for code transformation, utilizing secure stateless proxy layers.
              </li>
            </ul>
          </div>

          <div>
            <h3 className={LEGAL_H3}>5. Your Rights Under GDPR (including Art. 17 Deletion)</h3>
            <p className="text-sm leading-relaxed mb-2">
              Since our platform is hosted in compliance with EU regulations, you have all rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-cc-ink-muted">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / "Right to be Forgotten" (Art. 17 GDPR)</li>
              <li>Right to Restriction of Processing (Art. 18 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="text-xs text-cc-ink-muted mt-2">
              To exercise these rights, particularly to erase your data, you can trigger account deletion directly in your Profile Settings under the <strong>Danger Zone</strong>, which immediately deletes your live database and authentication entries, including every project and the source code in it. Residual copies in encrypted backups age out within 30 days, and the record of administrative actions on an account is kept for 24 months; the full privacy policy at clean-core.io/datenschutz says what else deletion does not reach. Alternatively, contact us at <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Signup-specific GDPR overlay */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-cc-ink">
          <div>
            <h3 className={LEGAL_H3}>1. Privacy at a Glance</h3>
            <p className="text-sm leading-relaxed mb-2">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our platform program.
            </p>
            <p className="text-xs text-cc-ink-muted">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>2. Data Collection & Processing</h3>
            <ul className="list-disc pl-5 space-y-2 text-xs text-cc-ink-muted">
              <li><strong>Google Authentication (Firebase Auth):</strong> Your name, email, and profile picture are used to authenticate your session.</li>
              <li><strong>Email and password (Firebase Auth):</strong> If you register with an email address instead, we process that address and the name you enter; the password is handled by Firebase Authentication and is never visible to us.</li>
              <li><strong>Firestore User Profiles:</strong> We store metadata about your usage (transformation count, system limits, name) in our secure database.</li>
              <li><strong>BYOK (Bring Your Own Key):</strong> If configured, your Gemini API key is AES-256-GCM encrypted and never exposed to the browser.</li>
            </ul>
          </div>

          <div>
            <h3 className={LEGAL_H3}>3. Source Code Processing</h3>
            <p className="text-sm leading-relaxed">
              Uploaded ABAP files and generated artifacts are stored in Google Firebase (Europe). For AI-driven modernization, source code is transmitted over encrypted channels to the Google Gemini API. We do not retain it outside your project, and we do not use it to train models; Google&apos;s handling of API data is governed by their applicable API terms.
            </p>
          </div>

          <div>
            <h3 className={LEGAL_H3}>4. Your GDPR Rights</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-cc-ink-muted">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / &quot;Right to be Forgotten&quot; (Art. 17 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="text-xs text-cc-ink-muted mt-2">
              To exercise these rights, use account deletion in Profile Settings or contact <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Signup-specific Terms overlay */}
      <LegalOverlay isOpen={showTermsOverlay} onClose={() => setShowTermsOverlay(false)} title="Terms of Service & Guidelines">
        <div className="space-y-6 text-cc-ink">
          <CcMessageStrip state="information">
            <a href="/terms" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
              This is a short summary. Read the full, authoritative Terms of Service &amp; Community Guidelines at clean-core.io/terms ↗
            </a>
          </CcMessageStrip>
          <div>
            <h3 className={LEGAL_H3}>1. Scope and Purpose</h3>
            <p className="text-sm leading-relaxed">
              This Clean-Core.io free community program is designed solely for research and evaluation purposes in the domain of automated code modernization (ABAP to Cloud-Native). By participating, you help shape and improve this community utility.
            </p>
          </div>
          <div>
            <h3 className={LEGAL_H3}>2. Free Community Edition Usage</h3>
            <CcMessageStrip state="warning">
              Platform access is completely free of charge. Clean-Core.io is a non-commercial community project provided for research and evaluation purposes. Generated code and evidence are drafts — review, test and approve them with qualified architects before any productive use.
            </CcMessageStrip>
          </div>
          <div>
            <h3 className={LEGAL_H3}>3. What is computed, and what is generated</h3>
            <p className="text-sm leading-relaxed">
              The findings, the route, the Clean Core Score, the clean core levels and the process reconstructed from your code are computed by a deterministic engine, without a language model. They are evidence, not a guarantee. Summaries, the solution design, generated code, documentation and test suites are written by a language model where you use those steps. All of it is a draft and must be verified by qualified software architects before deployment. Liability is set out in section 4 of the Terms.
            </p>
          </div>
          <div>
            <h3 className={LEGAL_H3}>4. Code of Conduct</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-cc-ink-muted">
              <li>Do not upload malicious software, illegal scripts, or IP-violating source code.</li>
              <li>Maintain a respectful, professional tone in community spaces.</li>
              <li>Report system issues to help refine the engine.</li>
            </ul>
          </div>
        </div>
      </LegalOverlay>
    </>
  );
}
