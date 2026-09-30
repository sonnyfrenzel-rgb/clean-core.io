'use client';

import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupportFinding } from '@/lib/abap/class-model';
import type { SupportLevel } from '@/lib/abap/support-matrix';
import type { SupportSummary } from '@/lib/abap/findings-detector';
import { stateChartColor } from '@/lib/chart-colors';
import { SUPPORT_LEVEL_STATE } from '@/lib/support-level';
import SupportLevelMark from './SupportLevelMark';
import { formatPercent } from '@/lib/format';
import CcDialog from '@/components/cc/Dialog';
import CcIconButton from '@/components/cc/IconButton';
import CcWhyPopover from '@/components/cc/WhyPopover';

interface CoverageVerdictProps {
  findings: SupportFinding[];
  summary: SupportSummary | null;
}

const EXPLANATIONS: { level: SupportLevel; title: string; text: string }[] = [
  {
    level: 'fully',
    title: 'Fully Supported',
    text: 'Statically verified constructs that map 1:1 to released standard models or automatically transformed BTP APIs.',
  },
  {
    level: 'partial',
    title: 'Review Required',
    text: 'Complex patterns (e.g. 3-table joins or custom enhancements) that require architectural sign-off to ensure clean core compliance.',
  },
  {
    level: 'not-supported',
    title: 'Out of Scope',
    text: 'Legacy UI components or internal system kernel calls that have no cloud-equivalent APIs and must be decommissioned or fully re-architected.',
  },
];

export default function CoverageVerdict({ findings, summary }: CoverageVerdictProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  const total = findings.length;
  const counts = summary?.counts || { fully: 0, partial: 0, notSupported: 0 };
  // A missing summary used to become 'fully' — the best verdict available,
  // awarded for the absence of data. Absent means absent.
  const overall: SupportLevel | null = summary?.overall ?? null;

  // Zero findings used to render as 100 % fully covered. It is a defensible
  // reading for genuinely trivial code and an indefensible one for a parse that
  // returned nothing, and the donut cannot tell them apart. Zero of zero is
  // shown as zero, and the verdict label above says "not summarised".
  const share = (n: number) => (total > 0 ? n / total : 0);
  const fullyShare = share(counts.fully);
  const reviewShare = share(counts.partial);
  const outOfScopeShare = share(counts.notSupported);

  // SVG calculations for segmented donut
  const radius = 38;
  const circ = 2 * Math.PI * radius; // ~238.76
  const offset = (fraction: number) => circ - circ * fraction;

  const counters: { level: SupportLevel; title: string; fraction: number; count: number }[] = [
    { level: 'fully', title: 'Fully Supported', fraction: fullyShare, count: counts.fully },
    { level: 'partial', title: 'Review Required', fraction: reviewShare, count: counts.partial },
    { level: 'not-supported', title: 'Out of Scope', fraction: outOfScopeShare, count: counts.notSupported },
  ];

  const segments: { level: SupportLevel; fraction: number; rotate: number }[] = [
    { level: 'fully', fraction: fullyShare, rotate: 0 },
    { level: 'partial', fraction: reviewShare, rotate: fullyShare * 360 },
    { level: 'not-supported', fraction: outOfScopeShare, rotate: (fullyShare + reviewShare) * 360 },
  ];

  return (
    <section className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        {/* Left column: Title & counters */}
        <div className="space-y-5 flex-1 w-full">
          <div className="flex items-center gap-2">
            <span className="cc-text-label text-cc-ink-muted">Deterministic audit</span>
            <CcIconButton label="What is Coverage Verdict?" title="What is Coverage Verdict?" onClick={() => setShowExplanation(true)}>
              <CircleHelp size={16} aria-hidden="true" />
            </CcIconButton>
          </div>

          <div>
            <h3 className="cc-text-h2 text-cc-ink">Coverage Verdict</h3>
            <p className="cc-text-cell text-cc-ink-muted mt-1">
              Statically resolved ABAP language constructs mapped directly to target platform capabilities.
            </p>
          </div>

          {/* Three Counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {counters.map((c) => (
              <div key={c.level} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
                <span className="cc-text-label text-cc-ink-muted block mb-1">{c.title}</span>
                <div className="flex items-center gap-2">
                  <span className="cc-text-title tabular-nums text-cc-ink">{formatPercent(c.fraction) ?? '0%'}</span>
                  <span className="cc-text-meta font-cc-mono text-cc-ink-muted">({c.count})</span>
                  <CcWhyPopover
                    subject={`${c.title} ${formatPercent(c.fraction) ?? '0%'}`}
                    provenance="reconstructed"
                    basis={`Static detectors against the target platform's support matrix: ${c.count} of ${total} construct findings are at this level.`}
                    evidence="The construct findings listed below, each with its file and line."
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Donut Chart */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r={radius} className="stroke-cc-line fill-none" strokeWidth="8" />
              {segments.map((s) => (
                <circle
                  key={s.level}
                  cx="50"
                  cy="50"
                  r={radius}
                  className={cn('fill-none', stateChartColor(SUPPORT_LEVEL_STATE[s.level]).stroke)}
                  strokeWidth="8"
                  strokeDasharray={circ}
                  strokeDashoffset={offset(s.fraction)}
                  style={{ transform: `rotate(${s.rotate}deg)`, transformOrigin: '50px 50px' }}
                />
              ))}
            </svg>

            {/* Center label */}
            <div className="absolute flex flex-col items-center text-center px-4">
              {overall ? (
                <SupportLevelMark level={overall} />
              ) : (
                <span className="cc-text-meta text-cc-ink-muted">Not summarised</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <CcDialog
        open={showExplanation}
        onClose={() => setShowExplanation(false)}
        title="Coverage Verdict Architecture"
        lead="The Coverage Verdict is computed statically by analyzing your custom repository against released SAP S/4HANA APIs and BTP Cloud guidelines."
      >
        <span className="cc-text-label text-cc-ink-muted">EA Assessment Guidelines</span>
        <div className="mt-2 space-y-3">
          {EXPLANATIONS.map((e) => (
            <div key={e.level} className="flex gap-3 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
              <SupportLevelMark level={e.level} label="" />
              <div>
                <h3 className="cc-text-h3 text-cc-ink">{e.title}</h3>
                <p className="cc-text-cell text-cc-ink-muted mt-1">{e.text}</p>
              </div>
            </div>
          ))}
        </div>
      </CcDialog>
    </section>
  );
}
