import { managementAnswers, type RunHistoryEntry } from './management-answers';
import { itFindingsView, type ItFindingsSource } from './it-findings';
import { decisionManagerView, type DecisionPlace, type PillarKey } from './decision-manager';
import { decisionCoverage, type DecisionStatus, type ProjectDecision } from './project-decision';
import type { StandardFit } from './standard-fit';
import type { CloudReadinessGrade } from './abap/abcd-classification';
import type { ProvenanceValue } from './provenance';
import type { NotDetermined } from './workspace-model';
import type { Project } from './types';
import { economicsInWords, pricedOptions } from './economics-record';
import { workflowSteps } from './workflow-steps';
import {
  decisionOptionsView,
  OPTION_SIGNAL_WORDS,
  type DecisionStage,
  type OptionFigure,
  type OptionSignal,
} from './decision-option-signals';
import type { DecisionOption } from './decision-options';
import type { ChartSegment } from './management-overview';
import { recommendedArchitecture } from './project-commands';
import { formatTextDate } from './format';

/**
 * The steering one-pager — roadmap step 8.6, mockup screen 5 ("Steering
 * one-pager" in the Management tool row).
 *
 * **Redesigned 03.10.2026** (owner: "That is not a steering one-pager, far too
 * complex and confusing"). It had become eleven figure cards in a column — "x
 * of 7 phases", record counts, a version string as a headline — with every
 * link's full address printed beside it and a second column of what was
 * missing. A steering committee reads it in about a minute, on one printed
 * page:
 *
 *   1. **Header** — the program, the date, what the code was reconstructed to
 *      do, and where the project stands.
 *   2. **The decision** — the question, where it stands and who chose or
 *      confirmed it, what the evidence proposes, and the four options in one
 *      row with their signal, effort and cost (ADR-079, the same derivation
 *      as the Management view's option cards, `lib/decision-option-signals.ts`);
 *      then the decision card's pillars as small state chips.
 *   2b. **Distance to SAP standard** — one bar on the target edition and the
 *      other edition in one line (ADR-079, `lib/standard-fit.ts`).
 *   3. **Key figures** — the clean core levels, the Clean Core Score, and
 *      whether the options are priced.
 *   4. **Risks** — the top three objects that block the standard path.
 *   5. **Next steps** — at most four, each with who acts: Business, IT or the
 *      decision maker.
 *   6. **Footnote** — the provenance legend, the scope sentence and the
 *      analyzer and catalog versions in small print.
 *
 * Rules kept from 8.6 and not negotiable:
 *
 * **It measures nothing.** Every value is one another model already derived
 * and the workspace already shows: the Management answers, the IT findings,
 * fit to standard (`lib/standard-fit.ts`) and the decision record.
 *
 * **Not determined is said in place, with its reason** — never a zero, never a
 * parallel column.
 *
 * **Money only as a simulation with its revision.** A cost per option is the
 * Economics amount under the stored assumptions revision, marked *Simulation*
 * (ADR-022, ADR-079); nothing is priced here, and an option without figures is
 * *Not determined*.
 *
 * A **view**: derived when opened, never stored, not part of the signed audit
 * pack. **Pure**: no React, no Firestore, no `fetch`.
 */

export const STEERING_TITLE = 'Steering one-pager';

export const STEERING_SCOPE = 'Derived when opened; not stored; not part of the signed audit pack.';

/**
 * The name the printed page carries — the browser takes it for the PDF's file
 * name and for its own header line: "Steering one-pager — Z_MM_PO_APPROVAL —
 * 10 Oct 2026" (owner, 10.10.2026: a page for a real management).
 */
export function steeringPrintTitle(subject: string, date: string): string {
  return [STEERING_TITLE, subject.trim(), formatTextDate(date) ?? date].filter(Boolean).join(' — ');
}

export const STEERING_LEGEND =
  'Proven: backed by a signature or a real run · Confirmed: your account’s own word, not a mandate · ' +
  'Reconstructed: read from the code · Imported: from SAP’s files · Simulation: on your own assumptions · ' +
  'Not determined: said with its reason.';

/** A place in the workspace a line leads to. Rendered as a link, never as its address. */
export interface SteeringLink {
  href: string;
  /** Where it goes, in words — "IT view". */
  place: string;
}

