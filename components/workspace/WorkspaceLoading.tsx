'use client';

import { CC_SKELETON_DELAY_MS, useCcDelayedFlag } from '@/components/cc/delay';

/**
 * The loading gate, for every reader (UX-155, UX-159). It was a status with an
 * sr-only sentence and nothing else, so a sighted reader looked at an empty
 * page. Not a skeleton — nothing of the shell is known yet, and a skeleton
 * would promise a layout — but the same sentence on screen, quiet, and only
 * once loading has taken 300 ms (§2.8), so a fast load does not blink.
 */
export default function WorkspaceLoading() {
  const shown = useCcDelayedFlag(true, CC_SKELETON_DELAY_MS);
  return (
    <div data-workspace-gate="loading" role="status" className="py-16">
      {/* One node throughout: only its class changes, so the status is not announced twice. */}
      <p data-workspace-gate-text={shown ? 'shown' : 'pending'} className={shown ? 'm-0 cc-text-cell text-cc-ink-muted' : 'sr-only'}>
        Loading the workspace…
      </p>
    </div>
  );
}
