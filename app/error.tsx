'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

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
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-red-100 max-w-lg w-full">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-[#0b1c30] mb-4">Something went wrong!</h2>
        <p className="text-gray-500 mb-8 font-medium">
          An unexpected error occurred in the application. We apologize for the inconvenience.
        </p>
        <div className="bg-red-50 p-4 rounded-2xl text-left mb-8 overflow-auto max-h-32">
          <p className="text-xs font-mono text-red-800">{error.message || 'Unknown error'}</p>
        </div>
        <button
          onClick={() => reset()}
          className="flex items-center justify-center gap-2 w-full bg-[#0b1c30] text-white px-6 py-4 rounded-2xl font-bold hover:bg-[#006b2c] transition-colors"
        >
          <RefreshCw size={18} /> Try Again
        </button>
      </div>
    </div>
  );
}
