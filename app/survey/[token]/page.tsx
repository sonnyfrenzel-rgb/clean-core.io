import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';
import { verifySurveyToken } from '@/lib/survey/token';
import { PAGE_QUESTIONS } from '@/lib/survey/definition';
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

  const identity = verifySurveyToken(decodeURIComponent(token || ''));
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
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : undefined;
    if (!data?.linkFetchedAt) {
      await ref.set(
        {
          campaign: identity.campaign,
          uid: identity.uid,
          linkFetchedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
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
      <h1 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight leading-tight mb-3">
        Thank you — that is recorded
      </h1>
      <p className="text-gray-600 leading-relaxed mb-8">
        {PAGE_QUESTIONS.length} more questions, one tap each — the middle one is the ballot for
        version 3.0. Nothing here is submitted at the end and none of it is required.
      </p>

      <SurveyClient
        token={decodeURIComponent(token || '')}
        initialQuestion={q ?? null}
        initialOption={a ?? null}
        existingAnswers={existingAnswers}
        existingComment={existingComment}
        closesOn={closesOn}
      />
    </Shell>
  );
}
