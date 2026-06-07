'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { FileText, Download, ArrowRight, ArrowLeft, RefreshCw, LayoutTemplate, Eye, X, Send, Folder, FileCode, Terminal, ShieldCheck, Layers, Network, ArrowUpRight, ChevronDown, Lock, HelpCircle } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { DocumentSection } from '@/components/DocumentSection';
import { Components } from 'react-markdown';
import { marked } from 'marked';
import { callGemini } from '@/lib/gemini';
import type { Project, DesignData } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';
import GlossaryTerm from '@/components/GlossaryTerm';
import JiraIntegrationModal from '@/components/JiraIntegrationModal';
import UpgradeToEnterpriseModal from '@/components/UpgradeToEnterpriseModal';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

import { DocumentSkeleton } from '@/components/Skeleton';
import NavigationButtons from '@/components/NavigationButtons';

const securityTermExplanations: Record<string, { title: string, explanation: string, technicalImpact: string, implementationPattern: string }> = {
  jwt: {
    title: 'Stateless JWT Validation',
    explanation: 'JSON Web Token (JWT) stateless validation enables the Node.js application to securely authenticate incoming requests without querying a central session database. It checks the cryptographic signature of the token using trusted public keys (e.g., from XSUAA or Identity Providers), guaranteeing identity and scope permissions.',
    technicalImpact: 'Stateless authentication reduces latency, eliminates database bottleneck overheads, and enables horizontal scaling of the microservices.',
    implementationPattern: "app.use(passport.authenticate('JWT', { session: false }));"
  },
  helmet: {
    title: 'Helmet.js Security Headers',
    explanation: 'Helmet.js is a crucial middleware that secures Express applications by automatically configuring essential HTTP headers. This mitigates common web vulnerabilities like Cross-Site Scripting (XSS), Clickjacking, MIME-sniffing, and HTTP Parameter Pollution.',
    technicalImpact: 'Enforces secure defaults such as Content-Security-Policy (CSP) and Strict-Transport-Security (HSTS), shielding the application from client-side injection exploits.',
    implementationPattern: "import helmet from 'helmet';\napp.use(helmet());"
  },
  principal: {
    title: 'Principal Propagation',
    explanation: 'Principal Propagation securely forwards the identity and security context of the logged-in cloud user to the legacy SAP backend (S/4HANA). This ensures backend execution respects the exact user identity, preserving core auditing, access controls, and user-level logging.',
    technicalImpact: 'Ensures zero bypass of corporate governance, maintaining exact user traceability and compliance records in the ERP core.',
    implementationPattern: "// Propagates JWT token to backend destination\nconst dest = await Connectivity.getDestination({ \n  destinationName: 'S4HANA_Backend',\n  jwt: userJwtToken \n});"
  },
  audit: {
    title: 'Supply-Chain Dependency Auditing',
    explanation: 'Dependency auditing scans NPM packages for documented vulnerabilities during development and CI/CD pipelines. This blocks malicious software packages, outdated libraries with active CVE exploits, and prototype pollution hazards from entering production.',
    technicalImpact: 'Guarantees the integrity of the supply chain, ensuring only hardened, security-cleared packages are compiled and deployed.',
    implementationPattern: "npm audit --audit-level=high"
  },
  default: {
    title: 'Security Hardening Protocol',
    explanation: 'This security protocol establishes enterprise-grade security rules for the transformed architecture. It ensures standard data protections, boundary checks, and access controls are actively enforced across all application layers.',
    technicalImpact: 'Mitigates common vulnerabilities listed in the OWASP Top 10, protecting enterprise cloud environments.',
    implementationPattern: "See architectural standard configuration guides."
  }
};

const getSecurityExplanation = (req: string, pkg: string) => {
  const text = `${req} ${pkg}`.toLowerCase();
  if (text.includes('jwt') || text.includes('token') || text.includes('auth')) return securityTermExplanations.jwt;
  if (text.includes('helmet')) return securityTermExplanations.helmet;
  if (text.includes('principal') || text.includes('propagation')) return securityTermExplanations.principal;
  if (text.includes('audit') || text.includes('dependency') || text.includes('snyk')) return securityTermExplanations.audit;
  return securityTermExplanations.default;
};

