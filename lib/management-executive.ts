import { coverage } from './management-answers';
import { TARGET_PLATFORM_LABELS, type TargetPlatform } from './abap/public-cloud-fit';
import { phaseTone, type PhaseKey, type PhaseTone, type RailStep } from './workflow-steps';
import {
  decisionShown,
  type ChartSegment,
  type DecisionRead,
  type FitByPlatform,
  type Loaded,
  type ManagementOverview,
} from './management-overview';
import type { ObjectStatusValue } from './object-status';
import type { ProvenanceValue } from './provenance';
import type { Project } from './types';
import { pricedOptions } from './economics-record';
import { decisionQuestion } from './decision-options';

/**
 * The decision panel on top of the Management view — what a manager reads in
 * ten seconds (`DESIGN.md` §2.11, ADR-029, roadmap 3.0.10 (a)).
 *
 * The overview cards of `lib/management-overview.ts` answer every question the
 * view asks, but each in its own card and in full: the decision with every
 * condition id, the blockers with their evidence, the buckets with their
 * coverage. This module reads those cards and keeps the part a reader needs
 * first — **the question, where the decision stands, what is in its way, the one
 * step that clears the first obstacle, four figures and where the objects
 * stand.** Everything else stays where it was, one action deeper.
 *
 * **Nothing new is computed.** Every number here is a count another model has
 * already made (the buckets of `resolvePublicCloudFit`, the phases of
 * `workflowSteps`, the blockers of `blockersCard`); this module picks and words.
 *
 * **Not determined is not bad.** A figure nobody measured is `null` with the
 * word for why, and its status is *open* (neutral, hollow), never a warning or
 * an error: a project that has not been analysed yet is not a risky project,
 * it is an unread one. The panel then leads with what to do first.
 *
 * **No money.** Costs appear as *whether* a cost revision stands behind the
 * decision — the word "Simulation" and its revision — and otherwise as "not
 * entered" with the way to Economics. No amount, no currency (ADR-022,
 * `tests/money-honesty-guard.spec.ts`).
 *
 * Pure: no React, no Firestore, no `fetch`. A view, never stored or signed.
 */

/* ------------------------------------------------------------ inputs */

/** What stands behind the costs, as far as the decision record says. */
export type ExecutiveCosts =
  | { state: 'bound'; revision: string; provenance: ProvenanceValue; note: string | null }
  /**
   * No cost revision in the decision record, and figures stored on the
   * Economics stage (03.10.2026): a scenario on record, not bound to anything.
   */
  | { state: 'stored'; revision: string; priced: number; total: number; complete: boolean; stale: boolean }
  | { state: 'not-entered'; reason: string }
  | { state: 'unknown'; reason: string };

/** The Economics figures stored for the project, as far as the executive answer may say them — no amount. */
export interface StoredCosts {
  revision: string;
  priced: number;
  total: number;
  complete: boolean;
  stale: boolean;
}

export interface ExecutiveSource {
  /** The program the decision is about — `Z_MM_PO_APPROVAL`. */
  subject: string;
  /** `project` in a stored workspace, `demo` on `/demo/workspace` (no run can exist there). */
  mode: 'project' | 'demo';
  hasSource: boolean;
  hasRun: boolean;
  steps: readonly RailStep[];
  overview: Pick<ManagementOverview, 'blockers' | 'decision' | 'buckets'>;
  fit: Loaded<FitByPlatform>;
  costs: ExecutiveCosts;
  /** The demo's route proposed from the evidence (`provenance: proposed`), named in its answer. */
  proposal?: string | null;
}

/* ----------------------------------------------------------- outputs */

/** Where an action leads. The component turns it into a link for its surface. */
export type ExecutiveTarget =
  | { kind: 'stage'; path: string }
  | { kind: 'anchor'; id: 'decision-card' | 'public-cloud-fit' }
  | { kind: 'new-project' };

export interface ExecutiveAction {
  label: string;
  /** Why this step, in one line. */
  reason: string;
  target: ExecutiveTarget;
}

