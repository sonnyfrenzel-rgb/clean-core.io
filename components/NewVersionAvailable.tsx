'use client';

import { RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';

/**
 * What an error boundary shows when the tab still runs the previous build and its
 * one automatic reload is spent (roadmap 3.0.6, `lib/stale-build.ts`). Not an
 * error: nothing broke and nothing was lost, the tab is only older than the site.
 * No raw message — "(0 , j.getAuth) is not a function" reads like a crash.
 */
export default function NewVersionAvailable() {
  return (
    <div
      data-new-version-available
      role="status"
      className="bg-cc-surface p-8 rounded-cc-card shadow-cc border border-cc-line max-w-lg w-full text-center"
    >
      <RefreshCw size={20} className="mx-auto mb-3 text-cc-brand-strong" aria-hidden="true" />
      <h2 className="m-0 mb-3 cc-text-h2 text-cc-ink">A new version of Clean-Core.io is available</h2>
      <p className="m-0 mb-6 cc-text-body text-cc-ink-muted">
        This tab was opened before the latest update and still runs the previous version. Reload to continue with the
        current one; reloading deletes nothing that is stored.
      </p>
      <CcButton
        variant="primary"
        density="cozy"
        onClick={() => window.location.reload()}
        data-new-version-reload
        icon={<RefreshCw size={16} aria-hidden="true" />}
      >
        Reload
      </CcButton>
    </div>
  );
}
