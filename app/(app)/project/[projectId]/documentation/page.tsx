'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { doc, runTransaction } from 'firebase/firestore';
import { checkProjectWrite, projectTooLargeMessage } from '@/lib/firestore-doc-size';
import { getAuth, getDb } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import StageFooter from '@/components/StageFooter';
import { BookOpenText, Download, FileCode2, FileText, Printer, RefreshCw, Rocket, Workflow } from 'lucide-react';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import {
  processDocumentationToMarkdown,
  readStoredDocumentation,
  type ProcessDocumentation,
} from '@/lib/process-documentation';
import { buildEngineConfluenceHtml, confluenceFileName } from '@/lib/documentation-export';
import CcStateText from '@/components/cc/StateText';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import HandbookStage from '@/components/documentation/HandbookStage';
import { DirectWriteLevels } from '@/components/documentation/BusinessGlance';
import BusinessLayer from '@/components/documentation/BusinessLayer';
import { StatementProposalPanel } from '@/components/documentation/StatementProposal';
import ExportMenu, { type ExportMenuItem } from '@/components/requirements/ExportMenu';
import { useBusinessGlance } from '@/hooks/useBusinessGlance';
import { businessCallouts, type ProcessStepRef } from '@/lib/business-summary';
import { docLegacyFileName, docProposalsCostLine, raciEditedLine, replaceDocBody, replaceSopBody, wt } from '@/lib/workspace-messages';
import { layerWithRaciEdit, raciEditApplies, raciFileTable, type RaciEditRecord } from '@/lib/raci-edit';
import { formatTextDate } from '@/lib/format';
import type { RaciDraft } from '@/components/documentation/RaciEditor';
import { useProcessHandbook } from '@/hooks/useProcessHandbook';
import { useProcessDocument } from '@/hooks/useProcessDocument';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import ProcessDocumentView, { DocumentChapterBar, ProcessDocumentAppendix } from '@/components/documentation/ProcessDocumentView';
import { processDocumentFileName } from '@/lib/process-document';
import { processDocumentBlocks } from '@/lib/process-document-outline';
import {
  BUSINESS_LAYER_CEILING_MS,
  businessLayerInFlight,
  claimBusinessLayerLease,
  releaseBusinessLayerLease,
  trackBusinessLayer,
} from '@/lib/documentation-generation-lease';
import { modelAbsenceReason } from '@/lib/model-stages';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { saveAs } from '@/lib/fileSaver';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import { workflowSteps, generationBlockers, previousBasis, DOCUMENTATION_PACKAGE_FILES } from '@/lib/workflow-steps';
import StaleNotice from '@/components/StaleNotice';
import { sha256Hex } from '@/lib/artefact-digest';
import { useProcessMap } from '@/hooks/useProcessMap';
import { useProcessMapAddress } from '@/hooks/useProcessMapAddress';
import { useStatementProposal } from '@/hooks/useStatementProposal';
import { buildNavigation, levelOf, parseMapAddress, resolveMapAddress } from '@/lib/process-navigation';
import {
  ensureProcessBaseline,
  fetchLatestRevision,
  revisionOutcomeSentence,
  saveProcessRevision,
} from '@/lib/process-revisions-client';
import { newerBase, revisionLine } from '@/lib/process-revisions';
import type {
  OpenedRevision,
  SaveProcessModelInput,
  SaveProcessModelResult,
} from '@/components/process-map/BpmnEditor';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { checkBusinessDocShape, STORED_BLUEPRINT_REJECTED } from './blueprint-schema';
import CcButton from '@/components/cc/Button';
import CcEmptyState from '@/components/cc/EmptyState';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import ReplaceStoredBox from '@/components/ReplaceStoredBox';
import { t } from '@/lib/cc-messages';

/** A section of this stage — the card of DESIGN.md §1.4. */
const SECTION = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 md:p-6 shadow-cc';
/** A section heading (§1.2). */
const H2 = 'cc-text-h2 text-cc-ink';

/**
 * Roadmap 3.0.7 ("Documentation lean", item 4) — a bug fix. This stage used to
 * merge its two Markdown files into `generatedCode`, and `hasGeneratedPackage`
 * (`lib/workflow-steps.ts`) counts any file of a package: opening
 * Documentation before Transformation marked code as present. It writes no
 * package any more — Delivery adds both files from `documentation` and
 * `businessDocumentation` — and a write of this stage takes the files an
 * earlier build put there back out (`{}` when there are none, so nothing else
 * of the package is ever touched).
 */
const packageCleanup = (generatedCode: unknown): { generatedCode?: string } => {
  if (typeof generatedCode !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(generatedCode);
    if (!Array.isArray(parsed)) return {};
    const kept = parsed.filter((f) => !(f && typeof f === 'object' && DOCUMENTATION_PACKAGE_FILES.includes(String((f as { path?: unknown }).path))));
    return kept.length === parsed.length ? {} : { generatedCode: JSON.stringify(kept) };
  } catch {
    // A flat source from before packages: nothing of this stage is in it.
    return {};
  }
};

/**
 * Roadmap 2.5 — the reading BPMN view of the process the engine reconstructed.
 *
 * Client only, and loaded on demand: it pulls bpmn-js and the ABAP reader, and
 * neither belongs in the bundle of a reader who never opens this stage. It
 * draws the same file the "Export BPMN" button downloads, so what is on the
 * screen and what leaves the building are the same process.
 */
const ProcessMap = dynamic(() => import('@/components/process-map/ProcessMap'), { ssr: false });

/**
 * Roadmap 3.2 — the history of the process and the comparison of two revisions.
 *
 * Client only for the same reason as the map above: it reads BPMN to compare
 * two files, and a reader who never opens this stage should not pay for that.
 * It fetches and draws on its own; all it is given is the project, a key that
 * changes after every save, and permission to reconstruct revision 1.
 */
const RevisionCompare = dynamic(
  () => import('@/components/process-revisions/RevisionCompare'),
  { ssr: false },
);

// Robust JSON Extractor
const extractJSON = (text: string) => {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = match ? match[1] : text;
    const cleaned = jsonString.trim().replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON parsing failed", e);
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      }
    } catch (innerE) {
      console.error("Aggressive JSON parsing failed", innerE);
    }
    throw new Error("Failed to parse AI response into structured data. Please try regenerating.");
  }
};

/**
 * Roadmap 2.6 replaced the BPMN generator that stood here.
 *
 * It built the file out of `l3_flow` — a flow a language model had written from
 * a 1.000-character slice of the source — and hung the model's SOP narrative and
 * its RACI roles on every task as `bpmn:documentation`. Three things were wrong
 * with that, and none of them was the XML:
 *
 * - the process in the file was not the process in the code. Nothing in it
 *   carried a line of ABAP, so nothing in it could be checked;
 * - the lanes were the model's invented roles ("Finance Analyst", "CISO"),
 *   which `docs/ROADMAP.md` §6 forbids: a lane is a reconstruction, never an
 *   organisational statement, and 2.4 proposes lanes with a provenance chip;
 * - RACI and SOP text rode along inside a process file as if they were facts
 *   about the process. They are model proposals, they are shown as such on the
 *   Business tab and in the Confluence export, and they have no place in an
 *   exchange format where the chip that qualifies them does not travel.
 *
 * It also interpolated every name straight into the XML (CR-21): one ampersand
 * in a project name and no parser would open the file.
 *
 * What ships instead is `lib/bpmn/` — the skeleton of the signed run, escaped,
 * laid out and traceable to the line. See `downloadBPMN` below.
 */

