/**
 * The project summary — what "My workspace" shows on a program tile without
 * reading anything but the project list (ADR-123 (5), W11; mock-up
 * `docs/roadmap/workspace-two-products-mockup.html`, "Data and speed").
 *
 * **Written by the server only.** `POST /api/runs/create` writes it when a run
 * is signed, and `POST /api/projects/{id}/process-revisions` refreshes its map
 * when a drawing is saved — both through the Admin SDK
 * (`lib/project-summary-server.ts`). `summary` is not on the client allowlist of
 * `firestore.rules`, so no browser can write it; a one-off backfill
 * (`scripts/backfill-project-summary.ts`) gives existing projects one.
 *
 * **Outside the signed run.** Nothing here is signed, nothing goes into a run
 * or an audit pack, and nothing downstream may treat it as evidence — like the
 * clean core level. It is a mirror for a list, bound to the run it was taken
 * from (`runId`): a summary of another run than the project's active one is not
 * shown (`summaryOf`), so a stale mirror can never stand in for the current run.
 *
 * **The thumbnail is geometry, not markup.** The map's top level as a compact
 * string of shapes and lines — no names, no code, no SVG markup — which the
 * tile draws as inline SVG through React (`MapThumb`). Nothing read from the
 * database is ever put into the page as HTML. At most `MAP_THUMB_MAX`
 * characters (the mock-up's 0.5–2.2 kB, proven on the demo map).
 *
 * Pure: no Firestore, no engine. Safe for the browser bundle.
 */

export const PROJECT_SUMMARY_VERSION = 1;

/** The most characters a thumbnail may have; a larger map loses detail first, then the picture. */
export const MAP_THUMB_MAX = 4096;

export interface ProjectSummary {
  version: number;
  /** The run this summary was taken from. Shown only while it is the project's active run. */
  runId: string;
  /** SHA-256 of the source that run analysed. */
  sourceSha256: string;
  /** The map's top level as compact geometry (`mapThumbOf`), or `null` when none could be drawn. */
  mapThumb: string | null;
  /** Elements of the map on every level — the figure the demo calls "process steps". */
  mapSteps: number | null;
  /** The process revision the map was taken from; `1` is the reconstructed as-is process. */
  mapRevision: number;
  /** Rules the engine derived from the source. */
  rulesDerived: number | null;
  /** The clean core score of that run, as the run recorded it. */
  cleanCoreScore: number | null;
  /** The route the run recommended (`originalRecommendation`), the proposed decision's source. */
  recommendation: string | null;
  /**
   * The business name of the process (3.3.0, owner decision 14.11.2026): the source header's title line as the engine
   * reads it (`headerTitleOf`), from engine 3.0.21 on — "Emergency purchase approval" — or `null` where the source has
   * none. Never a model's answer. The tile shows it as its title, with the project's name small below; without it the
   * project's name is the title. Absent in summaries written before it was read (the backfill adds it).
   */
  processTitle: string | null;
  /** ISO time of the write. */
  writtenAt: string;
}

/** The longest business name a summary carries; a longer title line is not a name. */
export const PROCESS_TITLE_MAX = 100;

/** A business name as a tile may show it: one line of text, trimmed, within {@link PROCESS_TITLE_MAX}; else null. */
export function processTitleOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > PROCESS_TITLE_MAX || /[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/.test(text)) return null;
  return text;
}

/* ------------------------------------------------------------------ thumbnail */

