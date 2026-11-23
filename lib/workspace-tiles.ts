import type { Project } from '@/lib/types';
import { PHASE_KEYS, PHASES, staleness, workflowSteps, nextPhaseKey, toolOnRecord, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import { DECISION_OPTION_LABELS, optionOfArchitecture, type DecisionOption } from '@/lib/decision-options';
import { wsContinue, wsDeliveredOn, wsNotNeeded, wt } from '@/lib/workspace-messages';
import { ATTENTION_LABEL } from '@/lib/home-status';
import { countSourceLines } from '@/lib/source-lines';
import { summaryOf } from '@/lib/project-summary';
import { isoDate } from '@/lib/workspace-rows';

/**
 * A returning account's "My workspace" as tiles — the model (ADR-123 (4),
 * mock-up `docs/roadmap/workspace-two-products-mockup.html`, direction A).
 *
 * Every figure on a tile comes from the project document of the one projects
 * query and the server-written summary on it (`lib/project-summary.ts`) — no
 * request per tile. Each program carries both products: *Analyse* (where its
 * analysis stands) and *Re-design* (where the six tools after it stand, or that
 * none is needed because the decision builds nothing, W5). The phases come
 * from `workflowSteps()`, the one contract every other screen reads; nothing
 * here reads `project.status`.
 *
 * Green is earned: only a signed run (Analyse) and a handed-over delivery
 * (Re-design) are drawn green, as everywhere (`DESIGN.md`).
 *
 * Pure: no React, no Firestore.
 */

export type ListedProject = Project & { id: string };

/** The six tools of Re-design, in the tool bar's order. */
export const REDESIGN_KEYS: readonly PhaseKey[] = PHASE_KEYS.filter((key) => key !== 'analyze');

export type AnalyseState =
  | { kind: 'signed'; on: string | null }
  | { kind: 'stale' }
  | { kind: 'not-analysed' }
  | { kind: 'no-code' };

export type RedesignState =
  | { kind: 'not-needed'; option: DecisionOption; confirmed: boolean }
  | { kind: 'waits' }
  | { kind: 'not-started' }
  | { kind: 'step'; index: number; key: PhaseKey }
  | { kind: 'delivered'; on: string | null };

/** One segment of the six-segment Re-design track. */
export type TrackMark = 'done' | 'now' | 'todo' | 'signed';

export interface ProgramTile {
  id: string;
  access: 'own' | 'shared';
  /** What the tile is called: the process's business name where the summary carries one, else the project's name. */
  title: string;
  /** The project's name — what Delete and Invite name; shown small under a business name (owner decision 14.11.2026). */
  projectName: string;
  /** True when `title` is the business name of the process, not the project's name. */
  titleIsProcess: boolean;
  /** The program's own name (from the analysed file), when it says more than the project's name. */
  objectName: string | null;
  lines: number | null;
  example: boolean;
  href: string;
  /** The summary's thumbnail and figures, `null` where the project has none for its active run. */
  thumb: string | null;
  steps: number | null;
  score: number | null;
  decision: { option: DecisionOption; confirmed: boolean } | null;
  analyse: AnalyseState;
  redesign: RedesignState;
  track: TrackMark[];
  /** ISO date of the last change, for "changed in the last 7 days" and the list's order. */
  lastChange: string | null;
  /** Shown first: the project's last change, newest on top. */
  sortKey: string;
}

const dayLabel = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
};

/** The decision on record: the architect's confirmed target first, else the run's proposal (W5). */
export function decisionOf(project: Project, recommendation: string | null): ProgramTile['decision'] {
  const confirmed = optionOfArchitecture(project.targetArchitecture);
  if (confirmed && project.approvedByArchitect === true) return { option: confirmed, confirmed: true };
  if (confirmed) return { option: confirmed, confirmed: false };
  // The run recommends a route (`originalRecommendation`: a code route's name, or `keyuser`) — every route the
  // engine recommends rebuilds; Keep, Move to SAP standard and Retire are decided in Design, never proposed by it.
  const proposed = optionOfArchitecture(recommendation) ?? (recommendation ? 'rebuild' : null);
  return proposed ? { option: proposed, confirmed: false } : null;
}

