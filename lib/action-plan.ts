/**
 * The action plan a run's model returned, or `null` when it returned none.
 *
 * An empty list, a list of blank strings or a value that is not a list is
 * "none": the analyze page then shows its generic guidance and says so, and it
 * must not label that guidance a model proposal (QA 18c913d26e13 — `[]` is
 * truthy, so a plain `||` fallback treated an empty plan as the model's).
 */
export function modelActionPlan(plan: unknown): string[] | null {
  if (!Array.isArray(plan)) return null;
  const steps = plan.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  return steps.length > 0 ? steps : null;
}
