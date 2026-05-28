const resendApiKey = 're_Jg6CUfFb_M5Kbw3Nt1H3fmbf23tsPKYSe';
const targetEmail = 'sonny.frenzel@googlemail.com';

async function sendRequestPilotEmail() {
  const uid = 'mock-uid-sonny-123';
  const email = targetEmail;
  const name = 'Sonny Frenzel';
  const motivation = 'Decoupling legacy custom validation routines for S/4HANA Private Cloud / RISE migration and simulating Eclipse ADT Test Cockpits.';
  
  const approveUrl = `https://clean-core.io/admin/approve?uid=${uid}&token=mock-token-sha256-hash&auto=true`;
  const rejectUrl = `https://clean-core.io/admin/approve?uid=${uid}&token=mock-token-sha256-hash&action=reject`;

  const emailSubject = `🚀 Clean-Core.io Pilot Request: ${name}`;
  const emailHtml = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; padding: 12px; background-color: #f0fdf4; border-radius: 16px; margin-bottom: 16px;">
          <span style="font-size: 32px;">⚡</span>
        </div>
        <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; tracking-tight: -0.05em;">New Pilot Registration</h1>
        <p style="font-size: 14px; font-weight: 500; color: #64748b; margin: 6px 0 0 0;">An applicant is requesting access to the closed beta.</p>
      </div>

      <!-- Details Card -->
      <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 20px; padding: 24px; margin-bottom: 32px;">
        <h2 style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px 0;">Applicant Information</h2>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Full Name</label>
          <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${name}</span>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Email Address</label>
          <a href="mailto:${email}" style="font-size: 16px; font-weight: 600; color: #006b2c; text-decoration: none;">${email}</a>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Auth ID (UID)</label>
          <code style="font-size: 12px; font-family: monospace; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 6px;">${uid}</code>
        </div>

        <div>
          <label style="display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Motivation / Use Case</label>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0; font-style: italic;">"${motivation}"</p>
        </div>
      </div>

      <!-- Action Section -->
      <div style="text-align: center;">
        <h3 style="font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 16px;">Administrative Control</h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">Click the button below to instantly approve and provision this pilot user in Firestore.</p>
        
        <div style="margin-bottom: 16px;">
          <a href="${approveUrl}" style="display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #006b2c 0%, #00873a 100%); color: #ffffff; text-decoration: none; padding: 16px 24px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 107, 44, 0.2); text-align: center;">
            ⚡ Approve User (One-Click)
          </a>
        </div>
        
        <div>
          <a href="${rejectUrl}" style="display: inline-block; font-size: 13px; font-weight: 700; color: #dc2626; text-decoration: underline;">
            Reject & Delete Application
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 48px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated system notification from Clean-Core.io.</p>
      </div>
    </div>
  `;

  console.log(`[Email 1] Sending Pilot Request notification email to ${targetEmail}...`);
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Clean-Core Pilot <system@clean-core.io>',
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
    }),
  });

  const status = resendRes.status;
  const text = await resendRes.text();
  console.log(`[Email 1] Status: ${status}, Response: ${text}`);
}

async function sendWelcomeApprovedEmail() {
  const name = 'Sonny Frenzel';
  const email = targetEmail;
  const dashboardUrl = 'https://clean-core.io/dashboard';
  const emailSubject = `🎉 Welcome to Clean-Core.io: Pilot Access Approved!`;
  
  const emailHtml = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
      <!-- Card Container -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; padding: 40px;">
        
        <!-- Logo & Branding Table (Outlook Resilient) -->
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
              <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; line-height: 1.2; text-align: center; white-space: nowrap;">
                Beta Pilot
              </span>
            </td>
          </tr>
        </table>

        <!-- Main Heading -->
        <div style="margin-bottom: 28px;">
          <span style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.1em; background-color: #d1fae5; padding: 6px 12px; border-radius: 9999px; border: 1px solid #a7f3d0;">
            ✓ Application Approved
          </span>
          <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Your Developer Access is Ready</h1>
        </div>

        <!-- Content -->
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
          Hello ${name},
        </p>
        
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
          We are pleased to inform you that your application for the <strong>Clean-Core.io Pilot Program</strong> has been successfully verified. Your closed-beta workspace credentials are now active.
        </p>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
          Thank you so much for joining our pilot program and taking the time to test our platform. We are incredibly grateful for your participation and look forward to your valuable feedback to help us refine and improve the experience.
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
          <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Your Provisioned Access Scope:</h3>
          
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

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 36px;">
          <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
            Launch Workspace
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
          This transactional email was sent to ${email} regarding your approved pilot program application on Clean-Core.io.
        </p>
        <p style="margin: 0 0 12px 0; font-weight: 600;">
          Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io
        </p>
        <p style="margin: 0;">
          <strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.
        </p>
      </div>
    </div>
  `;

  console.log(`[Email 2] Sending Pilot Welcome Approved email to ${targetEmail}...`);
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Clean-Core.io Team <team@clean-core.io>',
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
    }),
  });

  const status = resendRes.status;
  const text = await resendRes.text();
  console.log(`[Email 2] Status: ${status}, Response: ${text}`);
}

async function sendWelcomePendingEmail() {
  const name = 'Sonny Frenzel';
  const email = targetEmail;
  const emailSubject = `⏳ Clean-Core.io: We are reviewing your Pilot Application!`;
  
  const emailHtml = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
      <!-- Card Container -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; padding: 40px;">
        
        <!-- Logo & Branding Table (Outlook Resilient) -->
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
          Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: info@clean-core.io
        </p>
        <p style="margin: 0;">
          <strong>Data Sovereignty (Art. 17 GDPR):</strong> You have the absolute right to erasure. To permanently and instantly wipe all database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard.
        </p>
      </div>
    </div>
  `;

  console.log(`[Email 3] Sending Pilot Registration Pending email to ${targetEmail}...`);
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Clean-Core.io Team <team@clean-core.io>',
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
    }),
  });

  const status = resendRes.status;
  const text = await resendRes.text();
  console.log(`[Email 3] Status: ${status}, Response: ${text}`);
}

async function run() {
  console.log('Starting execution of sending test email templates...');
  try {
    await sendRequestPilotEmail();
    await sendWelcomeApprovedEmail();
    await sendWelcomePendingEmail();
    console.log('All test emails sent successfully!');
  } catch (error) {
    console.error('Error during execution:', error);
  }
}

run();
