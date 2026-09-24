import { managementAnswers, type Coverage, type RunHistoryEntry } from './management-answers';
import { itFindingsView, type ItFindingsSource } from './it-findings';
import { DECISION_BINDINGS, type ProjectDecision } from './project-decision';
import type { ProvenanceValue } from './provenance';
import type { NotDetermined } from './workspace-model';
import type { Project } from './types';

/**
 * The steering one-pager — roadmap step 8.6, mockup screen 5 ("Steering
 * one-pager" in the Management tool row).
 *
 * *„Eine Seite (PDF) mit ausschließlich Zahlen, die per Link zur Evidenz
 * führen, jede mit ihrer Abdeckung, und der Spalte ‚nicht bestimmt'"* —
 * feedback of 15.09.2026.
 *
 * Four rules decide the shape of this module.
 *
 * **1. It measures nothing.** Every number on the page is a figure another
 * model already derived and the workspace already shows: the Management
 * answers (`lib/management-answers.ts`), the IT findings
 * (`lib/it-findings.ts`) and the decision record (`lib/project-decision.ts`).
 * This module only sorts them into two columns. A number that no model in
 * `lib/` produces cannot appear here, because there is no code path that
 * writes one.
 *
 * **2. A figure without a value is not a zero.** Where a model hands back
 * `null` and a reason, the entry moves to the *Not determined* column with that
 * reason in words. The column is never a count folded into a remainder; each
 * entry is its own line.
 *
 * **3. Every figure carries its coverage and a link to its evidence.** The
 * coverage sentence is the one the source model built; the link names the
 * place in the workspace (a view, a stage) where the evidence behind it is
 * shown, and — where the evidence is a line of code — the line anchors.
 *
 * **4. No amount of money.** Costs appear only as whether a cost revision is
 * bound to the decision (roadmap 7.4 / 8.4). As long as the decision binds
 * none, costs stand under *Not determined* with the decision's own reason; an
 * amount is never printed here, because the one place that may show one is
 * Economics, next to its approved assumptions (`lib/money-honesty.ts`).
 *
 * The one-pager is a **view**, like Management itself: it is derived on
 * every render, never stored, and not part of the signed audit pack.
 *
 * **Pure.** No React, no Firestore, no `fetch`: the component hands in what it
 * read, so a spec can drive every state without a browser.
 */

/** Where a figure's evidence lives in the workspace. */
export interface SteeringLink {
  /** A path inside this app, starting with `/project/`. Printed beside the link. */
  href: string;
  /** Where it goes, in words — "IT view · findings". */
  place: string;
}

export const STEERING_GROUPS = ['phases', 'findings', 'decision', 'score', 'costs'] as const;
export type SteeringGroup = (typeof STEERING_GROUPS)[number];

export const STEERING_GROUP_LABELS: Readonly<Record<SteeringGroup, string>> = Object.freeze({
  phases: 'Phases',
  findings: 'Code and findings',
  decision: 'Decision',
  score: 'Clean Core Score',
  costs: 'Costs',
});

export interface SteeringFigure {
  key: string;
  group: SteeringGroup;
  label: string;
  /** Already formatted by the model it came from. Never null here. */
  value: string;
  /** The coverage sentence, as the source model built it. */
  coverage: string;
  provenance: ProvenanceValue;
  evidence: SteeringLink;
  /** Line anchors (`L502`) where the evidence is a place in the code. Possibly empty. */
  anchors: string[];
}

export interface SteeringGap {
  key: string;
  group: SteeringGroup;
  label: string;
  /** Why there is no number, in words. Never empty. */
  reason: string;
  /** Where to look or act, when there is such a place. */
  evidence: SteeringLink | null;
}

export interface SteeringOnePager {
  title: string;
  /** What the page is and is not, printed under the title. */
  scope: string;
  figures: SteeringFigure[];
  notDetermined: SteeringGap[];
  /** How far the page itself holds: "12 figures · 4 not determined". */
  summary: string;
}

export interface SteeringSource {
  projectId: string;
  project: Project | null;
  /** Runs of this project, `null` when they could not be read. */
  history: readonly RunHistoryEntry[] | null;
  /** `notDetermined(project)` from `lib/workspace-model.ts`. */
  open: NotDetermined | null;
  /** `GET /api/projects/{id}/findings`, `null` when it could not be read. */
  findings: ItFindingsSource | null;
  /** The decision as the card shows it, `null` when it could not be read. */
  decision: ProjectDecision | null;
  /** Why the decision could not be read — set when `decision` is null. */
  decisionUnreadable?: string | null;
}

export const STEERING_TITLE = 'Steering one-pager';

export const STEERING_SCOPE =
  'Figures only, each with its coverage and a link to its evidence in the workspace. ' +
  'What could not be determined stands in its own column with its reason, never as a zero. ' +
  'Derived when opened; not stored and not part of the signed audit pack.';

function links(projectId: string) {
  const base = `/project/${encodeURIComponent(projectId)}`;
  return {
    management: { href: `${base}?view=management#management-answers-heading`, place: 'Management view · answers' },
    decision: { href: `${base}?view=management#decision-card`, place: 'Management view · open decision' },
    it: { href: `${base}?view=it#it-answers-heading`, place: 'IT view · findings' },
    notDetermined: { href: `${base}?view=business#not-determined`, place: 'Workspace · not determined' },
    economics: { href: `${base}/tco`, place: 'Economics stage' },
  } satisfies Record<string, SteeringLink>;
}

const coverageSentence = (c: Coverage) => c.sentence;

