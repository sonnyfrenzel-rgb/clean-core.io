import { FIRESTORE_DB_ID, isHardcodedAdmin } from '@/lib/constants';

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
  if (isEmulatorMode && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson) {
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
  if (!decoded.email || !isHardcodedAdmin(decoded.email)) return null;
  return decoded;
}

// ─────────────────────────────────────────────────────────────────────────────
// F-06: Server-authoritative, atomic transformation quota
// ─────────────────────────────────────────────────────────────────────────────

/** Lazily initialised Admin-Firestore handle for the named database. */
async function getAdminDb() {
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
