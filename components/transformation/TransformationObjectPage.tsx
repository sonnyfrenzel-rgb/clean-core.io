'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, Braces, Check, CircleDashed, Container, FileCode2, FileText, Folder, Layers, TriangleAlert, Boxes, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { CcSeverity } from '@/components/cc/Identifier';
import { tokenizeAbapLine } from '@/lib/process-map';
import { findingRows } from '@/lib/findings-view';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { CoverageReport } from '@/lib/abap/coverage';
import {
  calmTitle,
  changeExcerpt,
  changeOrder,
  fileCard,
  findingTarget,
  formatBytes,
  notGeneratedReasons,
  packageShape,
  planByKind,
  transformationFigures,
  transformationFlow,
  type FileType,
  type FindingTarget,
  type GeneratedFile,
  type ProjectTrack,
  type TargetKind,
} from '@/lib/transformation-view';
import TransformationFlowChart, { TARGET_COLOUR } from './TransformationFlow';

/**
 * The Transformation tool as a Fiori Object Page — proposal A of 01.10.2026,
 * with proposal B's flow "finding → target → file" as one of its sections.
 *
 * Shared by a real project (`app/(app)/project/[projectId]/transformation`)
 * and the demo (`components/demo/DemoWorkspace.tsx`). The demo passes
 * `files={null}`: it makes no model call, so the package cards and the third
 * box of every "finding to change" row are replaced by "The demo stops where
 * the model begins" — never by a made-up file.
 *
 * Every figure comes from `lib/transformation-view.ts`, which counts what the
 * engine and the stored package hold. This component adds no number.
 */

export interface TransformationObjectPageProps {
  findings: readonly EvidenceFinding[];
  coverage: CoverageReport | null;
  track: ProjectTrack;
  /** "Node.js (TypeScript)" or "ABAP Cloud (RAP)" — the track's words. */
  codeKind: string;
  /** The stored package, or null where no model can have run (the demo). */
  files: readonly GeneratedFile[] | null;
  /** Grounding-audit findings still needing a sign-off; null when there is no audit (demo). */
  openSignOffs: number | null;
  onOpenAudit?: () => void;
  /** Buttons in the package section's header: side by side, copy, download. */
  packageActions?: React.ReactNode;
  /** Shown in the package section when `files` is an empty list. */
  emptyPackage?: React.ReactNode;
  /** Sections after "Plan by kind", in the main column. */
  children?: React.ReactNode;
  /** A full-width section under the two columns — the side-by-side viewer of a real project. */
  after?: React.ReactNode;
  /** Extra anchors for those sections: [id, label]. */
  extraAnchors?: Array<[string, string]>;
}

const sectionCls = 'min-w-0 scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc';

function Section({
  id,
  title,
  meta,
  right,
  lead,
  children,
}: {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={sectionCls} data-transformation-section={id}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <h2 id={`${id}-title`} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
          {title}
          {meta}
        </h2>
        {right}
      </header>
      {lead ? <p className="m-0 mt-1 px-4 cc-text-cell text-cc-ink-muted md:px-5">{lead}</p> : null}
      <div className="px-4 pb-4 pt-3 md:px-5">{children}</div>
    </section>
  );
}

function Facet({
  label,
  why,
  figure,
  unit,
  sub,
  viz,
}: {
  label: string;
  why?: { basis: React.ReactNode; provenance: 'reconstructed' | 'proposed' | 'imported' | 'not-determined' };
  figure: React.ReactNode;
  unit: React.ReactNode;
  sub?: React.ReactNode;
  viz?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-3 md:px-4" data-transformation-facet={label}>
      <div className="flex items-center justify-between gap-2">
        <span className="cc-text-label text-cc-ink-muted">{label}</span>
        {why ? <CcWhyPopover subject={label} provenance={why.provenance} basis={why.basis} /> : null}
      </div>
      <p className="m-0 mt-1 flex flex-wrap items-baseline gap-2">
        <span className="cc-text-figure text-cc-ink">{figure}</span>
        <span className="cc-text-cell text-cc-ink-muted">{unit}</span>
      </p>
      {sub ? <div className="mt-1 cc-text-meta font-medium text-cc-ink-muted">{sub}</div> : null}
      {viz ? <div className="mt-3">{viz}</div> : null}
    </div>
  );
}