export interface ExecutiveBlocker {
  key: string;
  label: string;
  provenance: ProvenanceValue;
}

export interface ExecutiveFigure {
  key: 'objects' | 'no-path' | 'costs' | 'evidence';
  /** The number or word, or `null` when nothing measured it. */
  value: string | null;
  /** The word shown in place of a missing value — never a 0. */
  absentWord: string;
  /** One line: what the number means. */
  meaning: string;
  provenance: ProvenanceValue;
  coverage: string;
  /** The way to the input that would fill a missing figure. */
  action: ExecutiveAction | null;
}

export interface PhaseCell {
  key: PhaseKey;
  label: string;
  tone: PhaseTone;
  /** The state in words — the colour is never the only carrier. */
  word: string;
}

export interface ExecutiveSummary {
  /** The one question — "Keep, rebuild, move to SAP standard or retire Z_MM_PO_APPROVAL?". */
  question: string;
  /** Where the decision stands, as one sentence. */
  answer: string;
  status: ObjectStatusValue;
  /** What stands in the way of confirming it — at most three lines here. */
  blockers: ExecutiveBlocker[];
  blockerCount: number | null;
  /**
   * Sources the blockers card could not read, by name. Non-empty means an
   * empty blocker list is "nothing found", never "nothing blocks".
   */
  unread: string[];
  /** Rows beyond the three shown. */
  moreBlockers: number;
  /** Objects that would block only a Public Edition decision, when the target is not Public. */
  platformOnly: string | null;
  next: ExecutiveAction | null;
  figures: ExecutiveFigure[];
  /** The buckets on the target platform (or Private Edition when none is set). */
  buckets: { platformLabel: string; isTarget: boolean; segments: ChartSegment[]; total: number } | null;
  bucketsAbsent: string | null;
  phases: PhaseCell[];
}

/* ---------------------------------------------------------- helpers */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The program a source names — `REPORT z_x.` — or the fallback. */
export function executiveSubject(source: string | null | undefined, fallback: string): string {
  const m = (source ?? '').match(/^\s*(?:REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL)\s+([\w/]+)/im);
  return m ? m[1].toUpperCase() : fallback;
}

/** The one question — the four options' own wording (`lib/decision-options.ts`, ADR-079). */
export function executiveQuestion(subject: string): string {
  return decisionQuestion(subject);
}

const PHASE_WORD: Record<PhaseTone, string> = {
  proven: 'checked',
  unproven: 'on record, unchecked',
  stale: 'built for an older source',
  none: 'nothing on record',
};

/**
 * What the cost binding of a decision record says, without an amount — and,
 * where the record binds none, whether figures are stored on the Economics
 * stage (`stored`), so a priced scenario is not reported as "not entered".
 */
export function costsFromDecision(decision: Loaded<DecisionRead>, stored: StoredCosts | null = null): ExecutiveCosts {
  const fromStore = (): ExecutiveCosts | null => (stored ? { state: 'stored', ...stored } : null);
  if (decision.state === 'loading') return fromStore() ?? { state: 'unknown', reason: 'still being read' };
  if (decision.state === 'absent') return fromStore() ?? { state: 'unknown', reason: decision.reason };
  const cost = decisionShown(decision.value).bindings.find((b) => b.key === 'cost') ?? null;
  if (!cost || cost.revision === null) {
    return fromStore() ?? { state: 'not-entered', reason: cost?.notDeterminedReason?.trim() || 'No cost assumptions were stated.' };
  }
  return { state: 'bound', revision: cost.revision, provenance: cost.provenance, note: cost.note };
}

/** The stored Economics figures of a project, without an amount — `null` when none are stored. */
export function storedCostsOf(project: Project | null, steps: readonly RailStep[]): StoredCosts | null {
  const econ = project?._economics ?? null;
  if (!econ) return null;
  const tco = steps.find((s) => s.key === 'tco');
  const { priced, total } = pricedOptions(econ);
  return { revision: econ.revision, priced, total, complete: tco?.state === 'done', stale: tco?.state === 'stale' };
}

