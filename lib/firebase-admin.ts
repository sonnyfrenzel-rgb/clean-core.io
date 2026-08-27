import { FIRESTORE_DB_ID, COMMUNITY_QUOTA, TERMS_VERSION } from '@/lib/constants';
import { verifyApprovalToken } from '@/lib/approval-token';
import { encrypt, decrypt } from './s4-credentials';

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
  // Always pass projectId so ADC doesn't pick up the wrong gcloud default project.
  adminAppModule.initializeApp({ projectId: 'cleancore-491216' });
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
  } catch (err) {
    console.error('verifyRequestAuth error:', err);
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
  // F-06: admin actions require an actually-enrolled second factor. Fail closed if
  // the admin never enabled MFA, instead of silently skipping the step-up
  // (assertMfaStepUp returns early when mfaEnabled !== true). Skipped under the
  // Firebase emulator so CI/E2E and local dev — which cannot complete a real TOTP
  // step-up — still exercise the admin flows; production always enforces it.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    const { db } = await getAdminDb();
    const snap = await db.collection('users').doc(decodedAdmin.uid).get();
    if (!snap.exists || snap.data()?.mfaEnabled !== true) {
      throw new QuotaError('Admin actions require multi-factor authentication. Enable MFA in your settings first.', 403);
    }
  }
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

/** Outcome of a run-quota reservation — see `reserveRunQuota`. */
export interface RunQuotaResult {
  /** true only when a unit was actually deducted (and must be refunded on failure). */
  charged: boolean;
  reason: 'charged' | 'reanalysis' | 'byok' | 'enterprise';
  used: number;
  limit: number;
}

/**
 * Atomically verifies the community quota AND reserves one *analysis run*.
 *
 * v2.3 — the metered unit is one analysis run (one ABAP object taken through the
 * evidence engine), NOT one AI call. Before this, every `/api/gemini` request was
 * charged, so a single object cost 6–7 units across the seven stages and the free
 * tier could not complete one project — which contradicted the "5 ABAP-to-Cloud
 * transformations" and "full 7-stage workflow included" claims on the landing page
 * and in Terms §6. Downstream stages (design, transformation, documentation,
 * testing) and the glossary chatbot are now unmetered.
 *
 * Charging is **idempotent per input fingerprint**: re-analysing the same ABAP
 * source (a retry, a tweaked prompt, the same object in a second project) is free.
 * The set of already-paid-for fingerprints lives on `users/{uid}.chargedInputs`,
 * which the Firestore rules keep out of the client's reach (`userClientUpdateKeys`),
 * so it cannot be forged to mint free runs.
 *
 * - `tier === 'enterprise'` and BYOK accounts are unmetered (Terms §6).
 * - Otherwise: status must be 'approved' and used < limit, else QuotaError(403).
 *
 * @param inputHash SHA-256 of the analysed source (hex, so a safe Firestore map key).
 */
export async function reserveRunQuota(uid: string, inputHash: string): Promise<RunQuotaResult> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('users').doc(uid);

  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const tier = data.tier || 'pilot';
    const status = data.status || 'pending';
    const used = typeof data.transformationsUsed === 'number' ? data.transformationsUsed : 0;
    const limit = typeof data.transformationsLimit === 'number' ? data.transformationsLimit : COMMUNITY_QUOTA;

    if (tier === 'enterprise') {
      return { charged: false, reason: 'enterprise' as const, used, limit };
    }
    if (data.byokConfigured === true) {
      // BYOK runs are on the user's own Gemini key — "unlimited" per Terms §6.
      return { charged: false, reason: 'byok' as const, used, limit };
    }

    if (status !== 'approved') {
      throw new QuotaError('Your account is not active. If you have only just signed up, reload the page to finish setting it up; if it was suspended, contact support.', 403);
    }

    // Already paid for this exact source — a re-analysis, not a new transformation.
    if (data.chargedInputs && data.chargedInputs[inputHash] === true) {
      return { charged: false, reason: 'reanalysis' as const, used, limit };
    }

    if (used >= limit) {
      throw new QuotaError(
        `You've used all ${limit} free transformations. Add your own Gemini API key in settings for unlimited runs — Clean-Core.io stays free.`,
        403,
      );
    }

    tx.set(
      ref,
      {
        transformationsUsed: FieldValue.increment(1),
        chargedInputs: { [inputHash]: true },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { charged: true, reason: 'charged' as const, used: used + 1, limit };
  });
}

