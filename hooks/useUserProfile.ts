import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { COMMUNITY_QUOTA } from '@/lib/constants';

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  tier: 'pilot' | 'pilot_byok' | 'premium' | 'unlimited' | 'enterprise';
  /**
   * 'pending' only exists between the profile being written and
   * POST /api/account/register activating it — usually under a second.
   * 'suspended' is what an administrator revoking access now produces; it used
   * to be 'pending', which self-service activation would have undone.
   */
  status: 'pending' | 'approved' | 'suspended' | 'deleted';
  transformationsUsed: number;
  transformationsLimit: number;
  orgId?: string | null;
  maxTeamMembers?: number;
  identityProvider?: 'google' | 'password' | 'okta' | 'azure_ad';
  accessUntil?: any;
  trialUsed?: boolean;
  byokConfigured?: boolean;
  byokLast4?: string;
  byokRotatedAt?: any;
  createdAt: any;
  /** Server timestamp written once by `activateAccount`; absent means never activated. */
  activatedAt?: any;
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
  termsVersionAccepted?: string;
  termsAcceptedAt?: any;
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


export interface FinishRegistrationInput {
  firstName?: string;
  lastName?: string;
  motivation?: string;
  /** Both must be true for a consent record to be written. */
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}

/**
 * Hands a freshly created account to the server to be activated.
 *
 * Registration is two writes and one call: the browser creates the profile as
 * `pending`, then this asks POST /api/account/register to record the consent,
 * flip the account to `approved` and send the single welcome mail. Nothing here
 * decides anything — the endpoint does, because `status` and the consent record
 * are both server-authoritative.
 *
 * Callers that can show an error should let this throw; callers that have
 * already navigated should catch it and rely on the dashboard's retry, which
 * calls the same idempotent endpoint.
 */
export async function finishRegistration(user: User, input: FinishRegistrationInput): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch('/api/account/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      motivation: input.motivation || '',
      acceptedTerms: input.acceptedTerms === true,
      acceptedPrivacy: input.acceptedPrivacy === true,
      locale: typeof navigator !== 'undefined' ? navigator.language : null,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Could not finish setting up your account (HTTP ${res.status}).`);
  }
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
    // The profile listener from the previous signed-in user, so it can be torn
    // down when the user changes.
    //
    // It used to be released by `return () => unsubscribeProfile();` *inside* the
    // auth callback — a value Firebase ignores. So the old listener stayed live
    // across a sign-out or a user switch and could still call `setProfile` with
    // the previous account's document. Held here, where the effect's own cleanup
    // can reach it.
    let unsubscribeProfile: (() => void) | null = null;
    const releaseProfile = () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      console.log('[PROFILE HOOK LOG] onAuthStateChanged fired. user:', user ? user.email : 'null');
      releaseProfile();
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

      unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
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

    });

    return () => {
      releaseProfile();
      unsubscribeAuth();
    };
  }, [auth, db]);

  /**
   * Creates the profile and finishes registration in one step.
   *
   * The account is written as `pending` — the Firestore rules accept nothing
   * else — and POST /api/account/register immediately activates it, records the
   * consent server-side and sends the welcome mail. There is no approval to wait
   * for, so this either returns an active account or throws.
   *
   * Consent is NOT written here. It used to be (`termsVersionAccepted` and a
   * client clock beside it), which is finding V14: an assertion by the same
   * party it protects, with no consent_events row behind it. The two fields have
   * been removed from the client-writable create allowlist, so including them
   * would now fail the write outright.
   */
  const createProfile = async (
    user: User,
    firstName: string,
    lastName: string,
    motivation?: string,
    authMethod: 'google' | 'password' = 'google',
  ) => {
    // F-06: No email-based privilege escalation. All new users start as 'pilot' / 'pending'.
    // Admin status is granted server-side via the set-admin-claim API.
    const newProfile: UserProfile = {
      firstName,
      lastName,
      email: user.email || '',
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 0,
      transformationsLimit: COMMUNITY_QUOTA,
      maxTeamMembers: 1,
      orgId: null,
      identityProvider: authMethod === 'password' ? 'password' : 'google',
      createdAt: serverTimestamp(),
      isAdmin: false,
      authMethod,
    };

    // Both writes are creates as far as the Firestore rules are concerned: the
    // client may create these documents and may not update them. A second
    // attempt after a failed activation would therefore be evaluated as an
    // update and rejected, leaving the person stuck on an error they can only
    // retry into the same wall. Skip the write when the document is already
    // there and go straight on to the activation call.
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const existing = await getDoc(userDocRef);
      if (!existing.exists()) {
        await setDoc(userDocRef, newProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    try {
      // We also store a registration request
      const regRef = doc(db, 'registration_requests', user.uid);
      const existingReq = await getDoc(regRef);
      if (!existingReq.exists()) {
        await setDoc(regRef, {
          email: user.email,
          name: `${firstName} ${lastName}`,
          motivation: motivation || '',
          status: 'pending',
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `registration_requests/${user.uid}`);
    }

    await finishRegistration(user, {
      firstName,
      lastName,
      motivation: motivation || '',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

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

  // v2.3: the former `incrementTransformations` stub was removed. Quota is charged
  // server-side, atomically, once per analysis run in /api/runs/create
  // (`reserveRunQuota`) — never from the client.

  return { profile, loading, error, createProfile, updateProfile };
}
