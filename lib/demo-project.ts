import fs from 'fs';
import path from 'path';
import { countSourceLines } from '@/lib/source-lines';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { routeExtensibility, type ExtensibilityRouteReport } from '@/lib/abap/extensibility-router';
import {
  extractCodeInventory,
  extractDataCoupling,
  computeComplexityScore,
  computeCriticalityScore,
} from '@/lib/abap/code-assessment';
import { coverageCaveat, type CoverageReport } from '@/lib/abap/coverage';
import { readCallGraph } from '@/lib/abap/call-graph';
import { getMergedCatalogVersion, gradeSapObjectUse } from '@/lib/abap/catalog-service';
import { gradeKey, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { scoreBreakdown, type ScoreBreakdown } from '@/lib/clean-core-score';
import { accessUseOfKind, findingRows, processStepBands, type ProcessStepBand } from '@/lib/findings-view';
import { readProcess } from '@/lib/first-look';
import { findingsWorklist } from '@/lib/findings-worklist';
import { catalogSnapshotKeyForProject } from '@/lib/abap/catalog-snapshots';
import { PHASES, type PhaseKey, type PhaseState } from '@/lib/workflow-steps';
import { findingTarget, trackOfRoute, type ProjectTrack, type TargetKind } from '@/lib/transformation-view';
import type { CodeInventoryItem, DataCouplingEntry, WorklistItem } from '@/lib/types';
import { buildReadingExports } from '@/lib/bpmn/export';
import { applyNaming, namingContextOf } from '@/lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '@/lib/process-map';
import { buildNavigation } from '@/lib/process-navigation';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import { objectSites, sitesByElement } from '@/lib/process-overlays';
import { buildProcessDocumentation } from '@/lib/process-documentation-build';
import { buildProcessHandbook, handbookToData, type ProcessHandbookData } from '@/lib/process-handbook';
import { buildProcessDocument } from '@/lib/process-document-build';
import type { ProcessDocument } from '@/lib/process-document';
import { routeLabel } from '@/lib/sap-naming';
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
 * over `public/starter-examples/Z_MM_PO_APPROVAL.abap`, at request time. Nothing is
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

const DEMO_PATH = path.join(process.cwd(), 'public', 'starter-examples', DEMO_SOURCE_FILE);

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
  /** Always false, with `proven`. */
  mock: boolean;
  /** Always null: the demo records no test result from any system. */
  verifiedOutside: null;
  badge: string;
  detail: string;
}

/** One line of the deterministic transformation plan. */
export interface DemoPlanItem {
  findingId: string;
  title: string;
  lineStart: number;
  severity: EvidenceFinding['severity'];
  /**
   * This finding's target, against the demo's route: the released successor
   * where the catalog names one, the custom table where the code writes its
   * own, and only for a construct without an object the option on the
   * project's route (`findingTarget`). It used to be the finding's first
   * `targetOptions` entry, which is the in-app option for almost every kind —
   * so a side-by-side demo printed "Developer Extensibility / RAP" on every row.
   */
  target: string;
  targetKind: TargetKind;
  /** Whether the project's route is among the finding's options; null when the finding names an object. */
  routeFit: 'matches' | 'differs' | null;
  /** The engine's options for this kind of finding, all of them, in its order. */
  targetOptions: string[];
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
  /**
   * The catalog snapshot the demo's object states are read from — the one its
   * target profile names (`pce-latest` for the Private Edition assumption), as
   * a signed run of the same project would read it (owner decision 30.09.2026).
   */
  catalogSnapshot: string;

