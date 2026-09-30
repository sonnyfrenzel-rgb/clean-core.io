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
  'ask.oneRule': 'One rule stands on this decision:',
  // CoachMarks
  'coach.gotIt': 'Got it',
  'coach.skipTips': 'Skip tips',
  // LayerBar
  'layerBar.label': 'Layers',
  'layerBar.empty': 'empty',
  'layerBar.more': 'More',
  // LayerSection
  'layerSection.nothingOnRecord': 'Nothing on record for this layer',
  // NotDeterminedCard
  'notDetermined.title': 'Not determined',
  'notDetermined.noSource':
    'No source has been staged, so nothing has been assessed and nothing has been stepped over. This is not a result.',
  'notDetermined.none':
    'Every construct in this source falls inside the detectors that ran. That is the boundary of the question the engine answered — not a clean bill of health.',
  'notDetermined.sourceLine': 'Source line',
  'notDetermined.recordTitle': "Not in this project's record",
  // RevisionStand
  'revision.movedHeadline': 'This process has moved on.',
  'revision.keep': 'Keep this Stand',
  'revision.refresh': 'Refresh',
  // ShellSwitch
  'shellSwitch.signInAgain': 'Sign in again to change this setting.',
  'shellSwitch.saveFailed': 'Could not save the setting.',
  'shellSwitch.title': 'Workspace preview',
  'shellSwitch.facet': 'Preview',
  'shellSwitch.turnOff': 'Turn off',
  'shellSwitch.turnOn': 'Turn on',
  'shellSwitch.leadBefore': 'The 3.0 workspace, on your own account only. It adds one address —',
  'shellSwitch.address': '/project/<id>',
  'shellSwitch.leadAfter':
    '— which stays a 404 for every other account, signed in or not. Nothing else changes anywhere, and nothing behind it is privileged: it is the same project, read the same way, drawn differently.',
  'shellSwitch.designSystem': 'The design system',
  'shellSwitch.designSystemAfter': 'is the language it is built from.',
  'shellSwitch.notSaved': 'Not saved.',
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
  'decision.withdrawEllipsis': 'Withdraw decision…',
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
  'firstLook.title': 'Reading your code',
  'firstLook.skip': 'Skip',
  'firstLook.noProgramName': 'No program name in this source',
  'firstLook.sourceLine': 'Source line',
  'firstLook.noLine': 'no line',
  'firstLook.noDecision': 'No decision — this source has no branch the engine draws as a gateway.',
  'firstLook.noSource': 'No source has been staged, so there is no process to show. This is not a result.',
  // PublicCloudFitPanel
  'cloudFit.title': 'Public-Cloud-Fit and the four buckets',
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
  'steering.figures': 'Figures',
  'steering.notDetermined': 'Not determined',
  'steering.allRead': 'Every figure on this page could be read.',
  // NewProject
  'newProject.createFailed': 'The project could not be created. Nothing was saved.',
  'newProject.loading': 'Loading',
  'newProject.accessDenied': 'Access denied',
  'newProject.adminOnly': 'This page is restricted to Clean-Core.io system administrators.',
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
  // WorkspaceListReport (the rest of its text is in lib/cc-messages.ts)
  'listReport.accessDenied': 'Access denied',
  'listReport.adminOnly': 'This page is restricted to Clean-Core.io system administrators.',
} as const;

/** AccessList — uids on the read list with no accepted invitation behind them. */
export function accessUnaccountedLabel(n: number): string {
  return `${n} account${n === 1 ? '' : 's'} on the read list without a matching invitation. Please report this — it should not happen.`;
}

/** AskThisCase — the lead-in before the rules that stand on a decision. */
export function askRulesLabel(n: number): string {
  return n === 1 ? WORKSPACE_PAGE_MESSAGES['ask.oneRule'] : `${n} rules stand on this decision:`;
}

/** LayerBar — how many layers wait under "More". */
export function layerBarEmptyCount(n: number): string {
  return `${n} ${WORKSPACE_PAGE_MESSAGES['layerBar.empty']}`;
}

/** LayerSection — the first rows of a layer, and how many stand behind them. */
export function layerSectionShowing(shown: number, total: number): string {
  return `Showing ${shown} of ${total}.`;
}

/** RevisionStand — the notice when somebody else has moved the Stand. */
export function revisionMovedMessage(seenBadge: string, heldBadgeLower: string): string {
  return `${seenBadge} was written somewhere else while this screen was open. You are reading ${heldBadgeLower}. Nothing here has changed and nothing of yours was overwritten.`;
}

/** ShellSwitch — the save failed with a status and no message of its own. */
export function shellSwitchHttpError(status: number): string {
  return `Could not save the setting (HTTP ${status}).`;
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
  return `Withdraw decision ${decisionId}?`;
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

/** FirstLook — the first decisions, and how many there are. */
export function firstLookShowingDecisions(shown: number, total: number): string {
  return `Showing ${shown} of ${total} decisions.`;
}

/** FirstLook — the line over the decisions. */
export function firstLookDecisionsLine(n: number): string {
  if (n === 0) return WORKSPACE_PAGE_MESSAGES['firstLook.noDecision'];
  return `${n} ${n === 1 ? 'decision' : 'decisions'}, each with the condition as your code writes it.`;
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
