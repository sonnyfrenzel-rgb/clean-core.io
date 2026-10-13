'use client';

export const dynamic = 'force-dynamic';

import { SCORE_BANDS_SOURCE, bandRange, scoreBand } from '@/lib/clean-core-score';
import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { CODE_DRAFT_BUSINESS_RULES, codeDraftFactsSection, hardCodedLiteralFindings } from '@/lib/code-draft-rules';
import { generatedCodeLints, lintCountLine, packedDecimalFields } from '@/lib/generated-code-lints';
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
import ReplaceStoredBox from '@/components/ReplaceStoredBox';
import OwnerOnlyNote from '@/components/OwnerOnlyNote';
import { useSignedInUid } from '@/components/workspace/BusinessRulesEditor';
import { isProjectOwner } from '@/lib/project-readers';
import { wt } from '@/lib/workspace-messages';
import { CcTag } from '@/components/cc/Tag';
import { STATE_CLASSES } from '@/components/cc/state';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import { SUPPORT_LEVEL_STATE } from '@/lib/support-level';
import { normalisedPackageJson, packageDockerfile } from '@/lib/delivery-package';
import { callGemini } from '@/lib/gemini';
import { parseModelJsonObject, retryNotice, unusableAnswerMessage, unusableFromModelError, type UnusableAnswer } from '@/lib/model-json';
import type { Project } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';

import { detectFindings } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
// The required-artefact table and its matcher live in lib/ so a spec can run the
// real gate instead of a copy of it (QA review of 9e408888bfec, 3c05340dc39b).
import { holdsStoredPackage, missingArtefacts, usableTestSuite, type GeneratedTestSuite, type ProjectFile } from '@/lib/transformation-artefacts';
// Roadmap 3.0.12, step E — the engine-led generation. Only types and the
// light pieces are imported here; the engine, the scaffold and the
// orchestrator are loaded when a generation starts.
import type { GenerationLease, LeaseRequestError } from '@/lib/transformation/lease-client';
import type { CheckSummary, UnitRow } from '@/lib/transformation/engine-led';
import { checkPhrase, checkStateOf, checkSummaryOf, orderedChecks } from '@/lib/transformation/check-words';
import type { GenerationEvent } from '@/lib/transformation/types';
import { storedGenerationRecord } from '@/lib/transformation/generation-record';
import { abapLines, fileGroups, traceOfFiles, unitsOfFile } from '@/lib/transformation/trace-view';
import BuiltOnCard from '@/components/transformation/BuiltOnCard';
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
import { enterGenerationPhase, type GenerationPhase, type GenerationPhaseKey } from '@/lib/generation-progress';
// Roadmap 3.0.12 (owner 12.10.2026): the tips before a generation and the
// screen while it runs, both from one model of what the generation builds on.
import QualityTips from '@/components/transformation/QualityTips';
import GenerationChain from '@/components/transformation/GenerationChain';
import {
  chainSlots,
  enterStage,
  finishStages,
  generationStages,
  pendingChecks,
  pendingEngineChecks,
  scaffoldFactsLines,
  unitBoard,
  type BoardEvent,
  type ChainSlot,
  type GenerationPathKey,
  qualityTips,
  decisionWarning,
  setCheck,
  withChecks,
  originalFactsLines,
  purposeFromContext,
  specOfRecord,
  tipsSettled,
  withFacts,
  type ChainPurpose,
  type ChainRules,
  type ChainSpecRead,
  type GenerationCheckState,
  type GenerationStageLog,
} from '@/lib/transformation-chain';
import { getAuth } from '@/lib/firebase';
import { useProcessStates } from '@/hooks/useProcessStates';
import { readProcessStatesOutcome, type StatesReadOutcome } from '@/lib/process-states-client';
import type { RuleRegister } from '@/lib/rule-register';
import { rulesReadRefusal, tfFilesResult, tfFillsNote, tfLiteralsResult, tfSingleCallNote } from '@/lib/workspace-messages';

/**
 * An authenticated JSON POST that honours the generation's cancel — the
 * runner checks' transport (`runnerOverHttp`, `lib/transformation/verify.ts`).
 */
async function postJson(url: string, body: unknown, signal: AbortSignal): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: json };
}

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

/**
 * The generation log is gone (roadmap 3.0.12): its rows — "Initializing
 * transformation engine…", "Parsing legacy ABAP structures…" — were written
 * before anything was parsed. The screen now lists what the generation builds
 * on and the stages that actually run (`lib/transformation-chain.ts`); the
 * one row that said something real, the second model call, is the model
 * stage's detail.
 */

/**
 * The rule register from what the process-states route answered. Without a
 * stored process revision (`no-baseline`) nobody has answered a rule, so the
 * rules are read from the source as Delivery reads them — after the browser is
 * idle, and capped by the register's own byte limit. The module is imported on
 * demand, so a page that never reads the rules does not download the reader.
 */
async function ruleRegisterOf(outcome: StatesReadOutcome, source: string): Promise<RuleRegister> {
  const reg = await import('@/lib/rule-register');
  if (outcome.ok) return reg.ruleRegisterFromView(outcome.view);
  if (outcome.code === 'no-baseline') {
    await new Promise<void>((resolve) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve(), { timeout: 1500 });
      else setTimeout(resolve, 0);
    });
    return reg.ruleRegisterFromSource(source);
  }
  return reg.ruleRegisterFromView(null, rulesReadRefusal(outcome.code));
}

