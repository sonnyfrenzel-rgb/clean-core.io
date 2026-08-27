import { APP_VERSION } from '@/lib/version';
import { APP_BASE_URL, CONTACT_EMAIL } from '@/lib/constants';

/**
 * The administrator's copy of a signup.
 *
 * It used to be a decision: two one-click links, HMAC-signed, that approved or
 * deleted an account straight out of a mailbox. Accounts are now active the
 * moment they are created, so this message carries no privileged action at all —
 * it is a record, and the only link in it goes to the admin console behind a
 * normal login and step-up. That deliberately removes an email-borne privilege
 * action rather than leaving one lying around for a forwarded or leaked message.
 *
 * Every interpolated value must be HTML-escaped by the caller.
 */

export interface AdminSignupEmailInput {
  /** HTML-escaped full name. */
  name: string;
  /** HTML-escaped email address of the new account. */
  email: string;
  /** Firebase Auth UID — safe characters only, but escaped by the caller anyway. */
  uid: string;
  /** HTML-escaped free-text motivation, or an empty string. */
  motivation: string;
  /** 'password' | 'google' — how the account was created. */
  authMethod: string;
  /** Terms version recorded against the account, or null when none was captured. */
  termsVersion: string | null;
  /** Human-readable UTC timestamp of the signup. */
  signedUpAt: string;
}

export function buildAdminSignupSubject(name: string): string {
  return `New Clean-Core.io account: ${name}`;
}

export function buildAdminSignupEmail({
  name,
  email,
  uid,
  motivation,
  authMethod,
  termsVersion,
  signedUpAt,
}: AdminSignupEmailInput): string {
  const adminUrl = `${APP_BASE_URL}/admin`;
  const motivationHtml = motivation
    ? `"${motivation}"`
    : '<span style="color: #94a3b8;">— none given —</span>';
  const consentHtml = termsVersion
    ? `Terms ${termsVersion} accepted, recorded server-side in <code style="font-family: monospace;">consent_events</code>`
    : '<strong style="color: #b45309;">No consent record</strong> — the account has not accepted the current Terms';

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
                  Administrator Notification
                </div>
              </td>
              <td align="right" valign="middle" style="text-align: right;">
                <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; line-height: 1.2; text-align: center; white-space: nowrap;">
                  Account Active
                </span>
              </td>
            </tr>
          </table>

          <!-- Main Heading -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.1em; background-color: #f1f5f9; padding: 6px 12px; border-radius: 9999px; border: 1px solid #e2e8f0;">
              📋 For your records
            </span>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 18px 0 0 0; letter-spacing: -0.03em; line-height: 1.15;">A new account was created</h1>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            The account below signed up and was activated immediately — no approval step, so there is nothing for you to do here. The welcome email with the first-run guide has been sent to the user.
          </p>

          <!-- Account Detail Card -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 30px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">Account details</h3>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Full name</span>
              <span style="font-size: 15px; font-weight: 700; color: #0f172a; display: block;">${name}</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Email address</span>
              <a href="mailto:${email}" style="font-size: 15px; font-weight: 600; color: #006b2c; text-decoration: none; display: block;">${email}</a>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Auth ID (UID)</span>
              <code style="font-size: 12px; font-family: monospace; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 6px; display: inline-block;">${uid}</code>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Sign-in method</span>
              <span style="font-size: 14px; color: #334155; display: block;">${authMethod}</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Registered (UTC)</span>
              <span style="font-size: 14px; color: #334155; display: block;">${signedUpAt}</span>
            </div>

            <div style="margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Consent</span>
              <span style="font-size: 13px; color: #334155; display: block; line-height: 1.5;">${consentHtml}</span>
            </div>

            <div>
              <span style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Motivation / use case</span>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0; font-style: italic;">${motivationHtml}</p>
            </div>
          </div>

          <!-- Admin console -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 32px; text-align: center;">
            <h3 style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.05em;">If something looks wrong</h3>
            <p style="font-size: 13px; color: #64748b; margin: 0 0 20px 0; line-height: 1.5;">
              Suspending an account, granting S/4HANA sandbox access or deleting the record all happen in the admin console — behind a login and a step-up check, never from a link in an email.
            </p>
            <a href="${adminUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
              Open the admin console
            </a>
          </div>

          <!-- Signature -->
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 14px; color: #64748b; line-height: 1.5;">
            <strong>Clean-Core.io</strong><br />
            <span style="font-size: 12px; color: #94a3b8;">Automated notification — no reply needed</span>
          </div>

        </div>

        <!-- Anti-Spam / Legal Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">
            This operational email was sent to ${CONTACT_EMAIL} because a new account was created on Clean-Core.io.
          </p>
          <p style="margin: 0 0 12px 0; font-weight: 600;">
            Imprint: Felix Frenzel • Hellerstraße 9 • 96047 Bamberg • Germany • E-Mail: ${CONTACT_EMAIL} <br />
            Clean-Core.io System-Version: ${APP_VERSION} • Free Community SAP Modernization Platform
          </p>
        </div>
      </div>
    `;

  return emailHtml;
}
