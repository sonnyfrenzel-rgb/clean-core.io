import { coverage, SCORE_MEANING, type ManagementView, type ScoreTrend } from './management-answers';
import { levelDistribution, type ItFindingsSource } from './it-findings';
import { LEVEL_OVERLAY_NOTE } from './process-overlays';
import {
  PUBLIC_CLOUD_FIT_BUCKETS,
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  TARGET_PLATFORM_LABELS,
  type PublicCloudFitAssignment,
  type PublicCloudFitBucket,
  type PublicCloudFitSummary,
  type TargetPlatform,
} from './abap/public-cloud-fit';
import {
  SELF_DECLARATION,
  decisionCoverage,
  type ConditionStatus,
  type DecisionGap,
  type DecisionGapCode,
  type DecisionStatus,
  type ProjectDecision,
} from './project-decision';
import type { ProvenanceValue } from './provenance';

/**
 * The Management overview — roadmap 3.0.10.
 *
 * *„Die Management-Sicht wird lesbar in Sekunden."* One sentence that answers
 * the view's question (*What do I risk, what do I decide?*), and under it at
 * most six cards, each opening with its own answer sentence as its title
 * (ADR-029). Five are built, one per point of the roadmap line:
 *
 *   (b) `buckets`   — the four buckets for the target platform, *not assigned*
 *                     as its own area, and what moves between Private and
 *                     Public Edition
 *   (c) `readiness` — the Clean Core Score over runs of **one** rule version;
 *                     every other version is a break, named and not drawn
 *   (d) `levels`    — the A–D distribution over the findings, Unknown as
 *                     *not determined*, in the state colours of §1.8
 *   (e) `blockers`  — what blocks the decision, an ordered list with evidence
 *                     per line
 *   (f) `decision`  — which decision is open and what it waits for
 *
 * **Nothing here computes a new figure.** Every number is read from a model
 * that already exists and already carries its honesty rules:
 * `managementAnswers()`/`scoreTrend()` (6.4), `resolvePublicCloudFit()` (6.7),
 * `levelDistribution()` (8.1), `decisionCoverage()` (8.4). This module sorts,
 * labels and words them. A figure that the underlying model does not have is
 * *not determined* with the reason the model gives, and a source that could not
 * be read is an `absent` card with its reason — never a chart of zeros.
 *
 * **Three limits no layout softens** (roadmap 3.0.10):
 *
 *   1. *Not determined* is its own segment of every chart and is never folded
 *      into another. `ChartSegment.notDetermined` marks it, and it is present
 *      in the segment list even when its count is zero, so the table under the
 *      chart always has the row.
 *   2. Every figure names its coverage — `coverage` on every ready card.
 *   3. No amount of money. Costs exist only in Economics, as a simulation with
 *      its assumptions revision; this overview has no cost card, and so no
 *      place a currency could appear in.
 *
 * **Management is a view, not a record.** Nothing here is stored, hashed or
 * signed; the module is pure (no React, no Firestore, no `fetch`), and the
 * component that feeds it only reads.
 */

/* ------------------------------------------------------------ inputs */

/** A source the component read — or did not, with the sentence why. */
export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'absent'; reason: string }
  | { state: 'ready'; value: T };

export interface FitResult {
  assignments: PublicCloudFitAssignment[];
  summary: PublicCloudFitSummary;
}

/**
 * The same findings resolved against both editions.
 *
 * Exact, not a projection: `resolvePublicCloudFit` reads only `objectName` and
 * `kind` of each finding, and neither depends on the deployment
 * `buildAbapEvidence` is given (it changes severity and wording only), so the
 * two results differ by the platform rule of `isKeepEligible` and nothing else.
 */
export interface FitByPlatform {
  /** The project's own target — `Project.s4Deployment`, `null` when none is set. */
  target: TargetPlatform | null;
  private: FitResult;
  public: FitResult;
}

