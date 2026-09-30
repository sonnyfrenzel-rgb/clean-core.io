import BpmnPlaneSvg, { anchorText, spokenName } from '@/components/landing/BpmnPlaneSvg';
import ProcessExplorer, { type ExplorerPlane } from '@/components/landing/ProcessExplorer';
import { kindWord, EARLY_END_WORD } from '@/lib/process-map';
import type { LandingNode, LandingProcess } from '@/lib/landing-process';

/**
 * The process section's map — landing mockup, section `process`.
 *
 * Every plane of the example's reconstructed process, drawn on the server: the
 * overview first, each phase (collapsed sub-process) behind it. The steps view
 * is the same content as a list, in the order the map draws it.
 */

function kindOf(n: LandingNode): string {
  if (n.early) return EARLY_END_WORD;
  if (n.tag === 'endEvent' && n.error) return 'Error end';
  return kindWord(n.tag);
}

function StepList({ nodes }: { nodes: LandingNode[] }) {
  const ordered = [...nodes]
    .filter((n) => n.tag !== 'boundaryEvent')
    .sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {ordered.map((n) => (
        <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-cc-line bg-cc-surface-muted px-4 py-2 text-sm">
          <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cc-ink-muted">{kindOf(n)}</span>
          {n.opens ? (
            <button
              type="button"
              data-opens={n.opens}
              aria-label={`Open ${spokenName(n)}`}
              className="font-cc-mono font-semibold text-cc-brand-strong underline underline-offset-4"
            >
              {n.name}
            </button>
          ) : (
            <span className="font-cc-mono font-semibold text-cc-ink">{n.name}</span>
          )}
          <span className="font-cc-mono text-xs text-cc-ink-muted">{anchorText(n.anchor)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ProcessMapPanel({ process }: { process: LandingProcess }) {
  const planes: ExplorerPlane[] = process.planes.map((p) => ({
    id: p.id,
    label: p.label,
    parent: p.parent,
    anchor: p.anchor ? anchorText(p.anchor) : null,
    map: (
      <BpmnPlaneSvg
        plane={p}
        idPrefix={`pm-${p.id}`}
        interactive
        scale={p.parent ? 1 : 0.92}
        title={
          p.parent
            ? `The phase ${p.label} of ${process.program} as BPMN, reconstructed from the code.`
            : `The overview of ${process.program} as BPMN, reconstructed from the code: one row per event block, every phase collapsed.`
        }
      />
    ),
    steps: <StepList nodes={p.nodes} />,
  }));
  return <ProcessExplorer planes={planes} rootId={process.planes[0].id} />;
}
