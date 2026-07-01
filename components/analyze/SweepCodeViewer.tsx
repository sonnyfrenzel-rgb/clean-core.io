'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import clsx from 'clsx';

/* ---------- ABAP keyword highlighter ---------- */
const ABAP_KEYWORDS = new Set([
  'SELECT', 'FROM', 'INTO', 'TABLE', 'WHERE', 'AND', 'OR', 'NOT',
  'DATA', 'TYPE', 'TYPES', 'CLASS', 'METHOD', 'ENDMETHOD', 'ENDCLASS',
  'IF', 'ELSE', 'ENDIF', 'LOOP', 'ENDLOOP', 'DO', 'ENDDO',
  'CALL', 'FUNCTION', 'PERFORM', 'FORM', 'ENDFORM', 'REPORT',
  'WRITE', 'MOVE', 'CLEAR', 'APPEND', 'READ', 'MODIFY', 'DELETE',
  'INSERT', 'UPDATE', 'COMMIT', 'WORK', 'ROLLBACK', 'TRY', 'CATCH',
  'RAISE', 'EXCEPTION', 'RETURN', 'EXPORTING', 'IMPORTING', 'CHANGING',
  'INNER', 'JOIN', 'LEFT', 'OUTER', 'ON', 'AS', 'FOR', 'ALL', 'ENTRIES',
  'CONSTANTS', 'VALUE', 'BEGIN', 'END', 'OF', 'INCLUDE', 'STRUCTURE',
  'INTERFACE', 'METHODS', 'REDEFINITION', 'INHERITING', 'ABSTRACT',
  'FINAL', 'CREATE', 'PUBLIC', 'PRIVATE', 'PROTECTED', 'SECTION',
  'AUTHORITY-CHECK', 'OBJECT', 'FIELD', 'SUBMIT', 'VIA', 'SELECTION-SCREEN',
]);

function highlightAbapLine(line: string): React.ReactNode[] {
  // Split into tokens preserving whitespace
  const parts = line.split(/(\s+|'[^']*'|"[^"]*")/);
  return parts.map((part, i) => {
    if (/^'[^']*'$/.test(part) || /^"[^"]*"$/.test(part)) {
      return <span key={i} className="text-amber-400">{part}</span>;
    }
    if (ABAP_KEYWORDS.has(part.toUpperCase().replace(/[.,]$/, ''))) {
      return <span key={i} className="text-emerald-400 font-bold">{part}</span>;
    }
    if (/^\*/.test(part.trimStart()) || /^"/.test(part.trimStart())) {
      return <span key={i} className="text-slate-500 italic">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

/* ---------- Severity badge colors ---------- */
const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  Critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', glow: 'shadow-red-500/20' },
  High:     { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40', glow: 'shadow-orange-500/20' },
  Medium:   { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-amber-500/20' },
  Low:      { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', glow: 'shadow-blue-500/20' },
  Info:     { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/40', glow: 'shadow-slate-500/20' },
};

/* ---------- Component ---------- */
interface SweepCodeViewerProps {
  code: string;
  findings: EvidenceFinding[];
  revealedCount: number;
  scanLineProgress: number; // 0–1
}

export default function SweepCodeViewer({ code, findings, revealedCount, scanLineProgress }: SweepCodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => code.split('\n'), [code]);
  const totalLines = lines.length;

  // Map: lineNumber → revealed findings on that line
  const findingsByLine = useMemo(() => {
    const map = new Map<number, EvidenceFinding[]>();
    const revealed = findings.slice(0, revealedCount);
    for (const f of revealed) {
      const existing = map.get(f.lineStart) || [];
      existing.push(f);
      map.set(f.lineStart, existing);
    }
    return map;
  }, [findings, revealedCount]);

  // Auto-scroll to latest revealed finding
  useEffect(() => {
    if (revealedCount > 0 && containerRef.current) {
      const latest = findings[revealedCount - 1];
      if (latest) {
        const lineEl = containerRef.current.querySelector(`[data-line="${latest.lineStart}"]`);
        lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [revealedCount, findings]);

  const scanLineTop = scanLineProgress * 100;

  return (
    <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur overflow-hidden">
      {/* Scan line */}
      {scanLineProgress > 0 && scanLineProgress < 1 && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: `${scanLineTop}%` }}
        >
          <div className="h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_4px_rgba(52,211,153,0.4)]" />
          <div className="h-6 bg-gradient-to-b from-emerald-400/10 to-transparent" />
        </div>
      )}

      {/* Code area */}
      <div
        ref={containerRef}
        className="overflow-auto max-h-[50vh] sm:max-h-[60vh] font-mono text-[11px] sm:text-xs leading-[1.6] scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700"
        role="region"
        aria-label="ABAP source code with evidence findings"
      >
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const lineFindingsArr = findingsByLine.get(lineNum);
          const isAboveScan = lineNum / totalLines <= scanLineProgress;

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className={clsx(
                'flex items-stretch border-b border-slate-800/30 transition-opacity duration-300',
                isAboveScan ? 'opacity-100' : 'opacity-30'
              )}
            >
              {/* Line number gutter */}
              <div className="hidden sm:flex w-12 shrink-0 items-center justify-end pr-3 text-slate-600 select-none text-[10px] bg-slate-900/50 border-r border-slate-800/40">
                {lineNum}
              </div>

              {/* Code content */}
              <div className="flex-1 px-3 sm:px-4 py-[1px] whitespace-pre overflow-x-auto">
                <code className="text-slate-300">
                  {highlightAbapLine(line)}
                </code>
              </div>

              {/* Finding badges */}
              {lineFindingsArr && (
                <div className="flex items-center gap-1 pr-2 sm:pr-3 shrink-0">
                  {lineFindingsArr.map((f) => {
                    const colors = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.Info;
                    return (
                      <span
                        key={f.id}
                        className={clsx(
                          'inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black border animate-in fade-in slide-in-from-right-2 duration-300',
                          colors.bg, colors.text, colors.border,
                          `shadow-md ${colors.glow}`
                        )}
                        title={f.title}
                      >
                        <span className="hidden sm:inline">{f.kind.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).substring(0, 12)}</span>
                        <span className="sm:hidden">{f.severity[0]}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
