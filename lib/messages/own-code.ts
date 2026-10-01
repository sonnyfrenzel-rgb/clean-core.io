import type { OwnCodeIssue } from '../own-code-import';

/**
 * Interface text of the own-code page — "New project" with your own ABAP
 * (mockup 2.8 s11, `components/workspace/OwnCodeImport.tsx`).
 *
 * Plain strings only; a sentence with a number or a name in it is a function
 * below, so the component never writes a word of its own (D.29).
 */
export const OWN_CODE_MESSAGES = {
  'ownCode.lead':
    'One project holds one piece of custom ABAP — a program with its includes — and everything found and decided about it.',
  'ownCode.source': 'Source',
  'ownCode.name': 'Project name',
  'ownCode.nameHelp': 'Only you see it, and people you invite to read.',
  'ownCode.nameMissing': 'Give the project a name.',
  'ownCode.abapSource': 'ABAP source',
  'ownCode.drop': 'Drop files here or choose files',
  'ownCode.choose': 'Choose files',
  'ownCode.dropHelp':
    'Upload the main program and every include it uses — missing includes stay Not determined.',
  'ownCode.reading': 'Reading the files…',
  'ownCode.checkedNote':
    'Checked in your browser. Nothing has been uploaded or stored yet.',
  'ownCode.whatItCounts': 'What it counts',
  'ownCode.readBefore': 'Read before the run',
  'ownCode.readBeforeHelp':
    'Counted from your files by the same engine the analysis uses, before anything leaves this browser. No model is involved.',
  'ownCode.nothingYet': 'Add the source to see what the analysis will read.',
  'ownCode.figLines': 'Lines',
  'ownCode.figObjects': 'Programs and includes',
  'ownCode.figRoutines': 'Routines',
  'ownCode.figTablesRead': 'Tables read',
  'ownCode.figTablesWritten': 'Tables written',
  'ownCode.notDeterminedLead': 'Named in the code, not uploaded:',
  'ownCode.paidLegend': 'How this analysis is paid',
  'ownCode.payOwnKey': 'Runs on your own Gemini key',
  'ownCode.payOwnKeyOn': 'No limit and not counted against the free runs. Change the key in',
  'ownCode.payOwnKeyOffBefore': 'To run on your own Gemini key instead, with no limit, add it in',
  'ownCode.payOwnKeyOffLink': 'Settings',
  'ownCode.sameSource':
    'If this exact source was analysed before, the button says “Free — this source was already analysed” instead.',
  'ownCode.whereModel': 'Where a model is called',
  'ownCode.namesTitle': 'Business names',
  'ownCode.namesBody': 'Names for steps and lanes, and the plain-language sentence. Shown as',
  'ownCode.namesCost': 'Model call · not counted',
  'ownCode.narrativeTitle': 'Analysis narrative',
  'ownCode.narrativeBody':
    'The prose around the evidence. The findings, the levels and the line anchors are computed without it.',
  'ownCode.narrativeCost': 'Model call · part of this analysis',
  'ownCode.narrativeOff': 'Switched off in Settings — the analysis runs without it.',
  'ownCode.withoutTitle': 'Without a model call',
  'ownCode.withoutBefore': 'Technical names (',
  'ownCode.withoutExample': 'FORM check_limit',
  'ownCode.withoutAfter':
    '). The engine, process skeleton, findings and anchors are still complete.',
  'ownCode.namesSwitch': 'Name steps in business language',
  'ownCode.namesSwitchHelp': 'Model call · can be turned off later in Settings',
  'ownCode.namesNoKey': 'No model key is available to this account, so steps keep their technical names.',
  'ownCode.namesSaveFailed': 'The setting could not be saved.',
  'ownCode.cancel': 'Cancel',
  'ownCode.tryExample': 'Try an example instead',
  'ownCode.start': 'Start analysis',
  'ownCode.startNext':
    'Next: the Analyze step asks for the target system, then runs. Nothing is counted before the run completes.',
  'ownCode.addSource': 'Add the ABAP source to start.',
  'ownCode.createFailed': 'The project could not be created. Nothing was saved.',
  'ownCode.nothingCreated': 'Nothing was created.',
  'ownCode.personalDataPending': 'Read the lines above and tick the box to carry on.',
  'ownCode.blockedJoined':
    'The joined source fails the security check. Remove the file that carries the flagged content.',
  'ownCode.whyTrust': 'Why you can trust this',
  // NewProject (s14) — added with the own-code page
  'newProject.skipIntro': 'Skip intro',
  'newProject.showIntro': 'Show intro',
  'newProject.whatIsNote': 'Core idea, clean core in three looks and the three views',
  'newProject.demoBasis': 'basis of the demo project',
  'newProject.bigProcess': 'shows how big processes stay readable',
  'newProject.shows': 'Shows',
  // CleanCoreDiagram
  'coreDiagram.label':
    'The SAP core with a boundary of released interfaces; an in-app extension docks on the boundary, a side-by-side extension connects through an API, a modification breaks into the core',
  'coreDiagram.boundary': 'boundary: released interfaces',
  'coreDiagram.core': 'SAP core',
  'coreDiagram.standard': 'standard',
  'coreDiagram.inApp': 'in-app',
  'coreDiagram.abapCloud': 'ABAP Cloud',
  'coreDiagram.sideBySide': 'side-by-side',
  'coreDiagram.btp': 'SAP BTP',
  'coreDiagram.api': 'API',
  'coreDiagram.modification': 'modification',
  'coreDiagram.changesCode': 'changes SAP code',
} as const;

