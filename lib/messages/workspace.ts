/**
 * Interface text of the object page's own cards — components/workspace, except the IT and Management answers and the shell frame.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3,
 * block D, step D.29). Plain strings only; a sentence with a number in it is a
 * function beside the object, so where the number goes is the catalogue's
 * business and not the component's.
 */
export const WORKSPACE_PAGE_MESSAGES = {
  // AccessList
  'access.title': 'Who can read this project',
  'access.empty':
    'Nobody but you. An invitation gives read access to the whole project, source code included — generating, confirming, signing and exporting stay with you.',
  'access.since': 'Read access since',
  'access.revoking': 'Revoking…',
  'access.revoke': 'Revoke',
  'access.revokeFailed': 'The revocation did not go through.',
  // AskThisCase
  'ask.title': 'Ask this case',
  'ask.sourceLine': 'Source line',
  'ask.noLine': 'no line',
  'ask.otherwise': 'otherwise',
  'ask.endsFlow': 'ends the flow here',
  'ask.continuesWith': 'skips the rest of this block; the run goes on with',
  'ask.oneRule': 'One rule stands on this decision point:',
  'ask.showCode': 'Show the code',
  // CoachMarks
  'coach.next': 'Next',
  'coach.done': 'Done',
  'coach.dismissAll': 'Dismiss all',
  // LayerBar
  'layerBar.label': 'Sections of this process',
  'layerBar.lead': 'Sections',
  'layerBar.empty': 'empty',
  'layerBar.more': 'More',
  // LayerSection
  'layerSection.nothingOnRecord': 'Nothing on record for this layer',
  'layerSection.processNote':
    'Read from the source the signed run analysed, without a model — a reconstruction of the code, not evidence of how the process runs in production. What to do next stands under Next step.',
  'layerSection.showMap': 'Show the map',
  'layerSection.showMapBusiness': 'Show the map in Business',
  'layerSection.backToTop': 'Back to top of section',
  // UsageRecords — beside the map in Business, inside Need & process elsewhere (ADR-080)
  'usage.title': 'Usage records',
  'usage.lead':
    'Imported from your usage export — how often each object ran in the measured window. An object without a call count was not measured, which is not the same as unused.',
  'usage.showFirst': 'Show the first five',
  // NotDeterminedCard
  'notDetermined.title': 'Not determined',
  'notDetermined.noSource':
    'No source has been staged, so nothing has been assessed and nothing has been stepped over. This is not a result.',
  'notDetermined.none':
    'Every construct in this source falls inside the detectors that ran. That is the boundary of the question the engine answered — not a clean bill of health.',
  'notDetermined.sourceLine': 'Source line',
  'notDetermined.recordTitle': "Not in this project's record",
  // OpenQuestions — one list per project, grouped by the action that resolves it (ADR-081)
  'oq.title': 'Open questions',
  'oq.lead':
    'What the engine could not settle, grouped by what would settle it. Each value stays Not determined until the evidence arrives; an answer is your self-declaration, never proof.',
  'oq.blocks': 'blocks the decision',
  'oq.end.resolved': 'Resolved by evidence',
  'oq.end.answered': 'Answered',
  'oq.end.accepted': 'Accepted as known open',
  'oq.answer': 'Answer',
  'oq.answerOrAccept': 'Answer it, or accept it as known open',
  'oq.answerLabel': 'Your answer',
  'oq.answerHelp': 'Recorded as your self-declaration, with your account and the time. It changes no figure: the value stays Not determined.',
  'oq.acceptLabel': 'Why it stays open',
  'oq.acceptHelp': 'Accepted as known open with this reason. The value stays Not determined.',
  'oq.saveAnswer': 'Save the answer',
  'oq.saveAccept': 'Accept as known open',
  'oq.saving': 'Saving…',
  'oq.cancel': 'Cancel',
  'oq.reopen': 'Open it again',
  'oq.outdated': 'An earlier answer was given for a different set of questions, so this group is open again.',
  'oq.noLine': 'not a line',
  'oq.addAtc': 'Add ATC results',
  'oq.addUsage': 'Add usage data',
  'oq.chooseTarget': 'Choose the target',
  'oq.confirmRules': 'Decide on the rules',
  'oq.showList': 'Show the open questions',
  'oq.none':
    'Every construct in this source falls inside the detectors that ran, and nothing else is open. That is the boundary of the question the engine answered — not a clean bill of health.',
  'oq.saveFailed': 'The answer was not saved.',
  'oq.catalogAnswered': 'Answered by SAP’s catalog —',
  'oq.catalogPending': 'Reading SAP’s catalog for these function-module calls. Until it answers they count as open.',
  // RevisionStand
  'revision.movedHeadline': 'This process has moved on.',
  'revision.keep': 'Keep this Stand',
  'revision.refresh': 'Refresh',
  // ManagementAnswers
  'mgmtAnswers.reading': 'Reading the runs of this project…',
  'mgmtAnswers.notDetermined': 'Not determined',
  // ThreeViewsStage
  'threeViews.title': 'One case, three views',
  'threeViews.columnsLabel': 'Business, IT and Management on the same fact',
  'threeViews.viewLabel': 'View',
  'threeViews.replay': 'Replay',
  'threeViews.skipIntro': 'Skip intro',
  // DecisionCard
  'decision.title': 'Open decision',
  'decision.signedOut': 'You are signed out, so the decision could not be read.',
  'decision.unreadable': 'The decision of this project could not be read.',
  'decision.unreadableTail': 'Not determined — an empty card would say nothing is open.',
  'decision.answerLost': 'No answer came back. The decision was read again.',
  'decision.draftSaved': 'Not confirmed. The draft was saved.',
  'decision.nothingWritten': 'Nothing was written.',
  'decision.confirmRefused': 'The server refused the confirmation.',
  'decision.withdrawRefused': 'The server refused the withdrawal.',
  'decision.deriving': 'Deriving the decision of this project…',
  'decision.withdrawEllipsis': 'Withdraw to revise…',
  'decision.restsOn': 'What it rests on',
  'decision.timeline': 'Timeline',
  'decision.openPoints': 'Open conditions',
  'decision.noOpenPoints': 'No condition is open.',
  'decision.outdated': 'outdated',
  'decision.analysisRun': 'Analysis run',
  'decision.technicalBasis': 'Technical basis',
  'decision.technicalLead':
    'The sentences the decision record itself carries, for IT readers. The record is stored and revisioned as written; this is its wording.',
  'decision.placeBusiness': 'Business view',
  'decision.placeIt': 'IT view',
  'decision.placeAnalyze': 'Analyze',
  'decision.placeDesign': 'Design',
  'decision.placeEconomics': 'Economics',
  'decision.stateDone': 'met',
  'decision.stateOpen': 'open',
  'decision.confirmEllipsis': 'Confirm decision…',
  'decision.withdraw': 'Withdraw decision',
  'decision.confirm': 'Confirm decision',
  'decision.binds': 'Binds',
  'decision.run': 'Run',
  'decision.reversible': 'Reversible',
  'decision.conditions': 'Conditions',
  'decision.hideConditions': 'Hide conditions',
  'decision.fromEvidence': 'from the evidence',
  'decision.statedByAccount': 'stated by the account',
  'decision.cannotConfirmYet': 'Cannot be confirmed yet.',
  'decision.qualified': 'Qualified.',
  'decision.hide': 'Hide',
  'decision.show': 'Show',
  'decision.signedInConfirms': 'The signed-in account confirms.',
  'decision.withdrawBody':
    'The decision is no longer confirmed. Who confirmed it and when stays on the record — that happened. A new confirmation is a new revision.',
  'decision.notDetermined': 'not determined',
  // FirstLook
  // The first look's own name (roadmap 3.0.7, owner 10.10.2026): the same while
  // it builds, at its end and in the demo tour, so it is not read as Analyze.
  'firstLook.title': 'First insights into your process',
  'firstLook.lead': 'The first reading of this program, taken straight from its code. It is not the analysis: that is the Analyze tool.',
  'firstLook.skip': 'Skip',
  'firstLook.noProgramName': 'No program name in this source',
  'firstLook.sourceLine': 'Source line',
  'firstLook.noLine': 'no line',
  'firstLook.noDecision': 'No decision point — this source has no branch the engine draws as a gateway.',
  'firstLook.noSource': 'No source has been staged, so there is no process to show. This is not a result.',
  'firstLook.nameNote': 'name',
  'firstLook.foundInCode': 'Found in the code',
  'firstLook.rulesTitle': 'Rules fixed in the program',
  'firstLook.decisionsTitle': 'Decision points',
  'firstLook.derivedTitle': 'How this was derived',
  'firstLook.showCode': 'Show the code behind each line',
  'firstLook.keyFacts': 'Key facts',
  'firstLook.noRulesInList': 'No hard-coded rule to list.',
  // PublicCloudFitPanel
  'cloudFit.title': 'Every object by bucket',
  'cloudFit.noSource': 'No source has been staged, so no object can be sorted into a bucket yet.',
  'cloudFit.loading':
    "Looking up each object's clean-core level and released path in the Cloudification Repository…",
  'cloudFit.lookupFailed':
    'The catalog lookup failed, so no object can be sorted into Retire, No catalogued path, Rebuild or Keep right now. Reload the page to try again.',
  'cloudFit.allAssigned': 'Every object could be assigned.',
  'cloudFit.emptyBucket': 'No object in this bucket.',
  'cloudFit.toFindOut': 'To find out:',
  // SteeringOnePager
  'steering.decisionUnreadable': 'the decision of this project could not be read',
  'steering.print': 'Print / Save as PDF',
  'steering.reading': 'Reading the figures of this project…',
  'steering.figures': 'Key figures',
  'steering.notDetermined': 'Not determined',
  'steering.decision': 'The decision',
  'steering.risks': 'Risks and blockers',
  'steering.nextSteps': 'Open points and next steps',
  'steering.whoActs': 'Who acts',
  'steering.openDecision': 'Open the decision',
  'steering.line': 'line',
  // NewProject
  'newProject.createFailed': 'The project could not be created. Nothing was saved.',
  'newProject.loading': 'Loading',
  'newProject.signInTitle': 'Sign in to start a project',
  'newProject.signInBody': 'A project belongs to an account. Sign in, and this page offers an example or your own code.',
  'newProject.title': 'New project',
  'newProject.different': 'What is different here',
  'newProject.cleanCoreMeans': 'What clean core means',
  'newProject.fourLevels': 'The four levels',
  'newProject.evidenceFrom': 'Where the evidence comes from',
  'newProject.optional': 'optional',
  'newProject.notRecorded': 'not recorded',
  'newProject.hideThis': 'Hide this',
  'newProject.whatIs': 'What is Clean-Core.io?',
  'newProject.show': 'Show',
  'newProject.howStart': 'How do you want to start?',
  'newProject.ranBefore': 'You ran this example before.',
  'newProject.ownCodeNext':
    'The next screen is where the source is added. It says what is read and what is stored before anything leaves your machine.',
  'newProject.nothingCreated': 'Nothing was created.',
  'newProject.personalDataPending':
    'Read the lines above and tick the box to carry on. Nothing has been created yet.',
  // My workspace — the 3.0 list (mockup s7), its sharing section and row menu
  'myWorkspace.colLevels': 'Levels',
  'myWorkspace.colRules': 'Rules confirmed',
  'myWorkspace.filterLevel': 'Clean-core level',
  'myWorkspace.anyLevel': 'Any level',
  'myWorkspace.levelOption': 'Has findings at level',
  'myWorkspace.filterAccess': 'Access',
  'myWorkspace.accessAll': 'Mine and shared',
  'myWorkspace.accessOwn': 'Mine',
  'myWorkspace.accessShared': 'Shared with me',
  'myWorkspace.sortLastChange': 'Last change',
  'myWorkspace.sortName': 'Name',
  'myWorkspace.sortLabel': 'Sort by',
  'myWorkspace.sharedTag': 'Read only',
  'myWorkspace.sharedLine': 'shared with you to read',
  'myWorkspace.reading': 'reading…',
  'myWorkspace.levelsNone': 'no levels',
  'myWorkspace.rulesNotCounted': 'not counted',
  'myWorkspace.openProject': 'Open project',
  'myWorkspace.openLabel': 'Open project',
  'myWorkspace.actionsLabel': 'Actions',
  'myWorkspace.moreActions': 'More actions for',
  'myWorkspace.invite': 'Invite to read…',
  'myWorkspace.duplicate': 'Duplicate',
  'myWorkspace.exportJson': 'Export as JSON',
  'myWorkspace.deliverables': 'Deliverables',
  'myWorkspace.delete': 'Delete…',
  'myWorkspace.deleteTitle': 'Delete project',
  'myWorkspace.deleteFailed': 'The project could not be deleted.',
  'myWorkspace.duplicateFailed': 'The project could not be duplicated.',
  'myWorkspace.duplicateTargetFailed':
    'The copy was created, but its target system could not be copied. Set it with Change target in the copy’s IT view.',
  'myWorkspace.yourTurnIntro': 'The next step of each, taken from the project itself — no model call.',
  'myWorkspace.yourTurnNothing':
    'Nothing is waiting for you: every project of yours is either finished as far as this product goes, or has nothing staged yet.',
  'myWorkspace.demoSentence': 'A worked example to read — nothing in it is signed, run or saved.',
  'myWorkspace.exampleHeadline': 'Example project — fictitious code.',
  'myWorkspace.exampleBody':
    'The findings and any signature are real engine output on a program written for demonstration.',
  'myWorkspace.sharingTitle': 'Sharing',
  'myWorkspace.sharingLead':
    'Read access by invitation only: one link, bound to one confirmed e-mail address, with an expiry. There are no public links.',
  'myWorkspace.sharedWithYouTitle': 'Shared with you',
  'myWorkspace.sharedWithYouEmpty': 'Nobody has shared a project with you yet.',
  'myWorkspace.sharedWithYouNote':
    'You can read these projects, source code included. Generating, confirming, signing and exporting stay with their owners.',
  'myWorkspace.noOpenInvitations': 'No invitation of yours is waiting for an answer.',
  // WorkspacePrintSheet — the workspace on paper (DESIGN.md §7.1, mockup s10)
  'print.brand': 'Clean-Core.io',
  'print.processTitle': 'Process',
  'print.noSteps': 'No process could be read from this source.',
  'print.stepListInstead':
    'The map does not fit the page width at 11 px or more, so the step list prints instead — the same steps, in the order the flow runs.',
  'print.noRules': 'No business rule stands in this code.',
  'print.colRule': 'Rule',
  'print.colDecision': 'Decision',
  'print.colBasis': 'Basis',
  'print.notConfirmed': 'Not confirmed yet',
  'print.decisionNotRead': 'Not read for this printout',
  'print.notDeterminedNoSource': 'Not determined — nothing was staged to assess',
  'print.levelsNote':
    'Clean core level per SAP object, derived by a versioned rule from SAP’s released-object lists for this project’s target. Orientation only — the level is not part of the signed run.',
  'print.noObjects': 'This code names no SAP object.',
  'print.colObject': 'SAP object',
  'print.colUse': 'Use',
  'print.colLevel': 'Clean core level',
  'print.useRead': 'read',
  'print.useWrite': 'write',
  'print.useReference': 'type reference',
  'print.levelsLoading': 'Not read for this printout',
  'print.levelsFailed': 'Not determined — the level lookup did not answer',
  'print.legendTitle': 'Levels',
  'print.footer':
    'Printed from the workspace. Line anchors and IDs are printed as text. Reconstructed means read from the code, not confirmed by anyone.',
  // Open invitations — owner decision 01.10.2026
  'invites.waitingTitle': 'Waiting for an answer',
  'invites.expiresOn': 'Link expires on',
  'invites.withdraw': 'Withdraw',
  'invites.withdrawTitle': 'Withdraw this invitation?',
  'invites.withdrawFailed': 'The invitation could not be withdrawn.',
} as const;

