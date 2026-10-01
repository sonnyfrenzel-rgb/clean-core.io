'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { CcStateDot } from '@/components/cc/StateText';
import type { ChecklistRow } from '@/lib/economics-checklist';
import { PROPOSED_DAYS_PER_1000_LINES } from '@/lib/cost-assumptions';
import { formatNumber } from '@/lib/format';

/**
 * The Economics tool as a Fiori object page — owner decision 01.10.2026,
 * direction A (`design-proposals/proposal-A-economics.html`).
 *
 * The page answers at the top — four facet tiles (inputs, options, cost
 * winner, savings forecast) and a status line — then an anchor bar to the
 * sections, the sections as cards, and a side column with the cost winner.
 * This module holds the pieces of that frame; the page composes them and owns
 * every figure. Nothing here computes an amount: the tiles count checklist rows
 * and options, and the money in them is whatever the page hands in, already
 * refused or priced by `lib/cost-assumptions.ts` and `lib/tco-model.ts`.
 */

/** How the checklist stands, counted once for the tile, the bar and the donut. */
export interface InputTally {
  total: number;
  /** Stated by the reader. */
  stated: number;
  /** Taken from the uploaded source (the line count), untouched. */
  fromSource: number;
  /** A starting value of the model nobody moved. */
  assumed: number;
  /** Still keeping an amount away: open, partial, unconfirmed. */
  open: number;
}

export function tallyRows(rows: ReadonlyArray<ChecklistRow>, openKeys: ReadonlySet<string>): InputTally {
  let stated = 0;
  let fromSource = 0;
  let assumed = 0;
  for (const r of rows) {
    if (openKeys.has(r.key)) continue;
    if (r.status === 'assumed') assumed += 1;
    else if (r.detail === 'from your source') fromSource += 1;
    else stated += 1;
  }
  return { total: rows.length, stated, fromSource, assumed, open: openKeys.size };
}

/**
 * The three parts of the tally as bar segments. A stated figure is the
 * reader's, not evidence, so it is drawn in the information colour and never
 * in green (DESIGN.md §1.1); an assumed one in the warning mark; open as the
 * empty line.
 */
function segments(t: InputTally) {
  return [
    { key: 'stated', count: t.stated + t.fromSource, mark: 'bg-cc-information', stroke: 'stroke-cc-information' },
    { key: 'assumed', count: t.assumed, mark: 'bg-cc-warning-mark', stroke: 'stroke-cc-warning-mark' },
    { key: 'open', count: t.open, mark: 'bg-cc-line', stroke: 'stroke-cc-line' },
  ];
}

/** The micro bar under the Inputs tile. Text beside it says the same in words. */
export function InputsBar({ tally }: { tally: InputTally }) {
  return (
    <div aria-hidden={true} data-economics-inputs-bar="" className="flex h-2 w-full gap-1 overflow-hidden rounded-full">
      {segments(tally)
        .filter((s) => s.count > 0)
        .map((s) => (
          <span key={s.key} className={cn('h-full rounded-full', s.mark)} style={{ flexGrow: s.count }} />
        ))}
    </div>
  );
}

