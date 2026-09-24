import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/utils';
import { APP_BASE_URL } from '@/lib/constants';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import { buildInvitationEmail, INVITATION_EMAIL_SUBJECT } from '@/lib/invitation-email';
import {
  INVITATION_COLLECTION,
  INVITATION_MAX_OPEN,
  INVITATION_TOO_MANY_CODE,
  invitationExpiry,
  invitationLinkPath,
  invitationTooManyMessage,
  isOpen,
  normaliseInvitedEmail,
  type Invitation,
} from '@/lib/invitations';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * Inviting one person to read one project — roadmap 5.2.
 *
 *   POST { email, expiresInDays? } → `{ invitation }`, created and mailed.
 *
 * Four properties, enforced here rather than asked of the caller:
 *
 *   1. **Nothing on the document comes out of the body.** The two times are this
 *      server's clock, `invitedBy` is the verified ID token and the profile
 *      behind it, `status` is `pending` because this route is the only thing
 *      that creates one, and `acceptedBy` / `acceptedAt` / `revokedAt` are null
 *      because nothing has happened yet. The body carries an address and, at
 *      most, a shorter lifetime — a longer one is not honoured, it is replaced
 *      by the default (`invitationExpiry`). An invitation whose author or expiry
 *      the caller chooses is a form, not a grant.
 *   2. **An invitation is created, never written again.** `DocumentReference.create()`
 *      fails if the document exists, the same way roadmap 3.2 writes a revision.
 *      No `set`, no merge. The id is 24 random bytes, so nothing collides and
 *      nothing is enumerable.
 *   3. **No invitation outlives a mail that did not go out.** The document has
 *      to exist before the link can name it, so the order is create → send →
 *      and, if the provider refused, withdraw it again in the same request. The
 *      alternative is a live grant to an address that was never told about it,
 *      sitting in the store until somebody guesses 24 random bytes.
 *   4. **At most three invitations wait at once** (`INVITATION_MAX_OPEN`, Sonny
 *      18.09.2026). The rate limit below caps how fast they go out; it cannot
 *      cap how many stand open, and a route that mails an address its caller
 *      typed needs both. Counted inside the transaction that creates, so two
 *      overlapping requests cannot both find room for the same slot.
 *
 * Stored at `projects/{projectId}/invitations/{id}` through the Admin SDK.
 * `firestore.rules` has no match for that subcollection, so no client reads or
 * writes it, and **no rules change and no rules deploy** are needed for this
 * step. Project and account deletion take the invitations with them:
 * `recursiveDelete` on the project document descends into every subcollection.
 *
 * The owner's overview and the withdrawal are roadmap 5.5 and belong in this
 * file as `GET` and in `[invitationId]/route.ts` as `DELETE`; neither exists
 * yet, and nothing here assumes them.
 *
 * Owner only. An administrator cannot invite anybody to a project they cannot
 * read themselves — `firestore.rules` took reading away from the console on
 * 16.09.2026, and handing out a reader's link would put it straight back.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProjectShape {
  userId?: unknown;
  name?: unknown;
}

type Gate =
  | { ok: true; uid: string; email: string; projectId: string; project: ProjectShape }
  | { ok: false; response: NextResponse };

/**
 * The Admin SDK is reached through a dynamic import, so its handles arrive
 * untyped — the same shape `readers/route.ts` names for the same reason. Only
 * the two members the ceiling uses are declared.
 */
interface InviteDoc {
  data: () => Record<string, unknown>;
}
interface Tx {
  get: (r: unknown) => Promise<{ docs: InviteDoc[]; exists: boolean; data: () => Record<string, unknown> | undefined }>;
  create: (r: unknown, data: Record<string, unknown>) => void;
}

async function openProject(req: NextRequest, params: Promise<{ projectId: string }>): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  // Handing a third party the source code of a project is at least as grave as
  // editing its evidence, so it sits behind the same second factor as every
  // other route that touches a project's code.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      ),
    };
  }

  // The route sends mail to an address the caller types. Without a ceiling it is
  // a mailer.
  try {
    await assertRateLimit(`invitations:${decodedToken.uid}:${getClientIp(req)}`, 20, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
    };
  }

  try {
    await assertAccountActive(decodedToken.uid, {
      requireCurrentTerms: true,
      isAdminClaim: decodedToken.admin === true,
    });
  } catch (gateErr: unknown) {
    if (gateErr instanceof QuotaError) {
      return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
    }
    throw gateErr;
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }
  // Checked before the id forms any document path (SEC-2026-514).
  if (!isFirestoreId(projectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  }

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  // Same answer for "no such project" and "not yours": a 404 that only appears
  // for projects that exist is a way to ask whether one does. The wording is
  // the one `app/api/projects/[projectId]/route.ts:56` and
  // `readers/route.ts:144` already use, so that the three do not drift apart.
  //
  // Inviting is the owner's alone, so an invited reader is a non-owner here and
  // gets that same sentence — which is what `readers/route.ts` does with every
  // non-owner too. It used to be 403 on a project that was found and 404 on one
  // that was not, and those two together let a stranger holding a guessed id
  // learn from the status code alone whether it names a real project.
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = (snap.data() || {}) as ProjectShape;
  if (project.userId !== decodedToken.uid) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  return {
    ok: true,
    uid: decodedToken.uid,
    email: typeof decodedToken.email === 'string' ? decodedToken.email : '',
    projectId,
    project,
  };
}

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

