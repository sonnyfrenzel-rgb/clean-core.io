import { kindWord, EARLY_END_WORD } from '@/lib/process-map';
import type { LandingNode, LandingPlane } from '@/lib/landing-process';
import { ANCHOR_FONT, LABEL_FONT, type PlacedLabel, type Point } from '@/lib/bpmn/layout';
import { lineHeight } from '@/lib/bpmn/text-metrics';

/**
 * One plane of a reconstructed process, drawn as SVG on the server — roadmap
 * 3.0.6, the BPMN of the landing mockup.
 *
 * It draws exactly what `lib/landing-process.ts` hands it: the shapes and the
 * waypoints the BPMN 2.0 export writes into its `BPMNDiagram`, the name the
 * skeleton read out of the source, and the node's line anchor. It adds no
 * element, moves none and names none — so the picture on the public page is the
 * diagram a modeller opens from the downloaded file, not a drawing of one.
 *
 * Server component, no state: interaction (opening a sub-process, lighting a
 * code line) is attached from outside through the `data-*` attributes, so the
 * landing page ships the drawing as HTML and no diagram library at all.
 */

const LINE_H = lineHeight(LABEL_FONT);
const ANCHOR_H = lineHeight(ANCHOR_FONT);

/**
 * A label exactly where the layout placed it: the name lines centred in the
 * box, the anchor under them. The layout measured and wrapped the text
 * (`lib/bpmn/text-metrics.ts`), so nothing here breaks a line of its own.
 */
function LabelText({ label, muted = false }: { label: PlacedLabel; muted?: boolean }) {
  const cx = label.box.x + label.box.width / 2;
  const nameH = label.lines.length * LINE_H;
  return (
    <>
      {label.lines.map((l, i) => (
        <text key={i} x={cx} y={label.box.y + 11 + i * LINE_H} textAnchor="middle" fontSize={LABEL_FONT} className={muted ? 'fill-cc-ink-muted' : 'fill-cc-ink'}>
          {l}
        </text>
      ))}
      {label.anchor && (
        <text x={cx} y={label.box.y + nameH + 10} textAnchor="middle" fontSize={ANCHOR_FONT} className="cc-bpmn-anchor font-cc-mono fill-cc-ink-muted">
          {label.anchor}
        </text>
      )}
    </>
  );
}

