'use client';

import { AlertTriangle, Upload, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATE_CLASSES } from '@/components/cc/state';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CC_BUTTON_BASE, CC_BUTTON_DENSITY_CLASSES, CC_BUTTON_VARIANT_CLASSES } from '@/components/cc/Button';
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

  const kindLabel = (m: MissingDependency) =>
    m.kind === 'superclass' ? 'Superclass' : m.kind === 'interface' ? 'Interface' : m.kind === 'type-ref' ? 'Type reference' : 'Friend class';

  const row = (m: MissingDependency, key: string, blocks: boolean) => {
    const state = STATE_CLASSES[blocks ? 'error' : 'warning'];
    const Icon = blocks ? ShieldAlert : AlertTriangle;
    return (
      <li key={key} className="flex items-center justify-between gap-3 rounded-cc-row border border-cc-line bg-cc-surface px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={cn('w-4 h-4 shrink-0', state.text)} aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-cc-mono cc-text-identifier text-cc-ink truncate">{m.ref}</code>
              <span className={cn('cc-text-meta', state.text)}>
                {blocks ? 'Blocks Resolution' : 'Reduces Confidence'}
              </span>
            </div>
            <p className="cc-text-cell text-cc-ink-muted mt-1">
              {kindLabel(m)} referenced by <code className="font-cc-mono">{m.referencedBy}</code>
            </p>
          </div>
        </div>
        {onUploadFile && (
          <label
            data-cc-button="ghost"
            className={cn(CC_BUTTON_BASE, CC_BUTTON_VARIANT_CLASSES.ghost, CC_BUTTON_DENSITY_CLASSES.compact, 'shrink-0 cursor-pointer focus-within:outline-2 focus-within:outline-cc-focus')}
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Upload
            <input type="file" accept=".abap,.txt" className="sr-only" onChange={handleFileSelect} />
          </label>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <CcMessageStrip state="warning" headline="Missing Dependencies Detected">
        The code references {missing.length} class{missing.length > 1 ? 'es' : ''} or interface{missing.length > 1 ? 's' : ''} that
        {missing.length > 1 ? ' were' : ' was'} not provided.
        {/* Only where this page can take them (ADR-081): a sentence that names
            an input the product does not have here is a promise it cannot keep. */}
        {onUploadFile ? ' Upload them to improve analysis accuracy.' : ' What they do is not determined.'}
      </CcMessageStrip>

      <ul className="space-y-2">
        {blockers.map((m, idx) => row(m, `b-${idx}`, true))}
        {reducers.map((m, idx) => row(m, `r-${idx}`, false))}
      </ul>
    </div>
  );
}
