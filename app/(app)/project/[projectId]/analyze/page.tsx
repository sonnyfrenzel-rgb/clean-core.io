'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { scanCodeContent } from '@/lib/staged-code-scan';
import { personalDataHintKey, scanForPersonalDataHints } from '@/lib/personal-data-hints';
import { looksLikeAbap } from '@/lib/abap-input-check';
import { routeWasOverridden } from '@/lib/route-override';
import { runProjectCommand } from '@/lib/project-command-client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType, getAuth } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { UploadCloud, FileCode2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, RefreshCw, Activity, Download, ChevronDown, X, HelpCircle, Info, Sparkles, Trash2, Layers, Shield, ShieldAlert, BarChart3, Package, Link2, Cpu, Zap } from 'lucide-react';
import clsx from 'clsx';
import nextDynamic from 'next/dynamic';
import { DocumentSection } from '@/components/DocumentSection';
import { Components } from 'react-markdown';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { escapeHtml } from '@/lib/export-safety';
import { callGeminiWithReceipt } from '@/lib/gemini';
import type { ModelReceipt } from '@/lib/model-receipt';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import type { Project, AnalysisData, CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { absenceFromError, modelAbsenceReason, type ModelAbsence } from '@/lib/model-stages';
import GlossaryTerm from '@/components/GlossaryTerm';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { extractCodeInventory, extractDataCoupling, computeComplexityScore, computeCriticalityScore } from '@/lib/abap/code-assessment';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { buildAnalysisPrompt } from '@/lib/analysis-prompt';
/**
 * The deterministic half of the initial worklist. It used to be a function in
 * this file; roadmap 1.8 moved it to `lib/analysis-run.ts`, where the workspace
 * list report reaches it too. A second copy would let a run started from a table
 * row produce a different worklist from one started here, which is the sort of
 * difference nobody would look for.
 */
import { findingsWorklist } from '@/lib/analysis-run';
import { readStoredAnalysis, withoutUnapprovedMoney } from '@/lib/money-honesty';
import AnchoredNarrative from '@/components/analyze/AnchoredNarrative';
import { getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { APP_VERSION } from '@/lib/version';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import type { SourceFile } from '@/lib/abap/findings-detector';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

import CodeInventoryTable from '@/components/analyze/CodeInventoryTable';
import ModuleHeatmap from '@/components/analyze/ModuleHeatmap';
import AbcdClassificationPanel from '@/components/analyze/AbcdClassificationPanel';
import DataCouplingTable from '@/components/analyze/DataCouplingTable';
import ComplianceReviewHints from '@/components/ComplianceReviewHints';
import ReviewTasks from '@/components/ReviewTasks';
import { deriveReviewTasks } from '@/lib/abap/review-tasks';
import BusinessValueAudit from '@/components/analyze/BusinessValueAudit';
import PlainEnglishGuide from '@/components/analyze/PlainEnglishGuide';
import ExtensibilityDecisionMatrix from '@/components/analyze/ExtensibilityDecisionMatrix';
import TargetScopeMapping from '@/components/analyze/TargetScopeMapping';
import ModernizationStrategy from '@/components/analyze/ModernizationStrategy';
import ArchitecturalNextSteps from '@/components/analyze/ArchitecturalNextSteps';
import CoverageVerdict from '@/components/analyze/CoverageVerdict';
import ConstructFindings from '@/components/analyze/ConstructFindings';
import UnassessedConstructs from '@/components/analyze/UnassessedConstructs';
import GapsWorklist from '@/components/analyze/GapsWorklist';
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

import { DocumentSkeleton } from '@/components/Skeleton';
import VerificationRail from '@/components/VerificationRail';
import StageHeader from '@/components/StageHeader';
import { workflowSteps } from '@/lib/workflow-steps';

export default function AnalyzePage() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const autoAnalyze = searchParams.get('autoAnalyze');
  const [project, setProject] = useState<Project | null>(null);
  const [legacyCode, setLegacyCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { profile } = useUserProfile();
  // Help Mode removed — Ask AI chatbot replaces this functionality
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);
  const [targetDeployment, setTargetDeployment] = useState<'public' | 'private' | null>(null);
  const [showConceptQuestion, setShowConceptQuestion] = useState(false);
  const [modalSelection, setModalSelection] = useState<'public' | 'private' | null>(null);
  const isFromExample = searchParams.get('fromExample') === 'true' || !!project?.fromExample || project?.isExample;
  const [acceptedTerms, setAcceptedTerms] = useState(searchParams.get('fromExample') === 'true');
  const [uploadedFileName, setUploadedFileName] = useState('manual-input.abap');
  const [activeTab, setActiveTab] = useState<'evidence' | 'backlog' | 'detailed' | 'strategy'>('evidence');
  const [evidenceFilter, setEvidenceFilter] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Low'>('All');
  const [isSticky, setIsSticky] = useState(false);
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
    const handleScroll = () => {
      setIsSticky(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleUpdateWorklist = async (updatedWorklist: any[]) => {
    try {
      const docRef = doc(getDb(), 'projects', projectId as string);
      await updateDoc(docRef, { worklist: updatedWorklist });
      setProject((prev: any) => prev ? { ...prev, worklist: updatedWorklist } : prev);
    } catch (err) {
      console.error('Failed to update project worklist:', err);
    }
  };

  const markdownComponents: Components = {
    h1: ({ node, ...props }) => (
      <div className="mb-12 pb-6 border-b-2 border-gray-900">
        <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tighter mb-2" {...props} />
      </div>
    ),
    h2: ({ node, ...props }) => <DocumentSection title={props.children as string} />,
    h3: ({ node, ...props }) => <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4 flex items-center gap-3 border-b border-gray-100 pb-2" {...props} />,
    hr: () => <hr className="my-10 border-t border-gray-100" />,
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-8 rounded-2xl border border-gray-200 shadow-lg">
        <table className="min-w-full divide-y divide-gray-200" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-gray-50/50" {...props} />,
    th: ({ node, ...props }) => <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]" {...props} />,
    td: ({ node, ...props }) => <td className="px-6 py-4 text-sm text-gray-700 border-t border-gray-100" {...props} />,
    blockquote: ({ node, ...props }) => {
      return <blockquote className="border-l-4 border-green-500 pl-6 py-3 italic my-8 bg-green-50/20 rounded-r-2xl text-green-900 font-medium text-base" {...props} />;
    },
    p: ({ node, ...props }) => <p className="text-gray-700 leading-relaxed text-base md:text-lg mb-6" {...props} />,
    li: ({ node, ...props }) => <li className="text-gray-700 text-base mb-2 ml-4 list-disc marker:text-green-500" {...props} />,
    ul: ({ node, ...props }) => <ul className="mb-8" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-bold text-gray-950" {...props} />,
  };

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const hydratedProject = await loadProjectAndHydrate(projectId as string);
        if (hydratedProject) {
          setProject(hydratedProject);
          setLegacyCode(hydratedProject.legacyCode || '');
          if (hydratedProject.s4Deployment) {
            setTargetDeployment(hydratedProject.s4Deployment as 'public' | 'private');
          }
          if (hydratedProject.fromExample || hydratedProject.isExample || searchParams.get('fromExample') === 'true') {
            setAcceptedTerms(true);
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
  const [isNavigating, setIsNavigating] = useState(false);
  const hasAutoAnalyzed = useRef(false);
  const [sweepActive, setSweepActive] = useState(false);
  const [sweepFindings, setSweepFindings] = useState<import('@/lib/abap/evidence-model').EvidenceFinding[]>([]);
  const [sweepCode, setSweepCode] = useState('');
  const geminiResultRef = useRef<{ text: string; evidenceReport: any; computedRouteReport: any; codeToAnalyze: string } | null>(null);
  const sweepCompleteRef = useRef(false);

  // Prose is not code. The keyword list below was already here and already
  // right; what followed it — `|| code.trim().length > 0` — made it decorative,
  // so any non-empty text was accepted, sent to the model, charged against the
  // quota and signed into a run as ABAP (QA review of 33471220d6e9,
  // 2d714ac42b63). The list is the deterministic engine's own vocabulary of
  // top-level constructs; one of them has to appear.
  // Fields the signed run owns. The model may describe them in prose; it may
  // not supply the numbers, because nothing downstream could tell the two apart.
  const MODEL_MUST_NOT_OWN = ['cleanCoreScore', 'complexityScore', 'criticalityScore'] as const;

  const isLegacyCode = (code: string) => looksLikeAbap(code);

  const scanForMaliciousCode = (content: string, fileName: string): string | null => {
    if (!fileName.endsWith('.abap') && !fileName.endsWith('.txt')) {
      return 'Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.';
    }
    return scanCodeContent(content);
  };

  /** The limit the upload area has always advertised (QA 8d9184e6f94f). */
  const MAX_UPLOAD_BYTES = 1024 * 1024;

  const handleFile = (file: File) => {
    setError('');
    
    // Scan file metadata first
    if (!file.name.endsWith('.abap') && !file.name.endsWith('.txt')) {
        setError('Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.');
        return;
    }

    // "Max 1MB" was written on the screen and checked nowhere: the browser read
    // the whole file into memory, rendered it into the textarea and the scanner,
    // and tried to put it in a model request (QA 8d9184e6f94f).
    if (file.size > MAX_UPLOAD_BYTES) {
        setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 1 MB — analyse one object at a time, or paste the part you want assessed.`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Perform automated malicious payload scan
      const scanResult = scanForMaliciousCode(content, file.name);
      if (scanResult) {
        setError(scanResult);
        setLegacyCode(''); // Clear staged code
        return;
      }

      if (!isLegacyCode(content)) {
          setError('The file does not appear to contain valid legacy code.');
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


  const handleAnalyze = async (codeToAnalyze: string = legacyCode) => {
    setError('');
    // The scan runs here, on exactly the text that is about to leave the
    // browser. The upload path scanned the file, and the screen scanned what
    // was staged — but the textarea can be edited after both, and this is the
    // only place that sees the final string (QA review of 33471220d6e9,
    // 2ea4b0048642). Auto-analysis comes through here too.
    const scanBlock = scanCodeContent(codeToAnalyze);
    if (scanBlock) {
        setError(`Security Block: ${scanBlock} Remove the flagged content before analysing.`);
        return;
    }
    if (!isLegacyCode(codeToAnalyze)) {
        setError('That does not look like ABAP. Paste or upload ABAP source — a report, class, method, form, function module or include.');
        return;
    }
    setLoading(true);
    setLoadingMessage('Initializing evidence scanner...');
    sweepCompleteRef.current = false;
    geminiResultRef.current = null;

    try {
      // 1. Gather deterministic evidence and perform extensibility routing (instant)
      const evidenceReport = buildAbapEvidence(codeToAnalyze, uploadedFileName || 'main.abap', targetDeployment as 'public' | 'private');
      const computedRouteReport = routeExtensibility(evidenceReport, targetDeployment || 'private');
      setRouteReport(computedRouteReport);

      // 2. Start Evidence Sweep animation
      setSweepCode(codeToAnalyze);
      setSweepFindings(evidenceReport.findings);
      setSweepActive(true);
      setLoadingMessage('Evidence Scanner active — scanning code...');

      const prompt = buildAnalysisPrompt({ targetDeployment, evidenceReport, routeReport: computedRouteReport, code: codeToAnalyze });

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
        try {
          const generated = await callGeminiWithReceipt(prompt, 'gemini-3-flash-preview', true, 'analyze');
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
          // dropped here, once, before anything is stored.
          for (const owned of MODEL_MUST_NOT_OWN) delete obj[owned];
          normalizedAnalysis = JSON.stringify(obj);
          
          const gapsList = obj.gaps || [];

          initialWorklist = [
            ...findingsWorklist(evidenceReport.findings, uploadedFileName || 'main.abap'),
            ...gapsList.map((g: any, idx: number) => ({
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
            s4Deployment: targetDeployment,
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
            originalRecommendation: recommendedRoute === 'Side-by-Side (SAP BTP)' ? 'cap' : 'rap',
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
                s4Deployment: targetDeployment, 
                cleanCoreScore,
                charged: true,
                transformationBypass: true,
                worklist: initialWorklist,
                codeInventory: inventory,
                dataCoupling: coupling,
                complexityScore,
                criticalityScore,
                originalRecommendation: recommendedRoute === 'Side-by-Side (SAP BTP)' ? 'cap' : 'rap',
                recommendationConfidence: computedRouteReport.confidenceScore,
                recommendationJustification: computedRouteReport.rationale,
                evidenceReport,
              } 
            : null
        );
      } catch (error) {
        console.error('Error during analysis persistence:', error);
        throw error;
      }
    } catch (err: unknown) {
      console.error('Analysis Error:', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('{')) {
        throw err;
      }
      setError(`Failed to analyze the code: ${errMessage || 'Unknown error'}. Please try again.`);
    } finally {
      setSweepActive(false);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  useEffect(() => {
    if (autoAnalyze === 'true' && legacyCode && !project?.analysis && !hasAutoAnalyzed.current) {
      hasAutoAnalyzed.current = true;
      handleAnalyze(legacyCode);
    }
  }, [autoAnalyze, legacyCode, project?.analysis]);

  /**
   * The export below is an HTML document a reviewer opens or pastes into
   * Confluence, and nearly every value in it was written either by the account
   * holder (the project name) or by the model out of the customer's own ABAP —
   * a comment in the uploaded source is enough to steer it into returning
   * markup (SEC-2026-014). Nothing of either kind reaches the template
   * unescaped; the markup around it is ours. The same `esc` as the design and
   * documentation exports, from the one escaper in `lib/export-safety.ts`.
   *
   * Attributes are the other half of the rule: escaping the five HTML
   * characters still leaves a value free inside `style="…"`, so no attribute in
   * this document interpolates a foreign value at all. Every colour and label a
   * branch picks is hoisted into a local constant and the attribute reads only
   * that constant.
   */
  const esc = escapeHtml;

  const exportToConfluence = async () => {
    if (!project?.analysis) return;

    let htmlContent = '';
    
    // The same reader as the stage itself: every stored shape, amounts of money masked (lib/money-honesty.ts).
    const data = readStoredAnalysis<AnalysisData>(project.analysis);
    // The score in the export is the one the run was signed with — the project
    // field the server wrote — never a number the model returned (e184fc0c59bf).
    const signedScore: number | null =
      typeof routeReport?.cleanCoreScore === 'number'
        ? routeReport.cleanCoreScore
        : typeof project?.cleanCoreScore === 'number'
          ? project.cleanCoreScore
          : null;
    const isJson = data !== null;

    if (isJson && data) {
      // Local fallback for Confluence export
      // Every field here used to carry a fallback that manufactured the answer when
      // the model had not produced one: an asset score of 82/55/35 chosen by a
      // string comparison, a maintenance cost of `(100 - score) * 180 + 1200`
      // rendered into the export as €/yr, value drivers picked by searching the
      // context for the word "partner", and a flat "~40%" ROI claim. This document
      // is exported to Confluence and kept by a customer.
      //
      // The prompt three hundred lines above is careful about exactly this — it
      // asks the model for a RANGE, hedged language and a calibration disclaimer.
      // The fallback then threw that discipline away. Missing values are now
      // missing, and the renderer says so.
      const bizFallback = {
        legacyAssetScore: data.businessValueAnalysis?.legacyAssetScore ?? null,
        technicalDebtLevel: data.businessValueAnalysis?.technicalDebtLevel ??
          (typeof data.cleanCoreScore === 'number'
            ? (data.cleanCoreScore < 50 ? 'High' : data.cleanCoreScore < 75 ? 'Medium' : 'Low')
            : null),
        valueDrivers: data.businessValueAnalysis?.valueDrivers ?? null,
        plainEnglishActionPlan: data.businessValueAnalysis?.plainEnglishActionPlan || [
          "1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.",
          "2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.",
          `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${project.extensibilityRoute || data.extensibilityRouting?.recommendedRoute || 'decoupled'} architecture.`
        ]
      };

      // Build visual table for gaps
      const gapsRows = data.gaps?.map(g => {
        const sevBg = g.severity === 'High' ? '#ffebe6' : g.severity === 'Medium' ? '#fffae6' : '#e6fcff';
        const sevFg = g.severity === 'High' ? '#de350b' : g.severity === 'Medium' ? '#974f0c' : '#007a87';
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${esc(g.title)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0;"><span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; background: ${sevBg}; color: ${sevFg};">${esc(g.severity)}</span></td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: 500; color: #0747a6;">${esc(g.strategy)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${esc(g.rationale)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${esc(g.complexity)}</td>
        </tr>
      `;
      }).join('') || '';

      const stepsList = data.strategicNextSteps?.map(step => `
        <li style="margin-bottom: 10px; font-size: 14px;"><strong>${esc(step)}</strong></li>
      `).join('') || '';

      // Extensibility Routing Pathway and Comparative matrices
      const isBtp = (project.extensibilityRoute || data.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP');
      
      /*
       * `decisionTreeCheckpoints` and `comparativeAnalysis` are optional: the model
       * returns them when it produced them, and often it did not. Where it had not,
       * this export wrote four complete checkpoints and a full two-track comparison
       * — named milestones, an "Evaluation Question", a "Legacy Code Assessment"
       * per checkpoint, feasibility grades, pros and cons — all of it decided by
       * one boolean: whether the chosen route contains the letters "BTP". Nothing
       * had been assessed and none of it was read off the customer's code, yet the
       * document said the code "was evaluated step-by-step" and that the comparison
       * was "mapped specifically to this project's requirements". This file is
       * exported to Confluence and kept as the record of a decision (QA 0613631545b2).
       *
       * The screen had the same fallback one layer down, in
       * `components/analyze/ExtensibilityDecisionMatrix.tsx`; both are gone, because
       * a corrected export beside a screen that still invents is not a correction.
       *
       * Same rule as the business-value block above: a missing value is reported
       * missing.
       */
      const checkpoints = data.extensibilityRouting?.decisionTreeCheckpoints ?? null;
      const comparative = data.extensibilityRouting?.comparativeAnalysis ?? null;
      const notDetermined = (what: string) => `
            <div style="border: 1px dashed #c1c7d0; border-radius: 8px; padding: 16px; margin: 20px 0; color: #5e6c84; font-size: 13px;">
              <strong style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em;">Not determined for this run</strong>
              <p style="margin: 8px 0 0;">${what} Nothing is inferred here from the chosen route.</p>
            </div>`;

      const checkpointsRows = (checkpoints ?? []).map((cp, idx) => {
        // A model that answers with something other than a string used to crash
        // the export here, on .includes(), before anything was rendered.
        const state = String(cp.resultState ?? '');
        const stateBg = state.includes('Side-by-Side') ? '#deebff' : state.includes('In-App') ? '#e3fcef' : '#f4f5f7';
        const stateFg = state.includes('Side-by-Side') ? '#0747a6' : state.includes('In-App') ? '#006644' : '#505f79';
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold; text-align: center;">${idx + 1}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${esc(cp.checkpointName)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px;">${esc(cp.question)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #172b4d;">${esc(cp.evaluation)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; text-align: center;"><span style="padding: 2.5px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${stateBg}; color: ${stateFg};">${esc(state)}</span></td>
        </tr>
      `;
      }).join('');

      // The two score cards below colour their left border and caption by
      // threshold. Both are decided here so that the template's `style="…"`
      // reads a constant rather than an expression over a stored value.
      const complexity = project.complexityScore;
      const criticality = project.criticalityScore;
      const complexityColor = complexity !== undefined && complexity >= 7 ? '#de350b' : complexity !== undefined && complexity >= 4 ? '#ff991f' : '#00875a';
      const criticalityColor = criticality !== undefined && criticality >= 7 ? '#de350b' : criticality !== undefined && criticality >= 4 ? '#ff991f' : '#00875a';
      const complexityNote = complexity !== undefined && complexity >= 7
        ? 'High — significant refactoring needed'
        : complexity !== undefined && complexity >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration';
      const criticalityNote = criticality !== undefined && criticality >= 7
        ? 'Mission-critical — requires careful planning'
        : criticality !== undefined && criticality >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate';

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul { margin-bottom: 16px; padding-left: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f4f5f7; text-align: left; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c; border-bottom: 2px solid #ebecf0; }
            td { border-bottom: 1px solid #ebecf0; }
            .badge { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #e6fcff; color: #007a87; border: 1px solid #b3f0ff; }
            .summary-box { background: #f4f5f7; border-left: 4px solid #0747a6; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
            .card-grid { display: grid; grid-template-cols: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
            .card { border: 1px solid #ebecf0; border-radius: 8px; padding: 16px; background: #fff; }
            .card-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c; margin-bottom: 8px; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${esc(data.projectTitle || project.name)}</h1>
            <div class="meta">Clean Core Compliance: <strong>${typeof signedScore === 'number' ? `${signedScore}%` : 'not computed'}</strong> | Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            <div class="summary-box">
              <h3 style="margin-top: 0; color: #0747a6;">Executive Summary</h3>
              <p>${esc(data.summary)}</p>
            </div>

            <h2>Business Value & Executive Action Center</h2>
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
              <div class="card" style="border-left: 4px solid #00875a; background: #e3fcef10;">
                <div class="card-title" style="color: #00875a;">Business Asset Audit</div>
                <p style="font-size: 13px; margin-bottom: 8px;"><strong>Legacy Asset Score:</strong> ${bizFallback.legacyAssetScore !== null ? `${esc(bizFallback.legacyAssetScore)}% (Custom IP Value)` : 'not computed'}</p>
                <p style="font-size: 13px; margin-bottom: 8px;"><strong>Technical Debt Level:</strong> ${esc(bizFallback.technicalDebtLevel ?? 'not computed')}</p>
                <p style="font-size: 13px; margin-bottom: 12px;"><strong>Annual maintenance cost:</strong> not determined</p>
                <div style="font-size: 12px; margin-bottom: 6px;"><strong>Value Drivers:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 10px;">
                  ${(bizFallback.valueDrivers ?? []).map(d => `<li>${esc(d)}</li>`).join('') || '<li>not identified for this run</li>'}
                </ul>
                <p style="font-size: 12px; font-weight: bold; background: #effcf6; padding: 10px; border-radius: 6px; border: 1px solid #d3f9e8; color: #006644; margin-top: 10px;">
                  <strong>Cost and ROI:</strong> Not determined. A cost or ROI figure needs approved cost assumptions, and this analysis has none — the Economics stage models costs only from figures you enter.
                </p>
              </div>
              <div class="card" style="border-left: 4px solid #0747a6; background: #deebff10;">
                <div class="card-title" style="color: #0747a6;">Plain English Stakeholder Roadmap</div>
                <p style="font-size: 13px; color: #5e6c84; margin-bottom: 12px; font-style: italic;">Simplified action items to modernize this business capability successfully:</p>
                <ul style="font-size: 13px; line-height: 1.8; padding-left: 20px; font-weight: bold; color: #253858;">
                  ${bizFallback.plainEnglishActionPlan.map(action => `<li style="margin-bottom: 8px;">${esc(action)}</li>`).join('')}
                </ul>
              </div>
            </div>

            <h2>As-Is Process & Legacy Context</h2>
            <p>${esc(data.asIsContext)}</p>

            <h2>Standard Fit Assessment</h2>
            <p><strong>Target Standard Process ID / Module:</strong> ${esc(data.standardFit?.targetStandardProcess || 'N/A')}</p>
            <p><strong>Standardization Potential:</strong> <span class="badge">${esc(data.standardFit?.potential || 'not computed')}</span></p>
            <p>${esc(data.standardFit?.rationale)}</p>

            <h2>SAP Extensibility Routing Decision Path</h2>
            ${checkpoints === null ? notDetermined('This analysis did not return the step-by-step checkpoints behind the routing decision.') : `
            <p>The legacy ABAP code was evaluated step-by-step against the official SAP Clean Core extensibility decision tree. Below is the detailed pathway and checkpoint audit:</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Step</th>
                  <th style="width: 20%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Decision Milestone</th>
                  <th style="width: 25%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Evaluation Question</th>
                  <th style="width: 40%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Legacy Code Assessment</th>
                  <th style="width: 10%; text-align: center; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Result State</th>
                </tr>
              </thead>
              <tbody>
                ${checkpointsRows}
              </tbody>
            </table>`}

            <h2>Extensibility Track Comparative Matrix</h2>
            ${comparative === null ? notDetermined('This analysis did not return a side-by-side comparison of the two extensibility tracks.') : `
            <p>Direct architectural comparison of both available tracks mapped specifically to this project's requirements:</p>
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; margin-bottom: 30px;">
              <div class="card" style="border-left: 4px solid #006644; background: #e3fcef20;">
                <div class="card-title" style="color: #006644;">⚙️ In-App ABAP Cloud (RAP) Track</div>
                <p style="font-size: 11px; color: #5e6c84; font-weight: bold; margin-bottom: 8px;">Feasibility: ${esc(comparative.inAppABAPCloud.technicalFeasibility)}</p>
                <p style="font-size: 13px; margin-bottom: 12px;">${esc(comparative.inAppABAPCloud.fitDetails)}</p>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Technical Pros:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 12px;">
                  ${comparative.inAppABAPCloud.pros.map(pro => `<li>${esc(pro)}</li>`).join('')}
                </ul>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Limitations (Cons):</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; color: #5e6c84; margin-bottom: 0;">
                  ${comparative.inAppABAPCloud.cons.map(con => `<li>${esc(con)}</li>`).join('')}
                </ul>
              </div>
              <div class="card" style="border-left: 4px solid #0747a6; background: #deebff20;">
                <div class="card-title" style="color: #0747a6;">☁️ Side-by-Side SAP BTP (CAP) Track</div>
                <p style="font-size: 11px; color: #5e6c84; font-weight: bold; margin-bottom: 8px;">Feasibility: ${esc(comparative.sideBySideBTP.technicalFeasibility)}</p>
                <p style="font-size: 13px; margin-bottom: 12px;">${esc(comparative.sideBySideBTP.fitDetails)}</p>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Technical Pros:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 12px;">
                  ${comparative.sideBySideBTP.pros.map(pro => `<li>${esc(pro)}</li>`).join('')}
                </ul>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Limitations (Cons):</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; color: #5e6c84; margin-bottom: 0;">
                  ${comparative.sideBySideBTP.cons.map(con => `<li>${esc(con)}</li>`).join('')}
                </ul>
              </div>
            </div>`}

            <h2>Functional Gaps Analysis Matrix</h2>
            <table>
              <thead>
                <tr>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Requirement</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Divergence</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Mitigation Strategy</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Technical Rationale</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Complexity</th>
                </tr>
              </thead>
              <tbody>
                ${gapsRows}
              </tbody>
            </table>

            <h2>Modernization Recommendations</h2>
            <div class="card-grid">
              <div class="card">
                <div class="card-title" style="color: #00875a;">Keep Core Clean</div>
                <p style="font-size: 13px; margin: 0;">${esc(data.recommendations?.keepCoreClean)}</p>
              </div>
              <div class="card">
                <div class="card-title" style="color: #de350b;">Decommissioning</div>
                <p style="font-size: 13px; margin: 0;">${esc(data.recommendations?.decommissioning)}</p>
              </div>
              <div class="card">
                <div class="card-title" style="color: #0747a6;">Cloud Readiness</div>
                <p style="font-size: 13px; margin: 0;">${esc(data.recommendations?.cloudReadiness)}</p>
              </div>
            </div>

            <h2>Architectural Next Steps</h2>
            <ol style="padding-left: 20px;">
              ${stepsList}
            </ol>

            <h2>Detailed Technical Assessment</h2>
            ${complexity !== undefined || criticality !== undefined ? `
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
              ${complexity !== undefined ? `
              <div class="card" style="border-left: 4px solid ${complexityColor};">
                <div class="card-title">Complexity Score</div>
                <p style="font-size: 28px; font-weight: bold; margin: 0;">${esc(complexity)}<span style="color: #6b778c; font-size: 14px;">/10</span></p>
                <p style="font-size: 12px; color: #6b778c; margin-top: 4px;">${complexityNote}</p>
              </div>` : ''}
              ${criticality !== undefined ? `
              <div class="card" style="border-left: 4px solid ${criticalityColor};">
                <div class="card-title">Criticality Score</div>
                <p style="font-size: 28px; font-weight: bold; margin: 0;">${esc(criticality)}<span style="color: #6b778c; font-size: 14px;">/10</span></p>
                <p style="font-size: 12px; color: #6b778c; margin-top: 4px;">${criticalityNote}</p>
              </div>` : ''}
            </div>` : ''}

            ${(project.codeInventory || []).length > 0 ? `
            <h3>Code Inventory</h3>
            <table>
              <thead><tr>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Object Name</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Type</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Module</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Criticality</th>
              </tr></thead>
              <tbody>
                ${(project.codeInventory || []).map((item: any) => {
                  const critBg = item.criticality === 'High' ? '#ffebe6' : item.criticality === 'Medium' ? '#fff0b3' : '#e3fcef';
                  const critFg = item.criticality === 'High' ? '#de350b' : item.criticality === 'Medium' ? '#974f0c' : '#006644';
                  return `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${esc(item.objectName || '')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${esc(item.type || '')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${esc(item.module || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">
                    <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;background:${critBg};color:${critFg};">${esc(item.criticality || 'Low')}</span>
                  </td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>` : ''}

            ${(project.dataCoupling || []).length > 0 ? `
            <h3>Data Coupling Analysis</h3>
            <table>
              <thead><tr>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Table</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Access Type</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Risk Level</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Recommendation</th>
              </tr></thead>
              <tbody>
                ${(project.dataCoupling || []).map((item: any) => {
                  // A type reference (`Reference`, 2.11) is no write; only the two write forms are red.
                  const writes = item.accessType === 'Write' || item.accessType === 'Read/Write';
                  const accessBg = writes ? '#ffebe6' : '#f4f5f7';
                  const accessFg = writes ? '#de350b' : '#5e6c84';
                  const riskBg = item.riskLevel === 'High' ? '#ffebe6' : item.riskLevel === 'Medium' ? '#fff0b3' : '#e3fcef';
                  const riskFg = item.riskLevel === 'High' ? '#de350b' : item.riskLevel === 'Medium' ? '#974f0c' : '#006644';
                  return `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">
                    ${esc(item.tableName || '')} ${item.isCustom ? '<span style="color:#0747a6;font-size:9px;">(Custom)</span>' : ''}
                  </td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">
                    <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;background:${accessBg};color:${accessFg};">${esc(item.accessType || 'Read')}</span>
                  </td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">
                    <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;background:${riskBg};color:${riskFg};">${esc(item.riskLevel || 'Low')}</span>
                  </td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-size:11px;color:#5e6c84;">${esc(item.recommendation || '')}</td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>` : ''}

            ${(() => {
              // Evidence Findings table for Confluence export — deduplicated, sorted by severity
              const evidenceForExport = legacyCode ? buildAbapEvidence(legacyCode, uploadedFileName || 'main.abap', targetDeployment as 'public' | 'private').findings : [];
              if (evidenceForExport.length === 0) return '';
              const sevOrd: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
              const grp = new Map<string, { f: typeof evidenceForExport[0]; lines: number[]; snippets: string[] }>();
              for (const ef of evidenceForExport) {
                const k = `${ef.kind}::${ef.objectName || ef.title}`;
                const ex = grp.get(k);
                if (ex) { ex.lines.push(ef.lineStart); if (ef.snippet && !ex.snippets.includes(ef.snippet)) ex.snippets.push(ef.snippet); }
                else grp.set(k, { f: ef, lines: [ef.lineStart], snippets: ef.snippet ? [ef.snippet] : [] });
              }
              const sorted = Array.from(grp.values()).sort((a, b) => (sevOrd[a.f.severity] ?? 9) - (sevOrd[b.f.severity] ?? 9));
              const rows = sorted.map(({ f, lines, snippets }) => {
                const sevColor = f.severity === 'Critical' ? '#ffebe6;color:#de350b' : f.severity === 'High' ? '#fff0b3;color:#974f0c' : f.severity === 'Medium' ? '#fffae6;color:#974f0c' : '#e3fcef;color:#006644';
                const confColor = (f.sapReplacement?.confidence === 'Catalog Match' || f.sapReplacement?.confidence === 'Verified') ? '#006644' : f.sapReplacement?.confidence === 'Candidate' ? '#974f0c' : '#de350b';
                const srcColor = f.source === 'static-parser' ? '#e3fcef;color:#006644' : f.source === 'catalog-match' ? '#fffae6;color:#974f0c' : '#deebff;color:#0747a6';
                const srcLabel = f.source === 'static-parser' ? '⚙ Parser' : f.source === 'catalog-match' ? '📋 Catalog' : '🤖 LLM';
                return `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${esc(f.title)}${lines.length > 1 ? ` (${lines.length}×)` : ''}<br/><span style="font-size:10px;color:#6b778c;">${esc(f.kind)}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-family:monospace;font-size:11px;">${esc(lines.join(', '))}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><code style="font-size:10px;background:#f4f5f7;padding:2px 4px;border-radius:3px;">${esc(snippets[0] || '—')}</code></td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;background:${sevColor};">${esc(f.severity)}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;background:${srcColor};">${srcLabel}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${f.sapReplacement ? `${esc(f.sapReplacement.objectName)}<br/><span style="font-size:10px;font-weight:bold;color:${confColor};">${esc(f.sapReplacement.confidence)}</span>` : '—'}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-size:10px;">${esc((f.targetOptions || []).slice(0, 2).join(', ') || '—')}</td>
                </tr>`;
              }).join('');
              return `
              <h2 style="margin-top:40px;color:#172b4d;border-bottom:1px solid #ebecf0;padding-bottom:8px;">📋 Evidence Findings</h2>
              <p style="font-size:13px;color:#6b778c;margin-bottom:12px;">${sorted.length} unique findings — deduplicated, sorted by severity</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:30px;font-size:13px;">
                <thead>
                  <tr style="background:#f4f5f7;text-align:left;">
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Pattern</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Lines</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Snippet</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Severity</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Source</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">SAP Replacement</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Target</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`;
            })()}

            ${(() => {
              // Gaps Worklist for Confluence export — combined findings + functional gaps
              const wl: any[] = project?.worklist || [];
              if (wl.length === 0) return '';
              const sevOrd: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
              const sorted = [...wl].sort((a, b) => (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9));
              const wlRows = sorted.map(item => {
                const sevColor = item.severity === 'High' ? '#ffebe6;color:#de350b' : item.severity === 'Medium' ? '#fffae6;color:#974f0c' : '#e3fcef;color:#006644';
                const statusColor = item.status === 'resolved' ? '#006644' : item.status === 'in-progress' ? '#0747a6' : '#6b778c';
                return `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${esc(item.title || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;background:${sevColor};">${esc(item.severity || '—')}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-size:11px;color:#5e6c84;">${esc(item.category || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-size:11px;">${esc(item.location || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-size:11px;color:#5e6c84;">${esc(item.recommendation || item.strategy || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${esc(item.effort || '—')}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><span style="font-weight:bold;color:${statusColor};text-transform:capitalize;">${esc(item.status || 'open')}</span></td>
                </tr>`;
              }).join('');
              return `
              <h2 style="margin-top:40px;color:#172b4d;border-bottom:1px solid #ebecf0;padding-bottom:8px;">📋 Gaps Worklist</h2>
              <p style="font-size:13px;color:#6b778c;margin-bottom:12px;">${sorted.length} items — sorted by severity</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:30px;font-size:13px;">
                <thead>
                  <tr style="background:#f4f5f7;text-align:left;">
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Title</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Severity</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Category</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Location</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Recommendation</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Effort</th>
                    <th style="padding:10px;border-bottom:2px solid #dfe1e6;font-weight:bold;font-size:11px;text-transform:uppercase;">Status</th>
                  </tr>
                </thead>
                <tbody>${wlRows}</tbody>
              </table>`;
            })()}

            <div style="margin-top: 40px; padding: 16px; background: #f4f5f7; border-radius: 8px; text-align: center; font-size: 11px; color: #6b778c;">
              Report generated by Clean-Core.io v${APP_VERSION} | All tabs exported | ${new Date().toISOString()}
            </div>
          </div>
        </body>
        </html>
      `;
    } else {
      // Legacy markdown fallback
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul, ol { margin-bottom: 16px; padding-left: 30px; }
            li { margin-bottom: 8px; }
            blockquote { border-left: 4px solid #4c9aff; padding-left: 20px; color: #6b778c; font-style: italic; margin: 20px 0; }
            code { background: #f4f5f7; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${esc(project.name)}</h1>
            <div class="meta">Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            ${renderMarkdownSafe(withoutUnapprovedMoney(project.analysis))}
          </div>
        </body>
        </html>
      `;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const fileSaver = await import('file-saver');
    const save = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
    save(blob, `${project.name.replace(/\s+/g, '_')}_Business_Analysis.html`);
    
    // Store in DB
    const docRef = doc(getDb(), 'projects', projectId as string);
    try {
      await updateDoc(docRef, {
        [`exports.analysis_confluence_${Date.now()}`]: htmlContent
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    }
  };

  const categorizeGaps = (gaps: any[]) => {
    const categories = {
      quickWins: [] as any[],
      complexStandard: [] as any[],
      strategic: [] as any[],
      retire: [] as any[]
    };

    gaps.forEach(gap => {
      const strategyLower = (gap.strategy || '').toLowerCase();
      const titleLower = (gap.title || '').toLowerCase();
      
      if (strategyLower.includes('decommission') || strategyLower.includes('retire') || strategyLower.includes('obsolete') || titleLower.includes('decommission') || titleLower.includes('retire')) {
        categories.retire.push(gap);
      } else if (gap.complexity === 'Low' && gap.severity === 'Low') {
        categories.quickWins.push(gap);
      } else if (gap.complexity === 'High' && (strategyLower.includes('standard') || strategyLower.includes('key-user') || strategyLower.includes('extensibility'))) {
        categories.complexStandard.push(gap);
      } else {
        categories.strategic.push(gap);
      }
    });

    return categories;
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

  // Re-derive evidence findings (with snippets, targetOptions, sapReplacement) for the Evidence table
  // The whole report is kept, not just the findings. `coverage` is what the
  // detectors did not judge, and dropping it here is how an empty finding list
  // came to look like a clean program.
  const evidenceReport = useMemo(() => {
    if (!legacyCode) return null;
    return buildAbapEvidence(legacyCode, uploadedFileName || 'main.abap', targetDeployment as 'public' | 'private');
  }, [legacyCode, uploadedFileName, targetDeployment]);

  const evidenceFindings = useMemo(() => evidenceReport?.findings ?? [], [evidenceReport]);

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
  const personalDataHints = useMemo(
    () => (legacyCode && !isFromExample ? scanForPersonalDataHints(legacyCode) : []),
    [legacyCode, isFromExample],
  );
  const personalDataKey = personalDataHintKey(personalDataHints);
  const personalDataAcknowledged = personalDataKey !== '' && personalDataAckFor === personalDataKey;
  /** Something to look at, and nobody has said they looked. */
  const personalDataPending = personalDataHints.length > 0 && !personalDataAcknowledged;

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

  const renderAnalysisContent = () => {
    if (!project?.analysis) {
      // Roadmap 1.2, acceptance V25-A12: *"'nicht erzeugt' statt leer"*.
      //
      // Before this, `return null` was the whole answer, and the screen fell
      // back to the upload form — a signed run existed, its evidence was in the
      // database, and the page invited the reader to start an analysis. What
      // follows is that run's evidence, with the one missing part named as
      // missing. Everything here is computed without a model.
      if (!project?.activeRunId) return null;
      return (
        <div className="space-y-8 font-sans" data-evidence-only-report>
          <NotGenerated
            what="Analysis narrative"
            absence={narrativeAbsence}
            stage="analyze"
            hint="Everything below was computed by the evidence engine and is covered by this run's signature. Re-run the analysis once a model is available to add the narrative."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Clean Core Score</span>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {signedCleanCoreScore !== null ? `${signedCleanCoreScore}%` : 'Not yet computed'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Extensibility route</span>
              <p className="mt-2 text-lg font-black text-slate-900">
                {project.extensibilityRoute || 'Not determined'}
              </p>
              {project.recommendationJustification && (
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{project.recommendationJustification}</p>
              )}
            </div>
          </div>

          {missingDeps.length > 0 && <MissingDependencyPrompt missing={missingDeps} />}

          <CoverageVerdict findings={findings} summary={findingsSummary} />
          <ConstructFindings findings={findings} />
          {evidenceReport && <UnassessedConstructs coverage={evidenceReport.coverage} />}

          <CodeInventoryTable codeInventory={project.codeInventory || []} />
          <ModuleHeatmap codeInventory={project.codeInventory || []} />
          <DataCouplingTable dataCoupling={project.dataCoupling || []} />
          <AbcdClassificationPanel dataCoupling={project.dataCoupling || []} codeInventory={project.codeInventory || []} />
          {/* What those same tables may mean for a compliance review (roadmap
              7.7) — hints out of the table names, never a classification of
              anybody's data, and no model call. */}
          <ComplianceReviewHints dataCoupling={project.dataCoupling || []} />
          {/* What this reading could not settle, as tasks with a line each
              (roadmap 7.5) - never a verdict about the code. */}
          <ReviewTasks result={reviewTasks} />

          <GapsWorklist
            projectId={projectId as string}
            project={project}
            findings={findings}
            analysisGaps={[]}
            showHelpMode={false}
            onUpdateWorklist={handleUpdateWorklist}
          />

          <NotGenerated
            what="Business value assessment"
            absence={narrativeAbsence}
            stage="analyze"
            hint="Asset score, value drivers and the plain-English action plan come from the narrative."
          />
          <NotGenerated
            what="Modernisation strategy"
            absence={narrativeAbsence}
            stage="analyze"
            hint="The standardisation fit and the recommendation prose come from the narrative. The route above does not."
          />

          <WhyScorePanel project={project} />
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
      // Deliberately not overwritten any more. This line used to replace the
      // stored, signed score with the browser's recomputed one, so even the
      // object handed to the renderer disagreed with the Run.
      // Only `plainEnglishActionPlan` is rendered from this object (see
      // PlainEnglishGuide below), and it is generic guidance rather than a
      // measurement. The four invented figures that used to sit here alongside it
      // — asset score, maintenance cost, value drivers, a "~40%" ROI line — were
      // computed and never displayed, so they were pure liability: the next person
      // to render this object would have shipped them.
      const bizFallback = {
        legacyAssetScore: analysisData.businessValueAnalysis?.legacyAssetScore ?? null,
        technicalDebtLevel: analysisData.businessValueAnalysis?.technicalDebtLevel ??
          (typeof analysisData.cleanCoreScore === 'number'
            ? (analysisData.cleanCoreScore < 50 ? 'High' : analysisData.cleanCoreScore < 75 ? 'Medium' : 'Low')
            : null),
        valueDrivers: analysisData.businessValueAnalysis?.valueDrivers ?? null,
        plainEnglishActionPlan: analysisData.businessValueAnalysis?.plainEnglishActionPlan || [
          "1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.",
          "2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.",
          `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${analysisData.extensibilityRouting?.recommendedRoute || 'decoupled'} architecture.`
        ]
      };
const isBtp = (project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP');
      const checkpoints = analysisData.extensibilityRouting?.decisionTreeCheckpoints;
      const comparative = analysisData.extensibilityRouting?.comparativeAnalysis;

      return (
        <div className="space-y-8 font-sans">
          {/* Tab Navigation Menu — Premium with Icons */}
          <div className="sticky top-[128px] z-40 -mx-6 md:-mx-12 bg-white/95 backdrop-blur-md border-b-2 border-slate-200 shadow-lg">
            <div className="px-4 md:px-8 pt-1 pb-0 flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'evidence', label: 'Decision & Evidence', Icon: Shield },
                { id: 'backlog', label: 'Gaps Backlog', Icon: AlertCircle },
                { id: 'detailed', label: 'Assessment & Value', Icon: BarChart3 },
                { id: 'strategy', label: 'Modernization Strategy', Icon: Zap }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    "relative px-5 py-3.5 text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2.5 border-b-[4px] whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-emerald-500 text-slate-900 bg-emerald-50/60"
                      : "border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50/60"
                  )}
                >
                  <tab.Icon size={18} className={clsx(
                    "shrink-0 transition-all",
                    activeTab === tab.id ? "text-emerald-600" : "text-slate-400"
                  )} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {/* Explore all tabs hint — only shows on first tab */}
            {activeTab === 'evidence' && (
              <div className="px-6 md:px-12 py-1.5 bg-amber-50/70 border-t border-amber-100/80 text-center">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  ← Explore all 4 report sections before proceeding to Solution Design →
                </p>
              </div>
            )}
          </div>

          {/* TAB CONTENT: Decision & Evidence */}
          {activeTab === 'evidence' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Missing Dependency Prompt — surfaces gaps upfront */}
              {missingDeps.length > 0 && (
                <MissingDependencyPrompt missing={missingDeps} />
              )}
              {/* Core metrics panel */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-stretch">
                {/* Circular SVG Gauge for Clean Core Score */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                  
                  <div className="flex items-center gap-1.5 mb-4 relative z-10">
                    <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase">Clean Core Score</span>
                    <button 
                      type="button"
                      onClick={() => setShowScoreModal(true)}
                      className="p-1 rounded-md text-green-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
                      title="Explain Clean Core Score"
                    >
                      <HelpCircle size={14} className="animate-pulse" />
                    </button>
                  </div>
                  
                  <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="56" className="stroke-slate-800 fill-none" strokeWidth="8" />
                      <circle 
                        cx="72" 
                        cy="72" 
                        r="56" 
                        className="stroke-green-500 fill-none transition-all duration-1000 ease-out" 
                        strokeWidth="8" 
                        strokeDasharray="351.8" 
                        strokeDashoffset={351.8 - (351.8 * (signedCleanCoreScore ?? 0)) / 100}
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-3xl font-extrabold text-white tracking-tight">
                        {signedCleanCoreScore !== null ? `${signedCleanCoreScore}%` : '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">
                        {signedCleanCoreScore !== null ? 'Compliance' : 'Not yet computed'}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-slate-400 mt-2 max-w-[200px]">Higher score indicates better alignment with standard extensibility guidelines.</p>
                </div>

                {/* Extensibility Router Card */}
                <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between relative group">
                  <div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Extensibility Router</span>
                    <div className="flex items-center gap-2 mt-2 mb-3">
                      {/* The preservation register names this element as where
                          `extensibilityRoute` becomes visible; see
                          docs/registers/preservation-register.json. */}
                      <span data-stage-output="extensibilityRoute" className={clsx(
                        "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm",
                        (project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP')
                          ? "bg-blue-50 text-blue-700 border border-blue-100"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                      )}>
                        {(project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP') 
                          ? <GlossaryTerm termKey="BTP" className="border-b-0 hover:text-blue-700 text-blue-700">☁️ BTP Side-by-Side</GlossaryTerm> 
                          : <GlossaryTerm termKey="RAP" className="border-b-0 hover:text-emerald-700 text-emerald-700">⚙️ ABAP Cloud (RAP)</GlossaryTerm>}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {routeIsOverridden
                          ? 'Chosen by you'
                          : typeof analysisData.extensibilityRouting?.confidenceScore === 'number'
                            ? `${analysisData.extensibilityRouting.confidenceScore}% Conf.`
                            : 'Confidence not computed'}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">
                      Target: {analysisData.extensibilityRouting?.targetArtifact || ((project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || '').includes('BTP') 
                        ? <GlossaryTerm termKey="CAP" className="text-xs font-black text-slate-800 border-b-0 uppercase">SAP BTP Node.js App (CAP)</GlossaryTerm> 
                        : <GlossaryTerm termKey="RAP" className="text-xs font-black text-slate-800 border-b-0 uppercase">RAP Business Object</GlossaryTerm>)}
                    </h4>
                    {routeIsOverridden ? (
                      // The confidence and the reasoning belong to the route
                      // that was recommended. Printed beside a route the user
                      // switched to, they read as support for the opposite
                      // decision (QA review of 33471220d6e9, 210bafeb4c8b).
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        You changed this route. The recommendation was{' '}
                        <span className="font-bold text-slate-700">{analysisData.extensibilityRouting?.recommendedRoute}</span>
                        {typeof analysisData.extensibilityRouting?.confidenceScore === 'number'
                          ? ` at ${analysisData.extensibilityRouting.confidenceScore}% confidence`
                          : ''}
                        {analysisData.extensibilityRouting?.rationale ? `: ${analysisData.extensibilityRouting.rationale}` : '.'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-4">
                        {analysisData.extensibilityRouting?.rationale || 'AI analyzed legacy database joins and determined the optimal decoupled BTP modernization strategy.'}
                      </p>
                    )}
                  </div>

                  {/* Interactive Override Button */}
                  <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Override Route</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentRoute = project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)';
                        const nextRoute = currentRoute.includes('BTP') ? 'In-App (ABAP Cloud)' : 'Side-by-Side (SAP BTP)';
                        
                        const docRef = doc(getDb(), 'projects', projectId as string);
                        await updateDoc(docRef, { extensibilityRoute: nextRoute });
                        setProject((prev: any) => prev ? { ...prev, extensibilityRoute: nextRoute } : prev);
                      }}
                      className="text-[9px] font-black text-slate-500 hover:text-green-600 transition-colors uppercase tracking-widest flex items-center gap-1"
                    >
                      <RefreshCw size={10} className="animate-spin-slow" /> Switch Track
                    </button>
                  </div>
                </div>

                {/* ── Evidence Metadata Bar — Confidence + Evidence Count + Assumptions ── */}
                {routeReport && (
                  <div className="bg-gradient-to-r from-indigo-50/80 to-violet-50/80 rounded-2xl px-5 py-3 border border-indigo-100/60 flex flex-wrap items-center gap-4 lg:col-span-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Confidence</span>
                      <span className={clsx(
                        "text-xs font-black px-2 py-0.5 rounded-full",
                        routeReport.confidenceScore >= 85 ? "bg-green-100 text-green-700" :
                        routeReport.confidenceScore >= 70 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      )}>{routeReport.confidenceScore}%</span>
                    </div>
                    <div className="h-4 w-px bg-indigo-200/60"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Based on</span>
                      <span className="text-xs font-bold text-slate-700">
                        {routeReport.evidenceCounts.totalFindings} findings
                        {routeReport.evidenceCounts.criticalFindings > 0 && (
                          <span className="text-red-600 ml-1">({routeReport.evidenceCounts.criticalFindings} critical)</span>
                        )}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-indigo-200/60"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Supporting</span>
                      <span className="text-xs font-bold text-slate-700">{routeReport.evidenceCounts.supportingFindings} findings drive the route</span>
                    </div>
                    {routeReport.assumptions.length > 0 && (
                      <>
                        <div className="h-4 w-px bg-indigo-200/60"></div>
                        <details className="text-[10px] text-slate-500 cursor-pointer">
                          <summary className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider hover:text-indigo-600 transition-colors">
                            {routeReport.assumptions.length} Assumption{routeReport.assumptions.length > 1 ? 's' : ''}
                          </summary>
                          <ul className="mt-2 space-y-1 pl-2 max-w-xl">
                            {routeReport.assumptions.map((a, i) => (
                              <li key={i} className="text-[10px] text-slate-600 leading-snug">• {a}</li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}
                  </div>
                )}
                {/* Project Summary Card */}
                <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between lg:col-span-2 relative group overflow-hidden">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Analysis Summary</span>
                      <span className={clsx(
                        "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-sm shrink-0",
                        (project.s4Deployment || 'public') === 'public'
                          ? "bg-green-50 text-green-700 border-green-200/60"
                          : "bg-blue-50 text-blue-700 border-blue-200/60"
                      )}>
                        {(project.s4Deployment || 'public') === 'public' ? '☁️ S/4HANA Public Cloud' : '🛡️ Private Cloud / RISE'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mt-2 mb-3 break-words">{analysisData.projectTitle || project.name}</h3>
                    {/*
                      The summary is the one narrative field a reader treats as
                      the report's conclusion, and it is outside the signature by
                      design. It now shows which of its sentences point at a line
                      of the program and which do not.
                    */}
                    <AnchoredNarrative
                      text={analysisData.summary}
                      findings={evidenceFindings}
                      totalLines={legacyCode ? legacyCode.split('\n').length : 0}
                    />
                  </div>
                  <div className="border-t border-slate-100 pt-4 mt-6 flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Standard Fit</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={clsx(
                          "w-2 h-2 rounded-full",
                          analysisData.standardFit?.potential === 'High' ? 'bg-green-500' :
                          analysisData.standardFit?.potential === 'Medium' ? 'bg-amber-500' :
                          analysisData.standardFit?.potential === 'Low' ? 'bg-red-500' : 'bg-slate-300'
                        )}></span>
                        <span className="text-xs font-bold text-slate-700">{analysisData.standardFit?.potential || 'Not computed'}</span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Target Process</span>
                      <p className="text-xs font-bold text-slate-800 mt-1">{analysisData.standardFit?.targetStandardProcess || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coverage verdict donut chart */}
              <CoverageVerdict findings={findings} summary={findingsSummary} />

              {/* Construct Findings checklist */}
              <ConstructFindings findings={findings} />

              {/* What the detectors did not judge — CR-06. Rendered next to the
                  findings rather than inside them: a construct nobody assessed
                  is a limit of the question, not a defect in the answer. */}
              {evidenceReport && <UnassessedConstructs coverage={evidenceReport.coverage} />}

              {/* v1.22: Usage × Evidence Risk Matrix */}
              {(usageReport || project?.usageReport) && evidenceFindings.length > 0 && routeReport && (
                <SectionBoundary name="Usage Risk Matrix">
                  <UsageRiskMatrixFor
                    usageReport={(usageReport || project!.usageReport)!}
                    findings={evidenceFindings}
                    route={routeReport}
                  />
                </SectionBoundary>
              )}

              {/* Roadmap 7.1: ATC-Import, compared with — never merged into —
                  the engine's own evidence findings. Shown whenever an import
                  exists, independent of whether the engine found anything for
                  the same objects: an ATC-only view is exactly the point when
                  it happens. */}
              {(atcReport || project?.atcReport) && (
                <SectionBoundary name="ATC Findings Panel">
                  <AtcFindingsPanel
                    atcReport={(atcReport || project!.atcReport)!}
                    findings={evidenceFindings}
                  />
                </SectionBoundary>
              )}

              {/* ── Evidence Findings Detail Table — deduplicated, sorted, filterable ── */}
              {evidenceFindings.length > 0 && (() => {
                // Deduplicate by kind+objectName, aggregate lines
                const sevOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
                const grouped = new Map<string, { finding: typeof evidenceFindings[0]; lines: number[]; snippets: string[] }>();
                for (const ef of evidenceFindings) {
                  const key = `${ef.kind}::${ef.objectName || ef.title}`;
                  const existing = grouped.get(key);
                  if (existing) {
                    existing.lines.push(ef.lineStart);
                    if (ef.snippet && !existing.snippets.includes(ef.snippet)) existing.snippets.push(ef.snippet);
                  } else {
                    grouped.set(key, { finding: ef, lines: [ef.lineStart], snippets: ef.snippet ? [ef.snippet] : [] });
                  }
                }
                const deduped = Array.from(grouped.values())
                  .sort((a, b) => (sevOrder[a.finding.severity] ?? 9) - (sevOrder[b.finding.severity] ?? 9));
                const filtered = evidenceFilter === 'All' ? deduped : deduped.filter(d => d.finding.severity === evidenceFilter);
                const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
                for (const d of deduped) {
                  const s = d.finding.severity;
                  if (s in sevCounts) sevCounts[s as keyof typeof sevCounts]++;
                }

                return (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex flex-wrap items-center gap-2">
                    <FileCode2 size={18} className="text-indigo-500" />
                    <h3 className="text-base font-bold text-slate-800">Evidence Findings</h3>
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {deduped.length} unique {deduped.length === 1 ? 'finding' : 'findings'}
                    </span>
                    {/* Filter buttons */}
                    <div className="ml-auto flex gap-1.5 flex-wrap">
                      {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map(level => {
                        const count = level === 'All' ? deduped.length : sevCounts[level as keyof typeof sevCounts];
                        const isActive = evidenceFilter === level;
                        const colors: Record<string, string> = {
                          All: isActive ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          Critical: isActive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100',
                          High: isActive ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100',
                          Medium: isActive ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100',
                          Low: isActive ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100',
                        };
                        return (
                          <button
                            key={level}
                            onClick={() => setEvidenceFilter(level)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${colors[level]}`}
                          >
                            {level} {count > 0 ? `(${count})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5">Pattern</th>
                          <th className="px-4 py-2.5">Lines</th>
                          <th className="px-4 py-2.5 min-w-[200px]">Code Snippet</th>
                          <th className="px-4 py-2.5">Severity</th>
                          <th className="px-4 py-2.5">Source</th>
                          <th className="px-4 py-2.5">SAP Replacement</th>
                          <th className="px-4 py-2.5">Target</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No findings match the selected filter.</td></tr>
                        ) : filtered.map(({ finding: ef, lines, snippets }, idx) => (
                          <tr key={`${ef.kind}-${idx}`} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-slate-800">
                                {ef.title}{lines.length > 1 ? ` (${lines.length}×)` : ''}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{ef.kind}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-600 text-[10px]">{lines.join(', ')}</td>
                            <td className="px-4 py-2.5">
                              {snippets.slice(0, 2).map((s, i) => (
                                <code key={i} className="block text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded mb-0.5 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" title={s}>
                                  {s}
                                </code>
                              ))}
                              {snippets.length > 2 && <span className="text-[9px] text-slate-400">+{snippets.length - 2} more</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ef.severity === 'Critical' ? 'bg-red-100 text-red-700' :
                                ef.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                                ef.severity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {ef.severity}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ef.source === 'static-parser' ? 'bg-emerald-100 text-emerald-700' :
                                ef.source === 'catalog-match' ? 'bg-amber-100 text-amber-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {ef.source === 'static-parser' ? '⚙ Parser' :
                                 ef.source === 'catalog-match' ? '📋 Catalog' :
                                 '🤖 LLM'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {ef.sapReplacement ? (
                                <div>
                                  <div className="font-medium text-slate-700">{ef.sapReplacement.objectName}</div>
                                  <span className={`text-[10px] font-bold ${
                                    (ef.sapReplacement.confidence === 'Catalog Match' || ef.sapReplacement.confidence === 'Verified') ? 'text-green-600' :
                                    ef.sapReplacement.confidence === 'Candidate' ? 'text-amber-600' :
                                    'text-red-500'
                                  }`}>
                                    {ef.sapReplacement.confidence}
                                    {ef.sapReplacement.catalogVersion && <span className="text-slate-400 ml-1">(v{ef.sapReplacement.catalogVersion})</span>}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {(ef.targetOptions || []).slice(0, 2).map((opt, i) => (
                                  <span key={i} className="inline-block text-[9px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                                    {opt}
                                  </span>
                                ))}
                                {(ef.targetOptions || []).length > 2 && (
                                  <span className="text-[9px] text-slate-400">+{(ef.targetOptions || []).length - 2}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })()}

              {/* Executive Plain English Guide — bottom of Decision & Evidence */}
              <PlainEnglishGuide 
                plainEnglishActionPlan={bizFallback.plainEnglishActionPlan}
                extensibilityRoute={project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Decoupled Extension'}
              />
            </div>
          )}

          {/* TAB CONTENT: Gaps Backlog */}
          {activeTab === 'backlog' && (
            <div data-stage-output="worklist" className="animate-in fade-in duration-300">
              <GapsWorklist
                projectId={projectId as string}
                project={project}
                findings={findings}
                analysisGaps={analysisData.gaps || []}
                showHelpMode={false}
                onUpdateWorklist={handleUpdateWorklist}
              />
            </div>
          )}

          {/* TAB CONTENT: Detailed Assessment */}
          {activeTab === 'detailed' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Complexity & Criticality badges — live recomputed */}
              {(() => {
                // Recompute live from code to ensure new 1-10 scale is used
                const liveComplexity = legacyCode ? computeComplexityScore(legacyCode) : project.complexityScore;
                const liveCriticality = legacyCode ? computeCriticalityScore(legacyCode) : project.criticalityScore;
                if (liveComplexity === undefined && liveCriticality === undefined) return null;
                return (
                  <div className="flex flex-wrap gap-4">
                    {liveComplexity !== undefined && (
                      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm" title="Complexity measures structural code intricacy: control flow depth, dependency count, and custom object coupling. Scale: 1 = trivial, 5 = moderate, 10 = highly complex.">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu size={14} className={clsx(
                            liveComplexity >= 7 ? 'text-red-500' : liveComplexity >= 4 ? 'text-amber-500' : 'text-emerald-500'
                          )} />
                          <span className="text-xs font-bold text-slate-500">Complexity</span>
                          <span className={clsx(
                            'text-sm font-black',
                            liveComplexity >= 7 ? 'text-red-600' : liveComplexity >= 4 ? 'text-amber-600' : 'text-emerald-600'
                          )}>{liveComplexity}<span className="text-slate-400 font-bold">/10</span></span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all', liveComplexity >= 7 ? 'bg-red-500' : liveComplexity >= 4 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${(liveComplexity / 10) * 100}%` }} />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1.5">{liveComplexity >= 7 ? 'High — significant refactoring needed' : liveComplexity >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration'}</p>
                      </div>
                    )}
                    {liveCriticality !== undefined && (
                      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm" title="Criticality measures business impact: process priority, data sensitivity, and integration depth. Scale: 1 = low impact, 5 = important, 10 = mission-critical.">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={14} className={clsx(
                            liveCriticality >= 7 ? 'text-red-500' : liveCriticality >= 4 ? 'text-amber-500' : 'text-emerald-500'
                          )} />
                          <span className="text-xs font-bold text-slate-500">Criticality</span>
                          <span className={clsx(
                            'text-sm font-black',
                            liveCriticality >= 7 ? 'text-red-600' : liveCriticality >= 4 ? 'text-amber-600' : 'text-emerald-600'
                          )}>{liveCriticality}<span className="text-slate-400 font-bold">/10</span></span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all', liveCriticality >= 7 ? 'bg-red-500' : liveCriticality >= 4 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${(liveCriticality / 10) * 100}%` }} />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1.5">{liveCriticality >= 7 ? 'Mission-critical — requires careful planning' : liveCriticality >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate'}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Code Inventory Table */}
              <CodeInventoryTable codeInventory={project.codeInventory || []} />

              {/* Module Risk Heatmap */}
              <ModuleHeatmap codeInventory={project.codeInventory || []} />

              {/* Data Coupling Table */}
              <DataCouplingTable dataCoupling={project.dataCoupling || []} />

              {/* Cloud Readiness Classification (A–D) */}
              <AbcdClassificationPanel dataCoupling={project.dataCoupling || []} codeInventory={project.codeInventory || []} />

              {/* Compliance review hints (roadmap 7.7) — hints out of the table
                  names, never a classification of anybody's data. */}
              <ComplianceReviewHints dataCoupling={project.dataCoupling || []} />

              {/* Check tasks (roadmap 7.5) - what this reading could not
                  settle, as tasks with a line each, never a verdict. */}
              <ReviewTasks result={reviewTasks} />

              {/* Valuation details */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-12 flex flex-col">
                  <BusinessValueAudit projectId={projectId as string} bizFallback={bizFallback} />
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Modernization Strategy */}
          {activeTab === 'strategy' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Decision matrix pathway */}
              <ExtensibilityDecisionMatrix 
                extensibilityRoute={project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)'}
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

              {/* Next Steps */}
            </div>
          )}
        </div>
      );
    }

    return (
      <>
      <div
        className="prose prose-base md:prose-lg max-w-none text-slate-800
          prose-headings:text-slate-900 prose-headings:font-black prose-headings:tracking-tight
          prose-h1:text-2xl md:text-3xl prose-h1:mb-6 prose-h1:mt-8
          prose-h2:text-xl md:text-2xl prose-h2:mb-4 prose-h2:mt-6
          prose-h3:text-lg md:text-xl prose-h3:mb-3 prose-h3:mt-4
          prose-p:text-slate-650 prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg prose-p:mb-6
          prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-6
          prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-6
          prose-li:mb-2
          prose-strong:text-slate-900 prose-strong:font-bold
          prose-blockquote:border-l-4 prose-blockquote:border-emerald-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-6 prose-blockquote:text-slate-600
          prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs prose-code:text-emerald-700
          prose-table:w-full prose-table:my-6 prose-table:border-collapse prose-table:rounded-xl prose-table:overflow-hidden prose-table:border prose-table:border-slate-200
          prose-th:bg-slate-50 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-th:text-slate-500 prose-th:uppercase prose-th:tracking-wider prose-th:border-b prose-th:border-slate-200
          prose-td:px-4 prose-td:py-3 prose-td:text-xs md:text-sm prose-td:text-slate-700 prose-td:border-b prose-td:border-slate-100
        "
        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(withoutUnapprovedMoney(project.analysis)) }}
      />
      <WhyScorePanel project={project} />
      </>
    );
  };

  const phases = workflowSteps(project);

  if (loading && !project) return (
    <div className="h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
        <p className="text-lg font-medium text-gray-500">Loading project data...</p>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Sticky Decision-Header. Bound to the run rather than to the narrative
          (roadmap 1.2): the route and the score in it are the run's, and a run
          without a narrative has both. */}
      {(project?.analysis || project?.activeRunId) && (
        <div 
          className={clsx(
            "fixed left-0 right-0 z-50 transition-all duration-500 font-sans border-b border-slate-200 shadow-sm",
            isSticky 
              ? "top-[64px] opacity-100 translate-y-0" 
              : "top-0 opacity-0 -translate-y-full pointer-events-none"
          )}
        >
          {/* Blur background */}
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-0" />
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Route Badge */}
              <span className={clsx(
                "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm",
                (project.extensibilityRoute || '').includes('BTP')
                  ? "bg-blue-50 text-blue-700 border border-blue-100"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
              )}>
                {(project.extensibilityRoute || '').includes('BTP') ? '☁️ BTP Side-by-Side' : '⚙️ ABAP Cloud (RAP)'}
              </span>
              
              {/* Score */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance:</span>
                <span className="text-xs font-black text-slate-900">
                  {signedCleanCoreScore !== null ? `${signedCleanCoreScore}%` : '—'}
                </span>
              </div>

              {/* Target Deployment */}
              <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">
                Target: {project.s4Deployment === 'public' ? 'Public Cloud' : 'Private Cloud RISE'}
              </span>
            </div>

            {/* Next Step CTA */}
            <button
              onClick={() => router.push(`/project/${projectId}/design`)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-xl hover:bg-emerald-500 transition-all font-black text-[10px] uppercase tracking-wider shadow-md shadow-emerald-500/10 active:scale-95"
            >
              Continue to Design <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Where am I, what is behind me, what is still open — kept on
          screen while the stepper scrolls away. Both read the same contract;
          neither decides anything. */}
      <VerificationRail steps={phases} current="analyze" projectId={projectId as string} />

      <Stepper steps={phases} current="analyze" projectId={projectId as string} />
      
      <StageHeader title="Code Analysis" align="center">
        Extracting business intelligence and technical dependencies from your legacy assets.
      </StageHeader>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl mb-8 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {searchParams.get('reason') === 'no-run' && !project?.activeRunId && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl mb-8 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">Analysis required. Please run the analysis first to create an immutable evidence record before proceeding to downstream stages.</p>
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
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">Deterministic Evidence Engine</h3>
                  <p className="text-xs text-slate-500">{loadingMessage || 'Analyzing your code — deterministic, before any AI...'}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">Running</span>
            </div>
            {sweepActive && sweepFindings.length > 0 ? (
              <EvidenceSweep
                code={sweepCode}
                findings={sweepFindings}
                isActive={sweepActive}
                onComplete={() => {
                  sweepCompleteRef.current = true;
                  setLoadingMessage(
                    modelAvailability.enabled('analyze')
                      ? 'Evidence scan complete — waiting for AI narrative...'
                      : 'Evidence scan complete — signing the run.',
                  );
                }}
                minDuration={6000}
              />
            ) : (
              <ScannerConsole code={legacyCode} />
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div 
              className={clsx(
                "border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center min-h-[320px] shadow-sm",
                isDragging ? "border-green-500 bg-green-50 scale-[1.01]" : "border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50/50",
                legacyCode ? "border-green-400 bg-green-50/20" : ""
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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
                  <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm rotate-3">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Source Code Ready</h3>
                  <p className="text-gray-500">Your legacy asset has been successfully staged for analysis.</p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm -rotate-3">
                    <UploadCloud className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Upload Legacy Asset</h3>
                  <p className="text-gray-500 mb-6 max-w-md">Drag and drop your legacy code file here, or click to browse. Supports .abap and .txt formats.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">Evidence-Backed</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">Max 1MB</span>
                  </div>
                </>
              )}
            </div>

            {/* Roadmap 0.11 / DESIGN.md §6.1.3: what you confirm by uploading, and
                what we do with the code — every line traceable to the Terms, the
                Privacy Policy or SECURITY.md (lib/trust-claims.ts). */}
            <TrustBeforeUpload />

            {legacyCode && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 animate-in slide-in-from-bottom-4 mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">S/4HANA Target Operating Model</h3>
                  <p className="text-xs text-slate-500 mt-1">Select your target deployment model. This dictates Clean Core compliant score evaluations, extensibility routing rules, and generated blueprints.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Public Cloud Card */}
                  <div 
                    onClick={() => setTargetDeployment('public')}
                    className={clsx(
                      "p-6 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[140px] active:scale-[0.98]",
                      targetDeployment === 'public'
                        ? "bg-green-50/20 border-green-500 shadow-md ring-1 ring-green-500/10"
                        : "bg-white border-slate-200 hover:border-slate-350"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-900 text-sm">☁️ Public Cloud Edition</span>
                        <span className="text-[8px] font-black text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">Strict Clean Core</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">SAP S/4HANA Cloud, Public Edition (SaaS). Custom core modifications are fully prohibited. Standard released APIs must be used exclusively.</p>
                    </div>
                  </div>

                  {/* Private Cloud Card */}
                  <div 
                    onClick={() => setTargetDeployment('private')}
                    className={clsx(
                      "p-6 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[140px] active:scale-[0.98]",
                      targetDeployment === 'private'
                        ? "bg-blue-50/20 border-blue-500 shadow-md ring-1 ring-blue-500/10"
                        : "bg-white border-slate-200 hover:border-slate-350"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-900 text-sm">🛡️ Private Cloud RISE Edition</span>
                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">3-Tier Extensibility</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">SAP S/4HANA Cloud, Private Edition / On-Premise. Supports Custom Tier 2 API Wrappers to expose legacy unreleased objects upgrade-safely.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {legacyCode && !isFromExample && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-bottom-4 mb-8">
                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Shield size={16} className="text-green-600 animate-pulse" /> Security Scan & Terms Agreement
                </h4>
                
                {/* Visual Security Badge */}
                {stagedScanBlock ? (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-xs text-red-900 leading-relaxed font-medium flex items-start gap-3">
                    <ShieldAlert size={16} className="text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <strong>Malicious Payload Check failed:</strong> {stagedScanBlock} Remove the flagged content before analysing.
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50/50 border border-green-200/50 p-4 rounded-2xl text-xs text-green-900 leading-relaxed font-medium flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <strong>Malicious Payload Check passed:</strong> The staged code was scanned for command injections and plaintext secrets, and nothing was found. Uploads are additionally restricted to <code>.abap</code> and <code>.txt</code>.
                    </div>
                  </div>
                )}

                {/* Terms and Conditions Consent Box */}
                <label className="flex items-start gap-3 p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl cursor-pointer hover:bg-slate-55 transition-all select-none">
                  <input 
                    type="checkbox" 
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5 accent-green-600 shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-gray-700 leading-relaxed font-medium">
                    I agree to the <strong>Terms & Conditions</strong> of the Clean-Core.io Free Community Edition. I understand this is a free prototyping platform under absolute warranty and liability disclaimer, utilizing secure Gemini models on EU-compliant servers.
                  </span>
                </label>
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
              onAcknowledge={(next) => setPersonalDataAckFor(next ? personalDataKey : '')}
            />

            {/* v1.22: Optional usage data upload */}
            {legacyCode && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-bottom-4 mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase font-mono">Optional</span>
                    <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">v1.22</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Add Usage Data</h3>
                  <p className="text-xs text-slate-500 mt-1">Upload SAP usage exports (SCMON, UPL, ST03N) to enable usage-weighted risk prioritization. This is optional — analysis works without it.</p>
                </div>
                <UsageUpload
                  onImport={async (report) => {
                    setUsageReport(report);
                    // Roadmap 0.7: `usageReport` left the client-writable
                    // allowlist. The server holds it to the key set of
                    // lib/abap/usage-model.ts and to a row ceiling — the rules
                    // could only ever say `is map` — and stores what it kept.
                    try {
                      const stored = await runProjectCommand(projectId as string, {
                        command: 'record-usage-report',
                        usageReport: report,
                      });
                      setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
                    } catch (err) {
                      console.error('Failed to persist usage report:', err);
                    }
                  }}
                  existingReport={usageReport}
                />
              </div>
            )}

            {/* Roadmap 7.1: Optional ATC import, next to the usage import above. */}
            {legacyCode && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-bottom-4 mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase font-mono">Optional</span>
                    <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Roadmap 7.1</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Add ATC Results</h3>
                  <p className="text-xs text-slate-500 mt-1">Upload an ABAP Test Cockpit worklist export to compare its findings with this engine's evidence. This is optional — analysis works without it.</p>
                </div>
                <AtcUpload
                  onImport={async (report) => {
                    setAtcReport(report);
                    // Same boundary as `usageReport` above and for the same
                    // reason: server-only, held to the model's key set and a
                    // row ceiling — see lib/project-commands.ts.
                    try {
                      const stored = await runProjectCommand(projectId as string, {
                        command: 'record-atc-report',
                        atcReport: report,
                      });
                      setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
                    } catch (err) {
                      console.error('Failed to persist ATC report:', err);
                    }
                  }}
                  existingReport={atcReport}
                />
              </div>
            )}

            {legacyCode && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4">
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Legacy Source Code</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Read-Only Preview</span>
                </div>
                <textarea 
                  className="w-full h-80 p-6 font-mono text-sm text-gray-800 bg-gray-50/30 focus:outline-none resize-none leading-relaxed"
                  value={legacyCode}
                  onChange={(e) => setLegacyCode(e.target.value)}
                  placeholder="Paste legacy code here..."
                  spellCheck={false}
                />
              </div>
            )}

            {/* Pre-Analysis Preview — deterministic quick scan before the big run */}
            {legacyCode && !project?.analysis && !loading && (
              <PreAnalysisPreview code={legacyCode} fileName={uploadedFileName} />
            )}

            {/* Roadmap 1.2 — what this run will produce, said before the click
                rather than discovered afterwards. The analysis runs either way. */}
            {legacyCode && !loading && modelAvailability.known && !modelAvailability.enabled('analyze') && (
              <div
                data-zero-llm-notice
                className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs font-medium leading-relaxed text-slate-700"
              >
                <span className="font-bold text-slate-900">This run will produce evidence only.</span>{' '}
                {modelAbsenceReason(modelAvailability.keyAvailable ? 'stage-off' : 'no-key', 'analyze')}{' '}
                The findings, the extensibility route and the Clean Core Score are computed without a model, and the run is
                signed exactly as any other.
              </div>
            )}

            {legacyCode && !isFromExample && (!targetDeployment || !acceptedTerms || personalDataPending) && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl text-xs text-amber-900 leading-relaxed font-semibold flex items-start gap-3 mt-8 animate-in slide-in-from-bottom-2 duration-300">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <span className="font-bold text-sm block">📋 Action Required:</span>
                  <p>To start the AI modernization analysis, please complete the following steps:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1 font-medium">
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
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-12 border-t border-gray-100 mt-12">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-[#0b1c30]/60 font-bold hover:text-[#0b1c30] px-6 py-3 rounded-xl hover:bg-gray-100 transition-all group"
              >
                <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" /> Cancel & Return
              </button>
              
              <button
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
                className={clsx(
                  "flex items-center gap-3 bg-[#00873a] text-white px-10 py-4 rounded-2xl hover:bg-[#006b2c] hover:shadow-xl hover:shadow-green-900/20 transition-all font-black disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px] justify-center shadow-lg shadow-green-900/10",
                  loading && "animate-pulse",
                  !acceptedTerms && "opacity-50 cursor-not-allowed"
                )}
              >
                {loading ? (
                  <>
                    <RefreshCw size={20} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Start Analysis <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-10 animate-in slide-in-from-bottom-6">
          <div id="analysis-report" className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-green-600 px-6 py-10 md:px-10 md:py-12 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md">
                      <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-100">Technical & Business Report</span>
                  </div>
                  <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">Business Analysis Report</h2>
                  <p className="text-green-100 mt-3 max-w-2xl text-base md:text-lg font-medium opacity-90">Comprehensive assessment of legacy logic, business value, and modernization potential.</p>
                </div>
                <div className="flex gap-3 shrink-0 items-center">
                  
                  <button 
                    onClick={() => exportToConfluence()}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl backdrop-blur-md transition-all font-bold text-sm border border-white/20"
                  >
                    <FileCode2 size={16} /> Export Confluence
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 md:p-12 bg-white">
              {renderAnalysisContent()}
            </div>

            {/* Realigned Premium Navigation Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-6 py-8 md:px-12 md:py-10 bg-slate-50/50 border-t border-slate-100">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-slate-500 font-bold hover:text-slate-800 px-6 py-3 rounded-xl hover:bg-slate-100 transition-all border border-slate-200 bg-white shadow-sm"
              >
                <ArrowLeft size={18} /> Return to Dashboard
              </button>
              
              <button
                onClick={() => { 
                  setIsNavigating(true); 
                  router.push(`/project/${projectId}/design`); 
                }}
                disabled={isNavigating}
                className={clsx(
                  "flex items-center gap-3 bg-emerald-600 text-white px-10 py-4 rounded-2xl hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/20 transition-all font-black min-w-[220px] justify-center shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5",
                  isNavigating && "animate-pulse"
                )}
              >
                <>Continue to Design <ArrowRight size={18} /></>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Core Score explanation modal */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] p-8 md:p-10 max-w-lg w-full border border-slate-200/50 shadow-2xl relative animate-in zoom-in-95 duration-300 space-y-6">
            <button 
              onClick={() => setShowScoreModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block font-mono">Architecture Guide</span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Understanding Clean Core</h3>
              <p className="text-xs text-slate-500 leading-relaxed">The Clean Core compliance score determines the long-term maintainability of your ERP core, grading custom elements against modern SAP S/4HANA extensibility patterns.</p>
            </div>
            
            <div className="space-y-3.5 pt-2 font-sans">
              {/* Tier 1 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-green-100 text-green-700 font-extrabold flex items-center justify-center shrink-0">100%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Zero Customization / Standard Fit</h5>
                  <p className="text-slate-500 leading-relaxed">Leverages native SAP standard best practices. Absolutely zero custom code or maintenance overhead.</p>
                </div>
              </div>

              {/* Tier 2 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 font-extrabold flex items-center justify-center shrink-0">90%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Transformed Extensibility (Side-by-Side)</h5>
                  <p className="text-slate-500 leading-relaxed">Custom logic completely transformed via public APIs (e.g. running on Node.js/TypeScript). Easy to maintain and upgrade.</p>
                </div>
              </div>

              {/* Tier 3 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 font-extrabold flex items-center justify-center shrink-0">85%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Key-User / In-App Extensibility</h5>
                  <p className="text-slate-500 leading-relaxed">High-level custom elements built inside SAP using standard extension points, without modifying database core tables.</p>
                </div>
              </div>

              {/* Tier 4 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-red-100 text-red-700 font-extrabold flex items-center justify-center shrink-0">0%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Direct Core Modification</h5>
                  <p className="text-slate-500 leading-relaxed">Direct alteration of standard SAP core objects, leading to major regression risks and upgrade blocks.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Operating Model Concept Question Modal */}
      {showConceptQuestion && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] p-8 md:p-10 max-w-2xl w-full border border-slate-200/50 shadow-2xl relative animate-in zoom-in-95 duration-300 space-y-6 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowConceptQuestion(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block font-mono">⚖️ Architecture Validation Checkpoint</span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Confirm Target Operating Model</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Before the AI Modernization Engine generates clean core recommendations, let's align on a critical architectural choice. Which target operating model is selected?
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Public Card */}
              <div 
                onClick={() => setModalSelection('public')}
                className={clsx(
                  "p-5 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[120px] active:scale-[0.98]",
                  modalSelection === 'public'
                    ? "bg-green-50/20 border-green-500 shadow-md ring-1 ring-green-500/10"
                    : "bg-white border-slate-200 hover:border-slate-350"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-slate-900 text-xs">☁️ Public Cloud</span>
                    {modalSelection === 'public' && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-semibold">Strict SaaS rules. Zero direct modifications allowed. Released standard APIs only.</p>
                </div>
              </div>

              {/* Private Card */}
              <div 
                onClick={() => setModalSelection('private')}
                className={clsx(
                  "p-5 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[120px] active:scale-[0.98]",
                  modalSelection === 'private'
                    ? "bg-blue-50/20 border-blue-500 shadow-md ring-1 ring-blue-500/10"
                    : "bg-white border-slate-200 hover:border-slate-350"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-slate-900 text-xs">🛡️ Private Cloud / RISE</span>
                    {modalSelection === 'private' && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-semibold">3-Tier Extensibility Model. Supports upgrade-safe Tier 2 custom wrappers.</p>
                </div>
              </div>
            </div>

            {/* Explanation box based on selection */}
            {modalSelection && (
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs">
                  <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>💡 Why this choice determines your modernization strategy:</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-2 leading-relaxed font-sans">
                  {modalSelection === 'public' ? (
                    <>
                      <p>
                        In <strong>SAP S/4HANA Public Cloud (Strict SaaS)</strong>, standard code modifications are entirely blocked.
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Unreleased APIs Forbidden:</strong> Any legacy unreleased SAP tables/functions used by your custom logic are unreachable.</li>
                        <li><strong>Strict Clean Core Compliance:</strong> The AI engine will prioritize <strong>BTP Side-by-Side (CAP)</strong> or <strong>In-App RAP</strong> using strictly released APIs. You must plan to decommission or completely rewrite outdated custom logic.</li>
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

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setShowConceptQuestion(false)} 
                className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="button" 
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
                    handleAnalyze(legacyCode);
                  }
                }}
                disabled={!modalSelection || !acceptedTerms || personalDataPending}
                className="bg-[#00873a] hover:bg-[#006b2c] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-2 active:scale-95 hover:shadow-lg hover:shadow-green-900/10"
              >
                Start AI Modernization Engine <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GapAccordionCard({ gap }: { gap: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const colors = {
    High: 'bg-red-50 text-red-700 border-red-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    Low: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  return (
    <div className="border border-slate-150 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h4 className="font-extrabold text-slate-900 text-base">{gap.title}</h4>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colors[gap.severity as 'High' | 'Medium' | 'Low'] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
              Divergence: {gap.severity}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
              Complexity: {gap.complexity}
            </span>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      <div className={`transition-all duration-350 ease-in-out ${isOpen ? 'max-h-[500px] border-t border-slate-100' : 'max-h-0'} overflow-hidden`}>
        <div className="p-5 bg-slate-50/50 space-y-4 text-sm">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Recommended Strategy</span>
            <p className="mt-1 font-semibold text-slate-800 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">{gap.strategy}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Technical Rationale</span>
            <p className="mt-1 text-slate-600 leading-relaxed">{gap.rationale}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScannerConsole({ code, onComplete }: { code: string; onComplete?: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const logIndexRef = useRef(0);

  const logTemplates = [
    "[ENGINE] Starting deterministic ABAP evidence scan...",
    "[PARSE] Tokenizing ABAP — classes, reports, function modules...",
    "[SQL] Detecting Open SQL patterns, joins & quirks (FOR ALL ENTRIES)...",
    "[OO] Linearizing class/interface inheritance (MRO resolver)...",
    "[COUPLING] Mapping standard-table access & data-coupling risk...",
    "[CATALOG] Matching objects to released S/4HANA successors (Cloudification repo)...",
    "[CLEAN CORE] Scoring complexity, criticality & clean-core readiness...",
    "[ROUTING] Evaluating In-App RAP vs Side-by-Side CAP track...",
    "[EVIDENCE] Assembling a replayable, signed evidence report...",
    "[DONE] Deterministic analysis complete — findings ready for review."
  ];

  useEffect(() => {
    setLogs([logTemplates[0]]);
    logIndexRef.current = 1;

    const interval = setInterval(() => {
      if (logIndexRef.current < logTemplates.length) {
        setLogs(prev => [...prev, logTemplates[logIndexRef.current]]);
        logIndexRef.current += 1;
      } else {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, 950);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-950 text-emerald-400 font-mono text-xs rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden h-[480px] flex flex-col relative animate-in fade-in duration-500">
      <style>{`
        @keyframes scan-y {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>

      {/* Moving Laser Scanner Line */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        <div className="w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent h-[2px] shadow-[0_0_15px_#10b981] absolute left-0"
             style={{
               animation: 'scan-y 6s linear infinite',
               top: 0
             }}
        />
      </div>

      {/* Header bar */}
      <div className="bg-slate-900 border-b border-slate-850 px-6 py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clean-Core Analyzer {APP_VERSION}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Scanning Code</span>
        </div>
      </div>

      {/* Main split display */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-850 overflow-hidden relative min-h-0">
        {/* Left Side: Code Preview (low opacity, scrolling) */}
        <div className="flex-1 p-6 overflow-y-auto relative select-none opacity-20 pointer-events-none max-h-[200px] md:max-h-full scrollbar-thin scrollbar-thumb-slate-800">
          <pre className="text-[10px] leading-relaxed text-slate-400">
            {code}
          </pre>
        </div>

        {/* Right Side: Log output */}
        <div className="flex-1 p-6 bg-slate-950/80 flex flex-col justify-end overflow-y-auto space-y-2.5 z-10">
          {logs.map((log, index) => (
            <div key={index} className="animate-in slide-in-from-bottom-2 duration-300 flex items-start gap-2">
              <span className="text-slate-500 shrink-0 font-bold">{`>`}</span>
              <p className="leading-relaxed whitespace-pre-wrap">{log}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
