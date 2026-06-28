'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Pipeline steps that tick through during the animation ──
const PIPELINE_STEPS = [
  { label: 'Parsing ABAP AST…', icon: '🔍', duration: 800 },
  { label: 'Table VBAK detected — non-released', icon: '⚠️', duration: 700 },
  { label: 'Mapping → I_SalesOrder (released API)', icon: '🔗', duration: 900 },
  { label: 'CDS View entity generated', icon: '📄', duration: 600 },
  { label: 'Unit test stub created', icon: '🧪', duration: 700 },
  { label: '✓ Compiled — 0 errors', icon: '✅', duration: 500 },
];

// ── The RAP output code lines that type themselves ──
const OUTPUT_LINES = [
  { text: 'define view entity', cls: 'text-blue-400 font-bold' },
  { text: '  ZI_SalesOrderCustom', cls: 'text-emerald-300' },
  { text: 'as select from', cls: 'text-blue-400 font-bold' },
  { text: '  I_SalesOrder', cls: 'text-emerald-400 font-bold' },
  { text: '{', cls: 'text-slate-400' },
  { text: '  key SalesOrder      as SalesOrderNumber,', cls: 'text-slate-200' },
  { text: '      CreationDate    as OrderDate,', cls: 'text-slate-200' },
  { text: '      TotalNetAmount  as NetAmount', cls: 'text-slate-200' },
  { text: '}', cls: 'text-slate-400' },
  { text: 'where SalesOrderType = \'OR\';', cls: 'text-slate-200' },
];

// ── The legacy ABAP code shown statically on the left ──
const LEGACY_LINES = [
  { text: '" Direct table read — violates Clean Core', cls: 'text-slate-500' },
  { text: '', cls: '' },
  { text: 'SELECT vbeln, erdat, netwr', cls: 'text-blue-400 font-bold' },
  { text: '  FROM vbak', cls: 'text-amber-400 font-bold' },
  { text: '  INTO TABLE @DATA(lt_orders)', cls: 'text-slate-200' },
  { text: '  WHERE auart = \'OR\'.', cls: 'text-slate-200' },
];

