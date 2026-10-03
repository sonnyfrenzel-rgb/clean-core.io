'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, updateDoc, deleteField, runTransaction } from 'firebase/firestore';
import { checkProjectWrite, projectTooLargeMessage } from '@/lib/firestore-doc-size';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { FileText, Download, RefreshCw, Eye, LayoutGrid, List } from 'lucide-react';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { callGemini } from '@/lib/gemini';
import type { Project, DesignData } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import NotGenerated from '@/components/NotGenerated';
import { saveAs } from '@/lib/fileSaver';
import ArchitectSignOff, { architectureOptionLabel, type TargetArchitecture } from '@/components/ArchitectSignOff';
import { recommendedArchitecture } from '@/lib/project-commands';
import { signOffRecommendation, storedRouteOf } from '@/lib/design-recommendation';
import { runProjectCommand } from '@/lib/project-command-client';
import { evidenceDigest } from '@/lib/run-evidence-digest';
import { withPreviewPolicy } from '@/lib/export-preview';

import CcSkeleton from '@/components/cc/Skeleton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import StageFooter from '@/components/StageFooter';
import { withoutUnapprovedMoney, withoutUnapprovedMoneyDeep } from '@/lib/money-honesty';

// Extracted Subcomponents
import RoutingRationale from '@/components/design/RoutingRationale';
import NonFunctionalRequirements from '@/components/design/NonFunctionalRequirements';
import FunctionalRequirements from '@/components/design/FunctionalRequirements';
import { sha256Hex } from '@/lib/artefact-digest';
import { getRunCapabilities } from '@/lib/run-capabilities';
import LegacyRunBanner from '@/components/LegacyRunBanner';
import SectionBoundary from '@/components/SectionBoundary';
import type { NFRData } from '@/components/design/NonFunctionalRequirements';
import type { SupportFinding } from '@/lib/abap/class-model';
import { detectFindings } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import { workflowSteps, staleness, previousBasis, generationPrerequisites } from '@/lib/workflow-steps';
import StaleNotice from '@/components/StaleNotice';
import { buildDesignExportHtml, designExportFileName } from '@/lib/design-export';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { cleanAndParseJSON, checkDesignResponse } from '@/lib/design-response';
import CcButton from '@/components/cc/Button';
import { CcEmptyState } from '@/components/cc/EmptyState';
import CcMessageStrip from '@/components/cc/MessageStrip';
import DesignCanvasStage, { type DesignDocSection } from '@/components/design/DesignCanvasStage';
import { useDesignEvidence, type DesignEvidence } from '@/hooks/useDesignEvidence';
import { architectureCanvasModel } from '@/lib/architecture-canvas';
import { BTP, BTP_FIRST, SIDE_BY_SIDE_ROUTE, isSideBySideRoute, sapNamesForDisplay } from '@/lib/sap-naming';
import { DESIGN_GENERATION_CEILING_MS } from '@/lib/model-stages';
import { isProjectOwner } from '@/lib/project-readers';
import {
  claimDesignLease,
  designInFlight,
  designLeaseKey,
  otherTabWriting,
  releaseDesignLease,
  trackDesignGeneration,
} from '@/lib/design-generation-lease';
import DesignWritingState from '@/components/design/DesignWritingState';
import DesignDocument, { isSideBySideDesign } from '@/components/design/DesignDocument';


/**
 * Smart analysis context preparation for the Design prompt.
 * Extracts only design-relevant fields from the analysis JSON instead of
 * dumping the entire raw response (which can be 30-50KB for large programs).
 * This prevents Gemini from receiving too much noise and returning malformed JSON.
 */
const DESIGN_CONTEXT_LIMIT = 15_000;

const prepareAnalysisContext = (analysis: string | object): string => {
  try {
    // Handle both string and object forms of analysis
    const parsed = typeof analysis === 'object' && analysis !== null
      ? analysis
      : JSON.parse(analysis as string);
    // Extract only design-relevant fields — skip raw evidence, line-level findings, etc.
    const designContext = {
      summary: parsed.summary,
      recommendations: parsed.recommendations,
      businessProcess: parsed.businessProcess,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 10) : parsed.gaps,
      strategicNextSteps: parsed.strategicNextSteps,
      extensibilityRouting: parsed.extensibilityRouting,
      businessValueAnalysis: parsed.businessValueAnalysis,
    };
    // An amount of money in the analysis prose would reach the design prompt as if it were a figure (lib/money-honesty.ts).
    const condensed = JSON.stringify(withoutUnapprovedMoneyDeep(designContext));
    console.log('[Design] prepareAnalysisContext: condensed length =', condensed.length, 'chars');
    if (condensed.length > DESIGN_CONTEXT_LIMIT) {
      return condensed.substring(0, DESIGN_CONTEXT_LIMIT) + '\n... [analysis truncated for design prompt]';
    }
    return condensed;
  } catch (e) {
    console.warn('[Design] prepareAnalysisContext: JSON parse failed, using raw string fallback', e);
    // Fallback: raw string truncation
    const raw = withoutUnapprovedMoney(typeof analysis === 'string' ? analysis : JSON.stringify(analysis));
    if (raw.length > DESIGN_CONTEXT_LIMIT) {
      return raw.substring(0, DESIGN_CONTEXT_LIMIT) + '\n... [analysis truncated for design prompt]';
    }
    return raw;
  }
};

/**
 * A failure this page words for the reader itself (DESIGN.md §2.8: an error
 * gets an action, never a raw error text). Whatever else reaches the catch of
 * a generation — a Firestore error, a parse error — is logged and replaced by
 * a sentence; its text is for the console, not for the stage.
 */
class DesignGenerationError extends Error {}

/**
 * What a failed model call says on screen. The proxy words its refusals for
 * the reader (stage switched off, no key, rate limit) and keeps the provider's
 * own error in its log (`app/api/gemini/route.ts`); only the client's fallback
 * for an answer without a body is a status line.
 */
function modelFailureText(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (!message || /request failed with status/i.test(message)) {
    return 'The model did not answer. Nothing was saved — try again in a moment.';
  }
  return message;
}

/**
 * The context block of the design prompt: the signed engine evidence always,
 * the run's narrative only where it has one (coordinator decision,
 * 03.10.2026). An engine-only run used to leave the design with nothing to be
 * written from, and Transformation stopped behind it.
 */
async function designContextFor(
  narrative: string | null,
  { source, evidence }: { source: string | null; evidence: DesignEvidence | null },
): Promise<string> {
  const [{ buildRequirementSet }, { engineDesignContext }] = await Promise.all([
    import('@/lib/functional-requirements'),
    import('@/lib/design-engine-context'),
  ]);
  const ready = evidence && evidence.state === 'ready' ? evidence : null;
  let requirements: ReturnType<typeof buildRequirementSet> | null = null;
  try {
    requirements = source ? buildRequirementSet({ source, levels: ready?.findings ?? null }) : null;
  } catch (err) {
    console.warn('[Design] The engine evidence could not be read for the prompt:', err);
  }
  const engine = engineDesignContext({ requirements, contract: ready?.contract ?? null, findings: ready?.findings ?? [] });
  const narrativePart = narrative
    ? `Analysis Context (the run's model narrative, further context only):
${prepareAnalysisContext(narrative)}`
    : 'Analysis Context: none. The signed run was made without a model narrative; design from the engine evidence below.';
  return `${narrativePart}

Engine Evidence (the signed run, read from the code without a model):
${engine}`;
}