export function toProgramTile(project: ListedProject, access: 'own' | 'shared' = 'own'): ProgramTile {
  const rail = workflowSteps(project);
  const byKey = new Map(rail.map((s) => [s.key, s] as const));
  const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
  const hasSource = source.trim().length > 0;
  const hasRun = typeof project.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const summary = summaryOf(project);
  const fingerprint = project.auditMetadata?.inputFingerprint;
  const lines = typeof fingerprint?.lineCount === 'number' ? fingerprint.lineCount : hasSource ? countSourceLines(source) : null;
  const objectName = typeof fingerprint?.fileName === 'string' && fingerprint.fileName ? fingerprint.fileName.replace(/\.[^.]+$/, '') : null;

  const s = staleness(project);
  const analyseStep = byKey.get('analyze');
  const analyse: AnalyseState = !hasSource && !hasRun
    ? { kind: 'no-code' }
    : !hasRun
      ? { kind: 'not-analysed' }
      : s.sourceChanged || analyseStep?.state === 'stale'
        ? { kind: 'stale' }
        : { kind: 'signed', on: dayLabel(project.auditMetadata?.modelCard?.analysisTimestamp ?? fingerprint?.uploadedAt) };

  const decision = hasRun ? decisionOf(project, summary?.recommendation ?? null) : null;
  const steps6 = REDESIGN_KEYS.map((k) => byKey.get(k)).filter((x): x is RailStep => !!x);
  const delivery = byKey.get('delivery');
  const delivered = delivery?.state === 'done' && !!project.auditMetadata?.auditPackExportedAt;
  const started = steps6.some((st) => toolOnRecord(st));
  const nextKey = nextPhaseKey(rail);

  let redesign: RedesignState;
  if (decision && decision.option !== 'rebuild') redesign = { kind: 'not-needed', option: decision.option, confirmed: decision.confirmed };
  else if (analyse.kind !== 'signed') redesign = { kind: 'waits' };
  else if (delivered) redesign = { kind: 'delivered', on: dayLabel(project.auditMetadata?.auditPackExportedAt) };
  else if (!started) redesign = { kind: 'not-started' };
  else {
    const key = nextKey && nextKey !== 'analyze' ? nextKey : 'delivery';
    redesign = { kind: 'step', index: Math.max(0, REDESIGN_KEYS.indexOf(key)), key };
  }

  const track: TrackMark[] = REDESIGN_KEYS.map((key, i) => {
    if (redesign.kind === 'delivered') return 'signed';
    const st = byKey.get(key);
    if (redesign.kind === 'step' && i === redesign.index) return 'now';
    return st && st.state === 'done' ? 'done' : 'todo';
  });

  const lastChange = isoDate(project.updatedAt) ?? isoDate(project.createdAt);
  const processTitle = summary?.processTitle ?? null;
  const titleIsProcess = !!processTitle && processTitle !== project.name;
  return {
    id: project.id,
    access,
    title: titleIsProcess ? processTitle! : project.name,
    projectName: project.name,
    titleIsProcess,
    objectName: objectName && objectName !== project.name ? objectName : null,
    lines,
    example: project.fromExample === true,
    href: `/project/${encodeURIComponent(project.id)}`,
    thumb: summary?.mapThumb ?? null,
    steps: summary?.mapSteps ?? null,
    score: summary?.cleanCoreScore ?? null,
    decision,
    analyse,
    redesign,
    track,
    lastChange,
    sortKey: lastChange ?? '',
  };
}

/* ------------------------------------------------------------------ attention and next step, one source */

/**
 * Why a program needs attention — the one definition both modes read (owner decision 22.11.2026): the code changed
 * since the analysis, or nobody analysed it yet. The count tile, its filter, the list mode's "Needs your attention"
 * box and its Status filter all ask this function; each row names its reason with {@link ATTENTION_REASON_LABEL}.
 * A program with no code at all is not "waiting": there is nothing to analyse yet.
 */
export type ProgramAttention = 'code-changed' | 'not-analysed';

