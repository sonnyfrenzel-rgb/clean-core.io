'use client';

import { useState, useEffect, useRef, FormEvent, KeyboardEvent, ClipboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  signInWithPopup,
  getRedirectResult,
  browserPopupRedirectResolver,
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
} from 'firebase/auth';
// Auth only at the top: Firestore and the profile module are loaded by the one
// handler that writes to Firestore — registration — so the start page does not
// download the Firestore SDK for every visitor (docs/perf/REPORT.md).
//
// `getAuth()` is called where Auth is used — a submit, the session check of an
// open sign-in step, a pending redirect — and never on render: initialising
// Auth contacts Google on mobile browsers and Safari, and this component also
// serves the legal dialogs (`?legal=`), which must not do that (privacy policy
// section 7; lib/auth-hint.ts).
import { getAuth } from '@/lib/firebase-app';
import { clearRedirectPending, isRedirectPending } from '@/lib/auth-hint';
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
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import MaintenanceNotice from '@/components/MaintenanceNotice';
import { safeReturnPath } from '@/lib/return-path';
import { classifyMfaPaste } from '@/lib/mfa-paste';
import { cn } from '@/lib/utils';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcCheckbox from '@/components/cc/Checkbox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import dynamic from 'next/dynamic';
import { PrivacyConsentLabel, TermsConsentLabel, signupNoticeAbove, signupNoticeBelow } from '@/components/legal/SignupConsent';

/** The full legal texts, fetched when a dialog opens (`components/legal/LegalOverlayBody.tsx`). */
const LegalOverlayBody = dynamic(() => import('@/components/legal/LegalOverlayBody'), {
  ssr: false,
  loading: () => <p className="m-0 text-sm text-cc-ink-muted">Loading the text&hellip;</p>,
});

type AuthMode = 'signin' | 'signup' | 'forgot' | 'mfa' | 'success';

/** The dialog's title per step: the heading each screen used to draw itself. */
const AUTH_TITLE: Record<AuthMode, string> = {
  // Every signed-out call to action opens this step, for a returning account
  // and a new reader alike: a neutral title, not "Welcome Back" (roadmap 3.0.21
  // (15)). Sentence case throughout the dialog.
  signin: 'Sign in or create a free account',
  signup: 'Create a free account',
  forgot: 'Reset password',
  success: 'Check your inbox',
  mfa: 'Two-factor authentication',
};

/**
 * Said on the sign-in screen when the page was loaded fresh on the second-factor
 * step. The pending sign-in lives only in this page's memory (Firebase's
 * `MultiFactorResolver`), so a reload, a phone discarding the tab while the
 * reader fetched the code from the authenticator app, or a switch to a new
 * build loses it. Without this the dialog quietly fell back to "Welcome Back"
 * and the reader had to guess why their sign-in had not counted.
 */
const MFA_INTERRUPTED =
  'The page reloaded while it was waiting for your authenticator code, so that sign-in was not completed. Sign in again; the code is asked for straight after.';

/** What a failed Google sign-in says. Every outcome has words; none returns silently. */
function googleSignInMessage(code: string, message?: string): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups for clean-core.io and try again.';
    case 'auth/popup-closed-by-user':
      return 'The Google window was closed before the sign-in finished. Nothing was changed; choose Google Account to start again.';
    case 'auth/cancelled-popup-request':
      return 'A second Google window replaced the first one, so the first sign-in was dropped. Choose Google Account once and finish in the window that opens.';
    case 'auth/network-request-failed':
      return 'The sign-in could not reach Google. Check your connection and choose Google Account again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Write to info@clean-core.io if you think this is a mistake.';
    default:
      return `Google Sign-In failed (${code || message || 'unknown'}). Please try Email/Password sign-in or contact support.`;
  }
}

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

