/**
 * Interface text of the portfolio — roadmap 3.0.21 (`app/(app)/portfolio`,
 * `components/portfolio`, `app/api/portfolio`).
 *
 * Plain strings in `PORTFOLIO_MESSAGES`; a sentence with a number or a name in
 * it is a function below, so a component never writes a word of its own
 * (D.29). The routes' refusals live here too, so the page and the server say
 * the same thing.
 */

export const PORTFOLIO_MESSAGES = {
  'portfolio.title': 'Portfolio',
  'portfolio.lead':
    'Many programs at once: one upload becomes one project per program, each analysed and signed by the same engine as a single project. The overview below reads your projects together — it is a view, not a new result.',
  'portfolio.loading': 'Loading the portfolio…',
  'portfolio.entry': 'Portfolio',
  'portfolio.settingsLink': 'Open Settings',
  'portfolio.closedTitle': 'The portfolio needs your own model key',
  'portfolio.notSigned': 'Nothing in this overview is signed or put into an audit pack. Each program keeps its own signed run; open the project for its evidence.',
  'portfolio.backToWorkspace': 'My workspace',

  'portfolio.batchTitle': 'Batch run',
  'portfolio.batchLead':
    'Drop a ZIP, an abapGit export or several files. Each program with its includes becomes its own project. Only the engine runs — no model is called, nothing is sent to a model, and no free run is used.',
  'portfolio.drop': 'Drop a ZIP or files here',
  'portfolio.choose': 'Choose files',
  'portfolio.reading': 'Reading the files…',
  'portfolio.programsFound': 'Programs found',
  'portfolio.notReady': 'Not queued',
  'portfolio.refusedFiles': 'Files not read',
  'portfolio.batchName': 'Name of this batch',
  'portfolio.batchNameHelp': 'Only you see it. The projects are named after their programs.',
  'portfolio.start': 'Start the batch',
  'portfolio.starting': 'Uploading the programs…',
  'portfolio.clear': 'Clear',
  'portfolio.progressTitle': 'Progress',
  'portfolio.progressLead':
    'The queue lives on the server. It advances while this page is open; close it and the batch waits, then goes on where it stopped when you come back.',
  'portfolio.cancel': 'Cancel the batch',
  'portfolio.cancelConfirm':
    'Programs not started yet are not analysed and their source is dropped. Projects already made stay in My workspace.',
  'portfolio.removeRecord': 'Remove this record',
  'portfolio.statusQueued': 'queued',
  'portfolio.statusRunning': 'running',
  'portfolio.statusDone': 'done',
  'portfolio.statusFailed': 'failed',
  'portfolio.openProject': 'Open project',
  'portfolio.noBatch': 'No batch yet.',
  'portfolio.earlierBatches': 'Earlier batches',

  'portfolio.viewTitle': 'Overview',
  'portfolio.scope': 'What the overview reads',
  'portfolio.scopeAll': 'All my projects',
  'portfolio.viewLoading': 'Reading the projects…',
  'portfolio.viewEmpty': 'No project to read yet.',
  'portfolio.viewFailed': 'The overview could not be read.',
  'portfolio.bandsTitle': 'Programs by score band',
  'portfolio.bandsLead':
    'The score is a grade per program, not a compliance percentage. Averaging it would invent a figure, so the overview shows how many programs fall into each band.',
  'portfolio.levelsTitle': 'Level A–D of the SAP objects used',
  'portfolio.levelsLead': 'Counted once per program and object. The level is read from SAP’s catalog for the program’s target and is never signed.',
  'portfolio.bucketsTitle': 'Retire · Keep · Rebuild · No catalogued path',
  'portfolio.bucketsLead':
    'The four buckets per object, as each project’s Public-Cloud-Fit card sorts them. “No catalogued path” is what the roadmap called “Blocked by SAP”: it states a gap in SAP’s catalog, not a verdict.',
  'portfolio.notAssigned': 'Not assigned',
  'portfolio.recurringTitle': 'SAP objects that recur',
  'portfolio.recurringLead': 'Objects used by at least two programs, most programs first.',
  'portfolio.kindsTitle': 'Kinds of finding that recur',
  'portfolio.kindsLead': 'What the engine found, by kind, in how many programs.',
  'portfolio.notDeterminedTitle': 'Not determined across the set',
  'portfolio.notDeterminedLead': 'What the overview cannot say, and for how many programs.',
  'portfolio.programsTitle': 'Programs',
  'portfolio.programs': 'programs',
  'portfolio.showPrograms': 'Show the programs',
  'portfolio.noneRecur': 'No SAP object is used by more than one program.',
  'portfolio.noKinds': 'No finding in any analysed program.',
  'portfolio.nothingOpen': 'Nothing left undetermined that the overview can count.',
  'portfolio.colProgram': 'Program',
  'portfolio.colScore': 'Score',
  'portfolio.colBand': 'Band',
  'portfolio.colLevels': 'Levels A · B · C · D · unknown',
  'portfolio.colIncludes': 'Includes not read',
  'portfolio.notAnalysed': 'not analysed',
  'portfolio.levelWord': 'Level',
  'portfolio.levelUnknown': 'Level unknown',
  'portfolio.viewTruncated': 'The overview reads at most 500 projects; the rest are not in these figures. Use named selections for larger sets.',

  'portfolio.selectionTitle': 'Named selection',
  'portfolio.selectionLead': 'A list of projects you name, to read and share on its own. Nothing is written onto the projects or their runs.',
  'portfolio.selectionName': 'Name of the selection',
  'portfolio.selectionPick': 'Projects in it',
  'portfolio.selectionSave': 'Save the selection',
  'portfolio.selectionDelete': 'Delete the selection',
  'portfolio.selectionFromBatch': 'Save this batch as a selection',

  'portfolio.exportTitle': 'Export',
  'portfolio.exportCsv': 'CSV',
  'portfolio.exportXlsx': 'Excel workbook',
  'portfolio.print': 'Print one page',
  'portfolio.printHeading': 'Portfolio overview',

  'portfolio.shareTitle': 'Share this selection',
  'portfolio.shareScope':
    'They can read this overview: program names, scores, levels, buckets and the SAP objects used. Not the source code — each project is shared on its own.',
  'portfolio.shareLimits': 'Reading only. You can withdraw the invitation at any time.',
  'portfolio.shareEmail': 'Their e-mail address',
  'portfolio.shareSend': 'Send the invitation',
  'portfolio.shareWaiting': 'Waiting to be accepted',
  'portfolio.shareReaders': 'Can read',
  'portfolio.shareWithdraw': 'Withdraw',
  'portfolio.shareSent': 'The invitation was sent.',
  'portfolio.shareNeedsSelection': 'Save a named selection first: an invitation opens a fixed list of projects, never “all my projects”.',
  'portfolio.sharedTitle': 'Portfolio shared with you',
  'portfolio.sharedLead': 'Read only. The overview is computed when you open it, from the projects the owner put into this selection.',
  'portfolio.invitationTitle': 'Invitation to read a portfolio',
  'portfolio.invitationAccept': 'Open the portfolio',
  'portfolio.invitationOpening': 'Opening the invitation…',
} as const;