/** What `GET /api/projects/{id}/decision` answers, as far as this overview reads it. */
export interface DecisionRead {
  draft: ProjectDecision;
  stored: (ProjectDecision & { status: DecisionStatus }) | null;
}

export interface OverviewSource {
  view: ManagementView;
  fit: Loaded<FitByPlatform>;
  findings: Loaded<ItFindingsSource>;
  decision: Loaded<DecisionRead>;
}

/* ----------------------------------------------------------- outputs */

/**
 * How a segment is painted. Two families and they never mix (§1.8): charts that
 * count states take `level-*`; every other chart takes `chart-*`. The *not
 * determined* area has its own tone in both — outlined and hatched, never a
 * state colour, never the colour of a real category.
 */
export type SegmentTone =
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'level-A'
  | 'level-B'
  | 'level-C'
  | 'level-D'
  | 'not-determined';

export interface ChartSegment {
  key: string;
  label: string;
  count: number;
  tone: SegmentTone;
  notDetermined: boolean;
}

/** The text every bar chart is also reachable as — `aria-label` on the bar. */
export function chartLabel(title: string, segments: readonly ChartSegment[]): string {
  return `${title}: ${segments.map((s) => `${s.label} ${s.count}`).join(', ')}.`;
}

interface CardBase {
  /** The answer sentence, the card's title (ADR-029). */
  title: string;
  /** An Einordnung that is easily misread stands here, never only in a popover. */
  lead: string | null;
  /** What the figures counted, out of what, and what they left out. */
  coverage: string;
}

export type OverviewCardState<T> =
  | { state: 'loading'; title: string }
  | { state: 'absent'; title: string; reason: string }
  | ({ state: 'ready' } & CardBase & T);

export interface BucketChart {
  platform: TargetPlatform;
  label: string;
  isTarget: boolean;
  segments: ChartSegment[];
  total: number;
}

export interface BucketMove {
  objectName: string;
  privateBucket: string;
  publicBucket: string;
}

export type BucketsCard = OverviewCardState<{
  charts: BucketChart[];
  moves: BucketMove[];
  moveSentence: string;
  notes: string[];
}>;

export interface TrendChartPoint {
  runId: string;
  /** `2026-09-15`, or `null` when the run records no time. */
  date: string | null;
  score: number;
}

export type ReadinessCard = OverviewCardState<{
  /** The axis label: the one rule version every point was measured on. */
  ruleVersion: string | null;
  points: TrendChartPoint[];
  /** Named, never drawn: a different rule is a different scale. */
  breaks: string[];
  /** Runs that cannot be placed — no score, or no complete rule version. */
  notDetermined: { count: number; sentence: string };
  sentence: string;
  provenance: ProvenanceValue;
}>;

export type LevelsCard = OverviewCardState<{
  segments: ChartSegment[];
  graded: number;
  note: string;
  provenance: ProvenanceValue;
}>;

export type BlockerScope = 'any' | 'public-edition';

export interface BlockerRow {
  key: string;
  /** 1-based, the order the list is read in. */
  rank: number;
  label: string;
  /** The evidence for this line, as a sentence. */
  evidence: string;
  scope: BlockerScope;
  provenance: ProvenanceValue;
}

export type BlockersCard = OverviewCardState<{
  rows: BlockerRow[];
  /** Sources that could not be read — named, so an empty list is not read as "nothing blocks". */
  unread: string[];
}>;

export interface ConditionTally {
  status: ConditionStatus;
  label: string;
  count: number;
}

export type DecisionOverviewCard = OverviewCardState<{
  identity: string;
  status: DecisionStatus;
  summary: string;
  /** What a confirmation waits for — the blocking gaps, then the open conditions. */
  waitsFor: string[];
  /** What qualifies it without blocking it. */
  qualifiers: string[];
  conditions: ConditionTally[];
  selfDeclaration: string;
}>;