const cloudServiceDetails: Record<string, {
  title: string;
  details: string;
  whyCritical: string;
  npmPackages: string[];
  codeSnippet: string;
}> = {
  xsuaa: {
    title: 'XSUAA Identity Federation',
    details: 'XSUAA acts as the OAuth 2.0 authorization server on SAP BTP. It handles authentications, validates incoming JSON Web Tokens (JWTs), and resolves user roles/scopes. This keeps identity federation and access management separate from application logic.',
    whyCritical: 'Ensures secure, audited cloud access that adheres strictly to clean-core guidelines. User identities are resolved dynamically via federated identity providers (like SAP IAS or Azure AD) rather than database-level hardcoding in legacy layers.',
    npmPackages: ['@sap/xssec', 'passport'],
    codeSnippet: `const express = require('express');
const passport = require('passport');
const { JWTStrategy } = require('@sap/xssec');
const xsenv = require('@sap/xsenv');

const app = express();

// Retrieve service credentials from container environment
const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });

// Initialize Passport with XSUAA OAuth Strategy
passport.use(new JWTStrategy(services.uaa));
app.use(passport.initialize());

// Secure custom API endpoint with role assertion
app.get('/api/extension/orders',
  passport.authenticate('JWT', { session: false }),
  (req, res) => {
    if (req.authInfo.checkLocalScope('Admin')) {
      res.json({ status: 'Authorized', data: [] });
    } else {
      res.status(403).send('Forbidden: Insufficient Scopes');
    }
  }
);`
  },
  destination: {
    title: 'Destination & Connectivity Service',
    details: 'The SAP BTP Destination Service serves as a secure, centralized vault for configuring outbound target connection profiles (URLs, protocols, and authentication settings). Combined with BTP Connectivity and Cloud Connector, it establishes secure tunnels to on-premises ERP systems and cloud-based REST/OData APIs.',
    whyCritical: 'Completely separates environment-specific endpoints and credentials from source code. Connections, protocols, or routing can be modified dynamically at runtime without altering or redeploying the Node.js application.',
    npmPackages: ['@sap-cloud-sdk/connectivity'],
    codeSnippet: `const axios = require('axios');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

async function fetchLegacyData(orderId, userJwt) {
  // Securely retrieve the target destination
  const destination = await getDestination({
    destinationName: 'S4HANA_GATEWAY',
    jwt: userJwt // Auto-propagates user context
  });

  // Execute authenticated outbound call using BTP proxy
  const response = await axios({
    url: \`\${destination.url}/sap/opu/odata/sap/ZELEMENTS_SRV/Orders('\${orderId}')\`,
    headers: {
      ...destination.authHeaders, // Dynamically injected principal headers
      'Accept': 'application/json'
    }
  });
  return response.data;
}`
  },
  eventmesh: {
    title: 'Event Mesh / Enterprise Messaging',
    details: 'SAP Event Mesh is a fully managed cloud messaging service. It provides reliable asynchronous messaging capabilities, enabling systems to communicate via event-driven pub/sub queues and topics. It is ideal for separating heavy transactional events from legacy cores.',
    whyCritical: 'Achieves near-zero synchronization coupling. Instead of legacy systems blocking web APIs during long transactional updates, events are pushed asynchronously to Event Mesh, letting the Node.js application process them independently in real-time.',
    npmPackages: ['amqplib', '@sap/xsenv'],
    codeSnippet: `const amqp = require('amqplib');
const xsenv = require('@sap/xsenv');

async function startListening() {
  // Retrieve messaging service credentials
  const services = xsenv.getServices({ messaging: { label: 'enterprise-messaging' } });
  const amqpUrl = services.messaging.credentials.uri;
  
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  const queue = 'transformed/salesorders/created';

  await channel.assertQueue(queue, { durable: true });
  console.log(\`[*] Listening for S/4HANA events on queue: \${queue}\`);

  // Async subscriber processing S/4HANA sales order creation events
  channel.consume(queue, (msg) => {
    if (msg !== null) {
      const eventPayload = JSON.parse(msg.content.toString());
      console.log(\`[x] Received Order ID: \${eventPayload.OrderId}\`);
      
      // Process transaction logic asynchronously
      channel.ack(msg);
    }
  });
}`
  },
  postgresql: {
    title: 'PostgreSQL Relational Database',
    details: 'PostgreSQL on SAP BTP or AWS is an enterprise-grade relational database. It is utilized to store extension-specific application states, customer metadata, and transactional caches, fully isolating side-by-side data from the ERP legacy schema.',
    whyCritical: 'Guarantees zero database-level pollution. Custom tables are kept out of the core S/4HANA database, avoiding schema upgrade lockouts and keeping the ERP core pristine and easily upgradeable.',
    npmPackages: ['pg', '@sap/xsenv'],
    codeSnippet: `const { Pool } = require('pg');
const xsenv = require('@sap/xsenv');

// Resolve PostgreSQL credentials from Cloud Binding environment variables
const pgServices = xsenv.getServices({ db: { tag: 'postgresql' } });
const config = pgServices.db.credentials;

const pool = new Pool({
  host: config.hostname,
  port: config.port,
  database: config.dbname,
  user: config.username,
  password: config.password,
  ssl: { rejectUnauthorized: false }
});

async function queryExtensionData(userId) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT * FROM extension_users WHERE id = $1', 
      [userId]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}`
  },
  default: {
    title: 'Cloud Service Binding Integration',
    details: 'Cloud service bindings allow the Node.js application to connect securely and dynamically with platform-managed systems, including databases, identity providers, routing gateways, and messaging queues, utilizing externalized environment injections.',
    whyCritical: 'Avoids static configuration files or hardcoded server details, satisfying modern Cloud Native standards (12-Factor App design).',
    npmPackages: ['@sap/xsenv'],
    codeSnippet: `const xsenv = require('@sap/xsenv');
// Load generic credentials from platform-bound services
try {
  const credentials = xsenv.getServices({ myService: { tag: 'custom-tag' } });
  console.log('Credentials loaded successfully');
} catch (err) {
  console.error('Failed to resolve cloud service bindings:', err.message);
}`
  }
};

