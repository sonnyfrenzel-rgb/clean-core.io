'use client';

import { Zap, RefreshCw, Layers, Trash2 } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';

interface Gap {
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  strategy: string;
  complexity: 'High' | 'Medium' | 'Low';
  rationale: string;
}

interface GapsPrioritizationProps {
  showHelpMode: boolean;
  gapsCat: {
    quickWins: Gap[];
    complexStandard: Gap[];
    strategic: Gap[];
    retire: Gap[];
  };
}

/**
 * Four quadrants, told apart by their name, icon and tag — not by a colour. A
 * quadrant is a category, not a state, so it takes no state colour (DESIGN.md
 * §1.1): a red "Retire" would read as an error and a green "Quick Wins" as
 * proven, and neither is either.
 */
const quadrants = [
  {
    key: 'quickWins' as const,
    label: 'Quick Wins',
    subtitle: 'Simple requirements handled through standard extensibility or decommissioned easily.',
    tag: 'Low Effort',
    Icon: Zap,
  },
  {
    key: 'complexStandard' as const,
    label: 'Complex Standard Fit',
    subtitle: 'Standard exists but migration requires significant refactoring or process redesign.',
    tag: 'High Fit / High Effort',
    Icon: RefreshCw,
  },
  {
    key: 'strategic' as const,
    label: 'Strategic Extensions',
    subtitle: 'High complexity, no standard fit. Best implemented side-by-side on SAP BTP.',
    tag: 'Transformed App',
    Icon: Layers,
  },
  {
    key: 'retire' as const,
    label: 'Retire & Decommission',
    subtitle: 'Obsolete requirements or unused custom logic to be removed from scope.',
    tag: 'Decommission',
    Icon: Trash2,
  },
];

export default function GapsPrioritization({ showHelpMode, gapsCat }: GapsPrioritizationProps) {
  return (
    <section className="space-y-4" data-gaps-prioritization="">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="cc-text-h2 text-cc-ink">Gaps Prioritization Matrix</h2>
          {/* The gaps are the model narrative's, sorted here by their strategy and complexity. */}
          <CcProvenanceChip value="proposed" />
        </div>
        <p className="cc-text-cell mt-1 text-cc-ink-muted">Identified extensions grouped by complexity and core compliance impact.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {quadrants.map((q) => {
          const gaps = gapsCat[q.key];
          return (
            <CcCard
              key={q.key}
              title={
                <span className="inline-flex items-center gap-2">
                  <q.Icon size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                  {q.label}
                </span>
              }
              count={gaps.length}
              actions={<CcTag>{q.tag}</CcTag>}
            >
              <p className="cc-text-cell mb-3 text-cc-ink-muted">{q.subtitle}</p>
              {gaps.length > 0 ? (
                <ul className="space-y-2">
                  {gaps.map((g, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
                    >
                      <span className="cc-text-cell text-cc-ink">{g.title}</span>
                      <span className="cc-text-meta shrink-0 text-cc-ink-muted">{g.complexity} effort</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cc-text-cell text-cc-ink-muted">No gaps categorized in this quadrant.</p>
              )}
            </CcCard>
          );
        })}
      </div>
    </section>
  );
}
