import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  getAdminAuth,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/utils';
import { APP_BASE_URL } from '@/lib/constants';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import {
  buildInvitationEmail,
  buildInviterAddressConfirmationEmail,
  inviterNameForMail,
  INVITATION_EMAIL_SUBJECT,
  INVITER_CONFIRMATION_SUBJECT,
} from '@/lib/invitation-email';
import { ownDomainVerifyEmailLink } from '@/lib/auth-action-link';
import {
  INVITATION_COLLECTION,
  INVITATION_MAX_OPEN,
  INVITATION_TOO_MANY_CODE,
  invitationExpiry,
  invitationLinkPath,
  invitationNotSentMessage,
  invitationTooManyMessage,
  isOpen,
  normaliseInvitedEmail,
  type Invitation,
} from '@/lib/invitations';
import { isFirestoreId } from '@/lib/firestore-id';
import {
  openInvitationsAsOwner,
  readOpenInvitations,
  INVITATION_SEND_DAILY_LIMIT,
  INVITATION_SEND_RATE_LIMIT,
} from '@/lib/invitation-owner-gate';

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
 * `firestore.rules` denies every client read and write of that subcollection
 * with an explicit `allow read, write: if false`, so no client reads or writes
 * it, and only the Admin SDK touches it. Project and account deletion take
 * the invitations with them:
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
  | { ok: true; uid: string; email: string; emailVerified: boolean; projectId: string; project: ProjectShape }
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
  // a mailer. Per account, not per account and address: with the client
  // address in the key every new source address was a fresh budget of mails
  // — the account is already the narrower identity.
  try {
    await assertRateLimit(`invitations:${decodedToken.uid}`, INVITATION_SEND_RATE_LIMIT, 60 * 60 * 1000);
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
  // Checked before the id forms any document path.
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
    emailVerified: decodedToken.email_verified === true,
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

/**
 * The answer for an inviter whose address is not confirmed, or null when it is.
 *
 * Confirmed on the token, or `emailVerified: true` on the profile. Otherwise a
 * confirmation link is mailed to the account's own address — never one from the
 * body — under the budget the acceptance route uses for the same mail (three an
 * hour, shared), and the request is refused with a code the page can branch on.
 */
async function unconfirmedInviterResponse(gate: Extract<Gate, { ok: true }>): Promise<NextResponse | null> {
  if (gate.emailVerified) return null;
  const { db } = await getAdminDb();
  try {
    const profile = await db.collection('users').doc(gate.uid).get();
    if ((profile.data() as { emailVerified?: unknown } | undefined)?.emailVerified === true) return null;
  } catch {
    /* an unreadable profile confirms nothing */
  }
  let sent = false;
  const accountEmail = normaliseInvitedEmail(gate.email);
  if (accountEmail) {
    try {
      await assertRateLimit(`invitation-confirm-mail:${gate.uid}`, 3, 60 * 60 * 1000);
      const link = ownDomainVerifyEmailLink(await (await getAdminAuth()).generateEmailVerificationLink(accountEmail));
      const outcome = await sendTransactionalMail({
        to: accountEmail,
        subject: INVITER_CONFIRMATION_SUBJECT,
        label: 'address confirmation',
        uid: gate.uid,
        html: wrapEmailDocument(
          buildInviterAddressConfirmationEmail({ recipient: escapeHtml(accountEmail), link }),
          'Clean-Core.io — confirm your address',
        ),
      });
      sent = outcome.delivered;
    } catch (mailErr: unknown) {
      logger.warn('confirmation mail for an inviter could not be sent', {
        route: 'api/projects/invitations',
        error: errMessage(mailErr),
      });
    }
  }
  return NextResponse.json(
    {
      error: sent
        ? 'Inviting a reader needs a confirmed email address. We have just sent a confirmation link to your address — open it, sign in again, and then send the invitation.'
        : 'Inviting a reader needs a confirmed email address. Confirm your address, sign in again, and then send the invitation.',
      code: 'email-unconfirmed',
      confirmationSent: sent,
    },
    { status: 403 },
  );
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

    // SEC-02 (owner decision 22.10.2026), after the request itself is known to
    // be one: an invitation is a mail from
    // clean-core.io to an address this account types, so it goes out only from
    // an account whose own address is confirmed — on the token (Google sign-in,
    // or a password account that confirmed) or on the profile.
    const unconfirmed = await unconfirmedInviterResponse(gate);
    if (unconfirmed) return unconfirmed;

    // And a day's budget on top of the hourly one: twenty an hour around the
    // clock is still 480 mails a day.
    try {
      await assertRateLimit(`invitations-day:${gate.uid}`, INVITATION_SEND_DAILY_LIMIT, 24 * 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Too many invitations today.', code: 'invitations-daily-limit' },
        { status: q?.status || 429 },
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
        // path after its erasure.
        const current = await tx.get(db.collection('projects').doc(gate.projectId));
        if (!current.exists || current.data()?.userId !== gate.uid) throw projectGone;
        // Only invitations that have not expired can hold a slot, so only they
        // are read: the history of accepted, withdrawn and expired ones grows
        // for the life of the project and was read whole on every invitation.
        // `expiresAt` is an ISO string, so
        // the range compares in time order; one field, no composite index.
        const existing = await tx.get(ref.parent.where('expiresAt', '>', invitedAt.toISOString()));
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
          // The profile name is the inviting account's own free text: repeated
          // once, plain, bounded and labelled as unchecked (SEC-02).
          inviterName: escapeHtml(inviterNameForMail(invitation.invitedBy.name)),
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
      //
      // An update, not a merge-set: a merge onto a missing document creates it,
      // so a project deleted (or an account erased) while the mail was out got
      // back an invitation under a project that no longer exists. A missing
      // invitation (gRPC NOT_FOUND, code 5) is already as withdrawn as it can
      // be.
      const withdrawn = await ref
        .update({ status: 'revoked', revokedAt: new Date().toISOString() })
        .then(
          () => true,
          (err: unknown) => {
            const code = (err as { code?: unknown } | null)?.code;
            if (code === 5 || code === 'not-found') return true;
            logger.error('invitation could not be withdrawn after a failed send', {
              route: 'api/projects/invitations',
              projectId: gate.projectId,
              error: errMessage(err),
            });
            return false;
          },
        );
      return NextResponse.json(
        {
          error: invitationNotSentMessage(outcome.detail, withdrawn),
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

/**
 * GET → the invitations of this project that are still waiting: address, sent,
 * expires. The owner's only (owner decision 01.10.2026: an unanswered
 * invitation stays visible to the person who sent it, with its expiry and a
 * way to withdraw it — `DELETE …/invitations/{invitationId}`).
 *
 * It answers nothing else. Accepted invitations are the readers list
 * (`/readers`), and revoked or expired ones grant nothing. Its own rate budget,
 * so looking at the list never uses up what sending or withdrawing needs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    // The addresses of people who have not answered yet are personal data; a
    // token from before the second factor reads none of them.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }
    const { projectId } = await params;
    const gate = await openInvitationsAsOwner(decodedToken.uid, projectId, 'invitations-list');
    if (!gate.ok) return gate.response;

    // Only invitations that have not expired yet are read, as in POST, page by
    // page in expiry order: one bounded page filtered afterwards let accepted
    // and withdrawn invitations crowd a pending one out.
    // The bound on reads is in the helper.
    return NextResponse.json({ open: await readOpenInvitations(gate.db, gate.projectId) });
  } catch (err: unknown) {
    logger.error('open invitations could not be read', {
      route: 'api/projects/invitations',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not read the invitations of this project.' }, { status: 500 });
  }
}
