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
 * Table-based for the same reason as `lib/welcome-email.ts`: nothing here may
 * depend on the media query in the document shell, because a mail client is free
 * to strip `<style>` and then scale a fixed 600px layout down to fit a phone.
 * Every padding sits on a `<td>`, the outer table is fluid, and the label/value
 * rows stack rather than sitting in two columns.
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
  /** 'Email / password' | 'Google' — how the account was created. */
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
    ? `&ldquo;${motivation}&rdquo;`
    : '<span style="color: #94a3b8;">&mdash; none given &mdash;</span>';
  const consentHtml = termsVersion
    ? `Terms ${termsVersion} accepted, recorded server-side in consent_events`
    : '<strong style="color: #b45309;">No consent record</strong> &mdash; this account has not accepted the current Terms';

  const rows: { label: string; value: string }[] = [
    { label: 'Full name', value: `<strong style="color: #0f172a;">${name}</strong>` },
    { label: 'Email address', value: `<a href="mailto:${email}" style="color: #006b2c; font-weight: 600; text-decoration: none; word-break: break-all;">${email}</a>` },
    { label: 'Auth ID (UID)', value: `<span style="font-family: monospace; font-size: 12px; color: #475569; word-break: break-all;">${uid}</span>` },
    { label: 'Sign-in method', value: authMethod },
    { label: 'Registered (UTC)', value: signedUpAt },
    { label: 'Consent', value: consentHtml },
    { label: 'Motivation / use case', value: `<em>${motivationHtml}</em>` },
  ];

  const rowsHtml = rows.map(
    (r, i) => `
                  <tr>
                    <td style="padding: ${i === 0 ? '0' : '12px'} 0 0 0;${i === rows.length - 1 ? '' : ' border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;'}">
                      <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">${r.label}</div>
                      <div style="font-size: 14px; color: #334155; line-height: 1.5;">${r.value}</div>
                    </td>
                  </tr>`,
  ).join('');

  const emailHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
        <tr>
          <td align="center" style="padding: 20px 10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">

              <tr>
                <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px;">

                  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 18px; margin-bottom: 22px;">
                    <div style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">
                      Clean-Core<span style="color: #10b981;">.io</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px;">
                      Administrator notification
                    </div>
                  </div>

                  <span style="display: inline-block; font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; background-color: #f1f5f9; padding: 5px 10px; border-radius: 20px; border: 1px solid #e2e8f0;">
                    For your records
                  </span>
                  <h1 style="font-size: 23px; font-weight: 800; color: #0f172a; margin: 14px 0 0 0; letter-spacing: -0.02em; line-height: 1.2;">A new account was created</h1>

                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 16px 0 20px 0;">
                    Activated immediately &mdash; no approval step, so there is nothing for you to do. The welcome email with the first-run guide has gone to the user.
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 18px;">
                        <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Account details</div>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}
                        </table>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 18px;">
                        <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">If something looks wrong</div>
                        <div style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 14px;">
                          Suspending an account, granting S/4HANA sandbox access or deleting the record all happen in the admin console &mdash; behind a login and a step-up check, never from a link in an email.
                        </div>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center" style="background: #0f172a; border-radius: 10px;">
                              <a href="${adminUrl}" style="display: block; padding: 13px 18px; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Open the admin console</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 14px; color: #64748b; line-height: 1.5;">
                    <strong>Clean-Core.io</strong><br />
                    <span style="font-size: 12px; color: #94a3b8;">Automated notification &mdash; no reply needed</span>
                  </div>

                </td>
              </tr>

              <tr>
                <td style="padding: 18px 6px 0 6px; color: #94a3b8; font-size: 11px; line-height: 1.6; text-align: center;">
                  <p style="margin: 0 0 8px 0;">Sent to ${CONTACT_EMAIL} because a new account was created on Clean-Core.io.</p>
                  <p style="margin: 0; font-weight: 600;">Imprint: Felix Frenzel &bull; Hellerstra&szlig;e 9 &bull; 96047 Bamberg &bull; Germany &bull; ${CONTACT_EMAIL}<br />System version ${APP_VERSION}</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    `;

  return emailHtml;
}
