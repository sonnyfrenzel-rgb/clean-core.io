'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import StageProgress from '@/components/StageProgress';
import { PresentationViewer, PresentationData } from '@/components/PresentationViewer';
import { buildBoardDeck, type RunTrendPoint } from '@/lib/board-deck';
import { detectFindings } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { ClassModel } from '@/lib/abap/class-model';
import { Download, CheckCircle2, FileCode2, Eye, Presentation, AlertCircle, Briefcase, BookOpen, Gauge, FileText, Workflow, FlaskConical, Package, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import JSZip from 'jszip';
import { formatAnalysisToMarkdown, formatDesignToMarkdown, formatDocumentationToMarkdown, formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';
import { isEngineDocumentation } from '@/lib/process-documentation';
import { bundleSource, type RejectedBundlePath } from '@/lib/generated-package';

import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { generateAuditPack } from '@/lib/audit-pack';
import { APP_VERSION } from '@/lib/version';
import StageHeader from '@/components/StageHeader';
import { workflowSteps, testEvidence, handoverBlockers, PHASES, previousBasis } from '@/lib/workflow-steps';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcToast from '@/components/cc/Toast';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import { STATE_CLASSES } from '@/components/cc/state';
import StaleNotice from '@/components/StaleNotice';
import CcLinkButton from '@/components/cc/LinkButton';
import CcDisclosure from '@/components/cc/Disclosure';
import CcDateText from '@/components/cc/DateText';
import { CONDITION_STATUS_LABEL, conditionsSummary } from '@/lib/decision-card';
import { catalogForReader } from '@/lib/messages/demo';
import {
  AUDIT_PACK_FILES,
  NOT_SIGNED,
  SIGNED_COVERS,
  buildHandoverChain,
  chainSummary,
  confirmationsOf,
  handoverFacets,
  handoverGroups,
  handoverNextStep,
  handoverStatusLine,
  handoverStillNeeded,
  handoverTimeline,
  packEvidenceChain,
  signedOffTarget,
  signedSourceOf,
  storedDecisionOf,
  type HandoverLink,
  type HandoverProject,
  type StillNeeded,
} from '@/lib/handover';
import {
  DeliveryAnchorBar,
  DeliveryArtefactCard,
  DeliveryChainBoxes,
  DeliveryFacets,
  DeliveryKeyValues,
  DeliveryMetaline,
  DeliveryNextStep,
  DeliverySection,
  DeliveryStatusLine,
  DeliveryStillNeeded,
} from '@/components/delivery/DeliveryObjectPage';
import { deliveryTestingTitle, lastRun, countsLine } from '@/components/testing/testing-summary';
import { BAIP, BAIP_FIRST } from '@/lib/sap-naming';

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

const generateDeveloperGuidelines = (project: Project) => {
  const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');
  if (isAbapCloud) {
    return `# Developer Extensibility Guidelines - ${project.name}

## Overview
ABAP Cloud / Developer Extensibility model for S/4HANA. All code must align with SAP Clean Core.

## Development Rules
1. **Zero Database Coupling**: Direct SELECT/INSERT/UPDATE on standard tables (VBAK, BSEG, KNA1, etc.) is blocked.
2. **Released API Consumption**: Use released CDS views or standard APIs:
   - VBAK -> Use CDS view 'I_SalesOrder'
   - BSEG -> Use CDS view 'I_JournalEntryItem'
   - KNA1 -> Use CDS view 'I_Customer'
3. **RAP Service Tiering**:
   - Encapsulate business logic in Behavior Implementations (ZCL_DEMO_RAP_BEHAVIOR).
   - Expose services via Service Definitions (SRVD) and Service Bindings (SRVB) using OData V4.
4. **Automated Testing**: Every RAP object must have a local ABAP Unit test class (ZCL_DEMO_RAP_TEST) with >=85% code coverage.
5. **Linter Gate**: Run local 'abaplint.json' check variant before releasing any transport.
`;
  } else {
    return `# Side-by-Side Extensibility Guidelines - ${project.name}

## Overview
Side-by-Side Extensibility on ${BAIP_FIRST} using CAP (Node.js/TypeScript). S/4HANA core remains decoupled.

## Development Rules
1. **Decoupled Architecture**: Direct DB access is blocked. Integrate via released OData APIs through SAP Destination service destinations on ${BAIP}.
2. **Endpoint Security**: Secure CAP endpoints (db/schema.cds, srv/service.cds) with SAP XSUAA. Enforce JWT verification.
3. **Testing**: Mock ERP data for local development. Execute 'npm test' before container packaging.
4. **CI/CD Quality Gates**: Run the generated GitHub Actions pipeline on every PR.
5. **Containerization**: Deploy using the root 'Dockerfile' to Cloud Foundry, Kyma, or GCP.
`;
  }
};

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
    simulated: testsSimulated,
    connectivity: testsConnectivity,
    withoutVerdict: testsWithoutVerdict,
  } = testEvidence(project);
  /** The run the Testing stage reports — a covering receipt, or none. */
  const recordedTestRun = lastRun(project, null);
  const phases = workflowSteps(project);
  const testingPhase = phases.find((p) => p.key === 'testing')!;
  const deliveryPhase = phases.find((p) => p.key === 'delivery')!;
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
  const coveragePercentage =
    typeof project?.coverageEstimate?.percentage === 'number'
      ? project.coverageEstimate.percentage
      : undefined;
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

  const downloadBpmn = async () => {
    if (!signedSource || handoverBlocked) return;
    // Loaded on the click: the ABAP reader is paid for only when the file is asked for.
    const { buildBpmnExportFromSource, bpmnFileName } = await import('@/lib/bpmn/export');
    const { xml } = buildBpmnExportFromSource(signedSource.source, {
      processName: project?.name || signedSource.fileName,
      sourceFileName: signedSource.fileName,
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
      const zip = new JSZip();
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
      if (source.kind === 'package') {
        source.files.forEach((file) => {
          zip.file(file.path, file.content);
        });
        console.log(`[ZIP Handover] Successfully bundled ${source.files.length} modular project files.`);
      }

      // Bundle structure README.md
      if (isAbapCloud) {
        zip.file("README.md", `# ${project.name} (ABAP Cloud Developer Extensibility)
This bundle was automatically generated by Clean-Core.io.

## abapGit Layout — what is verified, and what is not
The repository configuration file \`.abapgit.xml\` follows the format documented at
https://docs.abapgit.org/user-guide/repo-settings/dot-abapgit.html, and the sources sit under the
\`/src/\` folder it names. That is the layout abapGit expects, so the repository can be linked with the
abapGit Eclipse ADT plugin or the SAP GUI standalone tool.

What has **not** been verified: nobody imported this bundle into an SAP system. The object metadata
files (\`*.clas.xml\` and the rest) were generated here, not produced by an abapGit serializer, so the
names, packages and attributes in them may need adjusting before the objects activate. Treat the
bundle as a starting point for an import, not as an import that is known to succeed.

## Structure
- src/zcl_demo_rap_behavior.clas.abap: RAP custom CRUD behavior implementation class.
- src/zcl_demo_rap_behavior.clas.xml: Behavior class metadata descriptor.
- src/z_demo_rap_ddls.ddls.asddls: ABAP CDS projection data definition view.
- src/z_demo_rap_bdef.bdef.asbdef: Custom RAP Behavior Definition.
- src/z_demo_rap_srvd.srvd.assrvd: RAP Service Definition exposing core capabilities.
- src/z_demo_rap_srvb.srvb.assrvb: RAP Service Binding config (OData V4 Web API).
- src/zcl_demo_rap_test.clas.abap: ABAP Unit Test Class verifying behavior logic.
- src/zcl_demo_rap_test.clas.xml: ABAP Unit Class metadata XML.
- .abapgit.xml: The abapGit repository configuration file (master language, starting folder, folder logic).
- docs/: High-grade architectural specifications and analysis reports.

## Getting Started
1. Import the \`/src\` folder into your target S/4HANA development package using abapGit.
2. Activate all Dictionary and RAP objects in Eclipse ADT.
3. Run the ABAP Unit test class ZCL_DEMO_RAP_TEST to verify correctness.
`);
      } else {
        zip.file("README.md", `# ${project.name} (Side-by-Side Decoupled Extension on ${BAIP_FIRST})
This bundle was automatically generated by Clean-Core.io.

## Structure
${isModular ? `- db/schema.cds: Database schema & entities.
- srv/service.cds: OData Service endpoint definition.
- srv/service.ts: Modernized application logic handler.
- package.json: Node.js dependency manager config.
- Dockerfile: Production container deployment setup.
- test.ts: Automated test suite verification script.
- erp-triggers/zcl_core_event_publisher.clas.abap: S/4HANA Core event trigger class (released BAdI) notifying Event Mesh.` 
: `- src/app.ts: The modernized Node.js application (TypeScript).
- src/test.ts: The corresponding test execution script.
- package.json: Node.js dependency configuration.`}
- docs/: Architectural specifications and domain analysis.

## Getting Started
1. Install dependencies: \`npm install\`
2. Build the project: \`npm run build\` or run in dev: \`npm run dev\`
3. Execute automated tests: \`npm test\`
4. Deploy the ABAP trigger under \`erp-triggers/\` inside your S/4HANA core system to activate the event routing.
`);
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
        zip.file(".abapgit.xml", `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 <asx:values>
  <DATA>
   <MASTER_LANGUAGE>E</MASTER_LANGUAGE>
   <STARTING_FOLDER>/src/</STARTING_FOLDER>
   <FOLDER_LOGIC>PREFIX</FOLDER_LOGIC>
   <IGNORE>
    <item>/README.md</item>
    <item>/abaplint.json</item>
    <item>/docs/</item>
   </IGNORE>
  </DATA>
 </asx:values>
</asx:abap>`);

        if (!isModular) {
          const src = zip.folder("src");
          if (src && project.generatedCode) {
            src.file("zcl_demo_rap_behavior.clas.abap", project.generatedCode);
            src.file("zcl_demo_rap_behavior.clas.xml", `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 <asx:values>
  <VSEOCLASS>
   <CLSNAME>ZCL_DEMO_RAP_BEHAVIOR</CLSNAME>
   <VERSION>1</VERSION>
   <LANGU>E</LANGU>
   <DESCRIPT>RAP Behavior Class</DESCRIPT>
   <STATE>1</STATE>
   <CLSCCINCL>X</CLSCCINCL>
   <FIXPT>X</FIXPT>
   <UNICODE>X</UNICODE>
  </VSEOCLASS>
 </asx:values>
</asx:abap>`);
          }
        }
      }

      if (!isAbapCloud && !isModular) {
        zip.file("package.json", JSON.stringify({
          "name": project.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          "version": "1.0.0",
          "description": "Clean-Core Transformation Output",
          "main": "dist/app.js",
          "scripts": {
            "start": "node dist/app.js",
            "build": "tsc",
            "test": "node --test dist/test.js"
          },
          "dependencies": {
            "express": "^4.19.2",
            "zod": "^3.23.0"
          },
          "devDependencies": {
            "@types/express": "^4.17.21",
            "@types/node": "^20.0.0",
            "typescript": "^5.0.0"
          }
        }, null, 2));

        // `build` is `tsc`, and `tsc` without a project file compiles nothing
        // and prints its help. `main` and `test` read `dist/`, so the sources
        // under `src/` are compiled there.
        zip.file("tsconfig.json", JSON.stringify({
          "compilerOptions": {
            "target": "ES2022",
            "module": "commonjs",
            "rootDir": "src",
            "outDir": "dist",
            "strict": true,
            "esModuleInterop": true,
            "skipLibCheck": true
          },
          "include": ["src"]
        }, null, 2));

        const src = zip.folder("src");
        if (src && project.generatedCode) {
          src.file("app.ts", project.generatedCode);
        }
      }

      // Add Test Suite (if not already included inside modular files)
      if (project.testSuite?.code) {
        if (isAbapCloud) {
          zip.file("src/zcl_demo_rap_test.clas.abap", project.testSuite.code);
          zip.file("src/zcl_demo_rap_test.clas.xml", `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 <asx:values>
  <VSEOCLASS>
   <CLSNAME>ZCL_DEMO_RAP_TEST</CLSNAME>
   <VERSION>1</VERSION>
   <LANGU>E</LANGU>
   <DESCRIPT>ABAP Unit Test Class for RAP Service</DESCRIPT>
   <CATEGORY>05</CATEGORY>
   <STATE>1</STATE>
   <CLSCCINCL>X</CLSCCINCL>
   <FIXPT>X</FIXPT>
   <UNICODE>X</UNICODE>
   <WITH_UNIT_TESTS>X</WITH_UNIT_TESTS>
  </VSEOCLASS>
 </asx:values>
</asx:abap>`);
        } else {
          const testPath = isModular ? "test.ts" : "src/test.ts";
          zip.file(testPath, project.testSuite.code);
        }
      }

      // Documentation formatted into corporate markdown specifications
      const docs = zip.folder("docs");
      if (docs) {
        if (project.analysis) docs.file("business-analysis.md", formatAnalysisToMarkdown(project.analysis));
        if (project.solutionDesign) docs.file("solution-design.md", formatDesignToMarkdown(project.solutionDesign));
        if (project.documentation) docs.file(DOCUMENTATION_FILE, formatDocumentationToMarkdown(project.documentation));
        if (project.businessDocumentation) docs.file("business-documentation.md", formatBusinessDocsToMarkdown(project.businessDocumentation));
        docs.file("developer-guidelines.md", generateDeveloperGuidelines(project));
      }

      // Add linter and CI configurations based on route
      if (isAbapCloud) {
        zip.file("abaplint.json", JSON.stringify({
          "global": {
            "files": "/src/**/*.*"
          },
          "dependencies": [],
          "syntax": {
            "version": "v750",
            "errorForAllowed": true,
            "keypath": ""
          },
          "rules": {
            "obsolete_statement": true,
            "check_subrc": true,
            "parser_error": true,
            "allowed_object_types": ["CLAS", "INTF", "DDLS", "BDEF", "SRVD", "SRVB"],
            "forbidden_statements": ["SELECT * FROM vbak", "SELECT * FROM bseg", "INSERT INTO vbak"]
          }
        }, null, 2));
      } else {
        const workflows = zip.folder(".github/workflows");
        if (workflows) {
          workflows.file("ci.yml", `name: Node.js CI/CD Quality Gate

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    # No lockfile is generated with the bundle, and \`npm ci\` refuses to run
    # without one; it is used once the team has committed theirs.
    - run: if [ -f package-lock.json ]; then npm ci; else npm install; fi
    - run: npm run build --if-present
    - run: npm test
`);
        }
      }

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
    setAuditPackBusy(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const blob = await generateAuditPack(project, idToken);
      const fileName = (project.name || 'Project').replace(/\s+/g, '_');
      await saveAs(blob, `${fileName}_AuditPack.zip`);
      setToast('Audit pack downloaded');
    } catch (err: any) {
      console.error('Audit pack generation failed:', err);
      setAuditPackError(err?.message || 'Audit pack generation failed. Please try again.');
    } finally {
      setAuditPackBusy(false);
    }
  };

  if (loading || (!project && !loadFailed)) return (
    <div>
      {/* Where am I, what is behind me, what is still open — kept on
          screen while the stepper scrolls away. Both read the same contract;
          neither decides anything. */}

      <StageProgress steps={phases} current="delivery" projectId={projectId as string} />
      <StageHeader tools={{ steps: phases, current: 'delivery' }} stage="delivery" projectName={project?.name} />
      <CcSkeleton shape="cards" label="Finalizing delivery package..." count={4} />
    </div>
  );

  if (!project) return (
    <div className="max-w-7xl mx-auto px-4 md:px-0">
      <StageProgress steps={phases} current="delivery" projectId={projectId as string} />
      <StageHeader tools={{ steps: phases, current: 'delivery' }} stage="delivery" />
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
    </div>
  );

  // The handover, read off the same contract as the stepper (`lib/handover.ts`).
  // Nothing here decides what is signed; it describes what is on record.
  const hp = project as HandoverProject;
  const chain = buildHandoverChain(hp, phases);
  const summary = chainSummary(chain);
  const testsLink = chain.find((l) => l.key === 'tests')!;
  const decision = storedDecisionOf(hp);
  const target = signedOffTarget(hp);
  const confirmations = confirmationsOf(hp);
  const timeline = handoverTimeline(hp);
  const packChain = packEvidenceChain(hp);
  const nextStep = handoverNextStep(hp, phases, blockers, chain, projectId as string);
  const exportedAt = project.auditMetadata?.auditPackExportedAt ?? null;
  const handoverState = { blockers, exportedAt: exportedAt ? String(exportedAt) : null };
  const groups = handoverGroups(hp, chain, handoverState);
  const stillNeeded = handoverStillNeeded(hp, chain, handoverState);
  // The Quality tile's line comes from the Testing stage's own record
  // (`deliveryTestingTitle` reads the run receipt, never `testCases[].status`),
  // so the tile, the chain and the Testing stage say the same thing.
  const facets = handoverFacets(hp, phases, chain, handoverState).map((f) =>
    f.key === 'quality' && f.value !== 'Stale' ? { ...f, sub: deliveryTestingTitle(project, isAbapCloud) } : f,
  );
  const statusLine = handoverStatusLine(hp, chain);
  const packFacet = facets.find((f) => f.key === 'audit-pack')!;
  const signedFiles = AUDIT_PACK_FILES.filter((f) => f.kind === 'signed').length;
  const attestedFiles = AUDIT_PACK_FILES.filter((f) => f.kind === 'attested').length;
  const fingerprint = project.auditMetadata?.inputFingerprint;
  const modelCard = project.auditMetadata?.modelCard;
  const catalog = typeof hp.sapApiCatalogVersion === 'string' && hp.sapApiCatalogVersion ? hp.sapApiCatalogVersion : null;
  const engineVersion = (typeof hp.analyzerVersion === 'string' && hp.analyzerVersion) || modelCard?.engineVersion || null;
  const artefactCount = 6;

  /** Where each still-needed line is made, as a link a reader can follow. */
  const neededHref = (stage: StillNeeded['stage']) =>
    stage === 'management'
      ? `/project/${projectId}?view=management`
      : stage === 'delivery'
        ? '#audit-pack'
        : `/project/${projectId}/${stage}`;
  const neededWhere = (stage: StillNeeded['stage']) =>
    stage === 'management' ? 'Management view' : PHASES.find((p) => p.key === stage)?.label ?? stage;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-0">
      <StageProgress steps={phases} current="delivery" projectId={projectId as string} />

      {/* The lead used to read "The transformation lifecycle is complete … ready
          for deployment" on every project, including one with nothing but an
          analysis run behind it. Block D, D.19: the title is the stage's name
          from `PHASES`, left-aligned like every other stage. */}
      <StageHeader tools={{ steps: phases, current: 'delivery' }} stage="delivery" projectName={project?.name}>
        {/* `proven`, not `done`. The material can all be present while the test
            run behind the verdicts never happened — `testCases[].status` is
            client-writable and used to be read as an execution (QA full review
            of a19945ef01dc). In that case the lead falls through to the phase's
            own detail, which says so. */}
        {deliveryPhase.proven
          ? deliveryPhase.mock
            ? 'Code, documentation and a passing sandbox test run against mocks are on record — not a run against an SAP system. Whether to deploy remains an architect’s decision, not this page’s.'
            : 'Code, documentation and a passing test run are on record. Whether to deploy remains an architect’s decision, not this page’s.'
          : handoverBlocked
            ? 'What is on record for handover, and what is not yet.'
            : `What is on record for handover, and what is not yet. ${deliveryPhase.detail}`}
        <DeliveryMetaline
          items={[
            { key: 'file', value: fingerprint?.fileName || null },
            { key: 'lines', value: typeof fingerprint?.lineCount === 'number' ? `${fingerprint.lineCount} lines` : null },
            // The revision key carries a hash; the screen says what it means (machine-strings guard).
            { key: 'catalog', label: 'catalog', value: catalog ? catalogForReader(catalog) : null },
            { key: 'engine', label: 'engine', value: engineVersion },
          ]}
        />
      </StageHeader>

      {/* Object-page header (proposal A): four facets and the status line. */}
      <div className="-mt-4">
        <DeliveryFacets facets={facets} />
        <DeliveryStatusLine items={statusLine} />
      </div>

      <StaleNotice
        title={`Handover blocked — built for ${previousBasis(project)}`}
        reasons={blockers.map((b) => `${b.charAt(0).toUpperCase()}${b.slice(1)} — regenerate it for the current ${previousBasis(project) === 'a previous target profile' ? 'target profile' : 'source'} before handing over.`)}
      />

      <DeliveryAnchorBar
        items={[
          { id: 'evidence-chain', label: 'Evidence chain' },
          { id: 'still-needed', label: 'Still needed', count: stillNeeded.length },
          { id: 'artefacts', label: 'Artefacts', count: artefactCount },
        ]}
      />

      <div className="mt-5 mb-12 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Next step — one rule-based card with the page's primary action.
              Read off the same contract as the stepper (`lib/handover.ts`). */}
          <DeliveryNextStep
            kind={nextStep.kind}
            headline={nextStep.headline}
            reason={nextStep.reason}
            action={
              nextStep.kind === 'open' ? (
                <CcLinkButton href={nextStep.href} variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
                  {nextStep.action}
                </CcLinkButton>
              ) : nextStep.kind === 'none' ? (
                <>
                  <span className="cc-text-meta text-cc-ink-muted">
                    ZIP, {AUDIT_PACK_FILES.length} files · No model call
                  </span>
                  <CcButton
                    variant="primary"
                    onClick={downloadAuditPack}
                    busy={auditPackBusy}
                    icon={<Download size={16} aria-hidden="true" />}
                  >
                    Download signed audit pack
                  </CcButton>
                </>
              ) : undefined
            }
          />

          {/* The evidence chain — the pack's four steps, each read from the
              links behind it; every one of the nine links one level deeper. */}
          <DeliverySection
            id="evidence-chain"
            title="Evidence chain"
            meta="requirement → decision → receipt → artefact"
            data-evidence-chain=""
          >
            <DeliveryChainBoxes
              boxes={groups.map((g) => ({
                key: g.key,
                label: g.label,
                title: g.title,
                sub: g.sub,
                provenance: g.provenance,
                provenanceNote: g.provenanceNote,
                footer:
                  g.key === 'delivery'
                    ? `${g.links[0].label}: ${g.links[0].state === 'open' ? 'none' : g.links[0].state === 'stale' ? 'stale' : 'on record'}`
                    : `${g.onRecord} of ${g.links.length} ${g.links.length === 1 ? 'link' : 'links'} on record`,
              }))}
            />

            <div className="mt-4 border-t border-cc-line pt-3" data-chain-detail="">
              <CcDisclosure title="Link by link" count={summary.of}>
                <p className="cc-text-meta mb-3 text-cc-ink-muted" data-chain-summary="">
                  {summary.onRecord} of {summary.of} links on record · {summary.proven} proven
                  {summary.open > 0 ? ` · ${summary.open} open` : ''}
                  {summary.stale > 0 ? ` · ${summary.stale} stale` : ''}. Each link says what is on record, where it comes
                  from, and what it does not cover.
                </p>
                <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {chain.map((l, i) => (
                    <ChainLinkBox key={l.key} link={l} n={i + 1} projectId={projectId as string}>
                      {l.key === 'transformation' ? (
                        <IntegrityLine
                          icon={
                            // Roadmap 0.2 (UX-027): existence is not verification.
                            // Generated code is neutral, never the green of a
                            // passed check; nothing there is the warning colour.
                            hasGeneratedCode && !codeStale ? (
                              <FileCode2 size={18} aria-hidden="true" data-integrity-icon="present" className="text-cc-ink-muted mt-0.5 shrink-0" />
                            ) : (
                              <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
                            )
                          }
                          title={
                            <span data-stage-output={hasGeneratedCode ? 'generatedCode' : undefined}>
                              {!hasGeneratedCode
                                ? 'No transformed code generated'
                                : isAbapCloud ? 'abapGit repository layout' : 'Transformed CAP structure'}
                            </span>
                          }
                          detail={
                            !hasGeneratedCode
                              ? 'Run stage 3 to produce the code this line reports on'
                              : codeStale
                                ? `Generated from ${previousBasis(project)} — regenerate in stage 3`
                                : isAbapCloud
                                  ? 'ABAP Cloud packages generated — not compiled or tested'
                                  : 'TypeScript package generated — not compiled or tested'
                          }
                        />
                      ) : l.key === 'documentation' ? (
                        <IntegrityLine
                          icon={
                            hasDocumentation && !docsStale ? (
                              <FileText size={18} aria-hidden="true" data-integrity-icon="blueprint" className="text-cc-ink-muted mt-0.5 shrink-0" />
                            ) : (
                              <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
                            )
                          }
                          title={
                            <span data-stage-output={hasDocumentation ? 'documentation' : undefined}>
                              {!hasDocumentation
                                ? 'No blueprint generated'
                                : documentationFromCode
                                  ? 'Process documentation, read from the code'
                                  : 'Process blueprint, earlier form'}
                            </span>
                          }
                          detail={
                            !hasDocumentation
                              ? 'Run stage 4 to produce the documentation this line reports on'
                              : docsStale
                                ? `Written for ${previousBasis(project)} — regenerate in stage 4`
                                : documentationFromCode
                                  ? 'Every statement with its lines'
                                  : 'Written by a language model from 1,000-character slices'
                          }
                        />
                      ) : l.key === 'tests' ? (
                        <>
                          <IntegrityLine
                            icon={
                              // Green only when an execution is on record — `proven`
                              // on this page as on the stepper and the rail. A row of
                              // `Passed` strings is client-writable and is not one.
                              testingPhase.proven && !testingPhase.mock ? (
                                <CheckCircle2 size={18} aria-hidden="true" className="text-cc-success mt-0.5 shrink-0" />
                              ) : (
                                <AlertCircle size={18} aria-hidden="true" className="text-cc-warning mt-0.5 shrink-0" />
                              )
                            }
                            title={
                              <span data-delivery-testing data-stage-output={testCaseCount > 0 ? 'testCases' : undefined}>
                                {/* The Testing stage's own record (`lastRun`), so the two screens say the same. */}
                                {deliveryTestingTitle(project, isAbapCloud)}
                              </span>
                            }
                            detail={
                              testCaseCount === 0
                                ? 'Nothing to verify'
                                : testingPhase.state === 'stale'
                                  ? `Written for ${previousBasis(project)} — regenerate in stage 5`
                                  : recordedTestRun.kind === 'recorded'
                                    ? (recordedTestRun.counts.passed === testCaseCount
                                        ? (isAbapCloud ? 'ADT: every generated test returned a pass' : 'Sandbox: every generated test returned a pass')
                                        : countsLine(recordedTestRun.counts))
                                    : testsPassed > 0
                                      ? `${testsPassed} marked as passed — no test run is on record behind these verdicts. Run the suite in stage 5.`
                                      : [
                                        testsFailed > 0 ? `${testsFailed} marked as failed` : null,
                                        testsSimulated > 0 ? `${testsSimulated} simulated only` : null,
                                        testsConnectivity > 0 ? `${testsConnectivity} connectivity checks — not tests of the code` : null,
                                        testsWithoutVerdict > 0 ? `${testsWithoutVerdict} without a result` : null,
                                      ].filter(Boolean).join(' · ') || 'Not run yet'
                            }
                          />
                          <IntegrityLine
                            icon={
                              // Neutral: the figure is the generator's estimate, and
                              // a green check beside "not measured" read as a
                              // measurement (UX review of b88c77b, fc15ffd1018a).
                              coveragePercentage !== undefined && testingPhase.state !== 'stale' ? (
                                <Gauge size={18} aria-hidden="true" data-integrity-icon="estimate" className="text-cc-ink-muted mt-0.5 shrink-0" />
                              ) : (
                                <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
                              )
                            }
                            title={
                              <span data-stage-output={coveragePercentage !== undefined ? 'coverageEstimate' : undefined}>
                                {coveragePercentage !== undefined ? `${coveragePercentage}% estimated coverage` : 'Coverage not estimated'}
                              </span>
                            }
                            detail={
                              coveragePercentage !== undefined && testingPhase.state === 'stale' ? (
                                <span data-coverage-stale>Estimated for a previous source — regenerate in stage 5</span>
                              ) : coveragePercentage !== undefined ? (
                                <span data-coverage-provenance className="flex flex-wrap items-center gap-2">
                                  <CcProvenanceChip value="proposed" />
                                  <span>Estimated by the test generator — not measured</span>
                                </span>
                              ) : (
                                'No estimate was produced with the test suite'
                              )
                            }
                          />
                        </>
                      ) : null}
                    </ChainLinkBox>
                  ))}
                </ol>
              </CcDisclosure>
            </div>
          </DeliverySection>

          {/* What a real handover still needs — each line jumps to its tool. */}
          <DeliverySection id="still-needed" title="What a real handover still needs" meta={String(stillNeeded.length)} data-handover-open="">
            <DeliveryStillNeeded
              empty="Nothing — every link of the chain has a record, and the audit pack is sealed."
              items={stillNeeded.map((n) => ({ key: n.key, text: n.text, where: neededWhere(n.stage), href: neededHref(n.stage) }))}
            />
          </DeliverySection>

          {/* The artefacts that leave with the package — built in the browser, not signed. */}
          <DeliverySection id="artefacts" title="Artefacts" meta="review material — not signed" data-handover-package="">
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              <DeliveryArtefactCard
                icon={<Package size={18} aria-hidden="true" />}
                title="Delivery bundle"
                chip={hasGeneratedCode ? <CcProvenanceChip value="proposed" /> : <CcProvenanceChip value="not-determined" />}
                detail="The generated code, the test suite, the documentation and the developer guide as one ZIP. Built in your browser and not signed."
                action={
                  <CcButton
                    variant="ghost"
                    density="compact"
                    onClick={downloadZip}
                    disabled={handoverBlocked}
                    busy={bundleBusy}
                    data-handover-bundle
                    icon={<Download size={16} aria-hidden="true" />}
                  >
                    {handoverBlocked ? 'Blocked — see above' : 'Download bundle'}
                  </CcButton>
                }
              >
                {bundleError && (
                  <CcMessageStrip
                    state="error"
                    headline={bundleError}
                    announce
                    actions={<CcButton onClick={downloadZip}>Try again</CcButton>}
                  >
                    Nothing was downloaded.
                  </CcMessageStrip>
                )}
                {rejectedPaths && (
                  <div data-bundle-rejected className="text-left">
                    <CcMessageStrip state="error" headline="Bundle refused" announce>
                      <span className="block">
                        The generated package names {rejectedPaths.length === 1 ? 'a file' : `${rejectedPaths.length} files`} that would
                        be written outside the archive when it is unpacked. Nothing was downloaded. Run the transformation again and
                        check the source it was generated from.
                      </span>
                      <span className="block mt-2">
                        <Link href={`/project/${projectId}/transformation`} data-bundle-rejected-link className={TEXT_LINK}>
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
              </DeliveryArtefactCard>

              <DeliveryArtefactCard
                icon={<Eye size={18} aria-hidden="true" />}
                title="Stakeholder briefing"
                chip={<CcProvenanceChip value={deck && !analysisStale ? 'reconstructed' : 'not-determined'} />}
                detail={
                  analysisStale ? (
                    <span data-delivery-deck-blocked>Not available — the analysis is from a previous source. Re-run it in stage 1.</span>
                  ) : deck ? (
                    'Seven slides from the signed run and the engine’s findings. No model wrote them, and they carry no savings figure.'
                  ) : (
                    'No slides available'
                  )
                }
                action={
                  deck && !analysisStale ? (
                    <CcButton
                      variant="ghost"
                      density="compact"
                      onClick={() => {
                        document.getElementById('presentation-preview')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      icon={<Presentation size={16} aria-hidden="true" />}
                    >
                      View slides
                    </CcButton>
                  ) : undefined
                }
              />

              <DeliveryArtefactCard
                icon={<Briefcase size={18} aria-hidden="true" />}
                title="Business documentation"
                chip={project.businessDocumentation ? <CcProvenanceChip value="proposed" /> : <CcProvenanceChip value="not-determined" />}
                detail={
                  project.businessDocumentation
                    ? 'Operating procedures, roles and controls, as Markdown. Written by the language model on the Documentation stage.'
                    : `Not generated — written on the ${DOCUMENTATION_LABEL} stage.`
                }
                action={
                  project.businessDocumentation ? (
                    <CcButton
                      variant="ghost"
                      density="compact"
                      // Blocked with the bundle that carries the same file: this
                      // documentation is not tracked by digest of its own.
                      disabled={handoverBlocked}
                      onClick={() => {
                        if (handoverBlocked) return;
                        const blob = new Blob([formatBusinessDocsToMarkdown(project.businessDocumentation || '')], { type: "text/markdown;charset=utf-8" });
                        const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                        saveAs(blob, `${fileName}_BusinessDocumentation.md`);
                      }}
                      data-stage-output="businessDocumentation"
                      icon={<Download size={16} aria-hidden="true" />}
                    >
                      {handoverBlocked ? 'Blocked — see above' : 'Export Markdown'}
                    </CcButton>
                  ) : (
                    <CcLinkButton href={`/project/${projectId}/documentation`}>Go to {DOCUMENTATION_LABEL}</CcLinkButton>
                  )
                }
              />

              <DeliveryArtefactCard
                icon={<BookOpen size={18} aria-hidden="true" />}
                title="Developer guide"
                detail="General rules for the chosen route — a fixed template, not read from this code."
                action={
                  <CcButton
                    variant="ghost"
                    density="compact"
                    onClick={() => {
                      const blob = new Blob([generateDeveloperGuidelines(project)], { type: "text/markdown;charset=utf-8" });
                      const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                      saveAs(blob, `${fileName}_Developer_Guidelines.md`);
                    }}
                    icon={<Download size={16} aria-hidden="true" />}
                  >
                    Export Guide
                  </CcButton>
                }
              />

              <DeliveryArtefactCard
                icon={<Workflow size={18} aria-hidden="true" />}
                title="Process as BPMN 2.0 XML"
                chip={<CcProvenanceChip value={signedSource ? 'reconstructed' : 'not-determined'} />}
                detail={
                  signedSource
                    ? 'Reconstructed from the code the signed run read, every element with its lines. Opens in SAP Signavio and any BPMN modeller. Not signed.'
                    : 'Not available: the source on this project no longer matches the one the signed run read, so the line anchors would point at other lines.'
                }
                action={
                  signedSource ? (
                    <CcButton
                      variant="ghost"
                      density="compact"
                      onClick={downloadBpmn}
                      disabled={handoverBlocked}
                      data-handover-bpmn
                      icon={<Download size={16} aria-hidden="true" />}
                    >
                      Download .bpmn
                    </CcButton>
                  ) : undefined
                }
              />

              <DeliveryArtefactCard
                icon={<FlaskConical size={18} aria-hidden="true" />}
                title="Test scenarios"
                chip={<CcProvenanceChip value={testsLink.provenance} />}
                detail={
                  testCaseCount === 0
                    ? 'No test suite generated, so none travels with the package.'
                    : `${testCaseCount} scenario${testCaseCount === 1 ? '' : 's'} in the delivery bundle. ${testsLink.missing ?? ''}`
                }
              />
            </ul>
          </DeliverySection>

          {/* Conditions — collapsed, as in the mockup. */}
          <section className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc sm:px-5" data-handover-conditions="">
            <CcDisclosure title="Conditions" count={decision?.conditions.length ?? 0} level={2}>
              {!decision ? (
                <p className="cc-text-cell text-cc-ink-muted">
                  No decision is recorded, so no conditions travel with the package. A decision is confirmed in the{' '}
                  <Link href={`/project/${projectId}?view=management`} className={TEXT_LINK}>Management view</Link>.
                </p>
              ) : decision.conditions.length === 0 ? (
                <p className="cc-text-cell text-cc-ink-muted">{conditionsSummary(decision.conditions)}</p>
              ) : (
                <>
                  <p className="cc-text-meta mb-2 text-cc-ink-muted">{conditionsSummary(decision.conditions)}</p>
                  <ul className="flex flex-col gap-2">
                    {decision.conditions.map((c) => (
                      <li key={c.id} className="flex flex-col gap-1 rounded-cc-row border border-cc-line p-3 sm:flex-row sm:items-start sm:gap-3">
                        <span className="cc-text-cell min-w-0 flex-1 text-cc-ink">{c.text}</span>
                        <span className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="cc-text-meta text-cc-ink">{CONDITION_STATUS_LABEL[c.status]}</span>
                          <CcProvenanceChip value={c.provenance} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CcDisclosure>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Audit pack, signature, confirmations and timeline">
          {/* The signed audit pack — the one artefact the server signs. */}
          <DeliverySection
            id="audit-pack"
            title="Audit pack"
            meta={
              <span
                data-audit-pack-state={packFacet.value}
                className={clsx(
                  'inline-flex items-center rounded-full border px-2 py-px text-[11px] font-semibold leading-4',
                  packFacet.value === 'Available'
                    ? clsx(STATE_CLASSES.neutral.bg, STATE_CLASSES.neutral.border, STATE_CLASSES.neutral.text)
                    : clsx(STATE_CLASSES.warning.bg, STATE_CLASSES.warning.border, STATE_CLASSES.warning.text),
                )}
              >
                {packFacet.value}
              </span>
            }
          >
            <DeliveryKeyValues
              rows={[
                {
                  k: 'Input fingerprint',
                  v: fingerprint ? (
                    <span data-stage-output="auditMetadata" className="block">
                      <span className="block truncate font-cc-mono text-[12px]" title={fingerprint.sha256}>
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
                {
                  k: 'Decision',
                  v: target
                    ? `${target} — confirmed${project.approvedBy ? ` by ${project.approvedBy}` : ''}, in the pack as your statement`
                    : 'Pending sign-off',
                },
                { k: 'Engine', v: modelCard?.engineVersion || APP_VERSION },
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
            <div className="mt-4">
              <CcButton
                variant="ghost"
                density="compact"
                disabled={handoverBlocked}
                busy={auditPackBusy}
                data-handover-audit-pack
                onClick={downloadAuditPack}
                icon={<Download size={16} aria-hidden="true" />}
              >
                {handoverBlocked ? 'Audit pack blocked' : 'Download audit pack'}
              </CcButton>
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
            <p className="m-0 mt-3 cc-text-meta">
              <Link href="/verify-pack" className="text-cc-ink underline underline-offset-2 hover:text-cc-brand-deep">
                Verify an existing audit pack →
              </Link>
            </p>
            <div className="mt-3">
              <CollapsibleAccordion
                title="Audit pack contents"
                badge={handoverBlocked ? 'Blocked' : project.auditMetadata?.inputFingerprint ? 'Available' : 'Partial'}
                badgeSeverity={handoverBlocked || !project.auditMetadata?.inputFingerprint ? 'warning' : 'neutral'}
              >
                <p className="cc-text-meta mb-2 text-cc-ink-muted">
                  ZIP with {AUDIT_PACK_FILES.length} files: {signedFiles} signed, {attestedFiles} with your own statements sealed, and the manifest. No model is called.
                </p>
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
              </CollapsibleAccordion>
            </div>
          </DeliverySection>

          <DeliverySection id="signature-covers" title="What a signature covers" data-signature-covers="">
            <p className="m-0 cc-text-label text-cc-ink-muted">Signed · {signedFiles} files</p>
            <ul className="cc-text-cell mt-1 list-disc pl-4 text-cc-ink">
              {SIGNED_COVERS.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <p className="m-0 mt-3 cc-text-label text-cc-ink-muted">Sealed, not vouched for</p>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink">
              Your own statements — the file cannot be changed unnoticed, but nobody vouches for what it says.
            </p>
            <p className="m-0 mt-3 cc-text-label text-cc-ink-muted">Not signed</p>
            <ul className="cc-text-cell mt-1 list-disc pl-4 text-cc-ink">
              {NOT_SIGNED.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <p className="m-0 mt-3 cc-text-label text-cc-ink-muted">The pack’s own chain</p>
            <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0" data-pack-chain="">
              {packChain.steps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="cc-text-cell text-cc-ink">{s.label}</span>
                  {s.coverage === 'signed' ? (
                    <CcProvenanceChip value="proven" note="signed" />
                  ) : s.coverage === 'attested' ? (
                    <CcProvenanceChip value="confirmed" note="your statement" />
                  ) : (
                    <CcProvenanceChip value="not-determined" />
                  )}
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
              The server signs with HMAC-SHA256, and with Ed25519 where it holds a signing key; the manifest names the key.
              Anyone can check a pack with the offline verifier — no account needed.
            </p>
          </DeliverySection>

          <DeliverySection id="confirmed-by" title="Who confirmed what" data-confirmations="">
            {confirmations.length === 0 ? (
              <p className="m-0 cc-text-cell text-cc-ink-muted">Nobody has confirmed anything on this project yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {confirmations.map((c, i) => (
                  <li key={`${c.what}-${i}`} className="flex flex-col gap-1">
                    <span className="cc-text-cell text-cc-ink">{c.what}</span>
                    <span className="cc-text-meta flex flex-wrap items-center gap-2 text-cc-ink-muted">
                      <span className="break-all">{c.account}</span>
                      {c.at ? <CcDateText value={c.at} format="iso" /> : null}
                      <CcProvenanceChip value={c.provenance} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
              A confirmation is the signed-in account’s self-declaration, not an organisational mandate.
            </p>
          </DeliverySection>

          <section className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc" data-handover-timeline="">
            <CcDisclosure title="Timeline" count={timeline.length} level={2}>
              {timeline.length === 0 ? (
                <p className="cc-text-cell text-cc-ink-muted">No dated event is on record.</p>
              ) : (
                <ol className="flex flex-col gap-2">
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
            </CcDisclosure>
          </section>
        </aside>
      </div>

      {/* Stakeholder slides — the board deck, at its own type scale (D.30). */}
      {deck && (
        <section id="presentation-preview" aria-labelledby="board-presentation-title" className="mb-12 scroll-mt-32">
          <div className="mb-4">
            <h2 id="board-presentation-title" className="cc-text-h2 text-cc-ink">Stakeholder slides</h2>
            <p className="cc-text-cell text-cc-ink-muted mt-1">
              Built from the signed run and the engine’s findings — a preview of what you present.
            </p>
          </div>
          {detection.error && (
            <div className="mb-6">
              <CcMessageStrip state="warning" headline="Findings could not be determined for this source">
                — the slides show no verdict, not a clean one.
                <span className="block mt-1">
                  Check the source in stage 1 and run the analysis again; if it happens again, write to{' '}
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
          <div className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-4 md:p-8 flex justify-center">
            <PresentationViewer data={deck} />
          </div>
        </section>
      )}

      <CcToast open={toast !== null} onDismiss={closeToast}>{toast}</CcToast>
    </div>
  );
}

/**
 * One link of the evidence chain: its place, its name, what is on record, where
 * it comes from and who or what stands behind it, and what it does not cover.
 * The three links with an integrity line of their own (code, documentation,
 * tests) show that line instead of the plain value.
 */
function ChainLinkBox({
  link,
  n,
  projectId,
  children,
}: {
  link: HandoverLink;
  n: number;
  projectId: string;
  children?: ReactNode;
}) {
  const href = link.stage === 'management' ? `/project/${projectId}?view=management` : `/project/${projectId}/${link.stage}`;
  const where = link.stage === 'management' ? 'Management view' : PHASES.find((p) => p.key === link.stage)?.label ?? link.stage;
  return (
    <li
      id={`chain-${link.key}`}
      data-chain-link={link.key}
      data-chain-state={link.state}
      className={clsx(
        'flex min-w-0 flex-col gap-2 rounded-cc-row border bg-cc-surface p-3',
        link.state === 'open' ? 'border-dashed border-cc-neutral-border' : 'border-cc-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="cc-text-label text-cc-ink-muted">{n} · {link.label}</span>
        <Link href={href} className="cc-text-meta shrink-0 text-cc-brand-strong underline underline-offset-2 hover:text-cc-brand-deep">
          {where}
        </Link>
      </div>
      {children ?? (
        <p className={clsx('cc-text-identifier', link.value ? 'text-cc-ink' : 'text-cc-ink-muted')}>
          {link.value ?? 'Nothing on record'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CcProvenanceChip value={link.provenance} note={link.provenanceNote ?? undefined} />
      </div>
      {link.by || link.at ? (
        <p className="cc-text-meta text-cc-ink-muted">
          {link.by ? <span className="break-all">{link.by}</span> : null}
          {link.by && link.at ? ' · ' : null}
          {link.at ? <CcDateText value={link.at} format="iso" /> : null}
        </p>
      ) : null}
      {link.missing ? (
        <p className="cc-text-meta text-cc-ink-muted" data-chain-missing="">
          <span className="text-cc-ink">{link.state === 'on-record' ? 'Limit: ' : link.state === 'stale' ? 'Stale: ' : 'Missing: '}</span>
          {link.missing}
        </p>
      ) : null}
    </li>
  );
}

/** A line of the integrity report inside a chain link: a neutral or warning mark, a title, what it means. */
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
