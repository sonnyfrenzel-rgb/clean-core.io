import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminAuth, assertMfaStepUp, assertRecentAuth, QuotaError } from '@/lib/firebase-admin';
import { OWN_KEY_BLOCKS_MFA_REMOVAL, mfaRemovalBlockedByOwnKey } from '@/lib/mfa-gate';
import { releaseFactorRemoval, reserveFactorRemoval, retireSecondFactor } from '@/lib/mfa-disable';

/**
 * POST /api/mfa/disable — removes the second factor from the caller's account.
 *
 * Only a session that was just established with the factor may remove it:
 * recent sign-in and the factor on the token (assertMfaStepUp). An account
 * whose profile flag is set while Firebase Auth holds no factor needs the
 * recent sign-in only. The factor
 * itself lives in Firebase Auth and is unenrolled there through the Admin SDK;
 * the profile flag follows, and whatever the application-level TOTP of earlier
 * versions left behind is cleared with it (roadmap 0.13).
 *
 * Two systems, no transaction — so the order is chosen such that every state
 * a failure can leave behind is over-strict, never under-strict. That order, and
 * the two writes it orders, live in `lib/mfa-disable.ts`, where a spec can make
 * either of them fail and see what the other did — the reason they are not in
 * this file any more (roadmap 0.17). The gate stays
 * here: recent sign-in and the factor on the token, before anything is touched.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request, { checkRevoked: true });
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;

    const auth = await getAdminAuth();
    const record = await auth.getUser(uid);
    const hasFactor = (record.multiFactor?.enrolledFactors ?? []).length > 0;

    try {
      // A recent sign-in on both paths. Without a factor in Firebase Auth the
      // call only clears the profile flag, and that still needs a session that
      // was just established, not any token the account ever issued.
      assertRecentAuth(decodedToken, 300);
      if (hasFactor) {
        // The factor Firebase Auth holds decides, not the profile flag.
        await assertMfaStepUp(request, decodedToken, { factorEnrolled: true });
      }
    } catch (err: unknown) {
      const status = err instanceof QuotaError ? err.status : 403;
      const message = err instanceof Error ? err.message : 'Recent MFA step-up verification required.';
      return NextResponse.json({ error: message }, { status });
    }

    // A stored own model key keeps the factor (lib/mfa-gate.ts): it is removed first, with the factor still on.
    // Only when Firebase Auth holds a factor — a flag without one could not remove the key either. The check and
    // the reservation are one transaction, which the own-key save reads in its own: a key cannot be stored between
    // this check and the removal (lib/mfa-disable.ts, reserveFactorRemoval).
    // The reservation is this request's own (a token); a second request while it runs is refused.
    let reservation: { token: string; at: number } | null = null;
    if (hasFactor) {
      const reserved = await reserveFactorRemoval(uid, (profile) => mfaRemovalBlockedByOwnKey(profile));
      if (reserved.refusal) {
        const code = reserved.refusal === OWN_KEY_BLOCKS_MFA_REMOVAL ? 'own-key-stored' : 'removal-running';
        return NextResponse.json({ error: reserved.refusal.message, code }, { status: reserved.refusal.status });
      }
      reservation = { token: reserved.token, at: reserved.at };
    }

    // The factor first, the flag second — and what a failure of either leaves
    // behind. `lib/mfa-disable.ts` carries the order and the spec that runs it.
    const outcome = await retireSecondFactor(uid, hasFactor, undefined, reservation ? { reservedAtMs: reservation.at } : undefined);
    if (!outcome.ok) {
      // Nothing was removed, or a factor is back: this request's reservation goes, and only that one. A failure to
      // lift it is over-strict (own-key saves wait for MFA_REMOVAL_MARKER_TTL_MS) and does not change the answer.
      if (reservation) await releaseFactorRemoval(uid, reservation.token).catch((err) => console.error('[mfa/disable] reservation not lifted:', err));
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({ success: true, removedFactor: outcome.removedFactor });
  } catch (error) {
    console.error('[mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
