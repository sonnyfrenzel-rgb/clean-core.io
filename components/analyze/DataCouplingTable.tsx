'use client';

import { Link2 } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import CcTable from '@/components/cc/Table';
import { CcSeverity } from '@/components/cc/Identifier';
import { CcTag } from '@/components/cc/Tag';
import type { DataCouplingEntry } from '@/lib/types';

interface DataCouplingTableProps {
  dataCoupling: DataCouplingEntry[];
}

/**
 * What the confidence word rests on. "Verified" is hand-written guidance in the
 * product's own table map (`lib/abap/code-assessment.ts`), not a lookup in
 * SAP's release data, so it is shown as a plain tag — never green, which would
 * claim a proof (ADR-007) — and the tag says where the word comes from.
 */
const CONFIDENCE_MEANING: Record<NonNullable<DataCouplingEntry['replacementConfidence']>, string> = {
  'Catalog Match': 'Found in the SAP catalogue data synced into Clean-Core.io.',
  Verified: "Hand-written guidance in Clean-Core.io's table map, not SAP release data.",
  Candidate: 'A standard table without a mapped replacement — check the SAP API Hub.',
  'Needs Validation': 'No replacement is known; validate it yourself.',
};

export default function DataCouplingTable({ dataCoupling }: DataCouplingTableProps) {
  if (!dataCoupling || dataCoupling.length === 0) return null;

  return (
    <CollapsibleAccordion
      icon={<Link2 size={16} />}
      title="Data Coupling"
      badge={`${dataCoupling.length} table${dataCoupling.length !== 1 ? 's' : ''} · ${dataCoupling.filter(d => d.accessType === 'Write' || d.accessType === 'Read/Write').length} direct writes`}
      badgeSeverity={dataCoupling.some(d => d.riskLevel === 'High') ? 'error' : dataCoupling.some(d => d.riskLevel === 'Medium') ? 'warning' : 'neutral'}
      tooltip="Direct database table accesses detected in your code. Write operations on standard tables are a Clean-Core risk."
    >
      <CcTable
        caption="Data coupling"
        columns={[
          { key: 'table', label: 'Table' },
          { key: 'access', label: 'Access' },
          { key: 'occurrences', label: 'Occurrences', numeric: true },
          { key: 'risk', label: 'Risk' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'recommendation', label: 'Recommendation' },
        ]}
        rows={dataCoupling.map((entry, idx) => {
          const confidence = entry.replacementConfidence ?? 'Needs Validation';
          const writes = entry.accessType === 'Write' || entry.accessType === 'Read/Write';
          return {
            key: `${entry.tableName}-${idx}`,
            cells: {
              table: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-cc-mono font-semibold">{entry.tableName}</span>
                  {entry.isCustom && <CcTag>Custom</CcTag>}
                </span>
              ),
              access: <span className={writes ? 'font-semibold text-cc-ink' : 'text-cc-ink-muted'}>{entry.accessType}</span>,
              occurrences: (
                <span>
                  <span className="font-cc-mono">{entry.occurrences ?? 1}</span>
                  {entry.lineNumbers && entry.lineNumbers.length > 0 && (
                    <span className="block font-cc-mono text-[12px] text-cc-ink-muted" title="Detected on lines">
                      L {entry.lineNumbers.join(', ')}
                    </span>
                  )}
                </span>
              ),
              risk: <CcSeverity value={entry.riskLevel} />,
              confidence: (
                <span title={CONFIDENCE_MEANING[confidence]}>
                  <CcTag>{confidence}</CcTag>
                </span>
              ),
              recommendation: <span className="text-cc-ink-muted">{entry.recommendation}</span>,
            },
          };
        })}
      />
    </CollapsibleAccordion>
  );
}
