'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { UploadCloud, FileCode2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, RefreshCw, Activity, Download, ChevronDown, X, HelpCircle, Info, Sparkles, Trash2, Layers, Shield, BarChart3, Package, Link2, Cpu, Zap } from 'lucide-react';
import clsx from 'clsx';
import nextDynamic from 'next/dynamic';
import { DocumentSection } from '@/components/DocumentSection';
import { Components } from 'react-markdown';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { callGemini } from '@/lib/gemini';
import type { Project, AnalysisData, CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import GlossaryTerm from '@/components/GlossaryTerm';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { extractCodeInventory, extractDataCoupling, computeComplexityScore, computeCriticalityScore, recommendArchitecture } from '@/lib/abap/code-assessment';
import { APP_VERSION } from '@/lib/version';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import type { SourceFile } from '@/lib/abap/findings-detector';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

import CodeInventoryTable from '@/components/analyze/CodeInventoryTable';
import DataCouplingTable from '@/components/analyze/DataCouplingTable';
import BusinessValueAudit from '@/components/analyze/BusinessValueAudit';
import PlainEnglishGuide from '@/components/analyze/PlainEnglishGuide';
import ExtensibilityDecisionMatrix from '@/components/analyze/ExtensibilityDecisionMatrix';
import TargetScopeMapping from '@/components/analyze/TargetScopeMapping';
import ModernizationStrategy from '@/components/analyze/ModernizationStrategy';
import ArchitecturalNextSteps from '@/components/analyze/ArchitecturalNextSteps';
import CoverageVerdict from '@/components/analyze/CoverageVerdict';
import ConstructFindings from '@/components/analyze/ConstructFindings';
import GapsWorklist from '@/components/analyze/GapsWorklist';
import MissingDependencyPrompt from '@/components/analyze/MissingDependencyPrompt';
import PreAnalysisPreview from '@/components/analyze/PreAnalysisPreview';

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
  const { profile, incrementTransformations } = useUserProfile();
  // Help Mode removed — Ask AI chatbot replaces this functionality
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);
  const [targetDeployment, setTargetDeployment] = useState<'public' | 'private' | null>(null);
  const [showConceptQuestion, setShowConceptQuestion] = useState(false);
  const [modalSelection, setModalSelection] = useState<'public' | 'private' | null>(null);
  const isFromExample = searchParams.get('fromExample') === 'true' || !!project?.fromExample || project?.isExample;
  const [acceptedTerms, setAcceptedTerms] = useState(searchParams.get('fromExample') === 'true');
  const [uploadedFileName, setUploadedFileName] = useState('manual-input.abap');
  const [activeTab, setActiveTab] = useState<'evidence' | 'backlog' | 'detailed' | 'strategy'>('evidence');
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleUpdateWorklist = async (updatedWorklist: any[]) => {
    try {
      const docRef = doc(getDb(), 'projects', projectId as string);
      await updateDoc(docRef, { worklist: updatedWorklist });
      setProject((prev: any) => prev ? { ...prev, worklist: updatedWorklist } : prev);
    } catch (err) {
      console.error('Failed to update project worklist:', err);
    }
  };

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
          const data = docSnap.data();
          setProject({ id: docSnap.id, ...data } as any);
          setLegacyCode(data.legacyCode || '');
          if (data.s4Deployment) {
            setTargetDeployment(data.s4Deployment as 'public' | 'private');
          }
          if (data.fromExample || data.isExample || searchParams.get('fromExample') === 'true') {
            setAcceptedTerms(true);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `projects/${projectId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, searchParams]);

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

  const scanForMaliciousCode = (content: string, fileName: string): string | null => {
    if (!fileName.endsWith('.abap') && !fileName.endsWith('.txt')) {
      return 'Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.';
    }

    const lower = content.toLowerCase();

    // Exploit / Script Injection Checks
    const maliciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /system\s*\(/i,
      /spawn\s*\(/i,
      /fork\s*\(/i,
      /sh\s+-c/i,
      /bash\s+-c/i,
      /cmd\.exe/i,
      /powershell/i
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(content)) {
        return 'Security Block: Malicious script or shell injection payload detected in staged code. Raw iframe elements, shell commands, and execution wrappers are blocked.';
      }
    }

    // Plaintext SAP Secrets Check
    const secretKeywords = [
      "sap_pass", "db_password", "client_secret", "begin private key", "-----begin"
    ];
    for (const key of secretKeywords) {
      if (lower.includes(key)) {
        return 'Security Block: Plaintext security credential leak detected. Master passwords or private keys are prohibited to prevent corporate security breaches.';
      }
    }

    return null;
  };

  const handleFile = (file: File) => {
    setError('');
    
    // Scan file metadata first
    if (!file.name.endsWith('.abap') && !file.name.endsWith('.txt')) {
        setError('Security Block: Unauthorized file type. Only standard ABAP source (.abap) or plain text (.txt) files are permitted.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Perform automated malicious payload scan
      const scanResult = scanForMaliciousCode(content, file.name);
      if (scanResult) {
        setError(scanResult);
        setLegacyCode(''); // Clear staged code
        return;
      }

      if (!isLegacyCode(content)) {
          setError('The file does not appear to contain valid legacy code.');
          return;
      }
      setLegacyCode(content);
      setUploadedFileName(file.name);
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
    setLoadingMessage('Parsing ABAP grammar structures and legacy tokens...');

    const stages = [
      'Parsing ABAP grammar structures and legacy tokens...',
      'Resolving inheritance trees and class dependencies...',
      'Cross-referencing S/4HANA best-practice released APIs...',
      'Running extensibility audits & findings assessments...',
      'Structuring operational JSON metadata profile...'
    ];
    let stageIdx = 0;
    const stageInterval = setInterval(() => {
      if (stageIdx < stages.length - 1) {
        stageIdx++;
        setLoadingMessage(stages[stageIdx]);
      }
    }, 2000);

    try {
      const abapSources = [{ file: uploadedFileName || 'main.abap', content: codeToAnalyze }];
      const mockModel: ClassModel = {
        root: 'MAIN',
        nodes: {
          'MAIN': {
            key: 'MAIN', kind: 'class', source: { file: uploadedFileName || 'main.abap', line: 1 },
            isStandard: false, isAbstract: false, isFinal: false,
            interfaces: [], friends: [], methods: [], attributes: [], events: [], aliases: []
          }
        },
        edges: [],
        linearization: ['MAIN'],
        resolved: true,
        missing: [],
        findings: []
      };
      const detectedFindings = detectFindings(mockModel, abapSources);

      const prompt = `You are analyzing a legacy SAP ABAP custom codebase for modernization. The customer has defined their target operating model as: SAP S/4HANA Cloud, ${targetDeployment === 'public' ? 'Public Edition (strict SaaS, zero modifications allowed)' : 'Private Edition / RISE (3-Tier Extensibility Model, allowing custom Tier 2 API wrappers)'}.

Here are the statically identified code findings for this package:
${JSON.stringify(detectedFindings, null, 2)}
      
      Analyze the legacy SAP ABAP code and the statically detected code findings to provide a highly practical, down-to-earth IT and Business assessment. You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface AnalysisData {
  projectTitle: string; 
  cleanCoreScore: number; 
  summary: string; 
  asIsContext: string; 
  standardFit: {
    potential: 'High' | 'Medium' | 'Low';
    targetStandardProcess: string; 
    rationale: string; 
  };
  gaps: Array<{
    title: string; 
    severity: 'High' | 'Medium' | 'Low'; 
    strategy: string; 
    rationale: string; 
    complexity: 'High' | 'Medium' | 'Low'; 
  }>;
  recommendations: {
    keepCoreClean: string; // STEP 1: What standard SAP replacement exists? Name the EXACT standard object (e.g. "Use released CDS view I_Customer instead of SELECT on KNA1"). Do NOT say "rewrite" here — only name the standard alternative.
    decommissioning: string; // STEP 2: What legacy objects can be deleted/retired AFTER the standard alternative from Step 1 is adopted? Be explicit: "Delete Z_CUSTOMER_GET_DETAIL function module once consumers migrate to I_Customer". Must be consistent with keepCoreClean.
    cloudReadiness: string; // STEP 3: If Step 1 fully replaces the legacy code, state "No rewrite needed — standard replacement covers all functionality." If Step 1 only partially covers, describe ONLY the remaining gap that needs ABAP Cloud or Tier 2 wrapping. NEVER contradict Step 1 or Step 2.
  };
  strategicNextSteps: string[]; 
  extensibilityRouting: {
    recommendedRoute: 'Side-by-Side (SAP BTP)' | 'In-App (ABAP Cloud)'; 
    confidenceScore: number; 
    rationale: string; 
    targetArtifact: string; 
    decisionTreeCheckpoints: Array<{
      checkpointName: string; 
      question: string; 
      evaluation: string; 
      resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
      cleanCoreImpact: string; 
    }>;
    comparativeAnalysis: {
      inAppABAPCloud: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string; 
        pros: string[]; 
        cons: string[]; 
      };
      sideBySideBTP: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string; 
        pros: string[]; 
        cons: string[]; 
    };
  };
  businessValueAnalysis: {
    legacyAssetScore: number; 
    technicalDebtLevel: 'Low' | 'Medium' | 'High';
    estimatedMaintenanceCost: number; 
    valueDrivers: string[]; 
    cloudRoiSummary: string; 
    plainEnglishActionPlan: string[]; 
  };
}

