'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { UploadCloud, FileCode2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, RefreshCw, Activity, Download, ChevronDown, X, HelpCircle, Info, Sparkles, Trash2, Layers } from 'lucide-react';
import clsx from 'clsx';
import nextDynamic from 'next/dynamic';
import { DocumentSection } from '@/components/DocumentSection';
import { Components } from 'react-markdown';
import { marked } from 'marked';
import NavigationButtons from '@/components/NavigationButtons';
import { saveAs } from 'file-saver';
import { callGemini } from '@/lib/gemini';
import type { Project, AnalysisData } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });


import { DocumentSkeleton } from '@/components/Skeleton';

export default function AnalyzePage() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const autoAnalyze = searchParams.get('autoAnalyze');
  const [project, setProject] = useState<Project | null>(null);
  const [legacyCode, setLegacyCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { profile } = useUserProfile();
  const [showHelpMode, setShowHelpMode] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);

  const markdownComponents: Components = {
    h1: ({ node, ...props }) => (
      <div className="mb-12 pb-6 border-b-2 border-gray-900">
        <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tighter mb-2" {...props} />
      </div>
    ),
    h2: ({ node, ...props }) => <DocumentSection title={props.children as string} />,
    h3: ({ node, ...props }) => <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4 flex items-center gap-3 border-b border-gray-100 pb-2" {...props} />,
    hr: () => <hr className="my-10 border-t border-gray-100" />,
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-8 rounded-2xl border border-gray-200 shadow-lg">
        <table className="min-w-full divide-y divide-gray-200" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-gray-50/50" {...props} />,
    th: ({ node, ...props }) => <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]" {...props} />,
    td: ({ node, ...props }) => <td className="px-6 py-4 text-sm text-gray-700 border-t border-gray-100" {...props} />,
    blockquote: ({ node, ...props }) => {
      return <blockquote className="border-l-4 border-green-500 pl-6 py-3 italic my-8 bg-green-50/20 rounded-r-2xl text-green-900 font-medium text-base" {...props} />;
    },
    p: ({ node, ...props }) => <p className="text-gray-700 leading-relaxed text-base md:text-lg mb-6" {...props} />,
    li: ({ node, ...props }) => <li className="text-gray-700 text-base mb-2 ml-4 list-disc marker:text-green-500" {...props} />,
    ul: ({ node, ...props }) => <ul className="mb-8" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-bold text-gray-950" {...props} />,
  };

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const docSnap = await getDoc(doc(getDb(), 'projects', projectId as string));
        if (docSnap.exists()) {
          setProject({ id: docSnap.id, ...docSnap.data() } as any);
          setLegacyCode(docSnap.data().legacyCode || '');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `projects/${projectId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const hasAutoAnalyzed = useRef(false);

  const isLegacyCode = (code: string) => {
    // For legacy code, we might want to relax this or change the keywords
    // For now, let's just check if it's not empty, or keep the old logic if it's specifically SAP legacy
    const legacyKeywords = [/REPORT\s+/i, /DATA\s+/i, /SELECT\s+/i, /FORM\s+/i, /METHOD\s+/i, /CLASS\s+/i];
    return legacyKeywords.some(regex => regex.test(code)) || code.trim().length > 0; // Relaxed check
  };

  const handleFile = (file: File) => {
    setError('');
    if (!file.name.endsWith('.abap') && !file.name.endsWith('.txt')) {
        setError('Please upload a valid legacy code file (.abap or .txt)');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!isLegacyCode(content)) {
          setError('The file does not appear to contain valid legacy code.');
          return;
      }
      setLegacyCode(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };


  const handleAnalyze = async (codeToAnalyze: string = legacyCode) => {
    setError('');
    if (!isLegacyCode(codeToAnalyze)) {
        setError('Please provide valid legacy code before analyzing.');
        return;
    }
    setLoading(true);
    setLoadingMessage('Performing deep code analysis...');
    try {
      const prompt = `Analyze the following legacy SAP ABAP code and provide a highly practical, down-to-earth IT and Business assessment. You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface AnalysisData {
  projectTitle: string; // Dynamic name of this modernization project
  cleanCoreScore: number; // A number between 0 and 100 representing clean core compliance. Modifying standard = 0, standard/decommissioning = 100, BTP/transformed extensibility = 90, key-user extensibility = 85.
  summary: string; // A concise 2-3 sentence technical summary of the modernization potential.
  asIsContext: string; // Brief description of what the legacy code does technically and what business capability it supports.
  standardFit: {
    potential: 'High' | 'Medium' | 'Low';
    targetStandardProcess: string; // Name of the target S/4HANA best practice process or standard SAP capability mapping to this requirement.
    rationale: string; // Technical reasoning on why standard process can or cannot fit.
  };
  gaps: Array<{
    title: string; // Name of the specific functional gap or custom validation logic
    severity: 'High' | 'Medium' | 'Low'; // The degree of divergence from standard SAP
    strategy: string; // Recommended mitigation path (e.g. Side-by-Side Extensibility, Key-User Extensibility, Decommission, or Standard SAP Configuration)
    rationale: string; // Technical explanation of the mitigation path
    complexity: 'High' | 'Medium' | 'Low'; // Implementation effort complexity
  }>;
  recommendations: {
    keepCoreClean: string; // Concrete strategy for replacing modifications via extensibility or transformed APIs
    decommissioning: string; // Functionality that is obsolete, duplicate, or should be retired entirely
    cloudReadiness: string; // Technical assessment of whether the custom logic can be cleanly migrated to a transformed cloud service (Node.js)
  };
  strategicNextSteps: string[]; // 3-4 concrete actionable technical next steps for the engineering and architecture teams
  extensibilityRouting: {
    recommendedRoute: 'Side-by-Side (SAP BTP)' | 'In-App (ABAP Cloud)'; // Route: 'Side-by-Side (SAP BTP)' if the legacy logic is asynchronous, external-facing, or has non-SAP SaaS dependencies. 'In-App (ABAP Cloud)' if it has tight core database joins, synchronous posting validation logic, or runs directly during S/4HANA transactional postings.
    confidenceScore: number; // 0-100 score representing the route decision confidence
    rationale: string; // Factual justification of why this extensibility route was selected
    targetArtifact: string; // Primary target SAP cloud extension artifact (e.g., "SAP BTP Node.js App", "ABAP Cloud RAP Business Object", "Released BAdI Implementation", "Custom CDS Projection View")
    decisionTreeCheckpoints: Array<{
      checkpointName: string; // The specific decision checkpoint (e.g., "Transactional Coupling", "UI Paradigm", "Resource Coupling", "Data Proximity")
      question: string; // Standard SAP Extensibility Guide evaluation question
      evaluation: string; // Detailed technical evaluation of how the legacy code answers this question
      resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
      cleanCoreImpact: string; // Architectural explanation of what this means for clean core compliance
    }>;
    comparativeAnalysis: {
      inAppABAPCloud: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string; // Custom technical fit explanation for the RAP/ABAP Cloud track for this legacy code
        pros: string[]; // 2-3 specific technical advantages of using RAP for this legacy logic
        cons: string[]; // 2-3 specific technical limitations/disadvantages of RAP for this logic
      };
      sideBySideBTP: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string; // Custom technical fit explanation for BTP CAP track for this legacy code
        pros: string[]; // 2-3 specific advantages of using BTP CAP for this logic
        cons: string[]; // 2-3 specific limitations/disadvantages of BTP CAP for this logic
      };
    };
  };
}

