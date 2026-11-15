/**
 * Interface text of the two charts under the map in Analyze, Business — `components/analyze/ProcessFactCharts.tsx`
 * and the map's "Showing: … · Clear" (plan `docs/design/analyze-business-first-plan.md` §4.2, AB-7; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, states 8 and 9).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings only. The charts' sentences, rows and
 * counts are not here: they are the engine's facts (`lib/process-fact-charts.ts`), data like a rule or a line.
 */
export const FACT_CHARTS_MESSAGES = {
  'factCharts.regionLabel': 'Charts of the process',
  'factCharts.endsTitle': 'How a case can end',
  'factCharts.endsFoot': 'Counted from the end events on the map',
  'factCharts.dataTitle': 'What it changes, what it only reads',
  'factCharts.dataFoot': 'Changes a run reaches; reads anywhere in the code',
  'factCharts.changes': 'Changes',
  'factCharts.onlyReads': 'Only reads',
  'factCharts.lines': 'Lines',
  'factCharts.sourceLine': 'Source line',
  'factCharts.showOnMap': 'Show on the map',
  'factCharts.notOnMap': 'not drawn on the map',
  'factCharts.showing': 'Showing:',
  'factCharts.clear': 'Clear',
  'factCharts.clearLabel': 'Clear the highlight on the map',
} as const;

/** The lines a chart's foot leaves out after the first ones — every one of them is still lit by its row. */
export function factChartsMoreLines(n: number): string {
  return `and ${n} more ${n === 1 ? 'line' : 'lines'}`;
}
