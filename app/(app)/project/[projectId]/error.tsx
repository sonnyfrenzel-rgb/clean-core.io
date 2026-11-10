'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import NewVersionAvailable from '@/components/NewVersionAvailable';
import { isStaleBuildError, reloadOnceForStaleBuild } from '@/lib/stale-build';
import { stageErrorCopy } from '@/lib/stage-error';
import { workspaceBackHref } from '@/lib/workspace-back-href';

/**
 * One error boundary for the workspace and all seven tools — roadmap 3.0.21 (7).
 *
 * Only Documentation and Testing had a boundary of their own; a crash on
 * Analyze, Design, Transformation, Economics or Delivery fell through to
 * `app/error.tsx`, which replaces the whole screen — the shell, the path, the
 * tools — and offers only "Go to My workspace". And the Documentation boundary
 * hard-coded "Back to the previous stage" to Transformation. This one sits at
 * the project segment, so the shell and the project frame stay on the screen
 * and only the page is replaced: try again, or go back to the project
 * workspace — the one way back every tool has (ADR-018: a tool has no
 * "previous stage"). On the workspace itself the way out is My workspace.
 *
 * The stale-build recovery is the root boundary's (`lib/stale-build.ts`): one
 * reload, and the "new version is available" card instead of a crash card while
 * it lands or once it is spent. Every tool loads heavy parts through
 * `next/dynamic`, so after a deploy a tab left open on any of them is where a
 * missing chunk surfaces.
 */
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ projectId: string }>();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const copy = stageErrorCopy(pathname ?? '');

  const staleBuild = isStaleBuildError(error);

  useEffect(() => {
    console.error(`${copy.subject} error:`, error);
    if (staleBuild) reloadOnceForStaleBuild();
  }, [error, staleBuild, copy.subject]);

  if (staleBuild) {
    return (
      <div data-stage-error-boundary="stale-build" className="p-8 md:p-12 flex justify-center">
        <NewVersionAvailable />
      </div>
    );
  }

  const back =
    copy.onTool && projectId
      ? workspaceBackHref({ projectId, search: typeof window === 'undefined' ? '' : window.location.search })
      : '/dashboard';

  return (
    <div data-stage-error-boundary="" className="p-8 md:p-12 flex justify-center">
      <div className="bg-cc-surface p-8 rounded-cc-card shadow-cc border border-cc-error-border max-w-lg w-full text-center">
        <AlertCircle size={20} className="mx-auto mb-3 text-cc-error" aria-hidden="true" />
        <h2 className="m-0 mb-3 cc-text-h2 text-cc-ink">{copy.title}</h2>
        <p className="m-0 mb-6 cc-text-body text-cc-ink-muted">{copy.body}</p>
        {/* Folded, not open: the sentence above is what a reader acts on; the raw
            message is for whoever reports it (UX-149). */}
        <details data-stage-error-details className="bg-cc-error-bg border border-cc-error-border p-4 rounded-cc-row text-left mb-6">
          <summary className="cc-text-meta text-cc-error cursor-pointer">Technical details</summary>
          <p className="m-0 mt-2 cc-text-meta font-cc-mono text-cc-error overflow-auto max-h-32">{error.message || 'Unknown error'}</p>
        </details>
        <div className="flex flex-col gap-3">
          <CcButton
            variant="primary"
            density="cozy"
            onClick={() => reset()}
            data-stage-error-retry
            icon={<RefreshCw size={16} aria-hidden="true" />}
          >
            Try again
          </CcButton>
          <CcButton
            variant="ghost"
            density="cozy"
            onClick={() => router.push(back)}
            data-stage-error-back
            icon={<ArrowLeft size={16} aria-hidden="true" />}
          >
            {copy.backLabel}
          </CcButton>
        </div>
      </div>
    </div>
  );
}
