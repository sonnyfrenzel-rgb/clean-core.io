/**
 * Interface text of the IT answer and the Management overview — components/workspace/ItAnswers.tsx, ManagementOverview.tsx.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3,
 * block D, step D.29). Plain strings only; a sentence with a number in it is a
 * function beside the object, so where the number goes is the catalogue's
 * business and not the component's.
 */
export const WORKSPACE_ANSWER_MESSAGES = {
  // ItAnswers
  'it.reading': 'Reading the findings of this project…',
  'it.questionSuffix': '— this one program, read by the engine.',
  'it.chainHint':
    'Selecting a link filters the findings below to the ones whose chain says the same thing there.',
  'it.notDetermined': 'Not determined',
  'it.noChainTitle': 'No chain to follow',
  'it.noChainUnreadable':
    'The findings of this project could not be read, so no chain is shown. An empty chain would say there were none.',
  'it.noChainEmpty': 'This run reported no findings, so there is nothing to trace.',
  'it.levelsTitle': 'Clean core levels across the findings',
  'it.findingsTitle': 'Findings',
  'it.clearFilter': 'Clear filter',
  'it.noFindingsTitle': 'No findings on record',
  'it.noFindingsUnreadable':
    'The findings of this project could not be read. That is not the same as there being none.',
  'it.noFindingsEmpty': 'The engine reported no finding for the source staged on this project.',
  'it.tableCaption': 'Findings, with both SAP catalog views and the clean core level',
  'it.severityNotDetermined': 'not determined',
  'it.successorNone': 'none published',
  'it.finding': 'finding',
  'it.findings': 'findings',
  'it.filteredBy': 'filtered by',
  'it.outOf': 'out of',
  'it.catalogViewsNote':
    'The release view and the classification are the two SAP files, kept apart; the level is their merge.',
  'it.viewNotAsked': 'Not asked — no object',
  'it.colObject': 'Object',
  'it.colLine': 'Line',
  'it.colRelease': 'Release view',
  'it.colClassification': 'Classification',
  'it.colLevel': 'Level',
  'it.colSuccessor': 'Successor API',

  // ManagementOverview
  'mgmt.whatFindings': 'The findings of this project',
  'mgmt.whatDecision': 'The decision of this project',
  'mgmt.lookupFailed':
    'The catalog lookup for these objects failed, so no bucket is concluded rather than one guessed.',
  'mgmt.questionSuffix': '— this one project. No comparison with any other.',
  'mgmt.waitsFor': 'Waits for',
  'mgmt.conditionsCaption': 'Conditions of this decision by status',
  'mgmt.conditionsUnit': 'Condition status',
  'mgmt.conditionsColumn': 'Conditions',
  'mgmt.pointQualifies': 'point qualifies',
  'mgmt.pointsQualify': 'points qualify',
  'mgmt.qualifiersTail': 'it without blocking it — listed on the decision card below.',
  'mgmt.openDecision': 'Open decision',
  'mgmt.publicEditionDecision': 'Public Edition decision',
  'mgmt.notRead': 'Not read:',
  'mgmt.trendLabelLead': 'Clean Core Score by run on rule version',
  'mgmt.on': 'on',
  'mgmt.ruleVersion': 'Rule version:',
  'mgmt.notDeterminedLower': 'not determined',
  'mgmt.trendCaption': 'Clean Core Score of each run on this rule version',
  'mgmt.colDate': 'Date',
  'mgmt.colRun': 'Run',
  'mgmt.colScore': 'Score (0–100)',
  'mgmt.notRecorded': 'not recorded',
  'mgmt.notDeterminedLabel': 'Not determined:',
  'mgmt.run': 'run',
  'mgmt.runs': 'runs',
  'mgmt.break': 'Break:',
  'mgmt.targetPlatform': '— the target platform',
  'mgmt.fourBuckets': 'Four buckets,',
  'mgmt.bucketsCaption': 'Objects per bucket, per edition',
  'mgmt.bucketsUnit': 'Bucket (objects)',
  'mgmt.movesCaption': 'Objects whose bucket depends on the edition',
  'mgmt.colObject': 'Object',
  'mgmt.colPrivate': 'Private Edition',
  'mgmt.colPublic': 'Public Edition',
  'mgmt.levelsChart': 'Clean core levels across the findings',
  'mgmt.levelsCaption': 'Findings per clean core level',
  'mgmt.levelsUnit': 'Level (findings)',
  'mgmt.levelsColumn': 'Findings',
  'mgmt.hideDetail': 'Hide the answers in detail',
  'mgmt.showDetail': 'Show the answers in detail',
  'mgmt.signedOutLead': 'You are signed out, so',
  'mgmt.couldNotBeRead': 'could not be read',

  // ManagementExecutive — the decision panel on top of the Management view
  'exec.questionLabel': 'The decision',
  'exec.thisProgram': 'this program',
  'exec.statusFacet': 'Decision',
  'exec.inTheWay': 'What stands in the way',
  'exec.nothingInTheWay': 'Nothing stands in the way of confirming it.',
  'exec.notYetRead': 'Still being read.',
  'exec.moreLead': 'and',
  'exec.moreTail': 'more, each with its evidence, under the figures',
  'exec.nextStep': 'Next step for the decision',
  'exec.noNextStep': 'Nothing to do for the decision right now.',
  'exec.bucketsTitle': 'Where the objects stand',
  'exec.bucketsChart': 'Objects per bucket on',
  'exec.bucketsListLabel': 'Objects per bucket',
  'exec.objects': 'objects',
  'exec.target': '(target platform)',
  'exec.noTarget': '(no target platform set)',
  'exec.phasesTitle': 'Evidence per phase',
  'exec.phasesNote': 'Green only where something other than your account checked the record.',
  'exec.evidenceBehind': 'The evidence behind these figures',
  'cloudFit.colObject': 'Object',
  'cloudFit.colStatus': 'What is known',
  'cloudFit.colDetail': 'Detail',
  'cloudFit.tableCaption': 'Objects in this bucket',
  'cloudFit.showDetail': 'Show detail for',
  'cloudFit.hideDetail': 'Hide detail for',
  'cloudFit.details': 'Details',
  'cloudFit.hide': 'Hide',
  'cloudFit.toFindOutTag': 'To find out',
  'cloudFit.ruleRetireDrop': 'Confirmed Drop — the object goes away',
  'cloudFit.ruleRetireCandidateZeroUsage': 'No executions recorded — a candidate, not a decision',
  'cloudFit.ruleNoCataloguedPathNoneNamed': 'Listed by SAP, no released successor named',
  'cloudFit.ruleNoCataloguedPathNotListed': 'Not in SAP’s repository files',
  'cloudFit.ruleRebuildOwnWork': 'The project’s own work — the way is known',
  'cloudFit.ruleRebuildPath': 'SAP names a released path',
  'cloudFit.ruleKeepPlatformLevel': 'Permitted on the target platform as it is',
  'cloudFit.reasonLevelNotDetermined': 'Level not determined',
  'cloudFit.reasonTargetPlatformNotSet': 'No target platform set',
  'cloudFit.reasonCatalogEvidenceMissing': 'Catalogue evidence missing',
} as const;

