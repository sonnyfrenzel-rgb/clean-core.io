import { NextRequest, NextResponse } from 'next/server';
import { createApprovalToken } from '@/lib/approval-token';
import { APP_VERSION } from '@/lib/version';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { APP_BASE_URL } from '@/lib/constants';
import { escapeHtml } from '@/lib/utils';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    try {
      await assertRateLimit(`request-tenant:${decodedToken.uid}:${getClientIp(request)}`, 3, 60 * 60 * 1000);
    } catch (rateErr: any) {
      return NextResponse.json(
        { error: rateErr.message || 'Too many requests. Please wait and try again.' },
        { status: rateErr.status || 429 },
      );
    }

    const body = await request.json();
    const uid = decodedToken.uid;
    const rawEmail = decodedToken.email || '';
    if (!rawEmail) {
      return NextResponse.json({ error: 'Authenticated account has no email.' }, { status: 400 });
    }
    // Values inserted into the HTML email must be HTML-escaped.
    const email = escapeHtml(rawEmail);
    const name = escapeHtml(body.name || (decodedToken as any).name || rawEmail);
    const motivation = escapeHtml(body.motivation || '');

    // Action-bound, expiring tokens; fail-closed (no fallback secret).
    const approveToken = createApprovalToken(uid, 'tenant', 'approve');
    const rejectToken = createApprovalToken(uid, 'tenant', 'reject');

    // URLs built with URLSearchParams (correct encoding — not HTML-escaping).
    const approveUrl = `${APP_BASE_URL}/admin/approve-tenant?${new URLSearchParams({ uid, token: approveToken, auto: 'true' })}`;
    const rejectUrl = `${APP_BASE_URL}/admin/approve-tenant?${new URLSearchParams({ uid, token: rejectToken, action: 'reject' })}`;

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
                  Free Community SAP Modernization Platform
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
            Hello Administrator,
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            A pilot user has requested live tenant access to connect their <strong>Live S/4HANA Public Cloud Sandbox/Test Tenant</strong> (BYOT) inside the Stage 5 Testing Cockpit. Please review their details:
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
            <span style="font-size: 12px; color: #94a3b8;">Community Pilot Program</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This transactional email was sent to info@clean-core.io regarding a tenant integration request on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
             Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
             Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
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

      // ALSO send a pending confirmation email to the applicant (professional S/4HANA integration pending email)
      try {
        console.log(`[Email] Sending S/4HANA Integration Pending notification email to applicant ${email}...`);
        const pendingSubject = `⏳ Clean-Core.io: We are reviewing your S/4HANA Tenant Request!`;
        const pendingHtml = `
          <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
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
                    <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #b45309; background-color: #fffbeb; padding: 6px 12px; border-radius: 8px; border: 1px solid #fef3c7; line-height: 1.2; text-align: center; white-space: nowrap;">
                      Review Pending
                    </span>
                  </td>
                </tr>
              </table>

              <div style="margin-bottom: 28px;">
                <span style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.10em; background-color: #f0f9ff; padding: 6px 12px; border-radius: 9999px; border: 1px solid #bae6fd;">
                  ⏳ Integration Pending
                </span>
                <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Custom S/4HANA Connection Request</h1>
              </div>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                Hello ${name},
              </p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                Thank you for submitting a connection request to connect a **Custom S/4HANA Tenant** (BYOT) inside your Stage 5 Testing Sandbox.
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
                Our systems engineering and compliance team has successfully received your proposal. To guarantee absolute compliance with your target ERP's access controls and secure network paths, we manually audit all custom sandbox endpoints.
              </p>

              <!-- Connection Sandbox Guide -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
                <span style="font-weight: 800; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">🔒 Next Steps for Safe Sandbox Connection:</span>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
                  <li style="margin-bottom: 8px;">
                    <strong>Verification Window:</strong> Manual verification is typically completed within 24 hours. You will receive an immediate welcome email once access is active.
                  </li>
                  <li style="margin-bottom: 8px;">
                    <strong>Prepare Credentials:</strong> Standard basic authentication or OAuth 2.0 Client credentials can be securely saved. Ensure you utilize non-productive development tenants only.
                  </li>
                  <li>
                    <strong>Sovereign Transit Proxy:</strong> Clean-Core.io routes all queries statelessly. No business, transactional, or master data is stored, cached, or persisted on our servers.
                  </li>
                </ul>
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
                Warm regards,<br />
                <strong>The Clean-Core.io Team</strong><br />
                <span style="font-size: 12px; color: #94a3b8;">Community Pilot Program</span>
              </div>

            </div>

            <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
              <p style="margin: 0 0 8px 0;">
                This transactional email was sent to ${email} confirming your integration request on Clean-Core.io.
              </p>
              <p style="margin: 0 0 12px 0; font-weight: 600;">
                Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
                Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
              </p>
            </div>
          </div>
        `;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Clean-Core.io Team <team@clean-core.io>',
            to: email,
            subject: pendingSubject,
            html: pendingHtml,
          }),
        });
        console.log('[Email] Success sending pending tenant connection welcome email to applicant.');
      } catch (err) {
        console.error('[Email] Failed to send pending email to applicant:', err);
      }
    } else {
      // Security: Never log approval/reject tokens in production (F-03)
      const isProd = process.env.NODE_ENV === 'production';
      if (!isProd) {
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

        console.log('\n======================================================');
        console.log(`📬   [MOCK PENDING EMAIL SENT TO APPLICANT: ${email}]   📬`);
        console.log(`Subject: ⏳ Clean-Core.io: We are reviewing your S/4HANA Tenant Request!`);
        console.log(`System Version: ${APP_VERSION}`);
        console.log('======================================================\n');
      } else {
        console.warn('[Email] RESEND_API_KEY missing — tenant access email not sent. Token suppressed.');
      }
    }

    // Set requested flag on user document server-side (F-03 / Audit security fix)
    const { db, FieldValue } = await getAdminDb();
    await db.collection('users').doc(uid).set({
      s4TenantAccessRequested: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in request-tenant-access API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
