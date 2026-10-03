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
  'it.levelsTitle': 'Clean core levels across the places in the code',
  'it.findingsTitle': 'Places in the code',
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
  // The IT rows are one per place in the code; "findings" is the unit Analyze counts (owner decision 02.10.2026).
  'it.place': 'place in the code',
  'it.places': 'places in the code',
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
  // ItAnswers — the 3.0 IT view (mockup s4)
  'it.whereTo': 'Where to',
  'it.whereToReading': 'Reading where the objects go on the target platform…',
  'it.isItRight': 'Is it right',
  'it.noObject': 'No object',
  'it.line': 'line',
  'it.facetFindings': 'Places in the code',
  'it.facetLevels': 'Level distribution',
  'it.facetTarget': 'Target platform',
  'it.moreKindsLead': 'and',
  'it.kind': 'more kind',
  'it.kinds': 'more kinds',
  'it.objectSingular': 'SAP object placed',
  'it.objectPlural': 'SAP objects placed',
  'it.targetDeclared': 'the project’s declared target',
  'it.targetDefault': 'no target declared — the run’s default',
  'it.objectsNotPlaced': 'no object placed yet',
  'it.ofLower': 'of',
  'it.noLevelReason':
    'Findings about a statement name no SAP object, so the catalog was never asked — no level, rather than a guessed one.',
  'it.showThem': 'Show them',
  'it.linkDetail': 'What this link says',
  'it.filter': 'Filter',
  'it.filterKind': 'Kind',
  'it.allKinds': 'All kinds',
  'it.allLevels': 'All levels',
  'it.levelPrefix': 'Level',
  'it.levelOwn': 'on its own',
  'it.levelUnknown': 'Unknown — not in SAP’s lists',
  'it.levelNone': 'Not determined — no object',
  'it.filterTarget': 'Target',
  'it.allTargets': 'All targets',
  'it.catalogView': 'Catalog view',
  'it.bothViews': 'Both views',
  'it.colTarget': 'Target',
  'it.colSapObject': 'SAP object',
  'it.colLines': 'Lines',
  'it.objectsTitle': 'Clean core level per SAP object',
  'it.objectsCaption': 'SAP objects the findings name, with their clean core level and target',
  'it.whyEachObject': 'Why each object is where it is',
  'it.railLabel': 'Target profile, route and imports',
  'it.profileTitle': 'Target profile',
  'it.profileEdition': 'Edition',
  'it.profileEditionDefault': 'Not declared — read as the Public Edition, as the run does.',
  'it.profileRelease': 'Release',
  'it.profileCatalog': 'Catalog',
  'it.profileNote':
    'Every level on this page is looked up under this profile — the same catalog the signed run of this project reads.',
  'it.notDeclared': 'not declared',
  'it.notRecorded': 'not recorded',
  'it.routeTitle': 'Route',
  'it.contractTitle': 'Architecture contract',
  'it.contractDraft': 'draft',
  'it.contractConfirmed': 'confirmed',
  'it.contractSuperseded': 'superseded',
  'it.contractUnread': 'The architecture contract of this project could not be read.',
  'it.contractDemo':
    'An architecture contract is derived from the signed run of a real project. The demo shows the routes the router named.',
  'it.contractFields': 'Details',
  'it.contractAlternatives': 'Alternatives',
  'it.recommended': 'Recommended',
  'it.chosenInstead': 'Chosen instead',
  'it.verdictChosen': 'chosen',
  'it.verdictRejected': 'rejected',
  'it.verdictOpen': 'not determined',
  'it.reviewInDecision': 'Review in the decision',
  'it.routesNamed': 'Routes the router named on the findings',
  'it.routesNone': 'The router named no extensibility route on any finding.',
  'it.importsTitle': 'Imports',
  'it.atcTitle': 'ABAP Test Cockpit results',
  'it.atcNone': 'No ATC results imported.',
  'it.atcImport': 'Import ATC results',
  'it.importedOn': 'imported',
  'it.usageTitle': 'Usage',
  'it.usageRecords': 'records',
  'it.usageSeen': 'executions seen',
  'it.to': 'to',
  'it.usageNoneTitle': 'No usage data yet',
  'it.usageNoneBody':
    'Import SCMON, UPL or ST03N covering 13 months, including a year-end close. Until then usage is not determined — never “unused”.',
  'it.usageImport': 'Import usage',

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
  'mgmt.colScore': 'Score (5–100)',
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
  'mgmt.levelsChart': 'Clean core levels across the places in the code',
  'mgmt.levelsCaption': 'Places in the code per clean core level',
  'mgmt.levelsUnit': 'Level (places in the code)',
  'mgmt.levelsColumn': 'Places in the code',
  'mgmt.hideDetail': 'Hide the answers in detail',
  'mgmt.showDetail': 'Show the answers in detail',
  'mgmt.signedOutLead': 'You are signed out, so',
  'mgmt.couldNotBeRead': 'could not be read',

  // ManagementExecutive — the decision panel on top of the Management view
  'exec.questionLabel': 'Your decision',
  'exec.thisProgram': 'this program',
  'exec.statusFacet': 'Decision',
  'exec.inTheWay': 'What stands in the way',
  'exec.nothingInTheWay': 'Nothing stands in the way of confirming it.',
  'exec.notYetRead': 'Still being read.',
  'exec.nothingFoundNotAllRead': 'Nothing found in the way, but not every source could be read.',
  'exec.moreLead': 'and',
  'exec.moreTail': 'more, each with its evidence, under Evidence below',
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
  'exec.forTheDecision': 'For the decision:',

  // The fit-to-standard card (ADR-069) — ManagementExecutive.
  'stdFit.title': 'Fit to standard',
  'stdFit.ownMeasure': 'Clean-Core.io measure, not an SAP figure',
  'stdFit.notDetermined': 'Not determined',
  'stdFit.reading': 'Reading…',
  'stdFit.howMeasured': 'How this is measured',
  'stdFit.meterLabel': 'SAP objects by bucket',
  'stdFit.groupFits': 'Has a released path',
  'stdFit.groupBlocks': 'Blocks the standard path',
  'stdFit.groupUncounted': 'Not counted',
  'stdFit.blocksTitle': 'What blocks the standard path',
  'stdFit.clearTitle': 'What does not block',
  'stdFit.nothingBlocks': 'Nothing found blocks the standard path for the objects that could be sorted.',
  'stdFit.nothingClear': 'No SAP object here has a released path yet.',
  'stdFit.sourceLine': 'Source line',
  'stdFit.noLine': 'no line',
  'stdFit.allObjects': 'Every object, with its evidence',
  'stdFit.demoBasis': 'Demo — from the engine reading of the demo source; a demo is never signed.',
  'stdFit.setTarget': 'Choose the target platform in Analyze',

  // The folds under the Management answer — collapsed until opened, and
  // remembered in this browser only (owner 03.10.2026: progressive disclosure).
  'mgmtFold.evidence': 'Evidence',
  'mgmtFold.costs': 'Costs',
  'mgmtFold.process': 'Process',
  'mgmtFold.evidenceNoRun': 'Filled by the first signed run — the figures, the buckets per object and what could not be determined.',
  'mgmtFold.evidenceRun': 'The four figures, evidence per phase, every object per bucket, the score history and what could not be determined.',
  'mgmtFold.costsEmpty': 'No cost figures yet — enter your own in Economics; costs are only ever a simulation.',
  'mgmtFold.processSummary': 'The process map, its business rules and "Ask this case" are in the Business view.',
  'mgmtFold.openBusiness': 'Open the process in the Business view',
  'mgmtFold.openEconomics': 'Open Economics',
  'cloudFit.meaningsTitle': 'What the four buckets mean',
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

