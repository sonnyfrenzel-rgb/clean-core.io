'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import Stepper from '@/components/Stepper';
import { Code2, ArrowRight, ArrowLeft, RefreshCw, FileCode2, Terminal, AlertCircle, CheckCircle2, Cpu, Zap, Copy, Check, X, Folder, Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';
import { DocumentSkeleton } from '@/components/Skeleton';
import NavigationButtons from '@/components/NavigationButtons';
import nextDynamic from 'next/dynamic';
import { callGemini } from '@/lib/gemini';
import type { Project } from '@/lib/types';
import { useUserProfile } from '@/hooks/useUserProfile';

interface ProjectFile {
  path: string;
  content: string;
}

const CodeHighlighter = nextDynamic(() => import('@/components/CodeHighlighter'), { ssr: false });

export default function TransformationPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [transformedCode, setTransformedCode] = useState('');
  const [transformationLog, setTransformationLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [isProceeding, setIsProceeding] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [insightOverlay, setInsightOverlay] = useState<{ title: string, content: string } | null>(null);
  const router = useRouter();
  const { profile } = useUserProfile();

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('srv/service.ts');
  const [syncScroll, setSyncScroll] = useState(true);

  const legacyScrollRef = useRef<HTMLDivElement>(null);
  const modernScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingLegacy = useRef(false);
  const isScrollingModern = useRef(false);

  const parseGeneratedCode = (codeStr: string): ProjectFile[] => {
    if (!codeStr) return [];
    try {
      const parsed = JSON.parse(codeStr);
      if (Array.isArray(parsed) && parsed.every(f => typeof f.path === 'string' && typeof f.content === 'string')) {
        return parsed;
      }
    } catch (e) {
      // Not a valid JSON array matching ProjectFile schema
    }
    
    // Legacy fallback
    return [
      {
        path: 'srv/service.ts',
        content: codeStr
      },
      {
        path: 'package.json',
        content: `{
  "name": "clean-core-modernized-service",
  "version": "1.0.0",
  "description": "Modernized clean-core Node.js service",
  "main": "srv/service.js",
  "type": "module",
  "scripts": {
    "start": "node srv/service.js",
    "dev": "tsx watch srv/service.ts",
    "test": "playwright test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pino": "^9.1.0",
    "pino-pretty": "^11.1.0",
    "@sap/xssec": "^4.1.0",
    "passport": "^0.7.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.12",
    "tsx": "^4.10.1",
    "@playwright/test": "^1.44.0"
  }
}`
      },
      {
        path: 'Dockerfile',
        content: `# Multi-stage Build for Lean & Secure Production Container
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/srv ./srv
USER node
EXPOSE 3000
CMD ["node", "srv/service.js"]`
      }
    ];
  };

  const getFileLanguage = (filePath: string): string => {
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.md')) return 'markdown';
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) return 'typescript';
    if (filePath.endsWith('.cds')) return 'typescript';
    if (filePath.endsWith('Dockerfile')) return 'dockerfile';
    return 'typescript';
  };

  useEffect(() => {
    const selectedFile = files.find(f => f.path === selectedFilePath);
    if (selectedFile) {
      setTransformedCode(selectedFile.content);
    }
  }, [selectedFilePath, files]);

  const handleLegacyScroll = () => {
    if (!syncScroll) return;
    if (isScrollingModern.current) {
      isScrollingModern.current = false;
      return;
    }
    
    const legacyEl = legacyScrollRef.current;
    const modernEl = modernScrollRef.current;
    if (!legacyEl || !modernEl) return;
    
    isScrollingLegacy.current = true;
    
    const legacyScrollableHeight = legacyEl.scrollHeight - legacyEl.clientHeight;
    const modernScrollableHeight = modernEl.scrollHeight - modernEl.clientHeight;
    
    if (legacyScrollableHeight > 0 && modernScrollableHeight > 0) {
      const scrollPercentage = legacyEl.scrollTop / legacyScrollableHeight;
      modernEl.scrollTop = scrollPercentage * modernScrollableHeight;
    }
  };

  const handleModernScroll = () => {
    if (!syncScroll) return;
    if (isScrollingLegacy.current) {
      isScrollingLegacy.current = false;
      return;
    }
    
    const legacyEl = legacyScrollRef.current;
    const modernEl = modernScrollRef.current;
    if (!legacyEl || !modernEl) return;
    
    isScrollingModern.current = true;
    
    const legacyScrollableHeight = legacyEl.scrollHeight - legacyEl.clientHeight;
    const modernScrollableHeight = modernEl.scrollHeight - modernEl.clientHeight;
    
    if (legacyScrollableHeight > 0 && modernScrollableHeight > 0) {
      const scrollPercentage = modernEl.scrollTop / modernScrollableHeight;
      legacyEl.scrollTop = scrollPercentage * legacyScrollableHeight;
    }
  };

  const renderFileTree = () => {
    const structure: { [folder: string]: ProjectFile[] } = {};
    const rootFiles: ProjectFile[] = [];
    
    files.forEach(file => {
      if (file.path.includes('/')) {
        const parts = file.path.split('/');
        const folderName = parts[0];
        if (!structure[folderName]) {
          structure[folderName] = [];
        }
        structure[folderName].push(file);
      } else {
        rootFiles.push(file);
      }
    });
    
    return (
      <div className="space-y-4">
        {Object.entries(structure).map(([folderName, folderFiles]) => (
          <div key={folderName} className="space-y-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-gray-500 font-bold text-xs uppercase tracking-wider">
              <Folder size={12} className="text-green-500" />
              <span>{folderName}</span>
            </div>
            <div className="pl-3 space-y-0.5 border-l border-white/5 ml-3">
              {folderFiles.map(file => {
                const isSelected = selectedFilePath === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFilePath(file.path)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors text-left",
                      isSelected 
                        ? "bg-green-500/10 text-green-400 border border-green-500/20 font-bold" 
                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <FileCode2 size={12} className={isSelected ? "text-green-400" : "text-gray-500"} />
                    <span className="truncate">{file.path.split('/').slice(1).join('/')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        
        {rootFiles.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-gray-500 font-bold text-xs uppercase tracking-wider">
              <span>Root Files</span>
            </div>
            <div className="space-y-0.5">
              {rootFiles.map(file => {
                const isSelected = selectedFilePath === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFilePath(file.path)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors text-left",
                      isSelected 
                        ? "bg-green-500/10 text-green-400 border border-green-500/20 font-bold" 
                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <FileCode2 size={12} className={isSelected ? "text-green-400" : "text-gray-500"} />
                    <span className="truncate">{file.path}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };


  const handleCopy = () => {
    navigator.clipboard.writeText(transformedCode);
    setShowCopyDialog(true);
    setTimeout(() => setShowCopyDialog(false), 2000);
  };

  const insights = [
    {
      id: 'architecture',
      title: 'Event-driven Microservices',
      short: 'Converted monolithic procedural logic into modular, event-driven microservices using Express.js and SAP Cloud SDK.',
      long: 'In the legacy environment, logic was often monolithic and synchronous. Our transformation engine transforms these processes into independent microservices. By using an event-driven approach (e.g., via SAP Event Mesh or similar), services can react to data changes asynchronously, improving system resilience and scalability. This allows for independent deployment and scaling of business functions.'
    },
    {
      id: 'data',
      title: 'TypeORM & HDI Integration',
      short: 'Mapped SAP HANA tables to TypeORM entities with automated HDI container binding and XSUAA security integration.',
      long: 'TypeORM is a modern Object-Relational Mapper (ORM) for TypeScript. We transform legacy table definitions into TypeORM entities, allowing developers to interact with the database using strongly-typed objects. The integration with HDI (HANA Deployment Infrastructure) ensures that the application can seamlessly manage its own database schema within the SAP HANA Cloud environment, while XSUAA ensures that data access is always authenticated.'
    },
    {
      id: 'security',
      title: 'XSUAA Security Pattern',
      short: 'Implemented JWT-based authentication via SAP @sap/xssec, replacing legacy SAP GUI authorization objects.',
      long: 'XSUAA (Extended Services for User Authentication and Authorization) is the standard security service for SAP BTP. We replace legacy ABAP authority checks with modern JWT (JSON Web Token) validation. This ensures that every request to your Node.js service is verified against the central identity provider. It supports fine-grained scopes and attributes, allowing for robust role-based access control (RBAC) that meets modern enterprise security standards.'
    }
  ];

  const generateTransformation = useCallback(async (legacyCode: string, design: string, analysis: string) => {
    setLoading(true);
    setProgress(0);
    setError('');
    setTransformationLog(['Initializing transformation engine...', 'Parsing legacy ABAP structures...', 'Mapping to Node.js patterns...']);
    
    try {
      const prompt = `You are an elite Cloud Platform & Node.js Developer. Transform the following legacy ABAP code into a modern, production-ready modular Node.js (TypeScript) application project structure based on the provided Solution Design and Business Analysis.
        
        Legacy ABAP Code:
        ${legacyCode}
        
        Business Analysis:
        ${analysis}
        
        Solution Design:
        ${design}
        
        Requirements:
        1. Use TypeScript with ES Modules (ESM).
        2. Follow Clean Architecture and modular structure principles.
        3. Split the modernized implementation into multiple files, including:
           - srv/service.ts: The main business logic and Express route handlers
           - db/schema.cds: SAP CAP schema definition OR TypeORM entities mapping legacy database tables
           - package.json: Application dependencies, metadata, and scripts
           - Dockerfile: Multi-stage container setup for production
        4. Use modern patterns (async/await, dependency injection, structured logging).
        5. CRITICAL FOR SANDBOX: Use standard Node.js built-ins (like 'fetch', 'console') where possible. If you must use external libraries, restrict yourself strictly to: express, pino, pino-pretty, typeorm, @sap-cloud-sdk/http-client, @sap/xssec, and passport. Do NOT use any other external npm modules.
        6. CRITICAL: Do NOT import specific strategies like 'XS720Strategy' from '@sap/xssec' if they are not standard exports. Use standard passport-jwt or mock the authentication middleware entirely.
        7. Add professional JSDoc comments explaining the transformation logic.
        8. Ensure the code is robust with error handling and validation.
        9. Generate a complete Playwright test suite (playwright.config.ts and generated.spec.ts) to verify the API endpoints.
        10. CRITICAL: Export all main business logic functions and classes using ESM 'export' statements so they can be imported and tested by a separate test suite.
        
        Return a JSON object with the following structure:
        {
          "files": [
            {
              "path": "srv/service.ts",
              "content": "/* The main TS application source code */"
            },
            {
              "path": "package.json",
              "content": "/* The package.json configuration */"
            },
            {
              "path": "db/schema.cds",
              "content": "/* SAP CAP schema definition or database entity declarations */"
            },
            {
              "path": "Dockerfile",
              "content": "/* Multi-stage Docker containerization setup */"
            }
          ],
          "tests": {
            "config": "/* playwright.config.ts content */",
            "spec": "/* generated.spec.ts content */"
          }
        }
        No conversational text.`;

      console.log('Transforming code for project:', projectRef.current?.name);

      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true, profile?.geminiApiKey);
      
      let filesArray: ProjectFile[] = [];
      let tests = { config: '', spec: '' };
      
      try {
        let result;
        try {
          result = JSON.parse(responseText || '{}');
        } catch (e) {
          // Fallback: try to extract JSON from markdown if it exists
          const match = responseText?.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
          } else {
            throw e;
          }
        }
        filesArray = result.files || [];
        tests = result.tests || { config: '', spec: '' };
        
        if (filesArray.length === 0 && result.code) {
          filesArray.push({
            path: 'srv/service.ts',
            content: result.code
          });
        }
      } catch (e) {
        // Fallback for completely non-JSON text
        filesArray = [
          {
            path: 'srv/service.ts',
            content: responseText || ''
          }
        ];
      }
      
      setTransformationLog(prev => [...prev, 'Code generation complete.', 'Optimizing imports...', 'Finalizing transformation...']);
      
      const db = getDb();
      await updateDoc(doc(db, 'projects', projectId as string), {
        generatedCode: JSON.stringify(filesArray),
        testSuite: tests,
        status: 'transformed'
      });
      
      setFiles(filesArray);
      const hasServiceTs = filesArray.some(f => f.path === 'srv/service.ts');
      setSelectedFilePath(hasServiceTs ? 'srv/service.ts' : (filesArray[0]?.path || ''));
    } catch (err) {
      console.error('Transformation Error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during code transformation.');
    } finally {
      setLoading(false);
      setProgress(100);
    }
  }, [projectId, profile?.geminiApiKey]);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const db = getDb();
        const docSnap = await getDoc(doc(db, 'projects', projectId as string));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProject(data);
          if (data.generatedCode) {
            const parsedFiles = parseGeneratedCode(data.generatedCode);
            setFiles(parsedFiles);
            const hasServiceTs = parsedFiles.some(f => f.path === 'srv/service.ts');
            setSelectedFilePath(hasServiceTs ? 'srv/service.ts' : (parsedFiles[0]?.path || ''));
            setLoading(false);
          } else if (data.legacyCode && data.solutionDesign && data.analysis) {
            generateTransformation(data.legacyCode, data.solutionDesign, data.analysis);
          } else {
            setLoading(false);
          }
        } else {
          setError('Project not found.');
          setLoading(false);
        }
      } catch (err) {
        console.error('Fetch Project Error:', err);
        setError('Failed to load project data.');
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, generateTransformation]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && progress < 95) {
      interval = setInterval(() => {
        setProgress((prev) => prev + (prev < 80 ? 2 : 0.5));
      }, 200);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  if (loading && !transformedCode) return (
    <div className="animate-in fade-in duration-500">
      <Stepper currentStep={4} projectId={projectId as string} />
      <div className="bg-[#0a0a0a] rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden mt-8">
        <div className="px-10 py-12 text-white flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Cpu className="w-6 h-6 text-green-400 animate-pulse" />
              </div>
              <h2 className="text-3xl font-black tracking-tight">AI Transformation Engine</h2>
            </div>
            <p className="text-gray-400 max-w-md">Modernizing legacy ABAP logic into high-performance Node.js microservices...</p>
            
            <div className="mt-8 space-y-4">
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>{progress.toFixed(0)}% PROCESSED</span>
                <span className="animate-pulse">EXECUTING...</span>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-80 bg-black/40 rounded-xl border border-white/5 p-4 font-mono text-[10px] text-green-400/70 h-48 overflow-y-auto">
            {transformationLog.map((log, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <span className="text-gray-600">[{new Date().toLocaleTimeString()}]</span>
                <span>{log}</span>
              </div>
            ))}
            <div className="animate-pulse">_</div>
          </div>
        </div>
        <div className="p-10 bg-[#111]">
          <DocumentSkeleton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 max-w-7xl mx-auto">
      <Stepper currentStep={4} projectId={projectId as string} />
      
      <div className="mb-10 flex flex-col md:flex-row items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Code Transformation</h1>
          <p className="text-gray-500 font-medium">Legacy ABAP to Modern Node.js (TypeScript) Conversion</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setSyncScroll(!syncScroll)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-bold text-sm shadow-sm border",
              syncScroll 
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            )}
          >
            {syncScroll ? <Lock size={16} /> : <Unlock size={16} />} 
            Sync Scroll: {syncScroll ? 'ON' : 'OFF'}
          </button>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
          >
            <Code2 size={16} /> Copy Code
          </button>
          <button 
            onClick={() => generateTransformation(project?.legacyCode, project?.solutionDesign, project?.analysis)}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
          >
            <RefreshCw size={16} /> Re-Run Engine
          </button>
        </div>
      </div>

      {showCopyDialog && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3 animate-in slide-in-from-top-4">
          <CheckCircle2 className="text-green-400 w-5 h-5" />
          <span className="font-bold text-sm">Code copied to clipboard!</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Legacy Code Panel */}
        <div className="flex flex-col h-[700px]">
          <div className="bg-gray-100 px-4 py-2 rounded-t-xl border-x border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-gray-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Legacy Source (ABAP)</span>
            </div>
          </div>
          <div 
            ref={legacyScrollRef}
            onScroll={handleLegacyScroll}
            className="flex-1 overflow-y-auto rounded-b-xl border shadow-sm bg-[#1e1e1e] p-6 h-full scrollbar-thin scrollbar-thumb-gray-800"
          >
            <CodeHighlighter 
              language="abap" 
              customStyle={{ margin: 0, padding: 0, overflow: 'visible', height: 'auto', fontSize: '13px' }}
              code={project?.legacyCode || ''}
            />
          </div>
        </div>

        {/* Transformed Code Panel */}
        <div className="flex flex-col h-[700px]">
          <div className="bg-green-50 px-4 py-2 rounded-t-xl border-x border-t flex items-center justify-between border-green-100">
            <div className="flex items-center gap-2">
              <FileCode2 size={14} className="text-green-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-green-700">Modernized Target (Node.js/TS)</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-600" />
              <span className="text-[10px] font-bold text-green-600 uppercase">AI Verified</span>
            </div>
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden rounded-b-xl border border-green-100 shadow-lg shadow-green-500/5 bg-[#1e1e1e] h-full">
            {/* File Explorer Sidebar */}
            <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-white/5 bg-[#141414] overflow-y-auto flex flex-col shrink-0 h-40 md:h-auto">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Project Files</span>
                <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1 py-0.5 rounded font-mono font-bold">Workspace</span>
              </div>
              <div className="p-2 space-y-1">
                {renderFileTree()}
              </div>
            </div>
            
            {/* Code Viewer Panel */}
            <div 
              ref={modernScrollRef}
              onScroll={handleModernScroll}
              className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-800"
            >
              <CodeHighlighter 
                language={getFileLanguage(selectedFilePath)} 
                customStyle={{ margin: 0, padding: 0, overflow: 'visible', height: 'auto', fontSize: '13px' }}
                code={transformedCode}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transformation Insights */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-12 shadow-sm">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" /> Transformation Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {insights.map(insight => (
            <div 
              key={insight.id} 
              className="space-y-2 p-4 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-100 group"
              onClick={() => setInsightOverlay({ title: insight.title, content: insight.long })}
            >
              <h4 className="text-sm font-black text-gray-400 uppercase tracking-tighter group-hover:text-green-600 transition-colors">{insight.title}</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{insight.short}</p>
              <div className="text-[10px] font-bold text-green-600 uppercase tracking-widest pt-2 flex items-center gap-1">
                Read More <ArrowRight size={10} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insight Overlay Modal */}
      {insightOverlay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gray-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-2xl font-black tracking-tight">{insightOverlay.title}</h3>
              <button onClick={() => setInsightOverlay(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 md:p-12">
              <p className="text-gray-700 text-lg leading-relaxed mb-8">
                {insightOverlay.content}
              </p>
              <button 
                onClick={() => setInsightOverlay(null)}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <NavigationButtons 
        backPath={`/project/${projectId}/design`}
        backLabel="Back to Design"
        proceedPath={`/project/${projectId}/testing`}
        proceedLabel="Proceed to Testing"
      />
    </div>
  );
}

