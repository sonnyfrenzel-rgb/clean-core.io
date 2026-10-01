'use client';

import React from 'react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcMessageStrip from '@/components/cc/MessageStrip';
import type { ImportOutcome } from '@/lib/bpmn/import';
import type { RevisionElementRef } from '@/lib/process-revisions';
import { editorImportCount, editorImportRead, editorMore, wt } from '@/lib/workspace-messages';

/**
 * What an imported file would change, before anything is kept — the diff
 * summary the owner asked for. Two ways out besides Cancel: open the file in
 * the editor to work on it, or save it as the next revision straight away.
 * Neither touches the reconstructed Ist.
 */

export interface EditorImportProps {
  open: boolean;
  fileName: string;
  /** Null while the file is being read. */
  outcome: ImportOutcome | null;
  saving: boolean;
  /** The answer of the store after "Save as revision", when there is one. */
  saved: string | null;
  onClose: () => void;
  onOpenInEditor: () => void;
  onSave: () => void;
}

const SHOWN = 6;

function Names({ heading, items, marker }: { heading: string; items: RevisionElementRef[]; marker: string }) {
  if (!items.length) return null;
  return (
    <div data-import-list={marker} className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-cc-ink">
        {heading} ({items.length})
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.id} className="text-[13px] font-medium text-cc-ink-muted">
            {item.kind}: {item.label}
            {item.anchor ? ` · ${item.anchor}` : ''}
          </li>
        ))}
        {items.length > SHOWN ? (
          <li className="text-[12px] font-medium text-cc-ink-muted">{editorMore(items.length - SHOWN)}</li>
        ) : null}
      </ul>
    </div>
  );
}

export default function EditorImport({ open, fileName, outcome, saving, saved, onClose, onOpenInEditor, onSave }: EditorImportProps) {
  const ok = outcome?.ok === true ? outcome : null;
  return (
    <CcDialog
      open={open}
      onClose={onClose}
      title={wt('editor.importTitle')}
      lead={wt('editor.importLead')}
      size="wide"
      data-editor-import={outcome === null ? 'reading' : outcome.ok ? 'ready' : 'refused'}
      actions={
        ok ? (
          <>
            <CcButton data-editor-import-cancel="" onClick={onClose}>
              {saved ? wt('editor.importClose') : wt('editor.importCancel')}
            </CcButton>
            <CcButton data-editor-import-open="" variant="secondary" onClick={onOpenInEditor}>
              {wt('editor.importOpen')}
            </CcButton>
            {saved ? null : (
              <CcButton data-editor-import-save="" variant="primary" busy={saving} onClick={onSave}>
                {wt('editor.importSave')}
              </CcButton>
            )}
          </>
        ) : (
          <CcButton data-editor-import-cancel="" onClick={onClose}>
            {wt('editor.importClose')}
          </CcButton>
        )
      }
    >
      {outcome === null ? (
        <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('editor.importReading')}</p>
      ) : !outcome.ok ? (
        <CcMessageStrip state="error" headline={wt('editor.importRefusedHeadline')}>
          <span data-editor-import-refusal={outcome.code}>{outcome.message}</span>
        </CcMessageStrip>
      ) : (
        <div data-editor-import-summary="" className="flex flex-col gap-3">
          <p className="m-0 text-[14px] font-semibold text-cc-ink">{editorImportRead(outcome.summary.flowNodes, fileName)}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] font-medium text-cc-ink">
            <li data-import-anchored={outcome.summary.anchored}>
              {editorImportCount(outcome.summary.anchored, wt('editor.importAnchorsKept'))}
            </li>
            <li data-import-outside={outcome.summary.outside}>
              {editorImportCount(outcome.summary.outside, wt('editor.importOutside'))}
            </li>
            {outcome.summary.matchedByName > 0 ? (
              <li data-import-by-name={outcome.summary.matchedByName}>
                {editorImportCount(outcome.summary.matchedByName, wt('editor.importByName'))}
              </li>
            ) : null}
          </ul>
          <p data-editor-import-diff="" className="m-0 text-[13px] font-medium text-cc-ink">
            {outcome.summary.diff.identical ? wt('editor.compareIdentical') : outcome.summary.diff.summary}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Names heading={wt('editor.compareAdded')} items={outcome.summary.diff.added} marker="added" />
            <Names heading={wt('editor.compareChanged')} items={outcome.summary.diff.changed} marker="changed" />
            <Names heading={wt('editor.compareRemoved')} items={outcome.summary.diff.removed} marker="removed" />
          </div>
          {outcome.summary.droppedClaims > 0 ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('editor.importClaims')}</p>
          ) : null}
          {outcome.summary.cleaned > 0 ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('editor.importCleaned')}</p>
          ) : null}
          {saved ? (
            <p data-editor-import-saved="" className="m-0 text-[13px] font-semibold text-cc-ink">{saved}</p>
          ) : null}
        </div>
      )}
    </CcDialog>
  );
}
