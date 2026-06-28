'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { FileText, Download, ArrowRight, ArrowLeft, RefreshCw, Eye, LayoutTemplate, Info, X, ShieldCheck, Network } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { DocumentSection } from '@/components/DocumentSection';
import { Components } from 'react-markdown';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { callGemini } from '@/lib/gemini';
import type { Project, DesignData } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';
import GlossaryTerm from '@/components/GlossaryTerm';
import ArchitectSignOff from '@/components/ArchitectSignOff';
import type { TargetArchitecture } from '@/components/ArchitectSignOff';
import { getAuth } from 'firebase/auth';

// Helper imports from components
import { getSecurityExplanation } from '@/components/design/SecurityHardeningChecklist';
import { getCloudServiceDetails } from '@/components/design/CloudServiceIntegrations';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

import { DocumentSkeleton } from '@/components/Skeleton';
import NavigationButtons from '@/components/NavigationButtons';

// Extracted Subcomponents
import ArchitectureOverview from '@/components/design/ArchitectureOverview';
import SyncPatternCard from '@/components/design/SyncPatternCard';
import InteractiveTopology from '@/components/design/InteractiveTopology';
import ProjectBlueprintExplorer from '@/components/design/ProjectBlueprintExplorer';
import ApiEndpointsCatalog from '@/components/design/ApiEndpointsCatalog';
import ApiBusinessHubMapping from '@/components/design/ApiBusinessHubMapping';
import CloudServiceIntegrations from '@/components/design/CloudServiceIntegrations';
import SecurityHardeningChecklist from '@/components/design/SecurityHardeningChecklist';
import ModernizationRoadmap from '@/components/design/ModernizationRoadmap';
import RoutingRationale from '@/components/design/RoutingRationale';
import TargetArchitectureDiagram from '@/components/design/TargetArchitectureDiagram';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import type { SourceFile } from '@/lib/abap/findings-detector';

const cleanAndParseJSON = (str: string) => {
  let cleaned = str.trim();

  // 1. Extract JSON block if wrapped in markdown
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // 2. Strip multi-line comments: /* ... */
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Strip single-line comments: // ..., but preserve URLs like http://, https://
  cleaned = cleaned.replace(/(?<!:)\/\/.*$/gm, '');

  // 4. Strip trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
};

