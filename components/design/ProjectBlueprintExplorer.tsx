'use client';

import { Folder, FileCode } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

interface StructureItem {
  path: string;
  purpose: string;
}

interface ProjectBlueprintExplorerProps {
  projectStructure?: Array<StructureItem | string>;
  /**
   * Inside a group of the design document (03.10.2026): no card of its own and
   * no provenance chip — the group carries "Model proposal" once.
   */
  embedded?: boolean;
}

export default function ProjectBlueprintExplorer({ projectStructure, embedded = false }: ProjectBlueprintExplorerProps) {
  if (!projectStructure || projectStructure.length === 0) return null;

  return (
    <div className={embedded ? 'flex min-w-0 flex-col' : 'rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc lg:col-span-1 flex flex-col'}>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className={embedded ? 'cc-text-h3 text-cc-ink' : 'cc-text-h2 text-cc-ink'}>Target Project Blueprint</h4>
          {embedded ? null : <CcProvenanceChip value="proposed" />}
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">{embedded ? 'The files of the target project, with what each is for.' : 'Recommended file structure for the side-by-side Node.js application.'}</p>
      </div>

      <div className="bg-cc-surface-muted rounded-cc-row p-4 border border-cc-line flex-1 font-cc-mono text-[12px] overflow-y-auto space-y-2 max-h-[360px]">
        <div className="flex items-center gap-2 text-cc-ink font-semibold">
          <Folder className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
          <span>/project-root</span>
        </div>

        {projectStructure.map((item, idx) => {
          if (!item) return null;
          const pathStr = typeof item === 'string' ? item : item.path || '';
          const purposeStr = typeof item === 'string' ? '' : item.purpose || '';

          const parts = pathStr.split('/');
          const isFile = parts[parts.length - 1]?.includes('.') || false;
          const name = parts[parts.length - 1] || '';
          const depth = parts.length;

          return (
            <div
              key={idx}
              style={{ paddingLeft: `${depth * 16}px` }}
              className={embedded ? 'flex min-w-0 flex-col py-1 px-1 min-[720px]:flex-row min-[720px]:items-baseline min-[720px]:justify-between min-[720px]:gap-4' : 'flex items-center justify-between py-1 hover:bg-cc-surface rounded-cc-row px-1'}
              title={purposeStr}
            >
              <div className="flex min-w-0 items-center gap-2">
                {isFile ? (
                  <FileCode className="w-4 h-4 shrink-0 text-cc-ink-muted" aria-hidden="true" />
                ) : (
                  <Folder className="w-4 h-4 shrink-0 text-cc-ink-muted" aria-hidden="true" />
                )}
                <span className="text-cc-ink font-medium break-all">{name}</span>
              </div>
              {/* In the document the purpose is read in full, never cut off. */}
              <span className={embedded ? 'cc-text-meta text-cc-ink-muted font-sans pl-6 min-[720px]:pl-0 min-[720px]:text-right [overflow-wrap:anywhere]' : 'cc-text-meta text-cc-ink-muted font-sans truncate ml-2 max-w-[120px]'}>{purposeStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
