import { NextRequest, NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const emailSubject = `⏳ Clean-Core.io: We are reviewing your Pilot Application!`;
    
    // Premium, marketing-grade, state-of-the-art trusted HTML email template
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
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #b45309; background-color: #fffbeb; padding: 6px 12px; border-radius: 8px; border: 1px solid #fef3c7; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Review Pending
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.1em; background-color: #fffbeb; padding: 6px 12px; border-radius: 9999px; border: 1px solid #fef3c7;">
              ⏳ Application Received
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Your Modernization Workspace is Preparing</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello ${name},
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Thank you for requesting access to the <strong>Clean-Core.io Closed Beta Pilot</strong>. Our engineering and architecture team has successfully received your application. We are actively reviewing your use case to provision your dedicated high-compute sandbox.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            Get ready to experience the future of SAP modernization. Clean-Core.io is a state-of-the-art research platform engineered to automatically decouple, refactor, and analyze monolithic legacy custom logic into clean, upgrade-stable architectures.
          </p>

          <!-- Security Trust Indicator -->
          <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 18px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #065f46; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Sovereign Data Privacy Assured</span>
            <span style="color: #047857; font-size: 13px; line-height: 1.5; display: block;">
              To comply strictly with GDPR (DSGVO) guidelines, your projects are hosted entirely in the <strong>Belgium (europe-west1)</strong> region. All generative AI transformations utilize secure stateless APIs, guaranteeing your source code is never cached, persisted, or used by Google for LLM training.
            </span>
          </div>

          <!-- Feature Grid -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">What Awaits You Inside:</h3>
            
            <!-- Benefit 1 -->
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">⚡ Intelligent Extensibility Router</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Automated classification of legacy code based on SAP Clean Core guidelines, determining In-App ABAP Cloud (RAP) vs. Side-by-Side BTP (CAP) tracks.</span>
            </div>

            <!-- Benefit 2 -->
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🔌 SAP API Hub Mappings</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Direct mapping of legacy table operations (e.g. KNA1, BSEG) to released standard SAP APIs with official API Hub IDs.</span>
            </div>

            <!-- Benefit 3 -->
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">⚙️ Dual RAP & CAP Transformation</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Converts legacy logic into clean ABAP Cloud RAP classes (abapGit-compliant tree) or BTP Node.js CAP models complete with ERP event triggers.</span>
            </div>

            <!-- Benefit 4 -->
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📊 Business Value & C-Level Roadmap</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Provides custom IP asset valuations, technical debt cost estimates (€/yr), and plain-English roadmap checklists.</span>
            </div>

            <!-- Benefit 5 -->
            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">🛡️ Simulated ADT Test Cockpit</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Generates standard ABAP Unit Test classes (CL_AUNIT_ASSERT) with database doubles, simulating execution inside an ADT console view.</span>
            </div>

            <!-- Benefit 6 -->
            <div>
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📖 S/4HANA Glossary & AI Architect Guidance</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.4;">Click-to-toggle inline terminology definitions, searchable sidebar panels, and a context-restricted SAP AI Architect Chatbot.</span>
            </div>
          </div>

          <!-- Closing Info -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px; font-size: 13px; line-height: 1.6; color: #475569;">
            <strong>What happens next?</strong><br />
            Our administrators review and approve pilot requests manually to ensure server resources are correctly balanced. Typically, this takes less than 24 hours. Once approved, you will receive an automatic confirmation email with your instant workspace launch link. We appreciate your patience and look forward to welcoming you aboard!
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
            This transactional email was sent to ${email} confirming your pilot program application on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Enterprise Modernization Suite • Confidential
          </p>
          <p style="margin: 0;">
            <strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.
          </p>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Pilot Pending notification email to applicant ${email}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core.io Team <team@clean-core.io>',
          to: email,
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('[Email] Failed to send Pending Welcome Email via Resend API:', errText);
      } else {
        console.log('[Email] Success sending Pending Welcome Email.');
      }
    } else {
      console.log('\n======================================================');
      console.log('📬   [PENDING REGISTRATION EMAIL SENT TO USER]   📬');
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-pending-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
