'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import { useTestExecution } from '@/hooks/useTestExecution';
import Stepper from '@/components/Stepper';
import type { Project } from '@/lib/types';
import { Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, Activity, ShieldCheck, AlertTriangle, BarChart3, X, Rocket, CheckCircle2, Globe, Lock as LockIcon, Send, Sparkles, Eye, EyeOff, Clock, Loader2, BookOpen, ExternalLink, HelpCircle, ChevronDown, ChevronUp, Info, Database, Search, Layers, ChevronRight } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { clsx } from 'clsx';
import NavigationButtons from '@/components/NavigationButtons';
import { motion, AnimatePresence } from 'motion/react';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });
const TestingPieChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingPieChart), { ssr: false });
const TestingBarChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingBarChart), { ssr: false });

import { ProjectSkeleton } from '@/components/Skeleton';

import { useUserProfile } from '@/hooks/useUserProfile';
import { saveAs } from '@/lib/fileSaver';

const renderSafeValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'object') {
        try {
          return JSON.stringify(item);
        } catch (e) {
          return String(item);
        }
      }
      return String(item);
    }).join('\n');
  }
  if (typeof val === 'object') {
    try {
      return typeof val.toString === 'function' && val.toString() !== '[object Object]' 
        ? val.toString() 
        : JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  }
  return String(val);
};

