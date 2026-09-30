'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUserProfile, UserProfile } from '@/hooks/useUserProfile';
import { useRouter } from 'next/navigation';
import { 
  User, Mail, Shield, Zap, Crown, Infinity, 
  Clock, Edit2, CheckCircle2, AlertCircle, 
  LifeBuoy, Send, MessageSquare, Eye, EyeOff,
  Trash2, KeyRound, Loader2,
  Database, Save, ShieldCheck, Key, RefreshCw,
  ArrowLeft, Copy, Download, Smartphone, X, ArrowRight, Globe,
  BookOpen, ExternalLink, HelpCircle
} from 'lucide-react';
import { addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc, doc, setDoc } from 'firebase/firestore';
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
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcCheckbox from '@/components/cc/Checkbox';
import CcDialog from '@/components/cc/Dialog';
import CcField, { CC_CONTROL_HEIGHT, type CcValueState } from '@/components/cc/Field';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import CcToast from '@/components/cc/Toast';
import { cn } from '@/lib/utils';

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
  const isPilotTier = !!profile && (profile.isAdmin || ['pilot', 'pilot_byok', 'starter', 'unlimited'].includes(profile.tier));
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

  // System Preferences States
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [defaultView, setDefaultView] = useState<'dashboard' | 'analytics' | 'transformation'>('dashboard');
  const [desktopChatbotEnabled, setDesktopChatbotEnabled] = useState<boolean>(true);
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
  const [mfaCopied, setMfaCopied] = useState<'idle' | 'secret' | 'link' | 'failed'>('idle');
  const copyMfa = async (what: 'secret' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMfaCopied(what);
    } catch {
      setMfaCopied('failed');
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
    
    let label = 'Weak';
    let color = 'bg-red-500';
    if (score === 2) {
      label = 'Fair';
      color = 'bg-amber-500';
    } else if (score === 3) {
      label = 'Good';
      color = 'bg-yellow-500';
    } else if (score === 4) {
      label = 'Strong';
      color = 'bg-green-600';
    }
    
    return { score, label, color, feedback };
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

      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await firebaseUpdatePassword(currentUser, newPassword);

      setPwChangeStatus('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
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
      setBackupEnabled(profile.backupEnabled !== false); // default true
      setDefaultView(profile.landingPageDefault || 'dashboard');
      setDesktopChatbotEnabled(profile.desktopChatbotEnabled !== false); // default true

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
    <div className="h-[60vh] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
      <p className="text-lg font-medium text-gray-500 tracking-tight">Loading profile settings...</p>
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
      // and an existing value on the account is left exactly as it is.
      await updateProfile({
        backupEnabled,
        landingPageDefault: defaultView,
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
      setConnectionMessage("Configuration saved securely (encrypted).");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err: any) {
      console.error("Failed to save S/4 config:", err);
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
        icon: <Infinity className="text-purple-600 animate-pulse" />, 
        label: 'Community (BYOK Active)', 
        color: 'bg-purple-50 border-purple-100 shadow-md shadow-purple-50', 
        text: 'Your custom Gemini API Key is active. Transformations are unlimited under your key.' 
      };
    }

    switch (tier) {
      case 'pilot_byok': return { icon: <Infinity className="text-purple-600" />, label: 'BYOK · Unlimited', color: 'bg-purple-50 border-purple-100', text: 'Your own Gemini key is active — unlimited transformations, all features, always free.' };
      default: return { icon: <Shield className="text-gray-600" />, label: 'Free Community Edition', color: 'bg-gray-50 border-gray-100', text: 'Full access to every feature — 5 free transformations. Add your own Gemini key for unlimited runs.' };
    }
  };

  const tierInfo = getTierInfo(profile?.tier, !!profile?.byokConfigured);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="px-2">
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-green-600 transition-colors bg-white hover:bg-green-50 px-4 py-2.5 rounded-xl border border-gray-200/80 shadow-sm transition-all"
        >
          <ArrowLeft size={14} className="stroke-[3]" /> Back to Workspace
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-950 tracking-tight flex items-center gap-3">
            Profile Settings
          </h1>
          <p className="text-gray-500 font-medium mt-1">Manage your personal information and subscription.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-1">
        {/* Profile Card */}
        <div className="lg:col-span-2 space-y-8 order-2 lg:order-1">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Personal Data</h2>
              <CcButton
                variant="ghost"
                icon={<Edit2 size={16} aria-hidden={true} />}
                onClick={() => {
                  setIsEditing(!isEditing);
                  setFirstName(profile?.firstName || '');
                  setLastName(profile?.lastName || '');
                }}
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </CcButton>
            </div>

            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SettingsInput label="First Name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
                  <SettingsInput label="Last Name" value={lastName} onChange={setLastName} autoComplete="family-name" />
                </div>
                <CcButton type="submit" variant="primary" busy={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </CcButton>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-start gap-4">
                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 shrink-0">
                    <User className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Full Name</p>
                    <p className="text-base md:text-lg font-bold text-gray-900">{profile?.firstName} {profile?.lastName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 shrink-0">
                    <Mail className="text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Email Address</p>
                    <p className="text-base md:text-lg font-bold text-gray-900 truncate">{profile?.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* System Preferences Card */}
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
            {/* Decorative side accent */}
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-[#006b2c] to-[#00873a]" />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-green-600/10 p-2.5 rounded-2xl">
                  <Database className="text-green-600" size={22} />
                </div>
                <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">System Preferences</h2>
              </div>
            </div>
            
            <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
              Configure background backup sync behaviors and map your default start layouts.
            </p>

            {/* The theme selector — Light / Dark / System — stood here until
                roadmap 1.6. It offered a theme the product did not have:
                the dark overrides covered a named list of utility classes and
                nothing else, so choosing "Dark" left the dashboard table white
                and the project row barely readable. A switch that makes the app
                worse is not a preference. */}
            <form onSubmit={handleSavePreferences} className="space-y-6 text-gray-900">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <CcSelect
                  label="Default Landing View"
                  value={defaultView}
                  onChange={setDefaultView}
                  options={[
                    { value: 'dashboard', label: 'Dashboard Workspace' },
                    { value: 'analytics', label: 'Technical Analytics' },
                    { value: 'transformation', label: 'Code Transformation' },
                  ]}
                />

                {/* Checkboxes, not switches: both wait for "Save Preferences",
                    and a switch that does nothing until Save lies about when
                    it acts (components/cc/Switch.tsx, DESIGN.md §2.7). */}
                <CcCheckbox
                  label="Automated Backup Sync"
                  help="Auto-save projects"
                  checked={backupEnabled}
                  onChange={setBackupEnabled}
                />

                <div className="sm:col-span-2">
                  {/* What the setting really does, and nothing more: it adds
                      `md:hidden` to the floating toggle in
                      `components/GlossaryChatbot.tsx`. The assistant itself
                      stays, and so does the button in the header — saying
                      otherwise here would be the one lie a settings page
                      cannot afford. */}
                  <CcCheckbox
                    label="Floating assistant button"
                    help="Show the floating assistant button on desktop screens. The button in the header stays either way."
                    checked={desktopChatbotEnabled}
                    onChange={setDesktopChatbotEnabled}
                  />
                </div>
              </div>

              <CcButton type="submit" variant="primary" busy={isSavingPrefs} icon={<Save size={16} aria-hidden={true} />}>
                {isSavingPrefs ? 'Saving Preferences...' : 'Save Preferences'}
              </CcButton>
            </form>
            <CcToast open={prefsSaved} onDismiss={dismissPrefsSaved}>
              Preferences saved
            </CcToast>
          </div>

          {/* Security & Access Card */}
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
            {/* Decorative side accent */}
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-green-600 to-emerald-500" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-green-600/10 p-2.5 rounded-2xl">
                <ShieldCheck className="text-green-600" size={22} />
              </div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Security & Access</h2>
            </div>
            
            <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
              Enhance your account's security with Two-Factor Authentication (2FA) and password updates.
            </p>

            <div className="space-y-8 divide-y divide-gray-100">
              {/* 2FA Panel */}
              <div className="space-y-5">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-950">Two-Factor Authentication (2FA)</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Secure your account by requiring a 6-digit dynamic token from your authenticator app during login.
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                    profile?.mfaEnabled 
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}>
                    {profile?.mfaEnabled ? (enrolledFactorCount === 0 ? 'Set up again' : 'Enabled') : 'Disabled'}
                  </span>
                </div>

                {profile?.mfaEnabled && enrolledFactorCount === 0 ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium">
                      <p className="font-bold flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-600" /> Your two-factor setting predates Firebase's factor</p>
                      <p className="mt-1 leading-relaxed">The authenticator you set up earlier no longer signs you in. Set it up again — it takes a minute — and the account is protected at sign-in itself, before any session exists.</p>
                    </div>
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
                    <div className="p-4 bg-green-50/50 border border-green-100 rounded-2xl text-xs text-green-800 font-medium">
                      <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Two-Factor Authentication is Active</p>
                      <p className="mt-1 text-green-700/90 leading-relaxed">Firebase asks for your authenticator code at every sign-in — before any session exists.</p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">If you lose the authenticator</span>
                      <p className="text-xs text-gray-600 font-medium leading-relaxed">
                        Firebase's factor has no backup codes. Write to <a href="mailto:info@clean-core.io" className="text-green-700 font-bold hover:underline">info@clean-core.io</a> from your account address; an administrator removes the factor after confirming with you, and you set it up again here.
                      </p>
                    </div>

                    <CcButton variant="ghost" tone="danger" onClick={() => setShowMfaDisable(true)} icon={<X size={16} aria-hidden={true} />}>
                      Disable Two-Factor Authentication
                    </CcButton>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-600 font-medium leading-relaxed">
                      TOTP (Time-based One-Time Passwords) is 100% free and offline-secure. You can use standard applications such as Google Authenticator, 1Password, or Authy to enroll.
                    </div>
                    <CcButton variant="primary" onClick={handleStartMfaSetup} icon={<Smartphone size={16} aria-hidden={true} />}>
                      Enable Two-Factor Authentication
                    </CcButton>
                  </div>
                )}
                {mfaStartError && (
                  <CcMessageStrip state="error" announce>
                    {mfaStartError}
                  </CcMessageStrip>
                )}
              </div>

              {/* Password Panel */}
              <div className="pt-8 space-y-5">
                <h3 className="text-base font-bold text-gray-950">Change Password</h3>
                
                {profile?.authMethod !== 'password' ? (
                  <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-xs text-amber-800 font-medium leading-relaxed flex items-start gap-2.5">
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-900">Managed Identity Provider</p>
                      <p className="mt-0.5 text-amber-700/90">Your account authentication is federated via Google. Password updates and resets are managed securely by your identity provider directly.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <SettingsInput
                      label="Current Password"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      required
                      placeholder="••••••••"
                      autoComplete="current-password"
                      reveal={{ shown: showCurrentPw, onToggle: () => setShowCurrentPw(!showCurrentPw), label: 'Show current password' }}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <SettingsInput
                          label="New Password"
                          value={newPassword}
                          onChange={setNewPassword}
                          required
                          placeholder="••••••••"
                          autoComplete="new-password"
                          reveal={{ shown: showNewPw, onToggle: () => setShowNewPw(!showNewPw), label: 'Show new password' }}
                        />

                        {/* Password strength meter */}
                        {newPassword && (
                          <div className="mt-2.5 space-y-1.5 bg-gray-50 p-3 rounded-xl border border-gray-150">
                            <div className="flex justify-between items-center text-[10px] font-bold">
                              <span className="text-gray-500 uppercase tracking-widest">Strength</span>
                              <span className={`font-black uppercase tracking-wider ${
                                getPasswordStrength(newPassword).score === 4 ? 'text-green-600' :
                                getPasswordStrength(newPassword).score === 3 ? 'text-yellow-600' :
                                getPasswordStrength(newPassword).score === 2 ? 'text-amber-600' : 'text-red-500'
                              }`}>{getPasswordStrength(newPassword).label}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 h-1.5">
                              {[1, 2, 3, 4].map((step) => (
                                <div
                                  key={step}
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    getPasswordStrength(newPassword).score >= step
                                      ? getPasswordStrength(newPassword).color
                                      : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <SettingsInput
                        label="Confirm New Password"
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
                        Password changed successfully!
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
                      {isChangingPassword ? 'Updating...' : 'Update Password'}
                    </CcButton>
                  </form>
                )}
              </div>
            </div>
          </div>

          {isPilotTier && (
            <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
              {/* Decorative side accent */}
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-purple-500 to-indigo-600" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-600/10 p-2.5 rounded-2xl">
                    <KeyRound className="text-purple-600" size={22} />
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Bring Your Own Key</h2>
                </div>
                
                {profile?.byokConfigured && (
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full border border-purple-200">
                    BYOK Active
                  </span>
                )}
              </div>
              
              <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
                Add your own Google Gemini API Key to bypass the standard 5-transformations free limit. Your credentials are encrypted in transit, proxied through our secure backend, and never exposed to the client-side bundle.
              </p>

              <form onSubmit={handleSaveKey} className="space-y-6 text-gray-900">
                <SettingsInput
                  label="Gemini API Key"
                  value={geminiKey}
                  onChange={(value) => {
                    setGeminiKey(value);
                    if (validationStatus !== 'idle') setValidationStatus('idle');
                  }}
                  help={profile?.byokConfigured ? 'Currently configured' : undefined}
                  placeholder={profile?.byokConfigured ? (profile.byokLast4 ? "••••••••••••" + profile.byokLast4 : "••••••••••••••••••••••••••••••••") : "AIzaSy..."}
                  autoComplete="off"
                  mono
                  reveal={{ shown: showKey, onToggle: () => setShowKey(!showKey), label: 'Show API key' }}
                />

                {/* Validation Response Banners */}
                {validationStatus === 'success' && (
                  <CcMessageStrip state="success" headline="Connection test successful!" announce>
                    Your custom API key successfully authenticated with Google Gemini services and is ready for use.
                  </CcMessageStrip>
                )}

                {validationStatus === 'error' && (
                  <CcMessageStrip state="error" headline="Connection test failed" announce>
                    {validationError || 'The API key did not pass authentication. Please check your credentials.'}
                  </CcMessageStrip>
                )}

                {keyError && (
                  <CcMessageStrip state="error" announce>
                    {keyError}
                  </CcMessageStrip>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <CcButton
                    variant="secondary"
                    onClick={handleTestConnection}
                    busy={isValidatingKey}
                    disabled={!geminiKey.trim() && !profile?.byokConfigured}
                    icon={<Zap size={16} aria-hidden={true} />}
                  >
                    {isValidatingKey ? 'Testing Connection...' : 'Test Connection'}
                  </CcButton>

                  <CcButton
                    type="submit"
                    variant="primary"
                    busy={isSavingKey}
                    disabled={!geminiKey.trim()}
                    icon={keySaved ? <CheckCircle2 size={16} aria-hidden={true} /> : undefined}
                  >
                    {isSavingKey ? 'Saving Key...' : keySaved ? 'API Key Saved!' : 'Save API Key'}
                  </CcButton>

                  {profile?.byokConfigured && (
                    <CcButton
                      variant="ghost"
                      tone="danger"
                      onClick={() => setConfirmDeleteKey(true)}
                      busy={isDeletingKey}
                      icon={<Trash2 size={16} aria-hidden={true} />}
                    >
                      Delete API Key
                    </CcButton>
                  )}
                </div>
                {/* Said before the request rather than as a 403 after it: the
                    own-key routes require an enrolled factor (lib/mfa-gate.ts,
                    byokRequiresEnrolment). */}
                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Storing, testing or removing your own key requires multi-factor authentication on this account —
                  enable it in the Security section first.
                </p>
              </form>
            </div>
          )}

          {/* Roadmap 1.2 — the model stages, one switch each. Next to the
              key it spends, because the two questions are asked together.
              Roadmap 2.4: the naming stage is offered only where the
              workspace preview is on — the map it names is not shown
              anywhere else yet. */}
          <ModelStagesCard showPreviewStages={workspaceShellEnabled(profile)} />

          {isPilotTier && (
            <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
              {/* Decorative side accent */}
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-sky-500 to-blue-600" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-sky-600/10 p-2.5 rounded-2xl">
                    <Database className="text-sky-600" size={22} />
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">S/4HANA Live Tenant Integration</h2>
                </div>
                
                {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-sky-100 text-sky-700 px-3 py-1.5 rounded-full border border-sky-200 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Active · Admin-Gated
                  </span>
                ) : profile?.s4TenantAccessRequested ? (
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <Clock size={12} /> Pending Review
                  </span>
                ) : null}
              </div>
              
              <p className="text-gray-650 font-medium mb-4 text-sm md:text-base leading-relaxed">
                Connect your custom, non-productive S/4HANA Cloud or On-Premise systems (BYOT) to the Stage 5 testing environment for connection checks and OData metadata reads. Running the generated tests against the tenant is locked until the isolated live runner has passed its review.
              </p>

              <div className="bg-sky-50/60 border border-sky-200 p-4 rounded-2xl mb-8 flex items-start gap-3">
                <Globe className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-sky-900 mb-1">Connectivity Mode</p>
                  <p className="text-[11px] text-sky-800/90 leading-relaxed font-medium">
                    The &quot;Test Connection&quot; button performs a real HTTP handshake against your S/4HANA endpoint to verify reachability and authentication status. Full OData entity integration is planned for a future release.
                  </p>
                </div>
              </div>

              {/* How-To Documentation Banner — visible for enabled S4 users */}
              {(profile?.s4TenantAccessAllowed || profile?.isAdmin) && (
                <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-blue-50 border border-indigo-200/60 p-5 rounded-2xl mb-8 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-indigo-600/10 p-2 rounded-xl shrink-0">
                      <BookOpen className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-black text-indigo-950 uppercase tracking-widest">Setup Guide — S/4HANA Live Tenant Integration</p>
                      <p className="text-[11px] text-indigo-800/90 leading-relaxed font-medium">
                        Follow our step-by-step documentation to configure your S/4HANA connection. Covers Basic Auth, OAuth 2.0 Client Credentials, SAP API Hub Sandbox Keys, and SAP BTP Destination Service JSON imports.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 pl-10">
                    <a
                      href="/knowledge"
                      className="inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-700 uppercase tracking-widest bg-white hover:bg-indigo-100 border border-indigo-200 px-3.5 py-2 rounded-xl transition-all hover:shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" /> Knowledge Hub
                    </a>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest bg-white hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl transition-all hover:shadow-sm"
                    >
                      {/* Outside a project the assistant answers product and
                          SAP questions, which is what this block is about. */}
                      <HelpCircle className="w-3 h-3" /> Ask the assistant
                    </button>
                  </div>
                </div>
              )}

              {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
                <form onSubmit={saveS4Config} className="space-y-6 text-gray-900">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingsInput
                      label="Tenant HTTPS URL"
                      type="url"
                      required
                      value={s4Url}
                      onChange={setS4Url}
                      placeholder="https://my300120-api.s4hana.cloud.sap"
                      help={<>Must start with <span className="font-bold">https://</span>. Production domains are automatically blocked.</>}
                    />

                    <CcSelect
                      label="Authentication Type"
                      value={s4AuthType}
                      onChange={setS4AuthType}
                      options={[
                        { value: 'basic', label: 'Basic Authentication' },
                        { value: 'oauth2', label: 'OAuth 2.0 Client Credentials' },
                        { value: 'sap_hub', label: 'SAP Accelerator Hub Sandbox Key' },
                        { value: 'btp_destination', label: 'SAP BTP Destination Service (JSON)' },
                      ]}
                    />

                    {s4AuthType === 'oauth2' && (
                      <div className="col-span-1 md:col-span-2">
                        <SettingsInput
                          label="OAuth 2.0 Token URL"
                          type="url"
                          required
                          value={s4TokenUrl}
                          onChange={setS4TokenUrl}
                          placeholder="https://mysubaccount.authentication.eu10.hana.ondemand.com/oauth/token"
                          help={<>The XSUAA or IAS token endpoint URL from your BTP subaccount. Used for <span className="font-bold">grant_type=client_credentials</span>.</>}
                        />
                      </div>
                    )}

                    {s4AuthType === 'btp_destination' && (
                      <div className="col-span-1 md:col-span-2">
                        <CcTextarea
                          label="SAP BTP Destination JSON Configuration"
                          required
                          rows={8}
                          value={btpDestinationJson}
                          onChange={handleBtpJsonChange}
                          help={<>Paste the full JSON export from the BTP Cockpit Destination Service. Supports <span className="font-bold">BasicAuthentication</span>, <span className="font-bold">OAuth2ClientCredentials</span>, and <span className="font-bold">PrincipalPropagation</span>.</>}
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
                          label={s4AuthType === 'oauth2' ? 'Client ID' : 'Username'}
                          required
                          value={s4Username}
                          onChange={setS4Username}
                          placeholder={s4AuthType === 'oauth2' ? 'sb-clone-xxxx...' : 'CC_INTEGRATOR'}
                        />

                        <SettingsInput
                          label={s4AuthType === 'oauth2' ? 'Client Secret' : 'Password'}
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

                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                    <CcButton
                      variant="secondary"
                      onClick={handleTestS4Connection}
                      busy={testingConnection}
                      disabled={!s4Url}
                      icon={<Globe size={16} aria-hidden={true} />}
                    >
                      {testingConnection ? 'Verifying Connection...' : 'Test Connection'}
                    </CcButton>
                    <CcButton type="submit" variant="primary" busy={isSavingConfig} icon={<Save size={16} aria-hidden={true} />}>
                      {isSavingConfig ? 'Saving...' : 'Save Connection'}
                    </CcButton>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  {/* Instructions */}
                  <div className="bg-sky-50/50 border border-sky-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-sky-950 uppercase tracking-widest mb-3">📋 Instructions (Setup Guide)</h3>
                    <ol className="list-decimal pl-4 text-xs text-sky-850 space-y-2 font-medium">
                      <li><strong>Request access:</strong> Use the form below to request access for your organization.</li>
                      <li><strong>Provide HTTPS endpoint:</strong> Set up a secure HTTPS connection to your S/4HANA sandbox or test system.</li>
                      <li><strong>Configure credentials:</strong> Once approved, you can configure your credentials (Basic Auth or OAuth 2.0).</li>
                      <li><strong>Check the connection:</strong> Test the handshake, read OData metadata and make one read-only call from the Stage 5 testing environment. Running the generated tests against the tenant is locked until the isolated live runner has passed its review.</li>
                    </ol>
                  </div>

                  {/* Security Measures */}
                  <div className="bg-green-50/50 border border-green-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-green-950 uppercase tracking-widest mb-3">🛡️ Security Measures & Explanations</h3>
                    <ul className="list-disc pl-4 text-xs text-green-850 space-y-2 font-medium">
                      <li><strong>Encrypted at rest:</strong> Passwords and tokens travel over HTTPS to the server, which encrypts them with AES-256-GCM in a server-only store. They are never returned to the browser.</li>
                      <li><strong>Production Block:</strong> Access to production interfaces (<code className="bg-green-100 px-1 py-0.5 rounded font-mono text-[10px]">*-api.s4hana.ondemand.com</code>) is blocked by the system.</li>
                      <li><strong>Server-side calls only:</strong> Your browser never talks to the tenant. The Clean-Core.io server makes each call through an SSRF-checked fetch that allows HTTPS to non-production hosts only.</li>
                    </ul>
                  </div>

                  {/* Disclaimer */}
                  <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-amber-950 uppercase tracking-widest mb-2">⚠️ Warranty Disclaimer</h3>
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      This is the Free Community Edition. Access is provided entirely without warranty, guarantee, or liability. Under no circumstances should you use productive ERP data or real passwords.
                    </p>
                  </div>

                  {/* Request Form / Status */}
                  {profile?.s4TenantAccessRequested ? (
                    <div className="bg-amber-50/50 border border-amber-150 p-5 rounded-2xl flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-900 text-xs md:text-sm mb-1 uppercase tracking-tight">Request in Review</h4>
                        <p className="text-xs text-amber-800/90 leading-relaxed font-medium">
                          Your request for live S/4HANA access is currently being reviewed by our system administrators. Approvals are usually processed within 24 hours.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRequestByot} className="space-y-4 pt-2">
                      <CcTextarea
                        label="Description of your use case (Motivation)"
                        required
                        rows={3}
                        value={byotMotivation}
                        onChange={setByotMotivation}
                        placeholder="E.g., connecting our non-productive S/4HANA Public Cloud Sandbox to validate OData interfaces..."
                      />

                      {byotStatus === 'success' && (
                        <CcMessageStrip state="success" announce>
                          Request successfully submitted!
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
                        {isRequestingByot ? 'Sending...' : 'Request Access for Live S/4HANA'}
                      </CcButton>
                      {/* Said here, before the request, rather than as a 403
                          after approval: the enrolment requirement is enforced
                          by every S/4 route (lib/firebase-admin.ts,
                          assertS4TenantAccess). */}
                      <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                        Live S/4HANA access requires multi-factor authentication on this account. Enable it in the
                        Security section above before you use a connection — the S/4 endpoints refuse an account
                        without an enrolled authenticator.
                      </p>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-red-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
            {/* Decorative side accent */}
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-red-500" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-red-500/10 p-2.5 rounded-2xl">
                <AlertCircle className="text-red-600" size={22} />
              </div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Danger Zone</h2>
            </div>
            
            <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
              Permanently erase your user account and all associated data in accordance with GDPR Art. 17 (Right to Erasure). This operation is final and cannot be undone. All your uploaded ABAP source files, solution designs, modernized TypeScript source codes, and test cases will be irrevocably deleted.
            </p>

            {isDeletingAccount ? (
              <div className="flex flex-col items-center justify-center p-6 bg-red-50 rounded-2xl border border-red-100 space-y-4">
                <Loader2 className="animate-spin text-red-600" size={32} />
                <p className="text-sm font-black text-red-950">Securely purging all data in accordance with GDPR...</p>
                <p className="text-xs text-red-700/80 text-center max-w-sm">We are removing all your projects, custom source code uploads, registration requests, profile configuration preferences, and core authentication credentials from our database.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deleteError && (
                  <CcMessageStrip state="error" announce>
                    {deleteError}
                  </CcMessageStrip>
                )}
                <CcButton variant="ghost" tone="danger" onClick={openDeleteAccount} icon={<Trash2 size={16} aria-hidden={true} />}>
                  Permanently Delete Account (GDPR Art. 17)
                </CcButton>
              </div>
            )}
          </div>
        </div>

        {/* Subscription Sidebar */}
        <div className="space-y-8 order-1 lg:order-2">
          <div className={`rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border shadow-lg ${tierInfo.color}`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-white rounded-2xl shadow-sm shrink-0">
                {tierInfo.icon}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Current Plan</p>
                <h3 className="text-xl md:text-2xl font-black text-gray-950 tracking-tight">{tierInfo.label}</h3>
              </div>
            </div>
            
            <p className="text-sm font-medium text-gray-700 leading-relaxed mb-8">
              {tierInfo.text}
            </p>

            <div className="space-y-4 pt-6 border-t border-gray-200/50">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-gray-600">Status</span>
                <span className="font-black text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Active
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-gray-600">Usage</span>
                <span className="font-black text-gray-900">
                  {profile?.byokConfigured 
                    ? `${profile?.transformationsUsed || 0} / Unlimited (BYOK)`
                    : `${profile?.transformationsUsed || 0} / ${profile?.transformationsLimit || 5}`
                  }
                </span>
              </div>
              {profile?.accessUntil && (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-600">Valid Until</span>
                  <span className="font-black text-gray-900 flex items-center gap-1">
                    <Clock size={14} /> {profile.accessUntil.toDate().toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-950 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] text-white shadow-2xl">
            <h3 className="text-xl font-black mb-4 tracking-tight">Free Community Edition Status</h3>
            <p className="text-gray-400 text-sm font-medium mb-8">You are currently participating in our free community program.</p>
            <div className="bg-white/10 p-4 rounded-xl border border-white/20 mb-6">
              <p className="text-xs text-white/80 leading-relaxed font-medium">For unlimited transformations, add your own Gemini API key (BYOK) in settings — or <a href="mailto:info@clean-core.io" className="text-green-400 hover:text-green-300 font-bold underline">contact the admin</a> with any questions.</p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-gray-400">
                <CheckCircle2 size={14} className="text-green-500" /> GDPR Compliance
              </div>
              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-gray-400">
                <CheckCircle2 size={14} className="text-green-500" /> Community Support
              </div>
            </div>
          </div>

          {/* Legal Notice & Privacy Card */}
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] text-white shadow-2xl space-y-6">
            <h3 className="text-xl font-black tracking-tight uppercase">Legal & Privacy Directory</h3>
            
            <div className="space-y-4 text-xs text-slate-400">
              <div className="border-t border-slate-800 pt-4" id="legal">
                <span className="font-bold text-white block uppercase tracking-wider mb-1">⚖️ Legal Notice (Impressum)</span>
                <p className="leading-relaxed">
                  Responsible for platform operations:<br />
                  <strong>Felix Frenzel</strong><br />
                  Hellerstraße 9, 96047 Bamberg, Germany<br />
                  E-Mail: <a href="mailto:info@clean-core.io" className="text-emerald-400 hover:underline">info@clean-core.io</a>
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4" id="privacy">
                <span className="font-bold text-white block uppercase tracking-wider mb-1">🔒 Privacy Policy (Datenschutz)</span>
                <p className="leading-relaxed">
                  Your profile and project assets are hosted on secure European cloud nodes (Google Firebase). The platform is designed to support GDPR (DSGVO)-aligned processing and erasure workflows. You can download or cascadingly erase your data inside the Settings Danger Zone at any time.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <span className="font-bold text-white block uppercase tracking-wider mb-1">🤖 AI Processing Notice</span>
                <p className="leading-relaxed">
                  Code analysis, solution design mapping, test cases, and modernizations are dynamically synthesized using Generative AI models. AI systems may output incorrect code, hallucinations, or compile issues.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <span className="font-bold text-amber-500 block uppercase tracking-wider mb-1">⚠️ Warranty Disclaimer</span>
                <p className="leading-relaxed italic text-slate-400">
                  This application is the <strong>Free Community Edition</strong>. Operations are provided completely <strong>without warranty, guarantees, or liability</strong> of any kind. All generated code must be vetted by qualified architects before deployment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA setup — a dialog that asks for input (DESIGN.md §2.6, §2.7).
          Escape and the close button end it like "Later" does; the dimmed
          page does not, so a stray click cannot drop a half-typed code. */}
      <CcDialog
        open={showMfaSetup}
        title={
          mfaSetupStep === 1
            ? '1. Add the account to your authenticator'
            : mfaSetupStep === 2
              ? '2. Verify Setup'
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
          mfaSetupStep === 1 ? (
            <CcButton variant="primary" onClick={() => setMfaSetupStep(2)} icon={<ArrowRight size={16} aria-hidden={true} />}>
              I have scanned it
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
                {isVerifyingMfa ? 'Verifying...' : 'Verify & Enable'}
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
                  {mfaCopied === 'failed' && (
                    <span className="text-cc-warning">
                      Your browser did not allow the copy. Select the key above and copy it by hand.
                    </span>
                  )}
                </p>
              </div>
            </>
          ) : mfaSetupStep === 2 ? (
            <>
              <p className="m-0 text-cc-ink-muted">
                Enter the 6-digit code shown in your authenticator app to complete connection verification:
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
        title="Disable Two-Factor Auth?"
        confirmLabel={isDisablingMfa ? 'Disabling...' : 'Confirm Disable'}
        onConfirm={handleDisableMfa}
        onCancel={closeMfaDisable}
      >
        <div className="space-y-4">
          <p className="m-0">
            Disabling two-factor authentication lowers your account security. {profile?.authMethod === 'password' ? 'Please enter your password to confirm:' : 'Confirm below:'}
          </p>
          {profile?.authMethod === 'password' && (
            <SettingsInput
              label="Your Account Password"
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
        Are you sure you want to securely remove your Gemini API Key? This will revert you back to standard limits.
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
            GDPR Right to Erasure (Art. 17 GDPR): to permanently and irrevocably erase all your personal data, uploaded
            source codes, API keys, and transformation projects, please confirm by entering your email address.
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
                Step-up required: enter the 6-digit code from your authenticator app to confirm your identity.
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