/** The name on the profile, or the address. Read here, never sent by a browser. */
async function inviterName(db: AdminDb, uid: string, fallback: string): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() || {}) as { firstName?: string; lastName?: string; email?: string };
    const name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    if (name) return name.slice(0, 200);
    if (typeof data.email === 'string' && data.email) return data.email.slice(0, 200);
  } catch {
    /* a missing profile must not stop the invitation — it is named by the token's address */
  }
  return (fallback || uid).slice(0, 200);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params);
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => null)) as { email?: unknown; expiresInDays?: unknown } | null;
    const email = normaliseInvitedEmail(body?.email);
    if (!email) {
      return NextResponse.json(
        { error: 'Enter one email address to invite.', code: 'bad-email' },
        { status: 400 },
      );
    }
    // Inviting yourself does nothing — you are the owner — and it would put the
    // owner's own uid into `readers`, where a later revocation would then take
    // away a permission the owner has from being the owner.
    if (email === normaliseInvitedEmail(gate.email)) {
      return NextResponse.json(
        { error: 'This is your own address. You already have access to this project.', code: 'self-invite' },
        { status: 400 },
      );
    }

    const { db } = await getAdminDb();
    const invitedAt = new Date();
    const invitation: Invitation = {
      id: crypto.randomBytes(24).toString('base64url'),
      projectId: gate.projectId,
      email,
      invitedBy: { uid: gate.uid, name: await inviterName(db, gate.uid, gate.email) },
      // The server's clock, both of them. A time a browser supplied would be a
      // time anybody could choose, and the expiry is the only thing that ends an
      // invitation nobody remembers to withdraw.
      invitedAt: invitedAt.toISOString(),
      expiresAt: invitationExpiry(invitedAt, body?.expiresInDays).toISOString(),
      status: 'pending',
      acceptedBy: null,
      acceptedAt: null,
      revokedAt: null,
    };

    const ref = db
      .collection('projects')
      .doc(gate.projectId)
      .collection(INVITATION_COLLECTION)
      .doc(invitation.id);

    // Property 4: a project has at most three invitations waiting at once
    // (`INVITATION_MAX_OPEN`, Sonny 18.09.2026). Counted and taken in one
    // transaction rather than read-then-write: two requests that overlap would
    // otherwise both count three and both write a fourth, which is the one
    // shape of race a ceiling exists to stop. Accepted, revoked and expired
    // invitations hold no slot, so withdrawing one frees it at once.
    const tooMany = Symbol('invitation ceiling');
    const projectGone = Symbol('project gone');
    try {
      await db.runTransaction(async (tx: Tx) => {
        // The project again, inside the transaction: one deleted (or handed
        // away) since `openProject` read it must not get an invitation — the
        // recipient's address and the inviter's name — written beneath its
        // path after its erasure (QA full review of a12774cd2b7f).
        const current = await tx.get(db.collection('projects').doc(gate.projectId));
        if (!current.exists || current.data()?.userId !== gate.uid) throw projectGone;
        const existing = await tx.get(ref.parent);
        const open = existing.docs.filter((d: InviteDoc) =>
          isOpen(d.data() as unknown as Pick<Invitation, 'status' | 'expiresAt'>, invitedAt),
        ).length;
        if (open >= INVITATION_MAX_OPEN) throw tooMany;
        tx.create(ref, invitation as unknown as Record<string, unknown>);
      });
    } catch (ceilingErr: unknown) {
      if (ceilingErr === projectGone) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
      if (ceilingErr === tooMany) {
        return NextResponse.json(
          { error: invitationTooManyMessage(), code: INVITATION_TOO_MANY_CODE },
          { status: 409 },
        );
      }
      throw ceilingErr;
    }

    const link = `${APP_BASE_URL}${invitationLinkPath(gate.projectId, invitation.id)}`;
    const outcome = await sendTransactionalMail({
      to: email,
      subject: INVITATION_EMAIL_SUBJECT,
      label: 'invitation',
      html: wrapEmailDocument(
        buildInvitationEmail({
          inviterName: escapeHtml(invitation.invitedBy.name),
          recipient: escapeHtml(email),
          link,
          expires: new Date(invitation.expiresAt).toUTCString().slice(5, 16),
        }),
        'Clean-Core.io — invitation',
      ),
    });

    if (!outcome.delivered) {
      // Property 3: an invitation nobody was told about is a grant with no
      // reader. It is withdrawn in the same request rather than left behind, and
      // the owner is told that nothing went out instead of that it did.
      await ref
        .set({ status: 'revoked', revokedAt: new Date().toISOString() }, { merge: true })
        .catch((err: unknown) =>
          logger.error('invitation could not be withdrawn after a failed send', {
            route: 'api/projects/invitations',
            projectId: gate.projectId,
            error: errMessage(err),
          }),
        );
      return NextResponse.json(
        {
          error: `${outcome.detail} Nothing was sent, and the invitation was withdrawn.`,
          code: outcome.reason,
        },
        { status: outcome.reason === 'not-configured' ? 503 : 502 },
      );
    }

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err: unknown) {
    logger.error('invitation could not be created', {
      route: 'api/projects/invitations',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not create this invitation.' }, { status: 500 });
  }
}
