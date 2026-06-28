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
  signOut
} from 'firebase/auth';
import { getAuth, getDb } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { verifyTOTP } from '@/lib/totp';
import { 
  X, 
  ArrowRight, 
  ShieldCheck, 
  Key, 
  CheckCircle2, 
  Mail, 
  Lock, 
  ArrowLeft, 
  Eye, 
  EyeOff, 
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LegalOverlay from '@/app/components/LegalOverlay';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export default function LandingModals() {
  const auth = getAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Modal open states based on search parameters
  const authParam = searchParams.get('auth');
  const legalParam = searchParams.get('legal');

  // Local state mirroring
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'mfa' | 'success'>('signin');
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
  const [agreedGDPR, setAgreedGDPR] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showDatenschutz, setShowDatenschutz] = useState(false);
  const [showTermsOverlay, setShowTermsOverlay] = useState(false);

  // 2FA Interceptor States
  const [mfaCode, setMfaCode] = useState<string[]>(['', '', '', '', '', '']);
  const [pendingMfaUser, setPendingMfaUser] = useState<any>(null);
  const [pendingMfaProfile, setPendingMfaProfile] = useState<any>(null);

  // Sync auth mode with search param
  useEffect(() => {
    if (authParam === 'signin' || authParam === 'signup' || authParam === 'forgot') {
      setAuthMode(authParam);
    }
  }, [authParam]);

  // Handle Google redirect result (fallback from signInWithPopup)
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        console.log('[getRedirectResult] User signed in via redirect:', result.user.email);
        setIsNavigating(true);
        router.push('/dashboard');
      }
    }).catch((err) => {
      console.error('[getRedirectResult] Error:', err);
    });
  }, [auth, router]);

  const updateQueryParams = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/?${params.toString()}`);
  };

  const closeAuthModal = async () => {
    if (authMode === 'mfa' && pendingMfaUser) {
      await signOut(auth);
    }
    setPendingMfaUser(null);
    setPendingMfaProfile(null);
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
      const userCredential = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      const signedInUser = userCredential.user;
      
      const db = getDb();
      const userDocRef = doc(db, 'users', signedInUser.uid);
      
      // CRITICAL: Wrap getDoc in its own try/catch so a Firestore error
      // does NOT silently fall through to the auto-create else branch
      // and overwrite an existing admin/approved profile.
      let profileExists = false;
      try {
        const userDoc = await getDoc(userDocRef);
        profileExists = userDoc.exists();
        
        if (profileExists) {
          const profileData = userDoc.data();
          if (profileData && profileData.mfaEnabled) {
            setPendingMfaUser(signedInUser);
            setPendingMfaProfile(profileData);
            setAuthMode('mfa');
            return;
          }
        }
      } catch (firestoreErr) {
        // If we can't read the profile, assume it exists and skip auto-create.
        // Better to redirect to dashboard and let useUserProfile handle it
        // than to accidentally overwrite an existing profile.
        console.error('[handleSignIn] Firestore read failed — skipping profile auto-create:', firestoreErr);
        profileExists = true; // Defensive: assume profile exists
      }
      
      // Only auto-create if we CONFIRMED the profile does not exist
      if (!profileExists) {
        const displayName = signedInUser.displayName || '';
        const nameParts = displayName.trim().split(/\s+/);
        const autoFirstName = nameParts[0] || '';
        const autoLastName = nameParts.slice(1).join(' ') || '';

        const newProfile = {
          firstName: autoFirstName,
          lastName: autoLastName,
          email: signedInUser.email || '',
          tier: 'pilot',
          status: 'pending',
          transformationsUsed: 0,
          transformationsLimit: 5,
          maxTeamMembers: 1,
          orgId: null,
          identityProvider: 'google',
          createdAt: serverTimestamp(),
          isAdmin: false,
          authMethod: 'google',
        };
        await setDoc(userDocRef, newProfile);

        await setDoc(doc(db, 'registration_requests', signedInUser.uid), {
          email: signedInUser.email,
          name: displayName,
          motivation: '',
          status: 'pending',
          createdAt: serverTimestamp(),
        });

        // Trigger approval email in background
        try {
          const token = await signedInUser.getIdToken();
          await fetch('/api/request-pilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              uid: signedInUser.uid,
              email: signedInUser.email || '',
              name: displayName,
              motivation: '',
            }),
          });
        } catch (emailErr) {
          console.error('Failed to trigger pilot registration email:', emailErr);
        }
      }
      
      setIsNavigating(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 850);
    } catch (error: any) {
      console.error('Error signing in with popup:', error);
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      // Fallback: if popup fails (internal-error, popup-blocked, etc.), try redirect
      if (code === 'auth/internal-error' || code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        console.log('[handleSignIn] Popup failed, falling back to signInWithRedirect...');
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
          return; // Browser will redirect away
        } catch (redirectErr) {
          console.error('Redirect also failed:', redirectErr);
        }
      }
      setAuthError(`Sign-in failed (${code || error?.message || 'unknown'}). Please try again.`);
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const signedInUser = userCredential.user;
      
      const db = getDb();
      const userDocRef = doc(db, 'users', signedInUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        if (profileData.mfaEnabled) {
          setPendingMfaUser(signedInUser);
          setPendingMfaProfile(profileData);
          setAuthMode('mfa');
          setIsSubmitting(false);
          return;
        }
      }
      
      setIsNavigating(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 850);
    } catch (error: any) {
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
        transformationsLimit: 5,
        maxTeamMembers: 1,
        orgId: null,
        identityProvider: 'google',
        createdAt: new Date(),
        isAdmin: false,
        authMethod: 'password',
      };
      
      await setDoc(userDocRef, newProfile);
      
      await setDoc(doc(db, 'registration_requests', signedInUser.uid), {
        email: signedInUser.email,
        name: `${firstName} ${lastName}`,
        motivation: '',
        status: 'pending',
        createdAt: new Date(),
      });
      
      try {
        await fetch('/api/request-pilot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: signedInUser.uid,
            email: signedInUser.email || '',
            name: `${firstName} ${lastName}`,
            motivation: '',
          }),
        });
      } catch (emailErr) {
        console.error('Failed to trigger pilot registration approval email:', emailErr);
      }
      
      setIsNavigating(true);
      setTimeout(() => {
        router.push('/dashboard');
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
    if (!pendingMfaUser || !pendingMfaProfile) return;
    setAuthError('');
    setIsSubmitting(true);
    try {
      const token = await pendingMfaUser.getIdToken();
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: codeStr })
      });
      
      if (res.ok) {
        setIsNavigating(true);
        setTimeout(() => {
          router.push('/dashboard');
        }, 850);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAuthError(errData.error || 'Invalid 6-digit code or backup recovery code.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('MFA validation error:', error);
      setAuthError('Error validating MFA. Please try again.');
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

  const handleMfaPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (pasteData.length === 6 && !isNaN(Number(pasteData))) {
      const splitCode = pasteData.split('');
      setMfaCode(splitCode);
      handleVerifyMfa(pasteData);
    }
  };

  return (
    <>
      {isNavigating && (
        <div className="fixed top-0 left-0 w-full h-1 bg-gray-900/10 z-[60]">
          <div className="h-full bg-green-600 animate-pulse w-full"></div>
        </div>
      )}

      {/* Auth Modal */}
      <AnimatePresence>
        {authParam && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl sm:rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative max-h-[95vh] overflow-y-auto my-auto"
            >
              {/* Close Button */}
              <button
                onClick={closeAuthModal}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors z-10"
              >
                <X size={16} strokeWidth={2.5} />
              </button>

              {authMode === 'mfa' ? (
                /* MFA Interceptor Screen */
                <div className="p-8 sm:p-10">
                  <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-6 border border-green-150">
                    <ShieldCheck className="w-8 h-8 text-green-600 animate-pulse" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-2">Two-Factor Auth</h3>
                  <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
                    Please enter the 6-digit verification code from your authenticator app (Google Authenticator, Authy, etc.) or a backup recovery code.
                  </p>

                  <div className="space-y-6">
                    {/* 6 Digit Input boxes */}
                    <div className="flex justify-between gap-2.5">
                      {mfaCode.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`mfa-input-${idx}`}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleMfaInputChange(e.target.value, idx)}
                          onKeyDown={(e) => handleMfaKeyDown(e, idx)}
                          onPaste={idx === 0 ? handleMfaPaste : undefined}
                          className="w-12 h-14 bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none rounded-xl text-center font-black text-xl text-gray-900 transition-all font-mono shadow-sm"
                          autoFocus={idx === 0}
                          autoComplete="one-time-code"
                        />
                      ))}
                    </div>

                    {authError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
                        <X size={14} className="shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <div className="pt-2">
                      <p className="text-xs text-center text-gray-400 font-medium leading-normal">
                        Make sure your authenticator clock is synced correctly. Enter a backup code starting with 'CC-' if you lost your device.
                      </p>
                    </div>

                    <button
                      onClick={closeAuthModal}
                      className="w-full py-4 text-sm font-bold text-gray-500 hover:text-gray-905 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                  </div>
                </div>
              ) : authMode === 'forgot' ? (
                /* Forgot Password Screen */
                <form onSubmit={handleForgotPassword} className="p-8 sm:p-10">
                  <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-6 border border-green-150">
                    <Key className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-955 tracking-tight mb-2">Reset Password</h3>
                  <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
                    Enter your email address and we'll send you a secure link to reset your password.
                  </p>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full bg-gray-50 border border-gray-200 pl-12 pr-4 py-3.5 rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                    </div>

                    {authError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
                        <X size={14} className="shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? 'Sending...' : 'Send Reset Link'} <ArrowRight size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => { setAuthMode('signin'); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                      className="w-full py-2 text-sm font-bold text-gray-500 hover:text-gray-905 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                  </div>
                </form>
              ) : authMode === 'success' ? (
                /* Reset Password Success Screen */
                <div className="p-8 sm:p-10 text-center">
                  <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-6 mx-auto border border-green-150">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-955 tracking-tight mb-2">Check your Inbox</h3>
                  <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
                    We've sent a password reset link to <span className="font-bold text-gray-900">{email}</span>. Please click the link in that email to reset your credentials.
                  </p>

                  <button
                    onClick={() => { setAuthMode('signin'); setEmail(''); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                    className="w-full bg-gray-955 hover:bg-gray-800 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : authMode === 'signup' ? (
                /* Sign Up Screen */
                <form onSubmit={handleEmailSignUp} className="p-5 sm:p-8">
                  <div className="text-center mb-4 sm:mb-6">
                    <h3 className="text-2xl sm:text-3xl font-black text-gray-955 tracking-tight mb-1">Create Account</h3>
                    <p className="text-xs font-bold text-gray-500">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signin'); setAuthError(''); updateQueryParams('auth', 'signin'); }}
                        className="text-green-600 hover:underline"
                      >
                        Sign In
                      </button>
                    </p>
                  </div>

                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">First Name</label>
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                          className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Last Name</label>
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Doe"
                          className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-11 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      {/* Password strength meter */}
                      {password && (
                        <div className="mt-2.5 space-y-1.5 bg-gray-50 p-3 rounded-xl border border-gray-150">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-gray-500 uppercase tracking-wider">Password Strength</span>
                            <span className={`font-black uppercase tracking-wider ${
                              getPasswordStrength(password).score === 4 ? 'text-green-600' :
                              getPasswordStrength(password).score === 3 ? 'text-yellow-600' :
                              getPasswordStrength(password).score === 2 ? 'text-amber-600' : 'text-red-500'
                            }`}>{getPasswordStrength(password).label}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1 h-1.5">
                            {[1, 2, 3, 4].map((step) => (
                              <div
                                key={step}
                                className={`h-full rounded-full transition-all duration-300 ${
                                  getPasswordStrength(password).score >= step
                                    ? getPasswordStrength(password).color
                                    : 'bg-gray-200'
                                  }`}
                              />
                            ))}
                          </div>
                          {getPasswordStrength(password).feedback.length > 0 && (
                            <ul className="text-[9px] text-gray-400 font-semibold italic space-y-0.5 list-disc pl-3">
                              {getPasswordStrength(password).feedback.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                      {confirmPassword && password !== confirmPassword && (
                        <p className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1">
                          <X size={10} /> Passwords do not match
                        </p>
                      )}
                      {confirmPassword && password === confirmPassword && (
                        <p className="text-[10px] font-bold text-green-600 mt-1 flex items-center gap-1">
                          <Check size={10} /> Passwords match
                        </p>
                      )}
                    </div>

                    {/* Legal consent checkboxes (required for registration) */}
                    <div className="space-y-2.5 pt-3 border-t border-gray-100">
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <div className="relative mt-0.5 shrink-0">
                          <input 
                            type="checkbox" 
                            checked={agreedGDPR} 
                            onChange={(e) => setAgreedGDPR(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 border-2 rounded transition-all flex items-center justify-center ${agreedGDPR ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-600'}`}>
                            {agreedGDPR && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-600 leading-relaxed font-medium">
                          I agree to the{' '}
                          <button 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                            className="text-gray-950 font-bold underline hover:text-green-600 transition-colors"
                          >
                            GDPR provisions and Privacy Policy
                          </button>{' '}
                          and understand this is a free community pilot.
                        </span>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <div className="relative mt-0.5 shrink-0">
                          <input 
                            type="checkbox" 
                            checked={agreedTerms} 
                            onChange={(e) => setAgreedTerms(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 border-2 rounded transition-all flex items-center justify-center ${agreedTerms ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-600'}`}>
                            {agreedTerms && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-600 leading-relaxed font-medium">
                          I accept the{' '}
                          <button 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); setShowTermsOverlay(true); }}
                            className="text-gray-950 font-bold underline hover:text-green-600 transition-colors"
                          >
                            Terms of Service and Guidelines
                          </button>
                          .
                        </span>
                      </label>
                    </div>

                    {/* AI Disclaimer */}
                    <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 text-[9px] text-amber-900 leading-relaxed font-medium">
                      <strong>⚡ Disclaimer:</strong> All analyses are powered by Generative AI and may contain inaccuracies. No warranty or liability assumed. Generated code must be verified by qualified architects before deployment.
                    </div>

                    {authError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
                        <X size={14} className="shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || (!!confirmPassword && password !== confirmPassword) || !agreedGDPR || !agreedTerms}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-black text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? 'Registering...' : 'Register'} <ArrowRight size={14} />
                    </button>

                    <div className="relative py-2.5">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-gray-400 bg-white px-3">or continue with</div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="w-full bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2.5 shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.72 5.72 0 0 1 8.24 12.9a5.72 5.72 0 0 1 5.751-5.7 5.6 5.6 0 0 1 3.916 1.547l3.076-3.076A10.15 10.15 0 0 0 14.004 2a10.05 10.05 0 0 0-10 10.05 10.05 10.05 0 0 0 10 10.05c5.787 0 9.878-3.9 9.878-9.882 0-.67-.066-1.3-.2-1.933H12.24Z"/></svg>
                      Google Account
                    </button>
                  </div>
                </form>
              ) : (
                /* Sign In Screen (Default) */
                <form onSubmit={handleEmailSignIn} className="p-8 sm:p-10">
                  <div className="text-center mb-6">
                    <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-1">Welcome Back</h3>
                    <div className="mt-4 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-200/80 rounded-2xl flex items-center justify-between gap-3 shadow-inner text-left animate-in fade-in slide-in-from-top-2 duration-500">
                      <div>
                        <p className="text-[10px] font-black text-green-800 uppercase tracking-widest leading-none mb-1">New to Clean-Core.io?</p>
                        <p className="text-[11px] text-gray-500 font-bold leading-none">Join our closed pilot program</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); setAuthError(''); updateQueryParams('auth', 'signup'); }}
                        className="bg-green-600 hover:bg-green-700 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow hover:shadow-green-600/15 cursor-pointer shrink-0"
                      >
                        Create Account
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Password</label>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('forgot'); setAuthError(''); updateQueryParams('auth', 'forgot'); }}
                          className="text-[10px] font-bold text-green-600 hover:underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-11 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {authError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
                        <X size={14} className="shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-black text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? 'Signing In...' : 'Sign In'} <ArrowRight size={14} />
                    </button>

                    <div className="relative py-2.5">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-gray-400 bg-white px-3">or continue with</div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="w-full bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2.5 shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.72 5.72 0 0 1 8.24 12.9a5.72 5.72 0 0 1 5.751-5.7 5.6 5.6 0 0 1 3.916 1.547l3.076-3.076A10.15 10.15 0 0 0 14.004 2a10.05 10.05 0 0 0-10 10.05 10.05 10.05 0 0 0 10 10.05c5.787 0 9.878-3.9 9.878-9.882 0-.67-.066-1.3-.2-1.933H12.24Z"/></svg>
                      Google Account
                    </button>

                    <p className="text-[9px] text-gray-400 text-center leading-relaxed font-medium pt-1">
                      By signing in, you agree to our{' '}
                      <button type="button" onClick={() => updateQueryParams('legal', 'datenschutz')} className="underline hover:text-green-600">Privacy Policy</button>{' '}
                      and{' '}
                      <button type="button" onClick={() => updateQueryParams('legal', 'impressum')} className="underline hover:text-green-600">Terms</button>.
                    </p>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legal Overlays */}
      <LegalOverlay isOpen={legalParam === 'impressum'} onClose={() => updateQueryParams('legal', null)} title="Legal Notice (Impressum)">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">Information according to § 5 TMG</h3>
            <p className="text-sm leading-relaxed">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">Contact</h3>
            <p className="text-sm leading-relaxed">
              Phone: +49 151 59200157<br />
              E-Mail: info@clean-core.io<br />
              Website: www.clean-core.io
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">Responsible for Content under § 18 Abs. 2 MStV</h3>
            <p className="text-sm leading-relaxed">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-base font-bold mb-2 text-slate-900">Disclaimer</h3>
            <p className="text-xs text-slate-500 leading-normal mb-3">
              <strong>Liability for Content:</strong> The contents of our pages were created with the greatest care. Since this is a non-commercial, collaborative research pilot application (Community Pilot), we cannot assume any guarantee for the accuracy, completeness, error-free code transformation, or continuous availability of the provided modernization results.
            </p>
            <p className="text-xs text-slate-500 leading-normal">
              <strong>Copyright:</strong> The content and works created by the site operator on these pages are subject to German copyright law. Contributions from third parties are marked as such. Reproduction, editing, and distribution require written consent.
            </p>
          </div>

          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 p-3 rounded-lg font-bold">
            Important Note: Clean-Core.io is a purely academic, non-commercial tool for testing modern software architectures in the context of legacy code. No paid services are offered.
          </p>

          <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-black font-mono uppercase tracking-wider">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </LegalOverlay>

      <LegalOverlay isOpen={legalParam === 'privacy'} onClose={() => updateQueryParams('legal', null)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">1. Privacy at a Glance</h3>
            <p className="text-sm leading-relaxed mb-2">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our Pilot program.
            </p>
            <p className="text-xs text-slate-500">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">2. Data Collection & Processing Purposes</h3>
            <p className="text-sm leading-relaxed mb-3">
              We process personal data of our users only as far as necessary to provide a functional pilot platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
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
            <h3 className="text-lg font-bold mb-2">3. Processing of Source Code & Project Assets</h3>
            <p className="text-sm leading-relaxed">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong>. Our integration utilizes stateless API requests, meaning that your uploaded codes and projects are never stored or used to train Google's foundational AI models.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">4. Cloud Node Hosting & Third-Party Services</h3>
            <p className="text-sm leading-relaxed">
              To provide this service, we rely on the following trusted cloud services:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
              <li>
                <strong>Google Cloud Platform & Firebase:</strong> Hosted on secure European servers in the <strong>Belgium (europe-west1)</strong> region for low-latency, fully GDPR-compliant authentication and database operations.
              </li>
              <li>
                <strong>Google Gemini API:</strong> Generative AI models used exclusively for code transformation, utilizing secure stateless proxy layers.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">5. Your Rights Under GDPR (including Art. 17 Deletion)</h3>
            <p className="text-sm leading-relaxed mb-2">
              Since our platform is hosted in compliance with EU regulations, you have all rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / "Right to be Forgotten" (Art. 17 GDPR)</li>
              <li>Right to Restriction of Processing (Art. 18 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              To exercise these rights, particularly to cascadingly erase all your data immediately, you can trigger account deletion directly in your Profile Settings under the **Danger Zone**, which will permanently and instantly wipe all database and authentication entries. Alternatively, contact us at <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Signup-specific GDPR overlay */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">1. Privacy at a Glance</h3>
            <p className="text-sm leading-relaxed mb-2">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our Pilot program.
            </p>
            <p className="text-xs text-slate-500">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">2. Data Collection & Processing</h3>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
              <li><strong>Google Authentication (Firebase Auth):</strong> Your name, email, and profile picture are used to authenticate your session.</li>
              <li><strong>Firestore User Profiles:</strong> We store metadata about your usage (transformation count, system limits, name) in our secure database.</li>
              <li><strong>BYOK (Bring Your Own Key):</strong> If configured, your Gemini API key is AES-256-GCM encrypted and never exposed to the browser.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">3. Source Code Processing</h3>
            <p className="text-sm leading-relaxed">
              Uploaded ABAP files and generated artifacts are stored in Google Firebase (Europe). Source code is transmitted via secure channels to the Google Gemini API using stateless requests — never stored or used for AI training.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">4. Your GDPR Rights</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / &quot;Right to be Forgotten&quot; (Art. 17 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              To exercise these rights, use account deletion in Profile Settings or contact <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Signup-specific Terms overlay */}
      <LegalOverlay isOpen={showTermsOverlay} onClose={() => setShowTermsOverlay(false)} title="Terms of Service & Guidelines">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">1. Scope and Purpose</h3>
            <p className="text-sm leading-relaxed">
              This Clean-Core.io pilot program is designed solely for research and evaluation purposes in the domain of automated code modernization (ABAP to Cloud-Native). By participating, you help shape and improve this community utility.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">2. Community Pilot Usage</h3>
            <p className="text-sm leading-relaxed text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100 font-medium">
              During this community pilot phase, platform access is completely free and intended for prototyping, educational, and research-based testing. Commercial deployment of generated code requires a separate agreement.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">3. AI Liability Disclaimer</h3>
            <p className="text-sm leading-relaxed">
              All code and analyses are generated by AI models. We assume no warranty, guarantees, or liability for reliability, correctness, or security of outputs. All generated artifacts must be verified by qualified software architects before deployment.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">4. Code of Conduct</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
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
