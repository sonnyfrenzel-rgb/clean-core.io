'use client';

import { ArrowUpRight } from 'lucide-react';
import GlossaryTerm from '@/components/GlossaryTerm';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { sapApiHubUrl } from '@/lib/export-safety';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import type { CleanCoreLevelValue } from '@/lib/clean-core-level';

interface ApiMapping {
  legacyTableOrFunction: string;
  sapStandardApiName: string;
  apiHubUrl: string;
  apiId: string;
  description: string;
}

interface ApiBusinessHubMappingProps {
  sapStandardApiMapping?: ApiMapping[];
  /**
   * The engine's clean core level per object of the signed run (the findings
   * route). Each legacy object is shown with its level today; an object the
   * engine graded more than once shows its worst level, and one it did not
   * grade says "not determined" rather than guessing.
   */
  levels?: readonly { objectName: string | null; level: string | null }[] | null;
  /**
   * Inside a group of the design document (03.10.2026): no card of its own and
   * no provenance chip — the group carries "Model proposal" once.
   */
  embedded?: boolean;
}

const ORDER: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };

/** The worst level the engine gave this object, or `Unknown`. */
export function levelOfObject(
  name: string,
  levels: readonly { objectName: string | null; level: string | null }[] | null | undefined,
): CleanCoreLevelValue {
  const key = name.trim().toUpperCase();
  let worst: CleanCoreLevelValue = 'Unknown';
  for (const row of levels ?? []) {
    if (!row.objectName || row.objectName.toUpperCase() !== key) continue;
    const level = row.level ?? '';
    if (ORDER[level] && (worst === 'Unknown' || ORDER[level] > ORDER[worst])) worst = level as CleanCoreLevelValue;
  }
  return worst;
}

const COLUMNS = [
  { key: 'legacy', label: 'Legacy Object' },
  { key: 'level', label: 'Level today', width: '7.5rem' },
  { key: 'target', label: 'Target Released API' },
  { key: 'apiId', label: 'Hub API ID' },
  { key: 'role', label: 'Integration Role / Context' },
  { key: 'action', label: 'Action', action: true },
] as const;

export default function ApiBusinessHubMapping({ sapStandardApiMapping, levels = null, embedded = false }: ApiBusinessHubMappingProps) {
  if (!sapStandardApiMapping || sapStandardApiMapping.length === 0) return null;

  return (
    <div className={embedded ? 'flex min-w-0 flex-col' : 'rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col'}>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={embedded ? 'cc-text-h3 text-cc-ink' : 'cc-text-h2 text-cc-ink'}>SAP Business Accelerator Hub Integration</h4>
            {/* The mapping — which API, which ID, which address — is the model's. */}
            {embedded ? null : <CcProvenanceChip value="proposed" />}
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
            legacy: <span data-design-mapping={map.legacyTableOrFunction} className="font-cc-mono cc-text-cell font-semibold text-cc-ink-muted select-all [overflow-wrap:anywhere]">{map.legacyTableOrFunction}</span>,
            level: (() => {
              // The engine's level of the object the code uses today — not of the API.
              const value = levelOfObject(map.legacyTableOrFunction, levels);
              return (
                <span data-design-mapping-level="" data-level={value === 'Unknown' ? 'none' : value} className="inline-flex items-center gap-1">
                  <CcCleanCoreLevel value={value} />
                  {value === 'Unknown' ? <span className="cc-text-meta text-cc-ink-muted">not determined</span> : null}
                </span>
              );
            })(),
            target: <span className="cc-text-cell font-semibold text-cc-ink [overflow-wrap:anywhere]">{map.sapStandardApiName}</span>,
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