/* -------------------------------------------------------------- the access */

/** The entry's sentence per reason (`lib/portfolio/access.ts`). */
export function portfolioAccessMessage(reason: 'open' | 'byok-not-available' | 'no-own-key' | 'key-not-tested'): string {
  switch (reason) {
    case 'open':
      return 'Your own model key is stored and tested. The batch calls no model; later model steps of a portfolio project run on your key.';
    case 'byok-not-available':
      return 'The portfolio is open only to accounts that bring their own model key, and this account cannot store one.';
    case 'no-own-key':
      return 'The portfolio is open only to accounts with their own model key, so many programs never spend the platform’s budget. Store your Gemini or Anthropic key in Settings and test it there.';
    case 'key-not-tested':
      return 'Your own model key is stored but has not passed the test since it was saved. In Settings, leave the key field empty and choose “Test the key”.';
  }
}

/* --------------------------------------------------------------- the batch */

export const portfolioBatchMessages = {
  noName: 'The program has no name, so no project was made for it.',
  noSource: 'The program arrived without source, so no project was made for it.',
  notAbap: 'That does not look like ABAP, so no project was made for it.',
  tooLarge: (bytes: number, limit: number) =>
    `The program with its includes is ${Math.round(bytes / 1024)} KB; one analysis takes at most ${Math.round(limit / 1024)} KB. No project was made for it.`,
  empty: 'The batch holds no program.',
  overBatchLimit: (max: number) => `One batch holds at most ${max} programs. Split the upload into several batches.`,
  overDailyLimit: (max: number, left: number) =>
    `An account may queue at most ${max} programs in 24 hours; ${left} are left for now. Try a smaller batch or come back later.`,
  noEdition: 'Choose the target system the programs are assessed against.',
  defaultName: 'Batch',
  notFound: 'No such batch.',
  cancelledAlready: 'This batch was cancelled.',
  overAnnounced: 'The upload sent more programs than it announced.',
  oneAtATime: 'One batch runs at a time. Let the current batch finish, or cancel it, before starting another.',
  cancelled: 'Cancelled before it was analysed.',
  projectGone: 'The project made for this program was deleted before its run.',
  stepFailed: 'The run could not be signed. Open the project and run Analyze there to see why.',
} as const;

