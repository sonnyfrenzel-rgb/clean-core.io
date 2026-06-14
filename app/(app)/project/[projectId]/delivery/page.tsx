'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { PresentationViewer, PresentationData } from '@/components/PresentationViewer';
import { Download, CheckCircle2, FileCode2, ArrowLeft, Home, RefreshCw, X, Rocket, ShieldCheck, Zap, Layout, Eye, Presentation, AlertCircle, Lock, Briefcase, BookOpen } from 'lucide-react';
import NavigationButtons from '@/components/NavigationButtons';
import JSZip from 'jszip';
import { formatAnalysisToMarkdown, formatDesignToMarkdown, formatDocsToMarkdown, formatBusinessDocsToMarkdown } from '@/lib/markdownFormatter';

import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import { motion } from 'motion/react';
import { clsx } from 'clsx';

const generateDeveloperGuidelines = (project: any) => {
  const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');
  if (isAbapCloud) {
    return `# Developer Extensibility Guidelines - ${project.name}

## Overview
ABAP Cloud / Developer Extensibility model for S/4HANA. All code must align with SAP Clean Core.

## Development Rules
1. **Zero Database Coupling**: Direct SELECT/INSERT/UPDATE on standard tables (VBAK, BSEG, KNA1, etc.) is blocked.
2. **Released API Consumption**: Use released CDS views or standard APIs:
   - VBAK -> Use CDS view 'I_SalesOrder'
   - BSEG -> Use CDS view 'I_JournalEntry'
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
  const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');
  const [loading, setLoading] = useState(true);
  const [documentation, setDocumentation] = useState('');
  const [presentation, setPresentation] = useState('');
  const [isGeneratingPresentation, setIsGeneratingPresentation] = useState(false);
  const [presError, setPresError] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const router = useRouter();
  const projectRef = useRef(project);


  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const generatePresentation = useCallback(async (projectData?: Project) => {
    if (profile?.tier === 'pilot') {
      setShowUpgradeModal(true);
      return null;
    }

    const targetProject = projectData || projectRef.current;
    if (!targetProject) return null;
    
    const docTextToUse = targetProject.documentation;
    if (!docTextToUse) {
      setPresError('Process documentation is required before generating the presentation.');
      return null;
    }

    setIsGeneratingPresentation(true);
    setPresError('');
    try {
      // Simplify data sent to the AI for a faster response.
      const testCount = targetProject.testCases ? targetProject.testCases.length : 0;
      let processSum = "N/A";
      try { processSum = JSON.parse(docTextToUse)?.l1_domain?.name || 'N/A'; } catch(e){}

      const prompt = `Act as an Elite Enterprise Solutions Architect.
Generate an Executive Transformation Summary presentation strictly in JSON format (5 slides max). The phrasing must be highly precise, developer-aligned yet business-comprehensible, completely devoid of corporate fluff, and focused directly on execution, concrete facts, and actionable next steps.

Project Context:
- Project Name: ${targetProject.name}
- Business Domain: ${processSum}
- Quality & Verification: ${testCount} Automated Test Cases generated and successfully validated.
- Transformed Core standard achieved with Side-by-Side Node.js microservice architecture.

CRITICAL PRESENTATION REQUIREMENTS:
1. The presentation must have exactly 5 slides structured logically:
   - Slide 1 (Type: 'title'): Executive Summary title and subtitle.
   - Slide 2 (Type: 'bullets'): "What We Did (Core Transformation)". Explains extracting custom legacy transactions into side-by-side Node.js cloud-native extensions utilizing SAP public OData/REST APIs.
   - Slide 3 (Type: 'split'): "Core Technical Facts". Left side outlines Sandbox & Test Metrics (${testCount} automated sandbox test cases, mapped L1-L4 process blueprints). Right side outlines Platform Service Bindings (XSUAA authentication, Destination connectivity, Event Mesh, and isolated PostgreSQL schemas).
   - Slide 4 (Type: 'quote'): "Strategic Business Value". A brief, highly impactful executive quote summarizing how this transformed extension enables zero-maintenance legacy core upgrades and rapid, modern cloud expansions.
   - Slide 5 (Type: 'bullets'): "Actionable Next Steps". Precise concrete steps (Deploy modular ZIP to BTP/GCP, configure Principal Propagation tunnels, connect Event Mesh pub/sub listeners, expand standard API mappings).
2. The language must be extremely clear and direct, addressing IT experts and business stakeholders alike. Use clear, factual, professional English.
3. Return a JSON object matching the PresentationData format. DO NOT output any markdown tags, wrappers, or text outside the JSON.

JSON Structure:
{
  "title": "Executive Summary: Transformed Modernization",
  "date": "${new Date().toLocaleDateString()}",
  "author": "Clean-Core Transformation Engine",
  "slides": [
    {
      "title": "Slide Title",
      "type": "title|bullets|split|quote",
      "subtitle": "Optional Subtitle",
      "content": ["Bullet point 1 detailing facts", "Bullet point 2 detailing facts"],
      "leftContent": "Details on tests and blueprints",
      "rightContent": "Details on service integrations",
      "quote": "Quote text explaining strategic value",
      "author": "Speaker or role",
      "speakerNotes": "Brief, technical talking points for the presenter"
    }
  ]
}`;
      
      console.log('Generating executive presentation for project:', targetProject.name);
      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true, profile?.geminiApiKey);
      
      const presText = responseText || '';
      setPresentation(presText);
      
      const db = getDb();
      await updateDoc(doc(db, 'projects', projectId as string), {
        presentation: presText,
        status: 'completed'
      });
      return presText;
    } catch (err: unknown) {
      console.error('Presentation generation error:', err);
      setPresError(err instanceof Error ? err.message : String(err) || 'Failed to generate executive presentation.');
      return null;
    } finally {
      setIsGeneratingPresentation(false);
    }
  }, [projectId, profile?.tier, profile?.geminiApiKey]);

  useEffect(() => {
    let isMounted = true;
    const fetchProject = async () => {
      try {
        const db = getDb();
        const docSnap = await getDoc(doc(db, 'projects', projectId as string));
        if (docSnap.exists() && isMounted) {
          const data = docSnap.data();
          const projectData = { id: docSnap.id, ...data } as unknown as Project;
          setProject(projectData);
          
          if (projectData.documentation) {
            setDocumentation(projectData.documentation);
          }
          
          if (projectData.presentation) {
            setPresentation(projectData.presentation);
            if (projectData.status !== 'completed') {
              const db = getDb();
              await updateDoc(doc(db, 'projects', projectId as string), {
                status: 'completed'
              });
            }
          } else if (projectData.documentation) {
            if (profile?.tier !== 'pilot') {
              await generatePresentation(projectData);
            }
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
  }, [projectId, generatePresentation, profile?.tier]);

  const downloadZip = async () => {
    if (profile?.tier === 'pilot') {
      setShowUpgradeModal(true);
      return;
    }
    if (!project) return;
    try {
      const zip = new JSZip();
      const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');

      let isModular = false;
      if (project.generatedCode) {
        try {
          const parsed = JSON.parse(project.generatedCode);
          if (Array.isArray(parsed) && parsed.every(f => typeof f.path === 'string' && typeof f.content === 'string')) {
            isModular = true;
            parsed.forEach(file => {
              zip.file(file.path, file.content);
            });
            console.log(`[ZIP Handover] Successfully bundled ${parsed.length} modular project files.`);
          }
        } catch (e) {
          // Not modular JSON - fallback to monolithic app
        }
      }

      // Bundle structure README.md
      if (isAbapCloud) {
        zip.file("README.md", `# ${project.name} (ABAP Cloud Developer Extensibility)
This bundle was automatically generated by Clean-Core.io.

## abapGit Compliance
This folder structure is fully abapGit-compliant. You can link this repository using the standard abapGit Eclipse ADT plugin or SAP GUI standalone tool to import the objects into your S/4HANA target package.

## Structure
- src/zcl_demo_rap_behavior.clas.abap: RAP custom CRUD behavior implementation class.
- src/zcl_demo_rap_behavior.clas.xml: Behavior class metadata descriptor.
- src/z_demo_rap_ddls.ddls.asddls: ABAP CDS projection data definition view.
- src/z_demo_rap_bdef.bdef.asbdef: Custom RAP Behavior Definition.
- src/z_demo_rap_srvd.srvd.assrvd: RAP Service Definition exposing core capabilities.
- src/z_demo_rap_srvb.srvb.assrvb: RAP Service Binding config (OData V4 Web API).
- src/zcl_demo_rap_test.clas.abap: ABAP Unit Test Class verifying behavior logic.
- src/zcl_demo_rap_test.clas.xml: ABAP Unit Class metadata XML.
- abapgit.xml: Standard abapGit package mapping configuration.
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
        // Add abapGit package configuration XML
        zip.file("abapgit.xml", `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 <asx:values>
  <DATA>
   <START_CLASS>ZCL_DEMO_RAP_TEST</START_CLASS>
   <FOLDER_LOGIC>PREFIX</FOLDER_LOGIC>
   <VERSION>1.0</VERSION>
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
        if (project.documentation) docs.file("process-blueprint.md", formatDocsToMarkdown(project.documentation));
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
    - run: npm ci
    - run: npm run build --if-present
    - run: npm test
`);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      await saveAs(content, `${project.name.replace(/\s+/g, '_')}_DeliveryPackage.zip`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate ZIP package.');
    }
  };

  if (loading) return (
    <div className="animate-in fade-in duration-500">
      <Stepper currentStep={7} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      <div className="h-[60vh] flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Finalizing delivery package...</p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 max-w-7xl mx-auto px-4 md:px-0">
      <Stepper currentStep={7} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      
      <div className="mb-10 md:mb-12 text-center mt-6 md:mt-10">
        <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-green-50 mb-6 md:mb-8 border-4 border-white shadow-xl">
          <Rocket className="w-10 h-10 md:w-12 md:h-12 text-green-600" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-gray-900 mb-4 uppercase">Project Handover</h1>
        <p className="text-base md:text-xl text-gray-500 max-w-3xl mx-auto font-medium px-4">
          The transformation lifecycle is complete. Your modernized Node.js application and comprehensive process documentation are ready for deployment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 md:gap-8 mb-16">
        {/* ZIP Package Download */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10 flex flex-col items-center text-center hover:shadow-xl hover:border-green-500/20 transition-all group overflow-hidden">
          <div className="bg-green-50 p-5 rounded-2xl mb-6 md:mb-8 group-hover:scale-110 transition-transform">
            <FileCode2 className="w-8 h-8 md:w-10 md:h-10 text-green-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-3 tracking-tight uppercase">Delivery Bundle</h2>
          <p className="text-gray-500 mb-8 md:mb-10 flex-grow text-xs md:text-sm leading-relaxed">
            One-Click ZIP Bundle containing your Source Code, Tests, Dependencies (package.json) and documentation.
          </p>
          <div className="w-full relative group/tooltip">
            <button 
              onClick={downloadZip}
              className={clsx(
                "w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl transition-all font-bold shadow-lg uppercase tracking-widest text-xs md:text-sm",
                profile?.tier === 'pilot' ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-[#006b2c] text-white hover:bg-[#00873a] shadow-green-600/20"
              )}
            >
              {profile?.tier === 'pilot' ? (
                <><Lock size={18} /> Basic Restricted</>
              ) : (
                <><Download size={20} /> Download Bundle</>
              )}
            </button>
            {profile?.tier === 'pilot' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                ZIP Package downloads are reserved for <span className="text-green-400 font-bold uppercase tracking-widest">Starter</span> & Premium users.
              </div>
            )}
          </div>
        </div>

        {/* Executive Presentation */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10 flex flex-col items-center text-center hover:shadow-xl hover:border-purple-500/20 transition-all group overflow-hidden">
          <div className="bg-purple-50 p-5 rounded-2xl mb-6 md:mb-8 group-hover:scale-110 transition-transform">
            <Presentation className="w-8 h-8 md:w-10 md:h-10 text-purple-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-3 tracking-tight uppercase">Stakeholder briefing</h2>
          <p className="text-gray-500 mb-8 md:mb-10 flex-grow text-xs md:text-sm leading-relaxed">
            Management-ready presentation summarizing the transformation, ROI, and architecture.
          </p>
          
          <div className="w-full relative group/tooltip">
            {profile?.tier === 'pilot' ? (
              <button 
                onClick={() => setShowUpgradeModal(true)}
                className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black flex items-center justify-center gap-2 uppercase tracking-widest text-xs md:text-sm"
              >
                <Lock size={18} /> Basic Locked
              </button>
            ) : isGeneratingPresentation ? (
              <div className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-400 px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-sm">
                <RefreshCw className="w-5 h-5 animate-spin" /> Generating...
              </div>
            ) : presError ? (
              <div className="w-full flex flex-col items-center gap-2">
                <p className="text-[10px] text-red-500 font-bold uppercase mb-2 tracking-widest">{presError}</p>
                <button 
                  onClick={() => generatePresentation(undefined)}
                  className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 px-8 py-3 rounded-2xl hover:bg-red-100 transition-all font-bold text-xs uppercase tracking-[0.2em]"
                >
                  <RefreshCw size={16} /> Retry AI
                </button>
              </div>
            ) : presentation ? (
              <button 
                onClick={() => {
                  document.getElementById('presentation-preview')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white px-8 py-4 rounded-2xl hover:bg-purple-700 transition-all font-bold shadow-lg shadow-purple-600/10 uppercase tracking-widest text-xs"
              >
                <Eye size={20} /> View Slides
              </button>
            ) : (
              <button 
                onClick={() => generatePresentation(undefined)}
                disabled={!documentation}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white px-8 py-4 rounded-2xl hover:bg-purple-700 transition-all font-bold shadow-lg shadow-purple-600/10 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
              >
                <RefreshCw size={20} /> Generate summary
              </button>
            )}
            {profile?.tier === 'pilot' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                AI Briefings are a <span className="text-green-400 font-bold uppercase tracking-widest">Starter</span> feature.
              </div>
            )}
          </div>
        </div>

        {/* Quality Assurance & Test Cases */}
        <div className="bg-gray-900 rounded-3xl shadow-2xl p-6 md:p-10 flex flex-col items-start text-left relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform hidden md:block">
            <ShieldCheck className="w-32 h-32 text-white" />
          </div>
          <div className="bg-white/10 p-4 rounded-xl mb-6 md:mb-8">
            <Zap className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white mb-3 tracking-tight uppercase">Integrity Report</h2>
          <ul className="space-y-4 mb-8 md:mb-10 flex-grow w-full">
            <li className="flex items-start gap-3 text-gray-400 text-xs md:text-sm font-medium">
              <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-white block font-bold">
                  {isAbapCloud ? 'abapGit Repo Layout' : 'Transformed CAP Structure'}
                </span>
                <span className="text-[10px] text-gray-400">
                  {isAbapCloud 
                    ? 'Handover: Modular ABAP Cloud packages generated'
                    : 'Handover: Modular TypeScript package generated'
                  }
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 text-gray-400 text-xs md:text-sm font-medium">
              <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-white block font-bold">
                  {isAbapCloud 
                    ? `${project?.testCases?.length || 10} Automated ABAP Unit Tests`
                    : `${project?.testCases?.length || 10} Automated Sandbox Tests`
                  }
                </span>
                <span className="text-[10px] text-gray-400">
                  {isAbapCloud 
                    ? 'ADT: Clean AUnit local test doubles verified'
                    : 'Sandbox: TAP-reporter unit tests verified'
                  }
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 text-gray-400 text-xs md:text-sm font-medium">
              <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-white block font-bold">{project?.coverageEstimate?.percentage || 92}% Estimated Coverage</span>
                <span className="text-[10px] text-gray-400">
                  {isAbapCloud
                    ? 'Quality: Restricted clean ABAP syntax check compliant'
                    : 'Quality: Strongly-typed model boundaries compliant'
                  }
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 text-gray-400 text-xs md:text-sm font-medium">
              <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-white block font-bold">Enterprise BPMN Blueprint</span>
                <span className="text-[10px] text-gray-400">Docs: Mapped Level 1-4 architectural specs</span>
              </div>
            </li>
          </ul>
          <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/10 mt-4">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">QA Status</span>
            <span className="text-green-400 font-bold flex items-center gap-2 text-xs md:text-sm uppercase tracking-tighter">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> Ready for Deployment
            </span>
          </div>
        </div>

        {/* Business SOP & Compliance Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10 flex flex-col items-center text-center hover:shadow-xl hover:border-blue-500/20 transition-all group overflow-hidden">
          <div className="bg-blue-50 p-5 rounded-2xl mb-6 md:mb-8 group-hover:scale-110 transition-transform">
            <Briefcase className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-3 tracking-tight uppercase">SOP & Compliance</h2>
          <p className="text-gray-500 mb-8 md:mb-10 flex-grow text-xs md:text-sm leading-relaxed">
            Standard Operating Procedures (SOP), RACI Matrix, and Audit Controls compliance documentation (Level 5).
          </p>
          
          <div className="w-full relative group/tooltip">
            {profile?.tier === 'pilot' ? (
              <button 
                onClick={() => setShowUpgradeModal(true)}
                className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black flex items-center justify-center gap-2 uppercase tracking-widest text-xs md:text-sm"
              >
                <Lock size={18} /> Basic Locked
              </button>
            ) : project?.businessDocumentation ? (
              <button 
                onClick={() => {
                  const blob = new Blob([formatBusinessDocsToMarkdown(project.businessDocumentation || '')], { type: "text/markdown;charset=utf-8" });
                  const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                  saveAs(blob, `${fileName}_BusinessDocumentation.md`);
                }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-600/10 uppercase tracking-widest text-xs"
              >
                <Download size={20} /> Export Markdown
              </button>
            ) : (
              <button 
                disabled
                className="w-full bg-gray-50 text-gray-400 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-gray-150 uppercase tracking-widest text-xs cursor-not-allowed"
              >
                <AlertCircle size={16} /> Not Generated
              </button>
            )}
            {profile?.tier === 'pilot' ? (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                SOP Reports are reserved for <span className="text-green-400 font-bold uppercase tracking-widest">Starter</span> & Premium users.
              </div>
            ) : !project?.businessDocumentation && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none text-center">
                Go to the <Link href={`/project/${projectId}/documentation`} className="text-blue-400 hover:underline">Documentation Stage</Link> to generate Level 5 SOPs.
              </div>
            )}
          </div>
        </div>

        {/* Developer Guidelines Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10 flex flex-col items-center text-center hover:shadow-xl hover:border-green-500/20 transition-all group overflow-hidden">
          <div className="bg-green-50 p-5 rounded-2xl mb-6 md:mb-8 group-hover:scale-110 transition-transform">
            <BookOpen className="w-8 h-8 md:w-10 md:h-10 text-green-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-3 tracking-tight uppercase">Developer Guide</h2>
          <p className="text-gray-500 mb-8 md:mb-10 flex-grow text-xs md:text-sm leading-relaxed">
            Technical guidelines, linter configurations, and Clean Core rule sets for development teams.
          </p>
          
          <div className="w-full relative">
            <button 
              onClick={() => {
                const blob = new Blob([generateDeveloperGuidelines(project)], { type: "text/markdown;charset=utf-8" });
                const fileName = (project?.name || 'Project').replace(/\s+/g, '_');
                saveAs(blob, `${fileName}_Developer_Guidelines.md`);
              }}
              className="w-full flex items-center justify-center gap-2 bg-[#006b2c] text-white px-8 py-4 rounded-2xl hover:bg-[#00873a] transition-all font-bold shadow-lg shadow-green-600/10 uppercase tracking-widest text-xs md:text-sm"
            >
              <Download size={20} /> Export Guide
            </button>
          </div>
        </div>
      </div>
      
      {/* Presentation Preview */}
      {presentation && (
        <div id="presentation-preview" className="mb-20 animate-in slide-in-from-bottom-8 duration-1000 px-2 md:px-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase">Board Presentation</h2>
              <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">Interactive Strategic Map</p>
            </div>
            <button 
              onClick={() => generatePresentation(undefined)}
              disabled={isGeneratingPresentation}
              className="flex items-center justify-center gap-2 text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 px-6 py-3 rounded-xl transition-all uppercase tracking-widest shadow-lg"
            >
              <RefreshCw className={`w-3 h-3 ${isGeneratingPresentation ? 'animate-spin' : ''}`} /> Regenerate Slides
            </button>
          </div>
          <div className="bg-gray-50 rounded-[2rem] md:rounded-[3rem] p-4 md:p-12 border border-gray-100 shadow-inner flex justify-center">
            {(() => {
              try {
                const parsedData = JSON.parse(presentation);
                return <PresentationViewer data={parsedData} />;
              } catch (e) {
                return (
                  <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-100 w-full max-w-5xl">
                    <p className="text-red-600 font-bold mb-2">Presentation Preview Unavailable</p>
                    <p className="text-red-500 text-sm">The generated presentation data is malformed. Please try regenerating it.</p>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-xl z-[110] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowUpgradeModal(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-xl w-full shadow-2xl relative" 
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors">
              <X size={24} className="text-gray-400" />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mb-8 shadow-inner shadow-green-100">
                <Rocket size={40} className="text-green-600" />
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-gray-950 tracking-tighter mb-4 uppercase">Modernize Your Assets</h2>
              <p className="text-gray-600 font-medium mb-10 leading-relaxed text-sm md:text-base">
                Downloading your production bundle and generating interactive executive briefings is a **Starter** tier feature. Complete your transformation journey now.
              </p>
              
              <div className="w-full bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-10 text-left">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Starter Features</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-xs md:text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Full Codebase ZIP Exports
                  </li>
                  <li className="flex items-center gap-3 text-xs md:text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> AI-Driven Presentation Engine
                  </li>
                  <li className="flex items-center gap-3 text-xs md:text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Enterprise BPMN 2.0 Mapping
                  </li>
                </ul>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <button 
                  onClick={() => router.push('/settings')}
                  className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-600/30 transition-all uppercase tracking-widest text-xs"
                >
                  Upgrade Now
                </button>
                <button 
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all uppercase tracking-widest text-xs"
                >
                  Return to Page
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex justify-center pb-20">
        <button 
          onClick={() => router.push('/dashboard')}
          className="group flex items-center gap-3 bg-white border border-slate-200 px-10 py-5 rounded-full font-black text-slate-900 uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm text-xs"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