function Dot({ tone }: { tone: 'warning' | 'information' | 'neutral' }) {
  return (
    <span
      aria-hidden={true}
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone === 'warning' && 'bg-cc-warning-mark',
        tone === 'information' && 'bg-cc-information',
        tone === 'neutral' && 'bg-cc-code-muted',
      )}
    />
  );
}

function Line({ n }: { n: number }) {
  return <CcAnchor label={`Source line ${n}`}>{`L${n}`}</CcAnchor>;
}

const FILE_ICON: Record<FileType, React.ReactNode> = {
  code: <FileCode2 size={22} aria-hidden={true} />,
  config: <Braces size={22} aria-hidden={true} />,
  container: <Container size={22} aria-hidden={true} />,
  model: <Boxes size={22} aria-hidden={true} />,
  test: <FlaskConical size={22} aria-hidden={true} />,
  other: <FileText size={22} aria-hidden={true} />,
};

const FILE_TONE: Record<FileType, string> = {
  code: 'bg-cc-information-bg border-cc-information-border text-cc-information',
  config: 'bg-cc-warning-bg border-cc-warning-border text-cc-warning',
  container: 'bg-cc-surface border-cc-chart-3 text-cc-chart-3',
  model: 'bg-cc-surface border-cc-seq-2 text-cc-seq-4',
  test: 'bg-cc-surface-muted border-cc-line text-cc-ink-muted',
  other: 'bg-cc-surface-muted border-cc-line text-cc-ink-muted',
};

function codeLines(snippet: string, start: number): CcCodeLine[] {
  return snippet
    .split('\n')
    .slice(0, 3)
    .map((text, i) => ({ number: start + i, tokens: tokenizeAbapLine(text.replace(/\s+$/, '')), highlighted: i === 0 }));
}

function TargetBox({ target }: { target: FindingTarget }) {
  const eyebrow = target.source === 'catalog' ? 'Target · catalog' : target.source === 'route' ? 'Target · route' : 'Target · your code';
  const tone =
    target.kind === 'successor' || target.kind === 'route'
      ? 'border-cc-information-border bg-cc-information-bg'
      : target.kind === 'custom'
        ? 'border-cc-line bg-cc-surface-muted'
        : 'border-cc-warning-border bg-cc-warning-bg';
  return (
    <div className={cn('min-w-0 rounded-cc-row border px-3 py-3', tone)} data-finding-target={target.kind}>
      <div className="cc-text-label text-cc-ink-muted">{eyebrow}</div>
      <div className={cn('mt-1 break-words text-cc-ink', target.kind === 'successor' ? 'cc-text-identifier font-cc-mono' : 'cc-text-h3')}>
        {target.label}
      </div>
      <div className="mt-1 cc-text-cell text-cc-ink-muted">{target.sub}</div>
      {target.kind === 'successor' ? (
        <div className="mt-2">
          <CcProvenanceChip value="imported" note={`${target.successorType} · ${String(target.successorConfidence).toLowerCase()}`} />
        </div>
      ) : target.kind === 'route-other' ? (
        <div className="mt-2">
          <CcProvenanceChip value="not-determined" note="route differs" />
        </div>
      ) : null}
    </div>
  );
}

