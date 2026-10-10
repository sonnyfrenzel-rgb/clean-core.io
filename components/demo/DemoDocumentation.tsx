'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import CcMessageStrip from '@/components/cc/MessageStrip';
import HandbookStage from '@/components/documentation/HandbookStage';
import type { BpmnCanvasNode } from '@/components/process-map/BpmnCanvas';
import { phoneLayout } from '@/components/process-map/phone-layout';
import { anchorText } from '@/lib/bpmn/layout';
import { EARLY_END_WORD, type ProcessMapModel } from '@/lib/process-map';
import { UNANCHORED } from '@/lib/process-naming';
import { handbookFromData, type ProcessHandbookData } from '@/lib/process-handbook';
import BusinessGlance, { DirectWriteLevels } from '@/components/documentation/BusinessGlance';
import ProcessDocumentView, { DocumentChapterBar, ProcessDocumentAppendix } from '@/components/documentation/ProcessDocumentView';
import { RaciBlock } from '@/components/documentation/BusinessLayer';
import type { RaciDraft } from '@/components/documentation/RaciEditor';
import { layerWithRaciEdit, RACI_EDIT_FORMAT } from '@/lib/raci-edit';
import { stepName } from '@/lib/process-document-outline';
import type { PdStep } from '@/lib/process-document';
import type { ProcessStepRef, StoredBusinessLayer } from '@/lib/business-summary';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { raciEditedLine, wt } from '@/lib/workspace-messages';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import type { ProcessDocumentation } from '@/lib/process-documentation';
import type { ProcessDocument } from '@/lib/process-document';
import { businessCallouts, glanceHeadline, notDeterminedCallout, type GlanceGap } from '@/lib/business-summary';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { OpenQuestions } from '@/lib/open-questions';
import { DEMO_SUBJECT, DEMO_TITLE_PREFIX } from '@/lib/demo-marks';

/**
 * The demo's Documentation stage — the same stage a real project shows, in the
 * same order (owner 04.10.2026: the process description first), over the map,
 * the handbook and the description `lib/demo-project.ts` read from the example
 * file on the server.
 *
 * What the demo leaves out is what needs a project: the code card (the source
 * is not shipped to the browser), editing, saving, answering the open
 * questions and the exports. The canvas is the product's own `BpmnCanvas`,
 * not a second renderer.
 */
const BpmnCanvas = dynamic(() => import('@/components/process-map/BpmnCanvas'), { ssr: false });

/**
 * The demo's RACI (owner request 10.10.2026, the twin of the owner's editor):
 * the demo calls no model, so there is no proposal to start from — the visitor
 * starts from the steps of the process with no roles, and what they save is
 * kept in this page only, like the demo's other state. Nothing is stored.
 */
function DemoRaci({ document: doc }: { document: ProcessDocument }) {
  const process = useMemo<ProcessStepRef[]>(
    () => doc.overview.path
      .filter((e): e is PdStep => e.kind === 'step')
      .map((s) => ({ id: s.id, name: stepName(s), technicalName: s.technicalName, anchor: s.anchors[0] ?? null, provenance: 'reconstructed' as const })),
    [doc],
  );
  const empty = useMemo<StoredBusinessLayer>(
    () => ({ raci_matrix: process.map((s) => ({ stepId: s.id, r: '', a: '', c: '', i: '' })), sop_details: [] }),
    [process],
  );
  const [saved, setSaved] = useState<{ layer: StoredBusinessLayer; at: string } | null>(null);
  const onSave = useCallback(async (draft: RaciDraft): Promise<string | null> => {
    const at = new Date().toISOString();
    setSaved({
      layer: layerWithRaciEdit(empty, { formatVersion: RACI_EDIT_FORMAT, revision: 1, layerSha256: '0'.repeat(64), roles: draft.roles, steps: draft.steps, editedBy: 'you', editedAt: at }),
      at,
    });
    return null;
  }, [empty]);
  return (
    <div data-demo-raci="" className="mt-4 border-t border-cc-line pt-4">
      <RaciBlock
        layer={saved?.layer ?? empty}
        process={process}
        emptyLead={wt('doc.raciDemoLead')}
        editing={{
          canEdit: true,
          editedLine: saved ? raciEditedLine('you', 'in this browser') : null,
          onSave,
          note: wt('doc.raciDemoKept'),
        }}
      />
    </div>
  );
}

export default function DemoDocumentation({
  process,
  gaps,
  levels,
  businessLayer,
  source = null,
  openQuestions = null,
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
  /** The demo's open questions (ADR-081), read-only — the description's open questions section. */
  openQuestions?: OpenQuestions | null;
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
        <>
          <h2 id="demo-process-description" className="m-0 cc-text-h2 text-cc-ink">Process description</h2>
          <p className="m-0 mt-1 mb-3 max-w-3xl cc-text-cell text-cc-ink-muted">
            Written from the code when the stage opens, no model call. A project exports the same document; its appendix stands at the foot of this page. The demo exports nothing.
          </p>
          {/* The chapter bar, a direct child of the stage as on a project — in view down to the appendix. */}
          <DocumentChapterBar document={process.document} openQuestions={openQuestions} />
          <section aria-labelledby="demo-process-description" data-demo-process-document="" className="mb-8">
            <ProcessDocumentView
              document={process.document}
              // ADR-084: the title leads with the process — the demo's subject, then the program.
              projectName={`${DEMO_TITLE_PREFIX}${DEMO_SUBJECT}`}
              summary={glance ? <DirectWriteLevels callouts={glance.callouts} /> : null}
              openQuestions={openQuestions}
              rulesOutside={handbook.rulesOutside}
            />
          </section>
        </>
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
          {process?.document ? <DemoRaci document={process.document} /> : null}
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
      </section>

      {process?.document ? (
        <div className="mb-8">
          <ProcessDocumentAppendix document={process.document}>
            <ProcessDocumentationView appendix doc={process.engine} groups={process.document.appendix.groups} />
          </ProcessDocumentAppendix>
        </div>
      ) : null}
    </div>
  );
}
