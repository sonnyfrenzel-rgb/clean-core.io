import { NextRequest, NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const dashboardUrl = `${protocol}://${host}/dashboard`;

    const emailSubject = `🎉 S/4HANA Live Tenant Integration Unlocked!`;
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
                  Enterprise Modernization Suite
                </div>
              </td>
              <td align="right" valign="middle" style="text-align: right;">
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0284c7; background-color: #f0f9ff; padding: 6px 12px; border-radius: 8px; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Premium Beta
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
            Great news! Your request to integrate a **Live S/4HANA Public Cloud Custom Tenant** has been reviewed and approved by our engineering team. You now have full access to test transformations directly against your non-productive SAP environments.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            When you enter your Stage 5 Testing Sandbox, you will notice the custom tenant panel is fully unlocked. Simply click the new "Connected S/4HANA Tenant" tab, plug in your credentials, and click "Test Connection".
          </p>

          <!-- Security Trust Indicator -->
          <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
            <span style="font-weight: 800; color: #065f46; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Secure & Compliant Sandbox Execution</span>
            <span style="color: #047857; font-size: 13px; line-height: 1.5; display: block;">
              Credentials are stored securely in your project document with restricted write access and decrypted dynamically only within server-side execution runtime proxy requests. They are never exposed directly on public client APIs.
            </span>
          </div>

          <!-- Enterprise Compliance Checklist -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">🔒 CISO & Compliance Safe-Connection Guidelines:</span>
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
                <strong>Stateless Sandbox Proxy:</strong> The sandbox executes all queries client-side or via stateless transit proxies. No data is stored, persisted, or used for LLM training.
              </li>
            </ul>
          </div>

          <!-- Feature Recap -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Unlocked S/4HANA Capabilities:</h3>
            
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">✨ Live OData Queries</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Execute dynamic SAP Cloud SDK code directly against your non-productive development sandbox and view raw JSON results.</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🔒 Encrypted Credentials Vault</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Protect Basic authentication credentials or OAuth 2.0 secrets in Firestore with Zero-Trust access rules.</span>
            </div>

            <div>
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🖥️ Live Console Output Logs</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">View beautiful, swipeable, color-coded execution logs of requests routed to your S/4HANA tenant.</span>
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
            <span style="font-size: 12px; color: #94a3b8;">Beta Program Administration</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This transactional email was sent to ${email} regarding your unlocked pilot program capabilities on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Enterprise Modernization Suite • Confidential
          </p>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Pilot Welcome Email to applicant ${email}...`);
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
      console.log('[Email] Success sending Welcome Email.');
    } else {
      // Offline/Local development fallback
      console.log('\n======================================================');
      console.log('📬   [WELCOME EMAIL SENT TO USER]   📬');
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Dashboard Link: ${dashboardUrl}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-tenant-approval-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
