'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import CcButton from '@/components/cc/Button';

/**
 * The second half of QA findings 0d8443fae823 / 58201e6aaedb.
 *
 * The first half stops a blueprint this stage cannot draw from ever being
 * stored. This one is for the case where something gets through anyway. Until
 * now there was no boundary in this segment, so a render error inside the
 * documentation page travelled all the way to `app/error.tsx` — which replaces
 * the entire screen, including the stepper, the navigation and the one button
 * that would have generated a new blueprint. The reader was left with a crash
 * report and no way back into the stage that produced it.
 *
 * A boundary here keeps the authenticated shell and the workflow navigation on
 * the screen and replaces only this page, so the stage stays operable: retry,
 * or leave for the previous stage.
 *
 * `app/error.tsx` is unchanged; the form and the words below follow it on
 * purpose, including its stale-chunk recovery. This segment loads three of its
 * heaviest parts (`ProcessFlow`, `ProcessMap`, `RevisionCompare`) through
 * `next/dynamic`, so after a deploy a tab left open here is exactly where a
 * missing chunk hash surfaces — and now this boundary, not the root one, is the
 * one that catches it. Without the same recovery the reader would be handed a
 * "Loading chunk failed" card where he used to get a silent reload.
 */
export default function DocumentationStageError({
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
    console.error('Documentation stage error:', error);
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

  // Block D (D.9): a workspace card (§1.4) — 12 px radius, the error's own
  // icon at 20 px without a bubble, the title on the scale (§1.2) and the two
  // ways out as the product's buttons (§1.5) instead of two hand-drawn slabs.
  return (
    <div data-documentation-error-boundary className="p-8 md:p-12 flex justify-center">
      <div className="bg-cc-surface p-8 rounded-cc-card shadow-cc border border-cc-error-border max-w-lg w-full text-center">
        <AlertCircle size={20} className="mx-auto mb-3 text-cc-error" aria-hidden="true" />
        <h2 className="m-0 mb-3 cc-text-h2 text-cc-ink">This stage could not be displayed</h2>
        <p className="m-0 mb-6 cc-text-body text-cc-ink-muted">
          The documentation stage stopped while drawing. Nothing was changed, and nothing was deleted —
          the stored blueprint is as it was. What caused it is not recorded beyond the technical details below.
        </p>
        {/* Folded, not open: the sentence above is what a reader acts on; the raw
            message is for whoever reports it (UX review of ac27aed, UX-149). */}
        <details data-documentation-error-details className="bg-cc-error-bg border border-cc-error-border p-4 rounded-cc-row text-left mb-6">
          <summary className="cc-text-meta text-cc-error cursor-pointer">Technical details</summary>
          <p className="m-0 mt-2 cc-text-meta font-cc-mono text-cc-error overflow-auto max-h-32">{error.message || 'Unknown error'}</p>
        </details>
        <div className="flex flex-col gap-3">
          <CcButton
            variant="primary"
            density="cozy"
            onClick={() => reset()}
            data-documentation-error-retry
            icon={<RefreshCw size={16} aria-hidden="true" />}
          >
            Try Again
          </CcButton>
          <CcButton
            variant="ghost"
            density="cozy"
            onClick={() => router.push(idStr ? `/project/${idStr}/transformation` : '/dashboard')}
            data-documentation-error-back
            icon={<ArrowLeft size={16} aria-hidden="true" />}
          >
            Back to the previous stage
          </CcButton>
        </div>
      </div>
    </div>
  );
}
