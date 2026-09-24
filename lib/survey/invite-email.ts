import { APP_BASE_URL } from '@/lib/constants';
import { htmlToText } from '@/lib/mail-text';
import { buildUserMail } from '@/lib/user-mail';
import { MAIL_QUESTION, PAGE_QUESTIONS, SURVEY_SUBJECT } from './definition';

/**
 * The survey invitation — short, and with one link (roadmap 3.0.9, round 2).
 *
 * It used to carry the first question as three answer buttons, a second dark
 * "Start with an example" button and a badge: five links and a card layout.
 * The seed run of 24.09.2026 showed that kind of mail going to spam at web.de
 * while plain paragraphs with one link reached the inbox, so the survey is now
 * built with `lib/user-mail.ts` like every other user mail. The question is
 * named in the text and answered on the page, which asks every question
 * anyway; the one link opens it. Nothing is preselected, so the mail cannot
 * suggest an answer either.
 *
 * The footer carries the unsubscribe URL as the only second link — a bulk mail
 * owes the reader a way out in the body, not only in the RFC 8058 header.
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

/** The one link: the survey page for this recipient. */
export function surveyUrl(token: string): string {
  return `${APP_BASE_URL}/survey/${encodeURIComponent(token)}`;
}

export function renderSurveyInviteEmail(input: SurveyInviteInput): string {
  const { name, recipient, token, closesOn, unsubscribeUrl } = input;
  return buildUserMail({
    greeting: name ? `Hi ${name},` : 'Hi,',
    paragraphs: [
      'I am planning version 3.0 of Clean-Core.io and would like to know what you would use. The survey takes about a minute.',
      `It starts with one question, &ldquo;${MAIL_QUESTION.prompt}&rdquo;, and asks ${PAGE_QUESTIONS.length} more on the same page. Every answer is saved as you tap it.`,
    ],
    link: { lead: `The survey, open until ${closesOn}:`, url: surveyUrl(token) },
    after: ['When it closes I write back with the count and what won. Or just reply &mdash; it comes to me.'],
    signature: 'Felix',
    footer: [`Sent to ${recipient} because you have a Clean-Core.io community account.`],
    unsubscribeUrl,
  });
}

/**
 * Plain-text alternative, from the same markup through the one converter
 * (`lib/mail-text.ts`), so the two parts cannot say different things. It
 * carries the survey link, the unsubscribe link and the postal address.
 */
export function renderSurveyInviteText(input: SurveyInviteInput): string {
  return htmlToText(renderSurveyInviteEmail(input));
}