export interface ManagementOverview {
  question: string;
  /** One answer to the view's question, above every card (roadmap 3.0.10 (a)). */
  headline: string;
  buckets: BucketsCard;
  readiness: ReadinessCard;
  levels: LevelsCard;
  blockers: BlockersCard;
  decision: DecisionOverviewCard;
}

/** The overview never carries more than this many cards (3.0.10 (a)). */
export const MAX_OVERVIEW_CARDS = 6;
export const OVERVIEW_CARD_ORDER = ['decision', 'blockers', 'readiness', 'buckets', 'levels'] as const;

/* ---------------------------------------------------------- helpers */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const BUCKET_TONE: Record<PublicCloudFitBucket, SegmentTone> = {
  retire: 'chart-1',
  'no-catalogued-path': 'chart-2',
  rebuild: 'chart-3',
  keep: 'chart-4',
};

const NOT_ASSIGNED_LABEL = 'Not assigned';

function bucketSegments(summary: PublicCloudFitSummary): ChartSegment[] {
  return [
    ...PUBLIC_CLOUD_FIT_BUCKETS.map((bucket) => ({
      key: bucket,
      label: PUBLIC_CLOUD_FIT_BUCKET_LABELS[bucket],
      count: summary.counts[bucket],
      tone: BUCKET_TONE[bucket],
      notDetermined: false,
    })),
    {
      key: 'not-assigned',
      label: NOT_ASSIGNED_LABEL,
      count: summary.counts.notAssigned,
      tone: 'not-determined' as SegmentTone,
      notDetermined: true,
    },
  ];
}

const bucketLabel = (a: PublicCloudFitAssignment | undefined) =>
  a?.bucket ? PUBLIC_CLOUD_FIT_BUCKET_LABELS[a.bucket] : NOT_ASSIGNED_LABEL;

/** Objects whose bucket differs between the two editions, by name. */
export function bucketMoves(fit: FitByPlatform): BucketMove[] {
  const pub = new Map(fit.public.assignments.map((a) => [a.objectName, a]));
  const moves: BucketMove[] = [];
  for (const a of fit.private.assignments) {
    const b = pub.get(a.objectName);
    if ((a.bucket ?? null) === (b?.bucket ?? null)) continue;
    moves.push({ objectName: a.objectName, privateBucket: bucketLabel(a), publicBucket: bucketLabel(b) });
  }
  return moves.sort((x, y) => x.objectName.localeCompare(y.objectName));
}

function bucketSentence(summary: PublicCloudFitSummary): string {
  const c = summary.counts;
  return (
    `${c.retire} retire, ${c.keep} keep, ${c.rebuild} rebuild, ${c['no-catalogued-path']} without a catalogued path` +
    `, ${c.notAssigned} not assigned`
  );
}

/* ------------------------------------------------------- (b) buckets */

export function bucketsCard(fit: Loaded<FitByPlatform>): BucketsCard {
  if (fit.state === 'loading') return { state: 'loading', title: 'Reading the four buckets…' };
  if (fit.state === 'absent') {
    return { state: 'absent', title: 'The four buckets are not determined', reason: fit.reason };
  }
  const f = fit.value;
  const charts: BucketChart[] = (['private', 'public'] as const).map((platform) => {
    const segments = bucketSegments(f[platform].summary);
    return {
      platform,
      label: TARGET_PLATFORM_LABELS[platform],
      isTarget: f.target === platform,
      segments,
      total: f[platform].assignments.length,
    };
  });
  // The target platform first, when there is one: it is the answer, the other
  // edition is the comparison.
  if (f.target === 'public') charts.reverse();

  const moves = bucketMoves(f);
  const total = f.private.assignments.length;
  const moveSentence =
    total === 0
      ? 'The engine named no object in the staged source, so nothing can move between the editions.'
      : moves.length === 0
        ? 'No object changes bucket between Private and Public Edition.'
        : `${plural(moves.length, 'object changes', 'objects change')} bucket between Private and Public Edition — ` +
          'the same level B is Keep in the Private Edition and not in the Public Edition.';

  const title =
    total === 0
      ? 'No object to sort: the engine named none in the staged source'
      : f.target
        ? `For ${TARGET_PLATFORM_LABELS[f.target]}: ${bucketSentence(f[f.target].summary)}`
        : `No target platform set — Private Edition: ${bucketSentence(f.private.summary)}; ` +
          `Public Edition: ${bucketSentence(f.public.summary)}`;

  const target = f.target ? f[f.target].summary : f.private.summary;
  const notAssigned = f.target ? target.counts.notAssigned : Math.max(
    f.private.summary.counts.notAssigned,
    f.public.summary.counts.notAssigned,
  );
  const cover = coverage(total - notAssigned, total, 'objects named in the staged source sorted into a bucket', [
    { count: notAssigned, why: 'not assigned — level unknown or catalog evidence missing, each with its reason below' },
  ]);

  const notes = [target.usageImportCaveat, target.noCatalogMatchNote].filter((n): n is string => Boolean(n));

  return {
    state: 'ready',
    title,
    lead: 'One rule per object, first match wins. A count of objects, never a share.',
    coverage: cover.sentence,
    charts,
    moves,
    moveSentence,
    notes,
  };
}

