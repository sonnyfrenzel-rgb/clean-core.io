'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { publicButton } from '@/components/landing/public-button';
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

  return (
    <div className="min-h-screen bg-cc-page flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-cc-surface p-10 rounded-3xl shadow-cc border border-cc-error-border max-w-lg w-full">
        <div className="w-20 h-20 bg-cc-error-bg rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-cc-error" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-extrabold text-cc-ink mb-4">Something went wrong!</h2>
        <p className="text-cc-ink-muted mb-8 font-medium">
          An unexpected error occurred in the application. We apologize for the inconvenience.
        </p>
        <div className="bg-cc-error-bg p-4 rounded-2xl text-left mb-8 overflow-auto max-h-32">
          <p className="text-xs font-cc-mono text-cc-error">{error.message || 'Unknown error'}</p>
        </div>
        <button type="button" onClick={() => reset()} className={`${publicButton('primary')} w-full`}>
          <RefreshCw size={18} aria-hidden="true" /> Try Again
        </button>
      </div>
    </div>
  );
}
