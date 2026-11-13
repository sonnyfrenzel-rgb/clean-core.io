/**
 * Interface text of the map's full screen on Analyze, Business — the bar, the side column and editing behind "Edit"
 * (plan `docs/design/analyze-business-first-plan.md` §4.2, AB-5; mockup `docs/roadmap/analyze-business-first-mockup.html`,
 * states 14, 15 and 16; ADR-119).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings only; a sentence with a number in it is a
 * function beside the object.
 */
export const ANALYZE_FULLSCREEN_MESSAGES = {
  'fullScreen.dialogLabel': 'Process map, full screen',
  'fullScreen.barLabel': 'Map tools, full screen',
  'fullScreen.findPlaceholder': 'Find a step',
  'fullScreen.overview': 'Overview map',
  'fullScreen.edit': 'Edit',
  // P3: modelling by touch is not offered on a phone (DESIGN.md §5.7).
  'fullScreen.editPhone': 'Editing needs a larger screen. Here you can read the map and its steps.',
  // N8: editing in full screen saves a revision, never over the reconstruction.
  'fullScreen.editNote': 'Editing a draft. The reconstructed as-is process (revision 1) stays unchanged whatever you save.',
  'fullScreen.saveAsRevision': 'Save as revision',
  'fullScreen.railLabel': 'Beside the map',
  'fullScreen.nothingTitle': 'Nothing selected',
  'fullScreen.nothingBody': 'Click a step to see its code lines.',
  'fullScreen.hitsHint': 'Click a hit to jump to it on the map.',
  'fullScreen.hitsLabel': 'Steps found',
} as const;

/** "3 steps match “order”" — the side column's heading while a search is typed. */
export function fullScreenHits(count: number, query: string): string {
  if (count === 0) return `No step matches “${query}”`;
  return `${count} ${count === 1 ? 'step matches' : 'steps match'} “${query}”`;
}
