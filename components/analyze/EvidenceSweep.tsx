'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import SweepCodeViewer from './SweepCodeViewer';
import SweepVerdictBar from './SweepVerdictBar';
import { Shield, Cpu } from 'lucide-react';

/* ---------- Types ---------- */
interface EvidenceSweepProps {
  code: string;
  findings: EvidenceFinding[];
  isActive: boolean;
  onComplete: () => void;
  minDuration?: number; // default 3500ms
}

/* ---------- Component ---------- */
export default function EvidenceSweep({
  code,
  findings,
  isActive,
  onComplete,
  minDuration = 3500,
}: EvidenceSweepProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [scanLineProgress, setScanLineProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

  // Total lines in code
  const totalLines = useMemo(() => code.split('\n').length, [code]);

  const finishSweep = useCallback(() => {
    setIsComplete(true);
    setRevealedCount(sortedFindings.length);
    setScanLineProgress(1);
    // Small delay for the "lock in" glow effect
    setTimeout(() => {
      onCompleteRef.current();
    }, 600);
  }, [sortedFindings.length]);

  useEffect(() => {
    if (!isActive || sortedFindings.length === 0) return;

    // Accessibility: skip animation entirely
    if (prefersReducedMotion) {
      setRevealedCount(sortedFindings.length);
      setScanLineProgress(1);
      setIsComplete(true);
      setTimeout(() => onCompleteRef.current(), 100);
      return;
    }

    startTimeRef.current = Date.now();
    const intervalMs = Math.max(minDuration / sortedFindings.length, 80);
    let count = 0;

    timerRef.current = setInterval(() => {
      count++;
      if (count >= sortedFindings.length) {
        if (timerRef.current) clearInterval(timerRef.current);

        // Ensure minimum duration
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = Math.max(minDuration - elapsed, 0);
        setTimeout(() => finishSweep(), remaining);
        return;
      }

      setRevealedCount(count);

      // Scan line progress = position of current finding relative to total lines
      const currentFinding = sortedFindings[count - 1];
      if (currentFinding && totalLines > 0) {
        setScanLineProgress(currentFinding.lineStart / totalLines);
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, sortedFindings, minDuration, totalLines, prefersReducedMotion, finishSweep]);

  if (!isActive && !isComplete) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
            Evidence Scanner
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 font-bold">
            Deterministic ABAP analysis • No AI guesswork
          </p>
        </div>
        {!isComplete && (
          <div className="ml-auto flex items-center gap-2 text-xs text-emerald-400 font-bold">
            <Cpu className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
            <span className="hidden sm:inline">Scanning…</span>
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

      {/* Code viewer with scan line */}
      <SweepCodeViewer
        code={code}
        findings={sortedFindings}
        revealedCount={revealedCount}
        scanLineProgress={scanLineProgress}
      />

      {/* Progress indicator */}
      {!isComplete && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${(revealedCount / Math.max(sortedFindings.length, 1)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-bold tabular-nums shrink-0">
            {revealedCount}/{sortedFindings.length}
          </span>
        </div>
      )}
    </div>
  );
}
