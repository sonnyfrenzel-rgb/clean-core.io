'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { callGemini } from '@/lib/gemini';
import { loadSapNameLists } from '@/lib/sap-identifiers';
import type { Project } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { readSpecSummary, specHandoverLine, specIsStale } from '@/lib/requirements-spec';
import { sha256Hex } from '@/lib/artefact-digest';
import { doc, updateDoc, collection, getDocs, getDocFromServer, query, where } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { PresentationViewer, PresentationData } from '@/components/PresentationViewer';
import { buildBoardDeck, type RunTrendPoint } from '@/lib/board-deck';
import { detectFindings } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { ClassModel } from '@/lib/abap/class-model';
import { Download, CheckCircle2, FileCode2, Presentation, AlertCircle, FileText, Workflow, FlaskConical, ArrowDown, ArrowRight, ClipboardList } from 'lucide-react';
import { formatAnalysisToMarkdown, formatDesignToMarkdown, formatDocumentationToMarkdown, formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';
import { isEngineDocumentation } from '@/lib/process-documentation';
import { bundleSource, type RejectedBundlePath } from '@/lib/generated-package';

import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import { generateAuditPack } from '@/lib/audit-pack';
import { APP_VERSION } from '@/lib/version';
import { aiAuthorshipFactsOf } from '@/lib/ai-authorship';
import { aiMarkingStatement, withAiMarking } from '@/lib/ai-marking';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import PageAnchorBar from '@/components/PageAnchorBar';
import { deliveryAnchors, PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import { workflowSteps, testEvidence, handoverBlockers, handoverNotice, PHASES, previousBasis, codeStaleWords, testsPreviousBasis, type PhaseKey } from '@/lib/workflow-steps';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcToast from '@/components/cc/Toast';
import FamilyChip from '@/components/family/FamilyChip';
import AnswerCard from '@/components/family/AnswerCard';
import { familyTitleOf } from '@/lib/family-title';
import CcSkeleton from '@/components/cc/Skeleton';
import StaleNotice from '@/components/StaleNotice';
import CcLinkButton from '@/components/cc/LinkButton';
import CcDisclosure from '@/components/cc/Disclosure';
import CcDateText from '@/components/cc/DateText';
import { catalogForReader } from '@/lib/messages/demo';
import {
  AUDIT_PACK_FILES,
  buildHandoverChain,
  confirmationsOf,
  handoverNextStep,
  handoverStillNeeded,
  handoverTimeline,
  packEvidenceChain,
  packChainRows,
  bundleContentsLine,
  signedOffTarget,
  signedSourceOf,
  type HandoverProject,
  type StillNeeded,
} from '@/lib/handover';
import {
  NEVER_IN_PACK,
  decisionWords,
  deliveryFacets,
  handoverAnswer,
  linkInWords,
  partsCount,
  proofRows,
  travelsOpen,
  type DeliveryFacts,
} from '@/lib/delivery-view';
import {
  BeforeGoLive,
  DeliveryFold,
  DeliveryKeyValues,
  DeliverySection,
  HandoverSteps,
  NeverInPack,
  PackagePart,
  ProofTable,
  SideCard,
  type StatusStep,
} from '@/components/delivery/DeliveryObjectPage';
import { deliveryTestingTitle, lastRun, countsLine } from '@/components/testing/testing-summary';
import { outsideReading, outsideShortfall } from '@/lib/sap-test-results';
import { closureHandoverLine, failureSentence, testingClosureReading } from '@/lib/testing-closure';
import { isTargetArchitecture, recommendedArchitecture } from '@/lib/project-commands';
import { referencePatternsReadme } from '@/lib/sap-reference-architectures';
import { createDeliveryBundle, finishDeliveryPackage } from '@/lib/delivery-package';
import { ENGINE_CASES_FILE, engineCasesFile } from '@/lib/testing-engine-cases';
import { deriveEngineCasesOf, engineCaseProvenance } from '@/lib/engine-case-provenance';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { packedDecimalFields } from '@/lib/generated-code-lints';
import { developerGuidelinesMarkdown, type GuidelineFinding } from '@/lib/developer-guidelines';
import { deliveryFactsOf, ruleFactsFromSource, ruleFactsOf, ruleTestInputOf, scoreFactsOf, type ScoreEvidence } from '@/lib/delivery-facts';
import { readProcessStatesOutcome, type StatesReadRefusal } from '@/lib/process-states-client';
import { auditPackSealState, type AuditPackSealState } from '@/lib/audit-pack-seal';
import { abaplintConfigJson } from '@/lib/transformation/abaplint-config';
import { abapGitRepoSettingsXml, singleCallRapClassFiles } from '@/lib/transformation/abapgit-files';
import { placeModelTestClasses } from '@/lib/testing-abap-unit';
import { deliverableClassXml } from '@/lib/transformation/abapgit-check';
import type { AbapEvidenceReport } from '@/lib/abap/evidence-model';
import { isKeyUserDecision, keyUserGateOpen, keyUserModeOf, keyUserStepsOf, KEY_USER_STEPS_PATH } from '@/lib/key-user-route';
import { keyUserStepsMarkdown } from '@/lib/key-user-steps';

/**
 * Why the business rules' states are not in the package — the codes the
 * process-states route answers with. `no-baseline` is not among them: it means
 * nobody has opened the process yet, so the rules are read from the source and
 * are all open (`ruleFactsFromSource`, CO review F16, 12.10.2026).
 */
const RULES_UNREAD: Partial<Record<StatesReadRefusal, string>> = {
  'no-source': 'the project holds no source.',
  'source-moved': 'the source changed since the signed run.',
  'source-too-large': 'the source is too large for the rule reader.',
};

/**
 * The findings behind the Clean Core Score, read the way Analyze reads them
 * (`GET /api/projects/{id}/evidence`), for the deduction table in
 * docs/decision.md. A failed read is said in the file, never filled in.
 */
async function readScoreEvidence(projectId: string): Promise<{ evidence: (ScoreEvidence & Pick<AbapEvidenceReport, 'keyUser'>) | null; unread: string | null }> {
  try {
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) return { evidence: null, unread: 'the findings could not be read (not signed in)' };
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json().catch(() => null)) as { evidence?: ScoreEvidence & Pick<AbapEvidenceReport, 'keyUser'>; error?: unknown } | null;
    if (!res.ok || !body?.evidence || !Array.isArray(body.evidence.findings)) {
      return { evidence: null, unread: typeof body?.error === 'string' && body.error ? body.error : 'the findings could not be read' };
    }
    return { evidence: body.evidence, unread: null };
  } catch {
    return { evidence: null, unread: 'the findings could not be read' };
  }
}

/** The documentation stage's name, as the stepper spells it (UX-169). */
const DOCUMENTATION_LABEL = PHASES.find((p) => p.key === 'documentation')?.label ?? 'Documentation';

/**
 * The bundle's documentation file, named after the stage that writes it. It was
 * `process-blueprint.md`, the name of a form the stage no longer produces
 * (UX-169); the Markdown inside is `formatDocumentationToMarkdown`'s, unchanged.
 */
const DOCUMENTATION_FILE = `process-${DOCUMENTATION_LABEL.toLowerCase()}.md`;

/** An in-text link, as the settings page draws one. */
const TEXT_LINK = 'font-semibold text-cc-brand-strong underline underline-offset-2 hover:text-cc-brand-deep';

/**
 * The seal the audit-pack route just wrote, read back from the server. The route
 * records the seal only while the run it packed is still the active one, and
 * the IT view reads the marker with the same run binding
 * (`lib/it-sections.ts`). A failed read is its own state, never "the run moved";
 * the server's active run and the seal's time are checked in
 * `auditPackSealState`.
 */
async function readSeal(
  projectId: string,
  runId: string | null,
  downloadStartedAt: number,
  previousExportedAt: string | null,
): Promise<AuditPackSealState> {
  try {
    const snap = await getDocFromServer(doc(getDb(), 'projects', projectId));
    return auditPackSealState({ doc: snap.data() ?? null, readFailed: false, displayedRunId: runId, downloadStartedAt, previousExportedAt });
  } catch (err) {
    console.error('Reading the audit pack seal failed:', err);
    return auditPackSealState({ doc: null, readFailed: true, displayedRunId: runId, downloadStartedAt, previousExportedAt });
  }
}

