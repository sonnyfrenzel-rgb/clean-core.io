'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { publicButton } from '@/components/landing/public-button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
    // Stale-chunk recovery: after a deploy, a tab opened on the previous build
    // requests chunk hashes that no longer exist ("Loading chunk … failed").
    // Auto-reload once to pull the current build; the flag prevents a reload loop.
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
