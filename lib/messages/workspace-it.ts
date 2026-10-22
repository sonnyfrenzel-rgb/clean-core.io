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
  'itv.factOpenQuestions': 'Open questions',
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


  'itv.importsTitle': 'Imports',
  'itv.importsNoneSummary': 'No ATC results and no usage data imported — both are optional and come from Analyze.',

  // The IT view's own sections (owner decision 10.10.2026, ADR-086): its
  // anchor bar, the merged objects table, Run & trust and the links out.
  'itv.anchorsLabel': 'Sections of the IT view',
  'itv.anchorFindings': 'Findings',
  'itv.anchorObjects': 'Objects & dependencies',
  'itv.anchorQuestions': 'Open questions',
  'itv.anchorRoute': 'Route',
  'itv.anchorTrust': 'Run & trust',
  'itv.anchorStandard': 'Touches SAP standard',
  'itv.anchorNone': 'none',
  'itv.anchorSigned': 'signed',
  // Stage 1 of the fit-to-standard approach (owner decision 22.10.2026, `StandardTouchCard`).
  'itv.touchTitle': 'Where this program touches SAP standard',
  'itv.touchReading': 'Reading the findings…',
  'itv.touchGate': 'Worth examining against SAP standard?',
  'itv.touchAreas': 'SAP areas it works in',
  'itv.touchAreasNone': 'No SAP application area is recorded for the SAP objects it uses.',
  'itv.touchAreasNotRecorded': 'The SAP areas are not in this reading of the findings yet. Reload the page to read them.',
  'itv.touchDepartures': 'How it departs from SAP standard',
  'itv.touchDeparturesNone': 'The engine read no departure of these kinds.',
  'itv.touchNotSigned': 'Derived when shown, from the findings of the signed run. Never stored or signed.',
  // Stage 2: the guided check and the workshop package (`FitCheckPanel`).
  'itv.checkTitle': 'Fit-to-standard check',
  'itv.checkAnswer': 'Answer',
  'itv.checkChoose': 'Choose an answer',
  'itv.checkSave': 'Save the answers',
  'itv.checkSaving': 'Saving…',
  'itv.checkNothingToSave': 'Choose an answer for at least one rule first.',
  'itv.checkNoRules': 'The engine derived no business rule from this program, so there is no rule to ask about.',
  'itv.checkReading': 'Reading the rule answers…',
  'itv.checkUnreadable': 'The rule answers could not be read, so the check cannot be shown.',
  'itv.checkReadOnly': 'Only the owner of the project records answers. You see what is on record.',
  'itv.checkDemo': 'In the demo nothing is recorded: the check asks its questions in a project of your own. The workshop package below works here too.',
  'itv.checkBeside': 'Beside a departure',
  'itv.checkElsewhere': 'Answered in Design',
  'itv.checkUnlinked': 'Departures no rule stands on — on the workshop agenda',
  'itv.checkConditions': 'Open for Move to SAP standard',
  'itv.checkPackage': 'Workshop package',
  'itv.checkPackageLead': 'For your own fit-to-standard workshop in SAP Signavio or SAP Cloud ALM: the agenda with the departures and open questions, and the reconstructed process as BPMN 2.0.',
  'itv.checkAgendaWord': 'Agenda (Word)',
  'itv.checkAgendaMarkdown': 'Agenda (Markdown)',
  'itv.checkProcessBpmn': 'Process (BPMN)',
  'itv.checkExportFailed': 'The file could not be written. Try again.',

  'itv.objectsTitle': 'Objects & dependencies',
  'itv.objectsLead':
    'The program’s own objects and everything the code calls, reads or writes — one row per object and use, with its lines, the clean core level SAP’s catalog gives it under the target profile, and the successor a finding names. The level describes the object; a finding is a separate statement and has its own list.',
  'itv.objectsNotRecorded': 'Neither the program’s own objects nor what the code uses are recorded for this project.',
  'itv.objectsCaption': 'Own objects and the objects the code uses, with owner, use, lines, clean core level and successor',
  'itv.colOwner': 'Own or SAP',
  'itv.colUsedBy': 'Used by',
  'itv.colSuccessor': 'Successor',
  'itv.ownerOwn': 'Own',
  'itv.ownerSap': 'SAP',
  'itv.ownerUndetermined': 'Not determined',
  'itv.ownerUndeterminedWhy': 'reserved namespace — the name does not say whose',
  'itv.useDefined': 'defined here',
  'itv.useWriteBatchInput': 'written (batch input)',
  'itv.useWriteBatchInputSome': 'written, partly through batch input',
  'itv.usedByOutside': 'outside the listed own objects',
  'itv.usedByOwn': 'own object',
  'itv.successorNone': 'no finding names one',
  'itv.successorNoneNote': '— under Successor: no finding on that object names a successor.',

  // The dependency graph beside the table (roadmap after 3.0.7, item 3) —
  // `components/workspace/ItDependencyGraph.tsx`, model `lib/it-dependency-graph.ts`.
  'itv.graphTitle': 'Dependency graph',
  'itv.graphLead':
    'The rows of the table below as a picture: the program and its own objects on the left, what they call, read or write on the right, and on each line between them the use and its lines. Select a node or a label to go to its row. The table is the complete answer and the text version of this picture.',
  'itv.graphLabel': 'Dependency graph of the program and the objects it uses',
  'itv.graphToTable': 'Go to the table',
  'itv.graphProgram': 'The program',
  'itv.graphProgramKind': 'program — uses outside a listed own object',
  'itv.graphScroll': 'The picture scrolls sideways.',
  'itv.graphNotAsked': 'level not asked',

  'itv.trustTitle': 'Run & trust',
  'itv.trustRun': 'Analysis run',
  'itv.trustFingerprint': 'Source fingerprint',
  'itv.trustPack': 'Audit pack',
  'itv.trustPackNone': 'not exported for this run',
  'itv.trustVersions': 'Engine, rules and catalog versions stand under Details in the header.',
  'itv.trustVerify': 'Verify or download in Delivery',
  'itv.trustNone': 'No signed run — every figure on this page derives from one. Analyze signs it.',
  'itv.trustUnreadable': 'A signed run is on record and could not be read, so what it proves is not determined.',
  'itv.trustDemo': 'A demo is never signed: there is no run, fingerprint or audit pack to check.',

  'itv.elsewhereLabel': 'Answered in the other views',
  'itv.elsewhereProcess': 'Process & rules → Business',
  'itv.elsewhereCosts': 'Costs → Economics',
  'itv.elsewhereDecision': 'Decision → Management',

  // The owner's target change in the profile box (owner, 06.10.2026) —
  // `components/workspace/TargetChange.tsx`.
  'tgt.change': 'Change target',
  // The release a start screen asks a Private Edition project for
  // (`components/TargetEditionChoice.tsx`, `lib/start-release-handoff.ts`).
  'tgt.releaseLabel': 'Release (optional)',
  'tgt.releaseLatest': 'Not sure — use SAP’s latest list',
  'tgt.releaseHelp':
    'A named release reads SAP’s list for exactly that release; the latest list can grade an object differently. Change it later with Change target.',
  'tgt.dialogTitle': 'Change the target',
  'tgt.dialogLead':
    'The target decides the levels, the buckets, the route and everything built on them. A change is a new signed analysis run under the new target.',
  'tgt.stepChoose': 'Step 1 of 2 · Choose the target',
  'tgt.stepImpact': 'Step 2 of 2 · What this changes',
  'tgt.currentLabel': 'Current target',
  'tgt.nextLabel': 'New target',
  'tgt.unchanged': 'This is the current target. Choose another edition or release to continue.',
  'tgt.next': 'Next',
  'tgt.back': 'Back',
  'tgt.cancel': 'Cancel',
  'tgt.confirm': 'Change target and re-run analysis',
  'tgt.bucketsTitle': 'Buckets',
  'tgt.bucketsNone': 'No object changes bucket between the two editions.',
  'tgt.bucketsReading': 'Reading the buckets of both editions…',
  'tgt.bucketsSameEdition':
    'Same edition, another release: which objects change bucket is read when the new run is signed — not determined before it.',
  'tgt.outdatedTitle': 'Becomes outdated',
  'tgt.outdatedNone': 'Nothing is built on the analysis yet, so no tool becomes outdated.',
  'tgt.outdatedNote':
    'Nothing is deleted. Each tool shows its work as built for a previous target profile until it is done again.',
  'tgt.decisionConfirmed': 'confirmed — shown as outdated until it is confirmed again on the new analysis',
  'tgt.decisionDraft': 'draft — drafted again on the new analysis',
  'tgt.costTitle': 'Cost',
  'tgt.stepNarrative': 'Writing the analysis narrative…',
  'tgt.stepSigning': 'Signing the new analysis run…',
  'tgt.reloading': 'Target changed. Reloading the project…',
  'tgt.failedHeadline': 'The target was not changed.',
  'tgt.noticeOutdated': 'Built for the previous target:',
  'tgt.noticeDecision': 'Decision',
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