  analyze: {
    findings: EvidenceFinding[];
    summary: { criticalCount: number; highCount: number; mediumCount: number; lowCount: number; infoCount: number };
    coverage: CoverageReport;
    /** The engine's own sentence about what it did not check, or null. */
    caveat: string | null;
    /**
     * The router's score — `routeExtensibility` computes it with
     * `lib/clean-core-score.ts`, as `/api/runs/create` does for a signed run.
     */
    cleanCoreScore: number;
    /**
     * The score's deductions, by the same call the Analyze page makes
     * (`scoreBreakdown` over the findings and the kinds not assessed).
     * `buildDemoProject` refuses a breakdown that does not arrive at
     * `cleanCoreScore`, so the section can never explain another number.
     */
    scoreBreakdown: ScoreBreakdown;
    /**
     * Findings as the Analyze stage lists and counts them: one per pattern and
     * object, its lines gathered (`findingRows`). `findings.length` counts
     * occurrences — one per line a pattern was found on — and the two differ
     * whenever a pattern repeats on the same object (EBAN written at L246 and
     * L455 is one finding, two places). A signed run's worklist, the workspace
     * row and the Analyze head all count this way.
     */
    distinctFindings: number;
    /**
     * The source, LF, for the Analyze stage's program map and source panel —
     * the same bytes the demo workspace's code column shows.
     */
    source: string;
    /**
     * The clean core level of each finding that names an object, keyed by
     * `gradeKey(name, use)` — what `/api/abcd-classify` answers a real project
     * for the same target profile (the snapshot in `catalogSnapshot`). Looked
     * up here because the demo calls no route; not part of anything signed.
     */
    levels: Record<string, CloudReadinessGrade>;
    /** The routines the entry block calls, in call order — the program map's process steps. */
    processSteps: ProcessStepBand[];
    /**
     * The worklist a run of the example without a narrative stores — one item
     * per finding, all open (`findingsWorklist`). What the reader does with it
     * lives in the browser, like every other demo state.
     */
    worklist: WorklistItem[];
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
    /**
     * The process map and its handbook — the same reading a real project's
     * Documentation stage draws (owner decision 01.10.2026, proposal B), read
     * here on the server from the example file. No model is involved: the
     * plain names, chapters, rules and exceptions are all the engine's.
     * Null when the reader could not get through the file.
     */
    /** `document`: the process description the stage writes when it opens (ADR-077), or null if it could not be built. */
    process: { model: ProcessMapModel; handbook: ProcessHandbookData; document: ProcessDocument | null } | null;
  };

  testing: {
    /** All zero, and said out loud: no test in this demo has run. */
    verdicts: { total: number; passed: number; failed: number; withoutVerdict: number };
    manualAreas: DemoManualArea[];
    /** The program's routines (`FORM … ENDFORM`), for the Testing tool's program strip. */
    routines: Array<{ name: string; lineStart: number; lineEnd: number }>;
  };

  economics: {
    loc: number;
    /** The measured baseline the forecast needs. */
    scoreBefore: number;
  };

