'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import CcCodeSurface, { type CcCodeLine, type CcCodeToken } from '@/components/cc/CodeSurface';
import { CcSeverity } from '@/components/cc/Identifier';
import { normaliseSeverity } from '@/lib/severity';

/* ---------- ABAP keyword tokens ---------- */
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

/**
 * One ABAP line as the five token kinds of `CcCodeSurface`. A line starting
 * with `*` is a comment as a whole; quoted text and numbers are literals — the
 * literal is the brightest colour on the surface on purpose, it is where a
 * hard-coded rule hides.
 */
function tokenizeAbapLine(line: string): CcCodeToken[] {
  if (/^\s*\*/.test(line)) return [{ kind: 'comment', text: line }];
  const parts = line.split(/(\s+|'[^']*'|`[^`]*`|"[^"]*$)/).filter((p) => p !== '');
  return parts.map((part): CcCodeToken => {
    if (/^"/.test(part)) return { kind: 'comment', text: part };
    if (/^'[^']*'$/.test(part) || /^`[^`]*`$/.test(part) || /^\d+[.,]?$/.test(part)) return { kind: 'literal', text: part };
    if (ABAP_KEYWORDS.has(part.toUpperCase().replace(/[.,:]$/, ''))) return { kind: 'keyword', text: part };
    return { kind: 'plain', text: part };
  });
}

/* ---------- Friendly label for finding kind ---------- */
function formatFindingKind(kind: string): string {
  return kind
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------- Component ---------- */
interface SweepCodeViewerProps {
  code: string;
  /** Sorted by line; the first `revealedCount` are the ones the sweep has reached. */
  findings: EvidenceFinding[];
  revealedCount: number;
}

/**
 * The source during the sweep, on the one dark surface the product has
 * (ADR-028). A line lights up when a finding lands on it — the highlight bar
 * of `CcCodeSurface`, which is the only animation §5.1 allows because it shows
 * where something came from. The findings themselves are listed under the
 * code, one per row with its line, in the order the engine reported them.
 */
export default function SweepCodeViewer({ code, findings, revealedCount }: SweepCodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const revealed = useMemo(() => findings.slice(0, revealedCount), [findings, revealedCount]);

  const lines = useMemo<CcCodeLine[]>(() => {
    const hit = new Set(revealed.map((f) => f.lineStart));
    return code.split('\n').map((text, idx) => ({
      number: idx + 1,
      tokens: tokenizeAbapLine(text),
      highlighted: hit.has(idx + 1),
    }));
  }, [code, revealed]);

  // Keep the latest revealed line in view — inside the code box, not the page.
  useEffect(() => {
    const latest = revealed[revealed.length - 1];
    const box = containerRef.current;
    if (!latest || !box) return;
    const row = box.querySelectorAll<HTMLElement>('[data-cc-code-line]')[latest.lineStart - 1];
    if (row) box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2);
  }, [revealed]);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative max-h-[65vh] overflow-auto rounded-cc-card">
        <CcCodeSurface lines={lines} label="ABAP source code with evidence findings" />
      </div>

      {revealed.length > 0 && (
        <ol className="space-y-1" aria-label="Findings so far">
          {revealed.map((f) => {
            const severity = normaliseSeverity(f.severity);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink">
                <span className="w-12 shrink-0 font-cc-mono text-[12px] text-cc-ink-muted tabular-nums">L{f.lineStart}</span>
                {severity ? <CcSeverity value={severity} /> : null}
                <span className="font-semibold" title={f.title}>{formatFindingKind(f.kind)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
