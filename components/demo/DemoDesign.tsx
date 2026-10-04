'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, LayoutGrid, List } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import DesignCanvasStage, { type DesignDocSection } from '@/components/design/DesignCanvasStage';
import RoutingRationale from '@/components/design/RoutingRationale';
import RequirementsEntryCard from '@/components/requirements/RequirementsEntryCard';
import SectionBoundary from '@/components/SectionBoundary';
import { architectureOptionLabel } from '@/components/ArchitectSignOff';
import { architectureCanvasModel } from '@/lib/architecture-canvas';
import { ARCHITECTURE_OF_ROUTE } from '@/lib/design-recommendation';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { detectFindings } from '@/lib/abap/findings-detector';
import type { SupportFinding } from '@/lib/abap/class-model';
import type { DesignEvidence } from '@/hooks/useDesignEvidence';
import type { DemoProject } from '@/lib/demo-project';
import type { DemoDesignData } from '@/lib/demo-design';

/**
 * The Design stage of the demo — the same tool as a real project's
 * (`app/(app)/project/[projectId]/design/page.tsx`): `DesignCanvasStage`, the
 * canvas drawn by `architectureCanvasModel`, the contract and its alternatives,
 * the routing rationale. Fed from the server (`lib/demo-design.ts`) with the
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
  const [view, setView] = useState<'canvas' | 'list'>('canvas');

  const evidence: DesignEvidence = data
    ? { state: 'ready', contract: data.contract, contractSentence: null, findings: data.findings, findingsUnread: null }
    : { state: 'absent', reason: 'The demo could not build its architecture contract. Reload the page to try again.' };

  const model = useMemo(
    () =>
      data?.contract
        ? architectureCanvasModel({ contract: data.contract, findings: data.findings, deployment: demo.deployment })
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

  const code = data?.contract ? ARCHITECTURE_OF_ROUTE[data.contract.route.chosen] : null;
  const label = (code && architectureOptionLabel(code)) ?? code ?? 'the recommended route';
  const edition = demo.deployment === 'private' ? 'Private' : 'Public';

  const signOffPanel = (
    <div data-testid="demo-signoff" className="flex flex-col gap-4">
      <p className="m-0 cc-text-body text-cc-ink">
        On a real project this is where a person puts their name to the target — a self-declaration, not an
        organisational approval. In the demo it is a switch in this browser: no name is recorded, nothing is stored,
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
        On a real project a model writes the design document against this contract — {MODEL_SECTIONS.join(', ')}.
        A demo makes no model call, so there is none here, and writing a convincing one by hand is the one thing this
        product may never do. The canvas, the contract and the alternatives are what the deterministic engine
        produced; they carry the line numbers.
      </CcMessageStrip>
    </div>
  );

  return (
    <div data-testid="demo-design">
      <div className="mb-3 flex justify-end max-[719px]:hidden">
        <CcSegmentedControl
          label="View"
          value={view}
          onChange={setView}
          segments={[
            { value: 'canvas', label: 'Canvas', icon: <LayoutGrid size={14} aria-hidden={true} /> },
            { value: 'list', label: 'List', icon: <List size={14} aria-hidden={true} /> },
          ]}
        />
      </div>
      <DesignCanvasStage
        evidence={evidence}
        model={model}
        // The demo has no run, so nothing is bound: the edition is the demo's
        // assumption, said as one.
        targetLine={`${edition} Cloud Edition assumed · the demo has no run to bind it`}
        targetKpi={{ value: 'Not determined', sub: `${edition} Edition assumed` }}
        confidence={demo.design.confidenceScore}
        storedRoute={null}
        confirmed={confirmed ? { label, by: null, at: null } : null}
        stale={false}
        hasDocument={false}
        canSignOff={Boolean(code)}
        signOffPanel={signOffPanel}
        // The same question first as on a real project (owner 02.10.2026);
        // withdrawing stays in the panel behind "Change target".
        confirmTarget={code ? { label, onConfirm: () => onConfirm(true) } : undefined}
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
            />
          </SectionBoundary>
        }
        view={view}
        signOffWording={SIGN_OFF_WORDING}
      />
      {/* The requirements module (ADR-078): the demo opens its workspace read-only,
          with the engine's draft of the example and no model call. */}
      <div className="mt-8">
        <RequirementsEntryCard href="/demo/design/requirements" state={{ kind: 'not-started' }} demo />
      </div>
    </div>
  );
}
