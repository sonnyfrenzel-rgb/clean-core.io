'use client';

import { useState, useEffect } from 'react';
import { useUserProfile, UserProfile } from '@/hooks/useUserProfile';
import { useRouter } from 'next/navigation';
import { 
  User, Mail, Shield, Zap, Crown, Infinity, 
  Clock, Edit2, CheckCircle2, AlertCircle, 
  LifeBuoy, Send, MessageSquare, Eye, EyeOff,
  Trash2, KeyRound, Loader2, Sun, Moon, Monitor,
  Database, Save, Lock, ShieldCheck, Key, RefreshCw, 
  ArrowLeft, Copy, Download, Smartphone, Check, X, ArrowRight, Globe
} from 'lucide-react';
import { addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getDb, getAuth, handleFirestoreError, OperationType } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword as firebaseUpdatePassword } from 'firebase/auth';
import { generateSecret, verifyTOTP, generateBackupCodes, generateOtpauthUrl } from '@/lib/totp';
import { motion, AnimatePresence } from 'motion/react';
import { callGemini } from '@/lib/gemini';
import { clsx } from 'clsx';

export default function SettingsPage() {
  const router = useRouter();
  const { profile, loading, updateProfile } = useUserProfile();
  const isPilotTier = !!profile && ['pilot', 'pilot_byok', 'starter', 'unlimited'].includes(profile.tier);
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

  // GDPR Account Deletion
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>('light');
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [defaultView, setDefaultView] = useState<'dashboard' | 'analytics' | 'transformation'>('dashboard');
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pwChangeStatus, setPwChangeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pwChangeError, setPwChangeError] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // 2FA Setup States
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSetupStep, setMfaSetupStep] = useState<1 | 2 | 3>(1);
  const [tempMfaSecret, setTempMfaSecret] = useState('');
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([]);
  const [mfaSetupError, setMfaSetupError] = useState('');
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  // 2FA Disable States
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [mfaDisableError, setMfaDisableError] = useState('');

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

  const handleStartMfaSetup = () => {
    const secret = generateSecret();
    setTempMfaSecret(secret);
    setMfaSetupStep(1);
    setMfaVerifyCode('');
    setMfaSetupError('');
    setShowMfaSetup(true);
  };

  const handleVerifyMfaSetup = async () => {
    setMfaSetupError('');
    setIsVerifyingMfa(true);
    try {
      const isValid = await verifyTOTP(tempMfaSecret, mfaVerifyCode);
      if (isValid) {
        const backupCodes = generateBackupCodes();
        setGeneratedBackupCodes(backupCodes);
        
        // Save to Firestore
        await updateProfile({
          mfaEnabled: true,
          mfaSecret: tempMfaSecret,
          mfaBackupCodes: backupCodes
        });
        
        setMfaSetupStep(3);
      } else {
        setMfaSetupError('Invalid 6-digit verification code. Please check your authenticator app.');
      }
    } catch (err) {
      console.error(err);
      setMfaSetupError('Error validating code.');
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const handleDisableMfa = async () => {
    setMfaDisableError('');
    setIsDisablingMfa(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) throw new Error('No user found.');
      
      // If password-based account, require re-authentication for safety
      if (profile?.authMethod === 'password' && currentUser.email) {
        const credential = EmailAuthProvider.credential(currentUser.email, disablePassword);
        await reauthenticateWithCredential(currentUser, credential);
      }
      
      // Disable in Firestore
      await updateProfile({
        mfaEnabled: false,
        mfaSecret: '',
        mfaBackupCodes: []
      });
      
      setShowMfaDisable(false);
      setDisablePassword('');
    } catch (error: any) {
      console.error('Disable 2FA error:', error);
      let errorMsg = 'Failed to disable 2FA. Please verify your password.';
      if (error.code === 'auth/wrong-password') {
        errorMsg = 'Incorrect password.';
      }
      setMfaDisableError(errorMsg);
    } finally {
      setIsDisablingMfa(false);
    }
  };

  // Sync state with profile once loaded
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setThemePreference(profile.theme || 'light');
      setBackupEnabled(profile.backupEnabled !== false); // default true
      setDefaultView(profile.landingPageDefault || 'dashboard');

      // Load S4 Config if present
      if (profile.s4Config) {
        setS4Url(profile.s4Config.url || '');
        setS4Username(profile.s4Config.username || '');
        setS4Password(profile.s4Config.password || '');
        setS4AuthType(profile.s4Config.authType || 'basic');
        setS4TokenUrl(profile.s4Config.tokenUrl || '');
        setBtpDestinationJson(profile.s4Config.btpDestinationJson || '');
      }
    }
  }, [profile]);

  // Redirect to dashboard if profile doesn't exist
  useEffect(() => {
    if (!loading && !profile) {
      router.push('/dashboard');
    }
  }, [profile, loading, router]);

  // Handle local dark/light toggles instantly
  useEffect(() => {
    const root = window.document.documentElement;
    if (themePreference === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (themePreference === 'light') {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      // system
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', systemDark);
      localStorage.setItem('theme', 'system');
    }
  }, [themePreference]);

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
      await updateProfile({
        theme: themePreference,
        backupEnabled,
        landingPageDefault: defaultView
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } catch (error) {
      console.error('Error saving system preferences:', error);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isPilotTier || !geminiKey.trim()) return;
    setIsSavingKey(true);
    try {
      await updateProfile({ geminiApiKey: geminiKey.trim() });
      setKeySaved(true);
      setGeminiKey('');
      setValidationStatus('idle'); // Reset test connection banner after saving
      setTimeout(() => setKeySaved(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestConnection = async () => {
    const testKey = geminiKey.trim() || profile?.geminiApiKey;
    if (!testKey) {
      setValidationStatus('error');
      setValidationError('Please enter or save a Gemini API Key first.');
      return;
    }

    setIsValidatingKey(true);
    setValidationStatus('idle');
    setValidationError('');

    try {
      // Light connectivity request to proxy endpoint
      await callGemini("Ping. Respond with exactly 'OK' to confirm connectivity.", 'gemini-3-flash-preview', false, testKey);
      setValidationStatus('success');
    } catch (error) {
      console.error('Gemini Key connectivity test failed:', error);
      setValidationStatus('error');
      setValidationError(error instanceof Error ? error.message : 'Invalid API key or network error.');
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm('Are you sure you want to securely remove your Gemini API Key? This will revert you back to standard limits.')) {
      return;
    }

    setIsDeletingKey(true);
    try {
      await updateProfile({ geminiApiKey: '' });
      setGeminiKey('');
      setValidationStatus('idle');
    } catch (error) {
      console.error('Error removing API Key:', error);
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
      const res = await fetch('/api/request-tenant-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

      // 3. Persist the requested flag in the Firestore UserProfile so UI retains pending state
      await updateProfile({
        s4TenantAccessRequested: true
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
      const updates = {
        s4Config: {
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          tokenUrl: s4AuthType === 'oauth2' ? s4TokenUrl : '',
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : ''
        }
      };
      await updateProfile(updates);
      setConnectionMessage("Configuration saved successfully.");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err) {
      console.error("Failed to save S/4 config:", err);
      setConnectionMessage("Failed to save configuration.");
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
      const res = await fetch('/api/test-s4-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt(
      "GDPR Right to Erasure (Art. 17 GDPR):\n" +
      "To permanently and irrevocably erase all your personal data, uploaded source codes, API keys, and transformation projects, please confirm by entering your email address:"
    );

    if (!confirmation || confirmation.trim().toLowerCase() !== profile?.email.toLowerCase()) {
      alert("Confirmation failed. The entered email address does not match your profile.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const db = getDb();
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user found.");

      const uid = currentUser.uid;

      // 1. Delete all projects belonging to the user
      const projectsCollection = collection(db, 'projects');
      const projectsQuery = query(projectsCollection, where('userId', '==', uid));
      const projectsSnapshot = await getDocs(projectsQuery);

      const projectDeletePromises = projectsSnapshot.docs.map(docSnap => 
        deleteDoc(doc(db, 'projects', docSnap.id))
      );
      await Promise.all(projectDeletePromises);

      // 2. Delete all abap examples uploaded by the user
      const examplesCollection = collection(db, 'abap_examples');
      const examplesQuery = query(examplesCollection, where('userId', '==', uid));
      const examplesSnapshot = await getDocs(examplesQuery);

      const exampleDeletePromises = examplesSnapshot.docs.map(docSnap => 
        deleteDoc(doc(db, 'abap_examples', docSnap.id))
      );
      await Promise.all(exampleDeletePromises);

      // 3. Delete user document in registration_requests
      await deleteDoc(doc(db, 'registration_requests', uid));

      // 4. Delete user document in users
      await deleteDoc(doc(db, 'users', uid));

      // 5. Delete Firebase Auth User account
      await currentUser.delete();

      // 6. Redirect to landing page
      alert("Your user account and all associated data have been successfully and permanently removed from our system in accordance with GDPR (Right to Erasure). Thank you for participating in the Community Pilot.");
      router.push('/');
    } catch (error: any) {
      console.error("GDPR Account Erasure failed:", error);

      if (error.code === 'auth/requires-recent-login') {
        alert("Security restriction: Deleting your account requires a recent login. Please sign out, sign back in, and try deleting your account again.");
      } else {
        alert("GDPR erasure failed or is incomplete: " + (error.message || error));
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const getTierInfo = (tier: string = 'pilot', hasCustomKey: boolean = false) => {
    if (hasCustomKey && (tier === 'pilot' || tier === 'pilot_byok')) {
      return { 
        icon: <Infinity className="text-purple-600 animate-pulse" />, 
        label: 'Pilot (BYOK Active)', 
        color: 'bg-purple-50 border-purple-100 shadow-md shadow-purple-50', 
        text: 'Your custom Gemini API Key is active. Transformations are unlimited under your key.' 
      };
    }

    switch (tier) {
      case 'pilot_byok': return { icon: <Infinity className="text-purple-600" />, label: 'BYOK Pilot', color: 'bg-purple-50 border-purple-100', text: 'Bring Your Own Key for limitless pilot transformations.' };
      default: return { icon: <Shield className="text-gray-600" />, label: 'Pilot Standard', color: 'bg-gray-50 border-gray-100', text: 'Limited to 5 transformations for testing.' };
    }
  };

  const tierInfo = getTierInfo(profile?.tier, !!profile?.geminiApiKey);

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
              <button 
                onClick={() => {
                  setIsEditing(!isEditing);
                  setFirstName(profile?.firstName || '');
                  setLastName(profile?.lastName || '');
                }}
                className="flex items-center gap-2 text-xs md:text-sm font-bold text-green-600 hover:text-green-700 transition-all bg-green-50 px-3 md:px-4 py-2 rounded-xl"
              >
                <Edit2 size={16} /> {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">First Name</label>
                    <input 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Last Name</label>
                    <input 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900"
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isUpdating}
                  className="w-full bg-gray-950 text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-xl transition-all disabled:bg-gray-400"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
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
              
              {prefsSaved && (
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-green-100 text-green-700 px-3 py-1.5 rounded-full border border-green-200 flex items-center gap-1.5 animate-bounce">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>
            
            <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
              Personalize your Clean-Core workspace theme, configure background backup sync behaviors, and map your default start layouts.
            </p>

            <form onSubmit={handleSavePreferences} className="space-y-6 text-gray-900">
              {/* Visual Theme Selector */}
              <div>
                <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-3">
                  Visual Theme
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setThemePreference('light')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                      themePreference === 'light'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Sun size={16} /> Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemePreference('dark')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                      themePreference === 'dark'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Moon size={16} /> Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemePreference('system')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                      themePreference === 'system'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Monitor size={16} /> System
                  </button>
                </div>
              </div>

              {/* Grid layout for other settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2.5">
                    Default Landing View
                  </label>
                  <select
                    value={defaultView}
                    onChange={(e: any) => setDefaultView(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900 text-sm"
                  >
                    <option value="dashboard">Dashboard Workspace</option>
                    <option value="analytics">Technical Analytics</option>
                    <option value="transformation">Code Transformation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2.5">
                    Automated Backup Sync
                  </label>
                  <div className="flex items-center justify-between h-[46px] bg-gray-50 border border-gray-200 px-4 rounded-xl">
                    <span className="text-xs font-bold text-gray-700">Auto-save projects</span>
                    <button
                      type="button"
                      onClick={() => setBackupEnabled(!backupEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                        backupEnabled ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          backupEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSavingPrefs}
                  className="w-full bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white py-3.5 rounded-2xl font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg shadow-green-600/10 hover:scale-[1.01]"
                >
                  {isSavingPrefs ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Saving Preferences...
                    </>
                  ) : prefsSaved ? (
                    <>
                      <CheckCircle2 size={16} />
                      Preferences Saved!
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Preferences
                    </>
                  )}
                </button>
              </div>
            </form>
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
                    {profile?.mfaEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {profile?.mfaEnabled ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50/50 border border-green-100 rounded-2xl text-xs text-green-800 font-medium">
                      <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Two-Factor Authentication is Active</p>
                      <p className="mt-1 text-green-700/90 leading-relaxed">Your account is fortified with standard TOTP protection. Please keep your backup codes safe.</p>
                    </div>

                    {/* View Backup Codes toggle */}
                    {profile.mfaBackupCodes && profile.mfaBackupCodes.length > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Available Recovery Backup Codes</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs font-bold text-gray-800">
                          {profile.mfaBackupCodes.map((code: string, i: number) => (
                            <span key={i} className="bg-white border border-gray-150 px-2 py-1.5 rounded-lg text-center select-all">{code}</span>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 font-medium">Each code can only be used once. Copy them to a safe location.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowMfaDisable(true)}
                      className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold px-5 py-3 rounded-xl transition-all text-xs flex items-center gap-2"
                    >
                      <X size={14} /> Disable Two-Factor Authentication
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-600 font-medium leading-relaxed">
                      TOTP (Time-based One-Time Passwords) is 100% free and offline-secure. You can use standard applications such as Google Authenticator, 1Password, or Authy to enroll.
                    </div>
                    <button
                      type="button"
                      onClick={handleStartMfaSetup}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-3.5 rounded-xl transition-all text-xs flex items-center gap-2 shadow-sm"
                    >
                      <Smartphone size={14} /> Enable Two-Factor Authentication
                    </button>
                  </div>
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
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Current Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type={showCurrentPw ? 'text' : 'password'}
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-gray-50 border border-gray-200 pl-11 pr-11 py-3.5 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPw(!showCurrentPw)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                        >
                          {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type={showNewPw ? 'text' : 'password'}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-gray-50 border border-gray-200 pl-11 pr-11 py-3.5 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPw(!showNewPw)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                          >
                            {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>

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

                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Confirm New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type={showNewPw ? 'text' : 'password'}
                            required
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3.5 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition-all font-medium text-gray-900 text-sm"
                          />
                        </div>
                        {confirmNewPassword && newPassword !== confirmNewPassword && (
                          <p className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1">
                            <X size={10} /> Passwords do not match
                          </p>
                        )}
                        {confirmNewPassword && newPassword === confirmNewPassword && (
                          <p className="text-[10px] font-bold text-green-600 mt-1 flex items-center gap-1">
                            <Check size={10} /> Passwords match
                          </p>
                        )}
                      </div>
                    </div>

                    {pwChangeStatus === 'success' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-green-600" />
                        <span>Password changed successfully!</span>
                      </div>
                    )}

                    {pwChangeStatus === 'error' && (
                      <div className="p-4 bg-rose-50 border border-rose-250 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-600" />
                        <span>{pwChangeError || 'Error updating password.'}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Updating...
                        </>
                      ) : (
                        <>
                          <Key size={14} /> Update Password
                        </>
                      )}
                    </button>
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
                
                {profile?.geminiApiKey && (
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full border border-purple-200">
                    BYOK Active
                  </span>
                )}
              </div>
              
              <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
                Add your own Google Gemini API Key to bypass the standard 5-transformations pilot limit. Your credentials are encrypted in transit, proxied through our secure backend, and never exposed to the client-side bundle.
              </p>

              <form onSubmit={handleSaveKey} className="space-y-6 text-gray-900">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Gemini API Key
                    </label>
                    {profile?.geminiApiKey && (
                      <span className="text-[11px] font-bold text-green-600 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Currently configured
                      </span>
                    )}
                  </div>
                  
                  <div className="relative">
                    <input 
                      type={showKey ? "text" : "password"}
                      value={geminiKey}
                      onChange={(e) => {
                        setGeminiKey(e.target.value);
                        if (validationStatus !== 'idle') setValidationStatus('idle');
                      }}
                      placeholder={profile?.geminiApiKey ? "••••••••••••••••••••••••••••••••" : "AIzaSy..."}
                      className="w-full bg-gray-50 border border-gray-200 pl-4 pr-12 py-3.5 rounded-xl focus:ring-2 focus:ring-purple-600 outline-none transition-all font-medium text-gray-900 font-mono text-sm tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                      title={showKey ? "Hide API Key" : "Show API Key"}
                    >
                      {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Validation Response Banners */}
                {validationStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-4 rounded-xl text-xs md:text-sm font-medium flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                    <div>
                      <p className="font-bold text-emerald-900 mb-0.5">Connection test successful!</p>
                      <p className="text-emerald-700/90 leading-normal">Your custom API key successfully authenticated with Google Gemini services and is ready for use.</p>
                    </div>
                  </motion.div>
                )}

                {validationStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-rose-50 border border-rose-200 text-rose-950 p-4 rounded-xl text-xs md:text-sm font-medium flex items-start gap-2.5"
                  >
                    <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} />
                    <div>
                      <p className="font-bold text-rose-900 mb-0.5">Connection test failed</p>
                      <p className="text-rose-700/90 leading-normal">{validationError || 'The API key did not pass authentication. Please check your credentials.'}</p>
                    </div>
                  </motion.div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isValidatingKey || (!geminiKey.trim() && !profile?.geminiApiKey)}
                    className="flex-1 bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 text-gray-900 py-3.5 px-4 rounded-xl font-bold transition-all disabled:opacity-50 disabled:bg-gray-50 flex items-center justify-center gap-2 text-sm shadow-sm"
                  >
                    {isValidatingKey ? (
                      <>
                        <Loader2 className="animate-spin text-purple-600 animate-duration-1000" size={16} />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <Zap size={16} className="text-purple-600" />
                        Test Connection
                      </>
                    )}
                  </button>

                  <button 
                    type="submit" 
                    disabled={isSavingKey || !geminiKey.trim()}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3.5 px-4 rounded-xl font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg shadow-purple-600/10"
                  >
                    {isSavingKey ? (
                      <>
                        <Loader2 className="animate-spin animate-duration-1000" size={16} />
                        Saving Key...
                      </>
                    ) : keySaved ? (
                      <>
                        <CheckCircle2 size={16} />
                        API Key Saved!
                      </>
                    ) : (
                      'Save API Key'
                    )}
                  </button>

                  {profile?.geminiApiKey && (
                    <button 
                      type="button"
                      onClick={handleDeleteKey}
                      disabled={isDeletingKey}
                      className="sm:w-12 w-full bg-red-50 hover:bg-red-100 text-red-600 py-3.5 px-4 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-red-100"
                      title="Delete saved API key"
                    >
                      {isDeletingKey ? <Loader2 className="animate-spin animate-duration-1000" size={16} /> : <Trash2 size={16} />}
                      <span className="sm:hidden text-sm">Delete API Key</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

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
                    <CheckCircle2 size={12} /> Active / Premium
                  </span>
                ) : profile?.s4TenantAccessRequested ? (
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <Clock size={12} /> Pending Review
                  </span>
                ) : null}
              </div>
              
              <p className="text-gray-650 font-medium mb-4 text-sm md:text-base leading-relaxed">
                Connect your custom, non-productive S/4HANA Cloud or On-Premise systems (BYOT) directly inside the Stage 5 testing sandbox to run integrations, OData connection tests, and live schema validation.
              </p>

              <div className="bg-sky-50/60 border border-sky-200 p-4 rounded-2xl mb-8 flex items-start gap-3">
                <Globe className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-sky-900 mb-1">Pilot Connectivity Mode</p>
                  <p className="text-[11px] text-sky-800/90 leading-relaxed font-medium">
                    The &quot;Test Connection&quot; button performs a real HTTP handshake against your S/4HANA endpoint to verify reachability and authentication status. Full OData entity integration is planned for a future release.
                  </p>
                </div>
              </div>

              {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
                <form onSubmit={saveS4Config} className="space-y-6 text-gray-900">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Tenant HTTPS URL</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          required
                          value={s4Url}
                          onChange={e => setS4Url(e.target.value)}
                          placeholder="https://my300120-api.s4hana.cloud.sap"
                          className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-11"
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 font-semibold block leading-relaxed">
                        Must start with <span className="font-bold">https://</span>. Production domains are automatically blocked.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Authentication Type</label>
                      <select
                        value={s4AuthType}
                        onChange={e => setS4AuthType(e.target.value as any)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-11"
                      >
                        <option value="basic">Basic Authentication</option>
                        <option value="oauth2">OAuth 2.0 Client Credentials</option>
                        <option value="sap_hub">SAP Accelerator Hub Sandbox Key</option>
                        <option value="btp_destination">SAP BTP Destination Service (JSON)</option>
                      </select>
                    </div>

                    {s4AuthType === 'oauth2' && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">OAuth 2.0 Token URL</label>
                        <div className="relative">
                          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="url"
                            required
                            value={s4TokenUrl}
                            onChange={e => setS4TokenUrl(e.target.value)}
                            placeholder="https://mysubaccount.authentication.eu10.hana.ondemand.com/oauth/token"
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-11"
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-semibold block leading-relaxed">
                          The XSUAA or IAS token endpoint URL from your BTP subaccount. Used for <span className="font-bold">grant_type=client_credentials</span>.
                        </span>
                      </div>
                    )}

                    {s4AuthType === 'btp_destination' && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">SAP BTP Destination JSON Configuration</label>
                        <textarea
                          required
                          value={btpDestinationJson}
                          onChange={e => handleBtpJsonChange(e.target.value)}
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
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-40 font-mono resize-none"
                        />
                        <span className="text-[10px] text-gray-400 font-semibold block leading-relaxed">
                          Paste the full JSON export from the BTP Cockpit Destination Service. Supports <span className="font-bold">BasicAuthentication</span>, <span className="font-bold">OAuth2ClientCredentials</span>, and <span className="font-bold">PrincipalPropagation</span>.
                        </span>
                      </div>
                    )}

                    {s4AuthType !== 'sap_hub' && s4AuthType !== 'btp_destination' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                            {s4AuthType === 'oauth2' ? 'Client ID' : 'Username'}
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              required
                              value={s4Username}
                              onChange={e => setS4Username(e.target.value)}
                              placeholder={s4AuthType === 'oauth2' ? 'sb-clone-xxxx...' : 'CC_INTEGRATOR'}
                              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-11"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                            {s4AuthType === 'oauth2' ? 'Client Secret' : 'Password'}
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type={showS4Password ? "text" : "password"}
                              required
                              value={s4Password}
                              onChange={e => setS4Password(e.target.value)}
                              placeholder="••••••••••••••••"
                              className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-11"
                            />
                            <button
                              type="button"
                              onClick={() => setShowS4Password(!showS4Password)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              {showS4Password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {connectionMessage && (
                    <div className={clsx(
                      "p-4 rounded-xl border text-xs font-bold transition-all",
                      connectionStatus === 'connected' ? "bg-green-50 border-green-200 text-green-800" :
                      connectionStatus === 'failed' ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-800"
                    )}>
                      {connectionMessage}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleTestS4Connection}
                      disabled={testingConnection || !s4Url}
                      className="flex-1 h-11 flex items-center justify-center gap-2 bg-gradient-to-br from-blue-600 to-sky-650 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                    >
                      {testingConnection ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Connection...</> : <><Globe className="w-4 h-4" /> Test Connection</>}
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="flex-1 h-11 flex items-center justify-center gap-2 bg-gradient-to-br from-gray-900 to-slate-800 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                    >
                      {isSavingConfig ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Connection</>}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  {/* Instructions */}
                  <div className="bg-sky-50/50 border border-sky-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-sky-950 uppercase tracking-widest mb-3">📋 Instructions (Setup Guide)</h3>
                    <ol className="list-decimal pl-4 text-xs text-sky-850 space-y-2 font-medium">
                      <li><strong>Request access:</strong> Use the form below to request pilot access for your organization.</li>
                      <li><strong>Provide HTTPS endpoint:</strong> Set up a secure HTTPS connection to your S/4HANA sandbox or test system.</li>
                      <li><strong>Configure credentials:</strong> Once approved, you can configure your credentials (Basic Auth or OAuth 2.0).</li>
                      <li><strong>Test & use connection:</strong> Run live test cases against OData interfaces directly from the Stage 5 testing environment.</li>
                    </ol>
                  </div>

                  {/* Security Measures */}
                  <div className="bg-green-50/50 border border-green-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-green-950 uppercase tracking-widest mb-3">🛡️ Security Measures & Explanations</h3>
                    <ul className="list-disc pl-4 text-xs text-green-850 space-y-2 font-medium">
                      <li><strong>Browser-side Encryption:</strong> All passwords and tokens are encrypted locally in the browser before being transmitted to the proxy tunnel.</li>
                      <li><strong>Production Block:</strong> Access to production interfaces (<code className="bg-green-100 px-1 py-0.5 rounded font-mono text-[10px]">*-api.s4hana.ondemand.com</code>) is blocked by the system.</li>
                      <li><strong>Sandboxed Execution:</strong> Data connections are routed through an isolated BTP proxy channel to comply with CORS policies and protect your IP address.</li>
                    </ul>
                  </div>

                  {/* Disclaimer */}
                  <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-amber-950 uppercase tracking-widest mb-2">⚠️ Warranty Disclaimer</h3>
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      This platform is a non-commercial community pilot environment. Access is provided entirely without warranty, guarantee, or liability. Under no circumstances should you use productive ERP data or real passwords.
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
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          Description of your pilot use case (Motivation)
                        </label>
                        <textarea 
                          value={byotMotivation}
                          onChange={(e) => setByotMotivation(e.target.value)}
                          placeholder="E.g., connecting our non-productive S/4HANA Public Cloud Sandbox to validate OData interfaces..."
                          rows={3}
                          className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-sky-600 outline-none transition-all font-medium text-gray-900 text-sm leading-relaxed"
                          required
                        />
                      </div>

                      {byotStatus === 'success' && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-emerald-50 border border-emerald-250 text-emerald-950 p-4 rounded-xl text-xs font-medium"
                        >
                          Request successfully submitted!
                        </motion.div>
                      )}

                      {byotStatus === 'error' && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-rose-50 border border-rose-250 text-rose-950 p-4 rounded-xl text-xs font-medium"
                        >
                          {byotError || 'Error submitting request. Please try again.'}
                        </motion.div>
                      )}

                      <button 
                        type="submit" 
                        disabled={isRequestingByot || !byotMotivation.trim()}
                        className="w-full bg-gradient-to-br from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white py-3 px-4 rounded-xl font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-xs shadow-md"
                      >
                        {isRequestingByot ? (
                          <>
                            <Loader2 className="animate-spin" size={14} />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            Request Access for Live S/4HANA
                          </>
                        )}
                      </button>
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
                <p className="text-xs text-red-700/80 text-center max-w-sm">We are removing all your projects, custom source code uploads, pilot registration requests, profile configuration preferences, and core authentication credentials from our database.</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-sm md:text-base shadow-sm"
              >
                <Trash2 size={18} />
                Permanently Delete Account (GDPR Art. 17)
              </button>
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
                  {profile?.geminiApiKey 
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
            <h3 className="text-xl font-black mb-4 tracking-tight">Community Pilot Status</h3>
            <p className="text-gray-400 text-sm font-medium mb-8">You are currently participating in our closed pilot program.</p>
            <div className="bg-white/10 p-4 rounded-xl border border-white/20 mb-6">
              <p className="text-xs text-white/80 leading-relaxed font-medium">To talk about a commercial license, unlocking more transformations, or if you want to Bring Your Own Key (BYOK), simply <a href="mailto:info@clean-core.io" className="text-green-400 hover:text-green-300 font-bold underline">contact the admin</a>.</p>
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
                  Your profile and project assets are hosted on secure European cloud nodes (Google Firebase). We conform fully to GDPR (DSGVO) standards. You can download or cascadingly erase all your data instantly inside the Settings Danger Zone at any time.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <span className="font-bold text-white block uppercase tracking-wider mb-1">🤖 AI Processing Notice</span>
                <p className="leading-relaxed">
                  Code analysis, solution design mapping, test cases, and modernizations are dynamically synthesized using Generative AI models. AI systems may output incorrect code, hallucinations, or compile issues.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <span className="font-bold text-amber-500 block uppercase tracking-wider mb-1">⚠️ Pilot Warranty Disclaimer</span>
                <p className="leading-relaxed italic text-slate-400">
                  This application is a <strong>non-commercial pilot preview</strong>. Operations are provided completely <strong>without warranty, guarantees, or liability</strong> of any kind. All generated codes must be vetted by qualified architects before deployment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA Setup Step Modal */}
      <AnimatePresence>
        {showMfaSetup && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative"
            >
              {/* Close Button */}
              {mfaSetupStep !== 3 && (
                <button
                  onClick={() => setShowMfaSetup(false)}
                  className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors z-10"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              )}

              <div className="p-8 sm:p-10">
                {/* Steps Header indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        mfaSetupStep >= step ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {mfaSetupStep === 1 ? (
                  /* Step 1: Scan QR Code */
                  <div className="space-y-6">
                    <h3 className="text-2xl font-black text-gray-950 tracking-tight">1. Scan Authenticator QR</h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">
                      Open your standard authenticator application (Google Authenticator, Authy, etc.) and scan the secret code below:
                    </p>

                    {/* Styled Mock QR Code */}
                    <div className="flex justify-center py-2">
                      <MockQrCode value={generateOtpauthUrl(tempMfaSecret, profile?.email || '')} />
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-1.5 text-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Secret Setup Key</span>
                      <span className="font-mono text-base font-black tracking-wider text-gray-800 uppercase block select-all">{tempMfaSecret}</span>
                      
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(tempMfaSecret);
                          alert('Setup key copied to clipboard!');
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-green-700 hover:text-green-800 transition-colors mt-1.5"
                      >
                        <Copy size={10} /> Copy setup key
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMfaSetupStep(2)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                      I have scanned it <ArrowRight size={14} />
                    </button>
                  </div>
                ) : mfaSetupStep === 2 ? (
                  /* Step 2: Verification Code input */
                  <div className="space-y-6">
                    <h3 className="text-2xl font-black text-gray-950 tracking-tight">2. Verify Setup</h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">
                      Enter the 6-digit code shown in your authenticator app to complete connection verification:
                    </p>

                    <div className="space-y-3">
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={mfaVerifyCode}
                          onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\s+/g, ''))}
                          placeholder="e.g. 123456"
                          className="w-full bg-gray-50 border border-gray-200 pl-12 pr-4 py-4 rounded-2xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-mono font-black text-lg text-gray-900 tracking-widest text-center"
                          autoFocus
                        />
                      </div>

                      {mfaSetupError && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 font-bold">
                          <X size={14} className="shrink-0 mt-0.5" />
                          <span>{mfaSetupError}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setMfaSetupStep(1)}
                        className="flex-1 py-4 text-sm font-bold text-gray-500 hover:text-gray-905 rounded-2xl transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleVerifyMfaSetup}
                        disabled={isVerifyingMfa || mfaVerifyCode.length !== 6}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isVerifyingMfa ? 'Verifying...' : 'Verify & Enable'} <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Step 3: Backup recovery codes */
                  <div className="space-y-6">
                    <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4 border border-green-150">
                      <ShieldCheck className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-black text-gray-950 tracking-tight">3. Recovery Backup Codes</h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">
                      Two-Factor Authentication is now active! If you lose access to your device, you can use these backup codes to sign in. Save them securely:
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block text-center">Your Backup Codes</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-sm font-black text-gray-800">
                        {generatedBackupCodes.map((code, idx) => (
                          <div key={idx} className="bg-white border border-gray-150 py-2 rounded-xl text-center select-all">
                            {code}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const content = `CLEAN-CORE.IO TWO-FACTOR RECOVERY CODES\n\nEmail: ${profile?.email}\nDate Generated: ${new Date().toLocaleDateString()}\n\nCodes:\n${generatedBackupCodes.join('\n')}\n\nKeep this file secure. Each code can be used exactly once.`;
                          const blob = new Blob([content], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `cleancore-backup-codes.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <Download size={14} /> Download Backup Codes (.txt)
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowMfaSetup(false)}
                        className="w-full py-4 text-sm font-black text-green-600 hover:underline"
                      >
                        Done & Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2FA Disable Modal */}
      <AnimatePresence>
        {showMfaDisable && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden relative p-8 sm:p-10"
            >
              <button
                onClick={() => setShowMfaDisable(false)}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>

              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-2xl font-black text-gray-950 tracking-tight mb-2">Disable Two-Factor Auth?</h3>
              <p className="text-xs text-gray-500 leading-relaxed font-medium mb-6">
                Disabling two-factor authentication lowers your account security. {profile?.authMethod === 'password' ? 'Please enter your password to confirm:' : 'Confirm below:'}
              </p>

              <div className="space-y-5">
                {profile?.authMethod === 'password' && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Your Account Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="password"
                        required
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3.5 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all font-medium text-gray-900 text-sm"
                      />
                    </div>
                  </div>
                )}

                {mfaDisableError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 font-bold">
                    <X size={14} className="shrink-0 mt-0.5" />
                    <span>{mfaDisableError}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowMfaDisable(false); setDisablePassword(''); setMfaDisableError(''); }}
                    className="flex-1 py-4 text-sm font-bold text-gray-500 hover:text-gray-905 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDisableMfa}
                    disabled={isDisablingMfa || (profile?.authMethod === 'password' && !disablePassword)}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isDisablingMfa ? 'Disabling...' : 'Confirm Disable'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Stateless Mock QR Code Pattern SVG Component
 */
const MockQrCode = ({ value }: { value: string }) => {
  return (
    <div className="relative w-44 h-44 bg-white border-2 border-gray-100 rounded-3xl p-3 flex items-center justify-center shadow-inner group overflow-hidden">
      {/* Decorative scanning animation overlay */}
      <div className="absolute inset-x-0 h-0.5 bg-green-500 opacity-60 top-0 animate-bounce duration-3000 pointer-events-none" />
      
      {/* Visual QR Code Pattern */}
      <svg className="w-full h-full text-slate-900" viewBox="0 0 100 100" fill="currentColor">
        {/* Positional Squares */}
        <rect x="5" y="5" width="25" height="25" rx="4" />
        <rect x="10" y="10" width="15" height="15" fill="white" rx="2" />
        <rect x="13" y="13" width="9" height="9" rx="1.5" />
        
        <rect x="70" y="5" width="25" height="25" rx="4" />
        <rect x="75" y="10" width="15" height="15" fill="white" rx="2" />
        <rect x="78" y="13" width="9" height="9" rx="1.5" />
        
        <rect x="5" y="70" width="25" height="25" rx="4" />
        <rect x="10" y="75" width="15" height="15" fill="white" rx="2" />
        <rect x="13" y="78" width="9" height="9" rx="1.5" />

        {/* Small Positional Grid in bottom right */}
        <rect x="75" y="75" width="10" height="10" rx="2" />
        <rect x="77" y="77" width="6" height="6" fill="white" rx="1" />
        <rect x="79" y="79" width="2" height="2" />

        {/* Dynamic-looking noise patterns */}
        <path d="M 35 5 h 5 v 5 h -5 z M 45 5 h 10 v 5 h -10 z M 60 5 h 5 v 5 h -5 z" />
        <path d="M 35 15 h 10 v 5 h -10 z M 50 15 h 5 v 10 h -5 z M 60 15 h 5 v 5 h -5 z" />
        <path d="M 35 25 h 5 v 5 h -5 z M 45 25 h 5 v 5 h -5 z M 55 25 h 10 v 5 h -10 z" />
        
        <path d="M 5 35 h 5 v 5 h -5 z M 15 35 h 10 v 5 h -10 z M 30 35 h 5 v 10 h -5 z" />
        <path d="M 5 45 h 10 v 5 h -10 z M 20 45 h 5 v 5 h -5 z M 30 45 h 10 v 5 h -10 z" />
        
        <path d="M 70 35 h 5 v 5 h -5 z M 80 35 h 10 v 5 h -10 z M 92 35 h 3 v 10 h -3 z" />
        <path d="M 70 45 h 10 v 5 h -10 z M 85 45 h 5 v 5 h -5 z M 92 45 h 3 v 5 h -3 z" />
        
        {/* Center area block pattern */}
        <path d="M 45 40 h 10 v 10 h -10 z" fill="white" />
        <path d="M 48 43 h 4 v 4 h -4 z" fill="#006b2c" />

        <path d="M 35 55 h 15 v 5 h -15 z M 55 55 h 5 v 5 h -5 z M 65 55 h 10 v 5 h -10 z" />
        <path d="M 35 65 h 5 v 15 h -5 z M 45 65 h 10 v 5 h -10 z M 60 65 h 5 v 5 h -5 z" />
        
        <path d="M 5 60 h 5 v 5 h -5 z M 15 60 h 10 v 5 h -10 z" />
        <path d="M 30 75 h 5 v 10 h -5 z M 40 75 h 10 v 5 h -10 z" />
        
        <path d="M 70 60 h 10 v 5 h -10 z M 85 60 h 5 v 5 h -5 z M 92 60 h 3 v 5 h -3 z" />
        <path d="M 70 70 h 5 v 5 h -5 z M 80 70 h 10 v 5 h -10 z" />
      </svg>
    </div>
  );
};
