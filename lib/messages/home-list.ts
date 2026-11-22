/**
 * Interface text of the home page's project list for returning accounts — AB-14b (plan
 * `docs/design/analyze-business-first-plan.md` §4.2; mockup `docs/roadmap/home-mockup-v2.html`, states 2–9, 11, 12).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings only; a sentence with a number or a name in
 * it is a function beside the object. The status words themselves are the phase contract's (`lib/home-status.ts`).
 */
export const HOME_LIST_MESSAGES = {
  'homeList.newAnalysis': 'New analysis',
  'homeList.projectsLabel': 'Projects',
  'homeList.tabMine': 'My projects',
  'homeList.tabMineShort': 'Mine',
  'homeList.tabShared': 'Shared with me',
  'homeList.tabSharedShort': 'Shared',
  'homeList.tabInvites': 'Invitations sent',
  'homeList.tabInvitesShort': 'Invited',
  'homeList.colProject': 'Project',
  'homeList.colStatus': 'Status',
  'homeList.colNext': 'Next step',
  'homeList.colLastChange': 'Last change',
  'homeList.colAccess': 'Access',
  'homeList.colActions': 'Actions',
  'homeList.nothingOpen': 'Nothing open',
  'homeList.noDate': 'No date',
  'homeList.sort': 'Sort',
  'homeList.sortLastChange': 'Last change',
  'homeList.sortName': 'Name',
  'homeList.figures': 'Figures',
  'homeList.noun': 'projects',
  'homeList.filterStatus': 'Status',
  'homeList.anyStatus': 'Any status',
  'homeList.filterLevel': 'Clean core level',
  'homeList.anyLevel': 'Any level',
  'homeList.noMatchTitle': 'No project matches',
  'homeList.exampleTag': 'Example',
  'homeList.readOnly': 'Read only',
  'homeList.sharedAccess': 'Shared with you to read',
  'homeList.sharedNote': 'You can read these projects, the code included. Only their owners can change, sign or export them.',
  'homeList.invitesNote': 'An invitation is a link for one confirmed e-mail address. The person can read the project, the code included. You can withdraw it before it expires.',
  'homeList.noInvitations': 'No open invitations.',
  'homeList.nothingMeasured': 'Nothing measured yet',
  'homeList.attentionTitle': 'Needs your attention',
  'homeList.attentionFoot': 'A project shows up here when its code changed since the analysis or it was not analysed yet.',
  'homeList.doorDemoTitle': 'Demo',
  'homeList.doorDemoBody': 'A finished example to look around in. Nothing runs and nothing is saved.',
  'homeList.doorDemoAction': 'Open the demo',
  'homeList.doorExamplesTitle': 'Examples',
  'homeList.doorExamplesBody': 'Fictional programs to try. Each runs free the first time.',
  'homeList.doorExamplesAction': 'See the examples',
  'homeList.runTitle': 'Run the analysis?',
  'homeList.runAgainTitle': 'Run the analysis again?',
  'homeList.runConfirm': 'Run analysis',
  'homeList.runNoSource': 'This project has no code to analyse. Open it and upload the program first.',
  'homeList.listFailed': 'Your projects could not be read just now. Nothing is lost. Reload the page to try again.',
  'homeList.redesignBar': 'Re-design steps done',
} as const;

/** The greeting under the title: with the first name when the profile has one. */
export function homeWelcomeBack(firstName: string | null | undefined): string {
  const name = typeof firstName === 'string' ? firstName.trim() : '';
  return name ? `Welcome back, ${name}.` : 'Welcome back.';
}

/** Under a next step: the tool it opens. */
export function homeNextIn(tool: string): string {
  return `in ${tool}`;
}

/** The level filter's option for one level. */
export function homeLevelOption(level: string): string {
  return `Has level ${level} findings`;
}

/** The empty result of a filter: nothing is gone, the filters hide it. */
export function homeNoMatchBody(total: number): string {
  return `All ${total} projects are still here. The filters hide them.`;
}

/** The attention card's way to the rest of them. */
export function homeAttentionShowAll(total: number): string {
  return `Show all ${total} in the list`;
}

/** The figures line: the score of the signed run. */
export function homeScoreLabel(score: number): string {
  return `Score ${score} of 100`;
}

/** The first line of the run dialog: which project, how big. */
export function homeRunWhat(name: string, lines: string | null): string {
  return lines ? `${name}, ${lines} lines.` : `${name}.`;
}

/** The list stops at the route's cap — said, never silent. */
export function homeTruncated(shown: number): string {
  return `The first ${shown} projects are listed. Search finds a project among them; tell us if you need more.`;
}
