'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { useTestGeneration } from '@/hooks/useTestGeneration';
import { useTestExecution } from '@/hooks/useTestExecution';
import Stepper from '@/components/Stepper';
import type { Project } from '@/lib/types';
import { Play, Terminal as TerminalIcon, RefreshCw, ListChecks, Download, Activity, ShieldCheck, AlertTriangle, BarChart3, X, Rocket, CheckCircle2 } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import NavigationButtons from '@/components/NavigationButtons';
import { motion } from 'motion/react';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });
const TestingPieChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingPieChart), { ssr: false });
const TestingBarChart = nextDynamic(() => import('@/components/TestingCharts').then(mod => mod.TestingBarChart), { ssr: false });

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
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTestCases, setSelectedTestCases] = useState<number[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { isGenerating, testCases, generateTestCases } = useTestGeneration(projectId as string, project, setProject);
  const { isRunning, testResults, sandboxOutput, aiExplanation, runTestCases } = useTestExecution(projectId as string, project, setProject);
  const [showTestCode, setShowTestCode] = useState(false);

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
      <Stepper currentStep={5} projectId={projectId as string} />
      
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
              <TestingPieChart pieData={pieData} stats={stats} />
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
                <TestingBarChart stats={stats} />
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
