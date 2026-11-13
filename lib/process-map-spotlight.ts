/**
 * "Showing: … · Clear" — a chart row under the map lights the elements it counts on the map (plan
 * `docs/design/analyze-business-first-plan.md` §4.2, AB-7; mockup states 8 and 9).
 *
 * The same pattern as `requestProcessWalk` (`lib/process-walk-request.ts`): the map is loaded on demand and lives in
 * another part of the page, so the two talk through one window event instead of a shared React state — no context,
 * no store. Both ways:
 *
 *   - the map announces the model it draws (`announceProcessMapModel`), and the charts read it from there, so they
 *     count exactly the elements the reader can find on the map, by the map's own ids;
 *   - a chart row asks for a spotlight (`requestMapSpotlight`), the map lights it and shows "Showing: … · Clear", and
 *     *Clear* — on the map or by pressing the row again — sends `null`, which both sides hear.
 *
 * Every message carries the project it was made for, so a message left over from one project never acts on
 * another's map. Nothing is stored: it lives in this tab, for this page.
 */
import type { ProcessMapModel } from './process-map';

export const MAP_MODEL_EVENT = 'cc:process-map-model';
export const MAP_SPOTLIGHT_EVENT = 'cc:process-map-spotlight';

export interface MapSpotlight {
  /** What the map says it is showing — the row's label. */
  label: string;
  /** The map's element ids to light. */
  ids: readonly string[];
  /** The row it came from, so the chart can mark it pressed. */
  key: string;
}

let model: { projectId: string; model: ProcessMapModel } | null = null;
let spotlight: { projectId: string; spotlight: MapSpotlight } | null = null;

const announce = (name: string) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
};

/** The map has drawn (or dropped) its model. */
export function announceProcessMapModel(projectId: string, next: ProcessMapModel | null): void {
  if (!projectId) return;
  if (next === null) {
    if (model?.projectId !== projectId) return;
    model = null;
  } else {
    if (model && model.projectId === projectId && model.model === next) return;
    model = { projectId, model: next };
  }
  // A new model has other ids: a spotlight from the old one would light nothing it means.
  if (spotlight?.projectId === projectId) spotlight = null;
  announce(MAP_MODEL_EVENT);
  announce(MAP_SPOTLIGHT_EVENT);
}

/** The model the map of this project draws, or null while it has none. */
export function currentProcessMapModel(projectId: string): ProcessMapModel | null {
  return model && model.projectId === projectId ? model.model : null;
}

/** Light these elements on the map — or, with null, clear what is lit. */
export function requestMapSpotlight(projectId: string, next: MapSpotlight | null): void {
  if (!projectId) return;
  if (next === null && spotlight?.projectId !== projectId) return;
  spotlight = next ? { projectId, spotlight: next } : null;
  announce(MAP_SPOTLIGHT_EVENT);
}

/** What the map of this project shows lit, or null. */
export function currentMapSpotlight(projectId: string): MapSpotlight | null {
  return spotlight && spotlight.projectId === projectId ? spotlight.spotlight : null;
}

/**
 * What a highlight lights: the elements, and every collapsed step that holds one of them — so a stop inside a
 * sub-process shows on the level above too, at the step a reader opens to see it.
 */
export function spotlightSet(model: Pick<ProcessMapModel, 'elements'>, ids: readonly string[]): Set<string> {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const out = new Set<string>();
  for (const id of ids) {
    let current = byId.get(id);
    let guard = 0;
    while (current && guard < 64) {
      out.add(current.id);
      current = current.plane ? byId.get(current.plane) : undefined;
      guard += 1;
    }
  }
  return out;
}

/** The level a highlight is best seen on: the one level every element shares (null for the top), else undefined: stay where the reader is. */
export function spotlightPlane(model: Pick<ProcessMapModel, 'elements'>, ids: readonly string[]): string | null | undefined {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const planes = new Set(ids.map((id) => byId.get(id)?.plane ?? null));
  return planes.size === 1 ? [...planes][0] : undefined;
}
