'use client';

import { useState } from 'react';
import { ShieldCheck, Link2, ExternalLink, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupportFinding } from '@/lib/abap/class-model';
import { safeHttpHref } from '@/lib/export-safety';
import CcButton, { CC_BUTTON_BASE, CC_BUTTON_DENSITY_CLASSES, CC_BUTTON_VARIANT_CLASSES } from '@/components/cc/Button';
import { CcEmptyState } from '@/components/cc/EmptyState';
import { SupportLevelMark } from './CoverageVerdict';

interface ConstructFindingsProps {
  findings: SupportFinding[];
}

export default function ConstructFindings({ findings }: ConstructFindingsProps) {
  const [signedOffKeys, setSignedOffKeys] = useState<Set<string>>(new Set());

  if (!findings || findings.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="cc-text-h2 text-cc-ink">
            Construct Findings <span className="font-medium text-cc-ink-muted">(0 findings)</span>
          </h3>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Deterministic static analysis of ABAP language constructs against target platform support matrix.</p>
        </div>
        {/* "Pristine Codebase Detected" was a verdict on the code. What the run
            establishes is narrower: these detectors matched nothing. That is the
            same output an unparseable file, an empty upload, or a construct the
            matrix does not cover yet produces — and none of those is a clean
            codebase. The sentence below states the finding; the heading no longer
            states a conclusion the finding does not carry. */}
        <CcEmptyState
          illustration={<SearchX size={24} aria-hidden="true" className="text-cc-ink-muted" />}
          title="No findings from these detectors"
        >
          The static analysis matched no unreleased database queries, screen flows or dynamic
          call targets in the staged code. It does not follow that the code is clean — only
          that these checks found nothing to report.
        </CcEmptyState>
      </div>
    );
  }

  const getFindingKey = (f: SupportFinding) => {
    return `${f.construct}-${f.location?.file || 'main'}-${f.location?.line || 0}`;
  };

  const toggleSignOff = (key: string) => {
    setSignedOffKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="cc-text-h2 text-cc-ink">
          Statically Identified Constructs{' '}
          <span className="font-medium text-cc-ink-muted">({findings.length} findings)</span>
        </h3>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Review the architectural footprint and evidence list before confirming solution design.</p>
      </div>

      <div className="space-y-3">
        {findings.map((finding) => {
          const key = getFindingKey(finding);
          const isSignedOff = signedOffKeys.has(key);
          const level = finding.level || 'fully';

          return (
            <div
              key={key}
              className={cn(
                'rounded-cc-card border bg-cc-surface p-4 shadow-cc flex flex-col md:flex-row gap-4 items-start justify-between',
                // A sign-off is the reader's own word: information, never green (§1.1).
                isSignedOff ? 'border-cc-information' : 'border-cc-line',
              )}
            >
              {/* Left Column: Level + Title + Location + Explanations */}
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <SupportLevelMark level={level} />

                  {/* Construct Title */}
                  <h4 className="cc-text-h3 text-cc-ink">{finding.title}</h4>

                  {/* File Location */}
                  {finding.location && (
                    <span className="inline-flex items-center gap-1 font-cc-mono text-[12px] text-cc-ink-muted">
                      <Link2 size={12} aria-hidden="true" />
                      {finding.location.file}:{finding.location.line}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Detail */}
                  <div className="space-y-1">
                    <span className="cc-text-label text-cc-ink-muted block">Static Evidence</span>
                    <p className="cc-text-cell text-cc-ink">{finding.detail}</p>
                  </div>

                  {/* Recommendation */}
                  <div className="space-y-1">
                    <span className="cc-text-label text-cc-ink-muted block">Modernization Path</span>
                    <p className="cc-text-cell text-cc-ink-muted">{finding.recommendation}</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Actions & Sign-off check */}
              <div className="flex md:flex-col items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 border-cc-line pt-3 md:pt-0 md:pl-4 self-stretch md:justify-center">
                {/* How it works Deep Link */}
                {/* The value comes from the analysis model, so it reaches an
                    anchor only as http(s) — the same rule and the same helper as
                    the presentation viewer (SEC-2026-152, f9f4ac1). React renders
                    a `javascript:` href with nothing but a developer warning, and
                    a click runs it. Security audit of b88c77b, SEC-b88c77b-148:
                    this was the second site with the same shape. */}
                {safeHttpHref(finding.howItWorks) && (
                  <a
                    href={safeHttpHref(finding.howItWorks)}
                    target="_blank"
                    rel="noreferrer"
                    data-cc-button="ghost"
                    className={cn(CC_BUTTON_BASE, CC_BUTTON_VARIANT_CLASSES.ghost, CC_BUTTON_DENSITY_CLASSES.compact, 'no-underline flex-1 md:w-full')}
                  >
                    <span>How It Works</span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}

                {/* Sign-off toggle */}
                <CcButton
                  variant="ghost"
                  aria-pressed={isSignedOff}
                  icon={<ShieldCheck size={16} aria-hidden="true" />}
                  onClick={() => toggleSignOff(key)}
                >
                  {isSignedOff ? 'Signed Off' : 'Sign Off'}
                </CcButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