/* ------------------------------------------------------- figures and words */

export function portfolioCoverage(f: {
  projects: number;
  analysed: number;
  notAnalysed: number;
  includesNotRead: number;
  missingProjects: number;
}): string {
  const parts = [`${f.analysed} of ${f.projects} program${f.projects === 1 ? '' : 's'} analysed`];
  if (f.notAnalysed > 0) parts.push(`${f.notAnalysed} without a signed run`);
  if (f.includesNotRead > 0) parts.push(`${f.includesNotRead} with includes not read`);
  if (f.missingProjects > 0) parts.push(`${f.missingProjects} no longer there`);
  return parts.join(' · ');
}

export function portfolioProgress(p: { total: number; done: number; running: number; queued: number; failed: number }): string {
  return `${p.done} of ${p.total} done · ${p.running} running · ${p.queued} queued · ${p.failed} failed`;
}

export function portfolioProgramCount(n: number): string {
  return `${n} program${n === 1 ? '' : 's'}`;
}

export function portfolioReadySummary(ready: number, notReady: number, overLimit: number): string {
  const parts = [`${ready} program${ready === 1 ? '' : 's'} will be queued`];
  if (notReady > 0) parts.push(`${notReady} not queued, with the reason below`);
  if (overLimit > 0) parts.push(`${overLimit} beyond the limit of one batch`);
  return parts.join(' · ');
}

export function portfolioRecurringLine(object: string, use: 'read' | 'written' | 'used', programs: number): string {
  return `${object} ${use} in ${programs} program${programs === 1 ? '' : 's'}`;
}

export function portfolioLimitsLine(perBatch: number, perDay: number): string {
  return `At most ${perBatch} programs per batch and ${perDay} per day, one batch at a time.`;
}

export function portfolioObjectUses(uses: number, programs: number): string {
  return `${uses} object use${uses === 1 ? '' : 's'} in ${programs} program${programs === 1 ? '' : 's'}`;
}

export function portfolioObjectsAssigned(objects: number, programs: number): string {
  return `${objects} object${objects === 1 ? '' : 's'} in ${programs} program${programs === 1 ? '' : 's'}`;
}

export function portfolioWaitingSince(expires: string): string {
  return `expires ${expires}`;
}

export type PortfolioNotDeterminedKey =
  | 'not-analysed'
  | 'includes-not-read'
  | 'level-unknown'
  | 'level-not-determined'
  | 'target-platform-not-set'
  | 'catalog-evidence-missing';

/** What each "not determined" figure counts, in a reader's words. */
export function portfolioNotDeterminedLabel(key: PortfolioNotDeterminedKey): string {
  switch (key) {
    case 'not-analysed':
      return 'Programs without a signed run — in no band, no level and no bucket';
    case 'includes-not-read':
      return 'Programs that name includes nobody uploaded — what those hold was not read';
    case 'level-unknown':
      return 'SAP objects whose level SAP’s catalog does not give';
    case 'level-not-determined':
      return 'Objects not assigned to a bucket because their level is not determined';
    case 'target-platform-not-set':
      return 'Objects not assigned to a bucket because the project has no target platform';
    case 'catalog-evidence-missing':
      return 'Objects not assigned to a bucket because the catalog evidence is missing';
  }
}

/** The sentence an export and the print carry, so a copy says what it is. */
export const PORTFOLIO_EXPORT_NOTE =
  'A read-only overview computed from each project’s signed run. Not signed, not an audit pack, and no portfolio score: the score is a grade per program.';

/** The bucket's name on the overview. */
export function portfolioBucketLabel(bucket: 'retire' | 'keep' | 'rebuild' | 'no-catalogued-path' | 'not-assigned'): string {
  switch (bucket) {
    case 'retire':
      return 'Retire';
    case 'keep':
      return 'Keep';
    case 'rebuild':
      return 'Rebuild';
    case 'no-catalogued-path':
      return 'No catalogued path';
    case 'not-assigned':
      return 'Not assigned';
  }
}
