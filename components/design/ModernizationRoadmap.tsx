'use client';

import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';

interface RoadmapPhase {
  phase: string;
  title: string;
  deliverables: string[];
}

interface ModernizationRoadmapProps {
  roadmap?: RoadmapPhase[];
  /**
   * Inside a group of the design document (03.10.2026): no card of its own and
   * no provenance chip — the group carries "Model proposal" once.
   */
  embedded?: boolean;
}

/**
 * The phases of the change as a small timeline (owner 03.10.2026): side by
 * side on a wide screen, one under the other on a phone, in the order the
 * design names them.
 */
export default function ModernizationRoadmap({ roadmap, embedded = false }: ModernizationRoadmapProps) {
  if (!roadmap || roadmap.length === 0) return null;
  const columns = Math.min(roadmap.length, 4);

  return (
    <div className={embedded ? 'flex min-w-0 flex-col' : 'rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc'}>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className={embedded ? 'cc-text-h3 text-cc-ink' : 'cc-text-h2 text-cc-ink'}>Modernization Roadmap</h4>
          {embedded ? null : <CcProvenanceChip value="proposed" />}
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">The phases of the change, in order.</p>
      </div>

      <ol
        data-design-roadmap=""
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[900px]:[grid-template-columns:repeat(var(--phases),minmax(0,1fr))]"
        style={{ ['--phases' as string]: String(columns) }}
      >
        {roadmap.map((phase, idx) => (
          <li
            key={idx}
            data-design-roadmap-phase={idx}
            className="relative flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line border-t-4 border-t-cc-ink bg-cc-surface p-3"
          >
            <span className="flex flex-wrap items-center gap-2">
              <CcTag>{phase.phase || `Phase ${idx + 1}`}</CcTag>
              <h5 className="m-0 text-[14px] font-bold text-cc-ink [overflow-wrap:anywhere]">{phase.title}</h5>
            </span>
            {phase.deliverables?.length ? (
              <ul className="m-0 list-disc space-y-1 pl-4 cc-text-cell text-cc-ink">
                {phase.deliverables.map((del, dIdx) => (
                  <li key={dIdx} className="[overflow-wrap:anywhere]">{del}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
