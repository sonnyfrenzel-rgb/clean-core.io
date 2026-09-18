import { FIRESTORE_DB_ID, COMMUNITY_QUOTA, termsVersionInForce } from '@/lib/constants';
import { verifyApprovalToken } from '@/lib/approval-token';
import { encrypt, decrypt } from './s4-credentials';
import { hasSecondFactor as tokenHasSecondFactor, mfaSatisfied, mfaSteppedUp, s4AccessRequiresEnrolment } from './mfa-gate';
import { starterExampleForFingerprint } from './starter-example-fingerprints';
import { INVITATION_COLLECTION, PROJECT_READERS_FIELD, normaliseInvitedEmail } from './invitations';
// Types only — erased at compile time, so the modules themselves still load
// lazily below: Firestore through `getAdminDb`, Auth through `ensureAuthModule`.
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

let adminAppModule: any = null;
let adminAuthModule: any = null;
let adminFirestoreModule: any = null;

async function ensureInitialized() {
  if (!adminAppModule) {
    adminAppModule = await import('firebase-admin/app');
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
 * The Admin Auth module, loaded where authentication is actually used rather
 * than beside the app module.
 *
 * `firebase-admin/auth` pulls in `jwks-rsa`, which reaches ESM-only `jose`.
 * Next and webpack handle that; a Playwright spec, transpiled to CommonJS and
 * run on the Node this project pins, cannot `require` it. Loading it from
 * `ensureInitialized` therefore made every Firestore-only entry point here —
 * `getAdminDb`, the quota transactions, the secret deletions — unreachable
 * from a spec, which is why the erasure and BYOK fixes had no runnable proof.
 * The production paths are unchanged: every caller that needs Auth still loads
 * the same module on first use, after the same app initialisation.
 */
async function ensureAuthModule() {
  await ensureInitialized();
  if (!adminAuthModule) {
    adminAuthModule = await import('firebase-admin/auth');
  }
  return adminAuthModule;
}

/** The Admin Auth client, initialised like everything else here. */
export async function getAdminAuth() {
  return (await ensureAuthModule()).getAuth();
}

/**
 * Verify a Firebase ID token from the client.
 * Returns the decoded token or throws.
 *
 * A token that carries the `admin` claim is additionally checked against the
 * account's revocation time. Custom claims travel inside the ID token, so an
 * administrator whose claim was withdrawn keeps a token that still says
 * `admin: true` until it expires — up to an hour — which is why `setAdminClaim`
 * revokes the refresh tokens on withdrawal. That revocation is only seen by a
 * verifier that asks for it (`checkRevoked`), and asking costs one Auth lookup
 * per request. Paying it for every token would add a lookup to every business
 * route for a privilege almost no caller has; paying it only for tokens that
 * claim the privilege covers every place the claim is trusted — the admin
 * routes and the `isAdminClaim` exemptions — at the price of one lookup per
 * request from a handful of accounts.
 */
export async function verifyIdToken(idToken: string) {
  const auth = (await ensureAuthModule()).getAuth();
  const decoded = await auth.verifyIdToken(idToken);
  if (decoded.admin === true) {
    return auth.verifyIdToken(idToken, true);
  }
  return decoded;
}

/**
 * The withdrawal mirror, applied to every token that claims the privilege —
 * not only to the admin routes.
 *
 * `users/{uid}.isAdmin` grants nothing; it denies, and that is what makes a
 * withdrawal durable when `revokeRefreshTokens` does not get through (the
 * claim lives in the ID token and nothing rewrites a JWT). That deny gate sat
 * inside `verifyAdminRequest`, so it covered `/api/admin/*` and nothing else —
 * while the claim is also trusted well outside those routes, as
 * `isAdminClaim` on `assertS4TenantAccess` and `assertAccountActive`. A
 * withdrawal whose token revocation failed therefore still opened the live
 * S/4 endpoints and still waived the approval and Terms gates, for as long as
 * the old token lived (QA full review of a19945ef01dc, 79dc8a8a2d59).
 *
 * The claim is dropped from the decoded token rather than the token refused:
 * the person is still a signed-in user, they are simply no longer an
 * administrator, so every consumer sees exactly that without a special case.
 * An unreadable mirror drops it too — a withdrawal that cannot be ruled out is
 * treated as one. Absent is not a denial: the mirror is a record of
 * withdrawal, and an account that has never had one has never had its rights
 * taken away.
 *
 * Costs one Firestore read per request, and only for tokens that carry
 * `admin: true` — the same bargain `verifyIdToken` already makes above for the
 * revocation lookup.
 */
async function withoutWithdrawnAdminClaim<T extends { uid: string }>(decoded: T): Promise<T> {
  if ((decoded as { admin?: unknown }).admin !== true) return decoded;

  let withdrawn: boolean;
  try {
    const { db } = await getAdminDb();
    const snap = await db.collection('users').doc(decoded.uid).get();
    withdrawn = snap.exists && snap.data()?.isAdmin === false;
  } catch (err) {
    console.error('verifyRequestAuth: admin mirror unreadable, dropping the admin claim:', err);
    withdrawn = true;
  }
  if (!withdrawn) return decoded;

  const { admin: _withdrawn, ...rest } = decoded as T & { admin?: unknown };
  return rest as T;
}

/**
 * Extract and verify the Bearer token from request headers.
 * Returns the decoded token or null if missing/invalid.
 *
 * A token that still claims `admin` after the claim was withdrawn comes back
 * without it — see `withoutWithdrawnAdminClaim`.
 */
export async function verifyRequestAuth(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    return await withoutWithdrawnAdminClaim(await verifyIdToken(token));
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
 * Checks: valid, unrevoked Firebase token + admin custom claim.
 * Returns the decoded token or null.
 *
 * The claim grants. The `users/{uid}.isAdmin` mirror that `setAdminClaim`
 * writes grants nothing — there used to be an emulator-only fallback to it,
 * which left a second path to admin open — but it does deny, and that is what
 * makes a withdrawal durable.
 *
 * A withdrawal removes the claim and revokes the refresh tokens; only the
 * revocation invalidates the ID token the administrator is holding, because
 * nothing rewrites a JWT. If that last call fails — a transient Firebase error
 * — the route reports it, and until then the old token still says
 * `admin: true` and Firebase has no revocation time to check it against (QA
 * review of 146ac2e1a724, 9f4046043f12). The mirror is written *before* the
 * claim is removed and is therefore already `false` in exactly that window.
 *
 * That check no longer lives here. It moved into `verifyRequestAuth`
 * (`withoutWithdrawnAdminClaim`), because the claim is trusted in more places
 * than the admin routes and a withdrawal has to hold in all of them; a
 * withdrawn token arrives here already stripped of `admin`, so the one line
 * below is the whole gate.
 */
export async function verifyAdminRequest(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return null;
  if ((decoded as any).admin !== true) return null;
  return decoded;
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
  reason: 'charged' | 'reanalysis' | 'byok' | 'enterprise' | 'starter-example';
  used: number;
  limit: number;
  /**
   * Set only for `reason: 'starter-example'`: the name of the shipped example this
   * account has just spent its one free run of, so a failed run can give it back.
   */
  starterExample?: string;
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
 * v2.11 / roadmap 0.9 — the shipped starter examples are the exception in both
 * directions. The first run of one, recognised by the fingerprint of its
 * unchanged source, costs nothing at all: getting a new account to a first result
 * must not eat the five runs it has to spend on its own code. Every *further* run
 * of the same example is a normal analysis and is charged — including against the
 * re-analysis rule above, which would otherwise make example number two, three
 * and four free forever. What has already been had for free is recorded in
 * `users/{uid}.starterExamplesUsed`, keyed by the example's object name; like
 * `chargedInputs` it is written only here, and `userClientUpdateKeys` keeps the
 * client out of it.
 *
 * - `tier === 'enterprise'` and BYOK accounts are unmetered (Terms §6).
 * - Otherwise: status must be 'approved', and used < limit for anything charged.
 *
 * @param inputHash SHA-256 of the analysed source (hex, so a safe Firestore map key).
 */
export async function reserveRunQuota(uid: string, inputHash: string): Promise<RunQuotaResult> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('users').doc(uid);
  // Resolved before the transaction opens: it reads files, and a transaction body
  // may be retried.
  const starterExample = await starterExampleForFingerprint(inputHash);

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

    if (starterExample) {
      // One of the eight shipped examples, unchanged. The first run of it is free
      // and is not measured against the limit — there is nothing to measure, it
      // costs no unit. Every run after it drops through to the metered path below,
      // deliberately past the re-analysis exemption.
      if (data.starterExamplesUsed?.[starterExample] !== true) {
        tx.set(
          ref,
          {
            starterExamplesUsed: { [starterExample]: true },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return { charged: false, reason: 'starter-example' as const, used, limit, starterExample };
      }
    } else if (data.chargedInputs && data.chargedInputs[inputHash] === true) {
      // Already paid for this exact source — a re-analysis, not a new transformation.
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
 * Best-effort release of whatever `reserveRunQuota` put aside, for a run that
 * never completed. This is what makes "the unit is spent once the analysis
 * completes, never on an abort or an error" (roadmap 0.9) true: the reservation
 * is taken atomically up front, so five parallel requests cannot become six runs,
 * and anything that fails on the way gives it straight back.
 *
 * A charged reservation: the unit returns (never below 0) and the fingerprint is
 * dropped, so the next attempt is charged normally instead of passing as a free
 * re-analysis. A free starter-example reservation: no unit was taken, so nothing
 * is decremented — the example's one free run is handed back instead, which is
 * why the caller passes the reservation rather than letting this guess.
 */
export async function refundRunQuota(
  uid: string,
  inputHash: string,
  reservation?: RunQuotaResult,
): Promise<void> {
  try {
    const { db, FieldValue } = await getAdminDb();
    const ref = db.collection('users').doc(uid);
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (reservation?.reason === 'starter-example') {
        const name = reservation.starterExample;
        // Example names are [A-Z0-9_] (lib/starter-examples.ts), so the dotted
        // path below cannot be steered anywhere else.
        if (!name || !/^[A-Za-z0-9_]+$/.test(name)) return;
        tx.update(ref, { [`starterExamplesUsed.${name}`]: FieldValue.delete() });
        return;
      }
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
 * approval gate. Pass the caller's `admin` custom claim via `isAdminClaim` —
 * the claim is the only admin signal here. `users.isAdmin` is the display
 * mirror `setAdminClaim` writes for the UI; it used to count as well, so a
 * withdrawn claim whose mirror write had failed kept the exemptions.
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
  const isAdmin = opts.isAdminClaim === true;
  const status = data.status || 'pending';

  if (status === 'suspended' || status === 'deleted' || data.disabled === true) {
    throw new QuotaError('This account has been suspended. Please contact support.', 403);
  }

  const isEnterprise = data.tier === 'enterprise';
  if (opts.requireApproved && !isAdmin && !isEnterprise && status !== 'approved') {
    throw new QuotaError('Your account is not active. If you have only just signed up, reload the page to finish setting it up; if it was suspended, contact support.', 403);
  }

  // Terms: block only when the accepted version is no longer in force.
  //
  // This used to refuse anything that was not the *current* version, which was
  // right while the Terms said continued use was acceptance. § 10.3 of the
  // rewrite says the opposite: somebody who declines an amendment may carry on
  // under the Terms they accepted, and the operator's remedy is to terminate
  // with 30 days' notice — not to lock the door. Refusing a stale-but-in-force
  // acceptance would have made that clause false from the day it shipped.
  //
  // What still refuses: a version the operator has ended (removed from
  // `TERMS_VERSIONS_IN_FORCE` after those notices ran). A missing acceptance is
  // grandfathered as before — it must not lock out pre-existing users. The
  // client cannot forge or remove the field (see firestore.rules).
  if (opts.requireCurrentTerms && !isAdmin) {
    const accepted = data.termsVersionAccepted || null;
    if (accepted !== null && !termsVersionInForce(accepted)) {
      throw new QuotaError('The version of the Terms of Service your account accepted is no longer in force. Please accept the current Terms in the app to continue.', 403);
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
 *
 * The claim is the authorization; the mirror is what the UI shows and what
 * denies a withdrawal (see `withoutWithdrawnAdminClaim`). Either write failing
 * throws, so the route reports the failure instead of an `ok` for a
 * half-applied change — but a throw does not undo the write that went through,
 * so the *order* decides what a half-applied change leaves behind. Both
 * directions write the mirror first, and both therefore fail closed:
 *
 *  - a grant whose mirror write fails never writes the claim, so nothing is
 *    granted;
 *  - a grant whose claim write fails leaves a mirror saying `true`, which
 *    grants nothing at all — the admin console renders and every admin route
 *    answers 403;
 *  - a withdrawal whose claim removal or token revocation fails leaves a
 *    mirror saying `false`, which is a denial on every route.
 *
 * It used to be the other way round for a grant — claim first, mirror second —
 * so that the mirror never showed more than the claim granted. The cost of
 * that was the opposite half-state: a successful claim write followed by a
 * failed mirror write reported failure to the operator and handed the account
 * working administrator rights on its next token refresh, because an absent
 * mirror is not a denial (QA full review of a19945ef01dc, 76c6c79c6f72). A
 * console that shows a button it may not press is a cosmetic fault; a grant
 * that was reported as failed and works is not.
 *
 * A withdrawal also revokes the account's refresh tokens. The claim lives in
 * the ID token, so without that the withdrawn administrator kept a working
 * `admin: true` token until it expired, up to an hour later. With it, every
 * token issued before the withdrawal is refused by `verifyIdToken` and the
 * next sign-in mints one without the claim.
 */
export async function setAdminClaim(uid: string, isAdmin: boolean): Promise<void> {
  const auth = (await ensureAuthModule()).getAuth();
  const { db, FieldValue } = await getAdminDb();

  const writeClaim = async () => {
    const user = await auth.getUser(uid);
    const claims = { ...(user.customClaims || {}) };
    if (isAdmin) claims.admin = true; else delete claims.admin;
    await auth.setCustomUserClaims(uid, claims);
  };
  const writeMirror = () => db.collection('users').doc(uid).set(
    { isAdmin, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  await writeMirror();
  await writeClaim();
  if (!isAdmin) await auth.revokeRefreshTokens(uid);
}

/**
 * Assert that the user has permission to access S/4HANA live tenant endpoints.
 * - Super-admins (hardcoded emails) are allowed.
 * - Custom claim `admin === true` is allowed (passed in as `isAdminClaim`; the
 *   `users.isAdmin` mirror is display only and grants nothing here — see
 *   `assertAccountActive`).
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

  // A suspended account reaches no tenant, whatever else its profile says.
  //
  // This gate used to read the profile and then decide from `isAdminClaim` or
  // `s4TenantAccessAllowed` alone, and `adminRevokeUser` changes neither of
  // them — it writes `status: 'suspended'`. So an account that had been
  // approved for S/4 and was then suspended went on sending authenticated
  // requests to the stored tenant with the stored credentials: the four S/4
  // routes call this function and not `assertAccountActive`, so the suspension
  // was never asked about on the one path that talks to somebody else's
  // production system. Same conditions as `assertAccountActive`, on the
  // document this function has already read — no second lookup.
  const status = data.status || 'pending';
  if (status === 'suspended' || status === 'deleted' || data.disabled === true) {
    throw new QuotaError('This account has been suspended. Please contact support.', 403);
  }

  const isAdminUser = opts?.isAdminClaim === true;
  const s4TenantAccessAllowed = data.s4TenantAccessAllowed === true;

  if (!isAdminUser && !s4TenantAccessAllowed) {
    throw new QuotaError('Access to S/4HANA live tenant endpoints is restricted to admin-approved accounts or administrators. Please request access in settings.', 403);
  }

  // A second factor has to be *enrolled*, not merely honoured when present
  // (Sonny, 18.09.2026: MFA-Zwang für S/4-Zugang). Every S/4 route also calls
  // `assertMfaSatisfied`, which for an enrolled account demands the factor on
  // the token; for an account that never enrolled it demands nothing, and that
  // gap was the finding both audits described. This closes it on the one path
  // that reaches a customer's tenant with stored credentials. The admin claim
  // is not an exemption here - it exempts from the *approval*, not from the
  // factor.
  //
  // Skipped under the Firebase emulator, exactly as `assertAdminStepUp` is and
  // for the same reason: the Auth emulator cannot enrol a TOTP factor, so the
  // E2E fixtures cannot satisfy this, and refusing them would remove every S/4
  // route from the test suite. The decision itself is a pure function and is
  // tested without the emulator (`lib/mfa-gate.ts`,
  // `tests/s4-mfa-enrolment-guard.spec.ts`); production always enforces it.
  // Measured before shipping: exactly one production account held S/4 access
  // without a factor.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    const refusal = s4AccessRequiresEnrolment(data.mfaEnabled === true);
    if (refusal) throw new QuotaError(refusal.message, refusal.status);
  }
}

/**
 * The Admin SDK is reached through a dynamic import, so its handles arrive
 * untyped — the same shape `app/api/projects/[projectId]/readers/route.ts`
 * names for the same reason. Only the two members the erasure below uses are
 * declared.
 */
interface ErasableDoc {
  ref: unknown;
  data: () => Record<string, unknown> | undefined;
}

/**
 * Permanently erases all user data from Firestore collections and deletes the Firebase Auth account.
 * Implements GDPR Right to Erasure (Art. 17 GDPR) server-side to prevent orphaned data.
 *
 * Order matters. Everything the account owns is erased first; the profile and
 * the Auth account go only once all of it is gone. It used to be the other way
 * round: a refused delete of `s4_credentials` or `mfa_secrets` was collected,
 * the profile and the Auth user were deleted regardless, and the error was
 * thrown last. The route did report the failure — to a person who no longer
 * had an account. POST /api/account/delete requires a recent sign-in, so the
 * retry that would have finished the erasure could never be made, and the
 * encrypted credentials stayed behind under a uid nobody could act for. Now a
 * partial erasure keeps the profile and the sign-in, the error names what is
 * still there, and the retry is one more click.
 *
 * `deps` exists so a test can make one step fail; callers pass the uid alone.
 */
export async function deleteUserDataAndAccount(
  uid: string,
  deps: { db?: Firestore; auth?: Auth } = {},
): Promise<void> {
  await ensureInitialized();
  const db = deps.db ?? (await getAdminDb()).db;

  // Helper for batch deletion of documents owned by the account (limit 400 per
  // batch). `ownerField` is `userId` almost everywhere; survey_responses keys
  // its owner as `uid`.
  const deleteCollectionByUid = async (colName: string, ownerField = 'userId') => {
    const q = db.collection(colName).where(ownerField, '==', uid).limit(400);
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
  //    Survey answers and the free-text comment beside them: one document per
  //    campaign, `${campaign}__${uid}`, written by /api/survey/vote with the
  //    owner in `uid`. It was missing from this list, so an erased account's
  //    answers and comment went on being read into the daily digest.
  await deleteCollectionByUid('survey_responses', 'uid');

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

  // 3c. What the account left behind in *other people's* projects.
  //
  //     Steps 1 and 2 erase what the account owns, and `recursiveDelete` on an
  //     owned project takes its invitations with it. An account that was only
  //     ever an invited reader (roadmap phase 5) owns none of that, and two
  //     traces of it sit in documents this cascade otherwise never looks at:
  //     its uid in `projects/{id}.readers`, and every invitation addressed to
  //     it under `projects/{id}/invitations`. Both are its personal data inside
  //     somebody else's project, so neither goes away with the owner's project.
  //
  //     `FieldValue` comes from the real handle rather than from `db`: it is a
  //     module-level sentinel and not bound to an instance, and `deps.db` may be
  //     a stand-in that only proxies reads and writes.
  const { FieldValue } = await getAdminDb();

  {
    const q = db.collection('projects').where(PROJECT_READERS_FIELD, 'array-contains', uid).limit(400);
    await tryDelete('project-readers', async () => {
      let snapshot = await q.get();
      while (snapshot.size > 0) {
        const batch = db.batch();
        snapshot.docs.forEach((projectDoc: ErasableDoc) => {
          batch.update(projectDoc.ref, { [PROJECT_READERS_FIELD]: FieldValue.arrayRemove(uid) });
        });
        await batch.commit();
        // The same query again. `arrayRemove` takes the uid out of the field the
        // query matches on, so a project just written no longer comes back and
        // the paging terminates by itself.
        snapshot = await q.get();
      }
    });
  }

  //     The invitations are **deleted, not withdrawn**. A withdrawal writes
  //     `status: 'revoked'` and leaves `email` in place — the address of the
  //     person who asked to be erased, still sitting in another owner's
  //     subcollection, which is a record of them rather than of a permission.
  //     Art. 17 asks for the data to be gone. What the owner loses is a row
  //     naming an account that no longer exists.
  //
  //     Unlike the orphan-runs backstop above, a failure here is collected
  //     instead of logged: that one sweeps up documents that should not exist,
  //     this one is the erasure itself, and an address left behind under a green
  //     "account deleted" is precisely what step 4 exists to prevent. Note that
  //     `collectionGroup` needs a collection-group-scoped index on
  //     `invitations.email` in production — Firestore creates single-field
  //     indexes for a collection, not for a collection group — and that without
  //     it this step fails rather than passing quietly.
  let invitedAddress: string | null = null;
  try {
    const profileSnap = await db.collection('users').doc(uid).get();
    // The profile, not the Auth user: the Auth module is deliberately not loaded
    // until the last step, and this document is still here — it goes in step 5.
    invitedAddress = normaliseInvitedEmail((profileSnap.data() || {}).email);
  } catch (e: any) {
    erasureErrors.push(`invitations: the account address could not be read: ${e?.message || e}`);
  }

  if (invitedAddress) {
    // The address is stored normalised by the route that writes an invitation,
    // and the same normalisation is applied here, so one equality match covers
    // every spelling the owner typed.
    const q = db.collectionGroup(INVITATION_COLLECTION).where('email', '==', invitedAddress).limit(400);
    await tryDelete('invitations', async () => {
      let snapshot = await q.get();
      while (snapshot.size > 0) {
        const batch = db.batch();
        snapshot.docs.forEach((inviteDoc: ErasableDoc) => batch.delete(inviteDoc.ref));
        await batch.commit();
        snapshot = await q.get();
      }
    });
  }

  // 4. Stop here while anything of the account's data is left. The profile and
  //    the sign-in stay, so the person can retry and the error can say what is
  //    still stored; deleting them first is what made the retry impossible.
  if (erasureErrors.length > 0) {
    throw new Error(
      `Account erasure incomplete for ${uid}; profile and sign-in kept so it can be retried: ${erasureErrors.join(' | ')}`,
    );
  }

  // 5. The profile — nothing else remains that it could be needed for.
  await tryDelete('users', () => db.collection('users').doc(uid).delete());
  if (erasureErrors.length > 0) {
    throw new Error(`Account erasure incomplete for ${uid}: ${erasureErrors.join(' | ')}`);
  }

  // 6. The Firebase Auth user, last (idempotent — tolerate an already-deleted
  //    account). If this fails the data is gone and the sign-in remains, which
  //    is the one partial state a retry can still finish from. The Auth client
  //    is resolved here rather than at the top, so an erasure that stops at
  //    step 4 never needs the module at all.
  const auth = deps.auth ?? (await ensureAuthModule()).getAuth();
  try {
    await auth.deleteUser(uid);
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') {
      throw new Error(`Account erasure incomplete for ${uid}: auth-user: ${e?.message || e}`);
    }
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

/** Re-exported for the routes; the decision itself lives in lib/mfa-gate.ts. */
export const hasSecondFactor = tokenHasSecondFactor;

/**
 * The gate every route that mints, mutates or destroys evidence passes through.
 *
 * Roadmap 0.13 (Sonny, 16.09.2026, "Variante 2"): the second factor is
 * Firebase's own TOTP multi-factor, and the proof is the ID token — see
 * lib/mfa-gate.ts for the decision and for what this replaced.
 */
export async function assertMfaSatisfied(
  req: Request,
  decodedToken: any,
  opts?: {
    /**
     * A route that requires the factor to be *enrolled*, not merely honoured
     * when present, passes its pure decision here (`byokRequiresEnrolment`
     * for the own-key routes; the S/4 routes ask theirs inside
     * `assertS4TenantAccess`). Skipped under the Firebase emulator, which
     * cannot enrol TOTP - the same shape as `assertAdminStepUp`; the decision
     * is tested without it. Everything else keeps the conditional gate.
     */
    requireEnrolment?: (mfaEnabled: boolean) => { status: number; message: string } | null;
  },
) {
  void req;
  const uid = decodedToken.uid;
  const { db } = await getAdminDb();

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return;

  const mfaEnabled = userDoc.data()?.mfaEnabled === true;
  if (opts?.requireEnrolment && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    const enrolment = opts.requireEnrolment(mfaEnabled);
    if (enrolment) throw new QuotaError(enrolment.message, enrolment.status);
  }

  const refusal = mfaSatisfied(mfaEnabled, decodedToken);
  if (refusal) throw new QuotaError(refusal.message, refusal.status);
}

/**
 * Step-up for the sensitive actions: the factor on the token, and the sign-in
 * that produced it within five minutes. Re-authenticating an enrolled account
 * runs the factor again, so both facts arrive on one token.
 */
export async function assertMfaStepUp(req: Request, decodedToken: any) {
  void req;
  const uid = decodedToken.uid;
  const { db } = await getAdminDb();

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return;

  const refusal = mfaSteppedUp(userDoc.data()?.mfaEnabled === true, decodedToken, Math.floor(Date.now() / 1000));
  if (refusal) throw new QuotaError(refusal.message, refusal.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Governance Helpers with Audit Event Logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The address to record beside an administrative action.
 *
 * Split out of `logAuditEvent` so a caller that has to commit the journal entry
 * together with the change it describes can resolve the actor first and then
 * write both in one batch (`app/api/projects/[projectId]/commands/route.ts`).
 * Falls back rather than throwing: a missing profile must not stop the record.
 */
export async function auditActorEmail(db: any, actorUid: string): Promise<string> {
  try {
    const actorDoc = await db.collection('users').doc(actorUid).get();
    if (actorDoc.exists) return actorDoc.data()?.email || 'system-admin';
  } catch {}
  return 'system-admin';
}

export async function logAuditEvent(db: any, actorUid: string, action: string, targetUid: string) {
  const actorEmail = await auditActorEmail(db, actorUid);

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
 * Deletes the user's custom Gemini API key: the encrypted secret first, then
 * the profile fields that say one is configured.
 *
 * Both writes used to end in `.catch(() => {})`. A delete the database refused
 * left the key in place while the route answered `ok`, and when only the first
 * write failed the profile stopped claiming a key that was still stored. The
 * errors propagate now — the route reports success only when both writes went
 * through — and the order keeps `byokConfigured` from saying "no key" while
 * one is there.
 */
export async function deleteGeminiApiKey(uid: string): Promise<void> {
  await ensureInitialized();
  const { db, FieldValue } = await getAdminDb();
  await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').delete();
  await db.collection('users').doc(uid).set({
    byokConfigured: FieldValue.delete(),
    byokLast4: FieldValue.delete(),
    byokRotatedAt: FieldValue.delete(),
    geminiApiKey: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}