const getCloudServiceDetails = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  if (name.includes('xsuaa') || name.includes('identity') || name.includes('auth')) return cloudServiceDetails.xsuaa;
  if (name.includes('destination') || name.includes('connectivity') || name.includes('sdk')) return cloudServiceDetails.destination;
  if (name.includes('mesh') || name.includes('messaging') || name.includes('amqp')) return cloudServiceDetails.eventmesh;
  if (name.includes('postgres') || name.includes('db') || name.includes('sql')) return cloudServiceDetails.postgresql;
  return cloudServiceDetails.default;
};

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

  const [isProceeding, setIsProceeding] = useState(false);
  const [isJiraModalOpen, setIsJiraModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const projectRef = useRef(project);

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
    requirement: string; // Technical security rule (e.g. Authority Check on custom authorization object, SQL Injection prevention via CDS mapping, locked field constraints)
    packageOrConfig: string; // Concrete implementation detail (e.g. 'AUTHORITY-CHECK OBJECT', 'CDS view access controls DCL', 'ABAP Cloud restricted syntax check')
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
    requirement: string; // Technical security rule (e.g. XSUAA JWT Validation, Helmet.js headers, Principal Propagation tunnel, dependency audit)
    packageOrConfig: string; // Concrete implementation detail (e.g. 'XSUAA middleware', 'app.use(helmet())', 'npm audit --audit-level=high')
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
            ${marked(currentProject.solutionDesign)}
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
    const { saveAs: save } = await import('file-saver');
    save(blob, `${currentProject.name.replace(/\s+/g, '_')}_Solution_Design.html`);
    
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
      return (
        <div className="space-y-12">
          {/* Target Architecture Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Main Approach Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between md:col-span-2">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Architecture Approach</span>
                <h3 className="text-2xl font-black text-slate-900 mt-2 mb-3">Modern Node.js Side-by-Side Application</h3>
                <p className="text-slate-650 text-base leading-relaxed">{data.architectureOverview?.approachDescription}</p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Framework</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-800">{data.architectureOverview?.nodeFramework || 'Node.js'}</span>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Runtime Platform</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-slate-800">{data.architectureOverview?.runtimePlatform || 'Cloud Platform'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Pattern & Score Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 flex flex-col justify-between shadow-lg border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
              <div>
                <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Data Sync Strategy</span>
                <h4 className="text-xl font-extrabold text-white mt-3 mb-2">{data.dataSync?.patternName}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{data.dataSync?.description}</p>
              </div>
              <div className="border-t border-slate-800 pt-4 mt-6 flex items-center justify-between text-xs text-slate-400">
                <span>Status</span>
                <span className="text-emerald-400 font-bold bg-emerald-950/50 border border-emerald-900 px-2 py-0.5 rounded-full">Transformed Core</span>
              </div>
            </div>
          </div>

          {/* Code Blueprint & Project Structure */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {/* Interactive Folder File Explorer Tree */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm lg:col-span-1 flex flex-col">
              <div className="mb-4">
                <h4 className="font-extrabold text-slate-900 text-lg">Target Project Blueprint</h4>
                <p className="text-xs text-slate-400 mt-1">Recommended file structure for the side-by-side Node.js application.</p>
              </div>
              
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex-1 font-mono text-xs overflow-y-auto space-y-2.5 max-h-[360px]">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <Folder className="w-4 h-4 text-amber-500 fill-amber-500/10" />
                  <span>/project-root</span>
                </div>
                
                {data.nodeAppBlueprint?.projectStructure?.map((item, idx) => {
                  if (!item) return null;
                  const pathStr = typeof item === 'string' ? item : item.path || '';
                  const purposeStr = typeof item === 'string' ? '' : item.purpose || '';
                  
                  const parts = pathStr.split('/');
                  const isFile = parts[parts.length - 1]?.includes('.') || false;
                  const name = parts[parts.length - 1] || '';
                  const depth = parts.length;
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ paddingLeft: `${depth * 14}px` }} 
                      className="group flex items-center justify-between py-0.5 hover:bg-slate-100/50 rounded px-1 transition-colors"
                      title={purposeStr}
                    >
                      <div className="flex items-center gap-2">
                        {isFile ? (
                          <FileCode className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                        )}
                        <span className="text-slate-700 font-medium">{name}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 group-hover:text-slate-500 transition-colors font-sans truncate ml-2 max-w-[120px]">{purposeStr}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* API Endpoints Catalog */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
              <div className="mb-4">
                <h4 className="font-extrabold text-slate-900 text-lg">Target API Catalog</h4>
                <p className="text-xs text-slate-400 mt-1">Proposed API layer handling the transformed legacy transaction capability.</p>
              </div>
              
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Method</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Route Path</th>
                      <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {data.nodeAppBlueprint?.apiEndpoints?.map((route, idx) => {
                      const methodColors = {
                        GET: 'bg-green-50 text-green-700 border-green-200',
                        POST: 'bg-blue-50 text-blue-700 border-blue-200',
                        PUT: 'bg-amber-50 text-amber-700 border-amber-200',
                        DELETE: 'bg-red-50 text-red-700 border-red-200'
                      };
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-md font-extrabold border text-[9px] ${methodColors[route.method] || 'bg-slate-100 text-slate-700'}`}>
                              {route.method}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800 select-all">{route.path}</td>
                          <td className="py-3.5 text-slate-650 leading-relaxed">{route.description}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* SAP API Business Hub Integration */}
          {data.sapStandardApiMapping && data.sapStandardApiMapping.length > 0 && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col animate-in fade-in duration-500">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-lg">SAP API Business Hub Integration</h4>
                  <p className="text-xs text-slate-400 mt-1">Officially <GlossaryTerm termKey="Released Interface" className="text-xs text-slate-400 border-emerald-500/40 font-medium">Released standard S/4HANA Public APIs</GlossaryTerm> mapped to fully decouple direct legacy database access.</p>
                </div>
                <span className="bg-blue-50 text-blue-700 border border-blue-150 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                  <Network className="w-3.5 h-3.5 text-blue-600 animate-pulse" /> api.sap.com Reference
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-105">
                      <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legacy Object</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target <GlossaryTerm termKey="Released Interface" className="text-[10px] text-slate-400 border-slate-400/50 uppercase tracking-widest">Released API</GlossaryTerm></th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hub API ID</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Integration Role / Context</th>
                      <th className="py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {data.sapStandardApiMapping.map((map, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 font-mono font-bold text-slate-500 select-all">{map.legacyTableOrFunction}</td>
                        <td className="py-4 px-4 font-extrabold text-slate-800">{map.sapStandardApiName}</td>
                        <td className="py-4 px-4"><span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-mono text-[10px]">{map.apiId}</span></td>
                        <td className="py-4 px-4 text-slate-600 leading-relaxed max-w-sm">{map.description}</td>
                        <td className="py-4 text-right">
                          <a
                            href={map.apiHubUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 px-3.5 py-2 rounded-xl transition-all shadow-sm uppercase tracking-widest"
                          >
                            Open API Hub <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cloud Service Integration & Packages */}
          <div className="space-y-4">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Cloud Service Integrations</h3>
              <p className="text-sm text-slate-500 mt-1">Platform service bindings and specific Node.js client packages required.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.cloudServices?.map((service, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setActiveService(service)}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer relative group active:scale-[0.98]"
                >
                  <div>
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <h4 className="font-extrabold text-slate-950 text-base group-hover:text-emerald-600 transition-colors">{service.serviceName}</h4>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all">Deep Dive</span>
                        <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                      </div>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed mb-4">{service.purpose}</p>
                  </div>
                  <div className="border-t border-slate-50 pt-3 mt-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">NPM package dependencies</span>
                    <div className="flex flex-wrap gap-1.5">
                      {service.npmPackages?.map((pkg, pIdx) => (
                        <code key={pIdx} className="bg-slate-100 text-slate-800 text-[10px] px-2 py-0.5 rounded-md font-mono border border-slate-150 group-hover:bg-emerald-50 group-hover:text-emerald-800 group-hover:border-emerald-200 transition-colors">
                          {pkg}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Checklist & Phasing Roadmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Security Hardening Checklist */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="mb-6">
                  <h4 className="font-extrabold text-slate-900 text-lg">Security Hardening Checklist</h4>
                  <p className="text-xs text-slate-400 mt-1">Concrete actions to secure the side-by-side Node.js application.</p>
                </div>
                
                <div className="space-y-3">
                  {data.securityHardening?.map((item, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setActiveTerm(item.requirement)}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3.5 text-xs hover:border-emerald-500/40 hover:bg-slate-100/30 cursor-pointer transition-all shadow-sm active:scale-[0.98] group"
                    >
                      <div className="bg-emerald-100/50 p-1.5 rounded-xl text-emerald-600 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{item.category}</span>
                            <span className="text-[9px] text-slate-400 font-mono font-medium bg-slate-200/50 px-1.5 py-0.5 rounded">({item.packageOrConfig})</span>
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <HelpCircle className="w-3 h-3 text-emerald-500" /> Explain
                          </span>
                        </div>
                        <p className="text-slate-655 mt-1 leading-relaxed">{item.requirement}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Roadmap Timeline */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h4 className="font-extrabold text-slate-900 text-lg">Modernization Roadmap</h4>
                <p className="text-xs text-slate-400 mt-1">Phased execution roadmap for the side-by-side target transition.</p>
              </div>
              
              <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 my-2">
                {data.roadmap?.map((phase, idx) => (
                  <div key={idx} className="relative">
                    {/* Circle timeline bullet */}
                    <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 shadow-sm flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{phase.phase}</span>
                        <h5 className="font-extrabold text-slate-900 text-sm">{phase.title}</h5>
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-500 list-disc pl-4">
                        {phase.deliverables?.map((del, dIdx) => (
                          <li key={dIdx} className="leading-relaxed">{del}</li>
                        ))}
                      </ul>
                    </div>
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
        dangerouslySetInnerHTML={{ __html: marked(design) as string }}
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
               disabled
               className="flex items-center gap-2 bg-slate-100 text-slate-400 px-4 py-2 rounded-lg cursor-not-allowed transition-colors font-medium text-sm border border-slate-200"
               title="Jira Sync is prepared for the Enterprise Edition"
             >
               <Lock size={14} className="text-slate-400" /> Send to Jira (Enterprise)
             </button>
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

      {design && (
        <div className="mb-8 p-5 bg-slate-900 text-white rounded-3xl border border-slate-800 flex items-start gap-4 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="bg-emerald-500/20 p-2 rounded-2xl text-emerald-400 shrink-0 border border-emerald-500/30">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1 relative z-10">
            <span className="font-extrabold text-emerald-400 uppercase tracking-widest block font-mono">⚡ Enterprise Integration Prepared</span>
            <p className="text-slate-350 leading-relaxed font-medium">The <strong className="text-white">Send to Jira</strong> pipeline is fully prepared for corporate board synchronizations. Automated epic mapping, standard backlog tickets generation, and sprint tasks synchronization will connect directly with your organization's instance once enterprise licenses are active.</p>
          </div>
        </div>
      )}

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
                dangerouslySetInnerHTML={{ __html: marked(design) as string }}
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
        proceedPath={`/project/${projectId}/transformation`}
        proceedLabel="Continue to Transformation"
      />

      <JiraIntegrationModal 
        isOpen={isJiraModalOpen} 
        onClose={() => setIsJiraModalOpen(false)} 
        solutionDesign={design}
        projectId={projectId as string}
      />
      
      <UpgradeToEnterpriseModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />

      {/* Specialist Term Modal Overlay */}
      {activeTerm && (() => {
        const dataJson = design.trim().startsWith('{') ? JSON.parse(design) : null;
        let matchedItem = dataJson?.securityHardening?.find((h: any) => h.requirement === activeTerm);
        const explanation = getSecurityExplanation(activeTerm, matchedItem?.packageOrConfig || '');

        return (
          <div 
            className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md z-50 animate-in fade-in duration-200"
            onClick={() => setActiveTerm(null)}
          >
            <div 
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl w-full text-white shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative gradient blob */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none"></div>
              
              <button 
                onClick={() => setActiveTerm(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-full transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3.5 mb-6">
                <div className="bg-emerald-500/20 p-2 rounded-2xl text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Specialist Security Concept</span>
                  <h3 className="text-xl font-extrabold text-white mt-0.5">{explanation.title}</h3>
                </div>
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description</h4>
                  <p className="text-slate-300 leading-relaxed">{explanation.explanation}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Technical & Architectural Impact</h4>
                  <p className="text-slate-400 leading-relaxed text-xs">{explanation.technicalImpact}</p>
                </div>

                {matchedItem && (
                  <div className="grid grid-cols-2 gap-4 border-y border-slate-850 py-3.5 my-2">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Requirement Category</span>
                      <span className="text-xs font-bold text-slate-200 mt-1 block">{matchedItem.category}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">NPM / Configuration Target</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block">{matchedItem.packageOrConfig}</span>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Implementation Snippet</h4>
                  <pre className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                    <code>{explanation.implementationPattern}</code>
                  </pre>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setActiveTerm(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  Acknowledge & Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cloud Services Deep-Dive Drawer */}
      {activeService && (() => {
        const details = getCloudServiceDetails(activeService.serviceName);

        return (
          <div 
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-300"
            onClick={() => setActiveService(null)}
          >
            <div 
              className="bg-slate-900 border-l border-slate-800 text-white w-full max-w-2xl h-full shadow-2xl z-50 flex flex-col justify-between animate-in slide-in-from-right duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-800/80 flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-12 -mt-12"></div>
                <div className="flex items-center gap-3.5 relative z-10">
                  <div className="bg-emerald-500/20 p-2.5 rounded-2xl text-emerald-400 border border-emerald-500/30">
                    <Network className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Service Integration Blueprint</span>
                    <h3 className="text-xl font-extrabold text-white mt-0.5">{details.title}</h3>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveService(null)}
                  className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-full transition-colors relative z-10"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 text-sm">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Service Binding Role</h4>
                  <p className="text-slate-205 leading-relaxed font-semibold">{activeService.purpose}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Detailed Architectural Overview</h4>
                  <p className="text-slate-350 leading-relaxed">{details.details}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 font-mono">Why This is Critical for Clean Core</h4>
                  <p className="text-slate-300 leading-relaxed text-xs border-l-2 border-emerald-500/40 pl-4 py-1.5 italic bg-emerald-950/20 rounded-r-xl">{details.whyCritical}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">NPM Package Dependencies</h4>
                  <div className="flex flex-wrap gap-2">
                    {details.npmPackages?.map((pkg, idx) => (
                      <code key={idx} className="bg-slate-950 text-emerald-400 border border-slate-800 text-xs px-3 py-1 rounded-xl font-mono">
                        {pkg}
                      </code>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Node.js Integration Code Guide</h4>
                    <button
                      onClick={() => handleCopyCode(details.codeSnippet)}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-900/60 px-3 py-1.5 rounded-xl transition-all"
                    >
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-[280px] select-all scrollbar-thin scrollbar-thumb-slate-800">
                    <code>{details.codeSnippet}</code>
                  </pre>
                </div>
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-slate-800/80 bg-slate-950/20 flex justify-between items-center gap-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Clean-Core.io Transformed Standard</span>
                <button
                  onClick={() => setActiveService(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-950/20"
                >
                  Return to Design Board
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