/* ----------------------------------------------------- (c) readiness */

export function readinessCard(trend: ScoreTrend): ReadinessCard {
  const points: TrendChartPoint[] = trend.points.map((p) => ({
    runId: p.runId,
    date: p.createdAt ? p.createdAt.slice(0, 10) : null,
    score: p.score,
  }));
  const breaks = trend.breaks.map(
    (b) => `${plural(b.runs, 'run', 'runs')} on rule version ${b.ruleVersion} — not drawn: a different rule is a different scale.`,
  );
  const undetermined = trend.withoutScore + trend.withoutRuleVersion;
  const notDetermined = {
    count: undetermined,
    sentence:
      undetermined === 0
        ? 'Every readable run of this project is either drawn or named as a break.'
        : [
            trend.withoutScore > 0 ? `${plural(trend.withoutScore, 'run', 'runs')} on this rule version with no score` : '',
            trend.withoutRuleVersion > 0
              ? `${plural(trend.withoutRuleVersion, 'run', 'runs')} with no complete rule version`
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
  };

  let title: string;
  if (trend.score === null) {
    title =
      trend.state === 'unreadable'
        ? 'Clean Core Score history not determined: the runs could not be read'
        : trend.state === 'no-run'
          ? 'No Clean Core Score: nothing has been analysed under a signature yet'
          : 'No Clean Core Score: the signed run records none';
  } else if (trend.state === 'trend') {
    const first = trend.points[0].score;
    const last = trend.points[trend.points.length - 1].score;
    const delta = last - first;
    title =
      delta === 0
        ? `Clean Core Score ${trend.score}, unchanged over ${plural(points.length, 'run', 'runs')} with the same rules`
        : `Clean Core Score ${trend.score}, ${delta > 0 ? 'up' : 'down'} from ${first} with the same rules`;
  } else if (trend.state === 'no-rule-version') {
    title = `Clean Core Score ${trend.score} — no history: the run records no complete rule version`;
  } else {
    title = `Clean Core Score ${trend.score} on one run — no history yet`;
  }

  return {
    state: 'ready',
    title,
    // The Einordnung stands under the title, never only in a popover (ADR-029).
    lead: `A grade, not a compliance percentage. ${SCORE_MEANING}`,
    coverage: trend.coverage.sentence,
    ruleVersion: trend.ruleVersion,
    points,
    breaks,
    notDetermined,
    sentence: trend.sentence,
    provenance: trend.score === null ? 'not-determined' : 'proven',
  };
}

/* -------------------------------------------------------- (d) levels */

const LEVEL_TONE: Record<'A' | 'B' | 'C' | 'D', SegmentTone> = {
  A: 'level-A',
  B: 'level-B',
  C: 'level-C',
  D: 'level-D',
};

export function levelsCard(findings: Loaded<ItFindingsSource>): LevelsCard {
  if (findings.state === 'loading') return { state: 'loading', title: 'Reading the clean core levels…' };
  if (findings.state === 'absent') {
    return { state: 'absent', title: 'Clean core levels not determined', reason: findings.reason };
  }
  const rows = findings.value.rows;
  const dist = levelDistribution(rows);
  const segments: ChartSegment[] = dist.slices.map((slice) =>
    slice.grade === 'Unknown'
      ? {
          key: 'Unknown',
          label: 'Not determined',
          count: slice.count,
          tone: 'not-determined',
          notDetermined: true,
        }
      : {
          key: slice.grade,
          label: `Level ${slice.grade}`,
          count: slice.count,
          tone: LEVEL_TONE[slice.grade],
          notDetermined: false,
        },
  );
  const by = (key: string) => segments.find((s) => s.key === key)?.count ?? 0;

  const title =
    rows.length === 0
      ? 'No findings in this source, so there is no level to count'
      : dist.graded === 0
        ? `None of the ${rows.length} findings names an object the catalog can grade`
        : `${dist.graded} of ${rows.length} findings carry a level: A ${by('A')}, B ${by('B')}, C ${by('C')}, ` +
          `D ${by('D')}, ${by('Unknown')} not determined`;

  return {
    state: 'ready',
    title,
    lead: 'SAP’s classification, imported — a grade per object, not a proof, and never part of the signed audit pack.',
    coverage: dist.coverage.sentence,
    segments,
    graded: dist.graded,
    note: LEVEL_OVERLAY_NOTE,
    provenance: dist.graded > 0 ? 'imported' : 'not-determined',
  };
}

/* ------------------------------------------------------ (f) decision */

/** The card shows a confirmed record until it is withdrawn; otherwise the draft — as `DecisionCard` does. */
export function decisionShown(read: DecisionRead): ProjectDecision {
  return read.stored && read.stored.status === 'confirmed' ? read.stored : read.draft;
}

/** What a blocking gap waits for, in three to six words. Only the codes that block. */
const WAITS_FOR: Partial<Record<DecisionGapCode, (gap: DecisionGap) => string>> = {
  'run-not-bound': () => 'a bound analysis run',
  'contract-not-bound': () => 'an architecture contract',
  'contract-blocked': () => 'an architecture contract that can be bound',
  'option-not-chosen': () => 'a chosen option',
};

const WAIT_ORDER: readonly DecisionGapCode[] = [
  'run-not-bound',
  'contract-not-bound',
  'contract-blocked',
  'option-not-chosen',
];

const CONDITION_LABEL: Record<ConditionStatus, string> = {
  open: 'Open',
  'not-determined': 'Not determined',
  met: 'Met',
  waived: 'Waived',
};

export function decisionOverviewCard(decision: Loaded<DecisionRead>): DecisionOverviewCard {
  if (decision.state === 'loading') return { state: 'loading', title: 'Reading the decision…' };
  if (decision.state === 'absent') {
    return { state: 'absent', title: 'The decision is not determined', reason: decision.reason };
  }
  const d = decisionShown(decision.value);
  const cov = decisionCoverage(d);
  // `decisionCoverage` sorts by code; a reader needs the order in which the
  // things have to happen — the run, then the contract, then the option.
  const blocking = cov.gaps
    .filter((g) => g.severity === 'blocks')
    .sort((a, b) => WAIT_ORDER.indexOf(a.code) - WAIT_ORDER.indexOf(b.code));
  const waitsFor = [
    ...blocking.map((g) => (WAITS_FOR[g.code] ? WAITS_FOR[g.code]!(g) : g.sentence)),
    ...d.conditions
      .filter((c) => c.status === 'open' || c.status === 'not-determined')
      .map((c) => `condition ${c.id}`),
  ];
  const qualifiers = cov.gaps
    .filter((g) => g.severity === 'qualifies' && g.code !== 'condition-open')
    .map((g) => g.sentence);

  const conditions: ConditionTally[] = (['open', 'not-determined', 'met', 'waived'] as const).map((status) => ({
    status,
    label: CONDITION_LABEL[status],
    count: d.conditions.filter((c) => c.status === status).length,
  }));

  const identity = `${d.decisionId} · revision ${d.revision}`;
  const list = (items: string[]) =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

  const title =
    d.status === 'confirmed'
      ? `Decision ${d.decisionId} is confirmed (revision ${d.revision})` +
        (waitsFor.length > 0 ? ` — ${plural(waitsFor.length, 'point stays', 'points stay')} open` : '')
      : d.status === 'draft'
        ? blocking.length > 0
          ? `One decision open (${d.decisionId}). It waits for ${list(waitsFor)}`
          : waitsFor.length > 0
            ? `One decision open (${d.decisionId}). Nothing blocks confirming it; ${list(waitsFor)} stay open`
            : `One decision open (${d.decisionId}). Nothing blocks confirming it`
        : `Decision ${d.decisionId} is ${d.status}; no decision is open`;

  return {
    state: 'ready',
    title,
    lead:
      d.status === 'confirmed'
        ? `Confirmed by the signed-in account — ${SELF_DECLARATION}`
        : 'A draft derived from the run, the contract, the need and the costs. Nothing is decided until it is confirmed.',
    coverage: coverage(
      5 - d.bindings.filter((b) => b.revision === null).length,
      5,
      'bindings a confirmation would carry (need, option, cost, contract, run)',
      [{ count: d.bindings.filter((b) => b.revision === null).length, why: 'not determined' }],
    ).sentence,
    identity,
    status: d.status,
    summary: d.summary,
    waitsFor,
    qualifiers,
    conditions,
    selfDeclaration: SELF_DECLARATION,
  };
}

/* ------------------------------------------------------ (e) blockers */

/**
 * The order the list is read in, most fundamental first: without a run or with
 * a moved source nothing else is worth reading; then what stops the decision
 * record itself; then what stops a Public Edition decision in particular; then
 * inputs and artefacts that are out of date; then what rests only on a claim.
 */
const RANK = { base: 0, decision: 1, platform: 2, stale: 3, claim: 4 } as const;

export function blockersCard(src: OverviewSource): BlockersCard {
  const unread: string[] = [];
  const found: Array<Omit<BlockerRow, 'rank'> & { weight: number }> = [];

  // 1. The view's own decision blockers (6.4) — everything on that card that is
  //    not a binding. Bindings are the records a decision would attach to and
  //    are all `proven`; a blocker never is.
  const decisionAnswer = src.view.answers.find((a) => a.id === 'decision');
  for (const item of decisionAnswer?.items ?? []) {
    if (item.provenance === 'proven') continue;
    const weight =
      item.key === 'no-run' || item.key === 'source-changed'
        ? RANK.base
        : item.provenance === 'confirmed'
          ? RANK.claim
          : RANK.stale;
    found.push({ key: `view-${item.key}`, label: item.label, evidence: item.detail, scope: 'any', provenance: item.provenance, weight });
  }

  // 2. What blocks the decision record (8.4) — only the gaps that block.
  if (src.decision.state === 'ready') {
    const d = decisionShown(src.decision.value);
    const gaps = [...decisionCoverage(d).gaps].sort(
      (a, b) => WAIT_ORDER.indexOf(a.code) - WAIT_ORDER.indexOf(b.code),
    );
    for (const gap of gaps) {
      if (gap.severity !== 'blocks') continue;
      // The run is already the first line when there is none; not twice.
      if (gap.code === 'run-not-bound' && found.some((f) => f.key === 'view-no-run')) continue;
      found.push({
        key: `decision-${gap.code}`,
        label: `${d.decisionId}: ${WAITS_FOR[gap.code] ? `waits for ${WAITS_FOR[gap.code]!(gap)}` : gap.code}`,
        evidence: gap.sentence,
        scope: 'any',
        provenance: 'not-determined',
        weight: RANK.decision,
      });
    }
  } else if (src.decision.state === 'absent') {
    unread.push(`The decision record: ${src.decision.reason}`);
  } else {
    unread.push('The decision record is still being read.');
  }

  // 3. One object without a catalogued path blocks a Public Edition decision —
  //    per object, never a share (DESIGN.md §5.6).
  if (src.fit.state === 'ready') {
    for (const a of src.fit.value.public.assignments) {
      if (a.bucket !== 'no-catalogued-path') continue;
      found.push({
        key: `no-path-${a.objectName}`,
        label: `${a.objectName} has no catalogued path`,
        evidence: a.evidence ?? '',
        scope: 'public-edition',
        provenance: 'imported',
        weight: RANK.platform,
      });
    }
  } else if (src.fit.state === 'absent') {
    unread.push(`The Public Edition buckets: ${src.fit.reason}`);
  } else {
    unread.push('The Public Edition buckets are still being read.');
  }

  const rows: BlockerRow[] = found
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.weight - b.f.weight || a.i - b.i)
    .map(({ f }, i) => ({
      key: f.key,
      rank: i + 1,
      label: f.label,
      evidence: f.evidence,
      scope: f.scope,
      provenance: f.provenance,
    }));

  const platformRows = rows.filter((r) => r.scope === 'public-edition').length;
  const title =
    rows.length === 0
      ? unread.length === 0
        ? 'Nothing blocks the decision'
        : 'Nothing found that blocks the decision — not every source could be read'
      : platformRows > 0 && platformRows === rows.length
        ? `${plural(platformRows, 'object blocks', 'objects block')} a Public Edition decision`
        : `${plural(rows.length, 'thing blocks', 'things block')} the decision` +
          (platformRows > 0 ? `; ${platformRows} of them only a Public Edition decision` : '');

  const cover = coverage(3 - unread.length, 3, 'sources read (the run and its inputs, the decision record, the Public Edition buckets)', [
    { count: unread.length, why: 'not read — named below' },
  ]);

  return {
    state: 'ready',
    title,
    lead: 'In the order to read them, each with its evidence. An object without a catalogued path blocks a Public Edition decision on its own — that is not a quota.',
    coverage: cover.sentence,
    rows,
    unread,
  };
}