/** "62 %" — the fit-to-standard figure; a number the module computed, never a literal. */
export function stdFitPercentLabel(percent: number): string {
  return `${percent} %`;
}

/** "Fit to standard on Public Edition" — the card's title once a platform is known. */
export function stdFitTitleOn(platform: string): string {
  return `${M['stdFit.title']} on ${platform}`;
}

/** "Has a released path (5)" — a legend group with its count. */
export function stdFitGroupLabel(label: string, count: number): string {
  return `${label} (${count})`;
}

/** "and 4 more" — the rest of a list beyond what the card shows. */
export function stdFitMoreLabel(count: number): string {
  return `and ${count} more`;
}

/** "Source line 412" — the spoken name of a blocker's line anchor. */
export function stdFitLineLabel(line: number): string {
  return `${M['stdFit.sourceLine']} ${line}`;
}

/** "SAP objects by bucket: Keep 3, …" — the meter's text, every number in it. */
export function stdFitMeterLabel(parts: Array<{ label: string; count: number }>): string {
  return `${M['stdFit.meterLabel']}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}.`;
}

/**
 * The sentence under the IT findings table. How many rows are on screen is the
 * table's business (its own "Show all N"), so this says how many there are.
 */
export function itFindingsCountLabel(count: number, filterLink: string | null, total: number): string {
  const noun = count === 1 ? M['it.place'] : M['it.places'];
  const head = filterLink
    ? `${count} ${noun} ${M['it.filteredBy']} ${filterLink}, ${M['it.outOf']} ${total}`
    : `${count} ${noun}`;
  return `${head}. ${M['it.catalogViewsNote']}`;
}

/** The ATC import beside the engine, per object — the counts of `summarizeAtcComparison`. */
export function itAtcComparison(both: number, atcOnly: number, engineOnly: number): string {
  return `Objects named by both: ${both} · only by ATC: ${atcOnly} · only by the engine: ${engineOnly}`;
}

/** "CC-004, line 141" — the spoken name of a line anchor in the objects table. */
export function itAnchorLabel(id: string, line: number): string {
  return `${id}, ${M['it.line']} ${line}`;
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

/** "and 5 more, each with its evidence, under Evidence below" */
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
