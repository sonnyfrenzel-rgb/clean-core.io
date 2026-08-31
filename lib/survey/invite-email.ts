import { APP_BASE_URL, CONTACT_EMAIL } from '@/lib/constants';
import { MAIL_QUESTION, SURVEY_SUBJECT } from './definition';

/**
 * The invitation, built the way `lib/welcome-email.ts` is built.
 *
 * Tables, not divs. Every padding on a `<td>`. The content table caps at 600px
 * and the outer one is `width="100%"`, so a client that strips the `<style>`
 * block — plenty do — still renders it correctly, and a 320px phone that ignores
 * the viewport meta gets something readable rather than something scaled down.
 * The media query in `lib/email-layout.ts` is polish here, not a load-bearing wall.
 *
 * **The three answers are styled identically on purpose.** It is tempting to make
 * one of them the dark primary button the rest of the product uses, and it would
 * be a way of asking the question while suggesting the answer. A survey that
 * nudges is a survey whose results cannot be used for anything.
 *
 * The tap target is a full-width row, not an inline link. On a phone, three
 * side-by-side options are three chances to hit the wrong one.
 */

export interface SurveyInviteInput {
  /** HTML-escaped first name, or empty for the neutral greeting. */
  name: string;
  /** HTML-escaped recipient address, shown in the footer. */
  recipient: string;
  /** The per-recipient signed token. */
  token: string;
  /** When the survey stops accepting answers, already formatted. */
  closesOn: string;
  /** Signed one-click unsubscribe URL, or null to omit the line. */
  unsubscribeUrl?: string | null;
}

export { SURVEY_SUBJECT };

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

function optionUrl(token: string, questionId: string, optionId: string): string {
  const p = new URLSearchParams({ q: questionId, a: optionId });
  return `${APP_BASE_URL}/survey/${encodeURIComponent(token)}?${p.toString()}`;
}

export function renderSurveyInviteEmail(input: SurveyInviteInput): string {
  const { name, recipient, token, closesOn, unsubscribeUrl } = input;
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const answerRows = MAIL_QUESTION.options
    .map(
      (o) => `
              <tr>
                <td style="padding: 0 0 10px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="background-color: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 10px;">
                        <a href="${optionUrl(token, MAIL_QUESTION.id, o.id)}"
                           style="display: block; padding: 14px 16px; font-family: ${FONT}; font-size: 15px; font-weight: 700; color: #0f172a; text-decoration: none;">
                          ${o.label}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`,
    )
    .join('');

  const inner = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; font-family: ${FONT};">
        <tr>
          <td align="center" style="padding: 20px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
              <tr>
                <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px;">

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 18px;">
                    <tr>
                      <td align="left" style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                        Clean-Core<span style="color: #16a34a;">.io</span>
                      </td>
                      <td align="right">
                        <span style="display: inline-block; font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; background-color: #ecfdf5; padding: 5px 10px; border-radius: 20px; border: 1px solid #a7f3d0;">
                          One minute
                        </span>
                      </td>
                    </tr>
                  </table>

                  <h1 style="margin: 0 0 12px 0; font-size: 24px; line-height: 1.25; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                    Version 3.0 &mdash; you get a vote
                  </h1>

                  <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                    ${greeting} four candidates are on the table for the next major
                    version. I know what each of them costs to build. I do not know
                    which one you would use.
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 14px;">
                    <tr>
                      <td style="padding: 18px;">
                        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1.35;">
                          ${MAIL_QUESTION.prompt}
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          ${answerRows}
                        </table>
                        <p style="margin: 12px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                          One tap records it. The ballot is on the page it opens.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 14px; margin-bottom: 16px;">
                    <tr>
                      <td style="padding: 16px;">
                        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #14532d;">
                          <strong>Not run one yet?</strong> A ready-made example on the
                          dashboard gives you an evidence report, a RAP or CAP draft and
                          a signed audit pack in a couple of minutes &mdash; no SAP
                          connection, no code of your own.
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center" style="background: #0f172a; border-radius: 12px;">
                              <a href="${APP_BASE_URL}/dashboard"
                                 style="display: inline-block; padding: 11px 20px; font-family: ${FONT}; font-size: 14px; font-weight: 800; color: #ffffff; text-decoration: none;">
                                Start with an example
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">
                    Open until <strong style="color: #334155;">${closesOn}</strong>. When it
                    closes I write back with the count and what won. Or just reply &mdash;
                    it comes to me.
                  </p>

                  <p style="margin: 16px 0 0 0; font-size: 15px; line-height: 1.6; color: #334155;">
                    Felix
                  </p>

                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
              <tr>
                <td style="padding: 16px 8px 0 8px;">
                  <div style="font-size: 11px; line-height: 1.6; color: #94a3b8; text-align: center;">
                    Sent to ${recipient} because you have a Clean-Core.io community account.<br>
                    Clean-Core.io &middot; <a href="mailto:${CONTACT_EMAIL}" style="color: #64748b;">${CONTACT_EMAIL}</a>
                    ${
                      unsubscribeUrl
                        ? ` &middot; <a href="${unsubscribeUrl}" style="color: #64748b;">Unsubscribe</a>`
                        : ''
                    }
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

  return inner;
}

/** Plain-text alternative. Every option carries its full URL — that is the point. */
export function renderSurveyInviteText(input: SurveyInviteInput): string {
  const { name, token, closesOn } = input;
  const lines: string[] = [];
  lines.push(name ? `Hi ${name},` : 'Hi,');
  lines.push('');
  lines.push('Four candidates are on the table for version 3.0. I know what each of');
  lines.push('them costs to build. I do not know which one you would use.');
  lines.push('');
  lines.push(MAIL_QUESTION.prompt.toUpperCase());
  lines.push('');
  for (const o of MAIL_QUESTION.options) {
    lines.push(`  ${o.label}`);
    lines.push(`    ${optionUrl(token, MAIL_QUESTION.id, o.id)}`);
    lines.push('');
  }
  lines.push('One tap records it. The ballot is on the page it opens.');
  lines.push('');
  lines.push('Not run one yet? A ready-made example gives you an evidence report, a RAP');
  lines.push('or CAP draft and a signed audit pack in a couple of minutes — no SAP');
  lines.push('connection, no code of your own.');
  lines.push('');
  lines.push(`  ${APP_BASE_URL}/dashboard`);
  lines.push('');
  lines.push(`Open until ${closesOn}. Or just reply — it comes to me.`);
  lines.push('');
  lines.push('Felix');
  lines.push('Clean-Core.io');
  return lines.join('\n');
}
