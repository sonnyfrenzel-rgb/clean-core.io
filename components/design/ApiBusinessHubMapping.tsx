'use client';

import { ArrowUpRight } from 'lucide-react';
import GlossaryTerm from '@/components/GlossaryTerm';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { sapApiHubUrl } from '@/lib/export-safety';

interface ApiMapping {
  legacyTableOrFunction: string;
  sapStandardApiName: string;
  apiHubUrl: string;
  apiId: string;
  description: string;
}

interface ApiBusinessHubMappingProps {
  sapStandardApiMapping?: ApiMapping[];
}

const COLUMNS = [
  { key: 'legacy', label: 'Legacy Object' },
  { key: 'target', label: 'Target Released API' },
  { key: 'apiId', label: 'Hub API ID' },
  { key: 'role', label: 'Integration Role / Context' },
  { key: 'action', label: 'Action', action: true },
] as const;

export default function ApiBusinessHubMapping({ sapStandardApiMapping }: ApiBusinessHubMappingProps) {
  if (!sapStandardApiMapping || sapStandardApiMapping.length === 0) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="cc-text-h2 text-cc-ink">SAP Business Accelerator Hub Integration</h4>
            {/* The mapping — which API, which ID, which address — is the model's. */}
            <CcProvenanceChip value="proposed" />
          </div>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Officially <GlossaryTerm termKey="Released Interface" className="text-cc-ink-muted">Released standard S/4HANA Public APIs</GlossaryTerm> mapped to fully decouple direct legacy database access.</p>
        </div>
        <span className="shrink-0 self-start sm:self-auto">
          <CcTag>api.sap.com Reference</CcTag>
        </span>
      </div>

      <CcTable
        caption="Legacy objects mapped to released SAP APIs"
        columns={COLUMNS}
        rows={sapStandardApiMapping.map((map, idx) => ({
          key: String(idx),
          cells: {
            legacy: <span className="font-cc-mono cc-text-cell font-semibold text-cc-ink-muted select-all">{map.legacyTableOrFunction}</span>,
            target: <span className="cc-text-cell font-semibold text-cc-ink">{map.sapStandardApiName}</span>,
            apiId: <span className="font-cc-mono cc-text-meta text-cc-ink">{map.apiId}</span>,
            role: <span className="cc-text-cell text-cc-ink">{map.description}</span>,
            action: sapApiHubUrl(map.apiHubUrl) ? (
              <a
                href={sapApiHubUrl(map.apiHubUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-cc-row cc-text-meta text-cc-information underline underline-offset-2 hover:text-cc-ink whitespace-nowrap"
              >
                Open API Hub <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </a>
            ) : (
              /* The model's address was not api.sap.com over TLS. It used
                 to go on the anchor as it came, so a javascript: or a
                 foreign link was one click away (security audit of
                 b88c77b, SEC-2026-236). */
              <span
                data-api-hub-unlinked
                className="inline-flex items-center cc-text-meta text-cc-ink-muted whitespace-nowrap"
                title="The model gave no api.sap.com address for this entry, so there is nothing safe to open."
              >
                No API Hub link
              </span>
            ),
          },
        }))}
      />
    </div>
  );
}
