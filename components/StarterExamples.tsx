'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { STARTER_EXAMPLES, loadStarterExample, type StarterExample } from '@/lib/starter-examples';
import { FileCode2, Play, Sparkles, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * "Try it with an example" — one click from an empty dashboard to a running analysis.
 *
 * Creates a project pre-filled with the example source and drops the user straight
 * into the analyze stage, which is where the value actually becomes visible.
 */
export default function StarterExamples({
  userId,
  atLimit,
  limit,
}: {
  userId: string;
  atLimit: boolean;
  limit: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const db = getDb();

  const start = async (example: StarterExample) => {
    if (busy) return;
    if (atLimit) {
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
        {STARTER_EXAMPLES.map((example) => (
          <button
            key={example.file}
            onClick={() => start(example)}
            disabled={!!busy}
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
        ))}
      </div>

      <p className="text-[11px] text-gray-400 font-medium mt-5 leading-relaxed">
        Starting an example creates a project and counts as one of your {limit} transformations —
        exactly like your own code would. Everything after the analysis is included.
      </p>
    </div>
  );
}
