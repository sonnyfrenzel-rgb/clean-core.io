import { NextRequest, NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';
import { verifyAdminRequest, assertAdminStepUp } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/utils';

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
    const name = escapeHtml(rawName);

    // Hardcoded base URL to prevent Host-Header injection
    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
    const dashboardUrl = `${BASE_URL}/dashboard`;

    const emailSubject = `🔒 S/4HANA Live Tenant Integration Suspended`;
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
                  Community Pilot
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
            This is typically due to the conclusion of the evaluation period, an administrative update, or security hygiene protocols. Your custom sandbox projects remain fully intact, but live connectivity tunnels will be bypassed using safe mock database engines until access is re-granted.
          </p>

          <!-- Security Trust Indicator -->
          <div style="background-color: #fcf8f3; border: 1px solid #fef3c7; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
            <span style="font-weight: 800; color: #92400e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Safe Mock Mode Active</span>
            <span style="color: #b45309; font-size: 13px; line-height: 1.5; display: block;">
              To prevent test suite failures, your Sandbox environment has automatically fallback-routed to localized mock engines. Your connection credentials in the Project Vault remain securely encrypted.
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
                <strong>Submit Business Motivation:</strong> You can submit a renewed BYOT request directly within your Pilot Account Settings page by providing an updated business scenario explanation.
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
            <span style="font-size: 12px; color: #94a3b8;">Community Pilot Program</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This transactional email was sent to ${email} regarding your updated pilot program capabilities on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
          </p>
          <p style="margin: 0;"><strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.</p>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Tenant Revoke Email to user ${email}...`);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core.io <team@clean-core.io>',
          to: email,
          subject: emailSubject,
          html: emailHtml,
        }),
      });
      console.log('[Email] Success sending Tenant Revoke Email.');
    } else {
      // Offline/Local development fallback
      console.log('\n======================================================');
      console.log('📬   [TENANT REVOKE EMAIL SENT TO USER]   📬');
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Dashboard Link: ${dashboardUrl}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-tenant-revoke-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