/** WorkspacePrintSheet — "P-0412 · run 7f3a… · revision 4 · printed 2026-10-01". */
export function printHeaderLine(input: {
  projectId: string;
  runId: string | null;
  revision: number | null;
  date: string;
}): string {
  const run = input.runId ? `run ${input.runId}` : 'no signed run';
  const revision = input.revision && input.revision > 0 ? `need revision ${input.revision}` : 'no confirmed need yet';
  return `${input.projectId} · ${run} · ${revision} · printed ${input.date}`;
}

/** WorkspacePrintSheet — "Business rules · 7". */
export function printRulesTitle(n: number): string {
  return `Business rules · ${n}`;
}

/** WorkspacePrintSheet — "SAP objects · 12". */
export function printObjectsTitle(n: number): string {
  return `SAP objects · ${n}`;
}

/** WorkspacePrintSheet — one open-question group on paper (ADR-081). */
export function printOpenQuestion(title: string, owner: string, n: number, end: 'open' | 'resolved' | 'answered' | 'accepted'): string {
  const state = end === 'open' ? 'open' : end === 'resolved' ? 'resolved by evidence' : end === 'answered' ? 'answered (self-declaration)' : 'accepted as known open';
  return `${title} — ${n} ${n === 1 ? 'question' : 'questions'}, owner ${owner}, ${state}`;
}

