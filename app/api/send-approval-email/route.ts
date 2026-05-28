import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Determine domain and urls based on host
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const dashboardUrl = `${protocol}://${host}/dashboard`;

    const emailSubject = `🎉 Welcome to Clean-Core.io: Pilot Access Approved!`;
    
    // Professional, spam-resilient, trusted business-grade HTML email template
    const emailHtml = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
        <!-- Card Container -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; padding: 40px;">
          
          <!-- Logo & Branding -->
          <div style="margin-bottom: 32px; border-bottom: 1px solid #f1f5f9; padding-bottom: 24px;">
            <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
              Clean-Core<span style="color: #10b981;">.io</span>
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 4px;">
              Enterprise Modernization Suite
            </div>
          </div>

          <!-- Main Heading -->
          <div style="margin-bottom: 24px;">
            <span style="font-size: 11px; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 0.1em; background-color: #ecfdf5; padding: 6px 12px; border-radius: 9999px;">
              Application Approved
            </span>
            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 16px 0 0 0; letter-spacing: -0.03em;">Your Pilot Access is Ready!</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            Hello ${name},
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 32px 0;">
            We are pleased to inform you that your application for the <strong>Clean-Core.io Pilot Program</strong> has been approved by our engineering team. Your dedicated workspace environment has been provisioned and is ready for use.
          </p>

          <!-- Feature Grid -->
          <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 24px; margin-bottom: 36px; space-y: 16px;">
            <h3 style="font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Your Provisioned Access Scope:</h3>
            
            <!-- Benefit 1 -->
            <div style="margin-bottom: 16px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">⚡ 5 Complimentary App Transformations</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 2px;">Modernize legacy custom operations into side-by-side Node.js cloud-native repositories.</span>
            </div>

            <!-- Benefit 2 -->
            <div style="margin-bottom: 16px;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📊 Interactive Process Blueprints</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 2px;">Automatically synthesize L1-L4 process maps with standard BPMN 2.0 XML exports.</span>
            </div>

            <!-- Benefit 3 -->
            <div>
              <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block;">📁 Developer Testing Sandboxes</span>
              <span style="color: #64748b; font-size: 13px; display: block; margin-top: 2px;">Compile and execute selective test suites inside secure, containerized environments.</span>
            </div>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 36px;">
            <a href="${dashboardUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;">
              Launch My Workspace
            </a>
          </div>

          <!-- Professional Signature -->
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
            Warm regards,<br />
            <strong>The Clean-Core.io Team</strong><br />
            <span style="font-size: 12px; color: #94a3b8;">Closed Beta Administration</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 24px; padding: 0 20px;">
          <p style="font-size: 11px; line-height: 1.6; color: #94a3b8; margin: 0 0 8px 0;">
            This email was sent to ${email} regarding your approved Pilot application.
          </p>
          <p style="font-size: 11px; line-height: 1.6; color: #94a3b8; margin: 0;">
            Clean-Core.io • Hellerstraße 9 • 96047 Bamberg • Germany<br />
            To cascade delete all database footprint entries immediately, visit the Danger Zone in your Settings.
          </p>
        </div>
      </div>
    `;

    // Check Resend config
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log(`[Email] Sending Pilot Welcome Email to applicant ${email}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Clean-Core.io <team@send.clean-core.io>',
          to: email,
          subject: emailSubject,
          html: emailHtml,
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
      console.log(`To: ${name} (${email})`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Dashboard Link: ${dashboardUrl}`);
      console.log('======================================================\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in send-approval-email API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
