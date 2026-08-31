/**
 * The activation survey — what is asked, and why each question is there.
 *
 * The problem this exists to solve is not sign-ups; it is what happens after one.
 * There are two possible explanations and they are completely different building
 * sites, so the first job is to tell them apart:
 *
 *   - a usage problem — people arrived, looked, and did not know what to do next;
 *   - a delivery problem — people never saw the mail that told them.
 *
 * `welcome_mail` is the cheapest question here and answers the most expensive open
 * question about the platform. It costs one line, and it has been unanswerable
 * since the community activation because those mails predate the Resend webhook
 * and no delivery events exist for them.
 *
 * `build_next` is the one that gives something back. Every option on it is a real,
 * documented, unbuilt item — the German version (docs/CONCEPT-DE-LOCALIZATION.md),
 * ATC ingestion (docs/CLEAN_CORE_ENRICHMENT_CONCEPT.md §3), provider choice
 * (docs/ROADMAP-2.0.md), and the stacked before/after on a phone (docs/BACKLOG.md).
 * Nothing on the list is invented to make the survey look generous, and nothing
 * already shipped is offered as if it were new.
 *
 * WHERE THE UNCOMFORTABLE FACT SITS. That a number of accounts have never run an
 * analysis is in the mail — but two thirds of the way down, next to a link and a
 * time, not in the opening paragraph as a confession. Opening with "most of you
 * have never used this" is a fact about the operator dressed as a fact about the
 * reader, and it asks for engagement while explaining that engagement is rare.
 * Placed where it is, the same sentence does work: it names the reader's likely
 * situation, gives the real reason (starting looked like it needed preparation),
 * and answers it with two minutes and one link rather than an argument.
 *
 * ONE TAP, AND WHAT THAT REALLY MEANS. There is no way to record an answer from
 * inside an email without the reader leaving it — mail clients do not run code,
 * and the one exception (AMP for Email) needs sender registration with Google and
 * works in Gmail alone, which is the wrong half of an SAP audience. So each option
 * is a link, and the design goal is that a tap is *all* it is: no form, no login,
 * no typing, and the answer is recorded before the page has finished painting.
 * The first question is answered from the mail; the rest are one tap each on the
 * page that thanks them for it, which is where an engaged reader already is.
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
  /**
   * Several answers allowed. Used for the "what should exist" vote, because
   * ranking unbuilt features against each other is a question nobody can answer
   * honestly — wanting two things is the normal case, and forcing a single pick
   * would throw away the second one.
   *
   * The consequence is that its shares are of *people*, not of votes, and they do
   * not add up to 100. The digest says so rather than letting the reader assume.
   */
  multi?: boolean;
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
        id: 'time',
        label: 'Nothing — I know what to do, I just need the time',
        hint: 'A perfectly good answer, and worth knowing.',
      },
    ],
  },
  {
    id: 'build_next',
    where: 'page',
    multi: true,
    prompt: 'Which of these should version 3.0 bring?',
    lead: 'The four candidates for version 3.0. Pick as many as you would use — this is the vote that sets the order.',
    options: [
      {
        id: 'german',
        label: 'A German version of the interface and the documentation',
        hint: 'The concept is written; what is missing is the decision that it is worth it.',
      },
      {
        id: 'atc_import',
        label: 'Import your ABAP Test Cockpit results',
        hint: 'Your existing ATC findings merged into the checklist, so the analysis starts from what SAP already told you.',
      },
      {
        id: 'model_choice',
        label: 'Choose the AI model — Claude alongside Gemini, with your own key',
        hint: 'Same workflow, your provider, your key. The free tier would stay on Gemini.',
      },
      {
        id: 'mobile_diff',
        label: 'The before/after comparison usable on a phone',
        hint: 'Today the ABAP and the TypeScript stack on a narrow screen, which is where the comparison is the whole point.',
      },
    ],
  },
  {
    id: 'welcome_mail',
    where: 'page',
    prompt: 'Did the welcome email ever reach you?',
    lead: 'Mail from a young domain sometimes lands in junk. Worth knowing either way.',
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

export const SURVEY_SUBJECT = 'On the way to v3.0 — your vote, and a two-minute first run';

/** Free-text prompt on the landing page. Optional, and never required to submit. */
export const SURVEY_FREETEXT_PROMPT =
  'Something that is not on the list? Optional, and it comes straight to me.';
export const SURVEY_FREETEXT_MAX = 2000;