/** CoachMarks — "1 of 3". */
export function coachPositionLabel(position: number, total: number): string {
  return `${position} of ${total}`;
}

/** OpenInvitations — what a withdrawal does, said before it is done. */
export function withdrawSentence(email: string): string {
  return `The link sent to ${email} stops working at once. If they have not opened it yet, they never will; you can invite them again later.`;
}

/** My workspace on a phone — the facts line of a project card. */
export function rowLinesLabel(n: string): string {
  return `${n} lines`;
}

export function rowFindingsLabel(n: string): string {
  return `${n} findings`;
}

export function rowRulesLabel(confirmed: number, total: number): string {
  return `${confirmed} of ${total} rules confirmed`;
}

/** My workspace — "Showing 5 of 24" under the table. */
export function showingRowsLabel(shown: number, total: number): string {
  return `Showing ${shown} of ${total}`;
}

/** My workspace — "4 of 7" rules confirmed. */
export function rulesConfirmedLabel(confirmed: number, total: number): string {
  return `${confirmed} of ${total}`;
}

/** My workspace — the spoken name of a level count chip. */
export function levelCountLabel(level: string, count: number): string {
  // The level chips count places in the code (the IT rows), not findings.
  return `${count} ${count === 1 ? 'place in the code' : 'places in the code'} at level ${level}`;
}

