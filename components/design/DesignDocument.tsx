'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowRight, Boxes, CalendarRange, ChevronDown, Plug, ShieldCheck } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import ProjectBlueprintExplorer from '@/components/design/ProjectBlueprintExplorer';
import ApiEndpointsCatalog from '@/components/design/ApiEndpointsCatalog';
import CloudServiceIntegrations from '@/components/design/CloudServiceIntegrations';
import ApiBusinessHubMapping from '@/components/design/ApiBusinessHubMapping';
import SecurityHardeningChecklist from '@/components/design/SecurityHardeningChecklist';
import ModernizationRoadmap from '@/components/design/ModernizationRoadmap';
import SectionBoundary from '@/components/SectionBoundary';
import type { DesignData } from '@/lib/types';
import type { SupportFinding } from '@/lib/abap/class-model';
import { BTP, sapNamesForDisplay } from '@/lib/sap-naming';
import { cn } from '@/lib/utils';

/**
 * The model's solution design as a document a reader can find their way
 * around (owner 03.10.2026: "more visual and appealing, so I can find my way
 * around" — nine equal cards were a wall). The data is the stored design,
 * unchanged; this is how it is shown:
 *
 *   1. an overview first — the route with its reason, the approach in full, a
 *      small picture of the target (built from the stored services, endpoints
 *      and data-sync pattern, not drawn by a model) and the headline facts;
 *   2. four groups by question instead of nine cards — what we build, how it
 *      connects to SAP, how it is secured and run, when — the first open, the
 *      rest folded, with a sticky section nav;
 *   3. "Model proposal" once per section, not on every card.
 *
 * The non-functional requirements have their own section since ADR-074; the
 * document links there instead of repeating them.
 */

export type DesignGroupKey = 'build' | 'connect' | 'secure' | 'when';

export interface DesignDocumentProps {
  design: DesignData;
  /** Why this route, in one sentence, and where the sentence comes from. `null` when nothing on record says it. */
  routeReason: { text: string; source: string } | null;
  /** The engine's clean core level per object (the findings route), for the API mapping. */
  levels: readonly { objectName: string | null; level: string | null }[] | null;
  /** The constructs of the code, for the security checklist's links. */
  findings: SupportFinding[];
  /** How many topics the model proposed for the non-functional requirements. */
  nfrTopics: number;
  /** Shown above the overview — the banner of a run made before the current evidence model. */
  banner?: React.ReactNode;
}

type Service = DesignData['cloudServices'][number];

const CONNECT = /destination|connectivity|cloud connector|event|mesh|integration suite|messag|queue|api management|gateway/i;
const IDENTITY = /xsuaa|trust|identity|authori[sz]ation|authenticat|\biam\b|\bias\b|role/i;
const DATA = /postgre|hana cloud|database|\bdb\b|persist|object store|storage|document|redis|cache|table/i;

/** The services of the design, sorted by the part of the picture they belong to. */
export function servicesByPart(services: readonly Service[]): { connect: Service[]; identity: Service[]; data: Service[] } {
  const out = { connect: [] as Service[], identity: [] as Service[], data: [] as Service[] };
  for (const s of services) {
    const name = s.serviceName || '';
    if (CONNECT.test(name)) out.connect.push(s);
    else if (IDENTITY.test(name)) out.identity.push(s);
    else out.data.push(s);
  }
  // A service named for neither connectivity nor identity is drawn with the
  // data and services; only those named for data stay first.
  out.data.sort((a, b) => Number(DATA.test(b.serviceName)) - Number(DATA.test(a.serviceName)));
  return out;
}

/** Whether the design is written for the side-by-side route (CAP on SAP BTP) rather than in-app RAP. */
export function isSideBySideDesign(design: DesignData): boolean {
  const framework = design.architectureOverview.nodeFramework || '';
  const runtime = design.architectureOverview.runtimePlatform || '';
  if (/\bRAP\b/.test(framework)) return false;
  return /\bCAP\b|BTP|side-by-side/i.test(`${framework} ${runtime}`);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Chips({ items, max = 4 }: { items: string[]; max?: number }) {
  if (!items.length) return null;
  const shown = items.slice(0, max);
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {shown.map((item) => (
        <span key={item} className="max-w-full rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[12px] font-semibold text-cc-ink [overflow-wrap:anywhere]">
          {item}
        </span>
      ))}
      {items.length > max ? <span className="text-[12px] text-cc-ink-muted">+{items.length - max} more</span> : null}
    </span>
  );
}

