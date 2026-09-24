import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * The account half of a project read through the Admin SDK — the same test
 * `accountActive()` in firestore.rules applies to an owner and to an invited
 * reader.
 *
 * The routes under `app/api/projects/[projectId]` answer from the Admin SDK,
 * which the rules do not see. Since roadmap 3.0.12 the rules refuse a
 * suspended, deleted or disabled account at once, with the token it still
 * holds; a route that checked only membership kept answering that account
 * for up to an hour (QA full review of a12774cd2b7f).
 *
 * Deliberately the rule and not `assertAccountActive`: a missing profile, a
 * pending account or an old Terms acceptance does not refuse a *read* in the
 * rules either, and an invited reader must not lose the read here for a reason
 * the rules would not give (CR-13, tests/route-gates-guard.spec.ts).
 *
 * `null` means the caller may go on; otherwise the response to return.
 */
export async function refuseInactiveAccount(uid: string): Promise<NextResponse | null> {
  const { db } = await getAdminDb();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const status = typeof data.status === 'string' ? data.status : '';
  if (status === 'suspended' || status === 'deleted' || data.disabled === true) {
    return NextResponse.json({ error: 'This account has been suspended. Please contact support.' }, { status: 403 });
  }
  return null;
}