export type SteeringOwner = 'Business' | 'IT' | 'Decision maker';

export type SteeringFigureKey = 'levels' | 'score' | 'costs';

/** One option of the four, as the one-pager prints it (ADR-079). */
export interface SteeringOption {
  option: DecisionOption;
  label: string;
  signal: OptionSignal;
  signalWord: string;
  reason: string;
  effort: OptionFigure;
  cost: OptionFigure;
  proposed: boolean;
  chosen: boolean;
}

/** How far the program is from SAP standard on the target edition (ADR-079). */
export type SteeringDistance =
  | {
      state: 'ready';
      title: string;
      /** "11 of 21 SAP objects this program uses have a path to SAP standard; 10 stand in the way." */
      sentence: string;
      percent: number;
      segments: ChartSegment[];
      /** The other edition in one line, or `null`. */
      other: string | null;
    }
  | { state: 'none-used'; title: string; sentence: string }
  | { state: 'not-determined'; title: string; reason: string };

export interface SteeringFigure {
  key: SteeringFigureKey;
  label: string;
  /** The value as its own view shows it, or `null` — then `absentReason` says why. */
  value: string | null;
  absentReason: string | null;
  /** One line: what the value means. */
  meaning: string;
  provenance: ProvenanceValue;
  /** The level bar, for the levels figure only. */
  levels?: Array<{ grade: CloudReadinessGrade; count: number }>;
  evidence: SteeringLink;
}

export interface SteeringRisk {
  object: string;
  level: CloudReadinessGrade;
  line: number | null;
  why: string;
  provenance: ProvenanceValue;
}

export interface SteeringStep {
  key: string;
  owner: SteeringOwner;
  text: string;
  link: SteeringLink | null;
}

export type SteeringDecision =
  | {
      state: 'ready';
      /** ADR-079: where the decision stands, naming the option, and who chose or confirmed it. */
      answer: string;
      stage: DecisionStage;
      who: string | null;
      proposal: string;
      options: SteeringOption[];
      identity: string;
      status: DecisionStatus;
      headline: string;
      why: string;
      readiness: string;
      pillars: Array<{ key: PillarKey; title: string; provenance: ProvenanceValue; draft: boolean }>;
      link: SteeringLink;
      /**
       * Who chose or confirmed it, for the title block: the account's name where
       * it is known, else its e-mail (ADR-083 (b)); `null` when nobody has.
       */
      decidedBy: { verb: 'Chosen' | 'Confirmed'; by: string; at: string | null } | null;
    }
  | { state: 'not-determined'; reason: string; link: SteeringLink | null };

export interface SteeringOnePager {
  title: string;
  /** The document title while it prints — `steeringPrintTitle`. */
  printTitle: string;
  /** "Keep, rebuild, move to SAP standard or retire Z_…?" — the page's question. */
  question: string;
  distance: SteeringDistance;
  header: {
    program: string;
    date: string;
    /** The date in running text — "10 Oct 2026". */
    dateText: string;
    /** The program the page is about — `Z_MM_PO_APPROVAL`; the program name when absent. */
    subject: string;
    /** What the code was reconstructed to do, or why that is not known. */
    purpose: string;
    purposeProvenance: ProvenanceValue;
    status: string;
  };
  decision: SteeringDecision;
  /** At most four, in a fixed order. */
  figures: SteeringFigure[];
  risks: SteeringRisk[];
  /** Said when there is no risk to list: why not. */
  risksNote: string | null;
  /** Risks beyond the ones listed — printed as "+n more", never dropped silently. */
  risksMore: number;
  /** At most four. */
  nextSteps: SteeringStep[];
  /** Next steps beyond the ones listed — "+n more". */
  nextStepsMore: number;
  /**
   * `reference`: the one line that carries raw ids (decision, revision, run) —
   * small print in the footer, nowhere else on the page.
   */
  footnote: { legend: string; scope: string; versions: string | null; reference: string | null };
}

/** The process the signed source reconstructs to — `lib/process-summary.ts`, counted as the map counts. */
export interface SteeringProcess {
  steps: number;
  decisions: number;
}

