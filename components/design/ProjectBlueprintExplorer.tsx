'use client';

import { Folder, FileCode } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

interface StructureItem {
  path: string;
  purpose: string;
}

interface ProjectBlueprintExplorerProps {
  projectStructure?: Array<StructureItem | string>;
}

export default function ProjectBlueprintExplorer({ projectStructure }: ProjectBlueprintExplorerProps) {
  if (!projectStructure || projectStructure.length === 0) return null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc lg:col-span-1 flex flex-col">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="cc-text-h2 text-cc-ink">Target Project Blueprint</h4>
          <CcProvenanceChip value="proposed" />
        </div>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Recommended file structure for the side-by-side Node.js application.</p>
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
              className="flex items-center justify-between py-1 hover:bg-cc-surface rounded-cc-row px-1"
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
              <span className="cc-text-meta text-cc-ink-muted font-sans truncate ml-2 max-w-[120px]">{purposeStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
