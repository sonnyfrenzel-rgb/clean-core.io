import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyAdminRequest,
  verifyRequestAuth,
  assertMfaSatisfied,
  assertAccountActive,
  getAdminDb,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { WORKSPACE_SHELL_FIELD, workspaceShellEnabled } from '@/lib/workspace-shell';

/**
 * The admin-only switch the 3.0 interface grows behind — roadmap 1.4.
 *
 * `docs/ROADMAP.md`, preamble: the new UI grows behind an admin-only switch
 * until 3.0. Roadmap 1.5 built the components and said in its own header that
 * this is where the real switch belongs.
 *
 * Shaped after `POST /api/model-stages` (roadmap 1.2) on purpose — a second
 * server-written user preference that behaved differently would be a second
 * thing to understand:
 *
 *   - the value lives on `users/{uid}.workspaceShell` and is written **only
 *     here**, through the Admin SDK. `firestore.rules` limits a client's own
 *     writes to `userClientUpdateKeys()`, and this field is deliberately not in
 *     it, so the switch cannot be flipped from a browser console — **and no
 *     rules change was needed**. Rules on this project are deployed by hand; a
 *     step that needed one would have to say so out loud, and this one does not.
 *   - the document is readable by its owner, so a screen that already holds the
 *     profile does not have to ask again. `GET` exists for the settings surface
 *     and for a caller that wants the server's own reading rather than its copy.
 *
 * **Who may write it:** `verifyAdminRequest` — the `admin` custom claim, plus
 * the Firestore mirror not saying `isAdmin: false`. The same gate the admin
 * console uses, and the only one: an account turns the preview on for *itself*,
 * and there is no parameter here for turning it on for somebody else.
 *
 * **Why there is no admin step-up.** `assertAdminStepUp` guards the console's
 * irreversible actions over *other people's* accounts. This grants no access,
 * reads nothing new, touches nobody else, and the same person undoes it with
 * the same call. Requiring a recent re-authentication and a second factor to
 * change how one's own screen is drawn would be friction bought with no safety.
 * What the switch protects is the community's experience of a finished product,
 * not anybody's data — see the header of `lib/workspace-shell.ts`.
 */

export const dynamic = 'force-dynamic';

interface ShellAnswer {
  /** Whether the preview is on for this account, by the one reading of the flag. */
  enabled: boolean;
  /** Whether this account may turn it on at all. */
  eligible: boolean;
}

async function answerFor(uid: string): Promise<ShellAnswer> {
  const { db } = await getAdminDb();
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? (snap.data() as { workspaceShell?: boolean; isAdmin?: boolean }) : null;
  return {
    enabled: workspaceShellEnabled(data),
    // Read from the mirror rather than from the caller's claim: `GET` is open
    // to every signed-in account, and the answer for a non-admin is "no".
    eligible: data?.isAdmin === true,
  };
}

/**
 * A refusal the caller can act on, rather than a 500 that says nothing.
 *
 * `assertMfaSatisfied` and `assertRateLimit` throw a plain object carrying
 * `status` and `message`, not a `QuotaError`, so both fell into the generic
 * branch: a reader with a second factor was told "Could not read the workspace
 * setting" with a 500, and an expected refusal was logged as a server error
 * (QA review of 1d3068c8020f). Anything carrying a numeric status is a decision
 * this route made on purpose and is answered as one.
 */
function refusal(err: unknown): NextResponse | null {
  if (err instanceof QuotaError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const e = err as { status?: unknown; message?: unknown };
  if (typeof e?.status === 'number' && typeof e?.message === 'string') {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    await assertMfaSatisfied(req, decodedToken);
    return NextResponse.json(await answerFor(decodedToken.uid));
  } catch (err: unknown) {
    const said = refusal(err);
    if (said) return said;
    logger.error('workspace-shell read failed', { route: 'api/workspace-shell', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the workspace setting.' }, { status: 500 });
  }
}

/**
 * POST /api/workspace-shell
 *
 * Body: `{ enabled: true }` or `{ enabled: false }` — nothing else. Anything
 * that is not a boolean is a 400 rather than a silent no-op: a screen that
 * posts the wrong shape would otherwise report success and change nothing,
 * which is the kind of failure nobody finds for months.
 */
export async function POST(req: NextRequest) {
  let uid = '';
  try {
    const decodedAdmin = await verifyAdminRequest(req);
    if (!decodedAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. The workspace preview is an administrator setting.' },
        { status: 403 },
      );
    }
    uid = decodedAdmin.uid;

    await assertMfaSatisfied(req, decodedAdmin);
    await assertAccountActive(uid, { requireCurrentTerms: true, isAdminClaim: true });
    await assertRateLimit(`workspace_shell:${uid}:${getClientIp(req)}`, 60, 60 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const enabled = (body as { enabled?: unknown }).enabled;
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required field: enabled. Expected true or false.' },
        { status: 400 },
      );
    }

    const { db, FieldValue } = await getAdminDb();
    await db
      .collection('users')
      .doc(uid)
      .set(
        { [WORKSPACE_SHELL_FIELD]: enabled, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

    return NextResponse.json({ ok: true, ...(await answerFor(uid)) });
  } catch (err: unknown) {
    const said = refusal(err);
    if (said) return said;
    logger.error('workspace-shell write failed', { route: 'api/workspace-shell', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not save the workspace setting.' }, { status: 500 });
  }
}
