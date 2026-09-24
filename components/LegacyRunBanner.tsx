'use client';

import { RefreshCw } from 'lucide-react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcLinkButton from '@/components/cc/LinkButton';
import type { RunCapabilities } from '@/lib/run-capabilities';

interface LegacyRunBannerProps {
  capabilities: RunCapabilities;
  projectId: string;
}

/**
 * Honest, visible state for legacy analysis runs.
 *
 * Shown when a run exists but predates the current engine's evidence fields
 * (see lib/run-capabilities.ts). Instead of silently hiding sections, the page
 * names what is missing and offers the fix: re-run the analysis.
 * Renders nothing when the run carries full evidence.
 *
 * A `warning` Message Strip since Block D (D.9) — the product's one form for a
 * notice on a page (`DESIGN.md` §2.6) — with the fix as its action.
 */
export default function LegacyRunBanner({ capabilities, projectId }: LegacyRunBannerProps) {
  if (!capabilities.isLegacy) return null;

  return (
    <div data-legacy-run-banner className="mb-6">
      <CcMessageStrip
        state="warning"
        headline={`This project was analyzed with an older engine${
          capabilities.engineVersion ? ` (${capabilities.engineVersion})` : ''
        }.`}
        actions={
          <CcLinkButton
            href={`/project/${projectId}/analyze?reason=legacy-run`}
            icon={<RefreshCw size={16} aria-hidden="true" />}
          >
            Re-run analysis
          </CcLinkButton>
        }
      >
        Missing from this run: {capabilities.missing.join(' · ')}. Sections that
        depend on this evidence are hidden until you re-analyze — shown honestly,
        not silently.
      </CcMessageStrip>
    </div>
  );
}
