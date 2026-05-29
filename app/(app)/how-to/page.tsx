'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, Layers, Cpu, CheckCircle2, 
  Download, Award, ShieldAlert, ArrowRight, HelpCircle,
  FileText, ChevronRight, ChevronLeft, Play,
  Volume2, Maximize2, Minimize2, Sparkles, Check, FileCode2, Terminal,
  Database, RefreshCw, Info, Lock, X, ArrowLeft
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';

const steps = [
  {
    time: "00:00 - 00:25",
    title: "Introduction & Landing Page",
    desc: "Overview of the clean-core philosophy. Legacy modifications block upgrades; Clean-Core.io automates side-by-side transformation on SAP BTP.",
    narration: "Enterprise core modifications are the single greatest barrier to S/4HANA upgrades. Welcome to Clean-Core.io—the automated SaaS engine designed to transform legacy ABAP logic into modern, side-by-side cloud services on SAP BTP. Our platform enables enterprise architects to keep the SAP core clean while accelerating cloud transformation.",
    icon: HelpCircle,
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600 border-blue-200/50",
    hotspots: [
      { x: 20, y: 15, question: "Why keep the core clean?", answer: "Modifying the core blocks S/4HANA upgrades, creating massive technical debt. Keeping it clean ensures immediate upgradeability." },
      { x: 80, y: 15, question: "What is the BTP strategy?", answer: "Transforming custom requirements into side-by-side cloud-native services running on SAP Business Technology Platform (BTP)." },
      { x: 50, y: 80, question: "How does Clean-Core.io help?", answer: "It automatically extracts, analyzes, maps, and refactors your legacy ABAP packages into clean SAP BTP cloud applications." }
    ]
  },
  {
    time: "00:25 - 00:55",
    title: "Phase 1: Technical Analytics",
    desc: "Uploading custom legacy ABAP source files. Static analysis parses custom code, maps external database tables, and calculates a Clean Core score.",
    narration: "We start by uploading legacy ABAP source files directly into the Technical Analytics workspace. The static analysis engine parses the legacy custom code, maps external database dependencies, and highlights hard-coded workarounds. We get a clear compliance baseline showing which parts of the legacy package violate the clean-core philosophy.",
    icon: Layers,
    color: "from-purple-500/10 to-pink-500/10 text-purple-655 border-purple-200/50",
    hotspots: [
      { x: 25, y: 30, question: "Which files can be uploaded?", answer: "You can upload ABAP files directly (e.g. .clas, .prog, or custom SAP transport files) containing your legacy custom code." },
      { x: 75, y: 35, question: "What are DB dependencies?", answer: "The parser detects external database tables, standard function modules, and custom objects that are hard-coded in the ABAP logic." },
      { x: 50, y: 70, question: "What is the Compliance Baseline?", answer: "A calculated rating of how upgrade-ready and clean the uploaded code is compared to S/4HANA extensibility guidelines." }
    ]
  },
  {
    time: "00:55 - 01:25",
    title: "Phase 2: Solution Design",
    desc: "Designing the side-by-side cloud-native target architecture. Maps legacy structures to modern endpoints, configures JWT/XSUAA BTP tunnels, and establishes S/4HANA BYOT destination routing.",
    narration: "Now, we navigate to the Target Architecture Blueprint. Here, we design the modern target cloud-native schema. The solution design console maps custom legacy transactions into versioned API routes and transformed side-by-side Node.js applications. It also details secure JWT/XSUAA BTP tunnels and S/4HANA BYOT destination routing.",
    icon: Award,
    color: "from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200/50",
    hotspots: [
      { x: 30, y: 25, question: "What is S/4HANA BYOT Routing?", answer: "Bring Your Own Tenant (BYOT) allows configuring secure RFC and OData tunnels back to your specific S/4HANA instances, routing live queries safely via the SAP BTP Connectivity service." },
      { x: 70, y: 25, question: "How does security work?", answer: "The solution configures secure JWT/XSUAA BTP tunnels, supporting OAuth 2.0 and SAML/JWT assertion flows to safely propagate identities without exposing credentials." },
      { x: 50, y: 75, question: "What is the Destination Manager?", answer: "It manages secure connections and principal propagation back to your SAP S/4HANA core, routing OData and RFC queries safely." }
    ]
  },
  {
    time: "01:25 - 02:00",
    title: "Phase 3: Code Transformation",
    desc: "Auditing the side-by-side code conversion. Scroll-sync displays legacy ABAP source on the left and modern TypeScript on the right.",
    narration: "Under the Code Transformation workspace, you can review the side-by-side conversion in detail. The scroll-sync code comparison viewer maps legacy ABAP statements directly to their modern TypeScript equivalents. Architects can easily audit the refactored code patterns and ensure secure database queries and BTP SDK conventions are followed.",
    icon: Cpu,
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-200/50",
    hotspots: [
      { x: 25, y: 40, question: "How does Scroll-Sync work?", answer: "Scrolling either the legacy ABAP code or the modern TypeScript code scrolls the other side in perfect synchronization to track changes line-by-line." },
      { x: 75, y: 40, question: "How is the ABAP code translated?", answer: "The engine parses ABAP structures and database SELECTs, translating them into secure, cloud-native Node.js queries using the SAP CAP SDK." },
      { x: 50, y: 80, question: "Can I audit this code?", answer: "Yes. The editor highlights potential security, performance, and best-practice remarks, making it simple for senior architects to audit." }
    ]
  },
  {
    time: "02:00 - 02:30",
    title: "Phase 4: Testing & Sandbox",
    desc: "Automatic test execution in a secure sandbox. Runs safe sandbox simulations against live connected S/4HANA tenants via BYOT secure connectivity.",
    narration: "For verification, the platform automatically mounts the new TypeScript code inside an Isolated Testing Sandbox. The system runs selective, granular unit tests and safe sandbox simulations against live connected S/4HANA tenants using BYOT access keys, showing real-time TAP-formatted execution logs and passing assertions.",
    icon: FileText,
    color: "from-cyan-500/10 to-blue-500/10 text-cyan-600 border-cyan-200/50",
    hotspots: [
      { x: 30, y: 35, question: "What is the S/4HANA Live Sandbox?", answer: "A containerized environment simulating BTP runtimes. It enables safe read-only sandbox simulations against live connected S/4HANA tenants using BYOT access keys, preventing write side-effects." },
      { x: 70, y: 40, question: "What is TAP format?", answer: "Test Anything Protocol is a simple, standardized text output format used to log unit test assertions, passes, and fails clearly." },
      { x: 50, y: 80, question: "What are the test cases testing?", answer: "The generated test cases assert data models, validation rules, security checks, and service endpoint response values." }
    ]
  },
  {
    time: "02:30 - 02:55",
    title: "Phase 5: Process Blueprint",
    desc: "Interactive business process documentation. Maps L1/L2 domain contexts to L3 BPMN diagrams and detailed L4 Architect's decks with native SAP Signavio & SAP Build exports.",
    narration: "In the Process Blueprint workspace, we automatically document the business logic. The platform maps your processes and generates standard BPMN 2.0 XML exports with complete swimlanes and pools. These blueprints are fully compatible and ready for direct import into SAP Signavio and SAP Build Process Automation, accelerating process harmonization.",
    icon: CheckCircle2,
    color: "from-teal-500/10 to-emerald-500/10 text-teal-600 border-teal-200/50",
    hotspots: [
      { x: 30, y: 30, question: "How do I use BPMN 2.0 XML exports?", answer: "You can download full BPMN 2.0 XML representations of your transformed flows, with accurate swimlanes and pools, designed for direct import into SAP Signavio or SAP Build Process Automation." },
      { x: 70, y: 30, question: "Is it SAP Signavio compatible?", answer: "Yes, the exported diagrams strictly follow BPMN 2.0 schemas, ensuring seamless import into SAP Signavio Process Manager and SAP Build without manual remodeling." },
      { x: 50, y: 80, question: "How does navigation work?", answer: "Clicking a BPMN flow node automatically scrolls and highlights the respective Level 4 specification deck card." }
    ]
  },
  {
    time: "02:55 - 03:12",
    title: "Phase 6: Project Delivery",
    desc: "Downloading the completed BTP cloud service. The ZIP folder exports package.json, selective unit tests, and Confluence docs.",
    narration: "Once validated, we generate the final deployable asset. Click 'Download Handover Package' to export a complete ZIP bundle with package.json configs, tests, and markdown documentation. Keep your ERP core pristine. Build fast, scale safe, and join the Clean-Core.io Pilot today.",
    icon: Download,
    color: "from-rose-500/10 to-red-500/10 text-rose-600 border-rose-200/50",
    hotspots: [
      { x: 35, y: 40, question: "What is in the handover ZIP?", answer: "A standard SAP BTP CAP project: schema definitions, OData service controllers, auto-generated unit tests, deployment configs, and README documentation." },
      { x: 65, y: 40, question: "How do I deploy this ZIP?", answer: "Unzip the project, run 'npm install', run local tests, then use 'mbt build' and 'cf deploy' to push to your SAP BTP subaccount." }
    ]
  }
];

