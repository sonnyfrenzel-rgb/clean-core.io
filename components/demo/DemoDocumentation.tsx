'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import CcMessageStrip from '@/components/cc/MessageStrip';
import HandbookStage from '@/components/documentation/HandbookStage';
import HandbookDrawer from '@/components/documentation/HandbookDrawer';
import type { BpmnCanvasNode } from '@/components/process-map/BpmnCanvas';
import { phoneLayout } from '@/components/process-map/phone-layout';
import { anchorText } from '@/lib/bpmn/layout';
import { EARLY_END_WORD, type ProcessMapModel } from '@/lib/process-map';
import { UNANCHORED } from '@/lib/process-naming';
import { handbookFromData, type ProcessHandbookData } from '@/lib/process-handbook';
import BusinessGlance, { DirectWriteLevels } from '@/components/documentation/BusinessGlance';
import ProcessDocumentView, { ProcessDocumentAppendix } from '@/components/documentation/ProcessDocumentView';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { wt } from '@/lib/workspace-messages';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import type { ProcessDocumentation } from '@/lib/process-documentation';
import type { ProcessDocument } from '@/lib/process-document';
import { businessCallouts, glanceHeadline, notDeterminedCallout, type GlanceGap } from '@/lib/business-summary';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';

/**
 * The demo's Documentation stage — the same stage a real project shows, in the
 * same order (owner 04.10.2026: the process description first), over the map,
 * the handbook and the description `lib/demo-project.ts` read from the example
 * file on the server.
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
  businessLayer,
  source = null,
}: {
  process: { model: ProcessMapModel; handbook: ProcessHandbookData; document: ProcessDocument | null; engine: ProcessDocumentation } | null;
  /** The coverage sweep's constructs — the demo's own, read on the server. */
  gaps: GlanceGap[];
  /** Levels by `gradeKey(name, use)`, looked up on the server as a real project's route would. */
  levels: Record<string, CloudReadinessGrade>;
  /** What stands where a real project shows its business layer — the demo makes no model call. */
  businessLayer?: React.ReactNode;
  /**
   * The example the demo was built from, read on the server for this stage
   * only — what the phone's narrow map layout is laid out from.
   */
  source?: string | null;
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
  // On a phone, the same process laid out narrower (ADR-072, amended
  // 04.10.2026), from the example the server read for this stage; drawn only
  // when its process is byte for byte the one the demo shows.
  const phoneXml = useMemo(
    () => (model && source
      ? phoneLayout({ source, processName: model.processName, fileName: model.fileName, readingXml: model.xml, technical: false })
      : undefined),
    [model, source],
  );

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

  const glanceBlock = glance ? (
    <BusinessGlance
      headline={glance.headline}
      callouts={glance.callouts}
      notDetermined={glance.notDetermined}
      reading={false}
    />
  ) : null;

  /* The order a real project's stage reads in (owner 04.10.2026, ADR-077
     amended): the process description with what it does for the business as
     its opening, the business layer after it, the map to explore, the
     technical trace last. */
  return (
    <div data-demo-documentation="">
      {process?.document ? (
        <section aria-labelledby="demo-process-description" data-demo-process-document="" className="mb-8">
          <h2 id="demo-process-description" className="m-0 cc-text-h2 text-cc-ink">Process description</h2>
          <p className="m-0 mt-1 mb-3 max-w-3xl cc-text-cell text-cc-ink-muted">
            Written from the code when the stage opens, no model call. A project exports the same document; its appendix stands at the foot of this page. The demo exports nothing.
          </p>
          <ProcessDocumentView document={process.document} summary={glance ? <DirectWriteLevels callouts={glance.callouts} /> : null} />
        </section>
      ) : glanceBlock}

      {businessLayer ? (
        <section
          aria-labelledby="demo-business-layer"
          data-demo-business-layer=""
          className="mb-8 rounded-cc-card border border-cc-field-border bg-cc-surface p-4 shadow-cc md:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="demo-business-layer" className="m-0 cc-text-h2 text-cc-ink">{wt('doc.businessOfferTitle')}</h2>
            <CcProvenanceChip value="proposed" />
          </div>
          <p className="m-0 mt-1 mb-4 max-w-3xl cc-text-body text-cc-ink">{wt('doc.businessOfferLead')}</p>
          {businessLayer}
        </section>
      ) : null}

      <section aria-labelledby="demo-explore" data-documentation-explore="" className="mb-8">
        <h2 id="demo-explore" className="m-0 cc-text-h2 text-cc-ink">Explore the process</h2>
        <p className="m-0 mt-1 mb-3 max-w-3xl cc-text-cell text-cc-ink-muted">
          The process drawn from the code, with the chapter of each step beside it. Select a step to read its chapter.
        </p>
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
              phoneXml={phoneXml}
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
      </section>

      {process?.document ? (
        <div className="mb-8">
          <ProcessDocumentAppendix document={process.document}>
            <ProcessDocumentationView appendix doc={process.engine} />
          </ProcessDocumentAppendix>
        </div>
      ) : null}
    </div>
  );
}
