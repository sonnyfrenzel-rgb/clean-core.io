'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcWhyPopover from '@/components/cc/WhyPopover';
import StageMetaDetails from '@/components/StageMetaDetails';
import { CcStateDot } from '@/components/cc/StateText';
import type { ProvenanceValue, SemanticState } from '@/lib/provenance';

/**
 * The Delivery tool as an object page — owner decision 01.10.2026, direction A
 * (`scratchpad/design-proposals/proposal-A-delivery.html`): a metaline under
 * the title, four facets, a status line, an anchor bar, then the sections as
 * cards with a side column. The real stage and the demo draw the same pieces;
 * neither decides anything here. Every value arrives as a prop, read on the
 * real stage from `lib/handover.ts` and on the demo from the engine run of
 * `lib/demo-project.ts`.
 */

/* ------------------------------------------------------------- header */

export interface MetaItem {
  key: string;
  /** Printed before the value; omitted for the file name, which leads. */
  label?: string;
  /** `null` reads "not recorded" — never an empty cell. */
  value: string | null;
}

/**
 * File · lines · catalog · engine, in monospace, under the lead — behind
 * "Details" until asked for (owner 02.10.2026, DESIGN.md §2.11). Inline: the
 * real stage puts it inside the lead paragraph.
 */
export function DeliveryMetaline({ items }: { items: MetaItem[] }) {
  return (
    <StageMetaDetails inline className="mt-2">
      <span data-delivery-meta="" className="block font-cc-mono text-[12px] leading-relaxed font-medium text-cc-ink-muted">
        {items.map((m, i) => (
          <React.Fragment key={m.key}>
            {i > 0 ? <span aria-hidden={true}> · </span> : null}
            <span data-delivery-meta-item={m.key}>
              {m.label ? `${m.label} ` : null}
              {m.value === null ? (
                <span className="italic">not recorded</span>
              ) : (
                <span className="font-semibold text-cc-ink">{m.value}</span>
              )}
            </span>
          </React.Fragment>
        ))}
      </span>
    </StageMetaDetails>
  );
}

export interface FacetData {
  key: string;
  label: string;
  value: string;
  sub: string;
  provenance: ProvenanceValue;
  basis: string;
}

/** Four facet tiles: the answer first, each with its "Why?". */
export function DeliveryFacets({ facets }: { facets: FacetData[] }) {
  return (
    <ul data-delivery-facets="" className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:gap-3 lg:grid-cols-4">
      {facets.map((f) => (
        <li
          key={f.key}
          data-delivery-facet={f.key}
          className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-3 sm:px-4 sm:py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="cc-text-label text-cc-ink-muted">{f.label}</span>
            <CcWhyPopover subject={`${f.label}: ${f.value}`} provenance={f.provenance} basis={f.basis} />
          </div>
          <p data-delivery-facet-value="" className="m-0 mt-1 cc-text-h2 font-extrabold text-cc-ink sm:cc-text-figure">
            {f.value}
          </p>
          <p className="m-0 mt-1 cc-text-meta font-medium break-words text-cc-ink-muted">{f.sub}</p>
        </li>
      ))}
    </ul>
  );
}

export interface StatusItem {
  key: string;
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'information' | 'warning';
}

