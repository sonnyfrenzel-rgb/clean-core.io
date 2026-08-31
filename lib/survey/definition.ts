/**
 * The activation survey — what is asked, and why each question is there.
 *
 * The problem this exists to solve is not sign-ups. Thirty people have accounts
 * and twenty of them had never created a project when the community mail went out
 * on 19 August. Every question below is aimed at one of the two explanations for
 * that, because they are completely different building sites:
 *
 *   - a usage problem — people arrived, looked, and did not know what to do next;
 *   - a delivery problem — people never saw the mail that told them.
 *
 * Q3 is the cheapest question on the list and answers the most expensive open
 * question about the platform. It costs one line and it has been unanswerable
 * since the community activation, because those thirty mails predate the Resend
 * webhook and no delivery events exist for them.
 *
 * ONE TAP, AND WHAT THAT REALLY MEANS. There is no way to record an answer from
 * inside an email without the reader leaving it — mail clients do not run code,
 * and the one exception (AMP for Email) needs sender registration with Google and
 * works in Gmail alone, which is the wrong half of an SAP audience. So each option
 * is a link, and the design goal is that a tap is *all* it is: no form, no login,
 * no typing, and the answer is recorded before the page has finished painting.
 * Q1 is answered from the mail itself; Q2 and Q3 are one tap each on the page that
 * thanks them for Q1, which is where a reader who is already engaged actually is.
 */

export const SURVEY_CAMPAIGN = 'activation-2026-09';

/** A week, as promised in the community mail of 19 August. */
export const SURVEY_OPEN_DAYS = 7;

export interface SurveyOption {
  id: string;
  label: string;
  /** Shown under the label on the landing page, never in the mail. */
  hint?: string;
}

export interface SurveyQuestion {
  id: string;
  /** `mail` is asked in the email; `page` is asked on the thank-you page. */
  where: 'mail' | 'page';
  prompt: string;
  /** One line under the prompt. Kept short — this is an email, not a form. */
  lead?: string;
  options: SurveyOption[];
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'ran',
    where: 'mail',
    prompt: 'Have you run an analysis yet?',
    lead: 'One tap. Nothing to fill in, nothing to log into.',
    options: [
      { id: 'yes', label: 'Yes, at least one' },
      { id: 'started', label: 'I started, but did not finish' },
      { id: 'no', label: 'Not yet' },
    ],
  },
  {
    id: 'help',
    where: 'page',
    prompt: 'What would help you most right now?',
    lead: 'This is the question the answers actually change something on.',
    options: [
      {
        id: 'walkthrough',
        label: 'Twenty minutes with me, screen to screen',
        hint: 'I take one of your objects through the seven stages while you watch.',
      },
      {
        id: 'examples',
        label: 'More ready-made ABAP examples',
        hint: 'So you can see a result without needing code of your own.',
      },
      {
        id: 'guide',
        label: 'A written step-by-step guide',
        hint: 'Something to read at your own pace and forward to a colleague.',
      },
      {
        id: 'german',
        label: 'A German-language version',
        hint: 'Interface and documentation in German.',
      },
      {
        id: 'time',
        label: 'Nothing — I know what to do, I just need the time',
        hint: 'A perfectly good answer, and worth knowing.',
      },
    ],
  },
  {
    id: 'welcome_mail',
    where: 'page',
    prompt: 'Did the welcome email ever reach you?',
    lead: 'Asked because nobody here knows. Those mails went out before delivery events were recorded.',
    options: [
      { id: 'inbox', label: 'Yes, in my inbox' },
      { id: 'spam', label: 'Yes, but it was in spam or junk' },
      { id: 'never', label: 'I never saw it' },
      { id: 'unsure', label: 'I honestly do not remember' },
    ],
  },
];

export function getQuestion(id: string): SurveyQuestion | undefined {
  return SURVEY_QUESTIONS.find((q) => q.id === id);
}

export function getOption(questionId: string, optionId: string): SurveyOption | undefined {
  return getQuestion(questionId)?.options.find((o) => o.id === optionId);
}

/** The one question carried in the email body. */
export const MAIL_QUESTION = SURVEY_QUESTIONS.find((q) => q.where === 'mail')!;

/** Everything asked on the landing page, in order. */
export const PAGE_QUESTIONS = SURVEY_QUESTIONS.filter((q) => q.where === 'page');

export const SURVEY_SUBJECT = 'Two weeks on: what would actually help you?';

/** Free-text prompt on the landing page. Optional, and never required to submit. */
export const SURVEY_FREETEXT_PROMPT = 'Anything else? Optional, and it comes straight to me.';
export const SURVEY_FREETEXT_MAX = 2000;
