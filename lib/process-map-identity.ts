import type { ProcessMapModel } from './process-map';

/**
 * Do two map models draw the same elements — the same ids in the same order? A map re-read once its AI names are
 * stored is a new object with new names but the same elements: what was read off the old one (the tour's stations)
 * still points at elements the new one draws, and is kept until it is read again. A map of other code is not.
 */
export function sameMapElements(
  a: Pick<ProcessMapModel, 'elements'> | null | undefined,
  b: Pick<ProcessMapModel, 'elements'> | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.elements.length !== b.elements.length) return false;
  return a.elements.every((element, index) => element.id === b.elements[index].id);
}
