import { FIRESTORE_DB_ID, isHardcodedAdmin } from '@/lib/constants';
import { verifyApprovalToken } from '@/lib/approval-token';

let adminAppModule: any = null;
let adminAuthModule: any = null;
let adminFirestoreModule: any = null;

async function ensureInitialized() {
  if (!adminAppModule) {
    adminAppModule = await import('firebase-admin/app');
    adminAuthModule = await import('firebase-admin/auth');
  }

  if (adminAppModule.getApps().length > 0) return;

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
 * Checks: valid Firebase token + email in hardcoded admin allowlist.
 * Returns the decoded token or null.
 */
export async function verifyAdminRequest(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return null;
  // Custom Claim zuerst; hartkodierte Bootstrap-Admins nur noch als Übergangs-Fallback.
  if ((decoded as any).admin === true) return decoded;
  if (decoded.email && isHardcodedAdmin(decoded.email)) return decoded;
  return null;
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

    const email = data.email || '';
    const tier = data.tier || 'pilot';
    const status = data.status || 'pending';
    const used = typeof data.transformationsUsed === 'number' ? data.transformationsUsed : 0;
    const limit = typeof data.transformationsLimit === 'number' ? data.transformationsLimit : 5;

    const isUnlimited = tier === 'enterprise' || isHardcodedAdmin(email);
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
  const email = data.email || '';
  const isAdminUser = opts?.isAdminClaim === true || (data.isAdmin === true) || isHardcodedAdmin(email);
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


