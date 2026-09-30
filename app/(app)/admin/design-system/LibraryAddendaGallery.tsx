'use client';

import React, { useRef, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcDialog from '@/components/cc/Dialog';
import CcStateText from '@/components/cc/StateText';
import CcTable from '@/components/cc/Table';

/**
 * Block D, step D.5e — what waves 2 and 3 found missing in the library.
 *
 * A file of its own, like the galleries of D.5b–d. `tests/cc-library-addenda.spec.ts`
 * drives what is on it:
 *
 *   - the layer scale: a stand-in for the floating assistant button on
 *     `z-cc-float`, and a dialog that has to cover it;
 *   - a dialog that cannot be dismissed, only answered;
 *   - `CcStateText`, the state in words for what is not on a fixed list;
 *   - a table row that opens, with a control in its first cell that does not
 *     open it a second time;
 *   - `ref` on `CcButton`.
 */

const LAYERS = [
  { name: 'z-cc-popover', use: 'Why?, message popover, menus' },
  { name: 'z-cc-sticky', use: 'shell bar, sticky bars' },
  { name: 'z-cc-float', use: 'assistant button and panel, floating rail' },
  { name: 'z-cc-overlay', use: 'dialog, message box, side sheet, search' },
  { name: 'z-cc-toast', use: 'the one-line confirmation' },
];

export default function LibraryAddendaGallery() {
  const [floatShown, setFloatShown] = useState(false);
  const [layerDialog, setLayerDialog] = useState(false);
  const [mustAnswer, setMustAnswer] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [opened, setOpened] = useState(0);
  const [pressed, setPressed] = useState(0);
  const refTarget = useRef<HTMLButtonElement>(null);
  const [refSeen, setRefSeen] = useState<string | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CcCard title="Layers, bottom to top" count={LAYERS.length}>
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] font-medium text-cc-ink">
          {LAYERS.map((layer) => (
            <li key={layer.name}>
              <code className="font-cc-mono text-[12px]">{layer.name}</code>
              <span className="text-cc-ink-muted"> — {layer.use}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <CcButton variant="ghost" aria-pressed={floatShown} onClick={() => setFloatShown((v) => !v)}>
            {floatShown ? 'Hide the floating helper' : 'Show a floating helper'}
          </CcButton>
          <CcButton variant="ghost" onClick={() => setLayerDialog(true)}>
            Open a dialog over it
          </CcButton>
        </div>
        {floatShown ? (
          // A stand-in for the assistant button, on the layer it is meant to
          // use — bottom left, so the real one (bottom right) does not hide it.
          <div
            data-cc-z-probe=""
            className="fixed bottom-6 left-6 z-cc-float flex h-14 w-40 items-center justify-center rounded-cc-card bg-cc-overlay text-[13px] font-semibold text-cc-on-dark shadow-cc-dialog"
          >
            Floating helper
          </div>
        ) : null}
      </CcCard>

      <CcCard title="A question that has to be answered">
        <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink">
          <code className="font-cc-mono text-[12px]">{'dismissible={false}'}</code>: no close
          button, Escape does nothing, the dimmed page is not a way out. Only the answers close it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CcButton variant="ghost" onClick={() => setMustAnswer(true)}>
            Open the question
          </CcButton>
          {answer ? (
            <span data-cc-demo-answer="" className="text-[13px] font-medium text-cc-ink-muted">
              Answered: {answer}
            </span>
          ) : null}
        </div>
      </CcCard>

      <CcCard title="State text" count={5}>
        <div className="flex flex-col items-start gap-2">
          <CcStateText state="information" facet="Account">
            Active
          </CcStateText>
          <CcStateText state="warning" facet="Account">
            Setup unfinished
          </CcStateText>
          <CcStateText state="error" facet="Account">
            Suspended
          </CcStateText>
          <CcStateText state="neutral" facet="Account" hollow>
            Deleted
          </CcStateText>
          <CcStateText state="information" facet="Two-factor">
            Enabled
          </CcStateText>
        </div>
      </CcCard>

      <CcCard title="A row that opens" count={2}>
        <div data-cc-demo="row-open">
          <CcTable
            caption="Two rows that open, each with its own button"
            columns={[
              { key: 'name', label: 'Program' },
              { key: 'lines', label: 'Lines', numeric: true, width: '90px' },
            ]}
            rows={['Z_MM_PO_APPROVAL', 'Z_SD_PRICING'].map((name) => ({
              key: name,
              onOpen: () => setOpened((n) => n + 1),
              cells: {
                name: (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-cc-mono text-[12px]">{name}</span>
                    <CcButton variant="ghost" onClick={() => setPressed((n) => n + 1)}>
                      Rename
                    </CcButton>
                  </span>
                ),
                lines: name === 'Z_MM_PO_APPROVAL' ? '668' : '1,204',
              },
            }))}
          />
          <p className="mt-2 mb-0 text-[13px] font-medium text-cc-ink-muted" aria-live="polite">
            Rows opened: <span data-cc-demo-opened="">{opened}</span> · Rename pressed:{' '}
            <span data-cc-demo-pressed="">{pressed}</span>
          </p>
        </div>
      </CcCard>

      <CcCard title="A button with a ref">
        <div className="flex flex-wrap items-center gap-2">
          <CcButton variant="ghost" ref={refTarget} data-cc-demo="ref-target">
            Account menu
          </CcButton>
          <CcButton
            variant="ghost"
            onClick={() => {
              setRefSeen(refTarget.current?.tagName.toLowerCase() ?? 'nothing');
              refTarget.current?.focus();
            }}
          >
            Focus it through the ref
          </CcButton>
          {refSeen ? (
            <span data-cc-demo-ref="" className="text-[13px] font-medium text-cc-ink-muted">
              The ref holds a {refSeen}
            </span>
          ) : null}
        </div>
      </CcCard>

      <CcDialog
        open={layerDialog}
        title="Above every floating helper"
        lead="The dialog sits on z-cc-overlay; the helper on z-cc-float stays behind the dimmed page."
        onClose={() => setLayerDialog(false)}
        actions={
          <CcButton variant="primary" onClick={() => setLayerDialog(false)}>
            Done
          </CcButton>
        }
      >
        Nothing floats over a question the page is asking.
      </CcDialog>

      <CcDialog
        open={mustAnswer}
        dismissible={false}
        data-cc-demo="must-answer"
        title="Accept the updated terms to continue"
        lead="Version 2026-09 changes how shared links expire."
        actions={
          <>
            <CcButton
              variant="ghost"
              onClick={() => {
                setAnswer('declined');
                setMustAnswer(false);
              }}
            >
              Decline and sign out
            </CcButton>
            <CcButton
              variant="primary"
              onClick={() => {
                setAnswer('accepted');
                setMustAnswer(false);
              }}
            >
              Accept
            </CcButton>
          </>
        }
      >
        A link you share now expires after 30 days unless you renew it.
      </CcDialog>
    </div>
  );
}