function Node({ id, title, sub, children, emphasis = false }: { id: string; title: string; sub?: string; children?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div
      role="group"
      aria-label={title}
      data-design-diagram-node={id}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-cc-row border bg-cc-surface p-3',
        emphasis ? 'border-cc-ink border-2' : 'border-cc-line',
      )}
    >
      <b className="text-[14px] font-bold leading-snug text-cc-ink [overflow-wrap:anywhere]">{title}</b>
      {sub ? <span className="text-[12px] text-cc-ink-muted [overflow-wrap:anywhere]">{sub}</span> : null}
      {children}
    </div>
  );
}

function Link({ label }: { label: string }) {
  return (
    <div data-design-diagram-link="" className="flex min-w-0 items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold text-cc-ink-muted min-[1000px]:flex-col min-[1000px]:w-24">
      <ArrowDown size={16} aria-hidden={true} className="shrink-0 min-[1000px]:hidden" />
      <ArrowRight size={16} aria-hidden={true} className="hidden shrink-0 min-[1000px]:block" />
      <span className="[overflow-wrap:anywhere]">{label}</span>
    </div>
  );
}

/** The target in four boxes and three links — read from the stored design, never drawn by the model. */
function TargetDiagram({ design, sideBySide }: { design: DesignData; sideBySide: boolean }) {
  const parts = servicesByPart(design.cloudServices);
  const apis = [...new Set((design.sapStandardApiMapping ?? []).map((m) => m.sapStandardApiName).filter(Boolean))];
  const endpoints = design.nodeAppBlueprint.apiEndpoints.length;
  const files = design.nodeAppBlueprint.projectStructure.length;
  // The design's own platform, or nothing: no default stands in for a missing one.
  const runtime = design.architectureOverview.runtimePlatform ? sapNamesForDisplay(design.architectureOverview.runtimePlatform) : undefined;
  const names = (list: Service[]) => list.map((s) => s.serviceName);
  return (
    <figure data-design-diagram="" className="m-0 flex min-w-0 flex-col gap-2">
      <figcaption className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">Target at a glance</figcaption>
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-1 min-[1000px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Node id="core" title="SAP S/4HANA" sub={sideBySide ? 'The core stays standard' : 'Standard objects, extended in place'}>
          {apis.length ? (
            <>
              <span className="text-[12px] text-cc-ink">{plural(apis.length, 'released API', 'released APIs')}</span>
              <Chips items={apis} max={3} />
            </>
          ) : (
            <span className="text-[12px] text-cc-ink-muted">No released API named in this design</span>
          )}
        </Node>
        <Link label={design.dataSync.patternName || 'Data sync'} />
        <Node id="connect" title={sideBySide ? 'Connectivity' : 'Released APIs and extension points'}>
          {parts.connect.length ? <Chips items={names(parts.connect)} /> : <span className="text-[12px] text-cc-ink-muted">Released APIs, called directly</span>}
        </Node>
        <Link label="API calls" />
        <Node
          id="app"
          emphasis
          title={sideBySide ? 'CAP application' : 'RAP extension in the core'}
          sub={runtime}
        >
          <span className="text-[12px] text-cc-ink">
            {plural(endpoints, 'endpoint', 'endpoints')} · {plural(files, 'file', 'files')}
          </span>
          {parts.identity.length ? (
            <>
              <span className="text-[12px] text-cc-ink-muted">Secured by</span>
              <Chips items={names(parts.identity)} max={2} />
            </>
          ) : null}
        </Node>
        <Link label="reads and writes" />
        <Node id="data" title={sideBySide ? 'Data and services' : 'Services in the core'}>
          {parts.data.length ? <Chips items={names(parts.data)} /> : <span className="text-[12px] text-cc-ink-muted">No own persistence proposed</span>}
        </Node>
      </div>
    </figure>
  );
}

function NotWritten({ what }: { what: string }) {
  return (
    <p data-design-not-written={what} className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
      {what}: not written in this design. Regenerate to have the model write it against the contract.
    </p>
  );
}

const GROUPS: { key: DesignGroupKey; title: string; line: string; icon: typeof Boxes }[] = [
  { key: 'build', title: 'What we build', line: 'The files of the target project, the API it offers and the platform services it uses.', icon: Boxes },
  { key: 'connect', title: 'How it connects to SAP', line: 'Which released SAP API replaces each object the code uses today, and how the data stays in step.', icon: Plug },
  { key: 'secure', title: 'How it is secured and run', line: 'The security measures of the design; the non-functional requirements have their own section.', icon: ShieldCheck },
  { key: 'when', title: 'When', line: 'The phases of the change, in order.', icon: CalendarRange },
];

export default function DesignDocument({ design, routeReason, levels, findings, nfrTopics, banner }: DesignDocumentProps) {
  const [open, setOpen] = useState<ReadonlySet<DesignGroupKey>>(() => new Set<DesignGroupKey>(['build']));
  const toggle = (key: DesignGroupKey, to?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      const wanted = to ?? !next.has(key);
      if (wanted) next.add(key);
      else next.delete(key);
      return next;
    });

  const sideBySide = isSideBySideDesign(design);
  const mappings = design.sapStandardApiMapping ?? [];
  const facts: { key: string; n: number; word: string }[] = [
    { key: 'services', n: design.cloudServices.length, word: design.cloudServices.length === 1 ? 'service' : 'services' },
    { key: 'endpoints', n: design.nodeAppBlueprint.apiEndpoints.length, word: design.nodeAppBlueprint.apiEndpoints.length === 1 ? 'endpoint' : 'endpoints' },
    { key: 'mappings', n: mappings.length, word: mappings.length === 1 ? 'SAP API mapping' : 'SAP API mappings' },
    { key: 'files', n: design.nodeAppBlueprint.projectStructure.length, word: design.nodeAppBlueprint.projectStructure.length === 1 ? 'file' : 'files' },
  ];
  const counts: Record<DesignGroupKey, string> = {
    build: plural(design.nodeAppBlueprint.projectStructure.length + design.nodeAppBlueprint.apiEndpoints.length + design.cloudServices.length, 'item', 'items'),
    connect: plural(mappings.length, 'mapping', 'mappings'),
    secure: plural(design.securityHardening.length, 'measure', 'measures'),
    when: plural(design.roadmap.length, 'phase', 'phases'),
  };

  const body: Record<DesignGroupKey, React.ReactNode> = {
    build: (
      <div className="flex min-w-0 flex-col gap-6">
        <div data-design-section="blueprint" className="min-w-0">
          {design.nodeAppBlueprint.projectStructure.length ? (
            <SectionBoundary name="Project Blueprint"><ProjectBlueprintExplorer projectStructure={design.nodeAppBlueprint.projectStructure} embedded /></SectionBoundary>
          ) : (
            <NotWritten what="Project blueprint" />
          )}
        </div>
        <div data-design-section="endpoints" className="min-w-0">
          {design.nodeAppBlueprint.apiEndpoints.length ? (
            <SectionBoundary name="API Endpoints"><ApiEndpointsCatalog apiEndpoints={design.nodeAppBlueprint.apiEndpoints} embedded /></SectionBoundary>
          ) : (
            <NotWritten what="API endpoints" />
          )}
        </div>
        <div data-design-section="cloud" className="min-w-0">
          {design.cloudServices.length ? (
            <SectionBoundary name="Cloud Service Integrations"><CloudServiceIntegrations cloudServices={design.cloudServices} embedded /></SectionBoundary>
          ) : (
            <NotWritten what="Cloud services" />
          )}
        </div>
      </div>
    ),
    connect: (
      <div className="flex min-w-0 flex-col gap-6">
        <div data-design-section="mapping" className="min-w-0">
          {mappings.length ? (
            <SectionBoundary name="Business Accelerator Hub Mapping"><ApiBusinessHubMapping sapStandardApiMapping={mappings} levels={levels} embedded /></SectionBoundary>
          ) : (
            <NotWritten what="SAP standard API mapping" />
          )}
        </div>
        <div data-design-section="sync" className="min-w-0">
          {design.dataSync.description ? (
            <div className="flex min-w-0 flex-col gap-1">
              <h4 className="m-0 cc-text-h3 text-cc-ink">Data sync: {design.dataSync.patternName}</h4>
              <p className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{design.dataSync.description}</p>
            </div>
          ) : (
            <NotWritten what="Data sync pattern" />
          )}
        </div>
      </div>
    ),
    secure: (
      <div className="flex min-w-0 flex-col gap-6">
        <div data-design-section="security" className="min-w-0">
          {design.securityHardening.length ? (
            <SectionBoundary name="Security Hardening"><SecurityHardeningChecklist securityHardening={design.securityHardening} findings={findings} embedded /></SectionBoundary>
          ) : (
            <NotWritten what="Security hardening" />
          )}
        </div>
        <p data-design-section="nfr" data-nfr-moved="" className="m-0 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 text-[14px] text-cc-ink">
          The non-functional requirements are read from the code, with their lines, in their own section:{' '}
          <a href="#non-functional-requirements" className="font-semibold text-cc-information underline-offset-2 hover:underline">
            Non-functional requirements
          </a>
          .{nfrTopics ? ` The model’s proposals for ${plural(nfrTopics, 'topic', 'topics')} stand there under each category, marked as proposals.` : ''}
        </p>
      </div>
    ),
    when: (
      <div data-design-section="roadmap" className="min-w-0">
        {design.roadmap.length ? (
          <SectionBoundary name="Modernization Roadmap"><ModernizationRoadmap roadmap={design.roadmap} embedded /></SectionBoundary>
        ) : (
          <NotWritten what="Roadmap" />
        )}
      </div>
    ),
  };

  return (
    <div data-design-document="" className="flex min-w-0 flex-col gap-4">
      {banner}
      {/* 1. The overview */}
      <section
        aria-labelledby="design-overview-title"
        data-design-overview=""
        data-design-section="overview"
        className="flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="design-overview-title" className="m-0 cc-text-h2 text-cc-ink">{design.projectName}</h3>
          <CcProvenanceChip value="proposed" />
        </div>
        <div data-design-route="" className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">Route</span>
            <CcTag>{sideBySide ? `Side-by-side · CAP on ${BTP}` : 'In-app · RAP in SAP S/4HANA'}</CcTag>
          </span>
          {routeReason ? (
            <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]">
              {routeReason.text} <span className="text-[12px] text-cc-ink-muted">({routeReason.source})</span>
            </p>
          ) : null}
        </div>
        {design.architectureOverview.approachDescription ? (
          <p data-design-approach="" className="m-0 max-w-4xl text-[15px] leading-relaxed text-cc-ink [overflow-wrap:anywhere]">
            {design.architectureOverview.approachDescription}
          </p>
        ) : (
          <NotWritten what="Architecture overview" />
        )}
        {design.architectureOverview.nodeFramework ? (
          <p className="m-0 text-[13px] text-cc-ink-muted [overflow-wrap:anywhere]">
            <b className="font-semibold text-cc-ink">Framework:</b> {sapNamesForDisplay(design.architectureOverview.nodeFramework)}
          </p>
        ) : null}
        <TargetDiagram design={design} sideBySide={sideBySide} />
        <ul data-design-facts="" className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
          {facts.map((f) => (
            <li key={f.key} data-design-fact={f.key} className="text-[14px] text-cc-ink">
              <b className="font-bold">{f.n}</b> {f.word}
            </li>
          ))}
        </ul>
      </section>

      {/* 2. The section nav */}
      <nav
        aria-label="Design document sections"
        data-design-group-nav=""
        className="cc-no-print sticky top-14 z-cc-sticky -mx-4 border-b border-cc-line bg-cc-surface px-4 min-[720px]:-mx-6 min-[720px]:px-6"
      >
        <ul className="m-0 flex list-none flex-wrap gap-x-1 p-0">
          {GROUPS.map((g) => (
            <li key={g.key} className="min-w-0">
              <a
                href={`#design-group-${g.key}`}
                onClick={() => toggle(g.key, true)}
                className={cn(
                  'inline-flex items-center gap-1 border-b-2 px-2 pt-3 pb-2 text-[13px] text-cc-ink no-underline',
                  open.has(g.key) ? 'border-cc-ink font-bold' : 'border-transparent font-medium hover:border-cc-line',
                )}
              >
                {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 3. The groups */}
      {GROUPS.map((g) => {
        const Icon = g.icon;
        const isOpen = open.has(g.key);
        const bodyId = `design-group-${g.key}-body`;
        return (
          <section
            key={g.key}
            id={`design-group-${g.key}`}
            aria-labelledby={`design-group-${g.key}-title`}
            data-design-group={g.key}
            data-open={isOpen ? 'true' : 'false'}
            className="min-w-0 scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface"
          >
            <div className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:px-5">
              <h3 id={`design-group-${g.key}-title`} className="m-0">
                <button
                  type="button"
                  data-design-group-toggle={g.key}
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  onClick={() => toggle(g.key)}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-cc-row text-left pointer-coarse:min-h-11"
                >
                  <Icon size={20} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                    <span className="cc-text-h3 text-cc-ink">{g.title}</span>
                    <span className="text-[12px] font-medium text-cc-ink-muted">{counts[g.key]}</span>
                  </span>
                  <ChevronDown size={18} aria-hidden={true} className={cn('shrink-0 text-cc-ink-muted motion-safe:transition-transform', isOpen && 'rotate-180')} />
                </button>
              </h3>
              <p className="m-0 pl-8 text-[13px] text-cc-ink-muted">{g.line}</p>
            </div>
            {isOpen ? (
              <div id={bodyId} className="flex min-w-0 flex-col gap-3 border-t border-cc-line px-4 py-4 sm:px-5">
                <span>
                  <CcProvenanceChip value="proposed" />
                </span>
                {body[g.key]}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