export default function DeliveryPage() {
  const { projectId } = useParams();
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [runHistory, setRunHistory] = useState<RunTrendPoint[]>([]);
  const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');
  // A count of tests that were never generated is not an integrity statement.
  // The integrity report used to read `|| 10` and `|| 92`, and because
  // `length === 0` is falsy a run that produced nothing at all still showed
  // "10 Automated Tests" and "92% Estimated Coverage" under a green tick — on
  // the one screen a customer photographs for a steering pack.
  /**
   * How many of those tests actually returned a pass.
   *
   * This block used to say "Clean AUnit local test doubles verified" beside a
   * green tick whenever `testCaseCount > 0` — that is, whenever a test suite had
   * been *generated*. Nothing in that number says anything ran, and after the
   * runner changes it can also contain cases the runner skipped or never
   * mentioned. A delivery artefact is the last place a claim should outrun its
   * evidence, so the line is now driven by verdicts — counted by the same
   * contract the stepper, the rail and the dashboard read, so this page cannot
   * call something passed that the dashboard calls a draft.
   */
  const {
    total: testCaseCount,
    passed: testsPassed,
    failed: testsFailed,
    connectivity: testsConnectivity,
    withoutVerdict: testsWithoutVerdict,
  } = testEvidence(project);
  /** The run the Testing stage reports — a covering receipt, or none. */
  const recordedTestRun = lastRun(project, null);
  /** ADR-094 — testing closed by the owner without a passing run. */
  const testingClosure = testingClosureReading(project);
  /** ADR-075: a result from the reader's own SAP system, which the title above names. */
  const outsideTests = outsideReading(project as Parameters<typeof outsideReading>[0]);
  const phases = workflowSteps(project);
  const testingPhase = phases.find((p) => p.key === 'testing')!;
  // E01-F01-US02: nothing built for a previous source leaves through this page.
  // The audit-pack route enforces its own part server-side; the bundle is built
  // in the browser, so this is where it is stopped.
  const blockers = handoverBlockers(project);
  const handoverBlocked = blockers.length > 0;
  const codeStale = phases.find((p) => p.key === 'transformation')?.state === 'stale';
  // The analysis itself no longer describes the source on the project (the
  // source changed, or a signed input cannot be shown to match). The deck reads
  // its metrics from that analysis and its findings from the current source, so
  // on this state it would present two different sources as one briefing.
  const analysisStale = phases.find((p) => p.key === 'analyze')?.state === 'stale';
  const docsStale = phases.find((p) => p.key === 'documentation')?.state === 'stale';
  // What the delivery page can actually attest to, each read from an artefact
  // rather than assumed. Nothing here is a decision — the page reports what is
  // present and says plainly what is not.
  const hasGeneratedCode = typeof project?.generatedCode === 'string' && project.generatedCode.trim().length > 0;
  const hasDocumentation = typeof project?.documentation === 'string' && project.documentation.trim().length > 0;
  /** Roadmap 3.0.5 — the engine's document, or a blueprint a model wrote before it. */
  const documentationFromCode = isEngineDocumentation(project?.documentation);
  const [loading, setLoading] = useState(true);
  // The project read threw — permissions, network. Distinct from "no active
  // run", which redirects, so the page neither renders its deliverables over a
  // project it never loaded nor flashes an error before that redirect.
  const [loadFailed, setLoadFailed] = useState(false);
  const [documentation, setDocumentation] = useState('');
  // Entry names of the generated package that would not have stayed inside the
  // archive. Held rather than thrown away, because the reader is the one who has
  // to decide what to do about a generation run that produced them.
  const [rejectedPaths, setRejectedPaths] = useState<RejectedBundlePath[] | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [auditPackBusy, setAuditPackBusy] = useState(false);
  const [auditPackError, setAuditPackError] = useState<string | null>(null);
  // The pack left, but this download is not confirmed as its seal — the read
  // failed, the run moved, or the seal predates it (owner, 12.10.2026: say so,
  // do not leave "Never" standing without a reason).
  const [sealNotice, setSealNotice] = useState<AuditPackSealState | null>(null);
  // A side action that finished — one toast at a time (§2.6).
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    let isMounted = true;
    const fetchProject = async () => {
      try {
        const projectData = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(projectData, projectId as string)) return;
        if (projectData && isMounted) {
          setProject(projectData);
          
          if (projectData.documentation) {
            setDocumentation(projectData.documentation);
          }
          
          // Deliberately NOT written here any more.
          //
          // Loading this page used to mark the project `completed` — no check on
          // generated code, tests, documentation or sign-off. Navigating straight
          // to /delivery after nothing but an analysis run was enough. "Completed"
          // then meant "somebody opened the last tab", which is not a fact worth
          // storing and is exactly the kind of claim this stage exists to make
          // carefully. Readiness is derived below from artefacts that exist.

          // Load the signed run history for the board-deck run-over-run trend.
          try {
            const uid = getAuth().currentUser?.uid;
            if (uid) {
              const snap = await getDocs(
                query(
                  collection(getDb(), 'projects', projectId as string, 'runs'),
                  where('userId', '==', uid),
                ),
              );
              const points: RunTrendPoint[] = snap.docs
                .map((d) => d.data() as Record<string, unknown>)
                .filter((r) => typeof r.runHash === 'string' && typeof r.createdAt === 'string')
                .map((r) => ({
                  createdAt: r.createdAt as string,
                  cleanCoreScore: typeof r.cleanCoreScore === 'number' ? r.cleanCoreScore : 0,
                  complexityScore: typeof r.complexityScore === 'number' ? r.complexityScore : 0,
                  criticalityScore: typeof r.criticalityScore === 'number' ? r.criticalityScore : 0,
                  findings: Array.isArray(r.worklist)
                    ? r.worklist.length
                    : Array.isArray(r.codeInventory)
                    ? r.codeInventory.length
                    : 0,
                  version: typeof r.analyzerVersion === 'string' ? r.analyzerVersion : undefined,
                }));
              if (isMounted) setRunHistory(points);
            }
          } catch (histErr) {
            console.error('Error loading run history:', histErr);
          }
        }
      } catch (err) {
        console.error("Error fetching project:", err);
        if (isMounted) setLoadFailed(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProject();
    return () => { isMounted = false; };
  }, [projectId]);

  // A detector that threw used to hand the deck an empty list, and the deck
  // read an empty list as a clean bill (UX-002). The deck now reads it as "not
  // determined"; the page says why, so the reader knows which of the two it was.
  const detection = useMemo<{ findings: ReturnType<typeof detectFindings>; error: string | null }>(() => {
    if (!project || !project.legacyCode) return { findings: [], error: null };
    const abapSources = [{ file: 'main.abap', content: project.legacyCode }];
    try {
      const realModel = buildClassModel(abapSources);
      return { findings: detectFindings(realModel, abapSources), error: null };
    } catch (e) {
      console.error('Error detecting findings:', e);
      return { findings: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [project?.legacyCode]);
  const findings = detection.findings;

  const deck = useMemo(() => {
    if (!project || analysisStale) return null;
    return buildBoardDeck({ project, findings, runHistory });
  }, [project, findings, runHistory, analysisStale]);

  /**
   * The source the active run signed — the BPMN export is offered only while the
   * source on the project still hashes to it (roadmap 2.6), as on the
   * Documentation stage.
   */
  const signedSource = useMemo(() => signedSourceOf(project as HandoverProject | null), [project]);
  const specSummary = readSpecSummary((project as { requirementsSpec?: unknown } | null)?.requirementsSpec);
  const specStale = specIsStale(specSummary, signedSource ? sha256Hex(signedSource.source) : null);

  const downloadBpmn = async () => {
    if (!signedSource || handoverBlocked) return;
    // Loaded on the click: the ABAP reader is paid for only when the file is asked for.
    const { buildBpmnExportFromSource, bpmnFileName } = await import('@/lib/bpmn/export');
    const { xml } = buildBpmnExportFromSource(signedSource.source, {
      processName: project?.name || signedSource.fileName,
      sourceFileName: signedSource.fileName,
      // The engine of the project's run, as the map draws it; a run without a stamp reads as the oldest engine.
      exporterVersion: engineVersionOfProject(project),
    });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    await saveAs(blob, bpmnFileName(`${project?.name || 'Project'}_Process`));
    setToast('Process downloaded as BPMN 2.0 XML');
  };

  const downloadZip = async () => {
    if (!project || handoverBlocked) return;
    setRejectedPaths(null);
    setBundleError(null);
    setBundleBusy(true);
    try {
      // Loaded on the click that builds the bundle, not with the stage
      // (~28 kB gzip of the stage's first JavaScript, docs/perf/REPORT.md).
      const { default: JSZip } = await import('jszip');
      // SAP's synced name lists, so the package's identifier marks read them too (3.0.12).
      await loadSapNameLists();
      const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');

      // The entry names of a generated package come from the model, and the
      // archive is unpacked on the reader's machine. `bundleSource` decides
      // whether they may become files; a name that would not stay inside the
      // archive stops the download here, with the name on screen, rather than
      // being quietly rewritten into something that no longer matches the code.
      const source = bundleSource(project.generatedCode);
      if (source.kind === 'rejected') {
        setRejectedPaths(source.rejected);
        return;
      }
      const isModular = source.kind === 'package';

      // The files are collected first and written into the archive at the end:
      // README.md, STATUS.md, docs/decision.md, docs/rule-register.md and manifest.json are written
      // from the files that are actually there (owner, 11.10.2026; external
      // review F-04, F-05, F-08, F-09, F-10) — `lib/delivery-package.ts`.
      const bundle = createDeliveryBundle();
      if (source.kind === 'package') {
        source.files.forEach((file) => {
          // A class metadata file the model wrote without abapGit's structure
          // (the single-call RAP prompt asks for one) is written here by the
          // shared class builder instead; abapGit would refuse it as it came.
          const xml = isAbapCloud ? deliverableClassXml(file.path, file.content) : null;
          if (xml?.rebuilt) bundle.file(file.path, xml.content, 'engine');
          else bundle.file(file.path, file.content, 'generated');
        });
      }

      if (isAbapCloud) {
        // The abapGit repository configuration file. Two things about it are not
        // cosmetic. The name carries a leading dot — abapGit reads `.abapgit.xml`
        // and ignores `abapgit.xml`, so the old name made every download fail at
        // the moment of import. And the element set is the documented one
        // (https://docs.abapgit.org/user-guide/repo-settings/dot-abapgit.html):
        // MASTER_LANGUAGE, STARTING_FOLDER, FOLDER_LOGIC, IGNORE. `START_CLASS`
        // and `VERSION` are not fields of this file at all, and `START_CLASS` was
        // additionally hard-wired to ZCL_DEMO_RAP_TEST — a class out of a demo,
        // shipped inside every customer's package. It is gone rather than guessed.
        // One builder for this file and the RAP scaffold's (lib/transformation/abapgit-files.ts), so the two never differ.
        bundle.file(".abapgit.xml", abapGitRepoSettingsXml());

        if (!isModular && project.generatedCode) {
          // The metadata file in abapGit's serializer format (the <abapGit>
          // wrapper abapGit reads first), from the builder every class uses.
          for (const f of singleCallRapClassFiles('behavior', project.generatedCode)) bundle.file(f.path, f.content, f.origin);
        }
      }

      // The single-source layout: the module under src/, compiled to dist/.
      // package.json, tsconfig.json and the CI come from the templates in
      // `lib/delivery-package.ts` (`applyNodeTemplates`), so the build, the test
      // script and the CI agree with each other (b795a6e204b0).
      if (!isAbapCloud && !isModular && project.generatedCode) {
        bundle.file("src/app.ts", project.generatedCode, 'generated');
      }

      // Add Test Suite (if not already included inside modular files)
      if (project.testSuite?.code) {
        // 3.0.13 (6): in an engine-led package the model's local test classes go into the test include of the
        // class under test, so the source and the metadata name the same class — not into a global ZCL_DEMO_RAP_TEST
        // whose metadata names a class its source does not define.
        const placed = isAbapCloud && source.kind === 'package' ? placeModelTestClasses(source.files, project.testSuite.code) : null;
        // 3.0.17 (AI Act Art. 50(2)): the suite's writer is the Testing stage's model or the package's — named
        // as `tests`, so the marking reads it from the suite's own record (`lib/ai-authorship.ts`).
        if (placed) {
          bundle.file(placed.path, placed.content, 'generated', 'tests');
        } else if (isAbapCloud) {
          for (const f of singleCallRapClassFiles('test', project.testSuite.code)) bundle.file(f.path, f.content, f.origin, f.origin === 'generated' ? 'tests' : undefined);
        } else {
          const testPath = isModular ? "test.ts" : "src/test.ts";
          bundle.file(testPath, project.testSuite.code, 'generated', 'tests');
        }
      }

      // 3.0.12 — the boundary cases the engine derived from the original, as
      // data (input → expected outcome, traced), beside the suite that asserts them.
      // `testCases` is client-written: only the cases the engine reproduces from
      // the signed source ship, recomputed; the rest are named as unverified.
      const engineCasesJson = Array.isArray(project.testCases)
        ? (() => {
            const provenance = engineCaseProvenance(
              project.testCases as unknown as Array<Record<string, unknown>>,
              deriveEngineCasesOf(signedSourceOf(project as HandoverProject)?.source ?? null, engineVersionOfProject(project)),
            );
            return engineCasesFile(provenance.verified, provenance.unverified);
          })()
        : null;
      if (engineCasesJson) bundle.file(ENGINE_CASES_FILE, engineCasesJson, 'engine');

      // Documentation formatted into corporate markdown specifications
      const docs = bundle.folder("docs");
      // The model's raw line references are held against the engine's anchors of the source (3.0.12).
      if (project.analysis) docs.file("business-analysis.md", formatAnalysisToMarkdown(project.analysis, { code: project.legacyCode }));
      // 3.0.18 item 13 (QM-07, FI-F02): the design names the objects this package delivers, read from its files.
      if (project.solutionDesign) docs.file("solution-design.md", formatDesignToMarkdown(project.solutionDesign, { code: project.legacyCode, packageFiles: source.kind === 'package' ? source.files.map((f) => f.path) : null }));
      if (project.documentation) docs.file(DOCUMENTATION_FILE, formatDocumentationToMarkdown(project.documentation));
      // 3.0.21 (T08): each element the SOP model wrote is marked where it stands, with the layer's recorded model.
      if (project.businessDocumentation) {
        const sop = aiAuthorshipFactsOf(project, { documentationFromEngine: isEngineDocumentation(project.documentation) }).sop;
        docs.file("business-documentation.md", formatBusinessDocsToMarkdown(project.businessDocumentation, project.documentation, { ai: sop }));
      }
      // developer-guidelines.md is written below, once the engine's findings are read (lib/developer-guidelines.ts).

      // The linter of the ABAP route. The Node route's CI comes from the templates.
      if (isAbapCloud) {
        // ABAP Cloud syntax and the object types the scaffold writes — the same rules the server ran on this
        // package (lib/transformation/abaplint-config.ts, roadmap 3.0.12).
        bundle.file("abaplint.json", abaplintConfigJson());
      }

      // "Reference patterns" (roadmap 3.0.9): the SAP reference pattern of the
      // signed-off target, else of the engine's recommendation — read from the
      // hand-curated mapping, never chosen by a model.
      const referenceTarget =
        project.approvedByArchitect === true && isTargetArchitecture(project.targetArchitecture)
          ? project.targetArchitecture
          : recommendedArchitecture(project);
      const referenceSection = referencePatternsReadme(referenceTarget, project.s4Deployment);

      // What STATUS.md and docs/decision.md say comes from records: the
      // confirmed business rules and the findings behind the score are read
      // from their routes now; a read that fails is said, never filled in.
      const [statesRead, evidenceRead] = await Promise.all([
        readProcessStatesOutcome(projectId as string),
        readScoreEvidence(projectId as string),
      ]);
      // From the package and the engine's findings — the tables this program uses, the classes the
      // package carries — not a template naming BSEG and a demo class (SD review 3.0.12, CR-D7).
      docs.file("developer-guidelines.md", developerGuidelinesMarkdown({
        projectName: project.name,
        isAbapCloud,
        paths: bundle.entries.map((e) => e.path),
        findings: evidenceRead.evidence ? (evidenceRead.evidence.findings as readonly GuidelineFinding[]) : null,
        findingsUnread: evidenceRead.unread,
      }));
      const ruleTests = ruleTestInputOf(project as HandoverProject);
      const rules = statesRead.ok
        ? ruleFactsOf(statesRead.view, undefined, ruleTests, typeof project.legacyCode === 'string' ? project.legacyCode : null, engineVersionOfProject(project))
        : statesRead.code === 'no-baseline'
          ? ruleFactsFromSource(typeof project.legacyCode === 'string' ? project.legacyCode : '', ruleTests, engineVersionOfProject(project))
          : ruleFactsOf(null, RULES_UNREAD[statesRead.code] ?? 'the confirmed process states could not be read.', undefined, null, engineVersionOfProject(project));
      const facts = deliveryFactsOf(project as HandoverProject, {
        phases,
        rules,
        score: scoreFactsOf(project as HandoverProject, evidenceRead.evidence, evidenceRead.unread),
        generatedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        referenceSection,
        documentationFromEngine: isEngineDocumentation(project.documentation),
        // Roadmap 3.0.19 (owner decision 19.10.2026): the weighing in docs/decision.md gets a
        // key-user row — for a run whose engine reads key user only; unread, it says so.
        ...(keyUserGateOpen(project)
          ? { keyUser: evidenceRead.evidence?.keyUser ?? null }
          : {}),
      });
      // Roadmap 3.0.19: the engine's key-user step list, from the same evidence read, as docs/key-user-steps.md.
      const keyUserList = keyUserStepsOf(evidenceRead.evidence, project);
      const keyUserMode = keyUserModeOf(project, keyUserList);
      // The card says the bundle holds the step list with its
      // acceptance checks. A key-user decision whose list cannot be built downloads nothing and says why,
      // rather than a ZIP with a placeholder where the step list was promised.
      if (isKeyUserDecision(project) && !(keyUserList && keyUserMode !== 'none')) {
        setBundleError(`The key-user step list could not be built: ${evidenceRead.unread ?? 'the signed run holds no key-user reading'}. Nothing was downloaded. Try again once the engine's evidence can be read.`);
        return;
      }
      const keyUser = keyUserList && keyUserMode !== 'none'
        ? {
            whole: keyUserMode === 'whole',
            markdown: keyUserStepsMarkdown(keyUserList, project.name),
            steps: keyUserList.effort.steps,
            checks: keyUserList.effort.checks,
            codeParts: keyUserList.codeParts.length,
          }
        : null;
      const finished = finishDeliveryPackage({
        entries: bundle.entries,
        facts: { ...facts, keyUser },
        layout: isModular ? 'package' : 'flat',
        decimalFields: packedDecimalFields(typeof project.legacyCode === 'string' ? project.legacyCode : ''),
      });

      const zip = new JSZip();
      for (const f of finished.files) zip.file(f.path, f.content);
      const content = await zip.generateAsync({ type: "blob" });
      await saveAs(content, `${project.name.replace(/\s+/g, '_')}_DeliveryPackage.zip`);
      setToast('Delivery bundle downloaded');
    } catch (err) {
      console.error(err);
      // An error is a strip beside the button, with the way out next to it —
      // not a browser alert and not a toast that removes itself (§2.6, §2.8).
      setBundleError('Failed to generate ZIP package.');
    } finally {
      setBundleBusy(false);
    }
  };

  const downloadAuditPack = async () => {
    if (!project || handoverBlocked) return;
    setAuditPackError(null);
    setSealNotice(null);
    setAuditPackBusy(true);
    const downloadStartedAt = Date.now();
    const previousExportedAt = project.auditMetadata?.auditPackExportedAt ?? null;
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const blob = await generateAuditPack(project, idToken);
      const fileName = (project.name || 'Project').replace(/\s+/g, '_');
      await saveAs(blob, `${fileName}_AuditPack.zip`);
      // The server writes the seal (`auditPackExportedAt`) while it builds the
      // pack; the page loaded the project once and kept saying "Never" and "not
      // sealed yet" until a manual reload (owner, 12.10.2026). Read back just
      // that marker — one document, no run re-hydration — so the chain, the
      // still-needed list and the next step move on at once.
      const seal = await readSeal(projectId as string, project.activeRunId ?? null, downloadStartedAt, previousExportedAt);
      if (seal.kind === 'sealed-now' || seal.kind === 'sealed-earlier') {
        const { auditPackExportedAt, auditPackExportedRunId } = seal;
        setProject((p) => (p ? { ...p, auditMetadata: { ...p.auditMetadata, auditPackExportedAt, auditPackExportedRunId } as Project['auditMetadata'] } : p));
      }
      setSealNotice(seal.kind === 'sealed-now' ? null : seal);
      setToast(seal.kind === 'sealed-now' ? 'Audit pack downloaded and sealed' : 'Audit pack downloaded');
    } catch (err: any) {
      console.error('Audit pack generation failed:', err);
      setAuditPackError(err?.message || 'Audit pack generation failed. Please try again.');
    } finally {
      setAuditPackBusy(false);
    }
  };

  if (loading || (!project && !loadFailed)) return (
    <StageFrame stage="delivery">
      <StageHeader stage="delivery" tools={{ steps: phases, current: 'delivery' }} project={project} />
      <CcSkeleton shape="cards" label="Finalizing delivery package..." count={4} />
    </StageFrame>
  );

  if (!project) return (
    <StageFrame stage="delivery">
      <StageHeader stage="delivery" tools={{ steps: phases, current: 'delivery' }} />
      <div data-delivery-load-failed>
        <CcMessageStrip
          state="error"
          headline="The project could not be loaded."
          announce
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          Nothing on this page can be exported until it is.
        </CcMessageStrip>
      </div>
    </StageFrame>
  );

  // The handover, read off the same contract as the stepper (`lib/handover.ts`) and put in the page's words by
  // `lib/delivery-view.ts` (ADR-132). Nothing here decides what is signed; it describes what is on record.
  const hp = project as HandoverProject;
  const chain = buildHandoverChain(hp, phases);
  const target = signedOffTarget(hp);
  const confirmations = confirmationsOf(hp);
  const timeline = handoverTimeline(hp);
  const packChain = packEvidenceChain(hp);
  const exportedAt = project.auditMetadata?.auditPackExportedAt ?? null;
  const handoverState = { blockers, exportedAt: exportedAt ? String(exportedAt) : null };
  // The same seal the still-needed list reads, so the answer and the list tell one story (owner, 12.10.2026).
  const nextStep = handoverNextStep(hp, phases, blockers, chain, projectId as string, handoverState.exportedAt);
  const stillNeeded = handoverStillNeeded(hp, chain, handoverState);
  const keyUser = isKeyUserDecision(project);
  const hasTestSuite = typeof project.testSuite?.code === 'string' && project.testSuite.code.trim().length > 0;
  const parts = {
    code: hasGeneratedCode || keyUser,
    tests: hasTestSuite,
    documentation: hasDocumentation || Boolean(project.businessDocumentation),
    bpmn: Boolean(signedSource),
    spec: Boolean(specSummary),
    slides: Boolean(deck) && !analysisStale,
  };
  const program = familyTitleOf(project)?.title ?? project.name;
  const facts: DeliveryFacts = { program, blockers, exportedAt: handoverState.exportedAt, stillNeeded, chain, phases, parts };
  const answer = handoverAnswer(hp, facts);
  const facets = deliveryFacets(hp, facts);
  const travels = travelsOpen(hp, facts);
  const proof = proofRows(hp, facts);
  const signedFiles = AUDIT_PACK_FILES.filter((f) => f.kind === 'signed').length;
  const attestedFiles = AUDIT_PACK_FILES.filter((f) => f.kind === 'attested').length;
  const fingerprint = project.auditMetadata?.inputFingerprint;
  const modelCard = project.auditMetadata?.modelCard;
  const catalog = typeof hp.sapApiCatalogVersion === 'string' && hp.sapApiCatalogVersion ? hp.sapApiCatalogVersion : null;
  const engineVersion = (typeof hp.analyzerVersion === 'string' && hp.analyzerVersion) || modelCard?.engineVersion || null;
  const hasRun = typeof project.activeRunId === 'string' && project.activeRunId.length > 0;
  const packAvailable = hasRun && Boolean(fingerprint) && !handoverBlocked;
  /** Something can go into the ZIP: code (or the key-user list), tests or documentation. */
  const somethingToPackage = parts.code || parts.tests || parts.documentation;
  /** The ZIP is the package only when nothing is missing; before that it is honestly a review version (L4). */
  const bundleLabel = answer.verdict === 'yes' ? 'Download the package' : 'Download the review version';

  /**
   * The Testing stage draws its "record the result" section only once
   * scenarios exist; before that the anchor names nothing and the link landed
   * at the top of a page with no such section. Without
   * scenarios the link leads to step 1, where they are written.
   */
  const hasScenarios = Array.isArray(project.testCases) && project.testCases.length > 0;
  /** Where each still-needed line is made, as a link a reader can follow. */
  const neededHref = (stage: StillNeeded['stage']) =>
    stage === 'management'
      ? `/project/${projectId}?view=management`
      : stage === 'delivery'
        ? '#audit-pack'
        : stage === 'testing' && isAbapCloud
          ? // ADR-075: on the ABAP Cloud route the result is recorded there.
            `/project/${projectId}/testing#${hasScenarios ? 'testing-sap-result' : 'testing-write'}`
          : `/project/${projectId}/${stage}`;
  // A line made on this page jumps to its section here (owner, 12.10.2026).
  const neededWhere = (stage: StillNeeded['stage']) =>
    stage === 'management' ? 'Management view' : stage === 'delivery' ? 'On this page' : PHASES.find((p) => p.key === stage)?.label ?? stage;

  /** The side column's status: the tools in their order (ADR-128), then the decision and the pack. */
  const phaseStep = (key: PhaseKey, label: string): StatusStep => {
    const p = phases.find((x) => x.key === key)!;
    return { key, label, detail: p.state === 'stale' ? 'Out of date — made for a previous source' : p.detail, mark: p.done ? 'done' : 'open' };
  };
  const statusSteps: StatusStep[] = [
    phaseStep('analyze', 'Analysis'),
    phaseStep('tco', PHASES.find((p) => p.key === 'tco')?.label ?? 'Economics'),
    phaseStep('design', 'Design'),
    phaseStep('transformation', keyUser ? 'Key-user step list' : 'Code'),
    phaseStep('documentation', DOCUMENTATION_LABEL),
    phaseStep('testing', 'Tests'),
    { key: 'decision', label: 'Decision', detail: decisionWords(hp), mark: chain.find((l) => l.key === 'decision')?.provenance === 'confirmed' ? 'done' : 'open' },
    handoverBlocked
      ? { key: 'audit-pack', label: 'Audit pack', detail: 'Blocked — artefacts made for another source', mark: 'failed' }
      : exportedAt
        ? { key: 'audit-pack', label: 'Audit pack', detail: `Sealed ${String(exportedAt).slice(0, 10)}`, mark: 'done' }
        : { key: 'audit-pack', label: 'Audit pack', detail: 'Not sealed', mark: 'open' },
  ];

  const anchors = deliveryAnchors({
    blocking: stillNeeded.length,
    parts: partsCount(parts),
    packNote: handoverBlocked ? 'blocked' : null,
    events: timeline.length,
  });

  const nextAction =
    nextStep.kind === 'blocked' ? (
      <CcLinkButton href="#before-go-live" variant="primary" icon={<ArrowDown size={14} aria-hidden="true" />}>
        See what blocks it
      </CcLinkButton>
    ) : nextStep.kind === 'open' ? (
      <CcLinkButton href={nextStep.href} variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
        {nextStep.action}
      </CcLinkButton>
    ) : nextStep.kind === 'seal' ? (
      <CcButton variant="primary" onClick={downloadAuditPack} busy={auditPackBusy} data-handover-next-download="" icon={<Download size={16} aria-hidden="true" />}>
        Download and seal the audit pack
      </CcButton>
    ) : (
      <CcButton variant="primary" onClick={downloadZip} busy={bundleBusy} data-handover-next-download="" icon={<Download size={16} aria-hidden="true" />}>
        Download the package
      </CcButton>
    );

  return (
    <StageFrame stage="delivery">
      {/* One page for every reader (ADR-132 L1): no view switch, the note in its place. The title is the program,
          the tool the eyebrow (the family frame). */}
      <StageHeader stage="delivery" tools={{ steps: phases, current: 'delivery' }} project={project} view="one-page">
        What leaves with the program: the package, its proof, and what is still open before go-live. Signed, sealed and
        not signed are said apart.
      </StageHeader>

      <StaleNotice {...handoverNotice(project)} />

      {/* The answer first (L2): yes, not yet or stop, the next step beside it, four facets. */}
      <AnswerCard
        id="handover-answer"
        question={<span data-handover-verdict={answer.verdict}>Can {program} be handed over?</span>}
        chips={answer.verdict === 'yes' ? <FamilyChip kind="signed" note="analysis" /> : null}
        answer={answer.answer}
        condition={answer.condition}
        action={
          // The next step and why, in one element: the button and its sentence say the same step.
          <div data-handover-next={nextStep.kind} className="flex flex-col items-stretch gap-2 [&>a]:justify-center [&>button]:justify-center">
            {nextAction}
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              {nextStep.kind === 'none' ? (
                <>
                  <span className="font-semibold text-cc-ink">Nothing blocks the handover.</span> {nextStep.reason} One ZIP for
                  whoever imports it; the audit pack, for whoever checks it, is under Audit pack. Neither calls a model.
                </>
              ) : (
                <>
                  <span className="font-semibold text-cc-ink">{nextStep.headline}.</span> {nextStep.reason}
                </>
              )}
            </p>
          </div>
        }
        facets={facets.map((f) => ({
          id: f.id,
          label: f.label,
          value: f.value,
          unit: f.unit,
          note: f.note,
          chip: f.chip ? <FamilyChip kind={f.chip} note={f.chipNote} /> : undefined,
          href: `#${f.target}`,
        }))}
      />

      {/* The tool's anchor bar (ADR-126 (3), L13): under the answer, before the first section. */}
      <PageAnchorBar anchors={anchors} label={PAGE_ANCHOR_LABELS.delivery} name="delivery-anchor" plural="delivery-anchors" />

      <div className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* L5 — what blocks the handover, what travels open and named, what is the reader's own. */}
          <DeliverySection
            id="before-go-live"
            title="Before go-live"
            data-handover-open=""
            lead={
              stillNeeded.length > 0
                ? `${stillNeeded.length === 1 ? 'One thing blocks' : `${stillNeeded.length} things block`} the handover. What travels open is named in the package and does not block it.`
                : 'Nothing blocks the handover. What travels open is named in the package.'
            }
          >
            <BeforeGoLive
              blocking={stillNeeded.map((n) => ({ key: n.key, text: n.text, where: neededWhere(n.stage), href: neededHref(n.stage), here: n.stage === 'delivery' }))}
              travels={travels}
              empty="Every link of the chain has a record, and the audit pack is sealed."
              yours={
                <>
                  <span className="font-semibold">Yours, in your system:</span> activation, transport through your landscape,
                  acceptance by operations and go-live. This page cannot see them and never says they happened.
                </>
              }
            />
          </DeliverySection>

          {/* L6 — the package in six parts, each with who wrote it and its state; one ZIP. Not signed. */}
          <DeliverySection
            id="in-the-package"
            title="In the package"
            data-handover-package=""
            lead={
              somethingToPackage
                ? 'None of it is signed: each file in the ZIP carries its SHA-256 in the manifest, and the manifest names the signed run, so a reader can check the package belongs to it. Who wrote each part is marked.'
                : `${partsCount(parts)} of 6 parts exist${partsCount(parts) > 0 ? ', read from the signed run' : ''}. Code, tests and documentation are made by the tools before this one.`
            }
          >
            <ul className="m-0 list-none p-0">
              <PackagePart
                id="code"
                icon={<FileCode2 size={18} aria-hidden="true" />}
                name={keyUser ? 'Key-user step list' : isAbapCloud ? 'Code for abapGit' : 'Code'}
                sub={keyUser ? `${KEY_USER_STEPS_PATH}, with its acceptance checks — no code` : isAbapCloud ? 'ABAP Cloud objects in the abapGit layout' : 'A TypeScript package'}
                present={parts.code}
                chips={hasGeneratedCode && !keyUser ? <><FamilyChip kind="engine" note="frame" /><FamilyChip kind="ai" note="bodies" /></> : null}
                state={!parts.code ? 'Not yet' : codeStale ? 'Out of date' : keyUser ? 'In the ZIP' : 'Not compiled or activated'}
              >
                {keyUser ? (
                  // Roadmap 3.0.19: a key-user decision hands over the step list, not code.
                  <IntegrityLine
                    icon={<FileText size={18} aria-hidden="true" data-integrity-icon="key-user-steps" className="text-cc-ink-muted mt-1 shrink-0" />}
                    title={<span data-key-user-handover="">Key-user step list</span>}
                    detail={`No code: in the delivery bundle as ${KEY_USER_STEPS_PATH}, with its acceptance checks`}
                  />
                ) : (
                  <IntegrityLine
                    icon={
                      // Roadmap 0.2 (UX-027): existence is not verification.
                      hasGeneratedCode && !codeStale ? (
                        <FileCode2 size={18} aria-hidden="true" data-integrity-icon="present" className="text-cc-ink-muted mt-1 shrink-0" />
                      ) : (
                        <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-1 shrink-0" />
                      )
                    }
                    title={
                      <span data-stage-output={hasGeneratedCode ? 'generatedCode' : undefined}>
                        {!hasGeneratedCode ? 'No transformed code generated' : isAbapCloud ? 'abapGit repository layout' : 'Transformed CAP structure'}
                      </span>
                    }
                    detail={
                      !hasGeneratedCode
                        ? 'Run Transformation to produce the code this line reports on'
                        : codeStale
                          ? `${codeStaleWords(project)?.short ?? `Generated from ${previousBasis(project)}`} — regenerate in Transformation`
                          : isAbapCloud
                            ? 'ABAP Cloud packages generated — not compiled or tested. Every file a model touched says so in its header.'
                            : 'TypeScript package generated — not compiled or tested'
                    }
                  />
                )}
              </PackagePart>

              <PackagePart
                id="tests"
                icon={<FlaskConical size={18} aria-hidden="true" />}
                name="Tests"
                sub={isAbapCloud ? 'ABAP Unit cases from the original' : 'Test suite for the sandbox'}
                present={parts.tests}
                state={<span data-delivery-testing="" data-stage-output={testCaseCount > 0 ? 'testCases' : undefined}>{deliveryTestingTitle(project, isAbapCloud)}</span>}
              >
                <IntegrityLine
                  icon={
                    // Green only when an execution is on record — `proven` on this page as on the stepper and the
                    // rail, and never against mocks. A row of `Passed` strings is client-writable and is not one.
                    testingPhase.proven && !testingPhase.mock ? (
                      <CheckCircle2 size={18} aria-hidden="true" className="text-cc-success mt-1 shrink-0" />
                    ) : (
                      <AlertCircle size={18} aria-hidden="true" className="text-cc-warning mt-1 shrink-0" />
                    )
                  }
                  title={testCaseCount === 0 ? 'No test suite generated' : `${testCaseCount} scenario${testCaseCount === 1 ? '' : 's'} in the package`}
                  detail={
                    testCaseCount === 0
                      ? 'Nothing to verify'
                      : testingPhase.state === 'stale'
                        ? `Written for ${testsPreviousBasis(project)} — regenerate in Testing`
                        // ADR-094 — closed by the owner without a passing run: named, not a blocker, never a pass.
                        : testingClosure.state === 'current'
                          ? closureHandoverLine(testingClosure.closure)
                        : recordedTestRun.kind === 'failed'
                          ? failureSentence(recordedTestRun.failure)
                        : outsideTests.state === 'current'
                          ? [
                              outsideShortfall(outsideTests.summary),
                              outsideTests.summary.kind === 'imported'
                                ? 'Not run here — the result was imported from your SAP system. It is on the project, not in the signed pack.'
                                : `Not run here — your statement that it ran in your SAP system (${[outsideTests.summary.system, outsideTests.summary.ranOn].filter(Boolean).join(', ')})`,
                            ].filter(Boolean).join(' ')
                        : recordedTestRun.kind === 'recorded'
                          ? (recordedTestRun.counts.passed === testCaseCount
                              ? (isAbapCloud ? 'ADT: every generated test returned a pass' : 'Sandbox: every generated test returned a pass')
                              : countsLine(recordedTestRun.counts))
                          : testsPassed > 0
                            ? `${testsPassed} marked as passed — no test run is on record behind these verdicts. Run the suite in Testing.`
                            : [
                              testsFailed > 0 ? `${testsFailed} marked as failed` : null,
                              testsConnectivity > 0 ? `${testsConnectivity} connectivity checks — not tests of the code` : null,
                              testsWithoutVerdict > 0 ? `${testsWithoutVerdict} without a result` : null,
                            ].filter(Boolean).join(' · ') || 'Not run yet'
                  }
                />
                <div className="mt-3">
                  <CcLinkButton href={`/project/${projectId}/testing`}>Open Testing</CcLinkButton>
                </div>
              </PackagePart>

              <PackagePart
                id="documentation"
                icon={<FileText size={18} aria-hidden="true" />}
                name={DOCUMENTATION_LABEL}
                sub="The process description, the business documentation and the developer guide"
                present={parts.documentation}
                chips={
                  hasDocumentation ? (
                    documentationFromCode ? <FamilyChip kind="engine" note="from the code" /> : <FamilyChip kind="ai" />
                  ) : project.businessDocumentation ? <FamilyChip kind="ai" note="business text" /> : null
                }
                state={!parts.documentation ? 'Not yet' : docsStale ? 'Out of date' : 'In the ZIP'}
              >
                <IntegrityLine
                  icon={
                    hasDocumentation && !docsStale ? (
                      <FileText size={18} aria-hidden="true" data-integrity-icon="blueprint" className="text-cc-ink-muted mt-1 shrink-0" />
                    ) : (
                      <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-1 shrink-0" />
                    )
                  }
                  title={
                    <span data-stage-output={hasDocumentation ? 'documentation' : undefined}>
                      {!hasDocumentation ? 'No blueprint generated' : documentationFromCode ? 'Process documentation, read from the code' : 'Process blueprint, earlier form'}
                    </span>
                  }
                  detail={
                    !hasDocumentation
                      ? 'Run Documentation to produce the documentation this line reports on'
                      : docsStale
                        ? `Written for ${previousBasis(project)} — regenerate in Documentation`
                        : documentationFromCode
                          ? 'Every statement with its lines'
                          : 'Written by a language model from 1,000-character slices'
                  }
                />
                <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
                  {project.businessDocumentation
                    ? 'Business documentation: operating procedures, roles and controls, written by the language model in Documentation.'
                    : `Business documentation: not generated — written in ${DOCUMENTATION_LABEL}.`}{' '}
                  Developer guide: rules for the chosen route, with the SAP standard tables this program uses, read from the engine’s findings.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.businessDocumentation ? (
                    <CcButton
                      variant="ghost"
                      density="compact"
                      // Blocked with the bundle that carries the same file: this documentation is not tracked by digest of its own.
                      disabled={handoverBlocked}
                      onClick={() => {
                        if (handoverBlocked) return;
                        // 3.0.21 (T08): the SOP model's elements marked where they stand, and the file's header comment.
                        const sop = aiAuthorshipFactsOf(project, { documentationFromEngine: isEngineDocumentation(project.documentation) }).sop;
                        const markdown = formatBusinessDocsToMarkdown(project.businessDocumentation || '', project.documentation, { ai: sop });
                        const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                        const name = `${fileName}_BusinessDocumentation.md`;
                        const blob = new Blob([sop ? withAiMarking(name, markdown, aiMarkingStatement(sop, APP_VERSION)) : markdown], { type: "text/markdown;charset=utf-8" });
                        saveAs(blob, name);
                      }}
                      data-stage-output="businessDocumentation"
                      icon={<Download size={16} aria-hidden="true" />}
                    >
                      Business documentation (.md)
                    </CcButton>
                  ) : null}
                  <CcButton
                    variant="ghost"
                    density="compact"
                    onClick={async () => {
                      const evidenceRead = await readScoreEvidence(projectId as string);
                      const guide = developerGuidelinesMarkdown({
                        projectName: project.name,
                        isAbapCloud,
                        paths: null,
                        findings: evidenceRead.evidence ? (evidenceRead.evidence.findings as readonly GuidelineFinding[]) : null,
                        findingsUnread: evidenceRead.unread,
                      });
                      const blob = new Blob([guide], { type: "text/markdown;charset=utf-8" });
                      const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                      saveAs(blob, `${fileName}_Developer_Guidelines.md`);
                    }}
                    icon={<Download size={16} aria-hidden="true" />}
                  >
                    Developer guide (.md)
                  </CcButton>
                  <CcLinkButton href={`/project/${projectId}/documentation`}>Open {DOCUMENTATION_LABEL}</CcLinkButton>
                </div>
              </PackagePart>

              <PackagePart
                id="bpmn"
                icon={<Workflow size={18} aria-hidden="true" />}
                name="Process as BPMN 2.0"
                sub="Reconstructed from the code the signed run read · opens in SAP Signavio"
                present={parts.bpmn}
                chips={signedSource ? <FamilyChip kind="engine" note="from the code" /> : null}
                state={signedSource ? 'Every element with its lines' : 'Not available'}
              >
                <p className="m-0 cc-text-cell text-cc-ink-muted">
                  {signedSource
                    ? 'The same steps and names as Analyze’s map, each element with its line anchors. Exchanged as a file — no Signavio connection. Downloaded on its own; not in the ZIP. Not signed.'
                    : 'Not available: the source on this project no longer matches the one the signed run read, so the line anchors would point at other lines.'}
                </p>
                {signedSource ? (
                  <div className="mt-3">
                    <CcButton variant="ghost" density="compact" onClick={downloadBpmn} disabled={handoverBlocked} data-handover-bpmn="" icon={<Download size={16} aria-hidden="true" />}>
                      Download .bpmn
                    </CcButton>
                  </div>
                ) : null}
              </PackagePart>

              {/* The requirements specification of the Design tool (ADR-078): never as proven — not in the signed pack. */}
              <PackagePart
                id="spec"
                icon={<ClipboardList size={18} aria-hidden="true" />}
                name="Requirements specification"
                sub="Drafted from the code, with your answers from Design"
                present={parts.spec}
                chips={specSummary && !specStale ? <><FamilyChip kind="engine" note="from the code" /><FamilyChip kind="yours" note="your answers" /></> : null}
                state={!specSummary ? 'Not yet' : specStale ? 'Out of date' : 'Written in Design'}
              >
                <p data-delivery-spec="" className="m-0 cc-text-cell text-cc-ink-muted">
                  {specHandoverLine(specSummary, signedSource ? sha256Hex(signedSource.source) : null) ??
                    'Not started — written in the requirements workspace of the Design tool.'}{' '}
                  Not part of the signed audit pack, and not in the ZIP.
                </p>
                <div className="mt-3">
                  <CcLinkButton href={`/project/${encodeURIComponent(projectId as string)}/design/requirements`} density="compact">
                    {specSummary ? 'Open the specification' : 'Start in Design'}
                  </CcLinkButton>
                </div>
              </PackagePart>

              <PackagePart
                id="slides"
                icon={<Presentation size={18} aria-hidden="true" />}
                name="Stakeholder slides"
                sub="Seven slides from the signed run · no model, no savings figure"
                present={parts.slides}
                chips={parts.slides ? <FamilyChip kind="engine" note="from the signed run" /> : null}
                state={analysisStale ? 'Not available' : deck ? 'A preview here' : 'Not available'}
              >
                {analysisStale ? (
                  <p data-delivery-deck-blocked="" className="m-0 cc-text-cell text-cc-ink-muted">Not available — the analysis is from a previous source. Run it again in Analyze.</p>
                ) : deck ? (
                  <>
                    <p className="m-0 cc-text-cell text-cc-ink-muted">
                      Built from the signed run and the engine’s findings, for a steering meeting. No model wrote them, and they carry no savings figure. Not signed, and not in the ZIP.
                    </p>
                    {detection.error && (
                      <div className="mt-3">
                        <CcMessageStrip state="warning" headline="Findings could not be determined for this source">
                          — the slides show no verdict, not a clean one.
                          <span className="block mt-1">
                            Check the source in Analyze and run the analysis again; if it happens again, write to{' '}
                            <a href="mailto:info@clean-core.io" className={TEXT_LINK}>info@clean-core.io</a> with the project name.
                          </span>
                          {/* The raw error is for whoever debugs it, not for the board (UX-090). */}
                          <details className="mt-2">
                            <summary className="cursor-pointer cc-text-meta">Technical details</summary>
                            <span className="block mt-1 font-cc-mono cc-text-meta font-medium break-all">{detection.error}</span>
                          </details>
                        </CcMessageStrip>
                      </div>
                    )}
                    <div id="presentation-preview" className="mt-3 flex justify-center rounded-cc-card border border-cc-line bg-cc-surface-muted p-4 md:p-6">
                      <PresentationViewer data={deck} />
                    </div>
                  </>
                ) : (
                  <p className="m-0 cc-text-cell text-cc-ink-muted">No slides available.</p>
                )}
              </PackagePart>
            </ul>

            <div data-package-foot="" className="mt-4 flex flex-col gap-2 border-t border-cc-line pt-4 sm:flex-row sm:items-start sm:gap-4">
              {somethingToPackage ? (
                <CcButton
                  variant={answer.verdict === 'yes' ? 'secondary' : 'ghost'}
                  onClick={downloadZip}
                  disabled={handoverBlocked}
                  busy={bundleBusy}
                  data-handover-bundle=""
                  icon={<Download size={16} aria-hidden="true" />}
                >
                  {handoverBlocked ? 'Blocked — see Before go-live' : bundleLabel}
                </CcButton>
              ) : null}
              <p className="m-0 cc-text-meta text-cc-ink-muted" data-bundle-contents="">
                {!somethingToPackage
                  ? 'Nothing to put in a ZIP yet: code, tests and documentation are made in Transformation, Documentation and Testing.'
                  : keyUser
                    // Roadmap 3.0.19: no code on a key-user route — the step list is what the bundle carries.
                    ? `One ZIP: the key-user step list (${KEY_USER_STEPS_PATH}) with its acceptance checks and the documentation, with STATUS.md and a manifest. Built in your browser, no model call, not signed.`
                    // Says what the ZIP holds now, not what a finished project's would (UX review 22.11.2026, Q6).
                    : `${bundleContentsLine({ code: hasGeneratedCode, tests: hasTestSuite, documentation: Boolean(project.documentation) })} No model call.${answer.verdict === 'yes' ? '' : ' Until nothing blocks the handover, it is a review version.'}`}
              </p>
            </div>
            {bundleError && (
              <div className="mt-3">
                <CcMessageStrip state="error" headline={bundleError} announce actions={<CcButton onClick={downloadZip}>Try again</CcButton>}>
                  Nothing was downloaded.
                </CcMessageStrip>
              </div>
            )}
            {rejectedPaths && (
              <div data-bundle-rejected="" className="mt-3 text-left">
                <CcMessageStrip state="error" headline="Bundle refused" announce>
                  <span className="block">
                    The generated package names {rejectedPaths.length === 1 ? 'a file' : `${rejectedPaths.length} files`} that would
                    be written outside the archive when it is unpacked. Nothing was downloaded. Run the transformation again and
                    check the source it was generated from.
                  </span>
                  <span className="block mt-2">
                    <Link href={`/project/${projectId}/transformation`} data-bundle-rejected-link="" className={TEXT_LINK}>
                      Open the Transformation stage
                    </Link>
                  </span>
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                    {rejectedPaths.map((r) => (
                      <li key={r.path}>
                        <code className="font-cc-mono break-all">{r.path}</code> — {r.reason}
                      </li>
                    ))}
                  </ul>
                </CcMessageStrip>
              </div>
            )}
          </DeliverySection>

          {/* L3 — one table, statement by statement; the chain in plain words folded under it (UX review Q6). */}
          <DeliverySection
            id="proof"
            title="What is proven, and what is not"
            data-proof=""
            lead="The server signs what it computed itself. What a person declared is sealed as their word: it cannot be changed unnoticed, but nobody vouches for it. What a model wrote or a browser could change is not signed, and says so."
          >
            <ProofTable rows={proof} />
            <div className="mt-4 border-t border-cc-line pt-3" data-chain-detail="">
              <CcDisclosure title="The chain, link by link" count={chain.length}>
                <p className="cc-text-meta mb-2 text-cc-ink-muted">
                  {chain.filter((l) => l.state === 'on-record').length} of {chain.length} links are on record. Each says what is
                  there, and what is missing.
                </p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {chain.map((l) => (
                    <li key={l.key} id={`chain-${l.key}`} data-chain-link={l.key} data-chain-state={l.state} className="cc-text-cell text-cc-ink">
                      {linkInWords(l)}
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-3 cc-text-label text-cc-ink-muted">What the audit pack’s own chain says</p>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0" data-pack-chain="">
                  {/* The status of this project's record per step, in words — never the kind of coverage a step could
                      have (UX review 22.11.2026, Q6): no "Decision — Confirmed" where nobody confirmed anything. */}
                  {packChainRows(hp, packChain).map((s) => (
                    <li key={s.id} data-pack-chain-step={s.id} data-pack-chain-status={s.provenance} className="cc-text-cell text-cc-ink">
                      <span className="font-semibold">{s.label}:</span> {s.text}
                    </li>
                  ))}
                </ul>
              </CcDisclosure>
            </div>
          </DeliverySection>

          {/* L7 — the audit pack in the main column: its seal, its files, how anyone checks it. */}
          <DeliverySection
            id="audit-pack"
            title="Audit pack"
            data-audit-pack=""
            lead="The one file the server signs: the analysis, its source fingerprint and your sealed statements. Anyone can check it, with or without an account."
          >
            <div data-audit-pack-state={exportedAt ? 'sealed' : packAvailable ? 'not-sealed' : 'not-available'} className="flex flex-wrap items-center gap-2">
              <p className="m-0 cc-text-h3 text-cc-ink">
                {handoverBlocked
                  ? 'Blocked'
                  : !hasRun
                    ? 'Not available — sealed only against a signed run'
                    : exportedAt
                      ? <>Sealed on <CcDateText value={exportedAt} format="iso" /></>
                      : 'Not sealed yet'}
              </p>
              {exportedAt && !handoverBlocked ? <FamilyChip kind="signed" /> : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <DeliveryKeyValues
                  rows={[
                    {
                      k: 'Input fingerprint',
                      v: fingerprint ? (
                        <span data-stage-output="auditMetadata" className="block">
                          <span className="block truncate font-cc-mono cc-text-meta" title={fingerprint.sha256}>
                            SHA-256 {fingerprint.sha256.substring(0, 16)}…
                          </span>
                          <span className="cc-text-meta font-medium text-cc-ink-muted">
                            {fingerprint.lineCount} lines · {fingerprint.objectType} · {fingerprint.fileName}
                          </span>
                        </span>
                      ) : (
                        'Not recorded — run the analysis again'
                      ),
                    },
                    { k: 'Signatures', v: 'HMAC-SHA256, and Ed25519 where the server holds a signing key; the manifest names the key' },
                    { k: 'Files', v: `${AUDIT_PACK_FILES.length} — ${signedFiles} signed, ${attestedFiles} your statements sealed, 1 manifest` },
                    {
                      // 3.0.23: the design target, not "Decision" — that word is the keep, rebuild or retire decision.
                      k: 'Design target',
                      v: target
                        ? `${target} — signed off${project.approvedBy ? ` by ${project.approvedBy}` : ''}, in the pack as your statement`
                        : 'Awaiting sign-off',
                    },
                    {
                      // Roadmap 1.2 — no default model id where the card names none.
                      k: 'Model',
                      v: modelCard?.model
                        ? `${modelCard.model} · ${modelCard.byokUsed ? 'own key' : 'platform key'}`
                        : modelCard?.modelParticipation === 'none'
                          ? 'No model — deterministic evidence only'
                          : modelCard?.modelParticipation === 'narrative'
                            ? 'Narrative origin not established'
                            : 'Not recorded',
                    },
                    { k: 'Last sealed', v: exportedAt ? <CcDateText value={exportedAt} format="iso" /> : 'Never' },
                  ]}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <CcButton
                    variant={exportedAt ? 'ghost' : 'secondary'}
                    density="compact"
                    disabled={handoverBlocked || !hasRun}
                    busy={auditPackBusy}
                    data-handover-audit-pack=""
                    onClick={downloadAuditPack}
                    icon={<Download size={16} aria-hidden="true" />}
                  >
                    {handoverBlocked ? 'Audit pack blocked' : exportedAt ? 'Download it again' : 'Download and seal'}
                  </CcButton>
                  <span className="cc-text-meta text-cc-ink-muted" data-audit-pack-use="">
                    {/* Said by state, never as a promise about this download. */}
                    {exportedAt
                      ? 'The same signed record; a new download adds no new seal.'
                      : 'The first download of this run seals it. No model is called.'}
                  </span>
                </div>
                {auditPackError && (
                  <div className="mt-3">
                    <CcMessageStrip
                      state="error"
                      headline="The audit pack could not be generated."
                      announce
                      actions={<CcButton onClick={downloadAuditPack}>Try again</CcButton>}
                    >
                      {auditPackError}
                    </CcMessageStrip>
                  </div>
                )}
                {sealNotice?.kind === 'not-sealed' && (
                  <div className="mt-3" data-audit-pack-seal-missing="">
                    <CcMessageStrip state="warning" headline="Downloaded, but not recorded as sealed." announce>
                      The server records the seal only while the run the pack was made from is the active one, and it no longer is. Reload the page and download the pack again.
                    </CcMessageStrip>
                  </div>
                )}
                {sealNotice?.kind === 'unconfirmed' && (
                  <div className="mt-3" data-audit-pack-seal-unconfirmed="">
                    <CcMessageStrip state="warning" headline="Downloaded, but the seal could not be confirmed just now." announce>
                      The server could not be asked whether it recorded the seal. Reload the page to check.
                    </CcMessageStrip>
                  </div>
                )}
                {sealNotice?.kind === 'sealed-earlier' && (
                  <div className="mt-3" data-audit-pack-sealed-earlier="">
                    <CcMessageStrip state="information" headline="Downloaded. This download did not add a new seal." announce>
                      The pack for this run was sealed earlier, on <CcDateText value={sealNotice.auditPackExportedAt} format="iso" />.
                    </CcMessageStrip>
                  </div>
                )}
              </div>
              <div data-pack-check="">
                <p className="m-0 cc-text-h3 text-cc-ink">Anyone can check it, no account needed</p>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  On the web:{' '}
                  <Link href="/verify-pack" className={TEXT_LINK}>
                    Verify an audit pack
                  </Link>
                  . Offline, with the published key, a pack and the package together:
                </p>
                <pre className="mt-2 overflow-x-auto rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 font-cc-mono cc-text-meta text-cc-ink">
                  node scripts/verify-pack.mjs pack.zip --package package.zip
                </pre>
                <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
                  Exit 0 verified · 1 verification failed · 2 could not check. “Could not tell” is never “forged”. “Verified” for
                  the package means it matches its own manifest and names the signed run, not that the pack signs its files.
                </p>
                <div className="mt-3">
                  <CcDisclosure title={`The ${AUDIT_PACK_FILES.length} files`} count={AUDIT_PACK_FILES.length}>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0" data-pack-files="">
                      {AUDIT_PACK_FILES.map((f) => (
                        <li key={f.path} className="flex flex-col">
                          <code className="cc-text-meta font-cc-mono break-all text-cc-ink">{f.path}</code>
                          <span className="cc-text-meta font-medium text-cc-ink-muted">
                            {f.what} · {f.kind === 'signed' ? 'signed' : f.kind === 'attested' ? 'sealed, your word' : 'carries the signature'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CcDisclosure>
                </div>
              </div>
            </div>
          </DeliverySection>

          {/* L8 — import into SAP, folded: the steps the package's README carries, once on the page. */}
          <DeliveryFold id="import-into-sap" title="Import into SAP" meta={isAbapCloud ? 'abapGit · for developers' : 'for developers'} data-delivery-import="">
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              The steps the package’s README carries. Everything here happens in your system; this page records none of it.
            </p>
            <ol className="m-0 mt-3 flex list-decimal flex-col gap-2 pl-5 cc-text-cell text-cc-ink">
              <li><span className="font-semibold">Check the package first</span> — under Audit pack, or offline. A changed file is no longer what was checked.</li>
              {isAbapCloud ? (
                <>
                  <li><span className="font-semibold">Import with abapGit</span> — in your development system: New offline repository, then import the ZIP. The repository settings are in <code className="font-cc-mono">.abapgit.xml</code>.</li>
                  <li><span className="font-semibold">Activate</span> — abapGit activates the objects together. STATUS.md says what is implemented, a stub, proposed or missing.</li>
                  <li><span className="font-semibold">Run the tests</span> — ABAP Unit in your system; import the result file in Testing.</li>
                </>
              ) : (
                <>
                  <li><span className="font-semibold">Build</span> — <code className="font-cc-mono">npm ci</code> and <code className="font-cc-mono">npm run build</code>, as the package’s CI does.</li>
                  <li><span className="font-semibold">Run the tests</span> — <code className="font-cc-mono">npm test</code>.</li>
                </>
              )}
              <li><span className="font-semibold">Transport</span> — through your own landscape and its approvals.</li>
            </ol>
          </DeliveryFold>

          {/* Who did what, when — and who confirmed what, a self-declaration of the signed-in account. */}
          <DeliveryFold id="timeline" title="Timeline" meta={timeline.length > 0 ? `${timeline.length} events · who did what, when` : 'no dated event'} data-handover-timeline="">
            {timeline.length === 0 ? (
              <p className="m-0 cc-text-cell text-cc-ink-muted">No dated event is on record.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {timeline.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                    <span className="cc-text-meta text-cc-ink-muted"><CcDateText value={e.at} format="iso" /></span>
                    <span className="cc-text-cell text-cc-ink">
                      {e.sentence}
                      {e.account ? <span className="block cc-text-meta break-all text-cc-ink-muted">{e.account}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4 border-t border-cc-line pt-3" data-confirmations="">
              <p className="m-0 cc-text-label text-cc-ink-muted">Who confirmed what</p>
              {confirmations.length === 0 ? (
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">Nobody has confirmed anything on this project yet.</p>
              ) : (
                <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
                  {confirmations.map((c, i) => (
                    <li key={`${c.what}-${i}`} className="cc-text-cell text-cc-ink">
                      {c.what}
                      <span className="block cc-text-meta break-all text-cc-ink-muted">
                        {c.account}
                        {c.at ? <> · <CcDateText value={c.at} format="iso" /></> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted">
                A confirmation is the signed-in account’s self-declaration, not an organisational mandate.
              </p>
            </div>
          </DeliveryFold>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Status and limits">
          <SideCard title="Status of the handover" data-handover-status="">
            <HandoverSteps steps={statusSteps} />
          </SideCard>
          <SideCard title="Built on" data-delivery-built-on="">
            <DeliveryKeyValues
              rows={[
                { k: 'Signed run', v: hasRun ? <span className="font-cc-mono cc-text-meta break-all">{String(project.activeRunId).slice(0, 12)}…</span> : 'None' },
                { k: 'Source', v: fingerprint ? `${fingerprint.fileName} · ${fingerprint.lineCount} lines` : 'Not recorded' },
                // The revision key carries a hash; the screen says what it means (machine-strings guard).
                { k: 'Engine', v: `${engineVersion ?? 'not recorded'}${catalog ? ` · catalog ${catalogForReader(catalog)}` : ''}` },
                {
                  k: 'Model',
                  v: modelCard?.model ? `${modelCard.model} · ${modelCard.byokUsed ? 'own key' : 'platform key'}` : modelCard?.modelParticipation === 'none' ? 'No model' : 'Not recorded',
                },
                { k: 'Target', v: target ? `${target} — your statement` : 'Not signed off' },
              ]}
            />
          </SideCard>
          <SideCard title="Never in the signed pack" data-signature-covers="">
            <NeverInPack items={NEVER_IN_PACK} />
          </SideCard>
        </aside>
      </div>

      <CcToast open={toast !== null} onDismiss={closeToast}>{toast}</CcToast>
    </StageFrame>
  );
}

/** A line of the integrity report inside a package part: a neutral or warning mark, a title, what it means. */
function IntegrityLine({ icon, title, detail }: { icon: ReactNode; title: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div className="min-w-0">
        <span className="cc-text-identifier text-cc-ink block">{title}</span>
        <span className="cc-text-meta font-medium text-cc-ink-muted block mt-1">{detail}</span>
      </div>
    </div>
  );
}