export default function HowToPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const [activeConcept, setActiveConcept] = useState<number | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  // Reset active hotspot when slide changes
  useEffect(() => {
    setActiveHotspot(null);
  }, [currentSlide]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard navigation listener (Arrow Keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        setCurrentSlide(prev => Math.min(steps.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        setCurrentSlide(prev => Math.max(0, prev - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [steps.length]);

  const toggleFullscreen = () => {
    if (!deckRef.current) return;
    if (!document.fullscreenElement) {
      deckRef.current.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };




  const concepts = [
    {
      title: "Native CAP & CDS Schemas",
      details: [
        { label: "Official SAP Standard", text: "Built on SAP Cloud Application Programming Model (CAP), the official design pattern for cloud extensions." },
        { label: "CDS Declarative Schema", text: "Core Data Services (.cds) files define data structures and API service models with strict typing." },
        { label: "HANA & SQL Compatibility", text: "Supports automated persistence migrations for SAP HANA Cloud, SQLite, or PostgreSQL." }
      ]
    },
    {
      title: "BTP Destination Bindings",
      details: [
        { label: "Extensible Integration", text: "Connects extensions to SAP S/4HANA core systems securely without hardcoding server hostnames." },
        { label: "Principal Propagation", text: "Seamlessly forwards the logged-in cloud user's identity down to the on-premise ABAP gateway." },
        { label: "Dynamic API Routing", text: "Swap endpoints (sandbox, QA, production) effortlessly through BTP Cockpit destinations." }
      ]
    },
    {
      title: "Stateless JWT & XSUAA Security",
      details: [
        { label: "OAuth 2.0 Trust Setup", text: "Secured using SAP BTP's Extended Services for User Account and Authentication (XSUAA)." },
        { label: "Stateless API Tokens", text: "Intercepts and validates JWT (JSON Web Tokens) at the microservice gateway layer." },
        { label: "Granular RBAC Enforcements", text: "Authorizes individual endpoints using scopes mapped to enterprise user roles." }
      ]
    }
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      
      {/* Back to Workspace Navigation Link */}
      <div className="flex items-center justify-start">
        <Link 
          href="/dashboard" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-white px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50 hover:shadow-sm shadow-slate-100"
        >
          <ArrowLeft size={14} /> Back to Workspace
        </Link>
      </div>

      {/* Upper Glassmorphic Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <BookOpen size={14} className="animate-pulse" /> How-to Tutorials
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Clean-Core.io <span className="text-green-400">How-to</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Learn how enterprise architects safely analyze, refactor, and deploy legacy ERP custom code side-by-side on SAP BTP using artificial intelligence.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main Presentation Player Area (left 3/4 cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-xl border border-gray-100 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-gray-950 flex items-center gap-3">
                  <BookOpen className="text-green-600" /> Walkthrough Presentation
                </h2>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                  Interactive Transformation Process • Slide {currentSlide + 1} of {steps.length}
                </p>
              </div>
            </div>

            {/* Slide Viewer Canvas Container (Ref with Fullscreen toggle support) */}
            {/* Slide Viewer Canvas Container (Ref with Fullscreen toggle support) */}
            <div 
              ref={deckRef}
              className={`border border-slate-200 bg-white flex flex-col justify-between shadow-2xl group transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-[100] !rounded-none bg-slate-50 border-none w-screen h-screen overflow-hidden' : 'h-auto md:aspect-video rounded-[2rem] overflow-visible md:overflow-hidden'}`}
            >
              {/* Split Workspace */}
              <div className="flex-grow flex flex-col md:flex-row w-full overflow-visible md:overflow-hidden min-h-0">
                
                {/* Left Panel: High-Fidelity Screenshot & Pulsing Hotspots (60% width) */}
                <div className="w-full md:w-3/5 aspect-video md:aspect-auto md:h-full relative bg-slate-100 flex items-center justify-center md:border-r border-b md:border-b-0 border-slate-200/60 overflow-hidden shrink-0">
                  <img 
                    src={currentSlide === 0 ? '/screenshots/step-7.jpg' : `/screenshots/step-${currentSlide}.jpg`} 
                    alt={steps[currentSlide].title} 
                    className="w-full h-full object-contain select-none transition-all duration-305"
                  />

                  {/* Info overlay badge */}
                  <div className={`absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-205 px-3 py-1.5 rounded-full shadow-sm text-slate-700 select-none animate-pulse ${isFullscreen ? 'text-xs' : 'text-[9px]'}`}>
                    <Sparkles size={isFullscreen ? 14 : 10} className="text-green-600" />
                    <span className="font-bold">Hover / Tap highlights for details</span>
                  </div>

                  {/* Hotspots overlay */}
                  {steps[currentSlide].hotspots.map((hotspot, i) => {
                    const isActive = activeHotspot === i;
                    return (
                      <div
                        key={i}
                        className="absolute z-30"
                        style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                      >
                        {/* Pulsing halo */}
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-green-500/40 animate-ping pointer-events-none"></span>
                        
                        {/* Interactive Trigger Button */}
                        <button
                          onMouseEnter={() => setActiveHotspot(i)}
                          onMouseLeave={() => setActiveHotspot(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHotspot(isActive ? null : i);
                          }}
                          className={`relative w-7 h-7 sm:w-9 sm:h-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-650 hover:bg-green-700 text-white flex items-center justify-center shadow-lg border-2 border-white transition-all transform hover:scale-110 focus:outline-none cursor-pointer ${isActive ? 'scale-115 bg-green-700 ring-4 ring-green-500/35' : ''}`}
                          aria-label={`Question: ${hotspot.question}`}
                        >
                          <HelpCircle size={isFullscreen ? 18 : 14} className="animate-pulse" />
                        </button>

                        {/* Floating Glassmorphic Tooltip */}
                        {isActive && (
                          <div
                            className="absolute z-40 bg-white/95 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-xl w-60 sm:w-72 transition-all duration-300 pointer-events-auto text-left hidden md:block"
                            style={{
                              left: hotspot.x > 50 ? 'auto' : '24px',
                              right: hotspot.x > 50 ? '24px' : 'auto',
                              top: hotspot.y > 50 ? 'auto' : '24px',
                              bottom: hotspot.y > 50 ? '24px' : 'auto',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-1">
                              <h5 className="font-black text-green-750 text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles size={12} className="text-green-650" /> {hotspot.question}
                              </h5>
                              <p className="text-slate-700 text-[11px] sm:text-xs font-semibold leading-relaxed">
                                {hotspot.answer}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>

                {/* Right Panel: Explanations, Q&A, and Narration Script (40% width) */}
                <div className="w-full md:w-2/5 h-auto md:h-full relative bg-white p-6 sm:p-8 flex flex-col justify-between overflow-visible md:overflow-y-auto min-w-0">
                  <div className="space-y-6">
                    {/* Header: Slide index & Title */}
                    <div className="space-y-1.5">
                      <span className={`bg-green-50 border border-green-200 text-green-700 rounded-lg font-black uppercase tracking-wider ${isFullscreen ? 'px-3 py-1 text-[10px]' : 'px-2 py-0.5 text-[8px]'}`}>
                        Slide {currentSlide + 1} of {steps.length}
                      </span>
                      <h3 className={`font-black text-slate-900 leading-tight ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
                        {steps[currentSlide].title}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        {steps[currentSlide].desc}
                      </p>
                    </div>

                    {/* Explanations / Hotspots Q&A list */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Info size={14} className="text-slate-400" /> Interactive FAQs
                      </h4>
                      
                      <div className="space-y-2.5">
                        {steps[currentSlide].hotspots.map((hotspot, i) => {
                          const isHotspotActive = activeHotspot === i;
                          return (
                            <div 
                              key={i}
                              onClick={() => setActiveHotspot(isHotspotActive ? null : i)}
                              className={`border border-slate-100 rounded-xl p-3 cursor-pointer transition-all duration-200 select-none ${isHotspotActive ? 'bg-green-50/40 border-green-250 ring-1 ring-green-250 shadow-sm' : 'bg-slate-50/55 hover:bg-slate-50 border-slate-200/60'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-800 text-[10px] sm:text-xs leading-snug">
                                  {hotspot.question}
                                </span>
                                <ChevronRight 
                                  size={12} 
                                  className={`text-slate-450 shrink-0 transition-transform duration-200 ${isHotspotActive ? 'rotate-90 text-green-600' : ''}`}
                                />
                              </div>
                              
                              {isHotspotActive && (
                                <p className="mt-2 text-[10px] sm:text-xs text-slate-655 font-medium leading-relaxed border-t border-slate-200/50 pt-2 animate-in fade-in duration-200">
                                  {hotspot.answer}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Narration Script Box */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={14} className="text-slate-400" /> Speech Script
                      </h4>
                      <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 border-l-4 border-green-500 shadow-sm">
                        <p className="text-[11px] sm:text-xs text-slate-700 font-medium leading-relaxed italic">
                          "{steps[currentSlide].narration}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Navigation Bar */}
              <div className="bg-white border-t border-slate-200 p-4 flex items-center justify-between gap-4 z-20 select-none shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-xl bg-slate-150 border border-slate-250 text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-all outline-none cursor-pointer flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 size={12} strokeWidth={2.5} /> : <Maximize2 size={12} strokeWidth={2.5} />}
                    <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                    disabled={currentSlide === 0}
                    className="p-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-300 hover:bg-slate-150 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:border-slate-200 transition-all outline-none cursor-pointer"
                    title="Previous Slide"
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                  
                  {/* Progress Indicator Dots */}
                  <div className="hidden sm:flex items-center gap-1.5 px-1.5">
                    {steps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSlide(i)}
                        className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${currentSlide === i ? 'w-6 bg-green-600 shadow shadow-green-600/30' : 'w-2 bg-slate-300 hover:bg-slate-400'}`}
                        title={`Go to Slide ${i + 1}`}
                      ></button>
                    ))}
                  </div>

                  <span className="sm:hidden text-[10px] font-mono font-bold text-slate-500 px-1">{currentSlide + 1} / {steps.length}</span>

                  <button
                    onClick={() => setCurrentSlide(prev => Math.min(steps.length - 1, prev + 1))}
                    disabled={currentSlide === steps.length - 1}
                    className="p-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-300 hover:bg-slate-150 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:border-slate-200 transition-all outline-none cursor-pointer"
                    title="Next Slide"
                  >
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Quick Links & Core Concepts (1/3 col) */}
        <div className="space-y-6">
          <div className="bg-gradient-to-b from-white to-green-50/10 rounded-[2.5rem] p-8 shadow-xl border border-gray-100 space-y-6">
            <h3 className="text-xl font-black text-gray-950">How-to Quick Start Guide</h3>
            <p className="text-sm text-gray-600 leading-relaxed font-medium">
              Build clean cloud architectures on SAP BTP in a few simple steps:
            </p>

            <div className="space-y-5">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-100 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">1</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-gray-900 font-black font-black">Upload ABAP</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">Analyze legacy classes directly in the Analytics Dashboard.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-100 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">2</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-gray-900 font-black font-black">Review Architecture</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">Review cds schemas and Dockerfiles in Solution Design.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-100 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">3</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-gray-900 font-black">Execute Tests</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">Verify API endpoints in the secure Node sandbox.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-100 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">4</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-gray-900 font-black">Download ZIP Package</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">Download your complete BTP handover package including tests.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <Link 
                href="/dashboard"
                className="flex items-center justify-between bg-green-600 hover:bg-green-700 text-white rounded-2xl p-4 font-black text-sm transition-all shadow-xl shadow-green-100 group"
              >
                <span>Try it Now</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Core Concepts: Designed for IT Professionals */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-slate-800 space-y-8 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 w-96 h-96 bg-[radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.05),transparent)] pointer-events-none"></div>
        
        <div className="max-w-3xl space-y-3">
          <h3 className="text-2xl md:text-3xl font-black text-slate-100 uppercase tracking-tight">Designed for IT Professionals</h3>
          <p className="text-sm text-slate-300 leading-relaxed font-medium">
            Clean-Core.io strictly follows official SAP architectural guidelines to build side-by-side extensions on the SAP Business Technology Platform (BTP). Here is a deep dive into our core architectural principles.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 pt-4">
          {concepts.map((concept, i) => (
            <div key={i} className="bg-slate-950/60 border border-slate-805/80 rounded-3xl p-6 md:p-8 space-y-6 hover:border-green-500/30 transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center text-sm font-black shrink-0">
                    {i + 1}
                  </div>
                  <h4 className="font-black text-slate-100 text-sm md:text-base uppercase tracking-wider">{concept.title}</h4>
                </div>

                <div className="space-y-4 pt-2">
                  {concept.details.map((detail, dIdx) => (
                    <div key={dIdx} className="space-y-1 pl-3 border-l-2 border-green-500/20 hover:border-green-500 transition-colors duration-200">
                      <span className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                        💡 {detail.label}
                      </span>
                      <p className="text-slate-200 text-[11px] leading-relaxed font-medium">{detail.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="text-[10px] font-black text-green-450 uppercase tracking-widest pt-4 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                SAP Verified Strategy <Check size={12} className="stroke-[3]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