/** Under the Google button while its window is open: where the sign-in continues. */
function GooglePendingHint() {
  return (
    <p data-google-pending="" role="status" className="m-0 text-center text-[12px] font-medium text-cc-ink-muted">
      Continue in the Google window. If you closed it, the button is ready again shortly.
    </p>
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
  // The registration failed because the address has an account: the error then offers the two ways on.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
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
  const [mfaResolver, setMfaResolverState] = useState<MultiFactorResolver | null>(null);
  // The same resolver, readable from an effect without waiting for a render.
  const mfaResolverRef = useRef<MultiFactorResolver | null>(null);
  const setMfaResolver = (resolver: MultiFactorResolver | null) => {
    mfaResolverRef.current = resolver;
    setMfaResolverState(resolver);
  };

  // A notice that is not an error: why the reader is back on this screen.
  const [authNotice, setAuthNotice] = useState('');

  // One Google window at a time. A second `signInWithPopup` cancels the first,
  // and while the first window is still opening Firebase cannot close it: it
  // stays on screen, orphaned. Signing in there completes at Google and is then
  // ignored here, with no error — the "it only worked the second time" the owner
  // reported (04.10.2026). A ref, not state: the second click of a double click
  // arrives before React has re-rendered the button as busy.
  const googleInFlight = useRef(false);
  const [googlePending, setGooglePending] = useState(false);

  // Declared above everything that calls it: an arrow function hoists no value,
  // so a caller declared earlier would read it out of the temporal dead zone.
  const updateQueryParams = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/?${params.toString()}`);
  };

  /** Routes a sign-in error into the second-factor screen when that is what it is. */
  const interceptSecondFactor = (error: unknown): boolean => {
    const code = (error as { code?: string } | null)?.code;
    if (code !== 'auth/multi-factor-auth-required') return false;
    const auth = getAuth();
    setMfaResolver(getMultiFactorResolver(auth, error as Parameters<typeof getMultiFactorResolver>[1]));
    setMfaCode(['', '', '', '', '', '']);
    setAuthError('');
    setAuthNotice('');
    setAuthMode('mfa');
    updateQueryParams('auth', 'mfa');
    return true;
  };

  // Sync auth mode with search param
  useEffect(() => {
    if (authParam === 'signin' || authParam === 'signup' || authParam === 'forgot') {
      setAuthMode(authParam);
    } else if (authParam === 'mfa' && !mfaResolverRef.current) {
      // `?auth=mfa` with no pending sign-in in memory: this page was loaded
      // fresh on the second-factor step (see MFA_INTERRUPTED). Say so, and put
      // the address back on the step the reader is actually on.
      setAuthMode('signin');
      setAuthNotice(MFA_INTERRUPTED);
      updateQueryParams('auth', 'signin');
    }
    // `updateQueryParams` is recreated every render; the step is what this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authParam]);

  // A page load that finds a session already in place while the address still
  // asks for the sign-in — the page reloaded after Google or the second factor
  // had finished but before it moved on (a reload, a discarded tab, a switch to
  // a new build). Asking again would read as a failed first attempt; the
  // sign-in has happened, so go where it was going. When the sign-in step
  // opens: a sign-in made in this dialog navigates on its own. Only then is
  // Auth initialised — a legal dialog alone does not ask Firebase. This is
  // also the way on for a returning reader whose browser holds a session but
  // not yet the signed-in hint (lib/auth-hint.ts): the header offered "Get
  // Free Access", the click opened this step, and the session is found here.
  const signInStepOpen = authParam === 'signin' || authParam === 'mfa';

  // Auth is initialised as soon as the access dialog is open, on any step, and
  // not first on the click: on mobile browsers and Safari `signInWithPopup`
  // has to wait for Google's sign-in frame before it may open the window, and
  // a window opened after that wait is no longer the click's own and gets
  // blocked. Initialising here gives the frame the time the reader spends in
  // the dialog — the same head start the always-mounted dialog used to have.
  const authDialogOpen = Boolean(authParam);
  useEffect(() => {
    if (authDialogOpen) getAuth();
  }, [authDialogOpen]);
  useEffect(() => {
    if (!signInStepOpen) return;
    const auth = getAuth();
    if (!auth) return;
    let cancelled = false;
    void auth.authStateReady().then(() => {
      if (cancelled || !auth.currentUser) return;
      const step = new URLSearchParams(window.location.search).get('auth');
      if (step !== 'signin' && step !== 'mfa') return;
      setIsNavigating(true);
      router.replace(afterSignIn);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signInStepOpen]);

  // Finish a Google redirect sign-in — only when one left this tab
  // (`markRedirectPending()` runs right before `signInWithRedirect`,
  // lib/auth-hint.ts). Asking on every visit initialised Auth for every
  // visitor of the start page, which contacts Google on mobile browsers and
  // Safari (privacy policy section 7). The mark is removed once Firebase has
  // answered, with a result or an error.
  const redirectChecked = useRef(false);
  useEffect(() => {
    if (redirectChecked.current || !isRedirectPending()) return;
    redirectChecked.current = true;
    const auth = getAuth();
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
        console.error('[getRedirectResult] Error:', err?.code);
        // A redirect that came back with an error used to end in the console
        // only, with the reader looking at an unchanged sign-in screen.
        setAuthError(googleSignInMessage(err?.code || '', err?.message));
      })
      .finally(clearRedirectPending);
  }, [router, afterSignIn]);

  const closeAuthModal = async () => {
    setMfaResolver(null);
    setAuthError('');
    setAuthNotice('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setMfaCode(['', '', '', '', '', '']);
    updateQueryParams('auth', null);
  };

  const handleSignIn = async () => {
    if (googleInFlight.current) return;
    googleInFlight.current = true;
    setGooglePending(true);
    setAuthError('');
    setAuthNotice('');
    let signedIn = false;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(getAuth(), provider, browserPopupRedirectResolver);
      signedIn = true;

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
      console.error('[handleSignIn] Google popup error code:', code);
      // A closed window is the reader's own choice, so it is a notice rather
      // than an error — but it is said. Both it and a superseded window used to
      // return in silence, which looked exactly like a sign-in that had failed.
      if (code === 'auth/popup-closed-by-user') {
        setAuthNotice(googleSignInMessage(code));
      } else {
        setAuthError(googleSignInMessage(code, error?.message));
      }
    } finally {
      // Free for the next attempt — unless this one is on its way in.
      if (!signedIn) {
        googleInFlight.current = false;
        setGooglePending(false);
      }
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setIsSubmitting(true);
    try {
      // On an enrolled account this throws before any session exists and the
      // catch below turns it into the second-factor screen.
      await signInWithEmailAndPassword(getAuth(), email, password);

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
      // Loaded before the account is created, so a chunk that fails to load
      // ends here with nothing created rather than with an account that has
      // no profile. `webpackExports` names what is used: a namespace import
      // would otherwise keep every export of the Firestore SDK alive in every
      // other chunk that shares it.
      const [{ doc, setDoc, serverTimestamp }, { getDb }, { finishRegistration }] = await Promise.all([
        import(/* webpackExports: ["doc", "setDoc", "serverTimestamp"] */ 'firebase/firestore'),
        import(/* webpackExports: ["getDb"] */ '@/lib/firebase'),
        import(/* webpackExports: ["finishRegistration"] */ '@/hooks/useUserProfile'),
      ]);
      const userCredential = await createUserWithEmailAndPassword(getAuth(), email, password);
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
      // call again, so a lost write here is repaired there.
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
      setAlreadyRegistered(error.code === 'auth/email-already-in-use');
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'This email address is already registered. Sign in with it, or reset its password if you no longer know it.';
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
      await sendPasswordResetEmail(getAuth(), email);
      setAuthMode('success');
      setIsSubmitting(false);
    } catch (error: any) {
      // An unknown address ends exactly like a sent reset: telling the two
      // apart would let anyone test which addresses have an account.
      if (error.code === 'auth/user-not-found') {
        setAuthMode('success');
        setIsSubmitting(false);
        return;
      }
      console.error('Reset error:', error);
      let errorMsg = 'Error sending password reset email.';
      if (error.code === 'auth/invalid-email') {
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

  // An old `CC-XXXX-YYYY` code is told that it no longer exists; see lib/mfa-paste.ts.
  const handleMfaPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = classifyMfaPaste(e.clipboardData.getData('text'));
    if (paste.kind === 'old-recovery-code') {
      setAuthError(paste.message);
      return;
    }
    if (paste.kind === 'totp') {
      setMfaCode(paste.code.split(''));
      handleVerifyMfa(paste.code);
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
                  Back to sign in
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
                  {isSubmitting ? 'Sending…' : 'Send reset link'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
                <CcButton
                  variant="ghost"
                  density="cozy"
                  onClick={() => { setAuthMode('signin'); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                  icon={<ArrowLeft size={16} aria-hidden={true} />}
                >
                  Back to sign in
                </CcButton>
              </div>
            </div>
          </form>
        ) : authMode === 'success' ? (
          /* Reset Password Success Screen */
          <div className="text-center">
            <DialogMark icon={CheckCircle2} centered />
            <p className="mb-5 cc-text-body text-cc-ink-muted">
              If an account exists for <span className="font-semibold text-cc-ink">{email}</span>, we've sent it a password reset link. Please click the link in that email to reset your credentials.
            </p>

            <div className="flex flex-col">
              <CcButton
                variant="primary"
                density="cozy"
                onClick={() => { setAuthMode('signin'); setEmail(''); setAuthError(''); updateQueryParams('auth', 'signin'); }}
              >
                Back to sign in
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
                onClick={() => { setAuthMode('signin'); setAuthError(''); setAlreadyRegistered(false); updateQueryParams('auth', 'signin'); }}
                className={INLINE_LINK}
              >
                Sign in
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

              {/* Legal consent (required for registration) — C1 of the legal texts,
                  Fassung 1.1, the same words as the onboarding dialog. */}
              <div className="space-y-2 border-t border-cc-line pt-3">
                <p className="m-0 text-xs leading-relaxed text-cc-ink-muted" data-signup-notice="above">{signupNoticeAbove()}</p>
                <CcCheckbox
                  checked={agreedGDPR}
                  onChange={setAgreedGDPR}
                  required
                  label={<PrivacyConsentLabel onOpen={() => setShowDatenschutz(true)} linkClassName={INLINE_LINK} />}
                />
                <CcCheckbox
                  checked={agreedTerms}
                  onChange={setAgreedTerms}
                  required
                  label={<TermsConsentLabel onOpen={() => setShowTermsOverlay(true)} linkClassName={INLINE_LINK} />}
                />
                <p className="m-0 text-xs leading-relaxed text-cc-ink-muted" data-signup-notice="below">{signupNoticeBelow(email.trim() || null)}</p>
              </div>

              {/* The disclaimer states the fact and drops the label (§3.1 has no
                  "powered by Generative AI" and no symbol for it). The fact is
                  the one section 4.1 of Terms v2.3.0 states: findings,
                  route and score are the deterministic engine's, and only the
                  model steps are written by a language model — which an account
                  can switch off. Kept in step with the Terms
                  summary below and the onboarding dialog. */}
              <CcMessageStrip state="warning" headline="Disclaimer.">
                Findings, route and score come from a deterministic engine, without a language model. Summaries,
                designs, generated code, documentation and tests are written by a language model where you use those
                steps, and may contain errors. Both are drafts, not a guarantee: have qualified architects verify them
                before deployment. Liability: Terms, section 4.
              </CcMessageStrip>

              {authError && (
                <div data-auth-error={alreadyRegistered ? 'already-registered' : ''}>
                  <CcMessageStrip
                    state="error"
                    actions={
                      // The address has an account already: the two ways on, with the
                      // address carried over (roadmap 3.0.21 (15)) — not a dead end.
                      alreadyRegistered ? (
                        <>
                          <CcButton
                            variant="ghost"
                            onClick={() => { setAuthMode('signin'); setAuthError(''); setAlreadyRegistered(false); updateQueryParams('auth', 'signin'); }}
                            data-auth-signin-instead=""
                          >
                            Sign in instead
                          </CcButton>
                          <CcButton
                            variant="ghost"
                            onClick={() => { setAuthMode('forgot'); setAuthError(''); setAlreadyRegistered(false); updateQueryParams('auth', 'forgot'); }}
                            data-auth-reset-instead=""
                          >
                            Reset password
                          </CcButton>
                        </>
                      ) : undefined
                    }
                  >
                    {authError}
                  </CcMessageStrip>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <CcButton
                  type="submit"
                  variant="primary"
                  density="cozy"
                  disabled={isSubmitting || (!!confirmPassword && password !== confirmPassword) || !agreedGDPR || !agreedTerms}
                  aria-describedby={!agreedGDPR || !agreedTerms ? 'register-consent-hint' : undefined}
                >
                  {isSubmitting ? 'Registering...' : 'Register'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
                {/* The same reason the Google button gives, for the same gate (UX-079). */}
                {(!agreedGDPR || !agreedTerms) && (
                  <p id="register-consent-hint" data-register-consent-hint="" className="m-0 text-center text-[12px] font-medium text-cc-ink-muted">
                    Accept the data protection notice and the terms above to register.
                  </p>
                )}
              </div>

              <OrContinueWith />

              <div className="flex flex-col gap-2">
                <CcButton
                  variant="ghost"
                  density="cozy"
                  onClick={handleSignIn}
                  disabled={!agreedGDPR || !agreedTerms}
                  busy={googlePending}
                  icon={<GoogleMark />}
                  data-google-signin=""
                >
                  Google Account
                </CcButton>
                {googlePending && <GooglePendingHint />}
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
            <div className="mb-5 flex items-center justify-between gap-3 rounded-cc-card border-2 border-cc-brand-strong border-l-[6px] bg-cc-brand-surface p-4">
              <div>
                <p className="m-0 mb-1 cc-text-label text-cc-brand-strong">New to Clean-Core.io?</p>
                <p className="m-0 cc-text-cell font-semibold text-cc-ink">Join our free community program</p>
              </div>
              <CcButton
                variant="secondary"
                onClick={() => { setAuthMode('signup'); setAuthError(''); updateQueryParams('auth', 'signup'); }}
              >
                Create account
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
                    Forgot password?
                  </button>
                </p>
              </div>

              {authNotice && (
                <div data-auth-notice="">
                  <CcMessageStrip state="warning">{authNotice}</CcMessageStrip>
                </div>
              )}
              {authError && <CcMessageStrip state="error">{authError}</CcMessageStrip>}

              <div className="flex flex-col">
                <CcButton type="submit" variant="primary" density="cozy" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
              </div>

              <OrContinueWith />

              <div className="flex flex-col gap-2">
                <CcButton
                  variant="ghost"
                  density="cozy"
                  onClick={handleSignIn}
                  busy={googlePending}
                  icon={<GoogleMark />}
                  data-google-signin=""
                >
                  Google Account
                </CcButton>
                {googlePending && <GooglePendingHint />}
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
            <h3 className={LEGAL_H3}>Information according to § 5 DDG (Digitale-Dienste-Gesetz)</h3>
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
              <strong>Liability for Content:</strong> The contents of our pages were created with the greatest care. This is a free community application (Free Community Edition): a deterministic analysis engine reads the code, and a language model writes only drafts on top of it — such as the code proposal, the documentation and the test suite. We therefore cannot assume any guarantee for the accuracy, completeness, error-free code transformation, or continuous availability of the provided modernization results.
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

      <LegalOverlay isOpen={legalParam === 'privacy'} onClose={() => updateQueryParams('legal', null)} title="Privacy Policy">
        <LegalOverlayBody id="privacy" />
      </LegalOverlay>

      {/* The texts the sign-up consent links to, in full. */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy">
        <LegalOverlayBody id="privacy" />
      </LegalOverlay>

            <LegalOverlay isOpen={showTermsOverlay} onClose={() => setShowTermsOverlay(false)} title="Terms of Service & Community Guidelines">
        <LegalOverlayBody id="terms" />
      </LegalOverlay>
    </>
  );
}
