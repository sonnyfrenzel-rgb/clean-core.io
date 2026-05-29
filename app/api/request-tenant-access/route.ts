import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, email, name, motivation } = body;

    if (!uid || !email || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate secure cryptographic validation token
    const secret = process.env.PILOT_APPROVAL_SECRET || 'fallback-secret-key-12345';
    const token = createHmac('sha256', secret).update(uid).digest('hex');

    // Get current host and protocol
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    const approveUrl = `${protocol}://${host}/admin/approve-tenant?uid=${uid}&token=${token}&auto=true`;
    const rejectUrl = `${protocol}://${host}/admin/approve-tenant?uid=${uid}&token=${token}&action=reject`;

    const emailSubject = `🚀 S/4HANA Live Tenant Access Request: ${name}`;
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
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0369a1; background-color: #f0f9ff; padding: 6px 12px; border-radius: 8px; border: 1px solid #bae6fd; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Tenant Access
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.10em; background-color: #f0f9ff; padding: 6px 12px; border-radius: 9999px; border: 1px solid #bae6fd;">
              🛡️ Live S/4HANA Connection Request
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Review Live Integration Request</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello Sonny,
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            A pilot user has requested premium access to connect their <strong>Live S/4HANA Public Cloud Sandbox/Test Tenant</strong> (BYOT) inside the Stage 5 Testing Cockpit. Please review their details:
          </p>

          <!-- Applicant Detail Card -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 30px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Applicant Information:</h3>
            
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Full Name</span>
              <span style="font-size: 15px; font-weight: 700; color: #0f172a; display: block;">${name}</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Email Address</span>
              <a href="mailto:${email}" style="font-size: 15px; font-weight: 600; color: #0284c7; text-decoration: none; display: block;">${email}</a>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Auth ID (UID)</span>
              <code style="font-size: 12px; font-family: monospace; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 6px; display: inline-block;">${uid}</code>
            </div>

            <div>
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Use Case / Project Context</span>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0; font-style: italic;">"${motivation}"</p>
            </div>
          </div>

          <!-- Administrative Actions -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px; text-align: center;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.05em;">Administrative Controls:</h3>
            <p style="font-size: 13px; color: #64748b; margin: 0 0 20px 0; line-height: 1.5;">Click the button below to instantly unlock custom tenant connection capabilities for this user.</p>
            
            <div style="margin-bottom: 16px;">
              <a href="${approveUrl}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);">
                ⚡ Approve & Unlock Tenant Connection
              </a>
            </div>
            
            <div>
              <a href="${rejectUrl}" style="display: inline-block; font-size: 13px; font-weight: 700; color: #dc2626; text-decoration: none;">
                ❌ Reject & Decline Request
              </a>
            </div>
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
            This transactional email was sent to info@clean-core.io regarding a premium tenant integration request on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
             Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io
          </p>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending real email via Resend to info@clean-core.io for S/4 access...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core Pilot <system@clean-core.io>',
          to: 'info@clean-core.io',
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Failed to send tenant request via Resend API:', errText);
      } else {
        console.log('[Email] Success sending tenant integration email.');
      }
    } else {
      // Offline/Local development fallback
      console.log('\n======================================================');
      console.log('📬   [MOCK EMAIL SENT TO info@clean-core.io]   📬');
      console.log(`Subject: ${emailSubject}`);
      console.log(`Applicant: ${name} (${email})`);
      console.log(`Motivation: ${motivation}`);
      console.log('\n👇   ⚡ ONE-CLICK APPROVAL LINK ⚡   👇');
      console.log(approveUrl);
      console.log('\n👇   ❌ REJECT LINK ❌   👇');
      console.log(rejectUrl);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true, approveUrl });
  } catch (error) {
    console.error('Error in request-tenant-access API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
