'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, LayoutGrid, List, Workflow, Wrench } from 'lucide-react';
import type { UserProfile } from '@/hooks/useUserProfile';
import { PHASES, type PhaseKey } from '@/lib/workflow-steps';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';
import { runsLeftLabel } from '@/lib/run-quota-rule';
import { formatNumber } from '@/lib/format';
import {
  COUNTS_FROM,
  nextStepOf,
  programNextLabel,
  programNextStep,
  REDESIGN_KEYS,
  tileCounts,
  tileMatches,
  type ProgramTile,
  type TileFilter,
  type TrackMark,
} from '@/lib/workspace-tiles';
import type { WorkspaceLens, WorkspaceMode } from '@/lib/workspace-prefs';
import {
  homeExampleLines,
  wsAlsoWaiting,
  wsAnalysedOn,
  wsChangedThisWeek,
  wsDeliveredOn,
  wsNextBody,
  wsNextBodyAnalyse,
  wsNextBodyRerun,
  wsNextBodyStart,
  wsNextTitle,
  wsNotNeeded,
  wsOutOfDate,
  wsProgramsCount,
  wsQuotaLine,
  wsRedesignStep,
  wsSharedLine,
  wsSteps,
  wsToolsAt,
  wsWelcomeBack,
  wt,
} from '@/lib/workspace-messages';
import { t } from '@/lib/cc-messages';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import StarterExamples from '@/components/StarterExamples';
import MapThumb from './MapThumb';
import WorkspaceRowActions, { type RowActionHandlers } from './WorkspaceRowActions';
import { HOME_LINK, OwnCodeWay, ProductMark } from './HomeStartParts';

/**
 * "My workspace" for a returning account — direction A of the mock-up
 * `docs/roadmap/workspace-two-products-mockup.html` (ADR-123 (4)): three
 * sections and nothing else.
 *
 *   1. **Next step** — the one filled button of the page, for the one program
 *      the account should go on with (`nextStepOf`), and one line for another
 *      that waits.
 *   2. **At a glance** — five count tiles from three programs on (W10). They
 *      are the filter: pressing one shows its programs, pressing it again all.
 *      "Changed in the last 7 days" from the documents' own dates — there is no
 *      "since your last visit", which would need an account field.
 *   3. **Your programs** — one tile per program, all one size: its map as a
 *      thumbnail, three facts (steps, clean core score, decision), and a line per
 *      product, Analyse and Re-design, each with one action. The lens
 *      "Read as Business · IT · Management" only marks one fact (W9); the
 *      analysis opens as always (privacy policy 1.4, section 7). The table, direction B, is the list mode one
 *      click away; the last tile starts the next analysis.
 *
 * Every figure is read from the project list and the server-written summary on
 * each project (`lib/workspace-tiles.ts`) — no request per tile, no bpmn-js.
 * Shared programs are read, not worked on: they are counted in the line under
 * the tiles and listed behind "Sharing", as before.
 */

const TOOL_LABEL = Object.fromEntries(PHASES.map((p) => [p.key, p.label])) as Record<PhaseKey, string>;

const toolHref = (tile: ProgramTile, key: PhaseKey) => `${tile.href}/${key}`;
// The lens only decides which fact a tile highlights; the analysis opens as it always does. Privacy policy 1.4,
// section 7 (lawyer, statement 20c E2): the view "only decides which figure the tiles highlight".
const analysisHref = (tile: ProgramTile) => `${tile.href}/analyze`;

function Dot({ tone }: { tone: 'waiting' | 'moving' | 'outdated' }) {
  return (
    <span
      aria-hidden={true}
      className={
        'size-2 flex-none rounded-full ' +
        (tone === 'waiting'
          ? 'border-[1.5px] border-cc-field-border bg-cc-surface'
          : tone === 'outdated'
            ? 'bg-cc-warning-mark'
            : 'bg-cc-ink')
      }
    />
  );
}

