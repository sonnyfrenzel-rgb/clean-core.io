import { FIRESTORE_DB_ID } from '@/lib/constants';
import { verifyApprovalToken } from '@/lib/approval-token';
import { decrypt } from './s4-credentials';

let adminAppModule: any = null;
let adminAuthModule: any = null;
let adminFirestoreModule: any = null;

async function ensureInitialized() {
  if (!adminAppModule) {
    adminAppModule = await import('firebase-admin/app');
    adminAuthModule = await import('firebase-admin/auth');
  }

  // Connect Admin SDK to Auth emulator in test/dev mode
  const isEmulatorMode = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  if (isEmulatorMode) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

  if (adminAppModule.getApps().length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson && !isEmulatorMode) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      adminAppModule.initializeApp({ credential: adminAppModule.cert(serviceAccount) });
      return;
    } catch {
      console.warn('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to ADC.');
    }
  }

  if (isEmulatorMode) {
    // In emulator mode without service account (CI), init with just projectId
    adminAppModule.initializeApp({ projectId: 'cleancore-491216' });
    return;
  }

  // Fallback: Application Default Credentials (gcloud auth)
  adminAppModule.initializeApp();
}

/**
 * Verify a Firebase ID token from the client.
 * Returns the decoded token or throws.
 */
export async function verifyIdToken(idToken: string) {
  await ensureInitialized();
  return adminAuthModule.getAuth().verifyIdToken(idToken);
}

/**
 * Extract and verify the Bearer token from request headers.
 * Returns the decoded token or null if missing/invalid.
 */
export async function verifyRequestAuth(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F-04: Admin-gated route verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify that the request comes from an authenticated admin user.
 * Checks: valid Firebase token + admin custom claim.
 * Returns the decoded token or null.
 */
export async function verifyAdminRequest(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return null;
  if ((decoded as any).admin === true) return decoded;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
    const { db } = await getAdminDb();
    const snap = await db.collection('users').doc(decoded.uid).get();
    if (snap.exists && snap.data()?.isAdmin === true) return decoded;
  }
  return null;
}

export function assertRecentAuth(decodedToken: any, maxAgeSeconds = 300): void {
  const authTime = Number(decodedToken?.auth_time);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(authTime) || nowSeconds - authTime > maxAgeSeconds) {
    throw new QuotaError('Security timeout. Please re-authenticate and try again.', 403);
  }
}

export async function assertAdminStepUp(req: Request, decodedAdmin: any): Promise<void> {
  assertRecentAuth(decodedAdmin, 300);
  await assertMfaStepUp(req, decodedAdmin);
}

// ─────────────────────────────────────────────────────────────────────────────
// F-06: Server-authoritative, atomic transformation quota
// ─────────────────────────────────────────────────────────────────────────────

/** Lazily initialised Admin-Firestore handle for the named database. */
export async function getAdminDb() {
  await ensureInitialized();
  if (!adminFirestoreModule) {
    adminFirestoreModule = await import('firebase-admin/firestore');
  }
  const app = adminAppModule.getApps()[0];
  return {
    db: adminFirestoreModule.getFirestore(app, FIRESTORE_DB_ID),
    FieldValue: adminFirestoreModule.FieldValue,
  };
}

/** Typed quota error carrying the HTTP status the route should return. */
export class QuotaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'QuotaError';
    this.status = status;
  }
}

/**
 * Atomically verifies the pilot quota AND reserves one transformation.
 * - Enterprise tier and hardcoded super-admins are unlimited (no increment).
 * - Non-enterprise: status must be 'approved' and used < limit, else QuotaError(403).
 * Throws nothing on success; the counter has already been incremented on return.
 */
export async function reserveTransformationQuota(uid: string): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('users').doc(uid);

  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const tier = data.tier || 'pilot';
    const status = data.status || 'pending';
    const used = typeof data.transformationsUsed === 'number' ? data.transformationsUsed : 0;
    const limit = typeof data.transformationsLimit === 'number' ? data.transformationsLimit : 5;

    const isUnlimited = tier === 'enterprise';
    if (isUnlimited) return; // no metering

    if (status !== 'approved') {
      throw new QuotaError('Your beta pilot account is currently pending admin approval.', 403);
    }
    if (used >= limit) {
      throw new QuotaError(
        `Transformation limit reached! Your pilot plan allows a maximum of ${limit} free transformations. Please upgrade or configure your own Gemini API key in settings.`,
        403,
      );
    }

    tx.update(ref, {
      transformationsUsed: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/** Best-effort refund of a reserved unit (e.g. when the Gemini call fails). Never goes below 0. */
export async function refundTransformationQuota(uid: string): Promise<void> {
  try {
    const { db, FieldValue } = await getAdminDb();
    const ref = db.collection('users').doc(uid);
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const used = snap.exists && typeof snap.data().transformationsUsed === 'number'
        ? snap.data().transformationsUsed
        : 0;
      if (used <= 0) return;
      tx.update(ref, { transformationsUsed: FieldValue.increment(-1) });
    });
  } catch {
    /* best-effort; intentionally ignored */
  }
}

