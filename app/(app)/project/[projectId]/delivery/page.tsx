'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
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
import { Download, CheckCircle2, FileCode2, Eye, Presentation, AlertCircle, Briefcase, BookOpen, Gauge, FileText } from 'lucide-react';
import clsx from 'clsx';
import StageFooter from '@/components/StageFooter';
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
SAP BTP Side-by-Side Extensibility using CAP (Node.js/TypeScript). S/4HANA core remains decoupled.

## Development Rules
1. **Decoupled Architecture**: Direct DB access is blocked. Integrate via released OData APIs through BTP Destination services.
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
  const router = useRouter();
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
        zip.file("README.md", `# ${project.name} (SAP BTP Side-by-Side Decoupled Extension)
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
      setToast('Audit Pack downloaded');
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
      <StageHeader projectName={project?.name} stage="delivery" />
      <CcSkeleton shape="cards" label="Finalizing delivery package..." count={4} />
    </div>
  );

  if (!project) return (
    <div className="max-w-7xl mx-auto px-4 md:px-0">
      <StageProgress steps={phases} current="delivery" projectId={projectId as string} />
      <StageHeader stage="delivery" />
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

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-0">
      {/* Rendered here as well as in the loading state — it used to exist only
          there, and disappeared as soon as the page had loaded. */}

      <StageProgress steps={phases} current="delivery" projectId={projectId as string} />

      {/* The lead used to read "The transformation lifecycle is complete … ready
          for deployment" on every project, including one with nothing but an
          analysis run behind it. Block D, D.19: the title is the stage's name
          from `PHASES`, left-aligned like every other stage. */}
      <StageHeader projectName={project?.name} stage="delivery">
        {/* `proven`, not `done`. The material can all be present while the test
            run behind the verdicts never happened — `testCases[].status` is
            client-writable and used to be read as an execution (QA full review
            of a19945ef01dc). In that case the lead falls through to the phase's
            own detail, which says so. */}
        {deliveryPhase.proven
          ? 'Code, documentation and a passing test run are on record. Whether to deploy remains an architect’s decision, not this page’s.'
          : handoverBlocked
            ? 'What is on record for handover, and what is not yet.'
            : `What is on record for handover, and what is not yet. ${deliveryPhase.detail}`}
      </StageHeader>

      <StaleNotice
        title={`Handover blocked — built for ${previousBasis(project)}`}
        reasons={blockers.map((b) => `${b.charAt(0).toUpperCase()}${b.slice(1)} — regenerate it for the current ${previousBasis(project) === 'a previous target profile' ? 'target profile' : 'source'} before handing over.`)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 items-stretch">
        {/* Left: the four deliverables, 2x2 */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <DeliverableCard
            icon={<FileCode2 size={20} aria-hidden="true" />}
            title="Delivery Bundle"
            lead="One-Click ZIP Bundle containing your Source Code, Tests, Dependencies (package.json) and documentation."
          >
            <CcButton
              variant="primary"
              density="cozy"
              onClick={downloadZip}
              disabled={handoverBlocked}
              busy={bundleBusy}
              data-handover-bundle
              icon={<Download size={16} aria-hidden="true" />}
            >
              {handoverBlocked ? 'Blocked — see above' : 'Download Bundle'}
            </CcButton>
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
          </DeliverableCard>

          <DeliverableCard
            icon={<Presentation size={20} aria-hidden="true" />}
            title="Stakeholder briefing"
            lead="Management-ready presentation summarizing the transformation, the measured findings and the architecture — no savings figure."
          >
            {analysisStale ? (
              <p className="cc-text-cell text-cc-ink-muted" data-delivery-deck-blocked>
                Not available — the analysis is from a previous source. Re-run it in stage 1.
              </p>
            ) : deck ? (
              <CcButton
                variant="secondary"
                density="cozy"
                onClick={() => {
                  document.getElementById('presentation-preview')?.scrollIntoView({ behavior: 'smooth' });
                }}
                icon={<Eye size={16} aria-hidden="true" />}
              >
                View Slides
              </CcButton>
            ) : (
              <p className="cc-text-cell text-cc-ink-muted">No slides available</p>
            )}
          </DeliverableCard>

          <DeliverableCard
            icon={<Briefcase size={20} aria-hidden="true" />}
            title="SOP & Compliance"
            lead="Standard Operating Procedures (SOP), RACI Matrix, and Audit Controls compliance documentation (Level 5)."
          >
            {project.businessDocumentation ? (
              <CcButton
                variant="secondary"
                density="cozy"
                // Blocked with the bundle that carries the same file: this
                // documentation is not tracked by digest of its own, so a
                // handover blocked for a previous source blocks it too.
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
              <>
                <CcButton density="cozy" disabled icon={<AlertCircle size={16} aria-hidden="true" />}>
                  Not Generated
                </CcButton>
                {/* Said beside the button, not in a hover tooltip: a phone and a
                    keyboard have no hover to reach it with. */}
                <p className="cc-text-cell text-cc-ink-muted">
                  Go to the <Link href={`/project/${projectId}/documentation`} className={TEXT_LINK}>{DOCUMENTATION_LABEL} stage</Link> to generate Level 5 SOPs.
                </p>
              </>
            )}
          </DeliverableCard>

          <DeliverableCard
            icon={<BookOpen size={20} aria-hidden="true" />}
            title="Developer Guide"
            lead="Technical guidelines, linter configurations, and Clean Core rule sets for development teams."
          >
            <CcButton
              variant="secondary"
              density="cozy"
              onClick={() => {
                const blob = new Blob([generateDeveloperGuidelines(project)], { type: "text/markdown;charset=utf-8" });
                const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                saveAs(blob, `${fileName}_Developer_Guidelines.md`);
              }}
              icon={<Download size={16} aria-hidden="true" />}
            >
              Export Guide
            </CcButton>
          </DeliverableCard>
        </div>

        {/* Right: the integrity report. It used to be the one dark panel on the
            page; §1.1 keeps dark surfaces for code, so it is a card like the
            others and the words carry the weight. */}
        <section
          aria-labelledby="integrity-report-title"
          className="lg:col-span-1 flex flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc p-6"
        >
          <h2 id="integrity-report-title" className="cc-text-h2 text-cc-ink mb-4">Integrity Report</h2>
          <ul className="space-y-4 mb-6 flex-grow w-full">
            <li className="flex items-start gap-3">
              {/* Roadmap 0.2 (UX-027). This row reported generated code with
                  the same green tick the rows below use for tests that
                  actually passed — while its own subtitle said "not compiled
                  or tested". Existence is not verification, and an Integrity
                  Report is exactly the screenshot that ends up in a steering
                  committee. The warning colour for "nothing there" stays, and
                  mere existence is neutral rather than green. */}
              {hasGeneratedCode && !codeStale ? (
                <FileCode2 size={18} aria-hidden="true" data-integrity-icon="present" className="text-cc-ink-muted mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span data-stage-output={hasGeneratedCode ? 'generatedCode' : undefined} className="cc-text-h3 text-cc-ink block">
                  {!hasGeneratedCode
                    ? 'No transformed code generated'
                    : isAbapCloud ? 'abapGit Repo Layout' : 'Transformed CAP Structure'}
                </span>
                <span className="cc-text-meta font-medium text-cc-ink-muted block mt-1">
                  {!hasGeneratedCode
                    ? 'Run stage 3 to produce the code this line reports on'
                    : codeStale
                      ? `Generated from ${previousBasis(project)} — regenerate in stage 3`
                      : isAbapCloud
                      ? 'Handover: ABAP Cloud packages generated — not compiled or tested'
                      : 'Handover: TypeScript package generated — not compiled or tested'}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              {/* Green only when an execution is on record. The condition has
                  been narrowed twice: it once followed the number of cases
                  *generated*, then every case carrying a pass — which is
                  `testingPhase.done`, and `testCases[].status` is in the
                  client update allowlist of `firestore.rules`. A row of
                  `Passed` strings nobody executed therefore put a green tick
                  here beside "every generated test returned a pass". Green
                  is `proven` on this page as it is on the stepper and the rail
                  (`phaseTone`, `lib/workflow-steps.ts`). */}
              {testingPhase.proven ? (
                <CheckCircle2 size={18} aria-hidden="true" className="text-cc-success mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" className="text-cc-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="cc-text-h3 text-cc-ink block" data-delivery-testing data-stage-output={testCaseCount > 0 ? 'testCases' : undefined}>
                  {testCaseCount === 0
                    ? 'No test suite generated'
                    : testsPassed + testsFailed === 0
                      ? `Test draft: ${testCaseCount} ${isAbapCloud ? 'ABAP Unit' : 'Sandbox'} tests, no run on record`
                      : `${testsPassed} of ${testCaseCount} ${isAbapCloud ? 'ABAP Unit' : 'Sandbox'} tests passed`}
                </span>
                <span className="cc-text-meta font-medium text-cc-ink-muted block mt-1">
                  {testCaseCount === 0
                    ? 'Nothing to verify'
                    : testingPhase.state === 'stale'
                      ? `Written for ${previousBasis(project)} — regenerate in stage 5`
                      : testsPassed === testCaseCount
                      ? (!testingPhase.proven
                          ? 'Marked as passed — no test run is on record behind these verdicts. Run the suite in stage 5.'
                          : isAbapCloud
                          ? 'ADT: every generated test returned a pass'
                          : 'Sandbox: every generated test returned a pass')
                      : [
                          testsFailed > 0 ? `${testsFailed} failed` : null,
                          testsSimulated > 0 ? `${testsSimulated} simulated only` : null,
                          testsConnectivity > 0 ? `${testsConnectivity} connectivity checks — not tests of the code` : null,
                          testsWithoutVerdict > 0 ? `${testsWithoutVerdict} without a result` : null,
                        ].filter(Boolean).join(' · ') || 'Not run yet'}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              {/* Neutral, like the code row above it: the figure is the
                  generator's estimate, and a green check beside "not measured"
                  read as a measurement (UX review of b88c77b, fc15ffd1018a). */}
              {coveragePercentage !== undefined && testingPhase.state !== 'stale' ? (
                <Gauge size={18} aria-hidden="true" data-integrity-icon="estimate" className="text-cc-ink-muted mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span data-stage-output={coveragePercentage !== undefined ? 'coverageEstimate' : undefined} className="cc-text-h3 text-cc-ink block">{coveragePercentage !== undefined ? `${coveragePercentage}% Estimated Coverage` : 'Coverage not estimated'}</span>
                {/* "Restricted clean ABAP syntax check compliant" and "Strongly-
                    typed model boundaries compliant" were printed here with no
                    check behind either (CR-16). The figure is the generator's
                    own estimate, and says so — since D.19 with the provenance
                    chip as well, because the test generator is a model stage. */}
                {coveragePercentage !== undefined && testingPhase.state === 'stale' ? (
                  <span data-coverage-stale className="cc-text-meta font-medium text-cc-ink-muted block mt-1">
                    Estimated for a previous source — regenerate in stage 5
                  </span>
                ) : coveragePercentage !== undefined ? (
                  <span data-coverage-provenance className="flex flex-wrap items-center gap-2 mt-1">
                    <CcProvenanceChip value="proposed" />
                    <span className="cc-text-meta font-medium text-cc-ink-muted">Estimated by the test generator — not measured</span>
                  </span>
                ) : (
                  <span className="cc-text-meta font-medium text-cc-ink-muted block mt-1">No estimate was produced with the test suite</span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-3">
              {/* A blueprint that exists and is current — present, not verified;
                  the same reading as the code row. */}
              {hasDocumentation && !docsStale ? (
                <FileText size={18} aria-hidden="true" data-integrity-icon="blueprint" className="text-cc-ink-muted mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" data-integrity-icon="missing" className="text-cc-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span data-stage-output={hasDocumentation ? 'documentation' : undefined} className="cc-text-h3 text-cc-ink block">
                  {!hasDocumentation
                    ? 'No blueprint generated'
                    : documentationFromCode
                      ? 'Process documentation, read from the code'
                      : 'Process blueprint, earlier form'}
                </span>
                <span className="cc-text-meta font-medium text-cc-ink-muted block mt-1">
                  {!hasDocumentation
                    ? 'Run stage 4 to produce the documentation this line reports on'
                    : docsStale
                      ? `Written for ${previousBasis(project)} — regenerate in stage 4`
                      : documentationFromCode
                        ? 'Every statement with its lines; owner, roles, KPIs and duration not determined'
                        : 'Written by a language model from 1,000-character slices — read it again from the code in stage 4'}
                </span>
              </div>
            </li>
          </ul>
          <div className="w-full rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
            <span className="cc-text-label text-cc-ink-muted block mb-1">QA Status</span>
            {/* "Ready for Deployment" was unconditional, next to a pulsing green
                dot, on a page that had just marked the project completed for
                having been opened. It now names what is missing instead of
                asserting a readiness nobody established. */}
            {/* From the delivery phase of the shared contract. "All artefacts
                present" used to go green on a generated test suite nobody had
                run — the dashboard's "Testing & QA (85%)" in another form. */}
            {deliveryPhase.done ? (
              <span className={clsx('cc-text-h3 flex items-center gap-2', STATE_CLASSES.success.text)}>
                <span aria-hidden="true" className={clsx('w-2 h-2 rounded-full', STATE_CLASSES.success.mark)} /> Ready to hand over
              </span>
            ) : (
              <span className={clsx('cc-text-h3 flex items-center gap-2', STATE_CLASSES.warning.text)}>
                <span aria-hidden="true" className={clsx('w-2 h-2 rounded-full', STATE_CLASSES.warning.mark)} /> Incomplete
              </span>
            )}
            <span className="cc-text-meta font-medium text-cc-ink-muted block mt-2">
              {deliveryPhase.detail}
            </span>
          </div>
        </section>
      </div>

      {/* Compliance Audit Pack — collapsed accordion, pilot-accessible */}
      {project && (
        <div className="mb-12">
          <CollapsibleAccordion
            title="Compliance Audit Pack"
            badge={handoverBlocked ? 'Blocked' : project.auditMetadata?.inputFingerprint ? 'Available' : 'Partial'}
            badgeSeverity={handoverBlocked || !project.auditMetadata?.inputFingerprint ? 'warning' : 'neutral'}
            tooltip="Exportable evidence package for architecture governance, compliance reviews, and audit documentation."
          >
            <div className="space-y-4">
              {/* Audit Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Input Fingerprint */}
                <div className={AUDIT_FACT}>
                  <span className="cc-text-label text-cc-ink-muted block mb-1">Input Fingerprint</span>
                  {project.auditMetadata?.inputFingerprint ? (
                    <>
                      <span data-stage-output="auditMetadata" className="cc-text-identifier font-cc-mono text-cc-ink block truncate" title={project.auditMetadata.inputFingerprint.sha256}>
                        SHA-256: {project.auditMetadata.inputFingerprint.sha256.substring(0, 16)}…
                      </span>
                      <span className="cc-text-meta font-medium text-cc-ink-muted">
                        {project.auditMetadata.inputFingerprint.lineCount} lines · {project.auditMetadata.inputFingerprint.objectType} · {project.auditMetadata.inputFingerprint.fileName}
                      </span>
                    </>
                  ) : (
                    <span className="cc-text-meta font-medium text-cc-ink-muted">Re-analyze to generate fingerprint</span>
                  )}
                </div>

                {/* Architecture Decision */}
                <div className={AUDIT_FACT}>
                  <span className="cc-text-label text-cc-ink-muted block mb-1">Architecture Decision</span>
                  <span className="cc-text-identifier text-cc-ink block">
                    {project.targetArchitecture
                      ? { rap: 'In-App RAP', cap: 'Side-by-Side CAP', integration: 'Integration Suite', event: 'Event Mesh', retire: 'Retire' }[project.targetArchitecture] || project.targetArchitecture
                      : project.extensibilityRoute || '—'}
                  </span>
                  <span className="cc-text-meta font-medium text-cc-ink-muted">
                    {project.approvedByArchitect
                      ? `Approved${project.approvedBy ? ` by ${project.approvedBy}` : ''}`
                      : 'Pending architect sign-off'}
                  </span>
                </div>

                {/* Engine Metadata */}
                <div className={AUDIT_FACT}>
                  <span className="cc-text-label text-cc-ink-muted block mb-1">Engine & Model</span>
                  <span className="cc-text-identifier text-cc-ink block">
                    {project.auditMetadata?.modelCard?.engineVersion || APP_VERSION}
                  </span>
                  {/* Roadmap 1.2 — the default model id used to be printed here
                      whenever the card named none, so a run no model took part
                      in was reported as a Gemini run under the audit heading. */}
                  <span className="cc-text-meta font-medium text-cc-ink-muted">
                    {project.auditMetadata?.modelCard?.model
                      ? `${project.auditMetadata.modelCard.model} · ${project.auditMetadata.modelCard.byokUsed ? 'BYOK' : 'Platform Key'}`
                      : project.auditMetadata?.modelCard?.modelParticipation === 'none'
                        ? 'No model — deterministic evidence only'
                        : project.auditMetadata?.modelCard?.modelParticipation === 'narrative'
                          ? 'Narrative origin not established'
                          : 'Model not recorded'}
                  </span>
                </div>
              </div>

              {/* Export Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <CcButton
                  variant="primary"
                  disabled={handoverBlocked}
                  busy={auditPackBusy}
                  data-handover-audit-pack
                  onClick={downloadAuditPack}
                  icon={<Download size={16} aria-hidden="true" />}
                >
                  {handoverBlocked ? 'Audit Pack blocked' : 'Download Audit Pack'}
                </CcButton>
                <span className="cc-text-meta font-medium text-cc-ink-muted">
                  ZIP contains: executive summary, input fingerprint, decision record, findings, model card, known limitations, and signed manifest.
                </span>
              </div>
              {auditPackError && (
                <CcMessageStrip
                  state="error"
                  headline="The Audit Pack could not be generated."
                  announce
                  actions={<CcButton onClick={downloadAuditPack}>Try again</CcButton>}
                >
                  {auditPackError}
                </CcMessageStrip>
              )}
              <div className="pt-1">
                <Link href="/verify-pack" className={clsx(TEXT_LINK, 'cc-text-meta')}>
                  Verify an existing Audit Pack →
                </Link>
              </div>
            </div>
          </CollapsibleAccordion>
        </div>
      )}

      {/* Presentation Preview */}
      {deck && (
        <section id="presentation-preview" aria-labelledby="board-presentation-title" className="mb-12">
          <div className="mb-4">
            <h2 id="board-presentation-title" className="cc-text-h2 text-cc-ink">Board Presentation</h2>
            <p className="cc-text-label text-cc-ink-muted mt-1">Interactive Strategic Map</p>
          </div>
          {detection.error && (
            <div className="mb-6">
              <CcMessageStrip state="warning" headline="Findings could not be determined for this source">
                — the deck shows no verdict, not a clean one.
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

      <div className="flex justify-center pb-20">
        <CcButton density="cozy" onClick={() => router.push('/dashboard')}>
          Return to Dashboard
        </CcButton>
      </div>

      <CcToast open={toast !== null} onDismiss={closeToast}>{toast}</CcToast>
    </div>
  );
}

/** A fact of the audit pack: a quiet tile on the muted surface. */
const AUDIT_FACT = 'rounded-cc-row border border-cc-line bg-cc-surface-muted p-3';

/**
 * One deliverable of the handover — a light card with a neutral mark, the
 * title, what it contains, and its action at the foot. The four used to be
 * four colours (green, purple, blue, green) with an icon that grew on hover;
 * the colour said nothing the title did not.
 */
function DeliverableCard({
  icon,
  title,
  lead,
  children,
}: {
  icon: ReactNode;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc p-6">
      <div className="flex items-center gap-2 text-cc-ink-muted mb-2">
        {icon}
        <h2 className="cc-text-h2 text-cc-ink">{title}</h2>
      </div>
      <p className="cc-text-cell text-cc-ink-muted mb-6 flex-grow">{lead}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