export interface SteeringSource {
  /** `project`, or `demo` on `/demo/workspace`, which is never signed. */
  mode: 'project' | 'demo';
  /** Where links start: `/project/<id>`, or `/demo`. */
  base: string;
  program: string;
  /** ISO date of the page — the day it was opened. */
  date: string;
  project: Project | null;
  hasRun: boolean;
  /** Runs of this project, `null` when they could not be read. */
  history: readonly RunHistoryEntry[] | null;
  open: NotDetermined | null;
  /** The IT findings, `null` when they could not be read. */
  findings: ItFindingsSource | null;
  fit: StandardFit;
  /** The decision as the card shows it, `null` when there is none to read. */
  decision: ProjectDecision | null;
  /** Why the decision could not be read — set when `decision` is null. */
  decisionUnreadable?: string | null;
  /** `null` when the signed source could not be reconstructed (or is not read yet). */
  process: SteeringProcess | null;
  /** The program the question is about — `Z_MM_PO_APPROVAL`; the program name when absent. */
  subject?: string;
  /** The same fit read for the other edition (`standardFitOnOtherEdition`), in one line. */
  otherEdition?: string | null;
  /** What the decision route answers beyond the record (ADR-079). */
  decisionStatus?: DecisionStatus | null;
  decisionOutdated?: boolean;
  confirmation?: { account: string; at: string } | null;
  signOff?: { code: string | null; by: string | null; at: string | null } | null;
  /**
   * Names of accounts the reader's screen knows, keyed by e-mail (lower case):
   * who decided is printed by name where it is known, else by e-mail (ADR-083 (b)).
   */
  accountNames?: Readonly<Record<string, string>>;
}

function distanceOf(fit: StandardFit, other: string | null): SteeringDistance {
  if (fit.state === 'ready') {
    return {
      state: 'ready',
      title: `Distance to SAP standard on ${fit.platformLabel}`,
      sentence:
        `${fit.fits} of ${fit.counted} SAP object${fit.counted === 1 ? '' : 's'} this program uses ${fit.fits === 1 ? 'has' : 'have'} a path to SAP standard; ` +
        `${fit.blocking} stand${fit.blocking === 1 ? 's' : ''} in the way.`,
      percent: fit.percent,
      segments: fit.groups.flatMap((g) => g.segments),
      other,
    };
  }
  if (fit.state === 'none-used') return { state: 'none-used', title: 'Distance to SAP standard', sentence: fit.sentence };
  return { state: 'not-determined', title: 'Distance to SAP standard', reason: fit.reason };
}

export const STEERING_FIGURES_MAX = 4;
export const STEERING_RISKS_MAX = 3;
export const STEERING_STEPS_MAX = 4;

function linksOf(src: SteeringSource) {
  const view = (v: string, hash = '') =>
    src.mode === 'demo' ? `/demo/workspace?view=${v}${hash}` : `${src.base}?view=${v}${hash}`;
  const stage = (path: string) => (src.mode === 'demo' ? `/demo/${path}` : `${src.base}/${path}`);
  return {
    decision: { href: view('management', '#decision-options'), place: 'The decision' },
    fit: { href: view('management', '#standard-fit'), place: 'Fit to standard' },
    it: { href: view('it'), place: 'IT view' },
    business: { href: view('business'), place: 'Business view' },
    management: { href: view('management'), place: 'Management view' },
    analyze: { href: stage('analyze'), place: 'Analyze' },
    design: { href: stage('design'), place: 'Design' },
    economics: { href: stage('tco'), place: 'Economics' },
  } satisfies Record<string, SteeringLink>;
}

const notDeterminedWords = (reason: string) => `Not determined — ${reason.replace(/\.$/, '')}.`;

function ownerOf(place: DecisionPlace | null): SteeringOwner {
  if (!place) return 'Decision maker';
  if (place.kind === 'view' && place.view === 'management') return 'Decision maker';
  if (place.kind === 'view') return place.view === 'business' ? 'Business' : 'IT';
  return place.path === 'analyze' ? 'IT' : 'Decision maker';
}