const START_TAGS = new Set(['startEvent']);
const END_TAGS = new Set(['endEvent']);
const GATEWAY_TAGS = new Set(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway']);
const CONTAINER_TAGS = new Set(['subProcess', 'callActivity', 'transaction', 'adHocSubProcess']);
const TASK_TAGS = new Set([
  'task',
  'serviceTask',
  'sendTask',
  'receiveTask',
  'userTask',
  'manualTask',
  'businessRuleTask',
  'scriptTask',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
]);

const int = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * The map's top level as compact geometry: `v1;V x y w h;S cx cy;E cx cy;G cx cy;T x y w h;P x y w h;F x y x y…;A x y…`
 * — a start, an end, a decision, a step, a sub-process, a sequence flow, a message flow. Integers only. Lanes, pools,
 * data stores and notes are left out: a thumbnail shows the shape of the process, not its parts.
 */
export function mapThumbOf(xml: string): string | null {
  if (typeof xml !== 'string' || !xml) return null;
  const tagOf = new Map<string, string>();
  for (const m of xml.matchAll(/<bpmn:(\w+)\s[^>]*?\bid="([^"]+)"/g)) tagOf.set(m[2], m[1]);

  const planeStart = xml.indexOf('<bpmndi:BPMNPlane');
  if (planeStart < 0) return null;
  const planeEnd = xml.indexOf('</bpmndi:BPMNPlane>', planeStart);
  const plane = xml.slice(planeStart, planeEnd < 0 ? undefined : planeEnd);

  const shapes: string[] = [];
  const flows: string[] = [];
  const dashed: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const m of plane.matchAll(/<bpmndi:BPMNShape\b([^>]*)>\s*<dc:Bounds\b([^>]*)\/>/g)) {
    const tag = tagOf.get(attr(m[1], 'bpmnElement') ?? '');
    const x = int(attr(m[2], 'x'));
    const y = int(attr(m[2], 'y'));
    const w = int(attr(m[2], 'width'));
    const h = int(attr(m[2], 'height'));
    if (!tag || x === null || y === null || w === null || h === null) continue;
    const cx = Math.round(x + w / 2);
    const cy = Math.round(y + h / 2);
    if (START_TAGS.has(tag)) shapes.push(`S ${cx} ${cy}`);
    else if (END_TAGS.has(tag)) shapes.push(`E ${cx} ${cy}`);
    else if (GATEWAY_TAGS.has(tag)) shapes.push(`G ${cx} ${cy}`);
    else if (CONTAINER_TAGS.has(tag)) shapes.push(`P ${x} ${y} ${w} ${h}`);
    else if (TASK_TAGS.has(tag)) shapes.push(`T ${x} ${y} ${w} ${h}`);
    else continue;
    grow(x, y, w, h);
  }

  for (const m of plane.matchAll(/<bpmndi:BPMNEdge\b([^>]*)>([\s\S]*?)<\/bpmndi:BPMNEdge>/g)) {
    const tag = tagOf.get(attr(m[1], 'bpmnElement') ?? '');
    if (tag !== 'sequenceFlow' && tag !== 'messageFlow') continue;
    const points: number[] = [];
    for (const p of m[2].matchAll(/<di:waypoint\b([^>]*)\/>/g)) {
      const x = int(attr(p[1], 'x'));
      const y = int(attr(p[1], 'y'));
      if (x === null || y === null) continue;
      points.push(x, y);
      grow(x, y);
    }
    if (points.length < 4) continue;
    (tag === 'sequenceFlow' ? flows : dashed).push(`${tag === 'sequenceFlow' ? 'F' : 'A'} ${points.join(' ')}`);
  }

  if (shapes.length === 0 || !Number.isFinite(minX)) return null;
  const pad = 6;
  const view = `V ${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  // Detail goes before the picture does: the message flows, then the flows, then nothing.
  for (const parts of [[...flows, ...dashed], flows, []]) {
    const thumb = ['v1', view, ...parts, ...shapes].join(';');
    if (thumb.length <= MAP_THUMB_MAX) return thumb;
  }
  return null;
}

export type ThumbItem =
  | { kind: 'start' | 'end' | 'gateway'; cx: number; cy: number }
  | { kind: 'task' | 'container'; x: number; y: number; w: number; h: number }
  | { kind: 'flow' | 'message'; points: number[] };

export interface ParsedThumb {
  viewBox: [number, number, number, number];
  items: ThumbItem[];
}

const NUM = /^-?\d{1,7}$/;

/**
 * A stored thumbnail read back — strictly: any token that is not exactly one of the shapes above with whole numbers
 * makes the whole thumbnail unreadable (`null`), and the tile says "Map after the next run" instead.
 */
export function parseMapThumb(thumb: unknown): ParsedThumb | null {
  if (typeof thumb !== 'string' || thumb.length === 0 || thumb.length > MAP_THUMB_MAX) return null;
  const parts = thumb.split(';');
  if (parts[0] !== 'v1') return null;
  let viewBox: ParsedThumb['viewBox'] | null = null;
  const items: ThumbItem[] = [];
  for (const part of parts.slice(1)) {
    const [k, ...rest] = part.split(' ');
    if (!rest.every((r) => NUM.test(r))) return null;
    const n = rest.map(Number);
    if (k === 'V' && n.length === 4 && n[2] > 0 && n[3] > 0) viewBox = [n[0], n[1], n[2], n[3]];
    else if ((k === 'S' || k === 'E' || k === 'G') && n.length === 2) {
      items.push({ kind: k === 'S' ? 'start' : k === 'E' ? 'end' : 'gateway', cx: n[0], cy: n[1] });
    } else if ((k === 'T' || k === 'P') && n.length === 4) {
      items.push({ kind: k === 'T' ? 'task' : 'container', x: n[0], y: n[1], w: n[2], h: n[3] });
    } else if ((k === 'F' || k === 'A') && n.length >= 4 && n.length % 2 === 0) {
      items.push({ kind: k === 'F' ? 'flow' : 'message', points: n });
    } else return null;
  }
  if (!viewBox || items.length === 0) return null;
  return { viewBox, items };
}

/**
 * The smallest area of the map, in BPMN units, a thumbnail ever shows (owner decision 22.11.2026). A small map is
 * drawn at the scale this area would get, centred, never blown up to fill the frame: twenty steps drawn as four
 * collapsed sub-processes used to become four boxes the size of the tile. 600 × 500 is the reference density of the
 * mock-up (`docs/roadmap/workspace-two-products-mockup.html`, whose smallest map is 590 × 503): a step (100 × 80)
 * stays about a fifth of the tile's height. Larger maps are untouched and keep fitting the frame.
 */
export const THUMB_MIN_VIEW: readonly [number, number] = [600, 500];

/** The viewBox a thumbnail is drawn with: the map's own, widened about its centre to at least {@link THUMB_MIN_VIEW}. */
export function thumbDisplayViewBox(viewBox: ParsedThumb['viewBox']): ParsedThumb['viewBox'] {
  const [x, y, w, h] = viewBox;
  const [minW, minH] = THUMB_MIN_VIEW;
  const W = Math.max(w, minW);
  const H = Math.max(h, minH);
  return [x - (W - w) / 2, y - (H - h) / 2, W, H];
}

/* ------------------------------------------------------------------ reading */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The project's summary, if it is one of the project's active run — `null` for a project without one, one of an
 * earlier run, or one that is not shaped as written. What a tile reads; everything else on the tile comes from the
 * project document itself.
 */
export function summaryOf(project: { activeRunId?: unknown; summary?: unknown } | null | undefined): ProjectSummary | null {
  const s = project?.summary as Partial<ProjectSummary> | undefined;
  if (!s || typeof s !== 'object') return null;
  if (typeof project?.activeRunId !== 'string' || !project.activeRunId || s.runId !== project.activeRunId) return null;
  if (s.version !== PROJECT_SUMMARY_VERSION) return null;
  return {
    version: s.version,
    runId: s.runId,
    sourceSha256: typeof s.sourceSha256 === 'string' ? s.sourceSha256 : '',
    mapThumb: typeof s.mapThumb === 'string' ? s.mapThumb : null,
    mapSteps: isNum(s.mapSteps) ? s.mapSteps : null,
    mapRevision: isNum(s.mapRevision) ? s.mapRevision : 1,
    rulesDerived: isNum(s.rulesDerived) ? s.rulesDerived : null,
    cleanCoreScore: isNum(s.cleanCoreScore) ? s.cleanCoreScore : null,
    recommendation: typeof s.recommendation === 'string' ? s.recommendation : null,
    processTitle: processTitleOf(s.processTitle),
    writtenAt: typeof s.writtenAt === 'string' ? s.writtenAt : '',
  };
}
