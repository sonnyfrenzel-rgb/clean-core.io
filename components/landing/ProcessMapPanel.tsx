import { ChevronRight, RefreshCw } from 'lucide-react';
import BpmnPlaneSvg, { anchorText, spokenName } from '@/components/landing/BpmnPlaneSvg';
import ProcessExplorer, { type ExplorerPlane } from '@/components/landing/ProcessExplorer';
import { kindWord, EARLY_END_WORD } from '@/lib/process-map';
import type { LandingNode, LandingProcess } from '@/lib/landing-process';

/**
 * The process section's workspace window — landing mockup, section `process`
 * (mockups s12/s13): the app bar, the map's bar, the map and the two rows of
 * what the map leaves out.
 *
 * Every plane of the example's reconstructed process is drawn on the server
 * (`BpmnPlaneSvg`): the overview first, each phase behind it. The steps view is
 * the same content as a list. The frame, the bar and the rows are this file;
 * the drawing inside the canvas is the diagram component's.
 */

function kindOf(n: LandingNode): string {
  if (n.early) return EARLY_END_WORD;
  if (n.tag === 'endEvent' && n.error) return 'Error end';
  return kindWord(n.tag);
}

function shapeOf(n: LandingNode): string {
  if (n.tag === 'exclusiveGateway' || n.tag === 'parallelGateway') return 'shape gw';
  if (n.tag.endsWith('Event')) return 'shape end';
  return 'shape';
}

function StepList({ nodes }: { nodes: LandingNode[] }) {
  const ordered = [...nodes]
    .filter((n) => n.tag !== 'boundaryEvent')
    .sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  return (
    <ol className="phases">
      {ordered.map((n) => (
        <li key={n.id} className="ph-row">
          {n.opens ? (
            <button type="button" className="ph-btn" data-opens={n.opens} aria-label={`Open ${spokenName(n)}`}>
              <span className="mk" aria-hidden="true">
                +
              </span>
              <span>
                {n.name}
                <span className="pr">{kindOf(n)} · opens in place</span>
              </span>
              <span className="rg">{anchorText(n.anchor)}</span>
            </button>
          ) : (
            <span className="ph-btn ph-static">
              <span className={shapeOf(n)} aria-hidden="true" />
              <span>
                {n.name}
                <span className="pr">{kindOf(n)}</span>
              </span>
              <span className="rg">{anchorText(n.anchor)}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function ProcessMapPanel({
  process,
  title,
  technical,
  vertical,
}: {
  process: LandingProcess;
  title: string;
  /** The same process with the code's own names, for the Technical names switch. */
  technical?: LandingProcess;
  /** The same levels laid out top to bottom, drawn instead on a narrow screen. */
  vertical?: { plain: LandingProcess; technical: LandingProcess };
}) {
  const lines = (n: number) => n.toLocaleString('en-US');
  const root = process.planes[0];
  const phases = root.nodes.filter((n) => n.opens).length;
  const byId = (p?: LandingProcess) => new Map((p?.planes ?? []).map((x) => [x.id, x]));
  const technicalById = byId(technical);
  const verticalById = byId(vertical?.plain);
  const verticalTechnicalById = byId(vertical?.technical);
  const svg = (p: LandingProcess['planes'][number], key: string, fit = false) => (
    <BpmnPlaneSvg
      plane={p}
      idPrefix={`pm-${key}-${p.id}`}
      interactive
      fit={fit}
      scale={p.parent ? 1 : 0.92}
      title={
        p.parent
          ? `The phase ${p.label} of ${process.program} as BPMN, reconstructed from the code.`
          : `The overview of ${process.program} as BPMN, reconstructed from the code: the run as one flow, every phase collapsed.`
      }
    />
  );
  /** Wide screens get the left-to-right map, narrow ones the top-to-bottom one at the box's width. */
  const map = (wide: LandingProcess['planes'][number], narrow: LandingProcess['planes'][number] | undefined, key: string) => (narrow ? (
    <>
      <div className="flow-wide">{svg(wide, key)}</div>
      <div className="flow-narrow">{svg(narrow, `${key}-v`, true)}</div>
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
      technicalSteps: t ? <StepList nodes={t.nodes} /> : undefined,
    };
  });
  const nd = process.notDrawn;

  return (
    <figure className="win lp" data-landing-process="" aria-label={`Process map of the ${lines(process.lines)}-line example: overview, every phase opens in place`}>
      <div className="wbar">
        <span className="wlogo">
          <span className="m">
            <RefreshCw className="i" aria-hidden="true" />
          </span>
          <span>
            Clean-Core<em>.io</em>
          </span>
        </span>
        <span className="wpath">
          My workspace
          <ChevronRight className="i" aria-hidden="true" />
          <b>{title}</b>
        </span>
        <span className="views" aria-label="View: Business">
          <span className="on">Business</span>
          <span>IT</span>
          <span>Management</span>
        </span>
      </div>
      <div className="wbody">
        <ProcessExplorer
          planes={planes}
          rootId={root.id}
          program={title}
          sub={
            <>
              Example <code>{process.program}</code> · {lines(process.lines)} lines · {phases} phases · {process.anchored} of {process.flowNodes} elements with a line anchor
            </>
          }
        />
        <div className="collrows">
          {nd.unreached > 0 && (
            <details className="collrow">
              <summary>
                <span>
                  Not reached from any entry point: {nd.forms} forms{nd.modules > 0 ? ` and ${nd.modules} screen modules` : ''}, {nd.unreachedLines} lines
                  {nd.firstLine !== null && (
                    <span className="anc">
                      L{nd.firstLine}–{nd.lastLine}
                    </span>
                  )}
                </span>
                <span className="wbtn">
                  <span className="show">Show</span>
                  <span className="hide">Hide</span>
                </span>
              </summary>
              <ul>
                {nd.unreachedList.map((u) => (
                  <li key={u.name}>
                    <code>{u.name}</code>
                    <span className="anc">
                      L{u.lineStart}–{u.lineEnd}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {nd.helpers.length > 0 && (
            <details className="collrow">
              <summary>
                <span>
                  {nd.helpers.length} technical helpers folded in:{' '}
                  {nd.helpers.map((h, i) => (
                    <span key={h}>
                      {i > 0 && ', '}
                      <code>{h.toLowerCase()}</code>
                    </span>
                  ))}
                </span>
                <span className="wbtn">
                  <span className="show">Show</span>
                  <span className="hide">Hide</span>
                </span>
              </summary>
              <ul>
                {nd.helperList.map((h) => (
                  <li key={h.name}>
                    <code>{h.name.toLowerCase()}</code>
                    <span>
                      called {h.callSites}× <span className="anc">L{h.lineStart}–{h.lineEnd}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </figure>
  );
}
