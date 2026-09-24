'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import Stepper from '@/components/Stepper';
import NavigationButtons from '@/components/NavigationButtons';
import { Download, ArrowLeft, ArrowRight, RefreshCw, AlertCircle, FileCode2, Briefcase, Target, Users, Settings, Activity, Layers, Cpu, Database, Box, Lock, CheckCircle2, X, Rocket } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import NotGenerated from '@/components/NotGenerated';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';
import {
  LEGACY_BLUEPRINT_NOTICE,
  anchorsWords,
  processDocumentationToMarkdown,
  readStoredDocumentation,
  stepEvidence,
  type ProcessDocumentation,
} from '@/lib/process-documentation';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import { saveAs } from '@/lib/fileSaver';
import VerificationRail from '@/components/VerificationRail';
import StageHeader from '@/components/StageHeader';
import { workflowSteps, generationBlockers } from '@/lib/workflow-steps';
import StaleNotice from '@/components/StaleNotice';
import { escapeHtml } from '@/lib/utils';
import { sha256Hex } from '@/lib/artefact-digest';
import { useProcessMap } from '@/hooks/useProcessMap';
import { useProcessMapAddress } from '@/hooks/useProcessMapAddress';
import { buildNavigation, levelOf, resolveMapAddress } from '@/lib/process-navigation';
import {
  ensureProcessBaseline,
  revisionOutcomeSentence,
  saveProcessRevision,
} from '@/lib/process-revisions-client';
import type {
  SaveProcessModelInput,
  SaveProcessModelResult,
} from '@/components/process-map/BpmnEditor';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import {
  checkBlueprintShape,
  STORED_BLUEPRINT_REJECTED,
} from './blueprint-schema';

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
  useUserProfile();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [documentation, setDocumentation] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  /** True when `docError` is a refused model answer rather than a blocked start. */
  const [docRejected, setDocRejected] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
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
      return extractJSON(businessDocumentation);
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
      
      const parsed = extractJSON(responseText);
      if (!parsed.raci_matrix || !parsed.sop_details || !parsed.audit_controls) {
        throw new Error("Invalid business documentation schema returned by AI");
      }
      
      setBusinessDocumentation(responseText);
      
      // One transaction, for the same reason as above (ade8ec0b8903).
      const projectDoc = doc(getDb(), 'projects', idStr);
      const updatedCode = await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(projectDoc);
        const merged = addOrUpdateFileInWorkspace(snap.data()?.generatedCode ?? project.generatedCode, 'docs/business-documentation.md', formatBusinessDocsToMarkdown(responseText));
        tx.update(projectDoc, { businessDocumentation: responseText, generatedCode: merged });
        return merged;
      });

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
        const merged = addOrUpdateFileInWorkspace(current.generatedCode ?? project.generatedCode, 'docs/process-blueprint.md', processDocumentationToMarkdown(built));
        tx.update(projectDoc, { documentation: stored, generatedCode: merged, status: 'documented' });
        return merged;
      });

      // Shown only once it is stored: a document the transaction refused is
      // not this project's documentation.
      setDocumentation(stored);
      setProject(prev => prev ? { ...prev, documentation: stored, generatedCode: updatedCode, status: 'documented' } : null);
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
    if (!idStr || !signedSource) return;
    let cancelled = false;
    void ensureProcessBaseline(idStr).then((outcome) => {
      if (cancelled || !outcome.ok) return;
      baseRevision.current = outcome.record.revision;
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

  const downloadBPMN = async () => {
    if (!signedSource) return;
    // Loaded on the click: the reader of this stage pays for the ABAP reader
    // only when they ask for the file.
    const { buildBpmnExportFromSource, bpmnFileName } = await import('@/lib/bpmn/export');
    const { xml } = buildBpmnExportFromSource(signedSource.source, {
      processName: project?.name || signedSource.fileName,
      sourceFileName: signedSource.fileName,
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

  const downloadConfluenceHTML = () => {
    if (engineDoc) {
      downloadEngineConfluenceHTML(engineDoc);
      return;
    }
    if (!parsedDoc) return;

    /**
     * The export is an HTML document a reviewer opens, and every value in it
     * was written by the model from the customer's own ABAP — a comment in the
     * source is enough to steer it into returning markup (QA review of
     * 33471220d6e9, 06f7c0c56a6c). Nothing generated reaches the document
     * unescaped; the markup around it is ours.
     */
    const esc = escapeHtml;

    const confluenceCSS = `
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172B4D; line-height: 1.6; padding: 20px; }
        .doc-header { background: #0747A6; color: white; padding: 24px; border-radius: 8px; margin-bottom: 30px; }
        .doc-header h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; }
        .doc-header p { margin: 8px 0 0 0; opacity: 0.8; font-weight: 500; }
        h2 { color: #0747A6; border-bottom: 2px solid #DFE1E6; padding-bottom: 8px; margin-top: 40px; font-size: 20px; text-transform: uppercase; }
        .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .meta-card { background: #F4F5F7; padding: 20px; border-radius: 8px; border: 1px solid #DFE1E6; }
        .meta-card h3 { margin: 0 0 10px 0; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; }
        .meta-card p { margin: 0; font-weight: 600; font-size: 15px; }
        .meta-card .badge { display: inline-block; background: #DEEBFF; color: #0747A6; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 8px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        th, td { border: 1px solid #DFE1E6; padding: 12px; text-align: left; }
        th { background-color: #F4F5F7; font-weight: 700; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .complexity-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .complexity-high { background: #FFEBE6; color: #BF2600; }
        .complexity-medium { background: #FFF0B3; color: #172B4D; }
        .complexity-low { background: #EAE6FF; color: #403294; }
        .tech-pill { display: inline-block; background: #E3FCEF; color: #006644; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 4px; }
      </style>
    `;

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          ${confluenceCSS}
        </head>
        <body>
          <div class="doc-header">
            <h1>${esc(parsedDoc.l1_domain?.name || 'Process Blueprint')}</h1>
            <p>Enterprise Integration Specifications & Workflow Definition</p>
          </div>
          
          <div class="meta-grid">
            <div class="meta-card">
              <h3>Level 1: Business Domain Blueprint</h3>
              <p><strong>Strategic Goal:</strong> ${esc(parsedDoc.l1_domain?.strategicGoal || 'N/A')}</p>
              <div class="badge">Owner: ${esc(parsedDoc.l1_domain?.owner || 'N/A')}</div>
            </div>
            
            <div class="meta-card">
              <h3>Level 2: Process Area Group</h3>
              <p><strong>Process Area:</strong> ${esc(parsedDoc.l2_group?.processArea || 'N/A')}</p>
              <p style="margin-top: 10px;"><strong>KPI Framework:</strong></p>
              <div style="margin-top: 5px;">
                ${(parsedDoc.l2_group?.kpis || []).map((kpi: string) => `<span class="tech-pill">${esc(kpi)}</span>`).join('')}
              </div>
            </div>
          </div>
          
          <h2>Level 4: Architectural Task Specifications</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 10%">ID</th>
                <th style="width: 25%">Task Name</th>
                <th style="width: 35%">Functional Description</th>
                <th style="width: 15%">Complexity</th>
                <th style="width: 15%">Technology Stack</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedDoc.l4_tasks || []).map((task: any) => `
                <tr>
                  <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(task.stepId)}</td>
                  <td><strong>${esc(task.name) || `Task ${esc(task.stepId)}`}</strong></td>
                   <td>
                     <p style="margin: 0;">${esc(task.description)}</p>
                     <p style="margin: 6px 0 0 0; font-size: 11px; color: #6B778C;">
                       <strong>Inputs:</strong> ${esc((task.inputs || []).join(', ') || 'N/A')} | 
                       <strong>Outputs:</strong> ${esc((task.outputs || []).join(', ') || 'N/A')}
                     </p>
                   </td>
                  <td>
                    <span class="complexity-badge ${
                      task.complexity === 'High' ? 'complexity-high' :
                      task.complexity === 'Medium' ? 'complexity-medium' :
                      'complexity-low'
                    }">${esc(task.complexity || 'Low')}</span>
                  </td>
                  <td>
                    ${(task.systems || []).map((sys: string) => `<span class="tech-pill">${esc(sys)}</span>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          ${parsedBusinessDoc ? `
            <h2>Level 5: Standard Operating Procedures (SOP) & RACI Assignment</h2>
            
            <h3>RACI Assignment Matrix</h3>
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Responsible (R)</th>
                  <th>Accountable (A)</th>
                  <th>Consulted (C)</th>
                  <th>Informed (I)</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.raci_matrix || []).map((raci: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(raci.stepId)}</td>
                    <td>${esc(raci.r || 'N/A')}</td>
                    <td>${esc(raci.a || 'N/A')}</td>
                    <td>${esc(raci.c || 'N/A')}</td>
                    <td>${esc(raci.i || 'N/A')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h3>SOP Operational Playbook</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 15%">Task ID</th>
                  <th style="width: 50%">Operational SOP Description</th>
                  <th style="width: 20%">Business Exception Fallback</th>
                  <th style="width: 15%">KPI Success Metric</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.sop_details || []).map((sop: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(sop.stepId)}</td>
                    <td>${esc(sop.narrative || 'N/A')}</td>
                    <td style="color: #BF2600; font-weight: 500;">${esc(sop.businessException || 'N/A')}</td>
                    <td style="font-weight: 600; color: #006644;">${esc(sop.kpiTarget || 'N/A')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h3>Internal Audit Compliance & Risk Controls</h3>
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Control Objective</th>
                  <th>Mitigation Action</th>
                  <th>Assertion Verification Method</th>
                </tr>
              </thead>
              <tbody>
                ${(parsedBusinessDoc.audit_controls || []).map((ctrl: any) => `
                  <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(ctrl.stepId)}</td>
                    <td><strong>${esc(ctrl.controlObjective || 'N/A')}</strong></td>
                    <td>${esc(ctrl.mitigationAction || 'N/A')}</td>
                    <td style="font-family: monospace; font-size: 11px;">${esc(ctrl.assertionMethod || 'N/A')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
    saveAs(blob, `${fileName}_Confluence.html`);
  };

  /**
   * Roadmap 3.0.5 — the Confluence page of the engine document: the same
   * content as the stage shows, every value escaped, nothing added. The
   * business layer, when there is one, follows as a model proposal.
   */
  const downloadEngineConfluenceHTML = (engine: ProcessDocumentation) => {
    const esc = escapeHtml;
    const statementById = new Map(engine.statements.map((s) => [s.id, s]));
    const stepRows = engine.steps.map((step) => {
      const sentence = step.statementId ? statementById.get(step.statementId) : undefined;
      const name = step.businessName
        ? `${esc(step.businessName)} <small>(${esc(step.technicalName)}) — Model proposal</small>`
        : esc(step.technicalName);
      return `<tr><td><code>${esc(step.id)}</code><br>${esc(step.kind)}</td><td>${name}${step.lane ? `<br><small>Lane: ${esc(step.lane)} — Model proposal</small>` : ''}</td><td>${sentence ? esc(sentence.text) : ''}</td><td>${esc(stepEvidence(step))}</td></tr>`;
    }).join('');
    const statementSection = engine.statements
      .map((s) => `<li>${esc(s.text)} <small>— ${esc(anchorsWords(s.anchors))}</small></li>`)
      .join('');
    const gapSection = engine.notDetermined
      .map((g) => `<li><strong>${esc(g.subject)}:</strong> Not determined — ${esc(g.reason)}</li>`)
      .join('');
    // The business layer the stage shows below the engine document. It was
    // promised by the comment above and never written, so an export of a
    // project with an SOP left the SOP out (QA review of 4b4586aff273). Every
    // value in it was written by the model: it is marked as a proposal and
    // escaped like the rest.
    const businessSection = parsedBusinessDoc
      ? `<h2 data-business-layer="">Business layer — Model proposal</h2>
      <p><em>Written by a language model from the documentation above. Not derived from the code, and not verified.</em></p>
      <h3>RACI assignment</h3>
      <table><thead><tr><th>Step</th><th>Responsible (R)</th><th>Accountable (A)</th><th>Consulted (C)</th><th>Informed (I)</th></tr></thead><tbody>${(parsedBusinessDoc.raci_matrix || [])
        .map((raci: Record<string, unknown>) => `<tr><td><code>${esc(raci.stepId)}</code></td><td>${esc(raci.r || 'N/A')}</td><td>${esc(raci.a || 'N/A')}</td><td>${esc(raci.c || 'N/A')}</td><td>${esc(raci.i || 'N/A')}</td></tr>`)
        .join('')}</tbody></table>
      <h3>Standard operating procedure</h3>
      <table><thead><tr><th>Step</th><th>Description</th><th>Business exception</th><th>KPI</th></tr></thead><tbody>${(parsedBusinessDoc.sop_details || [])
        .map((sop: Record<string, unknown>) => `<tr><td><code>${esc(sop.stepId)}</code></td><td>${esc(sop.narrative || 'N/A')}</td><td>${esc(sop.businessException || 'N/A')}</td><td>${esc(sop.kpiTarget || 'N/A')}</td></tr>`)
        .join('')}</tbody></table>
      <h3>Audit controls</h3>
      <table><thead><tr><th>Step</th><th>Control objective</th><th>Mitigation</th><th>Verification</th></tr></thead><tbody>${(parsedBusinessDoc.audit_controls || [])
        .map((ctrl: Record<string, unknown>) => `<tr><td><code>${esc(ctrl.stepId)}</code></td><td>${esc(ctrl.controlObjective || 'N/A')}</td><td>${esc(ctrl.mitigationAction || 'N/A')}</td><td>${esc(ctrl.assertionMethod || 'N/A')}</td></tr>`)
        .join('')}</tbody></table>`
      : '';
    const engineHtml = `<html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172B4D; line-height: 1.6; padding: 20px; }
      table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #DFE1E6; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #F4F5F7; } small { color: #6B778C; }
    </style></head><body>
      <h1>Process documentation — ${esc(engine.processName)}</h1>
      <p><em>${esc(engine.disclaimer)}</em></p>
      <p>${esc(engine.fileName)}, ${esc(String(engine.lineCount))} lines. ${esc(engine.overview)} ${esc(engine.traceability.sentence)}</p>
      <h2>The process, element by element</h2>
      <table><thead><tr><th>Element</th><th>Name</th><th>What it does</th><th>Lines</th></tr></thead><tbody>${stepRows}</tbody></table>
      <h2>Business statements, across the whole program</h2><ul>${statementSection}</ul>
      <h2>Not determined from the code</h2><ul>${gapSection}</ul>
      ${businessSection}
    </body></html>`;
    const blob = new Blob([engineHtml], { type: 'text/html;charset=utf-8' });
    const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
    saveAs(blob, `${fileName}_Confluence.html`);
  };

  const phases = workflowSteps(project);

  if (loading) return (
    <div className="animate-in fade-in duration-500">
      {/* Where am I, what is behind me, what is still open — kept on
          screen while the stepper scrolls away. Both read the same contract;
          neither decides anything. */}
      <VerificationRail steps={phases} current="documentation" projectId={projectId as string} />

      <Stepper steps={phases} current="documentation" projectId={projectId as string} />
      <div className="h-[60vh] flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
          <p className="text-lg font-medium text-gray-400">Loading documentation...</p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8">
      {/* Rendered here as well as in the loading state — it used to exist only
          there, and disappeared as soon as the page had loaded. */}
      <VerificationRail steps={phases} current="documentation" projectId={projectId as string} />

      <Stepper steps={phases} current="documentation" projectId={projectId as string} />

      <StaleNotice
        title="Built for a previous source"
        reasons={[
          ...generationBlockers(project, 'documentation'),
          ...(phases.find((p) => p.key === 'documentation')?.state === 'stale'
            ? ['The blueprint shown here was written for a previous source.']
            : []),
        ]}
      />

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10 mt-6 md:mt-8">
        <div>
          <StageHeader title="Process Blueprint &amp; Mapping">
            Business Architecture &amp; BPMN Map
          </StageHeader>
          
          {/* Roadmap 0.2 (UX-029). Two badges used to stand here —
              "BPMN-Compatible" and "SAP Build-Compatible" — and the only thing
              that qualified either of them was a hover tooltip, which a phone
              or a tablet never shows. "Compatible" is a claim about a target
              system nobody has run this file through.

              What is true is what the button beside it does: it writes BPMN 2.0
              XML. That is stated plainly now, and the part that is not
              established — whether the file lands in Signavio or SAP Build,
              which nobody here has tried — is stated in the same breath rather
              than on hover. The SAP Build badge is gone
              rather than reworded: there is no SAP Build export on this page,
              so there was nothing for a second badge to describe. Step 4.3
              proves the round trip; this line changes when it does. */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Export format:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded text-[9px] font-black uppercase tracking-tight shadow-sm">
              BPMN 2.0 XML
            </span>
            <span data-export-caveat className="text-[10px] text-slate-500 font-medium normal-case">
              Import into SAP Signavio or SAP Build has not been verified yet.
            </span>
          </div>

          {/* Roadmap 4.4. What the second download holds, said before it is
              asked for: a summary carries no signature, and a reader who takes
              it for one has been misled by the button rather than by the file. */}
          <p data-brief-caveat className="mt-2 text-[10px] text-slate-500 font-medium normal-case max-w-xl">
            The brief is a PDF and the BPMN file in one archive. Every statement in it names the lines it was
            read from, or says that it is not determined. It is a summary, not a signed audit pack.
          </p>
          {briefError && (
            <p data-brief-error className="mt-1 text-[10px] text-red-600 font-semibold normal-case">
              {briefError}
            </p>
          )}
        </div>
        {/* Nothing to export, and nothing to regenerate, until a blueprint exists.
            The two exports and a green "Regenerate" used to sit above the words
            "No enterprise specifications yet" — two outputs of nothing, and a
            "re"-generate for something that had never been generated once. The
            empty state below carries the single action instead.

            The condition is `parsedDoc`, not `documentation`, and that is the
            whole point: the page below shows its empty state when the blueprint
            does not parse, while this bar was asking only whether some text had
            been stored. A stored document that yields no blueprint put both on
            the screen at once — the words "No enterprise specifications yet"
            with two exports above them (UX review of 52f171091948, 5bf7552894e5;
            visible in screenshot 07-documentation-desktop-s1). Two conditions
            for one question is how a screen ends up contradicting itself. */}
        <div className="flex flex-wrap gap-3">
          {/* Roadmap 2.6 — the one export here that does not wait for the
              blueprint. It is drawn from the skeleton of the signed run, so it
              exists as soon as the run does, and it says nothing the code does
              not: every task and gateway carries its line range. Without an
              active run, or after the source moved on from the one the run
              signed, there is nothing true to export and no button. */}
          {signedSource && (
            <button
              onClick={downloadBPMN}
              data-export-bpmn
              className="flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-xs md:text-sm uppercase tracking-widest border bg-white border-[#eff4ff] text-[#0b1c30] hover:bg-[#eff4ff]"
            >
              <FileCode2 size={16} /> Export BPMN
            </button>
          )}

          {/* Roadmap 4.4 — the brief. Offered on the same condition as the BPMN
              and one more: the map has to be read before there is a process to
              describe. It waits for no blueprint either, because everything in
              it comes from the code and from what accounts confirmed. */}
          {signedSource && processMap.model && (
            <button
              onClick={downloadBrief}
              disabled={isBuildingBrief}
              data-export-brief
              className="flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-xs md:text-sm uppercase tracking-widest border bg-white border-[#eff4ff] text-[#0b1c30] hover:bg-[#eff4ff] disabled:opacity-50"
            >
              <Briefcase size={16} /> {isBuildingBrief ? 'Writing brief…' : 'Export brief'}
            </button>
          )}

          <div className={`flex flex-wrap gap-3 ${hasDocument ? '' : 'hidden'}`}>
            <button
              onClick={downloadConfluenceHTML}
              disabled={!hasDocument || isGeneratingDoc}
              className="flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-xs md:text-sm uppercase tracking-widest border bg-white border-[#eff4ff] text-[#0b1c30] hover:bg-[#eff4ff] opacity-100 disabled:opacity-50"
            >
              <Download size={16} /> Export Confluence
            </button>

            <button
              onClick={generateDocumentation}
              disabled={isGeneratingDoc || isGeneratingBusinessDoc || !signedSource || !processMap.model}
              data-regenerate-documentation
              className="flex items-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all font-bold text-xs md:text-sm uppercase tracking-widest disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGeneratingDoc ? 'animate-spin' : ''}`} />
              {engineDoc ? 'Read again from the code' : 'Replace with the code reading'}
            </button>
          </div>
        </div>
      </div>

      {/* Roadmap 2.5 — the process as the engine read it, above everything a
          model wrote. It exists as soon as the run does: no blueprint, no key
          and no naming are needed for it, because it is the code. The
          documentation below it is written from the same reading (3.0.5); a
          blueprint stored before that is a model's account and is marked as
          one. Putting the evidence first is the order `DESIGN.md` §5 asks for. */}
      {signedSource && (
        <div data-process-map-section className="mb-10 rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
          {processMap.model ? (
            <ProcessMap
              model={processMap.model}
              source={signedSource.source}
              measuredAt={processMap.measuredAt}
              /* Roadmap 6.3 — the Usage overlay, and only when there is an
                 import. `usageReport` is a server-written field (roadmap 0.7,
                 `lib/project-commands.ts`); this reads it and never writes it,
                 and an absent import means the overlay is not offered rather
                 than offered empty. */
              usage={project?.usageReport ?? null}
              plane={resolved.plane}
              onPlaneChange={openPlane}
              selected={resolved.node}
              onSelectedChange={selectElement}
              save={saveProcessModel}
            />
          ) : (
            <p className="text-sm font-medium text-gray-500">
              {processMap.status === 'failed'
                ? processMap.reason
                : 'Reading the process out of the source…'}
            </p>
          )}

          {/* Roadmap 3.2 — what was kept, and what changed between two of them.
              Under the map rather than beside it: the process is the subject and
              its history is the account of it. It reads only; the effect above
              is what reconstructs revision 1, and `refreshKey` is what brings
              this list back after that and after every save. */}
          <div data-process-revisions-section className="mt-6 border-t border-gray-100 pt-6">
            <h4 className="mb-3 text-[15px] font-bold text-cc-ink">Revisions of this process</h4>
            <RevisionCompare
              projectId={(Array.isArray(projectId) ? projectId[0] : projectId) ?? ''}
              refreshKey={revisionsKey}
            />
          </div>
        </div>
      )}

      {/* Two different things used to share one heading. A blocked start is a
          refusal before the model is called; a refused answer is a generation
          that happened and produced something this stage cannot display.
          Calling the second one "blocked" told the reader the opposite of what
          occurred, and neither told him he could simply try again. */}
      {docError && (
        <div
          data-doc-error={docRejected ? 'rejected' : 'blocked'}
          className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-[2rem] mb-10 flex items-start gap-4 shadow-sm"
        >
          <div className="p-2 bg-red-100 rounded-xl text-red-600">
            <AlertCircle className="w-6 h-6 shrink-0" />
          </div>
          <div>
            <h3 className="font-bold text-red-900 uppercase tracking-tight">
              {docRejected ? 'Generation failed' : 'Generation Blocked'}
            </h3>
            <p className="text-sm text-red-700 font-medium mt-1 leading-relaxed">{docError}</p>
          </div>
        </div>
      )}

      {isGeneratingDoc ? (
        <div className="min-h-[40vh] bg-white flex flex-col items-center justify-center p-8 text-center rounded-[2.5rem] md:rounded-[3rem] border border-gray-100 shadow-sm mb-12">
          <div className="relative w-20 h-20 md:w-24 md:h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-green-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-green-600 border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Reading the process</div>
          <p className="text-gray-500 font-medium text-sm md:text-base">Putting the documentation together from the whole source…</p>
        </div>
      ) : hasDocument ? (
        <div id="documentation-report" data-stage-output="documentation" className="space-y-8 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Tab Switcher */}
          <div className="flex border-b border-gray-200 mb-8 mt-4 overflow-x-auto gap-4">
            <button
              onClick={() => setActiveTab('technical')}
              className={clsx(
                "px-6 py-3 font-bold text-xs md:text-sm uppercase tracking-wider border-b-2 transition-all shrink-0",
                activeTab === 'technical' ? "border-[#006b2c] text-[#006b2c]" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              {engineDoc ? 'Process documentation' : 'Technical Blueprint'}
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={clsx(
                "px-6 py-3 font-bold text-xs md:text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 shrink-0",
                activeTab === 'business' ? "border-[#006b2c] text-[#006b2c]" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              Business SOP & Compliance
              {!parsedBusinessDoc && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              )}
            </button>
          </div>

          {activeTab === 'technical' && engineDoc ? (
            <ProcessDocumentationView doc={engineDoc} />
          ) : activeTab === 'technical' ? (
            <div className="space-y-8">
              {/* Roadmap 3.0.5 — a blueprint stored before the engine wrote this
                  stage. Shown as it was, never migrated and never deleted, and
                  said to be what it is before anything in it is read. */}
              <div data-legacy-blueprint className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 flex flex-col md:flex-row md:items-center gap-3">
                <p className="flex-1 font-medium leading-relaxed">{LEGACY_BLUEPRINT_NOTICE}</p>
              </div>
              {/* L1 & L2 Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* L1 Domain */}
            <div className="bg-gradient-to-br from-slate-900 to-[#0b1c30] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/10 transition-all duration-500"></div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20"><Briefcase size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-green-400 uppercase tracking-widest">Level 1 Blueprint</h2>
                  <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Business Domain</h3>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Integration Domain</p>
                  <p className="text-base md:text-lg font-black text-white tracking-tight">{parsedDoc.l1_domain?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Strategic Goal</p>
                  <p className="text-gray-300 font-medium text-sm leading-relaxed">{parsedDoc.l1_domain?.strategicGoal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Service Owner</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-lg text-[11px] font-black uppercase tracking-widest text-green-400 border border-green-500/20">
                    <Users size={12} /> {parsedDoc.l1_domain?.owner}
                  </div>
                </div>
              </div>
            </div>

            {/* L2 Group */}
            <div className="bg-gradient-to-br from-slate-900 to-[#0b1c30] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/10 transition-all duration-500"></div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20"><Target size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-green-400 uppercase tracking-widest">Level 2 Blueprint</h2>
                  <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Process Area Group</h3>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Process Area</p>
                  <p className="text-base md:text-lg font-black text-white tracking-tight">{parsedDoc.l2_group?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Functional Context</p>
                  <p className="text-gray-300 font-medium text-sm leading-relaxed">{parsedDoc.l2_group?.processArea}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">KPI Framework</p>
                  <div className="flex flex-wrap gap-2">
                    {(parsedDoc.l2_group?.kpis || []).map((kpi: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-md text-[10px] font-black uppercase tracking-tight border border-green-500/20">
                        {kpi}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Process Flow Map */}
          <div className="bg-[#ffffff] p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-gray-100 relative group">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#eff4ff] text-[#006b2c] rounded-xl"><Activity size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 3 Flow</h2>
                  <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Interactive BPMN Map</h3>
                </div>
              </div>
              
              {/* BPMN Legend */}
              <div className="flex flex-wrap items-center gap-3 bg-gray-55/50 px-4 py-2.5 rounded-2xl border border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase mr-1">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-100 border border-green-500"></div>
                  <span className="text-[9px] font-bold text-gray-600">Start</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-2.5 rounded bg-blue-50 border border-blue-200"></div>
                  <span className="text-[9px] font-bold text-gray-600">Task</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-500 rotate-45"></div>
                  <span className="text-[9px] font-bold text-gray-600">Gateway</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-100 border-2 border-red-500"></div>
                  <span className="text-[9px] font-bold text-gray-600">End</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-100 h-[400px] md:h-[500px] shadow-inner relative">
              {parsedDoc.l3_flow && (
                <ProcessFlow flow={parsedDoc.l3_flow} tasks={parsedDoc.l4_tasks} onNodeClick={handleNodeClick} />
              )}
              <div className="absolute bottom-4 left-4 bg-gray-900/80 text-white text-[9px] px-3 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none font-bold uppercase tracking-wider">
                💡 Tip: Click nodes to scroll to Task Specs
              </div>
            </div>
          </div>

          {/* Task Definitions */}
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#eff4ff] text-[#00873a] rounded-xl"><Settings size={24} /></div>
                <div>
                  <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 4</h2>
                  <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Architectural Task Index</h3>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4 bg-white/60 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Low Complexity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Medium Logic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">High Integration</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(parsedDoc.l4_tasks || []).map((task: any, i: number) => {
                const isHighlighted = highlightedTaskId === task.stepId;
                return (
                  <motion.div 
                    key={i} 
                    id={`task-${task.stepId}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setActiveTask(task)}
                    className={clsx(
                      "p-6 rounded-[2rem] shadow-sm flex flex-col transition-all duration-300 border relative overflow-hidden cursor-pointer hover:-translate-y-1 group active:scale-[0.99]",
                      isHighlighted 
                        ? "border-green-500 ring-4 ring-green-500/20 bg-green-50/20 scale-[1.02] shadow-xl"
                        : task.complexity === 'High' ? "bg-white border-red-100 hover:border-red-300 hover:shadow-red-500/10" :
                          task.complexity === 'Medium' ? "bg-white border-amber-100 hover:border-amber-300 hover:shadow-amber-500/10" :
                          "bg-white border-green-100 hover:border-green-300 hover:shadow-green-500/10"
                    )}
                  >
                    {isHighlighted && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 animate-pulse"></div>
                    )}
                    <div className="flex items-start justify-between mb-4">
                      <div className="inline-block px-3 py-1 bg-[#0b1c30] text-white text-[9px] font-black rounded-lg uppercase tracking-tight shrink-0">
                        Task: {task.stepId}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-black text-green-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all">Deep Dive</span>
                        <div className={clsx(
                          "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border",
                          task.complexity === 'High' ? "bg-red-50 text-red-600 border-red-100" :
                          task.complexity === 'Medium' ? "bg-amber-50 text-amber-600 border-amber-100" :
                          "bg-green-50 text-green-600 border-green-100"
                        )}>
                          {task.complexity || 'Low'}
                        </div>
                      </div>
                    </div>

                    <h4 className="text-base font-black text-[#0b1c30] mb-2 leading-tight uppercase tracking-tight group-hover:text-green-700 transition-colors">{task.name || `Task ${task.stepId}`}</h4>
                    <p className="text-xs md:text-sm text-[#0b1c30]/70 font-medium mb-6 flex-grow leading-relaxed">{task.description}</p>

                    <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Layers size={10} className="shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Inputs</span>
                          </div>
                          <p className="text-[10px] font-bold text-[#0b1c30] break-words mt-1 leading-normal" title={(task.inputs || []).join(', ')}>
                            {(task.inputs || []).join(', ') || 'N/A'}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Box size={10} className="shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Outputs</span>
                          </div>
                          <p className="text-[10px] font-bold text-[#0b1c30] break-words mt-1 leading-normal" title={(task.outputs || []).join(', ')}>
                            {(task.outputs || []).join(', ') || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-[11px] pt-1 flex-wrap">
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium min-w-0 flex-1">
                          <Cpu size={12} className="text-green-600 shrink-0" />
                          <span className="break-words text-xs leading-none">
                            {Array.isArray(task.systems) ? task.systems.join(', ') : (task.systems || 'Not stated')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600 font-mono font-bold shrink-0">
                          <FileCode2 size={12} />
                          <span>Specs</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
          ) : (
            <div className="space-y-8">
              {isGeneratingBusinessDoc ? (
                <div className="min-h-[40vh] bg-[#0b1c30] border border-slate-800 flex flex-col items-center justify-center p-8 text-center rounded-[2.5rem] md:rounded-[3rem] shadow-sm mb-12 text-white relative overflow-hidden">
                  <div className="relative w-20 h-20 md:w-24 md:h-24 mx-auto mb-8">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-green-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-xl md:text-2xl font-black mb-2 uppercase tracking-tight text-white">Mapping SOP & RACI Matrix</div>
                  <p className="text-slate-400 font-medium text-sm md:text-base max-w-md leading-relaxed">
                    Gemini is evaluating executing roles, drafting operational playbook instructions, and defining target compliance checkpoints...
                  </p>
                </div>
              ) : parsedBusinessDoc ? (
                <div data-stage-output="businessDocumentation" className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  {/* RACI Matrix Section */}
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#eff4ff] text-[#0b1c30] rounded-xl"><Users size={24} /></div>
                        <div>
                          <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 5</h2>
                          <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">RACI Assignment Matrix</h3>
                        </div>
                      </div>
                      
                      {/* RACI Legend */}
                      <div className="flex flex-wrap items-center gap-3 bg-gray-55 px-4 py-2.5 rounded-2xl border border-gray-100">
                        <span className="text-[9px] font-black text-gray-400 uppercase mr-1">RACI Guide:</span>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100 text-[8px] font-black uppercase">R</span>
                          <span className="text-[8px] font-bold text-gray-600">Responsible</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 text-[8px] font-black uppercase">A</span>
                          <span className="text-[8px] font-bold text-gray-600">Accountable</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 text-[8px] font-black uppercase">C</span>
                          <span className="text-[8px] font-bold text-gray-600">Consulted</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 text-[8px] font-black uppercase">I</span>
                          <span className="text-[8px] font-bold text-gray-600">Informed</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-inner">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Step ID</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Responsible (R)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Accountable (A)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Consulted (C)</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Informed (I)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 font-medium text-xs text-gray-700">
                          {(parsedBusinessDoc.raci_matrix || []).map((raci: any, rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-gray-50/50">
                              <td className="px-6 py-4 font-mono font-black text-green-600">{raci.stepId}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100 font-bold uppercase text-[10px] tracking-tight">{raci.r || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 font-bold uppercase text-[10px] tracking-tight">{raci.a || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-bold uppercase text-[10px] tracking-tight">{raci.c || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-bold uppercase text-[10px] tracking-tight">{raci.i || 'N/A'}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SOP Narratives Section */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-[#eff4ff] text-[#00873a] rounded-xl"><Briefcase size={24} /></div>
                      <div>
                        <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Level 5 SOP</h2>
                        <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Standard Operating Procedures</h3>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {(parsedBusinessDoc.sop_details || []).map((sop: any, sIdx: number) => (
                        <div key={sIdx} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-center justify-between mb-4">
                            <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-tight font-mono">Step: {sop.stepId}</span>
                            <span className="text-[10px] font-black text-green-600 uppercase tracking-wider flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5" /> Target: {sop.kpiTarget}
                            </span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-mono">Operational Narrative</h4>
                              <p className="text-xs text-gray-700 leading-relaxed font-semibold">{sop.narrative}</p>
                            </div>
                            <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                              <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1 font-mono">Business Exception Fallback</h4>
                              <p className="text-xs text-rose-950 leading-relaxed font-semibold">{sop.businessException}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Internal Controls Section */}
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-[#eff4ff] text-[#006b2c] rounded-xl"><Lock size={24} /></div>
                      <div>
                        <h2 className="text-[10px] font-black text-[#0b1c30]/40 uppercase tracking-widest">Compliance Audit</h2>
                        <h3 className="text-lg md:text-xl font-black text-[#0b1c30] uppercase tracking-tight">Risk & Control Checkpoints</h3>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-inner">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Step</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Control Objective</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Mitigation Action</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Assertion Method</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 font-medium text-xs text-gray-700">
                          {(parsedBusinessDoc.audit_controls || []).map((ctrl: any, cIdx: number) => (
                            <tr key={cIdx} className="hover:bg-gray-50/50">
                              <td className="px-6 py-4 font-mono font-black text-green-600">{ctrl.stepId}</td>
                              <td className="px-6 py-4 font-extrabold text-gray-900 leading-normal">{ctrl.controlObjective}</td>
                              <td className="px-6 py-4 text-gray-600 leading-normal">{ctrl.mitigationAction}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-mono text-[9px] font-bold uppercase">{ctrl.assertionMethod}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b1c30] border border-slate-800 rounded-[2.5rem] p-8 md:p-12 text-white shadow-xl relative overflow-hidden group">
                  {/* Decorative gradient blur */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-green-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-green-500/15 transition-all duration-700"></div>
                  
                  <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs font-black uppercase tracking-widest mb-6">
                      <Cpu className="w-4 h-4 animate-pulse" /> AI Business Extension
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-4">Generate Enterprise Business SOP & RACI Matrix</h3>
                    <p className="text-slate-300 font-medium mb-8 text-sm md:text-base leading-relaxed">
                      Unlock business-level mapping to align technical Clean Core changes with corporate compliance frameworks and operational execution procedures.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-green-400 mb-2">
                          <Users size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">RACI Assignment</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Maps Responsible, Accountable, Consulted, and Informed roles across all process tasks.</p>
                      </div>
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-cyan-400 mb-2">
                          <Layers size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">Level 5 Narratives</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Drafts standard operating narratives, KPI targets, and functional exception handling guidance.</p>
                      </div>
                      <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                        <div className="flex items-center gap-2 text-rose-400 mb-2">
                          <Lock size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest font-mono">Internal Audit Controls</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">Identifies key clean core control objectives, mitigating actions, and assertion evidence methods.</p>
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
                    <button
                      onClick={generateBusinessDocumentation}
                      disabled={isGeneratingBusinessDoc || isGeneratingDoc}
                      className="relative inline-flex items-center gap-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black uppercase tracking-widest text-xs md:text-sm px-10 py-4.5 rounded-2xl shadow-xl hover:shadow-green-600/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Rocket className="w-4 h-4" />
                      <span>Generate Business Layer (AI)</span>
                    </button>
                    )}

                    {businessDocError && (
                      <p className="text-rose-400 font-medium text-xs mt-4 animate-pulse">{businessDocError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 md:p-20 text-center bg-gray-50/50 rounded-[2.5rem] md:rounded-[3rem] border-2 border-dashed border-gray-200 mb-12">
          {/* Roadmap 1.2 / V25-A12 — an invitation to start something the
              server would refuse is not an empty state, it is a dead end. When
              this stage cannot call a model, the reason and the way back stand
              here instead of the button. */}
          {/* Said before either branch, because it is true in both: a stored
              blueprint that cannot be drawn is a fact about this project, not
              about whether a model can be called right now. */}
          {storedBlueprintRejected && (
            <p data-stored-blueprint-rejected className="text-gray-600 mb-6 font-medium max-w-2xl mx-auto leading-relaxed">
              {STORED_BLUEPRINT_REJECTED}
            </p>
          )}
          {/* Roadmap 3.0.5 — no model is called for this document, so neither
              a missing key nor a switched-off stage stands in its way. What
              can: the source no longer being the one the run signed, or the
              map not being read yet. Both are said, and the button waits. */}
          {!storedBlueprintRejected && (
            <p className="text-gray-500 mb-2 font-medium">No process documentation yet.</p>
          )}
          <p className="text-gray-500 mb-6 text-sm max-w-2xl mx-auto">
            It is read out of the whole source the active run signed: the process element by element, what each part does,
            the update task and the lanes the code proves, every statement with its lines. No language model is involved.
          </p>
          <button
            onClick={generateDocumentation}
            disabled={!signedSource || !processMap.model || isGeneratingDoc}
            data-generate-blueprint
            className="bg-[#0b1c30] text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#006b2c] transition-all shadow-xl hover:shadow-green-600/20 disabled:opacity-50"
          >
            {storedBlueprintRejected ? 'Replace with the code reading' : 'Read the documentation from the code'}
          </button>
          {!signedSource && (
            <p data-documentation-needs-run className="text-gray-500 mt-4 text-xs">
              There is no source here that the active run signed. Run the analysis in stage 1 first.
            </p>
          )}
        </div>
      )}

      {/* Level 4 Task Deep-Dive Drawer Overlay */}
      <AnimatePresence>
        {activeTask && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveTask(null)}
              className="fixed inset-0 bg-slate-950 z-[110]"
            />
            
            {/* Slide-out Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-screen w-full md:w-[480px] xl:w-[550px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-[120] text-white p-6 md:p-8 flex flex-col overflow-hidden"
            >
              {/* Close Button */}
              <button 
                onClick={() => setActiveTask(null)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-full transition-colors z-10"
              >
                <X size={18} />
              </button>

              {/* Decorative background blob */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
              
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-6 pb-6 border-b border-slate-800/80 shrink-0">
                <div className="bg-green-500/20 p-2.5 rounded-2xl text-green-400 border border-green-500/30">
                  <Settings className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest font-mono">Level 4 Task Specification</span>
                  <h3 className="text-xl font-extrabold text-white mt-0.5 uppercase tracking-tight">{activeTask.name || `Task ${activeTask.stepId}`}</h3>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 text-sm scrollbar-thin scrollbar-thumb-slate-800">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Functional Description & Role Responsibility</h4>
                  <p className="text-slate-200 leading-relaxed font-medium">{activeTask.description}</p>
                </div>

                {/* Grid Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-800 py-4 my-2 shrink-0">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Step ID</span>
                    <span className="text-sm font-black text-slate-200 mt-1 block uppercase">{activeTask.stepId}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Logic Complexity</span>
                    <span className={clsx(
                      "text-xs font-black uppercase tracking-widest mt-1.5 inline-block px-2.5 py-0.5 rounded border",
                      activeTask.complexity === 'High' ? "bg-red-950/40 text-red-400 border-red-900/60" :
                      activeTask.complexity === 'Medium' ? "bg-amber-950/40 text-amber-400 border-amber-900/60" :
                      "bg-green-950/40 text-green-400 border-green-900/60"
                    )}>
                      {activeTask.complexity || 'Low'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Estimated Effort</span>
                    <span className="text-sm font-bold text-emerald-400 mt-1.5 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      {activeTask.estimatedDuration || 'Not stated'}
                    </span>
                  </div>
                </div>

                {/* Inputs & Outputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 shrink-0">
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Layers size={14} className="text-green-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest font-mono">Input Parameters</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200 list-disc pl-4 font-semibold">
                      {(activeTask.inputs || []).map((inp: string, idx: number) => (
                        <li key={idx}>{inp}</li>
                      ))}
                      {(!activeTask.inputs || activeTask.inputs.length === 0) && <li>N/A</li>}
                    </ul>
                  </div>

                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Box size={14} className="text-green-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest font-mono">Output Results</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200 list-disc pl-4 font-semibold">
                      {(activeTask.outputs || []).map((out: string, idx: number) => (
                        <li key={idx}>{out}</li>
                      ))}
                      {(!activeTask.outputs || activeTask.outputs.length === 0) && <li>N/A</li>}
                    </ul>
                  </div>
                </div>

                {/* Target Systems */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">Target Platform & Tech Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(activeTask.systems) ? activeTask.systems : [activeTask.systems || 'Not stated']).map((sys: string, idx: number) => (
                      <code key={idx} className="bg-slate-950 text-emerald-400 border border-slate-800 text-xs px-3 py-1.5 rounded-xl font-mono">
                        {sys}
                      </code>
                    ))}
                  </div>
                </div>

                {/* Technical Mapping Snippet */}
                <div className="space-y-2.5 pt-2 shrink-0">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Technical & Execution Mapping</h4>
                  <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">{activeTask.stepId}.ts</span>
                      <div className="w-12"></div>
                    </div>
                    <pre className="p-5 text-xs font-mono text-emerald-300 overflow-x-auto max-h-[220px] select-all scrollbar-thin scrollbar-thumb-slate-800">
                      <code>{activeTask.technicalMapping || '// Transformed execution handler\nrouter.post(\'/sync\', async (req, res) => {\n  // Implementation code mapping detailed above...\n});'}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 flex justify-between items-center shrink-0">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">Clean-Core.io Architecture Mapping Standard</span>
                <button
                  onClick={() => setActiveTask(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  Close Specification
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NavigationButtons 
        backPath={`/project/${projectId}/transformation`}
        backLabel="Back to Transformation"
        proceedPath={`/project/${projectId}/testing`}
        proceedLabel="Proceed to Testing"
        incomplete={!documentation}
        incompleteReason="no process documentation has been read from the code yet"
      />
    </div>
  );
}
