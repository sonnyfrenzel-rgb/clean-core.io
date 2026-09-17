'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { STARTER_EXAMPLES, loadStarterExample, type StarterExample } from '@/lib/starter-examples';
import {
  COMMUNITY_QUOTA_FALLBACK,
  quotaExhausted,
  starterExampleIsFree,
  type QuotaSubject,
} from '@/lib/run-quota-rule';
import { FileCode2, Play, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * "Try it with an example" — one click from an empty dashboard to a running analysis.
 *
 * Creates a project pre-filled with the example source and drops the user straight
 * into the analyze stage, which is where the value actually becomes visible.
 *
 * Roadmap 0.9 / ADR-039: each of these costs nothing the first time an account
 * runs it — reaching a first result must not eat one of the five runs somebody
 * needs for their own code. Running the same example again is an ordinary
 * analysis, and this screen says so before the click rather than after it. What
 * is free and what is not is read from the account's server-written record
 * through `lib/run-quota-rule`; the decision itself is re-taken on the server from
 * the fingerprint of the source, so nothing said here grants anything.
 */
export default function StarterExamples({
  userId,
  quota,
}: {
  userId: string;
  quota: QuotaSubject | null | undefined;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const router = useRouter();
  const db = getDb();

  const limit = quota?.transformationsLimit ?? COMMUNITY_QUOTA_FALLBACK;
  const atLimit = quotaExhausted(quota);

  const start = async (example: StarterExample) => {
    if (busy) return;
    setConfirming(null);

    // Only a repeat costs anything, so only a repeat can be stopped by the limit.
    if (!starterExampleIsFree(quota, example.name) && atLimit) {
      alert(
        `Limit reached! You've used all ${limit} free transformations. Add your own Gemini API key in settings for unlimited runs — Clean-Core.io stays free.`,
      );
      return;
    }

    setBusy(example.file);
    try {
      const legacyCode = await loadStarterExample(example.file);
      const docRef = await addDoc(collection(db, 'projects'), {
        name: example.name,
        status: 'uploaded',
        legacyCode,
        userId,
        createdAt: serverTimestamp(),
      });
      router.push(`/project/${docRef.id}/analyze`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
      setBusy(null);
    }
  };

  /** A first run goes straight through; a repeat has to be told what it costs. */
  const pick = (example: StarterExample) => {
    if (busy) return;
    if (starterExampleIsFree(quota, example.name)) {
      void start(example);
      return;
    }
    setConfirming(confirming === example.name ? null : example.name);
  };

  return (
    <div data-testid="starter-examples" className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-sm w-full">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-black text-[#0b1c30] tracking-tight uppercase flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-green-600" /> Try it with an example
          </h2>
          <p className="text-sm text-gray-500 font-medium mt-1.5 max-w-2xl leading-relaxed">
            No need to fetch code out of your own system first. These are realistic, fictional legacy
            reports — the same ones the analysis engine is regression-tested against. Pick one and you
            are in the analysis in seconds.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
        {STARTER_EXAMPLES.map((example) => {
          const free = starterExampleIsFree(quota, example.name);
          return (
            <div key={example.file} className="flex flex-col gap-2">
              <button
                onClick={() => pick(example)}
                disabled={!!busy}
                aria-expanded={confirming === example.name}
                className={clsx(
                  'text-left border rounded-2xl p-4 transition-all group',
                  busy === example.file
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40 hover:shadow-sm',
                  busy && busy !== example.file && 'opacity-50',
                  !busy && 'cursor-pointer',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 shrink-0 group-hover:border-green-200 group-hover:text-green-600 transition-colors">
                    {busy === example.file ? (
                      <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                    ) : (
                      <FileCode2 className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span data-testid="starter-example-name" className="font-mono text-[13px] font-bold text-gray-900 truncate">{example.name}</span>
                      <span
                        className={clsx(
                          'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border',
                          example.size === 'large'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200',
                        )}
                      >
                        {example.lines.toLocaleString()} lines
                      </span>
                      {free ? (
                        // UX-116: the badge used to say only "Free", and a reader could
                        // not tell that it meant *this once*. The rule is the one the
                        // terms, the welcome mail and the quota panel state (roadmap
                        // 0.9): each example's first run is free, every later one uses
                        // one of the five runs. Both halves are said where the choice
                        // is made.
                        <span
                          data-testid="starter-example-free"
                          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200"
                        >
                          First run free
                        </span>
                      ) : (
                        <span
                          data-testid="starter-example-ran-before"
                          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200"
                        >
                          Ran before · uses a run
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{example.summary}</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1.5">
                      <span className="font-bold text-gray-500">Shows: </span>
                      {example.demonstrates}
                    </p>
                  </div>
                  <Play className="w-3.5 h-3.5 text-gray-300 group-hover:text-green-600 shrink-0 mt-1 transition-colors" />
                </div>
              </button>

              {confirming === example.name && (
                <div
                  role="alert"
                  data-testid="starter-example-rerun-warning"
                  className="flex flex-wrap items-center gap-3 border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-900 font-medium leading-relaxed flex-1 min-w-[12rem]">
                    You ran this example before. Running it again uses 1 of your {limit} free analysis
                    runs once the analysis completes.
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void start(example)}
                    className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Run again
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 font-medium mt-5 leading-relaxed">
        Free — examples don&rsquo;t use your analysis runs the first time. Starting one again is an
        ordinary analysis and uses 1 of your {limit} free analysis runs once it completes; everything
        after the analysis is included either way.
      </p>
    </div>
  );
}
