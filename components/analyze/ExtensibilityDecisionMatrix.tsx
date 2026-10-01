'use client';

import React, { useState, useRef } from 'react';
import { Check, Code2, Layers, X } from 'lucide-react';
import clsx from 'clsx';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { BAIP, isSideBySideRoute, sapNamesForDisplay } from '@/lib/sap-naming';

interface Checkpoint {
  checkpointName: string;
  question: string;
  evaluation: string;
  resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
  cleanCoreImpact: string;
}

interface TrackFeasibility {
  technicalFeasibility: string;
  fitDetails: string;
  pros: string[];
  cons: string[];
}

interface ComparativeAnalysis {
  inAppABAPCloud: TrackFeasibility;
  sideBySideBTP: TrackFeasibility;
}

interface ExtensibilityDecisionMatrixProps {
  extensibilityRoute: string;
  decisionTreeCheckpoints?: Checkpoint[];
  comparativeAnalysis?: ComparativeAnalysis;
}

/**
 * What stands where an answer is missing.
 *
 * Both halves of this panel are optional: the model returns checkpoints and a
 * comparison when it has them, and quite often it does not. Both used to be
 * replaced by a complete, confident set written out below — four named
 * checkpoints with a "Custom Technical Assessment" of the reader's own code, and
 * a two-track comparison with feasibility grades, pros and cons — all of it
 * decided by one boolean: whether the chosen route contains the letters "BTP".
 * Nothing had been assessed, and the reader had no way to tell which of the two
 * they were looking at (QA 0613631545b2).
 */
function NotDetermined({ what }: { what: string }) {
  return (
    <div
      data-not-determined
      className="rounded-cc-row border border-dashed border-cc-field-border bg-cc-surface-muted p-4 cc-text-cell text-cc-ink-muted"
    >
      <span className="cc-text-label text-cc-ink-muted block mb-2">
        Not determined for this run
      </span>
      {what} The route above stands on the evidence the analysis did produce; nothing is filled
      in here from the route itself, because that would be this panel answering its own question.
    </div>
  );
}

/**
 * One of the two extensibility tracks. The track the route chose carries the
 * ink border and its target line; the other stays on the muted surface. Neither
 * is coloured: the grade and the pros and cons are the model's words, so they
 * are tags and plain text, not states (DESIGN.md §4; green means proven).
 */
