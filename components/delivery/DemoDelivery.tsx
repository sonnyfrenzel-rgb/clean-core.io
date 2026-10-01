'use client';

import React from 'react';
import { ArrowRight, BookOpen, Briefcase, Eye, Package } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTextarea from '@/components/cc/Textarea';
import { NOT_SIGNED, SIGNED_COVERS } from '@/lib/handover';
import { PHASES } from '@/lib/workflow-steps';
import { APP_VERSION } from '@/lib/version';
import { DEMO_RESET_LABEL } from '@/lib/demo-marks';
import { catalogForReader } from '@/lib/messages/demo';
import type { DemoProject } from '@/lib/demo-project';
import { STATE_CLASSES } from '@/components/cc/state';
import { cn } from '@/lib/utils';
import {
  DeliveryAnchorBar,
  DeliveryArtefactCard,
  DeliveryChainBoxes,
  DeliveryFacets,
  DeliveryKeyValues,
  DeliveryMetaline,
  DeliveryNextStep,
  DeliverySection,
  DeliveryStatusLine,
  DeliveryStillNeeded,
} from './DeliveryObjectPage';
import { scoreWithBand } from '@/lib/clean-core-score';

/**
 * The demo's Delivery stage, in the object-page form of the real one (owner
 * decision 01.10.2026, proposal A). Every figure is the engine run of
 * `lib/demo-project.ts`; the choices are this browser's. The demo signs
 * nothing, so the page has no download, no export and no pack — the
 * capability is absent rather than disabled (`tests/demo-project.spec.ts`).
 */

export interface DemoDeliveryState {
  targetConfirmed: boolean;
  decision: 'undecided' | 'proceed' | 'park';
  decisionNote: string;
}

