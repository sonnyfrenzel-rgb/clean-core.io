import { APP_VERSION } from '@/lib/version';
import { APP_BASE_URL, COMMUNITY_QUOTA, CONTACT_EMAIL } from '@/lib/constants';

/**
 * The one email a new account receives.
 *
 * It replaces two: a "we are reviewing your application" note sent at signup and
 * a "you have been approved" note sent whenever an administrator got round to it.
 * With the approval gate gone there is nothing to wait for, so the two messages
 * collapse into one that has to do the whole job — confirm the account, get the
 * person to a first result, and answer the IT-security questions their own
 * organisation will ask before they are allowed to paste any ABAP into it.
 *
 * Order is deliberate: the workspace link sits above the guide, because the
 * people who already know what they want should not have to scroll past a
 * tutorial to find the button.
 *
 * Both `name` and `recipient` must be HTML-escaped by the caller — this module
 * interpolates them into markup unchanged.
 */

export interface WelcomeEmailInput {
  /** HTML-escaped display name of the new user. */
  name: string;
  /** HTML-escaped recipient address; shown in the transactional footer. */
  recipient: string;
}

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Clean-Core.io — your workspace is live';

/**
 * Condensed from /first-run, which is the click-by-click version. Kept short
 * enough to read in a mail client; the link below it carries the detail.
 */
const FIRST_RUN_STEPS: { n: string; title: string; text: string }[] = [
  {
    n: '1',
    title: 'Open the dashboard and scroll to "Try it with an example"',
    text: 'Ready-made legacy ABAP reports, written the way grown enterprise code actually looks. Nothing has to be exported from an SAP system, and no code of your own is needed.',
  },
  {
    n: '2',
    title: 'Click one card — Z_MATERIAL_STOCK_CALC is a good first pick',
    text: 'One click creates the project, stages the source and takes you to the Analyze stage. At 99 lines it is short enough to read in full.',
  },
  {
    n: '3',
    title: 'Start the analysis',
    text: 'The deterministic engine parses the source first — findings with line numbers, database coupling, code inventory, complexity — and only then does the AI write the narrative around that evidence. One to two minutes.',
  },
  {
    n: '4',
    title: 'Walk stages 3 to 7 with the stepper',
    text: 'Design drafts the target architecture against released SAP APIs. Transformation generates the RAP or CAP implementation. Testing generates ABAP Unit tests. Documentation produces BPMN 2.0. TCO puts numbers on it. Delivery hands you the package.',
  },
  {
    n: '5',
    title: 'Download the package',
    text: 'An abapGit-compatible ZIP with the generated sources and tests, plus the audit evidence pack — a signed record of what was analysed, by which engine and catalog version, and what it concluded.',
  },
];

/**
 * The block people forward to their security officer. Every line here is a claim
 * the platform actually implements; nothing aspirational belongs in it.
 */
const SECURITY_POINTS: { title: string; text: string }[] = [
  {
    title: 'EU-hosted processing',
    text: 'The application and your projects run in Google Cloud <strong>europe-west1 (Belgium)</strong>, on an EU Firestore database.',
  },
  {
    title: 'Your code does not train a model',
    text: "Source code is not used to train Google's models (per the Gemini API terms); transient processing and caching may occur under those terms.",
  },
  {
    title: 'Keys never reach the browser',
    text: 'Every model call goes through a server-side proxy. If you bring your own Gemini key, it is encrypted at rest with AES-256-GCM in a server-only store and is never returned to the client.',
  },
  {
    title: 'Evidence you can verify later',
    text: 'Each analysis is captured as an immutable, HMAC-signed Run. The audit evidence pack you download can be re-verified independently, which is the point of signing it.',
  },
  {
    title: 'Two-factor authentication',
    text: 'TOTP 2FA is available in Settings and gates the trust chain server-side, not just the login screen. Worth enabling on day one.',
  },
  {
    title: 'Live SAP connections stay opt-in',
    text: 'Connecting a non-production S/4HANA sandbox is a separate, admin-reviewed request. It is read-only, credentials are encrypted at rest, and production endpoints are blocked.',
  },
  {
    title: 'Erasure is self-service (GDPR Art. 17)',
    text: 'Settings → Danger Zone deletes your profile, projects, runs, stored secrets and the authentication account. Encrypted backups age out within 30 days.',
  },
];