/* ----------------------------------------------------- (a) the whole */

/**
 * The overview of one project. `src.view` is `managementAnswers()` of the same
 * project; the three other sources are what the component read, each with its
 * own loading or absent state.
 */
export function managementOverview(src: OverviewSource, project: { hasSource: boolean; hasRun: boolean }): ManagementOverview {
  const buckets = bucketsCard(src.fit);
  const readiness = readinessCard(src.view.trend);
  const levels = levelsCard(src.findings);
  const blockers = blockersCard(src);
  const decision = decisionOverviewCard(src.decision);

  // Without a source or a signed run the view's own sentence is the answer, and
  // nothing a later read adds could make it less true.
  let headline = src.view.headline;
  if (project.hasSource && project.hasRun) {
    const parts: string[] = [];
    if (decision.state === 'ready') parts.push(`${decision.title}.`);
    if (blockers.state === 'ready' && src.fit.state === 'ready') {
      const n = blockers.rows.filter((r) => r.scope === 'public-edition').length;
      parts.push(
        n === 0
          ? 'No object blocks a Public Edition decision.'
          : `${plural(n, 'object blocks', 'objects block')} a Public Edition decision.`,
      );
    }
    if (readiness.state === 'ready' && src.view.trend.score !== null) {
      parts.push(`Clean Core Score ${src.view.trend.score}.`);
    }
    if (parts.length > 0) headline = parts.join(' ');
  }

  return {
    question: src.view.question,
    headline,
    buckets,
    readiness,
    levels,
    blockers,
    decision,
  };
}