const capitalise = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DemoDelivery({
  demo,
  state,
  patch,
}: {
  demo: DemoProject;
  state: DemoDeliveryState;
  patch: (n: Partial<DemoDeliveryState>) => void;
}) {
  const route = demo.design.recommendedRoute;
  const findings = demo.analyze.findings.length;
  const missing = demo.delivery.missing;
  const ran = demo.testing.verdicts.passed + demo.testing.verdicts.failed;

  return (
    <div data-demo-delivery="" className="flex flex-col">
      <div className="-mt-4">
        <DeliveryMetaline
          items={[
            { key: 'file', value: demo.sourceFile },
            { key: 'lines', value: `${demo.totalLines} lines` },
            { key: 'catalog', label: 'catalog', value: catalogForReader(demo.catalogVersion) },
            { key: 'snapshot', label: 'snapshot', value: demo.catalogSnapshot },
            { key: 'engine', label: 'engine', value: APP_VERSION },
          ]}
        />
      </div>

      <div className="mt-4">
        <DeliveryFacets
          facets={[
            {
              key: 'handover',
              label: 'Handover',
              value: 'Not handed over',
              sub: `${plural(missing.length, 'thing')} a handover still needs`,
              provenance: 'not-determined',
              basis: 'A demo is never signed, so nothing in it can be handed over.',
            },
            {
              key: 'audit-pack',
              label: 'Audit pack',
              value: 'Not available',
              sub: 'Sealed only against a signed run — a demo has none',
              provenance: 'not-determined',
              basis: 'An audit pack is sealed against a signed run and carries the account that made it.',
            },
            {
              key: 'decision',
              label: 'Architecture decision',
              value: state.targetConfirmed ? 'Confirmed here' : 'Pending',
              sub: state.targetConfirmed ? `${route} · in this browser only` : `${route} · sign-off not recorded`,
              provenance: state.targetConfirmed ? 'confirmed' : 'proposed',
              basis: state.targetConfirmed
                ? 'Ticked on the Design stage of this demo. It stays in this browser and is attributed to nobody.'
                : 'The engine recommends this route; nobody has confirmed it.',
            },
            {
              key: 'quality',
              label: 'Quality',
              value: ran > 0 ? 'Run' : 'Not run',
              sub: ran > 0 ? `${ran} of ${demo.testing.verdicts.total} with a verdict` : 'Nothing in this demo has run',
              provenance: 'not-determined',
              basis: 'The demo generates no test suite and runs nothing.',
            },
          ]}
        />
        <DeliveryStatusLine
          items={[
            { key: 'run', label: 'Run', value: 'not signed', tone: 'neutral' },
            {
              key: 'decision',
              label: 'Decision',
              value: state.decision === 'undecided' ? 'not recorded' : 'in this browser only',
              tone: 'neutral',
            },
            { key: 'receipts', label: 'Receipts', value: 'none', tone: 'neutral' },
            { key: 'engine', label: 'Engine', value: `${APP_VERSION} · no model`, tone: 'information' },
          ]}
        />
      </div>

      <DeliveryAnchorBar
        items={[
          { id: 'evidence-chain', label: 'Evidence chain' },
          { id: 'still-needed', label: 'Still needed', count: missing.length },
          { id: 'artefacts', label: 'Artefacts', count: 4 },
        ]}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {state.targetConfirmed ? (
            <DeliveryNextStep
              kind="open"
              titleId="demo-handover-next-title"
              headline="Record a decision"
              reason="The route is confirmed here. A real handover still needs everything listed below."
              action={
                <CcLinkButton href="#record-decision" variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
                  Go to the decision
                </CcLinkButton>
              }
            />
          ) : (
            <DeliveryNextStep
              kind="open"
              titleId="demo-handover-next-title"
              headline="Confirm the target architecture in Design"
              reason="The chain cannot reach a handover while the decision is open."
              action={
                <CcLinkButton href="/demo/design" variant="primary" icon={<ArrowRight size={14} aria-hidden="true" />}>
                  Open Design
                </CcLinkButton>
              }
            />
          )}

          <CcMessageStrip state="information" headline="No pack leaves this screen.">
            <span data-testid="demo-no-pack">
              There is no download here, and there is no button that would make one. An audit pack is sealed against a
              signed run and carries the account that made it; a demo has neither, so a pack out of the demo would be a
              document that looks like evidence and is not. That is the one failure mode this product cannot afford, so
              the capability is absent rather than disabled.
            </span>
          </CcMessageStrip>

          <DeliverySection id="evidence-chain" title="Evidence chain" meta="requirement → decision → receipt → artefact">
            <DeliveryChainBoxes
              boxes={[
                {
                  key: 'requirement',
                  label: 'Requirement',
                  title: `${plural(findings, 'finding')} in the code`,
                  sub: `Read by the engine · Clean Core Score ${scoreWithBand(demo.analyze.cleanCoreScore)} · no signed run`,
                  provenance: 'reconstructed',
                  provenanceNote: null,
                },
                {
                  key: 'decision',
                  label: 'Decision',
                  title: route,
                  sub: state.targetConfirmed ? 'Confirmed in this browser — attributed to nobody' : 'Recommended, not confirmed',
                  provenance: 'not-determined',
                  provenanceNote: state.targetConfirmed ? 'this browser only' : 'open',
                },
                {
                  key: 'receipt',
                  label: 'Receipt',
                  title: 'Test run',
                  sub: 'No run on record',
                  provenance: 'not-determined',
                  provenanceNote: 'none',
                },
                {
                  key: 'delivery',
                  label: 'Delivery artefact',
                  title: 'Handover package',
                  sub: 'Not built — nothing to seal',
                  provenance: 'not-determined',
                  provenanceNote: 'none',
                },
              ]}
            />
          </DeliverySection>

          <DeliverySection id="still-needed" title="What a real handover still needs" meta={String(missing.length)}>
            <div data-testid="demo-missing">
              <DeliveryStillNeeded
                empty="Nothing."
                items={missing.map((m, i) => {
                  const stage = demo.delivery.missingAt[i];
                  const where = PHASES.find((p) => p.key === stage)?.label ?? 'Delivery';
                  return { key: `${i}`, text: capitalise(m), where, href: stage && stage !== 'delivery' ? `/demo/${stage}` : null };
                })}
              />
            </div>
          </DeliverySection>

          <DeliverySection id="artefacts" title="Artefacts" meta="made on a real project only">
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              <DeliveryArtefactCard
                icon={<Package size={18} aria-hidden="true" />}
                title="Delivery bundle"
                chip={<CcProvenanceChip value="not-determined" />}
                detail="Code, tests and documentation as one ZIP — built from the model’s code on a real project. The demo has none."
              />
              <DeliveryArtefactCard
                icon={<Eye size={18} aria-hidden="true" />}
                title="Stakeholder briefing"
                chip={<CcProvenanceChip value="not-determined" />}
                detail="Seven slides from a signed run and the engine’s findings, no savings figure. A demo has no signed run."
              />
              <DeliveryArtefactCard
                icon={<Briefcase size={18} aria-hidden="true" />}
                title="Business documentation"
                chip={<CcProvenanceChip value="not-determined" />}
                detail="Operating procedures, roles and controls — written on the Documentation stage of a real project."
              />
              <DeliveryArtefactCard
                icon={<BookOpen size={18} aria-hidden="true" />}
                title="Developer guide"
                detail="General rules for the chosen route — a fixed template, given with a real project."
              />
            </ul>
          </DeliverySection>

          <div id="record-decision" className="scroll-mt-32">
            <CcCard level={2} title="Record a decision">
              <p className="m-0 cc-text-body text-cc-ink-muted">
                Try the shape of it. The choice and the note stay in this browser, they are attributed to nobody, and{' '}
                {DEMO_RESET_LABEL} removes them.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['proceed', 'park'] as const).map((d) => (
                  <CcButton
                    key={d}
                    variant={state.decision === d ? 'dark' : 'ghost'}
                    density="cozy"
                    data-testid={`demo-decision-${d}`}
                    aria-pressed={state.decision === d}
                    onClick={() => patch({ decision: state.decision === d ? 'undecided' : d })}
                  >
                    {d === 'proceed' ? 'Proceed with the route' : 'Park it for now'}
                  </CcButton>
                ))}
              </div>
              <div className="mt-4" data-testid="demo-decision-note">
                <CcTextarea
                  label="Why"
                  rows={3}
                  value={state.decisionNote}
                  onChange={(v) => patch({ decisionNote: v })}
                  placeholder="The reasoning a colleague would need in six months."
                />
              </div>
            </CcCard>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Audit pack and signature">
          <DeliverySection
            title="Audit pack"
            meta={
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-px text-[11px] font-semibold leading-4',
                  STATE_CLASSES.warning.bg,
                  STATE_CLASSES.warning.border,
                  STATE_CLASSES.warning.text,
                )}
              >
                Not available
              </span>
            }
          >
            <DeliveryKeyValues
              rows={[
                { k: 'Input fingerprint', v: 'None — a demo is not signed' },
                { k: 'Decision', v: state.targetConfirmed ? 'Confirmed in this browser only' : 'Pending sign-off' },
                { k: 'Engine', v: APP_VERSION },
                { k: 'Model', v: 'No model — deterministic evidence only' },
              ]}
            />
            <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
              On a real project the pack is sealed by the server against the signed run, and anyone can check it with the
              offline verifier.
            </p>
          </DeliverySection>

          <DeliverySection title="What a signature covers">
            <p className="m-0 cc-text-label text-cc-ink-muted">Signed</p>
            <ul className="cc-text-cell mt-1 list-disc pl-4 text-cc-ink">
              {SIGNED_COVERS.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <p className="m-0 mt-3 cc-text-label text-cc-ink-muted">Not signed</p>
            <ul className="cc-text-cell mt-1 list-disc pl-4 text-cc-ink">
              {NOT_SIGNED.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </DeliverySection>
        </aside>
      </div>
    </div>
  );
}