function Status({ tone, children }: { tone: 'signed' | 'waiting' | 'moving' | 'outdated'; children: React.ReactNode }) {
  return (
    <span
      className={
        'inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold ' +
        (tone === 'signed' ? 'text-cc-success' : tone === 'outdated' ? 'text-cc-warning' : 'text-cc-ink')
      }
    >
      {tone === 'signed' ? <CheckCircle2 size={14} aria-hidden={true} className="flex-none" /> : <Dot tone={tone} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function ActionLink({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <Link href={href} className={HOME_LINK} {...rest}>
      {children}
      <ArrowRight size={14} aria-hidden={true} />
    </Link>
  );
}

function Track({ marks }: { marks: TrackMark[] }) {
  return (
    <span aria-hidden={true} className="grid h-1 w-full max-w-[150px] grid-cols-6 gap-px">
      {marks.map((m, i) => (
        <i
          key={i}
          className={
            'rounded-[2px] ' +
            (m === 'signed'
              ? 'bg-cc-success'
              : m === 'done'
                ? 'bg-cc-ink'
                : m === 'now'
                  ? 'bg-cc-ink shadow-[0_0_0_1px_var(--cc-surface),0_0_0_2px_var(--cc-ink)]'
                  : 'bg-cc-line')
          }
        />
      ))}
    </span>
  );
}

function AnalyseLine({ tile }: { tile: ProgramTile }) {
  const a = tile.analyse;
  const status =
    a.kind === 'signed' ? (
      <Status tone="signed">{wsAnalysedOn(a.on)}</Status>
    ) : a.kind === 'stale' ? (
      <Status tone="outdated">{wt('ws.an.stale')}</Status>
    ) : (
      <Status tone="waiting">{a.kind === 'no-code' ? wt('ws.an.noCode') : wt('ws.an.notAnalysed')}</Status>
    );
  const action =
    a.kind === 'signed' ? (
      <ActionLink href={analysisHref(tile)} data-tile-action="open-analysis">{wt('ws.an.open')}</ActionLink>
    ) : (
      <ActionLink href={`${tile.href}/analyze`} data-tile-action="run">
        {programNextLabel(programNextStep(tile))}
      </ActionLink>
    );
  return (
    <ProductRow name={wt('ws.tile.analyse')} product="analyse" status={status}>
      <span className="text-[12px] font-semibold text-cc-ink-muted">{a.kind === 'stale' ? wt('ws.an.redesignWaits') : ''}</span>
      {tile.access === 'own' ? action : null}
    </ProductRow>
  );
}

function RedesignLine({ tile }: { tile: ProgramTile }) {
  const r = tile.redesign;
  const meta = (text: string) => <span className="text-[12px] font-semibold whitespace-nowrap text-cc-ink-muted">{text}</span>;
  let status: React.ReactNode;
  let left: React.ReactNode;
  let action: React.ReactNode = null;
  switch (r.kind) {
    case 'not-needed':
      status = <Status tone="waiting">{wsNotNeeded(DECISION_OPTION_LABELS[r.option], r.confirmed)}</Status>;
      left = meta(wt('ws.rd.nothingBuilt'));
      action = <ActionLink href={toolHref(tile, 'design')} data-tile-action="open-decision">{programNextLabel({ kind: 'open-decision', key: 'design', run: false })}</ActionLink>;
      break;
    case 'waits':
      status = <Status tone="waiting">{wt('ws.rd.waits')}</Status>;
      left = meta(wt('ws.rd.startsInDesign'));
      action = meta(wt('ws.rd.afterRun'));
      break;
    case 'not-started':
      status = <Status tone="waiting">{wt('ws.rd.notStarted')}</Status>;
      left = meta(wt('ws.rd.startsInDesign'));
      action = <ActionLink href={toolHref(tile, 'design')} data-tile-action="start-redesign">{programNextLabel({ kind: 'start-redesign', key: 'design', run: false })}</ActionLink>;
      break;
    case 'step':
      status = <Status tone="moving">{wsRedesignStep(TOOL_LABEL[r.key], r.index + 1)}</Status>;
      left = <Track marks={tile.track} />;
      action = <ActionLink href={toolHref(tile, r.key)} data-tile-action="continue">{programNextLabel({ kind: 'continue', key: r.key, run: false })}</ActionLink>;
      break;
    case 'delivered':
      status = <Status tone="signed">{wsDeliveredOn(r.on)}</Status>;
      left = <Track marks={tile.track} />;
      action = <ActionLink href={toolHref(tile, 'delivery')} data-tile-action="open-delivery">{programNextLabel({ kind: 'open-delivery', key: 'delivery', run: false })}</ActionLink>;
      break;
  }
  return (
    <ProductRow name={wt('ws.tile.redesign')} product="redesign" status={status}>
      {left}
      {tile.access === 'own' ? action : null}
    </ProductRow>
  );
}

function ProductRow({
  name,
  product,
  status,
  children,
}: {
  name: string;
  product: 'analyse' | 'redesign';
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-tile-product={product} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-4 py-3 [&+&]:border-t [&+&]:border-cc-line">
      <span className="text-[11px] font-bold tracking-[0.08em] text-cc-ink-muted uppercase">{name}</span>
      <div className="flex min-w-0 flex-col">{status}</div>
      <div className="col-start-2 flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function Facts({ tile, lens }: { tile: ProgramTile; lens: WorkspaceLens }) {
  const cell = (key: WorkspaceLens, value: React.ReactNode, label: React.ReactNode) => (
    <div
      data-tile-fact={key}
      data-lens-on={lens === key ? 'true' : undefined}
      className={
        'min-w-0 px-2 py-2 first:rounded-l-[8px] last:rounded-r-[8px] [&+&]:border-l [&+&]:border-cc-line ' +
        (lens === key ? 'bg-cc-surface-muted shadow-[inset_0_-2px_0_var(--cc-ink)]' : '')
      }
    >
      <div className="text-[15px] leading-[1.3] font-bold break-words text-cc-ink tabular-nums">{value}</div>
      <div className="text-[12px] leading-[1.3] font-medium break-words text-cc-ink-muted">{label}</div>
    </div>
  );
  const d = tile.decision;
  return (
    <div className="mx-4 mt-3 grid grid-cols-[minmax(0,.85fr)_minmax(0,.8fr)_minmax(0,1.35fr)] rounded-cc-row border border-cc-line">
      {cell('business', tile.steps === null ? wt('ws.fact.pending') : wsSteps(tile.steps), wt('ws.fact.steps'))}
      {cell(
        'it',
        tile.score === null ? (
          wt('ws.fact.pending')
        ) : (
          <>
            {tile.score}
            <span className="text-[12px] font-semibold text-cc-ink-muted">/100</span>
          </>
        ),
        wt('ws.fact.score'),
      )}
      {cell(
        'management',
        d ? DECISION_OPTION_LABELS[d.option] : wt('ws.fact.noDecision'),
        d ? (
          <>
            <span className="max-[600px]:hidden">{d.confirmed ? wt('ws.fact.confirmed') : wt('ws.fact.proposed')}</span>
            <span className="min-[601px]:hidden">{d.confirmed ? wt('ws.fact.confirmedShort') : wt('ws.fact.proposedShort')}</span>
          </>
        ) : (
          wt('ws.fact.proposed')
        ),
      )}
    </div>
  );
}

function ProgramTileCard({ tile, lens, actions }: { tile: ProgramTile; lens: WorkspaceLens; actions?: RowActionHandlers }) {
  const titleId = `tile-${tile.id}`;
  return (
    <article
      aria-labelledby={titleId}
      data-program-tile={tile.id}
      className="flex h-full min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
    >
      <div className="flex min-w-0 flex-col gap-1 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 id={titleId} className="m-0 min-w-0 text-[15px] leading-[1.35] font-bold text-cc-ink">
            <Link href={tile.href} className="no-underline hover:underline" data-workspace-open={tile.id} data-tile-title={tile.titleIsProcess ? 'process' : 'project'}>
              {tile.title}
            </Link>
          </h3>
          {actions ? <WorkspaceRowActions id={tile.id} name={tile.projectName} href={tile.href} owner handlers={actions} compact /> : null}
        </div>
        {tile.titleIsProcess ? (
          <span className="truncate text-[12px] font-medium text-cc-ink-muted" data-tile-project-name="">
            {tile.projectName}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {tile.objectName ? <span className="font-cc-mono text-[12px] font-medium text-cc-ink">{tile.objectName}</span> : null}
          {tile.lines !== null ? (
            <span className="text-[12px] font-semibold text-cc-ink-muted">
              {tile.objectName ? '· ' : ''}
              {homeExampleLines(formatNumber(tile.lines) ?? String(tile.lines))}
            </span>
          ) : null}
          {tile.example ? (
            <span className="inline-flex rounded-full border border-cc-line px-2 text-[12px] leading-5 font-semibold text-cc-ink-muted">
              {wt('ws.tile.example')}
            </span>
          ) : null}
        </div>
      </div>
      <MapThumb thumb={tile.thumb} objectName={tile.objectName ?? tile.title} steps={tile.steps} className="mx-4 mt-1 h-[96px] min-[601px]:h-[118px]" />
      <Facts tile={tile} lens={lens} />
      <div className="mt-3 border-t border-cc-line">
        <AnalyseLine tile={tile} />
        <RedesignLine tile={tile} />
      </div>
    </article>
  );
}

function StartTile({ userId, profile, onMore }: { userId: string; profile: UserProfile | null; onMore: () => void }) {
  return (
    <article
      aria-labelledby="tile-new"
      data-start-tile=""
      className="flex h-full min-w-0 flex-col gap-3 rounded-cc-card border-[1.5px] border-dashed border-cc-field-border bg-cc-surface-muted px-4 py-4"
    >
      <ProductMark product="analyse" />
      <h3 id="tile-new" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
        {wt('ws.newTile')}
      </h3>
      <StarterExamples userId={userId} account={profile} variant="tile" onMore={onMore} />
      <div className="flex flex-col gap-2">
        <OwnCodeWay profile={profile} compact />
        <span className="text-[12px] font-medium text-cc-ink-muted">{wsQuotaLine(runsLeftLabel(profile))}</span>
      </div>
    </article>
  );
}

function CountTile({
  filter,
  active,
  onPress,
  label,
  value,
  note,
  of,
  tone,
}: {
  filter: TileFilter;
  active: boolean;
  onPress: (f: TileFilter) => void;
  label: string;
  value: number;
  note: string;
  of: number;
  tone: 'ink' | 'success' | 'warning';
}) {
  const segments = Math.max(1, Math.min(of, 10));
  const filled = of === 0 ? 0 : Math.round((value / of) * segments);
  return (
    <button
      type="button"
      onClick={() => onPress(filter)}
      aria-pressed={filter === 'all' ? undefined : active}
      data-kpi={filter}
      className="group block min-w-0 cursor-pointer rounded-cc-card text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
    >
      {/* The count's surface sits on its inner span, not on the button (DESIGN.md §1.5, as the fact charts' rows). */}
      <span
        className={
          'flex h-full min-w-0 flex-col gap-1 rounded-cc-card border bg-cc-surface px-3 py-3 shadow-cc min-[601px]:px-4 min-[601px]:py-4 ' +
          (active ? 'border-cc-ink shadow-[inset_0_0_0_1px_var(--cc-ink)]' : 'border-cc-line')
        }
      >
      <span className="text-[12px] leading-[1.3] font-semibold text-cc-ink-muted min-[601px]:truncate">{label}</span>
      <span className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em] text-cc-ink tabular-nums">{value}</span>
      <span className="text-[12px] leading-[1.3] font-medium break-words text-cc-ink-muted max-[600px]:hidden">{note}</span>
      <span aria-hidden={true} className="mt-2 flex h-1 gap-px max-[600px]:hidden">
        {Array.from({ length: segments }, (_, i) => (
          <i
            key={i}
            className={
              'flex-1 rounded-[2px] ' +
              (i < filled ? (tone === 'success' ? 'bg-cc-success' : tone === 'warning' ? 'bg-cc-warning-mark' : 'bg-cc-ink') : 'bg-cc-line')
            }
          />
        ))}
      </span>
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  label,
  labelledBy,
  value,
  options,
  onChange,
  dataName,
}: {
  label?: string;
  labelledBy?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  onChange: (v: T) => void;
  dataName: string;
}) {
  return (
    <span
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className="inline-flex rounded-cc-row border border-cc-field-border bg-cc-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          {...{ [`data-${dataName}`]: o.value }}
          className="group inline-flex cursor-pointer rounded-[6px] text-[13px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
        >
          {/* The chosen option's surface sits on its inner span, not on the button (DESIGN.md §1.5). */}
          <span
            className={
              'inline-flex min-h-8 items-center gap-1 rounded-[6px] px-3 pointer-coarse:min-h-11 ' +
              (value === o.value ? 'bg-cc-ink text-cc-on-dark' : 'text-cc-ink-muted')
            }
          >
            {o.label}
          </span>
        </button>
      ))}
    </span>
  );
}

export default function WorkspaceTiles({
  userId,
  profile,
  tiles,
  sharedCount,
  openInvitations,
  lens,
  onLens,
  mode,
  onMode,
  list,
  sharing,
  actionsFor,
  notices,
}: {
  userId: string;
  profile: UserProfile | null;
  /** The account's own programs. */
  tiles: ProgramTile[];
  sharedCount: number;
  /** Invitations this account sent that nobody answered yet; `null` while unknown. */
  openInvitations: number | null;
  lens: WorkspaceLens;
  onLens: (lens: WorkspaceLens) => void;
  mode: WorkspaceMode;
  onMode: (mode: WorkspaceMode) => void;
  /** The list mode (direction B's table), rendered by the page only when it is chosen. */
  list: React.ReactNode;
  /** The sharing section, shown behind "Sharing". */
  sharing: React.ReactNode;
  actionsFor: (tile: ProgramTile) => RowActionHandlers | undefined;
  /** What the page must say above everything (the runs are spent, an action failed). */
  notices?: React.ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<TileFilter>('all');
  const [startOpen, setStartOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const counts = useMemo(() => tileCounts(tiles), [tiles]);
  const shown = useMemo(
    () => [...tiles].sort((a, b) => b.sortKey.localeCompare(a.sortKey)).filter((t) => tileMatches(t, filter)),
    [tiles, filter],
  );
  const { next, alsoWaiting } = useMemo(() => nextStepOf(tiles), [tiles]);
  const press = (f: TileFilter) => setFilter((cur) => (cur === f || f === 'all' ? 'all' : f));

  const openStart = () => {
    setStartOpen(true);
    requestAnimationFrame(() => document.getElementById('ws-start-panel')?.scrollIntoView({ block: 'nearest' }));
  };

  // "Re-design a program": the one program a re-design waits on, or the analysed ones to choose from.
  const redesignProgram = () => {
    const candidates = tiles.filter((t) => t.access === 'own' && (t.redesign.kind === 'step' || t.redesign.kind === 'not-started'));
    if (candidates.length === 1) {
      const t = candidates[0];
      router.push(toolHref(t, t.redesign.kind === 'step' ? t.redesign.key : 'design'));
      return;
    }
    setFilter('analysed');
    requestAnimationFrame(() => document.getElementById('ws-programs-title')?.scrollIntoView({ block: 'start' }));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 pb-6 min-[601px]:gap-6" data-workspace-tiles="">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] font-semibold text-cc-ink-muted">{wsWelcomeBack(profile?.firstName)}</p>
          <h1 className="cc-text-title m-0 text-cc-ink">{t('workspace.title')}</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 min-[601px]:flex min-[601px]:w-auto min-[601px]:flex-wrap">
          <CcButton
            variant="secondary"
            density="cozy"
            icon={<Workflow size={14} aria-hidden={true} />}
            onClick={() => (startOpen ? setStartOpen(false) : openStart())}
            aria-expanded={startOpen}
            aria-controls="ws-start-panel"
            data-ws-analyse-another=""
          >
            <span className="max-[600px]:hidden">{wt('ws.analyseAnother')}</span>
            <span className="min-[601px]:hidden">{wt('ws.analyseAnotherShort')}</span>
          </CcButton>
          <CcButton variant="secondary" density="cozy" icon={<Wrench size={14} aria-hidden={true} />} onClick={redesignProgram} data-ws-redesign-program="">
            {wt('ws.redesignProgram')}
          </CcButton>
        </div>
      </div>

      {startOpen ? (
        <section
          id="ws-start-panel"
          aria-label={wt('ws.startPanel')}
          data-ws-start-panel=""
          className="grid grid-cols-1 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc min-[901px]:grid-cols-2"
        >
          <div data-home-way="example" className="flex min-w-0 flex-col px-4 py-3 min-[601px]:px-5 min-[601px]:py-4">
            <StarterExamples userId={userId} account={profile} variant="home" homePrimary={false} />
          </div>
          <div className="min-w-0 border-t border-cc-line px-4 py-3 min-[601px]:px-5 min-[601px]:py-4 min-[901px]:border-t-0 min-[901px]:border-l">
            <OwnCodeWay profile={profile} idPrefix="ws" />
          </div>
        </section>
      ) : null}

      {notices}

      {next ? (
        <section aria-labelledby="ws-next" data-ws-next={next.kind} className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
          <div className="grid grid-cols-1 items-center gap-3 px-4 py-4 min-[601px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[601px]:gap-4 min-[601px]:px-5 min-[601px]:py-4">
            <MapThumb
              thumb={next.tile.thumb}
              objectName={next.tile.objectName ?? next.tile.title}
              steps={next.tile.steps}
              className="h-16 w-[120px] max-[600px]:hidden"
            />
            <div className="min-w-0">
              <span id="ws-next" className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                {wt('ws.nextStep')}
              </span>
              <b className="block text-[15px] font-bold text-cc-ink">
                {wsNextTitle(next.tile.title, next.kind, next.kind === 'continue' ? TOOL_LABEL[next.key] : '')}
              </b>
              <span className="text-[13px] font-medium text-cc-ink-muted">
                {next.kind === 'continue'
                  ? wsNextBody(
                      REDESIGN_KEYS.filter((k, i) => next.tile.track[i] === 'done').map((k) => TOOL_LABEL[k]),
                      wt(`home.path.${next.key}`),
                    )
                  : next.kind === 'rerun'
                    ? wsNextBodyRerun()
                    : next.kind === 'start-redesign'
                      ? wsNextBodyStart()
                      : wsNextBodyAnalyse()}
              </span>
            </div>
            <CcLinkButton
              href={
                next.kind === 'continue'
                  ? toolHref(next.tile, next.key)
                  : next.kind === 'start-redesign'
                    ? toolHref(next.tile, 'design')
                    : `${next.tile.href}/analyze`
              }
              variant="primary"
              density="cozy"
              data-ws-next-go=""
            >
              {programNextLabel(programNextStep(next.tile))}
              <ArrowRight size={14} aria-hidden={true} />
            </CcLinkButton>
          </div>
          {alsoWaiting ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-cc-line px-4 py-3 text-[13px] font-medium text-cc-ink-muted min-[601px]:px-5">
              <Status tone="outdated">{wt('ws.alsoWaiting')}</Status>
              <span>{wsAlsoWaiting(alsoWaiting.title, alsoWaiting.analyse.kind === 'stale')}</span>
              <ActionLink href={`${alsoWaiting.href}/analyze`} data-ws-also-go="">
                {programNextLabel(programNextStep(alsoWaiting))}
              </ActionLink>
            </div>
          ) : null}
        </section>
      ) : null}

      {tiles.length >= COUNTS_FROM ? (
        <section aria-labelledby="ws-glance" data-ws-glance="">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 min-[601px]:mb-3">
            <h2 id="ws-glance" className="m-0 text-[15px] font-bold text-cc-ink">
              {wt('ws.atAGlance')}
            </h2>
            <span className="text-[12px] font-semibold text-cc-ink-muted">{wsChangedThisWeek(counts.changedThisWeek)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 min-[601px]:grid-cols-5 min-[601px]:gap-3">
            <CountTile filter="all" active={false} onPress={press} label={wt('ws.kpi.all')} value={counts.all} note={wt('ws.kpi.allNote')} of={counts.all} tone="ink" />
            <CountTile
              filter="analysed"
              active={filter === 'analysed'}
              onPress={press}
              label={wt('ws.kpi.analysed')}
              value={counts.analysed}
              note={counts.outOfDate > 0 ? wsOutOfDate(counts.outOfDate) : wt('ws.kpi.analysedNote')}
              of={counts.all}
              tone="ink"
            />
            <CountTile
              filter="redesign"
              active={filter === 'redesign'}
              onPress={press}
              label={wt('ws.kpi.redesign')}
              value={counts.redesign}
              note={counts.redesign > 0 ? wsToolsAt(counts.redesignAt.map((k) => TOOL_LABEL[k])) : wt('ws.kpi.redesignNone')}
              of={counts.all}
              tone="ink"
            />
            <CountTile
              filter="delivered"
              active={filter === 'delivered'}
              onPress={press}
              label={wt('ws.kpi.delivered')}
              value={counts.delivered}
              note={counts.deliveredLatest ?? wt('ws.kpi.deliveredNone')}
              of={counts.all}
              tone="success"
            />
            <CountTile
              filter="attention"
              active={filter === 'attention'}
              onPress={press}
              label={wt('ws.kpi.attention')}
              value={counts.attention}
              note={counts.attention > 0 ? wt('ws.kpi.attentionNote') : wt('ws.kpi.attentionNone')}
              of={counts.all}
              tone="warning"
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ws-programs-title" data-workspace-projects="">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 min-[601px]:mb-3">
          <div className="flex items-baseline gap-2">
            <h2 id="ws-programs-title" className="m-0 scroll-mt-4 text-[15px] font-bold text-cc-ink">
              {wt('ws.yourPrograms')}
            </h2>
            <span className="text-[13px] font-semibold text-cc-ink-muted" data-ws-count="">
              {wsProgramsCount(shown.length, tiles.length)}
              {filter !== 'all' ? (
                <>
                  {' · '}
                  <button type="button" className={HOME_LINK} onClick={() => setFilter('all')} data-ws-show-all="">
                    {wt('ws.showAll')}
                  </button>
                </>
              ) : null}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 min-[601px]:gap-3">
            <span id="ws-lens-label" className="text-[12px] font-semibold text-cc-ink-muted">
              {wt('ws.readAs')}
            </span>
            <Segmented<WorkspaceLens>
              labelledBy="ws-lens-label"
              value={lens}
              onChange={onLens}
              dataName="lens"
              options={[
                { value: 'business', label: wt('ws.lens.business') },
                { value: 'it', label: wt('ws.lens.it') },
                { value: 'management', label: wt('ws.lens.management') },
              ]}
            />
            {/* Hidden on a phone, where the tiles are the view — except while the list is on: the mode is
                remembered per browser, and a list chosen in a wider window needs its way back here too. */}
            <span className={mode === 'list' ? undefined : 'max-[600px]:hidden'} data-ws-mode-switch="">
              <Segmented<WorkspaceMode>
                label={wt('ws.showAs')}
                value={mode}
                onChange={onMode}
                dataName="mode"
                options={[
                  { value: 'tiles', label: <><LayoutGrid size={14} aria-hidden={true} /> {wt('ws.tiles')}</> },
                  { value: 'list', label: <><List size={14} aria-hidden={true} /> {wt('ws.list')}</> },
                ]}
              />
            </span>
          </div>
        </div>
        {mode === 'list' ? (
          list
        ) : shown.length === 0 && filter !== 'all' ? (
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('ws.noMatch')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 min-[601px]:grid-cols-2 min-[601px]:gap-4 min-[1181px]:grid-cols-3" data-ws-tiles="">
            {shown.map((tile) => (
              <ProgramTileCard key={tile.id} tile={tile} lens={lens} actions={actionsFor(tile)} />
            ))}
            {filter === 'all' ? <StartTile userId={userId} profile={profile} onMore={openStart} /> : null}
          </div>
        )}
      </section>

      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
        <span>{wsSharedLine(sharedCount, openInvitations)}</span>
        <button type="button" className={HOME_LINK} aria-expanded={sharingOpen} onClick={() => setSharingOpen((v) => !v)} data-ws-sharing="">
          {wt('ws.sharing')}
          <ArrowRight size={14} aria-hidden={true} />
        </button>
        <span aria-hidden={true}>·</span>
        <span>{wt('ws.portfolio')}</span>
        <Link href="/portfolio" className={HOME_LINK} data-workspace-portfolio="">
          {wt('portfolio.entry')}
          <ArrowRight size={14} aria-hidden={true} />
        </Link>
      </p>
      {sharingOpen ? sharing : null}
    </div>
  );
}