/**
 * The last words of the design prompt. Since the prompt carries the engine
 * evidence as a JSON object after the schema (03.10.2026), the model has answered
 * in that object's spirit now and then: a design with no `nodeAppBlueprint`,
 * which `checkDesignResponse` rightly refuses and the reader then has to
 * regenerate (CI of b879ad8b, one of two live calls). The schema is restated
 * after the evidence, where the model reads last.
 */
const DESIGN_ANSWER_REMINDER =
  'Answer with the DesignData JSON object only. The evidence above is input, not the answer format: do not echo its keys. ' +
  'Every top-level key of DesignData must be present, each with the type the schema gives: projectName, architectureOverview, ' +
  'nodeAppBlueprint (an object with projectStructure and apiEndpoints), cloudServices, dataSync, securityHardening and roadmap (at least one named phase).';

const GENERATION_FAILED_TEXT = 'The solution design could not be generated or saved. Nothing was changed — try again.';

/** Said when the generation outlasts `DESIGN_GENERATION_CEILING_MS`. */
const CEILING_TEXT = `The model did not answer within ${Math.round(DESIGN_GENERATION_CEILING_MS / 1000)} s. Nothing was saved — try again.`;

/** This tab, for the lease another tab reads (`lib/design-generation-lease.ts`). */
const DESIGN_TAB = Math.random().toString(36).slice(2);

/** How long a fresh lease is given to settle across tabs before the model is called. */
const LEASE_SETTLE_MS = 250;