/**
 * Sets or revokes the `admin` custom claim on a user and mirrors the boolean to
 * users/{uid}.isAdmin (for UI display). Existing custom claims are preserved.
 */
export async function setAdminClaim(uid: string, isAdmin: boolean): Promise<void> {
  await ensureInitialized();
  const auth = adminAuthModule.getAuth();

  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (isAdmin) claims.admin = true; else delete claims.admin;
  await auth.setCustomUserClaims(uid, claims);

  const { db, FieldValue } = await getAdminDb();
  await db.collection('users').doc(uid).set(
    { isAdmin, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Assert that the user has permission to access S/4HANA live tenant endpoints.
 * - Super-admins (hardcoded emails) are allowed.
 * - Custom claim `admin === true` is allowed.
 * - User documents with `s4TenantAccessAllowed === true` are allowed.
 * Throws a QuotaError if access is denied.
 */
export async function assertS4TenantAccess(
  uid: string,
  opts?: { isAdminClaim?: boolean },
): Promise<void> {
  const { db } = await getAdminDb();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  
  if (!snap.exists) {
    throw new QuotaError('User profile does not exist.', 404);
  }
  
  const data = snap.data();
  const isAdminUser = opts?.isAdminClaim === true || (data.isAdmin === true);
  const s4TenantAccessAllowed = data.s4TenantAccessAllowed === true;

  if (!isAdminUser && !s4TenantAccessAllowed) {
    throw new QuotaError('Access to S/4HANA live tenant endpoints is restricted to approved pilot users or administrators. Please request access in settings.', 403);
  }
}

/**
 * Permanently erases all user data from Firestore collections and deletes the Firebase Auth account.
 * Implements GDPR Right to Erasure (Art. 17 GDPR) server-side to prevent orphaned data.
 */
export async function deleteUserDataAndAccount(uid: string): Promise<void> {
  await ensureInitialized();
  const { db } = await getAdminDb();

  // Helper for batch deletion of sub-collections (limit 400 per batch)
  const deleteCollectionByUid = async (colName: string) => {
    const q = db.collection(colName).where('userId', '==', uid).limit(400);
    let snapshot = await q.get();
    while (snapshot.size > 0) {
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      snapshot = await q.get();
    }
  };

  // 1. Paginated deletion of user-owned collections
  await deleteCollectionByUid('projects');
  await deleteCollectionByUid('abap_examples');
  await deleteCollectionByUid('support_tickets');
  await deleteCollectionByUid('files');

  // 2. Delete single documents
  await db.collection('registration_requests').doc(uid).delete().catch(() => {});
  await db.collection('tenant_access_requests').doc(uid).delete().catch(() => {});
  await db.collection('s4_credentials').doc(uid).delete().catch(() => {});
  await db.collection('mfa_secrets').doc(uid).delete().catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});

  // 3. Delete the Firebase Auth User
  await adminAuthModule.getAuth().deleteUser(uid);
}

/**
 * Server-side cryptographic token validation and user approval.
 */
export async function approveUserWithToken(
  adminUid: string,
  uid: string,
  token: string,
  action: 'approve' | 'reject'
): Promise<void> {
  await ensureInitialized();
  
  // Audit P2: action/type-bound, expiring, timing-safe, fail-closed.
  verifyApprovalToken(token, { uid, requestType: 'pilot', action });

  const { db } = await getAdminDb();

  if (action === 'approve') {
    // Update user profile in users/{uid}
    await db.collection('users').doc(uid).set({
      status: 'approved',
      tier: 'pilot',
      transformationsLimit: 5,
      transformationsUsed: 0
    }, { merge: true });

    // Update registration request
    await db.collection('registration_requests').doc(uid).set({
      status: 'approved',
    }, { merge: true });
  } else if (action === 'reject') {
    // Delete registration request and user document
    await db.collection('registration_requests').doc(uid).delete();
    await db.collection('users').doc(uid).delete();

    // A-01: also remove the Firebase Auth user — otherwise a rejected applicant
    // leaves an orphaned auth account and cannot cleanly re-register later.
    try {
      await adminAuthModule.getAuth().deleteUser(uid);
    } catch (e: any) {
      // Already gone is fine; anything else is a real failure.
      if (e?.code !== 'auth/user-not-found') {
        console.error('[reject] failed to delete auth user:', e?.code || e);
        throw e;
      }
    }
  }
}

/**
 * Server-side cryptographic token validation and tenant connection approval.
 */
export async function approveTenantWithToken(
  adminUid: string,
  uid: string,
  token: string,
  action: 'approve' | 'reject'
): Promise<void> {
  await ensureInitialized();

  // Audit P2: action/type-bound, expiring, timing-safe, fail-closed.
  verifyApprovalToken(token, { uid, requestType: 'tenant', action });

  const { db } = await getAdminDb();

  if (action === 'approve') {
    // Update user profile in users/{uid}
    await db.collection('users').doc(uid).set({
      s4TenantAccessAllowed: true,
      s4TenantAccessRequested: false
    }, { merge: true });

    // Update tenant access request
    await db.collection('tenant_access_requests').doc(uid).set({
      status: 'approved',
    }, { merge: true });
  } else if (action === 'reject') {
    // Clean request status on user document
    await db.collection('users').doc(uid).set({
      s4TenantAccessRequested: false,
      s4TenantAccessAllowed: false
    }, { merge: true });

    // Delete tenant access request document
    await db.collection('tenant_access_requests').doc(uid).delete();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MFA Session Validation & Step-Up Helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function assertMfaSatisfied(req: Request, decodedToken: any) {
  const uid = decodedToken.uid;
  const { db } = await getAdminDb();
  
  // 1. Fetch user profile
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return;
  
  const userData = userDoc.data();
  if (!userData || !userData.mfaEnabled) {
    return; // MFA is not enabled for this user
  }
  
  // 2. MFA is enabled, check the mfa_session cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').reduce((acc: any, c: string) => {
    const [name, val] = c.trim().split('=');
    if (name && val) acc[name] = val;
    return acc;
  }, {});
  const sessionCookie = cookies['mfa_session'];
  
  if (!sessionCookie) {
    throw new QuotaError('MFA verification required. Please complete 2FA.', 403);
  }
  
  try {
    const decrypted = decrypt(decodeURIComponent(sessionCookie));
    const session = JSON.parse(decrypted);
    
    if (session.uid !== uid) {
      throw new QuotaError('Invalid MFA session.', 403);
    }
    
    const MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours
    if (Date.now() - session.mfaVerifiedAt > MAX_AGE) {
      throw new QuotaError('MFA session expired. Please verify again.', 403);
    }
  } catch (err) {
    throw new QuotaError('Invalid or expired MFA session. Please verify again.', 403);
  }
}

export async function assertMfaStepUp(req: Request, decodedToken: any) {
  const uid = decodedToken.uid;
  const { db } = await getAdminDb();
  
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return;
  
  const userData = userDoc.data();
  if (!userData || !userData.mfaEnabled) return;
  
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').reduce((acc: any, c: string) => {
    const [name, val] = c.trim().split('=');
    if (name && val) acc[name] = val;
    return acc;
  }, {});
  const sessionCookie = cookies['mfa_session'];
  
  if (!sessionCookie) {
    throw new QuotaError('MFA verification required. Please complete 2FA.', 403);
  }
  
  try {
    const decrypted = decrypt(decodeURIComponent(sessionCookie));
    const session = JSON.parse(decrypted);
    
    if (session.uid !== uid) {
      throw new QuotaError('Invalid MFA session.', 403);
    }
    
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes step-up
    if (Date.now() - session.mfaVerifiedAt > MAX_AGE) {
      throw new QuotaError('MFA security timeout. Please re-verify your 2FA code in the settings page.', 403);
    }
  } catch (err) {
    throw new QuotaError('MFA security timeout. Please re-verify your 2FA code.', 403);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Governance Helpers with Audit Event Logging
// ─────────────────────────────────────────────────────────────────────────────

async function logAuditEvent(db: any, actorUid: string, action: string, targetUid: string) {
  let actorEmail = 'system-admin';
  try {
    const actorDoc = await db.collection('users').doc(actorUid).get();
    if (actorDoc.exists) {
      actorEmail = actorDoc.data()?.email || actorEmail;
    }
  } catch {}
  
  await db.collection('audit_events').add({
    actorUid,
    actorEmail,
    action,
    targetUid,
    timestamp: new Date(),
  });
}

export async function adminApproveUser(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    status: 'approved',
    tier: 'pilot',
    transformationsLimit: 5,
    transformationsUsed: 0
  }, { merge: true });
  await db.collection('registration_requests').doc(targetUid).set({
    status: 'approved',
  }, { merge: true });
  await logAuditEvent(db, adminUid, 'APPROVE_USER', targetUid);
}

