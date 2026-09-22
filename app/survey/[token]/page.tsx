import type { Metadata } from 'next';
import type { DocumentReference } from 'firebase-admin/firestore';
import Link from 'next/link';
import { getAdminDb } from '@/lib/firebase-admin';
import { claimLinkFetch } from '@/lib/survey/link-fetch';
import { logger, errMessage } from '@/lib/logger';
import { verifySurveyToken } from '@/lib/survey/token';
import { SURVEY_QUESTIONS, getOption } from '@/lib/survey/definition';
import { docId, type SurveyAnswer } from '@/lib/survey/store';
import SurveyClient from './SurveyClient';

/**
 * Where a tap in the survey mail lands.
 *
 * `noindex`, `force-dynamic`, and reachable only with a signed per-recipient
 * token — this page is addressed to one person and has nothing to say to a
 * search engine.
 *
 * It stamps `linkFetchedAt` on arrival. That is **not** a vote and is never
 * counted as one: a corporate mail gateway will request this URL before any human
 * sees the message, which is exactly why the recording endpoint is a POST the
 * gateway never makes. But the stamp is still worth having. "The link was fetched
 * and nobody ever answered" describes a mail that reached an organisation and
 * stopped at its perimeter, and that is one of the two explanations this whole
 * survey exists to tell apart.
 */
export const metadata: Metadata = {
  title: 'Your answer | Clean-Core.io',
  description: 'Clean-Core.io community survey.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="inline-block mb-8">
          <span className="text-2xl font-black text-gray-950 tracking-tight">
            Clean-Core<span className="text-green-600">.io</span>
          </span>
          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mt-1">
            Free Community SAP Modernization Platform
          </span>
        </Link>
        {children}
        <p className="text-xs text-gray-400 mt-10 leading-relaxed">
          Clean-Core.io · Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany
        </p>
      </div>
    </main>
  );
}

export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ q?: string; a?: string }>;
}) {
  const { token } = await params;
  const { q, a } = await searchParams;

  const answeredInMail = Boolean(q && a && getOption(q, a));

  // Next.js hands a dynamic segment over already decoded, so the
  // `decodeURIComponent` that used to stand here was a second decode of a
  // decoded value. For a real token that is a no-op (base64url and the
  // signature carry nothing that needs escaping, and `invite-email.ts` only
  // percent-encodes for safety), but for `/survey/%25` the segment arrives as
  // `%` and the second decode throws `URIError` — so a mistyped or truncated
  // link hit the error boundary instead of the "this link is no longer valid"
  // page written for exactly that visitor. Dropping the call is honester than
  // wrapping it in `try`/`catch`: the catch would still have to decide what a
  // half-decoded token means, and there is nothing left here to decode.
  const identity = verifySurveyToken(token || '');
  if (!identity) {
    return (
      <Shell>
        <h1 className="text-3xl font-black text-gray-950 tracking-tight mb-3">
          This link is no longer valid
        </h1>
        <p className="text-gray-600 leading-relaxed">
          Survey links stop working once the survey closes, and each one is tied to a single
          recipient. If you would still like to say something, write to{' '}
          <a href="mailto:info@clean-core.io" className="font-bold text-green-700 underline">
            info@clean-core.io
          </a>{' '}
          — it comes to me directly.
        </p>
      </Shell>
    );
  }

  let existingAnswers: Record<string, SurveyAnswer> = {};
  let existingComment = '';
  let closesOn = formatDate(new Date(identity.expiresAt));

  try {
    const { db, FieldValue } = await getAdminDb();
    const ref = db.collection('survey_responses').doc(docId(identity.campaign, identity.uid));

    // Set once. `linkFetchedAt` answers "did this mail get as far as a machine
    // that opens links", and the first fetch is the only one that says anything.
    //
    // In a transaction, because the concurrency it describes is the concurrency
    // it suffers from: a mail gateway and the recipient open the same link at
    // the same moment, both reads see no `linkFetchedAt`, both merge-writes go
    // through, and the stored value is the later arrival rather than the first
    // (QA review of 33471220d6e9, finding 8ccb1b1b765b). The transaction re-runs
    // on a conflict, and the second attempt reads the field the first one wrote.
    // `getAdminDb()` hands back an untyped handle (the Admin SDK is imported
    // dynamically), so the reference is named for what it is — otherwise
    // `tx.get` resolves to the query overload and reads nothing.
    const docRef = ref as DocumentReference;
    // The claim itself is `lib/survey/link-fetch.ts`, so that two of them can be
    // run at once against the emulator and the winner counted — which a page
    // component cannot be (roadmap 0.17, QA finding cca300dfb572).
    const { previous: current } = await claimLinkFetch(db, docRef, {
      campaign: identity.campaign,
      uid: identity.uid,
      stamp: FieldValue.serverTimestamp(),
    });
    const data = current;
    existingAnswers = (data?.answers as Record<string, SurveyAnswer>) || {};
    existingComment = (data?.comment as string) || '';

    const campaign = await db.collection('survey_campaigns').doc(identity.campaign).get();
    const closesAt = campaign.exists ? campaign.data()?.closesAt : null;
    if (closesAt?.toDate) closesOn = formatDate(closesAt.toDate());
  } catch (error) {
    // A read failure must not cost the answer. The page still renders and the
    // POST that records it does not depend on anything above.
    logger.error('survey page load failed', { route: 'survey/[token]', error: errMessage(error) });
  }

  return (
    <Shell>
      {/*
        This heading used to read "Thank you — that is recorded", above a green
        confirmation panel, above the questions. That is the visual grammar of an
        ending: on a phone the fold lands right after the panel, the questions
        below look like an appendix, and a reader who has just answered concludes
        they are finished. The first person to try it said exactly that.

        So the page leads with what is left rather than with what is done. The
        confirmation is a line inside the progress strip, not a panel of its own.
      */}
      <h1 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight leading-tight mb-3">
        The ballot for version 3.0
      </h1>
      {/*
        This said "Your answer is saved" to anyone arriving from a tap in the mail,
        because the page used to record that answer by itself on mount. It no longer
        does — see SurveyClient — so the sentence would now be false for exactly the
        reader it was written for. The pick is carried over and highlighted; the tap
        that records it happens here.
      */}
      <p className="text-gray-600 leading-relaxed mb-8">
        {answeredInMail
          ? `Your pick from the email is already selected. ${SURVEY_QUESTIONS.length} questions, one tap each`
          : `${SURVEY_QUESTIONS.length} questions, one tap each`}{' '}
        — and none of them required. Nothing is submitted at the end; every tap saves as
        you make it.
      </p>

      <SurveyClient
        token={token || ''}
        initialQuestion={q ?? null}
        initialOption={a ?? null}
        existingAnswers={existingAnswers}
        existingComment={existingComment}
        closesOn={closesOn}
      />
    </Shell>
  );
}
