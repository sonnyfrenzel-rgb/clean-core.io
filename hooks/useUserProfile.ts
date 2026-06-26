import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { User } from 'firebase/auth';

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  tier: 'pilot' | 'pilot_byok' | 'premium' | 'unlimited' | 'enterprise';
  status: 'pending' | 'approved';
  transformationsUsed: number;
  transformationsLimit: number;
  orgId?: string | null;
  maxTeamMembers?: number;
  identityProvider?: 'google' | 'okta' | 'azure_ad';
  accessUntil?: any;
  trialUsed?: boolean;
  geminiApiKey?: string;
  createdAt: any;
  updatedAt?: any;
  isAdmin?: boolean;
  theme?: 'light' | 'dark' | 'system';
  backupEnabled?: boolean;
  landingPageDefault?: 'dashboard' | 'analytics' | 'transformation';
  desktopChatbotEnabled?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
  authMethod?: 'google' | 'password';
  s4TenantAccessRequested?: boolean;
  s4TenantAccessAllowed?: boolean;
  /** @deprecated Use s4Meta instead — s4Config contained cleartext secrets */
  s4Config?: any;
  s4Meta?: {
    configured: boolean;
    url: string;
    username: string;
    authType: string;
    tokenUrl: string;
  };
}


export function useUserProfile() {
  const auth = getAuth();
  const db = getDb();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }
    console.log('[PROFILE HOOK LOG] useEffect auth listener mounted. auth.currentUser:', auth.currentUser ? auth.currentUser.email : 'null');
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      console.log('[PROFILE HOOK LOG] onAuthStateChanged fired. user:', user ? user.email : 'null');
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      
      // F-06: Admin/tier is determined solely by the Firestore document
      // (which is managed by server-side set-admin-claim API and Custom Claims).
      // No client-side email-based privilege escalation.

      // Immediate, robust one-time getDoc fetch to ensure loading state resolves
      // even if the persistent onSnapshot streaming connection hangs or is blocked on CI runners.
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          // Enforce pilot limit for pilot users
          if (data.tier === 'pilot') {
            data.transformationsLimit = 5;
          }
          setProfile(data);
          setLoading(false);
        }
      }).catch((err) => {
        console.error('Immediate getDoc profile fetch error:', err);
      });

      const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          // Enforce pilot limit for pilot users
          if (data.tier === 'pilot') {
            data.transformationsLimit = 5;
          }
          setProfile(data);
        } else {
          setProfile(null);
        }
        setLoading(false);
        setError(null);
      }, (err) => {
        if (err.code === 'permission-denied') {
          setProfile(null);
        } else {
          setError(err.message);
        }
        setLoading(false);
      });

      return () => unsubscribeProfile();
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  const createProfile = async (user: User, firstName: string, lastName: string, motivation?: string, authMethod: 'google' | 'password' = 'google') => {
    // F-06: No email-based privilege escalation. All new users start as 'pilot' / 'pending'.
    // Admin status is granted server-side via the set-admin-claim API.
    const newProfile: UserProfile = {
      firstName,
      lastName,
      email: user.email || '',
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      orgId: null,
      identityProvider: 'google',
      createdAt: serverTimestamp(),
      isAdmin: false,
      authMethod,
    };

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, newProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    try {
      // We also store a registration request
      await setDoc(doc(db, 'registration_requests', user.uid), {
        email: user.email,
        name: `${firstName} ${lastName}`,
        motivation: motivation || '',
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `registration_requests/${user.uid}`);
    }
    
    return newProfile;
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!auth || !auth.currentUser) return;
    try {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userDocRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const incrementTransformations = async () => {
    // F-06: No-op — Quota-Increment ist jetzt atomar serverseitig in /api/gemini.
    // Diese Stub-Funktion bleibt, damit bestehende Aufrufer nicht brechen.
    console.debug('[useUserProfile] incrementTransformations is now a server-side no-op.');
  };

  return { profile, loading, error, createProfile, updateProfile, incrementTransformations };
}
