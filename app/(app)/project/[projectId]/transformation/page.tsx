'use client';

export const dynamic = 'force-dynamic';

import { SCORE_BANDS_SOURCE, bandRange, scoreBand } from '@/lib/clean-core-score';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { Code2, ArrowRight, RefreshCw, FileCode2, Terminal, CheckCircle2, Folder, Lock, Unlock, Layers, Download } from 'lucide-react';
import clsx from 'clsx';
import StageFooter from '@/components/StageFooter';
import CodeHighlighter from '@/components/CodeHighlighter';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcToast from '@/components/cc/Toast';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcCheckbox from '@/components/cc/Checkbox';
import CcSkeleton from '@/components/cc/Skeleton';
import { CcTag } from '@/components/cc/Tag';
import { STATE_CLASSES } from '@/components/cc/state';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import { SUPPORT_LEVEL_STATE } from '@/lib/support-level';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';

import { detectFindings } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
// The required-artefact table and its matcher live in lib/ so a spec can run the
// real gate instead of a copy of it (QA review of 9e408888bfec, 3c05340dc39b).
import { holdsStoredPackage, missingArtefacts, usableTestSuite, type ProjectFile } from '@/lib/transformation-artefacts';
import { duplicatePaths } from './duplicate-paths';
import { matchCdsView } from '@/lib/abap/cds-catalog';
import { extractSelects, parseSelect } from '@/lib/abap/select-parser';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import CcLinkButton from '@/components/cc/LinkButton';
import TransformationObjectPage from '@/components/transformation/TransformationObjectPage';
// The engine's evidence comes from the server, computed with the catalog
// snapshot the signed run reads; neither the engine nor a catalog is
// downloaded by this page (owner decision 30.09.2026, external audit PERF-01).
import { EVIDENCE_UNREAD, useProjectEvidence } from '@/hooks/useProjectEvidence';
import { workflowSteps, generationBlockers, generationPrerequisites, previousBasis } from '@/lib/workflow-steps';
import { isAbapCloudTrack, trackCopy } from '@/lib/transformation-track';
// Roadmap 8.3 — the generation follows the architecture contract, not a field
// on the project document. See `lib/generation-direction.ts` for what it
// replaced and why.
import { fetchGenerationDecision, storeGeneration } from '@/lib/generation-contract-client';
import { PROJECT_TOO_LARGE_CODE } from '@/lib/firestore-doc-size';
import { CommandAnswerLostError } from '@/lib/project-command-client';
import type { GenerationRefusal } from '@/lib/generation-direction';
import StaleNotice from '@/components/StaleNotice';
import NotGenerated from '@/components/NotGenerated';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { BTP } from '@/lib/sap-naming';

/**
 * A file the workspace can show and the next stage can read. The model's answer
 * was taken at its word: `result.files || []` accepted an empty list, a list of
 * nulls, or entries with no path, and all of them were written to the project
 * as a finished transformation (QA review of 33471220d6e9, d967e435917c).
 */
const isUsableFile = (f: unknown): f is ProjectFile =>
  !!f && typeof f === 'object'
  && typeof (f as ProjectFile).path === 'string' && (f as ProjectFile).path.trim().length > 0
  && typeof (f as ProjectFile).content === 'string' && (f as ProjectFile).content.trim().length > 0;

/**
 * The smallest set of artefacts a generated package has to contain before it is
 * stored as a finished transformation, one list per track. Every entry is read
 * off the generation prompt further down, which enumerates exactly these
 * artefacts in its requirements and again in its JSON example — this table says
 * nothing about ABAP or Node.js that the prompt did not ask the model for.
 *
 * `isUsableFile` asks one thing of one file, and "at least one usable file" was
 * the only completeness gate there was. An answer holding a single class — no
 * metadata descriptor, no CDS view, no behavior definition, no abapGit
 * configuration — passed it and was written out with `status: 'transformed'`,
 * and the stage went green over a package nobody could import (QA full review
 * of b88c77b, 7976bced4c28).
 *
 * Matched on the shape of the path, not on the prompt's example names: the
 * suffix is the artefact kind, and a model that names the class after the
 * project instead of `zcl_demo_rap_behavior` has still answered the question.
 */

/**
 * The two warning markers a generation may write into its comments, as code
 * points. A third, the check mark, used to turn a comment into a "Fully
 * Grounded" dot — as did any comment that happened to say `CDS`, `matched` or
 * `fully`. Nothing compared that line with a catalog or validated it, so the
 * dot was the model grading its own output (QA full review of fc78767,
 * 4cfbf09351f1). A model comment that warns is worth pointing at; one that
 * praises itself is not evidence, so it gets no marker.
 */
const WARNING_SIGN = String.fromCodePoint(0x26a0, 0xfe0f);
const CROSS_MARK = String.fromCodePoint(0x274c);

