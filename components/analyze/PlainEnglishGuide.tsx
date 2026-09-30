'use client';

import { CcTag } from '@/components/cc/Tag';

interface PlainEnglishGuideProps {
  plainEnglishActionPlan: string[];
  extensibilityRoute: string;
}

export default function PlainEnglishGuide({ plainEnglishActionPlan, extensibilityRoute }: PlainEnglishGuideProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col justify-between">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cc-line pb-4">
          <div>
            <span className="cc-text-label text-cc-ink-muted">Executive Summary</span>
            <h3 className="cc-text-h2 text-cc-ink mt-2">What to Do - Plain English Guide</h3>
            <p className="cc-text-cell text-cc-ink-muted mt-1">Simple, non-technical steps to modernize this business process successfully.</p>
          </div>
          <span className="shrink-0 self-start sm:self-center">
            <CcTag>Business Roadmap</CcTag>
          </span>
        </div>

        <div className="space-y-3">
          {plainEnglishActionPlan.map((action, aIdx) => (
            <div key={aIdx} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex items-start gap-4">
              <span className="w-8 h-8 rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink flex items-center justify-center shrink-0 cc-text-identifier">{aIdx + 1}</span>
              <p className="cc-text-body text-cc-ink pt-1">{action}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="cc-text-label text-cc-ink-muted mt-6 pt-4 border-t border-cc-line">
        Strategic Path: {extensibilityRoute} Track
      </div>
    </div>
  );
}
