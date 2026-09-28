/**
 * What the model returned for the solution design, checked before it is stored.
 *
 * Pure and import-free on purpose: the design page is a client component and
 * the spec runs it without a browser.
 *
 * The design page used to store any non-empty answer as the design, with
 * `status: 'designed'` — `{}`, a truncated object, prose, an object whose
 * sections were strings. The renderer then painted an empty design as if it
 * were one, and every later stage was built on it (QA full review of
 * fc787674705f, 6a5a3b3546de). A reply that does not have the shape the prompt
 * asked for is now a failed generation, and the stored design stays what it was.
 */

/** The model's JSON, with the wrappers and comments models like to add removed. */
export function cleanAndParseJSON(str: string): unknown {
  let cleaned = str.trim();

  // 1. Extract JSON block if wrapped in markdown
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // 2. Strip multi-line comments: /* ... */
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Strip single-line comments: // ..., but preserve URLs like http://, https://
  cleaned = cleaned.replace(/(?<!:)\/\/.*$/gm, '');

  // 4. Strip trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** An array whose every entry passes `entry` — absent counts only where `optional`. */
function listOf(value: unknown, entry: (e: unknown) => boolean, optional = false): boolean {
  if (value === undefined || value === null) return optional;
  return Array.isArray(value) && value.every(entry);
}

export type DesignCheck = { ok: true } | { ok: false; reason: string };

/**
 * Does this reply have the shape of the `DesignData` the prompt asked for?
 *
 * Strict where the page cannot render an answer honestly — an object at the
 * top, the overview and the blueprint as objects, a non-empty approach, a
 * roadmap with at least one phase, and every list a list of entries — and
 * lenient where the renderer already copes: missing optional strings default,
 * and a project-structure entry may be a bare path string.
 */
export function checkDesignResponse(text: string): DesignCheck {
  let data: unknown;
  try {
    data = cleanAndParseJSON(text);
  } catch {
    return { ok: false, reason: 'The model did not return valid JSON.' };
  }
  if (!isObject(data)) return { ok: false, reason: 'The model did not return a design object.' };

  const overview = data.architectureOverview;
  if (!isObject(overview) || !nonEmptyString(overview.approachDescription)) {
    return { ok: false, reason: 'The design has no architecture overview.' };
  }
  for (const key of ['nodeFramework', 'runtimePlatform'] as const) {
    if (overview[key] !== undefined && typeof overview[key] !== 'string') {
      return { ok: false, reason: `architectureOverview.${key} is not text.` };
    }
  }

  const blueprint = data.nodeAppBlueprint;
  if (!isObject(blueprint)) return { ok: false, reason: 'The design has no application blueprint.' };
  if (!listOf(blueprint.projectStructure, (e) => isObject(e) || typeof e === 'string', true)) {
    return { ok: false, reason: 'nodeAppBlueprint.projectStructure is not a list of entries.' };
  }
  if (!listOf(blueprint.apiEndpoints, isObject, true)) {
    return { ok: false, reason: 'nodeAppBlueprint.apiEndpoints is not a list of entries.' };
  }

  if (data.dataSync !== undefined && !isObject(data.dataSync)) {
    return { ok: false, reason: 'dataSync is not an object.' };
  }
  for (const key of ['cloudServices', 'securityHardening', 'sapStandardApiMapping'] as const) {
    if (!listOf(data[key], isObject, true)) return { ok: false, reason: `${key} is not a list of entries.` };
  }
  if (!Array.isArray(data.roadmap) || data.roadmap.length === 0 || !data.roadmap.every(isObject)) {
    return { ok: false, reason: 'The design has no roadmap.' };
  }
  return { ok: true };
}