export default function TransformationPage() {
  const { projectId } = useParams();
  /** Roadmap 1.2 — this stage calls a model, so it has a switch and it can be keyless. */
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<any>(null);
  /**
   * One generation at a time *in this tab* — see the dependency note on the
   * callback below. It is a convenience, not the guard: a second tab has its
   * own ref, and what keeps two generations from overwriting each other is the
   * server's compare-and-swap against the token read before the model call
   * (roadmap 3.0.11, `storeGeneration`).
   */
  const generationInFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  /** Set by the load when the project has no code yet and could have some. */
  const [awaitingAutoGeneration, setAwaitingAutoGeneration] = useState(false);
  const autoGenerationStarted = useRef(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const [transformedCode, setTransformedCode] = useState('');
  const [transformationLog, setTransformationLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  /**
   * Codex architecture-02 — a generated package the server refused because the
   * project document would outgrow Firestore's 1 MiB. Nothing was stored, but
   * the reader paid for the generation: the draft stays on screen, marked as
   * unsaved, with a download, until the next generation or a reload.
   */
  const [unsavedDraft, setUnsavedDraft] = useState<string | null>(null);
  /**
   * Why nothing was generated, when the contract said so (roadmap 8.3). Its own
   * state rather than `error`: a blocked contract is not a failure of this
   * stage, and the reader needs the contract's sentence plus what ends it, not
   * a red banner about a generation that never started.
   */
  const [contractRefusal, setContractRefusal] = useState<GenerationRefusal | null>(null);
  /** The track the contract chose, once the server has answered. */
  const [contractTrack, setContractTrack] = useState<{ isAbapCloud: boolean; sentence: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [isProceeding, setIsProceeding] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const router = useRouter();
  const { profile } = useUserProfile();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeCopyToast = useCallback(() => setShowCopyDialog(false), []);
  // Roadmap 3.0.4: the audit is a modal dialog — focus moves in, Tab stays
  // inside, Escape closes, focus returns to the button that opened it. Since
  // D.15 that is `CcDialog`, which does all four through the library's modal
  // code instead of a page-local hook.
  const [signedOffIds, setSignedOffIds] = useState<Set<string>>(new Set());
  const [findings, setFindings] = useState<SupportFinding[]>([]);

  useEffect(() => {
    if (project?.legacyCode) {
      const abapSources = [{ file: 'main.abap', content: project.legacyCode }];
      try {
        const realModel = buildClassModel(abapSources);
        const detected = detectFindings(realModel, abapSources);
        setFindings(detected);
      } catch (e) {
        console.error('Error detecting findings:', e);
      }
    }
  }, [project?.legacyCode]);

  /**
   * The engine's findings for this source — the evidence the Analyze stage
   * shows, read from the server: the stored source, the file name the run
   * signed and the catalog snapshot of the project's target profile. The
   * Object Page counts its facets, flow and plan from these and nothing else.
   */
  const projectEvidence = useProjectEvidence(
    projectId as string,
    Boolean(project?.legacyCode),
    project?.activeRunId ?? '',
  );
  const evidence = projectEvidence.state === 'ready' ? projectEvidence.value.evidence : null;
  /**
   * The server has not answered yet. The facets are counted from its findings,
   * and drawn without them they would say "0 findings" for a program that has
   * some, so the stage stays in its opening state for that moment.
   */
  const evidencePending = Boolean(project?.legacyCode) && projectEvidence.state === 'loading';
  /** The read failed: the findings-derived page is not drawn, and the strip says why. */
  const evidenceFailed = project?.legacyCode && projectEvidence.state === 'failed' ? projectEvidence.reason : null;

  const toggleSignOff = (findingId: string) => {
    setSignedOffIds(prev => {
      const next = new Set(prev);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  };

  const getModernMarkers = useCallback(() => {
    if (!transformedCode) return [];
    const lines = transformedCode.split('\n');
    const markers: { line: number; level: 'fully' | 'partial' | 'not-supported'; title: string; detail: string }[] = [];
    
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      // The model's markers are matched by code point, not written as emoji
      // here: the source stays free of pictographs (§3.1), the match is the same.
      if (line.includes('CC-PARTIAL') || line.includes(WARNING_SIGN)) {
        markers.push({
          line: lineNum,
          level: 'partial',
          title: 'Partial Compliance',
          detail: line.replace(/^\s*\/\/\s*/, '').trim()
        });
      } else if (line.includes('CC-NOT-SUPPORTED') || line.includes(CROSS_MARK)) {
        markers.push({
          line: lineNum,
          level: 'not-supported',
          title: 'Manual Review Required',
          detail: line.replace(/^\s*\/\/\s*/, '').trim()
        });
      }
    });

    if (markers.length === 0 && findings.length > 0) {
      findings.forEach((f, index) => {
        const step = Math.floor(lines.length / (findings.length + 1)) || 1;
        markers.push({
          line: Math.min(lines.length, (index + 1) * step),
          level: f.level,
          title: f.title,
          detail: f.detail
        });
      });
    }

    return markers;
  }, [transformedCode, findings]);

  const scrollToLine = useCallback((line: number) => {
    const el = modernScrollRef.current;
    if (!el) return;
    const totalLines = transformedCode.split('\n').length || 1;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;
    const targetScrollTop = (line / totalLines) * scrollHeight - (clientHeight / 2);
    el.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
  }, [transformedCode]);

  // `runDiffTest` lived here. It was a "Differential Sandbox Tester": a button
  // that waited 1200ms on a setTimeout, then rendered "ResultSet Equivalence
  // Verified" over "S/4HANA: 243 rows fetched / 243 items compared" — 243 being a
  // literal in the markup — and added the complex-sql-join finding to
  // `signedOffIds`, which feeds the compliance figure a few lines below. It
  // executed nothing, contacted nothing and compared nothing, so it raised a
  // score and signed off a finding on the strength of a timer.
  //
  // The capability it mimed is real and lives in stage 5, where the tenant
  // connection actually exists: the OData explorer there now reads records from
  // a chosen entity set through /api/test-s4-odata-read and reports the count it
  // actually got back. What it does not claim is equivalence — nothing compares
  // the generated TypeScript against those rows, so nothing says it does.

  // Two substitutions used to live here. `|| 70` invented a baseline for a
  // project that never got scored, and the `: 100` branch declared full
  // compliance whenever no finding happened to require sign-off — which is not
  // the same as clean code. It happens on a parse miss, on empty legacy source,
  // and on any file whose findings are all informational, and it overrode a real
  // stored score of 40 with a green 100% ring.
  const scoredCleanCore =
    typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : undefined;
  const signOffFindings = findings.filter(f => f.requiresSignOff);

  // A third substitution used to live here, and it was the largest: ticking every
  // local sign-off box raised the displayed compliance figure toward 100 —
  //
  //   scoredCleanCore + (100 - scoredCleanCore) * (signedOffIds.size / signOffFindings.length)
  //
  // The boxes are browser state. They are not persisted, not attached to a
  // reviewer, not attached to a justification or any validator output, and no new
  // Run is signed when they change. So a project the engine scored 40 could be
  // photographed at 100 % compliance after six clicks, with the signed Run and
  // the audit pack still saying 40.
  //
  // The score shown is the score that was signed. Review progress is real and
  // worth seeing, so it stays — as its own line, counting findings, under its own
  // name.
  const currentScore = scoredCleanCore;



  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('srv/service.ts');
  const [syncScroll, setSyncScroll] = useState(true);

  const legacyScrollRef = useRef<HTMLDivElement>(null);
  const modernScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingLegacy = useRef(false);
  const isScrollingModern = useRef(false);

  const parseGeneratedCode = (codeStr: string): ProjectFile[] => {
    if (!codeStr) return [];
    try {
      const parsed = JSON.parse(codeStr);
      if (Array.isArray(parsed) && parsed.every(f => typeof f.path === 'string' && typeof f.content === 'string')) {
        return parsed;
      }
    } catch (e) {
      // Not a valid JSON array matching ProjectFile schema
    }
    
    // Legacy fallback
    return [
      {
        path: 'srv/service.ts',
        content: codeStr
      },
      {
        path: 'package.json',
        content: `{
  "name": "clean-core-modernized-service",
  "version": "1.0.0",
  "description": "Modernized clean-core Node.js service",
  "main": "srv/service.js",
  "type": "module",
  "scripts": {
    "start": "node srv/service.js",
    "dev": "tsx watch srv/service.ts",
    "test": "playwright test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pino": "^9.1.0",
    "pino-pretty": "^11.1.0",
    "@sap/xssec": "^4.1.0",
    "passport": "^0.7.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.12",
    "tsx": "^4.10.1",
    "@playwright/test": "^1.44.0"
  }
}`
      },
      {
        path: 'Dockerfile',
        content: `# Multi-stage Build for Lean & Secure Production Container
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/srv ./srv
USER node
EXPOSE 3000
CMD ["node", "srv/service.js"]`
      }
    ];
  };

  const getFileLanguage = (filePath: string): string => {
    if (filePath.endsWith('.abap')) return 'abap';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.md')) return 'markdown';
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) return 'typescript';
    if (filePath.endsWith('.cds')) return 'typescript';
    if (filePath.endsWith('Dockerfile')) return 'dockerfile';
    return 'typescript';
  };

  useEffect(() => {
    const selectedFile = files.find(f => f.path === selectedFilePath);
    if (selectedFile) {
      setTransformedCode(selectedFile.content);
    }
  }, [selectedFilePath, files]);

  const handleLegacyScroll = () => {
    if (!syncScroll) return;
    if (isScrollingModern.current) {
      isScrollingModern.current = false;
      return;
    }
    
    const legacyEl = legacyScrollRef.current;
    const modernEl = modernScrollRef.current;
    if (!legacyEl || !modernEl) return;
    
    isScrollingLegacy.current = true;
    
    const legacyScrollableHeight = legacyEl.scrollHeight - legacyEl.clientHeight;
    const modernScrollableHeight = modernEl.scrollHeight - modernEl.clientHeight;
    
    if (legacyScrollableHeight > 0 && modernScrollableHeight > 0) {
      const scrollPercentage = legacyEl.scrollTop / legacyScrollableHeight;
      // Writing `scrollTop` on a DOM node held in a ref, from a scroll handler.
      // The compiler rule cannot tell a DOM element apart from a value it is
      // meant to keep immutable, and there is no other way to sync two panes.
      // eslint-disable-next-line react-hooks/immutability
      modernEl.scrollTop = scrollPercentage * modernScrollableHeight;
    }
  };

  const handleModernScroll = () => {
    if (!syncScroll) return;
    if (isScrollingLegacy.current) {
      isScrollingLegacy.current = false;
      return;
    }
    
    const legacyEl = legacyScrollRef.current;
    const modernEl = modernScrollRef.current;
    if (!legacyEl || !modernEl) return;
    
    isScrollingModern.current = true;
    
    const legacyScrollableHeight = legacyEl.scrollHeight - legacyEl.clientHeight;
    const modernScrollableHeight = modernEl.scrollHeight - modernEl.clientHeight;
    
    if (legacyScrollableHeight > 0 && modernScrollableHeight > 0) {
      const scrollPercentage = modernEl.scrollTop / modernScrollableHeight;
      legacyEl.scrollTop = scrollPercentage * legacyScrollableHeight;
    }
  };

  const renderFileButton = (file: ProjectFile, name: string) => {
    const isSelected = selectedFilePath === file.path;
    // Navigation in a light panel: the chosen file is ink and outlined, not
    // green — choosing a file is not a proof of anything (§1.1).
    return (
      <button
        key={file.path}
        type="button"
        onClick={() => setSelectedFilePath(file.path)}
        aria-current={isSelected ? 'true' : undefined}
        className={clsx(
          'w-full flex items-center gap-2 px-2 py-1 rounded-cc-row border font-cc-mono text-[12px] text-left',
          isSelected
            ? 'border-cc-field-border text-cc-ink font-semibold'
            : 'border-transparent text-cc-ink-muted hover:text-cc-ink'
        )}
      >
        <FileCode2 size={12} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{name}</span>
      </button>
    );
  };

  const renderFileTree = () => {
    const structure: { [folder: string]: ProjectFile[] } = {};
    const rootFiles: ProjectFile[] = [];
    
    files.forEach(file => {
      if (file.path.includes('/')) {
        const parts = file.path.split('/');
        const folderName = parts[0];
        if (!structure[folderName]) {
          structure[folderName] = [];
        }
        structure[folderName].push(file);
      } else {
        rootFiles.push(file);
      }
    });
    
    return (
      <div className="space-y-4">
        {Object.entries(structure).map(([folderName, folderFiles]) => (
          <div key={folderName} className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1 cc-text-label text-cc-ink-muted">
              <Folder size={12} aria-hidden="true" className="shrink-0" />
              <span>{folderName}</span>
            </div>
            <div className="pl-2 space-y-1 border-l border-cc-line ml-3">
              {folderFiles.map(file => renderFileButton(file, file.path.split('/').slice(1).join('/')))}
            </div>
          </div>
        ))}
        
        {rootFiles.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1 cc-text-label text-cc-ink-muted">
              <span>Root Files</span>
            </div>
            <div className="space-y-1">
              {rootFiles.map(file => renderFileButton(file, file.path))}
            </div>
          </div>
        )}
      </div>
    );
  };


  const handleCopy = async () => {
    // The toast used to appear before the clipboard had answered, so a denied
    // clipboard still said "copied" (QA full review of fc78767, 604c2ded57e3).
    // A failure is a Message Strip, not a toast (§2.8).
    try {
      await navigator.clipboard.writeText(transformedCode);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    // `CcToast` removes itself after the four seconds of §2.6.
    setShowCopyDialog(true);
  };

  /**
   * Roadmap 0.2 (UX-040). Three "Transformation Insights" cards used to sit
   * under the generated code — "Event-driven Microservices", "TypeORM & HDI
   * Integration", "XSUAA Security Pattern" — written in the first person
   * ("we replace", "our transformation engine transforms") and identical for
   * every project. They were not derived from the findings, from the code or
   * from the route: a RAP project got three paragraphs about Express.js and
   * TypeORM. Generic copy under a reader's own output reads as analysis of it,
   * so the cards are gone rather than rephrased. The findings list, the target
   * pane and the sign-off drawer are what this stage actually knows.
   */

  /** The unsaved draft as the file list it is, for the reader to keep (architecture-02). */
  const downloadUnsavedDraft = () => {
    if (!unsavedDraft) return;
    const url = URL.createObjectURL(new Blob([unsavedDraft], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transformation-draft-${String(projectId)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * What this project's track is called wherever the stage names it (UX-037).
   *
   * The contract answers it once the server has (roadmap 8.3). The route field
   * is the fallback for a stand generated before this step, where nothing says
   * which contract was followed — for the *words*, never for the generation:
   * `generateTransformation` below does not read it at all.
   */
  const isAbapCloud = contractTrack ? contractTrack.isAbapCloud : isAbapCloudTrack(project?.extensibilityRoute);
  const track = trackCopy(isAbapCloud);

  const generateTransformation = useCallback(async () => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setLoading(true);
    setProgress(0);
    setError('');
    setUnsavedDraft(null);
    
    try {
      // Roadmap 8.3. The direction is the contract's `route.chosen`, which is
      // the recommendation unless a deviation was declared — and a deviation
      // reaches it only with a reason (`lib/architecture-contract.ts` throws
      // without one). A blocked contract generates nothing and says why.
      const { contract, decision, generation } = await fetchGenerationDecision(projectId as string);
      if (!decision.ok) {
        setContractRefusal(decision);
        return;
      }
      if (!contract || !generation) {
        throw new Error('The contract endpoint allowed a generation but named no contract, so nothing could be bound to it. Nothing was generated.');
      }
      // The contract this stand is generated from. The stand below is stored
      // only if the server's contract is still this one when the model is done.
      const generatedAgainst = contract.fingerprint;
      // Roadmap 3.0.11: the state the prompt is built from, read now rather
      // than when the page loaded — and the token that names it. The server
      // stores the answer only if the project is still at this token, so a
      // design replaced in another tab, or a generation another tab stored
      // first, turns this one into a refusal instead of an overwrite.
      const generationToken = generation.token;
      const { legacyCode, solutionDesign: design, analysis } = generation.inputs;
      // The narrative is not required (v3.0.1): the design is written from it
      // and carries it, and an engine-only run has none. It used to be, and a
      // project with a design but an engine-only run could never generate.
      const businessAnalysis = analysis.trim()
        || 'No model narrative — the signed run holds the engine\'s evidence only. Take the business intent from the Solution Design below.';
      if (!legacyCode.trim() || !design.trim()) {
        throw new Error('The source or the solution design is no longer on this project, so there is nothing to generate from. Nothing was generated — reload the stage to see what is on record.');
      }
      setContractRefusal(null);
      setContractTrack({ isAbapCloud: decision.isAbapCloud, sentence: decision.sentence });
      const isAbapCloud = decision.isAbapCloud;

      setTransformationLog([
        'Initializing transformation engine...',
        decision.sentence,
        'Parsing legacy ABAP structures...',
        isAbapCloud ? 'Mapping to RAP Developer Extensibility patterns...' : 'Mapping to CAP modular structures...'
      ]);

      const prompt = isAbapCloud
        ? `You are an elite SAP RAP & ABAP Cloud Developer. Transform the following legacy ABAP code into a modern, production-ready modular SAP RAP (RESTful Application Programming Model) Developer Extensibility target architecture based on the provided Solution Design and Business Analysis.
        
        Legacy ABAP Code:
        ${legacyCode}
        
        Business Analysis:
        ${businessAnalysis}
        
        Solution Design:
        ${design}
        
        Requirements:
        1. Write clean, cloud-ready ABAP Cloud RAP syntax. Replace obsolete database access patterns with released APIs and MODIFY ENTITIES operations.
        2. Follow standard released object restrictions (No direct SELECT on BSEG/KNA1; use released CDS views instead).
        3. Split the modernized implementation into multiple files under standard abapGit file structures:
           - src/zcl_demo_rap_behavior.clas.abap: The Behavior Implementation ABAP Class containing standard CRUD modification logic.
           - src/zcl_demo_rap_behavior.clas.xml: The metadata XML descriptor for the class.
           - src/z_demo_rap_ddls.ddls.asddls: The CDS data definition / projection view for the target entity.
           - src/z_demo_rap_bdef.bdef.asbdef: The behavior definition for the CDS view (defining CREATE/UPDATE/DELETE and custom actions).
           - src/z_demo_rap_srvd.srvd.assrvd: The RAP service definition exposing the business object.
           - src/z_demo_rap_srvb.srvb.assrvb: The RAP service binding configuration (exposing as OData V4 UI).
           - Do NOT produce an abapGit configuration file. The delivery step writes it
             deterministically from the project itself, under the dotted name abapGit reads.
             A model-invented configuration would put a guessed value where a measured one belongs.
        4. Add professional comments explaining the Developer Extensibility patterns used.
        5. Return a complete ABAP Unit test suite inside the tests JSON object that validates the RAP behavior.
        
        Return a JSON object with the following structure:
        {
          "files": [
            {
              "path": "src/zcl_demo_rap_behavior.clas.abap",
              "content": "/* The main ABAP class code */"
            },
            {
              "path": "src/zcl_demo_rap_behavior.clas.xml",
              "content": "/* Standard XML metadata descriptor */"
            },
            {
              "path": "src/z_demo_rap_ddls.ddls.asddls",
              "content": "/* The CDS View code */"
            },
            {
              "path": "src/z_demo_rap_bdef.bdef.asbdef",
              "content": "/* The BDEF code */"
            },
            {
              "path": "src/z_demo_rap_srvd.srvd.assrvd",
              "content": "/* The Service Definition code */"
            },
            {
              "path": "src/z_demo_rap_srvb.srvb.assrvb",
              "content": "/* The Service Binding code */"
            }
          ],
          "tests": {
            "config": "/* Standard ABAP Unit configuration metadata */",
            "spec": "/* Complete zcl_demo_rap_test.clas.abap ABAP Unit test class verifying RAP methods */"
          }
        }
        No conversational text.`
        : `You are an elite Cloud Platform & Node.js Developer. Transform the following legacy ABAP code into a modern, production-ready modular Node.js (TypeScript) application project structure based on the provided Solution Design and Business Analysis.
        
        Legacy ABAP Code:
        ${legacyCode}
        
        Business Analysis:
        ${businessAnalysis}
        
        Solution Design:
        ${design}
        
        Requirements:
        1. Use TypeScript with ES Modules (ESM).
        2. Follow Clean Architecture and modular structure principles.
        3. Split the modernized implementation into multiple files, including:
           - srv/service.ts: The main business logic and Express route handlers
           - db/schema.cds: SAP CAP schema definition OR TypeORM entities mapping legacy database tables
           - package.json: Application dependencies, metadata, and scripts
           - Dockerfile: Multi-stage container setup for production
           - erp-triggers/zcl_core_event_publisher.clas.abap: CRITICAL! S/4HANA-side event trigger: a clean ABAP Cloud class (or BAdI implementation) that intercepts transactional updates in the core ERP database and publishes the event payload asynchronously to the SAP Event Mesh/REST endpoint on ${BTP}.
        4. Use modern patterns (async/await, dependency injection, structured logging).
        5. CRITICAL FOR SANDBOX: Use standard Node.js built-ins (like 'fetch', 'console') where possible. If you must use external libraries, restrict yourself strictly to: express, pino, pino-pretty, typeorm, @sap-cloud-sdk/http-client, @sap/xssec, and passport. Do NOT use any other external npm modules.
        6. CRITICAL: Do NOT import specific strategies like 'XS720Strategy' from '@sap/xssec' if they are not standard exports. Use standard passport-jwt or mock the authentication middleware entirely.
        7. Add professional JSDoc comments explaining the transformation logic.
        8. Ensure the code is robust with error handling and validation.
        9. Generate a complete Playwright test suite (playwright.config.ts and generated.spec.ts) to verify the API endpoints.
        10. CRITICAL: Export all main business logic functions and classes using ESM 'export' statements so they can be imported and tested by a separate test suite.
        
        Return a JSON object with the following structure:
        {
          "files": [
            {
              "path": "srv/service.ts",
              "content": "/* The main TS application source code */"
            },
            {
              "path": "package.json",
              "content": "/* The package.json configuration */"
            },
            {
              "path": "db/schema.cds",
              "content": "/* SAP CAP schema definition or database entity declarations */"
            },
            {
              "path": "Dockerfile",
              "content": "/* Multi-stage Docker containerization setup */"
            },
            {
              "path": "erp-triggers/zcl_core_event_publisher.clas.abap",
              "content": "/* Clean S/4HANA Core event trigger publisher class in ABAP Cloud syntax */"
            }
          ],
          "tests": {
            "config": "/* playwright.config.ts content */",
            "spec": "/* generated.spec.ts content */"
          }
        }
        No conversational text.`;

      console.log('Transforming code for project:', projectRef.current?.name);

      const responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'transformation');
      
      let filesArray: ProjectFile[] = [];
      
      // An answer that is not the agreed JSON is a failed *generation*, not a
      // file. This used to end in a catch that wrapped the raw text as
      // `srv/service.ts`: a refusal, a quota notice or any stretch of prose
      // then passed the "at least one file" gate below and was stored with
      // `status: 'transformed'`, so the reader got a green stage whose source
      // code was the sentence in which the model declined the work (QA full
      // review of b88c77b, 55cf6c0ed62a). It is reported the same way an empty
      // answer is, a few lines down — nothing is saved, the previous artefact
      // stands.
      let result: unknown;
      try {
        result = JSON.parse(responseText || '{}');
      } catch {
        // One attempt at an object inside a markdown fence is still worth
        // making: that is a formatting slip, not a refusal.
        const match = responseText?.match(/\{[\s\S]*\}/);
        try {
          result = match ? JSON.parse(match[0]) : undefined;
        } catch {
          result = undefined;
        }
      }
      if (!result || typeof result !== 'object') {
        throw new Error('The model answered with text instead of the JSON this stage asked for. Nothing was saved — the previous version is untouched. Try the generation again.');
      }

      const parsed = result as { files?: unknown; tests?: unknown; code?: unknown };
      filesArray = (Array.isArray(parsed.files) ? parsed.files : []).filter(isUsableFile);

      // The single-blob answer goes through the same gate as the list: it
      // used to be pushed unchecked, so `{"files":[],"code":"   "}` reached
      // the project as a finished transformation (QA review of 146ac2e1a724,
      // 9712d15149c9).
      if (filesArray.length === 0) {
        const single = {
          path: isAbapCloud ? 'src/zcl_demo_rap_behavior.clas.abap' : 'srv/service.ts',
          content: parsed.code,
        };
        if (isUsableFile(single)) filesArray.push(single);
      }

      // Nothing usable came back. This used to be written anyway: an empty
      // file list, an empty test suite and `status: 'transformed'` — on a
      // first run the later stages saw a transformed project with no code, and
      // on a rerun the empty answer replaced the code that was already there
      // (QA review of 33471220d6e9, d967e435917c). The previous artefact stays
      // and the stage reports a failed generation.
      if (filesArray.length === 0) {
        throw new Error('The model returned no usable code. Nothing was saved — the previous version is untouched. Try the generation again.');
      }

      // Nor is a package that answers one path twice (6d411bca538c).
      const repeated = duplicatePaths(filesArray);
      if (repeated.length > 0) {
        throw new Error(`The model returned more than one file for the same path: ${repeated.join('; ')}. Nothing was saved — the previous version is untouched. Try the generation again.`);
      }

      // And one file is not a package. Every path the prompt enumerated has to
      // be answered, or this is a half-generation and gets reported as one
      // rather than stored as a finished transformation (b88c77b, 7976bced4c28).
      const missing = missingArtefacts(filesArray, isAbapCloud);
      if (missing.length > 0) {
        throw new Error(`The model returned an incomplete package. Missing: ${missing.join('; ')}. Nothing was saved — the previous version is untouched. Try the generation again.`);
      }

      // The test suite is part of the package the prompt asked for. It used to
      // default to two empty strings and the project was marked transformed
      // without one (QA full review of 81810c8, 183ed4edf700).
      const tests = usableTestSuite(parsed.tests, isAbapCloud);
      if (!tests) {
        throw new Error('The model returned the code without its test suite. Nothing was saved — the previous version is untouched. Try the generation again.');
      }

      setTransformationLog(prev => [...prev, 'Code generation complete.', 'Optimizing imports...', 'Finalizing transformation...']);

      // The server stores the stand — code, suite, status and the binding to
      // the contract it was computed against — in one transaction (roadmap
      // 8.3, 3.0.11). It rebuilds the contract and writes its own fingerprint,
      // so the binding cannot name a contract that was never derived; and it
      // writes only if the project is still at the token read before the model
      // call. A refusal means nothing was saved.
      const packaged = JSON.stringify(filesArray);
      let stored: { generatedCode: string; testSuite: unknown; status: string; generationBinding?: unknown };
      try {
        const answer = await storeGeneration(projectId as string, {
          generatedCode: packaged,
          testSuite: tests,
          expectedContractFingerprint: generatedAgainst,
          generationToken,
        });
        if (!answer.ok && answer.code === PROJECT_TOO_LARGE_CODE) {
          // The one refusal where the package itself is fine: kept on screen
          // as an unsaved draft rather than thrown away with the error. The
          // server's sentence already says that nothing was saved.
          setFiles(filesArray);
          setSelectedFilePath(filesArray[0]?.path || '');
          setUnsavedDraft(packaged);
          throw new Error(answer.error);
        }
        if (!answer.ok) {
          throw new Error(`${answer.error} Nothing was saved — the previous version is untouched.`);
        }
        stored = answer.fields;
      } catch (err) {
        if (!(err instanceof CommandAnswerLostError)) throw err;
        // The transaction may have committed without the answer reaching us.
        // Read the project again instead of claiming either outcome.
        const reread = await loadProjectAndHydrate(projectId as string).catch(() => null);
        // All of it, not the code alone (`holdsStoredPackage`, 546d27f6f092).
        if (!reread || !holdsStoredPackage(reread, packaged, tests)) {
          throw new Error(`${err.message} The project does not hold this package now — reload the stage to see which version is stored before generating again.`);
        }
        stored = { generatedCode: packaged, testSuite: reread.testSuite, status: String(reread.status ?? '') };
      }

      setFiles(filesArray);
      // The stepper, the blockers and the verification rail all read `project`
      // (`lib/workflow-steps.ts`); without this they went on describing the
      // state before the generation until something else reloaded the page
      // (QA review of 33471220d6e9, ce37b706107d). From what the server
      // stored, not from what this tab hoped it wrote.
      setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
      const mainPath = isAbapCloud ? 'src/zcl_demo_rap_behavior.clas.abap' : 'srv/service.ts';
      const hasMainFile = filesArray.some(f => f.path === mainPath);
      setSelectedFilePath(hasMainFile ? mainPath : (filesArray[0]?.path || ''));
    } catch (err) {
      console.error('Transformation Error:', err);
      setError(err instanceof Error && err.message.trim()
        ? err.message
        : 'The generation stopped with an unexpected error. Nothing was saved — try the generation again.');
    } finally {
      generationInFlight.current = false;
      setLoading(false);
      setProgress(100);
    }
    // `profile?.byokConfigured` used to be a dependency here although nothing
    // in this callback reads it. Hydration flipped it from undefined to true,
    // the callback got a new identity, the effect below re-ran and started a
    // second generation while the first model call was still in flight — two
    // charged runs, and whichever answer wrote last became the artefact
    // (QA review of 33471220d6e9, e078d502e983). The ref is the second half:
    // a dependency is not the only way to be called twice.
  }, [projectId]);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(data, projectId as string)) return;
        if (data) {
          setProject(data);
          // Roadmap 8.3 — the stand names its contract. A binding on the
          // project (written only by the server, `POST
          // /api/projects/{id}/contract`) says which track was generated and
          // against which fingerprint, so the words over the code describe the
          // code rather than whatever the route field says today.
          const binding = (data as unknown as { generationBinding?: { route?: { chosen?: string }; contractId?: string; contractFingerprint?: string } }).generationBinding;
          if (binding?.route?.chosen) {
            setContractTrack({
              isAbapCloud: binding.route.chosen === 'in-app-rap',
              sentence: `Generated against contract ${binding.contractId || '—'} (${String(binding.contractFingerprint || '').slice(0, 12)}).`,
            });
          }
          if (data.generatedCode) {
            const parsedFiles = parseGeneratedCode(data.generatedCode);
            setFiles(parsedFiles);
            const hasServiceTs = parsedFiles.some(f => f.path === 'srv/service.ts');
            setSelectedFilePath(hasServiceTs ? 'srv/service.ts' : (parsedFiles[0]?.path || ''));
            setLoading(false);
          } else if (generationPrerequisites(data, 'transformation').length === 0 && generationBlockers(data, 'transformation').length === 0) {
            // Not from a design written for a previous source (E01-F01-US02).
            // The page used to generate from whatever design was there.
            // The inputs are read again by the generation itself, together
            // with the token they are stored against (roadmap 3.0.11).
            // Started by the effect below once the model switch has answered.
            setAwaitingAutoGeneration(true);
          } else {
            setLoading(false);
          }
        } else {
          setError('This project was not found. Go back to your workspace and open it from there.');
          setLoading(false);
        }
      } catch (err) {
        console.error('Fetch Project Error:', err);
        setError('The project could not be loaded. Reload the page to try again.');
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, generateTransformation]);

  /**
   * The first generation of a project, started only when this stage may call a
   * model. It used to start straight from the load, whatever the switch in
   * Settings said or whether any key existed, and the reader got the proxy's
   * refusal as a failed generation (QA full review of fc78767, 6f3dc15e6f7b).
   * The hook is optimistic while it loads, so this waits for its answer; a
   * stage that is off or keyless ends in the "not generated" state, which says
   * which of the two it is (`autoGenerationBlocked` below — derived, so this
   * effect writes no state of its own).
   */
  useEffect(() => {
    if (!awaitingAutoGeneration || modelAvailability.loading || autoGenerationStarted.current) return;
    if (!modelAvailability.enabled('transformation')) return;
    // Out of the effect body, as the load's call was (it ran after an await):
    // the generation sets state before its first await. Cancelled with the
    // effect, so a switch that changes in the same tick starts nothing.
    const timer = setTimeout(() => {
      autoGenerationStarted.current = true;
      generateTransformation();
    }, 0);
    return () => clearTimeout(timer);
  }, [awaitingAutoGeneration, modelAvailability, generateTransformation]);
  const autoGenerationBlocked =
    awaitingAutoGeneration && !modelAvailability.loading && !modelAvailability.enabled('transformation');
  /** `loading`, except while waiting on a generation this stage may not start. */
  const busy = loading && !autoGenerationBlocked;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && progress < 95) {
      interval = setInterval(() => {
        setProgress((prev) => prev + (prev < 80 ? 2 : 0.5));
      }, 200);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  const phases = workflowSteps(project);
  const blockers = generationBlockers(project, 'transformation');
  /** Why the engine cannot be run by hand now, or null when it can (6f3dc15e6f7b). */
  const modelOff = modelAvailability.enabled('transformation')
    ? null
    : modelAvailability.keyAvailable
      ? 'The transformation stage is turned off in Settings.'
      : 'No Gemini API key is available — add your own in Settings.';
  /**
   * What is not on record yet (owner report 03.10.2026, v3.0.1). The button
   * used to be enabled over a missing design and return from its click without
   * a word; each entry is now a sentence beside it with the one action that
   * resolves it, and the button waits until the list is empty.
   */
  const prerequisites = generationPrerequisites(project, 'transformation');
  const canGenerate = project !== null && prerequisites.length === 0 && blockers.length === 0 && modelOff === null;
  /** Once a package exists the button replaces it, and says so. */
  const generateLabel = files.length > 0 ? 'Regenerate code' : 'Generate code';
  /** The first reason the code cannot be generated now, for the empty package card. */
  const whyNotGenerated = prerequisites[0]?.reason ?? (blockers.length > 0 ? blockers.join(' ') : modelOff);
  const staleNotes = [
    ...blockers,
    ...(phases.find((p) => p.key === 'transformation')?.state === 'stale'
      ? [`The code shown here was generated from ${previousBasis(project)} — it is not a transformation of the current one.`]
      : []),
  ];

  /**
   * The signed score as a ring — ink on the line colour, the same ring the
   * Analyze stage draws (D.10a). A score is a measurement, not a proof, so it
   * is not green, and it is not red or amber either: the words beside it say
   * what the number means (ADR-007).
   */
  const scoreRing = (size: number, stroke: number) => {
    const r = size / 2 - stroke;
    const c = 2 * Math.PI * r;
    return (
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle className="stroke-cc-line fill-none" strokeWidth={stroke} r={r} cx={size / 2} cy={size / 2} />
        {currentScore !== undefined && (
          <circle
            className="stroke-cc-ink fill-none"
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c - (currentScore / 100) * c}
            strokeLinecap="round"
            r={r}
            cx={size / 2}
            cy={size / 2}
          />
        )}
      </svg>
    );
  };

  const openSignOffs = findings.filter(f => f.requiresSignOff && !signedOffIds.has(`${f.construct}-${f.location?.line}`)).length;

  if (busy && !transformedCode) return (
    <StageFrame stage="transformation">
      <StageHeader stage="transformation" tools={{ steps: phases, current: 'transformation' }} projectName={project?.name}>
        {/* Before the project has loaded its track is unknown, and the
            default copy named the side-by-side track for an ABAP Cloud
            project (carried QA finding 7abe866543dd). */}
        <span data-track-loading>{project ? track.loading : 'Opening the project…'}</span>
      </StageHeader>

      {/* The generation, while it runs. It used to be a black console with a
          pulsing chip icon under "AI Transformation Engine" (§3.1: no model
          iconography, §1.1: no dark panels besides code). The progress, the
          log and the placeholder for the code are what it showed, and they
          stay. */}
      <section
        aria-busy="true"
        aria-labelledby="transformation-progress-title"
        className="mt-6 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
      >
        <div className="p-6 flex flex-col md:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <h2 id="transformation-progress-title" className="cc-text-h2 text-cc-ink">Generating the transformation</h2>
            <div className="mt-6 space-y-2">
              <div
                role="progressbar"
                aria-label="Generation progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                className="w-full h-2 bg-cc-line rounded-full overflow-hidden"
              >
                <div className="h-full bg-cc-ink transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="flex justify-between cc-text-meta font-cc-mono text-cc-ink-muted">
                <span>{progress.toFixed(0)}% processed</span>
                <span>Executing …</span>
              </div>
            </div>
          </div>

          <div
            aria-label="Generation log"
            className="w-full md:w-80 h-48 overflow-y-auto rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 font-cc-mono text-[12px] text-cc-ink-muted"
          >
            {transformationLog.map((log, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <span className="shrink-0">[{new Date().toLocaleTimeString('en', { hour12: false })}]</span>
                <span className="text-cc-ink">{log}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-cc-line p-6">
          <CcSkeleton shape="text" label="transformed code" count={6} />
        </div>
      </section>
    </StageFrame>
  );

  if (evidencePending) return (
    <StageFrame stage="transformation">
      <StageHeader stage="transformation" tools={{ steps: phases, current: 'transformation' }} projectName={project?.name}>
        <span data-evidence-loading>Opening the project…</span>
      </StageHeader>
      <div className="mt-6">
        <CcSkeleton shape="text" label="the engine's findings" count={6} />
      </div>
    </StageFrame>
  );

  /** The legacy source beside the generated code — drawn whether or not the findings could be read. */
  const sideBySide = (
          <section
            id="tf-side"
            aria-labelledby="tf-side-title"
            className="min-w-0 scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="tf-side-title" className="m-0 cc-text-h2 text-cc-ink">Side by side with ABAP</h2>
              <CcButton
                aria-pressed={syncScroll}
                icon={syncScroll ? <Lock size={16} aria-hidden="true" /> : <Unlock size={16} aria-hidden="true" />}
                onClick={() => setSyncScroll(!syncScroll)}
              >
                Sync Scroll: {syncScroll ? 'ON' : 'OFF'}
              </CcButton>
            </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Legacy Code Panel */}
        <section aria-labelledby="legacy-source-title" className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-2 min-h-6">
            <Terminal size={14} aria-hidden="true" className="text-cc-ink-muted" />
            <h3 id="legacy-source-title" className="cc-text-label text-cc-ink-muted">Legacy Source (ABAP)</h3>
          </div>
          <div
            ref={legacyScrollRef}
            onScroll={handleLegacyScroll}
            className="h-[640px] overflow-y-auto rounded-cc-card bg-cc-code-bg"
          >
            <CodeHighlighter
              language="abap"
              label="Legacy source (ABAP)"
              code={project?.legacyCode || ''}
            />
          </div>
        </section>

        {/* Transformed Code Panel */}
        <section aria-labelledby="target-code-title" className="flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2 min-h-6">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode2 size={14} aria-hidden="true" className="text-cc-ink-muted shrink-0" />
              <h3 id="target-code-title" className="cc-text-label text-cc-ink-muted" data-track-pane>{track.pane}</h3>
            </div>
            {/* "AI Verified" was unconditional. No compiler, no test runner and
                no validator has looked at this output — the transformation path
                parses the model's response, and falls back to accepting
                arbitrary non-JSON text. "Generated" is what actually happened.
                Roadmap 1.2: and only when something was (V25-A12) — the badge
                used to sit over an empty pane and say a model had produced it.
                D.15: the words come from the provenance list now ("Model
                proposal", §4), with the pen, not a sparkle (§3.1). */}
            {files.length > 0 && <CcProvenanceChip value="proposed" />}
          </div>
          <div className="h-[640px] flex flex-col md:flex-row overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface">
            {/* File Explorer Sidebar */}
            <nav aria-label="Project files" className="w-full md:w-56 border-b md:border-b-0 md:border-r border-cc-line bg-cc-surface-muted overflow-y-auto flex flex-col shrink-0 h-40 md:h-auto">
              <div className="px-3 py-2 border-b border-cc-line flex items-center justify-between shrink-0">
                <span className="cc-text-label text-cc-ink-muted">Project Files</span>
                <CcTag>Workspace</CcTag>
              </div>
              <div className="p-2 space-y-1">
                {renderFileTree()}
              </div>
            </nav>

            {/* Code Viewer Area with minimap */}
            <div className="flex-1 flex overflow-hidden bg-cc-code-bg min-w-0">
              {/* Roadmap 0.2 (UX-038). A banner used to sit here saying
                  either "Clean Core Refactored Mode: Legacy ABAP SQL quirks
                  remediated to standard Cloud APIs" or "Strict Legacy Mode:
                  Exact ABAP SQL query quirk behaviors emulated for parity",
                  switched by a toggle in the drawer. Neither sentence was true
                  of the code below it: the generation prompt never mentions a
                  mode, nothing is regenerated when the toggle moves, and the
                  bytes in the pane are identical either way. A reader could
                  flip to "Clean Core Refactored", copy the code, and carry away
                  SQL semantics nobody had changed.

                  Both the banner and the toggle are gone rather than reworded.
                  Making the switch real means a second, mode-specific
                  generation — a paid model call, a stored variant per mode, and
                  a diff between them — which is transformation-engine work for
                  a later phase, not a Phase 0 correction. Until that exists,
                  the honest thing this stage can say about quirk handling is
                  nothing. */}

              {/* Code Viewer Scroll Container */}
              <div
                ref={modernScrollRef}
                onScroll={handleModernScroll}
                data-stage-output={transformedCode ? 'generatedCode' : undefined}
                className="flex-1 min-w-0 overflow-y-auto"
              >
                {files.length === 0 && !busy ? (
                  /* Roadmap 1.2 / V25-A12. An empty syntax highlighter under a
                     green "AI Generated" badge is the exact failure the
                     acceptance names: a reader sees a code pane that produced
                     nothing and cannot tell whether that is the answer. */
                  <div className="h-full bg-cc-surface p-6">
                    <NotGenerated
                      what="Transformed code"
                      absence={
                        !modelAvailability.enabled('transformation')
                          ? modelAvailability.keyAvailable
                            ? 'stage-off'
                            : 'no-key'
                          : null
                      }
                      stage="transformation"
                      hint={
                        modelAvailability.enabled('transformation')
                          ? whyNotGenerated ?? 'Use Generate code above to have the model propose it from the signed analysis and the approved design.'
                          : modelAvailability.keyAvailable
                            ? 'Turn the transformation stage back on in Settings to generate it.'
                            : 'Add your own Gemini API key in Settings to generate it.'
                      }
                    />
                  </div>
                ) : (
                  <CodeHighlighter
                    language={getFileLanguage(selectedFilePath)}
                    label={selectedFilePath || 'Transformed code'}
                    code={transformedCode}
                  />
                )}
              </div>

              {/* Code-Integrity Minimap Heatmap Strip. The dot carries the
                  support level's state colour; its name says the level in
                  words, so colour is never the only cue (§2.4). */}
              <div className="relative w-6 shrink-0 border-l border-cc-code-muted/40 select-none">
                {getModernMarkers().map((marker, i) => {
                  const totalLines = transformedCode.split('\n').length || 1;
                  const topPercent = Math.min(95, Math.max(5, (marker.line / totalLines) * 90 + 5));
                  return (
                    <button
                      type="button"
                      key={i}
                      aria-label={`Go to line ${marker.line}: ${marker.title}. ${marker.detail}`}
                      title={`Line ${marker.line}: ${marker.detail}`}
                      onClick={() => scrollToLine(marker.line)}
                      className="absolute left-1/2 -translate-x-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                      style={{ top: `${topPercent}%` }}
                    >
                      <span
                        aria-hidden="true"
                        className={clsx('block w-3 h-3 rounded-full border border-cc-code-bg', STATE_CLASSES[SUPPORT_LEVEL_STATE[marker.level]].mark)}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
          </section>
  );

  return (
    <StageFrame stage="transformation">
      {/* The quota used to be stated a third time here, as "Free
          Transformations: 4 / 5". The header carries it once. Proposal A
          (owner decision 01.10.2026): the title row carries the stage's two
          actions, the facets below it carry the answer. */}
      <StageHeader tools={{ steps: phases, current: 'transformation' }}
        stage="transformation"
        projectName={project?.name}
        actions={
          <>
            <CcButton
              icon={<RefreshCw size={16} aria-hidden="true" />}
              busy={busy}
              // Disabled only while something is missing, and then the reason
              // stands as text under the header (`data-generation-prerequisites`)
              // or in the stale notice — never in a hover title alone. An
              // enabled click always starts the generation, which ends in the
              // code, a contract refusal or the error strip.
              onClick={() => {
                if (canGenerate) generateTransformation();
              }}
              disabled={!canGenerate}
              aria-describedby={!canGenerate && (prerequisites.length > 0 || modelOff) ? 'tf-generate-why' : undefined}
              data-generate-code=""
            >
              {generateLabel}
            </CcButton>
            <CcButton icon={<Code2 size={16} aria-hidden="true" />} onClick={handleCopy}>
              Copy Code
            </CcButton>
          </>
        }
      >
        {/* The track decides the words (roadmap 0.2, UX-037): the in-app
            track generates RAP artefacts, and the lead used to promise
            Node.js over them anyway. */}
        <span data-track-lead>{track.lead}</span>
        {/* Which contract this stand followed, roadmap 8.3. A declared
            deviation is named here, not only applied: a deviation nobody is
            shown is applied but not held. */}
        {contractTrack && (
          <span className="block mt-1 cc-text-cell text-cc-ink-muted" data-contract-sentence>
            {contractTrack.sentence}
          </span>
        )}
      </StageHeader>

      {/* Why the code cannot be generated now, each reason with the one
          action that resolves it (owner report 03.10.2026, v3.0.1). On the
          page, not in a title: a phone has no hover. A stale input is said by
          the notice below, which names the stage to regenerate. */}
      {project && (prerequisites.length > 0 || modelOff) && (
        <div id="tf-generate-why" data-generation-prerequisites="" className="mb-6">
          <CcMessageStrip
            state="information"
            headline={files.length > 0 ? 'The code cannot be regenerated yet.' : 'The code cannot be generated yet.'}
          >
            <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
              {prerequisites.map((p) => (
                <li key={p.id} data-generation-prerequisite={p.id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">{p.reason}</span>
                  <CcLinkButton href={`/project/${String(projectId)}/${p.action.stage}`} icon={<ArrowRight size={16} aria-hidden="true" />}>
                    {p.action.label}
                  </CcLinkButton>
                </li>
              ))}
              {modelOff && (
                <li data-generation-prerequisite="model" className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">{modelOff}</span>
                  <CcLinkButton href="/settings" icon={<ArrowRight size={16} aria-hidden="true" />}>
                    Open Settings
                  </CcLinkButton>
                </li>
              )}
            </ul>
          </CcMessageStrip>
        </div>
      )}

      <StaleNotice title={`Built for ${previousBasis(project)}`} reasons={staleNotes} />

      <CcToast open={showCopyDialog} onDismiss={closeCopyToast}>
        Code copied to clipboard
      </CcToast>

      {copyFailed && (
        <div className="mb-6" data-copy-failed>
          <CcMessageStrip state="error" announce>
            The browser did not allow copying to the clipboard. Nothing was copied — select the code and copy it by hand.
          </CcMessageStrip>
        </div>
      )}

      {/*
        Roadmap 8.3 — a blocked contract generates nothing, and the reader is
        told which sentence of the contract stopped it and what ends it. An
        empty stage with no reason would meet the letter of "nothing is
        generated" and none of the point.
      */}
      {contractRefusal && (
        <div data-contract-refusal={contractRefusal.code} className="mb-6">
          <CcMessageStrip state="warning" headline="Nothing was generated against this contract." announce>
            <span className="block">{contractRefusal.sentence}</span>
            <span className="block">{contractRefusal.remedy}</span>
          </CcMessageStrip>
        </div>
      )}

      {error && (
        <div className="mb-6" data-transformation-error="">
          <CcMessageStrip
            state="error"
            announce
            actions={canGenerate ? (
              <CcButton onClick={() => generateTransformation()} icon={<RefreshCw size={16} aria-hidden="true" />}>
                Try again
              </CcButton>
            ) : undefined}
          >
            {error}
          </CcMessageStrip>
        </div>
      )}

      {unsavedDraft && (
        <div className="mb-6" data-unsaved-draft>
          <CcMessageStrip state="warning" headline="Unsaved draft — this package is not stored on the project.">
            <span className="block">
              The code below is the generation the project could not hold. It is gone once you leave or reload this page.
            </span>
            <span className="mt-2 block">
              <CcButton icon={<Download size={16} aria-hidden="true" />} onClick={downloadUnsavedDraft}>
                Download draft (JSON)
              </CcButton>
            </span>
          </CcMessageStrip>
        </div>
      )}

      {/* The stage's answer, before the code (ADR-050): the facets, the status
          line and the sections of proposal A, every figure counted from the
          engine's findings or the stored package. */}
      {/* Without the engine's findings every facet below would count none —
          "0 findings" for a program that has them. The strip says the read
          failed, and only the source and the package beside it are drawn. */}
      {evidenceFailed ? (
        <div className="mb-6 flex flex-col gap-6" data-transformation-evidence-failed="">
          <CcMessageStrip state="error" announce>
            The evidence for this code could not be read, so its findings and the plan built from them are not shown.
            Reload the page to try again.
            {evidenceFailed !== EVIDENCE_UNREAD ? ` ${evidenceFailed}` : null}
          </CcMessageStrip>
          {sideBySide}
        </div>
      ) : (
      <div data-transformation-answer={unsavedDraft ? 'unsaved-draft' : files.length > 0 ? 'generated' : 'none'}>
        <TransformationObjectPage
          findings={evidence?.findings ?? []}
          coverage={evidence?.coverage ?? null}
          track={isAbapCloud ? 'in-app' : 'side-by-side'}
          codeKind={isAbapCloud ? 'ABAP Cloud (RAP)' : 'Node.js (TypeScript)'}
          files={files}
          openSignOffs={openSignOffs}
          onOpenAudit={() => setDrawerOpen(true)}
          packageActions={
            <CcLinkButton href="#tf-side" icon={<Code2 size={16} aria-hidden="true" />}>
              Side by side with ABAP
            </CcLinkButton>
          }
          emptyPackage={
            <div className="rounded-cc-row border border-dashed border-cc-line bg-cc-surface p-4">
              <p className="m-0 cc-text-h3 text-cc-ink">No transformed code yet</p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                {whyNotGenerated ?? 'The model proposes the code from the signed analysis and the approved design when you choose Generate code.'}
              </p>
            </div>
          }
          extraAnchors={[['tf-side', 'Side by side']]}
          after={sideBySide}
        />
      </div>
      )}

      {/* The grounding audit. It was a dark drawer from the right edge; it is
          a light `CcDialog` now (§1.1: the only dark surface that carries
          content is code). Same content, same sign-off boxes, same jumps. */}
      <CcDialog
        open={drawerOpen}
        onClose={closeDrawer}
        title="Grounding Audit"
        lead="The signed score, the findings that need a sign-off, and the released CDS views the legacy selects map to."
        actions={
          <CcButton onClick={closeDrawer}>Close Audit</CcButton>
        }
      >
        <div className="space-y-6">
          {/* Section 1: Score & Rollup */}
          <div className="rounded-cc-card border border-cc-line p-4 flex items-center gap-4">
            <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
              {scoreRing(80, 6)}
              <span className="absolute cc-text-identifier font-cc-mono text-cc-ink">
                {currentScore === undefined ? '—' : currentScore}
              </span>
            </div>
            <div>
              {/* The score is the signed analysis of the legacy source. It
                  used to be headed "Overall Support Rollup" and read out as
                  "Grounded & Ready" over the generated code, which no
                  compiler, test or validator has looked at (QA full review of
                  fc78767, 88b7d2853f85). The words say what was measured. */}
              <h3 className="cc-text-label text-cc-ink-muted">Signed source-analysis score</h3>
              <p className="cc-text-h2 text-cc-ink mt-1">
                {currentScore === undefined
                  ? 'Not scored yet'
                  : `${scoreBand(currentScore).label} (${bandRange(scoreBand(currentScore))})`}
              </p>
              <p className="cc-text-meta text-cc-ink-muted mt-1" data-score-scope>
                {SCORE_BANDS_SOURCE}. Scores the legacy source, not the generated code — it says nothing about whether the code on the right compiles or passes a test. The Testing stage is where that code runs.
              </p>
              {/* The boxes below are component state: no reviewer, no time, no
                  reason, gone on reload, and no Run is signed when they change.
                  "signed off" said more than that (af9225424d1d). */}
              <p className="cc-text-meta text-cc-ink-muted mt-1" data-review-progress>
                {signedOffIds.size} of {findings.filter(f => f.requiresSignOff).length} manual findings ticked in this browser — review progress only, not saved and not a signed sign-off.
              </p>
            </div>
          </div>

          {/* Section 3: Sign-off Checklist */}
          <div className="space-y-3">
            <h3 className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 cc-text-h3 text-cc-ink">
                <CheckCircle2 size={16} aria-hidden="true" className="text-cc-ink-muted" />
                <span>Sign-off Checklist</span>
              </span>
              <span className="cc-text-label text-cc-ink-muted">Action Required</span>
            </h3>

            {findings.length === 0 ? (
              <p className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 text-center cc-text-cell text-cc-ink-muted">
                No support findings require sign-off.
              </p>
            ) : (
              <ul className="space-y-2">
                {findings.map((f, i) => {
                  const id = `${f.construct}-${f.location?.line}`;
                  const isSignedOff = signedOffIds.has(id);
                  return (
                    <li key={i} className="rounded-cc-row border border-cc-line p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        {f.requiresSignOff ? (
                          <CcCheckbox
                            label={f.title}
                            checked={isSignedOff}
                            onChange={() => toggleSignOff(id)}
                          />
                        ) : (
                          <span className="flex items-center gap-2 min-h-8 cc-text-cell text-cc-ink">
                            <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-cc-ink-muted" />
                            {f.title}
                          </span>
                        )}
                        <span className="shrink-0 pt-2">
                          <SupportLevelMark level={f.level} />
                        </span>
                      </div>
                      <p className="pl-6 cc-text-cell text-cc-ink-muted">
                        {f.detail}
                      </p>
                      {f.location && (
                        <div className="pl-6 flex items-center justify-between gap-2">
                          <span className="cc-text-meta font-cc-mono text-cc-ink-muted">
                            {f.location.file}:{f.location.line}
                          </span>
                          <CcButton
                            icon={<ArrowRight size={14} aria-hidden="true" />}
                            onClick={() => {
                              if (f.location?.line) {
                                scrollToLine(f.location.line);
                                setDrawerOpen(false);
                              }
                            }}
                          >
                            Jump to line
                          </CcButton>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Section 4: SQL CDS View Matches */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 cc-text-h3 text-cc-ink">
              <Layers size={16} aria-hidden="true" className="text-cc-ink-muted" />
              <span>SQL CDS Matches</span>
            </h3>
            <div className="space-y-2">
              {project?.legacyCode && extractSelects(project.legacyCode).map((sel, idx) => {
                const parsed = parseSelect(sel.text, 'main.abap', sel.line);
                const cds = matchCdsView(parsed);
                if (!cds) return null;
                return (
                  <div key={idx} className="rounded-cc-row border border-cc-line p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-cc-line pb-2">
                      <span className="cc-text-identifier font-cc-mono text-cc-ink">Match #{idx+1}</span>
                      <CcTag>
                        {cds.exact ? 'Exact Match' : 'Superset Match'} (Conf: {cds.confidence})
                      </CcTag>
                    </div>
                    <div className="flex items-center justify-center gap-4 py-2 rounded-cc-row bg-cc-surface-muted">
                      <div className="text-center">
                        <div className="cc-text-label text-cc-ink-muted">Legacy Tables</div>
                        <div className="cc-text-identifier font-cc-mono text-cc-ink mt-1">
                          {parsed.from.name} {parsed.joins.map(j => `+ ${j.table.name}`).join(' ')}
                        </div>
                      </div>
                      <ArrowRight size={14} aria-hidden="true" className="text-cc-ink-muted" />
                      <div className="text-center">
                        <div className="cc-text-label text-cc-ink-muted">Target CDS View</div>
                        <div className="cc-text-identifier font-cc-mono text-cc-ink mt-1">{cds.view}</div>
                      </div>
                    </div>
                    <p className="cc-text-meta italic text-cc-ink-muted">
                      {cds.note || 'Resolved standard S/4HANA released CDS view.'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CcDialog>

      <StageFooter />
    </StageFrame>
  );
}