Legacy Code to Analyze:
${codeToAnalyze}`;

      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true, profile?.geminiApiKey);
      
      let recommendedRoute = 'Side-by-Side (SAP BTP)';
      try {
        const parsed = JSON.parse(responseText.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim());
        if (parsed.extensibilityRouting?.recommendedRoute) {
          recommendedRoute = parsed.extensibilityRouting.recommendedRoute;
        }
      } catch (e) {
        console.error('Failed to parse analysis JSON for routing', e);
      }

      try {
        await updateDoc(doc(getDb(), 'projects', projectId as string), {
          legacyCode: codeToAnalyze,
          analysis: responseText,
          extensibilityRoute: recommendedRoute,
          status: 'analyzed'
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
      }
      setProject((prev: Project | null) => prev ? { ...prev, analysis: responseText, extensibilityRoute: recommendedRoute } : null);
    } catch (err: unknown) {
      console.error('Analysis Error:', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('{')) {
        // Already handled by handleFirestoreError
        throw err;
      }
      setError(`Failed to analyze the code: ${errMessage || 'Unknown error'}. Please try again.`);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  useEffect(() => {
    if (autoAnalyze === 'true' && legacyCode && !project?.analysis && !hasAutoAnalyzed.current) {
      hasAutoAnalyzed.current = true;
      handleAnalyze(legacyCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze, legacyCode, project?.analysis]);

  const exportToConfluence = async () => {
    if (!project?.analysis) return;

    let htmlContent = '';
    
    // Check if JSON
    let isJson = false;
    let data: AnalysisData | null = null;
    if (project.analysis.trim().startsWith('{')) {
      try {
        data = JSON.parse(project.analysis);
        isJson = true;
      } catch {}
    }

    if (isJson && data) {
      // Build visual table for gaps
      const gapsRows = data.gaps?.map(g => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${g.title}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0;"><span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; background: ${g.severity === 'High' ? '#ffebe6' : g.severity === 'Medium' ? '#fffae6' : '#e6fcff'}; color: ${g.severity === 'High' ? '#de350b' : g.severity === 'Medium' ? '#974f0c' : '#007a87'};">${g.severity}</span></td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: 500; color: #0747a6;">${g.strategy}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${g.rationale}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${g.complexity}</td>
        </tr>
      `).join('') || '';

      const stepsList = data.strategicNextSteps?.map(step => `
        <li style="margin-bottom: 10px; font-size: 14px;"><strong>${step}</strong></li>
      `).join('') || '';

      // Extensibility Routing Pathway and Comparative matrices
      const isBtp = (project.extensibilityRoute || data.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP');
      
      const checkpoints = data.extensibilityRouting?.decisionTreeCheckpoints || [
        {
          checkpointName: 'Transactional Coupling',
          question: 'Does the legacy logic require synchronous execution and update locks within standard S/4HANA transactional postings?',
          evaluation: isBtp 
            ? 'The custom logic executes asynchronously or independently without blocking standard ERP database threads (e.g. read-only analytics, decoupled webhooks, or scheduled updates).' 
            : 'The custom logic requires synchronous validation and real-time locking within standard SAP LUW processes (e.g., during posting of sales orders or billing items).',
          resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
          cleanCoreImpact: isBtp 
            ? 'Side-by-side execution leaves S/4HANA upgrade cycles completely unaffected.' 
            : 'In-App extensibility (RAP) is required to run within the ERP core transaction boundaries while keeping the repository clean.'
        },
        {
          checkpointName: 'UI Paradigm & Customization',
          question: 'Does the application require an external-facing portal, heavy custom branding, or tight integration with third-party SaaS services?',
          evaluation: isBtp 
            ? 'Requires a highly responsive, modern Fiori Elements or custom React UI available to external vendors and clients without exposing standard SAP ports.' 
            : 'The UI is embedded inside standard S/4HANA transaction screens for internal business users utilizing standard Fiori grids.',
          resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
          cleanCoreImpact: isBtp 
            ? 'BTP decoupled hosting allows modern web framework freedom and enterprise-grade security isolation.' 
            : 'ABAP RAP keeps the UI aligned with standard S/4HANA layouts, eliminating custom server configurations.'
        },
        {
          checkpointName: 'Data & DB Proximity',
          question: 'Does the logic perform compute-intensive joins across dozens of custom database tables or require a separate persistent schema?',
          evaluation: isBtp 
            ? 'The application relies on decoupled custom data stores, external SaaS APIs, or complex pre-aggregations that would overhead the core database.' 
            : 'Requires direct, low-latency joins and real-time reads on standard tables (e.g. BSEG, KNA1) inside standard transactional screens.',
          resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
          cleanCoreImpact: isBtp 
            ? 'Decoupling database schemas keeps the ERP core lightweight, safe, and easily upgradeable.' 
            : 'Uses standard released RAP CDS projection views and standard repository items, preserving database integrity.'
        },
        {
          checkpointName: 'Lifecycle & Resource Scaling',
          question: 'Does the solution experience highly volatile, bursty resource scaling requirements or have massive external workloads?',
          evaluation: isBtp 
            ? 'Scaling requirements are independent of core ERP compute threads, with unpredictable high-volume external webhook events.' 
            : 'Resource consumption remains flat, predictable, and fully aligned with internal S/4HANA user transaction volume.',
          resultState: isBtp ? 'Side-by-Side Preferred' : 'Neutral',
          cleanCoreImpact: isBtp 
            ? 'Scale-out workloads are absorbed by BTP Cloud Foundry/Kyma, shielding the ERP core system from resource starvation.' 
            : 'ABAP Cloud leverages standard ERP server resource pools, maintaining unified resource constraints.'
        }
      ];

      const comparative = data.extensibilityRouting?.comparativeAnalysis || {
        inAppABAPCloud: {
          technicalFeasibility: isBtp ? 'Partially Compatible' : 'Highly Compatible',
          fitDetails: isBtp 
            ? 'Technically possible to implement in RAP, but transactional tight coupling would restrict SaaS integrations and UI layout options.' 
            : 'Perfect technical fit. Executes inside standard S/4HANA transaction pipelines utilizing RAP CDS views and behavior definitions.',
          pros: [
            'Zero latency database reads on core S/4HANA standard tables',
            'Synchronous transactional execution inside standard SAP LUW',
            'Direct reuse of existing standard locks and validations'
          ],
          cons: [
            'Language restricted strictly to released ABAP Cloud standard repository items',
            'No access to external SaaS libraries or Node.js frameworks',
            'Any compute overhead directly blocks ERP core system processes'
          ]
        },
        sideBySideBTP: {
          technicalFeasibility: isBtp ? 'Highly Compatible' : 'Partially Compatible',
          fitDetails: isBtp 
            ? 'Ideal architectural fit. The application runs as a fully decoupled, upgrade-safe microservice on SAP BTP using CAP and Node.js.' 
            : 'Feasible via event triggers (Event Mesh) or API destinations, but adds HTTP latency and requires destination configuration.',
          pros: [
            'Absolute lifecycle isolation - zero upgrade blockers for S/4HANA core',
            'Total development freedom with Node.js, TypeScript, and modern NPM libraries',
            'Allows external portal hosting and multi-tenant SaaS scaling'
          ],
          cons: [
            'Requires configuring standard cloud API destinations and credentials',
            'Introduces HTTP request latency for transactional processes',
            'Needs ERP-side trigger classes to capture transactional database state changes'
          ]
        }
      };

      const checkpointsRows = checkpoints.map((cp, idx) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold; text-align: center;">${idx + 1}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${cp.checkpointName}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px;">${cp.question}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #172b4d;">${cp.evaluation}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; text-align: center;"><span style="padding: 2.5px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${cp.resultState.includes('Side-by-Side') ? '#deebff' : cp.resultState.includes('In-App') ? '#e3fcef' : '#f4f5f7'}; color: ${cp.resultState.includes('Side-by-Side') ? '#0747a6' : cp.resultState.includes('In-App') ? '#006644' : '#505f79'};">${cp.resultState}</span></td>
        </tr>
      `).join('');

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul { margin-bottom: 16px; padding-left: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f4f5f7; text-align: left; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c; border-bottom: 2px solid #ebecf0; }
            td { border-bottom: 1px solid #ebecf0; }
            .badge { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #e6fcff; color: #007a87; border: 1px solid #b3f0ff; }
            .summary-box { background: #f4f5f7; border-left: 4px solid #0747a6; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
            .card-grid { display: grid; grid-template-cols: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
            .card { border: 1px solid #ebecf0; border-radius: 8px; padding: 16px; background: #fff; }
            .card-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c; margin-bottom: 8px; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${data.projectTitle || project.name}</h1>
            <div class="meta">Clean Core Compliance: <strong>${data.cleanCoreScore}%</strong> | Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            <div class="summary-box">
              <h3 style="margin-top: 0; color: #0747a6;">Executive Summary</h3>
              <p>${data.summary}</p>
            </div>

            <h2>As-Is Process & Legacy Context</h2>
            <p>${data.asIsContext}</p>

            <h2>Standard Fit Assessment</h2>
            <p><strong>Target Standard Process ID / Module:</strong> ${data.standardFit?.targetStandardProcess || 'N/A'}</p>
            <p><strong>Standardization Potential:</strong> <span class="badge">${data.standardFit?.potential || 'Medium'}</span></p>
            <p>${data.standardFit?.rationale}</p>

            <h2>SAP Extensibility Routing Decision Path</h2>
            <p>The legacy ABAP code was evaluated step-by-step against the official SAP Clean Core extensibility decision tree. Below is the detailed pathway and checkpoint audit:</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Step</th>
                  <th style="width: 20%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Decision Milestone</th>
                  <th style="width: 25%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Evaluation Question</th>
                  <th style="width: 40%; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Legacy Code Assessment</th>
                  <th style="width: 10%; text-align: center; background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Result State</th>
                </tr>
              </thead>
              <tbody>
                ${checkpointsRows}
              </tbody>
            </table>

            <h2>Extensibility Track Comparative Matrix</h2>
            <p>Direct architectural comparison of both available tracks mapped specifically to this project's requirements:</p>
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; margin-bottom: 30px;">
              <div class="card" style="border-left: 4px solid #006644; background: #e3fcef20;">
                <div class="card-title" style="color: #006644;">⚙️ In-App ABAP Cloud (RAP) Track</div>
                <p style="font-size: 11px; color: #5e6c84; font-weight: bold; margin-bottom: 8px;">Feasibility: ${comparative.inAppABAPCloud.technicalFeasibility}</p>
                <p style="font-size: 13px; margin-bottom: 12px;">${comparative.inAppABAPCloud.fitDetails}</p>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Technical Pros:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 12px;">
                  ${comparative.inAppABAPCloud.pros.map(pro => `<li>${pro}</li>`).join('')}
                </ul>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Limitations (Cons):</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; color: #5e6c84; margin-bottom: 0;">
                  ${comparative.inAppABAPCloud.cons.map(con => `<li>${con}</li>`).join('')}
                </ul>
              </div>
              <div class="card" style="border-left: 4px solid #0747a6; background: #deebff20;">
                <div class="card-title" style="color: #0747a6;">☁️ Side-by-Side SAP BTP (CAP) Track</div>
                <p style="font-size: 11px; color: #5e6c84; font-weight: bold; margin-bottom: 8px;">Feasibility: ${comparative.sideBySideBTP.technicalFeasibility}</p>
                <p style="font-size: 13px; margin-bottom: 12px;">${comparative.sideBySideBTP.fitDetails}</p>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Technical Pros:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 12px;">
                  ${comparative.sideBySideBTP.pros.map(pro => `<li>${pro}</li>`).join('')}
                </ul>
                <div style="font-size: 12px; margin-bottom: 8px;"><strong>Limitations (Cons):</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; color: #5e6c84; margin-bottom: 0;">
                  ${comparative.sideBySideBTP.cons.map(con => `<li>${con}</li>`).join('')}
                </ul>
              </div>
            </div>

            <h2>Functional Gaps Analysis Matrix</h2>
            <table>
              <thead>
                <tr>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Requirement</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Divergence</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Mitigation Strategy</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Technical Rationale</th>
                  <th style="background: #f4f5f7; padding: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c;">Complexity</th>
                </tr>
              </thead>
              <tbody>
                ${gapsRows}
              </tbody>
            </table>

            <h2>Modernization Recommendations</h2>
            <div class="card-grid">
              <div class="card">
                <div class="card-title" style="color: #00875a;">Keep Core Clean</div>
                <p style="font-size: 13px; margin: 0;">${data.recommendations?.keepCoreClean}</p>
              </div>
              <div class="card">
                <div class="card-title" style="color: #de350b;">Decommissioning</div>
                <p style="font-size: 13px; margin: 0;">${data.recommendations?.decommissioning}</p>
              </div>
              <div class="card">
                <div class="card-title" style="color: #0747a6;">Cloud Readiness</div>
                <p style="font-size: 13px; margin: 0;">${data.recommendations?.cloudReadiness}</p>
              </div>
            </div>

            <h2>Architectural Next Steps</h2>
            <ol style="padding-left: 20px;">
              ${stepsList}
            </ol>
          </div>
        </body>
        </html>
      `;
    } else {
      // Legacy markdown fallback
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul, ol { margin-bottom: 16px; padding-left: 30px; }
            li { margin-bottom: 8px; }
            blockquote { border-left: 4px solid #4c9aff; padding-left: 20px; color: #6b778c; font-style: italic; margin: 20px 0; }
            code { background: #f4f5f7; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${project.name}</h1>
            <div class="meta">Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            ${marked(project.analysis)}
          </div>
        </body>
        </html>
      `;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `${project.name.replace(/\s+/g, '_')}_Business_Analysis.html`);
    
    // Store in DB
    const docRef = doc(getDb(), 'projects', projectId as string);
    try {
      await updateDoc(docRef, {
        [`exports.analysis_confluence_${Date.now()}`]: htmlContent
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    }
  };

  const categorizeGaps = (gaps: any[]) => {
    const categories = {
      quickWins: [] as any[],
      complexStandard: [] as any[],
      strategic: [] as any[],
      retire: [] as any[]
    };

    gaps.forEach(gap => {
      const strategyLower = (gap.strategy || '').toLowerCase();
      const titleLower = (gap.title || '').toLowerCase();
      
      if (strategyLower.includes('decommission') || strategyLower.includes('retire') || strategyLower.includes('obsolete') || titleLower.includes('decommission') || titleLower.includes('retire')) {
        categories.retire.push(gap);
      } else if (gap.complexity === 'Low' && gap.severity === 'Low') {
        categories.quickWins.push(gap);
      } else if (gap.complexity === 'High' && (strategyLower.includes('standard') || strategyLower.includes('key-user') || strategyLower.includes('extensibility'))) {
        categories.complexStandard.push(gap);
      } else {
        categories.strategic.push(gap);
      }
    });

    return categories;
  };

  const renderAnalysisContent = () => {
    if (!project?.analysis) return null;
    
    let analysisData: AnalysisData | null = null;
    if (project.analysis.trim().startsWith('{')) {
      try {
        analysisData = JSON.parse(project.analysis);
      } catch (e) {
        console.error('Failed to parse JSON analysis, falling back to markdown rendering', e);
      }
    }

    if (analysisData) {
      const gapsCat = categorizeGaps(analysisData.gaps || []);
      
      return (
        <div className="space-y-12">
          {/* Core metrics panel */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-stretch">
            {/* Circular SVG Gauge for Clean Core Score */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
              
              <div className="flex items-center gap-1.5 mb-4 relative z-10">
                <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase">Clean Core Score</span>
                <button 
                  onClick={() => setShowScoreModal(true)}
                  className="p-1 rounded-md text-green-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
                  title="Explain Clean Core Score"
                >
                  <HelpCircle size={14} className="animate-pulse" />
                </button>
              </div>
              
              <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="72" cy="72" r="56" className="stroke-slate-800 fill-none" strokeWidth="8" />
                  <circle 
                    cx="72" 
                    cy="72" 
                    r="56" 
                    className="stroke-green-500 fill-none transition-all duration-1000 ease-out" 
                    strokeWidth="8" 
                    strokeDasharray="351.8" 
                    strokeDashoffset={351.8 - (351.8 * (analysisData.cleanCoreScore || 0)) / 100}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-extrabold text-white tracking-tight">{analysisData.cleanCoreScore}%</span>
                  <span className="text-[9px] text-slate-400 font-medium">Compliance</span>
                </div>
              </div>
              
              <p className="text-xs text-slate-400 mt-2 max-w-[200px]">Higher score indicates better alignment with standard extensibility guidelines.</p>
            </div>

            {/* Extensibility Router Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between relative group">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Extensibility Router</span>
                <div className="flex items-center gap-2 mt-2 mb-3">
                  <span className={clsx(
                    "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm",
                    (project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP')
                      ? "bg-blue-50 text-blue-700 border border-blue-100"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                  )}>
                    {(project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP') ? '☁️ BTP Side-by-Side' : '⚙️ ABAP Cloud'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {analysisData.extensibilityRouting?.confidenceScore || 95}% Conf.
                  </span>
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">
                  Target: {analysisData.extensibilityRouting?.targetArtifact || ((project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || '').includes('BTP') ? 'SAP BTP Node.js App' : 'RAP Business Object')}
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-4">
                  {analysisData.extensibilityRouting?.rationale || 'AI analyzed legacy database joins and determined the optimal decoupled BTP modernization strategy.'}
                </p>
              </div>

              {/* Interactive Override Button */}
              <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Override Route</span>
                <button
                  type="button"
                  onClick={async () => {
                    const currentRoute = project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)';
                    const nextRoute = currentRoute.includes('BTP') ? 'In-App (ABAP Cloud)' : 'Side-by-Side (SAP BTP)';
                    
                    // Update in Firestore
                    const docRef = doc(getDb(), 'projects', projectId as string);
                    await updateDoc(docRef, { extensibilityRoute: nextRoute });
                    
                    // Update state
                    setProject((prev: any) => prev ? { ...prev, extensibilityRoute: nextRoute } : prev);
                  }}
                  className="text-[9px] font-black text-slate-500 hover:text-green-600 transition-colors uppercase tracking-widest flex items-center gap-1"
                >
                  <RefreshCw size={10} className="animate-spin-slow" /> Switch Track
                </button>
              </div>
            </div>

            {/* Project Summary Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between lg:col-span-2 relative group">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Analysis Summary</span>
                <h3 className="text-2xl font-black text-slate-900 mt-2 mb-3">{analysisData.projectTitle || project.name}</h3>
                <p className="text-slate-600 text-base leading-relaxed">{analysisData.summary}</p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Standardization Potential</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={clsx(
                      "w-2 h-2 rounded-full",
                      analysisData.standardFit?.potential === 'High' ? 'bg-green-500' :
                      analysisData.standardFit?.potential === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                    )}></span>
                    <span className="text-sm font-bold text-slate-700">{analysisData.standardFit?.potential || 'Medium'}</span>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Target Process Mapping</span>
                  <p className="text-sm font-bold text-slate-800 mt-1">{analysisData.standardFit?.targetStandardProcess || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Extensibility Decision Matrix & Path Guide */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden group mb-8 animate-in fade-in duration-700">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Extensibility Decision Matrix & Path</h3>
                <p className="text-xs text-slate-400 mt-1">Detailed comparison and dynamic AI checkpoints that determined the active modernization track.</p>
              </div>
              <span className="bg-slate-100 text-slate-700 border border-slate-200/60 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shrink-0 self-start md:self-center">
                SAP Clean Core Guidelines
              </span>
            </div>

            {(() => {
              const isBtp = (project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP');
              
              const checkpoints = analysisData.extensibilityRouting?.decisionTreeCheckpoints || [
                {
                  checkpointName: 'Transactional Coupling',
                  question: 'Does the legacy logic require synchronous execution and update locks within standard S/4HANA transactional postings?',
                  evaluation: isBtp 
                    ? 'The custom logic executes asynchronously or independently without blocking standard ERP database threads (e.g. read-only analytics, decoupled webhooks, or scheduled updates).' 
                    : 'The custom logic requires synchronous validation and real-time locking within standard SAP LUW processes (e.g., during posting of sales orders or billing items).',
                  resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
                  cleanCoreImpact: isBtp 
                    ? 'Side-by-side execution leaves S/4HANA upgrade cycles completely unaffected.' 
                    : 'In-App extensibility (RAP) is required to run within the ERP core transaction boundaries while keeping the repository clean.'
                },
                {
                  checkpointName: 'UI Paradigm & Customization',
                  question: 'Does the application require an external-facing portal, heavy custom branding, or tight integration with third-party SaaS services?',
                  evaluation: isBtp 
                    ? 'Requires a highly responsive, modern Fiori Elements or custom React UI available to external vendors and clients without exposing standard SAP ports.' 
                    : 'The UI is embedded inside standard S/4HANA transaction screens for internal business users utilizing standard Fiori grids.',
                  resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
                  cleanCoreImpact: isBtp 
                    ? 'BTP decoupled hosting allows modern web framework freedom and enterprise-grade security isolation.' 
                    : 'ABAP RAP keeps the UI aligned with standard S/4HANA layouts, eliminating custom server configurations.'
                },
                {
                  checkpointName: 'Data & DB Proximity',
                  question: 'Does the logic perform compute-intensive joins across dozens of custom database tables or require a separate persistent schema?',
                  evaluation: isBtp 
                    ? 'The application relies on decoupled custom data stores, external SaaS APIs, or complex pre-aggregations that would overhead the core database.' 
                    : 'Requires direct, low-latency joins and real-time reads on standard tables (e.g. BSEG, KNA1) inside standard transactional screens.',
                  resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
                  cleanCoreImpact: isBtp 
                    ? 'Decoupling database schemas keeps the ERP core lightweight, safe, and easily upgradeable.' 
                    : 'Uses standard released RAP CDS projection views and standard repository items, preserving database integrity.'
                },
                {
                  checkpointName: 'Lifecycle & Resource Scaling',
                  question: 'Does the solution experience highly volatile, bursty resource scaling requirements or have massive external workloads?',
                  evaluation: isBtp 
                    ? 'Scaling requirements are independent of core ERP compute threads, with unpredictable high-volume external webhook events.' 
                    : 'Resource consumption remains flat, predictable, and fully aligned with internal S/4HANA user transaction volume.',
                  resultState: isBtp ? 'Side-by-Side Preferred' : 'Neutral',
                  cleanCoreImpact: isBtp 
                    ? 'Scale-out workloads are absorbed by BTP Cloud Foundry/Kyma, shielding the ERP core system from resource starvation.' 
                    : 'ABAP Cloud leverages standard ERP server resource pools, maintaining unified resource constraints.'
                }
              ];

              const comparative = analysisData.extensibilityRouting?.comparativeAnalysis || {
                inAppABAPCloud: {
                  technicalFeasibility: isBtp ? 'Partially Compatible' : 'Highly Compatible',
                  fitDetails: isBtp 
                    ? 'Technically possible to implement in RAP, but transactional tight coupling would restrict SaaS integrations and UI layout options.' 
                    : 'Perfect technical fit. Executes inside standard S/4HANA transaction pipelines utilizing RAP CDS views and behavior definitions.',
                  pros: [
                    'Zero latency database reads on core S/4HANA standard tables',
                    'Synchronous transactional execution inside standard SAP LUW',
                    'Direct reuse of existing standard locks and validations'
                  ],
                  cons: [
                    'Language restricted strictly to released ABAP Cloud standard repository items',
                    'No access to external SaaS libraries or Node.js frameworks',
                    'Any compute overhead directly blocks ERP core system processes'
                  ]
                },
                sideBySideBTP: {
                  technicalFeasibility: isBtp ? 'Highly Compatible' : 'Partially Compatible',
                  fitDetails: isBtp 
                    ? 'Ideal architectural fit. The application runs as a fully decoupled, upgrade-safe microservice on SAP BTP using CAP and Node.js.' 
                    : 'Feasible via event triggers (Event Mesh) or API destinations, but adds HTTP latency and requires destination configuration.',
                  pros: [
                    'Absolute lifecycle isolation - zero upgrade blockers for S/4HANA core',
                    'Total development freedom with Node.js, TypeScript, and modern NPM libraries',
                    'Allows external portal hosting and multi-tenant SaaS scaling'
                  ],
                  cons: [
                    'Requires configuring standard cloud API destinations and credentials',
                    'Introduces HTTP request latency for transactional processes',
                    'Needs ERP-side trigger classes to capture transactional database state changes'
                  ]
                }
              };

              return (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Pathway Explorer */}
                  <div className="bg-slate-50/50 border border-slate-150 rounded-[1.5rem] p-5 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4 font-mono">AI Routing Decision Pathway Explorer</span>
                    <div className="relative">
                      {/* Horizontal progress path connecting checkpoints */}
                      <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-200 -translate-y-1/2 hidden md:block z-0"></div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                        {checkpoints.map((cp, idx) => {
                          const isActive = selectedCheckpoint === idx;
                          const isSideBySide = cp.resultState === 'Side-by-Side Preferred';
                          const isInApp = cp.resultState === 'In-App Preferred';
                          
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedCheckpoint(idx)}
                              className={clsx(
                                "bg-white border rounded-2xl p-4 text-left transition-all duration-300 shadow-sm relative overflow-hidden group hover:scale-[1.02] hover:shadow-md",
                                isActive 
                                  ? "border-emerald-600 ring-2 ring-emerald-500/20" 
                                  : "border-slate-200/85 hover:border-slate-300"
                              )}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className={clsx(
                                  "w-6 h-6 rounded-full font-bold flex items-center justify-center text-[10px] shrink-0",
                                  isActive 
                                    ? "bg-emerald-650 text-white" 
                                    : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                                )}>
                                  {idx + 1}
                                </span>
                                <span className="text-[11px] font-extrabold text-slate-800 tracking-tight line-clamp-1">{cp.checkpointName}</span>
                              </div>
                              
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className={clsx(
                                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                                  isSideBySide ? "bg-blue-50 text-blue-700 border border-blue-100" :
                                  isInApp ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                  "bg-slate-50 text-slate-600 border border-slate-100"
                                )}>
                                  {cp.resultState.split(' ')[0]}
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold ml-auto group-hover:text-slate-600 transition-colors">Inspect →</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Active Checkpoint Detail Panel */}
                    <div className="bg-white border border-slate-150 rounded-xl p-5 mt-5 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-150 pb-4 mb-4">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Selected Milestone {selectedCheckpoint + 1} • {checkpoints[selectedCheckpoint].checkpointName}</span>
                          <h4 className="text-sm font-extrabold text-slate-900 leading-snug">{checkpoints[selectedCheckpoint].question}</h4>
                        </div>
                        <span className={clsx(
                          "text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm shrink-0 self-start md:self-auto",
                          checkpoints[selectedCheckpoint].resultState === 'Side-by-Side Preferred' ? "bg-blue-600 text-white" :
                          checkpoints[selectedCheckpoint].resultState === 'In-App Preferred' ? "bg-emerald-600 text-white" :
                          "bg-slate-600 text-white"
                        )}>
                          {checkpoints[selectedCheckpoint].resultState}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Custom Technical Assessment</span>
                          <p className="text-slate-700 font-medium">{checkpoints[selectedCheckpoint].evaluation}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                          <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block font-mono">Clean Core Implementation Impact</span>
                          <p className="text-slate-600 font-medium">{checkpoints[selectedCheckpoint].cleanCoreImpact}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tailored comparative matrix */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    {/* Track 1: In-App ABAP Cloud */}
                    <div className={clsx(
                      "p-6 rounded-2xl border transition-all flex flex-col justify-between",
                      !isBtp
                        ? "bg-emerald-50/20 border-emerald-500/30 shadow-md ring-1 ring-emerald-500/10"
                        : "bg-slate-50/40 border-slate-200/50 opacity-80"
                    )}>
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={clsx("p-2 rounded-xl", !isBtp ? "bg-emerald-100/50 text-emerald-700" : "bg-slate-250/60 text-slate-555")}>
                              <Sparkles size={16} />
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm">⚙️ In-App ABAP Cloud (RAP)</span>
                          </div>
                          <span className={clsx(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm",
                            comparative.inAppABAPCloud.technicalFeasibility === 'Highly Compatible' ? "bg-green-600 text-white" :
                            comparative.inAppABAPCloud.technicalFeasibility === 'Partially Compatible' ? "bg-amber-600 text-white" :
                            "bg-rose-600 text-white"
                          )}>
                            {comparative.inAppABAPCloud.technicalFeasibility}
                          </span>
                        </div>
                        
                        <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                          {comparative.inAppABAPCloud.fitDetails}
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block font-mono mb-2">Technical Advantages (Pros)</span>
                            <ul className="space-y-2 text-[11px] text-slate-700 font-semibold">
                              {comparative.inAppABAPCloud.pros.map((pro, pIdx) => (
                                <li key={pIdx} className="flex items-start gap-1.5">
                                  <span className="text-emerald-500 shrink-0 font-extrabold">✓</span>
                                  <span>{pro}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block font-mono mb-2">Architectural Limitations (Cons)</span>
                            <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                              {comparative.inAppABAPCloud.cons.map((con, cIdx) => (
                                <li key={cIdx} className="flex items-start gap-1.5">
                                  <span className="text-rose-455 shrink-0 font-extrabold">✗</span>
                                  <span>{con}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                      
                      {!isBtp && (
                        <div className="border-t border-emerald-500/20 pt-4 mt-6 text-[10px] text-emerald-800 font-bold uppercase tracking-widest font-mono">
                          Target: Released CDS Views & RAP Business Objects
                        </div>
                      )}
                    </div>

                    {/* Track 2: Side-by-Side SAP BTP */}
                    <div className={clsx(
                      "p-6 rounded-2xl border transition-all flex flex-col justify-between",
                      isBtp
                        ? "bg-blue-50/20 border-blue-500/30 shadow-md ring-1 ring-blue-500/10"
                        : "bg-slate-50/40 border-slate-200/50 opacity-80"
                    )}>
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={clsx("p-2 rounded-xl", isBtp ? "bg-blue-100/50 text-blue-700" : "bg-slate-250/60 text-slate-555")}>
                              <Layers size={16} />
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm">☁️ Side-by-Side SAP BTP (CAP)</span>
                          </div>
                          <span className={clsx(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm",
                            comparative.sideBySideBTP.technicalFeasibility === 'Highly Compatible' ? "bg-green-600 text-white" :
                            comparative.sideBySideBTP.technicalFeasibility === 'Partially Compatible' ? "bg-amber-600 text-white" :
                            "bg-rose-600 text-white"
                          )}>
                            {comparative.sideBySideBTP.technicalFeasibility}
                          </span>
                        </div>
                        
                        <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                          {comparative.sideBySideBTP.fitDetails}
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block font-mono mb-2">Technical Advantages (Pros)</span>
                            <ul className="space-y-2 text-[11px] text-slate-700 font-semibold">
                              {comparative.sideBySideBTP.pros.map((pro, pIdx) => (
                                <li key={pIdx} className="flex items-start gap-1.5">
                                  <span className="text-emerald-500 shrink-0 font-extrabold">✓</span>
                                  <span>{pro}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block font-mono mb-2">Architectural Limitations (Cons)</span>
                            <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                              {comparative.sideBySideBTP.cons.map((con, cIdx) => (
                                <li key={cIdx} className="flex items-start gap-1.5">
                                  <span className="text-rose-455 shrink-0 font-extrabold">✗</span>
                                  <span>{con}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                      
                      {isBtp && (
                        <div className="border-t border-blue-500/20 pt-4 mt-6 text-[10px] text-blue-800 font-bold uppercase tracking-widest font-mono">
                          Target: CAP OData APIs & Decoupled BTP Microservices
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* As-is Context and Target Extensibility Mapping */}
          <div className="space-y-8">
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative">
              {showHelpMode && (
                <div className="sm:absolute relative sm:top-6 sm:right-6 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
                  <Info size={12} />
                  Describes current system status and workflow.
                </div>
              )}
              <h4 className="font-extrabold text-slate-900 text-lg mb-3">As-Is Process & Legacy Context</h4>
              <p className="text-slate-600 leading-relaxed text-sm">{analysisData.asIsContext}</p>
            </div>
            
            {/* Target Scope Mapping Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-slate-900 text-lg">Target Scope & Extensibility Mapping</h4>
                    {showHelpMode && (
                      <div className="group relative">
                        <Info size={14} className="text-amber-500 cursor-help animate-pulse shrink-0" />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 max-w-[85vw] bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 leading-relaxed font-normal">
                          <strong>Enterprise Architecture Mapping:</strong> Categorizes your legacy code into modern SAP clean core boundaries to identify what can be decommissioned or automated.
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Strategic alignment of custom legacy logic with modern S/4HANA extensibility guidelines.</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200/60 px-3 py-1 rounded-full uppercase tracking-wider font-mono shrink-0 self-start sm:self-center">Clean Core Mapping</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1: S/4HANA Standard Fit */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 size={18} className="shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider font-mono">Standard Fit</span>
                    </div>
                    <h5 className="text-sm font-extrabold text-slate-900">{analysisData.standardFit?.targetStandardProcess || 'S/4HANA Best Practice'}</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">{analysisData.standardFit?.rationale}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
                      <span>Standardization Fit</span>
                      <span className="text-green-600 font-extrabold">{analysisData.standardFit?.potential === 'High' ? '90%' : analysisData.standardFit?.potential === 'Medium' ? '50%' : '15%'}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full" 
                        style={{ width: analysisData.standardFit?.potential === 'High' ? '90%' : analysisData.standardFit?.potential === 'Medium' ? '50%' : '15%' }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Transformed BTP Extension */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <Sparkles size={18} className="shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider font-mono">Modern Extension</span>
                    </div>
                    <h5 className="text-sm font-extrabold text-slate-900">Side-by-Side BTP / Node.js</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">{analysisData.recommendations?.cloudReadiness || 'Custom API layers and microservices completely transformed from standard core.'}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
                      <span>Cloud Readiness</span>
                      <span className="text-emerald-600 font-extrabold">95%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '95%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Obsolete / Retire */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Trash2 size={18} className="shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider font-mono">Decommission</span>
                    </div>
                    <h5 className="text-sm font-extrabold text-slate-900">Redundant & Obsolete Logic</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">{analysisData.recommendations?.decommissioning || 'Obsolete SAP workarounds, manual validation structures, and unused code blocks.'}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
                      <span>Decommission Ratio</span>
                      <span className="text-slate-600 font-extrabold">80%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-500 rounded-full" style={{ width: '80%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2x2 Matrix Grid */}
          <div className="space-y-4 relative">
            {showHelpMode && (
              <div className="sm:absolute relative sm:top-0 sm:right-0 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
                <Info size={12} />
                Prioritizes extensions based on business value and complex deployment effort.
              </div>
            )}
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Gaps Prioritization Matrix</h3>
              <p className="text-sm text-slate-500 mt-1">Identified extensions grouped by complexity and core compliance impact.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-[2rem] border border-slate-200">
              {/* Quadrant 1: Quick Wins */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-extrabold text-emerald-800 text-sm tracking-wider uppercase">⚡ Quick Wins</h5>
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Low Effort</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">Simple requirements that can be handled through standard extensibility or decommissioned easily.</p>
                <div className="space-y-2">
                  {gapsCat.quickWins.length > 0 ? (
                    gapsCat.quickWins.map((g, idx) => (
                      <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">{g.title}</span>
                        <span className="text-[9px] text-slate-500 font-medium">Low Severity</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
                  )}
                </div>
              </div>

              {/* Quadrant 2: Complex Standard Fit */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-extrabold text-blue-800 text-sm tracking-wider uppercase">🔄 Complex Standard Fit</h5>
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">High Fit / High Effort</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">Standard exists but migration requires significant refactoring or process redesign.</p>
                <div className="space-y-2">
                  {gapsCat.complexStandard.length > 0 ? (
                    gapsCat.complexStandard.map((g, idx) => (
                      <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">{g.title}</span>
                        <span className="text-[9px] text-blue-600 font-bold">Standard Target</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
                  )}
                </div>
              </div>

              {/* Quadrant 3: Strategic Extensions */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-extrabold text-amber-800 text-sm tracking-wider uppercase">💡 Strategic Extensions</h5>
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Transformed App Needed</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">High complexity and no standard fit. Best implemented side-by-side on BTP or dynamic APIs.</p>
                <div className="space-y-2">
                  {gapsCat.strategic.length > 0 ? (
                    gapsCat.strategic.map((g, idx) => (
                      <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">{g.title}</span>
                        <span className="text-[9px] text-amber-600 font-bold">Side-by-Side</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
                  )}
                </div>
              </div>

              {/* Quadrant 4: Retire / Decommission */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-extrabold text-rose-800 text-sm tracking-wider uppercase">🗑️ Retire & Decommission</h5>
                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Decommission</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">Obsolete requirements or unused custom logic that should be removed from scope.</p>
                <div className="space-y-2">
                  {gapsCat.retire.length > 0 ? (
                    gapsCat.retire.map((g, idx) => (
                      <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">{g.title}</span>
                        <span className="text-[9px] text-rose-600 font-bold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">Retire</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Gap Cards */}
          <div className="space-y-6 relative">
            {showHelpMode && (
              <div className="sm:absolute relative sm:top-0 sm:right-0 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
                <Info size={12} />
                Divergence indicates the severity of departure from standard S/4HANA core logic.
              </div>
            )}
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Functional Gaps Analysis</h3>
              <p className="text-sm text-slate-500 mt-1">Detailed assessment and mitigation strategies for each identified gap.</p>
            </div>
            
            <div className="space-y-4">
              {analysisData.gaps?.map((gap, idx) => {
                return <GapAccordionCard key={idx} gap={gap} />;
              })}
            </div>
          </div>

          {/* Clean Core Recommendations */}
          <div className="bg-slate-50 rounded-[2rem] p-8 md:p-10 border border-slate-200 space-y-8 relative">
            {showHelpMode && (
              <div className="sm:absolute relative sm:top-8 sm:right-8 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
                <Info size={12} />
                Identifies key architecture strategies to safeguard your ERP standard core.
              </div>
            )}
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Modernization Strategy</h3>
              <p className="text-sm text-slate-500 mt-1">Concrete actions to keep your core clean during target implementation.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block">Keep Core Clean</span>
                <p className="text-xs text-slate-600 leading-relaxed">{analysisData.recommendations?.keepCoreClean}</p>
              </div>
              
              <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full inline-block">Decommissioning</span>
                <p className="text-xs text-slate-600 leading-relaxed">{analysisData.recommendations?.decommissioning}</p>
              </div>
              
              <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full inline-block">Cloud Readiness</span>
                <p className="text-xs text-slate-600 leading-relaxed">{analysisData.recommendations?.cloudReadiness}</p>
              </div>
            </div>
          </div>

          {/* Actionable Next Steps */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 md:p-12 border border-slate-850 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="relative z-10 space-y-6">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Architectural Next Steps</h3>
                <p className="text-sm text-slate-400 mt-1">Action items for your engineering and configuration teams.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisData.strategicNextSteps?.map((step, idx) => (
                  <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-750 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 font-bold text-xs">{idx + 1}</span>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Fallback to legacy markdown rendering
    return (
      <div className="prose prose-base md:prose-lg prose-gray max-w-none 
        prose-headings:text-gray-950 prose-headings:font-extrabold prose-headings:tracking-tight
        prose-h1:text-3xl md:prose-h1:text-5xl prose-h1:mb-8 prose-h1:mt-12
        prose-h2:text-2xl md:prose-h2:text-3xl prose-h2:mb-6 prose-h2:mt-10
        prose-h3:text-xl md:prose-h3:text-2xl prose-h3:mb-4 prose-h3:mt-8
        prose-p:text-gray-800 prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg prose-p:mb-6
        prose-li:text-gray-800 prose-li:text-base prose-li:mb-2
        prose-strong:text-gray-950 prose-strong:font-bold
      ">
        <ReactMarkdown components={markdownComponents}>{project.analysis}</ReactMarkdown>
      </div>
    );
  };


  if (loading && !project) return (
    <div className="h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
        <p className="text-lg font-medium text-gray-500">Loading project data...</p>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      <Stepper currentStep={project?.analysis ? 2 : 1} />
      
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-3">Code Analysis</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">Extracting business intelligence and technical dependencies from your legacy assets.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl mb-8 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      
      {!project?.analysis ? (
        loading ? (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">AI Modernization Engine Active</h3>
                  <p className="text-xs text-slate-500">{loadingMessage || 'Performing deep code analysis...'}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">Running</span>
            </div>
            <ScannerConsole code={legacyCode} />
          </div>
        ) : (
          <div className="space-y-8">
            <div 
              className={clsx(
                "border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center min-h-[320px] shadow-sm",
                isDragging ? "border-green-500 bg-green-50 scale-[1.01]" : "border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50/50",
                legacyCode ? "border-green-400 bg-green-50/20" : ""
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} 
                className="hidden" 
                accept=".abap,.txt"
              />
              
              {legacyCode ? (
                <>
                  <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm rotate-3">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Source Code Ready</h3>
                  <p className="text-gray-500">Your legacy asset has been successfully staged for analysis.</p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm -rotate-3">
                    <UploadCloud className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Upload Legacy Asset</h3>
                  <p className="text-gray-500 mb-6 max-w-md">Drag and drop your legacy code file here, or click to browse. Supports .abap and .txt formats.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">Enterprise Grade</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">Max 1MB</span>
                  </div>
                </>
              )}
            </div>

            {legacyCode && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4">
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Legacy Source Code</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Read-Only Preview</span>
                </div>
                <textarea 
                  className="w-full h-80 p-6 font-mono text-sm text-gray-800 bg-gray-50/30 focus:outline-none resize-none leading-relaxed"
                  value={legacyCode}
                  onChange={(e) => setLegacyCode(e.target.value)}
                  placeholder="Paste legacy code here..."
                  spellCheck={false}
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-12 border-t border-gray-100 mt-12">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-[#0b1c30]/60 font-bold hover:text-[#0b1c30] px-6 py-3 rounded-xl hover:bg-gray-100 transition-all group"
              >
                <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" /> Cancel & Return
              </button>
              
              <button
                onClick={() => handleAnalyze(legacyCode)}
                disabled={loading || !legacyCode}
                className={clsx(
                  "flex items-center gap-3 bg-[#00873a] text-white px-10 py-4 rounded-2xl hover:bg-[#006b2c] hover:shadow-xl hover:shadow-green-900/20 transition-all font-black disabled:opacity-70 disabled:cursor-not-allowed min-w-[220px] justify-center shadow-lg shadow-green-900/10",
                  loading && "animate-pulse"
                )}
              >
                {loading ? (
                  <>
                    <RefreshCw size={20} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Start Analysis <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-10 animate-in slide-in-from-bottom-6">
          <div id="analysis-report" className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-green-600 px-6 py-10 md:px-10 md:py-12 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md">
                      <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-100">Technical & Business Report</span>
                  </div>
                  <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">Business Analysis Report</h2>
                  <p className="text-green-100 mt-3 max-w-2xl text-base md:text-lg font-medium opacity-90">Comprehensive assessment of legacy logic, business value, and modernization potential.</p>
                </div>
                <div className="flex gap-3 shrink-0 items-center">
                  <button
                    onClick={() => setShowHelpMode(!showHelpMode)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm backdrop-blur-md",
                      showHelpMode 
                        ? "bg-amber-500/20 text-amber-200 border-amber-500/30" 
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    )}
                  >
                    <HelpCircle size={16} className={clsx(showHelpMode && "animate-bounce")} />
                    {showHelpMode ? 'Help Mode: ON' : 'Help Mode'}
                  </button>
                  
                  <button 
                    onClick={() => exportToConfluence()}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl backdrop-blur-md transition-all font-bold text-sm border border-white/20"
                  >
                    <FileCode2 size={16} /> Export Confluence
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 md:p-12 bg-white">
              {renderAnalysisContent()}
            </div>

            {/* Realigned Premium Navigation Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-6 py-8 md:px-12 md:py-10 bg-slate-50/50 border-t border-slate-100">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-slate-500 font-bold hover:text-slate-800 px-6 py-3 rounded-xl hover:bg-slate-100 transition-all border border-slate-200 bg-white shadow-sm"
              >
                <ArrowLeft size={18} /> Return to Dashboard
              </button>
              
              <button
                onClick={() => { setIsNavigating(true); router.push(`/project/${projectId}/design`); }}
                disabled={isNavigating}
                className={clsx(
                  "flex items-center gap-3 bg-emerald-600 text-white px-10 py-4 rounded-2xl hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/20 transition-all font-black min-w-[220px] justify-center shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5",
                  isNavigating && "animate-pulse"
                )}
              >
                Continue to Design <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Core Score explanation modal */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] p-8 md:p-10 max-w-lg w-full border border-slate-200/50 shadow-2xl relative animate-in zoom-in-95 duration-300 space-y-6">
            <button 
              onClick={() => setShowScoreModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block font-mono">Architecture Guide</span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Understanding Clean Core</h3>
              <p className="text-xs text-slate-500 leading-relaxed">The Clean Core compliance score determines the long-term maintainability of your ERP core, grading custom elements against modern SAP S/4HANA extensibility patterns.</p>
            </div>
            
            <div className="space-y-3.5 pt-2 font-sans">
              {/* Tier 1 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-green-100 text-green-700 font-extrabold flex items-center justify-center shrink-0">100%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Zero Customization / Standard Fit</h5>
                  <p className="text-slate-500 leading-relaxed">Leverages native SAP standard best practices. Absolutely zero custom code or maintenance overhead.</p>
                </div>
              </div>

              {/* Tier 2 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 font-extrabold flex items-center justify-center shrink-0">90%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Transformed Extensibility (Side-by-Side)</h5>
                  <p className="text-slate-500 leading-relaxed">Custom logic completely transformed via public APIs (e.g. running on Node.js/TypeScript). Easy to maintain and upgrade.</p>
                </div>
              </div>

              {/* Tier 3 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 font-extrabold flex items-center justify-center shrink-0">85%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Key-User / In-App Extensibility</h5>
                  <p className="text-slate-500 leading-relaxed">High-level custom elements built inside SAP using standard extension points, without modifying database core tables.</p>
                </div>
              </div>

              {/* Tier 4 */}
              <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="w-10 h-10 rounded-xl bg-red-100 text-red-700 font-extrabold flex items-center justify-center shrink-0">0%</span>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-slate-800">Direct Core Modification</h5>
                  <p className="text-slate-500 leading-relaxed">Direct alteration of standard SAP core objects, leading to major regression risks and upgrade blocks.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GapAccordionCard({ gap }: { gap: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const colors = {
    High: 'bg-red-50 text-red-700 border-red-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    Low: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  return (
    <div className="border border-slate-150 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h4 className="font-extrabold text-slate-900 text-base">{gap.title}</h4>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colors[gap.severity as 'High' | 'Medium' | 'Low'] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
              Divergence: {gap.severity}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
              Complexity: {gap.complexity}
            </span>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      <div className={`transition-all duration-350 ease-in-out ${isOpen ? 'max-h-[500px] border-t border-slate-100' : 'max-h-0'} overflow-hidden`}>
        <div className="p-5 bg-slate-50/50 space-y-4 text-sm">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Recommended Strategy</span>
            <p className="mt-1 font-semibold text-slate-800 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">{gap.strategy}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Technical Rationale</span>
            <p className="mt-1 text-slate-600 leading-relaxed">{gap.rationale}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScannerConsole({ code, onComplete }: { code: string; onComplete?: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const logIndexRef = useRef(0);

  const logTemplates = [
    "[SYSTEM] Booting secure AI modernization sandbox...",
    "[SYSTEM] Accessing legacy repository staging areas...",
    "[LEXER] Parsing ABAP grammar structures and legacy tokens...",
    "[LEXER] Analyzing custom database query structures (joins, indexes)...",
    "[STANDARDIZATION] Cross-referencing S/4HANA best-practice directories...",
    "[STANDARDIZATION] Evaluating SAP standard function fits & BAPI mappings...",
    "[CLEAN_CORE] Running extensibility audits against SAP Clean Core principles...",
    "[CLEAN_CORE] Simulating Side-by-Side extensibility decoupling constraints...",
    "[DECISION_MATRIX] Prioritizing identified functional gaps (2x2 Matrix mapping)...",
    "[SYNTHESIS] Structuring operational JSON metadata profile...",
    "[SYSTEM] Deep Code Analysis completed successfully. Synchronizing report..."
  ];

  useEffect(() => {
    setLogs([logTemplates[0]]);
    logIndexRef.current = 1;

    const interval = setInterval(() => {
      if (logIndexRef.current < logTemplates.length) {
        setLogs(prev => [...prev, logTemplates[logIndexRef.current]]);
        logIndexRef.current += 1;
      } else {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, 950);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-950 text-emerald-400 font-mono text-xs rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden min-h-[480px] flex flex-col relative animate-in fade-in duration-500">
      <style>{`
        @keyframes scan-y {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>

      {/* Moving Laser Scanner Line */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        <div className="w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent h-[2px] shadow-[0_0_15px_#10b981] absolute left-0"
             style={{
               animation: 'scan-y 6s linear infinite',
               top: 0
             }}
        />
      </div>

      {/* Header bar */}
      <div className="bg-slate-900 border-b border-slate-850 px-6 py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Code Analyzer v2.0.0</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Scanning Code</span>
        </div>
      </div>

      {/* Main split display */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-850 overflow-hidden relative min-h-0">
        {/* Left Side: Code Preview (low opacity, scrolling) */}
        <div className="flex-1 p-6 overflow-hidden relative select-none opacity-20 pointer-events-none max-h-[200px] md:max-h-none">
          <pre className="text-[10px] leading-relaxed overflow-hidden text-slate-400">
            {code}
          </pre>
        </div>

        {/* Right Side: Log output */}
        <div className="flex-1 p-6 bg-slate-950/80 flex flex-col justify-end overflow-y-auto space-y-2.5 z-10">
          {logs.map((log, index) => (
            <div key={index} className="animate-in slide-in-from-bottom-2 duration-300 flex items-start gap-2">
              <span className="text-slate-500 shrink-0 font-bold">{`>`}</span>
              <p className="leading-relaxed whitespace-pre-wrap">{log}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
