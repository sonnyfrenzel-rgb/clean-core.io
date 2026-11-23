'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import TestingProgress from '@/components/testing/TestingProgress';
import { useProjectEvidence } from '@/hooks/useProjectEvidence';
import { findingsForOrigin, signedForOrigin, useScenarioOriginEngine } from '@/hooks/useScenarioOrigins';
import { useTestExecution } from '@/hooks/useTestExecution';
import { useSignedInUid } from '@/components/workspace/BusinessRulesEditor';
import type { Project } from '@/lib/types';
import { ArrowRight, Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, AlertTriangle } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import PageAnchorBar from '@/components/PageAnchorBar';
import { PAGE_ANCHOR_LABELS, testingAnchors } from '@/lib/page-anchors';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcCard from '@/components/cc/Card';
import CcDisclosure from '@/components/cc/Disclosure';
import { provenance } from '@/lib/provenance';
// The runner executes against mocks only, so a pass is "Demonstrated · mock", never "Proven".
const RUNNER_PASS = provenance('demonstrated-mock').label;
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { clsx } from 'clsx';
import StageFooter from '@/components/StageFooter';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });


import { saveAs } from '@/lib/fileSaver';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import NotGenerated from '@/components/NotGenerated';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { workflowSteps, generationBlockers, generationPrerequisites, previousBasis, testsPreviousBasis } from '@/lib/workflow-steps';
// Roadmap 3.0.19: a key-user decision writes no test code; the step list's acceptance checks are its tests.
import KeyUserSteps from '@/components/keyuser/KeyUserSteps';
import KeyUserChecksRecord from '@/components/keyuser/KeyUserChecksRecord';
import { keyUserAcceptanceReading } from '@/lib/key-user-acceptance';
import { useKeyUserSteps } from '@/hooks/useKeyUserSteps';
import { isKeyUserDecision } from '@/lib/key-user-route';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import StaleNotice from '@/components/StaleNotice';
import { STORED_TEST_SUITE_REJECTED } from './test-suite-schema';
import ToolSection from '@/components/testing/ToolSection';
import TestPipeline from '@/components/testing/TestPipeline';
import HandChecks from '@/components/testing/HandChecks';
import type { StripTick } from '@/components/testing/ProgramStrip';
import { readProgram } from '@/components/testing/program-reading';
import { coveringTestRunReceipt, OWNER_EDITED_SUITE_NOTE, viaContractOfRun } from '@/lib/test-receipt';
import { normaliseSeverity } from '@/lib/severity';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import CounterChecks from '@/components/testing/CounterChecks';
import { aiAuthorshipFactsOf, testCaseOrigin, testCasesAuthorshipOf } from '@/lib/ai-authorship';
import { aiMarkingStatement } from '@/lib/ai-marking';
import { APP_VERSION } from '@/lib/version';
import { countsLine, lastRun, scenarios } from '@/components/testing/testing-summary';
import TestingClosureCard from '@/components/testing/TestingClosureCard';
import { CLOSED_NOT_VERIFIED, failureSentence, testingClosureReading } from '@/lib/testing-closure';
import { isAbapUnitRoute, ABAP_UNIT_NOT_RUNNABLE } from '@/lib/test-runnability';
import ScenarioList, { type ScenarioCase, type ScenarioOutsideResult, type ScenarioRunResult } from '@/components/testing/ScenarioList';
import SapResultCard from '@/components/testing/SapResultCard';
import { outsideCountsLine, outsideReading, summaryOf, type OutsideTestRecord } from '@/lib/sap-test-results';
import { isProjectOwner } from '@/lib/project-readers';
import ReplaceStoredBox from '@/components/ReplaceStoredBox';
import { wt } from '@/lib/workspace-messages';
import { targetEditionOf } from '@/lib/target-edition';
import TestEvidenceCard from '@/components/testing/TestEvidenceCard';
import AbapUnitEvidence from '@/components/testing/AbapUnitEvidence';
import { useMaterialRules } from '@/hooks/useMaterialRules';
import { useProcessStates } from '@/hooks/useProcessStates';
import { ruleEntries } from '@/lib/rules-editor';
import { assessCase, countAssessments, ruleCoverage, ruleTraceOf, type CaseAssessmentReading } from '@/lib/testing-rule-trace';
import { invariantPlan } from '@/lib/testing-invariants';
import { countEngineCases, engineCaseOf } from '@/lib/testing-engine-cases';
import { abapTestSentencesOfProject } from '@/lib/testing-abap-unit';
import { callContractPresence, notRunWithoutContract } from '@/lib/engine-call-contract';
import { sandboxFilesFromStoredCode } from '@/lib/test-sandbox/files';
import { probeBasis } from '@/lib/testing-mutation';
import AnswerCard from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import { familyTitleOf } from '@/lib/family-title';
import { notProvenItems, testingAnswer } from '@/lib/testing-answer';
import RuleResults, { type CaseResult, type RuleCaseRow, type RuleRow } from '@/components/testing/RuleResults';
import WhereItRan from '@/components/testing/WhereItRan';
import NotProvenList from '@/components/testing/NotProvenList';

const renderSafeValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'object') {
        try {
          return JSON.stringify(item);
        } catch (e) {
          return String(item);
        }
      }
      return String(item);
    }).join('\n');
  }
  if (typeof val === 'object') {
    try {
      return typeof val.toString === 'function' && val.toString() !== '[object Object]' 
        ? val.toString() 
        : JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  }
  return String(val);
};

/**
 * Excel's own rules for a worksheet name, applied before ExcelJS can throw over
 * them.
 *
 * The detail sheets were named `renderSafeValue(tc.id).slice(0, 30)` — a string
 * the model wrote, handed to `addWorksheet` untouched. ExcelJS throws on the
 * five characters Excel forbids plus the two bracket characters, on an empty
 * name, on the reserved name `History`, and on a name already in the workbook.
 * Any one of those ended the whole export in a `catch` that wrote to the
 * console: no file, no message, a button that looked broken. A test case id of
 * `FI/AP-01` or two cases sharing an id is all it took.
 *
 * So the name is repaired rather than trusted, and the repair is deliberately
 * visible: a replaced character stays as `-` in the tab so the reader can see
 * the name is not quite the id.
 */
const excelSheetName = (raw: string, fallback: string, taken: Set<string>): string => {
  // * ? : / \ [ ] — Excel's forbidden set, exactly as `exceljs` tests for it.
  // The 31-character cap comes before the apostrophe strip and not after:
  // cutting a long name can leave a quote as its last character, which is its
  // own refusal.
  let name = String(raw ?? '').replace(/[*?:/\\[\]]/g, '-').trim().slice(0, 31).replace(/^'+|'+$/g, '').trim();
  if (!name || name.toLowerCase() === 'history') {
    name = String(fallback || 'Sheet').slice(0, 31).replace(/^'+|'+$/g, '').trim() || 'Sheet';
  }

  let candidate = name;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
};

/**
 * Whether running the suite would test something other than the current
 * source: the suite itself is stale, or the code it runs against is
 * (`generationBlockers`). The stale notice at the top of the page names which.
 */
const testRunBlocked = (project: Project | null): boolean =>
  generationBlockers(project, 'testing').length > 0 ||
  workflowSteps(project).find((p) => p.key === 'testing')?.state === 'stale';

/** Main column and a 360 px side column, as in proposal A; one column below `lg`. */
/** Reads of the SAP result record before the page says it failed, and the pause that grows between them. */
const SAP_RECORD_READS = 3;
const SAP_RECORD_BACKOFF_MS = 800;
const RAIL_GRID = 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start';

