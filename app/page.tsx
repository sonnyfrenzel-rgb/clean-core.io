'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { getAuth, getDb } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { verifyTOTP } from '@/lib/totp';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Code2, 
  Cpu, 
  FileText, 
  ShieldCheck, 
  Check, 
  X, 
  ArrowRight, 
  Zap, 
  RotateCw, 
  LayoutTemplate, 
  Download, 
  CheckCircle2, 
  Users, 
  Shield, 
  Globe, 
  Key,
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowLeft,
  Layers,
  Sparkles,
  Activity
} from 'lucide-react';
import LegalOverlay from './components/LegalOverlay';
import LandingSlideshow from '@/components/LandingSlideshow';
import { motion, AnimatePresence } from 'motion/react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export default function Home() {
  const auth = getAuth();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showImpressum, setShowImpressum] = useState(false);
  const [showDatenschutz, setShowDatenschutz] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const router = useRouter();

  // Authentication Dialog and Form States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'mfa' | 'success'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA Interceptor States
  const [mfaCode, setMfaCode] = useState<string[]>(['', '', '', '', '', '']);
  const [pendingMfaUser, setPendingMfaUser] = useState<any>(null);
  const [pendingMfaProfile, setPendingMfaProfile] = useState<any>(null);

  // Initialize banner state from sessionStorage to avoid flashing dismissed banners on landing
  useEffect(() => {
    const isBannerDismissed = sessionStorage.getItem('dismissPilotBanner') === 'true';
    if (isBannerDismissed) {
      setShowBanner(false);
    }
  }, []);

  const dismissBanner = () => {
    sessionStorage.setItem('dismissPilotBanner', 'true');
    setShowBanner(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const db = getDb();
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const profileData = userDoc.data();
            if (profileData.mfaEnabled) {
              setPendingMfaUser(currentUser);
              setPendingMfaProfile(profileData);
              setAuthMode('mfa');
              setShowAuthModal(true);
              setUser(null);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.error('Error during auto-login MFA check:', err);
        }
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);
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
          setShowAuthModal(true);
          return;
        }
      }
      
      setIsNavigating(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 850);
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  const openSignInModal = () => {
    setAuthMode('signin');
    setShowAuthModal(true);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[CLIENT LOG] handleEmailSignIn started!');
    setAuthError('');
    setIsSubmitting(true);
    try {
      console.log('[CLIENT LOG] Calling signInWithEmailAndPassword...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('[CLIENT LOG] signInWithEmailAndPassword resolved successfully!');
      const signedInUser = userCredential.user;
      
      const db = getDb();
      const userDocRef = doc(db, 'users', signedInUser.uid);
      console.log('[CLIENT LOG] Calling getDoc for user profile...');
      const userDoc = await getDoc(userDocRef);
      console.log('[CLIENT LOG] getDoc resolved successfully!');
      
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
      
      console.log('[CLIENT LOG] Setting isNavigating to true and redirecting to /dashboard...');
      setIsNavigating(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
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

  const handleEmailSignUp = async (e: React.FormEvent) => {
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
      const isSonny = signedInUser.email === 'sonny.frenzel@googlemail.com' || signedInUser.email === 'sonny.frenzel@gmail.com';
      
      const newProfile = {
        firstName,
        lastName,
        email: signedInUser.email || '',
        tier: isSonny ? 'enterprise' : 'pilot',
        status: isSonny ? 'approved' : 'pending',
        transformationsUsed: 0,
        transformationsLimit: isSonny ? 999999 : 5,
        maxTeamMembers: isSonny ? 999 : 1,
        orgId: null,
        identityProvider: 'google',
        createdAt: new Date(),
        isAdmin: isSonny,
        authMethod: 'password',
      };
      
      await setDoc(userDocRef, newProfile);
      
      await setDoc(doc(db, 'registration_requests', signedInUser.uid), {
        email: signedInUser.email,
        name: `${firstName} ${lastName}`,
        motivation: '',
        status: isSonny ? 'approved' : 'pending',
        createdAt: new Date(),
      });
      
      // Dispatch the approval request email in the background
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
        window.location.href = '/dashboard';
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

  const handleForgotPassword = async (e: React.FormEvent) => {
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
      const isOtpValid = await verifyTOTP(pendingMfaProfile.mfaSecret, codeStr);
      const isBackupValid = pendingMfaProfile.mfaBackupCodes?.includes(codeStr.toUpperCase());
      
      if (isOtpValid || isBackupValid) {
        if (isBackupValid && !isOtpValid) {
          const db = getDb();
          const userDocRef = doc(db, 'users', pendingMfaUser.uid);
          const updatedBackupCodes = pendingMfaProfile.mfaBackupCodes.filter(
            (c: string) => c !== codeStr.toUpperCase()
          );
          await setDoc(userDocRef, { mfaBackupCodes: updatedBackupCodes }, { merge: true });
        }
        
        setIsNavigating(true);
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 850);
      } else {
        setAuthError('Invalid 6-digit code or backup recovery code.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('MFA validation error:', error);
      setAuthError('Error validating MFA. Please try again.');
      setIsSubmitting(false);
    }
  };

  const closeAuthModal = async () => {
    if (authMode === 'mfa' && pendingMfaUser) {
      await signOut(auth);
    }
    setShowAuthModal(false);
    setPendingMfaUser(null);
    setPendingMfaProfile(null);
    setAuthError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setMfaCode(['', '', '', '', '', '']);
    setAuthMode('signin');
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

  const handleMfaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
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

  const handleMfaPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (pasteData.length === 6 && !isNaN(Number(pasteData))) {
      const splitCode = pasteData.split('');
      setMfaCode(splitCode);
      handleVerifyMfa(pasteData);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {isNavigating && (
        <div className="fixed top-0 left-0 w-full h-1 bg-gray-900/10 z-[60]">
          <div className="h-full bg-green-600 animate-pulse w-full"></div>
        </div>
      )}
      
      {/* Pilot Warning Banner */}
      {showBanner && (
        <div className="bg-amber-50/95 backdrop-blur text-amber-900 py-2 sm:py-2.5 px-4 pr-4 sm:pr-40 text-center text-[10px] sm:text-xs font-semibold border-b border-amber-200 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 transition-all shrink-0 relative animate-in slide-in-from-top duration-300">
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider select-none shrink-0">
            ⚡ Pilot Preview
          </span>
          <span className="leading-relaxed">
            Non-Commercial Research Platform. Powered by Generative AI. Provided without warranty.
          </span>
          <div className="flex items-center gap-2 font-black shrink-0">
            <button onClick={() => setShowDatenschutz(true)} className="underline hover:text-green-750 transition-colors outline-none cursor-pointer">Privacy Policy</button>
            <span>•</span>
            <button onClick={() => setShowImpressum(true)} className="underline hover:text-green-750 transition-colors outline-none cursor-pointer">Legal Notice</button>
            <span className="text-amber-300">|</span>
            <button 
              onClick={dismissBanner}
              className="inline-flex items-center gap-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all outline-none cursor-pointer border border-amber-300/40 hover:scale-105 active:scale-95 shadow-sm ml-1"
              title="Dismiss warning"
            >
              <X size={10} strokeWidth={3} className="shrink-0" /> Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <div className="bg-green-600/10 p-2 rounded-xl hidden sm:block">
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mt-1">Non-Commercial Pilot</span>
            </div>
          </Link>
          <div className="shrink-0 flex items-center gap-3">
             <div className="hidden sm:flex text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full items-center gap-1">
               <Users size={14} /> Community Edition
             </div>
            {user ? (
              <button
                onClick={() => { setIsNavigating(true); router.push('/dashboard'); }}
                disabled={isNavigating}
                className="bg-gray-950 hover:bg-gray-800 text-white px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:bg-gray-900/70 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {isNavigating ? 'Loading...' : 'Go to Workspace'}
              </button>
            ) : (
              <div className="flex gap-1 sm:gap-2">
                <button
                  onClick={openSignInModal}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-6 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm sm:text-base"
                >
                  Get Pilot Access or Login
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 md:pt-40 md:pb-56 overflow-hidden bg-slate-50/30">
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(4deg); }
          }
          @keyframes float-slower {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(20px) rotate(-4deg); }
          }
          @keyframes drift-up-left {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.45; }
            85% { opacity: 0.45; }
            100% { transform: translateY(-500px) translateX(-25px); opacity: 0; }
          }
          @keyframes drift-up-right {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.65; }
            85% { opacity: 0.65; }
            100% { transform: translateY(-500px) translateX(25px); opacity: 0; }
          }
          @keyframes pulse-slow {
            0%, 100% { transform: scale(1); opacity: 0.22; }
            50% { transform: scale(1.18); opacity: 0.32; }
          }
          .animate-float-slow {
            animation: float-slow 7.5s ease-in-out infinite;
          }
          .animate-float-slower {
            animation: float-slower 9.5s ease-in-out infinite;
          }
          .animate-pulse-slow {
            animation: pulse-slow 8.5s ease-in-out infinite;
          }
        `}</style>

        {/* Background Mesh Gradient Blobs */}
        <div className="absolute top-[10%] left-[5%] w-[380px] h-[380px] bg-indigo-300 rounded-full blur-[130px] opacity-25 animate-pulse-slow z-0 pointer-events-none" />
        <div className="absolute top-[22%] right-[5%] w-[420px] h-[420px] bg-emerald-300 rounded-full blur-[150px] opacity-20 animate-float-slow z-0 pointer-events-none" />
        <div className="absolute bottom-[10%] left-[20%] w-[450px] h-[450px] bg-teal-200 rounded-full blur-[140px] opacity-20 animate-float-slower z-0 pointer-events-none" />

        {/* Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] z-0"></div>
        
        {/* Left Particle Column: Legacy ABAP */}
        <div className="hidden xl:flex absolute left-8 top-20 bottom-20 w-32 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: 'REPORT Z_LEGACY', top: '12%', delay: '0s' },
            { text: 'SELECT * FROM', top: '27%', delay: '1.8s' },
            { text: 'FORM GET_DATA', top: '44%', delay: '0.9s' },
            { text: 'CALL FUNCTION', top: '61%', delay: '2.5s' },
            { text: 'DATA: lv_count', top: '78%', delay: '3.4s' },
            { text: 'WRITE: / lv_val', top: '92%', delay: '4.8s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-slate-100 text-slate-400 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-slate-200/50 shadow-sm whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-left 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        {/* Right Particle Column: Modern TS */}
        <div className="hidden xl:flex absolute right-8 top-20 bottom-20 w-36 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: "import { Router }", top: '17%', delay: '0.4s' },
            { text: 'async function', top: '32%', delay: '2.2s' },
            { text: 'express.json()', top: '49%', delay: '1.4s' },
            { text: 'callGemini()', top: '66%', delay: '3.0s' },
            { text: 'new PrismaClient()', top: '81%', delay: '0.1s' },
            { text: 'res.status(200)', top: '94%', delay: '4.2s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-emerald-50 text-emerald-600 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-emerald-200/50 shadow-md shadow-emerald-500/5 whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-right 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-700 font-bold text-xs md:text-sm mb-8 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Users className="w-4 h-4" />
            <span className="uppercase tracking-wider">Join our non-commercial Pilot Program</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-gray-950 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            Transform Legacy Code <br className="hidden md:block" />
            into <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">Cloud-Native Node.js</span>
          </h1>
          <p className="text-lg md:text-2xl text-gray-700 max-w-3xl mx-auto mb-12 leading-relaxed font-light animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            Bridge legacy SAP and cloud-native agility. Automatically transform custom ABAP operations into clean-code architectures fully aligned with official SAP Clean Core guidelines.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
              <button
                onClick={user ? () => { setIsNavigating(true); router.push('/dashboard'); } : openSignInModal}
                disabled={isNavigating}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-12 py-5 rounded-2xl font-black text-lg transition-all shadow-lg hover:shadow-2xl hover:-translate-y-1 disabled:bg-green-500/50 disabled:cursor-not-allowed"
              >
                {isNavigating ? 'Loading...' : (user ? 'Open Workspace' : 'Get Pilot Access or Login')} <ArrowRight className="w-5 h-5" />
              </button>
              <a 
                href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
                download="Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-850 text-white px-8 py-5 rounded-2xl font-bold text-base transition-all shadow-md hover:shadow-lg hover:-translate-y-1"
              >
                <Download className="w-5 h-5 text-green-400" /> Download Whitepaper (PDF)
              </a>
            </div>
            <div className="flex items-center gap-2 mt-2 bg-slate-100 text-slate-700 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold font-mono">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span>LATEST COMMUNITY RELEASE: {APP_VERSION} ({APP_RELEASE_DATE})</span>
            </div>
          </div>
        </div>
        
        {/* Interactive Slideshow */}
        <div className="relative z-20 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-700">
          <LandingSlideshow />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 md:py-32 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">Pilot Features Overview</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Test the fully automated pipeline during our non-commercial pilot phase.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'Extensibility Routing',
                desc: 'Intelligently classifies legacy custom logic against SAP Clean Core guidelines, automatically separating In-App ABAP Cloud (RAP) from Side-by-Side BTP (CAP) tracks.'
              },
              {
                icon: <Globe className="w-8 h-8 text-green-600" />,
                title: 'SAP API Hub Mapping',
                desc: 'Directly maps legacy database table operations to released, public standard SAP APIs with interactive links to official API Hub listings.'
              },
              {
                icon: <Cpu className="w-8 h-8 text-green-600" />,
                title: 'Dual RAP & CAP Engine',
                desc: 'Generates clean In-App ABAP Cloud RAP handlers formatted as standard abapGit directories (src/ and abapgit.xml) for local ADT import, or decoupled BTP CAP Node.js services.'
              },
              {
                icon: <Activity className="w-8 h-8 text-green-600" />,
                title: 'Business Value Audit & TCO',
                desc: 'Quantifies technical debt and custom IP value. Features an interactive C-Level TCO & ROI calculator predicting upgrade-impact savings based on Clean Core Scores.'
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-green-600" />,
                title: 'ADT Cockpit Simulation',
                desc: 'Generates standard ABAP Unit classes with local database doubles, simulating execution in a virtual Eclipse ADT Test Cockpit console.'
              },
              {
                icon: <Sparkles className="w-8 h-8 text-green-600" />,
                title: 'BPMN 2.0 & AI Blueprints',
                desc: 'Maps modernized processes into standard BPMN 2.0 XML with coordinates and swimlanes for native SAP Signavio & Build imports, complete with AI Chatbot support.'
              },
              {
                icon: <Zap className="w-8 h-8 text-green-600" />,
                title: 'S/4HANA Live Bridge (BYOT)',
                desc: 'Connect live sandbox tenants using Basic Auth or standard BTP Destination JSON configs. Supports OAuth 2.0 SAML Bearer token exchange and Cloud Connector tunnels.'
              },
              {
                icon: <LayoutTemplate className="w-8 h-8 text-green-600" />,
                title: 'Premium Desktop Sync',
                desc: 'Run as a borderless, contextualized desktop client with native OS sync, context isolation, and secure local environment sandboxing.'
              },
              {
                icon: <Shield className="w-8 h-8 text-green-600" />,
                title: 'GDPR Sovereign Deletion',
                desc: 'Full Art. 17 DSGVO cascade-erasure. Permanently purge your profile, secure key vault, and project transformations with a single click.'
              }
            ].map((feature, idx) => (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: idx * 0.08, duration: 0.5, ease: 'easeOut' }}
                className="bg-white/40 backdrop-blur-md p-8 md:p-10 rounded-[2.5rem] border border-gray-200/60 hover:border-green-400 hover:bg-white/95 transition-all hover:shadow-xl hover:shadow-green-500/5 group hover:-translate-y-1.5 duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-8 border border-gray-100 shadow-sm group-hover:scale-110 transition-all duration-300 group-hover:bg-green-50 group-hover:shadow-md group-hover:border-green-200">
                    <div className="text-green-600 transition-colors">
                      {feature.icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black mb-4 text-gray-950 tracking-tight">{feature.title}</h3>
                  <p className="text-gray-700 leading-relaxed font-medium text-sm md:text-base">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section className="py-24 bg-slate-50/50 border-y border-gray-900/5 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="text-[10px] md:text-xs font-black bg-green-50 text-[#006b2c] px-3.5 py-1.5 rounded-full border border-green-150 uppercase tracking-widest inline-flex items-center gap-1.5 mb-4 select-none">
              🛡️ Sovereign & Secured
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-gray-950 tracking-tighter mb-4">
              Built on Trust and Enterprise Standards
            </h2>
            <p className="text-gray-600 font-medium text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              We design software architecture transformations with strict European safety standards, data sovereignty, and robust security frameworks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Globe className="w-6 h-6 text-green-600" />,
                title: "Belgium Hosting (Europe)",
                desc: "All workspaces, analytical engines, and database systems are hosted strictly in the europe-west1 GCP region (Belgium) ensuring high-speed processing."
              },
              {
                icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
                title: "DSGVO / GDPR Compliant",
                desc: "Full enforcement of Art. 17 DSGVO. Purge all user footprints, uploads, and data in Settings. Transactional emails are securely routed via Resend API with DSGVO imprints."
              },
              {
                icon: <Users className="w-6 h-6 text-green-600" />,
                title: "Non-Commercial Pilot",
                desc: "Purely research-oriented beta platform. Free access for enterprise architects to prototype decoupling side-by-side without licensing overhead."
              },
              {
                icon: <Shield className="w-6 h-6 text-green-600" />,
                title: "Hardened Stateless APIs",
                desc: "Your BYOK API credentials are encrypted in transit, proxied securely server-side, and never trained or exposed to public LLM builders."
              }
            ].map((trust, idx) => (
              <div 
                key={idx}
                className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-gray-200/60 hover:border-green-400 hover:shadow-xl hover:shadow-green-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                    {trust.icon}
                  </div>
                  <h3 className="text-lg font-black text-gray-950 tracking-tight mb-2 uppercase">{trust.title}</h3>
                  <p className="text-gray-600 text-xs md:text-sm leading-relaxed font-medium">{trust.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Licenses Section */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden" id="pricing">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">Pilot Licenses</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Join the community. Commercial use is not currently planned, but will be evaluated if the pilot phase proves successful.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                tier: 'Pilot Basic (Community)',
                price: 'Free',
                period: 'Non-Commercial Sandbox',
                features: [
                  'Up to 5 standard analyses',
                  'Standard Solution Designs',
                  'Community Feedback Access',
                  'Standard QA reports'
                ],
                notFeatures: [
                  'Modular ZIP Handover',
                  'Granular Sandbox Executions',
                  'BPMN 2.0 XML Exports',
                  'Confluence Blueprints'
                ],
                cta: 'Get Basic Access',
                highlight: false,
                icon: <CheckCircle2 className="w-6 h-6 text-gray-400" />,
                disabled: false
              },
              {
                tier: 'Pilot Starter (Developer Upgrade)',
                price: 'Free',
                period: 'Community Pilot — Instant Self-Service Key Upgrade',
                features: [
                  'Includes all Pilot Basic features',
                  'Unlimited transformations (via BYOK*)',
                  'Granular Sandbox Testing & Runs',
                  'BPMN 2.0 & Confluence Exports',
                  'Full Multi-File ZIP Handover',
                  'Bring Your Own Key (BYOK*) — Unlock via Settings!'
                ],
                notFeatures: [
                  'Commercial SLA',
                  'Corporate SSO Integration',
                  'Active JIRA / Azure DevOps Integration'
                ],
                cta: 'Unlock Developer Access',
                highlight: true,
                icon: <Key className="w-6 h-6 text-green-400 animate-pulse" />,
                disabled: false
              },
              {
                tier: 'Enterprise (Planned)',
                price: 'TBD',
                period: 'Future Commercial Release',
                features: [
                  'Unlimited team workspaces',
                  'Commercial license & SLA',
                  'SSO (Okta, Microsoft AD) ready',
                  'Custom On-Premise deployment options'
                ],
                cta: 'In Development',
                highlight: false,
                icon: <Globe className="w-6 h-6 text-gray-400" />,
                disabled: true
              }
            ].map((plan, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                whileHover={{ y: plan.disabled ? 0 : -8, transition: { duration: 0.2 } }}
                className={`relative flex flex-col p-8 rounded-[3rem] border transition-all duration-300 ${plan.highlight ? 'bg-gray-950 text-white border-gray-900 shadow-2xl z-10' : plan.disabled ? 'bg-gray-50 text-gray-400 border-gray-200 grayscale opacity-70' : 'bg-white text-gray-900 border-gray-200 hover:border-green-300 hover:shadow-xl'}`}>
                
                {plan.disabled && (
                  <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-gray-200 text-gray-500 border-gray-300 border text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                    Coming Soon
                  </div>
                )}
                
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black">{plan.tier}</h3>
                    {plan.icon}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">{plan.price}</span>
                  </div>
                  <p className={`text-xs md:text-sm font-medium mt-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>{plan.period}</p>
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((f, i) => {
                    const isAllBasic = f.toLowerCase().includes('all pilot basic');
                    return (
                      <li 
                        key={i} 
                        className={`flex items-start gap-3 text-sm ${
                          isAllBasic 
                            ? 'text-green-400 font-extrabold tracking-wide uppercase text-xs border border-green-500/30 bg-green-500/5 px-3 py-2 rounded-xl shadow-sm shadow-green-500/5' 
                            : 'font-bold'
                        }`}
                      >
                        <Check className={`w-5 h-5 shrink-0 ${isAllBasic ? 'text-green-400' : plan.highlight ? 'text-green-400' : plan.disabled ? 'text-gray-400' : 'text-green-600'}`} /> {f}
                      </li>
                    );
                  })}
                  {plan.notFeatures?.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm font-bold opacity-40">
                      <X className="w-5 h-5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                <button 
                  onClick={plan.disabled ? undefined : openSignInModal}
                  disabled={plan.disabled}
                  className={`w-full py-4 rounded-2xl font-black text-sm transition-all ${plan.highlight ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-900/40' : plan.disabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 text-center text-xs md:text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed border border-gray-100 bg-gray-50/50 p-5 rounded-3xl shadow-sm">
            <span className="font-extrabold text-gray-800 uppercase tracking-wider block mb-1">* BYOK (Bring Your Own Key)</span>
            Use your own Google Gemini API key to run unlimited transformations without any platform limits. Your API key remains securely stored locally in your browser and is never sent or saved on our servers, ensuring absolute privacy and data sovereignty.
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="py-24 md:py-32 bg-gray-950 text-white text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter">Ready to join the community?</h2>
          <p className="text-lg md:text-xl text-gray-400 mb-12 font-light max-w-2xl mx-auto">Help us shape the future of Core Transformations. Join our pilot program for free.</p>
          <button
            onClick={user ? () => { setIsNavigating(true); router.push('/dashboard'); } : openSignInModal}
            disabled={isNavigating}
            className="bg-green-600 hover:bg-green-700 text-white px-10 md:px-12 py-4 md:py-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-green-900/20 hover:-translate-y-1 disabled:bg-gray-700 disabled:cursor-not-allowed"
          >
            {isNavigating ? 'Loading...' : (user ? 'Go to Workspace' : 'Get Pilot Access or Login')}
          </button>
          
          <div className="mt-24 pt-12 border-t border-gray-800 text-sm text-gray-500 font-light">
            <p>&copy; 2026 Clean-Core.io. All rights reserved.</p>
            <p className="mt-2 text-xs text-gray-600 font-mono font-bold uppercase tracking-wider">
              System Version: {APP_VERSION} • {APP_RELEASE_DATE}
            </p>
            <p className="mt-4 flex flex-wrap justify-center gap-4">
              <button onClick={() => setShowImpressum(true)} className="hover:text-white transition-colors">Legal Notice</button>
              <span className="text-gray-800">|</span>
              <button onClick={() => setShowDatenschutz(true)} className="hover:text-white transition-colors">Privacy Policy</button>
            </p>
            <div className="mt-12 text-[10px] text-gray-500 max-w-2xl mx-auto leading-relaxed border border-gray-900 bg-gray-950/50 p-6 rounded-2xl text-left space-y-3">
              <span className="font-extrabold text-gray-400 uppercase tracking-widest block border-b border-gray-900 pb-1.5">Legal Disclaimer & Pilot Status</span>
              <p>
                <strong>Non-Commercial Developer Sandbox:</strong> Clean-Core.io is operated exclusively as a non-commercial, open-source research and prototyping platform under administrative developer oversight (Felix Frenzel). No commercial licensing, subscriptions, or paid services are offered.
              </p>
              <p>
                <strong>AI Transformations & "As-Is" Provisioning:</strong> All solution designs, compliance scores, modular code transformations, documentation blueprints, and sandboxed test suites are dynamically generated utilizing third-party generative AI models (Google Gemini API). This platform and all compiled artifacts are provided strictly on an <em>"AS IS"</em> and <em>"AS AVAILABLE"</em> basis, without any warranties or guarantees of any kind, express or implied, including but not limited to the correctness, compilation, performance, security, or commercial compliance of the generated results. Developers must independently review, test, and validate all outputs before any commercial or production usage.
              </p>
              <p>
                <strong>Limitation of Liability:</strong> In no event shall the administrator, contributors, or developers be held liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of data, system crashes, integration failures, or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort arising in any way out of the use of this software, even if advised of the possibility of such damage.
              </p>
              <p>
                <strong>Data Privacy & GDPR:</strong> This platform is deployed on secure European cloud nodes in the Belgium (europe-west1) region. Secure stateless proxy layers ensure that uploaded legacy codes are never saved, persisted, or utilized by Google for LLM model training. All users retain the absolute right to immediate, recursive erasure (Art. 17 GDPR) via the settings dashboard.
              </p>
            </div>
          </div>
        </div>
      </footer>

      <LegalOverlay isOpen={showImpressum} onClose={() => setShowImpressum(false)} title="Legal Notice (Impressum)">
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

      {/* Premium Authentication Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative"
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
                  <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-2">Reset Password</h3>
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
                      onClick={() => { setAuthMode('signin'); setAuthError(''); }}
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
                  <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-2">Check your Inbox</h3>
                  <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
                    We've sent a password reset link to <span className="font-bold text-gray-900">{email}</span>. Please click the link in that email to reset your credentials.
                  </p>

                  <button
                    onClick={() => { setAuthMode('signin'); setEmail(''); setAuthError(''); }}
                    className="w-full bg-gray-950 hover:bg-gray-800 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : authMode === 'signup' ? (
                /* Sign Up Screen */
                <form onSubmit={handleEmailSignUp} className="p-8 sm:p-10">
                  <div className="text-center mb-6">
                    <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-1">Create Account</h3>
                    <p className="text-xs font-bold text-gray-500">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                        className="text-green-600 hover:underline"
                      >
                        Sign In
                      </button>
                    </p>
                  </div>

                  <div className="space-y-4">
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

                    {authError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
                        <X size={14} className="shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || (!!confirmPassword && password !== confirmPassword)}
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
                    <p className="text-xs font-bold text-gray-500">
                      New to the pilot?{' '}
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                        className="text-green-600 hover:underline"
                      >
                        Create Account
                      </button>
                    </p>
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
                          onClick={() => { setAuthMode('forgot'); setAuthError(''); }}
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
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

