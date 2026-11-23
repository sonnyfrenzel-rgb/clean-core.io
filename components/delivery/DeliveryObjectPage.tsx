'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowDown, Check, ChevronRight, CircleDashed, House, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import FamilyChip from '@/components/family/FamilyChip';
import CcTable, { type CcTableRowSpec } from '@/components/cc/Table';
import { PROOF_GROUP_LABELS, type ProofRow, type ProofStatus, type TravelsOpen } from '@/lib/delivery-view';

/**
 * The pieces of the Delivery tool (ADR-132, `docs/roadmap/delivery-next-mockup.html`): sections as cards, *Before
 * go-live* in three groups, the six parts of the package, the proof table, key–value rows and the side column's
 * lists. The real stage and the demo draw the same pieces; neither decides anything here. Every value arrives as a
 * prop, read on the real stage from `lib/handover.ts` and `lib/delivery-view.ts`, on the demo from `lib/demo-project.ts`.
 *
 * Sizes follow the type scale of `DESIGN.md` §1.2: section titles `cc-text-h2`, group labels `cc-text-label`, rows
 * `cc-text-cell`, notes `cc-text-meta`.
 */

/* ------------------------------------------------------------- sections */

/** A section card: its title, a lead under it, the body below. */
export function DeliverySection({
  id,
  title,
  lead,
  meta,
  children,
  className,
  ...data
}: {
  id?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
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
      <header className="px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id={titleId} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">{title}</h2>
          {meta ? <span className="cc-text-meta text-cc-ink-muted">{meta}</span> : null}
        </div>
        {lead ? <p className="m-0 mt-1 max-w-[900px] cc-text-cell text-cc-ink-muted">{lead}</p> : null}
      </header>
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  );
}