export default function TestingSandboxPage() {
  const { projectId } = useParams();
  const router = useRouter();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /** An export that fails has to say so on the page; see `exportTestCasesToExcel`. */
  const [exportError, setExportError] = useState('');
  const [selectedTestCases, setSelectedTestCases] = useState<number[]>([]);

  /**
   * Owner decision 03.10.2026: a scenario states where in the legacy source it
   * comes from, and that statement is checked against the source the active
   * run signed — its rules and decision points derived here, its findings read
   * by the server with the run's catalog.
   */
  const originSha = useMemo(() => signedForOrigin(project).signed?.sha256 ?? null, [project]);
  const originEvidence = useProjectEvidence(projectId as string, !!originSha, `${project?.activeRunId ?? ''}#${originSha ?? ''}`);
  const originFindings = useMemo(() => findingsForOrigin(originEvidence, originSha), [originEvidence, originSha]);
  const originEngine = useScenarioOriginEngine(project, originFindings);
  /** Roadmap 3.0.19: the key-user steps as acceptance checks (`whole`: the decision is key user, no suite at all). */
  const keyUserSteps = useKeyUserSteps(projectId as string, project);
  const keyUserWhole = isKeyUserDecision(project);
  /**
   * Roadmap 3.0.17 (AI Act Art. 50(2)): the statement the suite download carries as its header comment and the
   * Excel export as its description — null when no model wrote what they hold (`lib/ai-authorship.ts`).
   */
  const aiStatements = useMemo(() => {
    if (!project) return { suite: null, cases: null, casesAuthorship: null };
    const tests = aiAuthorshipFactsOf(project, { documentationFromEngine: true }).tests;
    const cases = testCasesAuthorshipOf(project);
    return {
      suite: tests ? aiMarkingStatement(tests, APP_VERSION) : null,
      cases: cases ? aiMarkingStatement(cases, APP_VERSION) : null,
      // 3.0.21 (T08): who wrote the scenarios, for the per-row origin of the Excel export.
      casesAuthorship: cases,
    };
  }, [project]);
  const { isGenerating, testCases, generateTestCases, storedSuiteRejected, retrying: genRetrying, progress: genProgress } = useTestGeneration(projectId as string, project, setProject, originFindings);
  /** Why the last generation attempt produced nothing. Empty when none has failed. */
  const [genError, setGenError] = useState('');
  /**
   * The project as the run sees it: always against mocks. An earlier build
   * stored the tenant tab as `s4Environment: 'live'`, and with that value the
   * hook refuses the run as locked — so a project left on that tab would
   * have had a Run button that could never run, and no switch left to undo
   * it. The value stays as stored; the run does not read it from here.
   */
  const runProject = useMemo<Project | null>(
    () => (project && project.s4Environment === 'live' ? { ...project, s4Environment: 'mock' } : project),
    [project],
  );
  const { isRunning, testResults, engineViaContract, sandboxOutput, aiExplanation, runTestCases, stubbedPackages, runError, probe, probeMutants } = useTestExecution(projectId as string, runProject, setProject);
  /**
   * 3.0.10 (owner 11.10.2026, external review F-01/F-02/F-05) — the material
   * business rules of the signed source, the owner's decisions on them
   * (keep / change deliberately / drop / clarify), and the shared-selection
   * invariant read from the generated routes: what each case's "old against
   * new" and the suite's rule coverage are read against.
   */
  const originSource = useMemo(() => signedForOrigin(project).signed?.source ?? null, [project]);
  const materialRuleRead = useMaterialRules(originSource, engineVersionOfProject(project));
  const { outcome: ruleStatesOutcome } = useProcessStates(projectId as string, !!originSource);
  const ruleStates = useMemo(() => {
    const entries = ruleEntries(ruleStatesOutcome && ruleStatesOutcome.ok ? ruleStatesOutcome.view : null);
    return new Map(Object.entries(entries).map(([id, entry]) => [id, entry.state]));
  }, [ruleStatesOutcome]);
  const generatedCodeText = typeof project?.generatedCode === 'string' ? project.generatedCode : null;
  const sharedSelection = useMemo(() => invariantPlan(generatedCodeText), [generatedCodeText]);
  // 3.0.13 (6): read once per stored package and suite, not on every render.
  // 3.0.18 item 13: "passed in SAP" is the SAP result on record for this package, when there is a current one —
  // the same sentences STATUS.md carries (`testFactsOf`).
  const abapUnitEvidence = useMemo(() => abapTestSentencesOfProject(project), [project]);
  /** 3.0.12 — does the generated code export the call contract the engine cases run against? Read, never run. */
  const callContract = useMemo(() => callContractPresence(sandboxFilesFromStoredCode(generatedCodeText ?? '')), [generatedCodeText]);
  const [showTestCode, setShowTestCode] = useState(false);
  /**
   * ADR-075 — the full record of a result from the reader's own SAP system
   * (`test_results/current`, per-scenario results and unmatched methods). The
   * summary the phase contract reads is on the project document already.
   */
  const [sapRecord, setSapRecord] = useState<OutsideTestRecord | null>(null);
  /** The run console is folded until a run (or the reader) opens it. */
  const [showConsole, setShowConsole] = useState(false);
  /** Rules with acceptance checks, as `CounterChecks` reads them — the count of the "On this page" bar. */
  const [acceptanceCount, setAcceptanceCount] = useState<number | null>(null);
  useEffect(() => {
    const fetchProject = async () => {
      // Without the catch, a rejected load left the page on "Loading" for good
      // and the rejection unhandled.
      try {
        const data = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(data, projectId as string)) return;
        if (data) {
          setProject(data);
        } else {
          setLoadError('This project could not be found.');
        }
      } catch (err) {
        console.error('Failed to load project:', err);
        setLoadError('The project could not be loaded. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  // A saved suite opens fully selected, as a freshly generated one does. Once the suite showed after a reload,
  // an empty selection left "Run Selected" disabled with nothing saying a tick was needed. Only the
  // first time the suite appears: a selection the reader changes afterwards stays theirs.
  const selectionSeeded = useRef(false);
  useEffect(() => {
    if (selectionSeeded.current || testCases.length === 0) return;
    selectionSeeded.current = true;
    setSelectedTestCases((prev) => (prev.length ? prev : testCases.map((_, i) => i)));
  }, [testCases]);

  /**
   * What generating the scenarios needs and does not have yet (owner report
   * 03.10.2026, the Transformation agent's finding): the button was
   * enabled, its click returned without a word when an input was stale, and
   * nothing checked for generated code or a design, so the prompt could carry
   * `undefined`. Each missing input is now a sentence with one action beside
   * the button, the button is disabled while one is missing, and an enabled
   * click always either starts (busy) or says why it did not.
   */
  const generatePrerequisites = generationPrerequisites(project, 'testing');
  const generateStale = generationBlockers(project, 'testing').length > 0;
  const generateBlocked = keyUserWhole || generatePrerequisites.length > 0 || generateStale;

  const handleGenerate = async () => {
    // Defensive: the button is disabled in both cases, and says why beside it.
    if (generateBlocked) {
      setGenError(
        generatePrerequisites.length > 0
          ? generatePrerequisites.map((p) => p.reason).join(' ')
          : 'The inputs were built for a previous source; the notice at the top of the page names the stage to regenerate first.',
      );
      return;
    }
    // Nor while the testing model stage is off or has no key: the proxy refuses
    // it, and "Regenerate Suite" used to start that request anyway.
    if (!modelAvailability.enabled('testing')) {
      setGenError(
        modelAvailability.keyAvailable
          ? 'Generating is off: turn the testing stage back on in Settings.'
          : 'Generating needs a model key: add your own Gemini API key in Settings.',
      );
      return;
    }
    setGenError('');
    try {
      const result = await generateTestCases();
      // An answer without a scenario is refused in the hook, before the write.
      if (result && result.testCases) {
        setSelectedTestCases(result.testCases.map((_: any, i: number) => i));
      }
    } catch (error) {
      // The console was the only place this went. A refused generation leaves
      // the page exactly as it was, which from the reader's side is a button
      // that does nothing — so the reason now stands next to the button
      // (roadmap 17.2), the way the documentation stage already does it.
      console.error("Failed to generate test cases:", error);
      setGenError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRun = async () => {
    // A suite written for a previous source tests nothing about the current one,
    // and neither does one built on stale upstream code — the notice at the top
    // of the page says which stage to regenerate.
    if (testRunBlocked(project)) return;
    const selected = testCases.filter((_, i) => selectedTestCases.includes(i));
    setShowConsole(true);
    try {
      await runTestCases(selected);
    } catch (error) {
      console.error("Failed to run test cases:", error);
    }
  };

  /**
   * A scenario's last verdict, from the same record as the facet tiles: the
   * covering receipt when there is one, else this session's run. Never the
   * status string stored on the case — a browser can write that.
   */
  const receiptVerdicts = new Map((coveringTestRunReceipt(project)?.verdicts ?? []).map((v) => [v.id, v.status as string]));
  const sessionVerdicts = new Map((testResults ?? []).map((r) => [String(r.id ?? ''), r.status as string | undefined]));
  /**
   * 3.0.12 — the cases whose verdict the call contract gave in the isolated
   * runner (no model-written assertion): from the covering receipt for a
   * recorded run, or for this session's run from the server's answer. Never
   * from a test title: a model-written test can carry the marker.
   */
  const viaContract = viaContractOfRun(lastRun(project, testResults).kind, coveringTestRunReceipt(project), engineViaContract);
  const verdictOf = (tc: { id?: unknown }): string | null => {
    const id = String(tc.id ?? '');
    const v = run.kind === 'recorded' ? receiptVerdicts.get(id) : run.kind === 'session' ? sessionVerdicts.get(id) : undefined;
    return v ?? null;
  };
  /**
   * A scenario's last mock-run result for its details: the verdict as above,
   * and the runner's message — from this session's run, or the one
   * `/api/run-tests` stored on the case beside the receipt that covers it.
   */
  const sessionMessages = new Map((testResults ?? []).map((r) => [String(r.id ?? ''), r.message]));
  const scenarioResultOf = (tc: ScenarioCase): ScenarioRunResult => {
    const verdict = verdictOf(tc);
    if (!verdict) return { verdict: null, message: null };
    const id = String(tc.id ?? '');
    const message = run.kind === 'session' ? sessionMessages.get(id) : run.kind === 'recorded' ? tc.message : null;
    return { verdict, message: typeof message === 'string' && message.trim() ? message : null };
  };


  const toggleTestCase = (index: number) => {
    setSelectedTestCases(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const exportTestCasesToExcel = async () => {
    setExportError('');
    try {
      if (!testCases || testCases.length === 0) return;

      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      // Roadmap 3.0.17 (AI Act Art. 50(2)): the workbook's description carries the statement — a spreadsheet has no comment.
      if (aiStatements.cases) wb.description = aiStatements.cases;

      // The names of the sheets already in the workbook, lower-cased — Excel
      // treats two names as the same if they differ only in case, and ExcelJS
      // refuses the second one.
      const takenSheetNames = new Set<string>();

      // 1. Summary sheet
      const wsSummary = wb.addWorksheet(excelSheetName("Test Suite Summary", "Summary", takenSheetNames));
      wsSummary.columns = [
        { header: 'ID', key: 'ID', width: 15 },
        { header: 'Name', key: 'Name', width: 35 },
        { header: 'Priority', key: 'Priority', width: 15 },
        { header: 'Status', key: 'Status', width: 15 },
        // 3.0.21 (T08): a scenario the model wrote says so in its row; a case the engine built leaves these empty.
        { header: 'Origin', key: 'Origin', width: 12 },
        { header: 'AI provider', key: 'AIProvider', width: 18 },
        { header: 'AI model (as stated by the system)', key: 'AIModel', width: 34 }
      ];
      
      testCases.forEach(tc => {
        const origin = testCaseOrigin(tc, aiStatements.casesAuthorship);
        wsSummary.addRow({
          ID: renderSafeValue(tc.id) || 'N/A',
          Name: renderSafeValue(tc.name) || 'Untitled',
          Priority: renderSafeValue(tc.priority) || 'Medium',
          Status: 'Pending',
          Origin: origin ? origin.origin : '',
          AIProvider: origin ? origin.provider : '',
          AIModel: origin ? origin.model : ''
        });
      });

      // 2. Detail sheets
      testCases.forEach((tc, index) => {
        const safeId = renderSafeValue(tc.id) || `TC_${index}`;
        const wsDetail = wb.addWorksheet(excelSheetName(safeId, `TC_${index + 1}`, takenSheetNames));
        
        wsDetail.addRow(["Test Case ID", safeId]);
        wsDetail.addRow(["Test Case Name", renderSafeValue(tc.name) || 'Untitled']);
        wsDetail.addRow(["Priority", renderSafeValue(tc.priority) || 'Medium']);
        const origin = testCaseOrigin(tc, aiStatements.casesAuthorship);
        if (origin) wsDetail.addRow(["Origin", `AI-generated · provider ${origin.provider} · model ${origin.model}`]);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Description", renderSafeValue(tc.description) || '']);
        wsDetail.addRow(["Preconditions", renderSafeValue(tc.preconditions) || '']);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Test Steps", ""]);
        
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        steps.forEach((s: any, i: number) => {
          wsDetail.addRow([`Step ${i+1}`, renderSafeValue(s) || '']);
        });
        
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Expected Result", renderSafeValue(tc.expectedResult) || '']);
        wsDetail.addRow(["Test Data", renderSafeValue(tc.testData) || 'N/A']);
        wsDetail.addRow(["Validation Points", renderSafeValue(tc.validationPoints) || 'N/A']);
      });

      // 3. Generate file buffer and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const projectName = project?.name?.replace(/\s+/g, '_') || 'Project';
      await saveAs(blob, `${projectName}_Test_Suite.xlsx`);
    } catch (err) {
      // The console was the only place this ever went. The button did nothing,
      // no file arrived, and the reader had no way to tell a refused download
      // from a browser that had swallowed it — so the failure is said out loud
      // now, next to the button that caused it.
      console.error("Excel export failed:", err);
      setExportError('The Excel export could not be produced. Please try again, and tell us if it keeps failing.');
    }
  };

  /** ABAP Cloud route: the suite is an ABAP Unit class, which nothing here can run (`lib/test-runnability.ts`). */
  const isAbapCloud = isAbapUnitRoute(project);
  /** ADR-075 — the result from the reader's own SAP system, as the phase contract reads it. */
  const outside = outsideReading(project);
  const outsideRecordedAt = outside.state === 'none' ? null : outside.summary.recordedAt;
  // Read through the auth store, not in render: on the server there is no auth (HTTP 500 on SSR otherwise).
  const signedInUid = useSignedInUid();
  const canRecordOutside = isProjectOwner(project, signedInUid);
  /**
   * Writing and running the suite are the owner's too — the server refuses
   * them for an invited reader, who sees the buttons disabled and the shared
   * sentence instead (ADR-083, decision-input audit item 4).
   */
  const isOwner = canRecordOutside;
  const reader = project !== null && !isOwner;
  /** "Replace the test suite?" is open (ADR-083, audit item 3). */
  const [replaceSuiteAsk, setReplaceSuiteAsk] = useState(false);
  /**
   * Whether the full record could be read. A transient failure used to be
   * logged and never retried, and the scenario rows stayed without their
   * results for the session. Now the read is retried twice
   * with a growing pause, and a read that still fails says so with a Retry —
   * the rows are never left looking as if there were no result.
   */
  const [sapRecordRead, setSapRecordRead] = useState<'idle' | 'reading' | 'failed'>('idle');
  /** Bumped by the Retry button: a new round of attempts. */
  const [sapReadRound, setSapReadRound] = useState(0);
  useEffect(() => {
    if (!isAbapCloud || !outsideRecordedAt) return undefined;
    let live = true;
    (async () => {
      setSapRecordRead('reading');
      for (let attempt = 0; attempt < SAP_RECORD_READS; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, SAP_RECORD_BACKOFF_MS * attempt));
        if (!live) return;
        try {
          const token = await getAuth().currentUser?.getIdToken();
          if (!token) throw new Error('Not signed in.');
          const res = await fetch(`/api/projects/${encodeURIComponent(String(projectId))}/test-results`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = (await res.json().catch(() => null)) as { record?: OutsideTestRecord | null } | null;
          if (!res.ok || !body || !('record' in body)) throw new Error(`HTTP ${res.status}`);
          if (!live) return;
          if (body.record) setSapRecord(body.record);
          setSapRecordRead('idle');
          return;
        } catch (err) {
          // The summary on the project still drives the phase; only the per-scenario chips wait.
          console.error(`The test results from your SAP system could not be read (attempt ${attempt + 1} of ${SAP_RECORD_READS}):`, err);
        }
      }
      if (live) setSapRecordRead('failed');
    })();
    return () => {
      live = false;
    };
  }, [isAbapCloud, outsideRecordedAt, projectId, sapReadRound]);
  /** The record the server answered with, folded into the project the page holds. */
  const onOutsideRecorded = (record: OutsideTestRecord) => {
    setSapRecord(record);
    setProject((prev) => (prev ? { ...prev, outsideTestResult: summaryOf(record) } : prev));
  };
  /** Per scenario: the imported result, or the confirmation for the class — only while it is current. */
  const outsideOf = (index: number): ScenarioOutsideResult | null => {
    if (outside.state !== 'current') return null;
    if (outside.summary.kind === 'confirmed') {
      return { kind: 'confirmed', classPassed: outside.verifies, at: outside.summary.recordedAt };
    }
    if (!sapRecord || sapRecord.recordedAt !== outside.summary.recordedAt) return null;
    const r = sapRecord.results[index];
    return r ? { kind: 'imported', outcome: r.outcome, message: r.message, at: sapRecord.recordedAt } : null;
  };

  /** The engine's coverage report and the program's routines, read from the source on the project. */
  const program = useMemo(() => readProgram(project?.legacyCode), [project?.legacyCode]);
  /**
   * The findings for the strip's ticks. The evidence engine carries the SAP
   * catalog, so it is loaded after the page rather than in its bundle; until it
   * arrives the strip shows the routines and the hand-check marks only.
   */
  // Keyed by every input of the evidence below — source, file name, target
  // edition and the signed run's engine — so a run of another engine over the
  // same source never shows the last run's findings while the new ones are
  // computed.
  const [tickState, setTickState] = useState<{
    code: string;
    file: string;
    deployment: ReturnType<typeof targetEditionOf>;
    engine: string | null;
    ticks: StripTick[];
  } | null>(null);
  const evidenceFile = project?.auditMetadata?.inputFingerprint?.fileName || 'main.abap';
  const evidenceDeployment = targetEditionOf(project?.s4Deployment);
  /** The engine of the signed run (roadmap 3.0.12): an older run keeps the findings it signed. */
  const evidenceEngine = engineVersionOfProject(project);
  useEffect(() => {
    const code = project?.legacyCode;
    if (typeof code !== 'string' || !code.trim()) return undefined;
    let live = true;
    import('@/lib/abap/evidence-model')
      .then(({ buildAbapEvidence }) => {
        if (!live) return;
        const report = buildAbapEvidence(code, evidenceFile, evidenceDeployment, undefined, evidenceEngine);
        setTickState({
          code,
          file: evidenceFile,
          deployment: evidenceDeployment,
          engine: evidenceEngine,
          ticks: report.findings.flatMap((f) => {
            const severity = normaliseSeverity(f.severity);
            return severity ? [{ id: f.id, line: f.lineStart, severity, title: f.title }] : [];
          }),
        });
      })
      .catch((err) => {
        // The strip still shows the routines and the hand-check marks.
        console.error('The evidence engine could not be loaded for the program strip:', err);
      });
    return () => {
      live = false;
    };
  }, [project?.legacyCode, evidenceFile, evidenceDeployment, evidenceEngine]);
  /** Ticks only for the source, file, edition and engine they were computed from. */
  const findingTicks: StripTick[] =
    tickState &&
    tickState.code === project?.legacyCode &&
    tickState.file === evidenceFile &&
    tickState.deployment === evidenceDeployment &&
    tickState.engine === evidenceEngine
      ? tickState.ticks
      : [];

  // The recorded key-user checks count for the step list as it is built now.
  const phases = workflowSteps(project, { keyUserList: keyUserSteps.state === 'ready' ? keyUserSteps.list : null });
  /** The last run, from the receipt on the project or this session — never assumed. */
  const run = lastRun(project, testResults);
  /** ADR-094 — testing closed by the owner without a passing run. */
  const testsClosed = testingClosureReading(project).state === 'current';
  /**
   * 3.0.10 — per case: unchanged (invariant cases) / passed against a
   * model-stated expectation / deliberately changed / defect / not yet
   * assessable, from the verdict of the last run (receipt or session) and the
   * owner's decision on the traced rule. Default: not yet assessable.
   */
  const assessmentOf = (tc: ScenarioCase): CaseAssessmentReading => {
    // 3.0.12 — an engine case: its expectation is the engine's, from the original's declaration or check.
    const engineCase = engineCaseOf(tc);
    const ruleId = ruleTraceOf(tc)?.ruleId ?? engineCase?.trace.ruleId ?? null;
    const verdict = verdictOf(tc);
    if (engineCase && (!verdict || verdict === 'Not run') && !callContract.present) {
      return {
        value: 'not-assessable',
        sentence: `${notRunWithoutContract(isAbapCloud ? 'abap' : 'node', callContract)}, and the suite has no verdict for it.`,
      };
    }
    return assessCase({
      trace: ruleTraceOf(tc),
      verdict: verdictOf(tc),
      ruleState: ruleId ? ruleStates.get(ruleId) ?? null : null,
      invariant: tc.invariant === true,
      engine: engineCase
        ? {
            ruleId: engineCase.trace.ruleId ?? null,
            expected: engineCase.examples.map((e) => `${e.input} → ${e.expected}`).join('; ').slice(0, 300),
            // Through the call contract in the isolated runner (no model in the loop), or from the
            // model's own test for the case — an extra check whose failure is not a confirmed defect.
            via: viaContract.has(String(tc.id ?? '')) ? ('contract' as const) : ('model-assertion' as const),
          }
        : null,
    });
  };
  const coveringReceipt = coveringTestRunReceipt(project);
  const caseIdsForProbe = testCases.map((tc) => String(tc.id ?? '')).filter(Boolean);
  const probeBasisReading = probeBasis(coveringReceipt, caseIdsForProbe);
  const evidence = {
    coverage: materialRuleRead.rules
      ? ruleCoverage(materialRuleRead.rules, testCases as unknown as Array<Record<string, unknown>>, originEngine.engine, materialRuleRead.all)
      : null,
    coverageNote: !originSource
      ? 'No signed source is on this project, so the rules of the original cannot be read.'
      : materialRuleRead.failed
        ? 'The rules of the original could not be read from the signed source.'
        : 'The rules of the original are being read from the signed source.',
    assessments: testCases.length > 0 ? countAssessments(testCases.map((tc) => assessmentOf(tc as unknown as ScenarioCase).value)) : null,
    /** 3.0.12 — engine cases and model cases, counted apart. */
    /** 3.0.13 — on the ABAP route: which test methods are tests, and the original's demo cases carried over. */
    abapUnit: abapUnitEvidence,
    caseOrigins: testCases.length > 0 ? countEngineCases(testCases as unknown as Array<Record<string, unknown>>) : null,
    mutation: coveringReceipt?.mutation ?? probe.report,
    probeBasis: probeBasisReading.ok ? null : probeBasisReading.reason,
  };

  // Block D (D.17a): one vocabulary of surfaces and type for the whole stage —
  // DESIGN.md §1.1–§1.4. A card is the workspace card, a field is the field, a
  // label is the micro label; nothing here picks its own colour any more.
  // Fields are the library's `CcField` (D.17b), so they have no class here.
  const CARD = 'bg-cc-surface border border-cc-line rounded-cc-card shadow-cc';

  /** Why the scenarios cannot be generated now — beside the button, never in a hover title. */
  const generateWhy = generateBlocked ? (
    <div id="testing-generate-why" data-generation-prerequisites="" className="w-full">
      <CcMessageStrip
        state="information"
        headline={testCases.length > 0 ? 'The scenarios cannot be regenerated yet.' : 'The scenarios cannot be generated yet.'}
      >
        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
          {generatePrerequisites.map((p) => (
            <li key={p.id} data-generation-prerequisite={p.id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">{p.reason}</span>
              <CcLinkButton href={`/project/${String(projectId)}/${p.action.stage}`} icon={<ArrowRight size={16} aria-hidden="true" />}>
                {p.action.label}
              </CcLinkButton>
            </li>
          ))}
          {generatePrerequisites.length === 0 && generateStale ? (
            <li data-generation-prerequisite="stale">
              The inputs were built for a previous source. The notice at the top of the page names the stage to regenerate first.
            </li>
          ) : null}
        </ul>
      </CcMessageStrip>
    </div>
  ) : null;

  if (loading) return <StageFrame stage="testing" className="cc-text-body text-cc-ink-muted">Loading...</StageFrame>;
  if (loadError) return (
    <StageFrame stage="testing">
      <div className="max-w-xl">
        <CcMessageStrip
          state="error"
          headline="This stage could not be opened"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          {loadError}
        </CcMessageStrip>
      </div>
    </StageFrame>
  );

  // Roadmap 3.0.19: a key-user decision — no test code is written; a key user
  // runs the step list's acceptance checks in the system.
  if (keyUserWhole) return (
    <StageFrame stage="testing" className="min-h-screen">
      <StageHeader stage="testing" tools={{ steps: phases, current: 'testing' }} project={project}>
        <span data-testing-lead="" data-key-user-lead="">
          The decision is key-user extensibility: no test code is written. The steps of the key-user step list become acceptance checks a key user runs in the system once they are configured.
        </span>
      </StageHeader>
      {keyUserSteps.state === 'ready' && keyUserSteps.list ? (
        <>
          <KeyUserSteps list={keyUserSteps.list} mode="whole" view="checks" />
          {/* Owner decision 19.10.2026: the checks as run in the account's system — a self-declaration, server-written. */}
          {keyUserSteps.list.steps.length > 0 ? (
            <KeyUserChecksRecord
              projectId={projectId as string}
              list={keyUserSteps.list}
              canRecord={isOwner}
              reading={keyUserAcceptanceReading(project, keyUserSteps.list)}
              onRecorded={(summary) => setProject((prev) => (prev ? { ...prev, keyUserAcceptance: summary } : prev))}
            />
          ) : null}
        </>
      ) : keyUserSteps.state === 'loading' ? (
        <p className="cc-text-body text-cc-ink-muted" data-key-user-loading="">Reading the key-user step list…</p>
      ) : (
        <div className="mb-6" data-key-user-unread="">
          <CcMessageStrip state="warning">
            {keyUserSteps.state === 'failed'
              ? `The key-user step list could not be read: ${keyUserSteps.reason}`
              : 'The signed run holds no key-user reading, so there are no acceptance checks to show.'}
          </CcMessageStrip>
        </div>
      )}
    </StageFrame>
  );

  /* ------------------------------------------------ the answer (ADR-131) */
  const familyTitle = familyTitleOf(project);
  const programName = familyTitle?.programId ?? familyTitle?.title ?? project?.name ?? 'the program';
  const caseCounts = evidence.caseOrigins ?? { engine: 0, model: testCases.length };
  const missingRules = evidence.coverage ? [...evidence.coverage.missing, ...evidence.coverage.notAsked] : [];
  const ranHere = !isAbapCloud && (run.kind === 'recorded' || run.kind === 'session');
  const onlyYourSystem =
    !storedSuiteRejected && Array.isArray(project?.manualTestingRequirements)
      ? project.manualTestingRequirements.map((r) => String(r?.area ?? '')).filter(Boolean)
      : [];
  const notProven = notProvenItems({
    abap: isAbapCloud,
    cases: testCases.length,
    modelCases: testCases.length > 0 ? caseCounts.model : 0,
    missingRules,
    places: program?.gaps ?? [],
    onlyYourSystem,
    ranHere,
  });
  const answer = testingAnswer({
    program: programName,
    abap: isAbapCloud,
    cases: testCases.length,
    engineCases: caseCounts.engine,
    coverage: evidence.coverage,
    run,
    outside,
    closed: testsClosed,
    generating: isGenerating,
    notProven: notProven.length,
  });

  /** Results by business rule — the rows `RuleResults` draws, read from the same verdicts as everywhere else. */
  const caseRowOf = (tc: ScenarioCase, index: number): RuleCaseRow => {
    const engineCase = engineCaseOf(tc);
    const trace = ruleTraceOf(tc);
    const expected =
      trace?.expectedFromOriginal ||
      (engineCase ? engineCase.examples.map((e) => `${e.input} → ${e.expected}`).join('; ') : '') ||
      renderSafeValue((tc as Record<string, unknown>).expectedResult);
    let result: CaseResult;
    let meaning: string;
    if (isAbapCloud) {
      const o = outsideOf(index);
      if (!o) {
        result = 'not-run';
        meaning = 'Not run: nothing here runs ABAP Unit. Its result comes from your SAP system.';
      } else if (o.kind === 'confirmed') {
        result = o.classPassed ? 'held' : 'no-verdict';
        meaning = o.classPassed
          ? 'You confirmed the test class passed in your SAP system. A self-declaration.'
          : 'You confirmed failures in the test class; which case failed is not recorded.';
      } else {
        result = o.outcome === 'passed' ? 'held' : o.outcome === 'failed' ? 'failed' : 'no-verdict';
        meaning = o.message || (o.outcome === 'skipped' ? 'Skipped in your SAP system.' : o.outcome === 'none' ? 'No result for this case in the file.' : 'Ran in your SAP system, imported from the result file.');
      }
    } else {
      const verdict = verdictOf(tc);
      result = verdict === 'Passed' ? 'held' : verdict === 'Failed' ? 'failed' : verdict ? 'no-verdict' : 'not-run';
      meaning = assessmentOf(tc).sentence;
    }
    return {
      id: renderSafeValue(tc.id) || `#${index + 1}`,
      name: renderSafeValue(tc.name),
      expected,
      result,
      meaning,
      byEngine: !!engineCase,
    };
  };
  const ruleRows: RuleRow[] = (materialRuleRead.rules ?? []).map((r) => ({
    id: r.id,
    text: r.text || r.label,
    decision: ruleStates.get(r.id) ?? null,
    lines:
      r.ranges.length > 0
        ? r.ranges.map((x) => (x.lineStart === x.lineEnd ? `L${x.lineStart}` : `L${x.lineStart}–L${x.lineEnd}`)).join(', ')
        : null,
    cases: [],
  }));
  const untracedRows: RuleCaseRow[] = [];
  (testCases as unknown as ScenarioCase[]).forEach((tc, i) => {
    const ruleId = ruleTraceOf(tc)?.ruleId ?? engineCaseOf(tc)?.trace.ruleId ?? null;
    const row = caseRowOf(tc, i);
    if (!ruleId) {
      untracedRows.push(row);
      return;
    }
    let rule = ruleRows.find((r) => r.id === ruleId);
    if (!rule) {
      rule = { id: ruleId, text: 'A rule outside the material business rules of the original', decision: ruleStates.get(ruleId) ?? null, lines: null, cases: [] };
      ruleRows.push(rule);
    }
    rule.cases.push(row);
  });
  const resultsPlace =
    isAbapCloud && outside.state === 'current'
      ? 'Results from your SAP system; failing rules first and open. Open a rule for its scenarios and who set each expected result.'
      : ranHere
        ? 'Results here, against SAP mocks, not in your SAP system; failing rules first and open. Open a rule for its scenarios and who set each expected result.'
        : testCases.length > 0
          ? 'None has run yet. Open a rule for its scenarios and who set each expected result.'
          : null;

  /** The status of the active place in "Where it ran". */
  const placeStatus: React.ReactNode = isAbapCloud
    ? outside.state === 'current'
      ? outsideCountsLine(outside.summary)
      : 'Nothing recorded yet'
    : run.kind === 'recorded' || run.kind === 'session'
      ? countsLine(run.counts)
      : run.kind === 'failed'
        ? 'The last run gave no result'
        : 'Nothing recorded yet';

  const runDisabled = isRunning || selectedTestCases.length === 0 || reader || testRunBlocked(project);
  const runLabel = isRunning
    ? 'Running...'
    : selectedTestCases.length > 0 && selectedTestCases.length < testCases.length
      ? `Run ${selectedTestCases.length} selected against SAP mocks`
      : `Run the ${scenarios(testCases.length)} against SAP mocks`;
  const generateButton = (
    <CcButton
      variant="primary"
      density="cozy"
      onClick={handleGenerate}
      disabled={isGenerating || generateBlocked || reader || !modelAvailability.enabled('testing')}
      aria-describedby={generateBlocked ? 'testing-generate-why' : undefined}
      data-generate-scenarios=""
      icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <ListChecks className="w-4 h-4" aria-hidden="true" />}
    >
      {isGenerating ? 'Writing the scenarios...' : 'Write the scenarios'}
    </CcButton>
  );

  /** The one next step beside the answer (S2, S11). */
  const next: { action: React.ReactNode; note: React.ReactNode; more: React.ReactNode } = (() => {
    const base = `/project/${String(projectId)}`;
    const closeLink = (
      <CcLinkButton href="#testing-closure" variant="ghost" density="compact">
        Close testing without a passing run
      </CcLinkButton>
    );
    switch (answer.state) {
      case 'generating':
      case 'not-started':
        return {
          action: generateButton,
          note: 'Calls the testing model through Clean-Core.io for the rules the engine cases do not reach.',
          more: (
            <CcLinkButton href="#testing-tested" variant="ghost" density="compact">
              See the business rules
            </CcLinkButton>
          ),
        };
      case 'passed':
      case 'closed':
        return {
          action: (
            <CcLinkButton href={`${base}/delivery`} variant="primary" icon={<ArrowRight size={16} aria-hidden="true" />}>
              Go to Delivery
            </CcLinkButton>
          ),
          note: isAbapCloud
            ? 'Delivery says the result came from your SAP system, not from a run here.'
            : `Delivery says "${RUNNER_PASS}": not proof in your system.`,
          more: (
            <CcLinkButton href="#testing-open" variant="ghost" density="compact">
              See what is not proven
            </CcLinkButton>
          ),
        };
      case 'failed':
        return {
          action: (
            <CcLinkButton href="#testing-tested" variant="primary">
              Review the failures
            </CcLinkButton>
          ),
          note: `Closing records your reason; testing then reads "${CLOSED_NOT_VERIFIED}", never passed.`,
          more: (
            <>
              <CcLinkButton href={`${base}/transformation`} variant="ghost" density="compact">
                Generate the code again in Transformation
              </CcLinkButton>
              {closeLink}
            </>
          ),
        };
      default:
        if (isAbapCloud) {
          return {
            action: (
              <CcLinkButton href="#testing-sap-result" variant="primary">
                Record the result from your system
              </CcLinkButton>
            ),
            note: 'Copy the test class into ADT and run ABAP Unit in your development system, then bring the result back.',
            more: (
              <CcLinkButton href="#testing-developers" variant="ghost" density="compact">
                See the test class
              </CcLinkButton>
            ),
          };
        }
        return {
          action: (
            <CcButton
              variant="primary"
              onClick={handleRun}
              disabled={runDisabled}
              icon={isRunning ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            >
              {runLabel}
            </CcButton>
          ),
          note: "In Clean-Core.io's isolated runner, about a minute. No model call.",
          more: answer.state === 'no-result' ? closeLink : null,
        };
    }
  })();



  return (
    <StageFrame stage="testing" className="min-h-screen">
      <StaleNotice
        title={`Built for ${generationBlockers(project, 'testing').length > 0 ? previousBasis(project) : testsPreviousBasis(project)}`}
        reasons={[
          ...generationBlockers(project, 'testing'),
          // Owner 16.10.2026: a new Transformation leaves the suite written for
          // the package it replaced — said as such, not as a source change.
          ...(phases.find((p) => p.key === 'testing')?.state === 'stale'
            ? [`The test cases shown here were written for ${testsPreviousBasis(project)}. Running them tests nothing about the current one.`]
            : []),
        ]}
      />

      {/* One page for every reader (ADR-131 (1)): no view switch, the note in its place. */}
      <StageHeader stage="testing" tools={{ steps: phases, current: 'testing' }} project={project} view="one-page">
        <span data-testing-lead="">
          Tests the new code against what the original does, and every result says where it ran: in Clean-Core.io&apos;s
          isolated runner against SAP mocks, or in your own SAP system.
        </span>
      </StageHeader>

      {/* Roadmap 3.0.19: a program that splits — the key-user parts as acceptance checks; the suite covers the code parts. */}
      {keyUserSteps.state === 'ready' && keyUserSteps.list && keyUserSteps.mode === 'split' ? (
        <KeyUserSteps list={keyUserSteps.list} mode="split" view="checks" />
      ) : null}

      {/* The answer first (ADR-131 (2)): is the program tested, where did it run, the next step, four facets. */}
      <AnswerCard
        id="testing-answer"
        question={answer.question}
        chips={answer.chips.map((c, i) => (
          <FamilyChip key={`${c.kind}-${i}`} kind={c.kind} note={c.note} />
        ))}
        answer={<span data-testing-answer={answer.state}>{answer.answer}</span>}
        condition={answer.condition}
        after={
          <>
            {testCases.length === 0 && !isGenerating && !modelAvailability.enabled('testing') ? (
              /* Roadmap 1.2 / V25-A12 — a button the server refuses tells the reader nothing about why. */
              <NotGenerated
                what="Test suite"
                absence={modelAvailability.keyAvailable ? 'stage-off' : 'no-key'}
                stage="testing"
                hint={
                  modelAvailability.keyAvailable
                    ? 'Turn the testing stage back on in Settings to generate it.'
                    : 'Add your own Gemini API key in Settings to generate it.'
                }
                settingsLink
              />
            ) : null}
            {storedSuiteRejected ? (
              <p data-stored-test-suite-rejected className="m-0 cc-text-cell text-cc-ink-muted leading-relaxed">
                {STORED_TEST_SUITE_REJECTED}
              </p>
            ) : null}
            {testCases.length === 0 ? generateWhy : null}
            {/* Owner 16.10.2026: the elapsed time, the stage and what to expect, as in the other tools (S16). */}
            {genProgress ? <div className="mt-2 w-full"><TestingProgress progress={genProgress} /></div> : null}
            {genRetrying ? (
              <p data-test-generation-retry="" role="status" className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
                {genRetrying}
              </p>
            ) : null}
            {genError ? (
              <p data-test-generation-error role="alert" className="m-0 mt-2 cc-text-cell font-semibold leading-relaxed text-cc-error">
                {genError}
              </p>
            ) : null}
            {runError ? (
              <div data-test-run-error="" role="alert" className="mt-2">
                <CcMessageStrip state="error" headline="The run gave no result">
                  {runError}
                </CcMessageStrip>
              </div>
            ) : null}
          </>
        }
        action={next.action}
        actionNote={next.note}
        moreActions={next.more}
        facets={answer.facets.map((f) => ({
          id: f.id,
          label: f.label,
          value: f.value,
          note: f.note ?? undefined,
          chip: f.chip ? <FamilyChip kind={f.chip.kind} note={f.chip.note} /> : undefined,
          href: `#${f.target}`,
        }))}
      />

      <ReplaceStoredBox
        open={replaceSuiteAsk}
        title={wt('input.replaceSuiteTitle')}
        body={wt('input.replaceSuiteBody')}
        callsModel
        onKeep={() => setReplaceSuiteAsk(false)}
        onReplace={() => {
          setReplaceSuiteAsk(false);
          void handleGenerate();
        }}
      />

      {/* The shared "On this page" bar (ADR-126 (3), S14) — under the answer, before the first section. */}
      <PageAnchorBar
        anchors={testingAnchors({
          rules: ruleRows.length > 0 ? ruleRows.length : null,
          ran: true,
          notProven: notProven.length,
          acceptance: acceptanceCount,
          developers: true,
        })}
        label={PAGE_ANCHOR_LABELS.testing}
        name="testing-anchor"
        plural="testing-anchors"
      />

      {/* An invited reader is told once, by the project frame's reader strip (roadmap 3.0.21 (13)). */}

      <div data-testing-flow="" className={clsx(RAIL_GRID, 'mb-8')}>
        <div className="flex min-w-0 flex-col gap-6">
          {/* ── What was tested: results by business rule (S4) ── */}
          <ToolSection
            id="testing-tested"
            data-testing-tested=""
            title="What was tested"
            titleExtra={
              testCases.length > 0 ? (
                <>
                  {caseCounts.engine > 0 ? <FamilyChip kind="engine" note={`${caseCounts.engine} cases`} /> : null}
                  {caseCounts.model > 0 ? <FamilyChip kind="ai" note={`${caseCounts.model} cases`} /> : null}
                </>
              ) : (
                <FamilyChip kind="engine" note="rules" />
              )
            }
            lead={
              testCases.length > 0
                ? 'Each business rule of the signed analysis with the scenarios that test it.'
                : 'The business rules of the signed analysis, in the order of the code. Each gets at least one scenario; a rule without one stays visible here.'
            }
          >
            <div id="testing-write" className="scroll-mt-32">
              {materialRuleRead.rules ? (
                <RuleResults
                  rules={ruleRows}
                  untraced={untracedRows}
                  placeNote={resultsPlace}
                  emptyNote="Listed here once the scenarios are written."
                />
              ) : (
                <p className="m-0 cc-text-cell text-cc-ink-muted">{evidence.coverageNote}</p>
              )}
              {testCases.length > 0 && !modelAvailability.enabled('testing') ? (
                <div data-regenerate-unavailable className="mt-3">
                  <CcMessageStrip state="neutral">
                    {modelAvailability.keyAvailable
                      ? 'Regenerating is off: turn the testing stage back on in Settings.'
                      : 'Regenerating needs a model key: add your own Gemini API key in Settings.'}
                  </CcMessageStrip>
                </div>
              ) : null}
              {testCases.length > 0 ? <div className="mt-3">{generateWhy}</div> : null}
            </div>
          </ToolSection>

          {/* ── Where it ran: the three places, the record and its actions (S3, S5) ── */}
          <ToolSection
            id="testing-ran"
            data-testing-ran=""
            title="Where it ran"
            lead={
              isAbapCloud
                ? 'Three places a test can run. On this route the scenarios are an ABAP Unit class, and only an ABAP system runs one: yours. Nothing is compiled or executed in SAP ADT here.'
                : 'Three places a test can run. On this route the scenarios are a test suite that runs here, against SAP mocks.'
            }
          >
            <WhereItRan abap={isAbapCloud} status={placeStatus} tenantLocked={LIVE_TEST_EXECUTION.locked} />

            {isAbapCloud ? (
              testCases.length > 0 ? (
                <div id="testing-sap-result" data-testing-sap-result="" className="mt-4 scroll-mt-32">
                  {sapRecordRead === 'failed' && outside.state !== 'none' ? (
                    <div data-sap-result-read-failed="" className="mb-3">
                      <CcMessageStrip
                        state="warning"
                        headline="The result could not be read"
                        actions={
                          <CcButton variant="secondary" density="cozy" onClick={() => setSapReadRound((n) => n + 1)}>
                            Retry
                          </CcButton>
                        }
                      >
                        A result from your SAP system is on record, but its full record could not be read
                        {outside.summary.kind === 'imported' ? ', so the scenario rows do not show their results' : ''}. This is a
                        read failure, not a missing result.
                      </CcMessageStrip>
                    </div>
                  ) : null}
                  <SapResultCard
                    projectId={String(projectId)}
                    canRecord={canRecordOutside}
                    reading={outside}
                    record={sapRecord}
                    onRecorded={onOutsideRecorded}
                  />
                </div>
              ) : (
                <p data-testing-run-unavailable="" className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
                  {ABAP_UNIT_NOT_RUNNABLE} Once the scenarios are written, you record the result from your system here.
                </p>
              )
            ) : (
              <div id="testing-verified" data-testing-results="" className="mt-4 scroll-mt-32">
                {testRunBlocked(project) && testCases.length > 0 ? (
                  <div data-stale-run-hint className="mb-4">
                    <CcMessageStrip state="neutral">Running is off until the suite is regenerated for the current source. The notice at the top says which stage comes first.</CcMessageStrip>
                  </div>
                ) : null}
                {/* ADR-094 — a run that gave no result is on record as such: its cause and how often. */}
                {!runError && run.kind === 'failed' ? (
                  <div data-test-run-failed="" className="mb-4">
                    <CcMessageStrip state="error" headline="The last run gave no result">
                      {failureSentence(run.failure)}
                    </CcMessageStrip>
                  </div>
                ) : null}
                {run.kind !== 'none' ? <TestPipeline written={testCases.length} run={run} /> : null}
                {run.kind === 'recorded' && run.suiteEditedByOwner ? (
                  <div data-testing-suite-owner-edited="" className="mb-4">
                    <CcMessageStrip state="neutral">{OWNER_EDITED_SUITE_NOTE}</CcMessageStrip>
                  </div>
                ) : null}
                {/* CR-14: the runner replaces every npm package the generated code imports with an empty proxy. */}
                {testResults && stubbedPackages.length > 0 ? (
                  <div className="mb-4" data-stubbed-packages>
                    <CcMessageStrip state="warning" headline={`Ran against stubs for: ${stubbedPackages.join(', ')}.`}>
                      These packages were replaced by an empty proxy so the code could load. A pass here shows the
                      business logic ran, not that it works with them.
                    </CcMessageStrip>
                  </div>
                ) : null}
                {aiExplanation ? (
                  <div data-testing-ai-explanation="" className="mb-4 rounded-cc-card border border-cc-line bg-cc-surface-muted p-4">
                    <h3 className="m-0 mb-2 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                      Why the run failed, as the model reads it
                      <FamilyChip kind="ai" />
                    </h3>
                    <div className="cc-prose">
                      <ReactMarkdown>{aiExplanation}</ReactMarkdown>
                    </div>
                  </div>
                ) : null}
                {testCases.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <CcButton
                      variant="secondary"
                      onClick={handleRun}
                      disabled={runDisabled}
                      icon={isRunning ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                    >
                      {run.kind === 'none' ? runLabel : isRunning ? 'Running...' : 'Run again'}
                    </CcButton>
                    <span className="cc-text-meta text-cc-ink-muted">
                      One click runs the scenarios in the isolated runner against SAP mocks and records the run on the server. A run that gives no result is recorded too, with its cause.
                    </span>
                  </div>
                ) : (
                  <p className="m-0 cc-text-cell text-cc-ink-muted">Once the scenarios are written, one click runs them here against SAP mocks.</p>
                )}
              </div>
            )}

            {/* ADR-094 — a failed or impossible run can be concluded: closed by the owner with a reason, never passed (S11). */}
            {project && testCases.length > 0 ? (
              <div id="testing-closure" className="mt-4 scroll-mt-32">
                <TestingClosureCard
                  projectId={String(projectId)}
                  project={project}
                  isOwner={isOwner}
                  onChanged={(fields) => setProject((prev) => (prev ? { ...prev, ...fields } : prev))}
                />
              </div>
            ) : null}
          </ToolSection>

          {/* ── Not proven: one list (S6) ── */}
          <ToolSection
            id="testing-open"
            data-testing-open=""
            title="Not proven"
            aside={notProven.length > 0 ? notProven.length : undefined}
            lead="What no result on this page proves, even when every scenario passed. Each point says what to do; none of them blocks the handover."
          >
            <NotProvenList items={notProven}>
              <div id="testing-hand" data-testing-hand="" className="mt-5 scroll-mt-32 border-t border-cc-line pt-4">
                <h3 className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                  Check by hand
                  <FamilyChip kind="engine" />
                </h3>
                <p className="m-0 mt-1 mb-3 cc-text-cell text-cc-ink-muted">
                  Every construct the engine did not judge, with the line it starts on. A generated test cannot stand in for a person here.
                </p>
                <HandChecks
                  noSource={!program}
                  gaps={program?.gaps ?? []}
                  strip={program ? { lines: program.lines, bands: program.bands, marks: program.marks, ticks: findingTicks } : null}
                />
              </div>
              {onlyYourSystem.length > 0 ? (
                <div data-manual-requirements="" className="mt-5 border-t border-cc-line pt-4">
                  <h3 className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                    Only in your SAP system, as the testing model names it
                    <FamilyChip kind="ai" />
                  </h3>
                  <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                    {(project?.manualTestingRequirements ?? []).map((req, i) => (
                      <li key={i} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                        <p className="m-0 cc-text-cell font-semibold text-cc-ink">{req.area}</p>
                        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{req.reason}</p>
                        {Array.isArray(req.verificationSteps) ? (
                          <ol className="m-0 mt-2 list-decimal pl-5 cc-text-cell text-cc-ink">
                            {req.verificationSteps.map((step, k) => (
                              <li key={k}>{step}</li>
                            ))}
                          </ol>
                        ) : req.verificationSteps ? (
                          <p className="m-0 mt-2 cc-text-cell text-cc-ink">{req.verificationSteps}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </NotProvenList>
          </ToolSection>

          {/* ── Acceptance checks for a business tester (S7) ── */}
          <ToolSection
            id="testing-acceptance"
            data-testing-acceptance=""
            title="Acceptance checks for a business tester"
            titleExtra={<FamilyChip kind="engine" />}
            lead="How someone in the business department checks each rule in your test system, without ABAP: one case where the rule applies, and its counter-check where it must not. A check is a question, not a result: nothing here has run."
          >
            <CounterChecks source={originSource} engineVersion={evidenceEngine} onCount={setAcceptanceCount} />
          </ToolSection>

          {/* ── For developers, folded (S8): the suite, the run output, the checks of the suite ── */}
          <section
            id="testing-developers"
            data-testing-console=""
            aria-label="For developers"
            className={clsx(CARD, 'scroll-mt-32 px-4 py-3 sm:px-5')}
          >
            <CcDisclosure
              title="For developers"
              level={2}
              open={showConsole}
              onOpenChange={setShowConsole}
            >
              <div className="flex min-w-0 flex-col gap-5 pt-1">
                {testCases.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <CcButton variant="ghost" onClick={exportTestCasesToExcel} icon={<Download size={14} aria-hidden="true" />}>
                      Export Excel
                    </CcButton>
                    <CcButton
                      variant="ghost"
                      // The suite on record is replaced: asked first (ADR-083).
                      onClick={() => setReplaceSuiteAsk(true)}
                      disabled={isGenerating || !modelAvailability.enabled('testing') || generateBlocked || reader}
                      aria-describedby={generateBlocked ? 'testing-generate-why' : undefined}
                      data-generate-scenarios=""
                      icon={isGenerating ? <RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> : undefined}
                    >
                      {isGenerating ? 'Writing the scenarios...' : 'Write the scenarios again'}
                    </CcButton>
                    {exportError && (
                      <span data-export-error role="alert" className="flex items-center gap-2 cc-text-meta text-cc-error">
                        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {exportError}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* 3.0.13 (6) — the ABAP Unit evidence belongs to the ABAP route. */}
                <AbapUnitEvidence project={project} />

                {/* 3.0.10 — rule coverage, the shared-selection invariant and the mutation probe. */}
                {!isAbapCloud && testCases.length > 0 ? (
                  <TestEvidenceCard
                    coverage={evidence.coverage}
                    coverageNote={evidence.coverageNote}
                    assessments={evidence.assessments}
                    caseOrigins={evidence.caseOrigins}
                    abapUnit={evidence.abapUnit}
                    invariant={sharedSelection}
                    mutation={evidence.mutation}
                    probe={{ state: probe.state, error: probe.error }}
                    probeBasis={evidence.probeBasis}
                    canProbe={isOwner && !testRunBlocked(project)}
                    onProbe={() => void probeMutants()}
                  />
                ) : null}

                {/* Every scenario, one row each: details, origin check and the selection for a run (owner 03.10.2026). */}
                {testCases.length > 0 ? (
                  <div id="testing-scenarios" data-testing-scenarios="">
                    <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">Every scenario, one row each</h3>
                    <ScenarioList
                      cases={testCases as unknown as ScenarioCase[]}
                      isAbapCloud={isAbapCloud}
                      suiteCode={!storedSuiteRejected && typeof project?.testSuite?.code === 'string' ? project.testSuite.code : null}
                      selectable={!isAbapCloud}
                      selected={selectedTestCases}
                      onToggle={toggleTestCase}
                      resultOf={scenarioResultOf}
                      runAt={run.kind === 'recorded' ? run.at : null}
                      tenantLocked={LIVE_TEST_EXECUTION.locked}
                      projectName={project?.name}
                      aiStatement={aiStatements.suite}
                      origin={originEngine}
                      outsideOf={isAbapCloud ? outsideOf : undefined}
                      assessmentOf={isAbapCloud ? undefined : assessmentOf}
                    />
                  </div>
                ) : null}

                {/* The run output and the test code. The terminal is code, one of the two dark surfaces DESIGN.md §1.1 allows. */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 cc-text-h3 text-cc-ink">{showTestCode ? (isAbapCloud ? 'The ABAP Unit test class' : 'The test suite') : 'Run output'}</h3>
                    <CcButton variant="ghost" density="compact" onClick={() => setShowTestCode(!showTestCode)} icon={<TerminalIcon size={14} aria-hidden="true" />}>
                      {showTestCode ? 'Show the run output' : isAbapCloud ? 'Show the test class' : 'Show the test code'}
                    </CcButton>
                  </div>
                  <div className="max-h-96 overflow-auto rounded-cc-card border border-cc-line bg-cc-code-bg p-4 font-cc-mono text-[12px] text-cc-code-ink md:text-[13px]">
                    {showTestCode ? (
                      <pre data-stage-output={project?.testSuite?.code ? 'testSuite' : undefined} className="whitespace-pre-wrap leading-relaxed text-cc-code-name">
                        {(!storedSuiteRejected && project?.testSuite?.code) || (isAbapCloud ? 'No ABAP Unit class written yet. Write the scenarios to see it here.' : 'No test code written yet.')}
                      </pre>
                    ) : (
                      <pre className="whitespace-pre-wrap leading-relaxed" data-console-idle={sandboxOutput ? undefined : ''}>
                        {isAbapCloud
                          ? 'Nothing runs here. ABAP Unit runs in your SAP system: copy the test class into ADT and run it there (Ctrl+Shift+F10).'
                          : sandboxOutput || 'No run yet. Start a run against SAP mocks; its output appears here.'}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </CcDisclosure>
            {!showConsole ? (
              <p className="m-0 cc-text-meta text-cc-ink-muted">
                {isAbapCloud ? 'Test class, every scenario, the checks of the class and the run output.' : 'Test suite, every scenario, the run output, the probe and the stubs.'}
              </p>
            ) : null}
          </section>
        </div>

        <aside aria-label="About this tool" className="flex min-w-0 flex-col gap-4">
          {/* Where tests can run, once for the stage (S9): the tenant connection lives in Settings now. */}
          <CcCard title="Where tests can run" level={2}>
            <ul data-testing-where-side="" className="m-0 flex list-none flex-col gap-3 p-0 cc-text-cell">
              <li>
                <span className="block font-semibold text-cc-ink">Here</span>
                <span className="text-cc-ink-muted">Clean-Core.io&apos;s isolated runner, SAP mocks. JavaScript and TypeScript only (CAP route).</span>
              </li>
              <li>
                <span className="block font-semibold text-cc-ink">Your SAP system</span>
                <span className="text-cc-ink-muted">ABAP Unit, and anything that needs your data. You bring the result.</span>
              </li>
              <li>
                <span className="block font-semibold text-cc-ink">Your tenant, from here</span>
                {/* The lock is said once on this page (roadmap 1.7); the connection check lives in Settings (ADR-131 (5)). */}
                <span data-tenant-summary="" data-live-test-lock="" className="text-cc-ink-muted">
                  {LIVE_TEST_EXECUTION.locked ? 'Locked. ' : ''}The connection check is in{' '}
                  <Link href="/settings#sap-test-system" className="font-semibold text-cc-information hover:underline">
                    Settings, Your SAP test system
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </CcCard>
        </aside>
      </div>

      <StageFooter />
    </StageFrame>
  );
}
