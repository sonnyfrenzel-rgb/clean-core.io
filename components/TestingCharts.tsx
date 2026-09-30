'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { stateChartColor } from '@/lib/chart-colors';

/**
 * The two charts of the QA dashboard — DESIGN.md §1.8, colours from
 * `lib/chart-colors.ts` only.
 *
 * They count verdicts, so they take state colours — but never green: nothing a
 * chart counts is a proof (ADR-007), so a pass is `information`, a failure
 * `error`, and a test without a verdict is the *not determined* area — muted
 * surface, dashed edge — because "we do not know" is not a category and not a
 * warning. Every number is also text: the counts stand under the ring, and the
 * bar chart carries a list for screen readers.
 */

/** The dashed edge of *not determined*, in SVG terms. */
const NOT_DETERMINED_SVG = {
  fill: 'var(--cc-surface-muted)',
  stroke: 'var(--cc-field-border)',
  strokeDasharray: '3 2',
} as const;

export interface TestingPieSlice {
  name: string;
  value: number;
  /** A `var(--cc-…)` from `lib/chart-colors.ts`. */
  color: string;
  /** The slice of tests without a verdict — drawn dashed, not filled. */
  notDetermined?: boolean;
}

export interface TestingChartStats {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  verdicts: number;
  passRate: number | null;
  categoryStats: { name: string; passed: number; failed: number; inconclusive: number; total: number }[];
}

export function TestingPieChart({ pieData, stats }: { pieData: TestingPieSlice[]; stats: TestingChartStats }) {
  const summary = pieData.map((s) => `${s.value} ${s.name}`).join(', ');
  return (
    <div className="relative w-40 h-40 mb-4" role="img" aria-label={`Test verdicts: ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={4}
            dataKey="value"
            isAnimationActive={false}
          >
            {pieData.map((entry, index) =>
              entry.notDetermined ? (
                <Cell key={`cell-${index}`} data-chart-segment data-not-determined {...NOT_DETERMINED_SVG} />
              ) : (
                <Cell key={`cell-${index}`} data-chart-segment fill={entry.color} stroke="none" />
              ),
            )}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/*
        `passRate` is null when nothing returned a verdict — every test skipped,
        or the runner reported on none of them. Rendering that gave "null%", and
        before the denominator was fixed it gave a confident 0% for a run that had
        simply not measured anything.
      */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {stats.passRate === null || stats.passRate === undefined ? (
          <>
            <span className="cc-text-h2 text-cc-neutral">No verdict</span>
            <span className="cc-text-label text-cc-ink-muted">
              Nothing ran
            </span>
          </>
        ) : (
          <>
            <span className="cc-text-title text-cc-ink">{stats.passRate}%</span>
            <span className="cc-text-label text-cc-ink-muted">
              Pass Rate
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function TestingBarChart({ stats }: { stats: TestingChartStats }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats.categoryStats} layout="vertical" margin={{ left: 40 }}>
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            axisLine={false}
            tickLine={false}
            width={120}
            tick={{ fill: 'var(--cc-ink-muted)', fontSize: 12, fontWeight: 600 }}
          />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            contentStyle={{ borderRadius: 'var(--cc-radius-row)', border: '1px solid var(--cc-line)', boxShadow: 'var(--cc-shadow)', fontSize: 12 }}
          />
          <Bar dataKey="passed" name="Passed" stackId="a" fill={stateChartColor('information').value} barSize={20} isAnimationActive={false} />
          <Bar dataKey="failed" name="Failed" stackId="a" fill={stateChartColor('error').value} barSize={20} isAnimationActive={false} />
          {/* Tests without a verdict were counted and then not drawn, so a
              category of nothing but skipped tests showed as an empty row. */}
          <Bar dataKey="inconclusive" name="No verdict" stackId="a" {...NOT_DETERMINED_SVG} barSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {stats.categoryStats.map((c) => (
          <li key={c.name}>
            {c.name}: {c.passed} passed, {c.failed} failed, {c.inconclusive} no verdict, of {c.total}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TestingCharts = { TestingPieChart, TestingBarChart };
export default TestingCharts;