/** My workspace — the "Your turn" title with how many projects wait. */
export function yourTurnCountLabel(n: number): string {
  return n === 1 ? '1 project is waiting for you' : `${n} projects are waiting for you`;
}

/** My workspace — "Delete project" Message Box text. */
export function deleteProjectSentence(name: string): string {
  return `“${name}” and everything generated for it will be deleted, including its signed runs and every invitation to read it. This cannot be undone.`;
}

/** AccessList — uids on the read list with no accepted invitation behind them. */
export function accessUnaccountedLabel(n: number): string {
  return `${n} account${n === 1 ? '' : 's'} on the read list without a matching invitation. Please report this — it should not happen.`;
}

/** AskThisCase — the lead-in before the rules that stand on a decision point. */
export function askRulesLabel(n: number): string {
  return n === 1 ? WORKSPACE_PAGE_MESSAGES['ask.oneRule'] : `${n} rules stand on this decision point:`;
}

/** LayerBar — how many layers wait under "More". */
export function layerBarEmptyCount(n: number): string {
  return `${n} ${WORKSPACE_PAGE_MESSAGES['layerBar.empty']}`;
}

/** LayerSection — the first rows of a layer, and how many stand behind them. */
export function layerSectionShowing(shown: number, total: number): string {
  return `Showing ${shown} of ${total}.`;
}

