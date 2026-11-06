import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';
import { removeProfilePictureAddress } from '@/lib/profile-picture';
import { assertRateLimit } from '@/lib/rate-limit';
import { processOwnPendingWithdrawal } from '@/lib/withdrawal-queue-store';
import { logger, errMessage } from '@/lib/logger';

/**
 * POST /api/account/signed-in
 *
 * The one thing the server does after a sign-in: remove the profile picture
 * address Google sent from the account's Firebase Authentication record
 * (privacy policy section 2, Variante B, owner decision 23.10.2026;
 * `lib/profile-picture.ts`). The signed-in shell calls it once per page load
 * for an account signed in with Google (`hooks/useUserProfile.ts`), so an
 * account that existed before the change is cleaned at its next sign-in;
 * a new account is cleaned by `POST /api/account/register` already.
 *
 * Acts only on the caller's own account, takes no body, and answers the same
 * `{ ok: true }` whether or not there was anything to remove.
 *
 * Legal review 06.11.2026 (B8): a sign-in is also one of the two moments a
 * withdrawal receipt that could not be sent is tried again
 * (`lib/withdrawal-queue.ts`) — the shell calls this route for every provider
 * while the profile says a receipt is pending. A receipt that goes out ends in
 * the deletion of the account, as does the seventh day without one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    await assertRateLimit(`account-signed-in:${decoded.uid}`, 60, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const status = (rateErr as { status?: number } | null)?.status ?? 429;
    return NextResponse.json({ error: 'Too many requests. Please wait and try again.' }, { status });
  }
  await removeProfilePictureAddress(decoded);
  try {
    await processOwnPendingWithdrawal(decoded.uid);
  } catch (err: unknown) {
    // Kept in the queue; the next sign-in or the operator tries again. Never the address.
    logger.error('withdrawal receipt retry failed', { route: 'api/account/signed-in', error: errMessage(err) });
  }
  return NextResponse.json({ ok: true });
}
