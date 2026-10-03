/**
 * Interface text of the IT view's rework of 03.10.2026 — `components/workspace/
 * ItAnswers.tsx` and `ItRail.tsx`: the one state at the top, the four figures,
 * "What the code uses" and the flattened sections.
 *
 * Its own part (and its own `itv.` surface) so it does not touch the 3.0 IT
 * keys in `workspace-answers.ts`, which the Management view shares a file with.
 * The headline and reason of each state are derived in `lib/it-state.ts`, from
 * the evidence, and are not in here.
 */
export const WORKSPACE_IT_MESSAGES = {
  'itv.factUses': 'Uses in the code',
  'itv.factFindings': 'Places with a finding',
  'itv.factLevels': 'Levels of what it uses',
  'itv.factNotDetermined': 'Not determined',
  'itv.factNotRecorded': 'Not recorded',
  'itv.factShow': 'Show',
  'itv.levelsNone': 'No object to grade',
  'itv.levelsCoverage': 'one level per use, from the catalog of the target profile',
  'itv.ndCoverage': 'each with its reason and line',
  'itv.ndNone': 'every construct the engine saw is assessed',
  'itv.findingsNone': 'no detector raised a finding',

  'itv.usesTitle': 'What the code uses',
  'itv.usesLead':
    'Every object the code calls, reads or writes, with the clean core level SAP’s catalog gives it under the target profile. The level describes the object; a finding is a separate statement and has its own list.',
  'itv.usesNotRecorded': 'This answer does not record what the code uses.',
  'itv.usesCaption': 'Objects the code uses, with the use, the lines and the clean core level',
  'itv.colObject': 'Object',
  'itv.colUse': 'Use',
  'itv.colLines': 'Lines',
  'itv.colLevel': 'Level',
  'itv.colCatalog': 'SAP catalog',
  'itv.colFinding': 'Finding',
  'itv.useCall': 'called',
  'itv.useRead': 'read',
  'itv.useWrite': 'written',
  'itv.useUse': 'used',
  'itv.remote': 'remote call (DESTINATION)',
  'itv.custom': 'your own',
  'itv.basisCatalog': 'SAP lists it',
  'itv.basisResidual': 'SAP object SAP does not list',
  'itv.basisOwn': 'your own object',
  'itv.basisFinding': 'the level of the finding on this line',
  'itv.basisHeuristic': 'estimated',
  'itv.noFinding': 'none',
  'itv.levelNotAsked': 'not asked',

  'itv.findingsTitle': 'Findings',
  'itv.findingsLead':
    'Each place where a detector raised a finding, with its line, both SAP catalog views, its level and its target. Choose a row to follow its chain from requirement to target.',
  'itv.chainHeading': 'Chain',

  'itv.ndTitle': 'Not determined',
  'itv.ndLead':
    'What the engine saw but does not judge, with the reason and the line. A limit of the engine, not a defect in the code.',

  'itv.importsTitle': 'Imports',
  'itv.importsNoneSummary': 'No ATC results and no usage data imported — both are optional and come from Analyze.',
} as const;

/**
 * "3 calls · 0 read · 0 written" — the coverage line of the uses figure, with
 * "· 1 other use" when a finding names an object no call, read or write
 * reached, so the parts add up to the figure.
 */
export function itvUsesCoverage(calls: number, reads: number, writes: number, others = 0): string {
  const base = `${calls} ${calls === 1 ? 'call' : 'calls'} · ${reads} read · ${writes} written`;
  return others > 0 ? `${base} · ${others} other ${others === 1 ? 'use' : 'uses'}` : base;
}

/** "B 1 · C 2" — the level figure, as text so no meaning rests on colour. */
export function itvLevelCounts(levels: ReadonlyArray<{ grade: string; count: number }>): string {
  return levels.map((l) => `${l.grade} ${l.count}`).join(' · ');
}

/**
 * The button under the findings that shows the places naming no object — short,
 * because a button does not wrap on a phone; the level sentence beside the
 * table says why they carry no level.
 */
export function itvNoLevelLabel(n: number): string {
  return `Show ${n} ${n === 1 ? 'place' : 'places'} without a level`;
}

/** "Show all 12 objects" is the table's; this is the line anchor's accessible name. */
export function itvLineLabel(object: string, line: number): string {
  return `${object}, source line ${line}`;
}
