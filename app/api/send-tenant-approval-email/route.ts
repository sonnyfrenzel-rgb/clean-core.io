import { NextRequest, NextResponse } from 'next/server';
import { recordEmailSent } from '@/lib/email-events';
import { CONTACT_EMAIL, USER_MAIL_FROM } from '@/lib/constants';
import { htmlToText } from '@/lib/mail-text';
import { verifyAdminRequest, assertAdminStepUp, getAdminAuth } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/utils';
import { mockMailAllowed } from '@/lib/mail-delivery-mode';
import { wrapEmailDocument } from '@/lib/email-layout';
import { buildTenantApprovalEmail, TENANT_APPROVAL_SUBJECT } from '@/lib/tenant-email';

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
    const { uid, name: rawName } = body;

    if (typeof uid !== 'string' || !uid || uid.length > 128 || !rawName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // The address comes from the account, never from the request. It used to
    // arrive in the body, copied by the admin console out of the request
    // document — which the requester writes (tenant_access_requests, own uid,
    // no field check). A request could therefore name any address, and the
    // administrator's approval would mail it from team@clean-core.io, greeting
    // it by name (security audit of b88c77b, SEC-2026-235). Same rule as the
    // welcome mail since 3b8ca34: Auth says who the account is.
    let email: string | null = null;
    try {
      email = (await (await getAdminAuth()).getUser(uid)).email ?? null;
    } catch {
      email = null;
    }
    if (!email) {
      return NextResponse.json({ error: 'No account with a sign-in address under that uid.' }, { status: 404 });
    }
    if (typeof rawName !== 'string' || rawName.length > 200) {
      return NextResponse.json({ error: 'Invalid recipient name.' }, { status: 400 });
    }
    const name = escapeHtml(rawName);

    const emailSubject = TENANT_APPROVAL_SUBJECT;
    // A user mail: plain layout, one link (`lib/tenant-email.ts`, roadmap 3.0.9).
    // `email` stays raw for the envelope; the markup gets the escaped copy.
    const emailHtml = wrapEmailDocument(buildTenantApprovalEmail({ name, recipient: escapeHtml(email) }));

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Welcome Email to applicant ${email}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: USER_MAIL_FROM,
          to: email,
          subject: emailSubject,
          reply_to: CONTACT_EMAIL,
          html: emailHtml,
          // HTML-only was a spam signal (roadmap 3.0.9, seed run 20260924-a).
          text: htmlToText(emailHtml),
        }),
      });
      // The response was never looked at. Resend answering 400 or 500 produced
      // this same "Success" line and a `success: true` body, so the admin console
      // reported that a customer had been told something when no mail had been
      // accepted at all. The message id is recorded on the way through, which is
      // what lets a later delivery event from /api/webhooks/resend be joined to
      // this send.
      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Resend rejected the tenant approval:', errText);
        return NextResponse.json(
          { error: 'The notification could not be sent. The change was not applied.' },
          { status: 502 },
        );
      }
      const sent = await resendRes.json().catch(() => ({} as any));
      console.log(`[Email] Sent tenant approval to ${email}. id=${sent?.id ?? 'unknown'}`);
      if (sent?.id) {
        await recordEmailSent(sent.id, email, emailSubject, 'tenant approval').catch((err) =>
          console.error('[Email] Could not record sent event:', err),
        );
      }
    } else if (mockMailAllowed()) {
      // Offline/local development: the console log *is* the delivery channel.
      console.log('\n======================================================');
      console.log('📬   [WELCOME EMAIL SENT TO USER]   📬');
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log('======================================================\n');
    } else {
      // Production without a mail key: nobody was told, and saying otherwise is
      // the same defect as swallowing a rejection above (finding 14edf99a390c).
      console.error('[Email] RESEND_API_KEY missing in production — tenant approval mail not sent.');
      return NextResponse.json(
        { error: 'Email delivery is not configured. The notification could not be sent.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, to: email });
  } catch (error) {
    console.error('Error in send-tenant-approval-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