const M = WORKSPACE_ANSWER_MESSAGES;

/**
 * The sentence under the IT findings table. How many rows are on screen is the
 * table's business (its own "Show all N"), so this says how many there are.
 */
export function itFindingsCountLabel(count: number, filterLink: string | null, total: number): string {
  const noun = count === 1 ? M['it.finding'] : M['it.findings'];
  const head = filterLink
    ? `${count} ${noun} ${M['it.filteredBy']} ${filterLink}, ${M['it.outOf']} ${total}`
    : `${count} ${noun}`;
  return `${head}. ${M['it.catalogViewsNote']}`;
}

/** "You are signed out, so The findings of this project could not be read." — wording as before D.29. */
export function mgmtSignedOutReason(what: string): string {
  return `${M['mgmt.signedOutLead']} ${what} ${M['mgmt.couldNotBeRead']}.`;
}

/** "… could not be read (403)." or, without a status, "… could not be read." */
export function mgmtReadFailedReason(what: string, status?: number): string {
  return status === undefined
    ? `${what} ${M['mgmt.couldNotBeRead']}.`
    : `${what} ${M['mgmt.couldNotBeRead']} (${status}).`;
}

export function mgmtQualifiersLabel(n: number): string {
  return `${n} ${n === 1 ? M['mgmt.pointQualifies'] : M['mgmt.pointsQualify']} ${M['mgmt.qualifiersTail']}`;
}

export function mgmtOpenDecisionLabel(identity: string): string {
  return `${M['mgmt.openDecision']} ${identity}`;
}

export function mgmtNotReadLabel(what: string): string {
  return `${M['mgmt.notRead']} ${what}`;
}

export function mgmtBreakLabel(what: string): string {
  return `${M['mgmt.break']} ${what}`;
}

export function mgmtTrendLabel(
  ruleVersion: string | null,
  points: readonly { score: number; date: string | null; runId: string }[],
): string {
  const version = ruleVersion ?? M['mgmt.notDeterminedLower'];
  const list = points.map((p) => `${p.score} ${M['mgmt.on']} ${p.date ?? p.runId}`).join(', ');
  return `${M['mgmt.trendLabelLead']} ${version}: ${list}.`;
}

export function mgmtRuleVersionLabel(ruleVersion: string | null): string {
  return `${M['mgmt.ruleVersion']} ${ruleVersion ?? M['mgmt.notDeterminedLower']}`;
}

export function mgmtNotDeterminedRunsLabel(n: number): string {
  return `${M['mgmt.notDeterminedLabel']} ${n} ${n === 1 ? M['mgmt.run'] : M['mgmt.runs']}`;
}

export function mgmtBucketsChartLabel(platform: string): string {
  return `${M['mgmt.fourBuckets']} ${platform}`;
}

export function mgmtShowDetailLabel(n: number): string {
  return `${M['mgmt.showDetail']} (${n})`;
}

/** "and 5 more, each with its evidence, under the figures" */
export function execMoreBlockersLabel(n: number): string {
  return `${M['exec.moreLead']} ${n} ${M['exec.moreTail']}`;
}

/** "Objects per bucket on Private Edition: Retire 0, Keep 6, …" — the chart's text. */
export function execBucketsChartLabel(platform: string): string {
  return `${M['exec.bucketsChart']} ${platform}`;
}

export function cloudFitDetailLabel(open: boolean, objectName: string): string {
  return `${open ? M['cloudFit.hideDetail'] : M['cloudFit.showDetail']} ${objectName}`;
}
