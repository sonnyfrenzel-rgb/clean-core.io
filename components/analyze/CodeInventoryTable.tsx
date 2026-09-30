'use client';

import { Package } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import CcTable from '@/components/cc/Table';
import { CcSeverity } from '@/components/cc/Identifier';
import type { CodeInventoryItem } from '@/lib/types';

interface CodeInventoryTableProps {
  codeInventory: CodeInventoryItem[];
}

export default function CodeInventoryTable({ codeInventory }: CodeInventoryTableProps) {
  if (!codeInventory || codeInventory.length === 0) return null;

  return (
    <CollapsibleAccordion
      icon={<Package size={16} />}
      title="Code Inventory"
      badge={`${codeInventory.length} object${codeInventory.length !== 1 ? 's' : ''} detected`}
      badgeSeverity={codeInventory.some(i => i.criticality === 'High') ? 'red' : 'green'}
      tooltip="All recognized ABAP artifacts extracted from your uploaded code, classified by type and module."
    >
      {/* Criticality is High / Medium / Low — the words of the severity list,
          so it is shown the one way a severity is shown (ADR-049). */}
      <CcTable
        caption="Code inventory"
        columns={[
          { key: 'object', label: 'Object' },
          { key: 'type', label: 'Type' },
          { key: 'module', label: 'Module' },
          { key: 'criticality', label: 'Criticality' },
        ]}
        rows={codeInventory.map((item, idx) => ({
          key: `${item.objectName}-${idx}`,
          cells: {
            object: <span className="font-cc-mono font-semibold">{item.objectName}</span>,
            type: <span className="text-cc-ink-muted">{item.type}</span>,
            module: <span className="text-cc-ink-muted">{item.module || '—'}</span>,
            criticality: <CcSeverity value={item.criticality} />,
          },
        }))}
      />
    </CollapsibleAccordion>
  );
}