export async function adminRevokeUser(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    status: 'pending',
    transformationsLimit: 0
  }, { merge: true });
  await db.collection('registration_requests').doc(targetUid).set({
    status: 'pending',
  }, { merge: true });
  await logAuditEvent(db, adminUid, 'REVOKE_USER', targetUid);
}

export async function adminGrantS4(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    s4TenantAccessAllowed: true,
    s4TenantAccessRequested: false
  }, { merge: true });
  const regRef = db.collection('tenant_access_requests').doc(targetUid);
  const regSnap = await regRef.get();
  if (regSnap.exists) {
    await regRef.set({ status: 'approved' }, { merge: true });
  }
  await logAuditEvent(db, adminUid, 'GRANT_S4', targetUid);
}

export async function adminRevokeS4(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    s4TenantAccessAllowed: false,
    s4TenantAccessRequested: false
  }, { merge: true });
  const regRef = db.collection('tenant_access_requests').doc(targetUid);
  const regSnap = await regRef.get();
  if (regSnap.exists) {
    await regRef.set({ status: 'pending' }, { merge: true });
  }
  await logAuditEvent(db, adminUid, 'REVOKE_S4', targetUid);
}

export async function adminDeleteUser(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db } = await getAdminDb();
  await db.collection('registration_requests').doc(targetUid).delete();
  await db.collection('users').doc(targetUid).delete();
  await logAuditEvent(db, adminUid, 'DELETE_USER', targetUid);
}


