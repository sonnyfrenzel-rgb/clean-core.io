'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { nav } from '@/lib/messages/navigation';
import NewVersionAvailable from '@/components/NewVersionAvailable';
import { isStaleBuildError, reloadOnceForStaleBuild } from '@/lib/stale-build';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Stale-chunk recovery (lib/stale-build.ts): after a deploy, a tab opened on
  // the previous build requests chunk hashes that no longer exist, or mixes two
  // builds. It reloads once; until that lands, and when the one reload is spent,
  // the tab says a new version is available instead of "Something went wrong"
  // and the raw message (roadmap 3.0.6).
  const staleBuild = isStaleBuildError(error);

  useEffect(() => {
    console.error('App Error:', error);
    if (staleBuild) reloadOnceForStaleBuild();
  }, [error, staleBuild]);

  if (staleBuild) {
    return (
      <div className="min-h-screen bg-cc-page flex flex-col items-center justify-center p-8 text-center">
        <NewVersionAvailable />
      </div>
    );
  }

  // The workspace's card, like the 404 and the in-page boundary (UX-053): one
  // heading, one sentence, a retry and a way home. The raw message is for
  // whoever reports the fault, so it waits behind "Technical details" instead
  // of standing in the reader's face (DESIGN.md §2.8: never a raw error text).
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-cc-page flex flex-col items-center justify-center px-4 py-12">
      <div
        role="alert"
        data-root-error=""
        className="w-full max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface px-4 py-8 text-center shadow-cc"
      >
        <div className="mb-2 flex justify-center text-cc-error">
          <AlertCircle size={20} aria-hidden="true" />
        </div>
        <h1 className="m-0 cc-text-h2 text-cc-ink">Something went wrong</h1>
        <p className="mx-auto mt-1 mb-4 max-w-sm cc-text-body text-cc-ink-muted">
          This page stopped with an unexpected error. Try again, or go back to My workspace.
        </p>
        <details data-root-error-details="" className="mb-4 rounded-cc-row border border-cc-error-border bg-cc-error-bg p-3 text-left">
          <summary className="cursor-pointer cc-text-meta text-cc-error">Technical details</summary>
          <p className="m-0 mt-2 max-h-32 overflow-auto font-cc-mono cc-text-meta text-cc-error">
            {error.message || 'Unknown error'}
            {error.digest ? ` (reference ${error.digest})` : ''}
          </p>
        </details>
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <CcButton
            variant="primary"
            density="cozy"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => reset()}
            data-root-error-retry=""
          >
            Try again
          </CcButton>
          <CcLinkButton href="/dashboard" variant="ghost" density="cozy">
            {nav('nav.goToMyWorkspace')}
          </CcLinkButton>
        </div>
      </div>
    </main>
  );
}