const ECONOMICS: ExecutiveAction = {
  label: 'Enter your figures in Economics',
  reason: 'Costs exist only as a simulation on your own assumptions.',
  target: { kind: 'stage', path: 'tco' },
};

/** The step that clears a blocker, by the blocker's key (`lib/management-overview.ts`). */
function actionFor(key: string, label: string, src: ExecutiveSource): ExecutiveAction {
  if (key === 'view-no-run') {
    return src.mode === 'demo'
      ? {
          label: 'Analyse your own code',
          reason: 'A demo is never signed; a decision needs a signed run on your own source.',
          target: { kind: 'new-project' },
        }
      : {
          label: 'Run the analysis',
          reason: 'Every figure a decision rests on comes from a signed run.',
          target: { kind: 'stage', path: 'analyze' },
        };
  }
  if (key === 'view-source-changed' || key.startsWith('view-input-')) {
    return {
      label: 'Run the analysis again',
      reason: 'The source or an input changed after the signed run.',
      target: { kind: 'stage', path: 'analyze' },
    };
  }
  if (key.startsWith('view-handover-')) {
    return { label: 'Open Delivery', reason: label, target: { kind: 'stage', path: 'delivery' } };
  }
  if (key.startsWith('view-claim-')) {
    const phase = src.steps.find((s) => key === `view-claim-${s.key}`);
    if (phase) return { label: `Open ${phase.label}`, reason: label, target: { kind: 'stage', path: phase.path } };
  }
  if (key.startsWith('no-path-')) {
    return {
      label: 'See what has to be found out',
      reason: label,
      target: { kind: 'anchor', id: 'public-cloud-fit' },
    };
  }
  return { label: 'Open the decision', reason: label, target: { kind: 'anchor', id: 'decision-card' } };
}

/* -------------------------------------------------------------- build */

