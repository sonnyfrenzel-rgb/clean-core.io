import { SURVEY_QUESTIONS, getOption } from './definition';

/** One answer: a single choice, or several where the question allows it. */
export type SurveyAnswer = string | string[];

/** Normalises either shape to a list, so the arithmetic has one case to handle. */
export function chosen(value: SurveyAnswer | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

/**
 * The shape a survey answer is stored in, and the arithmetic done on it.
 *
 * The aggregation below is a pure function of an array of responses on purpose:
 * the daily digest, the tests and any later dashboard all read the same numbers,
 * and none of them needs Firestore to compute them. The engine in this codebase
 * already earns its trust that way and the survey should not be the exception.
 *
 * One rule runs through all of it: **silence is reported as silence.** A question
 * nobody answered shows a zero and says how many people were asked, rather than
 * quietly shrinking the denominator until the percentages look healthy. That is
 * the same rule `no-fabricated-figures.spec.ts` enforces on the product, and a
 * survey about whether people are using the product is the last place to break it.
 */

/** One document in `survey_responses`, keyed `${campaign}__${uid}`. */
export interface SurveyResponse {
  campaign: string;
  uid: string;
  email: string;
  name: string;
  /**
   * questionId → the chosen option, or options where the question allows several.
   * A question the person skipped is simply absent.
   */
  answers: Record<string, SurveyAnswer>;
  comment?: string | null;
  /** The invitation link was fetched. May be a mail gateway, so it is not a vote. */
  linkFetchedAt?: Date | null;
  /** A real browser confirmed at least one answer. */
  confirmedAt?: Date | null;
  updatedAt?: Date | null;
}

export interface OptionTally {
  id: string;
  label: string;
  count: number;
  /** Share of the people who answered *this* question, 0–100, one decimal. */
  share: number;
}

export interface QuestionTally {
  id: string;
  prompt: string;
  /** People who answered this question — not votes cast. */
  answered: number;
  /**
   * True where several answers were allowed. Then a share is "this many of the
   * people who answered picked it", the shares can add up to well over 100, and
   * the digest labels them so nobody reads them as a split of one whole.
   */
  multi: boolean;
  options: OptionTally[];
}

export interface SurveySummary {
  campaign: string;
  /** How many people the invitation went to. The denominator that matters. */
  invited: number;
  /** People who answered at least one question. */
  participants: number;
  /** People whose link was fetched but who never confirmed an answer. */
  fetchedOnly: number;
  questions: QuestionTally[];
  comments: { name: string; email: string; comment: string }[];
}

export function docId(campaign: string, uid: string): string {
  return `${campaign}__${uid}`;
}

/** The one method of the Admin SDK document reference this needs. `getAdminDb` hands back an untyped handle. */
export interface AnswerDocRef {
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<unknown>;
}

/**
 * Writes one answer into the nested `answers` map, without touching the others.
 *
 * **A dot in a key of `set()` is not a field path.** The route used to write
 * ``{ [`answers.${q}`]: value }, { merge: true }`` with a comment claiming the
 * dotted path kept one answer from overwriting the next. It does the opposite of
 * what it says: `update()` interprets a dotted key as a path into the document,
 * `set()` does not, so every answer landed in a top-level field whose *name*
 * contained a dot and `data.answers` stayed `undefined`. The endpoint returned
 * `ok: true` the whole time, and `app/survey/[token]/page.tsx` and
 * `scripts/send-survey-digest.ts` — both of which read the nested map — saw
 * nothing. A live satisfaction survey ran that way (QA findings b22563b1cd74,
 * a0a649312df1).
 *
 * A nested map with `merge: true` is the form that does what the old comment
 * promised: Firestore merges maps key by key, so a second question's answer
 * leaves the first one standing. It is a module rather than four lines in the
 * route so that it can be run against the emulator and read back, the way
 * `lib/survey/link-fetch.ts` is — no spec in this repo imports a route handler.
 */
export async function recordAnswer(
  ref: AnswerDocRef,
  fields: { campaign: string; uid: string; questionId: string; value: SurveyAnswer; stamp: unknown },
): Promise<void> {
  await ref.set(
    {
      campaign: fields.campaign,
      uid: fields.uid,
      // Nested maps, merged key by key — never a dotted key, see above.
      answers: { [fields.questionId]: fields.value },
      answeredAt: { [fields.questionId]: fields.stamp },
      confirmedAt: fields.stamp,
      updatedAt: fields.stamp,
    },
    { merge: true },
  );
}

/**
 * Turns raw responses into the numbers the digest prints.
 *
 * `invited` is passed in rather than derived, because the people who never
 * touched the mail are exactly the ones the survey is about and they leave no
 * document behind.
 */
export function summarise(
  campaign: string,
  invited: number,
  responses: SurveyResponse[],
): SurveySummary {
  const mine = responses.filter((r) => r.campaign === campaign);
  const participants = mine.filter((r) => Object.keys(r.answers || {}).length > 0);
  const fetchedOnly = mine.filter(
    (r) => r.linkFetchedAt && Object.keys(r.answers || {}).length === 0,
  );

  const questions: QuestionTally[] = SURVEY_QUESTIONS.map((q) => {
    const counts = new Map<string, number>();
    // Counted per person, not per vote. On a multi-select question someone who
    // picks three options is one answer and three counts, and dividing by the
    // votes would quietly shrink every share as people ticked more boxes.
    let answered = 0;
    for (const r of participants) {
      const picks = chosen(r.answers?.[q.id]);
      if (picks.length === 0) continue;
      answered++;
      for (const p of picks) counts.set(p, (counts.get(p) || 0) + 1);
    }

    return {
      id: q.id,
      prompt: q.prompt,
      answered,
      multi: q.multi === true,
      options: q.options.map((o) => {
        const count = counts.get(o.id) || 0;
        return {
          id: o.id,
          label: getOption(q.id, o.id)?.label ?? o.id,
          count,
          // No answers means no percentages — not zeroes that look measured.
          share: answered > 0 ? Math.round((count / answered) * 1000) / 10 : 0,
        };
      }),
    };
  });

  const comments = participants
    .filter((r) => (r.comment || '').trim().length > 0)
    .map((r) => ({ name: r.name, email: r.email, comment: (r.comment || '').trim() }));

  return {
    campaign,
    invited,
    participants: participants.length,
    fetchedOnly: fetchedOnly.length,
    questions,
    comments,
  };
}

/**
 * The one sentence the digest leads with.
 *
 * Deliberately blunt, and deliberately not a percentage when the numbers are too
 * small to carry one: "3 of 30" says what "10%" hides.
 */
export function headline(summary: SurveySummary): string {
  const { participants, invited } = summary;
  if (invited === 0) return 'No invitations recorded for this campaign yet.';
  if (participants === 0) return `No answers yet — ${invited} people invited.`;
  return `${participants} of ${invited} have answered.`;
}
