'use client';

import { Shield } from 'lucide-react';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

export interface NFRData {
  dataMigration?: string;
  dataRetention?: string;
  auditTrail?: string;
  authorizationConcept?: string;
  errorHandling?: string;
  monitoring?: string;
  slaRequirements?: string;
  cutoverStrategy?: string;
}

interface Props {
  nfr: NFRData | null | undefined;
}

const NFR_ITEMS: { key: keyof NFRData; label: string }[] = [
  { key: 'dataMigration', label: 'Data Migration Strategy' },
  { key: 'dataRetention', label: 'Data Retention & Archival' },
  { key: 'auditTrail', label: 'Audit Trail & Compliance' },
  { key: 'authorizationConcept', label: 'Authorization Concept' },
  { key: 'errorHandling', label: 'Error Handling & Retry' },
  { key: 'monitoring', label: 'Monitoring & Observability' },
  { key: 'slaRequirements', label: 'SLA Requirements' },
  { key: 'cutoverStrategy', label: 'Cutover & Parallel Operation' },
];

export default function NonFunctionalRequirements({ nfr }: Props) {
  if (!nfr) return null;

  // Check if any NFR fields are populated
  const hasContent = NFR_ITEMS.some(item => nfr[item.key]);
  if (!hasContent) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-cc-line">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-cc-ink-muted shrink-0" aria-hidden="true" />
          <div>
            <span className="cc-text-label text-cc-ink-muted">Enterprise Readiness</span>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="cc-text-h2 text-cc-ink">Non-Functional Requirements</h3>
              {/* The requirements are written by the model with the design. */}
              <CcProvenanceChip value="proposed" />
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-cc-line">
        {NFR_ITEMS.map(({ key, label }) => {
          const content = nfr[key];
          if (!content) return null;
          return (
            <div key={key} data-nfr-item={key} className="px-4 sm:px-6 py-2">
              <CcDisclosure title={label} level={4}>
                <div className="pb-2 pl-5 cc-text-body text-cc-ink whitespace-pre-wrap">{content}</div>
              </CcDisclosure>
            </div>
          );
        })}
      </div>
    </div>
  );
}