export default function DesignPage() {
  const { projectId } = useParams();
  useUserProfile();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState('');

  const [loadingMessage, setLoadingMessage] = useState('');
  const [nfrData, setNfrData] = useState<NFRData | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  /**
   * When the solution design this page is writing was started, or `null`
   * (ADR-070, amended 03.10.2026: Design writes it on opening). `elsewhereSince`
   * is the same for a generation another tab of this browser holds.
   */
  const [generatingSince, setGeneratingSince] = useState<number | null>(null);
  const [elsewhereSince, setElsewhereSince] = useState<number | null>(null);
  const generating = generatingSince !== null;
  /** The signed-in account owns the project; an invited reader never starts a generation. */
  const [isOwner, setIsOwner] = useState(false);
  const projectRef = useRef(project);

  // Re-derive findings from project.legacyCode for construct coupling
  const findings = useMemo<SupportFinding[]>(() => {
    if (!project?.legacyCode) return [];
    const abapSources = [{ file: 'main.abap', content: project.legacyCode }];
    try {
      const realModel = buildClassModel(abapSources);
      return detectFindings(realModel, abapSources);
    } catch {
      return [];
    }
  }, [project?.legacyCode]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  /** The signed source and the server's evidence, for the design prompt — kept current below. */
  const engineEvidenceRef = useRef<{ source: string | null; evidence: DesignEvidence | null }>({ source: null, evidence: null });

  /**
   * The design on record now, read again — what a page adopts when another
   * writer (a tab, an earlier mount of this page) saved one, so it is shown
   * instead of being paid for a second time.
   */
  const adoptStoredDesign = useCallback(async () => {
    try {
      const stored = await loadProjectAndHydrate(projectId as string);
      if (stored) {
        setProject(stored);
        if (stored.solutionDesign) {
          setDesign(stored.solutionDesign);
          setNfrData((stored as { nonFunctionalRequirements?: NFRData | null }).nonFunctionalRequirements ?? null);
        }
      }
    } catch (err) {
      console.error('[Design] The stored design could not be read again:', err);
    } finally {
      setElsewhereSince(null);
      setGeneratingSince(null);
    }
  }, [projectId]);

  /**
   * Writes the solution design. `open` is the generation the stage starts by
   * itself when it is opened; `asked` is the reader's own Regenerate or Try
   * again. Only `open` defers to a design another writer saved meanwhile — an
   * asked regeneration is asked for.
   */
  const generateDesign = useCallback((analysis: string | null, mode: 'open' | 'asked' = 'asked'): Promise<void> => {
    const id = projectId as string;
    // Never twice: a generation of this page already running (StrictMode, a
    // second mount) is waited for, and one another tab holds is not repeated.
    const running = designInFlight(id);
    if (running) {
      setGeneratingSince((since) => since ?? Date.now());
      return running.then(adoptStoredDesign, adoptStoredDesign);
    }
    if (!claimDesignLease(id, DESIGN_TAB)) {
      setElsewhereSince(otherTabWriting(id, DESIGN_TAB)?.since ?? Date.now());
      return Promise.resolve();
    }
    return trackDesignGeneration(id, (async () => {
    setGeneratingSince(Date.now());
    setDesignError(null);
    // Two tabs can take the lease in the same moment; storage settles on one
    // value, and the tab whose lease it is not steps back before any model call.
    await new Promise((resolve) => setTimeout(resolve, LEASE_SETTLE_MS));
    const rival = otherTabWriting(id, DESIGN_TAB);
    if (rival) {
      setGeneratingSince(null);
      setElsewhereSince(rival.since);
      return;
    }
    setLoadingMessage('Writing the solution design (model)…');
    // The run whose analysis the caller handed in, captured before the model
    // call. The page says a design is built on the run the server signed; a
    // response that lands after another tab activated a new run would otherwise
    // be stored as that run's design, and it would not read as stale either,
    // because it differs from the design the new run recorded (codex usp-02).
    const writtenFromRun = projectRef.current?.activeRunId ?? null;
    // The design this page showed when it started — none, or one written for a
    // previous basis. Another design on record means somebody else wrote one.
    const seenDesign = projectRef.current?.solutionDesign ?? '';
    // One wait for the whole generation (`DESIGN_GENERATION_CEILING_MS`).
    let ceilingTimer: ReturnType<typeof setTimeout> | undefined;
    const ceiling = new Promise<never>((_, reject) => {
      ceilingTimer = setTimeout(
        () => reject(new DesignGenerationError(CEILING_TEXT)),
        DESIGN_GENERATION_CEILING_MS,
      );
    });
    ceiling.catch(() => undefined);
    try {
      const db = getDb();
      const projData = await loadProjectAndHydrate(projectId as string);
      if (mode === 'open' && projData?.solutionDesign && projData.solutionDesign !== seenDesign) {
        // Saved by another writer since this page read the project: shown, not paid for again.
        console.log('[Design] A design was saved meanwhile; showing it instead of writing another.');
        setProject(projData);
        setDesign(projData.solutionDesign);
        setNfrData((projData as { nonFunctionalRequirements?: NFRData | null }).nonFunctionalRequirements ?? null);
        return;
      }
      const route = projData?.extensibilityRoute || SIDE_BY_SIDE_ROUTE;
      const designContext = await designContextFor(analysis, engineEvidenceRef.current);
      const isAbapCloud = !isSideBySideRoute(route);

      const prompt = isAbapCloud 
        ? `Act as a Senior SAP Enterprise Architect. Analyze the engine evidence (and the analysis narrative, where there is one) and design a modern, clean SAP RAP (RESTful Application Programming Model) Developer Extensibility target architecture.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-3 sentence overview of the clean core RAP approach. Focus on in-app extensibility, standard RAP business object adaptations, or custom released RAP endpoints.
    nodeFramework: string; // Value MUST be: "SAP RAP (RESTful Application Programming)" with a brief justification
    runtimePlatform: string; // Value MUST be: "SAP S/4HANA Core (Developer Extensibility)"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended RAP artifact layout: CDS projection views, Behavior Definitions (BDEF), Service Definitions (SRVD), Service Bindings (SRVB), and Behavior Implementation classes (ABP).
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // Exposed RAP UI service operations or REST service definitions
  };
  cloudServices: Array<{
    serviceName: string; // Internal core services integrated (e.g. standard IAM business roles, released BAdI extension points, custom authorization objects)
    purpose: string; // Concrete usage in this RAP service
    npmPackages: string[]; // Value MUST be empty array [] (as RAP uses standard ABAP dictionary packages, not npm)
  }>;
  dataSync: {
    patternName: string; // E.g. "Transactional DB Access", "ABAP CDS Projection Join"
    description: string; // Rationale on how standard transactional lock (ENQUEUE/DEQUEUE) is preserved natively within SAP LUW (Logical Unit of Work).
  };
  securityHardening: Array<{
    category: string; // e.g. IAM, Authorization, Dictionary, Audit
    requirement: string; // ABAP Cloud / RAP security rule ONLY. MUST use only ABAP-native concepts. NEVER reference Node.js, npm, passport, helmet, or any non-ABAP technology. Example: 'Authority Check on V_KNA1_VKO authorization object'
    packageOrConfig: string; // ABAP-native implementation ONLY. Examples: 'AUTHORITY-CHECK OBJECT V_KNA1_VKO', 'CDS access control DCL', 'ABAP Cloud restricted syntax check', 'IAM App / Business Catalog'. NEVER use npm packages or Node.js code.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. DDIC Setup, RAP Behavior Implementation, Service Exposure, Fiori Elements Integration)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
}

${designContext}

${DESIGN_ANSWER_REMINDER}`
        : `Act as a Senior SAP Cloud Solutions Architect. Analyze the engine evidence (and the analysis narrative, where there is one) and design a modern, highly professional modular SAP CAP (Cloud Application Programming) side-by-side transformed cloud architecture. Name the platform "${BTP_FIRST}" at its first mention and "${BTP}" after that; keep the names of SAP services exactly as SAP names them.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-3 sentence overview of the transformed architectural approach. Focus on loose coupling, exposing legacy core through standard versioned APIs, and deploying side-by-side.
    nodeFramework: string; // Value MUST be: "SAP CAP (Cloud Application Programming model)" with a brief justification
    runtimePlatform: string; // Value MUST be: "${BTP_FIRST}"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended modular CAP layout: db/schema.cds (CDS schema), srv/service.cds (service definitions), srv/service.ts (business handlers), package.json, Dockerfile.
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // REST or OData service endpoints designed to handle the legacy business capability
  };
  cloudServices: Array<{
    serviceName: string; // Name of the cloud service on ${BTP} (e.g. XSUAA Identity Provider, Destination service, Event Mesh, PostgreSQL on ${BTP})
    purpose: string; // Concrete usage in this ${BTP} extension
    npmPackages: string[]; // Actual npm packages used in CAP/Node.js to integrate with it (e.g. ['@sap/xssec', '@sap/cds'], ['@sap-cloud-sdk/connectivity'], ['pg'], ['@sap/cds-dk'])
  }>;
  dataSync: {
    patternName: string; // E.g. "Event-Driven via SAP Event Mesh", "Transactional SAP Destination service routing"
    description: string; // Technical description of how data stays consistent between the CAP service and the legacy core.
  };
  sapStandardApiMapping?: Array<{
    legacyTableOrFunction: string; // Legacy database table (e.g., KNA1, BSEG, LFA1, VBAK) or BAPI being integrated
    sapStandardApiName: string; // Official standard released SAP API name (e.g. API_BUSINESS_PARTNER, API_SALES_ORDER_SRV, API_OUTBOUND_DELIVERY_SRV)
    apiHubUrl: string; // Reference link to api.sap.com (e.g. https://api.sap.com/api/API_BUSINESS_PARTNER/overview)
    apiId: string; // Official API ID reference (e.g. SAP_COM_0008, SAP_COM_0109, etc.)
    description: string; // Clear technical rationale of how this API replaces direct DB SELECTs to keep the core clean
  }>;
  securityHardening: Array<{
    category: string; // e.g. Authentication, Network, Coding, Audit
    requirement: string; // Node.js / CAP / ${BTP} security rule ONLY. MUST use only ${BTP}-native and Node.js concepts. NEVER reference ABAP, AUTHORITY-CHECK, or any ABAP-native constructs. Example: 'XSUAA JWT Validation via @sap/xssec'
    packageOrConfig: string; // Node.js/${BTP} implementation ONLY. Examples: 'app.use(passport.authenticate("JWT", { session: false }))', 'app.use(helmet())', 'npm audit --audit-level=high', '@sap/xssec'. NEVER use ABAP code or syntax.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. Foundation, CAP Service exposure, ${BTP} Event Integration, Production Hardening)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
}

${designContext}

${DESIGN_ANSWER_REMINDER}`;

      console.log('[Design] Generating solution design for:', projectRef.current?.name);
      console.log('[Design] Narrative:', analysis ? `${analysis.length} chars` : 'none (engine-only run)');

      let responseText: string;
      try {
        responseText = await Promise.race([callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'design'), ceiling]);
      } catch (err: unknown) {
        console.error('[Design] Model call failed:', err);
        if (err instanceof DesignGenerationError) throw err;
        throw new DesignGenerationError(modelFailureText(err));
      }
      
      console.log('[Design] Gemini response received, length:', responseText?.length);
        
      if (!responseText) {
        throw new DesignGenerationError('The model returned an empty answer. Nothing was saved — regenerate to try again.');
      }
      // Not every non-empty answer is a design: `{}`, a truncated object or
      // sections of the wrong type used to be stored as one, with `status:
      // 'designed'`, over whatever design was there (QA full review of
      // fc787674705f, 6a5a3b3546de). Refused here, the stored design stays.
      const shape = checkDesignResponse(responseText);
      // The reason names the broken section; it is for the log, the reader
      // needs to know that nothing was stored and what to do.
      if (!shape.ok) console.warn('[Design] Model answer refused:', shape.reason);
      if (!shape.ok) {
        throw new DesignGenerationError("The model's answer is not a usable solution design. Nothing was saved — regenerate to try again.");
      }

      // The NFRs are generated from this design and stored with it, in one
      // write. They used to be two writes around a second model call, so two
      // tabs regenerating at once could leave one tab's design beside the
      // other tab's NFRs, and a failed NFR call left the previous design's NFRs
      // beside the new design (QA full review of fc787674705f, 5c1f3bd288f6).
      // Whichever generation writes last now writes a matching pair; an NFR
      // failure stores the design without NFRs rather than with stale ones.
      let nfrForDesign: Record<string, unknown> | null = null;
      setLoadingMessage('Asking for proposals on the non-functional requirements...');
      try {
        // The engine reads the non-functional requirements out of the signed
        // source; the model is asked only for target values and answers to
        // the questions the code leaves open, next to them (owner 03.10.2026).
        const nfrLib = await import('@/lib/non-functional-requirements');
        const signed = engineEvidenceRef.current.source;
        let nfrSet: import('@/lib/non-functional-requirements').NfrSet | null = null;
        try {
          nfrSet = signed ? nfrLib.buildNfrSet({ source: signed }) : null;
        } catch { /* the prompt goes without the engine's list */ }
        const nfrPrompt = nfrLib.nfrProposalPrompt(nfrSet, responseText);

        // What is left of the ceiling: proposals that do not come back in time
        // are left out, the design is saved without them.
        const nfrResponse = await Promise.race([callGemini(nfrPrompt, PRODUCT_GEMINI_MODEL, true, 'design'), ceiling]);
        if (nfrResponse) {
          try {
            const cleaned = nfrResponse.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
            const parsed: unknown = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              // Only the eight topics, only text, only what says something.
              const kept: Record<string, string> = {};
              for (const key of Object.values(nfrLib.NFR_MODEL_KEY)) {
                const value = (parsed as Record<string, unknown>)[key];
                if (typeof value === 'string' && value.trim()) kept[key] = value.trim();
              }
              nfrForDesign = Object.keys(kept).length ? kept : null;
            }
          } catch { /* NFR parse failure is non-critical */ }
        }
      } catch { /* NFR generation failure is non-critical */ }

      const projectDoc = doc(db, 'projects', projectId as string);
      const savedElsewhere: { data: Record<string, unknown> | null } = { data: null };
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(projectDoc);
        if ((snap.data()?.activeRunId ?? null) !== writtenFromRun) {
          throw new DesignGenerationError('The analysis of this project changed while the design was being generated, so nothing was saved. Reload the stage and generate it again.');
        }
        // A design opened by itself never writes over one another writer saved
        // while this one was being written; that one is kept and shown.
        if (mode === 'open' && String(snap.data()?.solutionDesign ?? '') !== seenDesign) {
          savedElsewhere.data = snap.data() ?? null;
          return;
        }
        // Codex architecture-02: refused by name before the commit rather than
        // failing in it, when the design would push the project past 1 MiB.
        const size = checkProjectWrite(
          snap.data(),
          { solutionDesign: responseText, nonFunctionalRequirements: nfrForDesign ?? deleteField() },
          projectDoc.path,
          'update',
        );
        if (!size.ok) throw new DesignGenerationError(projectTooLargeMessage(size, 'this solution design'));
        tx.update(projectDoc, {
          solutionDesign: responseText,
          status: 'designed',
          nonFunctionalRequirements: nfrForDesign ?? deleteField(),
        });
      });
      if (savedElsewhere.data) {
        const other = savedElsewhere.data;
        setDesign(String(other.solutionDesign ?? ''));
        setNfrData((other.nonFunctionalRequirements as NFRData | undefined) ?? null);
        setProject((prev: Project | null) => prev ? { ...prev, solutionDesign: String(other.solutionDesign ?? '') } : prev);
        return;
      }
      setDesign(responseText);
      setNfrData(nfrForDesign as NFRData | null);
      setProject((prev: Project | null) => prev ? { ...prev, solutionDesign: responseText } : prev);
    } catch (err: unknown) {
      console.error('[Design] Generation FAILED:', err);
      setDesignError(err instanceof DesignGenerationError ? err.message : GENERATION_FAILED_TEXT);
    } finally {
      clearTimeout(ceilingTimer);
      setGeneratingSince(null);
      setLoadingMessage('');
    }
    })().finally(() => releaseDesignLease(id, DESIGN_TAB)));
  }, [projectId, adoptStoredDesign]);

  const generateDesignRef = useRef(generateDesign);
  useEffect(() => {
    generateDesignRef.current = generateDesign;
  }, [generateDesign]);

  // The contract and the findings the canvas is drawn from (server routes; the
  // catalog never reaches the browser). Re-read after a sign-off, which can
  // move the contract's chosen route.
  const [evidenceVersion, setEvidenceVersion] = useState(0);
  const designEvidence = useDesignEvidence(projectId as string, Boolean(project), evidenceVersion);

  // The generation the stage starts on opening (ADR-070, amended 03.10.2026),
  // held until `/api/model-stages` has answered: with the stage off or no key,
  // nothing is asked of the model and the reason is on screen instead.
  const [autoStart, setAutoStart] = useState<{ narrative: string | null } | null>(null);
  const designAvailable = modelAvailability.enabled('design');
  // It also waits for the contract and the findings (a few hundred ms), so
  // the prompt carries the route and the levels as a Regenerate would.
  const evidenceSettled = designEvidence.state !== 'loading';
  useEffect(() => {
    if (autoStart === null || modelAvailability.loading || !evidenceSettled) return;
    // Started from a task, not from the effect body: the effect only decides
    // that the answer is in; a dependency change before it runs reschedules it,
    // and StrictMode's second run finds the first one cleared.
    const timer = setTimeout(() => {
      setAutoStart(null);
      if (designAvailable) {
        console.log('[Design] Writing the solution design on opening');
        void generateDesignRef.current(autoStart.narrative, 'open');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [autoStart, modelAvailability.loading, designAvailable, evidenceSettled]);

  // A tab that is closed or reloaded mid-generation gives its lease back, so
  // the next opening is not kept waiting for a call nobody will save.
  useEffect(() => {
    const id = projectId as string;
    const release = () => releaseDesignLease(id, DESIGN_TAB);
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [projectId]);

  // Another tab of this browser is writing it: its design is read when its
  // lease ends, or when the lease would have run out.
  useEffect(() => {
    if (elsewhereSince === null) return undefined;
    const key = designLeaseKey(projectId as string);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key && !event.newValue) void adoptStoredDesign();
    };
    window.addEventListener('storage', onStorage);
    const timer = setTimeout(() => void adoptStoredDesign(), Math.max(1_000, elsewhereSince + DESIGN_GENERATION_CEILING_MS + 15_000 - Date.now()));
    return () => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer);
    };
  }, [elsewhereSince, projectId, adoptStoredDesign]);

  useEffect(() => {
    const fetchProject = async () => {
      let data: Project | null;
      try {
        data = await loadProjectAndHydrate(projectId as string);
      } catch (err) {
        // A read that failed is not an empty stage and not a page that loads
        // forever (QA 46b8c6352769): it used to reject here with nothing to
        // catch it, and `loading` stayed true.
        console.error('[Design] Project could not be loaded:', err);
        setDesignError('Could not load the project. This is usually a permissions or connectivity issue — reload the page.');
        setLoading(false);
        return;
      }
      if (!enforceActiveRun(data, projectId as string)) return;
      if (data) {
        // Batch all state updates together to prevent layout shift ("wobble")
        setProject(data);
        const stored = data as { nonFunctionalRequirements?: NFRData | null };
        const stale = staleness(data);
        // Written on opening (ADR-070, amended 03.10.2026) when there is none
        // on record, or the one on record was written for a previous basis —
        // never again when a current one is there, which would cost a model
        // call for nothing. Only by the owner: an invited reader reads.
        const wanted = !data.solutionDesign || (stale.design && !stale.sourceChanged);
        const owner = isProjectOwner(data, getAuth().currentUser?.uid ?? null);
        setIsOwner(owner);
        const canStart = owner && !stale.sourceChanged && !data._runLoadFailed && generationPrerequisites(data, 'design').length === 0;
        if (data.solutionDesign) {
            setDesign(data.solutionDesign);
            // Restore persisted NFR data if available
            if (stored.nonFunctionalRequirements) {
              setNfrData(stored.nonFunctionalRequirements);
            }
        }
        if (wanted && canStart) {
            const elsewhere = otherTabWriting(projectId as string, DESIGN_TAB);
            if (elsewhere) {
              setElsewhereSince(elsewhere.since);
            } else {
              // Started above once the stage's availability is known (QA
              // 6c4734f60aa8): a stage that is off, or has no key, gets its
              // reason on screen instead of a request the proxy will refuse.
              // The narrative is further context where the run has one.
              const narrative = data.analysis
                ? typeof data.analysis === 'object' ? JSON.stringify(data.analysis) : data.analysis
                : null;
              setAutoStart({ narrative });
            }
            setLoading(false);
        } else if (data.solutionDesign) {
            setLoading(false);
        } else if (data._runLoadFailed) {
            // The run (which holds the analysis) could not be read — surface it instead
            // of a silent empty state, so the real cause (permissions/network) is visible.
            console.error('[Design] Active run could not be loaded:', data._runLoadError);
            // The error itself is in the console line above; the stage says
            // what it means and what to do.
            setDesignError('Could not load the analysis run. This is usually a permissions or connectivity issue — reload the page, or re-run the analysis in stage 1.');
            setLoading(false);
        } else {
            // No run, no source, a source changed after the run, or a reader:
            // nothing is generated on opening. The document region names what
            // is missing, or offers "Generate the design".
            setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);


  /**
   * The Confluence page is built in `lib/design-export.ts` (block D, D.28),
   * which escapes every model value and takes its look from
   * `lib/export-style.ts`. The page decides only whether it is previewed or saved.
   */
  const exportToConfluence = async (viewOnly = false) => {
    const currentProject = projectRef.current;
    const htmlContent = currentProject ? buildDesignExportHtml(currentProject) : null;
    if (!currentProject || htmlContent === null) {
      console.warn("No solution design found");
      return;
    }

    if (viewOnly) {
      // Not `document.write` into a blank window that inherits this origin: the
      // preview opens as its own document, with no handle back to the opener.
      // A blob document still shares this origin, so it carries a policy of its
      // own under which nothing in it can run or fetch (`lib/export-preview.ts`).
      const blob = new Blob([withPreviewPolicy(htmlContent)], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    await saveAs(blob, designExportFileName(currentProject.name));
    
    // The export is no longer written back into the project document; the same
    // decision as the Analyze stage, for the same reason.
    //
    // Every export used to add `exports.design_confluence_<Date.now()>` with the
    // whole HTML and delete nothing, inside a document Firestore caps at 1 MiB —
    // and past that cap every write to the project fails, which ends the
    // project. The one reader of `exports`, the deliverables tree on the
    // dashboard, expects `{ title, content, type }` per entry and was handed a
    // bare HTML string, so the row it drew carried the raw key as its title and
    // `undefined` behind both of its buttons. The file is already in the
    // reader's downloads, and the HTML is regenerated from
    // `currentProject.solutionDesign` on the next click.
    //
    // The write that is left removes what earlier versions stored, because a
    // project already carrying those blobs is not helped by adding no more. It
    // touches no key other than `exports`, which `firestore.rules` already
    // allows a client to write.
    const staleExports = Object.keys(currentProject.exports || {}).filter((key) =>
      key.startsWith('design_confluence_'),
    );
    if (staleExports.length > 0) {
      const db = getDb();
      const docRef = doc(db, 'projects', projectId as string);
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

  /**
   * The stored design, parsed once. A structured design is the JSON form the
   * prompt asks for; anything else is the older text form, rendered as
   * markdown. Bulletproof against malformed or null elements (Codex robust
   * rendering): every array is filtered, every string defaulted.
   */
  const parsedDesign = useMemo<DesignData | null>(() => {
    if (!design) return null;
    const t = design.trim();
    if (!(t.startsWith('{') || (t.includes('{') && t.includes('}')))) return null;
    let data: DesignData | null = null;
    try {
      data = cleanAndParseJSON(design) as DesignData;
    } catch (e) {
      console.error('Failed to parse JSON design, falling back to markdown rendering', e);
      return null;
    }
    if (!data) return null;
    return {
      projectName: data.projectName || project?.name || 'Transformed System',
      architectureOverview: {
        approachDescription: data.architectureOverview?.approachDescription || '',
        nodeFramework: data.architectureOverview?.nodeFramework || '',
        runtimePlatform: data.architectureOverview?.runtimePlatform || '',
      },
      nodeAppBlueprint: {
        projectStructure: (data.nodeAppBlueprint?.projectStructure || []).filter(Boolean),
        apiEndpoints: (data.nodeAppBlueprint?.apiEndpoints || []).filter(Boolean),
      },
      cloudServices: (data.cloudServices || []).filter(Boolean),
      dataSync: {
        patternName: data.dataSync?.patternName || 'Data Sync',
        description: data.dataSync?.description || '',
      },
      sapStandardApiMapping: (data.sapStandardApiMapping || []).filter(Boolean),
      securityHardening: (data.securityHardening || []).filter(Boolean),
      roadmap: (data.roadmap || []).filter(Boolean),
    };
  }, [design, project?.name]);

  const deploymentModel: 'public' | 'private' | null =
    project?.s4Deployment === 'public' ? 'public' : project?.s4Deployment === 'private' ? 'private' : null;
  const canvasModel = useMemo(
    () =>
      designEvidence.state === 'ready' && designEvidence.contract
        ? architectureCanvasModel({
            contract: designEvidence.contract,
            findings: designEvidence.findings,
            deployment: deploymentModel,
          })
        : null,
    [designEvidence, deploymentModel],
  );
  const [view, setView] = useState<'canvas' | 'list'>('canvas');

  /**
   * The source the active run signed, and nothing else, for the
   * functional requirements: the same comparison the Documentation stage makes,
   * so a line anchor never points into a source the run did not see.
   */
  const signedSource = useMemo(() => {
    const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
    if (!project?.activeRunId || !source.trim()) return null;
    const signed = (project as { inputFingerprint?: { sha256?: string; fileName?: string } }).inputFingerprint
      ?? project.auditMetadata?.inputFingerprint;
    if (!signed?.sha256 || sha256Hex(source) !== signed.sha256) return null;
    return { source, fileName: signed.fileName || 'source.abap' };
  }, [project]);
  // Kept for the prompt, which is built inside a callback created before these exist.
  useEffect(() => {
    engineEvidenceRef.current = { source: signedSource?.source ?? null, evidence: designEvidence };
  }, [signedSource, designEvidence]);
  /** What the design needs on record: a source and a signed run. The narrative is not among them. */
  const designPrerequisites = generationPrerequisites(project, 'design');

  const requirementsMissing = !project?.activeRunId
    ? 'The requirements are read from the source of a signed analysis run. Run the analysis in stage 1 first.'
    : !project?.legacyCode
      ? 'This project has no source to read requirements from.'
      : 'The source changed after the signed run, or the run carries no fingerprint of it. Re-run the analysis in stage 1; the requirements are read only from the source the run signed.';

  const caps = getRunCapabilities(project);

  const phases = workflowSteps(project);
  // E01-F01-US02: a design or a sign-off left over from a previous source.
  const stale = staleness(project);
  const designStale = Boolean(design) && stale.design;
  const staleNotes = [
    ...(stale.sourceChanged ? ['The source changed after the signed run. Re-run the analysis in stage 1.'] : []),
    ...(designStale && !stale.sourceChanged
      ? [`This design was generated for ${previousBasis(project)}. Regenerate it — the analysis it was written from no longer describes the code under review.`]
      : []),
    ...(stale.signOff ? [`The sign-off below was given for ${previousBasis(project)}. Unlock it and confirm the target architecture again.`] : []),
  ];
  // The sign-off is current when it was given for the code under review —
  // `stale.signOff` says when it was not (a source or profile change after it).
  // A design document older than the analysis is the document's state and is
  // named above; it used to void a sign-off given *after* the analysis moved
  // on as well, so "Confirm & Lock" landed on the server (Transformation ran
  // against the contract) while this page kept saying "Not confirmed".
  const signOffCurrent = project?.approvedByArchitect === true && !stale.signOff;

  const regenerate = () => {
    if (!isOwner) {
      setDesignError('Only the owner of this project writes its design. Invited readers read it.');
    } else if (stale.sourceChanged) {
      // The analysis on file describes a previous source (QA f9aea437967e).
      setDesignError('The source changed after the signed run. Re-run the analysis in stage 1 first; a design generated now would describe the previous source.');
    } else if (designPrerequisites.length > 0) {
      setDesignError(designPrerequisites.map((p) => p.reason).join(' '));
    } else {
      // The narrative is further context where the run has one; the engine
      // evidence is what the design is written from either way.
      const narrative = project?.analysis
        ? typeof project.analysis === 'object' ? JSON.stringify(project.analysis) : project.analysis
        : null;
      void generateDesign(narrative, 'asked');
    }
  };

  // The wait, wherever the design is being written: this page, an earlier
  // mount of it, or another tab. A start still waiting for the model switch
  // shows it too, so the stage never flashes an empty state before it.
  const pendingOpen = autoStart !== null && (modelAvailability.loading || designAvailable);
  const writingSince = generatingSince ?? elsewhereSince;
  const writingState =
    writingSince !== null || pendingOpen ? (
      <DesignWritingState
        // `pendingOpen` has not started yet; it counts from its first second.
        since={writingSince}
        step={loadingMessage}
        elsewhere={generatingSince === null && elsewhereSince !== null}
        replacing={Boolean(design)}
      />
    ) : null;

  if (loading && !design) return (
    <StageFrame stage="design" className="min-h-screen">
      <StageHeader stage="design" tools={{ steps: phases, current: 'design' }} projectName={project?.name}>Where this code should run after the change, and the design that gets it there.</StageHeader>

      <div className="overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
        <div role="status" className="flex items-center gap-3 border-b border-cc-line bg-cc-surface-muted px-4 py-4 sm:px-8">
          <RefreshCw size={20} aria-hidden={true} className="shrink-0 text-cc-ink-muted motion-safe:animate-spin" />
          <div className="min-w-0">
            <h2 className="m-0 cc-text-h2 text-cc-ink">Opening Design…</h2>
            <p className="m-0 cc-text-cell text-cc-ink-muted">Loading project data…</p>
          </div>
        </div>
        <div className="p-4 sm:p-8">
          <CcSkeleton shape="text" label="the technical design" count={6} />
        </div>
      </div>
    </StageFrame>
  );

  // Built after the loading return: the markdown renderer needs a DOM, and
  // the server render never has a design to show.
  /**
   * The nine sections a structured design carries, in the order the document
   * reads. The structured design is shown by `DesignDocument` since 03.10.2026;
   * these count what is written, for the tab's label. The older text form is
   * still shown from here, as the overview.
   */
  const docSections: DesignDocSection[] = (() => {
    if (parsedDesign) {
      const d = parsedDesign;
      const nfrTopics = nfrData ? Object.values(nfrData).filter((v) => typeof v === 'string' && v.trim()).length : 0;
      return [
        { key: 'overview', title: 'Architecture overview', written: Boolean(d.architectureOverview.approachDescription) },
        { key: 'blueprint', title: 'Project blueprint', written: d.nodeAppBlueprint.projectStructure.length > 0 },
        { key: 'endpoints', title: 'API endpoints', written: d.nodeAppBlueprint.apiEndpoints.length > 0 },
        { key: 'mapping', title: 'SAP standard API mapping', written: (d.sapStandardApiMapping || []).length > 0 },
        { key: 'cloud', title: 'Cloud services', written: d.cloudServices.length > 0 },
        { key: 'sync', title: 'Data sync pattern', written: Boolean(d.dataSync.description) },
        { key: 'security', title: 'Security hardening', written: d.securityHardening.length > 0 },
        { key: 'roadmap', title: 'Roadmap', written: d.roadmap.length > 0 },
        { key: 'nfr', title: 'Non-functional requirements', written: nfrTopics > 0 },
      ];
    }
    // The older text form: one document, read as the overview. The rest is
    // honestly not written.
    const firstLine = design
      .split(/\r?\n/)
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .filter(Boolean)
      .find((l, i, all) => i > 0 || all.length === 1);
    return [
      {
        key: 'overview',
        title: 'Architecture overview',
        written: Boolean(design),
        excerpt: firstLine ? `“${firstLine}”` : undefined,
        meta: 'older text form',
        content: <div className="cc-prose" dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(design) }} />,
      },
      ...[
        ['blueprint', 'Project blueprint'],
        ['endpoints', 'API endpoints'],
        ['mapping', 'SAP standard API mapping'],
        ['cloud', 'Cloud services'],
        ['sync', 'Data sync pattern'],
        ['security', 'Security hardening'],
        ['roadmap', 'Roadmap'],
        ['nfr', 'Non-functional requirements'],
      ].map(([key, title]) => ({ key, title, written: false })),
    ];
  })();

  /**
   * The structured design as one document (owner 03.10.2026: overview first,
   * then groups by question). The route's reason is the engine's — the
   * contract's sentence for the route the design is written for — and only
   * where none was read, the run's recommendation.
   */
  const structuredDocument = parsedDesign ? (() => {
    const sideBySide = isSideBySideDesign(parsedDesign);
    const contractRead = designEvidence.state === 'ready' ? designEvidence.contract : null;
    // The contract's headline — what is built and what was rejected — for the
    // route the design is written for; never for the other one.
    const sameRoute = contractRead?.route.chosen === (sideBySide ? 'side-by-side-cap' : 'in-app-rap');
    const routeReason = contractRead && sameRoute && contractRead.summary
      ? { text: sapNamesForDisplay(contractRead.summary), source: 'architecture contract, read from the code' }
      : project?.recommendationJustification
        ? { text: sapNamesForDisplay(project.recommendationJustification), source: 'the run’s recommendation' }
        : null;
    const nfrTopics = nfrData ? Object.values(nfrData).filter((v) => typeof v === 'string' && v.trim()).length : 0;
    return (
      <DesignDocument
        design={parsedDesign}
        routeReason={routeReason}
        levels={designEvidence.state === 'ready' ? designEvidence.findings : null}
        findings={findings}
        nfrTopics={nfrTopics}
        banner={<LegacyRunBanner capabilities={caps} projectId={projectId as string} />}
      />
    );
  })() : null;

  // A failed generation, worded for the reader, with the one action that
  // could change it. It used to be drawn only on the empty stage, so a failed
  // *re*generation left the old design on screen and said nothing.
  const designErrorStrip = designError ? (
    <CcMessageStrip
      state="error"
      headline="Generation failed."
      announce
      actions={
        // Without a design the empty state below carries "Try again"; one
        // button for one action.
        design && designAvailable && isOwner ? (
          <CcButton variant="secondary" icon={<RefreshCw size={16} aria-hidden={true} />} busy={generating} onClick={regenerate}>
            Try again
          </CcButton>
        ) : undefined
      }
    >
      {designError}
    </CcMessageStrip>
  ) : null;

  // The document region when there is no document yet: the stage's reason, or
  // the one action that makes one.
  const documentFallback = design ? null : writingState ? (
    writingState
  ) : !modelAvailability.enabled('design') ? (
    /* Roadmap 1.2 / V25-A12 — a button that can only fail is worse than
       no button. The stage says which of the two reasons applies and
       what would change it, instead of offering a generation that the
       server will refuse. The engine's parts — canvas, contract and both
       requirement lists — stand without a model and are shown regardless. */
    <div data-design-model-off={modelAvailability.keyAvailable ? 'stage-off' : 'no-key'} className="flex flex-col gap-2">
      <NotGenerated
        what="Solution design blueprint"
        absence={modelAvailability.keyAvailable ? 'stage-off' : 'no-key'}
        stage="design"
        hint={
          modelAvailability.keyAvailable
            ? 'Turn the design stage back on in Settings to generate it.'
            : 'Add your own Gemini API key in Settings to generate it. The signed analysis evidence needs no key and is unaffected.'
        }
      />
      <Link href="/settings" data-design-settings-link="" className="self-start text-[14px] font-semibold text-cc-information underline-offset-2 hover:underline">
        Open Settings
      </Link>
    </div>
  ) : designPrerequisites.length > 0 ? (
    /* Never silent: what is missing, in words, with the one action
       that puts it on record. The button stays away rather than fail. */
    <div data-design-prerequisites="" className="space-y-4">
      {designErrorStrip}
      <CcMessageStrip state="information" headline="The design cannot be generated yet.">
        <span className="flex flex-col gap-2">
          {designPrerequisites.map((p) => (
            <span key={p.id} data-design-prerequisite={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{p.reason}</span>
              <Link
                href={`/project/${encodeURIComponent(projectId as string)}/${p.action.stage}`}
                className="font-semibold text-cc-information underline-offset-2 hover:underline"
              >
                {p.action.label}
              </Link>
            </span>
          ))}
        </span>
      </CcMessageStrip>
    </div>
  ) : project && !isOwner ? (
    /* An invited reader reads: nothing is generated for them, and no button
       offers a write the rules refuse. */
    <CcMessageStrip state="information" headline="No solution design on record yet.">
      <span data-design-reader-note="">The owner of this project writes it; it appears here once it is saved.</span>
    </CcMessageStrip>
  ) : (
    <div className="space-y-4">
      {designErrorStrip}
      <CcEmptyState
        illustration={<FileText size={32} aria-hidden={true} className="text-cc-ink-muted" />}
        title="No solution design yet"
        action={
          <CcButton variant="primary" density="cozy" icon={<RefreshCw size={16} aria-hidden={true} />} busy={generating} onClick={regenerate} data-design-generate="">
            {designError ? 'Try again' : 'Generate the design'}
          </CcButton>
        }
      >
        {project?.analysis
          ? 'Written from the signed engine evidence — route, process, business rules and SAP objects — with the run’s narrative as further context. Two model calls, the design and its non-functional proposals, not counted against your analysis runs; the result is a model proposal.'
          : 'Written from the signed engine evidence — route, process, business rules and SAP objects. The run has no model narrative, and the design does not need one. Two model calls, the design and its non-functional proposals, not counted against your analysis runs; the result is a model proposal.'}
      </CcEmptyState>
    </div>
  );

  // What the project stores — the run's recommendation or the route switch. The
  // card's answer is the contract's; this is named only where it differs
  // (`lib/design-recommendation.ts`).
  const storedRoute = storedRouteOf(project, recommendedArchitecture);
  // The sign-off names the contract's recommendation too (owner decision
  // 02.10.2026): `approve-architecture` checks a departure against the contract
  // it derives on the server, so the dialog and the card no longer tell two
  // stories. The stored value stands in only where no contract was read.
  const contractForSignOff = designEvidence.state === 'ready' ? designEvidence.contract : null;
  const signOffBasis = signOffRecommendation(contractForSignOff ? contractForSignOff.route : null, storedRoute);
  const recommendation = signOffBasis.code;
  // The run's rationale and confidence describe the run's recommendation; they
  // are shown only when that is the one named here.
  const runSaysTheSame = storedRoute?.source === 'run' && storedRoute.code === recommendation;
  const signOffJustification =
    runSaysTheSame && project?.recommendationJustification
      ? sapNamesForDisplay(project.recommendationJustification)
      : signOffBasis.basis === 'contract'
        ? `The architecture contract, derived from the code on the server, recommends the ${recommendation === 'cap' ? 'Side-by-Side (CAP)' : 'On-Stack (RAP)'} extensibility path for this project.`
        : project?.recommendationJustification
          ? sapNamesForDisplay(project.recommendationJustification)
          : `Based on the code analysis, the ${recommendation === 'cap' ? 'Side-by-Side (CAP)' : 'On-Stack (RAP)'} extensibility path was identified as the most suitable approach for this project.`;
  const canSignOff = Boolean(design) && designIsStructured(design);

  // The sign-off command, one place for both ways to it: the panel's
  // "Confirm & Lock" and the question "Confirm target" asks first.
  const lockArchitecture = async (architecture: TargetArchitecture, justification: string) => {
    const stored = await runProjectCommand(projectId as string, {
      command: 'approve-architecture',
      targetArchitecture: architecture,
      justification: justification || '',
      // Roadmap 8.8 — which run this page rendered, and what it
      // said. `loadProjectAndHydrate` spreads the run over the
      // project (`lib/project-loader.ts:14-22`), so every fact
      // `evidenceDigest` reads here is the run's own; the three
      // keys the project keeps on merge are deliberately not
      // among them. If the server's active run has moved since,
      // the command comes back 409 with the diff instead of
      // silently binding the sign-off to a run nobody read.
      expectedRunId: String(project?.activeRunId || ''),
      expectedEvidenceDigest: evidenceDigest(project as unknown as Record<string, unknown>),
    });
    setProject((prev: Project | null) => prev ? { ...prev, ...stored } as Project : null);
    setEvidenceVersion((v) => v + 1);
  };

  // The sign-off, unchanged: the same panel, the same commands, the same
  // run binding (roadmap 0.7, 8.8). It sits in the Decision tab now.
  const signOffPanel = canSignOff ? (
    <ArchitectSignOff
      // The two shapes `originalRecommendation` arrives in — the five
      // architecture codes and the router's own route names — are
      // translated in one place, which the server validates against.
      recommendation={recommendation}
      confidenceScore={runSaysTheSame || signOffBasis.basis !== 'contract' ? project?.recommendationConfidence : undefined}
      justificationText={signOffJustification}
      isLocked={project?.approvedByArchitect === true}
      currentArchitecture={project?.targetArchitecture}
      currentJustification={project?.architectJustifiedOverride}
      lockedByEmail={project?.approvedBy}
      lockedAt={project?.architectSignOffAt ? String(project.architectSignOffAt) : undefined}
      canUnlock={true}
      // Roadmap 0.7: the five release fields are no longer writable
      // from here. The server records them and answers with what it
      // stored — including the address it read off the ID token and
      // the timestamp off its own clock, neither of which this page
      // is entitled to invent.
      onLock={lockArchitecture}
      onUnlock={async () => {
        const stored = await runProjectCommand(projectId as string, { command: 'revoke-architecture' });
        setProject((prev: Project | null) => prev ? {
          ...prev,
          ...stored,
          targetArchitecture: undefined,
          architectSignOffAt: undefined,
        } as Project : null);
        setEvidenceVersion((v) => v + 1);
      }}
    />
  ) : null;

  // The target context, as the contract states it — bound by the run, or not.
  const contractNow = designEvidence.state === 'ready' ? designEvidence.contract : null;
  const targetBound = Boolean(contractNow?.fields.find((f) => f.key === 'target-context')?.statement);
  const editionWord = deploymentModel === 'private' ? 'Private' : deploymentModel === 'public' ? 'Public' : null;
  const targetKpi = targetBound && editionWord
    ? { value: `${editionWord} Edition`, sub: 'bound by the run' }
    : { value: 'Not determined', sub: editionWord ? `${editionWord} Edition assumed` : null };
  const targetLine = targetBound && editionWord
    ? `${editionWord} Cloud Edition · bound by the run`
    : editionWord
      ? `${editionWord} Cloud Edition assumed · target not bound by the run`
      : 'Edition not determined · target not bound by the run';

  return (
    <StageFrame stage="design" className="min-h-screen">
      <StaleNotice title={`Built for ${previousBasis(project)}`} reasons={staleNotes} />

      <StageHeader tools={{ steps: phases, current: 'design' }} projectName={project?.name}
        stage="design"
        eyebrow={design ? <CcProvenanceChip value="proposed" note="document" /> : null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-[719px]:hidden">
              <CcSegmentedControl
                label="View"
                value={view}
                onChange={setView}
                segments={[
                  { value: 'canvas', label: 'Canvas', icon: <LayoutGrid size={14} aria-hidden={true} /> },
                  { value: 'list', label: 'List', icon: <List size={14} aria-hidden={true} /> },
                ]}
              />
            </span>
            {design ? (
              <>
                {/* Regenerate only where it can succeed and would describe the code
                    under review: not with the stage off or keyless (QA
                    6c4734f60aa8), and not from an analysis of a previous source
                    (QA f9aea437967e). A design merely older than the analysis is
                    what Regenerate is for. Exports stay closed on a stale design. */}
                <CcButton
                  variant="ghost"
                  icon={<RefreshCw size={16} aria-hidden={true} />}
                  busy={generating}
                  disabled={!designAvailable || stale.sourceChanged || !isOwner || elsewhereSince !== null}
                  data-design-regenerate=""
                  onClick={regenerate}
                >
                  Regenerate
                </CcButton>
                <CcButton variant="ghost" icon={<Eye size={16} aria-hidden={true} />} disabled={designStale} data-design-export="view" onClick={() => exportToConfluence(true)}>
                  View HTML
                </CcButton>
                <CcButton variant="ghost" icon={<Download size={16} aria-hidden={true} />} disabled={designStale} data-design-export="save" onClick={() => exportToConfluence(false)}>
                  Export HTML
                </CcButton>
              </>
            ) : null}
          </div>
        }
      >
        Where this code should run after the change, and the design that gets it there.
      </StageHeader>

      <div className="mb-12">
        <DesignCanvasStage
          evidence={designEvidence}
          model={canvasModel}
          targetLine={targetLine}
          targetKpi={targetKpi}
          confidence={typeof project?.recommendationConfidence === 'number' ? project.recommendationConfidence : null}
          storedRoute={storedRoute}
          confirmed={
            signOffCurrent
              ? {
                  label: architectureOptionLabel(project?.targetArchitecture) ?? String(project?.targetArchitecture ?? ''),
                  by: project?.approvedBy ?? null,
                  at: project?.architectSignOffAt ? String(project.architectSignOffAt) : null,
                }
              : null
          }
          stale={designStale || stale.signOff}
          hasDocument={Boolean(design)}
          canSignOff={canSignOff}
          signOffPanel={signOffPanel}
          // "Confirm target" asks first and then confirms the recommendation
          // the panel would (owner 02.10.2026); another target goes through
          // the panel.
          confirmTarget={
            canSignOff
              ? {
                  label: architectureOptionLabel(recommendation) ?? recommendation,
                  onConfirm: () => lockArchitecture(recommendation, ''),
                  chooseOther: true,
                }
              : undefined
          }
          locked={project?.approvedByArchitect === true}
          onRegenerate={regenerate}
          regenerateDisabled={!designAvailable || stale.sourceChanged || !isOwner || elsewhereSince !== null}
          regenerating={generating}
          legacyCode={project?.legacyCode || ''}
          sections={docSections}
          document={structuredDocument}
          documentFallback={documentFallback}
          documentNotice={
            writingState || designErrorStrip ? (
              <div className="flex flex-col gap-3">
                {writingState}
                {designErrorStrip}
              </div>
            ) : null
          }
          routingRationale={
            caps.hasRoutingEvidence ? (
              <SectionBoundary name="Routing Rationale">
                <RoutingRationale
                  extensibilityRoute={project?.extensibilityRoute}
                  cleanCoreScore={project?.cleanCoreScore}
                  s4Deployment={project?.s4Deployment}
                  findings={findings}
                />
              </SectionBoundary>
            ) : null
          }
          view={view}
        />
      </div>

      <div className="mb-12" id="functional-requirements">
        <FunctionalRequirements
          projectId={projectId as string}
          projectName={project?.name || ''}
          fileName={signedSource?.fileName || 'source.abap'}
          source={signedSource?.source ?? null}
          missingReason={signedSource ? null : requirementsMissing}
          levels={designEvidence.state === 'ready' ? designEvidence.findings : null}
          wording={{
            enabled: designAvailable,
            reason: designAvailable
              ? null
              : modelAvailability.keyAvailable
                ? 'the Design stage is switched off in Settings.'
                : 'no Gemini key is available for this account; add your own in Settings.',
          }}
        />
      </div>

      <div className="mb-12 scroll-mt-24" id="non-functional-requirements">
        <NonFunctionalRequirements
          projectId={projectId as string}
          projectName={project?.name || ''}
          fileName={signedSource?.fileName || 'source.abap'}
          source={signedSource?.source ?? null}
          missingReason={signedSource ? null : requirementsMissing}
          proposals={nfrData}
          levels={designEvidence.state === 'ready' ? designEvidence.findings : null}
        />
      </div>

      <StageFooter />
    </StageFrame>
  );
}

/** Whether a stored design is the structured kind that carries the sign-off panel. */
function designIsStructured(design: string | null | undefined): boolean {
  if (!design) return false;
  const t = design.trim();
  if (!(t.startsWith('{') || (t.includes('{') && t.includes('}')))) return false;
  try {
    return Boolean(cleanAndParseJSON(design));
  } catch {
    return false;
  }
}
