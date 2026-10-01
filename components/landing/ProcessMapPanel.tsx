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

function StepList({ nodes, technical = false }: { nodes: LandingNode[]; technical?: boolean }) {
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
              className={`${technical ? 'font-cc-mono' : ''} font-semibold text-cc-brand-strong underline underline-offset-4`}
            >
              {n.name}
            </button>
          ) : (
            <span className={`${technical ? 'font-cc-mono' : ''} font-semibold text-cc-ink`}>{n.name}</span>
          )}
          <span className="font-cc-mono text-xs text-cc-ink-muted">{anchorText(n.anchor)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ProcessMapPanel({
  process,
  technical,
  vertical,
}: {
  process: LandingProcess;
  technical?: LandingProcess;
  /** The same levels laid out top to bottom, shown instead on a narrow screen. */
  vertical?: { plain: LandingProcess; technical: LandingProcess };
}) {
  const byId = (p?: LandingProcess) => new Map((p?.planes ?? []).map((x) => [x.id, x]));
  const technicalById = byId(technical);
  const verticalById = byId(vertical?.plain);
  const verticalTechnicalById = byId(vertical?.technical);
  const svg = (p: LandingProcess['planes'][number], key: string, fit = false) => (
    <BpmnPlaneSvg
      plane={p}
      fit={fit}
      idPrefix={`pm-${key}-${p.id}`}
      interactive
      scale={p.parent ? 1 : 0.92}
      title={
        p.parent
          ? `The phase ${p.label} of ${process.program} as BPMN, reconstructed from the code.`
          : `The overview of ${process.program} as BPMN, reconstructed from the code: every phase collapsed.`
      }
    />
  );
  /** Wide screens get the left-to-right map, narrow ones the top-to-bottom one. */
  const map = (wide: LandingProcess['planes'][number], narrow: LandingProcess['planes'][number] | undefined, key: string) => (narrow ? (
    <>
      <div className="hidden md:block">{svg(wide, key)}</div>
      <div className="md:hidden">{svg(narrow, `${key}-v`, true)}</div>
    </>
  ) : svg(wide, key));
  const planes: ExplorerPlane[] = process.planes.map((p) => {
    const t = technicalById.get(p.id);
    return {
      id: p.id,
      label: p.label,
      technicalLabel: t?.label ?? p.label,
      parent: p.parent,
      anchor: p.anchor ? anchorText(p.anchor) : null,
      map: map(p, verticalById.get(p.id), 'plain'),
      steps: <StepList nodes={p.nodes} />,
      technicalMap: t ? map(t, verticalTechnicalById.get(p.id), 'technical') : undefined,
      technicalSteps: t ? <StepList nodes={t.nodes} technical /> : undefined,
    };
  });
  return <ProcessExplorer planes={planes} rootId={process.planes[0].id} program={process.program} />;
}
