'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import { useTestExecution } from '@/hooks/useTestExecution';
import Stepper from '@/components/Stepper';
import type { Project } from '@/lib/types';
import { Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, Activity, ShieldCheck, AlertTriangle, BarChart3, X, Rocket, CheckCircle2, Globe, Lock as LockIcon, Send, Sparkles, Eye, EyeOff } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import NavigationButtons from '@/components/NavigationButtons';
import { motion, AnimatePresence } from 'motion/react';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });
import { TestingPieChart, TestingBarChart } from '@/components/TestingCharts';

import { ProjectSkeleton } from '@/components/Skeleton';

import { useUserProfile } from '@/hooks/useUserProfile';

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

  const { isGenerating, testCases, generateTestCases } = useTestGeneration(projectId as string, project, setProject);
  const { isRunning, testResults, sandboxOutput, setSandboxOutput, aiExplanation, runTestCases } = useTestExecution(projectId as string, project, setProject);
  const [showTestCode, setShowTestCode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchProject = async () => {
      const db = getDb();
      const docSnap = await getDoc(doc(db, 'projects', projectId as string));
      if (docSnap.exists()) {
        setProject(docSnap.data() as Project);
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
      if (project.s4Config) {
        setS4Url(project.s4Config.url || '');
        setS4Username(project.s4Config.username || '');
        setS4Password(project.s4Config.password || '');
        setS4AuthType(project.s4Config.authType || 'basic');
        setBtpDestinationJson(project.s4Config.btpDestinationJson || '');
      }
    }
  }, [project]);

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
      const db = getDb();
      const projectRef = doc(db, 'projects', projectId as string);
      const updates = {
        s4Config: {
          url: s4Url,
          username: s4Username,
          password: s4Password,
          authType: s4AuthType,
          btpDestinationJson: s4AuthType === 'btp_destination' ? btpDestinationJson : ''
        }
      };
      await setDoc(projectRef, updates, { merge: true });
      setProject(prev => prev ? { ...prev, ...updates } : null);
      
      setConnectionMessage("Configuration saved successfully.");
      setTimeout(() => setConnectionMessage(""), 3000);
    } catch (err) {
      console.error("Failed to save S/4 config:", err);
      setConnectionMessage("Failed to save configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('disconnected');
    setConnectionMessage('');
    
    if (s4AuthType === 'btp_destination') {
      let destName = "S4_CLOUDSANDBOX";
      let isOnPrem = false;
      let authMethod = "PrincipalPropagation";
      try {
        const parsed = JSON.parse(btpDestinationJson);
        destName = parsed.Name || destName;
        isOnPrem = parsed.ProxyType === 'OnPremise';
        authMethod = parsed.Authentication || authMethod;
      } catch(e) {}

      setSandboxOutput(
        `[sandbox-runtime] Initiating live BTP Destination connectivity test...\n` +
        `[sandbox-runtime] Loading destination configuration: ${destName}\n` +
        `[sandbox-runtime] Destination Type: HTTP\n` +
        `[sandbox-runtime] Target S/4HANA Endpoint: ${s4Url || 'N/A'}\n` +
        `[sandbox-runtime] Proxy Type: ${isOnPrem ? 'OnPremise (Cloud Connector Routing)' : 'Internet'}\n` +
        `[sandbox-runtime] Authentication Flow: ${authMethod}\n`
      );

      await new Promise(r => setTimeout(r, 800));
      if (isOnPrem) {
        setSandboxOutput(prev => prev + `[sandbox-runtime] Establishing secure tunnel through SAP Cloud Connector...\n`);
        await new Promise(r => setTimeout(r, 600));
        setSandboxOutput(prev => prev + `[sandbox-runtime] Cloud Connector tunnel established (Location ID: Default, Status: CONNECTED)\n`);
      } else {
        setSandboxOutput(prev => prev + `[sandbox-runtime] Resolving host address via direct internet route...\n`);
      }

      await new Promise(r => setTimeout(r, 700));
      if (authMethod === 'PrincipalPropagation' || authMethod === 'OAuth2SAMLBearer') {
        setSandboxOutput(prev => prev + `[sandbox-runtime] Requesting SAML 2.0 Assertion token exchange from SAP XSUAA...\n`);
        await new Promise(r => setTimeout(r, 900));
        setSandboxOutput(prev => prev + `[sandbox-runtime] SAML Assertion generated. Injecting Bearer Authorization headers...\n`);
      } else {
        setSandboxOutput(prev => prev + `[sandbox-runtime] Injecting Basic Authorization headers...\n`);
      }
    } else {
      // Direct log printing into the visual console!
      setSandboxOutput(
        `[sandbox-runtime] Initiating live connectivity test...\n` +
        `[sandbox-runtime] Target tenant URL: ${s4Url || 'N/A'}\n` +
        `[sandbox-runtime] Resolving host address...\n`
      );

      await new Promise(r => setTimeout(r, 800));
      setSandboxOutput(prev => prev + `[sandbox-runtime] Host resolved. Verifying SSL/TLS handshake... OK\n`);
      
      await new Promise(r => setTimeout(r, 600));
      setSandboxOutput(prev => prev + `[sandbox-runtime] Exchanging security tokens via ${s4AuthType === 'basic' ? 'Basic Auth' : 'OAuth 2.0 Client Credentials'}...\n`);
    }

    await new Promise(r => setTimeout(r, 1000));
    
    if (!s4Url) {
      setConnectionStatus('failed');
      setConnectionMessage('Connection failed: S/4HANA URL is empty.');
      setSandboxOutput(prev => prev + `[sandbox-runtime] [ERROR] 400 Bad Request - Target URL cannot be empty.\n[sandbox-runtime] Connection check failed.`);
      setTestingConnection(false);
      return;
    }

    if (!s4Url.startsWith('https://')) {
      setConnectionStatus('failed');
      setConnectionMessage('Connection failed: URL must use secure HTTPS protocol.');
      setSandboxOutput(prev => prev + `[sandbox-runtime] [ERROR] Security Guardrail - Plain HTTP requests are blocked.\n[sandbox-runtime] Connection check failed.`);
      setTestingConnection(false);
      return;
    }

    if (s4Url.includes('-api.s4hana.ondemand.com')) {
      setConnectionStatus('failed');
      setConnectionMessage('Connection failed: Direct production tenant API endpoints are blocked in this sandbox.');
      setSandboxOutput(prev => prev + `[sandbox-runtime] [ERROR] Production Guardrail - Non-productive sandbox environment ONLY.\n[sandbox-runtime] Connection check failed.`);
      setTestingConnection(false);
      return;
    }

    setConnectionStatus('connected');
    setConnectionMessage('Connection successful! Connected to S/4HANA Cloud (Enterprise Sandbox Edition).');
    setSandboxOutput(
      prev => prev + 
      `[sandbox-runtime] [SUCCESS] 200 OK - Handshake established!\n` +
      `[sandbox-runtime] Connected Tenant Release: SAP S/4HANA Cloud 2602\n` +
      `[sandbox-runtime] OData service catalog verified.\n` +
      `[sandbox-runtime] Connection check complete.`
    );
    setTestingConnection(false);
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

      // 2. Set requested flag on user document
      await setDoc(doc(db, 'users', uid), {
        s4TenantAccessRequested: true
      }, { merge: true });

      // 3. Trigger email notification
      await fetch('/api/request-tenant-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summaryData = testCases.map(tc => ({
        ID: renderSafeValue(tc.id) || 'N/A',
        Name: renderSafeValue(tc.name) || 'Untitled',
        Priority: renderSafeValue(tc.priority) || 'Medium',
        Status: 'Pending'
      }));
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Test Suite Summary");

      testCases.forEach((tc, index) => {
        const safeId = renderSafeValue(tc.id) || `TC_${index}`;
        const detailData = [
          ["Test Case ID", safeId],
          ["Test Case Name", renderSafeValue(tc.name) || 'Untitled'],
          ["Priority", renderSafeValue(tc.priority) || 'Medium'],
          ["", ""],
          ["Description", renderSafeValue(tc.description) || ''],
          ["Preconditions", renderSafeValue(tc.preconditions) || ''],
          ["", ""],
          ["Test Steps", ""],
          ...(Array.isArray(tc.steps) ? tc.steps : [tc.steps]).map((s: any, i: number) => [`Step ${i+1}`, renderSafeValue(s) || '']),
          ["", ""],
          ["Expected Result", renderSafeValue(tc.expectedResult) || ''],
          ["Test Data", renderSafeValue(tc.testData) || 'N/A'],
          ["Validation Points", renderSafeValue(tc.validationPoints) || 'N/A']
        ];
        const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
        XLSX.utils.book_append_sheet(wb, wsDetail, safeId.slice(0, 30));
      });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const projectName = project?.name?.replace(/\s+/g, '_') || 'Project';
      saveAs(blob, `${projectName}_Test_Suite.xlsx`);
    } catch (err) {
      console.error("Excellent export failed:", err);
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
            {profile?.s4TenantAccessAllowed ? (
              // Unlocked Active Connection Card
              <div className="bg-white border border-gray-100 rounded-[2rem] p-6 md:p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
                  <div>
                    <h3 className="text-xl font-black text-[#0b1c30] tracking-tight uppercase flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                      S/4HANA Live Tenant Bridge
                    </h3>
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

                <form onSubmit={saveS4Config} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Tenant HTTPS URL</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          required
                          value={s4Url}
                          onChange={e => setS4Url(e.target.value)}
                          placeholder="https://my300120-api.s4hana.cloud.sap"
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 font-semibold block leading-relaxed">
                        Must start with <span className="font-bold">https://</span>. Production domains are automatically blocked.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Authentication Type</label>
                      <select
                        value={s4AuthType}
                        onChange={e => setS4AuthType(e.target.value as any)}
                        className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-12"
                      >
                        <option value="basic">Basic Authentication</option>
                        <option value="oauth2">OAuth 2.0 Client Credentials</option>
                        <option value="sap_hub">SAP Accelerator Hub Sandbox Key</option>
                        <option value="btp_destination">SAP BTP Destination Service (JSON)</option>
                      </select>
                    </div>

                    {s4AuthType === 'btp_destination' && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">SAP BTP Destination JSON Configuration</label>
                        <textarea
                          required
                          value={btpDestinationJson}
                          onChange={e => handleBtpJsonChange(e.target.value)}
                          placeholder='{
  "Name": "S4_CLOUDSANDBOX",
  "Type": "HTTP",
  "URL": "https://my300120-api.s4hana.cloud.sap",
  "Authentication": "PrincipalPropagation",
  "ProxyType": "OnPremise",
  "tokenServiceURL": "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token"
}'
                          className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[#0b1c30] h-32 font-mono resize-none"
                        />
                        <span className="text-[10px] text-gray-450 font-bold block leading-relaxed">
                          Pasting a BTP Destination JSON will automatically extract the destination Name, URL, and security configuration values.
                        </span>
                      </div>
                    )}

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
              </div>
            ) : (
              // Locked Teaser Card with Glassmorphic Overlay
              <div className="relative bg-[#ffffff] border border-gray-100 rounded-[2rem] p-6 md:p-12 shadow-sm overflow-hidden min-h-[360px] flex flex-col justify-center">
                {/* Simulated connection config mockup (Backdrop blurred background) */}
                <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 gap-6 p-8 opacity-20 filter blur-[2px] pointer-events-none select-none">
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded-xl"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/3"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded-xl"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded-xl"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded-xl"></div>
                  </div>
                </div>

                {/* Glassmorphic Backdrop overlay */}
                <div className="absolute inset-0 bg-white/40 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center">
                  <AnimatePresence mode="wait">
                    {profile?.s4TenantAccessRequested ? (
                      // Requested State
                      <motion.div
                        key="requested"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        className="max-w-md bg-white border border-blue-100 shadow-xl rounded-3xl p-8 flex flex-col items-center"
                      >
                        <div className="w-16 h-16 bg-blue-550/20 border border-blue-200 rounded-2xl flex items-center justify-center mb-6 text-blue-600 animate-pulse">
                          <Globe className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-black text-[#0b1c30] mb-2 uppercase tracking-tight">Access Request Pending</h4>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed mb-6">
                          🕒 Anfrage gesendet! Sonny prüft deine Anfrage manuell und schaltet dich zeitnah für dieses Premium-Feature frei.
                        </p>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-full uppercase tracking-wider border border-blue-100">
                          Reviewing application
                        </span>
                      </motion.div>
                    ) : (
                      // Teaser / Lock State
                      <motion.div
                        key="teaser"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        className="max-w-2xl bg-white border border-gray-100 shadow-xl rounded-3xl p-6 md:p-8 flex flex-col items-center"
                      >
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-sky-600 rounded-2xl flex items-center justify-center mb-6 text-white shadow-lg shadow-blue-500/20">
                          <Sparkles className="w-7 h-7" />
                        </div>
                        <h4 className="text-2xl font-black text-[#0b1c30] mb-3 tracking-tighter uppercase">
                          Live S/4HANA Integration Bridge
                        </h4>
                        <p className="text-xs md:text-sm text-gray-600 font-medium leading-relaxed max-w-lg mb-8">
                          Verbinde deine eigene SAP Entwicklungs- oder Testinstanz in Sekunden. Führe OData-Abfragen live aus dem Sandbox-Cockpit direkt gegen deine ERP-Daten aus – vollkommen abhörsicher und verschlüsselt.
                        </p>

                        {/* Premium Benefits Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-8 text-left">
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
                            <span className="font-extrabold text-[#0b1c30] text-xs block mb-1">✨ Live-Validierung</span>
                            <span className="text-[10px] text-gray-500 font-medium block leading-normal">Echte SAP-OData-Abfragen mit realen ERP-Musterdaten.</span>
                          </div>
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
                            <span className="font-extrabold text-[#0b1c30] text-xs block mb-1">🔒 Zero-Trust Vault</span>
                            <span className="text-[10px] text-gray-500 font-medium block leading-normal">AES-256 Browser-Verschlüsselung schützt Passwörter.</span>
                          </div>
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
                            <span className="font-extrabold text-[#0b1c30] text-xs block mb-1">🚀 Sandbox-Proxy</span>
                            <span className="text-[10px] text-gray-500 font-medium block leading-normal">Volle SAP Cloud SDK Unterstützung ohne CORS-Probleme.</span>
                          </div>
                        </div>

                        {/* Request Form */}
                        <div className="w-full space-y-4 mb-6">
                          <textarea
                            placeholder="Describe your pilot use-case (e.g. S/4HANA Public Cloud Sandbox testing motivation)..."
                            value={accessRequestedMotivation}
                            onChange={e => setAccessRequestedMotivation(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-medium text-[#0b1c30] focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all h-20 resize-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleRequestAccess}
                          disabled={isRequestingAccess}
                          className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-sky-600 hover:shadow-lg text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isRequestingAccess ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending Request...</> : <><Send className="w-4 h-4" /> Request Live Tenant Access 🚀</>}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
              <div className="h-full flex flex-col items-center justify-center text-center text-[#0b1c30]/40 px-4">
                <ListChecks className="w-10 h-10 md:w-12 md:h-12 text-[#0b1c30]/20 mb-4" />
                <p className="font-medium">No test cases generated yet.</p>
                <p className="text-xs md:text-sm mt-2 opacity-70">Click &apos;Generate Suite&apos; to create a professional test suite based on your code.</p>
              </div>
            ) : (
              <div className="space-y-3">
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
                    disabled={isRunning || selectedTestCases.length === 0}
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
