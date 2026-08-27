import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, assertAdminStepUp } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/utils';
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
    const { email, name: rawName } = body;

    if (!email || !rawName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // F-04: Empfängeradresse validieren (verhindert Missbrauch des Mailers selbst durch Admins)
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Invalid recipient email.' }, { status: 400 });
    }
    if (typeof rawName !== 'string' || rawName.length > 200) {
      return NextResponse.json({ error: 'Invalid recipient name.' }, { status: 400 });
    }

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
          html: wrapEmailDocument(emailHtml),
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Failed to send Welcome Email via Resend API:', errText);
      } else {
        console.log('[Email] Success sending Welcome Email.');
      }
    } else {
      // Offline/Local development fallback
      console.log('\n======================================================');
      console.log('📬   [WELCOME EMAIL SENT TO USER]   📬');
      console.log(`To: ${rawName} (${email})`);
      console.log(`Subject: ${WELCOME_EMAIL_SUBJECT}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-approval-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