const KB = (bytes: number) => `${Math.ceil(bytes / 1024).toLocaleString('en')} KB`;
const MB = (bytes: number) => `${Math.round(bytes / (1024 * 1024)).toLocaleString('en')} MB`;
const list = (names: readonly string[]) => names.join(', ');

/** The drop zone's second line — the limit is the server's, printed from the constant. */
export function ownCodeDropLimit(limitBytes: number): string {
  return `ABAP source files (.abap, .txt), their includes, or one ZIP with both · up to ${KB(limitBytes)} of source`;
}

export function ownCodeFilesAdded(n: number): string {
  return `${n.toLocaleString('en')} ${n === 1 ? 'file' : 'files'} added`;
}

export function ownCodeRemove(name: string): string {
  return `Remove ${name}`;
}

/** The right side of a row: what the file holds. */
export function ownCodeRowMeta(sources: number, lines: number, zip: boolean): string {
  const l = `${lines.toLocaleString('en')} ${lines === 1 ? 'line' : 'lines'}`;
  if (!zip) return l;
  return `${sources.toLocaleString('en')} ${sources === 1 ? 'source' : 'sources'} · ${l}`;
}

/** The success line under a row. */
export function ownCodeChecked(objects: readonly string[]): string {
  return `Checked: ABAP source — ${list(objects)}.`;
}

/** One sentence per finding of a check. */
export function ownCodeIssueText(issue: OwnCodeIssue): string {
  switch (issue.kind) {
    case 'not-source':
      return 'Not ABAP source. Remove it — the analysis reads only .abap and .txt files, or a ZIP of them.';
    case 'too-large':
      return `This file is ${issue.bytes >= 1024 * 1024 ? MB(issue.bytes) : KB(issue.bytes)}; one file may be at most ${issue.limit >= 1024 * 1024 ? MB(issue.limit) : KB(issue.limit)}. Remove it and upload the program and its includes on their own.`;
    case 'binary':
      return 'This is not a text file. Remove it — export the source from SE38 or ADT as text.';
    case 'not-abap':
      return 'No ABAP statement found — no REPORT, FORM, METHOD, declaration or SELECT. Remove it.';
    case 'blocked':
      return `${issue.reason} Remove it.`;
    case 'encoding':
      return 'Not UTF-8 — read as Windows-1252, the SAP GUI download default. Check that umlauts in texts look right.';
    case 'duplicate-same':
      return `Same source twice — the copy in ${issue.keptFrom} is used.`;
    case 'duplicate-different':
      return `${issue.object} is also in ${issue.other}, with different text. Remove the copy you do not want analysed.`;
    case 'zip-unreadable':
      return 'This ZIP could not be opened. Remove it, or upload the files on their own.';
    case 'zip-limit':
      return 'This ZIP holds more than one program reasonably can, or expands too far. Remove it and upload the program with its includes.';
    case 'zip-empty':
      return 'No ABAP source in this ZIP. Remove it.';
    case 'zip-skipped':
      return `Not read — not ABAP source: ${list(issue.names)}.`;
    case 'second-program':
      return `${issue.object} is a second program besides ${issue.main}. One project holds one program with its includes — remove one.`;
    case 'not-referenced':
      return `${issue.object} is not named by an INCLUDE statement. It is read after the program.`;
    case 'missing-includes':
      return `Referenced but missing: ${list(issue.names)}. These stay Not determined.`;
  }
}

/** The footer strip. */
export function ownCodeAttention(n: number): string {
  return `${n.toLocaleString('en')} ${n === 1 ? 'file needs' : 'files need'} attention:`;
}

export function ownCodeTooLarge(bytes: number, limit: number): string {
  return `Together the files are ${KB(bytes)} of source; one analysis reads at most ${KB(limit)}. Analyse the program in parts.`;
}

/** The free-runs option's help, with the account's own limit. */
export function ownCodeFreeHelp(limit: number): string {
  return `A new source counts once; the same source again is free. The stages after the analysis and the chat are not counted. After ${limit.toLocaleString('en')} analyses, add your own Gemini key to continue.`;
}

/** The phone summary of the Source card, under the form. */
export function ownCodeSourceSummary(files: number, attention: number): string {
  const added = ownCodeFilesAdded(files);
  return attention > 0 ? `${added} · ${attention.toLocaleString('en')} ${attention === 1 ? 'needs' : 'need'} attention` : added;
}
