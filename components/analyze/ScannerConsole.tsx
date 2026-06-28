'use client';

import { useState, useEffect, useRef } from 'react';

interface ScannerConsoleProps {
  code: string;
  onComplete?: () => void;
}

export default function ScannerConsole({ code, onComplete }: ScannerConsoleProps) {
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
