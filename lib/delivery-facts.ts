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

import { storedGenerationRecord } from './transformation/generation-record';
import { countEngineCases, engineCaseCountsSentence, engineCaseOf, engineCasesNotCoveredSentence } from './testing-engine-cases';
import { deriveEngineCasesOf, engineCaseProvenance, engineCasesNotCountedSentence } from './engine-case-provenance';
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
import type { ProcessStateView } from './process-states';
import { ruleRegisterFromSource, ruleRegisterFromView, type RuleTestInput } from './rule-register';
import { testEvidence, type RailStep } from './workflow-steps';
import { coveringTestRunReceipt } from './test-receipt';
import { closureSentence, failureSentence, testingClosureReading, testRunFailureReading } from './testing-closure';
import { outsideCountsLine, outsideReading, outsideShortfall } from './sap-test-results';
import { isAbapUnitRoute } from './test-runnability';
import { scoreBreakdown, type ScoredFinding } from './clean-core-score';
import { scoreHeroModel, type HeroFinding, type HeroGap } from './score-hero';
import { scoreRuleFor, signedEngineVersionOf } from './score-rule';
import type { EconomicsRecord } from './economics-record';
import type {
  CostRevisionFacts,
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

/**
 * The cost revision a confirmed decision names, for `docs/cost-revision.md`
 * (roadmap 3.0.12, CO review F17). Its number, date and verdict come from the
 * decision's recorded cost basis (ADR-092). The figures come from Economics
 * only when Economics still holds that very revision — the product keeps one
 * revision, so a later one is said to be later and its figures are left out
 * rather than shown as the ones the decision was priced on.
 */
export function costRevisionFactsOf(
  project: HandoverProject,
  basis: DecisionCostBasis | null,
  identity: string | null,
): CostRevisionFacts | null {
  if (!basis) return null;
  const noFigures = basis.revision === null;
  const economics = (project as { _economics?: EconomicsRecord | null })._economics;
  const held = economics && !noFigures && economics.revision === basis.revision ? economics : null;
  const figuresNote = noFigures
    ? 'No cost figures were stored when the decision was confirmed, so there are none to copy.'
    : held
      ? 'The figures below are the inputs of this revision as stored in Economics — the same revision the decision was priced on.'
      : economics === undefined
        ? 'The figures of this revision were not read when the package was built; the revision is named above.'
        : economics === null
          ? 'Economics holds no figures any more; the figures of this revision are not kept, and the revision is named above.'
          : `Economics holds a later revision now (${costRevisionWords({ ...basis, sequence: typeof economics.sequence === 'number' ? economics.sequence : null, at: economics.revisionAt ?? economics.savedAt ?? null })}); the figures of the revision the decision was priced on are not kept, so none are copied — the later figures are not this decision's.`;
  const a = held ? held.assumptions : null;
  const pair = (d: { devDays: number; testDays: number } | null | undefined) =>
    d && Number.isFinite(d.devDays) && Number.isFinite(d.testDays) ? { dev: d.devDays, test: d.testDays } : null;
  return {
    decision: identity,
    sequence: basis.sequence,
    at: basis.at,
    words: costRevisionWords(basis),
    noFigures,
    cheapest: basis.cheapest ? basis.cheapest.label : null,
    noCheapest: basis.noCheapest ? NO_CHEAPEST_WORDS[basis.noCheapest] : null,
    figures: a
      ? {
          currency: a.currency,
          devDayRate: a.devDayRate,
          testDayRate: a.testDayRate,
          horizonYears: a.horizonYears,
          releasesPerYear: a.releaseCadence ? a.releaseCadence.perYear : null,
          cadenceConfirmed: a.releaseCadence ? a.releaseCadence.confirmed : null,
          options: a.options.map((o) => {
            const low = pair(o.oneOff?.low);
            const high = pair(o.oneOff?.high);
            return {
              label: o.label || o.id,
              kind: o.kind,
              oneOff: low && high ? { low, high } : null,
              perRelease: pair(o.perRelease),
              baselinePerYear: pair(o.maintenanceBaselinePerYear),
              effortSource: o.effortSource,
            };
          }),
        }
      : null,
    figuresNote,
  };
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
      costRevision: confirmed ? costRevisionFactsOf(project, stored.costBasis, view.identity) : null,
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
      costRevision: null,
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
    costRevision: null,
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

/**
 * What the register needs from the tests: the cases (their rule traces) and
 * the covering run's verdicts — only a receipt-backed run gives a verdict.
 */
export function ruleTestInputOf(project: HandoverProject): RuleTestInput {
  const cases = Array.isArray(project.testCases) ? (project.testCases as unknown as Array<Record<string, unknown>>) : [];
  const receipt = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]);
  const verdicts = receipt ? Object.fromEntries(receipt.verdicts.map((v) => [v.id, v.status])) : null;
  return { cases, verdicts };
}

