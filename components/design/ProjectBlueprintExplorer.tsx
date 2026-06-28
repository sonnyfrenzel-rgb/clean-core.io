'use client';

import { Folder, FileCode } from 'lucide-react';

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
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm lg:col-span-1 flex flex-col">
      <div className="mb-4">
        <h4 className="font-extrabold text-slate-900 text-lg">Target Project Blueprint</h4>
        <p className="text-xs text-slate-400 mt-1">Recommended file structure for the side-by-side Node.js application.</p>
      </div>
      
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex-1 font-mono text-xs overflow-y-auto space-y-2.5 max-h-[360px]">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <Folder className="w-4 h-4 text-amber-500 fill-amber-500/10" />
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
              style={{ paddingLeft: `${depth * 14}px` }} 
              className="group flex items-center justify-between py-0.5 hover:bg-slate-100/50 rounded px-1 transition-colors"
              title={purposeStr}
            >
              <div className="flex items-center gap-2">
                {isFile ? (
                  <FileCode className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                )}
                <span className="text-slate-700 font-medium">{name}</span>
              </div>
              <span className="text-[9px] text-slate-400 group-hover:text-slate-500 transition-colors font-sans truncate ml-2 max-w-[120px]">{purposeStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
