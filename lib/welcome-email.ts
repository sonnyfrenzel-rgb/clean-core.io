import { APP_VERSION } from '@/lib/version';
import { APP_BASE_URL, COMMUNITY_QUOTA, CONTACT_EMAIL } from '@/lib/constants';

/**
 * The one email a new account receives.
 *
 * It replaces two: a "we are reviewing your application" note sent at signup and
 * a near-identical "you have been approved" note sent whenever an administrator
 * got round to it. With the approval gate gone there is nothing to wait for, so
 * the two messages collapse into one that has to do the whole job — confirm the
 * account, get the person to a first result, and answer the IT-security questions
 * their own organisation will ask before they are allowed to paste any ABAP into
 * it.
 *
 * **Built as tables, on purpose.** The first version was nested `<div>`s with
 * `padding: 40px`, laid out for 600px and made to fit a phone by a media query in
 * the document's `<style>` block. That works in a browser and is a coin flip in a
 * mail client: plenty of them strip `<style>`, and several ignore the viewport
 * meta and scale a 648px-wide construction down to fit — which is what "it gets
 * cut off on mobile" actually looks like. Nothing here depends on the media
 * query any more. The outer table is `width="100%"`, the content table caps at
 * 600px, every padding sits on a `<td>` rather than a `<div>`, and the base
 * padding is small enough that an unscaled 320px render is still readable. The
 * media query in `lib/email-layout.ts` is polish now, not a load-bearing wall.
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

/** Condensed from /first-run, which is the click-by-click version. One line each. */
const FIRST_RUN_STEPS: { n: string; text: string }[] = [
  {
    n: '1',
    text: 'On the dashboard, scroll to <strong>Try it with an example</strong> and pick a card. No SAP connection, no code of your own.',
  },
  {
    n: '2',
    text: 'One click creates the project and stages the source. <strong>Z_MATERIAL_STOCK_CALC</strong> is a good first pick at 99 lines.',
  },
  {
    n: '3',
    text: 'Start the analysis. The deterministic engine finds the evidence first — findings with line numbers — and the AI writes around it.',
  },
  {
    n: '4',
    text: 'Walk stages 3 to 7, then download the abapGit package and the signed audit evidence pack.',
  },
];

/** The block people forward to their security officer. Every line is implemented. */
const SECURITY_POINTS: string[] = [
  '<strong>EU processing.</strong> Google Cloud europe-west1 (Belgium), on an EU Firestore database.',
  "<strong>Your code does not train a model.</strong> Not used for training per the Gemini API terms; transient processing and caching may occur under those terms.",
  '<strong>Keys never reach the browser.</strong> Every model call goes through a server-side proxy; a BYOK key is encrypted at rest with AES-256-GCM in a server-only store.',
  '<strong>Evidence you can re-verify.</strong> Each analysis is an immutable, HMAC-signed Run, and the audit pack you download can be checked independently.',
  '<strong>Two-factor authentication.</strong> TOTP in Settings, enforced server-side rather than on the login screen. Worth enabling on day one.',
  '<strong>Live SAP connections stay opt-in.</strong> Connecting a non-production sandbox is a separate, admin-reviewed request; read-only, and production endpoints are blocked.',
  '<strong>Erasure is self-service.</strong> Settings &rarr; Danger Zone deletes your profile, projects, runs, secrets and login (GDPR Art. 17).',
];

