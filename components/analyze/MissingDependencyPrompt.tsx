'use client';

import { AlertTriangle, Upload, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import type { MissingDependency } from '@/lib/abap/class-model';

interface MissingDependencyPromptProps {
  missing: MissingDependency[];
  onUploadFile?: (file: File) => void;
}

/**
 * Inline prompt shown when the hierarchy resolver detects missing superclasses
 * or interfaces. Turns "silent degradation" into a solvable completeness question.
 */
export default function MissingDependencyPrompt({ missing, onUploadFile }: MissingDependencyPromptProps) {
  if (!missing || missing.length === 0) return null;

  const blockers = missing.filter(m => m.impact === 'blocks-resolution');
  const reducers = missing.filter(m => m.impact === 'reduces-confidence');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadFile) {
      onUploadFile(file);
    }
    // Reset input so re-uploads trigger onChange
    e.target.value = '';
  };

  return (
    <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-6 shadow-sm animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3 mb-4">
        <div className="bg-amber-100 p-2 rounded-xl shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h4 className="text-sm font-extrabold text-amber-900">Missing Dependencies Detected</h4>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            The code references {missing.length} class{missing.length > 1 ? 'es' : ''} or interface{missing.length > 1 ? 's' : ''} that 
            {missing.length > 1 ? ' were' : ' was'} not provided. Upload them to improve analysis accuracy.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {blockers.map((m, idx) => (
          <div key={`b-${idx}`} className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold text-red-800 truncate">{m.ref}</code>
                  <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase bg-red-100 text-red-600 border border-red-200 shrink-0">
                    Blocks Resolution
                  </span>
                </div>
                <p className="text-[10px] text-red-600 mt-0.5">
                  {m.kind === 'superclass' ? 'Superclass' : m.kind === 'interface' ? 'Interface' : m.kind === 'type-ref' ? 'Type reference' : 'Friend class'} referenced by <code className="font-mono">{m.referencedBy}</code>
                </p>
              </div>
            </div>
            {onUploadFile && (
              <label className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-500 cursor-pointer transition-colors text-[10px] font-bold uppercase tracking-wider shrink-0 active:scale-95">
                <Upload className="w-3 h-3" />
                Upload
                <input type="file" accept=".abap,.txt" className="hidden" onChange={handleFileSelect} />
              </label>
            )}
          </div>
        ))}

        {reducers.map((m, idx) => (
          <div key={`r-${idx}`} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold text-amber-800 truncate">{m.ref}</code>
                  <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase bg-amber-100 text-amber-600 border border-amber-200 shrink-0">
                    Reduces Confidence
                  </span>
                </div>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {m.kind === 'superclass' ? 'Superclass' : m.kind === 'interface' ? 'Interface' : m.kind === 'type-ref' ? 'Type reference' : 'Friend class'} referenced by <code className="font-mono">{m.referencedBy}</code>
                </p>
              </div>
            </div>
            {onUploadFile && (
              <label className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-500 cursor-pointer transition-colors text-[10px] font-bold uppercase tracking-wider shrink-0 active:scale-95">
                <Upload className="w-3 h-3" />
                Upload
                <input type="file" accept=".abap,.txt" className="hidden" onChange={handleFileSelect} />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
