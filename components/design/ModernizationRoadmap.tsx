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
}

export default function ModernizationRoadmap({ roadmap }: ModernizationRoadmapProps) {
  if (!roadmap || roadmap.length === 0) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="cc-text-h2 text-cc-ink">Modernization Roadmap</h4>
          <CcProvenanceChip value="proposed" />
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Phased execution roadmap for the side-by-side target transition.</p>
      </div>

      <div className="relative pl-6 border-l-2 border-cc-line space-y-8 my-2">
        {roadmap.map((phase, idx) => (
          <div key={idx} className="relative">
            {/* Timeline bullet */}
            <div aria-hidden="true" className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-cc-surface border-2 border-cc-field-border" />
            <div>
              <div className="flex items-center gap-2">
                <CcTag>{phase.phase}</CcTag>
                <h5 className="cc-text-h3 text-cc-ink">{phase.title}</h5>
              </div>
              <ul className="mt-2 space-y-1 cc-text-cell text-cc-ink list-disc pl-4">
                {phase.deliverables?.map((del, dIdx) => (
                  <li key={dIdx}>{del}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
