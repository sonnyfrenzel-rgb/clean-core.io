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
import BusinessGlance from '@/components/documentation/BusinessGlance';
import ProcessDocumentView from '@/components/documentation/ProcessDocumentView';
import type { ProcessDocument } from '@/lib/process-document';
import { businessCallouts, glanceHeadline, notDeterminedCallout, type GlanceGap } from '@/lib/business-summary';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';

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
  gaps,
  levels,
}: {
  process: { model: ProcessMapModel; handbook: ProcessHandbookData; document: ProcessDocument | null } | null;
  /** The coverage sweep's constructs — the demo's own, read on the server. */
  gaps: GlanceGap[];
  /** Levels by `gradeKey(name, use)`, looked up on the server as a real project's route would. */
  levels: Record<string, CloudReadinessGrade>;
}) {
  const handbook = useMemo(() => (process ? handbookFromData(process.handbook) : null), [process]);
  /** The same glance a real project opens with (owner 03.10.2026). */
  const glance = useMemo(() => (handbook ? {
    headline: glanceHeadline(handbook),
    callouts: businessCallouts(handbook, { status: 'ready', byKey: levels }),
    notDetermined: notDeterminedCallout(gaps),
  } : null), [handbook, gaps, levels]);
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
      {glance ? (
        <BusinessGlance
          headline={glance.headline}
          callouts={glance.callouts}
          notDetermined={glance.notDetermined}
          reading={false}
        />
      ) : null}
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
            controls
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
            BPMN 2.0 file for SAP Signavio or another modeller.
            Import into SAP Signavio or SAP Build has not been verified yet.
          </p>
        }
      />
      {/* The process description a real project writes when the stage opens
          (ADR-077) — the same builder over the example, without a narrative. */}
      {process?.document ? (
        <section aria-labelledby="demo-process-description" data-demo-process-document="" className="mt-8 mb-8">
          <h2 id="demo-process-description" className="m-0 cc-text-h2 text-cc-ink">Process description</h2>
          <p className="m-0 mt-1 mb-3 cc-text-cell text-cc-ink-muted">
            Written from the code when the stage opens, no model call: purpose, trigger, the steps, rules, exceptions,
            effects, integrations, controls and open questions. A real project exports it as a Confluence page, Markdown
            and Word; the demo exports nothing.
          </p>
          <ProcessDocumentView document={process.document} />
        </section>
      ) : null}
    </div>
  );
}
