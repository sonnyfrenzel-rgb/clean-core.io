'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import { checkProjectWrite, projectTooLargeMessage } from '@/lib/firestore-doc-size';
import { getAuth, getDb } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import StageFooter from '@/components/StageFooter';
import { Download, RefreshCw, FileCode2, Briefcase, Target, Users, Settings, Activity, Layers, Box, Lock, Rocket, Printer, ExternalLink } from 'lucide-react';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import NotGenerated from '@/components/NotGenerated';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';
import {
  LEGACY_BLUEPRINT_NOTICE,
  processDocumentationToMarkdown,
  readStoredDocumentation,
  type ProcessDocumentation,
} from '@/lib/process-documentation';
import {
  buildEngineConfluenceHtml,
  buildLegacyConfluenceHtml,
  confluenceFileName,
} from '@/lib/documentation-export';
import CcStateText from '@/components/cc/StateText';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import HandbookStage from '@/components/documentation/HandbookStage';
import HandbookDrawer from '@/components/documentation/HandbookDrawer';
import { useProcessHandbook } from '@/hooks/useProcessHandbook';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { saveAs } from '@/lib/fileSaver';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import { workflowSteps, generationBlockers, previousBasis } from '@/lib/workflow-steps';
import StaleNotice from '@/components/StaleNotice';
import { sha256Hex } from '@/lib/artefact-digest';
import { useProcessMap } from '@/hooks/useProcessMap';
import { useProcessMapAddress } from '@/hooks/useProcessMapAddress';
import { useStatementProposal } from '@/hooks/useStatementProposal';
import { buildNavigation, levelOf, resolveMapAddress } from '@/lib/process-navigation';
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
import {
  checkBlueprintShape,
  checkBusinessDocShape,
  STORED_BLUEPRINT_REJECTED,
} from './blueprint-schema';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcEmptyState from '@/components/cc/EmptyState';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import CcTabs from '@/components/cc/Tabs';
import { CcTag } from '@/components/cc/Tag';
import { t } from '@/lib/cc-messages';

/** A section of this stage — the card of DESIGN.md §1.4. */
const SECTION = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 md:p-6 shadow-cc';
/** The micro-label above a heading or a value (§1.2). */
const LABEL = 'cc-text-label text-cc-ink-muted';
/** A section heading (§1.2). */
const H2 = 'cc-text-h2 text-cc-ink';

/**
 * The workspace file the documentation is merged into, named after the stage
 * (UX-169) — the same name the handover writes (`delivery/page.tsx`,
 * `DOCUMENTATION_FILE`), so one project never carries two copies of it.
 */
const DOCUMENTATION_WORKSPACE_FILE = 'docs/process-documentation.md';

/** The workspace file of the business layer (SOP, RACI, controls). */
const BUSINESS_WORKSPACE_FILE = 'docs/business-documentation.md';

/** The workspace package without one file; `generatedCode` as stored, or `[]`. */
const removeFileFromWorkspace = (generatedCode: string, filePath: string): string => {
  try {
    const parsed = JSON.parse(generatedCode);
    if (Array.isArray(parsed)) return JSON.stringify(parsed.filter((f: { path?: string }) => f?.path !== filePath));
  } catch {
    // Not a package: nothing in it can be the business layer's file.
  }
  return generatedCode;
};

const addOrUpdateFileInWorkspace = (generatedCode: string | undefined, filePath: string, fileContent: string): string => {
  let files: Array<{ path: string, content: string }> = [];
  if (generatedCode) {
    try {
      const parsed = JSON.parse(generatedCode);
      if (Array.isArray(parsed)) {
        files = parsed;
      }
    } catch (e) {
      files = [
        {
          path: 'srv/service.ts',
          content: generatedCode
        }
      ];
    }
  }
  const existingFileIdx = files.findIndex(f => f.path === filePath);
  if (existingFileIdx !== -1) {
    files[existingFileIdx].content = fileContent;
  } else {
    files.push({ path: filePath, content: fileContent });
  }
  return JSON.stringify(files);
};