export default function TestingSandboxPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTestCases, setSelectedTestCases] = useState<number[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // S/4HANA Connection states
  const [activeEnvTab, setActiveEnvTab] = useState<'mock' | 'live'>('mock');
  const [s4Url, setS4Url] = useState('');
  const [s4Username, setS4Username] = useState('');
  const [s4Password, setS4Password] = useState('');
  const [s4AuthType, setS4AuthType] = useState<'basic' | 'oauth2' | 'sap_hub' | 'btp_destination'>('basic');
  const [btpDestinationJson, setBtpDestinationJson] = useState('');
  const [showS4Password, setShowS4Password] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [accessRequestedMotivation, setAccessRequestedMotivation] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'failed'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(true);

  // OData Metadata Fetch states
  const [odataMode, setOdataMode] = useState<'idle' | 'loading' | 'catalog' | 'metadata' | 'error'>('idle');
  const [odataCatalog, setOdataCatalog] = useState<Array<{ title: string; path: string; serviceUrl: string }>>([]);
  const [odataSuggestedServices, setOdataSuggestedServices] = useState<Array<{ title: string; path: string }>>([]);
  const [odataEntityTypes, setOdataEntityTypes] = useState<Array<{ name: string; properties: Array<{ name: string; type: string; nullable: boolean }> }>>([]);
  const [odataServicePath, setOdataServicePath] = useState('');
  const [odataSelectedService, setOdataSelectedService] = useState('');
  const [odataMessage, setOdataMessage] = useState('');
  const [odataTotalServices, setOdataTotalServices] = useState(0);
  const [odataExpandedEntity, setOdataExpandedEntity] = useState<string | null>(null);
  const [odataCatalogSearch, setOdataCatalogSearch] = useState('');

  const { isGenerating, testCases, generateTestCases } = useTestGeneration(projectId as string, project, setProject);
  const { isRunning, testResults, sandboxOutput, setSandboxOutput, aiExplanation, runTestCases } = useTestExecution(projectId as string, project, setProject);
  const [showTestCode, setShowTestCode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchProject = async () => {
      const data = await loadProjectAndHydrate(projectId as string);
      if (data) {
        setProject(data);
      }
      setLoading(false);
    };
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (project) {
      if (project.s4Environment) {
        setActiveEnvTab(project.s4Environment);
      }
      // F-03: Load S4 metadata (non-secret) — password is write-only
      if (project.s4Meta?.configured) {
        setS4Url(project.s4Meta.url || '');
        setS4Username(project.s4Meta.username || '');
        setS4AuthType((project.s4Meta.authType as any) || 'basic');
        setS4Password('');
        if (project.s4Meta.url) setShowSetupGuide(false);
      } else if (project.s4Config) {
        // Legacy fallback
        setS4Url(project.s4Config.url || '');
        setS4Username(project.s4Config.username || '');
        setS4Password('');
        setS4AuthType(project.s4Config.authType || 'basic');
        setBtpDestinationJson(project.s4Config.btpDestinationJson || '');
        if (project.s4Config.url) setShowSetupGuide(false);
      } else if (profile?.s4Meta?.configured) {
        setS4Url(profile.s4Meta.url || '');
        setS4Username(profile.s4Meta.username || '');
        setS4AuthType((profile.s4Meta.authType as any) || 'basic');
        setS4Password('');
        if (profile.s4Meta.url) setShowSetupGuide(false);
      } else if (profile?.s4Config) {
        // Legacy fallback
        setS4Url(profile.s4Config.url || '');
        setS4Username(profile.s4Config.username || '');
        setS4Password('');
        setS4AuthType(profile.s4Config.authType || 'basic');
        setBtpDestinationJson(profile.s4Config.btpDestinationJson || '');
        if (profile.s4Config.url) setShowSetupGuide(false);
      }
    }
  }, [project, profile]);

  const handleEnvChange = async (env: 'mock' | 'live') => {
    setActiveEnvTab(env);
    try {
      const db = getDb();
      const projectRef = doc(db, 'projects', projectId as string);
      await setDoc(projectRef, { s4Environment: env }, { merge: true });
      setProject(prev => prev ? { ...prev, s4Environment: env } : null);
    } catch (err) {
      console.error("Failed to save environment choice:", err);
    }
  };

  const handleBtpJsonChange = (val: string) => {
    setBtpDestinationJson(val);
    try {
      const parsed = JSON.parse(val);
      if (parsed.URL) {
        setS4Url(parsed.URL);
      }
      if (parsed.Authentication === 'BasicAuthentication' && parsed.User) {
        setS4Username(parsed.User);
      }
    } catch(e) {
      // Invalid JSON typing - wait for completion
    }
  };

  const saveS4Config = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingConfig(true);
    try {
      // F-03: Save via encrypted server-side route
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/s4-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : '',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      
      // Also save environment preference to project
      const db = getDb();
      const projectRef = doc(db, 'projects', projectId as string);
      await setDoc(projectRef, { s4Environment: activeEnvTab }, { merge: true });
      setProject(prev => prev ? { ...prev, s4Environment: activeEnvTab } : null);
      
      setS4Password(''); // Clear from client state
      setConnectionMessage("Configuration saved securely (encrypted).");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err: any) {
      console.error("Failed to save S/4 config:", err);
      setConnectionMessage(err.message || "Failed to save configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('disconnected');
    setConnectionMessage('');
    
    const authLabel = s4AuthType === 'basic' ? 'Basic Auth' 
      : s4AuthType === 'oauth2' ? 'OAuth 2.0 Client Credentials' 
      : s4AuthType === 'sap_hub' ? 'SAP API Hub Sandbox Key'
      : 'BTP Destination Service';

    setSandboxOutput(
      `[sandbox-runtime] Initiating live connectivity test...\n` +
      `[sandbox-runtime] Target tenant URL: ${s4Url || 'N/A'}\n` +
      `[sandbox-runtime] Authentication method: ${authLabel}\n` +
      `[sandbox-runtime] Sending server-side HTTP handshake via /api/test-s4-connection...\n`
    );

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/test-s4-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
        })
      });

      const result = await response.json();

      if (result.status === 'connected') {
        setConnectionStatus('connected');
        setConnectionMessage(result.message);
        setSandboxOutput(prev => prev +
          `[sandbox-runtime] [SUCCESS] ${result.message}\n` +
          (result.httpStatus ? `[sandbox-runtime] HTTP Status: ${result.httpStatus}\n` : '') +
          `[sandbox-runtime] Connection check complete.`
        );
      } else {
        setConnectionStatus('failed');
        setConnectionMessage(result.message);
        setSandboxOutput(prev => prev +
          `[sandbox-runtime] [ERROR] ${result.message}\n` +
          (result.httpStatus ? `[sandbox-runtime] HTTP Status: ${result.httpStatus}\n` : '') +
          `[sandbox-runtime] Connection check failed.`
        );
      }
    } catch (err) {
      setConnectionStatus('failed');
      const msg = err instanceof Error ? err.message : 'Network error — the test proxy may be unavailable.';
      setConnectionMessage(`Connection test failed: ${msg}`);
      setSandboxOutput(prev => prev +
        `[sandbox-runtime] [ERROR] ${msg}\n` +
        `[sandbox-runtime] Connection check failed.`
      );
    } finally {
      setTestingConnection(false);
    }
  };

  // --- OData Metadata Fetch ---
  const handleFetchODataCatalog = async () => {
    setOdataMode('loading');
    setOdataMessage('');
    setOdataEntityTypes([]);
    setOdataSelectedService('');
    setSandboxOutput(prev => prev + `\n[odata-explorer] Querying OData service catalog from ${s4Url}...\n`);

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/fetch-odata-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setOdataCatalog(result.services || []);
        setOdataTotalServices(result.totalServices || 0);
        setOdataMode('catalog');
        setSandboxOutput(prev => prev + `[odata-explorer] [SUCCESS] Discovered ${result.totalServices} OData services on tenant.\n`);
      } else if (result.status === 'partial') {
        setOdataCatalog([]);
        setOdataSuggestedServices(result.suggestedServices || []);
        setOdataMessage(result.message || '');
        setOdataMode('catalog');
        setSandboxOutput(prev => prev + `[odata-explorer] [INFO] ${result.message}\n`);
      } else {
        setOdataMode('error');
        setOdataMessage(result.message || 'Failed to fetch catalog.');
        setSandboxOutput(prev => prev + `[odata-explorer] [ERROR] ${result.message}\n`);
      }
    } catch (err) {
      setOdataMode('error');
      const msg = err instanceof Error ? err.message : 'Network error';
      setOdataMessage(`Failed to fetch OData catalog: ${msg}`);
      setSandboxOutput(prev => prev + `[odata-explorer] [ERROR] ${msg}\n`);
    }
  };

  const handleFetchServiceMetadata = async (path: string) => {
    setOdataMode('loading');
    setOdataSelectedService(path);
    setOdataMessage('');
    setSandboxOutput(prev => prev + `\n[odata-explorer] Fetching $metadata for ${path}...\n`);

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const response = await fetch('/api/fetch-odata-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          useStoredCredentials: true,
          servicePath: path,
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setOdataEntityTypes(result.entityTypes || []);
        setOdataMode('metadata');
        setOdataExpandedEntity(null);
        setSandboxOutput(prev => prev +
          `[odata-explorer] [SUCCESS] ${path}: ${result.totalEntityTypes} EntityTypes discovered.\n` +
          result.entityTypes.slice(0, 5).map((et: any) => `  → ${et.name} (${et.properties.length} properties)\n`).join('')
        );
      } else {
        setOdataMode('error');
        setOdataMessage(result.message || `Failed to fetch metadata for ${path}.`);
        setSandboxOutput(prev => prev + `[odata-explorer] [ERROR] ${result.message}\n`);
      }
    } catch (err) {
      setOdataMode('error');
      const msg = err instanceof Error ? err.message : 'Network error';
      setOdataMessage(`Metadata fetch failed: ${msg}`);
      setSandboxOutput(prev => prev + `[odata-explorer] [ERROR] ${msg}\n`);
    }
  };

  const handleRequestAccess = async () => {
    const auth = getAuth();
    const uid = auth.currentUser?.uid;
    if (!uid || !profile) return;

    setIsRequestingAccess(true);
    try {
      const db = getDb();
      
      // 1. Create a request log in Firestore
      await setDoc(doc(db, 'tenant_access_requests', uid), {
        name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
        motivation: accessRequestedMotivation || 'Live S/4HANA Public Cloud Sandbox Connection Pilot',
        status: 'pending',
        createdAt: new Date()
      });

      // 3. Trigger email notification
      const token = await getAuth().currentUser?.getIdToken();
      await fetch('/api/request-tenant-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid,
          email: profile.email,
          name: `${profile.firstName} ${profile.lastName}`,
          motivation: accessRequestedMotivation || 'Live S/4HANA Public Cloud Sandbox Connection Pilot'
        })
      });

      // Force profile update trigger client-side
      profile.s4TenantAccessRequested = true;
      
    } catch (err) {
      console.error("Failed to request tenant access:", err);
    } finally {
      setIsRequestingAccess(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateTestCases();
      if (result && result.testCases) {
        setSelectedTestCases(result.testCases.map((_: any, i: number) => i));
      }
    } catch (error) {
      console.error("Failed to generate test cases:", error);
    }
  };

  const handleRun = async () => {
    const selected = testCases.filter((_, i) => selectedTestCases.includes(i));
    try {
      await runTestCases(selected);
    } catch (error) {
      console.error("Failed to run test cases:", error);
    }
  };

  const getStats = () => {
    if (!testResults) return null;
    const total = testResults.length;
    const passed = testResults.filter((r: any) => r.status === 'Passed').length;
    const failed = total - passed;
    const passRate = Math.round((passed / total) * 100);

    const categories = Array.from(new Set(testResults.map((r: any) => r.category || 'Uncategorized')));
    const categoryStats = categories.map(cat => {
      const catTests = testResults.filter((r: any) => (r.category || 'Uncategorized') === cat);
      const catPassed = catTests.filter((r: any) => r.status === 'Passed').length;
      return {
        name: cat as string,
        passed: catPassed,
        failed: catTests.length - catPassed,
        total: catTests.length
      };
    });

    return { total, passed, failed, passRate, categoryStats };
  };

  const stats = getStats();
  const pieData = stats ? [
    { name: 'Passed', value: stats.passed, color: '#006b2c' },
    { name: 'Failed', value: stats.failed, color: '#dc2626' }
  ] : [];

  const toggleTestCase = (index: number) => {
    setSelectedTestCases(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const exportTestCasesToExcel = async () => {
    if ((profile?.tier as string) === 'basic') {
      setShowUpgradeModal(true);
      return;
    }
    try {
      if (!testCases || testCases.length === 0) return;
      
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      
      // 1. Summary sheet
      const wsSummary = wb.addWorksheet("Test Suite Summary");
      wsSummary.columns = [
        { header: 'ID', key: 'ID', width: 15 },
        { header: 'Name', key: 'Name', width: 35 },
        { header: 'Priority', key: 'Priority', width: 15 },
        { header: 'Status', key: 'Status', width: 15 }
      ];
      
      testCases.forEach(tc => {
        wsSummary.addRow({
          ID: renderSafeValue(tc.id) || 'N/A',
          Name: renderSafeValue(tc.name) || 'Untitled',
          Priority: renderSafeValue(tc.priority) || 'Medium',
          Status: 'Pending'
        });
      });

      // 2. Detail sheets
      testCases.forEach((tc, index) => {
        const safeId = renderSafeValue(tc.id) || `TC_${index}`;
        const wsDetail = wb.addWorksheet(safeId.slice(0, 30));
        
        wsDetail.addRow(["Test Case ID", safeId]);
        wsDetail.addRow(["Test Case Name", renderSafeValue(tc.name) || 'Untitled']);
        wsDetail.addRow(["Priority", renderSafeValue(tc.priority) || 'Medium']);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Description", renderSafeValue(tc.description) || '']);
        wsDetail.addRow(["Preconditions", renderSafeValue(tc.preconditions) || '']);
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Test Steps", ""]);
        
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        steps.forEach((s: any, i: number) => {
          wsDetail.addRow([`Step ${i+1}`, renderSafeValue(s) || '']);
        });
        
        wsDetail.addRow(["", ""]);
        wsDetail.addRow(["Expected Result", renderSafeValue(tc.expectedResult) || '']);
        wsDetail.addRow(["Test Data", renderSafeValue(tc.testData) || 'N/A']);
        wsDetail.addRow(["Validation Points", renderSafeValue(tc.validationPoints) || 'N/A']);
      });

      // 3. Generate file buffer and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const projectName = project?.name?.replace(/\s+/g, '_') || 'Project';
      await saveAs(blob, `${projectName}_Test_Suite.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
    }
  };

  const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8">
      <Stepper currentStep={5} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      
      <div className="mb-6 md:mb-10 mt-6 md:mt-8">
        <h1 className="text-3xl md:text-4xl font-black text-[#0b1c30] tracking-tight mb-2">Testing & Sandbox</h1>
        <p className="text-[#0b1c30]/70 font-medium text-sm md:text-base">
          {isAbapCloud 
            ? 'Generate ABAP Unit stubs and run simulated validation in a secure SAP ADT environment.'
            : 'Generate test cases and run automated validation in an isolated Node.js environment.'
          }
        </p>
      </div>

      {/* Explanation Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-10">
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-blue-100 shadow-sm flex gap-4">
          <ShieldCheck className="w-8 h-8 md:w-10 md:h-10 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-blue-900 mb-1 text-sm md:text-base">
              {isAbapCloud ? 'ABAP Unit Compiler' : 'Real Sandbox Execution'}
            </h3>
            <p className="text-xs md:text-sm text-blue-700">
              {isAbapCloud 
                ? 'Generates standardized ABAP Unit local test classes verifying RAP custom behavioral entities.'
                : 'We execute actual Node.js code in an isolated environment. No simulation, just real results.'
              }
            </p>
          </div>
        </div>
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-green-100 shadow-sm flex gap-4">
          <Activity className="w-8 h-8 md:w-10 md:h-10 text-green-600 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-green-900 mb-1 text-sm md:text-base">
              {isAbapCloud ? 'SQL Test Double Mock' : 'SAP Mock Library'}
            </h3>
            <p className="text-xs md:text-sm text-green-700">
              {isAbapCloud 
                ? 'Realistic SQL Double DB schemas are mocked to test transactional behavior logic without core pollution.'
                : 'Realistic SAP response patterns are injected to ensure business logic parity.'
              }
            </p>
          </div>
        </div>
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-purple-100 shadow-sm flex gap-4">
          <BarChart3 className="w-8 h-8 md:w-10 md:h-10 text-purple-600 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-purple-900 mb-1 text-sm md:text-base">Estimated Coverage</h3>
            <p className="text-xs md:text-sm text-purple-700 font-bold uppercase tracking-tight">
              {project?.coverageEstimate ? `${project.coverageEstimate.percentage}% Coverage` : 'Generate tests to see estimate'}
            </p>
          </div>
        </div>
      </div>

      {/* Environment Selection Toggle */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0b1c30] flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Validation Environment
          </h2>
          <p className="text-xs text-[#0b1c30]/60 mt-1 font-medium">Select where to execute your sandboxed integration tests.</p>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl w-full sm:w-auto self-start sm:self-auto">
          <button
            onClick={() => handleEnvChange('mock')}
            className={clsx(
              "flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all text-center",
              activeEnvTab === 'mock' 
                ? "bg-[#0b1c30] text-white shadow-md" 
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            Mock Environment
          </button>
          <button
            onClick={() => handleEnvChange('live')}
            className={clsx(
              "flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-center",
              activeEnvTab === 'live' 
                ? "bg-blue-600 text-white shadow-md" 
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            Connected S/4HANA Tenant
            <span className="bg-blue-500/20 text-blue-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-normal">Premium</span>
          </button>
        </div>
      </div>

      {/* S/4HANA Tenant Integration Panel */}
      <AnimatePresence>
        {activeEnvTab === 'live' && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden animate-in fade-in"
          >
            {profile?.s4TenantAccessAllowed || profile?.isAdmin ? (
              // Unlocked Active Connection Card
              <div className="bg-white border border-gray-100 rounded-[2rem] p-6 md:p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-black text-[#0b1c30] tracking-tight uppercase flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        S/4HANA Live Tenant Bridge
                      </h3>
                      <Link 
                        href="/settings"
                        className="text-xs text-blue-600 hover:text-blue-700 font-extrabold flex items-center gap-1 hover:underline shrink-0"
                      >
                        Profile Settings ↗
                      </Link>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-1">Configure your non-productive S/4HANA Public Cloud endpoint to fetch live ERP data.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border flex items-center gap-1.5",
                      connectionStatus === 'connected' ? "bg-green-50 border-green-200 text-green-700" :
                      connectionStatus === 'failed' ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-250 text-gray-500"
                    )}>
                      <span className={clsx(
                        "w-2 h-2 rounded-full",
                        connectionStatus === 'connected' ? "bg-green-500 animate-pulse" :
                        connectionStatus === 'failed' ? "bg-red-500" : "bg-gray-400"
                      )}></span>
                      {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'failed' ? 'Connection Failed' : 'Disconnected'}
                    </span>
                  </div>
                </div>

                {/* ─────── Comprehensive Setup Guide (collapsible) ─────── */}
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowSetupGuide(!showSetupGuide)}
                    className="w-full flex items-center justify-between bg-gradient-to-r from-indigo-50 via-sky-50 to-blue-50 border border-indigo-200/60 p-4 rounded-2xl hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-600/10 p-2 rounded-xl shrink-0">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-indigo-950 uppercase tracking-widest">Quick Start Guide — How to Connect Your S/4HANA Tenant</p>
                        <p className="text-[10px] text-indigo-700/80 font-semibold mt-0.5">Step-by-step instructions for every authentication method. Click to {showSetupGuide ? 'collapse' : 'expand'}.</p>
                      </div>
                    </div>
                    {showSetupGuide ? <ChevronUp className="w-5 h-5 text-indigo-500" /> : <ChevronDown className="w-5 h-5 text-indigo-500" />}
                  </button>

                  <AnimatePresence>
                    {showSetupGuide && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-gradient-to-br from-indigo-50/80 to-sky-50/60 border border-t-0 border-indigo-200/40 p-5 rounded-b-2xl -mt-2 space-y-4">
                          
                          {/* Step 1 — Always visible */}
                          <div className="flex gap-3 items-start">
                            <span className="bg-indigo-600 text-white text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5">1</span>
                            <div>
                              <p className="text-xs font-bold text-indigo-950">Choose your Authentication Type</p>
                              <p className="text-[11px] text-indigo-800/80 font-medium leading-relaxed">
                                Select the method that matches your SAP system setup from the dropdown below. Not sure which to use? Here is a quick overview:
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                <div className={clsx("p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed transition-all", s4AuthType === 'basic' ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200" : "bg-white/50 border-gray-200/80")}>
                                  <span className="font-black text-indigo-900 block mb-0.5">Basic Authentication</span>
                                  <span className="text-gray-600">Username + Password. Use for S/4HANA Cloud test tenants with Communication Arrangements (API users).</span>
                                </div>
                                <div className={clsx("p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed transition-all", s4AuthType === 'oauth2' ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200" : "bg-white/50 border-gray-200/80")}>
                                  <span className="font-black text-indigo-900 block mb-0.5">OAuth 2.0 Client Credentials</span>
                                  <span className="text-gray-600">Client ID + Secret. Use when your S/4HANA tenant provides OAuth token endpoints via Communication Arrangements.</span>
                                </div>
                                <div className={clsx("p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed transition-all", s4AuthType === 'sap_hub' ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200" : "bg-white/50 border-gray-200/80")}>
                                  <span className="font-black text-indigo-900 block mb-0.5">SAP API Business Hub Sandbox</span>
                                  <span className="text-gray-600">Free sandbox API key. No own tenant needed — perfect for testing with SAP{"'"}s public demo APIs.</span>
                                </div>
                                <div className={clsx("p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed transition-all", s4AuthType === 'btp_destination' ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200" : "bg-white/50 border-gray-200/80")}>
                                  <span className="font-black text-indigo-900 block mb-0.5">BTP Destination Service (JSON)</span>
                                  <span className="text-gray-600">Paste your BTP destination JSON config. For enterprises routing via SAP BTP with Cloud Connector or Internet proxy.</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 2 — Dynamic based on auth type */}
                          <div className="flex gap-3 items-start">
                            <span className="bg-indigo-600 text-white text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5">2</span>
                            <div>
                              <p className="text-xs font-bold text-indigo-950">Enter Your Connection Details</p>
                              {s4AuthType === 'basic' && (
                                <div className="text-[11px] text-indigo-800/80 font-medium leading-relaxed space-y-1 mt-1">
                                  <p>→ <strong>Tenant URL:</strong> Your API endpoint, e.g. <code className="bg-white/80 px-1.5 py-0.5 rounded text-[10px] font-mono border border-indigo-200/50">https://my300120-api.s4hana.cloud.sap</code></p>
                                  <p>→ <strong>Username:</strong> The Communication User name from your Communication Arrangement (e.g. <code className="bg-white/80 px-1.5 py-0.5 rounded text-[10px] font-mono border border-indigo-200/50">CC_INTEGRATOR</code>)</p>
                                  <p>→ <strong>Password:</strong> The password assigned to that Communication User</p>
                                  <p className="text-[10px] text-indigo-600 mt-1">📍 Where to find: S/4HANA Cloud → Communication Management → Communication Arrangements → Your arrangement → Inbound Communication → User Name</p>
                                </div>
                              )}
                              {s4AuthType === 'oauth2' && (
                                <div className="text-[11px] text-indigo-800/80 font-medium leading-relaxed space-y-1 mt-1">
                                  <p>→ <strong>Tenant URL:</strong> Your API endpoint, e.g. <code className="bg-white/80 px-1.5 py-0.5 rounded text-[10px] font-mono border border-indigo-200/50">https://my300120-api.s4hana.cloud.sap</code></p>
                                  <p>→ <strong>Client ID:</strong> The OAuth client ID from your Communication Arrangement (starts with <code className="bg-white/80 px-1.5 py-0.5 rounded text-[10px] font-mono border border-indigo-200/50">sb-clone-...</code>)</p>
                                  <p>→ <strong>Client Secret:</strong> The OAuth client secret generated alongside the Client ID</p>
                                  <p className="text-[10px] text-indigo-600 mt-1">📍 Where to find: S/4HANA Cloud → Communication Arrangements → OAuth 2.0 Details → Client ID / Client Secret</p>
                                </div>
                              )}
                              {s4AuthType === 'sap_hub' && (
                                <div className="text-[11px] text-indigo-800/80 font-medium leading-relaxed space-y-1 mt-1">
                                  <p>→ <strong>Tenant URL:</strong> Use SAP{"'"}s sandbox URL: <code className="bg-white/80 px-1.5 py-0.5 rounded text-[10px] font-mono border border-indigo-200/50">https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/</code></p>
                                  <p>→ No username or password needed — only your API key is required</p>
                                  <p className="text-[10px] text-indigo-600 mt-1">📍 Where to find: <a href="https://api.sap.com" target="_blank" rel="noopener noreferrer" className="underline">api.sap.com</a> → Log in → Show API Key (top-right on any API page)</p>
                                </div>
                              )}
                              {s4AuthType === 'btp_destination' && (
                                <div className="text-[11px] text-indigo-800/80 font-medium leading-relaxed space-y-1 mt-1">
                                  <p>→ Paste the full JSON from your BTP Destination into the text area below</p>
                                  <p>→ The system automatically extracts <strong>Name</strong>, <strong>URL</strong>, <strong>Authentication</strong>, and <strong>ProxyType</strong></p>
                                  <p className="text-[10px] text-indigo-600 mt-1">📍 Where to find: SAP BTP Cockpit → Connectivity → Destinations → Select your destination → Export as JSON (or copy the config)</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Step 3 + 4 — Always visible */}
                          <div className="flex gap-3 items-start">
                            <span className="bg-indigo-600 text-white text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5">3</span>
                            <div>
                              <p className="text-xs font-bold text-indigo-950">Test the Connection</p>
                              <p className="text-[11px] text-indigo-800/80 font-medium">Click <strong>"Test Connection"</strong> to verify the handshake. The sandbox terminal below will show the live connection log.</p>
                            </div>
                          </div>
                          <div className="flex gap-3 items-start">
                            <span className="bg-indigo-600 text-white text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5">4</span>
                            <div>
                              <p className="text-xs font-bold text-indigo-950">Save and Run Tests</p>
                              <p className="text-[11px] text-indigo-800/80 font-medium">Click <strong>"Save Connection"</strong> to persist the config. Then generate and execute test cases — they will run against your live tenant data.</p>
                            </div>
                          </div>

                          {/* Security Notice */}
                          <div className="bg-green-50/70 border border-green-200/60 p-3 rounded-xl flex items-start gap-2 mt-2">
                            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-green-800 font-semibold leading-relaxed">
                              <strong>Security:</strong> Credentials are encrypted in-browser before transmission. Production domains (<code className="bg-green-100 px-1 rounded font-mono">*-api.s4hana.ondemand.com</code>) are automatically blocked. Only non-productive sandbox/test systems are allowed.
                            </p>
                          </div>

                          {/* Quick links */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Link
                              href="/knowledge"
                              className="inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-700 uppercase tracking-widest bg-white hover:bg-indigo-100 border border-indigo-200 px-3.5 py-2 rounded-xl transition-all hover:shadow-sm"
                            >
                              <ExternalLink className="w-3 h-3" /> Knowledge Hub
                            </Link>
                            <button
                              type="button"
                              onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
                              className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest bg-white hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl transition-all hover:shadow-sm"
                            >
                              <HelpCircle className="w-3 h-3" /> Ask AI for Help
                            </button>
                            <Link
                              href="/settings"
                              className="inline-flex items-center gap-1.5 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white hover:bg-gray-100 border border-gray-200 px-3.5 py-2 rounded-xl transition-all hover:shadow-sm"
                            >
                              <ExternalLink className="w-3 h-3" /> Manage in Profile Settings
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ─────── Connection Form with Contextual Helpers ─────── */}
                <form onSubmit={saveS4Config} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Tenant URL */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Tenant HTTPS URL</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          required
                          value={s4Url}
                          onChange={e => setS4Url(e.target.value)}
                          placeholder={s4AuthType === 'sap_hub' ? 'https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/' : 'https://my300120-api.s4hana.cloud.sap'}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                        />
                      </div>
                      <div className="flex items-start gap-1.5">
                        <Info className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                          {s4AuthType === 'sap_hub'
                            ? 'Use the SAP API Business Hub sandbox base URL. Find it at api.sap.com on any S/4HANA Cloud API page.'
                            : s4AuthType === 'btp_destination'
                            ? 'Auto-filled from your BTP Destination JSON. You can also enter it manually.'
                            : 'Your S/4HANA Cloud API host. Format: https://myXXXXXX-api.s4hana.cloud.sap — found in your S/4HANA Launchpad under Communication Arrangements.'
                          }
                        </span>
                      </div>
                    </div>

                    {/* Authentication Type */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Authentication Type</label>
                      <select
                        value={s4AuthType}
                        onChange={e => setS4AuthType(e.target.value as any)}
                        className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                      >
                        <option value="basic">Basic Authentication (Username + Password)</option>
                        <option value="oauth2">OAuth 2.0 Client Credentials (Client ID + Secret)</option>
                        <option value="sap_hub">SAP API Business Hub Sandbox (API Key only)</option>
                        <option value="btp_destination">SAP BTP Destination Service (Paste JSON)</option>
                      </select>
                      <div className="flex items-start gap-1.5">
                        <Info className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                          {s4AuthType === 'basic' && 'Best for direct S/4HANA Cloud sandbox connections using a Communication User.'}
                          {s4AuthType === 'oauth2' && 'Use when your Communication Arrangement provides OAuth 2.0 token endpoints.'}
                          {s4AuthType === 'sap_hub' && 'No S/4HANA system needed — uses SAP\'s free public sandbox APIs for testing.'}
                          {s4AuthType === 'btp_destination' && 'For enterprise setups routing through SAP BTP with Cloud Connector or direct proxy.'}
                        </span>
                      </div>
                    </div>

                    {/* BTP Destination JSON */}
                    {s4AuthType === 'btp_destination' && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">SAP BTP Destination JSON Configuration</label>
                        <textarea
                          required
                          value={btpDestinationJson}
                          onChange={e => handleBtpJsonChange(e.target.value)}
                          placeholder={'{\n  "Name": "S4_CLOUDSANDBOX",\n  "Type": "HTTP",\n  "URL": "https://my300120-api.s4hana.cloud.sap",\n  "Authentication": "PrincipalPropagation",\n  "ProxyType": "OnPremise",\n  "tokenServiceURL": "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token"\n}'}
                          className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-32 font-mono resize-none"
                        />
                        <div className="flex items-start gap-1.5">
                          <Info className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-gray-450 font-bold leading-relaxed">
                            Paste the JSON from SAP BTP Cockpit → Connectivity → Destinations. The Name, URL, Authentication, and ProxyType fields are auto-extracted.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Username / Client ID + Password / Secret fields */}
                    {s4AuthType !== 'sap_hub' && s4AuthType !== 'btp_destination' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                            {s4AuthType === 'oauth2' ? 'Client ID' : 'Username'}
                          </label>
                          <div className="relative">
                            <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              required
                              value={s4Username}
                              onChange={e => setS4Username(e.target.value)}
                              placeholder={s4AuthType === 'oauth2' ? 'sb-clone-xxxx...' : 'CC_INTEGRATOR'}
                              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                            />
                          </div>
                          <div className="flex items-start gap-1.5">
                            <Info className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                            <span className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                              {s4AuthType === 'oauth2'
                                ? 'Found in Communication Arrangements → OAuth 2.0 Details → Client ID. Starts with "sb-clone-".'
                                : 'The Communication User name from your Communication Arrangement. Example: CC_INTEGRATOR or INTEGRATION_USER.'
                              }
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                            {s4AuthType === 'oauth2' ? 'Client Secret' : 'Password'}
                          </label>
                          <div className="relative">
                            <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type={showS4Password ? "text" : "password"}
                              required
                              value={s4Password}
                              onChange={e => setS4Password(e.target.value)}
                              placeholder="••••••••••••••••"
                              className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                            />
                            <button
                              type="button"
                              onClick={() => setShowS4Password(!showS4Password)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-650 transition-colors"
                            >
                              {showS4Password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <Info className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                            <span className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                              {s4AuthType === 'oauth2'
                                ? 'The Client Secret generated together with your Client ID. Only shown once when creating the Communication Arrangement.'
                                : 'The password set for the Communication User. If forgotten, reset it in the Communication Arrangement settings.'
                              }
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {connectionMessage && (
                    <div className={clsx(
                      "p-4 rounded-xl border text-xs font-bold transition-all",
                      connectionStatus === 'connected' ? "bg-green-50 border-green-200 text-green-800" :
                      connectionStatus === 'failed' ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-800"
                    )}>
                      {connectionMessage}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection || !s4Url}
                      className="flex-1 h-12 flex items-center justify-center gap-2 bg-gradient-to-br from-blue-600 to-sky-600 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                    >
                      {testingConnection ? <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying Connection...</> : <><Globe className="w-4 h-4" /> Test Connection</>}
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="flex-1 h-12 flex items-center justify-center gap-2 bg-gradient-to-br from-gray-900 to-slate-800 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                    >
                      {isSavingConfig ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> : <><ShieldCheck className="w-4 h-4" /> Save Connection</>}
                    </button>
                  </div>
                </form>

                {/* ─────── OData Service Explorer (appears after connection) ─────── */}
                <AnimatePresence>
                  {connectionStatus === 'connected' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 border border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 to-teal-50/30 rounded-2xl p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                          <div className="flex items-center gap-3">
                            <div className="bg-emerald-600/10 p-2.5 rounded-xl">
                              <Database className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wider">OData Service Explorer</h3>
                              <p className="text-[10px] text-emerald-700/70 font-semibold">Browse live OData services exposed by your connected tenant.</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleFetchODataCatalog}
                            disabled={odataMode === 'loading'}
                            className="shrink-0 h-10 px-5 flex items-center justify-center gap-2 bg-gradient-to-br from-emerald-600 to-teal-600 hover:shadow-lg text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                          >
                            {odataMode === 'loading' ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching...</> : <><Search className="w-3.5 h-3.5" /> Discover Services</>}
                          </button>
                        </div>

                        {/* Manual service input */}
                        <div className="flex gap-2 mb-4">
                          <div className="relative flex-1">
                            <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              value={odataServicePath}
                              onChange={e => setOdataServicePath(e.target.value)}
                              placeholder="Enter service name, e.g. API_BUSINESS_PARTNER"
                              className="w-full pl-9 pr-4 py-2.5 bg-white border border-emerald-200/60 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-400 transition-all text-[#0b1c30]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => odataServicePath && handleFetchServiceMetadata(odataServicePath)}
                            disabled={!odataServicePath || odataMode === 'loading'}
                            className="shrink-0 h-[42px] px-4 flex items-center gap-1.5 bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all disabled:opacity-40"
                          >
                            <Layers className="w-3.5 h-3.5" /> Fetch $metadata
                          </button>
                        </div>

                        {/* Error message */}
                        {odataMode === 'error' && odataMessage && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800 mb-4 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            {odataMessage}
                          </div>
                        )}

                        {/* Info message (partial catalog) */}
                        {odataMode === 'catalog' && odataMessage && odataCatalog.length === 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 mb-4 flex items-start gap-2">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p>{odataMessage}</p>
                              {odataSuggestedServices.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {odataSuggestedServices.map(svc => (
                                    <button
                                      key={svc.path}
                                      type="button"
                                      onClick={() => handleFetchServiceMetadata(svc.path)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 hover:bg-amber-100 text-amber-900 font-bold text-[10px] rounded-lg transition-all"
                                    >
                                      <Database className="w-3 h-3" /> {svc.title}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Service Catalog Results */}
                        {odataMode === 'catalog' && odataCatalog.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
                                {odataTotalServices} Services Discovered
                              </span>
                              <div className="relative w-48">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                <input
                                  type="text"
                                  value={odataCatalogSearch}
                                  onChange={e => setOdataCatalogSearch(e.target.value)}
                                  placeholder="Filter services..."
                                  className="w-full pl-7 pr-3 py-1.5 bg-white border border-emerald-200/60 rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-emerald-400 transition-all"
                                />
                              </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto rounded-xl border border-emerald-100 bg-white divide-y divide-emerald-50">
                              {odataCatalog
                                .filter(svc =>
                                  !odataCatalogSearch ||
                                  svc.title.toLowerCase().includes(odataCatalogSearch.toLowerCase()) ||
                                  svc.path.toLowerCase().includes(odataCatalogSearch.toLowerCase())
                                )
                                .slice(0, 50)
                                .map((svc, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleFetchServiceMetadata(svc.path)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 transition-all text-left group"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-emerald-900 block truncate">{svc.title}</span>
                                      <span className="text-[10px] font-mono text-emerald-600/70 block truncate">{svc.path}</span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:text-emerald-600 shrink-0 transition-colors" />
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Metadata Results (Entity Types) */}
                        {odataMode === 'metadata' && odataEntityTypes.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setOdataMode('catalog'); setOdataEntityTypes([]); }}
                                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 underline"
                                >
                                  ← Back to catalog
                                </button>
                                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
                                  {odataSelectedService} — {odataEntityTypes.length} Entity Types
                                </span>
                              </div>
                            </div>
                            <div className="max-h-80 overflow-y-auto rounded-xl border border-emerald-100 bg-white divide-y divide-emerald-50">
                              {odataEntityTypes.map((et, i) => (
                                <div key={i}>
                                  <button
                                    type="button"
                                    onClick={() => setOdataExpandedEntity(odataExpandedEntity === et.name ? null : et.name)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50 transition-all text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-bold text-emerald-900">{et.name}</span>
                                      <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        {et.properties.length} props
                                      </span>
                                    </div>
                                    <ChevronDown className={clsx(
                                      "w-4 h-4 text-emerald-400 transition-transform",
                                      odataExpandedEntity === et.name && "rotate-180"
                                    )} />
                                  </button>
                                  {odataExpandedEntity === et.name && (
                                    <div className="px-4 pb-3">
                                      <div className="bg-emerald-50/50 rounded-lg border border-emerald-100 overflow-hidden">
                                        <table className="w-full text-[10px]">
                                          <thead>
                                            <tr className="bg-emerald-100/60">
                                              <th className="text-left px-3 py-1.5 font-black text-emerald-800 uppercase tracking-wider">Property</th>
                                              <th className="text-left px-3 py-1.5 font-black text-emerald-800 uppercase tracking-wider">Type</th>
                                              <th className="text-left px-3 py-1.5 font-black text-emerald-800 uppercase tracking-wider">Nullable</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-emerald-100/50">
                                            {et.properties.map((prop, pi) => (
                                              <tr key={pi} className="hover:bg-emerald-50">
                                                <td className="px-3 py-1.5 font-mono font-semibold text-emerald-900">{prop.name}</td>
                                                <td className="px-3 py-1.5 font-mono text-emerald-600">{prop.type.replace('Edm.', '')}</td>
                                                <td className="px-3 py-1.5">
                                                  <span className={clsx(
                                                    "px-1.5 py-0.5 rounded text-[9px] font-bold",
                                                    prop.nullable ? "bg-gray-100 text-gray-500" : "bg-red-50 text-red-600"
                                                  )}>
                                                    {prop.nullable ? 'Yes' : 'Required'}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Empty state */}
                        {odataMode === 'idle' && (
                          <div className="text-center py-6 text-emerald-600/50">
                            <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-[11px] font-semibold">Click "Discover Services" to browse the OData catalog, or enter a service name above.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              // Locked Teaser Card / Guide & Access Request
              <div className="bg-[#ffffff] border border-gray-100 rounded-[2rem] p-6 md:p-10 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-sky-500 to-blue-600" />
                
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-sky-600/10 p-2.5 rounded-2xl">
                    <Globe className="text-sky-600" size={22} />
                  </div>
                  <h3 className="text-xl font-black text-[#0b1c30] tracking-tight uppercase flex items-center gap-2">
                    Live S/4HANA Integration Bridge
                  </h3>
                </div>

                <div className="space-y-6 max-w-4xl">
                  {/* Instructions */}
                  <div className="bg-sky-50/50 border border-sky-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-sky-950 uppercase tracking-widest mb-3">📋 Instructions (Setup Guide)</h3>
                    <ol className="list-decimal pl-4 text-xs text-sky-850 space-y-2 font-medium">
                      <li><strong>Request access:</strong> Use the form below to request pilot access for your organization.</li>
                      <li><strong>Provide HTTPS endpoint:</strong> Set up a secure HTTPS connection to your S/4HANA sandbox or test system.</li>
                      <li><strong>Configure credentials:</strong> Once approved, you can configure your credentials (Basic Auth or OAuth 2.0).</li>
                      <li><strong>Test & use connection:</strong> Run live test cases against OData interfaces directly from the Stage 5 testing environment.</li>
                    </ol>
                  </div>

                  {/* Security Measures */}
                  <div className="bg-green-50/50 border border-green-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-green-950 uppercase tracking-widest mb-3">🛡️ Security Measures & Explanations</h3>
                    <ul className="list-disc pl-4 text-xs text-green-850 space-y-2 font-medium">
                      <li><strong>Browser-side Encryption:</strong> All passwords and tokens are encrypted locally in the browser before being transmitted to the proxy tunnel.</li>
                      <li><strong>Production Block:</strong> Access to production interfaces (<code className="bg-green-100 px-1 py-0.5 rounded font-mono text-[10px]">*-api.s4hana.ondemand.com</code>) is blocked by the system.</li>
                      <li><strong>Sandboxed Execution:</strong> Data connections are routed through an isolated BTP proxy channel to comply with CORS policies and protect your IP address.</li>
                    </ul>
                  </div>

                  {/* Disclaimer */}
                  <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl">
                    <h3 className="text-xs font-black text-amber-950 uppercase tracking-widest mb-2">⚠️ Warranty Disclaimer</h3>
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      This platform is a non-commercial community pilot environment. Access is provided entirely without warranty, guarantee, or liability. Under no circumstances should you use productive ERP data or real passwords.
                    </p>
                  </div>

                  {/* Request Form / Status */}
                  {profile?.s4TenantAccessRequested ? (
                    <div className="bg-amber-50/50 border border-amber-150 p-5 rounded-2xl flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-900 text-xs md:text-sm mb-1 uppercase tracking-tight">Request in Review</h4>
                        <p className="text-xs text-amber-800/90 leading-relaxed font-medium">
                          Your request for live S/4HANA access is currently being reviewed by our system administrators. Approvals are usually processed within 24 hours.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          Description of your pilot use case (Motivation)
                        </label>
                        <textarea 
                          placeholder="E.g., connecting our non-productive S/4HANA Public Cloud Sandbox to validate OData interfaces..."
                          value={accessRequestedMotivation}
                          onChange={e => setAccessRequestedMotivation(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-[#0b1c30] focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all h-20 resize-none outline-none font-medium"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleRequestAccess}
                        disabled={isRequestingAccess}
                        className="w-full bg-gradient-to-r from-blue-600 to-sky-650 hover:shadow-lg text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 h-11"
                      >
                        {isRequestingAccess ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Request Access for Live S/4HANA 🚀</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test Suite UI */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 mb-8">
        <div className="bg-[#ffffff] rounded-[2rem] shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[600px]">
          <div className="bg-[#eff4ff] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-[#006b2c]/10 p-2 rounded-xl">
                <ListChecks className="w-5 h-5 text-[#006b2c]" />
              </div>
              <h2 className="text-lg font-bold text-[#0b1c30]">Test Suite</h2>
            </div>
            <button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 text-xs md:text-sm font-bold"
            >
              {isGenerating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : (testCases.length > 0 ? 'Regenerate Suite' : 'Generate Suite')}
            </button>
          </div>
          
          <div className="p-4 md:p-6 flex-grow overflow-auto">
            {testCases.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 bg-[#f8f9ff]/50 rounded-2xl border-2 border-dashed border-slate-200 max-w-md mx-auto my-auto min-h-[300px]">
                <div className="bg-[#006b2c]/10 p-4 rounded-2xl text-[#006b2c] mb-4 animate-pulse">
                  <ListChecks className="w-10 h-10 md:w-12 md:h-12" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Generate Your Test Suite</h3>
                <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">
                  To begin sandboxed verification, you must first generate the test cases based on your modernization blueprint.
                </p>
                
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="mt-6 flex items-center justify-center gap-2 bg-[#00873a] hover:bg-[#006b2c] text-white px-6 py-3 rounded-xl shadow-lg shadow-green-900/10 hover:shadow-xl hover:shadow-green-900/20 transition-all font-black text-xs uppercase tracking-wider animate-bounce"
                >
                  {isGenerating ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Generating Suite...</>
                  ) : (
                    <>Generate Test Suite</>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeEnvTab === 'live' && !s4Url && (
                  <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-650 shrink-0" />
                    <span>Please configure the S/4HANA connection (URL & credentials) to execute live tests.</span>
                  </div>
                )}

                {activeEnvTab === 'live' && s4Url && connectionStatus !== 'connected' && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Tip: Please run a successful connection test above to avoid connectivity issues.</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-[#0b1c30]/50 uppercase tracking-widest">{selectedTestCases.length} of {testCases.length} selected</span>
                    <div className="relative group/tooltip">
                      <button 
                        onClick={exportTestCasesToExcel}
                        className={clsx(
                          "flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all",
                          (profile?.tier as string) === 'basic' ? "text-gray-400 cursor-not-allowed" : "text-[#006b2c] hover:text-[#00873a]"
                        )}
                      >
                        <Download size={14} /> Export Excel {(profile?.tier as string) === 'basic' && <Lock size={12} className="ml-0.5" />}
                      </button>
                      {(profile?.tier as string) === 'basic' && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 pointer-events-none">
                          Upgrade to <span className="text-green-400 font-black">Starter</span> or higher to export professional test protocols in Excel format.
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={handleRun} 
                    disabled={isRunning || selectedTestCases.length === 0 || (activeEnvTab === 'live' && !s4Url)}
                    className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 text-xs md:text-sm font-bold w-full sm:w-auto"
                  >
                    {isRunning ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running...</> : <><Play className="w-4 h-4" /> Run Selected</>}
                  </button>
                </div>
                {testCases.map((tc, i) => (
                  <div 
                    key={i} 
                    className={clsx(
                      "flex items-start gap-3 p-3 md:p-4 rounded-xl border transition-colors cursor-pointer",
                      selectedTestCases.includes(i) ? "border-[#006b2c] bg-[#eff4ff]" : "border-[#eff4ff] hover:border-[#006b2c]/50 hover:bg-[#eff4ff]/30"
                    )}
                    onClick={() => toggleTestCase(i)}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedTestCases.includes(i)} 
                      onChange={() => {}}
                      className="mt-1 w-4 h-4 text-[#006b2c] rounded border-[#eff4ff] focus:ring-[#006b2c]"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-[#006b2c] font-black uppercase">{renderSafeValue(tc.id)}</span>
                        {tc.category && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                            {renderSafeValue(tc.category)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-[#0b1c30] font-medium truncate sm:whitespace-normal">{renderSafeValue(tc.description)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="bg-[#0b1c30] rounded-[2rem] shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[600px]">
          <div className="bg-[#0b1c30]/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              </div>
              <div className="flex items-center gap-2 text-[#ffffff]/60 ml-1 md:ml-2 min-w-0">
                <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-mono truncate">
                  {isAbapCloud ? 'adt-test-cockpit ~ execute aunit' : 'sandbox-runtime ~ node app.js'}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setShowTestCode(!showTestCode)}
              className="text-[10px] font-black text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-widest text-center"
            >
              {isAbapCloud
                ? (showTestCode ? 'View ADT Output' : 'View ABAP Unit Class')
                : (showTestCode ? 'View Output' : 'View Module Code')
              }
            </button>
          </div>
          <div className="p-4 md:p-6 font-mono text-[11px] md:text-sm bg-[#0b1c30] text-[#00ff41] flex-grow overflow-auto custom-scrollbar">
            {showTestCode ? (
              <pre className="whitespace-pre-wrap leading-relaxed text-blue-300">
                {project?.testSuite?.code || (isAbapCloud ? 'No test suite generated yet. Generate a suite to inspect local ABAP stubs.' : 'No test code generated yet.')}
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap leading-relaxed">{sandboxOutput || '// Waiting for execution...'}</pre>
            )}
          </div>
        </div>
      </div>

      {testResults && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          {project?.manualTestingRequirements && project.manualTestingRequirements.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-base md:text-lg font-black text-amber-900 mb-4 flex items-center gap-2 uppercase tracking-tight">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Human-in-the-Loop Verification
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {project.manualTestingRequirements.map((req: any, i: number) => (
                  <div key={i} className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <h4 className="font-black text-amber-900 text-xs md:text-sm mb-1 uppercase tracking-tight">{req.area}</h4>
                    <p className="text-[11px] md:text-xs text-amber-700 mb-3 leading-relaxed">{req.reason}</p>
                    <div className="text-[10px] md:text-xs text-amber-800 font-mono bg-amber-50 p-2.5 rounded-lg border border-amber-100">
                      <strong className="text-amber-900">VERIFY:</strong> {req.verificationSteps}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-purple-100 shadow-sm flex flex-col md:flex-row gap-6">
            <div className="bg-purple-100 p-4 rounded-2xl shrink-0 w-fit">
              <BarChart3 className="w-8 h-8 md:w-10 md:h-10 text-purple-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-purple-900 text-base md:text-lg mb-1 uppercase tracking-tight">AI-Estimated Coverage</h3>
              <p className="text-purple-700 text-3xl md:text-4xl font-black mb-4">
                {project?.coverageEstimate?.percentage ? `${project.coverageEstimate.percentage}%` : 'N/A'}
              </p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-black text-purple-900/60 uppercase tracking-widest mb-1.5">Logic Analysis</h4>
                  <p className="text-xs md:text-sm text-purple-700 leading-relaxed">{project?.coverageEstimate?.explanation || 'No explanation available.'}</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-purple-900/60 uppercase tracking-widest mb-1.5">Gaps Identified</h4>
                  <p className="text-xs md:text-sm text-purple-700 italic font-medium">{project?.coverageEstimate?.missingCoverage || 'No missing coverage information.'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {aiExplanation && (
        <div className="mb-8 bg-red-50 border border-red-100 rounded-[2rem] p-6 flex flex-col sm:flex-row gap-4 items-start animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-red-100 p-3 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base md:text-lg font-black text-red-900 mb-2 uppercase tracking-tight">AI Test Analysis</h3>
            <div className="text-red-800 font-medium leading-relaxed prose prose-sm prose-red max-w-none">
              <ReactMarkdown>{aiExplanation}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {testResults && stats && (
        <div id="qa-report-dashboard" className="animate-in fade-in slide-in-from-bottom-8 duration-700 mt-16">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 px-2">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-[#0b1c30] tracking-tighter uppercase">QA Dashboard</h2>
              <p className="text-[#0b1c30]/50 font-black text-xs md:text-sm uppercase tracking-widest">Automation report for {project?.name}</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#006b2c]"></div>
                <span className="text-[10px] font-black text-gray-500 uppercase">{stats.passed} Passed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-600"></div>
                <span className="text-[10px] font-black text-gray-500 uppercase">{stats.failed} Failed</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 mb-8">
            {/* Pass Rate Card */}
            <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              {mounted && <TestingPieChart pieData={pieData} stats={stats} />}
              <div className="mt-6 flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-2xl font-black text-[#006b2c] tracking-tighter">{stats.passed}</p>
                  <p className="text-[9px] font-black text-gray-400 border-t border-gray-50 pt-1 uppercase tracking-widest">Passed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-600 tracking-tighter">{stats.failed}</p>
                  <p className="text-[9px] font-black text-gray-400 border-t border-gray-50 pt-1 uppercase tracking-widest">Failed</p>
                </div>
              </div>
            </div>

            {/* Category Performance */}
            <div className="lg:col-span-8 bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
              <h3 className="text-lg font-black text-[#0b1c30] mb-8 flex items-center gap-2 uppercase tracking-tight">
                <BarChart3 className="w-5 h-5 text-[#006b2c]" />
                Capability Coverage
              </h3>
              <div className="h-[250px] md:h-[300px]">
                {mounted && <TestingBarChart stats={stats} />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {testResults.map((res: any, i: number) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedResult(res)} 
                className={clsx(
                  "group p-6 rounded-[2rem] border cursor-pointer transition-all hover:shadow-xl active:scale-[0.98]", 
                  res.status === 'Passed' 
                    ? 'bg-white border-gray-100 hover:border-green-200' 
                    : 'bg-red-50 border-red-100 hover:border-red-200'
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={clsx(
                    "p-2 rounded-xl",
                    res.status === 'Passed' ? 'bg-green-50 text-green-600' : 'bg-white text-red-600'
                  )}>
                    {res.status === 'Passed' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                  </div>
                  <span className="font-mono text-[9px] font-black text-gray-400 uppercase tracking-widest">{renderSafeValue(res.id)}</span>
                </div>
                <h4 className="font-black text-[#0b1c30] mb-2 line-clamp-2 text-sm leading-tight group-hover:text-[#006b2c] transition-colors">{renderSafeValue(res.name)}</h4>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-black uppercase tracking-tight">
                    {renderSafeValue(res.category)}
                  </span>
                  <span className={clsx(
                    "text-[9px] font-black uppercase tracking-[0.2em] ml-auto",
                    res.status === 'Passed' ? 'text-green-600' : 'text-red-600'
                  )}>
                    {renderSafeValue(res.status)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {selectedResult && (
        <div className="fixed inset-0 bg-[#0b1c30]/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setSelectedResult(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-8 gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-black text-[#006b2c] uppercase tracking-widest">{renderSafeValue(selectedResult.id)}</span>
                  <span className="text-[10px] px-3 py-1 rounded-full bg-[#eff4ff] text-[#00873a] font-black uppercase tracking-[0.1em]">
                    {renderSafeValue(selectedResult.category)}
                  </span>
                </div>
                <h3 className="text-2xl md:text-4xl font-black text-[#0b1c30] leading-tight tracking-tighter uppercase">{renderSafeValue(selectedResult.name)}</h3>
              </div>
              <div className={clsx(
                "px-6 py-2 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-lg self-start sm:self-auto",
                selectedResult.status === 'Passed' ? 'bg-green-600 text-white shadow-green-900/20' : 'bg-red-600 text-white shadow-red-900/20'
              )}>
                {renderSafeValue(selectedResult.status)}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 flex-grow overflow-y-auto px-1 custom-scrollbar pb-6">
              <div className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Goal</h4>
                  <p className="text-gray-700 leading-relaxed font-bold text-base md:text-lg">{renderSafeValue(selectedResult.description)}</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Preconditions</h4>
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 shadow-inner">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap font-medium">{renderSafeValue(selectedResult.preconditions)}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Requirement Metadata</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                      <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Priority</span>
                      <span className="text-xs font-bold text-gray-900">{renderSafeValue(selectedResult.priority) || 'Medium'}</span>
                    </div>
                    <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                      <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Test Data</span>
                      <span className="text-xs font-bold text-gray-900 truncate block">{renderSafeValue(selectedResult.testData) || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Execution Sequence</h4>
                  <div className="space-y-3">
                    {Array.isArray(selectedResult.steps) ? selectedResult.steps.map((step: any, idx: number) => (
                      <div key={idx} className="flex gap-4 p-3 bg-gray-50/50 rounded-xl border border-gray-100 group/item">
                        <span className="font-black text-[#006b2c] text-sm">{idx + 1}.</span>
                        <span className="text-xs md:text-sm text-gray-700 font-medium leading-relaxed">{renderSafeValue(step)}</span>
                      </div>
                    )) : <p className="text-sm text-gray-600 font-medium">{renderSafeValue(selectedResult.steps)}</p>}
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Validation Logic</h4>
                  <div className={clsx(
                    "p-6 rounded-2xl border font-mono text-[11px] md:text-xs shadow-lg",
                    selectedResult.status === 'Passed' ? 'bg-green-50 border-green-200 text-green-900 shadow-green-900/5' : 'bg-red-50 border-red-200 text-red-900 shadow-red-900/5'
                  )}>
                    <div className="mb-4">
                      <span className="font-black opacity-60 uppercase text-[9px] block mb-1">Execution Message</span>
                      <p className="font-bold">{renderSafeValue(selectedResult.message)}</p>
                    </div>
                    {selectedResult.expectedResult && (
                      <div>
                        <span className="font-black opacity-60 uppercase text-[9px] block mb-1">Expected Invariant</span>
                        <p className="font-bold">{renderSafeValue(selectedResult.expectedResult)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setSelectedResult(null)} 
              className="mt-8 md:mt-12 w-full bg-[#0b1c30] text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-green-600 transition-all shadow-xl hover:shadow-green-600/20 shrink-0"
            >
              CLOSE REPORT
            </button>
          </motion.div>
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
              <h2 className="text-3xl md:text-4xl font-black text-gray-950 tracking-tighter mb-4 uppercase">Unlock Enterprise Protocols</h2>
              <p className="text-gray-600 font-medium mb-10 leading-relaxed">
                Professional **Excel & PDF exports** are exclusively available for our premium tiers. Upgrade now to generate management-ready documentation for your organization.
              </p>
              
              <div className="w-full bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-10 text-left">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Starter Benefits</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Pro Excel Test suite Export
                  </li>
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> BPMN 2.0 Process Downloads
                  </li>
                  <li className="flex items-center gap-3 text-sm font-bold text-gray-900">
                    <CheckCircle2 size={16} className="text-green-600" /> Executive ZIP Bundle delivery
                  </li>
                </ul>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <button 
                  onClick={() => router.push('/settings')}
                  className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-green-600/30 transition-all uppercase tracking-widest text-sm"
                >
                  Upgrade Now
                </button>
                <button 
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all uppercase tracking-widest text-sm"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <NavigationButtons 
        backPath={`/project/${projectId}/transformation`}
        backLabel="Back to Transformation"
        proceedPath={`/project/${projectId}/documentation`}
        proceedLabel="Proceed to Documentation"
      />
    </div>
  );
}

const Lock = ({ size, className }: { size: number, className: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="3" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
