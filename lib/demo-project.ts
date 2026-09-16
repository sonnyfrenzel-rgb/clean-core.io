import fs from 'fs';
import path from 'path';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { routeExtensibility, type ExtensibilityRouteReport } from '@/lib/abap/extensibility-router';
import {
  extractCodeInventory,
  extractDataCoupling,
  computeComplexityScore,
  computeCriticalityScore,
} from '@/lib/abap/code-assessment';
import { coverageCaveat, type CoverageReport } from '@/lib/abap/coverage';
import { getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { PHASES, type PhaseKey, type PhaseState } from '@/lib/workflow-steps';
import type { CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import {
  DEMO_OBJECT_NAME,
  DEMO_PROJECT_TITLE,
  DEMO_SOURCE_FILE,
  DEMO_SUBJECT,
  findTrustChainField,
} from '@/lib/demo-marks';

/**
 * The demo project — roadmap step 0.10, `DESIGN.md` §6.1.2.
 *
 * One demo for every account, not a copy per account: it is computed here, on
 * the server, from the file that ships in this repository, and handed to the
 * browser as a prop. Nothing is written anywhere. That is what makes it free of
 * consequence — no project document, no run, no quota — and it is also why the
 * account is never mentioned: there is no per-user state to mention.
 *
 * Everything with a number on it comes from a run of the engine this release
 * ships — `buildAbapEvidence`, `routeExtensibility`, the two assessment scores —
 * over `abap-test-files/Z_MM_PO_APPROVAL.abap`, at request time. Nothing is
 * transcribed. `DESIGN.md` §6.1.2 asks for the demo to be regenerated whenever
 * the engine or the rule version moves; computing it instead of storing it makes
 * that automatic, and makes a figure that drifts from the engine impossible
 * rather than merely unlikely.
 *
 * What the demo deliberately does NOT do
 * --------------------------------------
 * Three of the seven stages are a model's work in a real run: the transformed
 * code, the written blueprint, and the generated test suite. A demo cannot
 * produce those — there is no model call here — and writing plausible ones by
 * hand would be exactly the fabrication this product exists to refuse. So the
 * demo carries what the deterministic half really produces for those stages (a
 * transformation plan per finding, the object inventory, the areas the engine
 * could not judge), and says plainly, on the stage, that the model half is what
 * a real run adds. The invitation to start a real run sits on those stages for
 * that reason.
 *
 * And it is not signed. See `lib/demo-marks.ts`: `buildDemoProject` throws if a
 * trust-chain or account field ever appears in what it returns.
 *
 * Server-only: reads from the filesystem.
 */

const DEMO_PATH = path.join(process.cwd(), 'abap-test-files', DEMO_SOURCE_FILE);

/** The demo's deployment assumption, stated rather than implied. */
const DEMO_DEPLOYMENT = 'private' as const;

export interface DemoRailStep {
  n: number;
  key: PhaseKey;
  label: string;
  /** Route segment under `/demo/`. */
  path: string;
  state: PhaseState;
  done: boolean;
  /**
   * Always false here, and it is not a placeholder: the demo produces no signed
   * run and executes no test, so no phase of it is backed by evidence. Green is
   * for proven work (roadmap 1.7), and a demo may not borrow it.
   */
  proven: boolean;
  badge: string;
  detail: string;
}

/** One line of the deterministic transformation plan. */
export interface DemoPlanItem {
  findingId: string;
  title: string;
  lineStart: number;
  severity: EvidenceFinding['severity'];
  /** The route the engine offers first for this finding. */
  target: string;
  recommendation: string;
  successor: string | null;
  successorProvenance: string | null;
}

/** An area a reader has to check by hand, because the engine says it did not. */
export interface DemoManualArea {
  label: string;
  why: string;
  line: number;
}

export interface DemoProject {
  /** Always true, always present — the flag the surfaces key their marking off. */
  isDemo: true;
  /** Always false. There is no code path in the demo that could set it. */
  signed: false;
  title: string;
  objectName: string;
  subject: string;
  sourceFile: string;
  deployment: 'public' | 'private';
  /**
   * The source itself is not in here. Every finding carries its own snippet and
   * line number, which is what a reader needs, and shipping the whole 20 KB file
   * into the payload of all seven screens buys nothing until the code column of
   * the 3.0 workspace exists (roadmap 3.0.7).
   */
  totalLines: number;
  /** Lines excluding blanks and full-line comments — the figure the forecast uses. */
  linesOfCode: number;
  catalogVersion: string;

  analyze: {
    findings: EvidenceFinding[];
    summary: { criticalCount: number; highCount: number; mediumCount: number; lowCount: number; infoCount: number };
    coverage: CoverageReport;
    /** The engine's own sentence about what it did not check, or null. */
    caveat: string | null;
    cleanCoreScore: number;
    complexityScore: number;
    criticalityScore: number;
  };

  design: ExtensibilityRouteReport;

  transformation: {
    plan: DemoPlanItem[];
    /** Findings the plan cannot offer a target for. */
    unplanned: number;
  };

  documentation: {
    inventory: CodeInventoryItem[];
    coupling: DataCouplingEntry[];
  };

  testing: {
    /** All zero, and said out loud: no test in this demo has run. */
    verdicts: { total: number; passed: number; failed: number; withoutVerdict: number };
    manualAreas: DemoManualArea[];
  };

  economics: {
    loc: number;
    /** The measured baseline the forecast needs. */
    scoreBefore: number;
  };

  delivery: {
    /** What a real handover would still be missing here, named rather than ticked. */
    missing: string[];
  };

  rail: DemoRailStep[];
}

function railStep(
  key: PhaseKey,
  state: PhaseState,
  badge: string,
  detail: string,
): DemoRailStep {
  const p = PHASES.find((x) => x.key === key)!;
  return { n: p.n, key, label: p.label, path: key, state, done: state === 'done', proven: false, badge, detail };
}

/**
 * The demo's own rail.
 *
 * `PHASES` is imported rather than re-listed, so the order and the names stay
 * the product's single source of truth (`docs/ARCHITECTURE.md` §2). The states
 * are written here because `workflowSteps` answers a question about a stored
 * project — it reads `activeRunId`, `generatedCode`, `testCases` — and the demo
 * has none of those by construction. Feeding it a project-shaped object would
 * have made the rail say "Signed run" or "Blueprint generated" about a demo that
 * did neither, which is the fabrication this step is not allowed to commit.
 */
function buildRail(demo: Omit<DemoProject, 'rail'>): DemoRailStep[] {
  const f = demo.analyze.findings.length;
  return [
    railStep(
      'analyze',
      'partial',
      'Demo run · unsigned',
      `${f} findings from the engine that ships with this release — and no signed run, because a demo may not produce one.`,
    ),
    railStep(
      'design',
      'partial',
      'Route proposed',
      `${demo.design.recommendedRoute} proposed from the evidence. Confirming it here changes this browser and nothing else.`,
    ),
    railStep(
      'transformation',
      'partial',
      'Plan only',
      `${demo.transformation.plan.length} findings with a target route. The transformed code is a model's work and the demo has none.`,
    ),
    railStep(
      'documentation',
      'partial',
      'Inventory only',
      `${demo.documentation.inventory.length} objects and ${demo.documentation.coupling.length} tables inventoried. The written blueprint comes from a real run.`,
    ),
    railStep(
      'testing',
      'empty',
      'Nothing ran',
      'No test in this demo has been generated or executed, so there is no pass rate to show.',
    ),
    railStep(
      'tco',
      'empty',
      'Assumptions needed',
      'The forecast starts empty: no day rate, no investment, so no amount — you enter the assumptions.',
    ),
    railStep(
      'delivery',
      'empty',
      'Not handed over',
      'A demo produces no audit pack and no signed export. What a real handover would still need is listed here.',
    ),
  ];
}

function planOf(findings: EvidenceFinding[]): { plan: DemoPlanItem[]; unplanned: number } {
  const plan: DemoPlanItem[] = [];
  let unplanned = 0;
  for (const finding of findings) {
    const target = finding.targetOptions?.[0];
    if (!target) {
      unplanned += 1;
      continue;
    }
    plan.push({
      findingId: finding.id,
      title: finding.title,
      lineStart: finding.lineStart,
      severity: finding.severity,
      target,
      recommendation: finding.recommendation,
      successor: finding.sapReplacement?.objectName ?? null,
      successorProvenance: finding.sapReplacement?.confidence ?? null,
    });
  }
  return { plan, unplanned };
}

/**
 * What a handover out of this demo would still be missing.
 *
 * Written as an absence, not as a checklist with empty boxes: every line names
 * something a real run produces and this one does not, so the reader can see
 * where the demo stops rather than inferring it from a grey tick.
 */
function missingForHandover(): string[] {
  return [
    'a signed run — the demo produces none, and every signed artefact derives from one',
    'transformed code — generated by the model against your own source, not shipped with a demo',
    'a written blueprint — the same',
    'an executed test suite — nothing in this demo has run',
    'a cost model — it has no assumptions until you enter them in Economics',
    'an audit pack — it is sealed against a signed run, and there is none here',
  ];
}

/**
 * Refuses a demo that carries a trust-chain or account field.
 *
 * Exported so the rule can be run against a deliberately poisoned object rather
 * than read out of the source: a guard nobody has seen fail is a comment.
 */
export function assertNoTrustChain(demo: unknown): void {
  const offender = findTrustChainField(demo);
  if (offender) {
    throw new Error(
      `The demo project carries the trust-chain or account field "${offender}". ` +
        'A demo is never signed and belongs to no account (roadmap 0.10, lib/demo-marks.ts).',
    );
  }
}

/** The demo, rebuilt from the file on disk on every request. */
export function buildDemoProject(): DemoProject {
  const source = fs.readFileSync(DEMO_PATH, 'utf8');
  const lines = source.split(/\r?\n/);
  const linesOfCode = lines.filter((l) => l.trim() && !/^\s*\*/.test(l)).length;

  const evidence = buildAbapEvidence(source, DEMO_SOURCE_FILE, DEMO_DEPLOYMENT);
  const route = routeExtensibility(evidence, DEMO_DEPLOYMENT);
  const { plan, unplanned } = planOf(evidence.findings);

  const withoutRail: Omit<DemoProject, 'rail'> = {
    isDemo: true,
    signed: false,
    title: DEMO_PROJECT_TITLE,
    objectName: DEMO_OBJECT_NAME,
    subject: DEMO_SUBJECT,
    sourceFile: DEMO_SOURCE_FILE,
    deployment: DEMO_DEPLOYMENT,
    totalLines: lines.length,
    linesOfCode,
    catalogVersion: getMergedCatalogVersion(),
    analyze: {
      findings: evidence.findings,
      summary: evidence.summary,
      coverage: evidence.coverage,
      caveat: coverageCaveat(evidence.coverage),
      cleanCoreScore: route.cleanCoreScore,
      complexityScore: computeComplexityScore(source),
      criticalityScore: computeCriticalityScore(source),
    },
    design: route,
    transformation: { plan, unplanned },
    documentation: {
      inventory: extractCodeInventory(source),
      coupling: extractDataCoupling(source),
    },
    testing: {
      verdicts: { total: 0, passed: 0, failed: 0, withoutVerdict: 0 },
      manualAreas: evidence.coverage.unassessed.map((u) => ({
        label: u.label,
        why: u.why,
        line: u.line,
      })),
    },
    economics: { loc: linesOfCode, scoreBefore: route.cleanCoreScore },
    delivery: { missing: missingForHandover() },
  };

  const demo: DemoProject = { ...withoutRail, rail: buildRail(withoutRail) };

  // The invariant, executed rather than trusted. A demo that carries a run id,
  // a signature or an account is a forgery whatever the banner above it says, so
  // the page must not render at all rather than render one.
  assertNoTrustChain(demo);

  return demo;
}
