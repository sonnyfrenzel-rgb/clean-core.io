import { NextRequest, NextResponse } from 'next/server';
import { createApprovalToken } from '@/lib/approval-token';
import { APP_VERSION } from '@/lib/version';
import { verifyRequestAuth } from '@/lib/firebase-admin';
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
      await assertRateLimit(`request-pilot:${decodedToken.uid}:${getClientIp(request)}`, 3, 60 * 60 * 1000);
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
    const approveToken = createApprovalToken(uid, 'pilot', 'approve');
    const rejectToken = createApprovalToken(uid, 'pilot', 'reject');

    // URLs built with URLSearchParams (correct encoding — not HTML-escaping).
    const approveUrl = `${APP_BASE_URL}/admin/approve?${new URLSearchParams({ uid, token: approveToken, auto: 'true' })}`;
    const rejectUrl = `${APP_BASE_URL}/admin/approve?${new URLSearchParams({ uid, token: rejectToken, action: 'reject' })}`;

    const emailSubject = `🚀 Clean-Core.io Access Request: ${name}`;
    const emailHtml = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
        <!-- Card Container -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; padding: 40px;">
          
          <!-- Logo & Branding (Outlook Resilient) -->
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
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #047857; background-color: #ecfdf5; padding: 6px 12px; border-radius: 8px; border: 1px solid #a7f3d0; line-height: 1.2; text-align: center; white-space: nowrap;">
                  New Request
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.1em; background-color: #ecfdf5; padding: 6px 12px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              📋 Review Required
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">New Access Request</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello Administrator,
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            A new user has submitted a registration request for the <strong>Clean-Core.io Free Community Edition</strong>. Please review their application details below:
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
              <a href="mailto:${email}" style="font-size: 15px; font-weight: 600; color: #006b2c; text-decoration: none; display: block;">${email}</a>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Auth ID (UID)</span>
              <code style="font-size: 12px; font-family: monospace; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 6px; display: inline-block;">${uid}</code>
            </div>

            <div>
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Motivation / Use Case</span>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0; font-style: italic;">"${motivation}"</p>
            </div>
          </div>

          <!-- Administrative Actions -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px; text-align: center;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.05em;">Administrative Controls:</h3>
            <p style="font-size: 13px; color: #64748b; margin: 0 0 20px 0; line-height: 1.5;">Click the button below to instantly approve and provision this pilot user.</p>
            
            <div style="margin-bottom: 16px;">
              <a href="${approveUrl}" style="display: inline-block; background: linear-gradient(135deg, #006b2c 0%, #00873a 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(0, 107, 44, 0.15);">
                ⚡ Approve & Provision User
              </a>
            </div>
            
            <div>
              <a href="${rejectUrl}" style="display: inline-block; font-size: 13px; font-weight: 700; color: #dc2626; text-decoration: none;">
                ❌ Reject & Delete Application
              </a>
            </div>
          </div>

          <!-- Professional Signature -->
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
            Warm regards,<br />
            <strong>The Clean-Core.io Team</strong><br />
            <span style="font-size: 12px; color: #94a3b8;">Free Community Edition</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This transactional email was sent to info@clean-core.io regarding a new pilot program application on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
          </p>
          <p style="margin: 0;">
            <strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.
          </p>
        </div>
      </div>
    `;



    // Check if Resend API Key is configured in environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending real email via Resend to info@clean-core.io for ${email}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core <system@clean-core.io>',
          to: 'info@clean-core.io',
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Failed to send admin notification via Resend API:', errText);
      } else {
        console.log('[Email] Success sending admin notification.');
      }

      // ALSO send a pending confirmation email to the applicant (professional marketing email)
      try {
        console.log(`[Email] Sending Pilot Pending notification email to applicant ${email}...`);
        const pendingSubject = `⏳ Clean-Core.io: We are reviewing your access request!`;
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
                <span style="font-size: 10px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.1em; background-color: #fffbeb; padding: 6px 12px; border-radius: 9999px; border: 1px solid #fef3c7;">
                  ⏳ Application Received
                </span>
                <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Your Workspace is Being Reviewed</h1>
              </div>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                Hello ${name},
              </p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                Thank you for requesting access to the <strong>Clean-Core.io Free Community Edition</strong>. We have received your application and are reviewing it to set up your workspace.
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
                Clean-Core.io is a research platform engineered to automatically decouple, refactor, and analyze monolithic legacy custom logic into clean, upgrade-stable architectures.
              </p>

              <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 18px; margin-bottom: 30px;">
                <span style="font-weight: 800; color: #065f46; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Sovereign Data Privacy Assured</span>
                <span style="color: #047857; font-size: 13px; line-height: 1.5; display: block;">
                  To support GDPR (DSGVO) alignment, your projects are hosted in the <strong>Belgium (europe-west1)</strong> region. Generative AI transformations use stateless APIs designed so that your source code is not cached, persisted, or used for LLM training (per Google Cloud API Terms of Service).
                </span>
              </div>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
                <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">What Awaits You Inside:</h3>
                
                <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">⚡ Intelligent Extensibility Router</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Automated classification of legacy code based on SAP Clean Core guidelines, determining In-App ABAP Cloud (RAP) vs. Side-by-Side BTP (CAP) tracks.</span>
                </div>

                <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🔌 SAP API Hub Mappings</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Direct mapping of legacy table operations (e.g. KNA1, BSEG) to released standard SAP APIs with official API Hub IDs.</span>
                </div>

                <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">⚙️ Dual RAP & CAP Transformation</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Converts legacy logic into clean ABAP Cloud RAP classes (abapGit-compliant tree) or BTP Node.js CAP models complete with ERP event triggers.</span>
                </div>

                <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📊 Business Value & C-Level Roadmap</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Provides custom IP asset valuations, technical debt cost estimates (€/yr), and plain-English roadmap checklists.</span>
                </div>

                <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🛡️ Simulated ADT Test Cockpit</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Generates standard ABAP Unit Test classes (CL_AUNIT_ASSERT) with database doubles, simulating execution inside an ADT console view.</span>
                </div>

                <div>
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📖 S/4HANA Glossary & AI Architect Guidance</span>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Click-to-toggle inline terminology definitions, searchable sidebar panels, and a context-restricted SAP AI Architect Chatbot.</span>
                </div>
              </div>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px; font-size: 13px; line-height: 1.6; color: #475569;">
                <strong>What happens next?</strong><br />
                We review pilot requests manually. Typically, this takes less than 24 hours. Once approved, you will receive an automatic confirmation email with your instant workspace launch link. We appreciate your patience and look forward to welcoming you aboard!
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
                Warm regards,<br />
                <strong>The Clean-Core.io Team</strong><br />
                <span style="font-size: 12px; color: #94a3b8;">Free Community Edition</span>
              </div>

            </div>

            <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
              <p style="margin: 0 0 8px 0;">
                This transactional email was sent to ${email} confirming your pilot program application on Clean-Core.io.
              </p>
              <p style="margin: 0 0 12px 0; font-weight: 600;">
                Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
                Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
              </p>
              <p style="margin: 0;">
                <strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.
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
        console.log('[Email] Success sending pending welcome email to applicant.');
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
      } else {
        console.warn('[Email] RESEND_API_KEY missing — approval email not sent. Token suppressed.');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in request-pilot API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
