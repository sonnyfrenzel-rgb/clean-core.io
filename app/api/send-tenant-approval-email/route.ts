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

    const emailSubject = `Your S/4HANA tenant access on Clean-Core.io is active`;
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
            <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.1em; background-color: #f0f9ff; padding: 6px 12px; border-radius: 9999px; border: 1px solid #bae6fd;">
              ✓ Access Activated
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Live Tenant Bridge is Unlocked</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello ${name},
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            Great news! Your request to integrate a <strong>Live S/4HANA Public Cloud Custom Tenant</strong> has been reviewed and approved by our engineering team. You can now connect your non-productive SAP environment in Stage 5 to check the connection and read OData metadata. Running the generated tests against the tenant is locked until the isolated live runner has passed its external review — they run against mocks.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            When you enter your Stage 5 Testing Sandbox, you will notice the custom tenant panel is fully unlocked. Simply click the new "Check tenant connection" tab, plug in your credentials, and click "Test Connection".
          </p>

          <!-- Security Trust Indicator -->
          <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
            <span style="font-weight: 800; color: #065f46; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Credentials stay on the server</span>
            <span style="color: #047857; font-size: 13px; line-height: 1.5; display: block;">
              Credentials are encrypted with AES-256-GCM in a server-only store, decrypted only for the server-side calls to your tenant, and never returned to the browser.
            </span>
          </div>

          <!-- Enterprise Compliance Checklist -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">🔒 Safe-Connection Guidelines:</span>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
              <li style="margin-bottom: 8px;">
                <strong>BTP Destination Service:</strong> Always prefer importing your connection as a standard BTP HTTP Destination JSON instead of manual credentials to inherit BTP connectivity profiles.
              </li>
              <li style="margin-bottom: 8px;">
                <strong>Principal Propagation:</strong> Utilize OAuth 2.0 SAML Bearer Assertions for authentication to enforce user-specific identity propagation and audit logs inside your target ERP.
              </li>
              <li style="margin-bottom: 8px;">
                <strong>Secure Cloud Connector:</strong> For On-Premise development tenants, route all traffic through a secure SAP Cloud Connector tunnel (Location ID routing) to keep your firewall closed.
              </li>
              <li>
                <strong>Read-Only, Server-Side:</strong> Connection checks and metadata reads are sent from the Clean-Core.io server as read-only requests. Generated tests are not run against your tenant — that path is locked.
              </li>
            </ul>
          </div>

          <!-- Feature Recap -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Unlocked S/4HANA Capabilities:</h3>
            
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">✨ Connection Check &amp; OData Metadata</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Check the connection, read OData metadata and make one read-only call against your non-productive tenant.</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🔒 Encrypted Credentials Vault</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Protect Basic authentication credentials or OAuth 2.0 secrets in Firestore with Zero-Trust access rules.</span>
            </div>

            <div>
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🖥️ Live Console Output Logs</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Colour-coded logs of the read-only connection-check requests sent to your S/4HANA tenant.</span>
            </div>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 36px;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);">
              Open Sandbox Cockpit
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
            This transactional email was sent to ${email} regarding your unlocked free community program capabilities on Clean-Core.io.
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
      console.log(`Dashboard Link: ${dashboardUrl}`);
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
