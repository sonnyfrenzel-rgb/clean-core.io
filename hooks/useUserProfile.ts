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
      
      // Immediate, robust one-time getDoc fetch to ensure loading state resolves
      // even if the persistent onSnapshot streaming connection hangs or is blocked on CI runners.
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const isSonny = data.email === 'sonny.frenzel@googlemail.com' || data.email === 'sonny.frenzel@gmail.com';
          if (isSonny) {
            data.tier = 'enterprise';
            data.transformationsLimit = 999999;
            data.status = 'approved';
            data.isAdmin = true;
          } else if (data.tier === 'pilot') {
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
          const isSonny = data.email === 'sonny.frenzel@googlemail.com' || data.email === 'sonny.frenzel@gmail.com';
          if (isSonny) {
            data.tier = 'enterprise';
            data.transformationsLimit = 999999;
            data.status = 'approved';
            data.isAdmin = true;
          } else {
            // "Setze alle User auf 5 Transformationen in der Pilot Lizenz"
            // Make sure regular pilot users have exactly 5 transformationsLimit
            if (data.tier === 'pilot') {
              data.transformationsLimit = 5;
            }
          }
          setProfile(data);
        } else {
          const isSonny = user.email === 'sonny.frenzel@googlemail.com' || user.email === 'sonny.frenzel@gmail.com';
          if (isSonny) {
            setProfile({
              firstName: 'Sonny',
              lastName: 'Frenzel',
              email: user.email || '',
              tier: 'enterprise',
              status: 'approved',
              transformationsUsed: 0,
              transformationsLimit: 999999,
              createdAt: new Date(),
              isAdmin: true,
            });
          } else {
            setProfile(null);
          }
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
    const isSonny = user.email === 'sonny.frenzel@googlemail.com' || user.email === 'sonny.frenzel@gmail.com';
    const newProfile: UserProfile = {
      firstName,
      lastName,
      email: user.email || '',
      tier: isSonny ? 'enterprise' : 'pilot',
      status: isSonny ? 'approved' : 'pending', // Requires approval for others, Sonny auto-approved
      transformationsUsed: 0,
      transformationsLimit: isSonny ? 999999 : 5, // Pilot tier limit: Sonny has unlimited, others 5
      maxTeamMembers: isSonny ? 999 : 1,
      orgId: null,
      identityProvider: 'google',
      createdAt: serverTimestamp(),
      isAdmin: isSonny,
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
        status: isSonny ? 'approved' : 'pending',
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