export function steeringOnePager(src: SteeringSource): SteeringOnePager {
  const to = linksOf(src);
  const linkOf = (place: DecisionPlace | null): SteeringLink | null =>
    !place
      ? null
      : place.kind === 'view'
        ? place.view === 'management'
          ? to.decision
          : place.view === 'business'
            ? to.business
            : to.it
        : place.path === 'tco'
          ? to.economics
          : place.path === 'design'
            ? to.design
            : to.analyze;

  /* ------------------------------------------------------------ header */
  const runDate = src.project?.activeRunId
    ? (src.history?.find((h) => h.runId === src.project?.activeRunId)?.createdAt ?? null)
    : null;
  const purpose = src.process
    ? `Reconstructed from the code: a process of ${src.process.steps} step${src.process.steps === 1 ? '' : 's'} and ${src.process.decisions} decision point${src.process.decisions === 1 ? '' : 's'}.`
    : src.hasRun || src.mode === 'demo'
      ? notDeterminedWords('the process could not be reconstructed from the source')
      : notDeterminedWords('no signed run, so no process was reconstructed');
  // No raw id in a sentence: the decision's id stands once, in the footer's reference line.
  const decisionWord = src.decision ? `decision ${src.decision.status}` : 'no decision on record';
  const status =
    src.mode === 'demo'
      ? 'Demo — never signed; no decision on record'
      : src.hasRun
        ? `Analysis signed${runDate ? ` on ${runDate.slice(0, 10)}` : ''} · ${decisionWord}`
        : `No signed analysis run yet · ${decisionWord}`;

  /* ---------------------------------------------------------- decision */
  let decision: SteeringDecision;
  const storedEcon = src.project?._economics ?? null;
  const storedScenario = storedEcon ? pricedOptions(storedEcon) : null;
  const manager = src.decision ? decisionManagerView(src.decision, storedScenario) : null;
  const optionsView = decisionOptionsView({
    subject: src.subject ?? src.program,
    mode: src.mode,
    hasRun: src.hasRun,
    fit: src.fit,
    decision: src.decision,
    status: src.decisionStatus ?? src.decision?.status ?? null,
    outdated: src.decisionOutdated ?? false,
    confirmation: src.confirmation ?? null,
    signOff: src.signOff ?? null,
    engineRoute: recommendedArchitecture(src.project ?? {}),
    usage: src.project?.usageReport ?? null,
    economics: src.project?._economics ?? null,
  });
  const nameOf = (account: string): string => src.accountNames?.[account.trim().toLowerCase()]?.trim() || account;
  const decidedBy =
    optionsView.stage === 'confirmed' || optionsView.stage === 'outdated'
      ? src.confirmation
        ? { verb: 'Confirmed' as const, by: nameOf(src.confirmation.account), at: formatTextDate(src.confirmation.at) }
        : null
      : optionsView.stage === 'chosen' && src.signOff?.by
        ? { verb: 'Chosen' as const, by: nameOf(src.signOff.by), at: formatTextDate(src.signOff.at) }
        : null;
  const account = optionsView.stage === 'chosen' ? src.signOff?.by : src.confirmation?.account;
  const who = optionsView.who && account && decidedBy && decidedBy.by !== account ? optionsView.who.replace(account, decidedBy.by) : optionsView.who;
  if (src.decision && manager) {
    decision = {
      state: 'ready',
      answer: optionsView.answer,
      stage: optionsView.stage,
      who,
      proposal: optionsView.proposal,
      options: optionsView.cards.map((c) => ({
        option: c.option,
        label: c.label,
        signal: c.signal,
        signalWord: OPTION_SIGNAL_WORDS[c.signal],
        reason: c.reason,
        effort: c.effort,
        cost: c.cost,
        proposed: c.proposed,
        chosen: c.chosen,
      })),
      identity: `${src.decision.decisionId} · revision ${src.decision.revision}`,
      status: src.decision.status,
      headline: manager.headline,
      why: manager.why,
      readiness: manager.readiness,
      pillars: manager.pillars.map((p) => ({ key: p.key, title: p.title, provenance: p.provenance, draft: p.draft })),
      link: to.decision,
      decidedBy,
    };
  } else {
    decision = {
      state: 'not-determined',
      reason:
        src.decisionUnreadable?.trim() ||
        (src.mode === 'demo' ? 'A demo is never signed, so it has no decision record.' : 'The decision of this project could not be read.'),
      link: src.mode === 'demo' ? null : to.decision,
    };
  }

  /* ----------------------------------------------------------- figures */
  const figures: SteeringFigure[] = [];
  // Fit to standard is no longer a figure: it is the distance block (ADR-079).
  const fit = src.fit;

  const it = itFindingsView(src.findings);
  if (!it.unreadable && it.distribution.graded > 0) {
    const levels = it.distribution.slices
      .filter((s) => s.grade !== 'Unknown')
      .map((s) => ({ grade: s.grade, count: s.count }));
    figures.push({
      key: 'levels',
      label: 'Clean core levels',
      value: it.distribution.slices.map((s) => `${s.grade} ${s.count}`).join(' · '),
      absentReason: null,
      meaning: it.distribution.coverage.sentence,
      provenance: 'imported',
      levels,
      evidence: to.it,
    });
  } else if (fit.state === 'ready' && fit.blockers.length + fit.clear.length > 0) {
    // No finding carries a level, but the SAP objects the code uses do — the
    // same objects and levels the risks below name, so the two never disagree.
    const objects = [...fit.blockers, ...fit.clear];
    const levels = (['A', 'B', 'C', 'D'] as const)
      .map((grade) => ({ grade, count: objects.filter((o) => o.level === grade).length }))
      .filter((l) => l.count > 0);
    figures.push({
      key: 'levels',
      label: 'Clean core levels',
      value: levels.map((l) => `${l.grade} ${l.count}`).join(' · '),
      absentReason: null,
      meaning: `Per SAP object this code uses (${objects.length}), from SAP’s classification.`,
      provenance: 'imported',
      levels,
      evidence: to.it,
    });
  } else {
    figures.push({
      key: 'levels',
      label: 'Clean core levels',
      value: null,
      absentReason: it.unreadable
        ? 'the findings could not be read'
        : src.findings && src.findings.rows.length === 0
          ? 'the engine raised no finding to grade'
          : 'no finding names an SAP object to grade',
      meaning: 'Level A to D per place in the code, from SAP’s classification.',
      provenance: 'not-determined',
      evidence: to.it,
    });
  }

  const management = managementAnswers(src.project, src.history, src.open);
  const score = management.answers.flatMap((a) => a.figures).find((f) => f.key === 'clean-core-score') ?? null;
  figures.push({
    key: 'score',
    label: 'Clean Core Score',
    value: src.mode === 'demo' ? null : (score?.value ?? null),
    absentReason:
      src.mode === 'demo' ? 'a demo is never signed' : score?.value == null ? (score?.absentReason ?? 'no signed run') : null,
    meaning: 'A grade from the signed run, not a compliance percentage.',
    provenance: src.mode === 'demo' || !score || score.value === null ? 'not-determined' : score.provenance,
    evidence: to.management,
  });

  const cost = src.decision?.bindings.find((b) => b.key === 'cost') ?? null;
  // The figures stored on the Economics stage (03.10.2026) price the options
  // whether or not a decision binds them: how many, never an amount (ADR-022).
  const econ = src.project?._economics ?? null;
  const econPriced = econ ? pricedOptions(econ) : null;
  const econStale = econ ? workflowSteps(src.project).find((s) => s.key === 'tco')?.state === 'stale' : false;
  figures.push(
    cost && cost.revision !== null
      ? {
          key: 'costs',
          label: 'Cost of the options',
          value: cost.provenance === 'simulation' ? 'Simulation' : 'No cheapest option',
          absentReason: null,
          meaning: 'On your own assumptions; amounts stand in Economics, never here.',
          provenance: cost.provenance,
          evidence: to.economics,
        }
      : econ && econPriced && econPriced.priced > 0
        ? {
            key: 'costs',
            label: 'Cost of the options',
            value: `${econPriced.priced} of ${econPriced.total} priced`,
            absentReason: null,
            meaning:
              `A scenario on your own figures from Economics (${economicsInWords(econ)})` +
              (econStale ? ', stored against an earlier score, to be checked' : '') +
              '; amounts stand in Economics, never here.',
            provenance: 'simulation',
            evidence: to.economics,
          }
        : {
            key: 'costs',
            label: 'Cost of the options',
            value: null,
            absentReason: 'not priced yet',
            meaning: 'Enter your assumptions in Economics; costs are only ever a simulation.',
            provenance: 'not-determined',
            evidence: to.economics,
          },
  );

  /* ------------------------------------------------------------- risks */
  const risks: SteeringRisk[] =
    fit.state === 'ready'
      ? fit.blockers.slice(0, STEERING_RISKS_MAX).map((b) => ({
          object: b.objectName,
          level: b.level,
          line: b.line,
          why: b.why,
          provenance: b.provenance,
        }))
      : [];
  const risksNote =
    risks.length > 0
      ? null
      : fit.state === 'ready'
        ? 'Nothing found blocks the standard path.'
        : fit.state === 'none-used'
          ? fit.sentence
          : notDeterminedWords(fit.reason);

  /* -------------------------------------------------------- next steps */
  const steps: SteeringStep[] = [];
  if (src.mode === 'demo') {
    steps.push({ key: 'own-code', owner: 'IT', text: 'Analyse your own code — a demo is never signed.', link: null });
  } else if (!src.hasRun) {
    steps.push({ key: 'run', owner: 'IT', text: 'Run the analysis — every figure here comes from a signed run.', link: to.analyze });
  }
  if (src.decision && manager) {
    if (src.decision.status === 'draft' && decisionCoverage(src.decision).state !== 'blocked') {
      steps.push({
        key: 'confirm',
        owner: 'Decision maker',
        text: 'Confirm the decision, or revise it.',
        link: to.decision,
      });
    }
    const option = manager.pillars.find((p) => p.key === 'option');
    if (option && !option.inPlace) {
      const proposed = optionsView.cards.find((c) => c.proposed);
      steps.push({
        key: 'option',
        owner: 'Decision maker',
        text: proposed
          ? `Choose one of the four options — the evidence points to ${proposed.label}.`
          : 'Choose one of the four options in the Management view.',
        link: to.decision,
      });
    }
    for (const p of manager.points.filter((x) => !x.done)) {
      steps.push({ key: `point:${p.id}`, owner: ownerOf(p.place), text: p.line, link: linkOf(p.place) });
    }
    const costPillar = manager.pillars.find((p) => p.key === 'cost');
    if (costPillar && !costPillar.inPlace && !(econPriced && econPriced.priced > 0)) {
      steps.push({ key: 'costs', owner: 'Decision maker', text: 'Enter the cost assumptions in Economics.', link: to.economics });
    }
  }

  /* ---------------------------------------------------------- footnote */
  const active = src.project?.activeRunId ? src.history?.find((h) => h.runId === src.project?.activeRunId) : null;
  const versions = active
    ? [
        active.rulesetVersion ? `rules ${active.rulesetVersion}` : null,
        active.analyzerVersion ? `analyzer ${active.analyzerVersion}` : null,
        active.catalogVersion ? `catalog ${active.catalogVersion}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    : null;

  const reference =
    [
      src.decision ? `decision ${src.decision.decisionId} · revision ${src.decision.revision}` : null,
      src.project?.activeRunId ? `run ${src.project.activeRunId}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  const subject = (src.subject ?? src.program).trim() || src.program;
  const allRisks = fit.state === 'ready' ? fit.blockers.length : 0;

  return {
    title: STEERING_TITLE,
    printTitle: steeringPrintTitle(subject, src.date),
    question: optionsView.question,
    distance: distanceOf(fit, src.otherEdition ?? null),
    header: {
      program: src.program,
      date: src.date,
      dateText: formatTextDate(src.date) ?? src.date,
      subject,
      purpose,
      purposeProvenance: src.process ? 'reconstructed' : 'not-determined',
      status,
    },
    decision,
    figures: figures.slice(0, STEERING_FIGURES_MAX),
    risks,
    risksNote,
    risksMore: Math.max(0, allRisks - risks.length),
    nextSteps: steps.slice(0, STEERING_STEPS_MAX),
    nextStepsMore: Math.max(0, steps.length - STEERING_STEPS_MAX),
    footnote: { legend: STEERING_LEGEND, scope: STEERING_SCOPE, versions, reference },
  };
}
