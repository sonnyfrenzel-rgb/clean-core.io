/**
 * What the delivery package says about the project, read from the project's
 * own records (owner, 11.10.2026; external review F-09, F-10).
 *
 * Every sentence here comes from a record the rest of the product already
 * reads — the decision record (`storedDecisionOf`), the architecture sign-off,
 * the test phase contract (receipt, failed run, closure: ADR-094), the cost
 * revision the decision was priced on (ADR-092), the confirmed process states
 * (business rules) and the score's deduction table (`scoreHeroModel`). Nothing
 * is inferred beyond them, and nothing is written by a model.
 *
 * Pure: the page fetches what lives behind a route (process states, evidence)
 * and hands it in; this module only reads.
 */

import { formatTextDate } from './format';
import { sha256Hex } from './artefact-digest';
import { countSourceLines } from './source-lines';
import {
  decisionIsCurrent,
  signedOffTarget,
  signedSourceOf,
  storedDecisionOf,
  type HandoverProject,
} from './handover';
import { ARCHITECTURE_OPTION } from './decision-draft';
import { decisionCardView } from './decision-card';
import { decisionHeadline } from './decision-manager';
import { costRevisionWords, type DecisionCostBasis, type NoCheapestCode } from './decision-cost';
import { optionOfArchitecture } from './decision-options';
import { sapNamesForDisplay } from './sap-naming';
import { recommendedArchitecture } from './project-commands';
import { readProcessStates, subjectIdsOf, type ProcessStateView } from './process-states';
import { testEvidence, type RailStep } from './workflow-steps';
import { coveringTestRunReceipt } from './test-receipt';
import { closureSentence, failureSentence, testingClosureReading, testRunFailureReading } from './testing-closure';
import { outsideCountsLine, outsideReading, outsideShortfall } from './sap-test-results';
import { isAbapUnitRoute } from './test-runnability';
import { scoreBreakdown, type ScoredFinding } from './clean-core-score';
import { scoreHeroModel, type HeroFinding, type HeroGap } from './score-hero';
import { scoreRuleFor, signedEngineVersionOf } from './score-rule';
import type {
  DecisionFacts,
  DeliveryFacts,
  RuleFacts,
  ScoreFacts,
  TestFacts,
} from './delivery-package';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const day = (iso: string | null | undefined) => (iso ? formatTextDate(iso) ?? iso.slice(0, 10) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------- decision */

const NO_CHEAPEST_WORDS: Readonly<Record<NoCheapestCode, string>> = Object.freeze({
  'assumptions-incomplete': 'the cost assumptions were incomplete',
  'option-incomplete': 'an option was not fully priced',
  'too-few-options': 'fewer than two options were priced',
  'ranges-overlap': 'the cost ranges overlapped',
  'no-figures': 'no figures were stored',
});

/**
 * ADR-092: the cost revision a confirmed decision was priced on. The file says
 * the recorded revision only — whether a later revision outdates the decision
 * is checked in Management against today's figures, which this file does not
 * have, so it does not claim either way.
 */
export function recordedCostSentence(confirmed: boolean, basis: DecisionCostBasis | null): string {
  if (!confirmed) return 'No decision is confirmed, so no cost revision is recorded.';
  if (!basis) return 'Cost revision not recorded (decision taken before 3.0.10).';
  const tail = ' Whether costs changed since, and whether that outdates the decision, Management checks against the current revision.';
  if (basis.revision === null) return `No cost figures were stored when this decision was confirmed.${tail}`;
  const on = `Priced on ${costRevisionWords(basis)}`;
  return basis.cheapest
    ? `${on}, on which "${basis.cheapest.label}" was the cheapest option.${tail}`
    : `${on}; it named no cheapest option (${NO_CHEAPEST_WORDS[basis.noCheapest ?? 'assumptions-incomplete']}).${tail}`;
}

const optionIdOf = (revision: string | null): string | null => {
  if (!revision) return null;
  const at = revision.indexOf(' · ');
  return at > 0 ? revision.slice(0, at) : revision;
};

export function decisionFactsOf(project: HandoverProject): DecisionFacts {
  const stored = storedDecisionOf(project);
  const recCode = recommendedArchitecture(project);
  const recommendation = recCode
    ? {
        option: sapNamesForDisplay(ARCHITECTURE_OPTION[recCode]?.label ?? recCode),
        code: recCode,
        reasoning: str(project.recommendationJustification),
      }
    : null;
  const reasons: DecisionFacts['reasons'] = [];
  const override = str(project.architectJustifiedOverride);

  if (stored) {
    const view = decisionCardView(stored);
    const optionRevision = stored.bindings.find((b) => b.key === 'option')?.revision ?? null;
    const code = optionIdOf(optionRevision);
    const confirmed = stored.status === 'confirmed';
    const state: DecisionFacts['state'] = confirmed
      ? decisionIsCurrent(project, stored)
        ? 'confirmed'
        : 'confirmed-earlier-run'
      : stored.status;
    if (str(stored.summary)) reasons.push({ label: 'Summary of the decision record', text: sapNamesForDisplay(stored.summary) });
    if (override) reasons.push({ label: 'Justification given at the sign-off in Design', text: override });
    return {
      state,
      option: optionRevision ? decisionHeadline(optionRevision) : null,
      optionKey: optionOfArchitecture(code),
      targetCode: code,
      by: stored.confirmation?.account ?? null,
      at: stored.confirmation?.at ?? null,
      identity: view.identity,
      reasons,
      recommendation,
      cost: recordedCostSentence(confirmed, stored.costBasis),
      conditions: view.conditions.map((c) => ({ text: sapNamesForDisplay(c.text), status: c.status === 'not-determined' ? 'not determined' : c.status })),
      bindings: [...view.bindings, view.run].map((b) => ({
        label: b.label,
        value: b.shown ?? `not determined — ${b.reason ?? 'no reason recorded'}`,
      })),
      reversibility: `${view.reversible.answer} — ${view.reversible.detail}`,
    };
  }

  const target = signedOffTarget(project);
  if (target) {
    if (override) reasons.push({ label: 'Justification given at the sign-off in Design', text: override });
    const code = str(project.targetArchitecture);
    return {
      state: 'signed-off',
      option: target,
      optionKey: optionOfArchitecture(code),
      targetCode: code,
      by: str(project.approvedBy),
      at: isoString(project.architectSignOffAt),
      identity: null,
      reasons,
      recommendation,
      cost: 'No decision record is confirmed, so no cost revision is recorded.',
      conditions: [],
      bindings: [],
      reversibility: null,
    };
  }

  return {
    state: 'open',
    option: null,
    optionKey: null,
    targetCode: null,
    by: null,
    at: null,
    identity: null,
    reasons,
    recommendation,
    cost: 'No decision is confirmed, so no cost revision is recorded.',
    conditions: [],
    bindings: [],
    reversibility: null,
  };
}

function isoString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  const v = value as { toDate?: () => Date; seconds?: number } | null | undefined;
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v && typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/* ---------------------------------------------------------- business rules */

/** The confirmed states of the business rules, as the Business view counts them; `reason` when they could not be read. */
export function ruleFactsOf(view: ProcessStateView | null, reason = 'the confirmed process states could not be read.'): RuleFacts {
  if (!view) return { state: 'unread', reason };
  const { rules } = subjectIdsOf(view.subjects);
  const counts = readProcessStates(view.entries, { elements: [], rules }).counts;
  return {
    state: 'read',
    total: rules.length,
    keep: counts.keep,
    change: counts.change,
    drop: counts.drop,
    clarify: counts.clarify,
    undecided: counts.undecided,
  };
}

/* ------------------------------------------------------------------ tests */

/**
 * The test status from the product's own phase contract: a covering receipt,
 * a failed run on record (ADR-094 (1)), a closure without a passing run
 * (ADR-094 (2)–(3)), a result from the reader's own SAP system (ADR-075), or
 * nothing. Never "passed" without a receipt.
 */
export function testFactsOf(project: HandoverProject, phases: readonly RailStep[]): TestFacts {
  const cases = Array.isArray(project.testCases) ? project.testCases.length : 0;
  const suite = typeof (project.testSuite as { code?: unknown } | undefined)?.code === 'string';
  const testing = phases.find((p) => p.key === 'testing');
  const base = { scenarios: cases };
  const p = project as Parameters<typeof coveringTestRunReceipt>[0];

  if (testing?.state === 'stale') {
    return {
      ...base,
      status: 'stale',
      sentence: 'The scenarios or the suite on record were built for a previous source or code; they do not describe this package.',
      detail: [],
    };
  }

  const closure = testingClosureReading(p);
  if (closure.state === 'current') {
    return {
      ...base,
      status: 'closed-not-verified',
      sentence: `${closureSentence(closure.closure)} Not verified — a self-declaration, not a test result.`,
      detail: [],
    };
  }

  const failure = testRunFailureReading(p);
  if (failure.state === 'current') {
    const f = failure.failure;
    return {
      ...base,
      status: 'failed',
      sentence: `${plural(cases, 'scenario')} generated. ${failureSentence(f)}`,
      detail: [
        `Attempts in a row: ${f.attempts}; the last on ${day(f.at)}.`,
        'No result was recorded: nothing about the behaviour of the code is known from this run.',
      ],
    };
  }

  const receipt = coveringTestRunReceipt(p);
  if (receipt) {
    const ev = testEvidence(project);
    const env = 'in the isolated sandbox against mocks (Demonstrated · mock), not against an SAP system';
    const detail = [
      `Run on ${day(receipt.executedAt)}, ${env}; exit code ${receipt.exitCode}.`,
      receipt.stubs.length ? `Packages replaced by mocks: ${receipt.stubs.join(', ')}.` : 'No package was replaced by a mock.',
    ];
    if (ev.attestedFailures > 0 || receipt.exitCode !== 0) {
      return {
        ...base,
        status: 'failed',
        sentence: `${ev.attestedPasses} of ${plural(cases, 'scenario')} passed, ${ev.attestedFailures} failed.`,
        detail,
      };
    }
    if (cases > 0 && ev.attestedPasses === cases) {
      return { ...base, status: 'passed', sentence: `All ${plural(cases, 'scenario')} passed.`, detail };
    }
    return {
      ...base,
      status: 'incomplete',
      sentence: `${ev.attestedPasses} of ${plural(cases, 'scenario')} passed; the rest have no verdict from the run.`,
      detail,
    };
  }

  const outside = outsideReading(project as Parameters<typeof outsideReading>[0]);
  if (outside.state === 'current') {
    const s = outside.summary;
    const where = s.kind === 'imported' ? 'imported from your own SAP system' : 'confirmed by you as run in your own SAP system (a self-declaration)';
    const failed = s.kind === 'imported' ? (s.coverage?.failed ?? 0) : s.failed;
    const shortfall = outsideShortfall(s);
    return {
      ...base,
      status: failed > 0 ? 'failed' : outside.verifies ? 'passed' : 'incomplete',
      sentence: `ABAP Unit result ${where}: ${outsideCountsLine(s)}.`,
      detail: [`Recorded on ${day(s.recordedAt)} by ${s.recordedBy}.`, ...(shortfall ? [shortfall] : [])],
    };
  }

  if (cases === 0) {
    return { ...base, status: 'not-run', sentence: 'No test scenarios were generated.', detail: [] };
  }
  if (isAbapUnitRoute(project)) {
    return {
      ...base,
      status: 'not-run',
      sentence: `${plural(cases, 'scenario')} generated. ABAP Unit runs only inside an SAP system, and no result from yours is on record.`,
      detail: [],
    };
  }
  return {
    ...base,
    status: 'not-run',
    sentence: suite
      ? `${plural(cases, 'scenario')} generated. No test run is on record.`
      : `${plural(cases, 'scenario')} generated, but no test suite — nothing could run.`,
    detail: [],
  };
}

/* ------------------------------------------------------------------ score */

/** The evidence as `/api/projects/{id}/evidence` answers it — the part the score needs. */
export interface ScoreEvidence {
  findings: ReadonlyArray<ScoredFinding & { lineStart: number }>;
  coverage?: { complete: boolean; gaps: ReadonlyArray<{ label: string; count: number; firstLine: number }> } | null;
}

/** The score's derivation, the same table the Analyze hero shows (`scoreHeroModel`), under the signed run's rule. */
export function scoreFactsOf(project: HandoverProject, evidence: ScoreEvidence | null, unread: string | null = null): ScoreFacts {
  const signed = typeof project.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const edition = project.s4Deployment === 'public' || project.s4Deployment === 'private' ? project.s4Deployment : null;
  const engineVersion = signedEngineVersionOf(project);
  const rule = scoreRuleFor(edition === 'public' ? 'public' : 'private', engineVersion);
  if (!evidence) return { signed, edition, rule, engineVersion, model: null, unread: unread ?? 'the findings could not be read' };
  const gaps: HeroGap[] =
    evidence.coverage && !evidence.coverage.complete
      ? evidence.coverage.gaps.map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine }))
      : [];
  const breakdown = scoreBreakdown(evidence.findings, gaps.length, rule);
  return {
    signed,
    edition,
    rule,
    engineVersion,
    model: scoreHeroModel(breakdown, evidence.findings as readonly HeroFinding[], gaps, rule),
    unread: null,
  };
}

