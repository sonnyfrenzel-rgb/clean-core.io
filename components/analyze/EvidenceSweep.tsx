'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import SweepCodeViewer from './SweepCodeViewer';
import SweepVerdictBar from './SweepVerdictBar';
import { Shield } from 'lucide-react';
import CcButton from '@/components/cc/Button';

/* ---------- Types ---------- */
interface EvidenceSweepProps {
  code: string;
  findings: EvidenceFinding[];
  isActive: boolean;
  onComplete: () => void;
  /**
   * Ignored. The sweep used to be held open for at least this long — six
   * seconds from the analyze page — whatever the engine had done, which is the
   * artificial minimum duration `DESIGN.md` §5.4 rules out. Still accepted so
   * the page's call compiles until it drops the prop (D.10b).
   */
  minDuration?: number;
}

/**
 * The whole replay may take this long, and no longer (§5.1: "compressed to the
 * time budget"). It is a ceiling, not a floor: a program with three findings is
 * done in a fraction of it.
 */
const SWEEP_BUDGET_MS = 2400;
/** No single step is slower than this, so a short list does not crawl. */
const MAX_STEP_MS = 120;

/**
 * The evidence sweep — `DESIGN.md` §5.1, §5.4.
 *
 * The engine has already run when this mounts (`buildAbapEvidence` is
 * synchronous); what is shown is its findings in line order, the real events
 * of the run, one line lighting up per finding. Nothing waits for a clock:
 * the last finding ends the sweep, "Skip" ends it at once, and
 * `prefers-reduced-motion` shows the end state immediately.
 */
export default function EvidenceSweep({
  code,
  findings,
  isActive,
  onComplete,
}: EvidenceSweepProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The latest-callback ref is kept current in an effect, not during render.
  // Writing a ref while rendering is the one thing refs are not for: under
  // StrictMode the render runs twice and a discarded render would still have
  // written into the ref the surviving one reads.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const completedRef = useRef(false);
  // How often `onComplete` has actually been called, on the DOM as
  // `data-sweep-completions` so a browser test can hold the "exactly once"
  // promise below — the analyze page's own callback only sets a ref, which
  // nothing outside the page can see (tests/evidence-sweep.spec.ts).
  const [completionCalls, setCompletionCalls] = useState(0);

  // Sort findings by line position for sequential reveal
  const sortedFindings = useMemo(
    () => [...findings].sort((a, b) => a.lineStart - b.lineStart),
    [findings]
  );

  // Check prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Severity counts based on revealed findings
  const counts = useMemo(() => {
    const revealed = sortedFindings.slice(0, revealedCount);
    return {
      critical: revealed.filter(f => f.severity === 'Critical').length,
      high: revealed.filter(f => f.severity === 'High').length,
      medium: revealed.filter(f => f.severity === 'Medium').length,
      low: revealed.filter(f => f.severity === 'Low' || f.severity === 'Info').length,
    };
  }, [sortedFindings, revealedCount]);

  const finishSweep = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsComplete(true);
    setRevealedCount(sortedFindings.length);
    if (completedRef.current) return;
    completedRef.current = true;
    setCompletionCalls((n) => n + 1);
    onCompleteRef.current();
  }, [sortedFindings.length]);

  useEffect(() => {
    if (!isActive || sortedFindings.length === 0) return;

    // Accessibility: the end state at once (§5.2).
    if (prefersReducedMotion) {
      const done = setTimeout(finishSweep, 0);
      return () => clearTimeout(done);
    }

    const intervalMs = Math.min(SWEEP_BUDGET_MS / sortedFindings.length, MAX_STEP_MS);
    let count = 0;

    timerRef.current = setInterval(() => {
      count++;
      if (count >= sortedFindings.length) {
        finishSweep();
        return;
      }
      setRevealedCount(count);
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, sortedFindings, prefersReducedMotion, finishSweep]);

  if (!isActive && !isComplete) return null;

  const current = sortedFindings[revealedCount - 1];

  return (
    <div
      data-evidence-sweep=""
      data-sweep-state={isComplete ? 'complete' : 'running'}
      data-sweep-revealed={revealedCount}
      data-sweep-total={sortedFindings.length}
      data-sweep-line={current ? current.lineStart : ''}
      data-sweep-completions={completionCalls}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-2 text-cc-ink-muted">
          <Shield className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="cc-text-h2 text-cc-ink">Evidence Scanner</h3>
          <p className="cc-text-meta text-cc-ink-muted">
            Deterministic ABAP analysis · no model call
          </p>
        </div>
        {!isComplete && (
          <div className="ml-auto flex items-center gap-3">
            <span className="cc-text-meta text-cc-ink-muted tabular-nums" aria-hidden="true">
              {revealedCount}/{sortedFindings.length}
              {current ? ` · line ${current.lineStart}` : ''}
            </span>
            <CcButton variant="ghost" onClick={finishSweep}>
              Skip
            </CcButton>
          </div>
        )}
      </div>

      {/* Verdict bar */}
      <div className="mb-4">
        <SweepVerdictBar
          criticalCount={counts.critical}
          highCount={counts.high}
          mediumCount={counts.medium}
          lowCount={counts.low}
          totalFindings={revealedCount}
          isComplete={isComplete}
        />
      </div>

      {/* The source, a line lit per finding */}
      <SweepCodeViewer
        code={code}
        findings={sortedFindings}
        revealedCount={revealedCount}
      />
    </div>
  );
}