export function anchorText(a: { lineStart: number; lineEnd: number } | null): string {
  if (!a) return 'no anchor';
  return a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`;
}

/** What a screen reader hears for one element: kind, name, anchor. */
export function spokenName(n: LandingNode): string {
  const kind = n.early ? EARLY_END_WORD : n.error && n.tag === 'endEvent' ? 'Error end' : kindWord(n.tag);
  const where = n.anchor
    ? n.anchor.lineStart === n.anchor.lineEnd
      ? `line ${n.anchor.lineStart}`
      : `lines ${n.anchor.lineStart} to ${n.anchor.lineEnd}`
    : 'no line anchor';
  return `${kind}: ${n.name}, ${where}`;
}

function path(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
}

function ErrorMark({ cx, cy }: { cx: number; cy: number }) {
  // The BPMN error marker: a lightning stroke inside the event.
  return (
    <path
      d={`M${cx - 8} ${cy + 7} L${cx - 3} ${cy - 7} L${cx + 2} ${cy + 2} L${cx + 8} ${cy - 8} L${cx + 3} ${cy + 8} L${cx - 2} ${cy - 1} Z`}
      className="fill-none stroke-cc-error"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  );
}

function TaskGlyph({ node }: { node: LandingNode }) {
  const { x, y } = node.box;
  const g = { className: 'fill-none stroke-cc-ink-muted', strokeWidth: 1.3 } as const;
  switch (node.tag) {
    case 'serviceTask':
      return (
        <g {...g}>
          <circle cx={x + 14} cy={y + 14} r={5} />
          <circle cx={x + 14} cy={y + 14} r={1.8} />
        </g>
      );
    case 'sendTask':
      return (
        <g>
          <rect x={x + 7} y={y + 9} width={15} height={10} className="fill-cc-ink-muted" />
          <path d={`M${x + 7} ${y + 9} L${x + 14.5} ${y + 15} L${x + 22} ${y + 9}`} className="fill-none stroke-cc-surface" strokeWidth={1.3} />
        </g>
      );
    case 'userTask':
      return (
        <g {...g}>
          <circle cx={x + 14} cy={y + 11} r={4} />
          <path d={`M${x + 7} ${y + 22} Q${x + 14} ${y + 13} ${x + 21} ${y + 22}`} />
        </g>
      );
    case 'businessRuleTask':
      return (
        <g {...g}>
          <rect x={x + 7} y={y + 8} width={15} height={11} />
          <path d={`M${x + 7} ${y + 12} H${x + 22} M${x + 11} ${y + 12} V${y + 19}`} />
        </g>
      );
    default:
      return null;
  }
}

function Node({ node, interactive }: { node: LandingNode; interactive: boolean }) {
  const { x, y, width, height } = node.box;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const anchor = node.anchorLabel ?? anchorText(node.anchor);
  const opens = interactive && node.opens;
  const common = {
    'data-bpmn-node': node.id,
    'data-l': node.anchor ? String(node.anchor.lineStart) : undefined,
    'data-opens': opens ? node.opens ?? undefined : undefined,
    className: 'cc-bpmn-node',
    tabIndex: 0,
    role: opens ? 'button' : 'img',
  } as const;
  // The name a screen reader hears and the tooltip a mouse shows: one <title>,
  // which SVG uses as the accessible name, rather than a second copy in aria-label.
  const name = opens ? `Open ${spokenName(node)}` : spokenName(node);

  if (node.tag === 'startEvent' || node.tag === 'endEvent' || node.tag === 'boundaryEvent' || node.tag === 'intermediateCatchEvent' || node.tag === 'intermediateThrowEvent') {
    const end = node.tag === 'endEvent';
    return (
      <g {...common}>
        <title>{name}</title>
        <circle
          cx={cx}
          cy={cy}
          r={width / 2}
          className={`cc-bpmn-shape fill-cc-surface ${node.error ? 'stroke-cc-error' : 'stroke-cc-information'}`}
          strokeWidth={end ? 3.5 : 1.8}
        />
        {node.tag === 'intermediateThrowEvent' && <circle cx={cx} cy={cy} r={width / 2 - 3.5} className="fill-none stroke-cc-information" strokeWidth={1.2} />}
        {node.tag === 'boundaryEvent' && <circle cx={cx} cy={cy} r={width / 2 - 3.5} className="fill-none stroke-cc-error" strokeWidth={1.2} />}
        {node.error && <ErrorMark cx={cx} cy={cy} />}
        {node.label && <LabelText label={node.label} />}
      </g>
    );
  }

  if (node.tag === 'exclusiveGateway' || node.tag === 'parallelGateway') {
    const m = width * 0.18;
    return (
      <g {...common}>
        <title>{name}</title>
        <path
          d={`M${cx} ${y} L${x + width} ${cy} L${cx} ${y + height} L${x} ${cy} Z`}
          className="cc-bpmn-shape fill-cc-surface stroke-cc-information"
          strokeWidth={1.8}
        />
        {node.tag === 'parallelGateway' ? (
          <path d={`M${cx - m} ${cy} H${cx + m} M${cx} ${cy - m} V${cy + m}`} className="stroke-cc-information" strokeWidth={2.5} />
        ) : (
          <path d={`M${cx - m * 0.8} ${cy - m * 0.8} L${cx + m * 0.8} ${cy + m * 0.8} M${cx + m * 0.8} ${cy - m * 0.8} L${cx - m * 0.8} ${cy + m * 0.8}`} className="stroke-cc-information" strokeWidth={2.5} />
        )}
        {node.label && <LabelText label={node.label} />}
      </g>
    );
  }

  // Activities: task kinds, a collapsed sub-process, a call activity.
  const glyph = ['serviceTask', 'sendTask', 'userTask', 'businessRuleTask'].includes(node.tag);
  const label = node.inside ?? [node.name];
  // The block of name lines and the anchor line, centred in the box.
  const block = label.length * LINE_H + (node.fact ? ANCHOR_H : 0) + ANCHOR_H;
  const top = y + (height - block) / 2;
  return (
    <g {...common}>
      <title>{name}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        className={`cc-bpmn-shape ${opens ? 'fill-cc-information-bg' : 'fill-cc-surface'} stroke-cc-information`}
        strokeWidth={node.tag === 'callActivity' ? 3.5 : 1.8}
      />
      {glyph && <TaskGlyph node={node} />}
      {label.map((l, i) => (
        <text key={i} x={cx} y={top + 11 + i * LINE_H} textAnchor="middle" fontSize={LABEL_FONT} fontWeight={600} className="fill-cc-ink">
          {l}
        </text>
      ))}
      {node.fact && (
        <text x={cx} y={top + label.length * LINE_H + 10} textAnchor="middle" fontSize={ANCHOR_FONT} className="fill-cc-ink-muted">
          {node.fact}
        </text>
      )}
      <text x={cx} y={top + label.length * LINE_H + (node.fact ? ANCHOR_H : 0) + 10} textAnchor="middle" fontSize={ANCHOR_FONT} className="cc-bpmn-anchor font-cc-mono fill-cc-ink-muted">
        {anchor}
      </text>
      {node.tag === 'subProcess' && !node.multiInstance && (
        <g className="stroke-cc-ink-muted" strokeWidth={1.3}>
          <rect x={cx - 7} y={y + height - 16} width={14} height={14} rx={2} className="fill-cc-surface" />
          <path d={`M${cx - 4} ${y + height - 9} H${cx + 4} M${cx} ${y + height - 13} V${y + height - 5}`} />
        </g>
      )}
      {node.multiInstance && (
        <path
          d={`M${cx - 6} ${y + height - 16} V${y + height - 4} M${cx} ${y + height - 16} V${y + height - 4} M${cx + 6} ${y + height - 16} V${y + height - 4}`}
          className="stroke-cc-ink-muted"
          strokeWidth={1.8}
        />
      )}
    </g>
  );
}

export interface BpmnPlaneSvgProps {
  plane: LandingPlane;
  /** Unique per page: the id of the arrow marker. */
  idPrefix: string;
  /** Collapsed sub-processes become buttons (`data-opens`) — the process explorer wires them. */
  interactive?: boolean;
  /** Drawing scale on a wide screen; the scroller keeps it from shrinking on a phone. */
  scale?: number;
  /** Shrink to the box's width instead (the top-to-bottom drawing on a phone). */
  fit?: boolean;
  /** With `fit`: never taller than this, in px — the drawing shrinks to both. */
  maxHeight?: number;
  title: string;
}

export default function BpmnPlaneSvg({ plane, idPrefix, interactive = false, scale = 1, fit = false, maxHeight, title }: BpmnPlaneSvgProps) {
  const { frame } = plane;
  const arrow = `${idPrefix}-arrow`;
  const messageArrow = `${idPrefix}-msg`;
  const hosts = plane.nodes.filter((n) => n.tag !== 'boundaryEvent');
  const boundaries = plane.nodes.filter((n) => n.tag === 'boundaryEvent');
  return (
    <svg
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      width={Math.round(frame.width * scale)}
      height={Math.round(frame.height * scale)}
      className={fit ? 'block h-auto w-full' : 'block h-auto max-w-none'}
      style={fit ? { maxWidth: Math.round(frame.width * scale), maxHeight } : { minWidth: Math.round(frame.width * scale * 0.9) }}
      role="group"
      aria-label={title}
      data-bpmn-plane={plane.id}
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" className="fill-cc-ink-muted" />
        </marker>
        <marker id={messageArrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L10 5 L0 10 Z" className="fill-cc-surface stroke-cc-ink-muted" strokeWidth={1.2} />
        </marker>
      </defs>

      {plane.pools.map((p) => (
        <g key={p.id} aria-hidden="true">
          <rect x={p.box.x} y={p.box.y} width={p.box.width} height={p.box.height} rx={4} className="fill-cc-surface-muted stroke-cc-ink-muted" strokeWidth={1.3} />
          <text x={p.box.x + 20} y={p.box.y + p.box.height / 2 + 5} fontSize={13} fontWeight={600} className="fill-cc-ink">
            {`External system · ${p.name}`}
          </text>
          <text x={p.box.x + p.box.width - 20} y={p.box.y + p.box.height / 2 + 5} textAnchor="end" fontSize={12} className="fill-cc-ink-muted">
            collapsed pool · CALL FUNCTION … DESTINATION
          </text>
        </g>
      ))}

      <g aria-hidden="true" className="fill-none stroke-cc-ink-muted">
        {plane.associations.map((points, i) => (
          <path key={`as${i}`} d={path(points)} strokeWidth={1.2} strokeDasharray="2 4" />
        ))}
        {plane.flows.map((f) => (
          <path key={f.id} d={path(f.points)} strokeWidth={1.5} markerEnd={`url(#${arrow})`} />
        ))}
        {plane.messages.map((m) => (
          <path key={m.id} d={path(m.points)} strokeWidth={1.3} strokeDasharray="6 4" markerEnd={`url(#${messageArrow})`} />
        ))}
      </g>
      <g aria-hidden="true">
        {plane.flows.map((f) => (f.label ? (
          <g key={`l${f.id}`}>
            <title>{f.condition}</title>
            <LabelText label={f.label} muted />
          </g>
        ) : null))}
      </g>

      {plane.stores.map((s) => {
        const { x, y, width, height } = s.box;
        return (
          <g key={s.id} role="img" aria-label={`Table ${s.table}`}>
            <path
              d={`M${x} ${y + 8} A${width / 2} 8 0 0 1 ${x + width} ${y + 8} V${y + height - 8} A${width / 2} 8 0 0 1 ${x} ${y + height - 8} Z`}
              className="fill-cc-surface stroke-cc-ink-muted"
              strokeWidth={1.3}
            />
            <path d={`M${x} ${y + 8} A${width / 2} 8 0 0 0 ${x + width} ${y + 8}`} className="fill-none stroke-cc-ink-muted" strokeWidth={1.3} />
            {s.label && <LabelText label={s.label} muted />}
          </g>
        );
      })}

      {hosts.map((n) => (
        <Node key={n.id} node={n} interactive={interactive} />
      ))}
      {boundaries.map((n) => (
        <Node key={n.id} node={n} interactive={interactive} />
      ))}
    </svg>
  );
}
