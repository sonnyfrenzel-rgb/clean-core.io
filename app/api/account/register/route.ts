import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, activateAccount } from '@/lib/firebase-admin';
import { recordConsent } from '@/lib/consent';
import { escapeHtml } from '@/lib/utils';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { wrapEmailDocument } from '@/lib/email-layout';
import { buildWelcomeEmail, WELCOME_EMAIL_SUBJECT } from '@/lib/welcome-email';
import { buildAdminSignupEmail, buildAdminSignupSubject } from '@/lib/admin-signup-email';
import { CONTACT_EMAIL, TERMS_VERSION } from '@/lib/constants';

/**
 * POST /api/account/register
 *
 * Finishes a registration the browser has just started, and replaces
 * /api/request-pilot.
 *
 * The old route mailed an administrator two one-click links and left the
 * applicant on a "we are reviewing your application" screen until somebody
 * clicked one. Nobody reviews anything any more: this activates the account on
 * the spot, records the consent that was given server-side, sends the new user a
 * single welcome mail carrying both the first-run guide and the security
 * answers, and sends the administrator one notification with no action in it.
 *
 * What stays server-side, deliberately:
 *  - `status` never leaves `pending` on a client write (Firestore rules), so
 *    activation is still a server decision even though it is automatic.
 *  - consent is written by the Admin SDK into append-only `consent_events`
 *    (finding V14); the client can no longer assert its own acceptance.
 *  - the welcome mail only ever goes to the *authenticated* account's own
 *    address, never one supplied in the body (the F-13 rule the old routes had).
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;

    try {
      await assertRateLimit(`account-register:${uid}:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    } catch (rateErr: any) {
      return NextResponse.json(
        { error: rateErr.message || 'Too many requests. Please wait and try again.' },
        { status: rateErr.status || 429 },
      );
    }

    const rawEmail = decodedToken.email || '';
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json({ error: 'Authenticated account has no valid email.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({} as any));
    const motivationRaw = typeof body?.motivation === 'string' ? body.motivation.slice(0, 2000) : '';
    const acceptedTerms = body?.acceptedTerms === true;
    const acceptedPrivacy = body?.acceptedPrivacy === true;

    const { db, FieldValue } = await getAdminDb();
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      // The browser writes the profile first; without it there is nothing to
      // activate and re-creating it here would bypass the create rules.
      return NextResponse.json(
        { error: 'User profile not found. Please complete registration first.' },
        { status: 404 },
      );
    }
    const profile = userSnap.data() || {};

    // Name for the mails: what the form sent, else what is already on the
    // profile, else the identity provider's, else the address itself.
    const bodyName = [body?.firstName, body?.lastName]
      .filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
      .join(' ')
      .trim();
    const profileName = [profile.firstName, profile.lastName]
      .filter((p: unknown) => typeof p === 'string' && String(p).trim().length > 0)
      .join(' ')
      .trim();
    const rawName = (bodyName || profileName || (decodedToken as any).name || rawEmail).slice(0, 200);

    // Consent: record it once, server-side, only where it was actually given.
    // An account that already carries an acceptance is not asked again here.
    let termsVersion: string | null = profile.termsVersionAccepted || null;
    if (acceptedTerms && acceptedPrivacy && !termsVersion) {
      try {
        await recordConsent({
          uid,
          email: rawEmail,
          source: 'api/account/register',
          locale: typeof body?.locale === 'string' ? body.locale : null,
        });
        termsVersion = TERMS_VERSION;
      } catch (consentErr) {
        console.error('[account/register] failed to record consent:', consentErr);
        return NextResponse.json({ error: 'Could not record your consent. Please try again.' }, { status: 500 });
      }
    }

    // No consent, no account. Recording the acceptance where it was given is only
    // half of V14: an endpoint that activates regardless of what the body says
    // makes the whole mechanism optional, because a client can simply post
    // `acceptedTerms: false` and still come out `approved` with full API access.
    // `assertAccountActive({ requireCurrentTerms })` would not catch it either —
    // it grandfathers a *missing* acceptance so that pre-consent accounts are not
    // locked out, and only blocks a previously accepted version that has gone
    // stale. So the gate belongs here, at the one door into an active account.
    if (!termsVersion) {
      return NextResponse.json(
        { error: 'The Terms of Service and Privacy Policy must be accepted before an account can be activated.' },
        { status: 400 },
      );
    }

    const { activated, status } = await activateAccount(uid);

    if (!activated) {
      // Already active, or suspended — either way nothing to announce.
      return NextResponse.json({ ok: true, activated: false, status });
    }

    await db.collection('registration_requests').doc(uid).set(
      {
        email: rawEmail,
        name: rawName,
        motivation: motivationRaw,
        status: 'approved',
        activatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const name = escapeHtml(rawName);
    const recipient = escapeHtml(rawEmail);
    const welcomeHtml = wrapEmailDocument(buildWelcomeEmail({ name, recipient }));
    const adminHtml = wrapEmailDocument(
      buildAdminSignupEmail({
        name,
        email: recipient,
        uid: escapeHtml(uid),
        motivation: escapeHtml(motivationRaw),
        authMethod: profile.authMethod === 'password' ? 'Email / password' : 'Google',
        termsVersion,
        signedUpAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      }),
    );

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      await sendMail(resendApiKey, {
        from: 'Clean-Core.io Team <team@clean-core.io>',
        to: rawEmail,
        subject: WELCOME_EMAIL_SUBJECT,
        html: welcomeHtml,
        label: 'welcome',
      });
      await sendMail(resendApiKey, {
        from: 'Clean-Core <system@clean-core.io>',
        to: CONTACT_EMAIL,
        subject: buildAdminSignupSubject(rawName),
        html: adminHtml,
        label: 'admin signup notification',
      });
    } else {
      console.log('\n======================================================');
      console.log('📬   [ACCOUNT ACTIVATED — MAILS SUPPRESSED, NO RESEND KEY]   📬');
      console.log(`User: ${rawName} <${rawEmail}> (${uid})`);
      console.log(`Welcome subject: ${WELCOME_EMAIL_SUBJECT}`);
      console.log(`Admin subject:   ${buildAdminSignupSubject(rawName)}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ ok: true, activated: true, status });
  } catch (error: any) {
    console.error('Error in account/register API:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Internal Server Error' : error.message },
      { status },
    );
  }
}

/**
 * A failed mail must not fail the registration — the account is already active
 * and the person is already looking at the dashboard. Log it and move on.
 */
async function sendMail(
  apiKey: string,
  msg: { from: string; to: string; subject: string; html: string; label: string },
): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html }),
    });
    if (!res.ok) {
      console.error(`[Email] Failed to send ${msg.label} via Resend:`, await res.text());
    } else {
      console.log(`[Email] Sent ${msg.label} to ${msg.to}.`);
    }
  } catch (err) {
    console.error(`[Email] Error sending ${msg.label}:`, err);
  }
}
