'use client';

import { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import DesignCanvasStage, { type DesignDocSection } from '@/components/design/DesignCanvasStage';
import DesignConfirmTarget from '@/components/design/DesignConfirmTarget';
import {
  DesignCard,
  DesignChecklist,
  DesignDecisionBox,
  DesignObjectTable,
  DesignOptions,
  DesignSection,
  DesignTargetBoardView,
} from '@/components/design/DesignViewParts';
import AnswerCard from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import { useAroundTheMap } from '@/hooks/useAroundTheMap';
import { stageViewOf, useLocationSearch } from '@/lib/location-search';
import { PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import { NO_BUSINESS_QUESTIONS } from '@/lib/design-business-answers';
import { NO_DESIGN_DECISION, designAnchors, designObjects, designSignOffChecklist, designTargetBoard } from '@/lib/design-views';
import type { Project } from '@/lib/types';
import RoutingRationale from '@/components/design/RoutingRationale';
import RequirementsEntryCard from '@/components/requirements/RequirementsEntryCard';
import SectionBoundary from '@/components/SectionBoundary';
import { architectureOptionLabel } from '@/components/ArchitectSignOff';
import { architectureCanvasModel } from '@/lib/architecture-canvas';
import { APP_VERSION } from '@/lib/version';
import { TARGET_EDITION_NAMES } from '@/lib/sap-naming';
import { ARCHITECTURE_OF_ROUTE } from '@/lib/design-recommendation';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { detectFindings } from '@/lib/abap/findings-detector';
import type { SupportFinding } from '@/lib/abap/class-model';
import type { DesignEvidence } from '@/hooks/useDesignEvidence';
import type { DemoProject } from '@/lib/demo-project';
import type { DemoDesignData } from '@/lib/demo-design';

/**
 * The Design stage of the demo — the same tool as a real project's
 * (`app/(app)/project/[projectId]/design/page.tsx`), in its three views (ADR-130): Business today's process in
 * Analyze's phases (the demo answers no business question, so nothing is marked), IT the canvas drawn by
 * `architectureCanvasModel` with the contract, its alternatives and the object table, Management the checklist
 * before sign-off with *Confirm target*. Fed from the server (`lib/demo-design.ts`) with the
 * answers a real page reads from its two routes, so the picture, the route and
 * the alternatives tell the one story the contract tells.
 *
 * Two things differ, and both say so on screen:
 *
 *   - the design document is a model's work, and a demo makes no model call —
 *     its drawer says where the demo stops instead of showing a document;
 *   - the sign-off is a switch in this browser (`targetConfirmed`, read by the
 *     demo's Delivery stage), attributed to nobody and bound to no run.
 */

/** The nine sections a model writes on a real project, named so the reader knows what is missing. */
const MODEL_SECTIONS = [
  'Architecture overview',
  'Project blueprint',
  'API endpoints',
  'SAP standard API mapping',
  'Cloud services',
  'Data sync pattern',
  'Security hardening',
  'Roadmap',
  'Non-functional requirements',
];

const NO_SECTIONS: DesignDocSection[] = [];

const SIGN_OFF_WORDING = {
  open: 'Not confirmed. In the demo, confirming is a switch in this browser — no name is recorded, nothing is stored, and it binds no run.',
  confirmed: 'In this browser only: attributed to nobody, stored nowhere, bound to no run.',
  dialogLead:
    'On a real project this is a self-declaration by the signed-in account, bound to the signed run. In the demo it is a switch in this browser.',
};

export default function DemoDesign({
  demo,
  data,
  confirmed,
  onConfirm,
}: {
  demo: DemoProject;
  data: DemoDesignData | null;
  confirmed: boolean;
  onConfirm: (next: boolean) => void;
}) {
  // The view is the address's, never stored (ADR-105); the demo has no program decision (ADR-130 (2)).
  const view = stageViewOf(useLocationSearch());

  const evidence: DesignEvidence = data
    ? { state: 'ready', contract: data.contract, contractSentence: null, findings: data.findings, findingsUnread: null }
    : { state: 'absent', reason: 'The demo could not build its architecture contract. Reload the page to try again.' };

  const model = useMemo(
    () =>
      data?.contract
        ? architectureCanvasModel({ contract: data.contract, findings: data.findings, deployment: demo.deployment, engineVersion: APP_VERSION })
        : null,
    [data, demo.deployment],
  );

  // The same derivation the real page makes for its routing rationale.
  const findings = useMemo<SupportFinding[]>(() => {
    if (!data?.source) return [];
    const sources = [{ file: demo.sourceFile, content: data.source }];
    try {
      return detectFindings(buildClassModel(sources), sources);
    } catch {
      return [];
    }
  }, [data?.source, demo.sourceFile]);

  // Today's steps, read by the engine alone (`model: false`) from the demo source, at the demo's engine.
  const demoRun = useMemo(() => ({ activeRunId: 'demo', analyzerVersion: APP_VERSION }) as unknown as Project, []);
  const around = useAroundTheMap({ project: demoRun, projectId: 'demo', owner: false, model: false, source: data?.source ?? null });
  const board = designTargetBoard(around.text?.runs ?? [], [], NO_BUSINESS_QUESTIONS);
  const objects = designObjects(data?.findings ?? []);
  const sapObjects = objects.rows.length - objects.byLevel.none;

  const code = data?.contract ? ARCHITECTURE_OF_ROUTE[data.contract.route.chosen] : null;
  const label = (code && architectureOptionLabel(code)) ?? code ?? 'the recommended route';
  const edition = TARGET_EDITION_NAMES[demo.deployment === 'private' ? 'private' : 'public'];
  const targetLine = `${edition} assumed · the demo has no run to bind it`;
  const checklist = designSignOffChecklist({
    answers: NO_BUSINESS_QUESTIONS,
    designWritten: false,
    designStale: false,
    targetLine,
    targetBound: false,
    outside: false,
    confirmed,
  });
  const anchors = designAnchors(view, 'none', { open: 0, objects: objects.rows.length, steps: board.steps }).filter(
    (a) => a.key !== 'questions' && a.key !== 'next' && a.key !== 'requirements',
  );
  const decisionBox = <DesignDecisionBox decision={NO_DESIGN_DECISION} economicsHref="/demo/tco" managementHref={null} outside={false} />;

  const signOffPanel = (
    <div data-testid="demo-signoff" className="flex flex-col gap-4">
      <p className="m-0 cc-text-body text-cc-ink">
        On a real project this is where a person puts their name to the target: a self-declaration, not an
        organisational approval. In the demo it is a switch in this browser. No name is recorded, nothing is stored,
        and nothing downstream is unlocked by it.
      </p>
      <div>
        {/* Once pressed it steps back to ghost rather than a success colour —
            green says "proven" (§1.1), and a switch in a browser proves nothing. */}
        <CcButton
          variant={confirmed ? 'ghost' : 'primary'}
          density="cozy"
          data-testid="demo-confirm-target"
          aria-pressed={confirmed}
          onClick={() => onConfirm(!confirmed)}
          icon={confirmed ? <CheckCircle2 size={16} aria-hidden={true} /> : <Circle size={16} aria-hidden={true} />}
        >
          {confirmed ? 'Withdraw the confirmation' : `Confirm ${label}`}
        </CcButton>
      </div>
    </div>
  );

  const documentFallback = (
    <div data-testid="demo-design-document">
      <CcMessageStrip state="neutral" headline="The demo stops where the model begins.">
        On a real project a model writes the design document against this contract: {MODEL_SECTIONS.join(', ')}.
        The demo calls none and never fakes one; the canvas, the contract and the alternatives are the engine&apos;s,
        with their line numbers.
      </CcMessageStrip>
    </div>
  );

  const route = model?.route === 'side-by-side-cap' ? 'Side-by-side' : model ? 'In-app' : 'Not determined';
  const card =
    view === 'business'
      ? {
          question: 'What will the process look like after the change?',
          answer: 'Not designed. On a real project the business answers the questions the code raises, and each answer marks the steps it changes. The demo answers none.',
          condition: 'Today’s process, as Analyze reads it from the example.',
          facets: [
            { id: 'steps', label: 'Steps today', value: String(board.steps), note: 'Analyze’s map', href: '#design-board' },
            { id: 'phases', label: 'Phases', value: String(board.phases.length), note: 'as Analyze groups them' },
            { id: 'change', label: 'Change', value: '—', note: 'after the answers' },
            { id: 'go', label: 'Go', value: '—', note: 'after the answers' },
          ],
        }
      : view === 'it'
        ? {
            question: 'Where does it run, and on what?',
            answer: code ? `${label}.` : evidence.state === 'absent' ? evidence.reason : 'Not determined.',
            condition: `Target: ${targetLine}.`,
            facets: [
              {
                id: 'levels',
                label: 'Level D · C · B · none',
                value: `${objects.byLevel.D} · ${objects.byLevel.C} · ${objects.byLevel.B} · ${objects.byLevel.none}`,
                note: `of ${objects.rows.length} objects, SAP catalog`,
                href: '#design-objects',
              },
              { id: 'successors', label: 'Released successors', value: String(objects.withSuccessor), note: `of ${sapObjects} SAP objects, catalog`, href: '#design-objects' },
              { id: 'without', label: 'With no successor', value: String(objects.withoutSuccessor), note: 'wrapper or influence request', href: '#design-objects' },
              { id: 'route', label: 'Route', value: route, note: 'architecture contract' },
            ],
          }
        : {
            question: 'No decision yet · is the design ready to sign off?',
            answer: confirmed ? 'The target is confirmed, in this browser only.' : 'Not ready on a real project: the business answers and the written design are missing.',
            condition: `The demo designs a rebuild: ${label}.`,
            facets: [
              { id: 'decision', label: 'Decision and cost', value: 'Not taken yet', note: 'Economics prices, Management decides' },
              { id: 'target', label: 'Target', value: route, note: targetLine },
              { id: 'fit', label: 'Fit to clean core', value: `${objects.withSuccessor} of ${sapObjects}`, note: 'SAP objects on a released path' },
              { id: 'confirmed', label: 'Target confirmed', value: confirmed ? 'Here only' : 'No', note: 'a switch in this browser' },
            ],
          };

  return (
    <div data-testid="demo-design" data-design-view={view}>
      {/* The bar names the answer as its first section (G12), so it stands above it, as on the project's page. */}
      <PageAnchorBar anchors={anchors} label={PAGE_ANCHOR_LABELS.design} name="design-anchor" plural="design-anchors" />

      <AnswerCard
        id="design-answer"
        question={card.question}
        chips={<FamilyChip kind="engine" />}
        answer={card.answer}
        condition={card.condition}
        action={
          view === 'management' && code ? (
            <DesignConfirmTarget
              label={label}
              onConfirm={() => onConfirm(true)}
              signOffPanel={signOffPanel}
              locked={confirmed}
              disabled={false}
              dialogLead={SIGN_OFF_WORDING.dialogLead}
              chooseOther={false}
            />
          ) : (
            decisionBox
          )
        }
        actionNote={view === 'management' ? (confirmed ? SIGN_OFF_WORDING.confirmed : SIGN_OFF_WORDING.open) : undefined}
        facets={card.facets}
      />

      {view === 'business' ? (
        <DesignSection id="design-board" title="Today’s process" lead="As Analyze reads it. Nothing is marked: the demo answers no business question.">
          {around.state === 'reading' ? (
            <DesignCard>
              <CcSkeleton shape="text" label="today’s steps" count={4} />
            </DesignCard>
          ) : (
            <DesignTargetBoardView board={board} mode="today" />
          )}
        </DesignSection>
      ) : null}

      {view === 'it' ? (
        <>
          <div id="design-canvas" className="mt-6 scroll-mt-32">
            <DesignCanvasStage
              layout="it"
              evidence={evidence}
              model={model}
              // The demo has no run, so nothing is bound: the edition is the demo's
              // assumption, said as one.
              targetLine={targetLine}
              targetKpi={{ value: 'Not determined', sub: `${edition} assumed` }}
              confidence={demo.design.confidenceScore}
              storedRoute={null}
              confirmed={confirmed ? { label, by: null, at: null } : null}
              stale={false}
              hasDocument={false}
              canSignOff={Boolean(code)}
              signOffPanel={null}
              locked={confirmed}
              onRegenerate={() => undefined}
              regenerateDisabled
              regenerating={false}
              legacyCode={data?.source ?? ''}
              sections={NO_SECTIONS}
              documentFallback={documentFallback}
              documentNotice={null}
              routingRationale={
                <SectionBoundary name="Routing Rationale">
                  <RoutingRationale
                    extensibilityRoute={demo.design.recommendedRoute}
                    cleanCoreScore={demo.design.cleanCoreScore}
                    s4Deployment={demo.deployment}
                    findings={findings}
                    targetArchitecture={code}
                  />
                </SectionBoundary>
              }
              signOffWording={SIGN_OFF_WORDING}
            />
          </div>
          <DesignSection id="design-objects" title="Objects and Level" lead="Every object the example uses. Level and successor from the SAP catalog, never guessed.">
            <DesignObjectTable caption="Objects and their Level" rows={objects.rows} />
          </DesignSection>
          {/* The requirements module (ADR-078): the demo opens its workspace read-only,
              with the engine's draft of the example and no model call. */}
          <div className="mt-6">
            <RequirementsEntryCard href="/demo/design/requirements" state={{ kind: 'not-started' }} demo />
          </div>
        </>
      ) : null}

      {view === 'management' ? (
        <>
          <DesignSection id="design-checklist" title="Before sign-off" lead="What stands between the decision and the confirmed target.">
            <DesignChecklist rows={checklist.rows} />
          </DesignSection>
          <DesignSection id="design-options" title="The four options" lead="From Management. The demo has no decision; Design designs a rebuild meanwhile.">
            <DesignOptions decided="none" />
          </DesignSection>
        </>
      ) : null}
    </div>
  );
}