/** The donut of the side card: the same tally, with the count in its middle. */
export function InputsDonut({ tally }: { tally: InputTally }) {
  const size = 120;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = tally.total - tally.open;
  const filled = segments(tally).filter((seg) => seg.count > 0 && seg.key !== 'open');
  const arcs = filled.map((seg, i) => {
    const before = filled.slice(0, i).reduce((sum, x) => sum + x.count, 0);
    return {
      ...seg,
      start: (before / Math.max(1, tally.total)) * c,
      len: (seg.count / Math.max(1, tally.total)) * c,
    };
  });
  return (
    <figure className="relative m-0 mx-auto h-[120px] w-[120px]" data-economics-donut="">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden={true} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-cc-line" />
        {arcs.map((s) => (
          <circle
            key={s.key}
            data-cc-chart-segment=""
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${s.len} ${c - s.len}`}
            strokeDashoffset={-s.start}
            className={s.stroke}
          />
        ))}
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="cc-text-figure text-cc-ink">
          {done}/{tally.total}
        </span>
        <span className="text-[11px] font-medium text-cc-ink-muted">inputs</span>
      </figcaption>
    </figure>
  );
}

/** A thin progress meter — how many of an option's mandatory groups are stated. */
export function GroupMeter({ filled, total, label }: { filled: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-valuetext={`${filled} of ${total}`}
      className="h-2 w-full overflow-hidden rounded-full bg-cc-line"
    >
      <span className="block h-full rounded-full bg-cc-seq-3" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * One facet tile of the object page header: a micro label with its "Why?", the
 * value, a sentence under it and, where there is one, a small picture.
 */
export function EconomicsFacet({
  id,
  label,
  why,
  figure,
  figureNote,
  sub,
  viz,
}: {
  id: string;
  label: string;
  /** What the tile rests on, said in the "Why?" popover. */
  why: ReactNode;
  /** The key figure — a count, a name, "None yet" — in the figure role. */
  figure: ReactNode;
  /** A few muted words after it — "of 13 · 10 open". */
  figureNote?: ReactNode;
  sub?: ReactNode;
  viz?: ReactNode;
}) {
  return (
    <li
      data-economics-facet={id}
      className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="cc-text-label text-cc-ink-muted">{label}</span>
        <CcWhyPopover subject={label} provenance="simulation" basis={why} />
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">
        <span data-economics-facet-figure="" className="cc-text-figure text-cc-ink">
          {figure}
        </span>
        {figureNote ? <span className="cc-text-cell text-cc-ink-muted">{figureNote}</span> : null}
      </div>
      {/* A chip in a narrow tile may wrap (proposal A, phone): the facet is a
          quarter of the width and its note is a few words, not an identifier. */}
      {sub ? (
        <div className="mt-2 min-w-0 cc-text-cell text-cc-ink-muted [&_[data-provenance]]:whitespace-normal">{sub}</div>
      ) : null}
      {viz ? <div className="mt-3">{viz}</div> : null}
    </li>
  );
}

/** The status line under the tiles: a dot, a micro label, a value. */
export function EconomicsStatus({
  items,
}: {
  items: Array<{ key: string; label: string; value: string; state: 'warning' | 'neutral' | 'information' }>;
}) {
  return (
    <ul
      data-economics-status-line=""
      aria-label="Status"
      className="m-0 mt-3 flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0 cc-text-meta"
    >
      {items.map((s) => (
        <li key={s.key} data-economics-status-item={s.key} className="inline-flex items-center gap-2">
          <CcStateDot state={s.state} />
          <span className="cc-text-label text-cc-ink-muted">{s.label}</span>
          <span className="font-medium text-cc-ink">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The anchor bar: one link per section, sticky under the shell bar, the
 * section in view underlined. It is navigation, so it does not print.
 */
export function EconomicsAnchorBar({ anchors }: { anchors: Array<{ id: string; label: string; count?: number }> }) {
  const [active, setActive] = useState(anchors[0]?.id ?? '');
  const ids = anchors.map((a) => a.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const els = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav
      aria-label="Sections"
      data-economics-anchors=""
      className="cc-no-print sticky top-14 z-cc-sticky -mx-4 mt-4 border-y border-cc-line bg-cc-surface px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:none]">
        {anchors.map((a) => (
          <li key={a.id} className="shrink-0">
            <a
              href={`#${a.id}`}
              aria-current={active === a.id ? 'location' : undefined}
              onClick={() => setActive(a.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1 border-b-2 px-3 text-[13px] whitespace-nowrap text-cc-ink no-underline',
                active === a.id ? 'border-cc-ink font-bold' : 'border-transparent font-medium hover:border-cc-line',
              )}
            >
              {a.label}
              {typeof a.count === 'number' ? (
                <span className="font-medium text-cc-ink-muted">({a.count})</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A section of the page: a card with its heading, a note on the right and a lead. */
export function EconomicsSection({
  id,
  title,
  right,
  lead,
  children,
  className,
  data,
}: {
  id: string;
  title: ReactNode;
  right?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  data?: Record<`data-${string}`, string>;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'cc-card scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc',
        className,
      )}
      {...data}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <h2 id={headingId} className="flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
          {title}
        </h2>
        {right}
      </header>
      {lead ? <p className="m-0 mt-1 px-4 cc-text-cell text-cc-ink-muted md:px-5">{lead}</p> : null}
      <div className="px-4 pt-3 pb-4 md:px-5 md:pb-5">{children}</div>
    </section>
  );
}

/**
 * The fixed factors the per-option proposal is computed from, per 1,000 lines
 * (`PROPOSED_DAYS_PER_1000_LINES`) — written out, so a reader sees what the
 * "Take over" button would put into an option before pressing it.
 */
export function ProposalFactors({ loc }: { loc: number }) {
  const f = PROPOSED_DAYS_PER_1000_LINES;
  const n = (v: number) => formatNumber(v) ?? String(v);
  const tiles = [
    { key: 'dev-once', label: 'Dev days once', value: `${n(f.oneOffDevLow)}–${n(f.oneOffDevHigh)}` },
    { key: 'test-once', label: 'Test days once', value: `${n(f.oneOffTestLow)}–${n(f.oneOffTestHigh)}` },
    { key: 'dev-release', label: 'Dev days per release', value: n(f.perReleaseDev) },
    { key: 'test-release', label: 'Test days per release', value: n(f.perReleaseTest) },
  ];
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {tiles.map((t) => (
          <li
            key={t.key}
            data-economics-factor={t.key}
            className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
          >
            <span className="cc-text-label text-cc-ink-muted">{t.label}</span>
            <span className="mt-1 cc-text-figure text-cc-ink">{t.value}</span>
            <span className="cc-text-meta font-medium text-cc-ink-muted">per 1,000 lines</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
        Fixed factors on {n(loc)} lines; nothing measured them. They count as your assumption only once you
        confirm them.
      </p>
    </>
  );
}