/* -------------------------------------------------------------- the facts */

export function deliveryFactsOf(
  project: HandoverProject,
  opts: {
    phases: readonly RailStep[];
    rules: RuleFacts;
    score: ScoreFacts;
    generatedAt: string;
    appVersion: string;
    referenceSection: string;
    documentationFromEngine: boolean;
  },
): DeliveryFacts {
  const fp =
    (project.inputFingerprint as { sha256?: string; fileName?: string; lineCount?: number } | undefined)?.sha256
      ? (project.inputFingerprint as { sha256?: string; fileName?: string; lineCount?: number })
      : project.auditMetadata?.inputFingerprint;
  const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
  const signed = signedSourceOf(project);
  const runId = str(project.activeRunId);
  return {
    projectId: str(project.id) ?? '',
    projectName: str(project.name) ?? 'Project',
    route: isAbapUnitRoute(project) ? 'abap-cloud' : 'side-by-side',
    appVersion: opts.appVersion,
    generatedAt: opts.generatedAt,
    source: {
      fileName: fp?.fileName ?? null,
      sha256: fp?.sha256 ?? (source ? sha256Hex(source) : null),
      lines: typeof fp?.lineCount === 'number' ? fp.lineCount : source ? countSourceLines(source) : null,
      matchesSignedRun: signed !== null,
    },
    run: {
      id: runId,
      engineVersion: signedEngineVersionOf(project),
      auditPackExportedAt: isoString(project.auditMetadata?.auditPackExportedAt),
    },
    decision: decisionFactsOf(project),
    rules: opts.rules,
    tests: testFactsOf(project, opts.phases),
    score: opts.score,
    documentationFromEngine: opts.documentationFromEngine,
    referenceSection: opts.referenceSection,
  };
}

