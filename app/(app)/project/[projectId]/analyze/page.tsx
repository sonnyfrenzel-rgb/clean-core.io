'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { scanCodeContent } from '@/lib/staged-code-scan';
import { pinRunOwnedFields } from '@/lib/model-owned-fields';
import { personalDataHintKey, scanForPersonalDataHints } from '@/lib/personal-data-hints';
import { looksLikeAbap } from '@/lib/abap-input-check';
import { routeWasOverridden } from '@/lib/route-override';
import { runProjectCommand } from '@/lib/project-command-client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType, getAuth } from '@/lib/firebase';
import { UploadCloud, FileCode2, CheckCircle2, ArrowRight, ArrowLeft, RefreshCw, Info, Layers, Shield, Zap, Cloud } from 'lucide-react';
import clsx from 'clsx';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';
import CcDialog from '@/components/cc/Dialog';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDisclosure from '@/components/cc/Disclosure';
import CcField from '@/components/cc/Field';
import CcCheckbox from '@/components/cc/Checkbox';
import { STATE_CLASSES } from '@/components/cc/state';
import type { SemanticState } from '@/lib/provenance';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { callGeminiWithReceipt } from '@/lib/gemini';
import type { ModelReceipt } from '@/lib/model-receipt';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import type { Project, AnalysisData, CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import { readModelGaps } from '@/lib/model-gaps';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { absenceFromError, modelAbsenceReason, type ModelAbsence } from '@/lib/model-stages';
import GlossaryTerm from '@/components/GlossaryTerm';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { extractCodeInventory, extractDataCoupling, computeComplexityScore, computeCriticalityScore } from '@/lib/abap/code-assessment';
import { buildAnalysisPrompt } from '@/lib/analysis-prompt';
/**
 * The deterministic half of the initial worklist. It used to be a function in
 * this file; roadmap 1.8 moved it to `lib/analysis-run.ts`, where the workspace
 * list report reaches it too. A second copy would let a run started from a table
 * row produce a different worklist from one started here, which is the sort of
 * difference nobody would look for.
 */
// Read from its own module, which `lib/analysis-run.ts` re-exports: the run
// module imports the evidence engine and with it the SAP catalog, and this page
// loads the engine only when it has a source (external audit PERF-01).
import { findingsWorklist } from '@/lib/findings-worklist';
import { PASTED_SOURCE_NAME, sourceFileName } from '@/lib/source-file-name';
import { readStoredAnalysis, withoutUnapprovedMoney } from '@/lib/money-honesty';
import AnchoredNarrative from '@/components/analyze/AnchoredNarrative';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { APP_VERSION } from '@/lib/version';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import type { SourceFile } from '@/lib/abap/findings-detector';

import CodeInventoryTable from '@/components/analyze/CodeInventoryTable';
import ModuleHeatmap from '@/components/analyze/ModuleHeatmap';
import AbcdClassificationPanel from '@/components/analyze/AbcdClassificationPanel';
import AssessmentProfileSummary from '@/components/analyze/AssessmentProfileSummary';
import AssessmentTargetFields from '@/components/analyze/AssessmentTargetFields';
import { catalogLookupTargetOf, declaredTargetOf, repositoryObjectsOf, type AssessmentTarget } from '@/lib/assessment-target';
import DataCouplingTable from '@/components/analyze/DataCouplingTable';
import ComplianceReviewHints from '@/components/ComplianceReviewHints';
import ReviewTasks, { reviewTasksTitle } from '@/components/ReviewTasks';
import { deriveReviewTasks } from '@/lib/abap/review-tasks';
import ExtensibilityDecisionMatrix from '@/components/analyze/ExtensibilityDecisionMatrix';
import TargetScopeMapping from '@/components/analyze/TargetScopeMapping';
import ModernizationStrategy from '@/components/analyze/ModernizationStrategy';
import CoverageVerdict from '@/components/analyze/CoverageVerdict';
import ConstructFindings from '@/components/analyze/ConstructFindings';
import UnassessedConstructs from '@/components/analyze/UnassessedConstructs';
import MissingDependencyPrompt from '@/components/analyze/MissingDependencyPrompt';
import PreAnalysisPreview from '@/components/analyze/PreAnalysisPreview';
import EvidenceSweep from '@/components/analyze/EvidenceSweep';
import UsageUpload from '@/components/analyze/UsageUpload';
import { UsageRiskMatrixFor } from '@/components/analyze/UsageRiskMatrix';
import AtcUpload from '@/components/analyze/AtcUpload';
import AtcFindingsPanel from '@/components/analyze/AtcFindingsPanel';
import SectionBoundary from '@/components/SectionBoundary';
import NotGenerated from '@/components/NotGenerated';
import TrustBeforeUpload from '@/components/TrustBeforeUpload';
import PersonalDataHints from '@/components/PersonalDataHints';
import WhyScorePanel from '@/components/analyze/WhyScorePanel';
import { getRunCapabilities } from '@/lib/run-capabilities';
import type { UsageReport as UsageReportType } from '@/lib/abap/usage-model';
import type { AtcReport as AtcReportType } from '@/lib/abap/atc-model';

import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import StageFooter from '@/components/StageFooter';
import { coverageCaveat } from '@/lib/abap/coverage';
import AnalysisAnswer from '@/components/analyze/AnalysisAnswer';
import EvidenceFindingsTable from '@/components/analyze/EvidenceFindingsTable';
import { analysisAnswer, countFindings, groupEvidenceFindings, plainRoute } from '@/components/analyze/analysis-answer';
import { BTP, IN_APP_ROUTE, SIDE_BY_SIDE_LABEL, SIDE_BY_SIDE_ROUTE, isSideBySideRoute, routeLabel, sapNamesForDisplay } from '@/lib/sap-naming';
import CleanCoreScoreSection from '@/components/analyze/CleanCoreScoreSection';
import CleanCoreScoreDialog from '@/components/analyze/CleanCoreScoreDialog';
import ObjectSection from '@/components/analyze/ObjectSection';
import FoldedSection, { FoldedPart } from '@/components/analyze/FoldedSection';
import NotDeterminedSide, { type OpenItem } from '@/components/analyze/NotDeterminedSide';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
// The engine's evidence comes from the server, computed with the catalog
// snapshot the signed run reads; neither the engine nor a catalog is
// downloaded by this page (owner decision 30.09.2026, external audit PERF-01).
import { EVIDENCE_UNREAD, previewRunEvidence, useProjectEvidence } from '@/hooks/useProjectEvidence';
import { gradeKey, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { accessUseOfKind, findingRows, processStepBands, SEVERITY_ORDER } from '@/lib/findings-view';
import { scoreBreakdown } from '@/lib/clean-core-score';
import { readProcess } from '@/lib/first-look';
import { catalogForReader } from '@/lib/messages/demo';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { workflowSteps } from '@/lib/workflow-steps';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { takeOwnCodeHandoff } from '@/lib/own-code-handoff';
import { countSourceLines } from '@/lib/source-lines';

export default function AnalyzePage() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [legacyCode, setLegacyCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // Help Mode removed — Ask AI chatbot replaces this functionality
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);
  const [targetDeployment, setTargetDeployment] = useState<'public' | 'private' | null>(null);
  // Roadmap 7.10 - what the owner declares about the target, sent with the run.
  const [assessmentTarget, setAssessmentTarget] = useState<AssessmentTarget>({ release: '', components: [], languageVersions: [] });
  const [showConceptQuestion, setShowConceptQuestion] = useState(false);
  const [modalSelection, setModalSelection] = useState<'public' | 'private' | null>(null);
  // Only the stored project says it is the example; a query parameter granted
  // the example's exemptions to any project (QA full review of a12774cd2b7f).
  const isFromExample = !!project?.fromExample || project?.isExample;
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(PASTED_SOURCE_NAME);
  const [routeReport, setRouteReport] = useState<import('@/lib/abap/extensibility-router').ExtensibilityRouteReport | null>(null);
  const [usageReport, setUsageReport] = useState<UsageReportType | null>(null);
  // Roadmap 7.5: the check tasks this source leaves open - a window too
  // short, an include not read, a call target computed at run time. Derived
  // here, in the browser, from the same source the evidence engine reads;
  // the panel only paints. lib/abap/review-tasks.ts imports no catalog.
  const reviewTasks = useMemo(
    () => deriveReviewTasks(project?.legacyCode || legacyCode || '', { usage: (usageReport || project?.usageReport) ?? undefined }),
    [project?.legacyCode, legacyCode, usageReport, project?.usageReport],
  );
  // Roadmap 7.1: ATC-Import — kept as its own state and its own type, never
  // merged into `usageReport` or the engine's evidence findings.
  const [atcReport, setAtcReport] = useState<AtcReportType | null>(null);
  /**
   * Which set of personal-data hints the reader has said they looked at, held
   * as the hints' own key rather than as a boolean. Edit the source and the key
   * changes, so a tick made for the old text stops counting for the new one
   * without anything having to clear it (`lib/personal-data-hints.ts`).
   */
  const [personalDataAckFor, setPersonalDataAckFor] = useState('');
  /**
   * Roadmap 1.2 — whether a model may write the narrative for this account, and
   * whether a key exists at all. The stage does not depend on the answer to run:
   * it decides what the screen says before the click and, afterwards, why the
   * narrative section is not there.
   */
  const modelAvailability = useModelAvailability();
  /** Set by the run just completed. `null` on a fresh page — see `narrativeAbsence`. */
  const [lastNarrativeAbsence, setLastNarrativeAbsence] = useState<ModelAbsence>(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const hydratedProject = await loadProjectAndHydrate(projectId as string);
        if (hydratedProject) {
          setProject(hydratedProject);
          setLegacyCode(hydratedProject.legacyCode || '');
          // The file the source came from: the name the last run signed, or
          // the example's own file. Without it a re-run, and every run of an
          // example, was signed as the placeholder (lib/source-file-name.ts).
          setUploadedFileName(sourceFileName(hydratedProject) ?? PASTED_SOURCE_NAME);
          if (hydratedProject.s4Deployment) {
            setTargetDeployment(hydratedProject.s4Deployment as 'public' | 'private');
          }
          // Roadmap 7.10 - the declaration the last run was made under.
          setAssessmentTarget(declaredTargetOf(hydratedProject));
          if (hydratedProject.fromExample || hydratedProject.isExample) {
            setAcceptedTerms(true);
          }
          // Arriving from "Start analysis" on the own-code page (mockup 2.8
          // s11): the reader has read the pledge there and ticked the lines
          // that look like personal data for exactly this source, so neither
          // is asked twice. The key only counts if it is the key of the text
          // loaded here. What the run still needs — the target operating
          // model — is asked in the dialog that starts it. Module memory only
          // (lib/own-code-handoff.ts): a reload asks as before.
          const handoff = takeOwnCodeHandoff(projectId as string);
          if (handoff) {
            openWorkspaceAfterRunRef.current = true;
            setAcceptedTerms(true);
            if (handoff.personalDataKey) setPersonalDataAckFor(handoff.personalDataKey);
            if (!hydratedProject.activeRunId && hydratedProject.legacyCode) {
              setModalSelection((hydratedProject.s4Deployment as 'public' | 'private' | undefined) ?? null);
              setShowConceptQuestion(true);
            }
          }
          // v1.22: restore persisted usage report
          if (hydratedProject.usageReport) {
            setUsageReport(hydratedProject.usageReport);
          }
          // Roadmap 7.1: restore persisted ATC import
          if (hydratedProject.atcReport) {
            setAtcReport(hydratedProject.atcReport);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `projects/${projectId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, searchParams]);

  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [sweepActive, setSweepActive] = useState(false);
  const [sweepFindings, setSweepFindings] = useState<import('@/lib/abap/evidence-model').EvidenceFinding[]>([]);
  const [sweepCode, setSweepCode] = useState('');
  const geminiResultRef = useRef<{ text: string; evidenceReport: any; computedRouteReport: any; codeToAnalyze: string } | null>(null);
  const sweepCompleteRef = useRef(false);
  /**
   * Set for a project's first run — an example or own code started here, or
   * handed over by the own-code page. Such a project then continues in the
   * workspace with the first look, never on this tool (owner decisions
   * 01.10.2026 and 02.10.2026: "an example always opens the workspace with the
   * first look first, not Analyze"). A re-run stays here. Lives as long as the
   * page; a reload ends it.
   */
  const openWorkspaceAfterRunRef = useRef(false);

  // Prose is not code. The keyword list below was already here and already
  // right; what followed it — `|| code.trim().length > 0` — made it decorative,
  // so any non-empty text was accepted, sent to the model, charged against the
  // quota and signed into a run as ABAP (QA review of 33471220d6e9,
  // 2d714ac42b63). The list is the deterministic engine's own vocabulary of
  // top-level constructs; one of them has to appear.
  const isLegacyCode = (code: string) => looksLikeAbap(code);

  const scanForMaliciousCode = (content: string, fileName: string): string | null => {
    if (!fileName.endsWith('.abap') && !fileName.endsWith('.txt')) {
      return 'Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.';
    }
    return scanCodeContent(content);
  };

  /** The limit the upload area has always advertised (QA 8d9184e6f94f). */
  const MAX_UPLOAD_BYTES = 1024 * 1024;

  /**
   * Which file selection is the latest. A slow read of an earlier file used to
   * finish after a later one and stage itself last, so the run analysed and
   * signed the file the user had already replaced (QA full review of
   * fc787674705f, 9be8a33c243e). Only the newest selection may stage.
   */
  const fileSelectionRef = useRef(0);

  /**
   * A rejected replacement leaves nothing staged. Keeping the previous source
   * after "that file was refused" let Start Analysis sign a file the user had
   * just tried to replace (QA full review of fc787674705f, 654ca9f3a217).
   */
  const rejectFile = (message: string) => {
    setError(message);
    setLegacyCode('');
    setUploadedFileName(PASTED_SOURCE_NAME);
  };

  const handleFile = (file: File) => {
    setError('');
    const selection = ++fileSelectionRef.current;
    
    // Scan file metadata first
    if (!file.name.endsWith('.abap') && !file.name.endsWith('.txt')) {
        rejectFile('Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.');
        return;
    }

    // "Max 1MB" was written on the screen and checked nowhere: the browser read
    // the whole file into memory, rendered it into the textarea and the scanner,
    // and tried to put it in a model request (QA 8d9184e6f94f).
    if (file.size > MAX_UPLOAD_BYTES) {
        rejectFile(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 1 MB — analyse one object at a time, or paste the part you want assessed.`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      // A later selection has been made since this read started: it wins.
      if (selection !== fileSelectionRef.current) return;
      const content = event.target?.result as string;
      
      // Perform automated malicious payload scan
      const scanResult = scanForMaliciousCode(content, file.name);
      if (scanResult) {
        rejectFile(scanResult);
        return;
      }

      if (!isLegacyCode(content)) {
          rejectFile('The file does not appear to contain valid legacy code.');
          return;
      }
      setLegacyCode(content);
      setUploadedFileName(file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };


  /**
   * The deployment is an argument, not a closure read.
   *
   * The dialog used to do `setTargetDeployment(modalSelection)` and call this
   * function in the same handler. A state setter does not change the value this
   * closure already captured, so the run below used whatever the *previous*
   * render held: `null` the first time anybody analyses (the dialog is how the
   * deployment gets set at all), and the old edition when somebody opens the
   * dialog again and switches. Everything downstream took it — the evidence
   * scan, the extensibility routing, the prompt, and `s4Deployment` on the
   * signed run — while the screen re-rendered with the new choice. That is a
   * result that does not belong to the run that attests it, which is the one
   * thing this product may not do (QA full review of 3131afa, 2878b5f8fae3).
   */
  const handleAnalyze = async (
    codeToAnalyze: string = legacyCode,
    deployment: 'public' | 'private' | null = targetDeployment,
  ) => {
    setError('');
    // A project's first run continues in the workspace, with the first look.
    const firstRunOfProject = !project?.activeRunId;
    // The scan runs here, on exactly the text that is about to leave the
    // browser. The upload path scanned the file, and the screen scanned what
    // was staged — but the textarea can be edited after both, and this is the
    // only place that sees the final string (QA review of 33471220d6e9,
    // 2ea4b0048642).
    const scanBlock = scanCodeContent(codeToAnalyze);
    if (scanBlock) {
        setError(`Security Block: ${scanBlock} Remove the flagged content before analysing.`);
        return;
    }
    if (!isLegacyCode(codeToAnalyze)) {
        setError('That does not look like ABAP. Paste or upload ABAP source — a report, class, method, form, function module or include.');
        return;
    }
    // The same preconditions the start button and the dialog ask for, held
    // here as well so that no caller of this function starts a run without
    // them: a target deployment, accepted Terms, and — for anything but the
    // example — the tick on the lines the hint panel shows for exactly this
    // text (QA full review of 81810c8, 7d0d04a45324).
    const hintKeyForThisText = isFromExample ? '' : personalDataHintKey(scanForPersonalDataHints(codeToAnalyze));
    if (!deployment || !acceptedTerms || (hintKeyForThisText !== '' && hintKeyForThisText !== personalDataAckFor)) {
        setError('Select a target deployment, accept the Terms & Conditions and tick the box under any highlighted lines before starting the analysis.');
        return;
    }
    setLoading(true);
    setLoadingMessage('Initializing evidence scanner...');
    sweepCompleteRef.current = false;
    geminiResultRef.current = null;

    try {
      // 1. Gather deterministic evidence and perform extensibility routing. The
      //    evidence is computed on the server with the inputs the run route
      //    reads for this same request — the edition, the declared release and
      //    so the catalog snapshot, the file name — so the prompt, the sweep
      //    and the report below are about what the run then signs.
      const evidenceReport = await previewRunEvidence(projectId as string, {
        source: codeToAnalyze,
        fileName: uploadedFileName,
        deployment,
        targetProfile: assessmentTarget,
      });
      const computedRouteReport = routeExtensibility(evidenceReport, deployment || 'private');
      setRouteReport(computedRouteReport);

      // 2. Start Evidence Sweep animation
      setSweepCode(codeToAnalyze);
      setSweepFindings(evidenceReport.findings);
      setSweepActive(true);
      // Every stage message from here on is said when the thing it names has
      // happened or is starting — never on a timer (DESIGN.md §5.4, D.10b).
      // Findings as the page counts them below — one per pattern and object.
      const findingCount = findingRows(evidenceReport.findings).length;
      setLoadingMessage(`Evidence scan complete — ${findingCount} ${findingCount === 1 ? 'finding' : 'findings'}.`);

      const prompt = buildAnalysisPrompt({ targetDeployment: deployment, evidenceReport, routeReport: computedRouteReport, code: codeToAnalyze });

      // 3. The narrative, if this account has a model for this stage.
      //
      // Roadmap 1.2 — the zero-LLM path. This line used to be an unguarded
      // `await`, so an account with no Gemini key (no community key on the
      // server, none of its own) got a 503 here, fell into the catch at the
      // bottom and ended with an error message and **no run at all** — no
      // evidence, no signature, nothing to carry to the next stage, although
      // every finding on this page is computed above without a model. The model
      // call is now one section of the analysis that can be absent, not the
      // analysis itself: whatever happens here, the run below is created and
      // signed over the deterministic evidence.
      let responseText = '';
      // The proxy's own record that the call happened, carried to
      // `/api/runs/create` so the signed run may name the model it observed
      // rather than the one this page would have guessed
      // (`lib/model-receipt.ts`). Losing it costs the run nothing but the
      // attestation.
      let modelReceipt: ModelReceipt | null = null;
      let narrativeAbsence: ModelAbsence = null;
      if (!modelAvailability.enabled('analyze')) {
        narrativeAbsence = modelAvailability.keyAvailable ? 'stage-off' : 'no-key';
        setLoadingMessage('Evidence scanner only — no narrative for this run.');
      } else {
        setLoadingMessage('Waiting for the model narrative...');
        try {
          const generated = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, 'analyze');
          responseText = generated.text;
          modelReceipt = generated.receipt;
        } catch (modelErr) {
          // The reason comes from the code the proxy sends, not from its prose.
          narrativeAbsence = absenceFromError(modelErr);
          responseText = '';
        }
      }
      setLastNarrativeAbsence(narrativeAbsence);

      let recommendedRoute = computedRouteReport.recommendedRoute;
      let cleanCoreScore = computedRouteReport.cleanCoreScore;
      let normalizedAnalysis = responseText;
      let initialWorklist: any[] = [];
      try {
        if (!responseText) {
          // No narrative to parse. The same fallback the catch below uses
          // builds the worklist from the findings alone.
          throw new Error('no narrative was generated');
        }
        let cleaned = responseText.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
        const parsed = JSON.parse(cleaned);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (obj && typeof obj === 'object') {
          // The deterministic figures belong to the run, not to the model. The
          // model is asked for the same fields and sometimes answers with its
          // own numbers; stored alongside the signed ones they became a second,
          // unsigned truth that the screen and the Confluence export were happy
          // to print (QA review of 33471220d6e9, e184fc0c59bf). They are
          // dropped here, once, before anything is stored, and the routing
          // block carries the router's values (`lib/model-owned-fields.ts`).
          pinRunOwnedFields(obj, computedRouteReport);
          // The router's checkpoints and track comparison, as
          // /api/runs/create stores them on the run. Kept from the model, a
          // partially shaped comparison reached the decision matrix and the
          // Confluence export of this session and broke them (QA full review
          // of fc787674705f, 329a0da707f6).
          const routing = obj.extensibilityRouting as Record<string, unknown>;
          routing.decisionTreeCheckpoints = computedRouteReport.checkpoints;
          routing.comparativeAnalysis = computedRouteReport.comparativeAnalysis;
          normalizedAnalysis = JSON.stringify(obj);
          
          // A single object is one gap; any other shape is said on the Gaps
          // Backlog tab, not dropped in silence (`lib/model-gaps.ts`).
          const gapsList = readModelGaps(obj.gaps).gaps;

          initialWorklist = [
            ...findingsWorklist(evidenceReport.findings, uploadedFileName || 'main.abap'),
            ...gapsList.map((g, idx) => ({
              id: `gap-${idx}`,
              title: g.title,
              category: 'Functional Gap',
              severity: g.severity,
              location: 'S/4HANA Configuration',
              recommendation: g.rationale,
              strategy: g.strategy,
              status: 'open',
              effort: g.complexity
            }))
          ];
        }
      } catch (e) {
        // A narrative that arrived and could not be read is a defect worth a
        // log line; a run that deliberately has none is not.
        if (responseText) console.error('Failed to parse analysis JSON for routing', e);
        initialWorklist = findingsWorklist(evidenceReport.findings, uploadedFileName || 'main.abap');
      }

      const inventory = extractCodeInventory(codeToAnalyze);
      const coupling = extractDataCoupling(codeToAnalyze);
      const complexityScore = computeComplexityScore(codeToAnalyze);
      const criticalityScore = computeCriticalityScore(codeToAnalyze);

      try {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(codeToAnalyze));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const detectObjectType = (code: string): string => {
          if (/^\s*CLASS\s+/im.test(code)) return 'Class';
          if (/^\s*INTERFACE\s+/im.test(code)) return 'Interface';
          if (/^\s*FUNCTION\s+/im.test(code)) return 'Function Module';
          if (/^\s*REPORT\s+/im.test(code)) return 'Report';
          if (/^\s*FORM\s+/im.test(code)) return 'Form Routine';
          return 'ABAP Source';
        };

        setLoadingMessage('Signing the run...');
        const idToken = await getAuth().currentUser?.getIdToken();
        const response = await fetch('/api/runs/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            projectId,
            legacyCode: codeToAnalyze,
            s4Deployment: deployment,
            // Roadmap 7.10 - the declared half of the target profile. The server
            // adds the catalog snapshot and the rule version and signs the whole.
            targetProfile: assessmentTarget,
            // The model's text as the proxy returned it, byte for byte. The
            // receipt is issued over exactly that, so anything rewritten here
            // would make an honest run fail the origin check; the route performs
            // the same normalisation server-side before it signs. The copy this
            // page keeps for the screen (`normalizedAnalysis`) is unaffected.
            analysis: responseText,
            ...(modelReceipt ? { modelReceipt } : {}),
            extensibilityRoute: recommendedRoute,
            cleanCoreScore,
            complexityScore,
            criticalityScore,
            worklist: initialWorklist,
            codeInventory: inventory,
            dataCoupling: coupling,
            evidenceReport: JSON.parse(JSON.stringify(evidenceReport)),
            originalRecommendation: recommendedRoute === SIDE_BY_SIDE_ROUTE ? 'cap' : 'rap',
            recommendationConfidence: computedRouteReport.confidenceScore,
            recommendationJustification: computedRouteReport.rationale,
            uploadedFileName,
            // No `modelCard` here any more. It was a client-supplied claim about
            // which model had run, and the route has not read it since 1.2;
            // leaving it on the wire only invited someone to start trusting it
            // again. What the run records now comes from the receipt.
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to record analysis run.');
        }

        const runResult = await response.json();
        const activeRunId = runResult.runId;

        // v2.3: no client-side charging. /api/runs/create reserved the unit
        // atomically (idempotent per source fingerprint) before signing the run.

        setProject((prev: Project | null) =>
          prev 
            ? { 
                ...prev, 
                activeRunId,
                legacyCode: codeToAnalyze,
                analysis: normalizedAnalysis, 
                extensibilityRoute: recommendedRoute, 
                s4Deployment: deployment, 
                cleanCoreScore,
                charged: true,
                transformationBypass: true,
                worklist: initialWorklist,
                codeInventory: inventory,
                dataCoupling: coupling,
                complexityScore,
                criticalityScore,
                originalRecommendation: recommendedRoute === SIDE_BY_SIDE_ROUTE ? 'cap' : 'rap',
                recommendationConfidence: computedRouteReport.confidenceScore,
                recommendationJustification: computedRouteReport.rationale,
                evidenceReport,
              } 
            : null
        );
        // A first run (an example, own code): on to the workspace with the
        // first look. Only once the run is signed — a failed run stays here
        // with its error.
        if (openWorkspaceAfterRunRef.current || firstRunOfProject) {
          router.push(`/project/${projectId}?first=1`);
        }
      } catch (error) {
        console.error('Error during analysis persistence:', error);
        throw error;
      }
    } catch (err: unknown) {
      console.error('Analysis Error:', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      // Always said on the screen. A message carrying JSON used to be rethrown
      // from this click handler instead: an unhandled rejection, the spinner
      // gone and no word about why (QA full review of fc787674705f,
      // ca61e8967379). The structured detail stays in the console above.
      const shown = errMessage && !errMessage.includes('{') ? errMessage : 'the service reported an error';
      setError(`Failed to analyze the code: ${shown}. Please try again.`);
    } finally {
      setSweepActive(false);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  /**
   * The Confluence page is a document that leaves the application; it is built
   * in `lib/analysis-export.ts` (block D, D.28), which escapes every value and
   * takes its look from `lib/export-style.ts`. The page asks for the file and
   * saves it.
   */
  const exportToConfluence = async () => {
    if (!project?.analysis) return;
    // Loaded on the click: the export recomputes the evidence, so it imports
    // the engine and the SAP catalog with it (external audit PERF-01).
    const { buildAnalysisExportHtml, analysisExportFileName } = await import('@/lib/analysis-export');
    const htmlContent = buildAnalysisExportHtml({ project, routeReport, legacyCode, uploadedFileName, targetDeployment });
    if (htmlContent === null) return;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const fileSaver = await import('file-saver');
    const save = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
    save(blob, analysisExportFileName(project.name));
    
    // The export is no longer written back into the project document.
    //
    // Every export used to add `exports.analysis_confluence_<Date.now()>` with
    // the whole HTML and delete nothing, inside a document Firestore caps at
    // 1 MiB. Past that cap *every* write to the project fails and the project
    // is finished.
    //
    // And the blob was never reachable anyway. `exports` has exactly one
    // reader, the deliverables tree on the dashboard
    // (`app/(app)/dashboard/page.tsx`, `dynamicExports`), and it reads each
    // value as `{ title, content, type }`. What these two stages stored was a
    // bare HTML string, so the row it produced was titled
    // `analysis_confluence_1758…` and its View and Download buttons were handed
    // `undefined`. The file itself has already gone to the browser above, and
    // the HTML is regenerated from `project.analysis` on the next click.
    //
    // "Keep the newest N" was the other option and bounds the wrong quantity:
    // one analysis report is easily hundreds of kilobytes, so a small N still
    // reaches the cap.
    //
    // The same write clears what earlier versions left behind — a project
    // already carrying those blobs is not rescued by merely adding no more. No
    // new key is introduced: this still only touches `exports`, which
    // `firestore.rules` already allows a client to write.
    const staleExports = Object.keys(project.exports || {}).filter((key) =>
      key.startsWith('analysis_confluence_'),
    );
    if (staleExports.length > 0) {
      const docRef = doc(getDb(), 'projects', projectId as string);
      try {
        await updateDoc(
          docRef,
          Object.fromEntries(staleExports.map((key) => [`exports.${key}`, deleteField()])),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
      }
    }
  };

  // Re-derive static findings from the stored legacy code for the Evidence tab
  const { findings, findingsSummary, missingDeps } = useMemo(() => {
    if (!legacyCode) return { findings: [] as SupportFinding[], findingsSummary: null, missingDeps: [] as import('@/lib/abap/class-model').MissingDependency[] };
    const abapSources = [{ file: uploadedFileName || 'main.abap', content: legacyCode }];
    const realModel = buildClassModel(abapSources);
    const detected = detectFindings(realModel, abapSources);
    const summary = summarize(detected, realModel);
    return { findings: detected, findingsSummary: summary, missingDeps: realModel.missing };
  }, [legacyCode, uploadedFileName]);

  // The evidence findings (with snippets, targetOptions, sapReplacement) for the
  // report, read from the server: computed from the stored source with the
  // file name the run signed and the catalog snapshot of the project's target
  // profile — the run's own inputs. Computing it here with the default catalog
  // showed a Private Edition project findings its run never signed.
  // The whole report is kept, not just the findings. `coverage` is what the
  // detectors did not judge, and dropping it here is how an empty finding list
  // came to look like a clean program.
  // Only the report of a run reads it: the upload form shows none.
  const hasStoredResults = !!(project?.analysis || project?.activeRunId);
  const projectEvidence = useProjectEvidence(
    projectId as string,
    hasStoredResults && Boolean(project?.legacyCode),
    project?.activeRunId ?? '',
  );
  const evidenceFailed = projectEvidence.state === 'failed' ? projectEvidence.reason : null;
  const evidenceReport = projectEvidence.state === 'ready' ? projectEvidence.value.evidence : null;

  const evidenceFindings = useMemo(() => evidenceReport?.findings ?? [], [evidenceReport]);

  // ── The object page's figures (proposal A, owner decision 01.10.2026) ──
  //
  // The clean core level of each finding, looked up through the same route the
  // A–D panel asks (`/api/abcd-classify`), for the use the finding's kind names
  // — a read of VBAK is C, a write D. Not part of the signed run; the screen
  // says so where it draws them.
  const evidenceRows = useMemo(() => findingRows(evidenceFindings), [evidenceFindings]);
  const levelObjects = useMemo(
    () =>
      evidenceRows
        .filter((r) => r.finding.objectName)
        .map((r) => ({ name: r.finding.objectName!.trim().toUpperCase(), use: accessUseOfKind(r.finding.kind) })),
    [evidenceRows],
  );
  const levelLookup = useAbcdCatalogLookup(levelObjects, project ? catalogLookupTargetOf(project) : null);
  const levelOf = useMemo(
    () => (f: EvidenceFinding): CloudReadinessGrade | null => {
      if (!f.objectName || levelLookup.status !== 'ready') return null;
      return levelLookup.grades[gradeKey(f.objectName.trim().toUpperCase(), accessUseOfKind(f.kind))]?.grade ?? 'Unknown';
    },
    [levelLookup],
  );
  const levelFacet = useMemo(() => {
    const dist: Record<CloudReadinessGrade, number> = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
    let noObject = 0;
    for (const r of evidenceRows) {
      if (!r.finding.objectName) {
        noObject++;
        continue;
      }
      const g = levelOf(r.finding);
      if (g) dist[g]++;
    }
    return { status: levelLookup.status, dist, noObject };
  }, [evidenceRows, levelOf, levelLookup.status]);

  // The process steps behind the program map: the routines the entry block
  // calls, read off the skeleton the Business view draws.
  const processSteps = useMemo(() => {
    if (!legacyCode) return [];
    try {
      return processStepBands(readProcess(legacyCode).skeleton, legacyCode);
    } catch {
      return [];
    }
  }, [legacyCode]);

  // What the engine did not assess, by kind, with the line each kind begins at.
  const notAssessedItems = useMemo(
    () => (evidenceReport?.coverage?.gaps ?? []).map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine })),
    [evidenceReport],
  );

  // The score's deductions, recomputed from the findings on this page with the
  // router's own table; shown only beside a score they add up to.
  const scoreParts = useMemo(
    () => (evidenceReport ? scoreBreakdown(evidenceReport.findings, evidenceReport.coverage && !evidenceReport.coverage.complete ? evidenceReport.coverage.gaps.length : 0) : null),
    [evidenceReport],
  );

  // ── The Clean Core Score, as signed ──
  //
  // This used to be a second, different number. `liveCleanCoreScore` recomputed
  // it in the browser as 60 % construct coverage + 30 % a "standard fit bonus"
  // read out of the Gemini narrative with /high|medium|low/ and defaulted to 80
  // when nothing matched + 10 % the stored value. A model answering "High" moved
  // the customer-facing gauge above what the immutable Run and the audit pack can
  // prove — under the label the whole trust chain rests on.
  //
  // What is shown now is what `/api/runs/create` signed: the deterministic
  // router's score, computed from the evidence before any AI ran. `routeReport`
  // carries it during the run itself, the project document afterwards. When
  // neither is there yet, nothing is shown — a score is a measurement, and the
  // absence of one is not an 80.
  // The scan verdict for whatever is currently staged, however it got there.
  // The banner below used to hang on `legacyCode` existing, which is true for
  // pasted code that nothing ever looked at.
  const stagedScanBlock = useMemo(
    () => (legacyCode ? scanCodeContent(legacyCode) : null),
    [legacyCode],
  );

  /**
   * The lines of the staged source that look as though they may hold personal
   * data — a hint before the text leaves the browser, never a verdict about it
   * (`lib/personal-data-hints.ts`).
   *
   * Read off `legacyCode` for the same reason the payload scan above is: the
   * textarea can be edited after the file was dropped, and this is the value
   * that is about to be sent. A starter example is ours, not the reader's, so
   * there is nothing of theirs to notice in it and it is left alone — the same
   * condition the Terms checkbox below already uses.
   */
  // Roadmap 7.10 - the repository objects the staged source defines, the ones a
  // language version is declared for.
  const stagedObjects = useMemo(() => repositoryObjectsOf(extractCodeInventory(legacyCode || '')), [legacyCode]);

  const personalDataHints = useMemo(
    () => (legacyCode && !isFromExample ? scanForPersonalDataHints(legacyCode) : []),
    [legacyCode, isFromExample],
  );
  const personalDataKey = personalDataHintKey(personalDataHints);
  const personalDataAcknowledged = personalDataKey !== '' && personalDataAckFor === personalDataKey;
  /** Something to look at, and nobody has said they looked. */
  const personalDataPending = personalDataHints.length > 0 && !personalDataAcknowledged;
  /** Ticked once for other lines than the ones now shown: the tick is gone, and the box says why. */
  const personalDataAckStale = personalDataHints.length > 0 && personalDataAckFor !== '' && personalDataAckFor !== personalDataKey;

  /**
   * The route's confidence as the run signed it (`recommendationConfidence`),
   * or as the router just computed it — never the number in the model's JSON
   * (QA full review of 81810c8, d5a87a5db395).
   */
  const signedRouteConfidence: number | null =
    typeof routeReport?.confidenceScore === 'number'
      ? routeReport.confidenceScore
      : typeof project?.recommendationConfidence === 'number'
        ? project.recommendationConfidence
        : null;

  const signedCleanCoreScore: number | null =
    typeof routeReport?.cleanCoreScore === 'number'
      ? routeReport.cleanCoreScore
      : typeof project?.cleanCoreScore === 'number'
        ? project.cleanCoreScore
        : null;

  /**
   * Why this run has no narrative — roadmap 1.2.
   *
   * The run just finished knows it exactly (`lastNarrativeAbsence`). A page
   * opened later does not, and must not invent one: it says the reason that is
   * true *now* — the stage is switched off, or there is no key — and otherwise
   * the plain "nothing has been generated yet", which is the only honest answer
   * when the past is not recorded. Nothing about the reason is stored on the
   * run, because a reason the client supplied has no business inside a
   * signature.
   */
  const narrativeAbsence: ModelAbsence = useMemo(() => {
    if (!project?.activeRunId || project?.analysis) return null;
    if (lastNarrativeAbsence) return lastNarrativeAbsence;
    if (!modelAvailability.known) return null;
    if (!modelAvailability.keyAvailable) return 'no-key';
    if (!modelAvailability.stages.analyze) return 'stage-off';
    return null;
  }, [
    project?.activeRunId,
    project?.analysis,
    lastNarrativeAbsence,
    modelAvailability.known,
    modelAvailability.keyAvailable,
    modelAvailability.stages,
  ]);
  /**
   * On a page opened later the reason above is the state *now*, not the reason
   * the run has none, which is not recorded. Said in so many words, so the
   * present state does not read as the past cause (carried QA finding
   * 99d1991763df).
   */
  const narrativeAbsenceWhy: string | undefined =
    narrativeAbsence && !lastNarrativeAbsence
      ? `Why this run has none was not recorded. Right now: ${modelAbsenceReason(narrativeAbsence, 'analyze')}`
      : undefined;

  // ── The results, answer first (ADR-029, §2.11, mockup s8/s4) ──
  //
  // The page used to open its results with a report card titled as a report,
  // four tabs and a ring that read "62% Compliance". What a reader needs first
  // is the answer: one sentence and four figures, then the findings, the route,
  // the worklist — and everything else one action deeper, folded with a count,
  // never removed. All that "could not be determined" is gathered in one place
  // with its reason, instead of a paragraph wherever it happened to arise.
  // The route switch writes the project; a refused or lost write is said next to
  // the button instead of leaving the route silently unchanged (QA review of
  // a88149856dcc).
  const [routeSwitch, setRouteSwitch] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  // Which optional import is open in its dialog — usage data or ATC results.
  const [importDialog, setImportDialog] = useState<'usage' | 'atc' | null>(null);
  // The one list of what is not determined is the side card; "Show the list"
  // on the facet brings it into view.
  const showNotDetermined = () => {
    window.requestAnimationFrame(() =>
      document.getElementById('analysis-not-determined')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const findingCounts = useMemo(() => countFindings(groupEvidenceFindings(evidenceFindings)), [evidenceFindings]);
  const sourceLines = countSourceLines(legacyCode ?? '');

  /** The head's facets and status line, the same in both kinds of report. */
  const answerFacts = (route: string | null | undefined) => {
    const catalogRaw = project?.auditMetadata?.modelCard?.catalogVersion;
    const catalog = catalogRaw ? catalogForReader(catalogRaw) : null;
    return {
      severities: SEVERITY_ORDER.map((key) => ({ key, count: evidenceRows.filter((r) => r.finding.severity === key).length })),
      levels: levelFacet,
      notAssessed: {
        kinds: notAssessedItems.length,
        constructs: notAssessedItems.reduce((n, g) => n + g.count, 0),
        items: notAssessedItems,
      },
      meta: {
        fileName: sourceFileName(project),
        lines: sourceLines || null,
        // A catalog version the reader form cannot shorten keeps its base name only — never a hash on screen.
        catalog: catalog && catalog.includes('@') ? catalog.split(' + ')[0] : catalog,
        engine: project?.auditMetadata?.modelCard?.engineVersion ?? null,
      },
      status: [
        // Two entries, not one: one entry naming the engine and a model narrative under a head
        // that says "without a model" read as a contradiction. The evidence is
        // the engine's alone; the narrative, when there is one, is a proposal.
        // Evidence · Run · Route (owner decision 02.10.2026). The model's
        // summary says what it is where it stands, folded below, and the
        // successors are counted in the findings list itself.
        { key: 'evidence', label: 'Evidence', value: 'engine only, no model', dot: 'bg-cc-information' },
        { key: 'run', label: 'Run', value: project?.activeRunId ? 'signed' : 'no signed run', dot: 'bg-cc-neutral' },
        { key: 'route', label: 'Route', value: plainRoute(route) ?? 'not determined', dot: 'bg-cc-chart-2' },
      ],
    };
  };

  /** The Clean Core Score section, first in the main column. */
  const scoreSection = (
    <CleanCoreScoreSection score={signedCleanCoreScore} breakdown={scoreParts} onExplain={() => setShowScoreModal(true)} />
  );

  /** What the engine could not settle in the source itself — the same three in both kinds of report. */
  const sourceOpenItems = (): OpenItem[] => {
    const items: OpenItem[] = [];
    if (evidenceReport && coverageCaveat(evidenceReport.coverage)) {
      items.push({
        key: 'coverage',
        title: 'Statements outside the engine’s checks',
        reason: 'Nobody has judged these statements either way — they are not defects, and not cleared either.',
        body: <UnassessedConstructs coverage={evidenceReport.coverage} />,
      });
    }
    if (missingDeps.length > 0) {
      items.push({
        key: 'missing-objects',
        title: `${missingDeps.length} ${missingDeps.length === 1 ? 'object' : 'objects'} the code refers to but were not supplied`,
        reason: 'Without their source the engine cannot resolve what this code inherits or calls through them.',
        body: <MissingDependencyPrompt missing={missingDeps} />,
      });
    }
    if (reviewTasks.counts.total > 0) {
      items.push({
        key: 'check-tasks',
        title: reviewTasksTitle(reviewTasks.counts.total),
        reason: 'Each one is a question, not a result: it names the line and the one step that would settle it.',
        body: <ReviewTasks result={reviewTasks} />,
      });
    }
    return items;
  };

  /** Complexity and criticality on the engine's 1–10 scale — part of the technical detail. */
  const renderMeters = () => {
    // Recomputed from the code on the page, on the 1–10 scale.
    const liveComplexity = legacyCode ? computeComplexityScore(legacyCode) : project?.complexityScore;
    const liveCriticality = legacyCode ? computeCriticalityScore(legacyCode) : project?.criticalityScore;
    if (liveComplexity === undefined && liveCriticality === undefined) return null;
    return (
      <>
        {(liveComplexity !== undefined || liveCriticality !== undefined) && (
          <div className="flex flex-wrap gap-4">
            {liveComplexity !== undefined && (
              <ScoreMeter
                title="Complexity measures structural code intricacy: control flow depth, dependency count, and custom object coupling. Scale: 1 = trivial, 5 = moderate, 10 = highly complex."
                icon={<Layers size={16} aria-hidden="true" />}
                label="Complexity"
                value={liveComplexity}
                caption={liveComplexity >= 7 ? 'High — significant refactoring needed' : liveComplexity >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration'}
              />
            )}
            {liveCriticality !== undefined && (
              <ScoreMeter
                title="Criticality measures business impact: process priority, data sensitivity, and integration depth. Scale: 1 = low impact, 5 = important, 10 = mission-critical."
                icon={<Zap size={16} aria-hidden="true" />}
                label="Criticality"
                value={liveCriticality}
                caption={liveCriticality >= 7 ? 'Mission-critical — requires careful planning' : liveCriticality >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate'}
              />
            )}
          </div>
        )}
      </>
    );
  };

  /** Inventory, data access, the levels A–D and the review hints. */
  const renderInventory = () => {
    if (!project) return null;
    return (
      <>
        <CodeInventoryTable codeInventory={project.codeInventory || []} />
        <ModuleHeatmap codeInventory={project.codeInventory || []} />
        <DataCouplingTable dataCoupling={project.dataCoupling || []} />
        {/* Cloud Readiness Classification (A–D) */}
        <AssessmentProfileSummary project={project} />
        <AbcdClassificationPanel dataCoupling={project.dataCoupling || []} codeInventory={project.codeInventory || []} deployment={project.s4Deployment} release={project.assessmentProfile?.release} />
        {/* What those same tables may mean for a compliance review (roadmap
            7.7) — hints out of the table names, never a classification of
            anybody's data, and no model call. */}
        <ComplianceReviewHints dataCoupling={project.dataCoupling || []} />
        {/* With nothing open, the check tasks say so here, in their own words;
            with something open they are listed under "could not determine". */}
        {reviewTasks.counts.total === 0 && <ReviewTasks result={reviewTasks} />}
      </>
    );
  };

  /** The imports a reader made, compared with — never merged into — the engine's findings. */
  const renderImports = () => {
    const usage = usageReport || project?.usageReport;
    const atc = atcReport || project?.atcReport;
    const showUsage = !!usage && evidenceFindings.length > 0 && !!routeReport;
    if (!showUsage && !atc) return null;
    return (
      <FoldedPart title="Imported usage and ATC results" data-analysis-imports={(showUsage ? 1 : 0) + (atc ? 1 : 0)}>
        {/* v1.22: Usage × Evidence Risk Matrix */}
        {(usageReport || project?.usageReport) && evidenceFindings.length > 0 && routeReport && (
          <SectionBoundary name="Usage Risk Matrix">
            <UsageRiskMatrixFor
              usageReport={(usageReport || project!.usageReport)!}
              findings={evidenceFindings}
              route={routeReport}
              target={project ? catalogLookupTargetOf(project) : null}
            />
          </SectionBoundary>
        )}
        {/* Roadmap 7.1: ATC-Import, compared with — never merged into — the
            engine's own evidence findings. */}
        {(atcReport || project?.atcReport) && (
          <SectionBoundary name="ATC Findings Panel">
            <AtcFindingsPanel
              atcReport={(atcReport || project!.atcReport)!}
              findings={evidenceFindings}
            />
          </SectionBoundary>
        )}
      </FoldedPart>
    );
  };

  /**
   * "Technical detail" — one section at the bottom, folded (owner decision
   * 02.10.2026). It gathers what used to be four: complexity and criticality,
   * the language constructs the engine resolved, the code inventory with data
   * access and the levels A–D, and the imported usage and ATC results. Each
   * keeps its own heading inside; nothing in it was removed.
   */
  const renderTechnicalDetail = (extra?: React.ReactNode) => {
    const meters = renderMeters();
    return (
      <FoldedSection id="analyze-technical-detail" data-analysis-technical-detail="" title="Technical detail">
        {meters ? <FoldedPart title="Complexity and criticality">{meters}</FoldedPart> : null}
        <FoldedPart title="Language constructs the engine resolved" data-analysis-constructs={findings.length}>
          {/* Coverage verdict and the construct checklist, with its Confirm. */}
          <CoverageVerdict findings={findings} summary={findingsSummary} />
          <ConstructFindings findings={findings} />
        </FoldedPart>
        <FoldedPart title="Code inventory, data access and clean core levels A–D">
          <SectionBoundary name="Assessment & Value">
            <div className="space-y-8">
              {renderInventory()}
              {extra}
            </div>
          </SectionBoundary>
        </FoldedPart>
        {renderImports()}
      </FoldedSection>
    );
  };

  const renderAnalysisContent = () => {
    if (!project?.analysis) {
      // Roadmap 1.2, acceptance V25-A12: *"'not generated' instead of empty"*.
      //
      // Before this, `return null` was the whole answer, and the screen fell
      // back to the upload form — a signed run existed, its evidence was in the
      // database, and the page invited the reader to start an analysis. What
      // follows is that run's evidence, with the one missing part named as
      // missing. Everything here is computed without a model.
      if (!project?.activeRunId) return null;
      const openItems: OpenItem[] = [
        ...sourceOpenItems(),
        // The business value assessment is on Economics since 02.10.2026, and
        // says there that this run has none.
        {
          key: 'strategy',
          title: 'Modernisation strategy',
          reason: 'The standardisation fit and the recommendation prose come from the narrative. The route on this page does not.',
          body: <NotGenerated what="Modernisation strategy" absence={narrativeAbsence} why={narrativeAbsenceWhy} stage="analyze" />,
        },
      ];
      const evidenceRoute = project.extensibilityRoute ?? null;
      return (
        <div className="space-y-6 font-sans" data-evidence-only-report>
          <AnalysisAnswer
            answer={analysisAnswer({
              counts: findingCounts,
              lines: sourceLines,
              route: evidenceRoute,
              routeChosenByReader: false,
              notDetermined: openItems.length,
            })}
            counts={findingCounts}
            score={signedCleanCoreScore}
            routeChosenByReader={false}
            notDetermined={openItems.length}
            onExplainScore={() => setShowScoreModal(true)}
            onShowNotDetermined={showNotDetermined}
            {...answerFacts(evidenceRoute)}
          />

          <EvidenceFindingsTable
            findings={evidenceFindings}
            sourceLines={sourceLines}
            source={legacyCode}
            levels={{ status: levelLookup.status, of: levelOf }}
            steps={processSteps}
            notAssessed={notAssessedItems}
            scoreSection={scoreSection}
            fileName={sourceFileName(project) ?? (uploadedFileName !== PASTED_SOURCE_NAME ? uploadedFileName : 'source')}
            sideTop={
              <ObjectSection side title="Extensibility route" right={<CcProvenanceChip value="reconstructed" note="fixed rules" />}>
                <div className="flex items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted p-3">
                  <span aria-hidden={true} className="grid h-10 w-10 shrink-0 place-items-center rounded-cc-card border border-cc-line bg-cc-surface text-cc-ink">
                    <Cloud size={20} aria-hidden="true" />
                  </span>
                  <p className="m-0 cc-text-h3 text-cc-ink">{project.extensibilityRoute ? routeLabel(project.extensibilityRoute) : 'Not determined'}</p>
                </div>
                {project.recommendationJustification && (
                  <p className="m-0 mt-3 cc-text-cell text-cc-ink">{sapNamesForDisplay(project.recommendationJustification)}</p>
                )}
                <div className="mt-3">
                  <CcButton variant="secondary" density="compact" onClick={() => router.push(`/project/${projectId}/design`)}>
                    Open Design
                  </CcButton>
                </div>
              </ObjectSection>
            }
            sideBottom={<NotDeterminedSide items={openItems} />}
          />

          {/* Where the model's summary would stand: folded, saying it is not there. */}
          <FoldedSection id="analyze-summary" data-analysis-summary="not-generated" title="Model summary">
            <NotGenerated
              what="Analysis narrative"
              absence={narrativeAbsence}
              why={narrativeAbsenceWhy}
              stage="analyze"
              hint="Everything on this page was computed by the evidence engine and is covered by this run's signature. Re-run the analysis once a model is available to add the narrative."
            />
          </FoldedSection>

          {renderTechnicalDetail(<WhyScorePanel project={project} />)}
        </div>
      );
    }

    // The one reader of a stored analysis: every stored shape, amounts of money masked (lib/money-honesty.ts).
    // Not JSON → null, and the markdown fallback below masks its text the same way.
    const analysisData = readStoredAnalysis<AnalysisData>(project.analysis);

    /**
     * The stored route differs from the one that was recommended — an architect
     * pressed "Switch Track". The recommendation's confidence and rationale
     * describe the other route and are labelled as such below. Read from the
     * analysis already parsed above: this page has one reader of a stored
     * analysis and a guard that counts its call sites (money-honesty-guard).
     */
    const recommendedRoute = analysisData?.extensibilityRouting?.recommendedRoute;
    const routeIsOverridden = routeWasOverridden(recommendedRoute, project?.extensibilityRoute);

    if (analysisData) {
      // The business value assessment and the action plan are read on
      // Economics since 02.10.2026 (components/tco/BusinessValuePlan.tsx).
      const checkpoints = analysisData.extensibilityRouting?.decisionTreeCheckpoints;
      const comparative = analysisData.extensibilityRouting?.comparativeAnalysis;
      const shownRoute = project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || null;
      const routeForCards = shownRoute || SIDE_BY_SIDE_ROUTE;
      const isBtp = isSideBySideRoute(routeForCards);
      const storedRationale = analysisData.extensibilityRouting?.rationale;
      const rationale = storedRationale ? sapNamesForDisplay(storedRationale) : storedRationale;

      const openItems: OpenItem[] = [...sourceOpenItems()];
      if (!routeIsOverridden && signedRouteConfidence === null) {
        openItems.push({
          key: 'route-confidence',
          title: 'How certain the route recommendation is',
          reason: 'This run recorded no confidence for its route, so none is shown — a missing figure is not filled in.',
        });
      }
      if (!routeIsOverridden && !rationale) {
        openItems.push({
          key: 'route-rationale',
          title: 'Why this route was recommended',
          reason: 'No rationale was recorded for this route. The route itself comes from fixed rules over the findings.',
        });
      }
      if (!analysisData.standardFit?.potential) {
        openItems.push({
          key: 'standard-fit',
          title: 'How much of it the SAP standard covers',
          reason: 'The narrative named no standard fit for this code.',
        });
      }

      const answer = analysisAnswer({
        counts: findingCounts,
        lines: sourceLines,
        route: shownRoute,
        routeChosenByReader: routeIsOverridden,
        notDetermined: openItems.length,
        // This branch draws the model's Summary below, marked "Model proposal".
        narrative: true,
      });

      return (
        <div className="space-y-6 font-sans">
          <AnalysisAnswer
            answer={answer}
            counts={findingCounts}
            score={signedCleanCoreScore}
            routeChosenByReader={routeIsOverridden}
            notDetermined={openItems.length}
            onExplainScore={() => setShowScoreModal(true)}
            onShowNotDetermined={showNotDetermined}
            {...answerFacts(shownRoute)}
          />

          <EvidenceFindingsTable
            findings={evidenceFindings}
            sourceLines={sourceLines}
            source={legacyCode}
            levels={{ status: levelLookup.status, of: levelOf }}
            steps={processSteps}
            notAssessed={notAssessedItems}
            scoreSection={scoreSection}
            fileName={sourceFileName(project) ?? (uploadedFileName !== PASTED_SOURCE_NAME ? uploadedFileName : 'source')}
            sideBottom={<NotDeterminedSide items={openItems} />}
            sideTop={
              /* The route, as the rules recommended it or as the reader chose it. */
              <ObjectSection
                side
                title="Extensibility route"
                right={routeIsOverridden ? <CcProvenanceChip value="confirmed" note="your choice" /> : <CcProvenanceChip value="reconstructed" note="fixed rules" />}
              >
                <div className="flex items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted p-3">
                  <span aria-hidden={true} className="grid h-10 w-10 shrink-0 place-items-center rounded-cc-card border border-cc-line bg-cc-surface text-cc-ink">
                    <Cloud size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The preservation register names this element as where
                      `extensibilityRoute` becomes visible; see
                      docs/registers/preservation-register.json. */}
                  <span data-stage-output="extensibilityRoute" className={ROUTE_TAG_CLASS}>
                    {isBtp
                      ? <GlossaryTerm termKey="SAP BTP" className="border-b-0 text-cc-ink">{SIDE_BY_SIDE_LABEL}</GlossaryTerm>
                      : <GlossaryTerm termKey="RAP" className="border-b-0 text-cc-ink">ABAP Cloud (RAP)</GlossaryTerm>}
                  </span>
                  <span className="cc-text-meta text-cc-ink-muted">
                    {routeIsOverridden
                      ? 'Chosen by you'
                      : signedRouteConfidence !== null
                        ? `${signedRouteConfidence}% Conf.`
                        : 'Confidence not computed'}
                  </span>
                </div>
                <p data-route-target="" className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
                  {/* After a switch, the recommended route's artefact is not the target
                      (QA full review of fc787674705f, 08fd882e60b3). */}
                  Target: {(!routeIsOverridden && analysisData.extensibilityRouting?.targetArtifact) || (isBtp
                    ? <GlossaryTerm termKey="CAP" className="border-b-0 text-cc-ink">{`${BTP} Node.js App (CAP)`}</GlossaryTerm>
                    : <GlossaryTerm termKey="RAP" className="border-b-0 text-cc-ink">RAP Business Object</GlossaryTerm>)}
                </p>
                  </div>
                </div>
                {routeIsOverridden ? (
                  // The confidence and the reasoning belong to the route
                  // that was recommended. Printed beside a route the user
                  // switched to, they read as support for the opposite
                  // decision (QA review of 33471220d6e9, 210bafeb4c8b).
                  <p className="mt-1 cc-text-cell text-cc-ink-muted">
                    You changed this route. The recommendation was{' '}
                    <span className="font-semibold text-cc-ink">{routeLabel(analysisData.extensibilityRouting?.recommendedRoute ?? '')}</span>
                    {signedRouteConfidence !== null
                      ? ` at ${signedRouteConfidence}% confidence`
                      : ''}
                    {rationale ? `: ${rationale}` : '.'}
                  </p>
                ) : rationale ? (
                  <p className="mt-1 cc-text-cell text-cc-ink-muted">{rationale}</p>
                ) : (
                  // Said in one short line here; the reason is in the list of
                  // things not determined.
                  <p className="mt-1 cc-text-cell text-cc-ink-muted">No rationale recorded.</p>
                )}
                <p className="mt-3 cc-text-meta text-cc-ink-muted">
                  Target system: {(project.s4Deployment || 'public') === 'public' ? 'S/4HANA Public Cloud' : 'Private Cloud / RISE'}
                </p>

                <div className="mt-3">
                  <CcButton variant="secondary" density="compact" onClick={() => router.push(`/project/${projectId}/design`)}>
                    Open Design
                  </CcButton>
                </div>

                {/* "Why this route" — the decision path, the standard fit, the
                    evidence and assumptions behind the route, and the way to
                    choose the other one. It was a section of its own further
                    down the page; since 02.10.2026 it is here, with the route
                    it explains, one action deeper (owner decision). */}
                <div className="mt-3 border-t border-cc-line pt-1" data-route-why="">
                  <CcDisclosure title="Why this route">
                    <div className="space-y-5">
                      {/* ── The evidence behind the route, while the run that computed it is on screen ── */}
                      {routeReport && (
                        <div className="mt-3 rounded-cc-row bg-cc-surface-muted px-3 py-2 border border-cc-line flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="cc-text-meta text-cc-ink-muted">
                            Confidence{' '}
                            <span className={STATE_CLASSES[scoreState(routeReport.confidenceScore, 'higher-is-better')].text}>{routeReport.confidenceScore}%</span>
                          </span>
                          <span className="cc-text-meta text-cc-ink">
                            {/* The router counts the engine's entries — places in the code, not findings. */}
                            Based on {routeReport.evidenceCounts.totalFindings} {routeReport.evidenceCounts.totalFindings === 1 ? 'place' : 'places'} in the code
                            {routeReport.evidenceCounts.criticalFindings > 0 && (
                              <span className="text-cc-error ml-1">({routeReport.evidenceCounts.criticalFindings} critical)</span>
                            )}
                          </span>
                          <span className="cc-text-meta text-cc-ink">{routeReport.evidenceCounts.supportingFindings} {routeReport.evidenceCounts.supportingFindings === 1 ? 'place in the code drives' : 'places in the code drive'} the route</span>
                          {routeReport.assumptions.length > 0 && (
                            <CcDisclosure title="Assumptions" count={routeReport.assumptions.length}>
                              <ul className="mt-1 space-y-1 pl-2">
                                {routeReport.assumptions.map((a, i) => (
                                  <li key={i} className="cc-text-cell text-cc-ink-muted">• {a}</li>
                                ))}
                              </ul>
                            </CcDisclosure>
                          )}
                        </div>
                      )}

                  <SectionBoundary name="Modernization Strategy">
                    <div className="space-y-8">
                      {/* Decision matrix pathway */}
                      <ExtensibilityDecisionMatrix
                        extensibilityRoute={routeForCards}
                        decisionTreeCheckpoints={checkpoints}
                        comparativeAnalysis={comparative}
                      />

                      {/* S/4HANA Standard Fit */}
                      <TargetScopeMapping
                        showHelpMode={false}
                        standardFit={analysisData.standardFit}
                      />

                      {/* Core Clean recommendations — reconciled to avoid contradictions */}
                      {(() => {
                        const recs = analysisData.recommendations;
                        if (!recs) return null;
                        const reconciledRecs = { ...recs };

                        // Reconcile: if decommissioning says "retire" but cloudReadiness says "rewrite", fix cloudReadiness
                        const isRetire = /\b(retire|retired|decommission|removed|delete|obsolete)\b/i.test(recs.decommissioning || '');
                        const isRewrite = /\b(rewrit|rewrite|rewritten|must be rewritten)\b/i.test(recs.cloudReadiness || '');

                        if (isRetire && isRewrite) {
                          // Extract the standard replacement from keepCoreClean if available
                          const standardMatch = (recs.keepCoreClean || '').match(/(?:released|standard|use)\s+(?:CDS\s+view\s+)?([A-Z_][A-Z0-9_]*)/i);
                          const standardObj = standardMatch ? standardMatch[1] : 'the released standard object';
                          reconciledRecs.cloudReadiness = `No rewrite needed. Since the function module is being retired and replaced by ${standardObj}, no ABAP Cloud migration of the legacy code is required. Simply adopt the standard replacement and remove the custom object.`;
                        }

                        return (
                          <ModernizationStrategy
                            showHelpMode={false}
                            recommendations={reconciledRecs}
                          />
                        );
                      })()}
                    </div>
                  </SectionBoundary>

                      {/* Interactive override: the reader's choice, marked as theirs above. */}
                      <div data-route-override="" className="border-t border-cc-line pt-3">
                        <p className="m-0 cc-text-cell font-semibold text-cc-ink">Not the route you want?</p>
                        <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">
                          Choose the other one; it is then marked as your choice, and the recommendation stays on record beside it.
                        </p>
                        <div className="mt-2">
                          <CcButton
                            variant="ghost"
                            density="compact"
                            title="Not the route you want? Choose the other one; it is then marked as your choice."
                            icon={<RefreshCw size={16} aria-hidden="true" />}
                            busy={routeSwitch.busy}
                            data-route-switch
                            onClick={async () => {
                              if (routeSwitch.busy) return;
                              const currentRoute = project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || SIDE_BY_SIDE_ROUTE;
                              const nextRoute = isSideBySideRoute(currentRoute) ? IN_APP_ROUTE : SIDE_BY_SIDE_ROUTE;

                              setRouteSwitch({ busy: true, error: '' });
                              try {
                                const docRef = doc(getDb(), 'projects', projectId as string);
                                await updateDoc(docRef, { extensibilityRoute: nextRoute });
                                setProject((prev: any) => prev ? { ...prev, extensibilityRoute: nextRoute } : prev);
                                setRouteSwitch({ busy: false, error: '' });
                              } catch {
                                setRouteSwitch({ busy: false, error: 'The route could not be changed. Nothing was saved; check your connection and try again.' });
                              }
                            }}
                          >
                            {isBtp ? 'Switch to ABAP Cloud' : `Switch to ${BTP}`}
                          </CcButton>
                        </div>
                        {routeSwitch.error && (
                          <div className="mt-2" data-route-switch-error>
                            <CcMessageStrip state="error" announce>
                              {routeSwitch.error}
                            </CcMessageStrip>
                          </div>
                        )}
                      </div>
                    </div>
                  </CcDisclosure>
                </div>
              </ObjectSection>
            }
          />

          {/* What the model wrote about this code — outside the signature by
              design, so folded and marked as a proposal (owner decision
              02.10.2026). The standard fit it used to repeat is under "Why
              this route", with the route it explains. */}
          <FoldedSection
            id="analyze-summary"
            data-analysis-summary="model"
            title="Model summary"
            aside={<CcProvenanceChip value="proposed" />}
          >
            <div className="min-w-0">
              {/*
                The summary is the one narrative field a reader treats as
                the report's conclusion, and it is outside the signature by
                design. It shows which of its sentences point at a line
                of the program and which do not.
              */}
              {analysisData.summary ? (
                <AnchoredNarrative
                  text={analysisData.summary}
                  findings={evidenceFindings}
                  totalLines={sourceLines}
                />
              ) : (
                <p className="m-0 cc-text-cell text-cc-ink-muted">The narrative has no summary.</p>
              )}
            </div>
          </FoldedSection>

          {renderTechnicalDetail()}
        </div>
      );
    }

    return (
      <>
      <div
        className="cc-prose"
        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(withoutUnapprovedMoney(project.analysis)) }}
      />
      <WhyScorePanel project={project} />
      </>
    );
  };

  const phases = workflowSteps(project);
  /** The run's report is on screen rather than the upload form. */
  const hasResults = hasStoredResults;

  // The report is drawn from the engine's findings; until the server has
  // answered it would draw an empty report for a program that has findings, so
  // the page keeps its loading state for that moment instead.
  const evidencePending = hasResults && Boolean(project?.legacyCode) && projectEvidence.state === 'loading';
  // Said only where a report would otherwise be drawn without its findings.
  const evidenceUnread = hasResults && Boolean(project?.legacyCode) ? evidenceFailed : null;

  if ((loading && !project) || evidencePending) return (
    <div className="h-[60vh] flex flex-col items-center justify-center">
        <div className="motion-safe:animate-spin rounded-full h-12 w-12 border-2 border-cc-line border-b-cc-ink mb-4"></div>
        <p className="cc-text-body text-cc-ink-muted">Loading project data...</p>
    </div>
  );

  return (
    // One frame for every stage (ADR-063): the results use its full width;
    // the upload form below keeps its reading width, left-aligned to it.
    <StageFrame stage="analyze" className="motion-safe:animate-in fade-in duration-500">
      <StageHeader tools={{ steps: phases, current: 'analyze' }}
        projectName={project?.name}
        stage="analyze"
        actions={
          legacyCode || (hasResults && project?.analysis) ? (
            <div className="flex flex-wrap items-center gap-2" data-analyze-header-actions="">
              {/* Two optional imports as small actions (owner decision
                  02.10.2026); each opens the upload it always had, in a
                  dialog, instead of two large panels on the page. */}
              {legacyCode ? (
                <>
                  <CcButton variant="ghost" data-analyze-add-usage="" onClick={() => setImportDialog('usage')}>
                    Add usage data
                  </CcButton>
                  <CcButton variant="ghost" data-analyze-add-atc="" onClick={() => setImportDialog('atc')}>
                    Add ATC results
                  </CcButton>
                </>
              ) : null}
              {hasResults && project?.analysis ? (
                <CcButton
                  variant="secondary"
                  icon={<FileCode2 size={16} aria-hidden="true" />}
                  onClick={() => exportToConfluence()}
                >
                  Export Confluence
                </CcButton>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {hasResults
          ? 'What the evidence engine found in this code, the route it recommends, and what is still open.'
          : 'Extracting business intelligence and technical dependencies from your legacy assets.'}
      </StageHeader>

      {error && (
        <div className="mb-8">
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        </div>
      )}

      {evidenceUnread && (
        <div className="mb-8" data-analyze-evidence-failed="">
          <CcMessageStrip state="error" announce>
            The evidence for this code could not be read, so its findings are not shown. Reload the page to try again.
            {evidenceUnread !== EVIDENCE_UNREAD ? ` ${evidenceUnread}` : null}
          </CcMessageStrip>
        </div>
      )}

      {searchParams.get('reason') === 'no-run' && !project?.activeRunId && (
        <div className="mb-8">
          <CcMessageStrip state="warning">
            Analysis required. Please run the analysis first to create an immutable evidence record before proceeding to downstream stages.
          </CcMessageStrip>
        </div>
      )}

      {/* Which half of the stage the reader sees. Roadmap 1.2: the report is
          about the RUN, not about the narrative. This used to ask for the
          narrative alone, so a signed zero-LLM run put the reader back in front
          of the upload form with a "Start Analysis" button — the analysis had
          run, and the screen said it had not. A project analysed before runs
          existed has a narrative and no run, and still opens its report. */}
      {!project?.analysis && !project?.activeRunId ? (
        loading ? (
          <div className="space-y-6 max-w-5xl">
            <div className="bg-cc-surface rounded-cc-card p-4 sm:p-6 border border-cc-line shadow-cc flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-cc-row bg-cc-surface-muted flex items-center justify-center text-cc-ink-muted">
                  <RefreshCw className="w-5 h-5 motion-safe:animate-spin" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="cc-text-h3 text-cc-ink">Deterministic Evidence Engine</h2>
                  <p className="cc-text-cell text-cc-ink-muted">{loadingMessage || 'Analyzing your code — deterministic, before any model runs...'}</p>
                </div>
              </div>
              <span className="cc-text-meta text-cc-ink-muted" role="status">Running</span>
            </div>
            {sweepActive && sweepFindings.length > 0 ? (
              <EvidenceSweep
                code={sweepCode}
                findings={sweepFindings}
                isActive={sweepActive}
                onComplete={() => {
                  // The replay has shown every finding. The stage line is not
                  // touched here: it follows the run itself (handleAnalyze),
                  // not the animation (DESIGN.md §5.4).
                  sweepCompleteRef.current = true;
                }}
              />
            ) : (
              <ScannerConsole code={legacyCode} stage={loadingMessage} />
            )}
          </div>
        ) : (
          <div className="space-y-8 max-w-5xl">
            {/* The drop area takes a dragged file; the button in it is the way
                in for everyone else — a keyboard never reached the clickable
                area this used to be (D.10b). */}
            <div
              className={clsx(
                "border-2 border-dashed rounded-cc-card p-12 text-center flex flex-col items-center justify-center min-h-[320px]",
                isDragging
                  ? "border-cc-information bg-cc-information-bg"
                  : "border-cc-field-border bg-cc-surface",
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
                accept=".abap,.txt"
              />

              {legacyCode ? (
                <>
                  <div className="w-16 h-16 bg-cc-surface-muted border border-cc-line rounded-cc-card flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-8 h-8 text-cc-ink" aria-hidden="true" />
                  </div>
                  <h2 className="cc-text-h2 text-cc-ink mb-2">Source Code Ready</h2>
                  <p className="cc-text-body text-cc-ink-muted mb-6">Your legacy asset has been successfully staged for analysis.</p>
                  <CcButton variant="secondary" onClick={() => fileInputRef.current?.click()}>
                    Replace file
                  </CcButton>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-cc-surface-muted border border-cc-line rounded-cc-card flex items-center justify-center mb-6">
                    <UploadCloud className="w-8 h-8 text-cc-ink-muted" aria-hidden="true" />
                  </div>
                  <h2 className="cc-text-h2 text-cc-ink mb-2">Upload Legacy Asset</h2>
                  <p className="cc-text-body text-cc-ink-muted mb-6 max-w-md">Drag and drop your legacy code file here, or choose one. Supports .abap and .txt formats.</p>
                  <CcButton variant="secondary" icon={<UploadCloud size={16} aria-hidden="true" />} onClick={() => fileInputRef.current?.click()}>
                    Choose a file
                  </CcButton>
                  <div className="flex items-center gap-2 mt-6">
                    <CcTag>Evidence-Backed</CcTag>
                    <CcTag>Max 1MB</CcTag>
                  </div>
                </>
              )}
            </div>

            {/* Roadmap 0.11 / DESIGN.md §6.1.3: what you confirm by uploading, and
                what we do with the code — every line traceable to the Terms, the
                Privacy Policy or SECURITY.md (lib/trust-claims.ts). */}
            <TrustBeforeUpload />

            {legacyCode && (
              <div className="bg-cc-surface rounded-cc-card p-6 border border-cc-line shadow-cc space-y-6 mb-8">
                <div>
                  <h2 id="analyze-deployment-title" className="cc-text-h2 text-cc-ink">S/4HANA Target Operating Model</h2>
                  <p className="cc-text-cell text-cc-ink-muted mt-1">Select your target deployment model. This dictates Clean Core compliant score evaluations, extensibility routing rules, and generated blueprints.</p>
                </div>

                <DeploymentChoice
                  name="analyze-deployment"
                  labelledBy="analyze-deployment-title"
                  value={targetDeployment}
                  onChange={setTargetDeployment}
                  options={PAGE_DEPLOYMENT_OPTIONS}
                />

                <AssessmentTargetFields
                  deployment={targetDeployment}
                  objects={stagedObjects}
                  value={assessmentTarget}
                  onChange={setAssessmentTarget}
                />
              </div>
            )}

            {legacyCode && !isFromExample && (
              <div className="bg-cc-surface rounded-cc-card p-6 border border-cc-line shadow-cc space-y-4 mb-8">
                <h2 className="cc-text-h3 text-cc-ink flex items-center gap-2">
                  <Shield size={16} aria-hidden="true" className="text-cc-ink-muted" /> Security Scan & Terms Agreement
                </h2>

                {/* Visual Security Badge */}
                {stagedScanBlock ? (
                  <CcMessageStrip state="error" headline="Malicious Payload Check failed:">
                    {stagedScanBlock} Remove the flagged content before analysing.
                  </CcMessageStrip>
                ) : (
                  <CcMessageStrip state="success" headline="Malicious Payload Check passed:">
                    The staged code was scanned for command injections and plaintext secrets, and nothing was found. Uploads are additionally restricted to <code className="font-cc-mono">.abap</code> and <code className="font-cc-mono">.txt</code>.
                  </CcMessageStrip>
                )}

                {/* Terms and Conditions Consent Box */}
                <div className="p-4 bg-cc-surface-muted border border-cc-line rounded-cc-row">
                  <CcCheckbox
                    label="I agree to the Terms & Conditions of the Clean-Core.io Free Community Edition."
                    help="I understand this is a free prototyping platform under absolute warranty and liability disclaimer, utilizing secure Gemini models on EU-compliant servers."
                    required
                    checked={acceptedTerms}
                    onChange={setAcceptedTerms}
                  />
                </div>
              </div>
            )}

            {/* A chance to notice what the Terms ask you to strip, while the
                source is still in your own browser. It claims nothing: these
                are shapes that often indicate personal data, and the reader
                decides. Nothing is blocked and nothing is removed — the tick
                below is the whole of it (18.09.2026). */}
            <PersonalDataHints
              id="analyze-personal-data"
              hints={personalDataHints}
              acknowledged={personalDataAcknowledged}
              ackStale={personalDataAckStale}
              onAcknowledge={(next) => setPersonalDataAckFor(next ? personalDataKey : '')}
            />

            {legacyCode && (
              <div className="bg-cc-surface rounded-cc-card shadow-cc border border-cc-line p-6">
                {/* Editable, and labelled so. It used to say "Read-Only Preview"
                    over a field that took every keystroke — and the analysis
                    reads what stands here, not the uploaded file (D.10b). */}
                <CcField
                  label="Legacy Source Code"
                  help="Editable. The analysis reads the code exactly as it stands in this field; the uploaded file is not changed."
                >
                  {(control) => (
                    <textarea
                      id={control.id}
                      aria-describedby={control.describedBy}
                      className={clsx(control.className, 'h-80 py-3 font-cc-mono resize-y leading-relaxed')}
                      value={legacyCode}
                      onChange={(e) => setLegacyCode(e.target.value)}
                      placeholder="Paste legacy code here..."
                      spellCheck={false}
                    />
                  )}
                </CcField>
              </div>
            )}

            {/* Pre-Analysis Preview — deterministic quick scan before the big run */}
            {legacyCode && !project?.analysis && !loading && (
              <PreAnalysisPreview code={legacyCode} fileName={uploadedFileName} />
            )}

            {/* Roadmap 1.2 — what this run will produce, said before the click
                rather than discovered afterwards. The analysis runs either way. */}
            {legacyCode && !loading && modelAvailability.known && !modelAvailability.enabled('analyze') && (
              <div data-zero-llm-notice className="mt-8">
                <CcMessageStrip state="information" headline="This run will produce evidence only.">
                  {modelAbsenceReason(modelAvailability.keyAvailable ? 'stage-off' : 'no-key', 'analyze')}{' '}
                  The findings, the extensibility route and the Clean Core Score are computed without a model, and the run is
                  signed exactly as any other.
                </CcMessageStrip>
              </div>
            )}

            {legacyCode && !isFromExample && (!targetDeployment || !acceptedTerms || personalDataPending) && (
              <div className="mt-8">
                <CcMessageStrip state="warning" headline="Action Required:">
                  <span className="block">To start the modernization analysis, please complete the following steps:</span>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {!targetDeployment && (
                      <li>Select your <strong>S/4HANA Target Operating Model</strong> (Public Cloud or Private Cloud RISE Edition above).</li>
                    )}
                    {!acceptedTerms && (
                      <li>Accept the <strong>Terms & Conditions</strong> (via the checkbox in the Security section above).</li>
                    )}
                    {personalDataPending && (
                      <li>Read the lines that <strong>look as though they may hold personal data</strong> and tick the box to say you have checked them.</li>
                    )}
                  </ul>
                </CcMessageStrip>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-12 border-t border-cc-line mt-12">
              <CcButton
                variant="ghost"
                density="cozy"
                icon={<ArrowLeft size={16} aria-hidden="true" />}
                onClick={() => router.push('/dashboard')}
              >
                Cancel, back to My workspace
              </CcButton>

              <CcButton
                variant="primary"
                density="cozy"
                busy={loading}
                onClick={() => {
                  if (!targetDeployment) {
                    setError('Please select a S/4HANA Target Operating Model (Public Cloud or Private Cloud RISE) before starting the analysis.');
                    // Scroll to top where error displays
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  if (!acceptedTerms) {
                    setError('Please agree to the Terms & Conditions of Clean-Core.io (Free Community Edition) before starting the analysis.');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  if (personalDataPending) {
                    setError('Some lines in this source look as though they may hold personal data. Read them, then tick the box to say you have checked them and want to upload this anyway.');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  setError('');
                  setModalSelection(targetDeployment);
                  setShowConceptQuestion(true);
                }}
                disabled={loading || !legacyCode || !acceptedTerms || stagedScanBlock !== null || personalDataPending}
                /*
                  A disabled button swallows its own click, so the `if
                  (personalDataPending)` branch in the handler above can never
                  run and its explanation never reaches anybody. The security
                  block already said why here; the personal-data block did not,
                  and the only account of it sat in a box further up the page.
                  UX review of bc2f7863464c. Same sentence as the unreachable
                  handler, so the two cannot drift apart.
                */
                title={
                  stagedScanBlock
                    ? `Security Block: ${stagedScanBlock} Remove the flagged content before analysing.`
                    : personalDataPending
                      ? 'Some lines in this source look as though they may hold personal data. Read them, then tick the box to say you have checked them and want to upload this anyway.'
                      : undefined
                }
              >
                Start Analysis <ArrowRight size={16} aria-hidden="true" />
              </CcButton>
            </div>
          </div>
        )
      ) : (
        <div id="analysis-report" className="motion-safe:animate-in slide-in-from-bottom-6">
          {/* Without the evidence every figure below would be drawn from no
              findings — "found nothing" for a program that has them. The
              strip above says the read failed; the report waits for it. */}
          {evidenceUnread ? null : renderAnalysisContent()}

          <StageFooter />
        </div>
      )}

      {/* Clean Core Score explanation — the one dialog the demo shows too. */}
      <CleanCoreScoreDialog open={showScoreModal} onClose={() => setShowScoreModal(false)} />

      {/* The optional imports, each the upload it always was, in a dialog. */}
      <CcDialog
        open={importDialog === 'usage'}
        size="wide"
        title="Add usage data"
        lead="Upload SAP usage exports (SCMON, UPL, ST03N) to enable usage-weighted risk prioritization. This is optional — analysis works without it."
        onClose={() => setImportDialog(null)}
        actions={
          <CcButton variant="ghost" onClick={() => setImportDialog(null)}>
            Close
          </CcButton>
        }
      >
        <div data-analyze-usage-dialog="">
          <UsageUpload
            onImport={async (report) => {
              // Roadmap 0.7: `usageReport` left the client-writable
              // allowlist. The server holds it to the key set of
              // lib/abap/usage-model.ts and to a row ceiling — the rules
              // could only ever say `is map` — and stores what it kept.
              // A refusal throws into UsageUpload, which keeps the
              // preview and says it was not saved.
              const stored = await runProjectCommand(projectId as string, {
                command: 'record-usage-report',
                usageReport: report,
              });
              setUsageReport(report);
              setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
            }}
            existingReport={usageReport}
          />
        </div>
      </CcDialog>

      <CcDialog
        open={importDialog === 'atc'}
        size="wide"
        title="Add ATC results"
        lead="Upload an ABAP Test Cockpit worklist export to compare its findings with this engine's evidence. This is optional — analysis works without it."
        onClose={() => setImportDialog(null)}
        actions={
          <CcButton variant="ghost" onClick={() => setImportDialog(null)}>
            Close
          </CcButton>
        }
      >
        <div data-analyze-atc-dialog="">
          {/* Roadmap 7.1: Optional ATC import, next to the usage import. */}
          <AtcUpload
            onImport={async (report) => {
              // Same boundary as `usageReport` above and for the same
              // reason: server-only, held to the model's key set and a
              // row ceiling — see lib/project-commands.ts. Shown as
              // imported only once stored (carried QA finding 0817087d54b5).
              const stored = await runProjectCommand(projectId as string, {
                command: 'record-atc-report',
                atcReport: report,
              });
              setAtcReport(report);
              setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
            }}
            existingReport={atcReport}
          />
        </div>
      </CcDialog>

      {/* Target Operating Model concept question — a CcDialog (D.10b). */}
      <CcDialog
        open={showConceptQuestion}
        size="wide"
        title="Confirm Target Operating Model"
        lead="Before the analysis generates clean core recommendations, let's align on a critical architectural choice. Which target operating model is selected?"
        onClose={() => setShowConceptQuestion(false)}
        actions={
          <>
            <CcButton variant="ghost" onClick={() => setShowConceptQuestion(false)}>
              Cancel
            </CcButton>
            <CcButton
              variant="primary"
              onClick={() => {
                if (!acceptedTerms) {
                  setError('Please agree to the Terms & Conditions of Clean-Core.io (Free Community Edition) before starting the analysis.');
                  setShowConceptQuestion(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  return;
                }
                // The same check the button behind this dialog makes. The
                // dialog is only reachable through that button, but a guard
                // that lives in one of two places is a guard somebody routes
                // around later — which is why `acceptedTerms` is asked twice
                // here too.
                if (personalDataPending) {
                  setError('Some lines in this source look as though they may hold personal data. Read them, then tick the box to say you have checked them and want to upload this anyway.');
                  setShowConceptQuestion(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  return;
                }
                if (modalSelection) {
                  setTargetDeployment(modalSelection);
                  setShowConceptQuestion(false);
                  // The choice goes with the call. `setTargetDeployment` above
                  // is for the screen; this closure still holds the old value.
                  handleAnalyze(legacyCode, modalSelection);
                }
              }}
              disabled={!modalSelection || !acceptedTerms || personalDataPending}
            >
              Confirm and start the analysis <ArrowRight size={16} aria-hidden="true" />
            </CcButton>
          </>
        }
      >
        <div className="space-y-6">
          <p className="cc-text-label text-cc-ink-muted">Architecture Validation Checkpoint</p>
          <DeploymentChoice
            name="analyze-deployment-confirm"
            label="Target operating model"
            value={modalSelection}
            onChange={setModalSelection}
            options={DIALOG_DEPLOYMENT_OPTIONS}
          />

            {/* Explanation box based on selection */}
            {modalSelection && (
              <div className="p-4 rounded-cc-row border border-cc-line bg-cc-surface-muted space-y-3">
                <div className="flex items-center gap-2 cc-text-h3 text-cc-ink">
                  <Info className="w-4 h-4 text-cc-information shrink-0" aria-hidden="true" />
                  <span>Why this choice determines your modernization strategy:</span>
                </div>
                <div className="cc-text-cell text-cc-ink-muted space-y-2 font-sans">
                  {modalSelection === 'public' ? (
                    <>
                      <p>
                        In <strong>SAP S/4HANA Public Cloud (Strict SaaS)</strong>, standard code modifications are entirely blocked.
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Unreleased APIs Forbidden:</strong> Any legacy unreleased SAP tables/functions used by your custom logic are unreachable.</li>
                        <li><strong>Strict Clean Core Compliance:</strong> The analysis will prioritize <strong>{`${BTP} Side-by-Side (CAP)`}</strong> or <strong>In-App RAP</strong> using strictly released APIs. You must plan to decommission or completely rewrite outdated custom logic.</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p>
                        In <strong>SAP S/4HANA Private Cloud / On-Premise (RISE)</strong>, you can utilize the <strong>3-Tier Extensibility Model</strong>.
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Tier 2 API Wrappers:</strong> You can wrap legacy, unreleased SAP database tables or functions inside a custom Tier 2 API wrapper.</li>
                        <li><strong>Upgrade-Safe Bridging:</strong> This wrapper acts as an upgrade-safe bridge, exposing unreleased structures to Tier 1 Cloud Developer Extensibility (RAP/CAP) without blocking future S/4HANA core releases.</li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}

        </div>
      </CcDialog>
    </StageFrame>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces of this page (block D, step D.10a). Tokens only; no palette.
// ---------------------------------------------------------------------------

/** The route as a plain property label: neither state colour nor proof mark. */
const ROUTE_TAG_CLASS =
  'inline-flex items-center rounded-[4px] border border-cc-line bg-cc-surface-muted px-2 cc-text-meta text-cc-ink whitespace-nowrap';

/** A deployment choice card. Chosen = ink outline, never green (§1.1: choosing proves nothing). */
const DEPLOYMENT_CARD_CLASS =
  'p-4 rounded-cc-card border cursor-pointer flex flex-col justify-between min-h-[140px]';
const DEPLOYMENT_CARD_ON = 'bg-cc-surface-muted border-cc-ink ring-1 ring-cc-ink';
const DEPLOYMENT_CARD_OFF = 'bg-cc-surface border-cc-line hover:border-cc-field-border';

type Deployment = 'public' | 'private';

interface DeploymentOption {
  value: Deployment;
  title: string;
  /** A property of the choice, as a plain tag (not a state). */
  tag?: string;
  text: string;
}

const PAGE_DEPLOYMENT_OPTIONS: readonly DeploymentOption[] = [
  {
    value: 'public',
    title: 'Public Cloud Edition',
    tag: 'Strict Clean Core',
    text: 'SAP S/4HANA Cloud, Public Edition (SaaS). Custom core modifications are fully prohibited. Standard released APIs must be used exclusively.',
  },
  {
    value: 'private',
    title: 'Private Cloud RISE Edition',
    tag: '3-Tier Extensibility',
    text: 'SAP S/4HANA Cloud, Private Edition / On-Premise. Supports Custom Tier 2 API Wrappers to expose legacy unreleased objects upgrade-safely.',
  },
];

const DIALOG_DEPLOYMENT_OPTIONS: readonly DeploymentOption[] = [
  { value: 'public', title: 'Public Cloud', text: 'Strict SaaS rules. Zero direct modifications allowed. Released standard APIs only.' },
  { value: 'private', title: 'Private Cloud / RISE', text: '3-Tier Extensibility Model. Supports upgrade-safe Tier 2 custom wrappers.' },
];

/**
 * The deployment choice as radio cards (D.10b). It used to be two `<div
 * onClick>`s — reachable by mouse only, and silent to a screen reader about
 * being a choice at all. Native radios in a named group now carry the keyboard
 * (Tab to the group, arrows between the options) and the focus ring; the card
 * around each one is its label, so a click anywhere on it still chooses.
 */
function DeploymentChoice({
  name,
  label,
  labelledBy,
  value,
  onChange,
  options,
}: {
  name: string;
  label?: string;
  labelledBy?: string;
  value: Deployment | null;
  onChange: (value: Deployment) => void;
  options: readonly DeploymentOption[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={clsx(DEPLOYMENT_CARD_CLASS, value === option.value ? DEPLOYMENT_CARD_ON : DEPLOYMENT_CARD_OFF)}
        >
          <span className="block">
            <span className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  className="size-4 shrink-0 cursor-pointer accent-cc-ink"
                />
                {option.value === 'public'
                  ? <Cloud size={16} aria-hidden="true" className="text-cc-ink-muted" />
                  : <Shield size={16} aria-hidden="true" className="text-cc-ink-muted" />}
                <span className="cc-text-h3 text-cc-ink">{option.title}</span>
              </span>
              {option.tag ? <CcTag>{option.tag}</CcTag> : null}
            </span>
            <span className="block cc-text-cell text-cc-ink-muted">{option.text}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** The four tiers the score explanation lists — the same words as before, in one place. */

/**
 * A score's state. Only the end that needs attention is coloured; the good end
 * stays neutral, because green is reserved for what is proven (ADR-007) and a
 * low complexity or a high confidence is a measurement, not a proof.
 */
function scoreState(value: number, direction: 'higher-is-better' | 'lower-is-better'): SemanticState {
  if (direction === 'higher-is-better') return value >= 85 ? 'neutral' : value >= 70 ? 'warning' : 'error';
  return value >= 7 ? 'error' : value >= 4 ? 'warning' : 'neutral';
}

/** Complexity or criticality on the 1–10 scale, with its bar. */
function ScoreMeter({ title, icon, label, value, caption }: { title: string; icon: React.ReactNode; label: string; value: number; caption: string }) {
  const classes = STATE_CLASSES[scoreState(value, 'lower-is-better')];
  return (
    <div className="bg-cc-surface border border-cc-line rounded-cc-card px-4 py-3 shadow-cc" title={title}>
      <div className="flex items-center gap-2 mb-2">
        <span className={classes.text}>{icon}</span>
        <span className="cc-text-meta text-cc-ink-muted">{label}</span>
        <span className={clsx('cc-text-identifier', classes.text)}>
          {value}<span className="text-cc-ink-muted font-medium">/10</span>
        </span>
      </div>
      <div className="w-32 h-2 bg-cc-surface-muted border border-cc-line rounded-full overflow-hidden" aria-hidden="true">
        <div className={clsx('h-full rounded-full', classes.mark)} style={{ width: `${(value / 10) * 100}%` }} />
      </div>
      <p className="cc-text-meta font-medium text-cc-ink-muted mt-2">{caption}</p>
    </div>
  );
}

/**
 * The console shown while a run starts, before the evidence sweep takes over.
 * A code surface (ADR-028: the one dark surface that carries content), without
 * the laser line and the window dots it used to wear.
 *
 * Its log is the run's own stage line, one entry each time the stage changes
 * (D.10b). It used to replay ten fixed lines on a 950 ms timer — "[SQL]
 * Detecting Open SQL patterns…", "[DONE] … complete" — whatever the run was
 * actually doing, which is the loading state that plays at work DESIGN.md
 * §5.4 rules out.
 */
function ScannerConsole({ code, stage }: { code: string; stage: string }) {
  const [logs, setLogs] = useState<string[]>(stage ? [stage] : []);
  // A new stage is appended while rendering (React's "adjust state when a
  // prop changes"), not in an effect: there is nothing outside React to wait for.
  if (stage && logs[logs.length - 1] !== stage) setLogs([...logs, stage]);

  return (
    <div className="bg-cc-code-bg text-cc-code-ink font-cc-mono text-[12px] rounded-cc-card overflow-hidden h-[480px] flex flex-col">
      {/* Header bar */}
      <div className="border-b border-cc-code-muted/40 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <span className="cc-text-label text-cc-code-muted">Clean-Core Analyzer {APP_VERSION}</span>
        {/* Not a second live region: the card above the console already
            announces the run and its stage. */}
        <span className="cc-text-label text-cc-code-ink">Run in progress</span>
      </div>

      {/* Main split display */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-cc-code-muted/40 overflow-hidden min-h-0">
        {/* Left Side: Code Preview (low opacity, scrolling) */}
        <div className="flex-1 p-6 overflow-y-auto select-none opacity-40 pointer-events-none max-h-[200px] md:max-h-full">
          <pre className="text-[12px] leading-relaxed text-cc-code-muted">
            {code}
          </pre>
        </div>

        {/* Right Side: Log output */}
        <div className="flex-1 p-6 flex flex-col justify-end overflow-y-auto space-y-2">
          {logs.map((log, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-cc-code-muted shrink-0 font-semibold">{`>`}</span>
              <p className="leading-relaxed whitespace-pre-wrap">{log}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
