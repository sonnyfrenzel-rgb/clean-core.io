'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import Stepper from '@/components/Stepper';
import { FileText, Download, RefreshCw, Eye, LayoutTemplate } from 'lucide-react';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { callGemini } from '@/lib/gemini';
import type { Project, DesignData } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import NotGenerated from '@/components/NotGenerated';
import { saveAs } from '@/lib/fileSaver';
import GlossaryTerm from '@/components/GlossaryTerm';
import ArchitectSignOff from '@/components/ArchitectSignOff';
import type { TargetArchitecture } from '@/components/ArchitectSignOff';
import { recommendedArchitecture } from '@/lib/project-commands';
import { runProjectCommand } from '@/lib/project-command-client';
import { evidenceDigest } from '@/lib/run-evidence-digest';
import { withPreviewPolicy } from '@/lib/export-preview';

// Helper imports from components
import { getSecurityExplanation } from '@/components/design/SecurityHardeningChecklist';
import { getCloudServiceDetails } from '@/components/design/CloudServiceIntegrations';

import CcSkeleton from '@/components/cc/Skeleton';
import NavigationButtons from '@/components/NavigationButtons';
import { withoutUnapprovedMoney, withoutUnapprovedMoneyDeep } from '@/lib/money-honesty';

// Extracted Subcomponents
import ArchitectureOverview from '@/components/design/ArchitectureOverview';
import SyncPatternCard from '@/components/design/SyncPatternCard';
import InteractiveTopology from '@/components/design/InteractiveTopology';
import ProjectBlueprintExplorer from '@/components/design/ProjectBlueprintExplorer';
import ApiEndpointsCatalog from '@/components/design/ApiEndpointsCatalog';
import ApiBusinessHubMapping from '@/components/design/ApiBusinessHubMapping';
import CloudServiceIntegrations from '@/components/design/CloudServiceIntegrations';
import SecurityHardeningChecklist from '@/components/design/SecurityHardeningChecklist';
import ModernizationRoadmap from '@/components/design/ModernizationRoadmap';
import RoutingRationale from '@/components/design/RoutingRationale';
import TargetArchitectureDiagram from '@/components/design/TargetArchitectureDiagram';
import NonFunctionalRequirements from '@/components/design/NonFunctionalRequirements';
import { getRunCapabilities } from '@/lib/run-capabilities';
import LegacyRunBanner from '@/components/LegacyRunBanner';
import SectionBoundary from '@/components/SectionBoundary';
import type { NFRData } from '@/components/design/NonFunctionalRequirements';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { SourceFile } from '@/lib/abap/findings-detector';
import VerificationRail from '@/components/VerificationRail';
import StageHeader from '@/components/StageHeader';
import { workflowSteps, staleness } from '@/lib/workflow-steps';
import StaleNotice from '@/components/StaleNotice';
import { buildDesignExportHtml, designExportFileName } from '@/lib/design-export';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { cleanAndParseJSON, checkDesignResponse } from '@/lib/design-response';
import CcButton from '@/components/cc/Button';
import { CcEmptyState } from '@/components/cc/EmptyState';
import CcMessageStrip from '@/components/cc/MessageStrip';


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

const GENERATION_FAILED_TEXT = 'The solution design could not be generated or saved. Nothing was changed — try again.';

