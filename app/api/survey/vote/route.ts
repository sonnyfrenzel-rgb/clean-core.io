import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger, errMessage } from '@/lib/logger';
import { verifySurveyToken } from '@/lib/survey/token';
import { docId } from '@/lib/survey/store';
import { getOption, getQuestion, SURVEY_FREETEXT_MAX } from '@/lib/survey/definition';

/**
 * Records one survey answer, or the free-text comment.
 *
 * **POST only, and that is the whole anti-scanner design.** Corporate mail
 * gateways fetch every link in a message before a human ever sees it. If a tap on
 * "Not yet" were a GET that wrote a vote, the results would be a census of
 * security appliances. So the link in the mail lands on a page, and the page
 * submits the answer with `fetch` — which a gateway does not do, because it does
 * not run scripts.
 *
 * The reader still taps exactly once. The POST happens while the page paints.
 *
 * The GET half is not wasted: `app/survey/[token]/page.tsx` stamps `linkFetchedAt`
 * when the page is requested at all. That is not a vote and is never counted as
 * one, but "the link was fetched and nobody ever answered" is a real signal about
 * a mail that reached a gateway and stopped there.
 *
 * Answers are idempotent — the same person tapping a different option changes
 * their answer rather than adding a second one.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await assertRateLimit(`survey-vote:${getClientIp(req)}`, 60, 60_000);

    const body = await req.json().catch(() => ({}));
    const { token, questionId, optionId, optionIds, comment } = body as {
      token?: string;
      questionId?: string;
      optionId?: string;
      /** Multi-select questions send the whole selection, so clearing one works. */
      optionIds?: string[];
      comment?: string;
    };

    const identity = verifySurveyToken(String(token || ''));
    if (!identity) {
      // One message for malformed, mis-signed and expired alike. Which of the
      // three it was is not the caller's business.
      return NextResponse.json({ error: 'This survey link is not valid any more.' }, { status: 400 });
    }

    const { db, FieldValue } = await getAdminDb();
    const ref = db.collection('survey_responses').doc(docId(identity.campaign, identity.uid));

    if (typeof comment === 'string') {
      const trimmed = comment.trim().slice(0, SURVEY_FREETEXT_MAX);
      await ref.set(
        {
          campaign: identity.campaign,
          uid: identity.uid,
          comment: trimmed.length > 0 ? trimmed : null,
          confirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({ ok: true, recorded: 'comment' });
    }

    const q = String(questionId || '');
    const question = getQuestion(q);
    if (!question) {
      return NextResponse.json({ error: 'Unknown question or option.' }, { status: 400 });
    }

    // A multi-select question sends its whole selection every time, so unticking
    // the last box stores an empty list rather than leaving the previous answer
    // standing. Everything else sends one option.
    let value: string | string[];
    if (question.multi) {
      const list = Array.isArray(optionIds) ? optionIds.map(String) : [];
      if (list.some((id) => !getOption(q, id))) {
        return NextResponse.json({ error: 'Unknown question or option.' }, { status: 400 });
      }
      // De-duplicated and capped at the number of options that exist: without
      // this, a crafted request could store the same id ten thousand times and
      // the tally would report a landslide of one.
      value = [...new Set(list)].slice(0, question.options.length);
    } else {
      const a = String(optionId || '');
      if (!getOption(q, a)) {
        return NextResponse.json({ error: 'Unknown question or option.' }, { status: 400 });
      }
      value = a;
    }

    await ref.set(
      {
        campaign: identity.campaign,
        uid: identity.uid,
        // Dotted path so one answer never overwrites the others.
        [`answers.${q}`]: value,
        [`answeredAt.${q}`]: FieldValue.serverTimestamp(),
        confirmedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, recorded: q });
  } catch (error) {
    logger.error('survey vote failed', { route: 'api/survey/vote', error: errMessage(error) });
    return NextResponse.json({ error: 'Could not record that. Please try again.' }, { status: 500 });
  }
}