export default function DocumentationPage() {
  const { projectId } = useParams();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed load is said, not shown as an empty stage (131d46bc4ffd).
  const [loadError, setLoadError] = useState('');

  const [documentation, setDocumentation] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  /** True when `docError` is a refused model answer rather than a blocked start. */
  const [docRejected, setDocRejected] = useState(false);

  // Stage 2 Business Documentation States
  const [businessDocumentation, setBusinessDocumentation] = useState('');
  /**
   * Which replacement is being asked about (ADR-083, decision-input audit
   * item 3): "Read again from the code" with an SOP and RACI on record, or
   * "Regenerate SOP and RACI". Nothing is replaced before "Replace".
   */
  const [replaceAsk, setReplaceAsk] = useState<'doc' | 'sop' | null>(null);
  const [isGeneratingBusinessDoc, setIsGeneratingBusinessDoc] = useState(false);
  const [businessDocError, setBusinessDocError] = useState('');

  // Fetch Project Data
  useEffect(() => {
    let isMounted = true;
    const fetchProject = async () => {
      if (!projectId) return;
      const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
      try {
        const hydratedData = await loadProjectAndHydrate(idStr);
        if (!enforceActiveRun(hydratedData, idStr)) return;
        if (hydratedData && isMounted) {
          setProject(hydratedData);
          const data = hydratedData;
          if (data.documentation) {
            setDocumentation(data.documentation);
          }
          if (data.businessDocumentation) {
            setBusinessDocumentation(data.businessDocumentation);
          }
        }
      } catch (err) {
        console.error("Error fetching project:", err);
        if (isMounted) setLoadError('The project could not be loaded. Check your connection and try again.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProject();
    return () => { isMounted = false; };
  }, [projectId]);

  /**
   * What is stored, sorted into three cases — roadmap 3.0.5, retired in 3.0.7.
   *
   * - `engine`: the document the engine wrote (`lib/process-documentation.ts`).
   * - `legacy`: a blueprint a language model wrote before 3.0.5. Never
   *   migrated, never deleted — and since 3.0.7 ("Documentation lean") no
   *   longer drawn: one strip says what it is, offers it for download exactly
   *   as it was stored, and offers to replace it with the code reading.
   * - `rejected`: a document in the engine's form this stage cannot read. The
   *   reader is told so, and reading the code again replaces it.
   */
  const blueprint = useMemo<{ engine: ProcessDocumentation | null; legacy: string | null; rejected: boolean }>(() => {
    const stored = readStoredDocumentation(documentation);
    if (stored.kind === 'none') return { engine: null, legacy: null, rejected: false };
    if (stored.kind === 'engine') return { engine: stored.doc, legacy: null, rejected: false };
    if (stored.kind === 'engine-invalid') {
      console.error('Stored documentation rejected:', stored.problems);
      return { engine: null, legacy: null, rejected: true };
    }
    return { engine: null, legacy: stored.raw, rejected: false };
  }, [documentation]);
  const engineDoc = blueprint.engine;
  /** The legacy blueprint as it was stored, when that is what is stored. */
  const legacyBlueprint = blueprint.legacy;
  const hasDocument = Boolean(engineDoc);
  const storedBlueprintRejected = blueprint.rejected;

  const parsedBusinessDoc = useMemo(() => {
    if (!businessDocumentation) return null;
    try {
      const parsed = extractJSON(businessDocumentation);
      // A layer an earlier build stored with a non-list where the tab maps is
      // not drawn; the offer to generate it replaces it (69cb77382430).
      const shape = checkBusinessDocShape(parsed);
      if (!shape.ok) {
        console.error('Stored business documentation rejected:', shape.problems);
        return null;
      }
      return parsed;
    } catch (e) {
      console.error("Parsed business documentation is invalid:", e);
      return null;
    }
  }, [businessDocumentation]);

  /**
   * Owner 03.10.2026 — the business layer is written when the stage opens,
   * as Design writes its design: once, by the owner's browser, only while
   * nothing current is on record. These hold one generation per tab and
   * page (`lib/documentation-generation-lease.ts`), the moment it started for
   * the "seconds waited" line, and the documentation each automatic start was
   * made for, so a failed start is never repeated by itself.
   */
  const tabId = useRef<string | null>(null);
  const [businessStartedAt, setBusinessStartedAt] = useState<number | null>(null);
  const [businessElapsed, setBusinessElapsed] = useState(0);
  const [otherTabWriting, setOtherTabWriting] = useState(false);
  const autoBusinessFor = useRef<string | null>(null);
  /**
   * The stored layer an owner asked to replace ("Regenerate SOP and RACI",
   * owner 04.10.2026: "unrealistically many roles"). Set only by that click;
   * the transaction replaces exactly this layer and keeps any other one.
   */
  const replaceLayer = useRef<string | null>(null);

  async function runBusinessGeneration(): Promise<void> {
    const replacing = replaceLayer.current;
    replaceLayer.current = null;
    if (!project || !projectId) return;
    // Never a silent no-op (owner 03.10.2026): the reason is said where the button is.
    // Written from the process description only: a legacy blueprint is not read any more.
    if (!engineDoc) {
      setBusinessDocError(wt('doc.businessNeedsDocumentation'));
      return;
    }
    const blocked = generationBlockers(project, 'documentation');
    if (blocked.length > 0) {
      setBusinessDocError(blocked.join(' '));
      return;
    }

    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;

    setIsGeneratingBusinessDoc(true);
    setBusinessDocError('');
    setBusinessStartedAt(Date.now());
    setBusinessElapsed(0);
    // The ceiling: past it the page stops waiting, saves nothing and offers
    // "Try again". The call itself may still finish on the server.
    const ceiling = new AbortController();
    const timer = setTimeout(() => ceiling.abort(), BUSINESS_LAYER_CEILING_MS);
    
    // Roadmap 3.0.5: the engine document goes in as its Markdown — the process
    // element by element with its BPMN ids, and the business statements of the
    // whole program. `stepId` below is then the element id the map and the
    // `.bpmn` export use.
    const blueprintContext = processDocumentationToMarkdown(engineDoc);
    const stepsDescription = 'Process Documentation read from the ABAP code (BPMN elements with their ids and line ranges, and the business statements of the whole program). Use the element ids as stepId';

    try {
      const prompt = `Act as an Enterprise Business Process, SOP & Compliance expert writing for a BUSINESS audience — process owners, master-data stewards, compliance and internal audit. This is the BUSINESS layer of the documentation.
Based on the following ${stepsDescription}, generate the corresponding Business SOP & RACI Matrix layer.

CRITICAL — PURE BUSINESS LANGUAGE (no IT/technical content):
- Write exclusively in business and process terms. Describe WHAT happens for the business and WHO is responsible — never HOW it is implemented technically.
- Do NOT mention any technical or IT concept. Forbidden terms: source code, API/OData/CDS/CAP/RAP/SDK, database/table/Z-table, JSON/schema/payload, HANA, deployment/pipeline, HTTP, latency/milliseconds, unit test, retry/rollback. All technical detail already lives in the separate Technical Blueprint and must NOT be repeated here.
- RACI roles: a SMALL, REALISTIC set for this one process — typically 4 to 6 roles, never more than 7 in the whole matrix. Use short, generic role names (e.g. Requester, Buyer, Approver, Purchasing Lead, Process Owner, Finance), not the job titles of a large corporation, and REUSE the same roles across the steps. For a step the program runs on its own, name the business role that is responsible for its outcome.
- Every step has EXACTLY ONE Accountable ("a") and at least one Responsible ("r"). Consulted ("c") and Informed ("i") only where they matter; leave them empty otherwise. If you cannot tell who is accountable for a step, leave "a" empty rather than guessing.
- The roles are a proposal the business will confirm; do not invent organisational detail the process does not show. Avoid IT roles (Developer, Architect, System).
- Exceptions must be BUSINESS actions (escalation, dual approval, manual review) — not technical remediation.
- Do NOT propose KPI targets, control objectives, audit controls or verification methods: the process does not show them, and the controls of this process are read from the code elsewhere.

Return ONLY a JSON object wrapped in a markdown code block (\`\`\`json ... \`\`\`).
DO NOT include any text before or after the JSON.

Process Blueprint Context:
${blueprintContext}

Structure the JSON exactly like this:
{
  "raci_matrix": [
    {
      "stepId": "Task1",
      "r": "Responsible role who performs the step (e.g. Buyer)",
      "a": "Exactly one Accountable role (e.g. Purchasing Lead)",
      "c": "Consulted role, only where it matters (e.g. Approver), else empty",
      "i": "Informed role, only where it matters (e.g. Requester), else empty"
    }
  ],
  "sop_details": [
    {
      "stepId": "Task1",
      "narrative": "Plain-business, step-by-step description of how the business handles this process step and the outcome it produces (3-4 sentences). No technical detail.",
      "businessException": "Business fallback if the step cannot be completed (e.g. escalate to the Process Owner, route for manual review, apply dual approval)."
    }
  ]
}`;

      console.log('Generating business process compliance for project:', project.name);
      let responseText: string;
      try {
        responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, false, 'documentation', ceiling.signal);
      } catch (err) {
        if (ceiling.signal.aborted) {
          throw new Error(`The model did not answer within ${Math.round(BUSINESS_LAYER_CEILING_MS / 1000)} seconds, so nothing was saved.`);
        }
        throw err;
      }
      
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }
      
      // Each list is read with `.map`: truthy is not enough (69cb77382430).
      const shape = checkBusinessDocShape(extractJSON(responseText));
      if (!shape.ok) {
        throw new Error(`Invalid business documentation schema returned by AI: ${shape.problems.join(' ')}`);
      }

      // One transaction, for the same reason as above (ade8ec0b8903). The
      // layer was written from this run's documentation; if another tab
      // re-analysed or rewrote the documentation meanwhile, it describes
      // something else and is not stored (0f6472d80f3f).
      const projectDoc = doc(getDb(), 'projects', idStr);
      const writtenFromRun = project.activeRunId;
      const writtenFromDocumentation = documentation;
      const updatedCode = await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(projectDoc);
        const current = snap.data() ?? {};
        if (current.activeRunId !== writtenFromRun || current.documentation !== writtenFromDocumentation) {
          throw new Error('The analysis or the documentation of this project changed while the business layer was being written, so nothing was saved. Reload the stage and generate it again.');
        }
        // Another browser stored a layer for this documentation meanwhile:
        // that one is kept, and shown, instead of being written over.
        // A regeneration replaces the layer it was asked for, and only that one.
        if (typeof current.businessDocumentation === 'string' && current.businessDocumentation.trim()
          && (replacing === null || current.businessDocumentation !== replacing)) {
          return { kept: current.businessDocumentation as string, cleanup: {} };
        }
        // Not into the package (roadmap 3.0.7, item 4): Delivery writes the
        // layer's file from `businessDocumentation` itself. A file an earlier
        // build merged into the package is taken out with this write.
        const cleanup = packageCleanup(current.generatedCode);
        // Codex architecture-02: refused by name before the commit when the
        // project would outgrow its 1 MiB document.
        const size = checkProjectWrite(current, { businessDocumentation: responseText, ...cleanup }, projectDoc.path, 'update');
        if (!size.ok) throw new Error(projectTooLargeMessage(size, 'this business documentation'));
        tx.update(projectDoc, { businessDocumentation: responseText, ...cleanup });
        return { kept: null, cleanup };
      });

      // Shown only once it is stored (52487ee4cacc): a layer the transaction
      // refused is not this project's business documentation.
      const storedLayer = updatedCode.kept ?? responseText;
      setBusinessDocumentation(storedLayer);
      setProject(prev => prev ? { ...prev, businessDocumentation: storedLayer, ...updatedCode.cleanup } : null);

    } catch (err: unknown) {
      console.error('Business documentation generation error:', err);
      setBusinessDocError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
      setIsGeneratingBusinessDoc(false);
      setBusinessStartedAt(null);
    }
  }

  const generateBusinessDocumentation = useCallback(async () => {
    if (!project || !projectId) return;
    const leaseId = Array.isArray(projectId) ? projectId[0] : projectId;
    // No double call: a generation of this project already running in this
    // page, or a live lease of another tab, is waited for, not repeated.
    if (businessLayerInFlight(leaseId)) return;
    if (!tabId.current) tabId.current = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const tab = tabId.current;
    if (!claimBusinessLayerLease(leaseId, tab)) {
      setOtherTabWriting(true);
      return;
    }
    setOtherTabWriting(false);
    const run = runBusinessGeneration();
    await trackBusinessLayer(leaseId, run).finally(() => releaseBusinessLayerLease(leaseId, tab));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project, documentation, engineDoc]);


  /**
   * Roadmap 2.6 — the source the active run signed, and nothing else.
   *
   * The run does not store the source; it stores the SHA-256 of it, inside the
   * signature. So the export is offered only while the source on the project
   * still hashes to the digest the run signed — the same comparison
   * `lib/workflow-steps.ts` makes for staleness. A file drawn from source the
   * run never saw would carry line anchors that point at other lines, which is
   * worse than no export.
   */
  const signedSource = useMemo(() => {
    const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
    if (!project?.activeRunId || !source.trim()) return null;
    const signed = (project as { inputFingerprint?: { sha256?: string; fileName?: string } }).inputFingerprint
      ?? project.auditMetadata?.inputFingerprint;
    if (!signed?.sha256 || sha256Hex(source) !== signed.sha256) return null;
    return { source, fileName: signed.fileName || 'source.abap' };
  }, [project]);

  /**
   * Roadmap 2.5 — the reading map, built from exactly the source the export
   * below writes out. One reading of the code, two ways out of the building.
   */
  const processMap = useProcessMap(
    (Array.isArray(projectId) ? projectId[0] : projectId) ?? null,
    signedSource,
    project?.name || '',
    modelAvailability,
  );

  /**
   * Roadmap 17.10 — the model's business sentences over the engine's. Read on
   * opening, asked for only by the button in the documentation; the owner
   * asks, an invited reader reads.
   */
  /** Owner decision 01.10.2026 — the handbook beside the map, read from the same source. */
  const handbook = useProcessHandbook(signedSource?.source ?? null, processMap.model);
  const isPhone = useBreakpointS();

  /**
   * The clean-core levels of the SAP data the code changes, beside the
   * description's summary (ADR-077, amended twice): the direct-write callouts
   * of `lib/business-summary.ts`, read from the handbook and the levels of the
   * tables the code writes. Nothing is written and no model is called.
   */
  const glanceInputs = useBusinessGlance(
    signedSource?.source ?? null,
    handbook.handbook,
    project ? catalogLookupTargetOf(project) : null,
  );
  const callouts = useMemo(
    () => (handbook.handbook ? businessCallouts(handbook.handbook, glanceInputs.levels) : []),
    [handbook.handbook, glanceInputs],
  );

  /**
   * The steps of the process the business layer is keyed to — the engine
   * document's elements, named as the map names them and with the map's
   * provenance (a step a person confirmed reads *Confirmed*).
   */
  const processSteps: ProcessStepRef[] = engineDoc
    ? engineDoc.steps.map((step) => {
        const element = processMap.model?.elements.find((e) => e.id === step.id);
        return {
          id: step.id,
          name: element?.label ?? step.businessName ?? step.technicalName,
          technicalName: step.technicalName,
          anchor: step.anchor,
          provenance: element?.status ?? step.provenance,
        };
      })
    : [];

  const projectIdStr = (Array.isArray(projectId) ? projectId[0] : projectId) ?? null;
  const statementProposal = useStatementProposal(
    projectIdStr,
    signedSource?.source ?? null,
    modelAvailability,
  );
  const isOwner = !!project && getAuth().currentUser?.uid === project.userId;

  /**
   * The project's one list of open questions (ADR-081) — the open questions section of the
   * description and of every export (roadmap 3.0.7, item 6). Read here, the
   * same hook every view reads; answered in the workspace.
   */
  const openQuestionsOfProject = useOpenQuestions(project, projectIdStr ?? '');
  const questionsHref = projectIdStr ? `/project/${encodeURIComponent(projectIdStr)}?view=it#not-determined` : null;

  /**
   * The owner's RACI (owner request 10.10.2026, ADR-084 amended). Read from
   * the server for everyone with access, written only through
   * `POST /api/projects/{id}/raci` (ADR-083: never from the browser). It is
   * bound to the proposal on record by its digest: a regenerated proposal, or
   * one removed with the description, leaves the edit behind — the box that
   * asks before replacing says so.
   */
  const layerSha = useMemo(
    () => (businessDocumentation.trim() ? sha256Hex(businessDocumentation) : null),
    [businessDocumentation],
  );
  const [raciRecord, setRaciRecord] = useState<RaciEditRecord | null>(null);
  useEffect(() => {
    if (!projectIdStr || !layerSha) return;
    let cancelled = false;
    void import('@/lib/raci-edit-client')
      .then((client) => client.fetchRaciEdit(projectIdStr))
      .then((record) => {
        if (!cancelled) setRaciRecord(record);
      });
    return () => {
      cancelled = true;
    };
  }, [projectIdStr, layerSha]);
  const raciEdit = raciEditApplies(raciRecord, layerSha) ? raciRecord : null;
  /** The layer every rendering and export draws: the model's SOP, and the owner's RACI where one is saved. */
  const businessLayer = useMemo(
    () => (parsedBusinessDoc && raciEdit ? layerWithRaciEdit(parsedBusinessDoc, raciEdit) : parsedBusinessDoc),
    [parsedBusinessDoc, raciEdit],
  );
  const saveRaci = useCallback(async (draft: RaciDraft): Promise<string | null> => {
    if (!projectIdStr || !layerSha) return 'There is no SOP and RACI proposal on record to edit.';
    const { saveRaciEdit } = await import('@/lib/raci-edit-client');
    const outcome = await saveRaciEdit(projectIdStr, {
      baseRevision: raciEdit?.revision ?? 0,
      layerSha256: layerSha,
      roles: draft.roles,
      steps: draft.steps,
    });
    if (!outcome.ok) return outcome.message;
    setRaciRecord(outcome.record);
    return null;
  }, [projectIdStr, layerSha, raciEdit]);

  /**
   * Owner 03.10.2026 — the process description, built as soon as the stage
   * opens: engine only, no model call, nothing written. The run's narrative
   * and the stored statement proposals are read where they exist and shown as
   * proposals (`lib/process-document-build.ts`).
   */
  const proposalInputs = useMemo(
    () => (statementProposal.view?.state === 'proposed'
      ? statementProposal.view.statements.map((st) => ({
          text: st.text,
          anchors: st.anchors.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })),
          contradicts: st.contradiction !== null,
        }))
      : null),
    [statementProposal.view],
  );
  const processDocument = useProcessDocument(
    signedSource?.source ?? null,
    processMap.model,
    typeof project?.analysis === 'string' && project.analysis.trim() ? project.analysis : null,
    proposalInputs,
  );

  /**
   * Roadmap 3.0.5, Weg C — the documentation is read out of the code.
   *
   * Until 3.0.5 this asked a language model for an L1–L4 blueprint from the
   * first 1,000 characters of the generated code, the design and the analysis;
   * the domain, the owner, the roles, the KPIs and the durations it returned
   * were invented, and a rule after character 1,000 could not reach it (L-04,
   * QA24-A10). Now it is `buildProcessDocumentation` over the whole source the
   * active run signed and the map this page already drew from it — no model, no
   * key and no network beyond the one write.
   *
   * Written when the owner opens the stage (owner 03.10.2026, below), and on
   * "Read again from the code"; a stored legacy blueprint is only replaced
   * when the owner asks for it.
   */
  const generateDocumentation = useCallback(async () => {
    if (!project || !projectId) return;
    // Not from code or a design written for a previous source (E01-F01-US02):
    // the document would describe something other than the code under review.
    const blocked = generationBlockers(project, 'documentation');
    if (blocked.length > 0) {
      setDocError(blocked.join(' '));
      setDocRejected(false);
      return;
    }
    if (!signedSource) {
      setDocError('The documentation is read from the source the active run signed, and the source on this project no longer matches it. Re-run the analysis in stage 1 first.');
      setDocRejected(false);
      return;
    }
    if (!processMap.model) {
      setDocError(processMap.status === 'failed' && processMap.reason
        ? processMap.reason
        : 'The process is still being read out of the source. Try again in a moment.');
      setDocRejected(false);
      return;
    }

    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;

    setIsGeneratingDoc(true);
    setDocError('');
    setDocRejected(false);

    try {
      const { buildProcessDocumentation } = await import('@/lib/process-documentation-build');
      const built = buildProcessDocumentation({ source: signedSource.source, map: processMap.model });
      const stored = JSON.stringify(built);
      // The reader of the stored value is the gate: what is written must read
      // back as an engine document, or nothing is written.
      if (readStoredDocumentation(stored).kind !== 'engine') {
        setDocRejected(true);
        throw new Error('The documentation could not be put together from this source, so nothing was saved.');
      }

      // Both generations rewrite the same `generatedCode` field. Reading it
      // back first was not enough — two tabs can both read before either
      // writes, and the later write still drops the earlier file (QA reviews of
      // 33471220d6e9 and 146ac2e1a724: 4db1e81408f4, ade8ec0b8903). The
      // read and the write are one transaction; disabling the buttons is a
      // courtesy on top, not the mechanism.
      const projectDoc = doc(getDb(), 'projects', idStr);
      const builtFromRun = project.activeRunId;
      const updatedCode = await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(projectDoc);
        // The document was built from the source of the run this page loaded.
        // A second tab can re-analyse in between; then it describes an earlier
        // run and is not written as the current one (QA review of 4b4586aff273).
        const current = snap.data() ?? {};
        if (current.activeRunId !== builtFromRun || current.legacyCode !== signedSource.source) {
          throw new Error('The analysis of this project changed while the documentation was being put together, so nothing was saved. Reload the stage and generate it again.');
        }
        // The business layer (RACI, SOP) was written from the documentation
        // this replaces, keyed to its step ids. Kept, it would be shown and
        // exported as current beside a document whose elements it does not
        // describe (QA full review 96b39ec78c97) — so it goes with the
        // document it was built on. Nothing goes into the package (roadmap
        // 3.0.7, item 4); what an earlier build put there comes out.
        const cleanup = packageCleanup(current.generatedCode);
        // Codex architecture-02, as for the business layer above.
        const size = checkProjectWrite(current, { documentation: stored, status: 'documented', businessDocumentation: '', ...cleanup }, projectDoc.path, 'update');
        if (!size.ok) throw new Error(projectTooLargeMessage(size, 'this documentation'));
        tx.update(projectDoc, { documentation: stored, status: 'documented', businessDocumentation: '', ...cleanup });
        return cleanup;
      });

      // Shown only once it is stored: a document the transaction refused is
      // not this project's documentation.
      setDocumentation(stored);
      setBusinessDocumentation('');
      setProject(prev => prev ? { ...prev, documentation: stored, status: 'documented', businessDocumentation: '', ...updatedCode } : null);
    } catch (err: unknown) {
      console.error('Documentation generation error:', err);
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingDoc(false);
    }
  }, [projectId, project, signedSource, processMap.model, processMap.status, processMap.reason]);

  /**
   * Generate on open (owner 03.10.2026, analogous to Design).
   *
   * 1. The engine document is stored as soon as the owner opens the stage of a
   *    project whose signed source has none — or has one read from another
   *    source. Engine only: no model, no cost, no click. A stored legacy
   *    blueprint is not replaced by itself (the reader decides that), and a
   *    stale state nothing would change is left to the button.
   * 2. The business layer follows when the model is available for this stage,
   *    the stored document is current and no layer is on record — once per
   *    documentation, never on a reader's visit, never twice at once
   *    (`lib/documentation-generation-lease.ts`), and never again by itself
   *    after a failure: "Try again" is the reader's.
   */
  const autoDocFor = useRef<string | null>(null);
  const signedDigest = useMemo(() => (signedSource ? sha256Hex(signedSource.source) : null), [signedSource]);
  useEffect(() => {
    if (!project || !isOwner || !signedSource || !signedDigest || !processMap.model || isGeneratingDoc) return;
    const stored = readStoredDocumentation(documentation);
    const needs = stored.kind === 'none' || (stored.kind === 'engine' && stored.doc.sourceSha256 !== signedDigest);
    if (!needs || generationBlockers(project, 'documentation').length > 0) return;
    const key = `${project.activeRunId ?? ''}|${signedDigest}`;
    if (autoDocFor.current === key) return;
    autoDocFor.current = key;
    void generateDocumentation();
  }, [project, isOwner, signedSource, signedDigest, processMap.model, isGeneratingDoc, documentation, generateDocumentation]);

  const businessAutoReady = Boolean(
    project && isOwner && engineDoc && signedDigest && engineDoc.sourceSha256 === signedDigest
    && !businessDocumentation.trim() && !isGeneratingBusinessDoc && !isGeneratingDoc
    && modelAvailability.known && !modelAvailability.loading && modelAvailability.enabled('documentation')
    && generationBlockers(project, 'documentation').length === 0,
  );
  useEffect(() => {
    if (!businessAutoReady || !project) return;
    const key = `${project.activeRunId ?? ''}|${sha256Hex(documentation)}`;
    if (autoBusinessFor.current === key) return;
    autoBusinessFor.current = key;
    void generateBusinessDocumentation();
  }, [businessAutoReady, project, documentation, generateBusinessDocumentation]);

  // A generation this page started before it was mounted again (leaving the
  // stage and coming back): show it as running and pick up what it stored.
  useEffect(() => {
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    if (!idStr) return;
    const running = businessLayerInFlight(idStr);
    if (!running || isGeneratingBusinessDoc) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setIsGeneratingBusinessDoc(true);
      setBusinessStartedAt(Date.now());
      setBusinessElapsed(0);
    });
    running.finally(async () => {
      if (cancelled) return;
      try {
        const fresh = await loadProjectAndHydrate(idStr);
        if (!cancelled && fresh?.businessDocumentation) setBusinessDocumentation(fresh.businessDocumentation);
      } finally {
        if (!cancelled) {
          setIsGeneratingBusinessDoc(false);
          setBusinessStartedAt(null);
        }
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // The seconds waited, said while the model writes.
  useEffect(() => {
    if (businessStartedAt === null) return;
    const tick = setInterval(() => setBusinessElapsed(Math.round((Date.now() - businessStartedAt) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [businessStartedAt]);

  /**
   * Roadmap 2.9 — the open level and the selection live in the URL.
   *
   * `#map=<plane>&node=<element>`. A link opens exactly there, Back and Forward
   * do the ordinary thing, and the page is the owner of the address rather than
   * the map: the map takes `plane` and `selected` as controlled props and says
   * when they should change, which is the contract roadmap 3.1 inherits along
   * with everything else in `ProcessMapProps`.
   *
   * The address is resolved against the model before it is used. A shared link
   * outlives the source it was made on, and an element id from a previous
   * revision must open the top level rather than an empty one.
   */
  const address = useProcessMapAddress();
  const mapNav = useMemo(
    () => (processMap.model ? buildNavigation(processMap.model) : null),
    [processMap.model],
  );
  const resolved = useMemo(
    () => (mapNav
      ? resolveMapAddress(mapNav, { plane: address.plane, node: address.node })
      : { plane: null as string | null, node: null as string | null }),
    [mapNav, address.plane, address.node],
  );

  const { replace: replaceAddress, go: goToAddress } = address;

  // Written back without a history entry: normalising what arrived is not a
  // navigation, and Back must leave the page rather than undo a tidy-up.
  useEffect(() => {
    if (!mapNav) return;
    if (resolved.plane === address.plane && resolved.node === address.node) return;
    replaceAddress(resolved);
  }, [mapNav, resolved, address.plane, address.node, replaceAddress]);

  /**
   * Owner 04.10.2026 — the map stands below the process description now, so
   * a link that names a level or an element (`#map=…`) is taken to the map
   * once it is drawn. Read from the address the page was opened with, once;
   * a level opened later moves nothing.
   */
  const exploreRef = useRef<HTMLElement | null>(null);
  const openedOnMapLink = useRef<boolean | null>(null);
  useEffect(() => {
    if (openedOnMapLink.current !== null) return;
    const opened = parseMapAddress(window.location.hash);
    openedOnMapLink.current = opened.plane !== null || opened.node !== null;
  }, []);
  useEffect(() => {
    if (!openedOnMapLink.current || !processMap.model || !exploreRef.current) return;
    openedOnMapLink.current = false;
    exploreRef.current.scrollIntoView({ block: 'start' });
  }, [processMap.model, loading]);

  /**
   * A level the reader opens keeps the selection only when the selection is on
   * it. Without that, walking up with a crumb would be undone at once: the
   * address resolves an element before a level, so a selection left behind on
   * the level below would pull the view straight back down into it.
   */
  const openPlane = useCallback((next: string | null) => {
    goToAddress((current) => ({
      plane: next,
      node: current.node && mapNav && levelOf(mapNav, current.node) === next ? current.node : null,
    }));
  }, [goToAddress, mapNav]);

  /** Selecting an element is one move: its level and its selection, one entry. */
  const selectElement = useCallback((next: string | null) => {
    goToAddress((current) => ({
      plane: next && mapNav ? levelOf(mapNav, next) : current.plane,
      node: next,
    }));
  }, [goToAddress, mapNav]);

  /* ------------------------------------------------------------------ *
   * Roadmap 3.2 — the seam between the editor and the revisions.
   * ------------------------------------------------------------------ */

  /**
   * The revision this draft was opened from.
   *
   * A **ref**, not state, and for the same reason the draft in `ProcessMap` is
   * one: the editor is mounted inside a memoised tree and a state change here
   * re-renders it. The number is read and written by the callback below and by
   * nothing that paints.
   *
   * `null` means "not established yet" — the baseline call has not answered, or
   * the last save was refused. The next save establishes it again rather than
   * guessing at 1: guessing is exactly what `revision-moved` exists to catch.
   */
  const baseRevision = useRef<number | null>(null);
  /** Bumped after every answered save, so the history panel reloads. */
  const [revisionsKey, setRevisionsKey] = useState(0);
  /**
   * Why the opening baseline was refused, in words. Dropped, the history below
   * read "no revisions yet" for a project whose run could not be verified
   * (carried QA finding 5ab84bc9a713).
   */
  const [baselineRefusal, setBaselineRefusal] = useState('');

  /**
   * Reconstruct revision 1 when this project has none — on opening the stage.
   *
   * Safe on every open by contract (`ensureProcessBaseline`): a project that
   * already has revision 1 is not reconstructed again, and the answer is the
   * revision that is there. It runs only once the source is the one the run
   * signed, because that is the only state in which the server would write it.
   *
   * This is the **only** baseline call on this page. `RevisionCompare` can make
   * one of its own and is deliberately not asked to: two of them on every open
   * would be two writes against a per-account rate limit, for one revision that
   * either exists or is written once. The list is told to reload instead.
   */
  useEffect(() => {
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    // The number belongs to the project it was read from. This page survives a
    // move from one project to the next, so the ref is cleared before the new
    // baseline is asked for and not after it arrives: between the two there is a
    // moment where a save would otherwise carry the previous project's revision
    // number, and `saveProcessRevision` would read it as "your base is current".
    baseRevision.current = null;
    setBaselineRefusal('');
    if (!idStr || !signedSource) return;
    let cancelled = false;
    void ensureProcessBaseline(idStr).then((outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setBaselineRefusal(revisionOutcomeSentence(outcome));
        return;
      }
      // Forward only: a Save pressed before this answer landed has already
      // moved the base past revision 1, and setting it back would get the next
      // save refused as `revision-moved` (carried QA finding 85a623a08fcf).
      baseRevision.current = newerBase(baseRevision.current, outcome.record.revision);
      setRevisionsKey((token) => token + 1);
    });
    return () => { cancelled = true; };
  }, [projectId, signedSource]);

  /**
   * Keep the draft as a revision — what `BpmnEditor` calls when Save is pressed.
   *
   * The adapter, and it is deliberately thin. `xml` is the only part of the
   * editor's input that travels: the reconstruction (`baseXml`) and the file
   * name are the server's own, built from the source the signed run named, and
   * a browser that sent them would be sending the one thing the store refuses
   * to take from a browser.
   *
   * Every refusal becomes a sentence through `revisionOutcomeSentence` — never
   * the raw `code`, which is a word for this file and not for a reader — and
   * `created: false` is reported as an outcome, not as a failure: saving bytes
   * that are already the newest revision is supposed to write nothing.
   */
  const saveProcessModel = useCallback(async ({ xml }: SaveProcessModelInput): Promise<SaveProcessModelResult> => {
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    if (!idStr) {
      return { ok: false, message: 'This project could not be identified, so nothing was saved.' };
    }

    // The baseline first, when it is not established: a save into an empty
    // history has no revision to be based on, and the server reconstructs
    // revision 1 before it accepts an edit anyway.
    if (baseRevision.current === null) {
      const baseline = await ensureProcessBaseline(idStr);
      if (!baseline.ok) {
        setRevisionsKey((token) => token + 1);
        return { ok: false, message: revisionOutcomeSentence(baseline) };
      }
      baseRevision.current = baseline.record.revision;
    }

    const outcome = await saveProcessRevision(idStr, xml, baseRevision.current);
    setRevisionsKey((token) => token + 1);

    if (outcome.ok) {
      baseRevision.current = outcome.record.revision;
      return {
        ok: true,
        message: revisionOutcomeSentence(outcome),
        revisionId: String(outcome.record.revision),
      };
    }

    // On `revision-moved` the base is left exactly where it was. Moving it to
    // the server's `latest` would make the next press of Save write this draft
    // over a revision nobody here has seen, and clearing it would make the next
    // press ask for the baseline again and be refused for the same reason with
    // one more request. The reader is told which revision to open, and the
    // history below has just reloaded so that revision is on the screen.
    return { ok: false, message: revisionOutcomeSentence(outcome) };
  }, [projectId]);

  /**
   * The newest revision, whichever screen saved it — the workspace or this
   * stage — and from now on the base the next save is written against. Asked
   * by the editor when it opens; the editor offers it, it does not force it.
   */
  const openLatestRevision = useCallback(async (): Promise<OpenedRevision | null> => {
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    if (!idStr) return null;
    const record = await fetchLatestRevision(idStr);
    if (!record) return null;
    baseRevision.current = newerBase(baseRevision.current, record.revision);
    return { revision: record.revision, xml: record.xml, line: revisionLine(record), origin: record.origin };
  }, [projectId]);

  const downloadBPMN = async () => {
    if (!signedSource) return;
    // Loaded on the click: the reader of this stage pays for the ABAP reader
    // only when they ask for the file.
    const { buildBpmnExportFromSource, bpmnFileName, READING_WRAP } = await import('@/lib/bpmn/export');
    const { xml } = buildBpmnExportFromSource(signedSource.source, {
      processName: project?.name || signedSource.fileName,
      sourceFileName: signedSource.fileName,
      names: 'plain',
      wrap: READING_WRAP,
    });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    saveAs(blob, bpmnFileName(`${project?.name || 'Project'}_Process`));
  };

  /**
   * The phases of the workflow contract — the tools bar, and whether the
   * documentation is stale.
   */
  const phases = workflowSteps(project);
  /**
   * Owner decision 30.09.2026 (QA c8ae21453b3b): a stale documentation stays
   * exportable, but neither the menu nor the file hides that it is stale.
   * The state is the workflow contract's (`lib/workflow-steps.ts`), the same
   * one the stepper and the stale notice above read.
   */
  const documentationStale = phases.find((p) => p.key === 'documentation')?.state === 'stale';

  /** The Confluence page of the process description (`lib/documentation-export.ts`). */
  const downloadConfluenceHTML = () => {
    if (!processDocument.document) return;
    const blob = buildEngineConfluenceHtml(processDocument.document, businessLayer, {
      stale: documentationStale,
      processSteps,
      projectName: project?.name,
      openQuestions: openQuestionsOfProject,
      raciEdit,
    });
    saveAs(blob, confluenceFileName(project?.name));
  };

  /** The process description as Markdown or Word — the same document, the same order (`processDocumentBlocks`). */
  const downloadProcessDocument = async (format: 'md' | 'docx') => {
    const built = processDocument.document;
    if (!built) return;
    const { blocksMarkdown, blocksDocx } = await import('@/lib/requirements-export');
    const blocks = processDocumentBlocks(built, {
      projectName: project?.name || built.program,
      date: new Date().toISOString().slice(0, 10),
      openQuestions: openQuestionsOfProject,
      // The owner's RACI when one is saved, else the model's proposal (owner request 10.10.2026).
      raci: businessLayer ? raciFileTable(businessLayer, processSteps, raciEdit) : null,
    });
    const blob = format === 'md'
      ? new Blob([blocksMarkdown(blocks)], { type: 'text/markdown;charset=utf-8' })
      : await blocksDocx(blocks);
    saveAs(blob, processDocumentFileName(project?.name, format));
  };

  /** A blueprint stored before 3.0.5, exactly as it was stored — the data is kept, its rendering is not. */
  const downloadLegacyBlueprint = () => {
    if (!legacyBlueprint) return;
    saveAs(new Blob([legacyBlueprint], { type: 'application/json;charset=utf-8' }), docLegacyFileName(project?.name));
  };

  /**
   * Roadmap 3.0.7 — one Export menu in the stage header (ADR-078's menu)
   * instead of seven buttons in three places: Word · Print / PDF · Confluence ·
   * Markdown · BPMN 2.0. The PDF is the description itself, printed from the
   * browser (everything else on the page is `cc-no-print`); the brief of
   * roadmap 4.4 is gone with it. Each way out is offered once there is
   * something true to export.
   */
  type DocExport = 'docx' | 'print' | 'html' | 'md' | 'bpmn';
  const exportItems: Array<ExportMenuItem<DocExport>> = [
    ...(processDocument.document ? [
      { kind: 'docx' as const, label: 'Word', hint: '.docx with cover, sections and appendix', icon: <FileText size={16} aria-hidden={true} />, attrs: { 'data-export-process-docx': '' } },
      { kind: 'print' as const, label: 'Print / PDF', hint: 'the process description, from the browser', icon: <Printer size={16} aria-hidden={true} />, attrs: { 'data-export-print': '' } },
      {
        kind: 'html' as const,
        label: 'Confluence',
        hint: 'a page to paste or upload',
        icon: <BookOpenText size={16} aria-hidden={true} />,
        attrs: {
          'data-export-confluence': documentationStale ? 'stale' : 'current',
          'aria-label': 'Export Confluence',
          'aria-describedby': documentationStale ? 'confluence-export-stale' : undefined,
        },
      },
      { kind: 'md' as const, label: 'Markdown', hint: '.md, the same document as text', icon: <FileCode2 size={16} aria-hidden={true} />, attrs: { 'data-export-process-md': '' } },
    ] : []),
    // Roadmap 2.6 — drawn from the skeleton of the signed run, so it exists as
    // soon as the run does and says nothing the code does not.
    ...(signedSource ? [
      { kind: 'bpmn' as const, label: 'BPMN 2.0', hint: 'the process with line ranges, for SAP Signavio', icon: <Workflow size={16} aria-hidden={true} />, attrs: { 'data-export-bpmn': '', 'aria-label': 'Export BPMN 2.0' } },
    ] : []),
  ];
  const onExport = (kind: DocExport) => {
    if (kind === 'print') window.print();
    else if (kind === 'html') downloadConfluenceHTML();
    else if (kind === 'md' || kind === 'docx') void downloadProcessDocument(kind);
    else void downloadBPMN();
  };

  if (loading) return (
    <StageFrame stage="documentation">
      <StageHeader stage="documentation" tools={{ steps: phases, current: 'documentation' }} projectName={project?.name} />
      <CcSkeleton shape="cards" label="documentation" count={2} />
    </StageFrame>
  );

  if (loadError) return (
    <StageFrame stage="documentation">
      <div className="max-w-xl">
        <CcMessageStrip
          state="error"
          headline="This stage could not be opened"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          <span data-load-error>{loadError}</span>
        </CcMessageStrip>
      </div>
    </StageFrame>
  );

  /**
   * What the model proposals cost before any click — DESIGN.md §2.8, one line
   * for the card (roadmap 3.0.7). Every part of it is a fact of this page: the
   * model it names is the one `generateBusinessDocumentation` passes to
   * `/api/gemini`, the key is the one `/api/model-stages` reports, and that
   * route meters by the hour, not by the analysis run.
   */
  const proposalsCostLine = docProposalsCostLine(PRODUCT_GEMINI_MODEL, modelAvailability.keySource === 'byok');

  const statementPanelProps = {
    view: statementProposal.view,
    canRequest: isOwner,
    byok: modelAvailability.keySource === 'byok',
    requesting: statementProposal.requesting,
    message: statementProposal.message,
    onRequest: statementProposal.request,
  };
  const tracePanel = engineDoc ? (
    <ProcessDocumentationView appendix doc={engineDoc} proposal={statementPanelProps} proposalPanel={false} groups={processDocument.document?.appendix.groups} />
  ) : null;
  /** The technical trace, last on the page — after the model proposals and the map. */
  const appendixPanel = engineDoc ? (
    <ProcessDocumentAppendix document={processDocument.document}>{tracePanel}</ProcessDocumentAppendix>
  ) : null;
  const technicalPanel = engineDoc ? (
    processDocument.document ? (
      <ProcessDocumentView
        document={processDocument.document}
        projectName={project?.name}
        summary={<DirectWriteLevels callouts={callouts} />}
        openQuestions={openQuestionsOfProject}
        questionsHref={questionsHref}
        rulesOutside={handbook.handbook?.rulesOutside ?? null}
      />
    ) : processDocument.status === 'failed' ? (
      <CcMessageStrip state="warning">The process description could not be put together from this source; the technical trace at the foot of this page is complete.</CcMessageStrip>
    ) : (
      <div className={SECTION} aria-busy="true">
        <CcSkeleton shape="text" label="the process description" count={4} />
      </div>
    )
  ) : null;

  /**
   * What stands between the reader and the business layer, said before the
   * click: the same blockers the generation itself checks
   * (`generationBlockers`), and the description it is written from.
   */
  /**
   * "Read again from the code" removes the SOP and RACI on record with the
   * description it replaces (see the transaction above). It used to do that
   * without a word (decision-input audit, Doc1); with a layer on record it asks
   * first. Without one there is nothing of the owner's to lose.
   */
  const askReadAgain = () => {
    if (businessDocumentation.trim()) setReplaceAsk('doc');
    else void generateDocumentation();
  };

  const businessBlockers: string[] = [
    ...generationBlockers(project, 'documentation'),
    ...(hasDocument ? [] : [wt('doc.businessNeedsDocumentation')]),
  ];

  /**
   * Roadmap 3.0.7 ("Documentation lean", item 7) — one card for what a model
   * proposes on top of the description: the SOP and RACI (ADR-068, written
   * once when the stage opens, decision 03.10.2026) and the business sentences
   * over the engine's (roadmap 17.10, on request), with one cost line. RACI
   * stays a proposal; the controls are the code reading's, in the systems section.
   */
  const businessPart = isGeneratingBusinessDoc ? (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 cc-text-h3 text-cc-ink">{wt('doc.businessGenerating')}</h3>
      <p role="status" className="m-0 cc-text-cell text-cc-ink-muted">
        {businessStartedAt === null ? 0 : businessElapsed} s of at most {Math.round(BUSINESS_LAYER_CEILING_MS / 1000)} s.
      </p>
      <CcSkeleton shape="table" label="the business layer" count={3} />
    </div>
  ) : parsedBusinessDoc ? (
    <BusinessLayer
      embedded
      layer={businessLayer ?? parsedBusinessDoc}
      process={processSteps}
      raciEditing={{
        canEdit: isOwner,
        editedLine: raciEdit ? raciEditedLine(raciEdit.editedBy, formatTextDate(raciEdit.editedAt) ?? raciEdit.editedAt.slice(0, 10)) : null,
        onSave: saveRaci,
      }}
      action={isOwner && modelAvailability.enabled('documentation') ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <CcButton
              variant="secondary"
              density="cozy"
              onClick={() => setReplaceAsk('sop')}
              disabled={businessBlockers.length > 0 || isGeneratingDoc}
              icon={<RefreshCw size={16} aria-hidden={true} />}
              data-regenerate-business-layer=""
            >
              {wt('doc.businessRegenerate')}
            </CcButton>
          </div>
          {businessDocError ? (
            <CcMessageStrip state="error" headline="The business layer was not generated again.">{businessDocError}</CcMessageStrip>
          ) : null}
        </div>
      ) : undefined}
    />
  ) : (
    <div className="flex flex-col gap-3">
      <h3 id="business-offer-title" className="m-0 cc-text-h3 text-cc-ink">{wt('doc.businessOfferTitle')}</h3>
      <p className="m-0 max-w-3xl cc-text-cell text-cc-ink">{wt('doc.businessOfferLead')}</p>
      {/* An invited reader reads: no button offers a write the rules refuse,
          and the owner's model settings are not the reader's business. */}
      {project && !isOwner ? (
        <p data-business-layer-reader="" className="m-0 cc-text-cell text-cc-ink-muted">
          Not on record yet. The owner of this project writes it; it appears here once it is saved.
        </p>
      ) : !modelAvailability.enabled('documentation') ? (
        <p data-not-generated="Business SOP and RACI layer" data-business-layer-off="" className="m-0 cc-text-cell text-cc-ink-muted">
          {modelAbsenceReason(modelAvailability.keyAvailable ? 'stage-off' : 'no-key', 'documentation')}{' '}
          <a href="/settings" className="text-cc-ink underline">Settings</a>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <CcButton
            variant="primary"
            density="cozy"
            onClick={generateBusinessDocumentation}
            disabled={businessBlockers.length > 0 || isGeneratingDoc}
            aria-describedby={businessBlockers.length > 0 ? 'business-layer-blocked' : undefined}
            busy={isGeneratingBusinessDoc}
            icon={<Rocket size={16} aria-hidden={true} />}
            data-generate-business-layer
          >
            {wt('doc.businessGenerate')}
          </CcButton>
        </div>
      )}
      {/* Why the button waits, in words — never a button that does nothing. */}
      {isOwner && modelAvailability.enabled('documentation') && businessBlockers.length > 0 ? (
        <div id="business-layer-blocked" data-business-layer-blocked="">
          <CcMessageStrip
            state="information"
            headline={wt('doc.businessBlockedTitle')}
            actions={!hasDocument && legacyBlueprint === null && signedSource && processMap.model ? (
              <CcButton onClick={generateDocumentation} busy={isGeneratingDoc} data-business-read-first="">
                {wt('doc.businessReadFirst')}
              </CcButton>
            ) : undefined}
          >
            {businessBlockers.join(' ')}
          </CcMessageStrip>
        </div>
      ) : null}
      {otherTabWriting ? (
        <p data-business-layer-other-tab="" className="m-0 cc-text-cell text-cc-ink-muted">
          Another tab of this browser is writing the business layer right now. Reload this stage when it is done.
        </p>
      ) : null}
      {businessDocError && (
        <CcMessageStrip
          state="error"
          headline="The business layer was not generated."
          actions={
            modelAvailability.enabled('documentation') && businessBlockers.length === 0
              ? <CcButton onClick={generateBusinessDocumentation} disabled={isGeneratingDoc}>Try again</CcButton>
              : undefined
          }
        >
          {businessDocError}
        </CcMessageStrip>
      )}
    </div>
  );

  /** Whether an invited reader sees anything of the business sentences — the panel shows nothing to a reader without a proposal. */
  const sentencesShown = engineDoc && (isOwner || statementProposal.view?.state === 'proposed');

  const proposalsCard = (
    <section
      aria-labelledby="model-proposals-title"
      data-model-proposals=""
      data-business-layer-offer={!parsedBusinessDoc ? '' : undefined}
      data-business-layer-writing={isGeneratingBusinessDoc ? '' : undefined}
      aria-busy={isGeneratingBusinessDoc ? true : undefined}
      className={clsx(SECTION, 'cc-no-print mb-6 flex flex-col gap-4')}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="model-proposals-title" className={clsx(H2, 'm-0')}>{wt('doc.proposalsTitle')}</h2>
          <CcProvenanceChip value="proposed" />
        </div>
        <p className="m-0 mt-1 max-w-3xl cc-text-cell text-cc-ink-muted">{wt('doc.proposalsLead')}</p>
        <p data-model-proposals-cost="" data-business-layer-cost="" className="m-0 mt-1 max-w-3xl cc-text-meta text-cc-ink-muted">{proposalsCostLine}</p>
      </div>
      {businessPart}
      {sentencesShown ? (
        <div data-model-proposals-sentences="" className="border-t border-cc-line pt-4">
          <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.proposalsSentencesTitle')}</h3>
          <StatementProposalPanel {...statementPanelProps} costLine={false} />
        </div>
      ) : null}
    </section>
  );

  return (
    <StageFrame stage="documentation" className="min-h-screen">
      <StaleNotice
        title={`Built for ${previousBasis(project)}`}
        reasons={[
          ...generationBlockers(project, 'documentation'),
          ...(documentationStale
            ? [`The documentation shown here was written for ${previousBasis(project)}.`]
            : []),
        ]}
      />

      {/* A slim title with the one Export menu (roadmap 3.0.7, ADR-078's
          menu): every way out of this stage in one place. The frame
          (progress, header, back link) is shared; everything under it is
          this stage's. */}
      <StageHeader tools={{ steps: phases, current: 'documentation' }}
        stage="documentation"
        projectName={project?.name}
        eyebrow={
          <CcProvenanceChip
            value={documentationStale ? 'stale' : 'reconstructed'}
            note={documentationStale ? 'regenerate first' : hasDocument ? 'current' : 'code reading'}
          />
        }
        actions={exportItems.length ? (
          <div data-documentation-exports="" className="cc-no-print flex flex-col items-start gap-1 md:items-end">
            <ExportMenu<DocExport>
              items={exportItems}
              onExport={onExport}
              align="end"
              triggerAttrs={{ 'data-documentation-export-menu': '' }}
              note={
                <>
                  {/* Roadmap 0.2 (UX-029): what the BPMN file is, and the part
                      that is not established, in the same breath — never on hover. */}
                  {signedSource ? <p data-export-caveat="" className="m-0 cc-text-meta text-cc-ink-muted">{wt('doc.exportBpmnCaveat')}</p> : null}
                  {processDocument.document ? <p data-export-print-caveat="" className="m-0 cc-text-meta text-cc-ink-muted">{wt('doc.exportPrintCaveat')}</p> : null}
                </>
              }
            />
            {/* The file opens with the same note (`STALE_EXPORT_NOTE`). */}
            {documentationStale && processDocument.document ? (
              <span id="confluence-export-stale" data-confluence-stale-note="">
                <CcStateText state="warning">{wt('doc.exportStale')}</CcStateText>
              </span>
            ) : null}
          </div>
        ) : undefined}
      />

      <ReplaceStoredBox
        open={replaceAsk !== null}
        title={wt(replaceAsk === 'sop' ? 'input.replaceSopTitle' : 'input.replaceDocTitle')}
        body={replaceAsk === 'sop' ? replaceSopBody(!!raciEdit) : replaceDocBody(!!raciEdit)}
        callsModel={replaceAsk === 'sop'}
        onKeep={() => setReplaceAsk(null)}
        onReplace={() => {
          const which = replaceAsk;
          setReplaceAsk(null);
          if (which === 'sop') {
            replaceLayer.current = businessDocumentation;
            void generateBusinessDocumentation();
          } else if (which === 'doc') {
            void generateDocumentation();
          }
        }}
      />

      {/* Two different things used to share one heading. A blocked start is a
          refusal before anything is read; a refused answer is a reading that
          happened and produced something this stage cannot display. */}
      {docError && (
        <div data-doc-error={docRejected ? 'rejected' : 'blocked'} className="mb-6">
          <CcMessageStrip
            state="error"
            headline={docRejected ? 'Generation failed' : 'Generation blocked'}
            actions={docRejected && isOwner ? (
              <CcButton onClick={askReadAgain} disabled={!signedSource || !processMap.model || isGeneratingDoc}>
                Try again
              </CcButton>
            ) : undefined}
          >
            {docError}
          </CcMessageStrip>
        </div>
      )}

      {/* Owner 04.10.2026 (ADR-077 amended) — the stage reads top-down like
          the document a business reader opens: the process description first;
          the model proposals right after it; the map with its chapters to
          explore below; the technical trace last. Printed, the description
          and its appendix are the page — everything else is `cc-no-print`. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h2 id="documentation-stored" className="m-0 cc-text-h2 text-cc-ink">Process description</h2>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            Written from the code when the stage opens, no model call. The exports carry the same document; its appendix stands at the foot of this page.
          </p>
        </div>
        {hasDocument && isOwner ? (
          <div className="cc-no-print">
            <CcButton
              variant="secondary"
              density="cozy"
              onClick={askReadAgain}
              disabled={isGeneratingBusinessDoc || !signedSource || !processMap.model}
              busy={isGeneratingDoc}
              data-regenerate-documentation
              icon={<RefreshCw size={16} aria-hidden={true} />}
            >
              Read again from the code
            </CcButton>
          </div>
        ) : null}
      </div>

      {/* Owner review 10.10.2026: the chapter bar — the IT view's anchor bar —
          a direct child of the stage, so it stays in view from the
          description down to the appendix at the foot. */}
      {hasDocument && !isGeneratingDoc && processDocument.document ? (
        <DocumentChapterBar document={processDocument.document} openQuestions={openQuestionsOfProject} />
      ) : null}

      <section aria-labelledby="documentation-stored" data-documentation-description="" className="mb-8">
        {isGeneratingDoc ? (
          <div className={SECTION} aria-busy="true">
            <h3 className={H2}>Reading the process</h3>
            <p className="cc-text-cell text-cc-ink-muted mt-1 mb-4">Putting the documentation together from the whole source…</p>
            <CcSkeleton shape="text" label="the process documentation" count={4} />
          </div>
        ) : hasDocument ? (
          <div id="documentation-report" data-stage-output="documentation">
            {technicalPanel}
          </div>
        ) : legacyBlueprint !== null ? (
          /* Roadmap 3.0.7 — a blueprint a model wrote before 3.0.5. Its data
             is kept (never migrated, never deleted); its rendering is gone:
             one strip, the file as it was, and the way to the code reading. */
          <div data-legacy-blueprint="" data-stage-output="documentation">
            <CcMessageStrip
              state="warning"
              actions={
                <div className="flex flex-wrap gap-2">
                  <CcButton density="cozy" onClick={downloadLegacyBlueprint} icon={<Download size={16} aria-hidden={true} />} data-legacy-blueprint-download="">
                    {wt('doc.legacyDownload')}
                  </CcButton>
                  {isOwner ? (
                    <CcButton
                      variant="primary"
                      density="cozy"
                      onClick={askReadAgain}
                      disabled={!signedSource || !processMap.model}
                      busy={isGeneratingDoc}
                      data-legacy-blueprint-replace=""
                      data-regenerate-documentation=""
                    >
                      {wt('doc.legacyReplace')}
                    </CcButton>
                  ) : null}
                </div>
              }
            >
              {wt('doc.legacyStrip')}
              {project && !isOwner ? <> {wt('doc.legacyReaderNote')}</> : null}
            </CcMessageStrip>
          </div>
        ) : project && !isOwner ? (
          /* An invited reader reads: nothing is written on their visit, and no
             button offers a write the rules refuse. */
          <CcMessageStrip state="information" headline="No process description on record yet.">
            <span data-documentation-reader-note="">
              The owner of this project writes it by opening this stage; it appears here once it is saved.
            </span>
          </CcMessageStrip>
        ) : (
          <div className="space-y-4">
            {storedBlueprintRejected && (
              <CcMessageStrip state="warning">
                <span data-stored-blueprint-rejected>{STORED_BLUEPRINT_REJECTED}</span>
              </CcMessageStrip>
            )}
            {/* Roadmap 3.0.5 — no model is called for this document. What can
                stand in its way: the source no longer being the one the run
                signed, or the map not being read yet. Both are said. */}
            <CcEmptyState
              title={storedBlueprintRejected ? 'Replace the stored blueprint' : 'No process documentation saved yet.'}
              action={
                <CcButton
                  variant="primary"
                  density="cozy"
                  onClick={generateDocumentation}
                  disabled={!signedSource || !processMap.model}
                  busy={isGeneratingDoc}
                  data-generate-blueprint
                >
                  {storedBlueprintRejected ? 'Replace with the code reading' : 'Read the documentation from the code'}
                </CcButton>
              }
              cost={
                signedSource ? t('run.noModelCall') : (
                  <span data-documentation-needs-run>
                    There is no source here that the active run signed. Run the analysis in stage 1 first.
                  </span>
                )
              }
            >
              Read from the whole signed source, every statement with its lines. No language model is involved.
            </CcEmptyState>
          </div>
        )}
      </section>

      {/* The model proposals — who does what, who is accountable, and the
          business sentences — on top of the description, so after it. */}
      {proposalsCard}

      {/* Explore the process: the map as the code runs it, a chapter beside
          it (owner decision 01.10.2026, proposal B). The level and the
          selection stay in the address. */}
      <section
        ref={exploreRef}
        aria-labelledby="documentation-explore"
        data-documentation-explore=""
        className="cc-no-print mb-8 scroll-mt-24"
      >
        <h2 id="documentation-explore" className="m-0 cc-text-h2 text-cc-ink">Explore the process</h2>
        <p className="m-0 mt-1 mb-3 max-w-3xl cc-text-cell text-cc-ink-muted">
          The process drawn from the code, with the chapter of each step beside it. Select a step to read its chapter;
          a link to this page keeps the level and the step that are open.
        </p>
        <HandbookStage
          handbook={handbook.handbook}
          reading={handbook.status === 'loading' || processMap.status === 'loading'}
          model={processMap.model}
          selected={resolved.node}
          onSelect={selectElement}
          source={signedSource?.source ?? null}
          map={signedSource && processMap.model ? (
            <div data-process-map-section="">
              <ProcessMap
                layout="stage"
                /* `DESIGN.md` §5.7 — the steps on a phone, the map elsewhere. */
                defaultView={isPhone ? 'steps' : 'map'}
                model={processMap.model}
                source={signedSource.source}
                measuredAt={processMap.measuredAt}
                /* Roadmap 6.3 — the Usage overlay, and only when there is an
                   import. `usageReport` is a server-written field (roadmap 0.7);
                   this reads it and never writes it. */
                usage={project?.usageReport ?? null}
                catalogTarget={project ? catalogLookupTargetOf(project) : null}
                plane={resolved.plane}
                onPlaneChange={openPlane}
                selected={resolved.node}
                onSelectedChange={selectElement}
                save={saveProcessModel}
                openLatest={openLatestRevision}
                projectId={typeof projectId === 'string' ? projectId : null}
                canEdit={isOwner}
              />
            </div>
          ) : (
            <div className="rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface-muted p-4">
              <p className="m-0 cc-text-h3 text-cc-ink">
                {signedSource && processMap.status !== 'failed' ? 'Reading the process from the code…' : 'No process map yet'}
              </p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                {signedSource
                  ? processMap.reason ?? 'The map is drawn from the signed analysis as soon as it has been read.'
                  : 'The map is drawn from a signed analysis of the code. Run the analysis first.'}
              </p>
            </div>
          )}
        />
      </section>

      {/* Roadmap 3.2 — what was kept, and what changed between two of them. */}
      {signedSource && (
        <section data-process-revisions-section className={clsx(SECTION, 'cc-no-print mb-8')}>
          <h2 className="mb-3 cc-text-h2 text-cc-ink">Revisions of this process</h2>
          {baselineRefusal ? (
            <div className="mb-3" data-revision-baseline-refused="">
              <CcMessageStrip state="error" headline="The process as read from the code could not be recorded.">
                {baselineRefusal}
              </CcMessageStrip>
            </div>
          ) : null}
          <RevisionCompare
            projectId={(Array.isArray(projectId) ? projectId[0] : projectId) ?? ''}
            refreshKey={revisionsKey}
          />
        </section>
      )}

      {/* The technical trace — the description's appendix, last on the page
          as it is last in every export. */}
      {!isGeneratingDoc && appendixPanel ? <div className="mb-8">{appendixPanel}</div> : null}

      <div className="cc-no-print">
        <StageFooter />
      </div>
    </StageFrame>
  );
}
