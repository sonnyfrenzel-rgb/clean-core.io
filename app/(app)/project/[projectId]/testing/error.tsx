'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

/**
 * The second half of roadmap 17.2.
 *
 * The first half stops a suite this stage cannot draw from ever being stored.
 * This one is for the case where something gets through anyway. Until now this
 * segment had no boundary, so a render error inside the testing page travelled
 * all the way to `app/error.tsx` — which replaces the entire screen, including
 * the stepper, the navigation and the one button that would have generated a
 * new suite. The reader was left with a crash report and no way back into the
 * stage that produced it. That is what made the same defect worse here than in
 * `documentation`, which already had its own boundary.
 *
 * A boundary here keeps the authenticated shell and the workflow navigation on
 * the screen and replaces only this page, so the stage stays operable: retry,
 * or leave for the previous stage.
 *
 * `app/error.tsx` is unchanged; the form and the words below follow it and the
 * documentation stage's boundary on purpose, including the stale-chunk
 * recovery. This segment loads `react-markdown` and both testing charts through
 * `next/dynamic`, so after a deploy a tab left open here is exactly where a
 * missing chunk hash surfaces — and now this boundary, not the root one, is the
 * one that catches it. Without the same recovery the reader would be handed a
 * "Loading chunk failed" card where he used to get a silent reload.
 */
export default function TestingStageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { projectId } = useParams();
  const idStr = Array.isArray(projectId) ? projectId[0] : projectId;

  useEffect(() => {
    console.error('Testing stage error:', error);
    const msg = error?.message || '';
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      /Loading chunk [\w-]+ failed|ChunkLoadError|error loading dynamically imported module|Importing a module script failed/i.test(msg);
    if (isChunkError && typeof window !== 'undefined') {
      const KEY = 'cc_chunk_reload_at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div data-testing-error-boundary className="p-8 md:p-12 flex justify-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-red-100 max-w-lg w-full text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-[#0b1c30] mb-4">This stage could not be displayed</h2>
        <p className="text-gray-500 mb-8 font-medium">
          The testing stage stopped while drawing. Nothing was changed, and nothing was deleted —
          the stored test suite is as it was. What caused it is not recorded beyond the message below.
        </p>
        <div className="bg-red-50 p-4 rounded-2xl text-left mb-8 overflow-auto max-h-32">
          <p className="text-xs font-mono text-red-800">{error.message || 'Unknown error'}</p>
        </div>
        <button
          onClick={() => reset()}
          data-testing-error-retry
          className="flex items-center justify-center gap-2 w-full bg-[#0b1c30] text-white px-6 py-4 rounded-2xl font-bold hover:bg-[#006b2c] transition-colors"
        >
          <RefreshCw size={18} /> Try Again
        </button>
        <button
          onClick={() => router.push(idStr ? `/project/${idStr}/documentation` : '/dashboard')}
          data-testing-error-back
          className="mt-3 flex items-center justify-center gap-2 w-full bg-white text-[#0b1c30] border border-[#eff4ff] px-6 py-4 rounded-2xl font-bold hover:bg-[#eff4ff] transition-colors"
        >
          <ArrowLeft size={18} /> Back to the previous stage
        </button>
      </div>
    </div>
  );
}