function Track({
  title,
  icon,
  track,
  chosen,
  target,
}: {
  title: string;
  icon: React.ReactNode;
  track: TrackFeasibility;
  chosen: boolean;
  target: string;
}) {
  return (
    <div
      className={clsx(
        'p-6 rounded-cc-card border flex flex-col justify-between',
        chosen ? 'border-cc-ink bg-cc-surface' : 'border-cc-line bg-cc-surface-muted'
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink-muted">{icon}</span>
            <h4 className="cc-text-h3 text-cc-ink">{title}</h4>
          </div>
          <span className="shrink-0">
            <CcTag>{track.technicalFeasibility}</CcTag>
          </span>
        </div>

        <p className="cc-text-cell text-cc-ink-muted mb-6">{sapNamesForDisplay(track.fitDetails)}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="cc-text-label text-cc-ink-muted block mb-2">Technical Advantages (Pros)</span>
            <ul className="space-y-2 cc-text-cell text-cc-ink">
              {track.pros.map((pro, pIdx) => (
                <li key={pIdx} className="flex items-start gap-2">
                  <Check size={14} aria-hidden="true" className="text-cc-ink-muted shrink-0 mt-0.5" />
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="cc-text-label text-cc-ink-muted block mb-2">Architectural Limitations (Cons)</span>
            <ul className="space-y-2 cc-text-cell text-cc-ink">
              {track.cons.map((con, cIdx) => (
                <li key={cIdx} className="flex items-start gap-2">
                  <X size={14} aria-hidden="true" className="text-cc-ink-muted shrink-0 mt-0.5" />
                  <span>{sapNamesForDisplay(con)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {chosen && (
        <div className="border-t border-cc-line pt-4 mt-6 cc-text-label text-cc-ink-muted">
          {target}
        </div>
      )}
    </div>
  );
}

export default function ExtensibilityDecisionMatrix({
  extensibilityRoute,
  decisionTreeCheckpoints,
  comparativeAnalysis
}: ExtensibilityDecisionMatrixProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const isBtp = isSideBySideRoute(extensibilityRoute);

  // A run stored before roadmap 3.0.15 carries the engine's former wording.
  const checkpoints: Checkpoint[] = (decisionTreeCheckpoints ?? []).map((cp) => ({
    ...cp,
    checkpointName: sapNamesForDisplay(cp.checkpointName),
    evaluation: sapNamesForDisplay(cp.evaluation),
  }));
  const comparative: ComparativeAnalysis | null = comparativeAnalysis ?? null;
  // A stored answer can shrink between renders; an index past the end would read
  // `undefined` and take the panel down with it.
  const active = checkpoints.length > 0 ? Math.min(selectedCheckpoint, checkpoints.length - 1) : 0;
  // Everything this panel shows beyond "not determined" is the model's answer —
  // said once, in the header, where the spark icon used to stand.
  const proposed = checkpoints.length > 0 || comparative !== null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc mb-8 motion-safe:animate-in fade-in duration-700">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="cc-text-h2 text-cc-ink">Extensibility Decision Matrix & Path</h3>
            {proposed && <CcProvenanceChip value="proposed" />}
          </div>
          <p className="cc-text-cell text-cc-ink-muted mt-1">The checkpoints and the track comparison this analysis produced — and nothing where it produced none.</p>
        </div>
        <span className="shrink-0 self-start md:self-center">
          <CcTag>SAP Clean Core Guidelines</CcTag>
        </span>
      </div>

      <div className="space-y-8">
        {checkpoints.length === 0 ? (
          <NotDetermined what="This analysis did not return the step-by-step checkpoints behind the routing decision." />
        ) : (
        /* Pathway Explorer */
        <div className="rounded-cc-card border border-cc-line p-4">
          <span className="cc-text-label text-cc-ink-muted block mb-4">Routing Decision Pathway Explorer</span>
          <div className="relative">
            {/* Horizontal progress path connecting checkpoints */}
            <div className="absolute top-1/2 left-4 right-4 h-px bg-cc-line -translate-y-1/2 hidden md:block z-0"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
              {checkpoints.map((cp, idx) => {
                const isActive = active === idx;

                return (
                  // The surface sits on a wrapper so the connector line stays behind the card.
                  <div key={idx} className="rounded-cc-row bg-cc-surface">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setSelectedCheckpoint(idx);
                      setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                    }}
                    className={clsx(
                      "w-full h-full border rounded-cc-row p-4 text-left transition-colors",
                      isActive
                        ? "border-cc-ink ring-1 ring-cc-ink"
                        : "border-cc-line hover:border-cc-field-border"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx(
                        "w-6 h-6 rounded-full flex items-center justify-center cc-text-meta shrink-0",
                        isActive
                          ? "bg-cc-ink text-cc-surface"
                          : "border border-cc-line bg-cc-surface-muted text-cc-ink-muted"
                      )}>
                        {idx + 1}
                      </span>
                      <span className="cc-text-identifier text-cc-ink line-clamp-1">{cp.checkpointName}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <CcTag>{cp.resultState.split(' ')[0]}</CcTag>
                      <span className="cc-text-meta text-cc-ink-muted ml-auto">Inspect →</span>
                    </div>
                  </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Checkpoint Detail Panel */}
          <div ref={detailPanelRef} className="rounded-cc-row border border-cc-line p-4 mt-4 motion-safe:animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-cc-line pb-4 mb-4">
              <div className="space-y-1">
                <span className="cc-text-label text-cc-ink-muted block">Selected Milestone {active + 1} • {checkpoints[active].checkpointName}</span>
                <h4 className="cc-text-h3 text-cc-ink">{checkpoints[active].question}</h4>
              </div>
              <span className="shrink-0 self-start md:self-auto">
                <CcTag>{checkpoints[active].resultState}</CcTag>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-cc-row bg-cc-surface-muted p-4 space-y-2">
                <span className="cc-text-label text-cc-ink-muted block">Custom Technical Assessment</span>
                <p className="cc-text-cell text-cc-ink">{checkpoints[active].evaluation}</p>
              </div>
              <div className="rounded-cc-row bg-cc-surface-muted p-4 space-y-2">
                <span className="cc-text-label text-cc-ink-muted block">Clean Core Implementation Impact</span>
                <p className="cc-text-cell text-cc-ink">{checkpoints[active].cleanCoreImpact}</p>
              </div>
            </div>
          </div>
        </div>
        )}

        {comparative === null ? (
          <NotDetermined what="This analysis did not return a side-by-side comparison of the two extensibility tracks." />
        ) : (
        /* Tailored comparative matrix */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <Track
            title="In-App ABAP Cloud (RAP)"
            icon={<Code2 size={16} aria-hidden="true" />}
            track={comparative.inAppABAPCloud}
            chosen={!isBtp}
            target="Target: Released CDS Views & RAP Business Objects"
          />
          <Track
            title={`Side-by-Side ${BAIP} (CAP)`}
            icon={<Layers size={16} aria-hidden="true" />}
            track={comparative.sideBySideBTP}
            chosen={isBtp}
            target={`Target: CAP OData APIs & Decoupled ${BAIP} Microservices`}
          />
        </div>
        )}
      </div>
    </div>
  );
}
