import { CONTACT_EMAIL } from '@/lib/constants';
import type { SurveySummary, QuestionTally } from './store';
import { headline } from './store';

/**
 * The daily interim result, as a mail rather than a dashboard.
 *
 * **The charts are tables.** Every mail client that matters renders a `<td>` with
 * a percentage width and a background colour; almost none of them render an
 * external image without the reader agreeing to it first, and a chart nobody sees
 * is worse than a number. So each bar is a two-cell table — filled and unfilled —
 * and it looks the same in Outlook 2016 as it does in Gmail.
 *
 * **What it refuses to do.** A question nobody has answered prints a zero and the
 * word "no answers", not a set of percentages over a denominator of one. The
 * headline says "3 of 30", never "10%", while the numbers are small enough that a
 * percentage would be a way of making three people sound like a finding. This is
 * the same rule the product's own guards enforce, and a survey about whether the
 * product is being used is the last place to start rounding.
 */

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

const BAR_COLOURS = ['#16a34a', '#0f766e', '#0369a1', '#7c3aed', '#b45309'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One horizontal bar: a filled cell and an empty one, both percentage-width. */
function bar(share: number, colour: string): string {
  const filled = Math.max(0, Math.min(100, Math.round(share)));
  const empty = 100 - filled;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; table-layout: fixed;">
      <tr>
        ${
          filled > 0
            ? `<td width="${filled}%" height="8" style="background-color: ${colour}; border-radius: 4px 0 0 4px; font-size: 0; line-height: 0;">&nbsp;</td>`
            : ''
        }
        ${
          empty > 0
            ? `<td width="${empty}%" height="8" style="background-color: #e2e8f0; border-radius: ${filled > 0 ? '0 4px 4px 0' : '4px'}; font-size: 0; line-height: 0;">&nbsp;</td>`
            : ''
        }
      </tr>
    </table>`;
}

function questionBlock(q: QuestionTally, invited: number): string {
  const rows = q.options
    .map((o, i) => {
      const colour = BAR_COLOURS[i % BAR_COLOURS.length];
      return `
        <tr>
          <td style="padding: 0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size: 13px; line-height: 1.4; color: #334155; padding-bottom: 5px;">
                  ${escapeHtml(o.label)}
                </td>
                <td align="right" style="font-size: 13px; line-height: 1.4; font-weight: 800; color: #0f172a; white-space: nowrap; padding-bottom: 5px; padding-left: 10px;">
                  ${o.count}${q.answered > 0 ? ` &middot; ${o.share}%` : ''}
                </td>
              </tr>
              <tr>
                <td colspan="2">${bar(q.answered > 0 ? o.share : 0, colour)}</td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 14px;">
      <tr>
        <td style="padding: 18px;">
          <p style="margin: 0 0 2px 0; font-size: 15px; font-weight: 800; color: #0f172a; line-height: 1.35;">
            ${escapeHtml(q.prompt)}
          </p>
          <p style="margin: 0 0 14px 0; font-size: 12px; color: #64748b;">
            ${
              q.answered === 0
                ? `no answers yet &middot; ${invited} invited`
                : `${q.answered} of ${invited} answered${
                    // Said out loud, because bars that add up to 180% look like a
                    // bug unless the reader is told they are counting people.
                    q.multi ? ' &middot; several answers allowed, so the shares are of people and do not add to 100%' : ''
                  }`
            }
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows}
          </table>
        </td>
      </tr>
    </table>`;
}

export function renderSurveyDigestSubject(summary: SurveySummary, daysLeft: number): string {
  const tail = daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'closed';
  return `Survey: ${summary.participants}/${summary.invited} answered — ${tail}`;
}

export function renderSurveyDigestEmail(summary: SurveySummary, daysLeft: number): string {
  const comments = summary.comments
    .map(
      (c) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px;">
        <tr>
          <td style="padding: 14px 16px;">
            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 800; color: #0f172a;">
              ${escapeHtml(c.name || c.email)}
              <span style="font-weight: 500; color: #94a3b8;">&middot; ${escapeHtml(c.email)}</span>
            </p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${escapeHtml(c.comment)}</p>
          </td>
        </tr>
      </table>`,
    )
    .join('');

  const inner = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; font-family: ${FONT};">
        <tr>
          <td align="center" style="padding: 20px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
              <tr>
                <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px; margin-bottom: 14px;">

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                    <tr>
                      <td align="left" style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                        Clean-Core<span style="color: #16a34a;">.io</span>
                      </td>
                      <td align="right">
                        <span style="display: inline-block; font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.08em; background-color: #ecfdf5; padding: 5px 10px; border-radius: 20px; border: 1px solid #a7f3d0;">
                          Interim result
                        </span>
                      </td>
                    </tr>
                  </table>

                  <h1 style="margin: 0 0 8px 0; font-size: 24px; line-height: 1.25; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                    ${escapeHtml(headline(summary))}
                  </h1>
                  <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #475569;">
                    ${
                      daysLeft > 0
                        ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} still to run.`
                        : 'The survey is closed. This is the final count.'
                    }
                    ${
                      summary.fetchedOnly > 0
                        ? ` <strong style="color:#0f172a;">${summary.fetchedOnly}</strong> more opened the link without answering — that is usually a mail gateway fetching it, not a person.`
                        : ''
                    }
                  </p>

                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
              <tr><td style="height: 14px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
              <tr>
                <td>
                  ${summary.questions.map((q) => questionBlock(q, summary.invited)).join('')}
                </td>
              </tr>

              ${
                comments
                  ? `<tr>
                       <td style="padding-top: 6px;">
                         <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                           In their own words (${summary.comments.length})
                         </p>
                         ${comments}
                       </td>
                     </tr>`
                  : ''
              }

              <tr>
                <td style="padding: 16px 8px 0 8px;">
                  <div style="font-size: 11px; line-height: 1.6; color: #94a3b8; text-align: center;">
                    Campaign ${escapeHtml(summary.campaign)} &middot; sent once a day while the survey is open<br>
                    Clean-Core.io &middot; <a href="mailto:${CONTACT_EMAIL}" style="color: #64748b;">${CONTACT_EMAIL}</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

  return inner;
}

export function renderSurveyDigestText(summary: SurveySummary, daysLeft: number): string {
  const lines: string[] = [];
  lines.push(headline(summary));
  lines.push(daysLeft > 0 ? `${daysLeft} day(s) left.` : 'Closed.');
  if (summary.fetchedOnly > 0) {
    lines.push(`${summary.fetchedOnly} opened the link without answering (usually a gateway).`);
  }
  lines.push('');
  for (const q of summary.questions) {
    lines.push(q.prompt);
    lines.push(
      q.answered === 0
        ? `  no answers yet (${summary.invited} invited)`
        : `  ${q.answered} of ${summary.invited} answered${
            q.multi ? ' — several allowed, shares are of people' : ''
          }`,
    );
    for (const o of q.options) {
      lines.push(`  ${String(o.count).padStart(3)}  ${q.answered > 0 ? `${o.share}%`.padStart(6) : '     —'}  ${o.label}`);
    }
    lines.push('');
  }
  if (summary.comments.length > 0) {
    lines.push(`In their own words (${summary.comments.length}):`);
    for (const c of summary.comments) {
      lines.push(`  ${c.name || c.email} <${c.email}>`);
      lines.push(`    ${c.comment.replace(/\n/g, '\n    ')}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