/**
 * The business rules with what has been answered for each, as the Business view
 * counts them; `reason` when they could not be read. A view with no rule in it
 * is "not detected", not "0 of 0 decided" (CO review F16, 12.10.2026).
 */
export function ruleFactsOf(
  view: ProcessStateView | null,
  reason = 'the confirmed process states could not be read.',
  tests?: RuleTestInput,
  /** The project's source, for what the register lists apart — demo-case switches, header candidates (3.0.13). */
  source?: string | null,
): RuleFacts {
  return ruleRegisterFromView(view, reason, tests, source);
}

/**
 * The business rules of a project whose process has no stored revision yet
 * (the process-states route answers `no-baseline`).
 *
 * That answer used to reach STATUS.md as "Not read — the process has not been
 * reconstructed from a signed run yet", in a package whose
 * `docs/process-documentation.md` the engine had reconstructed from the same
 * source (CO review F16, 12.10.2026). Revision 1 is written the first time
 * somebody opens the process in the Business view; its absence means nobody
 * has answered a rule. So the rules are read from the source and every one is
 * open. A download writes nothing.
 */
export function ruleFactsFromSource(source: string, tests?: RuleTestInput): RuleFacts {
  return ruleRegisterFromSource(source, tests);
}

/* ------------------------------------------------------------------ tests */

/**
 * The test status from the product's own phase contract: a covering receipt,
 * a failed run on record (ADR-094 (1)), a closure without a passing run
 * (ADR-094 (2)–(3)), a result from the reader's own SAP system (ADR-075), or
 * nothing. Never "passed" without a receipt.
 */
export function testFactsOf(project: HandoverProject, phases: readonly RailStep[]): TestFacts {
  const facts = testFactsWithoutOrigins(project, phases);
  // 3.0.12 — STATUS.md says how many cases the engine derived from the
  // original and how many the model wrote, counted apart.
  const list = Array.isArray(project.testCases) ? (project.testCases as unknown as Array<Record<string, unknown>>) : [];
  if (list.length === 0) return facts;
  const origins = countEngineCases(list);
  if (origins.engine === 0) return { ...facts, detail: [...facts.detail, `Scenarios: ${engineCaseCountsSentence(origins)}.`] };
  // QA review of 2e6596ddbbc8 (0297134b3b87, 3ea38fd51acf): `testCases` is
  // client-written, so a case counts as derived by Clean-Core.io only when the
  // engine reproduces it from the signed source; and the cases past the caps
  // are counted from that same derivation, only while it is the one the stored
  // cases came from and the test phase is not stale — otherwise the reason is said.
  const testsStale = phases.find((p) => p.key === 'testing')?.state === 'stale';
  const provenance = engineCaseProvenance(list, deriveEngineCasesOf(signedSourceOf(project)?.source ?? null), testsStale);
  // Each verified id counts once; every other stored engine entry — a duplicate copy included (QA 663172392dc6) — counts as not derived.
  const verifiedIds = new Set(provenance.verified.map((c) => c.id));
  const counted = countEngineCases(list.filter((tc) => !engineCaseOf(tc) || verifiedIds.has(String(tc.id ?? ''))));
  const notDerived = provenance.unverifiedEntries;
  const detail = [
    ...facts.detail,
    `Scenarios: ${engineCaseCountsSentence({ ...counted, model: counted.model + notDerived })}.`,
  ];
  // The sentence counts stored entries, the same number the line above moves to the model side,
  // and says of a duplicated id that it is one (QA 796fe8bcbadd).
  if (notDerived > 0) {
    const copiesOf = new Map(provenance.duplicates);
    const named = provenance.unverified.map((id) => (copiesOf.has(id) ? `${id} (stored ${copiesOf.get(id)} times; one derivation yields each id once)` : id));
    detail.push(
      `${notDerived} stored as engine ${notDerived === 1 ? 'case is' : 'cases are'} not reproduced from the signed source and counted as not derived by Clean-Core.io: ${named.join(', ')}.`,
    );
  }
  // Owner, 12.10.2026: the engine cases are capped (20 precision, 20 guard); the rest is counted here.
  if (provenance.notCovered) {
    const left = provenance.notCovered;
    if (left.precision + left.guard > 0) detail.push(engineCasesNotCoveredSentence(left));
  } else if (provenance.notCoveredReason) {
    detail.push(engineCasesNotCountedSentence(provenance.notCoveredReason));
  }
  return { ...facts, detail };
}

function testFactsWithoutOrigins(project: HandoverProject, phases: readonly RailStep[]): TestFacts {
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
    const env = 'in the test runner against mocks (Demonstrated · mock), not against an SAP system';
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
    // Roadmap 3.0.12, step E: how the stored package was made (engine-led or one call).
    generation: storedGenerationRecord(project.generationBinding),
  };
}