/** UsageRecords — the button that opens every usage record. */
export function usageShowAll(total: number): string {
  return `Show all ${total}`;
}

/** OpenQuestions — how many questions a group holds. */
export function oqCount(n: number): string {
  return `${n} ${n === 1 ? 'question' : 'questions'}`;
}

/** OpenQuestions — who acts on a group: a role, never an account. */
export function oqOwner(role: string): string {
  return `Owner · ${role}`;
}

/** OpenQuestions — a stored answer, quoted as it was written. */
export function oqAnswerQuote(text: string): string {
  return `“${text}”`;
}

/** OpenQuestions — who gave the answer, and when. */
export function oqAnswerBy(account: string, date: string): string {
  return `— by ${account}, ${date}`;
}

/** OpenQuestions — the lines of a group behind their disclosure. */
export function oqLinesTitle(n: number): string {
  return `Where in the code (${n})`;
}

/** RevisionStand — the notice when somebody else has moved the Stand. */
export function revisionMovedMessage(seenBadge: string, heldBadgeLower: string): string {
  return `${seenBadge} was written somewhere else while this screen was open. You are reading ${heldBadgeLower}. Nothing here has changed and nothing of yours was overwritten.`;
}

/** ThreeViewsStage — the line under the stage, after the example's name. */
export function threeViewsFactNote(label: string): string {
  return `${label} — read by the same engine that reads your own upload. Every line above comes from the source, and nothing on this stage is stored anywhere.`;
}

/** ThreeViewsStage — the options a view offers, which are not a decision. */
export function threeViewsOffered(options: readonly string[]): string {
  return `Offered here: ${options.join(' · ')} — options on a screen, not a decision on record.`;
}

