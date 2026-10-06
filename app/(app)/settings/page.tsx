'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useRouter } from 'next/navigation';
import {
  Zap,
  Clock, Edit2, CheckCircle2, AlertCircle,
  Send, Eye, EyeOff,
  Trash2, Loader2,
  Save, ShieldCheck, Key,
  ArrowLeft, Copy, Smartphone, X, ArrowRight, Globe,
  BookOpen, ExternalLink, HelpCircle
} from 'lucide-react';
import { addDoc, collection, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { getDb, getAuth, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  getMultiFactorResolver,
  multiFactor,
  sendEmailVerification,
  signOut,
  TotpMultiFactorGenerator,
  updatePassword as firebaseUpdatePassword,
  type TotpSecret,
  type User as FirebaseUser,
} from 'firebase/auth';
import ModelStagesCard from '@/components/ModelStagesCard';
import { byokAllowed } from '@/lib/byok-eligibility';
import CommunityMailCard from '@/components/CommunityMailCard';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcCheckbox from '@/components/cc/Checkbox';
import CcDialog from '@/components/cc/Dialog';
import CcField, { CC_CONTROL_HEIGHT, type CcValueState } from '@/components/cc/Field';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import CcToast from '@/components/cc/Toast';
import CcSkeleton from '@/components/cc/Skeleton';
import CcDateText from '@/components/cc/DateText';
import { STATE_CLASSES } from '@/components/cc/state';
import type { SemanticState } from '@/lib/provenance';
import { cn } from '@/lib/utils';

/** A quiet block inside a card — a note, an explanation, the strength meter. */
const INSET = 'rounded-cc-row border border-cc-line bg-cc-surface-muted p-4';
/** A link in running text. */
const TEXT_LINK = 'font-semibold text-cc-brand-strong underline underline-offset-2 hover:text-cc-brand-deep';

/**
 * A state in words with its dot — the shape of `CcObjectStatus` (§2.4, "Status
 * as text with a dot — never colour alone") for the account states this page has
 * and the object-status vocabulary does not: 2FA on or off, the own key, the
 * tenant request, the password strength.
 */
function StateWord({ state, children }: { state: SemanticState; children: React.ReactNode }) {
  const classes = STATE_CLASSES[state];
  return (
    <span className={cn('inline-flex items-center gap-2 cc-text-meta whitespace-nowrap', classes.text)}>
      <span aria-hidden={true} className={cn('inline-block size-2 shrink-0 rounded-full', classes.mark)} />
      {children}
    </span>
  );
}

/**
 * One text input of this page: `CcField` around a native `<input>`, and for a
 * secret the button that shows it. Declared outside the page so a re-render of
 * the page does not remount the input and lose the caret.
 */
function SettingsInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  help,
  valueState,
  message,
  mono = false,
  autoFocus = false,
  reveal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'url';
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  help?: React.ReactNode;
  valueState?: CcValueState;
  message?: React.ReactNode;
  mono?: boolean;
  autoFocus?: boolean;
  /** A secret with a show/hide button: its state and the button's name. */
  reveal?: { shown: boolean; onToggle: () => void; label: string };
}) {
  return (
    <CcField label={label} required={required} help={help} valueState={valueState} message={message}>
      {(control) => (
        <div className="relative">
          <input
            id={control.id}
            type={reveal ? (reveal.shown ? 'text' : 'password') : type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={control.required}
            aria-required={control.ariaRequired}
            aria-invalid={control.invalid || undefined}
            aria-describedby={control.describedBy}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            autoFocus={autoFocus}
            className={cn(control.className, CC_CONTROL_HEIGHT.compact, reveal && 'pr-10', mono && 'font-cc-mono tracking-wider')}
          />
          {reveal ? (
            <button
              type="button"
              onClick={reveal.onToggle}
              aria-label={reveal.label}
              aria-pressed={reveal.shown}
              className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-cc-row text-cc-ink-muted hover:text-cc-ink"
            >
              {reveal.shown ? <EyeOff size={16} aria-hidden={true} /> : <Eye size={16} aria-hidden={true} />}
            </button>
          ) : null}
        </div>
      )}
    </CcField>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { profile, loading, updateProfile } = useUserProfile();
  // Who may bring their own key: one list, shared with the routes that store and
  // test it (lib/byok-eligibility.ts, roadmap 3.0.13 c).
  const isPilotTier = byokAllowed(profile);
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Support ticket state
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSendingTicket, setIsSendingTicket] = useState(false);
  const [ticketStatus, setTicketStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Gemini API Key (BYOK) States
  const [geminiKey, setGeminiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validationError, setValidationError] = useState('');
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  // Replaces the browser's `confirm` before removing the key, and its `alert`s
  // after a refused save or removal (DESIGN.md §2.6).
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  // GDPR Account Deletion
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  // The three browser prompts of the erasure — address, authenticator code,
  // password — are fields of one message box now. The same checks run on the
  // same values, in the same order, before the same calls.
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteMfaCode, setDeleteMfaCode] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmailError, setDeleteEmailError] = useState('');
  const [deleteCodeError, setDeleteCodeError] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [accountErased, setAccountErased] = useState(false);

  // BYOT (Bring Your Own Tenant) States
  const [byotMotivation, setByotMotivation] = useState('');
  const [isRequestingByot, setIsRequestingByot] = useState(false);
  const [byotStatus, setByotStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [byotError, setByotError] = useState('');

  // Live Tenant Configuration States (for approved users)
  const [s4Url, setS4Url] = useState('');
  const [s4Username, setS4Username] = useState('');
  const [s4Password, setS4Password] = useState('');
  const [s4AuthType, setS4AuthType] = useState<'basic' | 'oauth2' | 'sap_hub' | 'btp_destination'>('basic');
  const [s4TokenUrl, setS4TokenUrl] = useState('');
  const [btpDestinationJson, setBtpDestinationJson] = useState('');
  const [showS4Password, setShowS4Password] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'failed'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // System Preferences States. `backupEnabled` and `landingPageDefault` are
  // no longer offered or written: nothing in the product read either of them
  // (see the comment at the card).
  const [desktopChatbotEnabled, setDesktopChatbotEnabled] = useState<boolean>(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  // Stable, so the toast's four-second timer is not restarted by every render.
  const dismissPrefsSaved = useCallback(() => setPrefsSaved(false), []);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pwChangeStatus, setPwChangeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pwChangeError, setPwChangeError] = useState('');
  // With a second factor enrolled, Firebase answers the re-authentication with
  // auth/multi-factor-auth-required; the code resolves it (QA 5f599cbcc567).
  const [pwChangeMfaCode, setPwChangeMfaCode] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // 2FA Setup States — the factor is Firebase's own TOTP multi-factor
  // (roadmap 0.13): the secret is generated by and enrolled with Firebase Auth
  // from this browser; the server only takes note afterwards (/api/mfa/enrolled).
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSetupStep, setMfaSetupStep] = useState<1 | 2 | 3>(1);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [tempMfaSecret, setTempMfaSecret] = useState('');
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaSetupError, setMfaSetupError] = useState('');
  // What used to be a browser `alert` when the setup could not even start.
  const [mfaStartError, setMfaStartError] = useState('');
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  /**
   * What the last copy in the second-factor setup actually did.
   *
   * It used to say "copied to clipboard!" in a browser alert without waiting
   * for the write to resolve — so a clipboard the browser refused (an insecure
   * context, a denied permission) still reported success, and the person went
   * on to paste nothing (UX review of 52f171091948, 1b363262f915).
   */
  // Which copy failed is kept: the recovery for the link is not the recovery
  // for the key (carried QA finding 91cf1930b78a).
  const [mfaCopied, setMfaCopied] = useState<'idle' | 'secret' | 'link' | 'failed-secret' | 'failed-link'>('idle');
  const copyMfa = async (what: 'secret' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMfaCopied(what);
    } catch {
      setMfaCopied(what === 'secret' ? 'failed-secret' : 'failed-link');
    }
  };
  const [verificationMailSent, setVerificationMailSent] = useState(false);
  // What Firebase Auth says, as opposed to the profile flag: an account whose
  // flag predates Firebase's factor shows "set up again", not "enabled".
  const [enrolledFactorCount, setEnrolledFactorCount] = useState<number | null>(null);

  // 2FA Disable States
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [mfaDisableError, setMfaDisableError] = useState('');

  const reconciledRef = useRef(false);
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    const count = multiFactor(user).enrolledFactors.length;
    setEnrolledFactorCount(count);
    // A factor Firebase knows and the profile does not: the setup enrolled it
    // and the server's record of it failed. Recording is idempotent and needs
    // no recency, so it is simply done again here (QA 9cba6508b10b).
    if (count > 0 && profile && profile.mfaEnabled !== true && !reconciledRef.current) {
      reconciledRef.current = true;
      user.getIdToken().then((token) =>
        fetch('/api/mfa/enrolled', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }),
      ).catch((err) => console.error('[settings] could not record the enrolled factor:', err));
    }
  }, [profile, showMfaSetup, showMfaDisable]);

  /**
   * Re-authenticates the signed-in user the way their account signs in, and
   * resolves the second factor when Firebase asks for it. Firebase's step-up
   * is a fresh sign-in: the token that comes back carries a new auth_time and
   * the factor, which is what the server checks for the sensitive routes.
   */
  const reauthenticateWithFactor = async (user: FirebaseUser, password: string, code: string): Promise<void> => {
    try {
      if (profile?.authMethod === 'password' && user.email) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      } else {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }
    } catch (error: any) {
      if (error?.code !== 'auth/multi-factor-auth-required') throw error;
      if (code.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');
      const resolver = getMultiFactorResolver(getAuth(), error);
      const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ?? resolver.hints[0];
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
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
    
    // The strength is a state, so it takes a state colour — and always its
    // word next to it, never the colour alone (DESIGN.md §1.1, §2.4).
    let label = 'Weak';
    let state: SemanticState = 'error';
    if (score === 2) {
      label = 'Fair';
      state = 'warning';
    } else if (score === 3) {
      label = 'Good';
      state = 'information';
    } else if (score === 4) {
      label = 'Strong';
      state = 'success';
    }

    return { score, label, state, feedback };
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwChangeError('');
    setPwChangeStatus('idle');
    
    if (newPassword !== confirmNewPassword) {
      setPwChangeError('New passwords do not match.');
      setPwChangeStatus('error');
      return;
    }

    const strength = getPasswordStrength(newPassword);
    if (strength.score < 2) {
      setPwChangeError('New password is too weak. Must satisfy at least two guidelines.');
      setPwChangeStatus('error');
      return;
    }

    setIsChangingPassword(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user.');
      }

      // Re-authenticate user first — through the factor when one is enrolled.
      await reauthenticateWithFactor(currentUser, currentPassword, pwChangeMfaCode.replace(/\s+/g, ''));

      // Update password
      await firebaseUpdatePassword(currentUser, newPassword);

      setPwChangeStatus('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPwChangeMfaCode('');
      setTimeout(() => setPwChangeStatus('idle'), 4000);
    } catch (error: any) {
      console.error('Password change error:', error);
      let errorMsg = 'Failed to change password. Please verify your current password.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect current password.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'The new password is too weak.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMsg = 'Security timeout. Please sign out, sign back in, and try again.';
      } else if (error.code === 'auth/invalid-verification-code') {
        errorMsg = 'The authenticator code is not correct. Enter the current 6-digit code.';
      } else if (!error.code && typeof error.message === 'string' && error.message.startsWith('Enter the 6-digit code')) {
        errorMsg = error.message;
      }
      setPwChangeError(errorMsg);
      setPwChangeStatus('error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setMfaSetupError('');
    setMfaStartError('');
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('No user found.');
      // Firebase refuses a second factor on an unverified address: a stranger
      // could otherwise register someone else's address and lock them out.
      // Google accounts arrive verified; a password account verifies once.
      await user.reload();
      if (!user.emailVerified) {
        setMfaSetupError('Verify your e-mail address first — use the button below, open the link in the mail, then reload this page.');
        setTotpSecret(null);
        setShowMfaSetup(true);
        setMfaSetupStep(1);
        return;
      }
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setTempMfaSecret(secret.secretKey);
      setQrCodeUrl(secret.generateQrCodeUrl(user.email || profile?.email || 'account', 'Clean-Core.io'));
      setMfaSetupStep(1);
      setMfaVerifyCode('');
      setShowMfaSetup(true);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/requires-recent-login') {
        setMfaStartError('For your security, sign out and sign in again, then start the setup.');
        return;
      }
      if (code === 'auth/unverified-email') {
        setMfaSetupError('Verify your e-mail address first — use the button below, open the link in the mail, then reload this page.');
        setTotpSecret(null);
        setShowMfaSetup(true);
        setMfaSetupStep(1);
        return;
      }
      setMfaStartError(err?.message || 'Error starting 2FA setup.');
    }
  };

  const handleSendVerificationMail = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setVerificationMailSent(true);
    } catch (err: any) {
      setMfaSetupError(err?.message || 'Could not send the verification mail.');
    }
  };

  const handleVerifyMfaSetup = async () => {
    setMfaSetupError('');
    setIsVerifyingMfa(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user || !totpSecret) throw new Error('The setup has expired. Close this dialog and start again.');
      // Enrolment happens against Firebase Auth; the code proves the app holds the secret.
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, mfaVerifyCode), 'Authenticator app');
      // The server takes note — and checks with Firebase Auth that the factor is there.
      const token = await user.getIdToken(true);
      const res = await fetch('/api/mfa/enrolled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'The factor was enrolled, but the server could not record it. Reload and check the status.');
      }
      setTotpSecret(null);
      setMfaSetupStep(3);
    } catch (err: any) {
      console.error(err);
      const code = err?.code || '';
      setMfaSetupError(
        code === 'auth/invalid-verification-code'
          ? 'That code is not valid. Enter the current 6-digit code from your authenticator app.'
          : code === 'auth/requires-recent-login'
            ? 'For your security, sign out and sign in again, then start the setup.'
            : err?.message || 'Error validating code.',
      );
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  // The over-strict state: the profile requires a factor Firebase Auth does not
  // have (a removal whose second write failed, or the retired application-level
  // TOTP). The server clears it without a code, because there is no factor a
  // stolen first-factor token could remove.
  const [strandedError, setStrandedError] = useState('');
  const [isClearingStranded, setIsClearingStranded] = useState(false);
  const handleTurnOffStranded = async () => {
    setStrandedError('');
    setIsClearingStranded(true);
    try {
      const currentUser = getAuth().currentUser;
      if (!currentUser) throw new Error('No user found.');
      const token = await currentUser.getIdToken(true);
      const res = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Could not turn off two-factor authentication.');
      }
    } catch (error: unknown) {
      setStrandedError(error instanceof Error ? error.message : 'Could not turn off two-factor authentication.');
    } finally {
      setIsClearingStranded(false);
    }
  };

  const closeMfaDisable = () => {
    setShowMfaDisable(false);
    setDisablePassword('');
    setMfaDisableCode('');
    setMfaDisableError('');
  };

  const handleDisableMfa = async () => {
    // The message box's binding button cannot be disabled the way the old
    // "Confirm Disable" was, so the same three conditions refuse here: a
    // removal already running, a code that is not six digits, and — for a
    // password account — no password.
    if (isDisablingMfa) return;
    if (mfaDisableCode.length !== 6) {
      setMfaDisableError('Enter the current 6-digit code from your authenticator app.');
      return;
    }
    if (profile?.authMethod === 'password' && !disablePassword) {
      setMfaDisableError('Enter your account password to confirm.');
      return;
    }
    setMfaDisableError('');
    setIsDisablingMfa(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('No user found.');

      // A fresh sign-in with the factor: the server accepts the removal only
      // from a token that is recent and carries the second factor.
      await reauthenticateWithFactor(currentUser, disablePassword, mfaDisableCode);
      const token = await currentUser.getIdToken(true);
      const res = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to disable 2FA.');
      }
      setShowMfaDisable(false);
      setDisablePassword('');
      setMfaDisableCode('');
    } catch (error: any) {
      console.error('Disable 2FA error:', error?.code || error?.message);
      const code = error?.code || '';
      setMfaDisableError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Incorrect password.'
          : code === 'auth/invalid-verification-code'
            ? 'That code is not valid. Enter the current 6-digit code from your authenticator app.'
            : error?.message || 'Failed to disable 2FA.',
      );
    } finally {
      setIsDisablingMfa(false);
    }
  };

  // Sync state with profile once loaded  // Sync state with profile once loaded
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      // Off unless saved as on (D.8, Sonny 30.09.2026): on desktop the header
      // carries the assistant, so the floating button is an opt-in. A stored
      // `true` keeps it.
      setDesktopChatbotEnabled(profile.desktopChatbotEnabled === true);

      // F-03: Load S4 metadata (non-secret) — password is write-only
      if (profile.s4Meta?.configured) {
        setS4Url(profile.s4Meta.url || '');
        setS4Username(profile.s4Meta.username || '');
        setS4AuthType((profile.s4Meta.authType as any) || 'basic');
        setS4TokenUrl(profile.s4Meta.tokenUrl || '');
        // Password/BTP-JSON are NOT loaded back (write-only).
        // UI placeholder will show "•••••• (stored)" when configured.
        setS4Password('');
      } else if (profile.s4Config) {
        // Legacy fallback for not-yet-migrated profiles
        setS4Url(profile.s4Config.url || '');
        setS4Username(profile.s4Config.username || '');
        setS4Password('');
        setS4AuthType(profile.s4Config.authType || 'basic');
        setS4TokenUrl(profile.s4Config.tokenUrl || '');
      }
    }
  }, [profile]);

  // Redirect to dashboard if profile doesn't exist
  // Not during or after an erasure: the server removes the profile before the
  // sign-out, so it is gone on purpose then, and the erasure itself goes on to
  // the start page.
  useEffect(() => {
    if (!loading && !profile && !accountErased && !isDeletingAccount) {
      router.push('/dashboard');
    }
  }, [profile, loading, router, accountErased, isDeletingAccount]);

  if (loading) return (
    <div className="mx-auto max-w-[880px] space-y-4 px-4 py-6 pb-20 sm:px-6">
      <CcSkeleton shape="header" label="Loading profile settings..." />
      <CcSkeleton shape="cards" label="Loading profile settings..." count={4} />
    </div>
  );

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await updateProfile({ firstName, lastName });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || (profile.tier !== 'premium' && profile.tier !== 'unlimited')) return;
    
    setIsSendingTicket(true);
    setTicketStatus('idle');
    try {
      const db = getDb();
      const auth = getAuth();
      await addDoc(collection(db, 'support_tickets'), {
        userId: auth.currentUser?.uid,
        subject,
        message,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setTicketStatus('success');
      setSubject('');
      setMessage('');
    } catch (error) {
      setTicketStatus('error');
      handleFirestoreError(error, OperationType.WRITE, 'support_tickets');
    } finally {
      setIsSendingTicket(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSavingPrefs(true);
    try {
      // `theme` is deliberately not written: the switch is gone (roadmap 1.6)
      // and an existing value on the account is left exactly as it is. The
      // same holds for `backupEnabled` and `landingPageDefault`, which no part
      // of the product ever read.
      await updateProfile({
        desktopChatbotEnabled
      });
      // A side action that finished: a toast (DESIGN.md §2.6), which removes itself.
      setPrefsSaved(true);
    } catch (error) {
      console.error('Error saving system preferences:', error);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isPilotTier || !geminiKey.trim()) return;
    setKeyError('');
    setIsSavingKey(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/secrets/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ apiKey: geminiKey.trim() }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: 'Failed to save key.' }));
        throw new Error(errorBody.error || 'Failed to save key.');
      }

      setKeySaved(true);
      setGeminiKey('');
      setValidationStatus('idle'); // Reset test connection banner after saving
      setTimeout(() => setKeySaved(false), 3000);
    } catch (error) {
      console.error(error);
      setKeyError(error instanceof Error ? error.message : 'Failed to save API key.');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestConnection = async () => {
    const enteredKey = geminiKey.trim();
    const hasSavedKey = profile?.byokConfigured;
    if (!enteredKey && !hasSavedKey) {
      setValidationStatus('error');
      setValidationError('Please enter or save a Gemini API Key first.');
      return;
    }

    setIsValidatingKey(true);
    setValidationStatus('idle');
    setValidationError('');

    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/secrets/gemini/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(enteredKey ? { apiKey: enteredKey } : {}),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: 'Connection test failed.' }));
        throw new Error(errorBody.error || 'Connection test failed.');
      }

      setValidationStatus('success');
    } catch (error) {
      console.error('Gemini Key connectivity test failed:', error);
      setValidationStatus('error');
      setValidationError(error instanceof Error ? error.message : 'Invalid API key or network error.');
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Runs only from the message box's binding button — the box is the
  // confirmation `window.confirm` used to be.
  const handleDeleteKey = async () => {
    setConfirmDeleteKey(false);
    setKeyError('');
    setIsDeletingKey(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/secrets/gemini', {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: 'Failed to delete key.' }));
        throw new Error(errorBody.error || 'Failed to delete key.');
      }

      setGeminiKey('');
      setValidationStatus('idle');
    } catch (error) {
      console.error('Error removing API Key:', error);
      setKeyError(error instanceof Error ? error.message : 'Failed to delete API key.');
    } finally {
      setIsDeletingKey(false);
    }
  };

  const handleRequestByot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!byotMotivation.trim()) {
      setByotStatus('error');
      setByotError('Please enter a brief motivation or use-case for S/4HANA connection.');
      return;
    }

    setIsRequestingByot(true);
    setByotStatus('idle');
    setByotError('');

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('No authenticated user found.');

      // 1. Submit request to the backend API route which handles administration notifications
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/request-tenant-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid: currentUser.uid,
          email: profile.email,
          name: `${profile.firstName} ${profile.lastName}`,
          motivation: byotMotivation.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to submit tenant integration request.');
      }

      // 2. Create the tenant access request document in Firestore
      const db = getDb();
      await setDoc(doc(db, 'tenant_access_requests', currentUser.uid), {
        email: profile.email,
        name: `${profile.firstName} ${profile.lastName}`,
        motivation: byotMotivation.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setByotStatus('success');
      setByotMotivation('');
    } catch (error: any) {
      console.error('BYOT permission request failed:', error);
      setByotStatus('error');
      setByotError(error.message || 'Failed to request tenant access. Please try again.');
    } finally {
      setIsRequestingByot(false);
    }
  };

  const handleBtpJsonChange = (val: string) => {
    setBtpDestinationJson(val);
    try {
      const parsed = JSON.parse(val);
      if (parsed.URL) {
        setS4Url(parsed.URL);
      }
      if (parsed.Authentication === 'BasicAuthentication' && parsed.User) {
        setS4Username(parsed.User);
      }
    } catch(e) {}
  };

  const saveS4Config = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingConfig(true);
    try {
      // F-03: Save via encrypted server-side route (not plaintext Firestore)
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/s4-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          tokenUrl: s4AuthType === 'oauth2' ? s4TokenUrl : '',
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : '',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      setS4Password(''); // Password should never stay in client state
      // The strip takes its colour from connectionStatus; a save says nothing
      // about the connection, so it must not inherit a previous test's verdict.
      setConnectionStatus('disconnected');
      setConnectionMessage("Configuration saved securely (encrypted).");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err: any) {
      console.error("Failed to save S/4 config:", err);
      setConnectionStatus('failed');
      setConnectionMessage(err.message || "Failed to save configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestS4Connection = async () => {
    setTestingConnection(true);
    setConnectionStatus('disconnected');
    setConnectionMessage('');

    if (!s4Url) {
      setConnectionStatus('failed');
      setConnectionMessage('Connection failed: S/4HANA URL is empty.');
      setTestingConnection(false);
      return;
    }

    if (!s4Url.startsWith('https://')) {
      setConnectionStatus('failed');
      setConnectionMessage('Connection failed: URL must use secure HTTPS protocol.');
      setTestingConnection(false);
      return;
    }

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/test-s4-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          tokenUrl: s4AuthType === 'oauth2' ? s4TokenUrl : undefined,
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : undefined,
        }),
      });

      const data = await res.json();

      if (data.status === 'connected') {
        setConnectionStatus('connected');
        setConnectionMessage(data.message);
      } else {
        setConnectionStatus('failed');
        setConnectionMessage(data.message || 'Connection failed. Verify the URL and credentials.');
      }
    } catch (error: any) {
      console.error('S/4HANA connection test error:', error);
      setConnectionStatus('failed');
      setConnectionMessage('Network error: Unable to reach the connection test service. Please try again.');
    } finally {
      setTestingConnection(false);
    }
  };

  // GDPR Account Deletion

  const openDeleteAccount = () => {
    setDeleteEmail('');
    setDeleteMfaCode('');
    setDeletePassword('');
    setDeleteEmailError('');
    setDeleteCodeError('');
    setDeletePasswordError('');
    setDeleteError('');
    setShowDeleteAccount(true);
  };

  const cancelDeleteAccount = () => {
    setShowDeleteAccount(false);
    setDeleteMfaCode('');
    setDeletePassword('');
  };

  /**
   * GDPR erasure. The binding button of the message box starts it; before any
   * call the typed address must match the profile, and with a second factor
   * the authenticator code (and for a password account the password) must be
   * there — the same refusals the three browser prompts made, now said at the
   * field instead of in an `alert`. Then, unchanged: a fresh sign-in with the
   * factor, a fresh token, `/api/account/delete`, sign-out.
   */
  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setDeleteEmailError('');
    setDeleteCodeError('');
    setDeletePasswordError('');
    setDeleteError('');

    if (!deleteEmail || deleteEmail.trim().toLowerCase() !== profile?.email.toLowerCase()) {
      setDeleteEmailError('The entered address does not match your profile. Enter the e-mail address of this account.');
      return;
    }
    // With a second factor enrolled, the deletion needs a sign-in that just
    // ran the factor: the server checks recency and the factor on the token.
    const mfaCode = deleteMfaCode.replace(/\s+/g, '');
    if (profile?.mfaEnabled && !mfaCode) {
      setDeleteCodeError('The authenticator code is required. Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (profile?.mfaEnabled && profile?.authMethod === 'password' && !deletePassword) {
      setDeletePasswordError('Enter your password to confirm.');
      return;
    }

    setShowDeleteAccount(false);
    setIsDeletingAccount(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user found.");

      if (profile?.mfaEnabled) {
        const pw = profile?.authMethod === 'password' ? deletePassword : '';
        await reauthenticateWithFactor(currentUser, pw, mfaCode);
      }

      const token = await currentUser.getIdToken(true);

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to erase account.');
      }

      // Set before the sign-out, so the empty profile it leaves behind is not
      // read as "no profile" and sent to the dashboard instead of the start page.
      setAccountErased(true);
      await auth.signOut();
      // The browser `alert` that confirmed the erasure here is gone with the
      // other native dialogs and not replaced on this page: from the moment the
      // server removes the profile, the app shell lays its sign-up card
      // (components/UserOnboarding.tsx, z-[100]) over anything this page could
      // show. The start page is where the old alert led as well.
      router.push('/');
    } catch (error: any) {
      console.error("GDPR Account Erasure failed:", error);
      if (error.message?.includes('recent login') || error.message?.includes('requires-recent-login')) {
        setDeleteError("Security restriction: Deleting your account requires a recent login. Please sign out, sign back in, and try deleting your account again.");
      } else {
        setDeleteError("GDPR erasure failed or is incomplete: " + (error.message || error));
      }
    } finally {
      setDeleteMfaCode('');
      setDeletePassword('');
      setIsDeletingAccount(false);
    }
  };

  const getTierInfo = (tier: string = 'pilot', hasCustomKey: boolean = false) => {
    if (hasCustomKey && (tier === 'pilot' || tier === 'pilot_byok')) {
      return {
        label: 'Free Community Edition, with your own Gemini key',
        text: 'Your own Gemini key is in use, so there is no limit on transformations.',
      };
    }

    switch (tier) {
      case 'pilot_byok': return { label: 'Free Community Edition, with your own Gemini key', text: 'Your own Gemini key is in use — no limit on transformations, every feature, always free.' };
      default: return { label: 'Free Community Edition', text: `Every feature, with 5 free transformations.${isPilotTier ? ' Add your own Gemini key below for unlimited runs.' : ''}` };
    }
  };

  const tierInfo = getTierInfo(profile?.tier, !!profile?.byokConfigured);

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-6 pb-20 sm:px-6">
      {/* The way back is a link, in the ghost style of the four (DESIGN.md
          §1.5): it goes somewhere, so it is an `<a>`, not a button that
          calls the router. */}
      <div>
        <CcLinkButton href="/dashboard" variant="ghost" icon={<ArrowLeft size={16} aria-hidden={true} />}>
          Back to workspace
        </CcLinkButton>
      </div>

      {/* The tool-page head of the workspace (WorkspaceListReport, NewProject):
          22/800, ink, one line of lead. "Profile settings" is the name the
          privacy policy and the account mails point readers to. */}
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">Profile settings</h1>
        <p className="mt-1 text-[13px] font-medium text-cc-ink-muted">
          Your profile, sign-in security, use of the AI model and your free analysis runs. Changes here apply to your account only.
        </p>
      </div>

      <CcCard
        level={2}
        title="Your profile"
        actions={
          <CcButton
            variant="ghost"
            icon={<Edit2 size={16} aria-hidden={true} />}
            onClick={() => {
              setIsEditing(!isEditing);
              setFirstName(profile?.firstName || '');
              setLastName(profile?.lastName || '');
            }}
          >
            {isEditing ? 'Cancel' : 'Edit name'}
          </CcButton>
        }
      >
        {isEditing ? (
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* The same bounds sign-up holds (firestore.rules, isValidUserCreate). */}
              <SettingsInput label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" required maxLength={100} />
              <SettingsInput label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" required maxLength={100} />
            </div>
            <CcButton type="submit" variant="primary" busy={isUpdating}>
              {isUpdating ? 'Saving...' : 'Save name'}
            </CcButton>
          </form>
        ) : (
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="cc-text-label text-cc-ink-muted">Name</dt>
              <dd className="m-0 mt-1 cc-text-body text-cc-ink">{profile?.firstName} {profile?.lastName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="cc-text-label text-cc-ink-muted">E-mail address</dt>
              <dd className="m-0 mt-1 truncate cc-text-body text-cc-ink">{profile?.email}</dd>
            </div>
          </dl>
        )}
      </CcCard>

      {/* The plan and its quota — a sidebar until the single column (gap
          audit 3.0, §18). The "community status" card beside it repeated the
          plan in other words and is folded in here. */}
      <CcCard level={2} title="Plan and usage" meta={<StateWord state="success">Active</StateWord>}>
        <p className="m-0 cc-text-body text-cc-ink">{tierInfo.label}</p>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{tierInfo.text}</p>

        <dl className="m-0 mt-4 space-y-2 border-t border-cc-line pt-4 cc-text-cell">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-cc-ink-muted">Transformations used</dt>
            <dd className="m-0 font-semibold text-cc-ink">
              {profile?.byokConfigured
                ? `${profile?.transformationsUsed || 0} of unlimited (your own key)`
                : `${profile?.transformationsUsed || 0} of ${profile?.transformationsLimit || 5}`}
            </dd>
          </div>
          {profile?.accessUntil && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-cc-ink-muted">Valid until</dt>
              <dd className="m-0 inline-flex items-center gap-1 font-semibold text-cc-ink">
                <Clock size={14} aria-hidden={true} /> <CcDateText value={profile.accessUntil.toDate()} format="text" />
              </dd>
            </div>
          )}
        </dl>
        <p className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
          Questions about your account? Write to <a href="mailto:info@clean-core.io" className={TEXT_LINK}>info@clean-core.io</a>.
        </p>
      </CcCard>

      <CcCard level={2} title="Sign-in security">
        <p className="m-0 mb-4 cc-text-body text-cc-ink-muted">
          Ask for a code from an authenticator app at every sign-in, and change your password.
        </p>

        {/* Tailwind v4 draws `divide-y` as the bottom border of the first
            block, so the space sits inside each block, not between them. */}
        <div className="divide-y divide-cc-line">
          {/* Two-factor authentication */}
          <div className="space-y-4 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="m-0 cc-text-h3 text-cc-ink">Two-factor authentication</h3>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  After your password, the sign-in asks for a 6-digit code from the authenticator app on your phone.
                </p>
              </div>
              <StateWord state={profile?.mfaEnabled ? (enrolledFactorCount === 0 ? 'warning' : 'success') : 'neutral'}>
                {profile?.mfaEnabled ? (enrolledFactorCount === 0 ? 'Set up again' : 'On') : 'Off'}
              </StateWord>
            </div>

            {profile?.mfaEnabled && enrolledFactorCount === 0 ? (
              <div className="space-y-4">
                <CcMessageStrip state="warning" headline="Your authenticator needs to be set up again">
                  The authenticator you set up earlier no longer signs you in. Set it up again — it takes a minute — and the account is protected at sign-in itself, before any session exists.
                </CcMessageStrip>
                <div className="flex flex-wrap gap-3">
                  <CcButton variant="primary" onClick={handleStartMfaSetup} icon={<ShieldCheck size={16} aria-hidden={true} />}>
                    Set up the authenticator again
                  </CcButton>
                  <CcButton
                    variant="ghost"
                    onClick={handleTurnOffStranded}
                    busy={isClearingStranded}
                    icon={<X size={16} aria-hidden={true} />}
                  >
                    {isClearingStranded ? 'Turning off...' : 'Turn off two-factor authentication'}
                  </CcButton>
                </div>
                {strandedError && (
                  <CcMessageStrip state="error" announce>
                    {strandedError}
                  </CcMessageStrip>
                )}
              </div>
            ) : profile?.mfaEnabled ? (
              <div className="space-y-4">
                <CcMessageStrip state="success" headline="Two-factor authentication is on">
                  Every sign-in asks for your authenticator code — before any session exists.
                </CcMessageStrip>

                <div className={INSET}>
                  <span className="mb-2 block cc-text-label text-cc-ink-muted">If you lose the authenticator</span>
                  <p className="m-0 cc-text-cell text-cc-ink-muted">
                    There are no backup codes. Write to <a href="mailto:info@clean-core.io" className={TEXT_LINK}>info@clean-core.io</a> from your account address; an administrator removes the factor after confirming with you, and you set it up again here.
                  </p>
                </div>

                <CcButton variant="ghost" tone="danger" onClick={() => setShowMfaDisable(true)} icon={<X size={16} aria-hidden={true} />}>
                  Turn off two-factor authentication
                </CcButton>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Not `m-0`: `space-y-*` spaces siblings with their bottom margin. */}
                <p className={cn(INSET, 'cc-text-cell text-cc-ink-muted')}>
                  Any standard authenticator app works, for example Google Authenticator, 1Password or Authy. It costs nothing and works offline.
                </p>
                <CcButton variant="primary" onClick={handleStartMfaSetup} icon={<Smartphone size={16} aria-hidden={true} />}>
                  Set up two-factor authentication
                </CcButton>
              </div>
            )}
            {mfaStartError && (
              <CcMessageStrip state="error" announce>
                {mfaStartError}
              </CcMessageStrip>
            )}
          </div>

          {/* Password */}
          <div className="space-y-4 pt-6">
            <h3 className="m-0 cc-text-h3 text-cc-ink">Password</h3>

            {profile?.authMethod !== 'password' ? (
              <CcMessageStrip state="information" headline="You sign in with Google">
                Your password is managed by Google, not here. Change or reset it in your Google account.
              </CcMessageStrip>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <SettingsInput
                  label="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  reveal={{ shown: showCurrentPw, onToggle: () => setShowCurrentPw(!showCurrentPw), label: 'Show current password' }}
                />

                {enrolledFactorCount !== null && enrolledFactorCount > 0 && (
                  <SettingsInput
                    label="Code from your authenticator app"
                    required
                    value={pwChangeMfaCode}
                    onChange={(value) => setPwChangeMfaCode(value.replace(/[^0-9]/g, ''))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    mono
                  />
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <SettingsInput
                      label="New password"
                      value={newPassword}
                      onChange={setNewPassword}
                      required
                      placeholder="••••••••"
                      autoComplete="new-password"
                      reveal={{ shown: showNewPw, onToggle: () => setShowNewPw(!showNewPw), label: 'Show new password' }}
                    />

                    {/* Password strength meter — the word carries it, the
                        bars and their state colour repeat it. */}
                    {newPassword && (
                      <div className="mt-2 space-y-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                        <div className="flex items-center justify-between">
                          <span className="cc-text-label text-cc-ink-muted">Strength</span>
                          <StateWord state={getPasswordStrength(newPassword).state}>
                            {getPasswordStrength(newPassword).label}
                          </StateWord>
                        </div>
                        <div className="grid h-2 grid-cols-4 gap-1" aria-hidden={true}>
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={cn(
                                'h-full rounded-full',
                                getPasswordStrength(newPassword).score >= step
                                  ? STATE_CLASSES[getPasswordStrength(newPassword).state].mark
                                  : 'bg-cc-line',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <SettingsInput
                    label="Repeat the new password"
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={setConfirmNewPassword}
                    required
                    placeholder="••••••••"
                    autoComplete="new-password"
                    valueState={confirmNewPassword ? (newPassword !== confirmNewPassword ? 'error' : 'success') : undefined}
                    message={
                      confirmNewPassword
                        ? newPassword !== confirmNewPassword
                          ? 'Passwords do not match. Type the new password again.'
                          : 'Passwords match'
                        : undefined
                    }
                  />
                </div>

                {pwChangeStatus === 'success' && (
                  <CcMessageStrip state="success" announce>
                    Your password has been changed.
                  </CcMessageStrip>
                )}

                {pwChangeStatus === 'error' && (
                  <CcMessageStrip state="error" announce>
                    {pwChangeError || 'Error updating password.'}
                  </CcMessageStrip>
                )}

                <CcButton
                  type="submit"
                  variant="primary"
                  busy={isChangingPassword}
                  disabled={!currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword}
                  icon={<Key size={16} aria-hidden={true} />}
                >
                  {isChangingPassword ? 'Changing...' : 'Change password'}
                </CcButton>
              </form>
            )}
          </div>
        </div>
      </CcCard>

      {isPilotTier && (
        <CcCard
          level={2}
          title="Your own Gemini key (BYOK)"
          meta={profile?.byokConfigured ? <StateWord state="success">Key saved</StateWord> : undefined}
        >
          <p className="m-0 mb-4 cc-text-body text-cc-ink-muted">
            With your own Google Gemini API key, the limit of 5 free transformations no longer applies. The key is stored encrypted on our server and used only there; it never reaches your browser again.
          </p>

          <form onSubmit={handleSaveKey} className="space-y-4 text-cc-ink">
            <SettingsInput
              label="Gemini API key"
              value={geminiKey}
              onChange={(value) => {
                setGeminiKey(value);
                if (validationStatus !== 'idle') setValidationStatus('idle');
              }}
              help={profile?.byokConfigured ? 'A key is saved. Enter a new one to replace it.' : undefined}
              placeholder={profile?.byokConfigured ? (profile.byokLast4 ? "••••••••••••" + profile.byokLast4 : "••••••••••••••••••••••••••••••••") : "AIzaSy..."}
              autoComplete="off"
              mono
              reveal={{ shown: showKey, onToggle: () => setShowKey(!showKey), label: 'Show API key' }}
            />

            {validationStatus === 'success' && (
              <CcMessageStrip state="success" headline="The key works" announce>
                Google Gemini accepted the key. It is ready to use.
              </CcMessageStrip>
            )}

            {validationStatus === 'error' && (
              <CcMessageStrip state="error" headline="The key test failed" announce>
                {validationError || 'The API key did not pass authentication. Please check your credentials.'}
              </CcMessageStrip>
            )}

            {keyError && (
              <CcMessageStrip state="error" announce>
                {keyError}
              </CcMessageStrip>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <CcButton
                variant="secondary"
                onClick={handleTestConnection}
                busy={isValidatingKey}
                disabled={!geminiKey.trim() && !profile?.byokConfigured}
                icon={<Zap size={16} aria-hidden={true} />}
              >
                {isValidatingKey ? 'Testing the key...' : 'Test the key'}
              </CcButton>

              <CcButton
                type="submit"
                variant="primary"
                busy={isSavingKey}
                disabled={!geminiKey.trim()}
                icon={keySaved ? <CheckCircle2 size={16} aria-hidden={true} /> : undefined}
              >
                {isSavingKey ? 'Saving the key...' : keySaved ? 'Key saved' : 'Save the key'}
              </CcButton>

              {profile?.byokConfigured && (
                <CcButton
                  variant="ghost"
                  tone="danger"
                  onClick={() => setConfirmDeleteKey(true)}
                  busy={isDeletingKey}
                  icon={<Trash2 size={16} aria-hidden={true} />}
                >
                  Remove the key
                </CcButton>
              )}
            </div>
            {/* Said before the request rather than as a 403 after it: the
                own-key routes require an enrolled factor (lib/mfa-gate.ts,
                byokRequiresEnrolment). */}
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              Saving, testing or removing your own key needs two-factor authentication on this account —
              set it up under Sign-in security first.
            </p>
          </form>
        </CcCard>
      )}

      {/* Roadmap 1.2 — the model stages, one switch each. Next to the
          key it spends, because the two questions are asked together. */}
      <ModelStagesCard />

      {/* System Preferences. Until the 3.0 rebuild this card also offered
          "Default Landing View" and "Automated Backup Sync". Both were saved
          to the profile (`landingPageDefault`, `backupEnabled`) and read by
          nothing: sign-in always lands on My workspace, and no backup job
          exists. A control that changes nothing is not a preference, and one
          that promises a backup that never runs is a false statement — so
          they went, and the fields stay on old accounts untouched and unread
          (no migration), like `theme` before them. What is left is the one
          setting that acts. */}
      <CcCard level={2} title="Assistant button">
        {/* The theme selector — Light / Dark / System — stood here until
            roadmap 1.6. It offered a theme the product did not have:
            the dark overrides covered a named list of utility classes and
            nothing else, so choosing "Dark" left the dashboard table white
            and the project row barely readable. A switch that makes the app
            worse is not a preference. */}
        <form onSubmit={handleSavePreferences} className="space-y-4 text-cc-ink">
          {/* A checkbox, not a switch: it waits for "Save", and a switch that
              does nothing until Save lies about when it acts
              (components/cc/Switch.tsx, DESIGN.md §2.7).
              What the setting really does, and nothing more: only a saved
              `true` removes `sm:hidden` from the floating toggle in
              `components/GlossaryChatbot.tsx`. The assistant itself stays,
              and so does the button in the header — saying otherwise here
              would be the one lie a settings page cannot afford. */}
          <CcCheckbox
            label="Show the floating assistant button on a computer screen too"
            help="The assistant is always in the header. On a phone the floating button is the way in and stays."
            checked={desktopChatbotEnabled}
            onChange={setDesktopChatbotEnabled}
          />

          <CcButton type="submit" variant="primary" busy={isSavingPrefs} icon={<Save size={16} aria-hidden={true} />}>
            {isSavingPrefs ? 'Saving...' : 'Save'}
          </CcButton>
        </form>
        <CcToast open={prefsSaved} onDismiss={dismissPrefsSaved}>
          Setting saved
        </CcToast>
      </CcCard>

      {/* Owner decision 30.09.2026: community mail only with consent,
          switched on here and written by the server. */}
      <CommunityMailCard consent={profile?.communityMail} />

      {isPilotTier && (
        <CcCard
          level={2}
          title="Connection to your S/4HANA test system"
          meta={
            profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
              <StateWord state="success">Access granted</StateWord>
            ) : profile?.s4TenantAccessRequested ? (
              <StateWord state="warning">Request in review</StateWord>
            ) : null
          }
        >
          <p className="m-0 mb-4 cc-text-body text-cc-ink-muted">
            Connect a non-productive S/4HANA Cloud or on-premise system to the Testing stage, to check the connection and read OData metadata. Running the generated tests against that system stays locked until the isolated test runner has passed its review.
          </p>

          <div className="mb-4">
            <CcMessageStrip state="information" headline="What the connection test does">
              &quot;Test the connection&quot; makes a real HTTPS call to your S/4HANA system and reports whether it is reachable and the sign-in works. Full OData entity integration is planned for a later release.
            </CcMessageStrip>
          </div>

          {(profile?.s4TenantAccessAllowed || profile?.isAdmin) && (
            <div className={cn(INSET, 'mb-4 space-y-3')}>
              <div className="flex items-start gap-3">
                <BookOpen size={20} className="shrink-0 text-cc-ink-muted" aria-hidden={true} />
                <div className="flex-1 space-y-2">
                  <p className="m-0 cc-text-label text-cc-ink">Setup guide</p>
                  <p className="m-0 cc-text-cell text-cc-ink-muted">
                    Step-by-step help for Basic Auth, OAuth 2.0 client credentials, SAP API Hub sandbox keys and SAP Destination service JSON.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-8">
                <CcLinkButton href="/knowledge" variant="ghost" density="compact" icon={<ExternalLink size={16} aria-hidden={true} />}>
                  Knowledge Hub
                </CcLinkButton>
                {/* Outside a project the assistant answers product and
                    SAP questions, which is what this block is about. */}
                <CcButton
                  variant="ghost"
                  density="compact"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
                  icon={<HelpCircle size={16} aria-hidden={true} />}
                >
                  Ask the assistant
                </CcButton>
              </div>
            </div>
          )}

          {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
            <form onSubmit={saveS4Config} className="space-y-4 text-cc-ink">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SettingsInput
                  label="System address (HTTPS URL)"
                  type="url"
                  required
                  value={s4Url}
                  onChange={setS4Url}
                  placeholder="https://my300120-api.s4hana.cloud.sap"
                  help={<>Must start with <span className="font-bold">https://</span>. Production systems are blocked.</>}
                />

                <CcSelect
                  label="Sign-in method"
                  value={s4AuthType}
                  onChange={setS4AuthType}
                  options={[
                    { value: 'basic', label: 'User name and password' },
                    { value: 'oauth2', label: 'OAuth 2.0 client credentials' },
                    { value: 'sap_hub', label: 'SAP Accelerator Hub sandbox key' },
                    { value: 'btp_destination', label: 'SAP Destination service (JSON)' },
                  ]}
                />

                {s4AuthType === 'oauth2' && (
                  <div className="col-span-1 md:col-span-2">
                    <SettingsInput
                      label="OAuth 2.0 token URL"
                      type="url"
                      required
                      value={s4TokenUrl}
                      onChange={setS4TokenUrl}
                      placeholder="https://mysubaccount.authentication.eu10.hana.ondemand.com/oauth/token"
                      help={<>The XSUAA or IAS token endpoint of your SAP BTP subaccount, used for <span className="font-bold">grant_type=client_credentials</span>.</>}
                    />
                  </div>
                )}

                {s4AuthType === 'btp_destination' && (
                  <div className="col-span-1 md:col-span-2">
                    <CcTextarea
                      label="SAP Destination service (JSON)"
                      required
                      rows={8}
                      value={btpDestinationJson}
                      onChange={handleBtpJsonChange}
                      help={<>Paste the full JSON export from the destination service in the SAP BTP cockpit. Supports <span className="font-bold">BasicAuthentication</span>, <span className="font-bold">OAuth2ClientCredentials</span> and <span className="font-bold">PrincipalPropagation</span>.</>}
                      placeholder={`{
  "Name": "S4_CLOUDSANDBOX",
  "Type": "HTTP",
  "URL": "https://my300120-api.s4hana.cloud.sap",
  "Authentication": "OAuth2ClientCredentials",
  "tokenServiceURL": "https://mysubaccount.authentication.eu10.hana.ondemand.com/oauth/token",
  "clientId": "sb-clone-xxxx...",
  "clientSecret": "...",
  "ProxyType": "Internet"
}`}
                    />
                  </div>
                )}

                {s4AuthType !== 'sap_hub' && s4AuthType !== 'btp_destination' && (
                  <>
                    <SettingsInput
                      label={s4AuthType === 'oauth2' ? 'Client ID' : 'User name'}
                      required
                      value={s4Username}
                      onChange={setS4Username}
                      placeholder={s4AuthType === 'oauth2' ? 'sb-clone-xxxx...' : 'CC_INTEGRATOR'}
                    />

                    <SettingsInput
                      label={s4AuthType === 'oauth2' ? 'Client secret' : 'Password'}
                      required
                      value={s4Password}
                      onChange={setS4Password}
                      placeholder="••••••••••••••••"
                      reveal={{ shown: showS4Password, onToggle: () => setShowS4Password(!showS4Password), label: 'Show password' }}
                    />
                  </>
                )}
              </div>

              {connectionMessage && (
                <CcMessageStrip
                  state={connectionStatus === 'connected' ? 'success' : connectionStatus === 'failed' ? 'error' : 'information'}
                >
                  {connectionMessage}
                </CcMessageStrip>
              )}

              <div className="flex flex-col gap-3 border-t border-cc-line pt-4 sm:flex-row">
                <CcButton
                  variant="secondary"
                  onClick={handleTestS4Connection}
                  busy={testingConnection}
                  disabled={!s4Url}
                  icon={<Globe size={16} aria-hidden={true} />}
                >
                  {testingConnection ? 'Testing the connection...' : 'Test the connection'}
                </CcButton>
                <CcButton type="submit" variant="primary" busy={isSavingConfig} icon={<Save size={16} aria-hidden={true} />}>
                  {isSavingConfig ? 'Saving...' : 'Save the connection'}
                </CcButton>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className={INSET}>
                <h3 className="m-0 mb-3 cc-text-label text-cc-ink">How it works</h3>
                <ol className="m-0 list-decimal space-y-2 pl-4 cc-text-cell text-cc-ink-muted">
                  <li><strong className="text-cc-ink">Request access</strong> with the form below.</li>
                  <li><strong className="text-cc-ink">Provide an HTTPS address</strong> of your S/4HANA sandbox or test system.</li>
                  <li><strong className="text-cc-ink">Enter the sign-in details</strong> once access is granted (user name and password, or OAuth 2.0).</li>
                  <li><strong className="text-cc-ink">Check the connection</strong> from the Testing stage: the handshake, the OData metadata and one read-only call. Running the generated tests against the system stays locked until the isolated test runner has passed its review.</li>
                </ol>
              </div>

              <div className={INSET}>
                <h3 className="m-0 mb-3 cc-text-label text-cc-ink">How your system is protected</h3>
                <ul className="m-0 list-disc space-y-2 pl-4 cc-text-cell text-cc-ink-muted">
                  <li><strong className="text-cc-ink">Encrypted when stored:</strong> passwords and tokens travel over HTTPS to the server, which encrypts them with AES-256-GCM in a server-only store. They are never returned to the browser.</li>
                  <li><strong className="text-cc-ink">No production systems:</strong> production interfaces (<code className="rounded-[4px] border border-cc-line bg-cc-surface px-1 font-cc-mono text-[12px] text-cc-ink">*-api.s4hana.ondemand.com</code>) are blocked.</li>
                  <li><strong className="text-cc-ink">Only the server calls your system:</strong> your browser never talks to it. Each call goes through a checked HTTPS request that reaches non-production hosts only.</li>
                </ul>
              </div>

              <CcMessageStrip state="warning" headline="No warranty">
                This is the free Community Edition, provided without warranty, guarantee or liability. Never use productive ERP data or real passwords.
              </CcMessageStrip>

              {profile?.s4TenantAccessRequested ? (
                <CcMessageStrip state="information" headline="Request in review">
                  An administrator is reviewing your request for access. This usually takes less than 24 hours.
                </CcMessageStrip>
              ) : (
                <form onSubmit={handleRequestByot} className="space-y-4 pt-2">
                  <CcTextarea
                    label="What do you want to use the connection for?"
                    required
                    rows={3}
                    value={byotMotivation}
                    onChange={setByotMotivation}
                    placeholder="E.g., connecting our non-productive S/4HANA Public Cloud Sandbox to validate OData interfaces..."
                  />

                  {byotStatus === 'success' && (
                    <CcMessageStrip state="success" announce>
                      Your request has been sent.
                    </CcMessageStrip>
                  )}

                  {byotStatus === 'error' && (
                    <CcMessageStrip state="error" announce>
                      {byotError || 'Error submitting request. Please try again.'}
                    </CcMessageStrip>
                  )}

                  <CcButton
                    type="submit"
                    variant="primary"
                    busy={isRequestingByot}
                    disabled={!byotMotivation.trim()}
                    icon={<Send size={16} aria-hidden={true} />}
                  >
                    {isRequestingByot ? 'Sending...' : 'Request access'}
                  </CcButton>
                  {/* Said here, before the request, rather than as a 403
                      after approval: the enrolment requirement is enforced
                      by every S/4 route (lib/firebase-admin.ts,
                      assertS4TenantAccess). */}
                  <p className="m-0 cc-text-cell text-cc-ink-muted">
                    A connection needs two-factor authentication on this account. Set it up under Sign-in
                    security before you use one — the S/4 endpoints refuse an account without an authenticator.
                  </p>
                </form>
              )}
            </div>
          )}
        </CcCard>
      )}

      {/* Legal — the "Legal & Privacy Directory" of the old sidebar, as links
          to the pages that hold the binding text instead of a second copy.
          Its privacy paragraph promised a data download in the Danger Zone
          that does not exist; the policy itself says what is offered. */}
      <CcCard level={2} title="Legal and privacy">
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          Clean-Core.io is a free community edition, provided without warranty.
        </p>
        <p className="mt-2 mb-0 cc-text-cell text-cc-ink-muted">
          The findings, the route and the Clean Core Score come from a deterministic engine that reads your code; no model is involved in them. A language model (Google Gemini) writes only drafts on top of that evidence: the analysis narrative, business names for the process, the solution design, the code proposal, the documentation and the test suite. A draft can be wrong — code that does not compile, a statement the code does not support — so review a draft before you rely on it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CcLinkButton href="/impressum" variant="ghost">Legal notice</CcLinkButton>
          <CcLinkButton href="/datenschutz" variant="ghost">Privacy policy</CcLinkButton>
          <CcLinkButton href="/terms" variant="ghost">Terms of service</CcLinkButton>
        </div>
      </CcCard>

      {/* Danger Zone — the name the privacy policy and the account mails
          send readers to ("Settings → Danger Zone"). */}
      <CcCard
        level={2}
        title={
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={16} className="text-cc-error" aria-hidden={true} />
            Danger Zone
          </span>
        }
      >
        <p className="m-0 mb-4 cc-text-body text-cc-ink-muted">
          Delete your account for good (GDPR Art. 17, right to erasure). This cannot be undone. Your sign-in and the live database entries — uploaded ABAP source files, solution designs, generated code and test cases — are deleted at once. The security audit record of administrative actions is kept for 24 months, and copies in encrypted backups age out within 30 days; the privacy policy lists what deletion does not reach.
        </p>

        {isDeletingAccount ? (
          <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-cc-row border border-cc-error-border bg-cc-error-bg p-6 text-center">
            <Loader2 className="motion-safe:animate-spin text-cc-error" size={32} aria-hidden={true} />
            <p className="m-0 cc-text-h3 text-cc-ink">Deleting your account and data...</p>
            <p className="m-0 max-w-sm cc-text-cell text-cc-ink-muted">Your projects, uploaded source code, access requests, settings and sign-in are being removed from our database.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deleteError && (
              <CcMessageStrip state="error" announce>
                {deleteError}
              </CcMessageStrip>
            )}
            <CcButton variant="ghost" tone="danger" onClick={openDeleteAccount} icon={<Trash2 size={16} aria-hidden={true} />}>
              Delete my account
            </CcButton>
          </div>
        )}
      </CcCard>

      {/* 2FA setup — a dialog that asks for input (DESIGN.md §2.6, §2.7).
          Escape and the close button end it like "Later" does; the dimmed
          page does not, so a stray click cannot drop a half-typed code. */}
      <CcDialog
        open={showMfaSetup}
        title={
          mfaSetupStep === 1
            ? '1. Add the account to your authenticator'
            : mfaSetupStep === 2
              ? '2. Enter the code'
              : '3. Two-factor authentication is active'
        }
        onClose={() => setShowMfaSetup(false)}
        onSubmit={
          mfaSetupStep === 2
            ? () => {
                if (!isVerifyingMfa && mfaVerifyCode.length === 6) handleVerifyMfaSetup();
              }
            : undefined
        }
        actions={
          // No secret means the setup never began (an unverified address): there
          // is nothing to add, so no step forward either (QA 1e50094bc012).
          mfaSetupStep === 1 && !totpSecret ? (
            <CcButton variant="ghost" onClick={() => setShowMfaSetup(false)}>
              Close
            </CcButton>
          ) : mfaSetupStep === 1 ? (
            <CcButton variant="primary" onClick={() => setMfaSetupStep(2)} icon={<ArrowRight size={16} aria-hidden={true} />}>
              I have added it
            </CcButton>
          ) : mfaSetupStep === 2 ? (
            <>
              <CcButton variant="ghost" onClick={() => setMfaSetupStep(1)}>
                Back
              </CcButton>
              <CcButton
                type="submit"
                variant="primary"
                busy={isVerifyingMfa}
                disabled={mfaVerifyCode.length !== 6}
                icon={<ArrowRight size={16} aria-hidden={true} />}
              >
                {isVerifyingMfa ? 'Checking the code...' : 'Turn on'}
              </CcButton>
            </>
          ) : (
            <>
              <CcButton variant="ghost" onClick={() => setShowMfaSetup(false)}>
                Later
              </CcButton>
              <CcButton
                variant="primary"
                icon={<ArrowRight size={16} aria-hidden={true} />}
                onClick={async () => { setShowMfaSetup(false); await signOut(getAuth()); router.push('/?auth=signin'); }}
              >
                Sign out and sign in again
              </CcButton>
            </>
          )
        }
      >
        <div className="space-y-4">
          {/* Where in the three steps the reader is; the title says it in words. */}
          <div className="flex items-center gap-2" aria-hidden={true}>
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={cn('h-1 flex-1 rounded-full', mfaSetupStep >= step ? 'bg-cc-brand-strong' : 'bg-cc-line')}
              />
            ))}
          </div>

          {mfaSetupStep === 1 ? (
            <>
              {mfaSetupError && (
                <CcMessageStrip
                  state="warning"
                  actions={
                    !totpSecret ? (
                      <CcButton variant="secondary" onClick={handleSendVerificationMail} disabled={verificationMailSent}>
                        {verificationMailSent ? 'Verification mail sent — check your inbox' : 'Send the verification mail'}
                      </CcButton>
                    ) : undefined
                  }
                >
                  {mfaSetupError}
                </CcMessageStrip>
              )}
              {totpSecret ? (
              <>
              <p className="m-0 text-cc-ink-muted">
                Open your authenticator app (Google Authenticator, Authy, 1Password, …). On this
                device the button below hands it the account directly; otherwise type the setup
                key.
              </p>

              {/*
                There used to be a QR code here. It was a hand-drawn SVG named
                `MockQrCode` that ignored the `value` prop entirely and always
                rendered the same pattern, under a heading that told people to
                scan it. Scanning it enrolled nothing, so the documented primary
                path into two-factor authentication did not work at all — only
                typing the secret did.
                A real QR needs a vetted encoder, and adding a dependency here
                means regenerating the lockfile, which on this project is its own
                hazard (see CLAUDE.md). Until that is a deliberate decision, the
                honest options are the ones below: the otpauth:// URI the server
                already generates, and the key.
              */}
              <CcLinkButton href={qrCodeUrl} variant="secondary" icon={<ShieldCheck size={16} aria-hidden={true} />}>
                Open in authenticator app
              </CcLinkButton>

              <div className="space-y-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 text-center">
                <span className="block text-[12px] font-semibold text-cc-ink-muted">Secret Setup Key</span>
                <span className="block select-all font-cc-mono text-[15px] font-bold tracking-wider text-cc-ink uppercase">{tempMfaSecret}</span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <CcButton variant="ghost" onClick={() => copyMfa('secret', tempMfaSecret)} icon={<Copy size={16} aria-hidden={true} />}>
                    Copy setup key
                  </CcButton>
                  {/* The link above opens an app that may not be installed,
                      and on a desktop usually is not. The URI in writing is
                      the way through for everyone else. */}
                  <CcButton variant="ghost" onClick={() => copyMfa('link', qrCodeUrl)} icon={<Copy size={16} aria-hidden={true} />}>
                    Copy setup link
                  </CcButton>
                </div>
                <p role="status" aria-live="polite" className="m-0 min-h-4 text-[12px] font-semibold">
                  {mfaCopied === 'secret' && <span className="text-cc-success">Setup key copied.</span>}
                  {mfaCopied === 'link' && <span className="text-cc-success">Setup link copied.</span>}
                  {mfaCopied === 'failed-secret' && (
                    <span className="text-cc-warning" data-mfa-copy-failed="secret">
                      Your browser did not allow the copy. Select the key above and copy it by hand.
                    </span>
                  )}
                  {mfaCopied === 'failed-link' && (
                    <span className="text-cc-warning" data-mfa-copy-failed="link">
                      Your browser did not allow the copy of the setup link. Select the key above and copy it by hand instead — it sets up the same account.
                    </span>
                  )}
                </p>
              </div>
              </>
              ) : null}
            </>
          ) : mfaSetupStep === 2 ? (
            <>
              <p className="m-0 text-cc-ink-muted">
                Enter the 6-digit code your authenticator app shows for Clean-Core.io:
              </p>
              <SettingsInput
                label="6-digit code from your authenticator app"
                required
                value={mfaVerifyCode}
                onChange={(value) => setMfaVerifyCode(value.replace(/\s+/g, ''))}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="e.g. 123456"
                mono
                autoFocus
                valueState={mfaSetupError ? 'error' : undefined}
                message={mfaSetupError || undefined}
              />
            </>
          ) : (
            <>
              <div className="flex size-10 items-center justify-center rounded-cc-row border border-cc-success-border bg-cc-success-bg">
                <ShieldCheck size={20} className="text-cc-success" aria-hidden={true} />
              </div>
              <p className="m-0 text-cc-ink-muted">
                From now on Firebase asks for the code from your authenticator app at every sign-in — before any session exists. Your current session was created without it, so sign in again to continue working with a fully verified session.
              </p>
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 text-[13px] text-cc-ink-muted">
                There are no backup codes. If you lose the authenticator, write to info@clean-core.io from your account address; an administrator removes the factor after confirming with you.
              </div>
            </>
          )}
        </div>
      </CcDialog>

      {/* 2FA removal — a confirmation before something that lowers the
          account's security: a message box, its binding button `dark`
          (DESIGN.md §1.5, §2.6). The password and the code are asked for in
          it exactly as before, and handleDisableMfa refuses without them. */}
      <CcMessageBox
        open={showMfaDisable}
        title="Turn off two-factor authentication?"
        confirmLabel={isDisablingMfa ? 'Turning off...' : 'Turn it off'}
        onConfirm={handleDisableMfa}
        onCancel={closeMfaDisable}
      >
        <div className="space-y-4">
          <p className="m-0">
            Without it, your password alone signs in to this account. {profile?.authMethod === 'password' ? 'Enter your password and a current code to confirm.' : 'Enter a current code to confirm.'}
          </p>
          {profile?.authMethod === 'password' && (
            <SettingsInput
              label="Your account password"
              type="password"
              required
              value={disablePassword}
              onChange={setDisablePassword}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          )}
          <SettingsInput
            label="Code from your authenticator app"
            required
            value={mfaDisableCode}
            onChange={(value) => setMfaDisableCode(value.replace(/[^0-9]/g, ''))}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            mono
          />
          {mfaDisableError && (
            <CcMessageStrip state="error" announce>
              {mfaDisableError}
            </CcMessageStrip>
          )}
        </div>
      </CcMessageBox>

      {/* Removing the own key: the confirmation `window.confirm` used to ask. */}
      <CcMessageBox
        open={confirmDeleteKey}
        title="Remove your Gemini API key?"
        confirmLabel="Remove API key"
        onConfirm={handleDeleteKey}
        onCancel={() => setConfirmDeleteKey(false)}
      >
        The key is deleted from our server, and you are back to the 5 free transformations.
      </CcMessageBox>

      {/* GDPR erasure — the three browser prompts as the fields of one
          message box. Nothing is called until the address matches and, with
          a second factor, the code (and the password) are there. */}
      <CcMessageBox
        open={showDeleteAccount}
        title="Permanently delete your account?"
        confirmLabel="Delete account permanently"
        onConfirm={handleDeleteAccount}
        onCancel={cancelDeleteAccount}
      >
        <div className="space-y-4">
          <p className="m-0">
            This deletes your account, your projects with their uploaded source code, and your saved keys from the
            live systems (GDPR Art. 17). Type your e-mail address to confirm. The security audit record (24 months)
            and encrypted backups (up to 30 days) outlive the deletion.
          </p>
          <SettingsInput
            label="Your account e-mail address"
            required
            value={deleteEmail}
            onChange={setDeleteEmail}
            autoComplete="off"
            valueState={deleteEmailError ? 'error' : undefined}
            message={deleteEmailError || undefined}
          />
          {profile?.mfaEnabled && (
            <>
              <p className="m-0">
                To confirm it is you, enter the 6-digit code from your authenticator app.
              </p>
              <SettingsInput
                label="Code from your authenticator app"
                required
                value={deleteMfaCode}
                onChange={setDeleteMfaCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                mono
                valueState={deleteCodeError ? 'error' : undefined}
                message={deleteCodeError || undefined}
              />
              {profile?.authMethod === 'password' && (
                <SettingsInput
                  label="Enter your password to confirm"
                  type="password"
                  required
                  value={deletePassword}
                  onChange={setDeletePassword}
                  autoComplete="current-password"
                  valueState={deletePasswordError ? 'error' : undefined}
                  message={deletePasswordError || undefined}
                />
              )}
            </>
          )}
        </div>
      </CcMessageBox>

    </div>
  );
}