/**
 * "38 own objects · 26 tables accessed · 3 calls" — the count line of Objects
 * & dependencies. Distinct tables and distinct called objects, said as such:
 * the 3.0 layer called every table a "dependency" and left the calls out.
 */
export function itvObjectsCount(own: number, tables: number, calls: number): string {
  return [
    `${own} own ${own === 1 ? 'object' : 'objects'}`,
    `${tables} ${tables === 1 ? 'table' : 'tables'} accessed`,
    `${calls} ${calls === 1 ? 'call' : 'calls'}`,
  ].join(' · ');
}

/** "L120–L184" — an own object's line range, or its first line. */
export function itvRange(start: number, end: number | null): string {
  return end !== null && end > start ? `L${start}–L${end}` : `L${start}`;
}

/** "0a1b2c3d · 2026-10-09" — the signed run, with its day where recorded. */
export function itvRunLine(id: string, day: string | null): string {
  return day ? `${id} · ${day}` : id;
}

/** "Exported 2026-10-09". */
export function itvPackExported(day: string): string {
  return `Exported ${day}`;
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "L61, L98" or "L61 +3" — the lines on an edge's label, at most two. */
function graphLines(lines: readonly number[]): string {
  if (lines.length === 0) return 'lines not recorded';
  if (lines.length <= 2) return lines.map((l) => `L${l}`).join(', ');
  return `L${lines[0]} +${lines.length - 1}`;
}

/** "read · L61, L98" — the visible label of one edge: the table's word for the use, and the lines. */
export function itvGraphEdgeLabel(useWord: string, lines: readonly number[]): string {
  return `${useWord} · ${graphLines(lines)}`;
}

/** "level C", "level Unknown", "level not asked". */
function levelPhrase(level: string | null): string {
  return level === null ? 'level not asked' : `level ${level}`;
}

/** "CHECK_AUTHORITY: EBAN read at lines 61 and 98, level C. Go to its row in the table." */
export function itvGraphEdgeName(from: string, object: string, useWord: string, lines: readonly number[], level: string | null): string {
  const at =
    lines.length === 0
      ? 'lines not recorded'
      : lines.length === 1
        ? `at line ${lines[0]}`
        : `at lines ${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`;
  return `${from}: ${object} ${useWord} ${at}, ${levelPhrase(level)}. Go to its row in the table.`;
}

/** "EBAN, table, level D (worst of its uses). Go to its row in the table." */
export function itvGraphObjectName(object: string, kind: string, level: string | null, uses: number): string {
  const lvl = uses > 1 && level !== null ? `${levelPhrase(level)} (worst of its ${uses} uses)` : levelPhrase(level);
  return `${object}, ${kind}, ${lvl}. Go to its row in the table.`;
}

/** "READ_REQUISITION, Form Routine, L60–L75. Go to its row in the table." */
export function itvGraphSourceName(name: string, kind: string, range: string | null, toRow: boolean): string {
  return `${name}, ${kind}${range ? `, ${range}` : ''}. ${toRow ? 'Go to its row in the table.' : 'Go to the table.'}`;
}

/**
 * "12 of 27 objects · 14 of 28 uses, worst level first" when the graph is
 * capped, "3 objects · 3 uses" when it is whole. A use is a row of the table
 * (object and use) — the count of the view's "Uses" figure.
 */
export function itvGraphShown(objects: number, totalObjects: number, uses: number, totalUses: number): string {
  if (objects === totalObjects && uses === totalUses) {
    return `${plural(objects, 'object', 'objects')} · ${plural(uses, 'use', 'uses')}`;
  }
  return `${objects} of ${plural(totalObjects, 'object', 'objects')} · ${uses} of ${plural(totalUses, 'use', 'uses')}, worst level first`;
}

/** "and 15 more objects — see the table", or the uses where no object was left out. */
export function itvGraphMore(hiddenObjects: number, hiddenUses: number): string {
  if (hiddenObjects > 0) return `and ${hiddenObjects} more ${hiddenObjects === 1 ? 'object' : 'objects'} — see the table`;
  return `and ${hiddenUses} more ${hiddenUses === 1 ? 'use' : 'uses'} — see the table`;
}

/** "Private Edition 2023 FPS03 → Public Edition: 3 objects change bucket". */
export function tgtBucketMoves(from: string, to: string, n: number): string {
  return `${from} → ${to}: ${n} ${n === 1 ? 'object changes' : 'objects change'} bucket`;
}

/** "Z_TABLE_READ: Keep → Rebuild". */
export function tgtBucketMove(object: string, from: string, to: string): string {
  return `${object}: ${from} → ${to}`;
}

/** "Decision DEC-1" — the record the target change leaves behind. */
export function tgtDecisionName(id: string): string {
  return `Decision ${id}`;
}

/** "Target changed from Private Edition 2023 FPS03 to Public Edition on 2026-10-06." */
export function tgtChanged(from: string | null, to: string, day: string): string {
  return from ? `Target changed from ${from} to ${to} on ${day}.` : `Target changed to ${to} on ${day}.`;
}

/** The model line of the target change, when the account's analysis stage is on. */
export function tgtModelOn(seconds: number): string {
  return `Calls the model once for the analysis narrative — not counted against your analysis runs; the change waits for it ${seconds} s at most.`;
}
