/**
 * The two ways back, and their names — owner 06.10.2026: "we need two
 * different terms, 'back to workspace' (the project's workspace, e.g. its IT
 * view) and back to 'My workspace' (the list of all projects) — otherwise you
 * lose track."
 *
 *   - **My workspace** is the list of all projects (`/dashboard`). Every link
 *     to it says "My workspace"; a way back says "Back to My workspace" and
 *     adds "all projects", so the reader knows the list is where it leads.
 *   - **The project workspace** is one project's object page
 *     (`/project/<id>`, in the view and layer the reader left it). A stage's
 *     way back says "Back to project workspace", then the project's name and
 *     the view it returns to — "Order limit check · IT view".
 *
 * Small and free of imports on purpose: `components/BackLink.tsx` sits on
 * public pages and should not carry the whole workspace catalogue to name one
 * link. It is also a part of `lib/workspace-messages.ts`, so the catalogue
 * guard (`tests/cc-style-guard.spec.ts`) reads it like every other part, and
 * `tests/back-link-wording.spec.ts` holds the wording.
 */
export const NAVIGATION_MESSAGES = {
  'nav.myWorkspace': 'My workspace',
  'nav.backToMyWorkspace': 'Back to My workspace',
  'nav.allProjects': 'all projects',
  'nav.goToMyWorkspace': 'Go to My workspace',
  'nav.backToProjectWorkspace': 'Back to project workspace',
  // The eyebrow of every in-page anchor bar (`components/PageAnchorBar.tsx`, ADR-091): one wording on every tool.
  'nav.onThisPage': 'On this page',
  // The way back from a choice to the place that asked for it (`lib/choice-addresses.ts`,
  // `components/ChoiceBackLink.tsx`): "Back to Management view, Options". One level deep.
  'nav.backTo': 'Back to',
  'nav.backToWhereYouWere': 'Back to where you were',
  // The places a choice can be asked from — the origin's name in its way back.
  'nav.place.restsOnNeed': 'What it rests on: Need',
  'nav.place.restsOnOption': 'What it rests on: Option',
  'nav.place.restsOnCost': 'What it rests on: Costs',
  'nav.place.restsOnContract': 'What it rests on: Architecture contract',
  'nav.place.options': 'Options',
  'nav.place.nextStep': 'Next step',
  'nav.place.openQuestions': 'Open questions',
  'nav.place.targetProfile': 'Target profile',
  'nav.place.linksOut': 'Links to other views',
  'nav.place.tools': 'Tools',
  'nav.place.projectStatus': 'Project status',
  'nav.place.stillNeeded': 'Still needed',
  'nav.place.evidenceChain': 'Evidence chain',
  'nav.place.whatToDecide': 'What to decide',
  'nav.place.requirements': 'Requirements',
  'nav.place.qualityTips': 'Before the run',
  // The places a choice is made at — what an address leads to.
  'nav.choice.designTargetSignoff': 'Sign off the target architecture',
  'nav.choice.managementOptions': 'Choose an option',
  'nav.choice.managementConfirm': 'Confirm the decision',
  'nav.choice.businessRules': 'Answer the questions on the rules',
  'nav.choice.businessWalk': 'Walk through the process',
  'nav.choice.openQuestions': 'Answer the open questions',
  'nav.choice.itTarget': 'Choose the target',
  'nav.choice.itStandardFit': 'See where it touches SAP standard',
  'nav.choice.economicsRates': 'Enter your rates',
  'nav.choice.economicsCadence': 'Confirm the upgrade cadence',
  'nav.choice.economicsEffort': 'Enter the effort per option',
  'nav.choice.economicsDeferral': 'Enter the deferral',
  'nav.choice.economicsResult': 'Enter the budget',
  'nav.choice.economicsCompare': 'Compare the options',
  'nav.choice.testingRun': 'Run the tests',
  'nav.choice.testingWrite': 'Write the test scenarios',
  'nav.choice.testingSapResult': 'Add your SAP test result',
  'nav.choice.testingHand': 'Check by hand',
  'nav.choice.deliveryAuditPack': 'Export the audit pack',
  'nav.choice.deliveryStillNeeded': 'See what is still needed',
  'nav.choice.analyzeAddUsage': 'Add usage data',
  'nav.choice.analyzeAddAtc': 'Add an ATC result',
  'nav.choice.requirementsDecision': 'Decide the open point',
  'nav.choice.requirementsRequirement': 'Review the requirement',
  'nav.choice.requirementsNfr': 'Answer the non-functional questions',
} as const;

export type NavigationMessageKey = keyof typeof NAVIGATION_MESSAGES;

export function nav(key: NavigationMessageKey): string {
  return NAVIGATION_MESSAGES[key];
}

/** "IT view" — the view a way back returns to, named as a view so it is not read as a team. */
export function navViewLabel(viewLabel: string): string {
  return `${viewLabel} view`;
}