export default function DesignPage() {
  const { projectId } = useParams();
  const { profile } = useUserProfile();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState('');
  const router = useRouter();

  const [loadingMessage, setLoadingMessage] = useState('');
  const [nfrData, setNfrData] = useState<NFRData | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);


  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const projectRef = useRef(project);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  // Check localStorage for dismissed banner
  useEffect(() => {
    if (projectId) {
      const key = `signoff-banner-dismissed-${projectId}`;
      setBannerDismissed(localStorage.getItem(key) === 'true');
    }
  }, [projectId]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    if (projectId) {
      localStorage.setItem(`signoff-banner-dismissed-${projectId}`, 'true');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const generateDesign = useCallback(async (analysis: string) => {
    setLoading(true);
    setDesignError(null);
    setLoadingMessage('Architecting solution design...');
    try {
      const db = getDb();
      const projData = await loadProjectAndHydrate(projectId as string);
      const route = projData?.extensibilityRoute || 'Side-by-Side (SAP BTP)';
      const isAbapCloud = !route.includes('BTP');

      const prompt = isAbapCloud 
        ? `Act as a Senior SAP Enterprise Architect. Analyze the legacy business analysis results and design a modern, clean SAP RAP (RESTful Application Programming Model) Developer Extensibility target architecture.
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

Analysis Context:
${prepareAnalysisContext(analysis)}`
        : `Act as a Senior SAP Cloud Solutions Architect. Analyze the legacy business analysis results and design a modern, highly professional modular SAP CAP (Cloud Application Programming) side-by-side transformed cloud architecture.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-3 sentence overview of the transformed architectural approach. Focus on loose coupling, exposing legacy core through standard versioned APIs, and deploying side-by-side.
    nodeFramework: string; // Value MUST be: "SAP CAP (Cloud Application Programming model)" with a brief justification
    runtimePlatform: string; // Value MUST be: "SAP BTP (Business Technology Platform)"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended modular CAP layout: db/schema.cds (CDS schema), srv/service.cds (service definitions), srv/service.ts (business handlers), package.json, Dockerfile.
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // REST or OData service endpoints designed to handle the legacy business capability
  };
  cloudServices: Array<{
    serviceName: string; // Name of the cloud BTP service (e.g. XSUAA Identity Provider, Destination service, Event Mesh, BTP PostgreSQL)
    purpose: string; // Concrete usage in this BTP extension
    npmPackages: string[]; // Actual npm packages used in CAP/Node.js to integrate with it (e.g. ['@sap/xssec', '@sap/cds'], ['@sap-cloud-sdk/connectivity'], ['pg'], ['@sap/cds-dk'])
  }>;
  dataSync: {
    patternName: string; // E.g. "Event-Driven via BTP Event Mesh", "Transactional BTP Destination Routing"
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
    requirement: string; // Node.js / CAP / BTP security rule ONLY. MUST use only BTP-native and Node.js concepts. NEVER reference ABAP, AUTHORITY-CHECK, or any ABAP-native constructs. Example: 'XSUAA JWT Validation via @sap/xssec'
    packageOrConfig: string; // Node.js/BTP implementation ONLY. Examples: 'app.use(passport.authenticate("JWT", { session: false }))', 'app.use(helmet())', 'npm audit --audit-level=high', '@sap/xssec'. NEVER use ABAP code or syntax.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. Foundation, CAP Service exposure, BTP Event Integration, Production Hardening)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
}

Analysis Context:
${prepareAnalysisContext(analysis)}`;

      console.log('[Design] Generating solution design for:', projectRef.current?.name);
      console.log('[Design] Analysis type:', typeof analysis, '| length:', typeof analysis === 'string' ? analysis.length : JSON.stringify(analysis).length);

      let responseText: string;
      try {
        responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'design');
      } catch (err: unknown) {
        console.error('[Design] Model call failed:', err);
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
      setLoadingMessage('Generating non-functional requirements...');
      try {
        const nfrPrompt = `You are an SAP Enterprise Architect. Based on the following solution design, generate comprehensive Non-Functional Requirements. Return ONLY a JSON object matching this schema exactly:

{
  "dataMigration": "Z-table migration strategy: how custom data (e.g. ZSD_*, ZLOG_*) will be migrated to the target system. Include data volume assessment, ETL approach, and validation strategy.",
  "dataRetention": "Archival and retention policies for legacy and new data. Include regulatory requirements (GoBD, SOX) and archiving approach (ILM, SARA, cloud storage).",
  "auditTrail": "Change tracking and compliance logging strategy. Include which objects need audit logging, format (SAP Change Documents, Application Log, custom), and retention.",
  "authorizationConcept": "Role and authorization mapping from legacy auth objects to target model. Include IAM business roles, app descriptors, restriction types, and separation of duties.",
  "errorHandling": "Retry patterns, circuit breakers, dead-letter queues. Include error classification (transient vs permanent), alerting thresholds, and recovery procedures.",
  "monitoring": "Observability strategy: dashboards, alerts, log aggregation. Include KPIs (response time, error rate, throughput), health checks, and escalation paths.",
  "slaRequirements": "Availability targets (e.g. 99.5%), latency budgets (p95 < 2s), throughput requirements, and planned maintenance windows.",
  "cutoverStrategy": "Migration cutover plan including parallel operation phase, feature flags, rollback procedures, data sync during dual-run, and go-live criteria."
}

Solution Design Context:
${responseText.substring(0, 4000)}`;

        const nfrResponse = await callGemini(nfrPrompt, PRODUCT_GEMINI_MODEL, true, 'design');
        if (nfrResponse) {
          try {
            const cleaned = nfrResponse.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
            const parsed: unknown = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              nfrForDesign = parsed as Record<string, unknown>;
            }
          } catch { /* NFR parse failure is non-critical */ }
        }
      } catch { /* NFR generation failure is non-critical */ }

      await updateDoc(doc(db, 'projects', projectId as string), {
        solutionDesign: responseText,
        status: 'designed',
        nonFunctionalRequirements: nfrForDesign ?? deleteField(),
      });
      setDesign(responseText);
      setNfrData(nfrForDesign as NFRData | null);
      setProject((prev: Project | null) => prev ? { ...prev, solutionDesign: responseText } : prev);
    } catch (err: unknown) {
      console.error('[Design] Generation FAILED:', err);
      setDesignError(err instanceof DesignGenerationError ? err.message : GENERATION_FAILED_TEXT);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [projectId, profile?.byokConfigured]);

  const generateDesignRef = useRef(generateDesign);
  useEffect(() => {
    generateDesignRef.current = generateDesign;
  }, [generateDesign]);

  useEffect(() => {
    const fetchProject = async () => {
      const data = await loadProjectAndHydrate(projectId as string);
      if (!enforceActiveRun(data, projectId as string)) return;
      if (data) {
        // Batch all state updates together to prevent layout shift ("wobble")
        setProject(data);
        if (data.solutionDesign) {
            setDesign(data.solutionDesign);
            // Restore persisted NFR data if available
            if ((data as any).nonFunctionalRequirements) {
              setNfrData((data as any).nonFunctionalRequirements);
            }
            setLoading(false);
        } else if (data.analysis) {
            console.log('[Design] Auto-generating design from analysis, type:', typeof data.analysis);
            generateDesignRef.current(typeof data.analysis === 'object' ? JSON.stringify(data.analysis) : data.analysis);
        } else if (data._runLoadFailed) {
            // The run (which holds the analysis) could not be read — surface it instead
            // of a silent empty state, so the real cause (permissions/network) is visible.
            console.error('[Design] Active run could not be loaded:', data._runLoadError);
            // The error itself is in the console line above; the stage says
            // what it means and what to do.
            setDesignError('Could not load the analysis run. This is usually a permissions or connectivity issue — reload the page, or re-run the analysis in stage 1.');
            setLoading(false);
        } else {
            console.warn('[Design] No analysis data found on project — cannot auto-generate design.');
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

  const renderDesignContent = () => {
    if (!design) return null;

    let data: DesignData | null = null;
    const trimmedDesignText = design.trim();
    if (trimmedDesignText.startsWith('{') || (trimmedDesignText.includes('{') && trimmedDesignText.includes('}'))) {
      try {
        data = cleanAndParseJSON(design) as DesignData;
      } catch (e) {
        console.error('Failed to parse JSON design, falling back to markdown rendering', e);
      }
    }

    if (data) {
      // Bulletproof defense against malformed/null/undefined elements in arrays (Codex robust rendering)
      const sanitizedData: DesignData = {
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

      const isAbapCloud = !(project?.extensibilityRoute || sanitizedData.architectureOverview?.runtimePlatform || 'BTP').includes('BTP');

      // Structural fix: determine run capabilities once (shape-based, not version-based)
      const caps = getRunCapabilities(project);
      
      return (
        <div className="space-y-12">
          {/* Legacy run banner — visible, honest state instead of silent section gaps */}
          <LegacyRunBanner capabilities={caps} projectId={projectId as string} />

          {/* Routing Rationale — Design ↔ Analyze evidence binding */}
          <SectionBoundary name="Routing Rationale">
            {caps.hasRoutingEvidence && (
              <RoutingRationale
                extensibilityRoute={project?.extensibilityRoute}
                cleanCoreScore={project?.cleanCoreScore}
                s4Deployment={project?.s4Deployment}
                findings={findings}
              />
            )}
          </SectionBoundary>

          {/* Target Architecture Overview */}
          <SectionBoundary name="Architecture Overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
              <ArchitectureOverview overview={sanitizedData.architectureOverview} />
              <SyncPatternCard dataSync={sanitizedData.dataSync} />
            </div>
          </SectionBoundary>

          {/* Decoupling topology diagram */}
          <SectionBoundary name="Interactive Topology">
            <InteractiveTopology isAbapCloud={isAbapCloud} />
          </SectionBoundary>

          {/* Auto-generated Mermaid architecture diagram */}
          <SectionBoundary name="Target Architecture">
            <TargetArchitectureDiagram data={sanitizedData} isAbapCloud={isAbapCloud} />
          </SectionBoundary>

          {/* Project blueprint and API catalog */}
          <SectionBoundary name="Project Blueprint">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
              <ProjectBlueprintExplorer projectStructure={sanitizedData.nodeAppBlueprint?.projectStructure} />
              <ApiEndpointsCatalog apiEndpoints={sanitizedData.nodeAppBlueprint?.apiEndpoints} />
            </div>
          </SectionBoundary>

          {/* Standard API Hub Reference mappings */}
          <SectionBoundary name="Business Accelerator Hub Mapping">
            <ApiBusinessHubMapping sapStandardApiMapping={sanitizedData.sapStandardApiMapping} />
          </SectionBoundary>

          {/* Cloud Service bindings grid & drawer */}
          <SectionBoundary name="Cloud Service Integrations">
            <CloudServiceIntegrations cloudServices={sanitizedData.cloudServices} />
          </SectionBoundary>

          {/* Security Hardening checklist — full width */}
          <SectionBoundary name="Security Hardening">
            <SecurityHardeningChecklist securityHardening={sanitizedData.securityHardening} findings={findings} />
          </SectionBoundary>

          {/* Phased Modernization Roadmap timeline */}
          <SectionBoundary name="Modernization Roadmap">
            <ModernizationRoadmap roadmap={sanitizedData.roadmap} />
          </SectionBoundary>

          {/* Non-Functional Requirements — Enterprise Readiness */}
          <SectionBoundary name="Non-Functional Requirements">
            <NonFunctionalRequirements nfr={nfrData} />
          </SectionBoundary>

          {/* Architect sign-off / decision — always last. The panel is its own
              card; this wrapper only names the region. */}
          <section aria-label="Architect sign-off">
              <ArchitectSignOff
                // The two shapes `originalRecommendation` arrives in — the five
                // architecture codes and the router's own route names — are
                // translated in one place, which the server validates against.
                recommendation={recommendedArchitecture({
                  originalRecommendation: project?.originalRecommendation,
                  extensibilityRoute: project?.extensibilityRoute,
                }) || 'rap'}
                confidenceScore={project?.recommendationConfidence}
                justificationText={project?.recommendationJustification || `Based on the code analysis, the ${project?.extensibilityRoute?.includes('BTP') ? 'Side-by-Side (CAP)' : 'On-Stack (RAP)'} extensibility path was identified as the most suitable approach for this project.`}
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
                onLock={async (architecture, justification) => {
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
                }}
                onUnlock={async () => {
                  const stored = await runProjectCommand(projectId as string, { command: 'revoke-architecture' });
                  setProject((prev: Project | null) => prev ? {
                    ...prev,
                    ...stored,
                    targetArchitecture: undefined,
                    architectSignOffAt: undefined,
                  } as Project : null);
                }}
              />
          </section>
        </div>
      );
    }

    // Fallback to legacy markdown rendering
    return (
      <div 
        className="cc-prose"
        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(design) }}
      />
    );
  };

  const phases = workflowSteps(project);
  // E01-F01-US02: a design or a sign-off left over from a previous source.
  const stale = staleness(project);
  const designStale = Boolean(design) && stale.design;
  const staleNotes = [
    ...(stale.sourceChanged ? ['The source changed after the signed run. Re-run the analysis in stage 1.'] : []),
    ...(designStale && !stale.sourceChanged
      ? ['This design was generated for a previous source. Regenerate it — the analysis it was written from no longer describes the code under review.']
      : []),
    ...(stale.signOff ? ['The sign-off below was given for a previous source. Unlock it and confirm the target architecture again.'] : []),
  ];
  const signOffCurrent = project?.approvedByArchitect === true && !stale.signOff && !designStale;

  const regenerate = () => {
    if (project?.analysis) {
      const analysisStr = typeof project.analysis === 'object' ? JSON.stringify(project.analysis) : project.analysis;
      generateDesign(analysisStr);
    } else {
      setDesignError('Analysis data not found. Please go back to stage 1 (Analyze) and run the analysis first.');
    }
  };

  if (loading && !design) return (
    <div className="min-h-screen">
      {/* Where am I, what is behind me, what is still open — kept on
          screen while the stepper scrolls away. Both read the same contract;
          neither decides anything. */}
      <VerificationRail steps={phases} current="design" projectId={projectId as string} />

      <Stepper steps={phases} current="design" projectId={projectId as string} />

      <StageHeader stage="design">Review the generated target architecture and technical design.</StageHeader>

      <div className="overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
        <div role="status" className="flex items-center gap-3 border-b border-cc-line bg-cc-surface-muted px-4 py-4 sm:px-8">
          <RefreshCw size={20} aria-hidden={true} className="shrink-0 text-cc-ink-muted motion-safe:animate-spin" />
          <div className="min-w-0">
            <h2 className="m-0 cc-text-h2 text-cc-ink">Designing Solution...</h2>
            <p className="m-0 cc-text-cell text-cc-ink-muted">{loadingMessage || 'Loading project data...'}</p>
          </div>
        </div>
        <div className="p-4 sm:p-8">
          <CcSkeleton shape="text" label="the technical design" count={6} />
        </div>
      </div>
    </div>
  );

  // A failed generation, worded for the reader, with the one action that
  // could change it. It used to be drawn only on the empty stage, so a failed
  // *re*generation left the old design on screen and said nothing.
  const designErrorStrip = designError ? (
    <CcMessageStrip
      state="error"
      headline="Generation failed."
      announce
      actions={
        modelAvailability.enabled('design') ? (
          <CcButton variant="secondary" icon={<RefreshCw size={16} aria-hidden={true} />} busy={loading} onClick={regenerate}>
            {design ? 'Regenerate' : 'Retry Generation'}
          </CcButton>
        ) : undefined
      }
    >
      {designError}
      {!design && ' This may happen with large ABAP programs. The retry uses a condensed analysis context.'}
    </CcMessageStrip>
  ) : null;

  return (
    <div className="min-h-screen">
      {/* The rail used to render only while the page was loading: it sat in the
          early return and nowhere else, so it vanished the moment there was
          something to report on. */}
      <VerificationRail steps={phases} current="design" projectId={projectId as string} />

      <Stepper steps={phases} current="design" projectId={projectId as string} />

      <StaleNotice title="Built for a previous source" reasons={staleNotes} />

      <StageHeader
        stage="design"
        actions={design ? (
          <div className="flex flex-wrap gap-2">
            <CcButton
              variant="secondary"
              icon={<RefreshCw size={16} aria-hidden={true} />}
              busy={loading}
              onClick={() => {
                if (project?.analysis) {
                  const analysisStr = typeof project.analysis === 'object' ? JSON.stringify(project.analysis) : project.analysis;
                  generateDesign(analysisStr);
                }
              }}
            >
              Regenerate
            </CcButton>
            <CcButton variant="ghost" icon={<Eye size={16} aria-hidden={true} />} onClick={() => exportToConfluence(true)}>
              View HTML
            </CcButton>
            <CcButton variant="ghost" icon={<Download size={16} aria-hidden={true} />} onClick={() => exportToConfluence(false)}>
              Export HTML
            </CcButton>
          </div>
        ) : null}
      >
        Review the generated target architecture and technical design.
      </StageHeader>

      <div
        id="design-report"
        data-stage-output={design ? 'solutionDesign' : undefined}
        className="mb-12 overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
      >
        <div className="flex items-center justify-between border-b border-cc-line bg-cc-surface-muted px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <LayoutTemplate size={20} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
            <div className="min-w-0">
              <h2 className="m-0 truncate cc-text-h2 text-cc-ink">Architecture &amp; Design Specification</h2>
              <p className="m-0 truncate cc-text-cell text-cc-ink-muted">Project: {project?.name || 'Loading...'}</p>
            </div>
          </div>
        </div>

        <div className="bg-cc-surface p-6 md:p-12">
          {design ? (
            <>
              {designErrorStrip && <div className="mb-8">{designErrorStrip}</div>}
              {renderDesignContent()}
            </>
          ) : !modelAvailability.enabled('design') ? (
            /* Roadmap 1.2 / V25-A12 — a button that can only fail is worse than
               no button. The stage says which of the two reasons applies and
               what would change it, instead of offering a generation that the
               server will refuse. */
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
          ) : (
            <div className="space-y-4">
              {designErrorStrip}
              <CcEmptyState
                illustration={<FileText size={32} aria-hidden={true} className="text-cc-ink-muted" />}
                title="No Solution Design Found"
                action={
                  <CcButton variant="primary" density="cozy" icon={<RefreshCw size={16} aria-hidden={true} />} busy={loading} onClick={regenerate}>
                    {designError ? 'Retry Generation' : 'Generate Solution Design'}
                  </CcButton>
                }
              >
                The target architecture design is empty or was not generated automatically. Generate it from the signed analysis.
              </CcEmptyState>
            </div>
          )}
        </div>
      </div>

      <NavigationButtons 
        backPath={`/project/${projectId}/analyze`}
        backLabel="Back to Analysis"
        proceedPath={signOffCurrent ? `/project/${projectId}/transformation` : undefined}
        proceedLabel={
          signOffCurrent
            ? 'Continue to Transformation'
            : project?.approvedByArchitect
              ? 'Regenerate and re-confirm to proceed'
              : 'Confirm architecture to proceed'
        }
      />





    </div>
  );
}