/** A folded section (Import into SAP, Timeline): a summary row that opens in place. */
export function DeliveryFold({
  id,
  title,
  meta,
  children,
  ...data
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <details id={id} className="group scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc" {...data}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-cc-ink-muted transition-transform group-open:rotate-90" />
        <h2 id={`${id}-title`} className="m-0 cc-text-h3 text-cc-ink">{title}</h2>
        {meta ? <span className="ml-auto cc-text-meta text-cc-ink-muted">{meta}</span> : null}
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

/* --------------------------------------------------------- before go-live */

export interface NeededItem {
  key: string;
  text: string;
  /** Where it is made, and the link there. `null` for a place that has no link (the demo's own stage). */
  where: string;
  href: string | null;
  /** Made on the page being read: the link is an anchor to its section and points down. */
  here?: boolean;
}

function GroupLabel({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <p className="m-0 mt-4 mb-1 flex flex-wrap items-baseline gap-x-2 cc-text-label text-cc-ink-muted first:mt-0">
      {children}
      <span className="cc-text-meta font-medium normal-case tracking-normal">· {note}</span>
    </p>
  );
}

/**
 * *Before go-live* in three groups (L5): what blocks the handover (each with the tool where it is made), what travels
 * open and named in the package (it does not block), and what is the reader's own, in their system.
 */
export function BeforeGoLive({
  blocking,
  travels,
  empty,
  yours,
}: {
  blocking: NeededItem[];
  travels: TravelsOpen[];
  /** Said when nothing blocks. */
  empty: string;
  /** The reader's own steps, in one sentence. */
  yours: React.ReactNode;
}) {
  return (
    <div data-before-go-live="">
      <GroupLabel note={blocking.length > 0 ? 'blocks it' : 'nothing open'}>Before handover</GroupLabel>
      {blocking.length === 0 ? (
        <p data-still-needed-empty="" className="m-0 cc-text-cell text-cc-ink">{empty}</p>
      ) : (
        <ol data-still-needed="" className="m-0 list-none p-0">
          {blocking.map((n, i) => (
            <li
              key={n.key}
              data-still-needed-item={n.key}
              className={cn('grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-x-3 py-2', i > 0 && 'border-t border-cc-line')}
            >
              <span aria-hidden={true} className="mt-px inline-flex h-6 w-6 items-center justify-center rounded-full border border-cc-warning-border cc-text-meta text-cc-ink">
                {i + 1}
              </span>
              <span className="cc-text-cell font-medium break-words text-cc-ink">{n.text}</span>
              {n.href ? (
                <Link
                  href={n.href}
                  className="inline-flex min-h-8 items-center gap-1 justify-self-end cc-text-meta text-cc-ink underline underline-offset-2 hover:text-cc-brand-deep"
                >
                  {n.where}
                  {n.here ? <ArrowDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                </Link>
              ) : (
                <span className="justify-self-end cc-text-meta text-cc-ink-muted">{n.where}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {travels.length > 0 ? (
        <>
          <GroupLabel note="does not block the handover">Travels open, named</GroupLabel>
          <ul data-travels-open="" className="m-0 list-none p-0">
            {travels.map((t, i) => (
              <li key={t.key} data-travels-item={t.key} className={cn('py-2', i > 0 && 'border-t border-cc-line')}>
                <p className="m-0 cc-text-cell font-medium text-cc-ink">{t.title}</p>
                <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">{t.detail}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p data-yours-in-your-system="" className="m-0 mt-4 flex items-start gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 cc-text-cell text-cc-ink">
        <House size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-cc-ink-muted" />
        <span>{yours}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ the package */

/**
 * One part of the package (L6): its mark, its name and what it is, who wrote it (family chips), its state, and —
 * opened — what it holds and its actions.
 */
export function PackagePart({
  id,
  icon,
  name,
  sub,
  chips,
  state,
  present,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  name: string;
  sub: React.ReactNode;
  chips?: React.ReactNode;
  state: React.ReactNode;
  present: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li data-package-part={id} data-package-part-present={present ? 'true' : 'false'} className="border-t border-cc-line first:border-t-0">
      <details className="group">
        <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[38px_minmax(0,1fr)_16px] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[38px_minmax(0,1fr)_auto_16px] [&::-webkit-details-marker]:hidden">
          <span aria-hidden={true} className="flex h-[38px] w-[38px] items-center justify-center rounded-cc-row bg-cc-surface-muted text-cc-ink">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block cc-text-h3 text-cc-ink">{name}</span>
            <span className="block cc-text-meta font-medium text-cc-ink-muted">{sub}</span>
          </span>
          <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-end">
            {chips}
            <span className={cn('cc-text-meta', present ? 'text-cc-ink' : 'text-cc-ink-muted')}>{state}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="col-start-3 row-start-1 text-cc-ink-muted transition-transform group-open:rotate-90 sm:col-start-4" />
        </summary>
        <div className="pb-4 pl-0 sm:pl-12">{children}</div>
      </details>
    </li>
  );
}

/* ------------------------------------------------------------ proof table */

/** The status word of a proof row: two family chips, two plain words, "Not yet" (L3, UX review L2). */
export function ProofStatusMark({ status }: { status: ProofStatus }) {
  if (status === 'signed') return <FamilyChip kind="signed" title="A file the server generated from the signed run; HMAC-SHA256 and Ed25519 cover its bytes." />;
  if (status === 'sealed')
    return <FamilyChip kind="yours" note="sealed" title="Your own statement. Its bytes are bound by the signature, so it cannot be changed unnoticed; nobody vouches for what it says." />;
  if (status === 'never')
    return (
      <span data-proof-word="never" className="inline-flex items-center gap-1 cc-text-meta text-cc-ink" title="Kept out of the signed pack on purpose.">
        <X size={14} aria-hidden="true" className="shrink-0" />
        Never signed
      </span>
    );
  if (status === 'not-signed')
    return (
      <span data-proof-word="not-signed" className="inline-flex items-center gap-1 cc-text-meta text-cc-ink">
        <CircleDashed size={14} aria-hidden="true" className="shrink-0" />
        Not signed
      </span>
    );
  return <FamilyChip kind="not-determined" note="not yet" title="Nothing is on record for this statement yet." />;
}

/**
 * *What is proven, and what is not* — statement, what it rests on, status; grouped (L3). Drawn by `CcTable`, so it
 * stacks into cards on a phone like every table of the product. Each statement carries `data-proof-row` and
 * `data-proof-status` for the specs.
 */
export function ProofTable({ rows, demo = false }: { rows: ProofRow[]; demo?: boolean }) {
  const groups: ProofRow['group'][] = ['server', 'yours', 'not-signed'];
  const specs: CcTableRowSpec[] = [];
  for (const g of groups) {
    if (!demo) {
      specs.push({
        key: `group-${g}`,
        cells: { statement: <span className="cc-text-label text-cc-ink-muted">{PROOF_GROUP_LABELS[g]}</span> },
        span: <span className="sr-only">{PROOF_GROUP_LABELS[g]}</span>,
        emphasis: false,
        selected: true,
      });
    }
    for (const r of rows.filter((x) => x.group === g)) {
      specs.push({
        key: `proof-${r.key}`,
        cells: {
          statement: (
            <span data-proof-row={r.key} data-proof-status={demo ? 'not-yet' : r.status} className="cc-text-cell font-medium text-cc-ink">
              {r.statement}
            </span>
          ),
          restsOn: (
            <span className="cc-text-cell font-normal text-cc-ink-muted">
              {demo
                ? r.status === 'never'
                  ? 'Never part of the signed pack'
                  : r.file
                    ? 'In a real project: in the audit pack'
                    : 'In a real project: on the project, not signed'
                : r.restsOn}
              {r.file && !demo ? <code className="mt-1 block font-cc-mono cc-text-meta break-all text-cc-ink-muted">{r.file}</code> : null}
            </span>
          ),
          status: demo ? <FamilyChip kind="not-determined" note="nothing in a demo" /> : <ProofStatusMark status={r.status} />,
        },
      });
    }
  }
  return (
    <div data-proof-table="">
      <CcTable
        caption="What is proven, and what is not"
        columns={[
          { key: 'statement', label: 'Statement', width: '28%' },
          { key: 'restsOn', label: 'What it rests on' },
          { key: 'status', label: 'Status', width: '190px' },
        ]}
        rows={specs}
      />
    </div>
  );
}

/* ------------------------------------------------------------- key–values */

/** A key–value list. */
export function DeliveryKeyValues({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
      {rows.map((r) => (
        <React.Fragment key={r.k}>
          <dt className="cc-text-meta text-cc-ink-muted">{r.k}</dt>
          <dd className="m-0 cc-text-cell font-medium break-words text-cc-ink">{r.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------- side column */

export interface StatusStep {
  key: string;
  label: string;
  detail: string;
  /** done (a tick), open (its number), failed (!) */
  mark: 'done' | 'open' | 'failed';
}

/** *Status of the handover* — the tools and the two acts, then the one step this page never sees. */
export function HandoverSteps({ steps }: { steps: StatusStep[] }) {
  return (
    <ol data-handover-steps="" className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((s, i) => (
        <li key={s.key} data-handover-step={s.key} data-handover-step-mark={s.mark} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
          <span
            aria-hidden={true}
            className={cn(
              'mt-px inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] font-semibold leading-4',
              s.mark === 'done'
                ? 'border-cc-success-border bg-cc-success-bg text-cc-success'
                : s.mark === 'failed'
                  ? 'border-cc-error-border bg-cc-error-bg text-cc-error'
                  : 'border-cc-line bg-cc-surface text-cc-ink-muted',
            )}
          >
            {s.mark === 'done' ? <Check size={12} /> : s.mark === 'failed' ? '!' : i + 1}
          </span>
          <span className="min-w-0 cc-text-cell text-cc-ink">
            <span className="sr-only">{s.mark === 'done' ? 'Done: ' : s.mark === 'failed' ? 'Failed: ' : 'Open: '}</span>
            {s.label}
            <span className="block cc-text-meta font-medium text-cc-ink-muted">{s.detail}</span>
          </span>
        </li>
      ))}
      <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
        <span aria-hidden={true} className="mt-px inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-cc-line text-cc-ink-muted">
          <House size={12} />
        </span>
        <span className="min-w-0 cc-text-cell text-cc-ink">
          Activated and live
          <span className="block cc-text-meta font-medium text-cc-ink-muted">In your system — not seen here</span>
        </span>
      </li>
    </ol>
  );
}

/** *Never in the signed pack* (L10). */
export function NeverInPack({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <ul data-never-in-pack="" className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map(([t, s]) => (
        <li key={t} className="flex items-start gap-2 cc-text-cell text-cc-ink">
          <X size={14} aria-hidden="true" className="mt-1 shrink-0 text-cc-ink-muted" />
          <span>
            <span className="font-semibold">{t}</span> — {s}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A card of the side column. */
export function SideCard({ title, children, ...data }: { title: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <section className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-4 shadow-cc" aria-label={title} {...data}>
      <h3 className="m-0 mb-3 cc-text-h3 text-cc-ink">{title}</h3>
      {children}
    </section>
  );
}
