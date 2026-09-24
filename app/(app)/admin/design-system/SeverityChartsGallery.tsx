'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import { CcCleanCoreLevel, CcSeverity } from '@/components/cc/Identifier';
import CcTable from '@/components/cc/Table';
import { CLEAN_CORE_LEVEL_VALUES } from '@/lib/clean-core-level';
import { SEVERITY_VALUES, type SeverityValue } from '@/lib/severity';
import {
  CATEGORICAL_CHART_COLORS,
  SEQUENTIAL_CHART_COLORS,
  categoricalChartColor,
  levelChartColor,
  severityChartColor,
} from '@/lib/chart-colors';
import { cn } from '@/lib/utils';

/**
 * Severity and chart colours — block D, step D.5d.
 *
 * A file of its own, like the galleries of D.5b and D.5c, so the steps that
 * add to the gallery in parallel each add one import and one section to
 * `page.tsx`. `tests/cc-severity-charts.spec.ts` drives what is on this page.
 *
 * The counts below are sample figures for the gallery, as the rest of this page
 * uses sample findings — nothing here is read from a project.
 */
const SAMPLE_BY_SEVERITY: Record<SeverityValue, number> = {
  Critical: 2,
  High: 5,
  Medium: 9,
  Low: 4,
  Info: 3,
};

const SAMPLE_BY_LEVEL = { A: 6, B: 11, C: 4, D: 2 } as const;

const SAMPLE_SERIES = ['Reads', 'Writes', 'Calls', 'Screens', 'Jobs'] as const;

function Swatch({ className, name }: { className: string; name: string }) {
  return (
    <span
      aria-hidden="true"
      data-chart-swatch={name}
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[2px] align-middle', className)}
    />
  );
}

function StateBar<K extends string>({
  label,
  chart,
  segments,
}: {
  label: string;
  chart: string;
  segments: ReadonlyArray<{ key: K; word: string; count: number; className: string }>;
}) {
  const aria = `${label}: ${segments.map((s) => `${s.word} ${s.count}`).join(', ')}`;
  return (
    <div
      role="img"
      aria-label={aria}
      data-chart={chart}
      className="flex h-4 w-full gap-1 overflow-hidden rounded-cc-row"
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            data-chart-segment={s.key}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={cn('block h-full min-w-[4px]', s.className)}
          />
        ))}
    </div>
  );
}

export default function SeverityChartsGallery() {
  const severitySegments = SEVERITY_VALUES.map((value) => ({
    key: value,
    word: value,
    count: SAMPLE_BY_SEVERITY[value],
    className: severityChartColor(value).bg,
  }));
  const levelSegments = CLEAN_CORE_LEVEL_VALUES.filter(
    (v): v is 'A' | 'B' | 'C' | 'D' => v !== 'Unknown',
  ).map((value) => ({
    key: value,
    word: `Level ${value}`,
    count: SAMPLE_BY_LEVEL[value],
    className: levelChartColor(value).bg,
  }));

  return (
    <div data-cc-demo="severity-charts" className="grid gap-3 md:grid-cols-2">
      <CcCard title="Severity of a finding" count={SEVERITY_VALUES.length}>
        <div className="flex flex-col gap-3">
          <div data-cc-demo-severities="" className="flex flex-wrap items-center gap-2">
            {SEVERITY_VALUES.map((value) => (
              <CcSeverity key={value} value={value} />
            ))}
          </div>
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">
            An identifier with the word, never a pill and never green. Critical and High share a
            colour and differ in the word.
          </p>
        </div>
      </CcCard>

      <CcCard title="Findings by severity — a chart that counts states">
        <div className="flex flex-col gap-3">
          <StateBar label="Findings by severity" chart="severity" segments={severitySegments} />
          <CcTable
            caption="Findings by severity"
            columns={[
              { key: 'severity', label: 'Severity' },
              { key: 'count', label: 'Findings', numeric: true, width: '110px' },
            ]}
            rows={severitySegments.map((s) => ({
              key: s.key,
              cells: {
                severity: (
                  <span className="inline-flex items-center gap-2">
                    <Swatch name={s.key} className={s.className} />
                    <CcSeverity value={s.key} />
                  </span>
                ),
                count: String(s.count),
              },
            }))}
          />
        </div>
      </CcCard>

      <CcCard title="Objects by level — a chart that counts states">
        <div className="flex flex-col gap-3">
          <StateBar label="Objects by clean-core level" chart="level" segments={levelSegments} />
          <div className="flex flex-wrap items-center gap-3">
            {levelSegments.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-2 text-[13px] font-medium text-cc-ink">
                <Swatch name={s.key} className={s.className} />
                <CcCleanCoreLevel value={s.key} />
                {s.count}
              </span>
            ))}
          </div>
        </div>
      </CcCard>

      <CcCard title="Every other chart — categorical and sequential">
        <div className="flex flex-col gap-3">
          <div data-cc-demo-palette="categorical" className="flex flex-wrap items-center gap-3">
            {CATEGORICAL_CHART_COLORS.map((c, i) => (
              <span
                key={c.token}
                data-chart-token={c.token}
                className="inline-flex items-center gap-2 text-[13px] font-medium text-cc-ink"
              >
                <Swatch name={c.token} className={c.bg} />
                {SAMPLE_SERIES[i]}
              </span>
            ))}
          </div>
          <div data-cc-demo-palette="sequential" className="flex flex-wrap items-center gap-3">
            {SEQUENTIAL_CHART_COLORS.map((c, i) => (
              <span
                key={c.token}
                data-chart-token={c.token}
                className="inline-flex items-center gap-2 text-[13px] font-medium text-cc-ink"
              >
                <Swatch name={c.token} className={c.bg} />
                {`Step ${i + 1}`}
              </span>
            ))}
          </div>
          {/* The same palette through an SVG attribute, the way a charting
              library hands a colour to a shape. */}
          <svg
            role="img"
            aria-label="Categorical palette as SVG shapes: Reads, Writes, Calls, Screens, Jobs"
            viewBox="0 0 200 16"
            preserveAspectRatio="xMinYMid meet"
            className="h-4 w-full max-w-[320px]"
          >
            {SAMPLE_SERIES.map((name, i) => (
              <rect
                key={name}
                data-chart-svg={categoricalChartColor(i).token}
                x={i * 40}
                y={0}
                width={36}
                height={16}
                fill={categoricalChartColor(i).value}
              />
            ))}
          </svg>
        </div>
      </CcCard>
    </div>
  );
}
