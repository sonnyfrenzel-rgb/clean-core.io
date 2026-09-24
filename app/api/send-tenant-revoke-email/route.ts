import { NextRequest, NextResponse } from 'next/server';
import { recordEmailSent } from '@/lib/email-events';
import { CONTACT_EMAIL, USER_MAIL_FROM } from '@/lib/constants';
import { htmlToText } from '@/lib/mail-text';
import { APP_VERSION } from '@/lib/version';
import { verifyAdminRequest, assertAdminStepUp, getAdminAuth } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/utils';
import { mockMailAllowed } from '@/lib/mail-delivery-mode';
import { wrapEmailDocument } from '@/lib/email-layout';

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

    // Hardcoded base URL to prevent Host-Header injection
    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
    const dashboardUrl = `${BASE_URL}/dashboard`;

    const emailSubject = `Your S/4HANA tenant access on Clean-Core.io has been suspended`;
    const emailHtml = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
        <!-- Card Container -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; padding: 40px;">
          
          <!-- Logo & Branding -->
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 32px; border-bottom: 1px solid #f1f5f9; padding-bottom: 24px;">
            <tr>
              <td align="left" valign="middle">
                <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; margin: 0; line-height: 1.2;">
                  Clean-Core<span style="color: #10b981;">.io</span>
                </div>
                <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 4px; line-height: 1.2;">
                  Free Community SAP Modernization Platform
                </div>
              </td>
              <td align="right" valign="middle" style="text-align: right;">
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0284c7; background-color: #f0f9ff; padding: 6px 12px; border-radius: 8px; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Free Community Edition
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.1em; background-color: #fef2f2; padding: 6px 12px; border-radius: 9999px; border: 1px solid #fecaca;">
              ✕ Access Suspended
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Live Tenant Bridge is Suspended</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello ${name},
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            Please be informed that your integration access for a <strong>Live S/4HANA Public Cloud Custom Tenant</strong> has been temporarily suspended or deactivated by the Clean-Core.io system administration.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            This is typically due to the conclusion of the evaluation period, an administrative update, or security hygiene protocols. Your projects remain fully intact; connection checks against your tenant are unavailable until access is re-granted.
          </p>

          <!-- Security Trust Indicator -->
          <div style="background-color: #fcf8f3; border: 1px solid #fef3c7; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
            <span style="font-weight: 800; color: #92400e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Mock Environment Unchanged</span>
            <span style="color: #b45309; font-size: 13px; line-height: 1.5; display: block;">
              Generated tests always run against mocks, so they keep working exactly as before. Your connection credentials remain stored encrypted.
            </span>
          </div>

          <!-- Recovery Guidelines -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">💡 How to Restore Live Connections:</span>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
              <li style="margin-bottom: 8px;">
                <strong>Contact Support:</strong> Get in touch with our engineering team at <a href="mailto:info@clean-core.io" style="color: #0284c7; text-decoration: none; font-weight: 600;">info@clean-core.io</a> to request an access review.
              </li>
              <li style="margin-bottom: 8px;">
                <strong>Submit Business Motivation:</strong> You can submit a renewed BYOT request directly within your Account Settings page by providing an updated business scenario explanation.
              </li>
              <li>
                <strong>Bring Your Own Key (BYOK):</strong> Your server-side modernization wizard functions and Gemini AI blueprint pipelines remain fully accessible via your private API keys.
              </li>
            </ul>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 36px;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
              Open Workspace Dashboard
            </a>
          </div>

          <!-- Professional Signature -->
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
            Warm regards,<br />
            <strong>The Clean-Core.io Team</strong><br />
            <span style="font-size: 12px; color: #94a3b8;">Free Community Edition Program</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This transactional email was sent to ${email} regarding your updated free community program capabilities on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
          </p>
          <p style="margin: 0;"><strong>Data Erasure (Art. 17 GDPR):</strong> You have the right to erasure. To remove the database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard; encrypted backups age out within 30 days.</p>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Tenant Revoke Email to user ${email}...`);
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
          html: wrapEmailDocument(emailHtml),
          // HTML-only was a spam signal (roadmap 3.0.9, seed run 20260924-a).
          text: htmlToText(wrapEmailDocument(emailHtml)),
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
        console.error('[Email] Resend rejected the tenant revoke:', errText);
        return NextResponse.json(
          { error: 'The notification could not be sent. The change was not applied.' },
          { status: 502 },
        );
      }
      const sent = await resendRes.json().catch(() => ({} as any));
      console.log(`[Email] Sent tenant revoke to ${email}. id=${sent?.id ?? 'unknown'}`);
      if (sent?.id) {
        await recordEmailSent(sent.id, email, emailSubject, 'tenant revoke').catch((err) =>
          console.error('[Email] Could not record sent event:', err),
        );
      }
    } else if (mockMailAllowed()) {
      // Offline/local development: the console log *is* the delivery channel.
      console.log('\n======================================================');
      console.log('📬   [TENANT REVOKE EMAIL SENT TO USER]   📬');
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Dashboard Link: ${dashboardUrl}`);
      console.log('======================================================\n');
    } else {
      // Production without a mail key: nobody was told, and saying otherwise is
      // the same defect as swallowing a rejection above (finding 14edf99a390c).
      console.error('[Email] RESEND_API_KEY missing in production — tenant revoke mail not sent.');
      return NextResponse.json(
        { error: 'Email delivery is not configured. The notification could not be sent.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, to: email });
  } catch (error) {
    console.error('Error in send-tenant-revoke-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