export default function TransformationReplay() {
  const [phase, setPhase] = useState<'idle' | 'pipeline' | 'typing' | 'done'>('idle');
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [typedLines, setTypedLines] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  // ── Pipeline phase ──
  useEffect(() => {
    if (phase !== 'pipeline') return;
    if (pipelineStep >= PIPELINE_STEPS.length) {
      setPhase('typing');
      return;
    }

    const step = PIPELINE_STEPS[pipelineStep];
    if (!step) return;

    setProgressPct(Math.round(((pipelineStep + 1) / (PIPELINE_STEPS.length + OUTPUT_LINES.length)) * 100));

    timerRef.current = setTimeout(() => {
      setPipelineStep(prev => prev + 1);
    }, step.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, pipelineStep]);

  // ── Typing phase ──
  useEffect(() => {
    if (phase !== 'typing') return;

    typingRef.current = setInterval(() => {
      setTypedChars(prev => {
        const currentLine = OUTPUT_LINES[typedLines];
        if (!currentLine) {
          if (typingRef.current) clearInterval(typingRef.current);
          setPhase('done');
          setProgressPct(100);
          return prev;
        }

        if (prev >= currentLine.text.length) {
          // Move to next line
          setTypedLines(prevLines => {
            const next = prevLines + 1;
            setProgressPct(Math.round(((PIPELINE_STEPS.length + next) / (PIPELINE_STEPS.length + OUTPUT_LINES.length)) * 100));
            if (next >= OUTPUT_LINES.length) {
              if (typingRef.current) clearInterval(typingRef.current);
              setPhase('done');
              setProgressPct(100);
            }
            return next;
          });
          return 0;
        }
        return prev + 1;
      });
    }, 30);

    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, [phase, typedLines]);

  const handlePlay = useCallback(() => {
    setPhase('pipeline');
    setPipelineStep(0);
    setTypedLines(0);
    setTypedChars(0);
    setProgressPct(0);
  }, []);

  const handleReset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (typingRef.current) clearInterval(typingRef.current);
    setPhase('idle');
    setPipelineStep(-1);
    setTypedLines(0);
    setTypedChars(0);
    setProgressPct(0);
  }, []);

  const isActive = phase !== 'idle';

  return (
    <div className="w-full" data-testid="transformation-replay">
      {/* ── Play Button (when idle) ── */}
      {!isActive && (
        <div className="flex justify-center mb-6">
          <button
            onClick={handlePlay}
            className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 hover:from-emerald-900 hover:via-emerald-800 hover:to-emerald-900 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-500 shadow-xl hover:shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="relative flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 group-hover:opacity-75" />
              <span className="relative inline-flex items-center justify-center rounded-full h-5 w-5 bg-emerald-500">
                <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            Watch Transformation Live
          </button>
        </div>
      )}

      {/* ── Active Animation Container ── */}
      {isActive && (
        <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl shadow-black/40 mb-6">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-800/50 border-b border-slate-700/50">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              <span className="ml-2 text-[10px] sm:text-[11px] font-mono font-bold text-slate-400">
                Clean-Core Engine v1.13.2
              </span>
            </div>
            <button
              onClick={handleReset}
              className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-wider transition-colors px-3 py-1 rounded-lg hover:bg-slate-700/50"
            >
              ✕ Close
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Main content: Pipeline steps + Code panels */}
          <div className="p-4 sm:p-6">

            {/* Pipeline log — visible during pipeline & typing phases */}
            {(phase === 'pipeline' || phase === 'typing' || phase === 'done') && (
              <div className="mb-5 bg-slate-800/40 rounded-xl border border-slate-700/40 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    Pipeline Log
                  </span>
                  {phase === 'pipeline' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
                <div className="space-y-1.5 font-mono text-[11px] sm:text-xs max-h-[140px] overflow-y-auto">
                  {PIPELINE_STEPS.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 transition-all duration-300 ${
                        i < pipelineStep
                          ? 'opacity-100'
                          : i === pipelineStep
                            ? 'opacity-100 text-emerald-300'
                            : 'opacity-0 h-0 overflow-hidden'
                      }`}
                    >
                      <span className="shrink-0">{step.icon}</span>
                      <span className={i < pipelineStep ? 'text-slate-400' : 'text-emerald-300'}>
                        {step.label}
                      </span>
                      {i < pipelineStep && (
                        <span className="text-emerald-500 ml-auto shrink-0">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Code panels (side by side on desktop, stacked on mobile) */}
            {(phase === 'typing' || phase === 'done') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT: Legacy ABAP (static) */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Legacy Input
                    </span>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border-b border-slate-700/40">
                      <span className="w-2 h-2 rounded-full bg-red-500/50" />
                      <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                      <span className="w-2 h-2 rounded-full bg-green-500/50" />
                      <span className="ml-2 text-[9px] sm:text-[10px] font-mono font-bold text-slate-500">
                        Z_LEGACY_ORDERS.abap
                      </span>
                    </div>
                    <pre className="p-3 sm:p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed min-h-[160px]">
                      <code className="font-mono">
                        {LEGACY_LINES.map((line, i) => (
                          <div key={i} className={line.cls}>
                            {line.text}
                          </div>
                        ))}
                      </code>
                    </pre>
                  </div>
                </div>

                {/* RIGHT: Generated RAP (typewriter) */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${phase === 'done' ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      {phase === 'done' ? 'Generated Output' : 'Generating…'}
                    </span>
                  </div>
                  <div className="bg-emerald-950/30 rounded-xl border border-emerald-700/30 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900/30 border-b border-emerald-700/30">
                      <span className="w-2 h-2 rounded-full bg-red-500/50" />
                      <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                      <span className="w-2 h-2 rounded-full bg-green-500/50" />
                      <span className="ml-2 text-[9px] sm:text-[10px] font-mono font-bold text-emerald-500">
                        ZI_SalesOrderCustom.cds
                      </span>
                    </div>
                    <pre className="p-3 sm:p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed min-h-[160px]">
                      <code className="font-mono">
                        {OUTPUT_LINES.map((line, i) => {
                          if (i > typedLines) return null;
                          if (i === typedLines && phase !== 'done') {
                            // Currently typing this line
                            return (
                              <div key={i} className={line.cls}>
                                {line.text.slice(0, typedChars)}
                                <span className="inline-block w-[2px] h-[14px] bg-emerald-400 animate-pulse align-text-bottom ml-px" />
                              </div>
                            );
                          }
                          // Fully typed line
                          return (
                            <div key={i} className={line.cls}>
                              {line.text}
                            </div>
                          );
                        })}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Done state: success banner */}
            {phase === 'done' && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 sm:px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl sm:text-2xl">✅</span>
                  <div>
                    <p className="text-xs sm:text-sm font-black text-emerald-400 uppercase tracking-wider">
                      Transformation Complete
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                      VBAK → I_SalesOrder · CDS View + Unit Test generated · 0 errors
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-[10px] font-black text-emerald-400 hover:text-white uppercase tracking-widest px-4 py-2 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/20 transition-all shrink-0"
                >
                  ↻ Replay
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
