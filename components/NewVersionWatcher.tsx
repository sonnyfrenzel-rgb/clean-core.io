'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { APP_VERSION } from '@/lib/version';
import { markTyping } from '@/lib/stale-build';
import {
  isOtherBuild,
  learnBuild,
  NEW_VERSION_BODY,
  NEW_VERSION_CHECK_INTERVAL_MS,
  NEW_VERSION_HEADLINE,
  servedBuild,
  type BuildIdentity,
} from '@/lib/new-version';

/**
 * The quiet "Clean-Core.io was updated — Reload" strip of the product shell —
 * roadmap 3.0.21 (8); the rules are in `lib/new-version.ts`.
 *
 * Asked once when the shell mounts (to learn the commit) and again whenever the
 * tab comes back into view, at most once a minute. The reload is the reader's
 * click, never automatic. It also tells `lib/stale-build.ts` when the reader is
 * typing, so the one automatic reload after a missing chunk waits for a pause
 * instead of dropping their input.
 */
export default function NewVersionWatcher() {
  const [updated, setUpdated] = useState(false);
  const tab = useRef<BuildIdentity>({ version: APP_VERSION, commit: null });
  const lastAsked = useRef(0);

  useEffect(() => {
    let live = true;
    const ask = async () => {
      if (Date.now() - lastAsked.current < NEW_VERSION_CHECK_INTERVAL_MS) return;
      lastAsked.current = Date.now();
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const served = servedBuild(await res.json().catch(() => null));
        if (!live) return;
        if (isOtherBuild(tab.current, served)) setUpdated(true);
        tab.current = learnBuild(tab.current, served);
      } catch {
        /* offline or the server is between revisions: ask again next time */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) markTyping();
    };
    void ask();
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('keydown', onKey, true);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  if (!updated) return null;
  return (
    <div data-new-version-strip="" className="cc-no-print mb-4">
      <CcMessageStrip
        state="information"
        headline={NEW_VERSION_HEADLINE}
        actions={
          <CcButton variant="ghost" onClick={() => window.location.reload()} icon={<RefreshCw size={16} aria-hidden={true} />}>
            Reload
          </CcButton>
        }
      >
        {NEW_VERSION_BODY}
      </CcMessageStrip>
    </div>
  );
}
