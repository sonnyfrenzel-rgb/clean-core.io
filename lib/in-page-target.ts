/**
 * Goes to a place on the current page: for a path `#id` whose element is on the page, scrolls it into view and puts
 * the focus on its first choice (or on the element itself) and answers true. Anything else answers false, and the
 * caller navigates instead.
 *
 * Why not assign the hash: assigning the hash the address already carries does nothing, so a button that pointed at
 * a place on its own page looked dead.
 *
 * Self-contained on purpose (no imports, no module-level names), so a spec can run this very function in a browser
 * page from its source.
 */
export function focusInPageTarget(path: string, doc: Document): boolean {
  if (!path.startsWith('#')) return false;
  const target = doc.getElementById(path.slice(1));
  if (!target) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // A choice first, wherever it stands in the section; only without one the first button or link.
  const choice =
    target.querySelector<HTMLElement>('[data-option-choose], [data-option-choose-design]') ??
    target.querySelector<HTMLElement>('button, a[href]');
  (choice ?? target).focus({ preventScroll: true });
  return true;
}