export function attentionOf(tile: Pick<ProgramTile, 'analyse'>): ProgramAttention | null {
  if (tile.analyse.kind === 'stale') return 'code-changed';
  if (tile.analyse.kind === 'not-analysed') return 'not-analysed';
  return null;
}

export function needsAttention(tile: Pick<ProgramTile, 'analyse'>): boolean {
  return attentionOf(tile) !== null;
}

export const ATTENTION_REASON_LABEL: Readonly<Record<ProgramAttention, string>> = Object.freeze({
  'code-changed': ATTENTION_LABEL['code-changed'],
  'not-analysed': wt('ws.an.notAnalysed'),
});

export type ProgramNextKind = 'add-code' | 'analyse' | 'rerun' | 'start-redesign' | 'continue' | 'open-decision' | 'open-delivery';

/** A program's own next step: what it does and the tool it opens. */
export interface ProgramNext {
  kind: ProgramNextKind;
  key: PhaseKey;
  /** The step is an analysis run: a caller starts it through the confirmation dialog, never directly. */
  run: boolean;
}

/**
 * The one next step of one program — the same on its tile, in the list mode's Next step column and on the page's
 * Next step card (owner decision 22.11.2026). The analysis comes first while it is missing or out of date; on a
 * signed one, the Re-design product's action: start it, continue at its tool, open the decision that builds nothing
 * (W5), or open the signed delivery.
 */
export function programNextStep(tile: Pick<ProgramTile, 'analyse' | 'redesign'>): ProgramNext {
  const a = tile.analyse;
  if (a.kind === 'no-code') return { kind: 'add-code', key: 'analyze', run: false };
  if (a.kind === 'not-analysed') return { kind: 'analyse', key: 'analyze', run: true };
  if (a.kind === 'stale') return { kind: 'rerun', key: 'analyze', run: true };
  const r = tile.redesign;
  switch (r.kind) {
    case 'not-needed':
      return { kind: 'open-decision', key: 'design', run: false };
    case 'delivered':
      return { kind: 'open-delivery', key: 'delivery', run: false };
    case 'step':
      return { kind: 'continue', key: r.key, run: false };
    default:
      // 'not-started' — and 'waits', which a signed analysis never has.
      return { kind: 'start-redesign', key: 'design', run: false };
  }
}

const TOOL_LABEL = Object.fromEntries(PHASES.map((p) => [p.key, p.label])) as Record<PhaseKey, string>;

/** The words of a next step — the tile's action, the list's link and the Next step card's button say the same. */
export function programNextLabel(next: ProgramNext): string {
  switch (next.kind) {
    case 'add-code':
      return wt('ws.an.addCode');
    case 'analyse':
      return wt('ws.an.run');
    case 'rerun':
      return wt('ws.an.rerun');
    case 'start-redesign':
      return wt('ws.rd.start');
    case 'continue':
      return wsContinue(TOOL_LABEL[next.key]);
    case 'open-decision':
      return wt('ws.rd.openDecision');
    case 'open-delivery':
      return wt('ws.rd.openDelivery');
  }
}

/** The list mode's Next step cell for a program: the link, the route under the project, and the line under it. */
export interface ProgramNextLink {
  label: string;
  tool: string;
  path: string;
  run: boolean;
  /** Said under the link instead of "in {tool}": the decision that builds nothing, or the signed delivery. */
  note: string | null;
}

export function programNextLink(tile: Pick<ProgramTile, 'analyse' | 'redesign'>): ProgramNextLink {
  const next = programNextStep(tile);
  const r = tile.redesign;
  const note =
    next.kind === 'open-decision' && r.kind === 'not-needed'
      ? wsNotNeeded(DECISION_OPTION_LABELS[r.option], r.confirmed)
      : next.kind === 'open-delivery' && r.kind === 'delivered'
        ? wsDeliveredOn(r.on)
        : null;
  return { label: programNextLabel(next), tool: TOOL_LABEL[next.key], path: next.key, run: next.run, note };
}

/* ------------------------------------------------------------------ counts and filter */

