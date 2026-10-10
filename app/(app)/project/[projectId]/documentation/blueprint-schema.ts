/**
 * The shape checks of the Documentation stage's stored model text.
 *
 * Roadmap 3.0.7 ("Documentation lean"): the legacy blueprint — the L1–L4 JSON a
 * model wrote before 3.0.5 — is no longer drawn. Its data is kept and offered
 * for download as it was stored, so nothing reads its fields any more and the
 * check of its shape (`checkBlueprintShape`, QA 0d8443fae823 / 58201e6aaedb)
 * went with the rendering it protected.
 *
 * What stays is the business layer's check: the SOP and RACI layer is still
 * written by a model and drawn on the stage, and its lists are read with `.map`.
 */

/** A plain `{…}` — not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const typeName = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
};

/** Every field this module insists on, in the words the reader sees. */
export type BlueprintProblem = string;

export interface BlueprintCheck {
  ok: boolean;
  /** Empty when `ok`. One sentence per field that has the wrong type. */
  problems: BlueprintProblem[];
}

/** A value React can put on the screen. */
const isRenderable = (value: unknown): boolean => typeof value === 'string' || typeof value === 'number';

/** The refusal, for a process documentation an earlier build stored in a form this stage cannot read. */
export const STORED_BLUEPRINT_REJECTED =
  'A blueprint is stored for this project, but it does not have the shape this stage can display, so it is not shown. ' +
  'Why it was stored in this form is not recorded. Generating again replaces it.';

/**
 * The fields of each business-layer list the stage and the Confluence export
 * put on the screen. Absent is allowed (the page prints a placeholder or
 * nothing); present and not renderable is not.
 *
 * `audit_controls` and `kpiTarget` are what a layer written before 3.0.7
 * carries: the prompt no longer asks for them (roadmap 3.0.7, "Documentation
 * lean"), so the list may be missing; where it is stored it is still checked,
 * because it is still data of the project.
 */
const BUSINESS_LISTS = {
  raci_matrix: ['stepId', 'r', 'a', 'c', 'i'],
  sop_details: ['stepId', 'narrative', 'businessException', 'kpiTarget'],
  audit_controls: ['stepId', 'controlObjective', 'mitigationAction', 'assertionMethod'],
} as const;

/** Lists a layer may leave out: written before 3.0.7 only. */
const OPTIONAL_LISTS: ReadonlySet<string> = new Set(['audit_controls']);

/**
 * Does this parsed business layer have the shape the Business tab renders?
 *
 * The three lists are read with `.map`, so each must be an array — a truthy
 * object or string used to pass the old truthiness check, get stored, and
 * take the tab down on every load (QA review of fc787674705f, 69cb77382430).
 */
export function checkBusinessDocShape(parsed: unknown): BlueprintCheck {
  if (!isPlainObject(parsed)) {
    return { ok: false, problems: [`The business layer is ${typeName(parsed)}, not a JSON object.`] };
  }
  const problems: BlueprintProblem[] = [];
  for (const [list, fields] of Object.entries(BUSINESS_LISTS)) {
    const value = parsed[list];
    if (value === undefined && OPTIONAL_LISTS.has(list)) continue;
    if (!Array.isArray(value)) {
      problems.push(
        value === undefined ? `\`${list}\` is missing.` : `\`${list}\` is ${typeName(value)}, not a list.`,
      );
      continue;
    }
    value.forEach((entry, i) => {
      if (!isPlainObject(entry)) {
        problems.push(`\`${list}[${i}]\` is ${typeName(entry)}, not an object.`);
        return;
      }
      for (const field of fields) {
        if (entry[field] !== undefined && entry[field] !== null && !isRenderable(entry[field])) {
          problems.push(`\`${list}[${i}].${field}\` is ${typeName(entry[field])}, not text.`);
        }
      }
    });
  }
  return { ok: problems.length === 0, problems };
}
