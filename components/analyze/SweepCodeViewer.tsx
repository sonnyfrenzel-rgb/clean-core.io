'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import clsx from 'clsx';

/* ---------- ABAP keyword highlighter ---------- */
const ABAP_KEYWORDS = new Set([
  'SELECT', 'FROM', 'INTO', 'TABLE', 'WHERE', 'AND', 'OR', 'NOT',
  'DATA', 'TYPE', 'TYPES', 'CLASS', 'METHOD', 'ENDMETHOD', 'ENDCLASS',
  'IF', 'ELSE', 'ENDIF', 'ELSEIF', 'LOOP', 'ENDLOOP', 'DO', 'ENDDO',
  'CALL', 'FUNCTION', 'PERFORM', 'FORM', 'ENDFORM', 'REPORT',
  'WRITE', 'MOVE', 'CLEAR', 'APPEND', 'READ', 'MODIFY', 'DELETE',
  'INSERT', 'UPDATE', 'COMMIT', 'WORK', 'ROLLBACK', 'TRY', 'CATCH',
  'RAISE', 'EXCEPTION', 'RETURN', 'EXPORTING', 'IMPORTING', 'CHANGING',
  'INNER', 'JOIN', 'LEFT', 'OUTER', 'ON', 'AS', 'FOR', 'ALL', 'ENTRIES',
  'CONSTANTS', 'VALUE', 'BEGIN', 'END', 'OF', 'INCLUDE', 'STRUCTURE',
  'INTERFACE', 'METHODS', 'REDEFINITION', 'INHERITING', 'ABSTRACT',
  'FINAL', 'CREATE', 'PUBLIC', 'PRIVATE', 'PROTECTED', 'SECTION',
  'AUTHORITY-CHECK', 'OBJECT', 'FIELD', 'SUBMIT', 'VIA', 'SELECTION-SCREEN',
  'PARAMETERS', 'OBLIGATORY', 'DEFAULT', 'START-OF-SELECTION',
]);

function highlightAbapLine(line: string): React.ReactNode[] {
  // Split into tokens preserving whitespace
  const parts = line.split(/(\s+|'[^']*'|"[^"]*")/);
  return parts.map((part, i) => {
    if (/^'[^']*'$/.test(part) || /^"[^"]*"$/.test(part)) {
      return <span key={i} className="text-amber-300">{part}</span>;
    }
    if (ABAP_KEYWORDS.has(part.toUpperCase().replace(/[.,]$/, ''))) {
      return <span key={i} className="text-emerald-400 font-bold">{part}</span>;
    }
    // Comments
    if (/^\*/.test(part.trimStart())) {
      return <span key={i} className="text-slate-500 italic">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

/* ---------- Severity badge config ---------- */
const SEVERITY_BADGE: Record<string, {
  bg: string; text: string; border: string; glow: string; lineBg: string;
}> = {
  Critical: {
    bg: 'bg-red-500/25',
    text: 'text-red-300',
    border: 'border-red-500/50',
    glow: 'shadow-red-500/30',
    lineBg: 'bg-red-500/8',
  },
  High: {
    bg: 'bg-orange-500/25',
    text: 'text-orange-300',
    border: 'border-orange-500/50',
    glow: 'shadow-orange-500/30',
    lineBg: 'bg-orange-500/8',
  },
  Medium: {
    bg: 'bg-amber-500/25',
    text: 'text-amber-300',
    border: 'border-amber-500/50',
    glow: 'shadow-amber-500/30',
    lineBg: 'bg-amber-500/8',
  },
  Low: {
    bg: 'bg-blue-500/25',
    text: 'text-blue-300',
    border: 'border-blue-500/50',
    glow: 'shadow-blue-500/30',
    lineBg: 'bg-blue-500/6',
  },
  Info: {
    bg: 'bg-slate-500/25',
    text: 'text-slate-300',
    border: 'border-slate-500/50',
    glow: 'shadow-slate-500/30',
    lineBg: 'bg-slate-500/6',
  },
};

/* ---------- Friendly label for finding kind ---------- */
function formatFindingKind(kind: string): string {
  return kind
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

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
    <div className="relative rounded-2xl border border-slate-700/60 bg-slate-950 backdrop-blur overflow-hidden shadow-2xl">
      {/* Scan line */}
      {scanLineProgress > 0 && scanLineProgress < 1 && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: `${scanLineTop}%` }}
        >
          <div className="h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_24px_6px_rgba(52,211,153,0.5)]" />
          <div className="h-8 bg-gradient-to-b from-emerald-400/12 to-transparent" />
        </div>
      )}

      {/* Code area */}
      <div
        ref={containerRef}
        className="overflow-auto max-h-[65vh] font-mono text-xs sm:text-sm leading-[1.75] scrollbar-thin scrollbar-track-slate-950 scrollbar-thumb-slate-700"
        role="region"
        aria-label="ABAP source code with evidence findings"
      >
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const lineFindingsArr = findingsByLine.get(lineNum);
          const isAboveScan = lineNum / totalLines <= scanLineProgress;
          const highestSeverity = lineFindingsArr?.[0]?.severity;
          const lineColors = highestSeverity ? SEVERITY_BADGE[highestSeverity] : null;

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className={clsx(
                'flex items-stretch transition-opacity duration-300 min-h-[1.75em]',
                isAboveScan ? 'opacity-100' : 'opacity-25',
                lineFindingsArr && lineColors?.lineBg,
              )}
            >
              {/* Line number gutter */}
              <div className={clsx(
                'w-14 shrink-0 flex items-center justify-end pr-3 select-none text-[11px] tabular-nums border-r',
                lineFindingsArr
                  ? 'text-slate-400 font-bold bg-slate-900/60 border-r-slate-600/50'
                  : 'text-slate-600 bg-slate-950/50 border-r-slate-800/40'
              )}>
                {lineNum}
              </div>

              {/* Code content */}
              <div className="flex-1 px-4 py-[2px] whitespace-pre overflow-x-auto">
                <code className="text-slate-300">
                  {highlightAbapLine(line)}
                </code>
              </div>

              {/* Finding badges — full readable labels */}
              {lineFindingsArr && (
                <div className="flex items-center gap-1.5 pr-3 shrink-0">
                  {lineFindingsArr.map((f) => {
                    const colors = SEVERITY_BADGE[f.severity] || SEVERITY_BADGE.Info;
                    return (
                      <span
                        key={f.id}
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-black border animate-in fade-in slide-in-from-right-3 duration-400',
                          colors.bg, colors.text, colors.border,
                          `shadow-md ${colors.glow}`
                        )}
                        title={f.title}
                      >
                        <span className="whitespace-nowrap">{formatFindingKind(f.kind)}</span>
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
