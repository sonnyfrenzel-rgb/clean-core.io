'use client';

import React from 'react';
import { ArrowRight, ClipboardList, FileCode2, FileText, FlaskConical, Presentation, Workflow } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import FamilyChip from '@/components/family/FamilyChip';
import AnswerCard from '@/components/family/AnswerCard';
import { PHASES } from '@/lib/workflow-steps';
import { routeLabel } from '@/lib/sap-naming';
import { APP_VERSION } from '@/lib/version';
import { catalogForReader } from '@/lib/messages/demo';
import type { DemoProject } from '@/lib/demo-project';
import PageAnchorBar from '@/components/PageAnchorBar';
import { deliveryAnchors, PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import { NEVER_IN_PACK, proofRows, type DeliveryFacts } from '@/lib/delivery-view';
import { scoreWithBand } from '@/lib/clean-core-score';
import type { HandoverProject } from '@/lib/handover';
import {
  BeforeGoLive,
  DeliveryKeyValues,
  DeliverySection,
  NeverInPack,
  PackagePart,
  ProofTable,
  SideCard,
} from './DeliveryObjectPage';

/**
 * The demo's Delivery stage, in the form of the real one (ADR-132, the mock-up's *Demo project* state, L12). Every
 * figure is the engine run of `lib/demo-project.ts`; the choices are this browser's. The demo signs nothing, so the
 * page has no download, no export, no pack and no check — the capability is absent rather than disabled
 * (`tests/demo-project.spec.ts`). It says what a real handover of the program would hold.
 *
 * The facets are plain figures, not links: in a demo nothing they would jump to can be acted on, and a link named
 * "Audit pack" reads as an offer.
 */

export interface DemoDeliveryState {
  targetConfirmed: boolean;
}

const capitalise = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The proof table's statements without a project: every row reads "nothing in a demo". */
const DEMO_FACTS: DeliveryFacts = {
  program: '',
  blockers: [],
  exportedAt: null,
  stillNeeded: [],
  chain: [],
  phases: [],
  parts: { code: false, tests: false, documentation: false, bpmn: false, spec: false, slides: false },
};

export default function DemoDelivery({
  demo,
  state,
}: {
  demo: DemoProject;
  state: DemoDeliveryState;
}) {
  const route = routeLabel(demo.design.recommendedRoute);
  // Findings as Analyze counts them — one per pattern and object — not the
  // engine's occurrences, which are places in the code.
  const findings = demo.analyze.distinctFindings;
  const missing = demo.delivery.missing;
  const program = demo.sourceFile.replace(/\.[^.]+$/, '');

  return (
    <div data-demo-delivery="" className="flex flex-col">
      <AnswerCard
        id="demo-handover-answer"
        question={`Can ${program} be handed over?`}
        answer={`A demo hands nothing over. It is never signed and writes no code, so there is no package and no audit pack — this page shows what a real handover of ${program} would hold.`}
        condition="A pack is sealed against a signed run and carries the account that made it; a demo has neither. So nothing here can be downloaded, and no button pretends it could."
        action={
          state.targetConfirmed ? (
            <CcLinkButton href="#before-go-live" variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
              Go to the list
            </CcLinkButton>
          ) : (
            <CcLinkButton href="/demo/design" variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
              Open Design
            </CcLinkButton>
          )
        }
        actionNote={
          state.targetConfirmed
            ? 'The route is confirmed here, in this browser only. A real handover still needs everything listed below.'
            : 'Confirm the target architecture in Design: the chain cannot reach a handover while it is open.'
        }
        facets={[
          { id: 'on-record', label: 'On record', value: 'None in a demo', note: 'A demo records nothing that a handover could rest on.' },
          { id: 'package', label: 'The package', value: 'None in a demo', note: 'The demo makes no model call and writes no code.' },
          { id: 'tests', label: 'Tests', value: 'None in a demo', note: 'Nothing in a demo runs.' },
          { id: 'audit-pack', label: 'Audit pack', value: 'Not available', note: 'Sealed only against a signed run — a demo has none.' },
        ]}
      />

      {/* The tool's anchor bar, as on a project (ADR-126 (3)); no import and no timeline in a demo. */}
      <PageAnchorBar
        anchors={deliveryAnchors({ blocking: missing.length, parts: null, events: null })}
        label={PAGE_ANCHOR_LABELS.delivery}
        name="delivery-anchor"
        plural="delivery-anchors"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CcMessageStrip state="information" headline="No pack leaves this screen.">
            <span data-testid="demo-no-pack">
              There is no download here, and there is no button that would make one. An audit pack is sealed against a
              signed run and carries the account that made it; a demo has neither, so a pack out of the demo would be a
              document that looks like evidence and is not. That is the one failure mode this product cannot afford, so
              the capability is absent rather than disabled.
            </span>
          </CcMessageStrip>

          <DeliverySection
            id="before-go-live"
            title="Before go-live"
            lead="In a real project this list says what blocks the handover, what travels open but named, and what stays yours."
          >
            <div data-testid="demo-missing">
              <BeforeGoLive
                blocking={missing.map((m, i) => {
                  const stage = demo.delivery.missingAt[i];
                  const where = PHASES.find((p) => p.key === stage)?.label ?? 'Delivery';
                  return { key: `${i}`, text: capitalise(m), where, href: stage && stage !== 'delivery' ? `/demo/${stage}` : null };
                })}
                travels={[]}
                empty="Nothing."
                yours={
                  <>
                    <span className="font-semibold">Yours, in your system:</span> activation, transport and go-live, on a real
                    project. Nothing here can be handed over.
                  </>
                }
              />
            </div>
          </DeliverySection>

          <DeliverySection id="in-the-package" title="In the package" lead="What a real package holds — none of it exists in a demo.">
            <ul className="m-0 list-none p-0">
              {[
                { id: 'code', icon: <FileCode2 size={18} aria-hidden="true" />, name: 'Code for abapGit', sub: `${route} · the engine’s frame, a model’s function bodies`, body: 'On a real project the engine writes the frame of every object and a model the function bodies between its markers.' },
                { id: 'tests', icon: <FlaskConical size={18} aria-hidden="true" />, name: 'Tests', sub: 'Cases from the original’s branches', body: 'On a real project they run in your SAP system or the sandbox, and the result is recorded.' },
                { id: 'documentation', icon: <FileText size={18} aria-hidden="true" />, name: 'Documentation', sub: 'The process, the business documentation, the developer guide', body: 'Written in Documentation on a real project.' },
                { id: 'bpmn', icon: <Workflow size={18} aria-hidden="true" />, name: 'Process as BPMN 2.0', sub: 'Reconstructed from the code a signed run read', body: 'A demo has no signed run.' },
                { id: 'spec', icon: <ClipboardList size={18} aria-hidden="true" />, name: 'Requirements specification', sub: 'Drafted from the code, with your answers from Design', body: 'Written in Design on a real project.' },
                { id: 'slides', icon: <Presentation size={18} aria-hidden="true" />, name: 'Stakeholder slides', sub: 'Seven slides from a signed run, no savings figure', body: 'A demo has no signed run.' },
              ].map((p) => (
                <PackagePart key={p.id} id={p.id} icon={p.icon} name={p.name} sub={p.sub} present={false} chips={<FamilyChip kind="not-determined" note="none in a demo" />} state="">
                  <p className="m-0 cc-text-cell text-cc-ink-muted">{p.body}</p>
                </PackagePart>
              ))}
            </ul>
          </DeliverySection>

          <DeliverySection id="proof" title="What is proven, and what is not" lead="On a real project the server signs what it computed itself; a person’s statements are sealed as their word; what a model wrote is not signed.">
            <ProofTable rows={proofRows({} as HandoverProject, DEMO_FACTS)} demo />
          </DeliverySection>

          <DeliverySection id="audit-pack" title="Audit pack" lead="No pack leaves a demo.">
            <DeliveryKeyValues
              rows={[
                { k: 'Input fingerprint', v: 'None — a demo is not signed' },
                { k: 'Design target', v: state.targetConfirmed ? `${route} — Confirmed here, in this browser only` : `${route} — Pending sign-off` },
                { k: 'Engine', v: `${APP_VERSION} · catalog ${catalogForReader(demo.catalogVersion)}` },
                { k: 'Model', v: 'No model — deterministic evidence only' },
              ]}
            />
            <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
              On a real project the pack is sealed by the server against the signed run, and anyone can check it with the
              offline verifier.
            </p>
          </DeliverySection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Status and limits">
          <SideCard title="Built on">
            <DeliveryKeyValues
              rows={[
                { k: 'The demo example', v: `${demo.sourceFile}, ${demo.totalLines} lines — the engine’s run, not signed` },
                { k: 'Findings', v: `${plural(findings, 'finding')} in the code · Clean Core Score ${scoreWithBand(demo.analyze.cleanCoreScore)}` },
              ]}
            />
          </SideCard>
          <SideCard title="Never in the signed pack">
            <NeverInPack items={NEVER_IN_PACK} />
          </SideCard>
        </aside>
      </div>
    </div>
  );
}