export function buildWelcomeEmail({ name, recipient }: WelcomeEmailInput): string {
  const dashboardUrl = `${APP_BASE_URL}/dashboard`;
  const firstRunUrl = `${APP_BASE_URL}/first-run`;
  const trustUrl = `${APP_BASE_URL}/trust`;
  const settingsUrl = `${APP_BASE_URL}/settings`;
  const quota = String(COMMUNITY_QUOTA);

  const stepsHtml = FIRST_RUN_STEPS.map(
    (s, idx) => `
            <tr>
              <td valign="top" style="width: 34px; padding: 0 12px 16px 0;">
                <span style="display: inline-block; width: 26px; height: 26px; line-height: 26px; text-align: center; border-radius: 9999px; background-color: #dcfce7; color: #047857; font-size: 12px; font-weight: 800;">${s.n}</span>
              </td>
              <td valign="top" style="padding: 0 0 16px 0; ${idx === FIRST_RUN_STEPS.length - 1 ? '' : 'border-bottom: 1px solid #f1f5f9;'}">
                <span style="font-weight: 700; color: #0f172a; font-size: 14px; display: block; line-height: 1.35;">${s.title}</span>
                <span style="color: #64748b; font-size: 13px; display: block; margin-top: 4px; line-height: 1.5;">${s.text}</span>
              </td>
            </tr>`,
  ).join('');

  const securityHtml = SECURITY_POINTS.map(
    (p) => `
            <li style="margin-bottom: 10px;">
              <strong style="color: #065f46;">${p.title}:</strong>
              <span style="color: #047857;">${p.text}</span>
            </li>`,
  ).join('');

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
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #047857; background-color: #ecfdf5; padding: 6px 12px; border-radius: 8px; border: 1px solid #a7f3d0; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Account Active
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.1em; background-color: #ecfdf5; padding: 6px 12px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              ✓ Ready to use
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">Your workspace is live</h1>
          </div>

          <!-- Content -->
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Hello ${name},
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            Your <strong>Clean-Core.io</strong> account is active — there is nothing to wait for and nobody to approve it. Sign in and the platform is open: upload legacy ABAP, or start from one of the ready-made examples, and take it through analysis, target design, transformation, tests, documentation and delivery.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            Everything you need for a first result is in this email. Thank you for trying it — it is a free community edition, and the feedback is what improves it.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 36px;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
              Open your workspace
            </a>
          </div>

          <!-- First run guide -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.05em;">Your first run — about fifteen minutes</h3>
            <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 18px 0;">
              No SAP connection, no credentials and no code of your own required.
            </p>

            <table cellpadding="0" cellspacing="0" border="0" width="100%">${stepsHtml}
            </table>

            <a href="${firstRunUrl}" target="_blank" style="display: inline-block; margin-top: 18px; background-color: #ffffff; border: 1px solid #059669; color: #047857; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
              Open the click-by-click guide
            </a>
          </div>

          <!-- Quota note -->
          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 16px; padding: 18px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #b45309; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">What "free" means here</span>
            <span style="color: #92400e; font-size: 13px; line-height: 1.5; display: block;">
              Your account carries <strong>${quota} free transformations</strong>. Only the analysis in stage 2 is metered — the six stages after it are included, and re-analysing the same source costs nothing. Need more? Add your own Gemini API key in <a href="${settingsUrl}" style="color: #92400e; font-weight: 700;">Settings</a> and runs are unlimited, still at no cost.
            </span>
          </div>

          <!-- Security & data protection -->
          <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
            <span style="font-weight: 800; color: #065f46; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">🛡️ Security &amp; data protection</span>
            <p style="color: #047857; font-size: 12px; line-height: 1.5; margin: 0 0 12px 0;">
              The section to forward to whoever has to sign off on you using this.
            </p>
            <ul style="margin: 0 0 16px 0; padding-left: 18px; font-size: 12px; line-height: 1.5;">${securityHtml}
            </ul>
            <a href="${trustUrl}" target="_blank" style="display: inline-block; background-color: #ffffff; border: 1px solid #0284c7; color: #0284c7; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
              🔒 Trust &amp; Security overview
            </a>
          </div>

          <!-- Feedback -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 30px; font-size: 13px; line-height: 1.6; color: #475569;">
            <strong>Tell us where it is wrong.</strong><br />
            The findings are the part worth judging the platform on. If one does not match what you know about the object, reply to this email or write to <a href="mailto:${CONTACT_EMAIL}" style="color: #047857; font-weight: 700;">${CONTACT_EMAIL}</a> — that is the fastest way to get it fixed.
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
            This transactional email was sent to ${recipient} because an account was created for that address on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: ${CONTACT_EMAIL} <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
          </p>
          <p style="margin: 0;">
            <strong>Data Erasure (Art. 17 GDPR):</strong> You have the right to erasure. To remove the database and authentication entries associated with your profile, visit the <em>Danger Zone</em> inside your Settings dashboard; encrypted backups age out within 30 days.
          </p>
        </div>
      </div>
    `;

  return emailHtml;
}
