import { NextRequest, NextResponse } from 'next/server';
import { CONTACT_EMAIL } from '@/lib/constants';
import { recordEmailSent } from '@/lib/email-events';
import { verifyAdminRequest, assertAdminStepUp, getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/utils';
import { mockMailAllowed } from '@/lib/mail-delivery-mode';
import { wrapEmailDocument } from '@/lib/email-layout';
import { buildWelcomeEmail, WELCOME_EMAIL_SUBJECT } from '@/lib/welcome-email';

/**
 * POST /api/send-approval-email
 *
 * Sends the welcome mail on demand from the admin console.
 *
 * Signup does not come through here any more — a new account gets this mail
 * automatically from /api/account/register. What is left is the reinstatement
 * case: an administrator lifts a suspension and wants the person to know their
 * workspace is open again, with the same first-run guide and security answers
 * the original mail carried.
 *
 * The body is a copy of the one in `lib/welcome-email.ts`, not a second template:
 * the two "registration" mails this route and the old pending-mail route used to
 * send were 90 % identical and drifted apart line by line.
 */
export async function POST(request: NextRequest) {
  try {
    const adminToken = await verifyAdminRequest(request);
    if (!adminToken) {
      // Bewusst 403 (nicht 401): Token kann gültig sein, aber ohne Admin-Recht.
      return NextResponse.json(
        { error: 'Forbidden: administrator privileges required.' },
        { status: 403 },
      );
    }

    try {
      await assertAdminStepUp(request, adminToken);
    } catch (stepUpErr: any) {
      return NextResponse.json(
        { error: stepUpErr.message || 'Recent administrator step-up verification required.' },
        { status: stepUpErr.status || 403 },
      );
    }

    const body = await request.json();
    const { uid } = body;

    if (!uid || typeof uid !== 'string' || uid.length > 128) {
      return NextResponse.json({ error: 'Missing or invalid uid.' }, { status: 400 });
    }

    /*
     * The recipient is read from the account, never from the request.
     *
     * It used to be `{ email, name }` straight out of the body, and the admin
     * console filled those from `registration_requests/{uid}` — a document the
     * registering browser creates itself, with no field constraints in
     * `firestore.rules` (only `requestId == request.auth.uid`). So the address
     * the welcome mail went to was chosen by the person being approved, not by
     * the account they had proved they owned: sign up, write somebody else's
     * address into your own request row, and an approving administrator sends
     * a clean-core.io mail to them.
     *
     * The old check validated the *shape* of the address and not its *binding*,
     * which is why "F-04: Empfängeradresse validieren" did not prevent this.
     * Firebase Auth holds the address the account was created with, so that is
     * what this reads. Security audit of bc2f786, SEC-bc2f786-12 — the only part
     * of that finding that stands.
     *
     * **What this does not do, said plainly.** An Auth address is only *proven*
     * once `emailVerified` is true, and this product's password accounts are not
     * verified today (see `docs/BACKLOG.md`). So somebody can still sign up with
     * a stranger's address and have the welcome mail go there when an
     * administrator approves them. That is the ordinary unverified-signup risk
     * every product with this shape carries, and it is materially smaller than
     * what it replaced — the address is at least the one the account is bound to,
     * not a free-text field in a document the same browser wrote. Closing it
     * properly means verifying addresses at sign-up, which is a product change
     * and not a line here: a hard `emailVerified` check today would silently stop
     * the welcome mail for every existing account, which is the lockout shape
     * this codebase has been bitten by twice. Reported as `not_met` by the QA
     * review of 4a99d5355716, correctly — the first version of this comment
     * claimed the address was proven, and it is not.
     */
    const adminAuth = await getAdminAuth();
    let account;
    try {
      account = await adminAuth.getUser(uid);
    } catch {
      return NextResponse.json({ error: 'No such account.' }, { status: 404 });
    }

    const email = account.email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'The account has no usable e-mail address.' }, { status: 400 });
    }

    // The display name is the person's own, and only decorates the greeting.
    // `users/{uid}` is where they maintain it; Auth's displayName is the
    // fallback, and the address itself the last resort.
    const { db } = await getAdminDb();
    const profile = (await db.collection('users').doc(uid).get()).data() || {};
    const fromProfile = [profile.firstName, profile.lastName].filter((p: unknown) => typeof p === 'string' && p).join(' ').trim();
    const rawName = (fromProfile || account.displayName || email.split('@')[0]).slice(0, 200);

    const emailHtml = buildWelcomeEmail({
      name: escapeHtml(rawName),
      recipient: escapeHtml(email),
    });

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending welcome email to ${email}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core.io Team <team@clean-core.io>',
          to: email,
          subject: WELCOME_EMAIL_SUBJECT,
          reply_to: CONTACT_EMAIL,
          html: wrapEmailDocument(emailHtml),
        }),
      });

      // The failure used to be logged and then swallowed: the route answered
      // `success: true` regardless, so the admin console reported a welcome mail
      // that Resend had rejected.
      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Resend rejected the welcome mail:', errText);
        return NextResponse.json(
          { error: 'The welcome email could not be sent. Nothing was delivered to the user.' },
          { status: 502 },
        );
      }
      const sent = await resendRes.json().catch(() => ({} as any));
      console.log(`[Email] Sent welcome to ${email}. id=${sent?.id ?? 'unknown'}`);
      if (sent?.id) {
        await recordEmailSent(sent.id, email, WELCOME_EMAIL_SUBJECT, 'welcome').catch((err) =>
          console.error('[Email] Could not record sent event:', err),
        );
      }
    } else if (mockMailAllowed()) {
      // Offline/local development: printing the mail to the console *is* the
      // delivery channel, and the developer has it in front of them.
      console.log('\n======================================================');
      console.log('📬   [WELCOME EMAIL SENT TO USER]   📬');
      console.log(`To: ${rawName} (${email})`);
      console.log(`Subject: ${WELCOME_EMAIL_SUBJECT}`);
      console.log('======================================================\n');
    } else {
      // On the real deployment a missing key means nobody was told anything. The
      // console fallback ran here unguarded and the route still answered
      // `success: true`, so the admin console reported a welcome mail that was
      // never sent (QA review of 33471220d6e9, finding 14edf99a390c).
      console.error('[Email] RESEND_API_KEY missing in production — welcome mail not sent.');
      return NextResponse.json(
        { error: 'Email delivery is not configured. Nothing was delivered to the user.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-approval-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
