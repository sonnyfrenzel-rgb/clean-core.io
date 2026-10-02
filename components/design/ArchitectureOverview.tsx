'use client';

import { Terminal, Layers } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { BTP, sapNamesForDisplay } from '@/lib/sap-naming';

interface ArchitectureOverviewProps {
  overview?: {
    approachDescription: string;
    nodeFramework: string;
    runtimePlatform: string;
  };
}

export default function ArchitectureOverview({ overview }: ArchitectureOverviewProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col justify-between md:col-span-2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc-text-label text-cc-ink-muted">Architecture Approach</span>
          {/* The approach, framework and platform are the model's design. */}
          <CcProvenanceChip value="proposed" />
        </div>
        <h3 className="cc-text-h2 text-cc-ink mt-2 mb-3">Modern Cloud-Native Blueprint</h3>
        <p className="cc-text-body text-cc-ink">{overview?.approachDescription}</p>
      </div>
      <div className="border-t border-cc-line pt-4 mt-6 flex flex-wrap items-center gap-6">
        <div>
          <span className="cc-text-label text-cc-ink-muted">Framework</span>
          <div className="flex items-center gap-2 mt-1">
            <Terminal className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-h3 text-cc-ink">{overview?.nodeFramework || 'Node.js'}</span>
          </div>
        </div>
        <div className="h-8 w-px bg-cc-line"></div>
        <div>
          <span className="cc-text-label text-cc-ink-muted">Runtime Platform</span>
          <div className="flex items-center gap-2 mt-1">
            <Layers className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-h3 text-cc-ink">{overview?.runtimePlatform ? sapNamesForDisplay(overview.runtimePlatform) : BTP}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