  delivery: {
    /** What a real handover would still be missing here, named rather than ticked. */
    missing: string[];
    /** The stage each line of `missing` is made in, index for index. */
    missingAt: PhaseKey[];
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
  return { n: p.n, key, label: p.label, path: key, state, done: state === 'done', proven: false, mock: false, verifiedOutside: null, badge, detail };
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
  // Counted as the Analyze stage counts them — one per pattern and object —
  // with the places in the code beside it, so the rail and the page agree.
  const f = demo.analyze.distinctFindings;
  const places = demo.analyze.findings.length;
  return [
    railStep(
      'analyze',
      'partial',
      'Demo run · unsigned',
      `${f} findings${places !== f ? ` at ${places} places in the code` : ''}, from the engine that ships with this release — and no signed run, because a demo may not produce one.`,
    ),
    railStep(
      'design',
      'partial',
      'Route proposed',
      `${routeLabel(demo.design.recommendedRoute)} proposed from the evidence. Confirming it here changes this browser and nothing else.`,
    ),
    railStep(
      'transformation',
      'partial',
      'Plan only',
      // Findings as everywhere else — one per pattern and object — not the
      // plan's lines, which are one per place in the code.
      `${findingRows(demo.analyze.findings).filter((r) => (r.finding.targetOptions ?? []).length > 0).length} findings with a target route. The transformed code is a model's work and the demo has none.`,
    ),
    railStep(
      'documentation',
      'partial',
      demo.documentation.process ? 'Read from the code' : 'Inventory only',
      `${demo.documentation.process ? `${demo.documentation.process.document ? 'A process description and ' : ''}${demo.documentation.process.handbook.chapters.length} handbook chapters read from the code, ` : ''}${demo.documentation.inventory.length} objects and ${demo.documentation.coupling.length} tables inventoried. The business layer comes from a model in a real run.`,
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

function planOf(findings: EvidenceFinding[], track: ProjectTrack): { plan: DemoPlanItem[]; unplanned: number } {
  const plan: DemoPlanItem[] = [];
  let unplanned = 0;
  for (const finding of findings) {
    if (!finding.targetOptions?.length) {
      unplanned += 1;
      continue;
    }
    const target = findingTarget(finding, track);
    plan.push({
      findingId: finding.id,
      title: finding.title,
      lineStart: finding.lineStart,
      severity: finding.severity,
      target: target.label,
      targetKind: target.kind,
      routeFit: target.routeFit,
      targetOptions: [...finding.targetOptions],
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
/** Where each line of `missingForHandover()` is made, in the same order. */
const MISSING_AT: PhaseKey[] = ['analyze', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

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
/** The map and the handbook of the demo source, exactly as the stage builds them. */
function demoProcess(source: string): DemoProject['documentation']['process'] {
  try {
    const { bpmn, technical } = buildReadingExports(source, { processName: DEMO_PROJECT_TITLE, sourceFileName: DEMO_SOURCE_FILE });
    const full = buildProcessMapModel({
      bpmn,
      technical,
      named: applyNaming(namingContextOf(source), null, 'no-key'),
      fileName: DEMO_SOURCE_FILE,
    });
    const nav = buildNavigation(full);
    const calls = readCallGraph(source);
    const sites = sitesByElement(full, nav, objectSites(readTableDependencies(source), calls), calls);
    const engine = buildProcessDocumentation({ source, map: full });
    const handbook = buildProcessHandbook({
      model: full,
      nav,
      doc: engine,
      rules: deriveBusinessRules(source),
      sites,
      source,
    });
    // The technical file is the toggle's; the demo draws the plain reading only.
    const model: ProcessMapModel = { ...full, technicalXml: undefined };
    // The process description a real project's Documentation stage writes when it
    // opens (ADR-077) — the same builder over the same source, no narrative.
    let document: ProcessDocument | null = null;
    try {
      document = buildProcessDocument({ source, map: full, engine });
    } catch {
      document = null;
    }
    return { model, handbook: handbookToData(handbook), document };
  } catch {
    return null;
  }
}

/**
 * What the Analyze object page needs on top of the evidence, derived exactly as
 * the real page derives it (`app/(app)/project/[projectId]/analyze/page.tsx`):
 * the score breakdown, the rows it counts, the levels it looks up, the process
 * steps behind its program map — on the server, because the demo calls no route.
 */
function analyzeViewOf(
  rawSource: string,
  evidence: ReturnType<typeof buildAbapEvidence>,
  snapshot: string,
): Pick<DemoProject['analyze'], 'scoreBreakdown' | 'distinctFindings' | 'source' | 'levels' | 'processSteps' | 'worklist'> {
  const source = rawSource.replace(/\r\n/g, '\n');
  const rows = findingRows(evidence.findings);
  const levels: Record<string, CloudReadinessGrade> = {};
  for (const r of rows) {
    if (!r.finding.objectName) continue;
    const name = r.finding.objectName.trim().toUpperCase();
    const use = accessUseOfKind(r.finding.kind);
    const key = gradeKey(name, use);
    if (!levels[key]) levels[key] = gradeSapObjectUse(name, use, snapshot).grade;
  }
  let processSteps: ProcessStepBand[] = [];
  try {
    processSteps = processStepBands(readProcess(source).skeleton, source);
  } catch {
    processSteps = [];
  }
  const coverage = evidence.coverage;
  return {
    scoreBreakdown: scoreBreakdown(evidence.findings, coverage && !coverage.complete ? coverage.gaps.length : 0),
    distinctFindings: rows.length,
    source,
    levels,
    processSteps,
    worklist: findingsWorklist(evidence.findings, DEMO_SOURCE_FILE) as unknown as WorklistItem[],
  };
}

export function buildDemoProject(): DemoProject {
  const source = fs.readFileSync(DEMO_PATH, 'utf8');
  const lines = source.split(/\r?\n/);
  const linesOfCode = lines.filter((l) => l.trim() && !/^\s*\*/.test(l)).length;

  // The catalog of the demo's target profile, not the default list: the demo
  // assumes the Private Edition, and a run of it would read the PCE snapshot.
  const catalogSnapshot = catalogSnapshotKeyForProject({ s4Deployment: DEMO_DEPLOYMENT });
  const evidence = buildAbapEvidence(source, DEMO_SOURCE_FILE, DEMO_DEPLOYMENT, catalogSnapshot);
  const route = routeExtensibility(evidence, DEMO_DEPLOYMENT);
  const { plan, unplanned } = planOf(evidence.findings, trackOfRoute(route.recommendedRoute));
  const analyzeView = analyzeViewOf(source, evidence, catalogSnapshot);
  // The score the page explains is the score the router computed — by the same
  // table (`lib/clean-core-score.ts`). Should the two ever part, the demo would
  // explain a number it does not show; it is refused instead.
  if (analyzeView.scoreBreakdown.score !== route.cleanCoreScore) {
    throw new Error(
      `The demo's score breakdown arrives at ${analyzeView.scoreBreakdown.score}, the router computed ${route.cleanCoreScore}. ` +
        'Both read lib/clean-core-score.ts; one of them no longer reads the same findings.',
    );
  }

  const withoutRail: Omit<DemoProject, 'rail'> = {
    isDemo: true,
    signed: false,
    title: DEMO_PROJECT_TITLE,
    objectName: DEMO_OBJECT_NAME,
    subject: DEMO_SUBJECT,
    sourceFile: DEMO_SOURCE_FILE,
    deployment: DEMO_DEPLOYMENT,
    totalLines: countSourceLines(source),
    linesOfCode,
    catalogVersion: getMergedCatalogVersion(),
    catalogSnapshot,
    analyze: {
      findings: evidence.findings,
      summary: evidence.summary,
      coverage: evidence.coverage,
      caveat: coverageCaveat(evidence.coverage),
      cleanCoreScore: route.cleanCoreScore,
      ...analyzeView,
      complexityScore: computeComplexityScore(source),
      criticalityScore: computeCriticalityScore(source),
    },
    design: route,
    transformation: { plan, unplanned },
    documentation: {
      inventory: extractCodeInventory(source),
      coupling: extractDataCoupling(source),
      process: demoProcess(source),
    },
    testing: {
      verdicts: { total: 0, passed: 0, failed: 0, withoutVerdict: 0 },
      manualAreas: evidence.coverage.unassessed.map((u) => ({
        label: u.label,
        why: u.why,
        line: u.line,
      })),
      routines: readCallGraph(source).forms.map((f) => ({ name: f.name, lineStart: f.lineStart, lineEnd: f.lineEnd })),
    },
    // The same line count the Economics stage of a real project models on -
    // not the code-only count above, which made the demo say 550 where every
    // other screen says 668 (lib/source-lines.ts).
    economics: { loc: countSourceLines(source), scoreBefore: route.cleanCoreScore },
    delivery: { missing: missingForHandover(), missingAt: MISSING_AT },
  };

  const demo: DemoProject = { ...withoutRail, rail: buildRail(withoutRail) };

  // The invariant, executed rather than trusted. A demo that carries a run id,
  // a signature or an account is a forgery whatever the banner above it says, so
  // the page must not render at all rather than render one.
  assertNoTrustChain(demo);

  return demo;
}