/**
 * Best-effort refund of a reserved run unit (e.g. when the run could not be signed
 * or written). Never goes below 0, and drops the fingerprint again so the next
 * attempt is charged normally instead of being mistaken for a free re-analysis.
 */
export async function refundRunQuota(uid: string, inputHash: string): Promise<void> {
  try {
    const { db, FieldValue } = await getAdminDb();
    const ref = db.collection('users').doc(uid);
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const used = typeof data.transformationsUsed === 'number' ? data.transformationsUsed : 0;
      const updates: Record<string, any> = { [`chargedInputs.${inputHash}`]: FieldValue.delete() };
      if (used > 0) updates.transformationsUsed = FieldValue.increment(-1);
      tx.update(ref, updates);
    });
  } catch {
    /* best-effort; intentionally ignored */
  }
}

/**
 * F-02: Central account-state gate used by every business API so that a
 * `pending`, `suspended` or `deleted` account — or a stale-Terms account — gets a
 * consistent 403, INCLUDING the BYOK path (which previously skipped the
 * quota-based approval check). Admins and enterprise accounts are exempt from the
 * approval gate. Pass the caller's `admin` custom claim via `isAdminClaim`.
 */
export async function assertAccountActive(
  uid: string,
  opts: { requireApproved?: boolean; requireCurrentTerms?: boolean; isAdminClaim?: boolean } = {},
): Promise<void> {
  const { db } = await getAdminDb();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    throw new QuotaError('User profile not found. Please complete registration.', 403);
  }
  const data = snap.data() || {};
  const isAdmin = opts.isAdminClaim === true || data.isAdmin === true;
  const status = data.status || 'pending';

  if (status === 'suspended' || status === 'deleted' || data.disabled === true) {
    throw new QuotaError('This account has been suspended. Please contact support.', 403);
  }

  const isEnterprise = data.tier === 'enterprise';
  if (opts.requireApproved && !isAdmin && !isEnterprise && status !== 'approved') {
    throw new QuotaError('Your account is not active. If you have only just signed up, reload the page to finish setting it up; if it was suspended, contact support.', 403);
  }

  // Terms: block only when a *previously accepted* version is now stale, so a
  // future Terms bump forces re-consent. A missing acceptance (legacy account) is
  // grandfathered — it must not lock out pre-existing users before the reconsent
  // UI runs. The client cannot forge/remove this field (see firestore.rules).
  if (opts.requireCurrentTerms && !isAdmin) {
    const accepted = data.termsVersionAccepted || null;
    if (accepted !== null && accepted !== TERMS_VERSION) {
      throw new QuotaError('The Terms of Service have been updated. Please re-accept them in the app to continue.', 403);
    }
  }
}

/**
 * Activates a freshly registered account.
 *
 * This is what replaced the administrator approval gate. Every new profile is
 * still *created* by the browser as `pending` — the Firestore rules pin it there
 * and a client cannot write any other value — and this transaction, reachable
 * only through POST /api/account/register, is the single thing that moves it to
 * `approved`. Status therefore stays server-authoritative even though nobody
 * approves anything by hand any more.
 *
 * Three states must never be activated:
 *  - anything that is not `pending` — a `suspended` account calling the endpoint
 *    again would otherwise reinstate itself;
 *  - a profile that already carries `activatedAt`, so a retry is a no-op rather
 *    than a second welcome mail; and
 *  - a `pending` profile whose `transformationsLimit` is 0.
 *
 * That last one is the pre-v2.4.2 shape of a revoked account: `adminRevokeUser`
 * used to write `status: 'pending'` with the limit zeroed, which is
 * indistinguishable from a fresh signup by status alone — and those accounts
 * predate `activatedAt`, so the marker cannot catch them either. A profile the
 * client just created always carries a limit of 5 (the Firestore create rule
 * hardcodes it), so a zero here can only mean an administrator withdrew access.
 * For the same reason the limit is never "repaired" upwards.
 *
 * @returns whether this call performed the activation — the caller uses it to
 *          decide whether to send the welcome mail, so a retry cannot spam.
 */