export function managementExecutive(src: ExecutiveSource): ExecutiveSummary {
  const question = executiveQuestion(src.subject);
  const { blockers, decision, buckets } = src.overview;
  const target: TargetPlatform | null = src.fit.state === 'ready' ? src.fit.value.target : null;

  /* ---- blockers: what stands in the way of *this* decision */
  let rows: Array<{ key: string; label: string; provenance: ProvenanceValue }> = [];
  let platformOnly: string | null = null;
  let blockerCount: number | null = null;
  const unread = blockers.state === 'ready' ? blockers.unread : [];
  if (blockers.state === 'ready') {
    // What blocks *this* decision: everything not tied to an edition, and —
    // when a target platform is set — every object without a catalogued path
    // on that platform, one line each (`DESIGN.md` §5.6: one object blocks;
    // the same rule `publicCloudFitHeadline` states on the panel below).
    const general = blockers.rows.filter((r) => r.scope === 'any');
    rows = general.map((r) => ({ key: r.key, label: r.label, provenance: r.provenance }));
    if (target && src.fit.state === 'ready') {
      for (const a of src.fit.value[target].assignments) {
        if (a.bucket !== 'no-catalogued-path') continue;
        rows.push({ key: `no-path-${a.objectName}`, label: `${a.objectName} has no catalogued path`, provenance: 'imported' });
      }
    }
    blockerCount = rows.length;
    const onlyPublic = blockers.rows.filter((r) => r.scope === 'public-edition');
    if (target !== 'public' && onlyPublic.length > 0) {
      platformOnly = `On Public Edition, ${plural(onlyPublic.length, 'object has', 'objects have')} no catalogued path — each would block a Public Edition decision.`;
    }
  }
  if (!src.hasRun && !rows.some((r) => r.key === 'view-no-run')) {
    // The run is always the first thing in the way, even before the cards have read.
    rows.unshift({ key: 'view-no-run', label: 'No signed run', provenance: 'not-determined' });
    blockerCount = blockerCount === null ? null : blockerCount + 1;
  }

  /* ---- where the decision stands */
  let answer: string;
  let status: ObjectStatusValue = 'open';
  let next: ExecutiveAction | null = null;

  if (!src.hasSource) {
    answer = 'Nothing to decide yet: no code has been staged for this project.';
    status = 'not-started';
    next = { label: 'Run the analysis', reason: 'Stage the code and analyse it first.', target: { kind: 'stage', path: 'analyze' } };
  } else if (!src.hasRun) {
    answer =
      src.mode === 'demo'
        ? 'No signed run in a demo, so the decision cannot be taken here.' +
          (src.proposal ? ` The evidence proposes ${src.proposal}.` : '')
        : 'No signed run yet, so the decision cannot be taken — every figure here comes from one.';
    status = 'not-started';
    next = actionFor('view-no-run', 'No signed run', src);
  } else if (decision.state === 'loading') {
    answer = 'Reading where the decision stands…';
  } else if (decision.state === 'absent') {
    answer = `Where the decision stands is not determined: ${decision.reason}`;
  } else {
    const id = decision.identity.split(' · ')[0];
    if (decision.status === 'confirmed') {
      status = 'confirmed';
      answer =
        `Decision ${id} is confirmed — by the signed-in account, a self-declaration, not an organisational mandate.` +
        (blockerCount ? ` ${plural(blockerCount, 'point stays', 'points stay')} open.` : '');
    } else if (decision.status === 'draft') {
      status = 'draft';
      answer =
        blockerCount === null
          ? `Decision ${id} is open.`
          : blockerCount === 0
            ? unread.length > 0
              ? `Decision ${id} is open. Nothing found blocks confirming it, but not every source could be read.`
              : `Decision ${id} is open, and nothing blocks confirming it.`
            : `Decision ${id} is open. ${plural(blockerCount, 'thing blocks', 'things block')} confirming it.`;
    } else {
      answer = decision.title.endsWith('.') ? decision.title : `${decision.title}.`;
    }
    if (rows.length > 0) next = actionFor(rows[0].key, rows[0].label, src);
    else if (decision.status === 'draft' && unread.length > 0) {
      // With the decision record read, the only source left unread is the
      // Public Edition buckets (`blockersCard`) — an unread source is not an all-clear.
      next = {
        label: 'See what could not be read',
        reason: unread[0],
        target: { kind: 'anchor', id: 'public-cloud-fit' },
      };
    } else if (decision.status === 'draft') {
      next = {
        label: 'Review and confirm the decision',
        reason: 'Nothing blocks it. Confirming is a self-declaration by your account.',
        target: { kind: 'anchor', id: 'decision-card' },
      };
    }
  }

  /* ---- four figures */
  const figures: ExecutiveFigure[] = [];
  const platform: TargetPlatform = target ?? 'private';
  const platformLabel = TARGET_PLATFORM_LABELS[platform];
  if (src.fit.state === 'ready') {
    const fit = src.fit.value[platform];
    const total = fit.assignments.length;
    const noPath = fit.summary.counts['no-catalogued-path'];
    figures.push({
      key: 'objects',
      value: String(total),
      absentWord: 'Not determined',
      meaning: `objects the code uses, sorted for ${platformLabel}${target ? '' : ' (no target platform set)'}`,
      provenance: 'reconstructed',
      coverage: buckets.state === 'ready' ? buckets.coverage : coverage(total, null, 'objects').sentence,
      action: null,
    });
    figures.push({
      key: 'no-path',
      value: String(noPath),
      absentWord: 'Not determined',
      meaning: 'without a catalogued path — a question for SAP, not a fault in this code',
      provenance: 'imported',
      coverage: coverage(noPath, total, `objects, against SAP's synced repository files`).sentence,
      action:
        noPath > 0
          ? { label: 'See what has to be found out', reason: '', target: { kind: 'anchor', id: 'public-cloud-fit' } }
          : null,
    });
  } else {
    const why = src.fit.state === 'absent' ? src.fit.reason : 'still being read';
    for (const key of ['objects', 'no-path'] as const) {
      figures.push({
        key,
        value: null,
        absentWord: src.fit.state === 'loading' ? 'Reading…' : 'Not determined',
        meaning: key === 'objects' ? 'objects the code uses, sorted into the four buckets' : 'without a catalogued path',
        provenance: 'not-determined',
        coverage: why,
        action: null,
      });
    }
  }

  const costs = src.costs;
  figures.push(
    costs.state === 'bound'
      ? {
          key: 'costs',
          value: costs.provenance === 'simulation' ? 'Simulation' : 'No cost winner',
          absentWord: 'Not entered',
          meaning:
            costs.provenance === 'simulation'
              ? 'costs on your own assumptions — not a quote; amounts stand in Economics'
              : costs.note ?? 'the comparison names no cheapest option yet',
          provenance: costs.provenance === 'simulation' ? 'simulation' : 'not-determined',
          coverage: `cost revision ${costs.revision}`,
          action: { ...ECONOMICS, label: 'Open in Economics' },
        }
      : costs.state === 'stored'
      ? {
          key: 'costs',
          value: 'Simulation',
          absentWord: 'Not entered',
          meaning: costs.stale
            ? 'costs on your own figures, stored against an earlier score — check them; a scenario, not a quote'
            : costs.complete
              ? 'costs on your own figures, every option priced — a scenario, not a quote; amounts stand in Economics'
              : `costs on your own figures, ${costs.priced} of ${costs.total} options priced so far — a scenario, not a quote`,
          provenance: 'simulation',
          coverage: `cost assumptions revision ${costs.revision}, stored in Economics and not bound to a decision`,
          action: { ...ECONOMICS, label: 'Open in Economics' },
        }
      : {
          key: 'costs',
          value: null,
          absentWord: costs.state === 'not-entered' ? 'Not entered' : 'Not determined',
          meaning: 'costs — only ever a simulation on your own assumptions',
          provenance: 'not-determined',
          coverage: costs.reason,
          action: ECONOMICS,
        },
  );

  const proven = src.steps.filter((s) => s.proven).length;
  const claimed = src.steps.filter((s) => s.done && !s.proven).length;
  const stale = src.steps.filter((s) => s.state === 'stale').length;
  figures.push({
    key: 'evidence',
    value: `${proven} of ${src.steps.length}`,
    absentWord: 'Not determined',
    meaning: 'phases backed by a record something other than your account checked',
    provenance: 'reconstructed',
    coverage: coverage(proven, src.steps.length, 'phases in the workflow contract', [
      { count: claimed, why: 'on record on the account’s own word' },
      { count: stale, why: 'built for an older source' },
    ]).sentence,
    action: null,
  });

  /* ---- where the objects stand */
  let bucketChart: ExecutiveSummary['buckets'] = null;
  let bucketsAbsent: string | null = null;
  if (buckets.state === 'ready') {
    const chart = buckets.charts.find((c) => c.platform === platform) ?? buckets.charts[0];
    if (chart && chart.total > 0) {
      bucketChart = { platformLabel: chart.label, isTarget: chart.isTarget, segments: chart.segments, total: chart.total };
    } else {
      bucketsAbsent = 'The engine named no object in the staged source, so there is nothing to sort.';
    }
  } else {
    bucketsAbsent = buckets.state === 'absent' ? buckets.reason : null;
  }

  // Without a signed run the run is the one thing in the way that a reader can
  // act on; the decision's own gaps wait behind it and are counted, not listed
  // (owner 03.10.2026: one clear path, not three cards saying the same thing).
  const shown = src.hasRun ? rows.slice(0, 3) : rows.filter((r) => r.key === 'view-no-run');
  return {
    question,
    answer,
    status,
    blockers: shown,
    blockerCount,
    unread,
    moreBlockers: Math.max(0, rows.length - shown.length),
    platformOnly,
    next,
    figures,
    buckets: bucketChart,
    bucketsAbsent,
    phases: src.steps.map((s) => {
      const tone = phaseTone(s);
      return { key: s.key, label: s.label, tone, word: PHASE_WORD[tone] };
    }),
  };
}
