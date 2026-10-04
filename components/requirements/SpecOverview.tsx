'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { cn } from '@/lib/utils';
import { CATEGORICAL_CHART_COLORS } from '@/lib/chart-colors';
import { STATE_CLASSES } from '@/components/cc/state';
import { PRIORITY_LABEL } from '@/lib/functional-requirements';
import { REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABEL, REQUIREMENT_STATUS_STATE } from '@/lib/requirement-status';
import { SPEC_NFR_CATEGORIES, SPEC_NFR_CATEGORY_LABEL, type SpecCounts } from '@/lib/requirements-spec';

/**
 * The specification at a glance (owner 04.10.2026: "visualisations appealing,
 * functional and B2B-like"): four figures in one strip, and behind "Show overview" three bars — where the
 * requirements stand, what they are traced to, how they are prioritised — and
 * the non-functional requirements per category.
 *
 * DESIGN.md §1.8: the status bar counts states and takes the state colours,
 * each with its word; the other bars take the categorical palette; every mark
 * at full strength and every number also as text (legend and `aria-label`).
 */

interface Segment {
  key: string;
  label: string;
  value: number;
  className: string;
}

function StackedBar({ title, segments, testId }: { title: string; segments: Segment[]; testId: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const words = segments.map((s) => `${s.value} ${s.label}`).join(', ');
  return (
    <div data-spec-bar={testId} className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-cc-ink">{title}</h3>
      <div role="img" aria-label={`${title}: ${total ? words : 'none'}`} className="flex h-3 w-full overflow-hidden rounded-full bg-cc-surface-muted">
        {total
          ? segments.map((s) =>
              s.value ? <span key={s.key} data-spec-bar-segment={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.className)} style={{ width: `${(s.value / total) * 100}%` }} /> : null,
            )
          : null}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[12px] text-cc-ink-muted">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1">
            <i aria-hidden="true" className={cn('inline-block h-2 w-2 rounded-[2px]', s.className)} />
            {s.label} <b data-spec-bar-count={s.key} className="font-semibold text-cc-ink">{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SpecOverview({ counts, action }: { counts: SpecCounts; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const figures: Array<{ key: string; label: string; value: string; sub: string }> = [
    { key: 'functional', label: 'Functional', value: String(counts.functional), sub: 'requirements' },
    { key: 'non-functional', label: 'Non-functional', value: String(counts.nonFunctional), sub: 'requirements' },
    { key: 'open', label: 'Open decisions', value: String(counts.openDecisions), sub: `of ${counts.decisions}` },
    { key: 'accepted', label: 'Accepted', value: String(counts.byStatus.accepted), sub: `of ${counts.total} · by the author` },
  ];
  const nfrMax = Math.max(1, ...SPEC_NFR_CATEGORIES.map((c) => counts.byCategory[c]));
  return (
    <section aria-labelledby="spec-overview-title" data-spec-overview="" className="flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
      <h2 id="spec-overview-title" className="sr-only">At a glance</h2>
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <dl className="m-0 grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 min-[700px]:grid-cols-4">
          {figures.map((f) => (
            <div key={f.key} data-spec-figure={f.key} className="flex min-w-0 flex-col">
              <dt className="text-[12px] font-semibold text-cc-ink-muted">{f.label}</dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-x-2">
                <span data-spec-figure-value="" className="cc-text-figure text-cc-ink">{f.value}</span>
                <span className="text-[12px] font-semibold text-cc-ink-muted">{f.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
        <span className="flex flex-wrap items-center gap-2">
          {action}
          <CcButton
            variant="ghost"
            icon={open ? <ChevronUp size={16} aria-hidden={true} /> : <ChevronDown size={16} aria-hidden={true} />}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen((v) => !v)}
            data-spec-overview-toggle=""
          >
            {open ? 'Hide overview' : 'Show overview'}
          </CcButton>
        </span>
      </div>
      {open ? (
        <div id={panelId} data-spec-overview-panel="" className="flex min-w-0 flex-col gap-4 border-t border-cc-line pt-3">
          <div className="grid min-w-0 gap-6 min-[900px]:grid-cols-3">
            <StackedBar
              title="Where the requirements stand"
              testId="status"
              segments={REQUIREMENT_STATUSES.map((s) => ({
                key: s,
                label: REQUIREMENT_STATUS_LABEL[s],
                value: counts.byStatus[s],
                className: STATE_CLASSES[REQUIREMENT_STATUS_STATE[s]].mark,
              }))}
            />
            <StackedBar
              title="What they are traced to"
              testId="coverage"
              segments={[
                { key: 'code', label: 'Lines of code', value: counts.coverage.code, className: CATEGORICAL_CHART_COLORS[0].bg },
                { key: 'decision', label: 'A recorded decision', value: counts.coverage.decision, className: CATEGORICAL_CHART_COLORS[1].bg },
                { key: 'person', label: 'Written in the workspace', value: counts.coverage.person, className: CATEGORICAL_CHART_COLORS[2].bg },
                { key: 'open', label: 'Waiting on a decision', value: counts.coverage.open, className: CATEGORICAL_CHART_COLORS[3].bg },
              ]}
            />
            <StackedBar
              title="Priority"
              testId="priority"
              segments={(['must', 'should', 'could'] as const).map((p, i) => ({
                key: p,
                label: PRIORITY_LABEL[p],
                value: counts.byPriority[p],
                className: CATEGORICAL_CHART_COLORS[i === 0 ? 0 : i === 1 ? 1 : 4].bg,
              }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="m-0 text-[13px] font-semibold text-cc-ink">Non-functional requirements by category</h3>
            <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 min-[700px]:grid-cols-3">
              {SPEC_NFR_CATEGORIES.map((c) => (
                <li key={c} data-spec-category={c} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
                  <span className="truncate text-[12px] font-semibold text-cc-ink">{SPEC_NFR_CATEGORY_LABEL[c]}</span>
                  <span data-spec-category-count="" className="text-[12px] font-semibold text-cc-ink">{counts.byCategory[c]}</span>
                  <span aria-hidden="true" className="col-span-2 block h-2 overflow-hidden rounded-full bg-cc-surface-muted">
                    {counts.byCategory[c] ? <span className="block h-full rounded-full bg-cc-seq-3" style={{ width: `${(counts.byCategory[c] / nfrMax) * 100}%` }} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