export async function activateAccount(uid: string): Promise<{ activated: boolean; status: string }> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('users').doc(uid);

  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new QuotaError('User profile not found. Please complete registration.', 404);
    }
    const data = snap.data() || {};
    const status = data.status || 'pending';
    const revokedUnderTheOldScheme = data.transformationsLimit === 0;

    if (status !== 'pending' || data.activatedAt || revokedUnderTheOldScheme) {
      return { activated: false, status: revokedUnderTheOldScheme ? 'suspended' : status };
    }

    const updates: Record<string, any> = {
      status: 'approved',
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!data.tier) updates.tier = 'pilot';
    if (typeof data.transformationsLimit !== 'number') {
      updates.transformationsLimit = COMMUNITY_QUOTA;
    }

    tx.set(ref, updates, { merge: true });

    return { activated: true, status: 'approved' };
  });
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
    throw new QuotaError('Access to S/4HANA live tenant endpoints is restricted to admin-approved accounts or administrators. Please request access in settings.', 403);
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

  // 1. Projects — recursiveDelete so the immutable `runs/{runId}` subcollection
  //    (which holds the analysis narrative/evidence) is purged too. A plain doc
  //    delete would orphan the subcollection.
  {
    const q = db.collection('projects').where('userId', '==', uid).limit(200);
    let snapshot = await q.get();
    while (snapshot.size > 0) {
      for (const projectDoc of snapshot.docs) {
        await db.recursiveDelete(projectDoc.ref);
      }
      snapshot = await q.get();
    }
  }

  // 2. Other user-owned top-level collections
  await deleteCollectionByUid('abap_examples');
  await deleteCollectionByUid('support_tickets');
  await deleteCollectionByUid('files');
  await deleteCollectionByUid('consent_events'); // F-16: purge consent records (hold uid/email)

  // 3. Delete single documents keyed by uid. F-07: do NOT silently swallow
  //    failures — tolerate an idempotent "not found" but collect any real error
  //    so a *partial* erasure can never be reported to the caller as success.
  const erasureErrors: string[] = [];
  const isNotFound = (e: any) =>
    e?.code === 5 || e?.code === 'not-found' || /NOT_FOUND/i.test(String(e?.message || ''));
  const tryDelete = async (label: string, op: () => Promise<any>) => {
    try { await op(); }
    catch (e: any) { if (!isNotFound(e)) erasureErrors.push(`${label}: ${e?.message || e}`); }
  };

  //    user_secrets uses recursiveDelete to purge the BYOK `providers/*`
  //    subcollection (encrypted Gemini API keys) — a plain delete would leave it.
  await tryDelete('user_secrets', () => db.recursiveDelete(db.collection('user_secrets').doc(uid)));
  await tryDelete('registration_requests', () => db.collection('registration_requests').doc(uid).delete());
  await tryDelete('tenant_access_requests', () => db.collection('tenant_access_requests').doc(uid).delete());
  await tryDelete('s4_credentials', () => db.collection('s4_credentials').doc(uid).delete());
  await tryDelete('mfa_secrets', () => db.collection('mfa_secrets').doc(uid).delete());
  await tryDelete('mfa_pending', () => db.collection('mfa_pending').doc(uid).delete());
  await tryDelete('users', () => db.collection('users').doc(uid).delete());
  // Note: rate_limits docs are pseudonymised (HMAC ids) and self-expire via a
  // Firestore TTL on `expiresAt`; they hold no durable PII and are left to age out.

  // 3b. Backstop (F-03): purge immutable runs that were orphaned by an earlier
  //     client-side project delete. Best-effort — a missing collection-group index
  //     must never abort the erasure, so failures here are logged, not fatal.
  try {
    const q = db.collectionGroup('runs').where('userId', '==', uid).limit(400);
    let s = await q.get();
    while (!s.empty) {
      const batch = db.batch();
      s.docs.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
      s = await q.get();
    }
  } catch (e: any) {
    console.warn('[erasure] orphan-runs backstop skipped:', e?.message || e);
  }

  // 4. Delete the Firebase Auth User (idempotent — tolerate an already-deleted account)
  try {
    await adminAuthModule.getAuth().deleteUser(uid);
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') erasureErrors.push(`auth-user: ${e?.message || e}`);
  }

  // 5. F-07: verification — surface a partial erasure instead of a false success.
  if (erasureErrors.length > 0) {
    throw new Error(`Account erasure incomplete for ${uid}: ${erasureErrors.join(' | ')}`);
  }
}