Legacy Code to Analyze:
${codeToAnalyze}`;

      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true, profile?.geminiApiKey);
      
      let recommendedRoute = 'Side-by-Side (SAP BTP)';
      let cleanCoreScore = 0;
      let normalizedAnalysis = responseText;
      let initialWorklist: any[] = [];
      try {
        let cleaned = responseText.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
        const parsed = JSON.parse(cleaned);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (obj && typeof obj === 'object') {
          normalizedAnalysis = JSON.stringify(obj);
          if (obj.extensibilityRouting?.recommendedRoute) {
            recommendedRoute = obj.extensibilityRouting.recommendedRoute;
          }
          if (typeof obj.cleanCoreScore === 'number') {
            cleanCoreScore = obj.cleanCoreScore;
          }

          const gapsList = obj.gaps || [];
          initialWorklist = [
            ...detectedFindings.map((f: SupportFinding, idx: number) => ({
              id: `finding-${f.construct}-${idx}`,
              title: f.title,
              category: 'Finding',
              level: f.level,
              severity: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
              location: f.location ? `${f.location.file}:${f.location.line}` : 'main.abap',
              recommendation: f.recommendation,
              status: f.requiresSignOff ? 'open' : 'signed_off',
              effort: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
              targetAnchor: f.targetAnchor || '',
              detail: f.detail
            })),
            ...gapsList.map((g: any, idx: number) => ({
              id: `gap-${idx}`,
              title: g.title,
              category: 'Functional Gap',
              severity: g.severity,
              location: 'S/4HANA Configuration',
              recommendation: g.rationale,
              strategy: g.strategy,
              status: 'open',
              effort: g.complexity
            }))
          ];
        }
      } catch (e) {
        console.error('Failed to parse analysis JSON for routing', e);
      }

      const inventory = extractCodeInventory(codeToAnalyze);
      const coupling = extractDataCoupling(codeToAnalyze);
      const complexityScore = computeComplexityScore(codeToAnalyze);
      const criticalityScore = computeCriticalityScore(codeToAnalyze);
      const archRecommendation = recommendArchitecture(codeToAnalyze, inventory, coupling, recommendedRoute);

      // ── Reconcile AI score with deterministic findings ───────────
      // The AI-generated cleanCoreScore can contradict the deterministic
      // Coverage Verdict (e.g. 65% score but 100% fully supported).
      // We merge both signals into one coherent number.
      const totalFindings = detectedFindings.length;
      const fullyCount = detectedFindings.filter((f: SupportFinding) => f.level === 'fully').length;
      const partialCount = detectedFindings.filter((f: SupportFinding) => f.level === 'partial').length;
      const deterministicPercent = totalFindings > 0
        ? Math.round(((fullyCount + partialCount * 0.5) / totalFindings) * 100)
        : 100; // no findings = assume clean
      
      // Blend: 40% deterministic weight, 60% AI weight, then clamp
      const reconciledScore = Math.round(deterministicPercent * 0.4 + cleanCoreScore * 0.6);
      // If deterministic says 100% but AI says <80%, floor at 80
      const finalCleanCoreScore = deterministicPercent === 100
        ? Math.max(reconciledScore, 80)
        : Math.min(reconciledScore, deterministicPercent + 10); // don't overshoot deterministic ceiling

      try {
        const isAlreadyCharged = project?.charged || false;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(codeToAnalyze));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const detectObjectType = (code: string): string => {
          if (/^\s*CLASS\s+/im.test(code)) return 'Class';
          if (/^\s*INTERFACE\s+/im.test(code)) return 'Interface';
          if (/^\s*FUNCTION\s+/im.test(code)) return 'Function Module';
          if (/^\s*REPORT\s+/im.test(code)) return 'Report';
          if (/^\s*FORM\s+/im.test(code)) return 'Form Routine';
          return 'ABAP Source';
        };

        await updateDoc(doc(getDb(), 'projects', projectId as string), {
          legacyCode: codeToAnalyze,
          s4Deployment: targetDeployment,
          analysis: normalizedAnalysis,
          extensibilityRoute: recommendedRoute,
          cleanCoreScore: finalCleanCoreScore,
          status: 'analyzed',
          charged: true,
          transformationBypass: true,
          worklist: initialWorklist,
          codeInventory: inventory,
          dataCoupling: coupling,
          complexityScore,
          criticalityScore,
          originalRecommendation: archRecommendation.architecture,
          recommendationConfidence: archRecommendation.confidence,
          recommendationJustification: archRecommendation.justification,
          'auditMetadata.inputFingerprint': {
            sha256: hashHex,
            fileName: uploadedFileName,
            lineCount: codeToAnalyze.split('\n').length,
            byteSize: encoder.encode(codeToAnalyze).byteLength,
            uploadedAt: new Date().toISOString(),
            objectType: detectObjectType(codeToAnalyze),
          },
          'auditMetadata.modelCard': {
            provider: 'google-gemini',
            model: 'gemini-3-flash-preview',
            engineVersion: APP_VERSION,
            byokUsed: !!profile?.geminiApiKey,
            analysisTimestamp: new Date().toISOString(),
          },
        });

        if (!isAlreadyCharged) {
          try {
            await incrementTransformations();
          } catch (e) {
            console.error("Non-blocking error during incrementTransformations:", e);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
      }
      setProject((prev: Project | null) => 
        prev 
          ? { 
              ...prev, 
              legacyCode: codeToAnalyze,
              analysis: normalizedAnalysis, 
              extensibilityRoute: recommendedRoute, 
              s4Deployment: targetDeployment, 
              cleanCoreScore,
              charged: true,
              transformationBypass: true,
              worklist: initialWorklist,
              codeInventory: inventory,
              dataCoupling: coupling,
              complexityScore,
              criticalityScore,
              originalRecommendation: archRecommendation.architecture,
              recommendationConfidence: archRecommendation.confidence,
              recommendationJustification: archRecommendation.justification,
            } 
          : null
      );
    } catch (err: unknown) {
      console.error('Analysis Error:', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('{')) {
        throw err;
      }
      setError(`Failed to analyze the code: ${errMessage || 'Unknown error'}. Please try again.`);
    } finally {
      clearInterval(stageInterval);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  useEffect(() => {
    if (autoAnalyze === 'true' && legacyCode && !project?.analysis && !hasAutoAnalyzed.current) {
      hasAutoAnalyzed.current = true;
      handleAnalyze(legacyCode);
    }
  }, [autoAnalyze, legacyCode, project?.analysis]);

  const exportToConfluence = async () => {
    if (!project?.analysis) return;

    let htmlContent = '';
    
    // Robust JSON extraction: handles objects, arrays, code fences, and string formats
    let isJson = false;
    let data: AnalysisData | null = null;
    try {
      const raw = typeof project.analysis === 'object' ? project.analysis : project.analysis;
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        data = raw as AnalysisData;
        isJson = true;
      } else if (typeof raw === 'string') {
        const cleaned = raw.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
        if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
          const parsed = JSON.parse(cleaned);
          data = Array.isArray(parsed) ? parsed[0] : parsed;
          isJson = true;
        }
      }
    } catch {}

    if (isJson && data) {
      // Local fallback for Confluence export
      const bizFallback = {
        legacyAssetScore: data.businessValueAnalysis?.legacyAssetScore || 
          (data.standardFit?.potential === 'Low' ? 82 : data.standardFit?.potential === 'Medium' ? 55 : 35),
        technicalDebtLevel: data.businessValueAnalysis?.technicalDebtLevel || 
          ((data.cleanCoreScore || 0) < 50 ? 'High' : (data.cleanCoreScore || 0) < 75 ? 'Medium' : 'Low'),
        estimatedMaintenanceCost: data.businessValueAnalysis?.estimatedMaintenanceCost || 
          (Math.max(1500, (100 - (data.cleanCoreScore || 0)) * 180 + 1200)),
        valueDrivers: data.businessValueAnalysis?.valueDrivers || 
          (data.asIsContext?.toLowerCase().includes('partner') || data.asIsContext?.toLowerCase().includes('customer')
            ? ["Business Partner Extension", "Custom Database Mapping", "ERP Outbound Decoupled Sync"]
            : ["Custom Transaction Logic", "Validation Rule Engine", "Core Schema Enhancements"]),
        cloudRoiSummary: data.businessValueAnalysis?.cloudRoiSummary || 
          `Transforming this logic to a modern extensibility model will reduce core upgrade testing costs by ~40%, eliminate code maintenance overhead, and support alignment with S/4HANA Clean Core principles.`,
        plainEnglishActionPlan: data.businessValueAnalysis?.plainEnglishActionPlan || [
          "1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.",
          "2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.",
          `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${project.extensibilityRoute || data.extensibilityRouting?.recommendedRoute || 'decoupled'} architecture.`
        ]
      };

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

            <h2>Business Value & Executive Action Center</h2>
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
              <div class="card" style="border-left: 4px solid #00875a; background: #e3fcef10;">
                <div class="card-title" style="color: #00875a;">Business Asset & ROI Audit</div>
                <p style="font-size: 13px; margin-bottom: 8px;"><strong>Legacy Asset Score:</strong> ${bizFallback.legacyAssetScore}% (Custom IP Value)</p>
                <p style="font-size: 13px; margin-bottom: 8px;"><strong>Technical Debt Level:</strong> ${bizFallback.technicalDebtLevel}</p>
                <p style="font-size: 13px; margin-bottom: 12px;"><strong>Estimated Annual Maintenance Cost:</strong> ${bizFallback.estimatedMaintenanceCost.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}/yr</p>
                <div style="font-size: 12px; margin-bottom: 6px;"><strong>Value Drivers:</strong></div>
                <ul style="font-size: 12px; padding-left: 20px; margin-bottom: 10px;">
                  ${bizFallback.valueDrivers.map(d => `<li>${d}</li>`).join('')}
                </ul>
                <p style="font-size: 12px; font-weight: bold; background: #effcf6; padding: 10px; border-radius: 6px; border: 1px solid #d3f9e8; color: #006644; margin-top: 10px;">
                  <strong>Expected Cloud ROI:</strong> ${bizFallback.cloudRoiSummary}
                </p>
              </div>
              <div class="card" style="border-left: 4px solid #0747a6; background: #deebff10;">
                <div class="card-title" style="color: #0747a6;">Plain English Stakeholder Roadmap</div>
                <p style="font-size: 13px; color: #5e6c84; margin-bottom: 12px; font-style: italic;">Simplified action items to modernize this business capability successfully:</p>
                <ul style="font-size: 13px; line-height: 1.8; padding-left: 20px; font-weight: bold; color: #253858;">
                  ${bizFallback.plainEnglishActionPlan.map(action => `<li style="margin-bottom: 8px;">${action}</li>`).join('')}
                </ul>
              </div>
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

            <h2>Detailed Technical Assessment</h2>
            ${project.complexityScore !== undefined || project.criticalityScore !== undefined ? `
            <div class="card-grid" style="grid-template-cols: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
              ${project.complexityScore !== undefined ? `
              <div class="card" style="border-left: 4px solid ${project.complexityScore >= 7 ? '#de350b' : project.complexityScore >= 4 ? '#ff991f' : '#00875a'};">
                <div class="card-title">Complexity Score</div>
                <p style="font-size: 28px; font-weight: bold; margin: 0;">${project.complexityScore}<span style="color: #6b778c; font-size: 14px;">/10</span></p>
                <p style="font-size: 12px; color: #6b778c; margin-top: 4px;">${project.complexityScore >= 7 ? 'High — significant refactoring needed' : project.complexityScore >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration'}</p>
              </div>` : ''}
              ${project.criticalityScore !== undefined ? `
              <div class="card" style="border-left: 4px solid ${project.criticalityScore >= 7 ? '#de350b' : project.criticalityScore >= 4 ? '#ff991f' : '#00875a'};">
                <div class="card-title">Criticality Score</div>
                <p style="font-size: 28px; font-weight: bold; margin: 0;">${project.criticalityScore}<span style="color: #6b778c; font-size: 14px;">/10</span></p>
                <p style="font-size: 12px; color: #6b778c; margin-top: 4px;">${project.criticalityScore >= 7 ? 'Mission-critical — requires careful planning' : project.criticalityScore >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate'}</p>
              </div>` : ''}
            </div>` : ''}

            ${(project.codeInventory || []).length > 0 ? `
            <h3>Code Inventory</h3>
            <table>
              <thead><tr>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Object Type</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Object Name</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Lines</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Category</th>
              </tr></thead>
              <tbody>
                ${(project.codeInventory || []).map((item: any) => `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${item.objectType || ''}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${item.objectName || ''}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${item.lineCount || 'N/A'}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${item.category || ''}</td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}

            ${(project.dataCoupling || []).length > 0 ? `
            <h3>Data Coupling Analysis</h3>
            <table>
              <thead><tr>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Table</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Access Type</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Occurrences</th>
                <th style="background:#f4f5f7;padding:10px;font-size:11px;text-transform:uppercase;color:#6b778c;">Risk Level</th>
              </tr></thead>
              <tbody>
                ${(project.dataCoupling || []).map((item: any) => `<tr>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;font-weight:bold;">${item.tableName || ''}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${item.accessType || ''}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;">${item.occurrences || 0}</td>
                  <td style="padding:10px;border-bottom:1px solid #ebecf0;"><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;background:${item.isDirectWrite ? '#ffebe6' : '#e3fcef'};color:${item.isDirectWrite ? '#de350b' : '#006644'};">${item.isDirectWrite ? 'Direct Write' : 'Read Only'}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}

            <div style="margin-top: 40px; padding: 16px; background: #f4f5f7; border-radius: 8px; text-align: center; font-size: 11px; color: #6b778c;">
              Report generated by Clean-Core.io v1.13 | All tabs exported | ${new Date().toISOString()}
            </div>
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
            ${renderMarkdownSafe(project.analysis)}
          </div>
        </body>
        </html>
      `;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const fileSaver = await import('file-saver');
    const save = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
    save(blob, `${project.name.replace(/\s+/g, '_')}_Business_Analysis.html`);
    
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

  // Re-derive static findings from the stored legacy code for the Evidence tab
  const { findings, findingsSummary, missingDeps } = useMemo(() => {
    if (!legacyCode) return { findings: [] as SupportFinding[], findingsSummary: null, missingDeps: [] as import('@/lib/abap/class-model').MissingDependency[] };
    const abapSources: SourceFile[] = [{ file: uploadedFileName || 'main.abap', content: legacyCode }];
    const mockModel: ClassModel = {
      root: 'MAIN',
      nodes: {
        'MAIN': {
          key: 'MAIN', kind: 'class', source: { file: uploadedFileName || 'main.abap', line: 1 },
          isStandard: false, isAbstract: false, isFinal: false,
          interfaces: [], friends: [], methods: [], attributes: [], events: [], aliases: []
        }
      },
      edges: [],
      linearization: ['MAIN'],
      resolved: true,
      missing: [],
      findings: []
    };

    // Detect potential missing dependencies from ABAP references
    const detectedMissing: import('@/lib/abap/class-model').MissingDependency[] = [];
    const className = legacyCode.match(/^\s*CLASS\s+(\w+)/im)?.[1] || 'MAIN';
    // Superclass references
    const superMatch = legacyCode.match(/INHERITING\s+FROM\s+(\w+)/i);
    if (superMatch && !superMatch[1].startsWith('CL_') && !superMatch[1].startsWith('IF_')) {
      detectedMissing.push({
        ref: superMatch[1], kind: 'superclass', referencedBy: className,
        at: { file: uploadedFileName || 'main.abap', line: 1 }, impact: 'blocks-resolution'
      });
    }
    // Interface references
    const ifMatches = legacyCode.matchAll(/INTERFACES\s+(\w+)/gi);
    for (const m of ifMatches) {
      if (!m[1].startsWith('IF_')) {
        detectedMissing.push({
          ref: m[1], kind: 'interface', referencedBy: className,
          at: { file: uploadedFileName || 'main.abap', line: 1 }, impact: 'reduces-confidence'
        });
      }
    }

    const detected = detectFindings(mockModel, abapSources);
    const summary = summarize(detected, mockModel);
    return { findings: detected, findingsSummary: summary, missingDeps: detectedMissing };
  }, [legacyCode, uploadedFileName]);

  // ── Live-reconcile Clean Core Score ──
  // Generic formula: deterministic construct coverage is the primary signal.
  // Standard Fit (from AI) indicates whether a replacement path exists.
  // AI-stored score is only a minor correction to avoid wild disagreement.
  //
  // Score semantics: "How ready is this code for Clean Core migration?"
  //   - All constructs supported + High standard fit = 100%  (clear quick win)
  //   - All constructs supported + Medium standard fit = 90% (path exists, some effort)
  //   - Partial constructs + any fit = proportional (gaps need work)
  //   - Out-of-scope constructs = lower (blocking issues)
  const liveCleanCoreScore = useMemo(() => {
    const stored = project?.cleanCoreScore ?? 0;
    const totalF = findings.length;
    const fullyCount = findings.filter(f => f.level === 'fully').length;
    const partialCount = findings.filter(f => f.level === 'partial').length;
    // 0 findings = trivially clean code → 100% coverage
    const coveragePct = totalF > 0
      ? Math.round(((fullyCount + partialCount * 0.5) / totalF) * 100)
      : 100;

    // Extract standard fit from stored analysis (generic — works for any project)
    let standardFitBonus = 80; // default if not available
    try {
      const analysis = typeof project?.analysis === 'object' ? project.analysis : 
        (typeof project?.analysis === 'string' ? JSON.parse(project.analysis.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim()) : null);
      const fit = analysis?.standardFit?.potential || '';
      if (/high/i.test(fit)) standardFitBonus = 100;
      else if (/medium/i.test(fit)) standardFitBonus = 80;
      else if (/low/i.test(fit)) standardFitBonus = 60;
    } catch { /* ignore parse errors */ }

    // Weighted: 60% construct coverage, 30% standard fit, 10% stored AI score
    const weighted = Math.round(coveragePct * 0.6 + standardFitBonus * 0.3 + stored * 0.1);
    // Clamp to [0, 100]
    return Math.min(100, Math.max(0, weighted));
  }, [findings, project?.cleanCoreScore, project?.analysis]);

  const renderAnalysisContent = () => {
    if (!project?.analysis) return null;
    
    let analysisData: AnalysisData | null = null;
    try {
      if (typeof project.analysis === 'object' && project.analysis !== null && !Array.isArray(project.analysis)) {
        analysisData = project.analysis as unknown as AnalysisData;
      } else if (typeof project.analysis === 'string') {
        const cleaned = project.analysis.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
        if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
          const parsed = JSON.parse(cleaned);
          analysisData = Array.isArray(parsed) ? parsed[0] : parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON analysis, falling back to markdown rendering', e);
    }

    if (analysisData) {
      // Sync analysisData.cleanCoreScore with the centrally computed live value
      analysisData.cleanCoreScore = liveCleanCoreScore;
      const bizFallback = {
        legacyAssetScore: analysisData.businessValueAnalysis?.legacyAssetScore || 
          (analysisData.standardFit?.potential === 'Low' ? 82 : analysisData.standardFit?.potential === 'Medium' ? 55 : 35),
        technicalDebtLevel: analysisData.businessValueAnalysis?.technicalDebtLevel || 
          ((analysisData.cleanCoreScore || 0) < 50 ? 'High' : (analysisData.cleanCoreScore || 0) < 75 ? 'Medium' : 'Low'),
        estimatedMaintenanceCost: analysisData.businessValueAnalysis?.estimatedMaintenanceCost || 
          (Math.max(1500, (100 - (analysisData.cleanCoreScore || 0)) * 180 + 1200)),
        valueDrivers: analysisData.businessValueAnalysis?.valueDrivers || 
          (analysisData.asIsContext?.toLowerCase().includes('partner') || analysisData.asIsContext?.toLowerCase().includes('customer')
            ? ["Business Partner Extension", "Custom Database Mapping", "ERP Outbound Decoupled Sync"]
            : ["Custom Transaction Logic", "Validation Rule Engine", "Core Schema Enhancements"]),
        cloudRoiSummary: analysisData.businessValueAnalysis?.cloudRoiSummary || 
          `Transforming this logic to a modern extensibility model will reduce core upgrade testing costs by ~40%, eliminate code maintenance overhead, and support alignment with S/4HANA Clean Core principles.`,
        plainEnglishActionPlan: analysisData.businessValueAnalysis?.plainEnglishActionPlan || [
          "1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.",
          "2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.",
          `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${analysisData.extensibilityRouting?.recommendedRoute || 'decoupled'} architecture.`
        ]
      };
const isBtp = (project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP');
      const checkpoints = analysisData.extensibilityRouting?.decisionTreeCheckpoints;
      const comparative = analysisData.extensibilityRouting?.comparativeAnalysis;

      return (
        <div className="space-y-8 font-sans">
          {/* Tab Navigation Menu — Premium with Icons */}
          <div className="sticky top-[128px] z-40 -mx-6 md:-mx-12 bg-white/95 backdrop-blur-md border-b-2 border-slate-200 shadow-md">
            <div className="px-4 md:px-8 pt-2 pb-0 flex items-center gap-0 overflow-x-auto">
              {[
                { id: 'evidence', label: 'Decision & Evidence', Icon: Shield },
                { id: 'backlog', label: 'Gaps Backlog', Icon: AlertCircle },
                { id: 'detailed', label: 'Assessment & Value', Icon: BarChart3 },
                { id: 'strategy', label: 'Modernization Strategy', Icon: Zap }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    "relative px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 border-b-[3px] whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-emerald-500 text-slate-900 bg-emerald-50/40"
                      : "border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50/60"
                  )}
                >
                  <tab.Icon size={15} className={clsx(
                    "shrink-0 transition-all",
                    activeTab === tab.id ? "text-emerald-600" : "text-slate-400"
                  )} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {/* Explore all tabs hint — only shows on first tab */}
            {activeTab === 'evidence' && (
              <div className="px-6 md:px-12 py-1.5 bg-amber-50/70 border-t border-amber-100/80 text-center">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  ← Explore all 4 report sections before proceeding to Solution Design →
                </p>
              </div>
            )}
          </div>

          {/* TAB CONTENT: Decision & Evidence */}
          {activeTab === 'evidence' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Missing Dependency Prompt — surfaces gaps upfront */}
              {missingDeps.length > 0 && (
                <MissingDependencyPrompt missing={missingDeps} />
              )}
              {/* Core metrics panel */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-stretch">
                {/* Circular SVG Gauge for Clean Core Score */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                  
                  <div className="flex items-center gap-1.5 mb-4 relative z-10">
                    <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase">Clean Core Score</span>
                    <button 
                      type="button"
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
                        strokeDashoffset={351.8 - (351.8 * liveCleanCoreScore) / 100}
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-3xl font-extrabold text-white tracking-tight">{liveCleanCoreScore}%</span>
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
                        {(project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)').includes('BTP') 
                          ? <GlossaryTerm termKey="BTP" className="border-b-0 hover:text-blue-700 text-blue-700">☁️ BTP Side-by-Side</GlossaryTerm> 
                          : <GlossaryTerm termKey="RAP" className="border-b-0 hover:text-emerald-700 text-emerald-700">⚙️ ABAP Cloud (RAP)</GlossaryTerm>}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {analysisData.extensibilityRouting?.confidenceScore || 95}% Conf.
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">
                      Target: {analysisData.extensibilityRouting?.targetArtifact || ((project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || '').includes('BTP') 
                        ? <GlossaryTerm termKey="CAP" className="text-xs font-black text-slate-800 border-b-0 uppercase">SAP BTP Node.js App (CAP)</GlossaryTerm> 
                        : <GlossaryTerm termKey="RAP" className="text-xs font-black text-slate-800 border-b-0 uppercase">RAP Business Object</GlossaryTerm>)}
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
                        
                        const docRef = doc(getDb(), 'projects', projectId as string);
                        await updateDoc(docRef, { extensibilityRoute: nextRoute });
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
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Analysis Summary</span>
                      <span className={clsx(
                        "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-sm",
                        (project.s4Deployment || 'public') === 'public'
                          ? "bg-green-50 text-green-700 border-green-200/60"
                          : "bg-blue-50 text-blue-700 border-blue-200/60"
                      )}>
                        {(project.s4Deployment || 'public') === 'public' ? '☁️ S/4HANA Public Cloud' : '🛡️ Private Cloud / RISE'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mt-2 mb-3">{analysisData.projectTitle || project.name}</h3>
                    <p className="text-slate-655 text-sm leading-relaxed">{analysisData.summary}</p>
                  </div>
                  <div className="border-t border-slate-100 pt-4 mt-6 flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Standard Fit</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={clsx(
                          "w-2 h-2 rounded-full",
                          analysisData.standardFit?.potential === 'High' ? 'bg-green-500' :
                          analysisData.standardFit?.potential === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                        )}></span>
                        <span className="text-xs font-bold text-slate-700">{analysisData.standardFit?.potential || 'Medium'}</span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Target Process</span>
                      <p className="text-xs font-bold text-slate-800 mt-1">{analysisData.standardFit?.targetStandardProcess || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coverage verdict donut chart */}
              <CoverageVerdict findings={findings} summary={findingsSummary} />

              {/* Construct Findings checklist */}
              <ConstructFindings findings={findings} />

              {/* Executive Plain English Guide — bottom of Decision & Evidence */}
              <PlainEnglishGuide 
                plainEnglishActionPlan={bizFallback.plainEnglishActionPlan}
                extensibilityRoute={project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Decoupled Extension'}
              />
            </div>
          )}

          {/* TAB CONTENT: Gaps Backlog */}
          {activeTab === 'backlog' && (
            <div className="animate-in fade-in duration-300">
              <GapsWorklist
                projectId={projectId as string}
                project={project}
                findings={findings}
                analysisGaps={analysisData.gaps || []}
                showHelpMode={false}
                onUpdateWorklist={handleUpdateWorklist}
              />
            </div>
          )}

          {/* TAB CONTENT: Detailed Assessment */}
          {activeTab === 'detailed' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Complexity & Criticality badges — live recomputed */}
              {(() => {
                // Recompute live from code to ensure new 1-10 scale is used
                const liveComplexity = legacyCode ? computeComplexityScore(legacyCode) : project.complexityScore;
                const liveCriticality = legacyCode ? computeCriticalityScore(legacyCode) : project.criticalityScore;
                if (liveComplexity === undefined && liveCriticality === undefined) return null;
                return (
                  <div className="flex flex-wrap gap-4">
                    {liveComplexity !== undefined && (
                      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm" title="Complexity measures structural code intricacy: control flow depth, dependency count, and custom object coupling. Scale: 1 = trivial, 5 = moderate, 10 = highly complex.">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu size={14} className={clsx(
                            liveComplexity >= 7 ? 'text-red-500' : liveComplexity >= 4 ? 'text-amber-500' : 'text-emerald-500'
                          )} />
                          <span className="text-xs font-bold text-slate-500">Complexity</span>
                          <span className={clsx(
                            'text-sm font-black',
                            liveComplexity >= 7 ? 'text-red-600' : liveComplexity >= 4 ? 'text-amber-600' : 'text-emerald-600'
                          )}>{liveComplexity}<span className="text-slate-400 font-bold">/10</span></span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all', liveComplexity >= 7 ? 'bg-red-500' : liveComplexity >= 4 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${(liveComplexity / 10) * 100}%` }} />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1.5">{liveComplexity >= 7 ? 'High — significant refactoring needed' : liveComplexity >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration'}</p>
                      </div>
                    )}
                    {liveCriticality !== undefined && (
                      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm" title="Criticality measures business impact: process priority, data sensitivity, and integration depth. Scale: 1 = low impact, 5 = important, 10 = mission-critical.">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={14} className={clsx(
                            liveCriticality >= 7 ? 'text-red-500' : liveCriticality >= 4 ? 'text-amber-500' : 'text-emerald-500'
                          )} />
                          <span className="text-xs font-bold text-slate-500">Criticality</span>
                          <span className={clsx(
                            'text-sm font-black',
                            liveCriticality >= 7 ? 'text-red-600' : liveCriticality >= 4 ? 'text-amber-600' : 'text-emerald-600'
                          )}>{liveCriticality}<span className="text-slate-400 font-bold">/10</span></span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all', liveCriticality >= 7 ? 'bg-red-500' : liveCriticality >= 4 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${(liveCriticality / 10) * 100}%` }} />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1.5">{liveCriticality >= 7 ? 'Mission-critical — requires careful planning' : liveCriticality >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate'}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Code Inventory Table */}
              <CodeInventoryTable codeInventory={project.codeInventory || []} />

              {/* Data Coupling Table */}
              <DataCouplingTable dataCoupling={project.dataCoupling || []} />

              {/* Valuation details */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-12 flex flex-col">
                  <BusinessValueAudit projectId={projectId as string} bizFallback={bizFallback} />
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Modernization Strategy */}
          {activeTab === 'strategy' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {/* Decision matrix pathway */}
              <ExtensibilityDecisionMatrix 
                extensibilityRoute={project.extensibilityRoute || analysisData.extensibilityRouting?.recommendedRoute || 'Side-by-Side (SAP BTP)'}
                decisionTreeCheckpoints={checkpoints}
                comparativeAnalysis={comparative}
              />

              {/* S/4HANA Standard Fit */}
              <TargetScopeMapping 
                showHelpMode={false}
                standardFit={analysisData.standardFit}
              />

              {/* Core Clean recommendations — reconciled to avoid contradictions */}
              {(() => {
                const recs = analysisData.recommendations;
                if (!recs) return null;
                const reconciledRecs = { ...recs };
                
                // Reconcile: if decommissioning says "retire" but cloudReadiness says "rewrite", fix cloudReadiness
                const isRetire = /\b(retire|retired|decommission|removed|delete|obsolete)\b/i.test(recs.decommissioning || '');
                const isRewrite = /\b(rewrit|rewrite|rewritten|must be rewritten)\b/i.test(recs.cloudReadiness || '');
                
                if (isRetire && isRewrite) {
                  // Extract the standard replacement from keepCoreClean if available
                  const standardMatch = (recs.keepCoreClean || '').match(/(?:released|standard|use)\s+(?:CDS\s+view\s+)?([A-Z_][A-Z0-9_]*)/i);
                  const standardObj = standardMatch ? standardMatch[1] : 'the released standard object';
                  reconciledRecs.cloudReadiness = `No rewrite needed. Since the function module is being retired and replaced by ${standardObj}, no ABAP Cloud migration of the legacy code is required. Simply adopt the standard replacement and remove the custom object.`;
                }
                
                return (
                  <ModernizationStrategy 
                    showHelpMode={false}
                    recommendations={reconciledRecs}
                  />
                );
              })()}

              {/* Next Steps */}
            </div>
          )}
        </div>
      );
    }

    return (
      <div 
        className="prose prose-base md:prose-lg max-w-none text-slate-800
          prose-headings:text-slate-900 prose-headings:font-black prose-headings:tracking-tight
          prose-h1:text-2xl md:text-3xl prose-h1:mb-6 prose-h1:mt-8
          prose-h2:text-xl md:text-2xl prose-h2:mb-4 prose-h2:mt-6
          prose-h3:text-lg md:text-xl prose-h3:mb-3 prose-h3:mt-4
          prose-p:text-slate-650 prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg prose-p:mb-6
          prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-6
          prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-6
          prose-li:mb-2
          prose-strong:text-slate-900 prose-strong:font-bold
          prose-blockquote:border-l-4 prose-blockquote:border-emerald-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-6 prose-blockquote:text-slate-600
          prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs prose-code:text-emerald-700
          prose-table:w-full prose-table:my-6 prose-table:border-collapse prose-table:rounded-xl prose-table:overflow-hidden prose-table:border prose-table:border-slate-200
          prose-th:bg-slate-50 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-th:text-slate-500 prose-th:uppercase prose-th:tracking-wider prose-th:border-b prose-th:border-slate-200
          prose-td:px-4 prose-td:py-3 prose-td:text-xs md:text-sm prose-td:text-slate-700 prose-td:border-b prose-td:border-slate-100
        "
        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(project.analysis) }}
      />
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
      {/* Sticky Decision-Header */}
      {project?.analysis && (
        <div 
          className={clsx(
            "fixed left-0 right-0 z-50 transition-all duration-500 font-sans border-b border-slate-200 shadow-sm",
            isSticky 
              ? "top-[64px] opacity-100 translate-y-0" 
              : "top-0 opacity-0 -translate-y-full pointer-events-none"
          )}
        >
          {/* Blur background */}
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-0" />
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Route Badge */}
              <span className={clsx(
                "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm",
                (project.extensibilityRoute || '').includes('BTP')
                  ? "bg-blue-50 text-blue-700 border border-blue-100"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
              )}>
                {(project.extensibilityRoute || '').includes('BTP') ? '☁️ BTP Side-by-Side' : '⚙️ ABAP Cloud (RAP)'}
              </span>
              
              {/* Score */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance:</span>
                <span className="text-xs font-black text-slate-900">{liveCleanCoreScore}%</span>
              </div>

              {/* Target Deployment */}
              <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">
                Target: {project.s4Deployment === 'public' ? 'Public Cloud' : 'Private Cloud RISE'}
              </span>
            </div>

            {/* Next Step CTA */}
            <button
              onClick={() => router.push(`/project/${projectId}/design`)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-xl hover:bg-emerald-500 transition-all font-black text-[10px] uppercase tracking-wider shadow-md shadow-emerald-500/10 active:scale-95"
            >
              Continue to Design <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      <Stepper currentStep={project?.analysis ? 2 : 1} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      
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
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 animate-in slide-in-from-bottom-4 mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">S/4HANA Target Operating Model</h3>
                  <p className="text-xs text-slate-500 mt-1">Select your target deployment model. This dictates Clean Core compliant score evaluations, extensibility routing rules, and generated blueprints.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Public Cloud Card */}
                  <div 
                    onClick={() => setTargetDeployment('public')}
                    className={clsx(
                      "p-6 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[140px] active:scale-[0.98]",
                      targetDeployment === 'public'
                        ? "bg-green-50/20 border-green-500 shadow-md ring-1 ring-green-500/10"
                        : "bg-white border-slate-200 hover:border-slate-350"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-900 text-sm">☁️ Public Cloud Edition</span>
                        <span className="text-[8px] font-black text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">Strict Clean Core</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">SAP S/4HANA Cloud, Public Edition (SaaS). Custom core modifications are fully prohibited. Standard released APIs must be used exclusively.</p>
                    </div>
                  </div>

                  {/* Private Cloud Card */}
                  <div 
                    onClick={() => setTargetDeployment('private')}
                    className={clsx(
                      "p-6 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[140px] active:scale-[0.98]",
                      targetDeployment === 'private'
                        ? "bg-blue-50/20 border-blue-500 shadow-md ring-1 ring-blue-500/10"
                        : "bg-white border-slate-200 hover:border-slate-350"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-900 text-sm">🛡️ Private Cloud RISE Edition</span>
                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">3-Tier Extensibility</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">SAP S/4HANA Cloud, Private Edition / On-Premise. Supports Custom Tier 2 API Wrappers to expose legacy unreleased objects upgrade-safely.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {legacyCode && !isFromExample && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-bottom-4 mb-8">
                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Shield size={16} className="text-green-600 animate-pulse" /> Security Scan & Pilot Agreement
                </h4>
                
                {/* Visual Security Badge */}
                <div className="bg-green-50/50 border border-green-200/50 p-4 rounded-2xl text-xs text-green-900 leading-relaxed font-medium flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>Malicious Payload Check passed:</strong> Staged files are automatically scanned for malicious command injections, unauthorized file extensions, and plaintext secrets. The file <strong>is clean and safe for processing</strong>.
                  </div>
                </div>

                {/* Terms and Conditions Consent Box */}
                <label className="flex items-start gap-3 p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl cursor-pointer hover:bg-slate-55 transition-all select-none">
                  <input 
                    type="checkbox" 
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5 accent-green-600 shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-gray-700 leading-relaxed font-medium">
                    I agree to the <strong>Terms & Conditions</strong> of the Clean-Core.io community pilot. I understand this is a free prototyping platform under absolute warranty and liability disclaimer, utilizing secure Gemini models on EU-compliant servers.
                  </span>
                </label>
              </div>
            )}

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

            {/* Pre-Analysis Preview — deterministic quick scan before the big run */}
            {legacyCode && !project?.analysis && !loading && (
              <PreAnalysisPreview code={legacyCode} fileName={uploadedFileName} />
            )}

            {legacyCode && !isFromExample && (!targetDeployment || !acceptedTerms) && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl text-xs text-amber-900 leading-relaxed font-semibold flex items-start gap-3 mt-8 animate-in slide-in-from-bottom-2 duration-300">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <span className="font-bold text-sm block">📋 Aktion erforderlich:</span>
                  <p>Um die KI-Modernisierung zu starten, müssen folgende Schritte durchgeführt werden:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1 font-medium">
                    {!targetDeployment && (
                      <li>Wähle dein <strong>S/4HANA Ziel-Betriebsmodell</strong> aus (Public Cloud oder Private Cloud RISE Edition oben).</li>
                    )}
                    {!acceptedTerms && (
                      <li>Bestätige die <strong>Pilot-Nutzungsbedingungen</strong> (über die Checkbox in der Security-Box oben).</li>
                    )}
                  </ul>
                </div>
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
                onClick={() => {
                  if (!targetDeployment) {
                    setError('Please select a S/4HANA Target Operating Model (Public Cloud or Private Cloud RISE) before starting the analysis.');
                    // Scroll to top where error displays
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  if (!acceptedTerms) {
                    setError('Please agree to the Terms & Conditions of the Clean-Core.io pilot before starting the analysis.');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  setError('');
                  setModalSelection(targetDeployment);
                  setShowConceptQuestion(true);
                }}
                disabled={loading || !legacyCode || !acceptedTerms}
                className={clsx(
                  "flex items-center gap-3 bg-[#00873a] text-white px-10 py-4 rounded-2xl hover:bg-[#006b2c] hover:shadow-xl hover:shadow-green-900/20 transition-all font-black disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px] justify-center shadow-lg shadow-green-900/10",
                  loading && "animate-pulse",
                  !acceptedTerms && "opacity-50 cursor-not-allowed"
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
                onClick={() => { 
                  setIsNavigating(true); 
                  router.push(`/project/${projectId}/design`); 
                }}
                disabled={isNavigating}
                className={clsx(
                  "flex items-center gap-3 bg-emerald-600 text-white px-10 py-4 rounded-2xl hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/20 transition-all font-black min-w-[220px] justify-center shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5",
                  isNavigating && "animate-pulse"
                )}
              >
                <>Continue to Design <ArrowRight size={18} /></>
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

      {/* Target Operating Model Concept Question Modal */}
      {showConceptQuestion && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] p-8 md:p-10 max-w-2xl w-full border border-slate-200/50 shadow-2xl relative animate-in zoom-in-95 duration-300 space-y-6 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowConceptQuestion(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block font-mono">⚖️ Architecture Validation Checkpoint</span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Confirm Target Operating Model</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Before the AI Modernization Engine generates clean core recommendations, let's align on a critical architectural choice. Which target operating model is selected?
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Public Card */}
              <div 
                onClick={() => setModalSelection('public')}
                className={clsx(
                  "p-5 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[120px] active:scale-[0.98]",
                  modalSelection === 'public'
                    ? "bg-green-50/20 border-green-500 shadow-md ring-1 ring-green-500/10"
                    : "bg-white border-slate-200 hover:border-slate-350"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-slate-900 text-xs">☁️ Public Cloud</span>
                    {modalSelection === 'public' && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-semibold">Strict SaaS rules. Zero direct modifications allowed. Released standard APIs only.</p>
                </div>
              </div>

              {/* Private Card */}
              <div 
                onClick={() => setModalSelection('private')}
                className={clsx(
                  "p-5 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[120px] active:scale-[0.98]",
                  modalSelection === 'private'
                    ? "bg-blue-50/20 border-blue-500 shadow-md ring-1 ring-blue-500/10"
                    : "bg-white border-slate-200 hover:border-slate-350"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-slate-900 text-xs">🛡️ Private Cloud / RISE</span>
                    {modalSelection === 'private' && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-semibold">3-Tier Extensibility Model. Supports upgrade-safe Tier 2 custom wrappers.</p>
                </div>
              </div>
            </div>

            {/* Explanation box based on selection */}
            {modalSelection && (
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs">
                  <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>💡 Why this choice determines your modernization strategy:</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-2 leading-relaxed font-sans">
                  {modalSelection === 'public' ? (
                    <>
                      <p>
                        In <strong>SAP S/4HANA Public Cloud (Strict SaaS)</strong>, standard code modifications are entirely blocked.
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Unreleased APIs Forbidden:</strong> Any legacy unreleased SAP tables/functions used by your custom logic are unreachable.</li>
                        <li><strong>Strict Clean Core Compliance:</strong> The AI engine will prioritize <strong>BTP Side-by-Side (CAP)</strong> or <strong>In-App RAP</strong> using strictly released APIs. You must plan to decommission or completely rewrite outdated custom logic.</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p>
                        In <strong>SAP S/4HANA Private Cloud / On-Premise (RISE)</strong>, you can utilize the <strong>3-Tier Extensibility Model</strong>.
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Tier 2 API Wrappers:</strong> You can wrap legacy, unreleased SAP database tables or functions inside a custom Tier 2 API wrapper.</li>
                        <li><strong>Upgrade-Safe Bridging:</strong> This wrapper acts as an upgrade-safe bridge, exposing unreleased structures to Tier 1 Cloud Developer Extensibility (RAP/CAP) without blocking future S/4HANA core releases.</li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setShowConceptQuestion(false)} 
                className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => {
                  if (!acceptedTerms) {
                    setError('Please agree to the Terms & Conditions of the Clean-Core.io pilot before starting the analysis.');
                    setShowConceptQuestion(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  if (modalSelection) {
                    setTargetDeployment(modalSelection);
                    setShowConceptQuestion(false);
                    handleAnalyze(legacyCode);
                  }
                }} 
                disabled={!modalSelection || !acceptedTerms}
                className="bg-[#00873a] hover:bg-[#006b2c] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-2 active:scale-95 hover:shadow-lg hover:shadow-green-900/10"
              >
                Start AI Modernization Engine <ArrowRight size={14} />
              </button>
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
    <div className="bg-slate-950 text-emerald-400 font-mono text-xs rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden h-[480px] flex flex-col relative animate-in fade-in duration-500">
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
        <div className="flex-1 p-6 overflow-y-auto relative select-none opacity-20 pointer-events-none max-h-[200px] md:max-h-full scrollbar-thin scrollbar-thumb-slate-800">
          <pre className="text-[10px] leading-relaxed text-slate-400">
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