export type TileFilter = 'all' | 'analysed' | 'redesign' | 'delivered' | 'attention';

export const TILE_FILTERS: readonly TileFilter[] = ['all', 'analysed', 'redesign', 'delivered', 'attention'];

export function tileMatches(tile: ProgramTile, filter: TileFilter): boolean {
  switch (filter) {
    case 'analysed':
      return tile.analyse.kind === 'signed';
    case 'redesign':
      return tile.redesign.kind === 'step';
    case 'delivered':
      return tile.redesign.kind === 'delivered';
    case 'attention':
      return needsAttention(tile);
    default:
      return true;
  }
}

export interface TileCounts {
  all: number;
  analysed: number;
  /** Analysed once, but the code changed since. */
  outOfDate: number;
  redesign: number;
  /** The tools the programs in re-design stand at, in the tool bar's order. */
  redesignAt: PhaseKey[];
  delivered: number;
  /** The newest delivered program's title. */
  deliveredLatest: string | null;
  attention: number;
  /** Programs changed in the last seven days. */
  changedThisWeek: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function tileCounts(tiles: readonly ProgramTile[], now: Date = new Date()): TileCounts {
  const delivered = tiles.filter((t) => t.redesign.kind === 'delivered');
  const at = new Set<PhaseKey>();
  for (const t of tiles) if (t.redesign.kind === 'step') at.add(t.redesign.key);
  return {
    all: tiles.length,
    analysed: tiles.filter((t) => tileMatches(t, 'analysed')).length,
    outOfDate: tiles.filter((t) => t.analyse.kind === 'stale').length,
    redesign: tiles.filter((t) => tileMatches(t, 'redesign')).length,
    redesignAt: REDESIGN_KEYS.filter((k) => at.has(k)),
    delivered: delivered.length,
    deliveredLatest: [...delivered].sort((a, b) => b.sortKey.localeCompare(a.sortKey))[0]?.title ?? null,
    attention: tiles.filter((t) => tileMatches(t, 'attention')).length,
    changedThisWeek: tiles.filter((t) => {
      if (!t.lastChange) return false;
      const ms = new Date(t.lastChange).getTime();
      return Number.isFinite(ms) && now.getTime() - ms <= WEEK_MS && ms <= now.getTime() + 60_000;
    }).length,
  };
}

/** From three programs on the counts are worth a row (W10); below, the tiles say it all. */
export const COUNTS_FROM = 3;

/* ------------------------------------------------------------------ next step */

export type NextStep =
  | { kind: 'continue'; tile: ProgramTile; key: PhaseKey }
  | { kind: 'start-redesign'; tile: ProgramTile }
  | { kind: 'rerun'; tile: ProgramTile }
  | { kind: 'analyse'; tile: ProgramTile };

/**
 * The one next step of the page: the newest re-design under way, else the newest analysed program a re-design
 * could start on, else the newest out-of-date analysis, else the newest program with code nobody analysed. Own
 * programs only — a shared one is read, not worked on. Also returned: one more program that waits (out of date or
 * not analysed), for the "Also waiting" line.
 */
export function nextStepOf(tiles: readonly ProgramTile[]): { next: NextStep | null; alsoWaiting: ProgramTile | null } {
  const own = [...tiles].filter((t) => t.access === 'own').sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  // Every program's own next step, from the one function its tile and its list row read (`programNextStep`).
  const steps = own.map((tile) => ({ tile, step: programNextStep(tile) }));
  const first = (kind: ProgramNextKind) => steps.find((s) => s.step.kind === kind) ?? null;
  let next: NextStep | null = null;
  const inStep = first('continue');
  if (inStep) next = { kind: 'continue', tile: inStep.tile, key: inStep.step.key };
  else {
    const pick = first('start-redesign') ?? first('rerun') ?? first('analyse');
    if (pick) next = { kind: pick.step.kind as 'start-redesign' | 'rerun' | 'analyse', tile: pick.tile };
  }
  const alsoWaiting = own.find((t) => needsAttention(t) && t.id !== next?.tile.id) ?? null;
  return { next, alsoWaiting };
}