/** DecisionCard — the server answered without a sentence of its own. */
export function decisionDeriveFailed(status: number): string {
  return `The decision of this project could not be derived (${status}).`;
}

/** DecisionCard — the toggle that opens the conditions. */
export function decisionShowConditions(n: number): string {
  return `Show conditions (${n})`;
}

/** DecisionCard — a confirmed decision whose evidence has moved on. */
export function decisionMovedSentence(revision: number | string): string {
  return `The evidence behind this decision has changed since it was confirmed. Withdraw it to confirm revision ${revision}, which binds what the project stands on now.`;
}

/** DecisionCard — who confirmed, and on which day. */
export function decisionConfirmedBy(account: string, day: string): string {
  return `Confirmed by ${account} on ${day}.`;
}

/** DecisionCard — the folded timeline's heading. */
export function decisionTimelineTitle(n: number): string {
  return `Timeline (${n})`;
}

/** DecisionCard — the day of the last timeline entry. */
export function decisionLatest(day: string): string {
  return `latest ${day}`;
}

/** DecisionCard — the confirmation dialog's title. */
export function decisionConfirmTitle(decisionId: string): string {
  return `Confirm decision ${decisionId}?`;
}

/** DecisionCard — the withdrawal dialog's title. */
export function decisionWithdrawTitle(decisionId: string): string {
  return `Withdraw decision ${decisionId} to revise it?`;
}

/** DecisionCard — how many conditions are still open, beside their heading. */
export function decisionOpenCount(open: number, total: number): string {
  return open === total ? `${open} open` : `${open} of ${total} open`;
}

/** DecisionCard — the link to the place a pillar or a condition is resolved. */
export function decisionResolveIn(place: string): string {
  return `Resolve in ${place}`;
}

/** DecisionCard — whose confirmation it is, named in the dialog. */
export function decisionConfirmsLine(account: string | null): string {
  return account ? `${account} confirms.` : WORKSPACE_PAGE_MESSAGES['decision.signedInConfirms'];
}

/** FirstLook — what is being read, while the reader waits for the end state. */
export function firstLookReading(sourceName: string): string {
  return `Reading ${sourceName}.`;
}

/** FirstLook — the stage being worked on during the build-up. */
export function firstLookReadingNext(stageLabel: string, sourceName: string): string {
  return `${stageLabel} — reading ${sourceName}.`;
}

/** FirstLook — the first rules, and how many there are. */
export function firstLookShowingRules(shown: number, total: number): string {
  return `Showing ${shown} of ${total} rules.`;
}

/** FirstLook — the first decision points, and how many there are. */
export function firstLookShowingDecisions(shown: number, total: number): string {
  return `Showing ${shown} of ${total} decision points.`;
}

/** FirstLook — the line over the decision points. */
/** "and 8 more" after the headline's three rules. */
export function firstLookMoreRules(n: number): string {
  return `and ${n} more`;
}

/** "Outcomes: approved · rejected". */
export function firstLookOutcomes(outcomes: readonly string[]): string {
  return `Outcomes: ${outcomes.join(' · ')}`;
}

/** "Local function-module call (6)". */
export function firstLookOpenGroup(label: string, n: number): string {
  return `${label} (${n})`;
}

/** "9 not determined". */
export function firstLookOpenTitle(n: number): string {
  return `${n} not determined`;
}

export function firstLookDecisionsLine(n: number): string {
  if (n === 0) return WORKSPACE_PAGE_MESSAGES['firstLook.noDecision'];
  return `${n} ${n === 1 ? 'decision point' : 'decision points'}, each with the condition as your code writes it.`;
}

/** PublicCloudFitPanel — the platform the buckets were sorted for. */
export function cloudFitTargetPlatform(label: string): string {
  return `Target platform: ${label}.`;
}

/** PublicCloudFitPanel — the fifth area's heading. */
export function cloudFitNotAssigned(n: number): string {
  return `Not assigned (${n})`;
}

/** NewProject — one synced SAP artifact, up to its sync date. */
export function newProjectCatalogLine(file: string, entries: string): string {
  return `${file} · ${entries} entries · last synced`;
}

/** NewProject — an example's length and size. */
export function newProjectExampleSize(lines: string, size: string): string {
  return `${lines} lines · ${size}`;
}