function GeneratedBox({ finding, files }: { finding: EvidenceFinding; files: readonly GeneratedFile[] | null }) {
  const excerpt = useMemo(() => (files && files.length > 0 ? changeExcerpt(finding, files) : null), [finding, files]);
  const frame = 'min-w-0 rounded-cc-row border border-dashed border-cc-warning-line bg-cc-surface px-3 py-3';
  if (files === null) {
    return (
      <div className={frame} data-generated-change="demo">
        <div className="cc-text-label text-cc-warning">Generated change</div>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
          The demo stops where the model begins — a real run writes this change; the demo makes no model call.
        </p>
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className={frame} data-generated-change="none">
        <div className="cc-text-label text-cc-warning">Generated change</div>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">No code generated yet.</p>
      </div>
    );
  }
  if (!excerpt) {
    const names = [finding.sapReplacement?.objectName, finding.objectName].filter(Boolean).join(' or ');
    return (
      <div className={frame} data-generated-change="not-found">
        <div className="cc-text-label text-cc-warning">Generated change</div>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
          {names ? `No generated file names ${names}.` : 'This finding names no object to look for.'} Confirm how the model
          handled it in the grounding audit.
        </p>
        <div className="mt-2">
          <CcProvenanceChip value="not-determined" note="sign-off open" />
        </div>
      </div>
    );
  }
  return (
    <div className={frame} data-generated-change="found">
      <div className="flex flex-wrap items-center gap-2">
        <span className="cc-text-label text-cc-warning">Generated change</span>
        <CcProvenanceChip value="proposed" />
      </div>
      <p className="m-0 mt-1 break-all cc-text-cell text-cc-ink">
        <span className="font-cc-mono">{excerpt.path}</span>{' '}
        <CcAnchor label={`Generated line ${excerpt.line}`}>{`L${excerpt.line}`}</CcAnchor>{' '}
        <span className="text-cc-ink-muted">names {excerpt.term}</span>
      </p>
      <div className="mt-2">
        <CcCodeSurface
          label={`${excerpt.path}, line ${excerpt.line}`}
          lines={excerpt.lines.map((l) => ({ number: l.number, tokens: [{ kind: 'plain', text: l.text }], highlighted: l.highlighted }))}
        />
      </div>
      <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">Found by text search — a place to look, not proof the change is right.</p>
    </div>
  );
}

const SHOWN_PLACES = 4;

