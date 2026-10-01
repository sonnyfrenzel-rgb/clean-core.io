'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import CcMessageStrip from '@/components/cc/MessageStrip';
import HandbookStage from '@/components/documentation/HandbookStage';
import HandbookDrawer from '@/components/documentation/HandbookDrawer';
import type { BpmnCanvasNode } from '@/components/process-map/BpmnCanvas';
import { anchorText } from '@/lib/bpmn/layout';
import { EARLY_END_WORD, type ProcessMapModel } from '@/lib/process-map';
import { UNANCHORED } from '@/lib/process-naming';
import { handbookFromData, type ProcessHandbookData } from '@/lib/process-handbook';

/**
 * The demo's Documentation stage in the canvas-first layout — the same stage a
 * real project shows (owner decision 01.10.2026, proposal B), over the map and
 * the handbook `lib/demo-project.ts` read from the example file on the server.
 *
 * What the demo leaves out is what needs a project: the code card (the source
 * is not shipped to the browser), editing, saving and the exports. The canvas
 * is the product's own `BpmnCanvas`, not a second renderer.
 */
const BpmnCanvas = dynamic(() => import('@/components/process-map/BpmnCanvas'), { ssr: false });

export default function DemoDocumentation({
  process,
}: {
  process: { model: ProcessMapModel; handbook: ProcessHandbookData } | null;
}) {
  const handbook = useMemo(() => (process ? handbookFromData(process.handbook) : null), [process]);
  const model = process?.model ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [plane, setPlane] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  const nodes = useMemo(
    () => new Map<string, BpmnCanvasNode>((model?.elements ?? []).map((e) => [e.id, {
      accessibleName: e.accessibleName,
      unanchored: e.anchor === null,
      unanchoredLabel: UNANCHORED,
      earlyLabel: e.early && !e.plainName ? EARLY_END_WORD : null,
      anchor: anchorText(e.anchor),
      fact: e.fact,
    }])),
    [model],
  );

  /** One move, like the stage: the element, and the level it is drawn on. */
  const select = useCallback((id: string | null) => {
    setSelected(id);
    if (!id || !model) return;
    const element = model.elements.find((e) => e.id === id);
    if (element) {
      setPlane(element.opensPlane ?? element.plane);
      setActive(id);
    }
  }, [model]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      setSelected(null);
      setFocusToken((token) => token + 1);
    }
    if ((event.key === 'Enter' || event.key === ' ') && active) {
      event.preventDefault();
      select(active);
    }
  }, [active, select, selected]);

  if (!model || !handbook) {
    return (
      <CcMessageStrip state="neutral" headline="The process could not be read from the example">
        A real run reads the process from your code and draws it here.
      </CcMessageStrip>
    );
  }

  return (
    <div data-demo-documentation="">
      <HandbookStage
        handbook={handbook}
        reading={false}
        model={model}
        selected={selected}
        onSelect={select}
        source={null}
        freshness="current"
        map={
          <BpmnCanvas
            xml={model.xml}
            label={`${model.processName}. ${model.overview}`}
            nodes={nodes}
            plane={plane}
            onPlaneChange={setPlane}
            active={active}
            onActivate={select}
            onActiveChange={setActive}
            focusToken={focusToken}
            onKeyDown={onKeyDown}
          />
        }
      />
      <HandbookDrawer
        handbook={handbook}
        reading={false}
        selectedChapter={selected ? (handbook.chapterOf.get(selected) ?? null) : null}
        onSelect={select}
        exportActions={null}
        exportNotes={
          <p className="m-0 cc-text-meta text-cc-ink-muted">
            The demo exports nothing. A real project exports this handbook as a PDF brief, a Confluence page and
            BPMN 2.0.
          </p>
        }
        exportPanel={
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            A real project offers three downloads here: the PDF brief (the process, the rules and the open questions
            with their lines, and the BPMN file beside it), the Confluence page of the stored documentation, and the
            BPMN 2.0 file for SAP Signavio or another modeller. Import into SAP Signavio or SAP Build has not been
            verified yet.
          </p>
        }
      />
    </div>
  );
}
