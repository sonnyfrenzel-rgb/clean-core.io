'use client';

import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

interface ApiEndpointsCatalogProps {
  apiEndpoints?: ApiEndpoint[];
}

const COLUMNS = [
  { key: 'method', label: 'Method', width: '6rem' },
  { key: 'path', label: 'Route Path' },
  { key: 'description', label: 'Action Description' },
] as const;

export default function ApiEndpointsCatalog({ apiEndpoints }: ApiEndpointsCatalogProps) {
  if (!apiEndpoints || apiEndpoints.length === 0) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc lg:col-span-2 flex flex-col">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="cc-text-h2 text-cc-ink">Target API Catalog</h4>
          <CcProvenanceChip value="proposed" />
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Proposed API layer handling the transformed legacy transaction capability.</p>
      </div>

      <div className="flex-1">
        {/* The HTTP method is a property of the route, not a state: one tag, no colour per verb. */}
        <CcTable
          caption="Target API catalog"
          columns={COLUMNS}
          rows={apiEndpoints.map((route, idx) => ({
            key: String(idx),
            cells: {
              method: <CcTag>{route.method}</CcTag>,
              path: <span className="font-cc-mono cc-text-cell font-semibold text-cc-ink select-all">{route.path}</span>,
              description: <span className="cc-text-cell text-cc-ink">{route.description}</span>,
            },
          }))}
        />
      </div>
    </div>
  );
}