export default function DesignPage() {
  const { projectId } = useParams();
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState('');
  const router = useRouter();

  const [loadingMessage, setLoadingMessage] = useState('');


  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const projectRef = useRef(project);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Re-derive findings from project.legacyCode for construct coupling
  const findings = useMemo<SupportFinding[]>(() => {
    if (!project?.legacyCode) return [];
    const abapSources: SourceFile[] = [{ file: 'main.abap', content: project.legacyCode }];
    const mockModel: ClassModel = {
      root: 'MAIN',
      nodes: {
        'MAIN': {
          key: 'MAIN', kind: 'class', source: { file: 'main.abap', line: 1 },
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
    try {
      return detectFindings(mockModel, abapSources);
    } catch {
      return [];
    }
  }, [project?.legacyCode]);

  // Check localStorage for dismissed banner
  useEffect(() => {
    if (projectId) {
      const key = `signoff-banner-dismissed-${projectId}`;
      setBannerDismissed(localStorage.getItem(key) === 'true');
    }
  }, [projectId]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    if (projectId) {
      localStorage.setItem(`signoff-banner-dismissed-${projectId}`, 'true');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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

  const generateDesign = useCallback(async (analysis: string) => {
    setLoading(true);
    setLoadingMessage('Architecting solution design...');
    try {
      const db = getDb();
      const docSnap = await getDoc(doc(db, 'projects', projectId as string));
      const projData = docSnap.exists() ? docSnap.data() : null;
      const route = projData?.extensibilityRoute || 'Side-by-Side (SAP BTP)';
      const isAbapCloud = !route.includes('BTP');

      const prompt = isAbapCloud 
        ? `Act as a Senior SAP Enterprise Architect. Analyze the legacy business analysis results and design a modern, clean SAP RAP (RESTful Application Programming Model) Developer Extensibility target architecture.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-3 sentence overview of the clean core RAP approach. Focus on in-app extensibility, standard RAP business object adaptations, or custom released RAP endpoints.
    nodeFramework: string; // Value MUST be: "SAP RAP (RESTful Application Programming)" with a brief justification
    runtimePlatform: string; // Value MUST be: "SAP S/4HANA Core (Developer Extensibility)"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended RAP artifact layout: CDS projection views, Behavior Definitions (BDEF), Service Definitions (SRVD), Service Bindings (SRVB), and Behavior Implementation classes (ABP).
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // Exposed RAP UI service operations or REST service definitions
  };
  cloudServices: Array<{
    serviceName: string; // Internal core services integrated (e.g. standard IAM business roles, released BAdI extension points, custom authorization objects)
    purpose: string; // Concrete usage in this RAP service
    npmPackages: string[]; // Value MUST be empty array [] (as RAP uses standard ABAP dictionary packages, not npm)
  }>;
  dataSync: {
    patternName: string; // E.g. "Transactional DB Access", "ABAP CDS Projection Join"
    description: string; // Rationale on how standard transactional lock (ENQUEUE/DEQUEUE) is preserved natively within SAP LUW (Logical Unit of Work).
  };
  securityHardening: Array<{
    category: string; // e.g. IAM, Authorization, Dictionary, Audit
    requirement: string; // ABAP Cloud / RAP security rule ONLY. MUST use only ABAP-native concepts. NEVER reference Node.js, npm, passport, helmet, or any non-ABAP technology. Example: 'Authority Check on V_KNA1_VKO authorization object'
    packageOrConfig: string; // ABAP-native implementation ONLY. Examples: 'AUTHORITY-CHECK OBJECT V_KNA1_VKO', 'CDS access control DCL', 'ABAP Cloud restricted syntax check', 'IAM App / Business Catalog'. NEVER use npm packages or Node.js code.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. DDIC Setup, RAP Behavior Implementation, Service Exposure, Fiori Elements Integration)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
}

Analysis Context:
${analysis}`
        : `Act as a Senior SAP Cloud Solutions Architect. Analyze the legacy business analysis results and design a modern, highly professional modular SAP CAP (Cloud Application Programming) side-by-side transformed cloud architecture.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-3 sentence overview of the transformed architectural approach. Focus on loose coupling, exposing legacy core through standard versioned APIs, and deploying side-by-side.
    nodeFramework: string; // Value MUST be: "SAP CAP (Cloud Application Programming model)" with a brief justification
    runtimePlatform: string; // Value MUST be: "SAP BTP (Business Technology Platform)"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended modular CAP layout: db/schema.cds (CDS schema), srv/service.cds (service definitions), srv/service.ts (business handlers), package.json, Dockerfile.
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // REST or OData service endpoints designed to handle the legacy business capability
  };
  cloudServices: Array<{
    serviceName: string; // Name of the cloud BTP service (e.g. XSUAA Identity Provider, Destination service, Event Mesh, BTP PostgreSQL)
    purpose: string; // Concrete usage in this BTP extension
    npmPackages: string[]; // Actual npm packages used in CAP/Node.js to integrate with it (e.g. ['@sap/xssec', '@sap/cds'], ['@sap-cloud-sdk/connectivity'], ['pg'], ['@sap/cds-dk'])
  }>;
  dataSync: {
    patternName: string; // E.g. "Event-Driven via BTP Event Mesh", "Transactional BTP Destination Routing"
    description: string; // Technical description of how data stays consistent between the CAP service and the legacy core.
  };
  sapStandardApiMapping?: Array<{
    legacyTableOrFunction: string; // Legacy database table (e.g., KNA1, BSEG, LFA1, VBAK) or BAPI being integrated
    sapStandardApiName: string; // Official standard released SAP API name (e.g. API_BUSINESS_PARTNER, API_SALES_ORDER_SRV, API_OUTBOUND_DELIVERY_SRV)
    apiHubUrl: string; // Reference link to api.sap.com (e.g. https://api.sap.com/api/API_BUSINESS_PARTNER/overview)
    apiId: string; // Official API ID reference (e.g. SAP_COM_0008, SAP_COM_0109, etc.)
    description: string; // Clear technical rationale of how this API replaces direct DB SELECTs to keep the core clean
  }>;
  securityHardening: Array<{
    category: string; // e.g. Authentication, Network, Coding, Audit
    requirement: string; // Node.js / CAP / BTP security rule ONLY. MUST use only BTP-native and Node.js concepts. NEVER reference ABAP, AUTHORITY-CHECK, or any ABAP-native constructs. Example: 'XSUAA JWT Validation via @sap/xssec'
    packageOrConfig: string; // Node.js/BTP implementation ONLY. Examples: 'app.use(passport.authenticate("JWT", { session: false }))', 'app.use(helmet())', 'npm audit --audit-level=high', '@sap/xssec'. NEVER use ABAP code or syntax.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. Foundation, CAP Service exposure, BTP Event Integration, Production Hardening)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
}

Analysis Context:
${analysis}`;

      console.log('Generating solution design for project:', projectRef.current?.name);

      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true, profile?.geminiApiKey);
        
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }

      await updateDoc(doc(db, 'projects', projectId as string), {
        solutionDesign: responseText,
        status: 'designed'
      });
      setDesign(responseText);
      setProject((prev: Project | null) => prev ? { ...prev, solutionDesign: responseText } : prev);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate design.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [projectId, profile]);

  useEffect(() => {
    const fetchProject = async () => {
      const db = getDb();
      const docSnap = await getDoc(doc(db, 'projects', projectId as string));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProject({ id: docSnap.id, ...data } as unknown as Project);
        if (data.solutionDesign) {
            setDesign(data.solutionDesign);
            setLoading(false);
        } else if (data.analysis) {
            generateDesign(data.analysis);
        } else {
            setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, generateDesign]);


  const exportToConfluence = async (viewOnly = false) => {
    const currentProject = projectRef.current;
    if (!currentProject?.solutionDesign) {
      console.warn("No solution design found");
      return;
    }

    let htmlContent = '';
    
    // Check if JSON
    let isJson = false;
    let data: DesignData | null = null;
    const trimmedDesignText = currentProject.solutionDesign.trim();
    if (trimmedDesignText.startsWith('{') || (trimmedDesignText.includes('{') && trimmedDesignText.includes('}'))) {
      try {
        data = cleanAndParseJSON(currentProject.solutionDesign);
        isJson = true;
      } catch {}
    }

    if (isJson && data) {
      const structureRows = data.nodeAppBlueprint?.projectStructure?.map(item => {
        if (!item) return '';
        const pathStr = typeof item === 'string' ? item : item.path || '';
        const purposeStr = typeof item === 'string' ? '' : item.purpose || '';
        return `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-family: monospace; font-weight: bold;">${pathStr}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${purposeStr}</td>
          </tr>
        `;
      }).join('') || '';

      const endpointsRows = data.nodeAppBlueprint?.apiEndpoints?.map(route => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0;"><span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${route.method === 'GET' ? '#e6fcff' : route.method === 'POST' ? '#eae6ff' : route.method === 'PUT' ? '#fffae6' : '#ffebe6'}; color: ${route.method === 'GET' ? '#007a87' : route.method === 'POST' ? '#403294' : route.method === 'PUT' ? '#974f0c' : '#de350b'}; border: 1px solid ${route.method === 'GET' ? '#b3f0ff' : route.method === 'POST' ? '#c5bdf3' : route.method === 'PUT' ? '#ffe380' : '#ffbdad'};">${route.method}</span></td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-family: monospace; font-weight: bold; color: #0747a6;">${route.path}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${route.description}</td>
        </tr>
      `).join('') || '';

      const servicesCards = data.cloudServices?.map(svc => `
        <div style="border: 1px solid #ebecf0; border-radius: 8px; padding: 15px; background: #fff;">
          <div style="font-weight: bold; color: #0747a6; font-size: 15px; margin-bottom: 5px;">${svc.serviceName}</div>
          <p style="font-size: 13px; margin: 0 0 10px 0; color: #5e6c84;">${svc.purpose}</p>
          <div style="font-size: 11px; color: #6b778c; border-top: 1px solid #f4f5f7; padding-top: 8px;">
            <strong>Packages:</strong> ${svc.npmPackages?.map(pkg => `<code style="background: #f4f5f7; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${pkg}</code>`).join(', ') || 'None'}
          </div>
        </div>
      `).join('') || '';

      const securityRows = data.securityHardening?.map(item => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-weight: bold;">${item.category}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${item.requirement}</td>
          <td style="padding: 12px; border-bottom: 1px solid #ebecf0; font-family: monospace; font-weight: bold; color: #de350b;">${item.packageOrConfig}</td>
        </tr>
      `).join('') || '';

      const roadmapPhases = data.roadmap?.map(phase => `
        <div style="margin-bottom: 20px; border-left: 3px solid #00875a; padding-left: 15px;">
          <h4 style="margin: 0 0 5px 0; color: #172b4d; font-size: 16px;"><strong>${phase.phase}: ${phase.title}</strong></h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #5e6c84;">
            ${phase.deliverables?.map(del => `<li>${del}</li>`).join('') || ''}
          </ul>
        </div>
      `).join('') || '';

            const apiMappingRows = data.sapStandardApiMapping?.map(map => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-family: monospace; font-weight: bold;">${map.legacyTableOrFunction}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-weight: bold; color: #00875a;">${map.sapStandardApiName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-family: monospace; font-size: 12px;">${map.apiId}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-size: 13px; color: #6b778c;">${map.description}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ebecf0; font-size: 12px;"><a href="${map.apiHubUrl}" target="_blank" style="color: #0747a6; font-weight: bold; text-decoration: none;">api.sap.com ➔</a></td>
        </tr>
      `).join('') || '';

      const apiMappingSection = data.sapStandardApiMapping && data.sapStandardApiMapping.length > 0 ? `
        <h2>🌐 SAP API Business Hub Mappings</h2>
        <p>Decoupled communication mappings dynamically generated to keep the S/4HANA core clean:</p>
        <table>
          <thead>
            <tr>
              <th style="width: 20%;">Legacy Object</th>
              <th style="width: 25%;">Target Released API</th>
              <th style="width: 15%;">Hub API ID</th>
              <th>Description</th>
              <th style="width: 15%;">Reference</th>
            </tr>
          </thead>
          <tbody>
            ${apiMappingRows}
          </tbody>
        </table>
      ` : '';

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Solution Design: ${data.projectName || currentProject.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; background: #fff; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; border-bottom: none; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul { margin-bottom: 16px; padding-left: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f4f5f7; text-align: left; padding: 10px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b778c; border-bottom: 2px solid #ebecf0; }
            td { padding: 10px; border-bottom: 1px solid #ebecf0; }
            .card-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 16px; margin: 20px 0; }
            .summary-box { background: #f4f5f7; border-left: 4px solid #00875a; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
            hr { border: 0; border-top: 1px solid #ebecf0; margin: 30px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Solution Design Document: ${data.projectName || currentProject.name}</h1>
            <div class="meta">Target Framework: <strong>${data.architectureOverview?.nodeFramework}</strong> | Platform: <strong>${data.architectureOverview?.runtimePlatform}</strong> | Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            <div class="summary-box">
              <h3 style="margin-top: 0; color: #00875a;">Architectural Approach</h3>
              <p>${data.architectureOverview?.approachDescription}</p>
            </div>

            <h2>Side-by-Side Node.js Project Blueprint</h2>
            <p>Recommended folder and file organization for the transformed extension:</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%;">Path</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                ${structureRows}
              </tbody>
            </table>

            <h2>Designed API Catalog</h2>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Endpoint Path</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${endpointsRows}
              </tbody>
            </table>

            <h2>Cloud Services & NPM Dependencies</h2>
            <div class="card-grid">
              ${servicesCards}
            </div>

            <h2>Data Synchronization Pattern</h2>
            <p><strong>Pattern:</strong> <strong>${data.dataSync?.patternName}</strong></p>
            <p>${data.dataSync?.description}</p>

            ${apiMappingSection}

            <h2>Security Hardening Blueprint</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Requirement</th>
                  <th>Package / Configuration</th>
                </tr>
              </thead>
              <tbody>
                ${securityRows}
              </tbody>
            </table>

            <h2>Modernization Roadmap</h2>
            <div>
              ${roadmapPhases}
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
          <meta charset="utf-8">
          <title>Solution Design: ${currentProject.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; color: #172b4d; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; background: #fff; }
            .header { border-bottom: 2px solid #ebecf0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #0747a6; font-size: 32px; margin-bottom: 8px; border-bottom: none; }
            h2 { color: #172b4d; font-size: 24px; margin-top: 40px; border-bottom: 1px solid #ebecf0; padding-bottom: 10px; }
            h3 { color: #172b4d; font-size: 20px; margin-top: 30px; }
            p { margin-bottom: 16px; }
            ul, ol { margin-bottom: 16px; padding-left: 30px; }
            li { margin-bottom: 8px; }
            blockquote { border-left: 4px solid #4c9aff; padding-left: 20px; color: #6b778c; font-style: italic; margin: 20px 0; background: #f4f5f7; padding: 15px 20px; border-radius: 0 4px 4px 0; }
            code { background: #f4f5f7; padding: 2px 4px; border-radius: 3px; font-family: "SFMono-Medium", "SF Mono", "Segoe UI Mono", "Roboto Mono", "Ubuntu Mono", Menlo, Consolas, Courier, monospace; font-size: 12px; }
            pre { background: #f4f5f7; padding: 16px; border-radius: 4px; overflow-x: auto; margin-bottom: 16px; }
            pre code { background: none; padding: 0; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th, td { border: 1px solid #ebecf0; padding: 12px; text-align: left; }
            th { background: #f4f5f7; font-weight: bold; }
            .meta { color: #6b778c; font-size: 14px; margin-top: 10px; }
            hr { border: 0; border-top: 1px solid #ebecf0; margin: 30px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Solution Design Document: ${currentProject.name}</h1>
            <div class="meta">Generated by Clean-Core.io | ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="content">
            ${renderMarkdownSafe(currentProject.solutionDesign)}
          </div>
        </body>
        </html>
      `;
    }

    if (viewOnly) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
      }
      return;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    await saveAs(blob, `${currentProject.name.replace(/\s+/g, '_')}_Solution_Design.html`);
    
    // Store in DB
    const db = getDb();
    const docRef = doc(db, 'projects', projectId as string);
    try {
      await updateDoc(docRef, {
        [`exports.design_confluence_${Date.now()}`]: htmlContent
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    }
  };

  const renderDesignContent = () => {
    if (!design) return null;

    let data: DesignData | null = null;
    const trimmedDesignText = design.trim();
    if (trimmedDesignText.startsWith('{') || (trimmedDesignText.includes('{') && trimmedDesignText.includes('}'))) {
      try {
        data = cleanAndParseJSON(design);
      } catch (e) {
        console.error('Failed to parse JSON design, falling back to markdown rendering', e);
      }
    }

    if (data) {
      const isAbapCloud = !(project?.extensibilityRoute || data.architectureOverview?.runtimePlatform || 'BTP').includes('BTP');
      
      return (
        <div className="space-y-12">
          {/* Routing Rationale — Design ↔ Analyze evidence binding */}
          <RoutingRationale
            extensibilityRoute={project?.extensibilityRoute || data.architectureOverview?.runtimePlatform || 'Side-by-Side (SAP BTP)'}
            cleanCoreScore={project?.cleanCoreScore}
            s4Deployment={project?.s4Deployment}
            findings={findings}
          />

          {/* Target Architecture Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <ArchitectureOverview overview={data.architectureOverview} />
            <SyncPatternCard dataSync={data.dataSync} />
          </div>

          {/* Decoupling topology diagram */}
          <InteractiveTopology isAbapCloud={isAbapCloud} />

          {/* Auto-generated Mermaid architecture diagram */}
          <TargetArchitectureDiagram data={data} isAbapCloud={isAbapCloud} />

          {/* Project blueprint and API catalog */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            <ProjectBlueprintExplorer projectStructure={data.nodeAppBlueprint?.projectStructure} />
            <ApiEndpointsCatalog apiEndpoints={data.nodeAppBlueprint?.apiEndpoints} />
          </div>

          {/* Standard API Hub Reference mappings */}
          <ApiBusinessHubMapping sapStandardApiMapping={data.sapStandardApiMapping} />

          {/* Cloud Service bindings grid & drawer */}
          <CloudServiceIntegrations cloudServices={data.cloudServices} />

          {/* Security Hardening checklist — full width */}
          <SecurityHardeningChecklist securityHardening={data.securityHardening} findings={findings} />

          {/* Phased Modernization Roadmap timeline */}
          <ModernizationRoadmap roadmap={data.roadmap} />

          {/* Architect sign-off / decision — always last */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
              <ArchitectSignOff
                recommendation={project?.originalRecommendation || (project?.extensibilityRoute?.includes('BTP') ? 'cap' : 'rap')}
                confidenceScore={project?.recommendationConfidence || 75}
                justificationText={project?.recommendationJustification || `Based on the code analysis, the ${project?.extensibilityRoute?.includes('BTP') ? 'Side-by-Side (CAP)' : 'On-Stack (RAP)'} extensibility path was identified as the most suitable approach for this project.`}
                isLocked={project?.approvedByArchitect === true}
                currentArchitecture={project?.targetArchitecture}
                currentJustification={project?.architectJustifiedOverride}
                lockedByEmail={project?.approvedBy}
                lockedAt={project?.architectSignOffAt ? String(project.architectSignOffAt) : undefined}
                canUnlock={true}
                onLock={async (architecture, justification) => {
                  const auth = getAuth();
                  const userEmail = auth.currentUser?.email || 'unknown';
                  const db = getDb();
                  await updateDoc(doc(db, 'projects', projectId as string), {
                    targetArchitecture: architecture,
                    approvedByArchitect: true,
                    architectJustifiedOverride: justification || '',
                    architectSignOffAt: new Date().toISOString(),
                    approvedBy: userEmail,
                  });
                  setProject((prev: Project | null) => prev ? {
                    ...prev,
                    targetArchitecture: architecture,
                    approvedByArchitect: true,
                    architectJustifiedOverride: justification || '',
                    architectSignOffAt: new Date().toISOString(),
                    approvedBy: userEmail,
                  } : null);
                }}
                onUnlock={async () => {
                  const db = getDb();
                  await updateDoc(doc(db, 'projects', projectId as string), {
                    approvedByArchitect: false,
                    targetArchitecture: null,
                    architectJustifiedOverride: '',
                    architectSignOffAt: null,
                    approvedBy: '',
                  });
                  setProject((prev: Project | null) => prev ? {
                    ...prev,
                    approvedByArchitect: false,
                    targetArchitecture: undefined,
                    architectJustifiedOverride: '',
                    architectSignOffAt: undefined,
                    approvedBy: '',
                  } : null);
                }}
              />
          </div>
        </div>
      );
    }

    // Fallback to legacy markdown rendering
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
        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(design) }}
      />
    );
  };

  if (loading && !design) return (
    <div className="animate-in fade-in duration-500">
      <Stepper currentStep={3} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden mt-8">
        <div className="bg-green-600 px-10 py-12 text-white flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Designing Solution...</h2>
            <p className="text-green-100 mt-2">{loadingMessage || 'Loading project data...'}</p>
          </div>
          <RefreshCw className="w-12 h-12 text-white/20 animate-spin" />
        </div>
        <DocumentSkeleton />
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <Stepper currentStep={3} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Solution Design</h1>
          <p className="text-gray-500">Review the generated target architecture and technical design.</p>
        </div>
        {design && (
          <div className="flex gap-3">

            <button 
              onClick={() => project?.analysis && generateDesign(project.analysis)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium text-sm"
            >
              <RefreshCw size={16} /> Regenerate
            </button>
            <button 
              onClick={() => exportToConfluence(true)} 
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium text-sm"
            >
              <Eye size={16} /> View HTML
            </button>
            <button 
              onClick={() => exportToConfluence(false)} 
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium text-sm"
            >
              <Download size={16} /> Export HTML
            </button>
          </div>
        )}
      </div>



      <div id="design-report" className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-12">
        <div className="bg-gray-50 border-b border-gray-200 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-green-600 p-2.5 rounded-xl shadow-green-200 shadow-lg">
              <LayoutTemplate className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Architecture & Design Specification</h2>
              <p className="text-sm text-gray-500">Project: {project?.name || 'Loading...'}</p>
            </div>
          </div>
          <div className="flex gap-3">
          </div>
        </div>
        
        <div className="p-6 md:p-12 bg-[#FDFDFD]">
          {(design.trim().startsWith('{') || (design.trim().includes('{') && design.trim().includes('}'))) ? (
            renderDesignContent()
          ) : (
            <>
              {/* Document Header/Cover Style */}
              <div className="mb-12 pb-12 text-center max-w-3xl mx-auto">
                <h3 className="text-xs font-bold text-green-600 uppercase tracking-[0.2em] mb-3">Solution Design Document</h3>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                  Modernization & Cloud Transformation Strategy
                </h1>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-500 font-medium">
                  <span className="flex items-center gap-2"><FileText size={12} /> Version 1.0</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                  <span>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                </div>
              </div>

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
                dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(design) }}
              />

              {/* Document Footer Style */}
              <div className="mt-20 pt-10 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-400 font-medium uppercase tracking-widest">
                <span>Clean-Core.io Transformation Engine</span>
                <span>Confidential & Proprietary</span>
                <span>Page 1 of 1</span>
              </div>
            </>
          )}
        </div>
      </div>




      <NavigationButtons 
        backPath={`/project/${projectId}/analyze`}
        backLabel="Back to Analysis"
        proceedPath={project?.approvedByArchitect ? `/project/${projectId}/transformation` : undefined}
        proceedLabel={project?.approvedByArchitect ? 'Continue to Transformation' : 'Confirm architecture to proceed'}
      />





    </div>
  );
}
