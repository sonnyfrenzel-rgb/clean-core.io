'use client';

import { useMemo } from 'react';
import { FileCode2, Layers, Search, FileType, AlertTriangle, Check, Box, Plug, Cog, Database, ListOrdered, PhoneOutgoing } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { SupportLevelMark } from './CoverageVerdict';
import type { SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import type { SupportSummary } from '@/lib/abap/findings-detector';

interface PreAnalysisPreviewProps {
  code: string;
  fileName: string;
}

/**
 * Deterministic pre-analysis preview shown after code upload but before the
 * full analysis run. Zero LLM calls — pure regex + findings-detector.
 */
export default function PreAnalysisPreview({ code, fileName }: PreAnalysisPreviewProps) {
  const preview = useMemo(() => {
    if (!code || code.trim().length < 10) return null;

    const lines = code.split(/\r?\n/);
    const loc = lines.length;
    const nonEmpty = lines.filter(l => l.trim().length > 0).length;

    // Detect ABAP object type
    let objectType = 'ABAP Source';
    if (/^\s*CLASS\s+/im.test(code)) objectType = 'Class';
    else if (/^\s*INTERFACE\s+/im.test(code)) objectType = 'Interface';
    else if (/^\s*FUNCTION\s+/im.test(code)) objectType = 'Function Module';
    else if (/^\s*REPORT\s+/im.test(code)) objectType = 'Report';
    else if (/^\s*FORM\s+/im.test(code)) objectType = 'Form Routine';

    // Quick construct scan
    const constructs: { label: string; count: number; icon: typeof Box }[] = [];

    const classMatches = code.match(/^\s*CLASS\s+\w+/gim);
    if (classMatches) constructs.push({ label: 'Class Definitions', count: classMatches.length, icon: Box });

    const ifMatches = code.match(/^\s*INTERFACE\s+\w+/gim);
    if (ifMatches) constructs.push({ label: 'Interfaces', count: ifMatches.length, icon: Plug });

    const methodMatches = code.match(/^\s*METHODS?\s+\w+/gim);
    if (methodMatches) constructs.push({ label: 'Methods', count: methodMatches.length, icon: Cog });

    const selectMatches = code.match(/\bSELECT\b/gi);
    if (selectMatches) constructs.push({ label: 'SELECT Statements', count: selectMatches.length, icon: Database });

    const formMatches = code.match(/^\s*FORM\s+\w+/gim);
    if (formMatches) constructs.push({ label: 'Form Routines', count: formMatches.length, icon: ListOrdered });

    const callMatches = code.match(/\bCALL\s+(FUNCTION|METHOD|TRANSACTION)\b/gi);
    if (callMatches) constructs.push({ label: 'External Calls', count: callMatches.length, icon: PhoneOutgoing });

    // Lightweight findings detection
    const abapSources = [{ file: fileName, content: code }];
    let findings: SupportFinding[] = [];
    let summary: SupportSummary | null = null;
    try {
      const realModel = buildClassModel(abapSources);
      findings = detectFindings(realModel, abapSources);
      summary = summarize(findings, realModel);
    } catch {
      // Silently fail — pre-analysis is non-critical
    }

    return { loc, nonEmpty, objectType, constructs, findings, summary };
  }, [code, fileName]);

  if (!preview) return null;

  const { loc, nonEmpty, objectType, constructs, findings, summary } = preview;
  const coveragePercent = summary
    ? Math.round(((summary.counts.fully) / Math.max(findings.length, 1)) * 100)
    : null;

  const metrics: { label: string; value: string; icon: typeof FileCode2 }[] = [
    { label: 'Lines of Code', value: formatNumber(loc) ?? String(loc), icon: FileCode2 },
    { label: 'Non-Empty Lines', value: formatNumber(nonEmpty) ?? String(nonEmpty), icon: Layers },
    { label: 'Object Type', value: objectType, icon: FileType },
    { label: 'Constructs Flagged', value: String(findings.length), icon: findings.length === 0 ? Check : AlertTriangle },
  ];

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
          <span className="cc-text-label text-cc-ink-muted">Pre-Analysis Preview</span>
        </div>
        <span className="cc-text-meta text-cc-ink-muted">Deterministic · no model call</span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-cc-row border border-cc-line bg-cc-surface p-3 text-center">
            <m.icon className="w-4 h-4 text-cc-ink-muted mx-auto mb-1" aria-hidden="true" />
            <div className="cc-text-h2 text-cc-ink tabular-nums">{m.value}</div>
            <div className="cc-text-label text-cc-ink-muted">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Recognized constructs */}
      {constructs.length > 0 && (
        <div className="mb-4">
          <span className="cc-text-label text-cc-ink-muted block mb-2">Recognized Constructs</span>
          <div className="flex flex-wrap gap-2">
            {constructs.map((c, idx) => (
              <span key={idx} className="inline-flex items-center gap-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-1 cc-text-cell">
                <c.icon className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
                <span className="font-semibold text-cc-ink tabular-nums">{c.count}</span>
                <span className="text-cc-ink-muted">{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Estimated coverage hint — an estimate from the static detectors, and
          it says so with its chip rather than with a tilde alone. */}
      {findings.length > 0 && summary && (
        <div className="rounded-cc-row border border-cc-line bg-cc-surface p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="cc-text-label text-cc-ink-muted">Estimated Coverage Preview</span>
              <CcProvenanceChip value="reconstructed" note="estimate" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SupportLevelMark level="fully" label={`${summary.counts.fully} fully`} />
              <SupportLevelMark level="partial" label={`${summary.counts.partial} review`} />
              <SupportLevelMark level="not-supported" label={`${summary.counts.notSupported} flagged`} />
            </div>
          </div>
          {coveragePercent !== null && (
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="cc-text-title tabular-nums text-cc-ink">~{coveragePercent}%</span>
                <CcWhyPopover
                  subject={`Estimated coverage ${coveragePercent}%`}
                  provenance="reconstructed"
                  basis={`Quick scan of the staged code with the static detectors: ${summary.counts.fully} of ${findings.length} flagged constructs are fully supported on the target. An estimate before the run, not its result.`}
                />
              </div>
              <div className="cc-text-label text-cc-ink-muted">Est. Coverage</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