/**
 * The one-pager of one project.
 *
 * The groups come in `STEERING_GROUPS` order in both columns, so a reader can
 * run one eye down the figures and the other down what is missing beside them.
 */
export function steeringOnePager(src: SteeringSource): SteeringOnePager {
  const to = links(src.projectId);
  const figures: SteeringFigure[] = [];
  const gaps: SteeringGap[] = [];

  const push = (
    group: SteeringGroup,
    f: { key: string; label: string; value: string | null; absentReason?: string; provenance: ProvenanceValue; coverage: Coverage },
    evidence: SteeringLink,
    anchors: string[] = [],
  ) => {
    if (f.value === null) {
      gaps.push({
        key: f.key,
        group,
        label: f.label,
        reason: f.absentReason?.trim() || coverageSentence(f.coverage),
        evidence,
      });
      return;
    }
    figures.push({
      key: f.key,
      group,
      label: f.label,
      value: f.value,
      coverage: coverageSentence(f.coverage),
      provenance: f.provenance,
      evidence,
      anchors,
    });
  };

  /* ------------------------------------------------ Management's figures */
  const management = managementAnswers(src.project, src.history, src.open);
  const figuresOf = (id: string) => management.answers.find((a) => a.id === id)?.figures ?? [];

  for (const f of figuresOf('confirmed')) push('phases', f, to.management);
  for (const f of figuresOf('missing')) {
    if (f.key === 'not-determined') {
      const anchors = (src.open?.items ?? []).map((i) => i.anchor).filter(Boolean);
      push('findings', f, to.notDetermined, anchors);
    } else {
      push('phases', f, to.management);
    }
  }
  for (const f of figuresOf('decision')) push('decision', { ...f, key: `management-${f.key}` }, to.management);
  for (const f of figuresOf('score')) push('score', f, to.management);

  /* ------------------------------------------------------- IT's figures */
  const it = itFindingsView(src.findings);
  for (const f of it.figures) push('findings', { ...f, key: `it-${f.key}` }, to.it);
  if (!it.unreadable && it.distribution.graded > 0) {
    figures.push({
      key: 'it-level-distribution',
      group: 'findings',
      label: 'findings per clean core level',
      value: it.distribution.slices.map((s) => `${s.grade} ${s.count}`).join(' · '),
      coverage: it.distribution.coverage.sentence,
      provenance: 'imported',
      evidence: to.it,
      anchors: [],
    });
  }

  /* --------------------------------------------------- the decision record */
  const decision = src.decision;
  if (!decision) {
    const why = src.decisionUnreadable?.trim() || 'the decision of this project could not be read';
    gaps.push({ key: 'decision-bindings', group: 'decision', label: 'bindings of the decision', reason: why, evidence: to.decision });
    gaps.push({ key: 'decision-conditions', group: 'decision', label: 'open conditions of the decision', reason: why, evidence: to.decision });
    gaps.push({
      key: 'cost',
      group: 'costs',
      label: 'cost revision bound to the decision',
      reason: `${why}, so no cost revision is known`,
      evidence: to.economics,
    });
  } else {
    const bound = decision.bindings.filter((b) => b.revision !== null);
    figures.push({
      key: 'decision-bindings',
      group: 'decision',
      label: `bindings of ${decision.decisionId} that hold`,
      value: `${bound.length} of ${DECISION_BINDINGS.length}`,
      coverage:
        `${bound.length} of ${DECISION_BINDINGS.length} bindings in the decision record` +
        (bound.length < DECISION_BINDINGS.length
          ? ` · ${DECISION_BINDINGS.length - bound.length} not determined, each with its reason on the card`
          : ''),
      provenance: decision.status === 'confirmed' ? 'confirmed' : 'proposed',
      evidence: to.decision,
      anchors: [],
    });

    const open = decision.conditions.filter((c) => c.status === 'open' || c.status === 'not-determined').length;
    figures.push({
      key: 'decision-conditions',
      group: 'decision',
      label: `conditions of ${decision.decisionId} still open`,
      value: `${open} of ${decision.conditions.length}`,
      coverage: `${open} of ${decision.conditions.length} conditions in the decision record`,
      provenance: 'reconstructed',
      evidence: to.decision,
      anchors: [],
    });

    const cost = decision.bindings.find((b) => b.key === 'cost') ?? null;
    if (!cost || cost.revision === null) {
      gaps.push({
        key: 'cost',
        group: 'costs',
        label: 'cost revision bound to the decision',
        reason: cost?.notDeterminedReason?.trim() || 'the decision binds no cost revision',
        evidence: to.economics,
      });
    } else {
      figures.push({
        key: 'cost',
        group: 'costs',
        label: 'cost revision bound to the decision',
        value: '1 of 1',
        coverage:
          '1 of 1 cost revision in the decision record' +
          (cost.note ? ` · ${cost.note}` : '') +
          ' · amounts are shown in Economics only, next to their assumptions',
        provenance: cost.provenance,
        evidence: to.economics,
        anchors: [],
      });
    }
  }

  const order = (g: SteeringGroup) => STEERING_GROUPS.indexOf(g);
  figures.sort((a, b) => order(a.group) - order(b.group));
  gaps.sort((a, b) => order(a.group) - order(b.group));

  return {
    title: STEERING_TITLE,
    scope: STEERING_SCOPE,
    figures,
    notDetermined: gaps,
    summary: `${figures.length} ${figures.length === 1 ? 'figure' : 'figures'} · ${gaps.length} not determined`,
  };
}