export function buildWelcomeEmail({ name, recipient }: WelcomeEmailInput): string {
  const dashboardUrl = `${APP_BASE_URL}/dashboard`;
  const firstRunUrl = `${APP_BASE_URL}/first-run`;
  const trustUrl = `${APP_BASE_URL}/trust`;
  const settingsUrl = `${APP_BASE_URL}/settings`;
  const quota = String(COMMUNITY_QUOTA);

  const stepsHtml = FIRST_RUN_STEPS.map(
    (s) => `
                  <tr>
                    <td valign="top" style="width: 26px; padding: 0 10px 12px 0;">
                      <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 11px; background-color: #dcfce7; color: #047857; font-size: 11px; font-weight: 800;">${s.n}</span>
                    </td>
                    <td valign="top" style="padding: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #475569;">${s.text}</td>
                  </tr>`,
  ).join('');

  const securityHtml = SECURITY_POINTS.map(
    (p) => `
                  <tr>
                    <td valign="top" style="padding: 0 0 8px 0; font-size: 12px; line-height: 1.5; color: #047857;">&bull;&nbsp; ${p}</td>
                  </tr>`,
  ).join('');

  const emailHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
        <tr>
          <td align="center" style="padding: 20px 10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">

              <!-- Card -->
              <tr>
                <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px;">

                  <!-- Brand. One column: a two-column header is the first thing to break on a phone. -->
                  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 18px; margin-bottom: 22px;">
                    <div style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">
                      Clean-Core<span style="color: #10b981;">.io</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px;">
                      Free Community SAP Modernization Platform
                    </div>
                  </div>

                  <span style="display: inline-block; font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; background-color: #ecfdf5; padding: 5px 10px; border-radius: 20px; border: 1px solid #a7f3d0;">
                    &#10003; Account active
                  </span>
                  <h1 style="font-size: 23px; font-weight: 800; color: #0f172a; margin: 14px 0 0 0; letter-spacing: -0.02em; line-height: 1.2;">Your workspace is live</h1>

                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 18px 0 0 0;">Hello ${name},</p>
                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 12px 0 0 0;">
                    Your <strong>Clean-Core.io</strong> account is active &mdash; nothing to wait for and nobody to approve it. Everything you need for a first result is below.
                  </p>

                  <!-- Primary action -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0;">
                    <tr>
                      <td align="center" style="background: #0f172a; border-radius: 10px;">
                        <a href="${dashboardUrl}" style="display: block; padding: 14px 20px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Open your workspace</a>
                      </td>
                    </tr>
                  </table>

                  <!-- First run -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 16px;">
                    <tr>
                      <td style="padding: 18px;">
                        <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Your first run &mdash; about fifteen minutes</div>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 14px;">${stepsHtml}
                        </table>
                        <a href="${firstRunUrl}" style="display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 800; color: #047857; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em;">Open the click-by-click guide &rarr;</a>
                      </td>
                    </tr>
                  </table>

                  <!-- Quota -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 14px; margin-bottom: 16px;">
                    <tr>
                      <td style="padding: 16px; font-size: 13px; line-height: 1.5; color: #92400e;">
                        <strong style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #b45309; margin-bottom: 5px;">What &ldquo;free&rdquo; means</strong>
                        <strong>${quota} free transformations.</strong> Only the analysis in stage 2 is metered &mdash; the six stages after it are included, and re-analysing the same source is free. Add your own Gemini key in <a href="${settingsUrl}" style="color: #92400e; font-weight: 700;">Settings</a> for unlimited runs, still at no cost.
                      </td>
                    </tr>
                  </table>

                  <!-- Security -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 14px; margin-bottom: 16px;">
                    <tr>
                      <td style="padding: 16px;">
                        <strong style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #065f46; margin-bottom: 4px;">Security &amp; data protection</strong>
                        <div style="font-size: 12px; line-height: 1.5; color: #047857; margin-bottom: 10px;">The part to forward to whoever signs this off.</div>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${securityHtml}
                        </table>
                        <a href="${trustUrl}" style="display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 800; color: #0284c7; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em;">Trust &amp; Security overview &rarr;</a>
                      </td>
                    </tr>
                  </table>

                  <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                    <strong>Tell us where it is wrong.</strong> The findings are the part worth judging us on &mdash; reply to this email or write to <a href="mailto:${CONTACT_EMAIL}" style="color: #047857; font-weight: 700;">${CONTACT_EMAIL}</a>.
                  </p>

                  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 14px; color: #64748b; line-height: 1.5;">
                    Warm regards,<br /><strong>The Clean-Core.io Team</strong>
                  </div>

                </td>
              </tr>

              <!-- Legal footer -->
              <tr>
                <td style="padding: 18px 6px 0 6px; color: #94a3b8; font-size: 11px; line-height: 1.6; text-align: center;">
                  <p style="margin: 0 0 8px 0;">Sent to ${recipient} because an account was created for that address on Clean-Core.io.</p>
                  <p style="margin: 0 0 8px 0; font-weight: 600;">Imprint: Felix Frenzel &bull; Hellerstra&szlig;e 9 &bull; 96047 Bamberg &bull; Germany &bull; ${CONTACT_EMAIL}<br />System version ${APP_VERSION}</p>
                  <p style="margin: 0;"><strong>Data erasure (Art. 17 GDPR):</strong> remove your profile and login yourself under <em>Settings &rarr; Danger Zone</em>; encrypted backups age out within 30 days.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    `;

  return emailHtml;
}
