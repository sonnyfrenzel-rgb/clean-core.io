import { APP_VERSION } from '@/lib/version';
import { APP_BASE_URL, CONTACT_EMAIL } from '@/lib/constants';
import { INVITATION_SCOPE_SENTENCE, INVITATION_LIMITS_SENTENCE } from '@/lib/invitations';

/**
 * The two mails phase 5 sends.
 *
 * Both are built as fluid tables, like the registration mails and for the same
 * reason recorded in `lib/welcome-email.ts`: a nested-`div` layout sized for
 * 600px with a media query is a coin flip in a mail client, several of which
 * strip `<style>` outright. Every padding sits on a `<td>`, the outer table is
 * `width="100%"`, and nothing depends on the media query in
 * `lib/email-layout.ts`.
 *
 * Every interpolated value must be HTML-escaped by the caller — this module
 * puts them into markup unchanged.
 */

/* ------------------------------------------------------- the invitation mail */

export interface InvitationEmailInput {
  /** HTML-escaped display name of the person who invited. */
  inviterName: string;
  /** HTML-escaped invited address; shown in the transactional footer. */
  recipient: string;
  /** Absolute URL of the invitation link. Built from `APP_BASE_URL`, never a Host header. */
  link: string;
  /** Human-readable expiry, e.g. "2 October 2026". */
  expires: string;
}

export const INVITATION_EMAIL_SUBJECT = 'You have been invited to read a project on Clean-Core.io';

/**
 * The mail deliberately does **not** name the project.
 *
 * A project title routinely carries a customer name, a system id or a ticket
 * number, and the invited address is the one thing about this message we have
 * not verified yet — it is whatever the owner typed. A mail that names the
 * project therefore tells a typo'd recipient something the owner never meant to
 * tell them. The name appears on the invitation page, after the reader has
 * shown they hold the account with that confirmed address.
 */
export function buildInvitationEmail({ inviterName, recipient, link, expires }: InvitationEmailInput): string {
  const trustUrl = `${APP_BASE_URL}/trust`;
  return `
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
                      Free Community SAP Modernization Platform
                    </div>
                  </div>

                  <h1 style="font-size: 23px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; line-height: 1.2;">${inviterName} invited you to read a project</h1>

                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 18px 0 0 0;">
                    ${INVITATION_SCOPE_SENTENCE}
                  </p>
                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 12px 0 0 0;">
                    ${INVITATION_LIMITS_SENTENCE}
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0;">
                    <tr>
                      <td align="center" style="background: #0f172a; border-radius: 10px;">
                        <a href="${link}" style="display: block; padding: 14px 20px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Open the invitation</a>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 16px;">
                    <tr>
                      <td style="padding: 18px; font-size: 13px; line-height: 1.6; color: #475569;">
                        <strong style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 8px;">The link only opens for you</strong>
                        It opens for a Clean-Core.io account signed in with <strong>${recipient}</strong> and no other. Forwarding it gives nobody anything: the address on the account has to be this one, and it has to be confirmed. If you have no account yet, create one with this address &mdash; the link brings you back here afterwards.
                        <br /><br />
                        <strong>This invitation expires on ${expires}.</strong>
                      </td>
                    </tr>
                  </table>

                  <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                    Did you not expect this? Then ignore the mail &mdash; nothing happens until you open the link and sign in. Questions go to <a href="mailto:${CONTACT_EMAIL}" style="color: #047857; font-weight: 700;">${CONTACT_EMAIL}</a>, and <a href="${trustUrl}" style="color: #0284c7; font-weight: 700;">${trustUrl}</a> explains how the platform handles code.
                  </p>

                  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 14px; color: #64748b; line-height: 1.5;">
                    Warm regards,<br /><strong>The Clean-Core.io Team</strong>
                  </div>

                </td>
              </tr>
              <tr>
                <td style="padding: 18px 6px 0 6px; color: #94a3b8; font-size: 11px; line-height: 1.6; text-align: center;">
                  <p style="margin: 0 0 8px 0;">Sent to ${recipient} because a Clean-Core.io user invited that address to read one of their projects. You do not have an account with us because of this mail, and we added none.</p>
                  <p style="margin: 0; font-weight: 600;">Imprint: Felix Frenzel &bull; Hellerstra&szlig;e 9 &bull; 96047 Bamberg &bull; Germany &bull; ${CONTACT_EMAIL}<br />System version ${APP_VERSION}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
}

/* ----------------------------------------------------- the confirmation mail */

export interface AddressConfirmationEmailInput {
  /** HTML-escaped address the confirmation goes to. */
  recipient: string;
  /** The Firebase verification link, generated by the Admin SDK. */
  link: string;
}

export const ADDRESS_CONFIRMATION_SUBJECT = 'Confirm your email address for Clean-Core.io';

/**
 * Sent at the moment a password account tries to accept an invitation with an
 * address it has never confirmed — roadmap 5.3, and nowhere else.
 *
 * **Registration is untouched.** Nothing about signing up changes; an account
 * that never opens an invitation is never asked to confirm anything, exactly as
 * before (`docs/ROADMAP.md`: "Anmeldung und Konto bleiben, wie sie sind"). What
 * changes is what an *unconfirmed* address is worth: it gets no insight into
 * anybody else's source code, because "the account says it is this address" and
 * "this address let it in" are different claims, and an invitation is bound to
 * the second one. A Google sign-in has already made the second claim, which is
 * why it counts as confirmed and gets no mail.
 */
export function buildAddressConfirmationEmail({ recipient, link }: AddressConfirmationEmailInput): string {
  return `
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
                  </div>

                  <h1 style="font-size: 23px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; line-height: 1.2;">Confirm your email address</h1>

                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 18px 0 0 0;">
                    Somebody invited <strong>${recipient}</strong> to read a project on Clean-Core.io, and that project contains source code. Before it opens, we need to see that this mailbox is yours.
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0;">
                    <tr>
                      <td align="center" style="background: #0f172a; border-radius: 10px;">
                        <a href="${link}" style="display: block; padding: 14px 20px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Confirm this address</a>
                      </td>
                    </tr>
                  </table>

                  <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                    Afterwards, sign in again and open the invitation link once more. Nothing else about your account changes, and nothing is shared with anyone until you open that link.
                    <br /><br />
                    Did you not sign up for Clean-Core.io? Then ignore this mail. Without this confirmation the address stays unusable for invitations, and you can write to <a href="mailto:${CONTACT_EMAIL}" style="color: #047857; font-weight: 700;">${CONTACT_EMAIL}</a>.
                  </p>

                  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 14px; color: #64748b; line-height: 1.5;">
                    Warm regards,<br /><strong>The Clean-Core.io Team</strong>
                  </div>

                </td>
              </tr>
              <tr>
                <td style="padding: 18px 6px 0 6px; color: #94a3b8; font-size: 11px; line-height: 1.6; text-align: center;">
                  <p style="margin: 0 0 8px 0;">Sent to ${recipient} because an account with that address tried to open an invitation on Clean-Core.io.</p>
                  <p style="margin: 0; font-weight: 600;">Imprint: Felix Frenzel &bull; Hellerstra&szlig;e 9 &bull; 96047 Bamberg &bull; Germany &bull; ${CONTACT_EMAIL}<br />System version ${APP_VERSION}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
}
