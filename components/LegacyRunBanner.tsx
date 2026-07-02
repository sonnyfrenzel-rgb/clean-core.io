'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
 */
export default function LegacyRunBanner({ capabilities, projectId }: LegacyRunBannerProps) {
  if (!capabilities.isLegacy) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in duration-300">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900">
            This project was analyzed with an older engine
            {capabilities.engineVersion ? ` (${capabilities.engineVersion})` : ''}.
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            Missing from this run: {capabilities.missing.join(' · ')}. Sections that
            depend on this evidence are hidden until you re-analyze — shown honestly,
            not silently.
          </p>
        </div>
      </div>
      <Link
        href={`/project/${projectId}/analyze?reason=legacy-run`}
        className="inline-flex items-center gap-2 shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-colors self-start sm:self-auto"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Re-run analysis
      </Link>
    </div>
  );
}