/** Run · Decision · Receipts · Engine — a dot, a label, a value. */
export function DeliveryStatusLine({ items }: { items: StatusItem[] }) {
  return (
    <dl data-delivery-status="" className="m-0 flex flex-wrap gap-x-5 gap-y-2 py-3 text-[12px] sm:gap-x-6">
      {items.map((s) => (
        <div key={s.key} data-delivery-status-item={s.key} className="flex min-w-0 items-center gap-2">
          <CcStateDot state={s.tone as SemanticState} />
          <dt className="cc-text-label text-cc-ink-muted">{s.label}</dt>
          <dd className="m-0 font-medium break-words text-cc-ink">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------- anchor bar */

export interface AnchorItem {
  id: string;
  label: string;
  count?: number;
}

/**
 * The sections, as a sticky bar under the shell. The section in view is
 * underlined (scroll-spy); a click jumps there. Links, not tabs: every section
 * stays on the page.
 */
export function DeliveryAnchorBar({ items }: { items: AnchorItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Sections"
      data-delivery-anchors=""
      className="cc-no-print sticky top-14 z-20 -mx-4 border-b border-cc-line bg-cc-surface px-4 md:mx-0 md:px-0"
    >
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            aria-current={current === i.id ? 'location' : undefined}
            onClick={() => setCurrent(i.id)}
            className={cn(
              'border-b-2 px-3 pt-3 pb-3 text-[13px] whitespace-nowrap text-cc-ink no-underline',
              current === i.id ? 'border-cc-ink font-bold' : 'border-transparent font-medium hover:border-cc-line',
            )}
          >
            {i.label}
            {i.count !== undefined ? <span className="ml-1 font-medium text-cc-ink-muted">({i.count})</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------- sections */

/** A section card: title left, a quiet note right, the body below. */
export function DeliverySection({
  id,
  title,
  meta,
  children,
  className,
  ...data
}: {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Record<`data-${string}`, string>) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn('scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc', className)}
      {...data}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-4 sm:px-5">
        <h2 id={titleId} className="m-0 cc-text-h2 text-cc-ink">{title}</h2>
        {meta ? <span className="cc-text-meta text-cc-ink-muted">{meta}</span> : null}
      </header>
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  );
}

/** The rule-based next step: one card, a dark left edge, the page's primary action. */
export function DeliveryNextStep({
  kind,
  headline,
  reason,
  action,
  titleId = 'handover-next-title',
}: {
  kind: string;
  headline: string;
  reason: string;
  action?: React.ReactNode;
  titleId?: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      data-handover-next={kind}
      className="flex flex-col gap-3 rounded-cc-card border border-cc-line border-l-4 border-l-cc-ink bg-cc-surface px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <ListChecks size={18} aria-hidden="true" className="hidden shrink-0 text-cc-ink sm:block" />
      <div className="min-w-0 flex-1">
        <p className="m-0 cc-text-label text-cc-ink-muted">Next step · rule-based</p>
        <h2 id={titleId} className="m-0 cc-text-h2 text-cc-ink">{headline}</h2>
        <p className="m-0 cc-text-cell text-cc-ink-muted">{reason}</p>
      </div>
      {action ? <div className="flex flex-col gap-2 sm:items-end [&>*]:justify-center">{action}</div> : null}
    </section>
  );
}

export interface ChainBox {
  key: string;
  label: string;
  title: string;
  sub: string;
  provenance: ProvenanceValue;
  provenanceNote: string | null;
  /** "2 of 4 links on record", where the box stands for several. */
  footer?: React.ReactNode;
}

/** Requirement → decision → receipt → delivery artefact: four boxes with arrows between. */
export function DeliveryChainBoxes({ boxes }: { boxes: ChainBox[] }) {
  return (
    <ol data-chain-overview="" className="m-0 grid list-none grid-cols-1 p-0 md:grid-cols-[1fr_24px_1fr_24px_1fr_24px_1fr]">
      {boxes.map((b, i) => (
        <React.Fragment key={b.key}>
          {i > 0 ? (
            <li aria-hidden={true} className="flex h-6 items-center justify-center text-cc-ink-muted md:h-auto">
              <ArrowRight size={16} className="rotate-90 md:rotate-0" />
            </li>
          ) : null}
          <li
            data-chain-group={b.key}
            data-chain-group-provenance={b.provenance}
            className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3"
          >
            <span className="cc-text-label text-cc-ink-muted">{b.label}</span>
            <h3 className="m-0 cc-text-h3 break-words text-cc-ink">{b.title}</h3>
            <p className="m-0 cc-text-cell break-words text-cc-ink-muted">{b.sub}</p>
            {/* A narrow box may wrap the chip's note rather than spill it. */}
            <div className="min-w-0 [&_[data-provenance]]:max-w-full [&_[data-provenance]]:whitespace-normal">
              <CcProvenanceChip value={b.provenance} note={b.provenanceNote ?? undefined} />
            </div>
            {b.footer ? <p className="m-0 mt-auto pt-1 cc-text-meta text-cc-ink-muted">{b.footer}</p> : null}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

export interface NeededItem {
  key: string;
  text: string;
  /** Where it is made, and the link there. `null` for a place that has no link (the demo's own stage). */
  where: string;
  href: string | null;
}

/** What a real handover still needs: a hollow mark, the line, the tool where it is made. */
export function DeliveryStillNeeded({ items, empty }: { items: NeededItem[]; empty: string }) {
  if (items.length === 0) return <p className="m-0 cc-text-cell text-cc-ink-muted">{empty}</p>;
  return (
    <ul data-still-needed="" className="m-0 list-none p-0">
      {items.map((n, i) => (
        <li
          key={n.key}
          data-still-needed-item={n.key}
          className={cn(
            'grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-x-3 py-2 text-[13px] sm:items-center',
            i > 0 && 'border-t border-cc-line',
          )}
        >
          <span aria-hidden={true} className="mt-1 inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-cc-field-border bg-cc-surface sm:mt-0" />
          <span className="font-medium break-words text-cc-ink">{n.text}</span>
          {n.href ? (
            <Link
              href={n.href}
              className="inline-flex items-center gap-1 justify-self-end cc-text-meta text-cc-ink underline underline-offset-2 hover:text-cc-brand-deep"
            >
              {n.where}
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          ) : (
            <span className="justify-self-end cc-text-meta text-cc-ink-muted">{n.where}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One artefact of the package: icon tile, title and chip, what it is, its action. */
export function DeliveryArtefactCard({
  icon,
  title,
  chip,
  detail,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  chip?: React.ReactNode;
  detail: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-package-row={title}
      className="flex min-w-0 items-start gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      <span
        aria-hidden={true}
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-cc-row bg-cc-surface-muted text-cc-ink"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 cc-text-h3 text-cc-ink">{title}</h3>
          {chip}
        </div>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{detail}</p>
        {action ? <div className="mt-3">{action}</div> : null}
        {children ? <div className="mt-3 flex flex-col gap-2">{children}</div> : null}
      </div>
    </li>
  );
}

/** A key–value list for the side column. */
export function DeliveryKeyValues({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
      {rows.map((r) => (
        <React.Fragment key={r.k}>
          <dt className="text-[12px] font-semibold text-cc-ink-muted">{r.k}</dt>
          <dd className="m-0 font-medium break-words text-cc-ink">{r.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