/** The address the page is on, read in the browser only (as `StageHeader` reads it). */
const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

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
  /**
   * Roadmap 3.0.12 (owner 12.10.2026): the first generation is no longer
   * started by opening the stage. The reader sees what would raise the
   * quality of the code first — the open rules, the requirements, the target —
   * and starts it with "Generate now", which is always there. A paid model
   * call that begins on a page load gave nobody the chance to read the tips
   * it was meant to follow, and said its cost only after it had begun (§2.8).
   */
  /**
   * An invited reader reads the code; generating it is the owner's, and the
   * server refuses it for anyone else (ADR-083, decision-input audit item 4).
   * Nothing is generated on a reader's visit and no button offers it.
   */
  const signedInUid = useSignedInUid();
  const isOwner = isProjectOwner(project, signedInUid);
  /** "Replace the generated code?" is open (ADR-083, audit item 3). */
  const [replaceCodeAsk, setReplaceCodeAsk] = useState(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const [transformedCode, setTransformedCode] = useState('');
  /** The stages of the running generation, as they begin and end (`lib/transformation-chain.ts`). */
  const [stageLog, setStageLog] = useState<GenerationStageLog>({});
  /**
   * The chain while a generation runs: its slots light once the contract has
   * answered with the PLATFORM KNOWLEDGE block they go into (`chainLit`); the
   * rules are read again beside it (`chainRules`, `null` outside a run), and
   * the time since the click is the header's clock (`runStartedAt`).
   */
  const [chainLit, setChainLit] = useState(false);
  const [chainRules, setChainRules] = useState<ChainRules | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  /** What the program is for (First insights) — read before the run, then taken from the block the prompt carries. */
  const [purpose, setPurpose] = useState<ChainPurpose>({ state: 'loading' });
  /** The requirements specification, counted by kind (ADR-078) — read on every visit. */
  const [specRead, setSpecRead] = useState<ChainSpecRead>({ state: 'loading' });
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
  /**
   * The step the generation is in, and when it began (`lib/generation-progress.ts`).
   * The bar used to be a timer that reached 95 % in about fourteen seconds and
   * stood there for the whole model call (owner report 06.10.2026).
   */
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase | null>(null);
  /** The clock the bar and the elapsed time are drawn against while a generation runs. */
  const [now, setNow] = useState(() => Date.now());
  const enterPhase = useCallback((key: GenerationPhaseKey) => {
    const at = Date.now();
    setGenerationPhase(prev => enterGenerationPhase(prev, key, at));
    setNow(at);
  }, []);
  /** One check of the answer, recorded as it is made. */
  const recordCheck = useCallback((key: string, state: GenerationCheckState, result?: string) => {
    setStageLog((log) => withChecks(log, setCheck(log.checks?.checks ?? pendingChecks(), key, state, result)));
  }, []);
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

  /**
   * The rules' states, for the tips (roadmap 3.0.12) — the hook the Business
   * view reads, read again every time this stage opens, so a reader who
   * decided rules there and came back sees the new count, never the one this
   * tab held before. Until the fresh read is in, the tip says "Reading…".
   */
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);
  const readerView = new URLSearchParams(search).get('view');
  const readsRules = Boolean(isOwner && project?.legacyCode);
  const { outcome: statesOutcome, reload: reloadStates } = useProcessStates(projectId as string, readsRules);
  const [statesFresh, setStatesFresh] = useState(false);
  const [ruleRegister, setRuleRegister] = useState<RuleRegister | null>(null);
  /**
   * The counts of the tips, read again on every visit and whenever the tab
   * comes back into view (design §14.2): the rule states and the requirements
   * specification. Both are the sources the PLATFORM KNOWLEDGE block reads.
   */
  const refreshTips = useCallback(async () => {
    const readSpec = async (): Promise<ChainSpecRead> => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        const res = await fetch(`/api/projects/${encodeURIComponent(String(projectId))}/requirements-spec`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return { state: 'unread' };
        const body = (await res.json().catch(() => null)) as { record?: unknown } | null;
        return { state: 'ready', spec: specOfRecord(body?.record ?? null, projectRef.current) };
      } catch {
        return { state: 'unread' };
      }
    };
    const [, spec] = await Promise.all([reloadStates(), readSpec()]);
    setSpecRead(spec);
    setStatesFresh(true);
  }, [projectId, reloadStates]);
  useEffect(() => {
    if (!readsRules) return;
    let live = true;
    void refreshTips().catch(() => {
      if (live) setStatesFresh(true);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTips();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [readsRules, refreshTips]);
  const legacySource = project?.legacyCode ?? '';
  /**
   * What the program is for, before the run — the same reading Analyze opens
   * with ("In short"), done once the browser is idle and only for a source the
   * readers accept. During a generation the sentence of the PLATFORM KNOWLEDGE
   * block replaces it.
   */
  useEffect(() => {
    if (!readsRules || !legacySource) return;
    let live = true;
    const run = async () => {
      try {
        if (new TextEncoder().encode(legacySource).length > 256 * 1024) {
          if (live) setPurpose({ state: 'unread', reason: 'The source is too large for the summary reader.' });
          return;
        }
        const [{ programSummaryFactsOf }, { programSummary }] = await Promise.all([
          import('@/lib/program-summary-facts'),
          import('@/lib/program-summary-text'),
        ]);
        const lines = programSummary(programSummaryFactsOf(legacySource)).lines.filter((l) => l.key === 'purpose').map((l) => l.text);
        if (live) setPurpose({ state: 'ready', text: lines.length ? lines.join(' ') : null });
      } catch {
        if (live) setPurpose({ state: 'unread', reason: 'The summary reader could not walk the source.' });
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const handle = typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(() => void run(), { timeout: 2000 }) : window.setTimeout(() => void run(), 200);
    return () => {
      live = false;
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [readsRules, legacySource]);
  useEffect(() => {
    if (!statesFresh || !statesOutcome) return;
    let live = true;
    void ruleRegisterOf(statesOutcome, legacySource)
      .then((register) => {
        if (live) setRuleRegister(register);
      })
      .catch(() => {
        if (live) setRuleRegister({ state: 'not-read', reason: 'the rule reader could not walk the source.' });
      });
    return () => {
      live = false;
    };
  }, [statesFresh, statesOutcome, legacySource]);

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
  /**
   * 3.0.10 (external review F-01) — document-number-shaped literals the
   * generated logic compares against, read deterministically from the
   * package on screen. A warning, not a refusal: the reader decides.
   */
  const literalFindings = useMemo(() => hardCodedLiteralFindings(files), [files]);
  /**
   * 3.0.12 — the deterministic code checks (number parsing, global state, run
   * ids, decimals, CSV, start on import, claimed integrations, dependencies,
   * ignored options), the same list STATUS.md carries in the delivery package.
   * `legacySource` is declared above, with the quality tips.
   */
  const codeLintFindings = useMemo(
    () => generatedCodeLints(files, { decimalFields: packedDecimalFields(legacySource) }),
    [files, legacySource],
  );
  /** The engine-led package's own trace, or null (the single call, a package from before 3.0.12). */
  const packageTrace = useMemo(() => traceOfFiles(files), [files]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('srv/service.ts');
  /** The functions of the selected file, for the anchor row above the code (design §12.1). */
  const selectedUnits = packageTrace ? unitsOfFile(packageTrace, selectedFilePath) : [];
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
    
    // Legacy fallback: one flat source, shown with the build files the
    // package templates of the delivery bundle write
    // (`lib/delivery-package.ts`) — Node.js 22, the service run through tsx,
    // and a runtime stage that takes the sources, never the builder's
    // node_modules (owner, 11.10.2026; external review F-05).
    return [
      {
        path: 'srv/service.ts',
        content: codeStr
      },
      {
        path: 'package.json',
        content: normalisedPackageJson(undefined, {
          name: 'clean-core-modernized-service',
          entry: 'srv/service.ts',
          testFiles: [],
          runner: null,
        }).content,
      },
      {
        path: 'Dockerfile',
        content: packageDockerfile('srv/service.ts', ['srv']),
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
    // Roadmap 3.0.12, step E (design §12.1): an engine-led package is grouped
    // by what the reader looks for — the steps in process order under their
    // names, the engine-written frame, the tests, what to read first.
    if (packageTrace) {
      return (
        <div className="space-y-4" data-file-tree="trace">
          {fileGroups(files, packageTrace).map((g) => (
            <div key={g.key} className="space-y-1" data-file-group={g.key}>
              <div className="flex items-center gap-2 px-2 py-1 cc-text-label text-cc-ink-muted">
                <Folder size={12} aria-hidden="true" className="shrink-0" />
                <span>{g.label}</span>
              </div>
              <div className="pl-2 space-y-1 border-l border-cc-line ml-3">
                {g.files.map((f) => {
                  const file = files.find((x) => x.path === f.path);
                  return file ? renderFileButton(file, f.label) : null;
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }
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

  /**
   * The single call — today's generation, kept as the fallback of the
   * engine-led path (roadmap 3.0.12, design §16.2): when no scaffold can be
   * built, or the lease is refused for another reason than the reader's own
   * limit. It keeps today's metering (one proxy call, counted against the
   * account's hourly limit) and says on the screen, above the result and in
   * STATUS.md why it ran. Its prompt, retry and checks are unchanged.
   */
  const runSingleCall = useCallback(async (args: {
    legacyCode: string;
    design: string;
    businessAnalysis: string;
    platformKnowledge: string;
    isAbapCloud: boolean;
    fallbackReason: string | null;
    signal: AbortSignal;
    store: (files: ProjectFile[], tests: GeneratedTestSuite, record: unknown) => Promise<void>;
    basis: () => unknown[];
    startedAt: number;
  }) => {
    const { legacyCode, design, businessAnalysis, platformKnowledge, isAbapCloud, fallbackReason, signal } = args;
    // Roadmap 3.0.12 (CO/FI/PP/SD reviews): the original's checks, packed
    // decimals and selection inputs, read from the source without a model,
    // so the prompt names the guards, places and options to keep. The readers
    // are imported here, as the test generation does, so a reader who never
    // generates does not download them. Unreadable → the section says so.
    setStageLog((log) => enterStage(log, 'facts', Date.now(), { detail: tfSingleCallNote(fallbackReason) }));
    let originalFacts: string;
    try {
      const [{ deriveBusinessRules }, { materialRules }, { readOriginalContract }] = await Promise.all([
        import('@/lib/abap/business-rule-set'),
        import('@/lib/testing-rule-trace'),
        import('@/lib/abap/original-contract'),
      ]);
      const original = readOriginalContract(legacyCode);
      originalFacts = codeDraftFactsSection(original, materialRules(deriveBusinessRules(legacyCode)));
      setStageLog((log) => withFacts(log, 'facts', originalFactsLines(original)));
    } catch (factsErr) {
      console.error('The original\'s checks and declarations could not be read for the code draft:', factsErr);
      originalFacts = codeDraftFactsSection(null);
      setStageLog((log) => withFacts(log, 'facts', originalFactsLines(null)));
    }

      const prompt = isAbapCloud
        ? `You are an elite SAP RAP & ABAP Cloud Developer. Transform the following legacy ABAP code into a modern, production-ready modular SAP RAP (RESTful Application Programming Model) Developer Extensibility target architecture based on the provided Solution Design and Business Analysis.
        
        Legacy ABAP Code:
        ${legacyCode}
        
        Business Analysis:
        ${businessAnalysis}
        
        Solution Design:
        ${design}
${platformKnowledge}
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
${platformKnowledge}
        Requirements:
        1. Use TypeScript with ES Modules (ESM).
        2. Follow Clean Architecture and modular structure principles.
        3. Split the modernized implementation into multiple files, including:
           - srv/service.ts: The main business logic and Express route handlers
           - db/schema.cds: SAP CAP schema definition OR TypeORM entities mapping legacy database tables
           - package.json: Application dependencies, metadata, and scripts
           - Dockerfile: Multi-stage container setup for production
           - erp-triggers/zcl_core_event_publisher.clas.abap: S/4HANA-side event trigger: a clean ABAP Cloud class (or BAdI implementation) that publishes the event payload asynchronously to the SAP Event Mesh/REST endpoint on ${BTP} — ONLY where SAP has no standard business event for the change (otherwise omit this file and name the standard event in srv/service.ts), with a topic in the customer's own namespace, never sap.s4.* (rule 23).
        4. Use modern patterns (async/await, dependency injection, structured logging).
        5. CRITICAL FOR SANDBOX: Use standard Node.js built-ins (like 'fetch', 'console') where possible. If you must use external libraries, restrict yourself strictly to: express, pino, pino-pretty, typeorm, @sap-cloud-sdk/http-client, @sap/xssec, and passport. Do NOT use any other external npm modules.
        6. CRITICAL: Do NOT import specific strategies like 'XS720Strategy' from '@sap/xssec' if they are not standard exports. Use standard passport-jwt or mock the authentication middleware entirely.
        7. Add professional JSDoc comments explaining the transformation logic.
        8. Ensure the code is robust with error handling and validation.
        9. Generate a complete Playwright test suite (playwright.config.ts and generated.spec.ts) to verify the API endpoints.
        10. CRITICAL: Export all main business logic functions and classes using ESM 'export' statements so they can be imported and tested by a separate test suite.
${CODE_DRAFT_BUSINESS_RULES}${originalFacts}

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
            }
          ],
          "tests": {
            "config": "/* playwright.config.ts content */",
            "spec": "/* generated.spec.ts content */"
          }
        }
        The event publisher is conditional and therefore not in the structure above: add a files entry with "path": "erp-triggers/zcl_core_event_publisher.clas.abap" (the publisher class in ABAP Cloud syntax) ONLY when SAP has no standard business event for the change. When a standard event exists, the files list has no erp-triggers entry at all and srv/service.ts names the standard event.
        No conversational text.`;

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
    //
    // Owner report 03.10.2026: a complete answer for Z_MM_PO_APPROVAL failed
    // here on the first try and passed on the second. The model had written
    // the ABAP escape `\{` into a JSON string (`lib/model-json.ts` holds the
    // evidence). The request now carries the stage's schema
    // (`lib/model-response-schema.ts`), the parse tolerates the spelling
    // slips it can read without guessing, and an answer that is still
    // unusable — not JSON, or cut off — gets one automatic second call before
    // the reader sees an error. Each call is its own proxy request, counted
    // against the account's rate limit like any other; the log says when the
    // second one is made. Nothing is stored from a failed attempt.
    const MAX_ATTEMPTS = 2;
    let result: Record<string, unknown> | null = null;
    let failure: UnusableAnswer = 'not-json';
    let attempts = 0;
    while (!result && attempts < MAX_ATTEMPTS) {
      const notice = attempts > 0 ? retryNotice(failure) : undefined;
      attempts++;
      // A second call continues the same stage, with the reason said beside it.
      enterPhase('model');
      const attempt = { n: attempts, of: MAX_ATTEMPTS };
      setStageLog((log) => enterStage(log, 'model', Date.now(), notice ? { attempt, detail: notice } : { attempt }));
      let responseText: string;
      try {
        responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'transformation', signal);
      } catch (callErr) {
        if (signal.aborted) throw callErr;
        const unusable = unusableFromModelError(callErr);
        if (!unusable) throw callErr;
        failure = unusable;
        continue;
      }
      const read = parseModelJsonObject(responseText);
      if (read.ok) result = read.value;
      else failure = read.reason;
    }
    if (!result) {
      throw new Error(unusableAnswerMessage(failure, attempts));
    }

    enterPhase('checking');
    setStageLog((log) => withChecks(enterStage(log, 'checks', Date.now()), pendingChecks()));
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
      recordCheck('files', 'failed');
      throw new Error('The model returned no usable code. Nothing was saved — the previous version is untouched. Try the generation again.');
    }
    recordCheck('files', 'met', tfFilesResult(filesArray.length));

    // Nor is a package that answers one path twice (6d411bca538c).
    const repeated = duplicatePaths(filesArray);
    if (repeated.length > 0) {
      recordCheck('paths', 'failed', repeated.join('; '));
      throw new Error(`The model returned more than one file for the same path: ${repeated.join('; ')}. Nothing was saved — the previous version is untouched. Try the generation again.`);
    }
    recordCheck('paths', 'met');

    // And one file is not a package. Every path the prompt enumerated has to
    // be answered, or this is a half-generation and gets reported as one
    // rather than stored as a finished transformation (b88c77b, 7976bced4c28).
    const missing = missingArtefacts(filesArray, isAbapCloud);
    if (missing.length > 0) {
      recordCheck('artefacts', 'failed', missing.join('; '));
      throw new Error(`The model returned an incomplete package. Missing: ${missing.join('; ')}. Nothing was saved — the previous version is untouched. Try the generation again.`);
    }
    recordCheck('artefacts', 'met');

    // The test suite is part of the package the prompt asked for. It used to
    // default to two empty strings and the project was marked transformed
    // without one (QA full review of 81810c8, 183ed4edf700).
    const tests = usableTestSuite(parsed.tests, isAbapCloud);
    if (!tests) {
      recordCheck('tests', 'failed');
      throw new Error('The model returned the code without its test suite. Nothing was saved — the previous version is untouched. Try the generation again.');
    }
    recordCheck('tests', 'met');

    // 3.0.10 (external review F-01): the same deterministic scan the page
    // shows over the stored package, made here so the screen can say its
    // result as a check. A warning, never a refusal — the reader decides.
    const literals = hardCodedLiteralFindings(filesArray).length;
    recordCheck('literals', literals === 0 ? 'met' : 'warning', tfLiteralsResult(literals));

    // The server stores the stand — code, suite, status and the binding to
    // the contract it was computed against — in one transaction (roadmap
    // 8.3, 3.0.11). It rebuilds the contract and writes its own fingerprint,
    // so the binding cannot name a contract that was never derived; and it
    // writes only if the project is still at the token read before the model
    // call. A refusal means nothing was saved. The record says it was the
    // single call, and why (§16.2).
    enterPhase('storing');
    setStageLog((log) => enterStage(log, 'storing', Date.now()));
    await args.store(filesArray, tests, {
      path: 'single-call',
      fallbackReason,
      basis: args.basis(),
      elapsedMs: Date.now() - args.startedAt,
    });
    const mainPath = isAbapCloud ? 'src/zcl_demo_rap_behavior.clas.abap' : 'srv/service.ts';
    const hasMainFile = filesArray.some(f => f.path === mainPath);
    setSelectedFilePath(hasMainFile ? mainPath : (filesArray[0]?.path || ''));
  }, [enterPhase, recordCheck]);

  /**
   * Roadmap 3.0.12, step E — *Cancel* really aborts. One controller per
   * generation, handed to the scaffold worker, the orchestrator (and through it
   * every leased model call, which the proxy aborts on the provider), the
   * runner checks and the single call. Nothing is stored after it.
   */
  const abortRef = useRef<AbortController | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledNote, setCancelledNote] = useState(false);
  const cancelGeneration = useCallback(() => {
    setCancelling(true);
    abortRef.current?.abort();
  }, []);
  /** Which path the running generation is on — the engine-led one, or the single call it fell back to. */
  const [genPath, setGenPath] = useState<GenerationPathKey>('engine-led');
  /** The functions of the running generation (plan order) and the events that move them (§15.2). */
  const [unitRows, setUnitRows] = useState<UnitRow[] | null>(null);
  const [boardEvents, setBoardEvents] = useState<BoardEvent[]>([]);
  const [boardFinal, setBoardFinal] = useState<Array<{ unitId: string; state: 'written' | 'not-written'; reason: string | null }> | null>(null);
  /** The chain as the page reads it, for the Built-on snapshot the store records (§15.4). */
  const slotsRef = useRef<ChainSlot[]>([]);

  const generateTransformation = useCallback(async () => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setLoading(true);
    const startedAt = Date.now();
    setGenerationPhase(enterGenerationPhase(null, 'contract', startedAt));
    setNow(startedAt);
    setError('');
    setUnsavedDraft(null);
    setStageLog({});
    setChainLit(false);
    setChainRules({ state: 'loading' });
    setRunStartedAt(startedAt);
    setCancelledNote(false);
    setCancelling(false);
    setGenPath('engine-led');
    setUnitRows(null);
    setBoardEvents([]);
    setBoardFinal(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let failed = false;

    // The rules, read again for the chain beside the contract — the one
    // request this screen adds, in parallel. Its answer lights the rules slot
    // whenever it comes; the generation does not wait for it.
    const source = projectRef.current?.legacyCode ?? '';
    void readProcessStatesOutcome(projectId as string)
      .then((outcome) => ruleRegisterOf(outcome, source))
      .then((register) => {
        setChainRules({ state: 'ready', register });
        setRuleRegister(register);
      })
      .catch(() => setChainRules({ state: 'ready', register: { state: 'not-read', reason: 'the rule reader could not walk the source.' } }));

    /** What the generation built on, as the screen shows it now — stored with the package (§15.4). */
    const basisNow = () =>
      slotsRef.current.map((s) => ({
        key: s.key,
        title: s.title,
        when: s.when ?? '',
        facts: s.facts.slice(0, 4).map((f) => f.text),
        attention: s.warn !== null || s.state !== 'ready',
      }));

    try {
      // Roadmap 8.3. The direction is the contract's `route.chosen`, which is
      // the recommendation unless a deviation was declared — and a deviation
      // reaches it only with a reason (`lib/architecture-contract.ts` throws
      // without one). A blocked contract generates nothing and says why.
      const { contract, decision, generation } = await fetchGenerationDecision(projectId as string);
      if (!decision.ok) {
        setContractRefusal(decision);
        failed = true;
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
      // Roadmap 3.0.12 (owner, 12.10.2026): what the platform already knows —
      // the owner's rule decisions, the decision record and route, what the
      // program does, the catalog successors, NFRs and data mode — built by the
      // server inside the token (`lib/transformation-context-build.ts`). No
      // engine pass and no map build here.
      const platformKnowledge = generation.inputs.context.text;
      // The chain lights here: its slots are what this block was built from.
      // The purpose is the block's own sentence, so the screen says what the
      // prompt says (`purposeFromContext`).
      const purposeInBlock = purposeFromContext(platformKnowledge);
      if (purposeInBlock) setPurpose({ state: 'ready', text: purposeInBlock });
      setChainLit(true);
      // The narrative is not required: the design is written from it
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

      /** The server's store, with the lost-answer reread (3.0.11) — both paths store through it. */
      const store = async (filesArray: ProjectFile[], tests: GeneratedTestSuite, record: unknown) => {
        const packaged = JSON.stringify(filesArray);
        let stored: { generatedCode: string; testSuite: unknown; status: string; generationBinding?: unknown };
        try {
          const answer = await storeGeneration(projectId as string, {
            generatedCode: packaged,
            testSuite: tests,
            expectedContractFingerprint: generatedAgainst,
            generationToken,
            generation: record,
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
          stored = { generatedCode: packaged, testSuite: reread.testSuite, status: String(reread.status ?? ''), generationBinding: (reread as { generationBinding?: unknown }).generationBinding };
        }
        setFiles(filesArray);
        // The stepper, the blockers and the verification rail all read `project`
        // (`lib/workflow-steps.ts`); without this they went on describing the
        // state before the generation until something else reloaded the page
        // (QA review of 33471220d6e9, ce37b706107d). From what the server
        // stored, not from what this tab hoped it wrote.
        setProject((prev: any) => prev ? { ...prev, ...stored } : prev);
      };

      // ── Roadmap 3.0.12, step E: the engine-led path (design §4) ─────────
      // 1. The unit plan and the scaffold, off the page's thread — never the
      //    BPMN map. A program the engine cannot scaffold falls back below.
      let fallbackReason: string | null = null;
      setStageLog((log) => enterStage(log, 'scaffold', Date.now()));
      // Loaded here, as the facts readers are: a reader who never generates
      // never downloads the engine, the scaffold or the orchestrator (§6.1).
      const [
        { prepareScaffold },
        { requestGenerationLease, leasedFillModel },
        { runGeneration },
        { createRunnerVerifier, runnerOverHttp, packageFormatsHook },
        { guardBodyOf, candidateFiles, assembleEngineLed },
        { sha256Hex },
      ] = await Promise.all([
        import('@/lib/transformation/scaffold-client'),
        import('@/lib/transformation/lease-client'),
        import('@/lib/transformation/orchestrator'),
        import('@/lib/transformation/verify'),
        import('@/lib/transformation/engine-led'),
        import('@/lib/artefact-digest'),
      ]);
      const prep = await prepareScaffold(
        {
          source: legacyCode,
          track: isAbapCloud ? 'rap' : 'node',
          program: projectRef.current?.name ?? null,
          decisions: generation.inputs.context.decisions ?? [],
          contextText: platformKnowledge,
        },
        controller.signal,
      );
      let lease: GenerationLease | null = null;
      if (!prep.ok) {
        fallbackReason = prep.reason;
      } else {
        setStageLog((log) => withFacts(log, 'scaffold', scaffoldFactsLines(prep.facts)));
        setUnitRows(prep.rows);
        // 2. One lease for the whole generation: one unit of the hourly model
        //    limit, at most 48 calls under it (owner, Q1). The user's own
        //    limit is said as such; any other refusal falls back to the single
        //    call, which keeps today's metering.
        try {
          lease = await requestGenerationLease(projectId as string, generationToken, Math.min(prep.plannedCalls, 40));
        } catch (leaseErr) {
          const e = leaseErr as LeaseRequestError;
          if (e.status === 429 || e.code === 'lease-hourly-limit' || e.code === 'model-hourly-limit') {
            throw new Error(`${e.message} Nothing was generated.`);
          }
          if (e.code === 'generation-stale') throw new Error(`${e.message} Nothing was generated — generate again from the current state.`);
          fallbackReason = `the generation could not be prepared: ${e.message || 'the lease was refused'}`;
        }
      }
      if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });

      if (prep.ok && lease && fallbackReason === null) {
        const leaseNow = lease;
        // 3. The fills, up to four at a time, then the checks and at most two
        //    repair rounds for the failing functions only (§8, §13).
        enterPhase('model');
        setStageLog((log) => enterStage(log, 'fills', Date.now(), { note: tfFillsNote(leaseNow.budget) }));
        // One summary per check and scope: the runner checks come twice, once for
        // the engine's own code and once for the written functions (step E).
        const checkSummaries = new Map<string, CheckSummary>();
        const onEvent = (e: GenerationEvent) => {
          if (e.t === 'fill') setBoardEvents((prev) => [...prev, { t: 'fill', unitId: e.unitId, state: e.state }]);
          if (e.t === 'repair') {
            setBoardEvents((prev) => [...prev, { t: 'repair', round: e.round, unitIds: e.unitIds, state: e.state }]);
            const at = Date.now();
            if (e.state === 'start') {
              setStageLog((log) => withFacts(enterStage(log, 'repairs', at), 'repairs', [`Round ${e.round}: ${e.unitIds.length === 1 ? '1 function goes' : `${e.unitIds.length} functions go`} back to the model with its failing check`]));
            } else {
              setStageLog((log) => withFacts(enterStage(log, 'checks', at), 'repairs', [...(log.repairs?.facts ?? []), `Round ${e.round}: ${e.fixed ?? 0} rewritten`]));
            }
          }
          if (e.t === 'check') {
            checkSummaries.set(
              `${e.kind}:${e.scope ?? ''}`,
              checkSummaryOf<CheckSummary>({ kind: e.kind, total: e.total, failed: e.failed, passed: e.passed, notRun: e.notRun, scope: e.scope, notRunReason: e.notRunReason, baseThrew: e.baseThrew }),
            );
            const at = Date.now();
            // Passed, failed and not run, each scope said apart: a skipped case is
            // never "run", and a check of the engine's own code never stands for
            // the written functions (`lib/transformation/check-words.ts`).
            const ofKind = orderedChecks([...checkSummaries.values()].filter((c) => c.kind === e.kind));
            const result = ofKind.map(checkPhrase).join(' · ');
            const state =
              e.kind === 'guards' || e.kind === 'lint' ? (e.failed === 0 ? 'met' : e.kind === 'guards' ? 'warning' : 'failed') : checkStateOf(ofKind);
            setStageLog((log) => {
              const base = log.checks?.state === 'active' ? log : withChecks(enterStage(log, 'checks', at), log.checks?.checks ?? pendingEngineChecks());
              return withChecks(base, setCheck(base.checks?.checks ?? pendingEngineChecks(), e.kind, state, result));
            });
            if (e.kind === 'guards') enterPhase('checking');
          }
        };
        const verify = createRunnerVerifier({
          candidate: (bodies) => candidateFiles(prep, bodies),
          units: prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id), kind: prep.plan.units.find((p) => p.id === u.unitId)?.kind })),
          lint: (candidate) =>
            generatedCodeLints(candidate, { decimalFields: packedDecimalFields(legacyCode) }).map((f) => ({ path: f.file, line: f.line, message: `${f.severity} ${f.message}` })),
          runOnRunner: runnerOverHttp(projectId as string, postJson),
          // The generated ABAP object files against abapGit's serializer format (every metadata file the RAP scaffold writes) and
          // SAP's file formats (AFF JSON: no schema is in this build until the AFF sync lands, so such a file reads "not run").
          formats: prep.scaffold.track === 'rap' ? packageFormatsHook(() => null) : undefined,
        });
        const result = await runGeneration({
          units: prep.fillUnits,
          plan: prep.plan.units,
          bundleOptions: { track: prep.scaffold.track, program: prep.plan.program, context: platformKnowledge },
          model: leasedFillModel(leaseNow),
          guardBody: guardBodyOf(prep),
          verify,
          budget: Math.max(0, leaseNow.budget - leaseNow.used),
          maxInFlight: leaseNow.maxInFlight,
          signal: controller.signal,
          onEvent,
        });
        setBoardFinal(result.units.map((u) => ({ unitId: u.unitId, state: u.state, reason: u.reason })));
        if (result.status === 'cancelled') throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        const writtenCount = result.units.filter((u) => u.state === 'written').length;
        setStageLog((log) =>
          withFacts(log, 'fills', [
            `${writtenCount} of ${result.units.length} functions written${writtenCount < result.units.length ? `; ${result.units.length - writtenCount} left as stubs` : ''}`,
            `${result.callsUsed} of ${leaseNow.budget} model calls used`,
          ]),
        );
        for (const n of result.checksNotRun) {
          if (n.kind === 'lint') continue;
          setStageLog((log) => withChecks(log, setCheck(log.checks?.checks ?? pendingEngineChecks(), n.kind, 'warning', n.reason)));
        }

        // 4. The package: the final splice (refused if an engine character
        //    moved), the trace, the suite — and the store, as today.
        const pkg = assembleEngineLed(prep, result, {
          contextDigest: sha256Hex(platformKnowledge),
          runId: projectRef.current?.activeRunId ?? null,
          checks: [...checkSummaries.values()],
          budget: leaseNow.budget,
        });
        enterPhase('storing');
        setStageLog((log) => enterStage(log, 'storing', Date.now()));
        await store(pkg.files, pkg.suite, {
          path: 'engine-led',
          engine: pkg.summary,
          basis: basisNow(),
          elapsedMs: Date.now() - startedAt,
        });
        const first = pkg.files.find((f) => f.path === prep.fillUnits[0]?.function.file) ?? pkg.files.find((f) => f.path === 'TRACE.md');
        setSelectedFilePath(first?.path ?? pkg.files[0]?.path ?? '');
        return;
      }

      // ── The fallback: today's single call, with a visible note (§16.2) ──
      setGenPath('single-call');
      await runSingleCall({ legacyCode, design, businessAnalysis, platformKnowledge, isAbapCloud, fallbackReason, signal: controller.signal, store, basis: basisNow, startedAt });
    } catch (err) {
      failed = true;
      if (controller.signal.aborted || (err as { name?: string } | null)?.name === 'AbortError') {
        // Cancelled by the reader: nothing was stored, and that is not an error.
        setCancelledNote(true);
      } else {
        console.error('Transformation Error:', err);
        setError(err instanceof Error && err.message.trim()
          ? err.message
          : 'The generation stopped with an unexpected error. Nothing was saved — try the generation again.');
      }
    } finally {
      generationInFlight.current = false;
      abortRef.current = null;
      setCancelling(false);
      setStageLog((log) => finishStages(log, Date.now(), failed ? 'failed' : 'done'));
      setLoading(false);
      enterPhase('done');
    }
    // `profile?.byokConfigured` used to be a dependency here although nothing
    // in this callback reads it. Hydration flipped it from undefined to true,
    // the callback got a new identity, the effect below re-ran and started a
    // second generation while the first model call was still in flight — two
    // charged runs, and whichever answer wrote last became the artefact
    // (QA review of 33471220d6e9, e078d502e983). The ref is the second half:
    // a dependency is not the only way to be called twice.
  }, [projectId, enterPhase, runSingleCall]);

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
            // An engine-led package opens on its first step (3.0.12, step E).
            const firstStep = parsedFiles.find(f => f.path.startsWith('srv/steps/'));
            setSelectedFilePath(hasServiceTs ? 'srv/service.ts' : (firstStep?.path || parsedFiles[0]?.path || ''));
          }
          // No generation starts here (roadmap 3.0.12): the reader reads the
          // tips first and starts it with "Generate now".
          setLoading(false);
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
   * The first generation used to start from this page's load (behind the model
   * switch, QA full review of fc78767, 6f3dc15e6f7b). Since roadmap 3.0.12 it
   * waits for "Generate now": the tips are what the reader reads first, and the
   * cost line stands beside the button before the click (§2.8). The model
   * switch still decides whether the button can be pressed (`canGenerate`).
   */
  const busy = loading;

  // The clock ticks only while a generation is under way; the elapsed times
  // are derived from it and from the stages, never accumulated.
  const generating = loading && generationPhase !== null && generationPhase.key !== 'done';
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [generating]);

  const phases = workflowSteps(project);
  const blockers = generationBlockers(project, 'transformation');
  /** Why the engine cannot be run by hand now, or null when it can (6f3dc15e6f7b). */
  const modelOff = modelAvailability.enabled('transformation')
    ? null
    : modelAvailability.keyAvailable
      ? 'The transformation stage is turned off in Settings.'
      : 'No Gemini API key is available — add your own in Settings.';
  /**
   * What is not on record yet (owner report 03.10.2026). The button
   * used to be enabled over a missing design and return from its click without
   * a word; each entry is now a sentence beside it with the one action that
   * resolves it, and the button waits until the list is empty.
   */
  const prerequisites = generationPrerequisites(project, 'transformation');
  const canGenerate = project !== null && isOwner && prerequisites.length === 0 && blockers.length === 0 && modelOff === null;
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

  /** The one way a generation starts — the header's button and "Generate now" alike. */
  const startGeneration = () => {
    if (!canGenerate) return;
    // A package on record is replaced: asked first (ADR-083).
    if (files.length > 0) setReplaceCodeAsk(true);
    else generateTransformation();
  };
  /** The tips stand where a generation could start now, or would once the model is on. */
  const showTips = project !== null && isOwner && prerequisites.length === 0 && blockers.length === 0;

  const openSignOffs = findings.filter(f => f.requiresSignOff && !signedOffIds.has(`${f.construct}-${f.location?.line}`)).length;

  /**
   * What the generation builds on and what happens to the answer (roadmap
   * 3.0.12) — the slots light as the running generation reads them, the
   * stages follow the generation as it goes. Built here from what the page
   * holds; nothing is computed for the screen alone.
   */
  const chainInputs = {
    projectId: String(projectId),
    project,
    view: readerView,
    evidence:
      projectEvidence.state === 'ready'
        ? { state: 'ready' as const, findings: projectEvidence.value.evidence.findings }
        : projectEvidence.state === 'failed'
          ? { state: 'failed' as const, reason: projectEvidence.reason }
          : { state: 'loading' as const },
    rules: chainRules ?? (ruleRegister ? { state: 'ready' as const, register: ruleRegister } : { state: 'loading' as const }),
    spec: specRead,
    purpose,
  };
  const tips = qualityTips(chainInputs);
  const settled = tipsSettled(chainInputs);
  /** Against the decision on record, or SAP standard not weighed yet — a warning, never a gate (owner, 12.10.2026). */
  const warning = decisionWarning(chainInputs);
  const currentSlots = chainSlots(chainInputs);
  useEffect(() => {
    slotsRef.current = currentSlots;
  });
  /** The functions of the running engine-led generation, from its events (§15.2). */
  const board = unitRows ? unitBoard(unitRows, boardEvents, boardFinal ?? undefined) : null;
  /** How the stored package was made — read from its binding (§15.4, §18). */
  const storedBinding = (project as { generationBinding?: { generatedAt?: string } } | null)?.generationBinding;
  const storedRecord = storedGenerationRecord(storedBinding);

  /**
   * The first generation starts by itself only when no tip is open (owner,
   * 12.10.2026; design §14.4): with every count read and nothing that would
   * change what the generation uses, there is nothing to read first. Once per
   * visit, never over a package on record, and only where the button could.
   */
  const autoStarted = useRef(false);
  // Never by itself while the decision warning shows: the reader decides to generate against it.
  const nothingOpen = settled && tips.length === 0 && warning === null;
  useEffect(() => {
    if (autoStarted.current || !nothingOpen || !canGenerate || files.length > 0 || modelAvailability.loading || loading) return;
    autoStarted.current = true;
    const timer = setTimeout(() => generateTransformation(), 0);
    return () => clearTimeout(timer);
  }, [nothingOpen, canGenerate, files.length, modelAvailability.loading, loading, generateTransformation]);

  if (generating) return (
    <StageFrame stage="transformation">
      <StageHeader stage="transformation" tools={{ steps: phases, current: 'transformation' }} projectName={project?.name}>
        <span data-track-loading>{project ? track.loading : 'Opening the project…'}</span>
      </StageHeader>
      {/* The generation, while it runs (roadmap 3.0.12). It was a progress
          bar whose model step was an estimate, and a log whose rows were
          written before anything they named had happened; it is what the
          generation builds on, read as it goes, and the stages that run. */}
      <GenerationChain
        program={project?.name}
        slots={currentSlots}
        lit={chainLit}
        stages={generationStages(stageLog, genPath)}
        startedAt={runStartedAt}
        now={now}
        phaseKey={generationPhase?.key ?? 'none'}
        units={board}
        onCancel={cancelGeneration}
        cancelling={cancelling}
      />
    </StageFrame>
  );

  if (busy && !transformedCode) return (
    <StageFrame stage="transformation">
      <StageHeader stage="transformation" tools={{ steps: phases, current: 'transformation' }} projectName={project?.name}>
        {/* Before the project has loaded its track is unknown, and the
            default copy named the side-by-side track for an ABAP Cloud
            project (carried QA finding 7abe866543dd). */}
        <span data-track-loading>{project ? track.loading : 'Opening the project…'}</span>
      </StageHeader>
      <div className="mt-6">
        <CcSkeleton shape="text" label="the project" count={6} />
      </div>
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
          {/* Roadmap 3.0.12, step E (design §12.1): a step's anchor — its ABAP
              lines, its rules with the owner's decision, and who wrote what:
              the frame is the engine's, the body a model proposal, a body
              nobody wrote is not determined. */}
          {selectedUnits.map((u) => (
            <div key={u.unitId} data-unit-anchor={u.unitId} className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-cc-mono font-semibold text-cc-ink">{u.unitId}</span>
              <span className="font-cc-mono text-cc-ink">{abapLines(u)}</span>
              {u.rules.map((r) => (
                <CcTag key={r.id}>{`${r.id} · ${r.decision}`}</CcTag>
              ))}
              <CcProvenanceChip value="reconstructed" note="signature and guards" />
              {u.filledBy === 'not-filled' ? (
                <CcProvenanceChip value="not-determined" note={u.note ? `not written — ${u.note}` : 'not written'} />
              ) : u.filledBy === 'engine' ? null : (
                <CcProvenanceChip value="proposed" note={u.filledBy === 'model' ? 'body' : `body, ${u.filledBy === 'model-repair-1' ? 'repair round 1' : 'repair round 2'}`} />
              )}
            </div>
          ))}
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
              onClick={startGeneration}
              disabled={!canGenerate}
              aria-describedby={!canGenerate && isOwner && (prerequisites.length > 0 || modelOff) ? 'tf-generate-why' : undefined}
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

      <ReplaceStoredBox
        open={replaceCodeAsk}
        title={wt('input.replaceCodeTitle')}
        body={wt('input.replaceCodeBody')}
        callsModel
        onKeep={() => setReplaceCodeAsk(false)}
        onReplace={() => {
          setReplaceCodeAsk(false);
          if (canGenerate) generateTransformation();
        }}
      />

      {project && !isOwner ? (
        <div className="mb-6">
          <OwnerOnlyNote />
        </div>
      ) : null}

      {/* Why the code cannot be generated now, each reason with the one
          action that resolves it (owner report 03.10.2026). On the
          page, not in a title: a phone has no hover. A stale input is said by
          the notice below, which names the stage to regenerate. */}
      {project && isOwner && (prerequisites.length > 0 || modelOff) && (
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

      {/* Roadmap 3.0.12 — what would raise the quality of the code, before the
          run; never blocking, one line when nothing is open. */}
      {showTips ? (
        <QualityTips
          tips={tips}
          warning={warning}
          settled={settled}
          slots={chainSlots(chainInputs)}
          canGenerate={canGenerate}
          busy={busy}
          regenerate={files.length > 0}
          keySource={modelAvailability.keySource}
          onGenerate={startGeneration}
          conceptSource={legacySource}
        />
      ) : null}

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

      {/* Roadmap 3.0.12, step E: a cancelled generation stored nothing, and says so — not as an error. */}
      {cancelledNote && (
        <div className="mb-6" data-generation-cancelled="">
          <CcMessageStrip state="information" announce>
            {wt('transformation.cancelled')}
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

      {literalFindings.length > 0 && (
        <div className="mb-6" data-hard-coded-literals={literalFindings.length}>
          <CcMessageStrip state="warning" headline="Hard-coded values in the business logic">
            <span className="block">
              A fixed document or partner number was found in the business logic; check whether it should be looked up per item. Regenerate, or correct it before the tests are written.
            </span>
            <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
              {literalFindings.slice(0, 8).map((f) => (
                <li key={`${f.file}:${f.line}:${f.literal}`} data-hard-coded-literal={f.literal} className="[overflow-wrap:anywhere]">
                  <span className="font-cc-mono text-[12px]">{f.file}:{f.line}</span> — <span className="font-cc-mono text-[12px]">{f.context}</span>
                  {f.demoValue ? ' — a document number of the code’s own demo data' : ''}
                </li>
              ))}
            </ul>
          </CcMessageStrip>
        </div>
      )}

      {codeLintFindings.length > 0 && (
        <div className="mb-6" data-code-checks={codeLintFindings.length}>
          <CcMessageStrip state="warning" headline={`Code checks: ${lintCountLine(codeLintFindings)}`}>
            <span className="block">
              Deterministic checks of the generated code found patterns the reviews of earlier packages flagged. Regenerate, or correct them before the tests are written; the delivery package lists every one in STATUS.md.
            </span>
            <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
              {codeLintFindings.slice(0, 8).map((f) => (
                <li key={`${f.id}:${f.file}:${f.line}`} data-code-check={f.id} className="[overflow-wrap:anywhere]">
                  <span className="font-cc-mono text-[12px]">{f.severity} · {f.file}:{f.line}</span> — {f.message}
                </li>
              ))}
            </ul>
            {codeLintFindings.length > 8 && (
              <span className="mt-2 block">{codeLintFindings.length - 8} more in the delivery package’s STATUS.md.</span>
            )}
          </CcMessageStrip>
        </div>
      )}

      {/* The stage's answer, before the code (ADR-050): the facets, the status
          line and the sections of proposal A, every figure counted from the
          engine's findings or the stored package. */}
      {/* Without the engine's findings every facet below would count none —
          "0 findings" for a program that has them. The strip says the read
          failed, and only the source and the package beside it are drawn. */}
      {/* Roadmap 3.0.12, step E (design §15.4, §18): what the stored package
          was built on, from its binding, above the unchanged result view. */}
      {files.length > 0 && !unsavedDraft && typeof project?.generatedCode === 'string' && project.generatedCode ? (
        <BuiltOnCard record={storedRecord} generatedAt={storedBinding?.generatedAt ?? null} currentSlots={currentSlots} />
      ) : null}

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
        lead="The signed score, the findings to check by hand, and the released CDS views the legacy selects map to."
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
                  "signed off" said more than that (af9225424d1d), and the
                  heading "Sign-off Checklist" / "Action Required" still did
                  (decision-input audit T2, 10.10.2026): it is a personal
                  checklist, and it says so. */}
              <p className="cc-text-meta text-cc-ink-muted mt-1" data-review-progress>
                {signedOffIds.size} of {findings.filter(f => f.requiresSignOff).length} manual findings ticked in this browser — your own checklist, gone when the page reloads. Not saved, and nobody signs anything here.
              </p>
            </div>
          </div>

          {/* Section 3: the personal checklist (not a sign-off — see above) */}
          <div className="space-y-3" data-personal-checklist>
            <h3 className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 cc-text-h3 text-cc-ink">
                <CheckCircle2 size={16} aria-hidden="true" className="text-cc-ink-muted" />
                <span>Your checklist</span>
              </span>
              <span className="cc-text-label text-cc-ink-muted">Kept in this browser only</span>
            </h3>

            {findings.length === 0 ? (
              <p className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 text-center cc-text-cell text-cc-ink-muted">
                No finding needs a check by hand.
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
