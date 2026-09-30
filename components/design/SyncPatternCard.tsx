'use client';

import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';

interface SyncPatternCardProps {
  dataSync?: {
    patternName: string;
    description: string;
  };
}

export default function SyncPatternCard({ dataSync }: SyncPatternCardProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc-text-label text-cc-ink-muted">Data Sync Strategy</span>
          <CcProvenanceChip value="proposed" />
        </div>
        <h4 className="cc-text-h3 text-cc-ink mt-3 mb-2">{dataSync?.patternName}</h4>
        <p className="cc-text-cell text-cc-ink">{dataSync?.description}</p>
      </div>
      <div className="border-t border-cc-line pt-4 mt-6 flex items-center justify-between cc-text-meta text-cc-ink-muted">
        <span>Status</span>
        {/* A label of the target, not a result: neutral, never green (ADR-007). */}
        <CcTag>Transformed Core</CcTag>
      </div>
    </div>
  );
}