// Dynamically import ProcessFlow to avoid SSR issues
const ProcessFlow = dynamic(() => import('@/components/ProcessFlow'), { ssr: false });

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
  const router = useRouter();
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
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  // The task specification is a modal (UX-034, roadmap 3.0.4) — `CcDialog`
  // below, since block D, D.16a.
  const [activeTask, setActiveTask] = useState<any | null>(null);

  // Stage 2 Business Documentation States
  const [businessDocumentation, setBusinessDocumentation] = useState('');
  const [isGeneratingBusinessDoc, setIsGeneratingBusinessDoc] = useState(false);
  const [businessDocError, setBusinessDocError] = useState('');
  const [activeTab, setActiveTab] = useState<'technical' | 'business'>('technical');

  // Roadmap 4.4 — the brief. It reads the whole program twice (the rule reader
  // and the coverage sweep), so the button says it is working and says why when
  // it could not finish.
  const [isBuildingBrief, setIsBuildingBrief] = useState(false);
  const [briefError, setBriefError] = useState('');

  const handleNodeClick = (nodeId: string) => {
    setHighlightedTaskId(nodeId);
    if (parsedDoc?.l4_tasks) {
      const task = parsedDoc.l4_tasks.find((t: any) => t.stepId === nodeId);
      if (task) {
        setActiveTask(task);
      }
    }
    const element = document.getElementById(`task-${nodeId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedTaskId(prev => prev === nodeId ? null : prev);
    }, 3000);
  };

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
   * What is stored, sorted into three cases — roadmap 3.0.5.
   *
   * - `engineDoc`: the document the engine wrote (`lib/process-documentation.ts`).
   * - `parsedDoc`: a blueprint a language model wrote before 3.0.5. It is shown
   *   as it was, under a notice that says what it is — never migrated, never
   *   deleted. Its shape is still checked before it is drawn: a document an
   *   earlier build stored in a form the page cannot draw becomes an explained
   *   empty state instead of a crash (QA 0d8443fae823 / 58201e6aaedb).
   * - `storedBlueprintRejected`: something is stored and neither of the two
   *   can be drawn from it. The reader is told so, and generating replaces it.
   */
  const blueprint = useMemo<{ engine: ProcessDocumentation | null; doc: any | null; rejected: boolean }>(() => {
    const stored = readStoredDocumentation(documentation);
    if (stored.kind === 'none') return { engine: null, doc: null, rejected: false };
    if (stored.kind === 'engine') return { engine: stored.doc, doc: null, rejected: false };
    if (stored.kind === 'engine-invalid') {
      console.error('Stored documentation rejected:', stored.problems);
      return { engine: null, doc: null, rejected: true };
    }
    try {
      const parsed = extractJSON(stored.raw);
      const shape = checkBlueprintShape(parsed);
      if (!shape.ok) {
        console.error('Stored documentation rejected:', shape.problems);
        return { engine: null, doc: null, rejected: true };
      }
      return { engine: null, doc: parsed, rejected: false };
    } catch (e) {
      console.error("Parsed documentation is invalid:", e);
      return { engine: null, doc: null, rejected: true };
    }
  }, [documentation]);
  const engineDoc = blueprint.engine;
  /** The legacy blueprint, when that is what is stored. */
  const parsedDoc = blueprint.doc;
  const hasDocument = Boolean(engineDoc || parsedDoc);
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

  const generateBusinessDocumentation = useCallback(async () => {
    if (!project || !projectId || !documentation) return;
    const blocked = generationBlockers(project, 'documentation');
    if (blocked.length > 0) {
      setBusinessDocError(blocked.join(' '));
      return;
    }

    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    
    setIsGeneratingBusinessDoc(true);
    setBusinessDocError('');
    
    // Roadmap 3.0.5: the engine document goes in as its Markdown — the process
    // element by element with its BPMN ids, and the business statements of the
    // whole program. `stepId` below is then the element id the map and the
    // `.bpmn` export use. A blueprint stored before 3.0.5 goes in as it was.
    const blueprintContext = engineDoc ? processDocumentationToMarkdown(engineDoc) : documentation;
    const stepsDescription = engineDoc
      ? 'Process Documentation read from the ABAP code (BPMN elements with their ids and line ranges, and the business statements of the whole program). Use the element ids as stepId'
      : 'Process Blueprint (BPMN flow and Level 4 tasks)';

    try {
      const prompt = `Act as an Enterprise Business Process, SOP & Compliance expert writing for a BUSINESS audience — process owners, master-data stewards, compliance and internal audit. This is the BUSINESS layer of the documentation.
Based on the following ${stepsDescription}, generate the corresponding Business SOP & RACI Matrix layer.

CRITICAL — PURE BUSINESS LANGUAGE (no IT/technical content):
- Write exclusively in business and process terms. Describe WHAT happens for the business and WHO is responsible — never HOW it is implemented technically.
- Do NOT mention any technical or IT concept. Forbidden terms: source code, API/OData/CDS/CAP/RAP/SDK, database/table/Z-table, JSON/schema/payload, HANA, deployment/pipeline, HTTP, latency/milliseconds, unit test, retry/rollback. All technical detail already lives in the separate Technical Blueprint and must NOT be repeated here.
- RACI roles must be ORGANIZATIONAL/BUSINESS roles only (e.g. Process Owner, Master Data Steward, Business Unit Lead, Compliance Officer, Internal Audit, Finance, Supply Chain Manager). Avoid IT roles (Developer, Architect, IT Operations, System).
- KPIs must be BUSINESS KPIs (e.g. process cycle time, data accuracy / quality %, first-pass yield, compliance adherence %, exception rate). Never technical metrics (write success rate, response time in ms, schema adherence).
- Exceptions and controls must be BUSINESS actions (escalation, four-eyes / dual approval, manual review, segregation of duties, periodic control testing, exception-report review) — not technical remediation.

Return ONLY a JSON object wrapped in a markdown code block (\`\`\`json ... \`\`\`).
DO NOT include any text before or after the JSON.

Process Blueprint Context:
${blueprintContext}

Structure the JSON exactly like this:
{
  "raci_matrix": [
    {
      "stepId": "Task1",
      "r": "Responsible business role who performs the step (e.g. Master Data Steward)",
      "a": "Accountable business role, single owner (e.g. Process Owner)",
      "c": "Consulted business role (e.g. Compliance Officer, Business Unit Lead)",
      "i": "Informed business role (e.g. Finance, Internal Audit)"
    }
  ],
  "sop_details": [
    {
      "stepId": "Task1",
      "narrative": "Plain-business, step-by-step description of how the business handles this process step and the outcome it produces (3-4 sentences). No technical detail.",
      "businessException": "Business fallback if the step cannot be completed (e.g. escalate to the Process Owner, route for manual review, apply dual approval).",
      "kpiTarget": "Business KPI target (e.g. Process cycle time < 1 business day; 100% data-quality compliance; < 2% exception rate)."
    }
  ],
  "audit_controls": [
    {
      "stepId": "Task1",
      "controlObjective": "Business / compliance control goal (e.g. Ensure master-data accuracy and segregation of duties).",
      "mitigationAction": "Business mitigation (e.g. mandatory approval workflow, four-eyes principle, data-quality review before release).",
      "assertionMethod": "Business verification (e.g. periodic internal-audit review, control sign-off, exception-report review)."
    }
  ]
}`;

      console.log('Generating business process compliance for project:', project.name);
      const responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, false, 'documentation');
      
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
        const merged = addOrUpdateFileInWorkspace(current.generatedCode ?? project.generatedCode, BUSINESS_WORKSPACE_FILE, formatBusinessDocsToMarkdown(responseText));
        // Codex architecture-02: the layer is written twice — as itself and
        // into the package — so it is refused by name before the commit when
        // the project would outgrow its 1 MiB document.
        const size = checkProjectWrite(current, { businessDocumentation: responseText, generatedCode: merged }, projectDoc.path, 'update');
        if (!size.ok) throw new Error(projectTooLargeMessage(size, 'this business documentation'));
        tx.update(projectDoc, { businessDocumentation: responseText, generatedCode: merged });
        return merged;
      });

      // Shown only once it is stored (52487ee4cacc): a layer the transaction
      // refused is not this project's business documentation.
      setBusinessDocumentation(responseText);
      setProject(prev => prev ? { ...prev, businessDocumentation: responseText, generatedCode: updatedCode } : null);
      
    } catch (err: unknown) {
      console.error('Business documentation generation error:', err);
      setBusinessDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingBusinessDoc(false);
    }
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

  const projectIdStr = (Array.isArray(projectId) ? projectId[0] : projectId) ?? null;
  const statementProposal = useStatementProposal(
    projectIdStr,
    signedSource?.source ?? null,
    modelAvailability,
  );
  const isOwner = !!project && getAuth().currentUser?.uid === project.userId;

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
   * Still on a button, never on opening the stage: writing the project is the
   * reader's decision, and a stored legacy blueprint is only replaced when they
   * ask for it.
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
        // The business layer (RACI, SOP, controls) was written from the
        // documentation this replaces, keyed to its step ids. Kept, it would be
        // shown and exported as current beside a document whose elements it
        // does not describe (QA full review 96b39ec78c97) — so it goes with the
        // document it was built on, from the project and from the package.
        const merged = removeFileFromWorkspace(
          addOrUpdateFileInWorkspace(current.generatedCode ?? project.generatedCode, DOCUMENTATION_WORKSPACE_FILE, processDocumentationToMarkdown(built)),
          BUSINESS_WORKSPACE_FILE,
        );
        // Codex architecture-02, as for the business layer above.
        const size = checkProjectWrite(current, { documentation: stored, generatedCode: merged, status: 'documented', businessDocumentation: '' }, projectDoc.path, 'update');
        if (!size.ok) throw new Error(projectTooLargeMessage(size, 'this documentation'));
        tx.update(projectDoc, { documentation: stored, generatedCode: merged, status: 'documented', businessDocumentation: '' });
        return merged;
      });

      // Shown only once it is stored: a document the transaction refused is
      // not this project's documentation.
      setDocumentation(stored);
      setBusinessDocumentation('');
      setProject(prev => prev ? { ...prev, documentation: stored, generatedCode: updatedCode, status: 'documented', businessDocumentation: '' } : null);
    } catch (err: unknown) {
      console.error('Documentation generation error:', err);
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingDoc(false);
    }
  }, [projectId, project, signedSource, processMap.model, processMap.status, processMap.reason]);

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
   * Roadmap 4.4 — the brief: the process picture, the rules and the open
   * questions, every statement with its lines, as a PDF, and the `.bpmn` beside
   * it in one download.
   *
   * Everything it needs is already derivable from the source the active run
   * signed — the map on this page, 2.6's export, 3.4's rules, the coverage
   * sweep and 3.5's confirmations — so no model is called and nothing is
   * stored. The brief enters no run and no audit pack; it is a summary.
   *
   * The BPMN is taken from the same export the map was built from and put into
   * the archive unchanged, so the file in the download and the file behind
   * "Export BPMN" are the same bytes.
   *
   * The confirmations are fetched and a failure to read them is not a failure
   * to write the brief: the third section then says that nothing could be read,
   * which is true, instead of a document that does not arrive.
   */
  const downloadBrief = async () => {
    if (!signedSource || !processMap.model || isBuildingBrief) return;
    const idStr = Array.isArray(projectId) ? projectId[0] : projectId;
    setIsBuildingBrief(true);
    setBriefError('');
    try {
      const [exporter, rules, coverage, briefModel, briefPackage, statesClient, statesModel, zipModule] =
        await Promise.all([
          import('@/lib/bpmn/export'),
          import('@/lib/abap/business-rule-set'),
          import('@/lib/abap/coverage'),
          import('@/lib/brief/model'),
          import('@/lib/brief/package'),
          import('@/lib/process-states-client'),
          import('@/lib/process-states'),
          import('jszip'),
        ]);

      const bpmn = exporter.buildBpmnExportFromSource(signedSource.source, {
        processName: project?.name || signedSource.fileName,
        sourceFileName: signedSource.fileName,
        names: 'plain',
        wrap: exporter.READING_WRAP,
      });

      const view = idStr ? await statesClient.fetchProcessStates(idStr) : null;
      const states = view
        ? statesModel.readProcessStates(view.entries, statesModel.subjectIdsOf(view.subjects))
        : null;

      const brief = briefModel.buildProcessBrief({
        map: processMap.model,
        stats: bpmn.stats,
        rules: rules.deriveBusinessRules(signedSource.source),
        coverage: coverage.assessCoverage(signedSource.source),
        states,
      });

      const pack = briefPackage.buildBriefPackage({
        brief,
        bpmnXml: bpmn.xml,
        name: `${project?.name || 'Project'}_Process`,
        generatedAt: new Date().toISOString(),
      });

      const zip = new zipModule.default();
      for (const file of pack.files) zip.file(file.name, file.data);
      saveAs(await zip.generateAsync({ type: 'blob' }), pack.name);
    } catch (err: unknown) {
      console.error('Brief export failed:', err);
      setBriefError('The brief could not be written from this source.');
    } finally {
      setIsBuildingBrief(false);
    }
  };

  /**
   * The Confluence page — of the engine document, or of a legacy blueprint.
   * Both templates live in `lib/documentation-export.ts` (block D, D.16a):
   * they are documents with a stylesheet of their own, not this screen.
   */
  const phases = workflowSteps(project);
  /**
   * Owner decision 30.09.2026 (QA c8ae21453b3b): a stale documentation stays
   * exportable, but neither the button nor the file hides that it is stale.
   * The state is the workflow contract's (`lib/workflow-steps.ts`), the same
   * one the stepper and the stale notice above read.
   */
  const documentationStale = phases.find((p) => p.key === 'documentation')?.state === 'stale';

  const downloadConfluenceHTML = () => {
    const options = { stale: documentationStale };
    const blob = engineDoc
      ? buildEngineConfluenceHtml(engineDoc, parsedBusinessDoc, options)
      : parsedDoc
        ? buildLegacyConfluenceHtml(parsedDoc, parsedBusinessDoc, options)
        : null;
    if (!blob) return;
    saveAs(blob, confluenceFileName(project?.name));
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
   * What the business layer costs before the click — DESIGN.md §2.8. Every
   * part of it is a fact of this page: the model it names is the one
   * `generateBusinessDocumentation` passes to `/api/gemini`, the key is the one
   * `/api/model-stages` reports, and that route meters by the hour, not by the
   * analysis run.
   */
  const businessCostLine = `One model call (${PRODUCT_GEMINI_MODEL})${
    modelAvailability.keySource === 'byok' ? ', with your own Gemini key' : ''
  }. Not counted against your analysis runs; it counts toward the hourly limit on model calls of this account.`;

  const technicalPanel = engineDoc ? (
    <ProcessDocumentationView
      doc={engineDoc}
      proposal={{
        view: statementProposal.view,
        canRequest: isOwner,
        byok: modelAvailability.keySource === 'byok',
        requesting: statementProposal.requesting,
        message: statementProposal.message,
        onRequest: statementProposal.request,
      }}
    />
  ) : parsedDoc ? (
    <div className="space-y-6">
      {/* Roadmap 3.0.5 — a blueprint stored before the engine wrote this
          stage. Shown as it was, never migrated and never deleted, and
          said to be what it is before anything in it is read. */}
      <div data-legacy-blueprint>
        <CcMessageStrip state="warning">{LEGACY_BLUEPRINT_NOTICE}</CcMessageStrip>
      </div>

      {/* L1 & L2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={SECTION}>
          <div className="flex items-center gap-3 mb-4">
            <Briefcase size={20} aria-hidden={true} className="text-cc-ink-muted" />
            <div>
              <p className={LABEL}>Level 1 Blueprint</p>
              <h2 className={H2}>Business Domain</h2>
            </div>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className={LABEL}>Integration Domain</dt>
              <dd className="cc-text-h3 text-cc-ink">{parsedDoc.l1_domain?.name}</dd>
            </div>
            <div>
              <dt className={LABEL}>Strategic Goal</dt>
              <dd className="cc-text-body text-cc-ink">{parsedDoc.l1_domain?.strategicGoal}</dd>
            </div>
            <div>
              <dt className={LABEL}>Service Owner</dt>
              <dd className="mt-1"><CcTag>{parsedDoc.l1_domain?.owner}</CcTag></dd>
            </div>
          </dl>
        </section>

        <section className={SECTION}>
          <div className="flex items-center gap-3 mb-4">
            <Target size={20} aria-hidden={true} className="text-cc-ink-muted" />
            <div>
              <p className={LABEL}>Level 2 Blueprint</p>
              <h2 className={H2}>Process Area Group</h2>
            </div>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className={LABEL}>Process Area</dt>
              <dd className="cc-text-h3 text-cc-ink">{parsedDoc.l2_group?.name}</dd>
            </div>
            <div>
              <dt className={LABEL}>Functional Context</dt>
              <dd className="cc-text-body text-cc-ink">{parsedDoc.l2_group?.processArea}</dd>
            </div>
            <div>
              <dt className={LABEL}>KPI Framework</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                {(parsedDoc.l2_group?.kpis || []).map((kpi: string, i: number) => (
                  <CcTag key={i}>{kpi}</CcTag>
                ))}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Process Flow Map */}
      <section className={SECTION}>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <Activity size={20} aria-hidden={true} className="text-cc-ink-muted" />
            <div>
              <p className={LABEL}>Level 3 Flow</p>
              <h2 className={H2}>Interactive BPMN Map</h2>
            </div>
          </div>

          {/* BPMN legend — the shapes, each with its word. */}
          <div className="flex flex-wrap items-center gap-3 cc-text-meta text-cc-ink-muted">
            <span className={LABEL}>Legend:</span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden={true} className="inline-block h-3 w-3 rounded-full border border-cc-ink-muted" />
              Start
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden={true} className="inline-block h-3 w-4 rounded-cc-row border border-cc-ink-muted" />
              Task
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden={true} className="inline-block h-3 w-3 rotate-45 border border-cc-ink-muted" />
              Gateway
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden={true} className="inline-block h-3 w-3 rounded-full border-2 border-cc-ink" />
              End
            </span>
          </div>
        </div>
        <div className="relative">
          {parsedDoc.l3_flow && (
            <ProcessFlow flow={parsedDoc.l3_flow} tasks={parsedDoc.l4_tasks} onNodeClick={handleNodeClick} />
          )}
        </div>
        <p className="mt-2 cc-text-meta text-cc-ink-muted">Tip: select a node to open its task specification below.</p>
      </section>

      {/* Task Definitions */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Settings size={20} aria-hidden={true} className="text-cc-ink-muted" />
          <div>
            <p className={LABEL}>Level 4</p>
            <h2 className={H2}>Architectural Task Index</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(parsedDoc.l4_tasks || []).map((task: any, i: number) => {
            const isHighlighted = highlightedTaskId === task.stepId;
            return (
              <article
                key={i}
                id={`task-${task.stepId}`}
                data-task-card={task.stepId}
                className={clsx(
                  'flex flex-col rounded-cc-card border bg-cc-surface p-4 shadow-cc',
                  isHighlighted ? 'border-cc-ink bg-cc-surface-muted' : 'border-cc-line',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="cc-text-identifier font-cc-mono text-cc-ink">Task {task.stepId}</span>
                  <CcTag>Complexity: {task.complexity || 'Low'}</CcTag>
                </div>

                <h3 className="cc-text-h3 text-cc-ink mb-1">{task.name || `Task ${task.stepId}`}</h3>
                <p className="cc-text-cell text-cc-ink-muted mb-4 flex-grow">{task.description}</p>

                <dl className="grid grid-cols-2 gap-3 border-t border-cc-line pt-3">
                  <div className="min-w-0">
                    <dt className={clsx(LABEL, 'flex items-center gap-1')}>
                      <Layers size={12} aria-hidden={true} className="shrink-0" /> Inputs
                    </dt>
                    <dd className="cc-text-cell text-cc-ink break-words">{(task.inputs || []).join(', ') || 'N/A'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={clsx(LABEL, 'flex items-center gap-1')}>
                      <Box size={12} aria-hidden={true} className="shrink-0" /> Outputs
                    </dt>
                    <dd className="cc-text-cell text-cc-ink break-words">{(task.outputs || []).join(', ') || 'N/A'}</dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className={LABEL}>Systems</dt>
                    <dd className="cc-text-cell text-cc-ink break-words">
                      {Array.isArray(task.systems) ? task.systems.join(', ') : (task.systems || 'Not stated')}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <CcButton
                    onClick={() => setActiveTask(task)}
                    icon={<FileCode2 size={16} aria-hidden={true} />}
                    data-open-task={task.stepId}
                  >
                    Open specification
                  </CcButton>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  ) : null;

  const businessPanel = (
    <div className="space-y-6">
      {isGeneratingBusinessDoc ? (
        <section className={SECTION} aria-busy="true">
          <h2 className={H2}>Mapping SOP &amp; RACI Matrix</h2>
          <p className="cc-text-cell text-cc-ink-muted mt-1 mb-4 max-w-2xl">
            Gemini is evaluating executing roles, drafting operational playbook instructions, and defining target compliance checkpoints.
          </p>
          <CcSkeleton shape="table" label="the business layer" count={3} />
        </section>
      ) : parsedBusinessDoc ? (
        <div data-stage-output="businessDocumentation" className="space-y-6">
          {/* RACI Matrix Section */}
          <section className={SECTION}>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-3">
                <Users size={20} aria-hidden={true} className="text-cc-ink-muted" />
                <div>
                  <p className={LABEL}>Level 5</p>
                  <h2 className={clsx(H2, 'flex flex-wrap items-center gap-2')}>
                    RACI Assignment Matrix <CcProvenanceChip value="proposed" />
                  </h2>
                </div>
              </div>

              {/* RACI legend — the letters the column heads carry. */}
              <div className="flex flex-wrap items-center gap-3 cc-text-meta text-cc-ink-muted">
                <span className={LABEL}>RACI Guide:</span>
                <span className="inline-flex items-center gap-1"><CcTag>R</CcTag> Responsible</span>
                <span className="inline-flex items-center gap-1"><CcTag>A</CcTag> Accountable</span>
                <span className="inline-flex items-center gap-1"><CcTag>C</CcTag> Consulted</span>
                <span className="inline-flex items-center gap-1"><CcTag>I</CcTag> Informed</span>
              </div>
            </div>

            <CcTable
              caption="RACI assignment matrix"
              columns={[
                { key: 'step', label: 'Step ID', width: '120px' },
                { key: 'r', label: 'Responsible (R)' },
                { key: 'a', label: 'Accountable (A)' },
                { key: 'c', label: 'Consulted (C)' },
                { key: 'i', label: 'Informed (I)' },
              ]}
              rows={(parsedBusinessDoc.raci_matrix || []).map((raci: any, rIdx: number) => ({
                key: String(rIdx),
                cells: {
                  step: <span className="font-cc-mono">{raci.stepId}</span>,
                  r: raci.r || 'N/A',
                  a: raci.a || 'N/A',
                  c: raci.c || 'N/A',
                  i: raci.i || 'N/A',
                },
              }))}
            />
          </section>

          {/* SOP Narratives Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <Briefcase size={20} aria-hidden={true} className="text-cc-ink-muted" />
              <div>
                <p className={LABEL}>Level 5 SOP</p>
                <h2 className={clsx(H2, 'flex flex-wrap items-center gap-2')}>
                  Standard Operating Procedures <CcProvenanceChip value="proposed" />
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(parsedBusinessDoc.sop_details || []).map((sop: any, sIdx: number) => (
                <article key={sIdx} className={SECTION}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="cc-text-identifier font-cc-mono text-cc-ink">Step {sop.stepId}</span>
                    <span className="cc-text-meta text-cc-ink-muted inline-flex items-center gap-1">
                      <Activity size={14} aria-hidden={true} /> Target: {sop.kpiTarget}
                    </span>
                  </div>
                  <h3 className={LABEL}>Operational Narrative</h3>
                  <p className="cc-text-cell text-cc-ink mt-1 mb-3">{sop.narrative}</p>
                  <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                    <h3 className={LABEL}>Business Exception Fallback</h3>
                    <p className="cc-text-cell text-cc-ink mt-1">{sop.businessException}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Internal Controls Section */}
          <section className={SECTION}>
            <div className="flex items-center gap-3 mb-4">
              <Lock size={20} aria-hidden={true} className="text-cc-ink-muted" />
              <div>
                <p className={LABEL}>Compliance Audit</p>
                <h2 className={clsx(H2, 'flex flex-wrap items-center gap-2')}>
                  Risk &amp; Control Checkpoints <CcProvenanceChip value="proposed" />
                </h2>
              </div>
            </div>
            <CcTable
              caption="Risk and control checkpoints"
              columns={[
                { key: 'step', label: 'Step', width: '120px' },
                { key: 'objective', label: 'Control Objective' },
                { key: 'mitigation', label: 'Mitigation Action' },
                { key: 'assertion', label: 'Assertion Method' },
              ]}
              rows={(parsedBusinessDoc.audit_controls || []).map((ctrl: any, cIdx: number) => ({
                key: String(cIdx),
                cells: {
                  step: <span className="font-cc-mono">{ctrl.stepId}</span>,
                  objective: <span className="font-semibold">{ctrl.controlObjective}</span>,
                  mitigation: ctrl.mitigationAction,
                  assertion: ctrl.assertionMethod,
                },
              }))}
            />
          </section>
        </div>
      ) : (
        <section data-business-layer-offer className={SECTION}>
          <div className="max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className={H2}>Generate Enterprise Business SOP &amp; RACI Matrix</h2>
              <CcProvenanceChip value="proposed" />
            </div>
            <p className="cc-text-body text-cc-ink-muted mb-4">
              Unlock business-level mapping to align technical Clean Core changes with corporate compliance frameworks and operational execution procedures.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
                <p className={clsx(LABEL, 'flex items-center gap-2 mb-1')}>
                  <Users size={16} aria-hidden={true} /> RACI Assignment
                </p>
                <p className="cc-text-cell text-cc-ink">Maps Responsible, Accountable, Consulted, and Informed roles across all process tasks.</p>
              </div>
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
                <p className={clsx(LABEL, 'flex items-center gap-2 mb-1')}>
                  <Layers size={16} aria-hidden={true} /> Level 5 Narratives
                </p>
                <p className="cc-text-cell text-cc-ink">Drafts standard operating narratives, KPI targets, and functional exception handling guidance.</p>
              </div>
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
                <p className={clsx(LABEL, 'flex items-center gap-2 mb-1')}>
                  <Lock size={16} aria-hidden={true} /> Internal Audit Controls
                </p>
                <p className="cc-text-cell text-cc-ink">Identifies key clean core control objectives, mitigating actions, and assertion evidence methods.</p>
              </div>
            </div>

            {!modelAvailability.enabled('documentation') ? (
              <NotGenerated
                what="Business SOP and RACI layer"
                absence={modelAvailability.keyAvailable ? 'stage-off' : 'no-key'}
                stage="documentation"
                hint={
                  modelAvailability.keyAvailable
                    ? 'Turn the documentation stage back on in Settings to generate it.'
                    : 'Add your own Gemini API key in Settings to generate it.'
                }
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <CcButton
                  variant="primary"
                  density="cozy"
                  onClick={generateBusinessDocumentation}
                  disabled={isGeneratingDoc}
                  busy={isGeneratingBusinessDoc}
                  icon={<Rocket size={16} aria-hidden={true} />}
                  data-generate-business-layer
                >
                  Generate business layer
                </CcButton>
                <span data-business-layer-cost className="cc-text-meta text-cc-ink-muted">{businessCostLine}</span>
              </div>
            )}

            {businessDocError && (
              <div className="mt-4">
                <CcMessageStrip
                  state="error"
                  headline="The business layer was not generated."
                  actions={
                    modelAvailability.enabled('documentation')
                      ? <CcButton onClick={generateBusinessDocumentation} disabled={isGeneratingDoc}>Try again</CcButton>
                      : undefined
                  }
                >
                  {businessDocError}
                </CcMessageStrip>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <StageFrame stage="documentation" className="min-h-screen">
      <StaleNotice
        title={`Built for ${previousBasis(project)}`}
        reasons={[
          ...generationBlockers(project, 'documentation'),
          ...(documentationStale
            ? [`The blueprint shown here was written for ${previousBasis(project)}.`]
            : []),
        ]}
      />

      {/* Owner decision 01.10.2026 — proposal B, "canvas first": a slim title
          with the two exports a reader takes away, the process map as the
          stage, one chapter of the handbook beside it, the chapters in a drawer
          below. The frame (progress, header, back link) is shared and unstyled
          here; everything under it is this stage's. */}
      <StageHeader tools={{ steps: phases, current: 'documentation' }}
        stage="documentation"
        projectName={project?.name}
        eyebrow={
          <CcProvenanceChip
            value={documentationStale ? 'stale' : 'reconstructed'}
            note={documentationStale ? 'regenerate first' : hasDocument ? 'current' : 'code reading'}
          />
        }
        actions={signedSource ? (
          <>
            {/* Roadmap 4.4 — the brief: a PDF and the BPMN in one archive.
                Offered once the map is read, because before that there is no
                process to describe. */}
            {processMap.model ? (
              <CcButton
                density="cozy"
                onClick={downloadBrief}
                busy={isBuildingBrief}
                data-export-brief
                aria-label="PDF brief — export the PDF and the BPMN file in one archive"
                icon={<Printer size={16} aria-hidden={true} />}
              >
                PDF
              </CcButton>
            ) : null}
            {/* Roadmap 2.6 — drawn from the skeleton of the signed run, so it
                exists as soon as the run does and says nothing the code does
                not. Without a signed source there is nothing true to export. */}
            <CcButton
              variant="secondary"
              density="cozy"
              onClick={downloadBPMN}
              data-export-bpmn
              aria-label="Export BPMN 2.0"
              icon={<Download size={16} aria-hidden={true} />}
            >
              BPMN 2.0
            </CcButton>
          </>
        ) : undefined}
      />

      {briefError && (
        <div className="mb-4 max-w-xl">
          <CcMessageStrip state="error">
            <span data-brief-error>{briefError}</span>
          </CcMessageStrip>
        </div>
      )}

      <HandbookStage
        handbook={handbook.handbook}
        reading={handbook.status === 'loading' || processMap.status === 'loading'}
        model={processMap.model}
        selected={resolved.node}
        onSelect={selectElement}
        source={signedSource?.source ?? null}
        freshness={documentationStale ? 'stale' : hasDocument ? 'current' : 'not-saved'}
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

      <HandbookDrawer
        handbook={handbook.handbook}
        reading={handbook.status === 'loading'}
        selectedChapter={resolved.node ? (handbook.handbook?.chapterOf.get(resolved.node) ?? null) : null}
        onSelect={selectElement}
        exportActions={
          <>
            {signedSource && processMap.model ? (
              <CcButton onClick={downloadBrief} busy={isBuildingBrief} icon={<Printer size={14} aria-hidden={true} />}>
                PDF
              </CcButton>
            ) : null}
            {/* The Confluence page waits for a stored documentation — there is
                nothing to export before one exists. A stale one stays
                exportable, and neither the button nor the file hides that it
                is stale (owner decision 30.09.2026, QA c8ae21453b3b). */}
            {hasDocument ? (
              <span className="inline-flex flex-col items-start gap-1">
                <CcButton
                  onClick={downloadConfluenceHTML}
                  disabled={isGeneratingDoc}
                  data-export-confluence={documentationStale ? 'stale' : 'current'}
                  aria-describedby={documentationStale ? 'confluence-export-stale' : undefined}
                  aria-label="Export Confluence"
                  icon={<ExternalLink size={14} aria-hidden={true} />}
                >
                  Confluence
                </CcButton>
                {/* The file opens with the same note (`STALE_EXPORT_NOTE`). */}
                {documentationStale && (
                  <span id="confluence-export-stale" data-confluence-stale-note="">
                    <CcStateText state="warning">Stale — regenerate first</CcStateText>
                  </span>
                )}
              </span>
            ) : null}
            {signedSource ? (
              <CcButton variant="secondary" onClick={downloadBPMN} icon={<Download size={14} aria-hidden={true} />}>
                BPMN 2.0
              </CcButton>
            ) : null}
          </>
        }
        exportNotes={
          <>
            {/* Roadmap 0.2 (UX-029): what the BPMN file is, and the part that is
                not established — whether it lands in Signavio or SAP Build — in
                the same breath, never on hover. */}
            <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
              <CcTag>BPMN 2.0 XML</CcTag>
              <span data-export-caveat>Import into SAP Signavio or SAP Build has not been verified yet.</span>
            </p>
            {/* Roadmap 4.4 — what the brief holds, said before it is asked for. */}
            <p data-brief-caveat className="m-0 cc-text-meta text-cc-ink-muted">
              The PDF brief is a PDF and the BPMN file in one archive. Every statement in it names the lines it was
              read from, or says that it is not determined. It is a summary, not a signed audit pack.
            </p>
          </>
        }
        exportPanel={
          <dl className="m-0 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-cc-row border border-cc-line p-4">
              <dt className="cc-text-h3 text-cc-ink">PDF brief</dt>
              <dd className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                The process picture, the rules and the open questions, each with its lines, and the BPMN file beside it
                in one archive. A summary, not a signed audit pack.
              </dd>
            </div>
            <div className="rounded-cc-row border border-cc-line p-4">
              <dt className="cc-text-h3 text-cc-ink">Confluence page</dt>
              <dd className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                {hasDocument
                  ? 'The stored documentation as an HTML page to paste into Confluence. A stale one says so at the top.'
                  : 'Available once the documentation has been saved from the code below.'}
              </dd>
            </div>
            <div className="rounded-cc-row border border-cc-line p-4">
              <dt className="cc-text-h3 text-cc-ink">BPMN 2.0</dt>
              <dd className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                The process as the code runs it, every task and decision with its line range, for SAP Signavio or
                another modeller. Import has not been verified yet.
              </dd>
            </div>
          </dl>
        }
      />

      {/* Two different things used to share one heading. A blocked start is a
          refusal before anything is read; a refused answer is a reading that
          happened and produced something this stage cannot display. */}
      {docError && (
        <div data-doc-error={docRejected ? 'rejected' : 'blocked'} className="mt-6">
          <CcMessageStrip
            state="error"
            headline={docRejected ? 'Generation failed' : 'Generation blocked'}
            actions={docRejected ? (
              <CcButton onClick={generateDocumentation} disabled={!signedSource || !processMap.model || isGeneratingDoc}>
                Try again
              </CcButton>
            ) : undefined}
          >
            {docError}
          </CcMessageStrip>
        </div>
      )}

      {/* One level deeper: the documentation as it is stored and exported —
          the engine's document element by element, and the business layer a
          model may propose on top of it. */}
      <section aria-labelledby="documentation-stored" className="mt-8 mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="documentation-stored" className="m-0 cc-text-h2 text-cc-ink">The documentation as stored</h2>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
              What the Confluence page and the handover carry, element by element, with the business layer beside it.
            </p>
          </div>
          {hasDocument ? (
            <CcButton
              variant="primary"
              density="cozy"
              onClick={generateDocumentation}
              disabled={isGeneratingBusinessDoc || !signedSource || !processMap.model}
              busy={isGeneratingDoc}
              data-regenerate-documentation
              icon={<RefreshCw size={16} aria-hidden={true} />}
            >
              {engineDoc ? 'Read again from the code' : 'Replace with the code reading'}
            </CcButton>
          ) : null}
        </div>

        {isGeneratingDoc ? (
          <div className={SECTION} aria-busy="true">
            <h3 className={H2}>Reading the process</h3>
            <p className="cc-text-cell text-cc-ink-muted mt-1 mb-4">Putting the documentation together from the whole source…</p>
            <CcSkeleton shape="text" label="the process documentation" count={4} />
          </div>
        ) : hasDocument ? (
          <div id="documentation-report" data-stage-output="documentation">
            <CcTabs
              label="Documentation"
              value={activeTab}
              onChange={setActiveTab}
              density="cozy"
              tabs={[
                {
                  value: 'technical',
                  label: engineDoc ? 'Process documentation' : 'Technical Blueprint',
                  content: technicalPanel,
                },
                {
                  value: 'business',
                  // Said in words, not an amber dot (§2.4).
                  label: parsedBusinessDoc ? 'Business SOP & Compliance' : 'Business SOP & Compliance · not generated',
                  content: businessPanel,
                },
              ]}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Said before either branch, because it is true in both. */}
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
              It is read out of the whole source the active run signed: the process element by element, what each part
              does, the update task and the lanes the code proves, every statement with its lines. No language model is
              involved. Saving it is what the Confluence page and the handover export.
            </CcEmptyState>
          </div>
        )}
      </section>

      {/* Roadmap 3.2 — what was kept, and what changed between two of them. */}
      {signedSource && (
        <section data-process-revisions-section className={clsx(SECTION, 'mb-8')}>
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

      {/* Level 4 task specification — a dialog (§2.6). Focus in, Tab kept
          inside, Escape closes, focus back to the button that opened it: the
          same modal contract the hand-built drawer had (UX-034, roadmap 3.0.4),
          now from the library. */}
      <CcDialog
        open={activeTask !== null}
        onClose={() => setActiveTask(null)}
        title={activeTask ? (activeTask.name || `Task ${activeTask.stepId}`) : ''}
        lead="Level 4 task specification"
        size="wide"
        data-task-dialog=""
        actions={<CcButton onClick={() => setActiveTask(null)}>Close specification</CcButton>}
      >
        {activeTask && (
          <div className="space-y-4">
            <div>
              <h3 className={LABEL}>Functional Description &amp; Role Responsibility</h3>
              <p className="cc-text-body text-cc-ink mt-1">{activeTask.description}</p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-cc-line py-3">
              <div>
                <dt className={LABEL}>Step ID</dt>
                <dd className="cc-text-identifier font-cc-mono text-cc-ink mt-1">{activeTask.stepId}</dd>
              </div>
              <div>
                <dt className={LABEL}>Logic Complexity</dt>
                <dd className="mt-1"><CcTag>{activeTask.complexity || 'Low'}</CcTag></dd>
              </div>
              <div>
                <dt className={LABEL}>Estimated Effort</dt>
                <dd className="cc-text-cell text-cc-ink mt-1">{activeTask.estimatedDuration || 'Not stated'}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                <h3 className={clsx(LABEL, 'flex items-center gap-2 mb-1')}>
                  <Layers size={14} aria-hidden={true} /> Input Parameters
                </h3>
                <ul className="space-y-1 cc-text-cell text-cc-ink list-disc pl-4">
                  {(activeTask.inputs || []).map((inp: string, idx: number) => (
                    <li key={idx}>{inp}</li>
                  ))}
                  {(!activeTask.inputs || activeTask.inputs.length === 0) && <li>N/A</li>}
                </ul>
              </div>
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                <h3 className={clsx(LABEL, 'flex items-center gap-2 mb-1')}>
                  <Box size={14} aria-hidden={true} /> Output Results
                </h3>
                <ul className="space-y-1 cc-text-cell text-cc-ink list-disc pl-4">
                  {(activeTask.outputs || []).map((out: string, idx: number) => (
                    <li key={idx}>{out}</li>
                  ))}
                  {(!activeTask.outputs || activeTask.outputs.length === 0) && <li>N/A</li>}
                </ul>
              </div>
            </div>

            <div>
              <h3 className={clsx(LABEL, 'mb-2')}>Target Platform &amp; Tech Stack</h3>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(activeTask.systems) ? activeTask.systems : [activeTask.systems || 'Not stated']).map((sys: string, idx: number) => (
                  <CcTag key={idx}>{sys}</CcTag>
                ))}
              </div>
            </div>

            <div>
              <h3 className={clsx(LABEL, 'mb-2')}>Technical &amp; Execution Mapping</h3>
              {/* What the blueprint stored, or that it stored nothing. The
                  hand-built drawer printed an invented `router.post('/sync')`
                  handler when the field was empty — code nobody wrote, dressed
                  as the mapping of this task. */}
              {activeTask.technicalMapping ? (
                <pre className="m-0 max-h-[220px] overflow-auto rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 font-cc-mono text-[12px] leading-5 text-cc-ink">
                  <code>{activeTask.technicalMapping}</code>
                </pre>
              ) : (
                <p className="cc-text-cell text-cc-ink-muted">Not stated</p>
              )}
            </div>
          </div>
        )}
      </CcDialog>

      <StageFooter />
    </StageFrame>
  );
}