// `approveUserWithToken` lived here. It backed two HMAC-signed links in the
// administrator's signup mail that approved or deleted an account with one click
// from a mailbox. Accounts now activate on registration, so the links, the page
// behind them and this function all went with the approval gate — a privileged
// action that travelled by email is not worth keeping for a decision nobody
// makes any more. Account state is changed in the admin console instead
// (`adminApproveUser` / `adminRevokeUser`, both behind admin step-up).
// Tenant access is a separate, still-manual approval and keeps its token flow.

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

export async function logAuditEvent(db: any, actorUid: string, action: string, targetUid: string) {
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

/**
 * Reinstates a suspended account.
 *
 * Signup no longer routes through here — accounts activate themselves via
 * `activateAccount`. What is left is the other direction: undoing a suspension.
 * It therefore does NOT reset `transformationsUsed`; a reinstated account keeps
 * the quota it already spent, which is not what a first approval used to do.
 */
export async function adminApproveUser(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db, FieldValue } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    status: 'approved',
    tier: 'pilot',
    transformationsLimit: COMMUNITY_QUOTA,
    activatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('registration_requests').doc(targetUid).set({
    status: 'approved',
  }, { merge: true });
  await logAuditEvent(db, adminUid, 'APPROVE_USER', targetUid);
}

/**
 * Suspends an account.
 *
 * This used to push the account back to `pending`, which was indistinguishable
 * from a brand-new signup. With self-service activation that ambiguity would let
 * a revoked user reinstate themselves by re-running registration, so a revoked
 * account is now explicitly `suspended` — a state `assertAccountActive` already
 * refuses outright, and `activateAccount` will not touch.
 */
export async function adminRevokeUser(adminUid: string, targetUid: string) {
  await ensureInitialized();
  const { db, FieldValue } = await getAdminDb();
  await db.collection('users').doc(targetUid).set({
    status: 'suspended',
    transformationsLimit: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('registration_requests').doc(targetUid).set({
    status: 'suspended',
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
  // GDPR Art. 17: run the SAME full erasure cascade as self-service deletion.
  // Previously this only removed registration_requests + users, which orphaned
  // projects, immutable runs, BYOK/S4 secrets, MFA data and the Firebase Auth account.
  await deleteUserDataAndAccount(targetUid);
  await logAuditEvent(db, adminUid, 'DELETE_USER_CASCADE', targetUid);
}

/**
 * Saves the user's custom Gemini API key securely:
 * 1. Encrypts the key using AES-256-GCM.
 * 2. Saves it in the server-only user_secrets collection.
 * 3. Updates the user profile with BYOK metadata (configured status, last 4 chars, timestamp)
 *    and deletes the legacy cleartext key.
 */
export async function saveGeminiApiKey(uid: string, apiKey: string): Promise<any> {
  await ensureInitialized();
  const { db, FieldValue } = await getAdminDb();
  const encrypted = encrypt(apiKey);
  const last4 = apiKey.length > 4 ? apiKey.slice(-4) : apiKey;

  // Set the secret document
  await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').set({
    encryptedApiKey: encrypted,
    last4,
    rotatedAt: FieldValue.serverTimestamp(),
  });

  // Mirror metadata to the user profile and remove legacy key
  await db.collection('users').doc(uid).set({
    byokConfigured: true,
    byokLast4: last4,
    byokRotatedAt: FieldValue.serverTimestamp(),
    geminiApiKey: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    byokConfigured: true,
    byokLast4: last4,
  };
}

/**
 * Loads and decrypts the user's custom Gemini API key.
 * Returns null if not configured or if decryption fails.
 */
export async function loadGeminiApiKey(uid: string): Promise<string | null> {
  await ensureInitialized();
  const { db } = await getAdminDb();
  const snap = await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || !data.encryptedApiKey) return null;
  
  try {
    return decrypt(data.encryptedApiKey);
  } catch (err) {
    console.error('Failed to decrypt Gemini API key for user:', uid, err);
    return null;
  }
}

/**
 * Deletes the user's custom Gemini API key.
 */
export async function deleteGeminiApiKey(uid: string): Promise<void> {
  await ensureInitialized();
  const { db, FieldValue } = await getAdminDb();
  await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').delete().catch(() => {});
  await db.collection('users').doc(uid).set({
    byokConfigured: FieldValue.delete(),
    byokLast4: FieldValue.delete(),
    byokRotatedAt: FieldValue.delete(),
    geminiApiKey: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(() => {});
}