function ChangeRow({
  finding,
  lines,
  track,
  files,
}: {
  finding: EvidenceFinding;
  /** Every place in the code this finding occurs on, sorted. */
  lines: readonly number[];
  track: ProjectTrack;
  files: readonly GeneratedFile[] | null;
}) {
  const target = findingTarget(finding, track);
  const places = lines.length > 0 ? lines : [finding.lineStart];
  return (
    <li
      className="grid grid-cols-1 items-stretch gap-2 border-t border-cc-line pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1.3fr)_32px_minmax(0,1fr)_32px_minmax(0,0.9fr)] md:gap-0"
      data-change-row={finding.id}
    >
      <div className="min-w-0 [&_pre]:whitespace-pre-wrap [&_[data-cc-code-line]]:pl-14 [&_[data-cc-code-line]]:-indent-14">
        {finding.snippet ? (
          <CcCodeSurface label={`Your code, line ${finding.lineStart}`} lines={codeLines(finding.snippet, finding.lineStart)} />
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 cc-text-cell">
          <CcSeverity value={finding.severity} />
          {places.slice(0, SHOWN_PLACES).map((n) => (
            <Line key={n} n={n} />
          ))}
          {places.length > SHOWN_PLACES ? (
            <span className="cc-text-meta text-cc-ink-muted">+{places.length - SHOWN_PLACES} more</span>
          ) : null}
          {places.length > 1 ? (
            <span className="cc-text-meta text-cc-ink-muted" data-change-places={places.length}>
              {places.length} places in the code
            </span>
          ) : null}
          <span className="text-cc-ink-muted">{calmTitle(finding.title)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center text-cc-ink-muted" aria-hidden={true}>
        <ArrowRight size={18} className="rotate-90 md:rotate-0" />
      </div>
      <TargetBox target={target} />
      <div className="flex items-center justify-center text-cc-ink-muted" aria-hidden={true}>
        <ArrowRight size={18} className="rotate-90 md:rotate-0" />
      </div>
      <GeneratedBox finding={finding} files={files} />
    </li>
  );
}

const FIRST_CHANGES = 3;

export default function TransformationObjectPage({
  findings,
  coverage,
  track,
  codeKind,
  files,
  openSignOffs,
  onOpenAudit,
  packageActions,
  emptyPackage,
  children,
  after,
  extraAnchors = [],
}: TransformationObjectPageProps) {
  const [allChanges, setAllChanges] = useState(false);
  const figures = useMemo(() => transformationFigures(findings), [findings]);
  const kinds = useMemo(() => planByKind(findings), [findings]);
  const flow = useMemo(() => transformationFlow(findings, track), [findings, track]);
  const ordered = useMemo(() => changeOrder(findings, track), [findings, track]);
  // The places in the code of each finding, keyed by the occurrence that stands for it.
  const linesOf = useMemo(() => new Map(findingRows(findings).map((r) => [r.finding.id, r.lines])), [findings]);
  const reasons = useMemo(() => notGeneratedReasons(findings, coverage), [findings, coverage]);
  const cards = useMemo(() => (files ?? []).map(fileCard), [files]);
  const generated = files !== null && files.length > 0;
  const shown = allChanges ? ordered : ordered.slice(0, FIRST_CHANGES);
  const maxKind = Math.max(1, ...kinds.map((k) => k.total));

  const anchors: Array<[string, string, number | undefined]> = [
    ['tf-flow', 'Code to package', undefined],
    ['tf-package', 'Generated package', files === null ? undefined : files.length],
    ['tf-changes', 'From finding to change', figures.findings],
    ['tf-plan', 'Plan by kind', kinds.length],
    ...extraAnchors.map(([id, label]) => [id, label, undefined] as [string, string, number | undefined]),
  ];

  // The facet's bar: findings per target, in the flow's colours.
  const stack = flow.targets.map((t) => ({ kind: t.kind, count: t.count, label: t.label }));

  return (
    <div className="cc-transformation-page" data-transformation-object-page="">
      {/* Facets, then the status line: the answer before the evidence. */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
        <Facet
          label="Generated package"
          why={{ provenance: 'proposed', basis: 'Written by the model against the plan. Not compiled and not run here.' }}
          figure={files === null ? '—' : files.length}
          unit={files === null ? 'files · none in a demo' : `${files.length === 1 ? 'file' : 'files'} · ${codeKind}`}
          sub={
            generated ? (
              <span className="flex flex-wrap items-center gap-2">
                <CcProvenanceChip value="proposed" /> not compiled, not run here
              </span>
            ) : files === null ? (
              'The demo stops where the model begins.'
            ) : (
              'No code generated yet.'
            )
          }
        />
        <Facet
          label="Plan from the engine"
          why={{ provenance: 'reconstructed', basis: 'Counted from the engine’s findings and their target options. No model.' }}
          figure={figures.planned}
          unit={`of ${figures.findings} findings with a target option`}
          sub={
            <span data-transformation-places={figures.places}>
              {figures.unplanned === 0
                ? '0 left out — every finding has a target option'
                : `${figures.unplanned} left out — no target option, not guessed at`}
              {figures.places !== figures.findings ? <span className="block">{figures.places} places in the code</span> : null}
            </span>
          }
          viz={
            figures.findings > 0 ? (
              <div className="flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={stack.map((s) => `${s.count} ${s.label}`).join(', ')}>
                {stack.map((s) => (
                  <span key={s.kind} className="block h-full" style={{ flexGrow: s.count, background: TARGET_COLOUR[s.kind] }} />
                ))}
              </div>
            ) : null
          }
        />
        <Facet
          label="Released successors"
          why={{ provenance: 'imported', basis: 'Successors named by the SAP catalog for the objects your code uses.' }}
          figure={figures.successorNamed}
          unit={`of ${figures.findings} named`}
          sub={`${figures.successorDistinct} distinct ${figures.successorDistinct === 1 ? 'API or CDS view' : 'APIs and CDS views'}`}
          viz={
            figures.findings > 0 ? (
              <div
                className="h-2 overflow-hidden rounded-full bg-cc-line"
                role="img"
                aria-label={`${figures.successorNamed} of ${figures.findings} findings have a released successor`}
              >
                <span className="block h-full bg-cc-seq-3" style={{ width: `${(figures.successorNamed / figures.findings) * 100}%` }} />
              </div>
            ) : null
          }
        />
        <Facet
          label="Grounding audit"
          figure={openSignOffs === null ? '—' : openSignOffs}
          unit={openSignOffs === null ? 'no audit in a demo' : openSignOffs === 1 ? 'open sign-off' : 'open sign-offs'}
          sub={openSignOffs === null ? 'It checks generated code, and a demo has none.' : 'findings whose change you have to confirm'}
          viz={
            onOpenAudit ? (
              <div className="[&_button]:h-auto [&_button]:whitespace-normal [&_button]:py-1 [&_button]:text-left">
              <CcButton density="compact" icon={<Layers size={14} aria-hidden={true} />} onClick={onOpenAudit}>
                View grounding audit
              </CcButton>
              </div>
            ) : null
          }
        />
      </div>

      <p className="m-0 mt-3 flex flex-wrap gap-x-5 gap-y-1 cc-text-meta font-medium text-cc-ink" data-transformation-status="">
        <span className="inline-flex items-center gap-2">
          <Dot tone="warning" />
          <span className="cc-text-label text-cc-ink-muted">Code</span>
          {generated ? 'model proposal' : files === null ? 'none in a demo' : 'not generated'}
        </span>
        <span className="inline-flex items-center gap-2">
          <Dot tone="information" />
          <span className="cc-text-label text-cc-ink-muted">Plan</span>engine, no model
        </span>
        <span className="inline-flex items-center gap-2">
          <Dot tone="neutral" />
          <span className="cc-text-label text-cc-ink-muted">Compiled</span>no
        </span>
        <span className="inline-flex items-center gap-2">
          <Dot tone="neutral" />
          <span className="cc-text-label text-cc-ink-muted">Run</span>only against mocks in Testing
        </span>
        {openSignOffs !== null ? (
          <span className="inline-flex items-center gap-2">
            <Dot tone="neutral" />
            <span className="cc-text-label text-cc-ink-muted">Sign-off</span>
            {openSignOffs} open
          </span>
        ) : null}
      </p>

      <nav
        aria-label="Sections of this tool"
        className="sticky top-14 z-cc-popover -mx-4 mt-3 border-b border-cc-line bg-cc-surface px-4 sm:mx-0 sm:px-0"
      >
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0">
          {anchors.map(([id, label, count], i) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className={cn(
                  'inline-block whitespace-nowrap border-b-2 px-3 pb-2 pt-3 text-[14px] text-cc-ink no-underline',
                  i === 0 ? 'border-cc-ink font-bold' : 'border-transparent font-medium hover:border-cc-line',
                )}
              >
                {label}
                {count !== undefined ? <span className="ml-1 cc-text-meta font-medium text-cc-ink-muted">({count})</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* The big picture runs across both columns (proposal A: images full width). */}
      <div className="mt-5">
          <Section
          id="tf-flow"
          title="From your code to the generated package"
          right={<span className="cc-text-meta font-medium text-cc-ink-muted">band width = number of findings</span>}
        >
          <TransformationFlowChart flow={flow} files={files === null ? null : cards} findings={figures.findings} places={figures.places} />
        </Section>

      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section
            id="tf-package"
            title="Generated package"
            meta={generated ? <CcProvenanceChip value="proposed" /> : undefined}
            right={packageActions ? <div className="flex flex-wrap items-center gap-2">{packageActions}</div> : undefined}
            lead={
              files === null
                ? 'In a real run the model writes the package against the plan below. The demo makes no model call, so it has none.'
                : track === 'in-app'
                  // An ABAP run is simulated: the Testing tool marks it so and
                  // says your own system gives the verdict (carried QA finding
                  // 4aa2e074b134).
                  ? 'Written by the model against the plan below. Not compiled and not run here; the Testing tool simulates a run of its ABAP Unit stubs — your own system gives them a verdict.'
                  : 'Written by the model against the plan below. Not compiled and not run here; the Testing tool runs it against mocks.'
            }
          >
            {files === null ? (
              <div className="rounded-cc-row border border-dashed border-cc-warning-line bg-cc-surface px-4 py-4" data-demo-package="">
                <p className="m-0 cc-text-h3 text-cc-ink">The demo stops where the model begins.</p>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  The transformed code comes out of a model call against your source in a real run. Writing a convincing
                  one by hand is the one thing this product may never do — what you see below is what the deterministic
                  engine produced.
                </p>
              </div>
            ) : files.length === 0 ? (
              emptyPackage
            ) : (
              <>
                <p className="m-0 mb-3 flex items-center gap-2 cc-text-meta font-medium text-cc-ink-muted">
                  <Folder size={14} aria-hidden={true} /> Project files · <span className="font-cc-mono">{packageShape(files)}</span>
                </p>
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3" data-package-files="">
                  {cards.map((c) => (
                    <li key={c.path} className="flex min-w-0 gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3" data-package-file={c.path}>
                      <span className={cn('flex h-12 w-11 shrink-0 items-center justify-center rounded-cc-row border', FILE_TONE[c.type])}>
                        {FILE_ICON[c.type]}
                      </span>
                      <div className="min-w-0">
                        <div className="break-all cc-text-identifier font-cc-mono text-cc-ink">{c.path}</div>
                        <div className="cc-text-cell text-cc-ink-muted">{c.role}</div>
                        <div className="mt-1">
                          <CcProvenanceChip value="proposed" />
                        </div>
                        <div className="mt-1 cc-text-meta font-medium text-cc-ink-muted">
                          {c.lines} {c.lines === 1 ? 'line' : 'lines'} · {formatBytes(c.bytes)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section
            id="tf-changes"
            title="From finding to change"
            right={<span className="cc-text-meta font-medium text-cc-ink-muted">your code → target → generated</span>}
          >
            {findings.length === 0 ? (
              <p className="m-0 cc-text-cell text-cc-ink-muted">The engine reported no finding for this source.</p>
            ) : (
              <>
                <ol className="m-0 flex list-none flex-col gap-4 p-0" data-finding-changes="">
                  {shown.map((f) => (
                    <ChangeRow key={f.id} finding={f} lines={linesOf.get(f.id) ?? []} track={track} files={files} />
                  ))}
                </ol>
                {ordered.length > FIRST_CHANGES ? (
                  <div className="mt-4 flex justify-center">
                    <CcButton aria-expanded={allChanges} onClick={() => setAllChanges((v) => !v)}>
                      {allChanges ? `Show the first ${FIRST_CHANGES}` : `Show all ${ordered.length} changes`}
                    </CcButton>
                  </div>
                ) : null}
              </>
            )}
          </Section>

          <Section
            id="tf-plan"
            title="Plan by kind"
            meta={<CcProvenanceChip value="reconstructed" note="engine" />}
            lead="One line per kind of finding: how many there are, and for how many the catalog names a released successor."
          >
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-plan-by-kind="">
              {kinds.map((k) => (
                <li
                  key={k.kind}
                  className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-x-3 gap-y-1 cc-text-cell text-cc-ink md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_64px]"
                >
                  <span className="min-w-0">{k.label}</span>
                  <span className="col-span-2 row-start-2 flex h-3 gap-px md:col-span-1 md:row-start-auto" aria-hidden={true}>
                    {k.withSuccessor > 0 ? (
                      <span className="block rounded-[3px] bg-cc-seq-3" style={{ flexGrow: k.withSuccessor, flexBasis: 0 }} />
                    ) : null}
                    {k.total - k.withSuccessor > 0 ? (
                      <span className="block rounded-[3px] bg-cc-line" style={{ flexGrow: k.total - k.withSuccessor, flexBasis: 0 }} />
                    ) : null}
                    <span className="block" style={{ flexGrow: maxKind - k.total, flexBasis: 0 }} />
                  </span>
                  <span className="text-right cc-text-meta md:row-start-auto" aria-label={`${k.withSuccessor} of ${k.total} with a released successor`}>
                    {k.withSuccessor} / {k.total}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 flex flex-wrap gap-4 cc-text-meta font-medium text-cc-ink-muted">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden={true} className="inline-block h-2 w-3 rounded-[3px] bg-cc-seq-3" /> released successor named
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden={true} className="inline-block h-2 w-3 rounded-[3px] bg-cc-line" /> none in the catalog
              </span>
            </p>
          </Section>

          {children}
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Status and limits">
          <section aria-labelledby="tf-status-title" className={sectionCls}>
            <h2 id="tf-status-title" className="m-0 px-4 pt-4 cc-text-h2 text-cc-ink">
              Status of the code
            </h2>
            <ol className="m-0 list-none px-4 pb-4 pt-2" data-code-status="">
              {[
                { done: findings.length > 0, text: 'Plan written by the engine', note: `${figures.findings} findings${figures.places !== figures.findings ? ` at ${figures.places} places in the code` : ''}` },
                {
                  done: generated,
                  text: 'Code generated',
                  note: generated ? `${files!.length} files, model proposal` : files === null ? 'not in a demo' : 'not yet',
                },
                {
                  done: openSignOffs === 0 && generated,
                  text: 'Grounding audit signed off',
                  note: openSignOffs === null ? 'no audit in a demo' : `${openSignOffs} open`,
                },
                { done: false, text: 'Compiled and run', note: 'not here; mocks only in Testing' },
              ].map((s, i) => (
                <li key={s.text} className="flex items-start gap-3 py-1 cc-text-cell text-cc-ink">
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                      s.done ? 'border-cc-success bg-cc-success text-cc-on-dark' : 'border-cc-line bg-cc-surface text-cc-ink-muted',
                    )}
                  >
                    {s.done ? <Check size={12} aria-hidden={true} /> : i + 1}
                  </span>
                  <span>
                    {s.text} <span className="text-cc-ink-muted">— {s.note}</span>
                    <span className="sr-only">{s.done ? ' (done)' : ' (open)'}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div
            className="flex items-start gap-2 rounded-cc-card border border-cc-warning-border bg-cc-warning-bg px-4 py-3 cc-text-cell text-cc-ink"
            data-not-compiled=""
          >
            <TriangleAlert size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-warning" />
            <span>
              <b>Not compiled and not run here.</b> Nothing has checked this code against a system of yours.
            </span>
          </div>

          <section aria-labelledby="tf-not-generated-title" className={sectionCls}>
            <h2 id="tf-not-generated-title" className="m-0 px-4 pt-4 cc-text-h2 text-cc-ink">
              Not generated, and why
            </h2>
            {reasons.length === 0 ? (
              <p className="m-0 px-4 pb-4 pt-2 cc-text-cell text-cc-ink-muted">The engine names no gap a generation cannot carry over.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 px-4 pb-4 pt-2" data-not-generated="">
                {reasons.map((r) => (
                  <li key={r.key} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                    <CircleDashed size={15} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
                    <span>
                      {r.text}{' '}
                      {r.lines.map((l) => (
                        <React.Fragment key={l}>
                          <Line n={l} />{' '}
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {after ? <div className="mt-5">{after}</div> : null}
    </div>
  );
}

export type { TargetKind };
